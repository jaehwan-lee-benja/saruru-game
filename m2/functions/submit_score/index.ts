// ============================================================================
// Supabase Edge Function · submit_score  (Deno + TypeScript)
// ----------------------------------------------------------------------------
// 사르르목장 게임 M2 — 점수 제출을 서버에서 검증 후 기록하는 유일한 경로.
//
// 왜 Edge Function 인가:
//   • game.scores / game.best_scores 는 RLS 로 클라 직접 쓰기를 막았다.
//   • 클라이언트 점수를 신뢰하면 안 된다(치트). 여기서 서버측 검증 후
//     service_role 키로만 기록한다.
//
// 흐름:
//   1) Authorization 헤더의 사용자 JWT 로 user 확인(없으면 401).
//   2) 입력 파싱 + 치트 검증(범위/최소시간/plausibility/레이트리밋).
//   3) game.scores insert + game.best_scores upsert (greatest(best, score)).
//   4) { ok, best, isNewBest } 반환.
//
// 필요한 환경변수(Supabase Function secrets):
//   • SUPABASE_URL               (프로젝트 URL — 기본 주입되기도 함)
//   • SUPABASE_SERVICE_ROLE_KEY  (⚠ 절대 클라 노출 금지 — 서버 전용)
//   • SUPABASE_ANON_KEY          (사용자 JWT 검증용 클라 생성에 사용)
//
// 배포: supabase functions deploy submit_score
//       (secret 은 supabase secrets set 으로 별도 설정)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- CORS: 게임 프론트 오리진만 허용 ----------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://jaehwan-lee-benja.github.io", // GitHub Pages(게임 사이트)
  "http://localhost:5173",               // 로컬 dev (vite 등)
  "http://localhost:8080",               // 로컬 dev (기타)
  "http://127.0.0.1:5500",               // VSCode Live Server
]);

function corsHeaders(origin: string | null): HeadersInit {
  // 허용 목록에 있으면 그 오리진을 echo, 아니면 대표 오리진으로 폴백.
  const allow = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://jaehwan-lee-benja.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ---- 치트 검증 튜너블 상수 --------------------------------------------------
const SCORE_MIN = 0;
const SCORE_MAX = 100000;        // scores.score CHECK 와 일치
const MIN_PLAYED_MS = 3000;      // 3초 미만 플레이는 무효(즉시 게임오버 스팸 차단)

// plausibility 상한:  score <= played_ms / 40 + 60
//   근거(튜너블): 게임은 초당 base 10점 + 아이템(최대 컵 15점)을 준다.
//   실전 최대 획득률을 넉넉히 ~25점/초로 잡으면 40ms 당 1점 → played_ms/40.
//   +60 은 짧은 판의 초기 버스트/반올림 여유. 실측 후 조정 가능.
const PLAUSIBILITY_DIVISOR = 40;
const PLAUSIBILITY_BASE = 60;

// 레이트리밋: 최근 3초 내 1건 초과 금지 + 최근 1시간 20건 초과 금지.
const RL_WINDOW_SHORT_MS = 3000;
const RL_MAX_PER_HOUR = 20;

const GAME_KEY_RE = /^[a-z0-9_]{1,20}$/; // 화이트리스트 형식

// ---- 응답 헬퍼 --------------------------------------------------------------
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  // ---- CORS preflight ----
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      console.error("missing env", { hasUrl: !!SUPABASE_URL, hasService: !!SERVICE_KEY, hasAnon: !!ANON_KEY });
      return json({ ok: false, error: "server_misconfigured" }, 500, origin);
    }

    // ---- 1) 사용자 인증: 호출자 JWT 로 user 확인 --------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ ok: false, error: "unauthorized" }, 401, origin);
    }
    // anon 키 + 호출자 JWT 로 만든 클라 → auth.getUser() 로 신원 확인.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "unauthorized" }, 401, origin);
    }
    const userId = userData.user.id;

    // ---- 2) 입력 파싱 ------------------------------------------------------
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "bad_json" }, 400, origin);
    }

    const score = Number(body.score);
    const playedMs = Number(body.played_ms);
    const gameKey = typeof body.game_key === "string" && body.game_key ? body.game_key : "ddong";
    // events_sig: 향후 재생/무결성 서명 확장 훅(현재는 로깅만, 신뢰 안 함).
    const eventsSig = typeof body.events_sig === "string" ? body.events_sig : null;

    // 정수/범위 기본 검증
    if (!Number.isInteger(score) || !Number.isInteger(playedMs)) {
      return json({ ok: false, error: "invalid_input" }, 400, origin);
    }
    if (!GAME_KEY_RE.test(gameKey)) {
      return json({ ok: false, error: "invalid_game_key" }, 400, origin);
    }

    // ---- 3) 치트 검증 (서버측, 클라 신뢰 안 함) ----------------------------
    if (score < SCORE_MIN || score > SCORE_MAX) {
      return json({ ok: false, error: "score_out_of_range" }, 422, origin);
    }
    if (playedMs < MIN_PLAYED_MS) {
      return json({ ok: false, error: "played_too_short" }, 422, origin);
    }
    const cap = Math.floor(playedMs / PLAUSIBILITY_DIVISOR) + PLAUSIBILITY_BASE;
    if (score > cap) {
      // 시간 대비 비현실적 점수 → 거부(치트/조작 의심)
      console.warn("implausible", { userId, score, playedMs, cap });
      return json({ ok: false, error: "implausible_score" }, 422, origin);
    }

    // ---- service_role 클라(RLS 우회) — 여기서부터 서버 권한 쓰기 ----------
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "game" },
    });

    // 플레이어(닉네임) 존재 확인 — 닉네임 없이는 점수 제출 불가
    const { data: player, error: playerErr } = await admin
      .from("players")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (playerErr) {
      console.error("player lookup failed", playerErr);
      return json({ ok: false, error: "db_error" }, 500, origin);
    }
    if (!player) {
      return json({ ok: false, error: "no_nickname" }, 409, origin);
    }

    // ---- 레이트리밋: 최근 1시간 제출 이력 조회(서버 시각 기준) ------------
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent, error: recentErr } = await admin
      .from("scores")
      .select("created_at")
      .eq("player_id", userId)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(RL_MAX_PER_HOUR + 1);
    if (recentErr) {
      console.error("rate check failed", recentErr);
      return json({ ok: false, error: "db_error" }, 500, origin);
    }
    if (recent && recent.length >= RL_MAX_PER_HOUR) {
      return json({ ok: false, error: "rate_limited_hour" }, 429, origin);
    }
    if (recent && recent.length > 0) {
      const lastMs = Date.now() - new Date(recent[0].created_at as string).getTime();
      if (lastMs < RL_WINDOW_SHORT_MS) {
        return json({ ok: false, error: "rate_limited" }, 429, origin);
      }
    }

    // ---- 4) scores insert ------------------------------------------------
    const { error: insErr } = await admin.from("scores").insert({
      player_id: userId,
      score,
      played_ms: playedMs,
      game_key: gameKey,
    });
    if (insErr) {
      console.error("score insert failed", insErr);
      return json({ ok: false, error: "db_error" }, 500, origin);
    }
    if (eventsSig) console.log("events_sig received", { userId, len: eventsSig.length });

    // ---- best_scores upsert: greatest(best, score) -----------------------
    // 기존 best 조회 → 더 크면 갱신. (동시성은 게임 특성상 무시 가능 수준;
    //  더 엄격히는 SQL 함수/on conflict do update 로 원자화 가능 — 향후.)
    const { data: existing, error: bestSelErr } = await admin
      .from("best_scores")
      .select("best")
      .eq("player_id", userId)
      .eq("game_key", gameKey)
      .maybeSingle();
    if (bestSelErr) {
      console.error("best select failed", bestSelErr);
      return json({ ok: false, error: "db_error" }, 500, origin);
    }

    const prevBest = existing?.best ?? 0;
    const isNewBest = score > prevBest;
    const newBest = isNewBest ? score : prevBest;

    if (!existing || isNewBest) {
      const { error: upErr } = await admin.from("best_scores").upsert(
        { player_id: userId, game_key: gameKey, best: newBest, updated_at: new Date().toISOString() },
        { onConflict: "player_id,game_key" },
      );
      if (upErr) {
        console.error("best upsert failed", upErr);
        // 점수 자체는 기록됐으니 부분성공으로 처리 — best 는 다음 제출에 보정됨.
        return json({ ok: true, best: prevBest, isNewBest: false, warn: "best_upsert_failed" }, 200, origin);
      }
    }

    return json({ ok: true, best: newBest, isNewBest }, 200, origin);
  } catch (e) {
    console.error("unhandled", e);
    return json({ ok: false, error: "internal_error" }, 500, origin);
  }
});
