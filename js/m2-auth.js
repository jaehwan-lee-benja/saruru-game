/* ============================================================================
 * 사르르목장 게임 · M2 계정 레이어  (m2-auth.js)
 * ----------------------------------------------------------------------------
 * 바닐라 JS 모듈. 프레임워크 없음. supabase-js v2 는 페이지에서 CDN 으로 로드하고
 * 여기서는 전역 window.supabase(=createClient 제공)를 사용한다.
 *
 * 설계 원칙:
 *   • "옵셔널" 계정. 로그인 안 해도 게임은 그대로 플레이(localStorage best 유지).
 *     로그인하면 nickname + 온라인 리더보드가 켜진다.
 *   • 방어적: 오프라인/미로그인/네트워크 오류에도 게임 흐름을 막지 않는다.
 *   • 시크릿 하드코딩 없음. anon 키는 public-safe 이지만 페이지에서 주입한다.
 *
 * 공개 API (window.SaruruAuth):
 *   init(supabaseUrl, anonKey)
 *   onAuth(cb)                      → {user, player|null, needsNickname:bool}
 *   loginKakao()
 *   logout()
 *   checkNickname(nick)             → {ok, available, reason}
 *   setNickname(nick)               → {ok, player?, error?}
 *   submitScore(score, playedMs, gameKey) → {ok, best?, isNewBest?, error?}
 *   getLeaderboard(gameKey, period, limit) → {ok, rows?, error?}
 *   getState()                      → {ready, user, player}
 * ==========================================================================*/
(function () {
  "use strict";

  // ---- 내부 상태 ----------------------------------------------------------
  let client = null;          // supabase client (schema: 'game')
  let _url = null;            // supabase project URL (Edge Function 호출용)
  let _user = null;          // 현재 auth user (or null)
  let _player = null;        // game.players 행 (or null)
  let _ready = false;        // init 완료 여부
  const _authCbs = [];        // onAuth 구독자

  // 닉네임 규칙(서버 CHECK 2~12 와 일치). 한글/영문/숫자/일부 기호 허용.
  const NICK_MIN = 2, NICK_MAX = 12;
  // 허용 문자: 한글(가-힣, 자모), 영문, 숫자, 공백 제외 언더스코어/하이픈.
  const NICK_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_-]{2,12}$/;
  // 아주 작은 금칙어(부분일치, 소문자 비교). 서버가 최종 방어는 아님 — UX용 1차 필터.
  const BANNED = ["시발", "씨발", "병신", "admin", "운영자", "관리자", "fuck", "shit", "sex"];

  function _emitAuth() {
    const needsNickname = !!_user && !_player;
    const payload = { user: _user, player: _player, needsNickname };
    for (const cb of _authCbs) {
      try { cb(payload); } catch (e) { console.warn("[SaruruAuth] onAuth cb error", e); }
    }
  }

  // ---- init ---------------------------------------------------------------
  function init(supabaseUrl, anonKey) {
    if (_ready) return true;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.warn("[SaruruAuth] supabase-js 미로드 — 계정 기능 비활성(게임은 정상 동작).");
      return false;
    }
    if (!supabaseUrl || !anonKey) {
      console.warn("[SaruruAuth] url/anonKey 없음 — 계정 기능 비활성.");
      return false;
    }
    _url = supabaseUrl.replace(/\/+$/, "");
    // db.schema='game' → from('players') 등이 game 스키마를 가리킨다.
    client = window.supabase.createClient(supabaseUrl, anonKey, {
      db: { schema: "game" },
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        // ★세션 저장소 분리: GitHub Pages는 모든 사이트가 같은 origin
        // (jaehwan-lee-benja.github.io)이라, 이 키가 없으면 백오피스(crm 등) 세션과
        // localStorage를 공유해 로그인이 뒤섞인다. 게임 전용 키로 독립 사이트로 분리한다.
        storageKey: "sb-saruru-game-auth",
      },
    });
    _ready = true;

    // 세션 변화 구독 → user 갱신 후 player 로드
    client.auth.onAuthStateChange(async (_event, session) => {
      _user = session?.user ?? null;
      _player = null;
      if (_user) { await _loadPlayer(); }
      _emitAuth();
    });

    // 초기 세션 확인(리다이렉트 복귀 포함)
    client.auth.getSession().then(async ({ data }) => {
      _user = data?.session?.user ?? null;
      if (_user) { await _loadPlayer(); }
      _emitAuth();
    }).catch((e) => console.warn("[SaruruAuth] getSession 실패", e));

    return true;
  }

  // 현재 로그인 사용자의 game.players 행 로드(RLS: 본인 행만)
  async function _loadPlayer() {
    if (!client || !_user) { _player = null; return; }
    try {
      const { data, error } = await client
        .from("players").select("id, nickname, created_at")
        .eq("id", _user.id).maybeSingle();
      if (error) { console.warn("[SaruruAuth] player 로드 오류", error); _player = null; return; }
      _player = data ?? null;
    } catch (e) {
      console.warn("[SaruruAuth] player 로드 예외", e); _player = null;
    }
  }

  // ---- onAuth 구독 --------------------------------------------------------
  function onAuth(cb) {
    if (typeof cb !== "function") return;
    _authCbs.push(cb);
    // 이미 준비됐으면 즉시 1회 현재 상태 통지
    if (_ready) { try { cb({ user: _user, player: _player, needsNickname: !!_user && !_player }); } catch (e) {} }
  }

  // ---- Kakao 로그인 -------------------------------------------------------
  async function loginKakao() {
    if (!client) { console.warn("[SaruruAuth] 미초기화"); return { ok: false, error: "not_ready" }; }
    // redirectTo: 로그인 후 현재 게임 페이지로 복귀(쿼리 제거한 깔끔한 URL).
    const redirectTo = window.location.origin + window.location.pathname;
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "kakao",
        // scope 최소화: 기본값(account_email 포함)은 카카오 비즈앱 검수가 필요해 KOE205 유발.
        // 이메일·프로필사진 안 받고 profile_nickname만 요청(카카오 콘솔에서 이 항목 활성화 필요).
        options: { redirectTo, scopes: "profile_nickname" },
      });
      if (error) { console.warn("[SaruruAuth] kakao 로그인 오류", error); return { ok: false, error: error.message }; }
      return { ok: true }; // 이후 브라우저가 카카오로 리다이렉트됨
    } catch (e) {
      console.warn("[SaruruAuth] kakao 로그인 예외", e);
      return { ok: false, error: "oauth_failed" };
    }
  }

  // ---- Google 로그인 ------------------------------------------------------
  // 구글은 Supabase에 이미 provider 설정됨(백오피스와 공유). email/profile 기본 scope라
  // 별도 동의항목/검수 없이 바로 된다. redirectTo만 지정.
  async function loginGoogle() {
    if (!client) { console.warn("[SaruruAuth] 미초기화"); return { ok: false, error: "not_ready" }; }
    const redirectTo = window.location.origin + window.location.pathname;
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) { console.warn("[SaruruAuth] google 로그인 오류", error); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e) {
      console.warn("[SaruruAuth] google 로그인 예외", e);
      return { ok: false, error: "oauth_failed" };
    }
  }

  async function logout() {
    if (!client) return { ok: true };
    try { await client.auth.signOut(); } catch (e) { console.warn(e); }
    _user = null; _player = null; _emitAuth();
    return { ok: true };
  }

  // ---- 닉네임 클라 검증 ---------------------------------------------------
  function _validateNick(raw) {
    const nick = (raw || "").trim();
    if (nick.length < NICK_MIN) return { ok: false, reason: "too_short" };
    if (nick.length > NICK_MAX) return { ok: false, reason: "too_long" };
    if (!NICK_RE.test(nick)) return { ok: false, reason: "bad_chars" };
    const low = nick.toLowerCase();
    if (BANNED.some((w) => low.includes(w))) return { ok: false, reason: "banned" };
    return { ok: true, nick };
  }

  // 서버 RPC 로 사용 가능 여부 확인(대소문자 무시)
  async function checkNickname(raw) {
    const v = _validateNick(raw);
    if (!v.ok) return { ok: false, available: false, reason: v.reason };
    if (!client) return { ok: false, available: false, reason: "not_ready" };
    try {
      const { data, error } = await client.rpc("nickname_available", { p_nick: v.nick });
      if (error) { console.warn("[SaruruAuth] nickname_available 오류", error); return { ok: false, available: false, reason: "rpc_error" }; }
      return { ok: true, available: !!data, reason: data ? "ok" : "taken" };
    } catch (e) {
      console.warn("[SaruruAuth] checkNickname 예외", e);
      return { ok: false, available: false, reason: "rpc_error" };
    }
  }

  // 닉네임 확정: game.players insert(본인 id). unique 위반은 정상 처리.
  async function setNickname(raw) {
    const v = _validateNick(raw);
    if (!v.ok) return { ok: false, error: v.reason };
    if (!client || !_user) return { ok: false, error: "not_logged_in" };
    try {
      const { data, error } = await client
        .from("players")
        .insert({ id: _user.id, nickname: v.nick })
        .select("id, nickname, created_at")
        .single();
      if (error) {
        // 23505 = unique_violation → 이미 쓰는 닉
        if (error.code === "23505") return { ok: false, error: "taken" };
        console.warn("[SaruruAuth] setNickname 오류", error);
        return { ok: false, error: error.message || "insert_failed" };
      }
      _player = data;
      _emitAuth();
      return { ok: true, player: data };
    } catch (e) {
      console.warn("[SaruruAuth] setNickname 예외", e);
      return { ok: false, error: "insert_failed" };
    }
  }

  // ---- 점수 제출 (Edge Function 경유) -------------------------------------
  async function submitScore(score, playedMs, gameKey) {
    gameKey = gameKey || "ddong";
    if (!client || !_user) return { ok: false, error: "not_logged_in" };
    if (!_player) return { ok: false, error: "no_nickname" };
    try {
      const { data: sess } = await client.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return { ok: false, error: "no_session" };

      const res = await fetch(_url + "/functions/v1/submit_score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({
          score: Math.floor(score),
          played_ms: Math.floor(playedMs),
          game_key: gameKey,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        return { ok: false, error: out.error || ("http_" + res.status) };
      }
      return { ok: true, best: out.best, isNewBest: !!out.isNewBest };
    } catch (e) {
      // 네트워크 실패 등 → 게임 흐름 막지 않음
      console.warn("[SaruruAuth] submitScore 예외", e);
      return { ok: false, error: "network" };
    }
  }

  // ---- 리더보드 조회 (top_scores RPC) ------------------------------------
  async function getLeaderboard(gameKey, period, limit) {
    gameKey = gameKey || "ddong";
    period = period === "week" ? "week" : "all";
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    if (!client) return { ok: false, error: "not_ready", rows: [] };
    try {
      const { data, error } = await client.rpc("top_scores", {
        p_game: gameKey, p_limit: limit, p_period: period,
      });
      if (error) { console.warn("[SaruruAuth] top_scores 오류", error); return { ok: false, error: "rpc_error", rows: [] }; }
      return { ok: true, rows: data || [] };
    } catch (e) {
      console.warn("[SaruruAuth] getLeaderboard 예외", e);
      return { ok: false, error: "rpc_error", rows: [] };
    }
  }

  function getState() { return { ready: _ready, user: _user, player: _player }; }

  // ---- 전역 노출 ----------------------------------------------------------
  window.SaruruAuth = {
    init, onAuth, loginKakao, loginGoogle, logout,
    checkNickname, setNickname,
    submitScore, getLeaderboard,
    getState,
  };
})();
