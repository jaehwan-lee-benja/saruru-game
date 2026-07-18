-- ============================================================================
-- 사르르목장 게임 · M2 스키마 DDL  —  game schema
-- ----------------------------------------------------------------------------
-- 대상 프로젝트 : SHARED multi-store Supabase  (ref: rstazttwlghsorpzsugy)
-- 새 스키마     : game   (crm / thinksalon 스키마와 완전 격리 — 상호 참조 없음)
--
-- ⚠️ 이 파일은 아직 적용되지 않은 "리뷰용 프리뷰"다.
--    적용 전 필수 게이트:
--      1) supabase-guardian 검수 (공유 DB DDL)
--      2) 유저 명시 승인
--      3) 소유 통합세션(game)이 Supabase에 적용
--
-- 설계 원칙:
--   • PII 최소화 — 전화번호/실명 저장 안 함. Kakao가 신원(identity) 담당.
--     auth.users(id)만 참조하고, nickname + 점수만 저장.
--     Kakao의 sub 는 이미 auth.identities 에 있으므로 중복 저장하지 않는다.
--   • crm / thinksalon 스키마로의 FK·뷰·함수 참조 전면 금지 (strict isolation).
--   • 리더보드는 PII 없이 nickname + best 만 노출 (SECURITY DEFINER 함수 경유).
--   • idempotent 하게 작성 (create ... if not exists / create or replace).
-- ============================================================================

create schema if not exists game;
create extension if not exists citext;   -- 대소문자 무시 nickname unique 용

comment on schema game is
  '사르르목장 캐주얼 게임 — 플레이어 nickname + 점수. PII 미저장(Kakao가 identity). crm/thinksalon과 격리.';


-- ============================================================================
-- 1) game.players  —  auth.users 1:1, 공개용 nickname 보유
-- ============================================================================
create table if not exists game.players (
  id          uuid primary key
                references auth.users (id) on delete cascade,
  -- citext = 대소문자 무시 유니크. 'Saruru' 와 'saruru' 는 같은 것으로 취급.
  nickname    citext not null unique
                check (char_length(nickname) between 2 and 12),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  game.players            is '게임 플레이어. id = auth.users.id (1:1). PII 없음 — nickname만 공개.';
comment on column game.players.id         is 'auth.users(id). Kakao OAuth 로그인 사용자. on delete cascade.';
comment on column game.players.nickname   is '공개 표시명. citext(대소문자 무시) 유니크, 2~12자. 리더보드 노출 대상.';
comment on column game.players.created_at is '플레이어(닉네임) 최초 생성 시각.';
comment on column game.players.updated_at is '마지막 수정 시각(닉네임 변경 등).';


-- ============================================================================
-- 2) game.scores  —  개별 플레이 결과(제출 로그). append-only.
--    클라이언트 직접 insert 금지 — 반드시 service_role Edge Function 경유.
-- ============================================================================
create table if not exists game.scores (
  id          bigint generated always as identity primary key,
  player_id   uuid not null
                references game.players (id) on delete cascade,
  score       int  not null check (score between 0 and 100000),
  played_ms   int  not null check (played_ms >= 0),
  -- game_key: 향후 다른 미니게임 추가 대비(예: 'ddong'=똥피하기, 'onion'=양파게임).
  game_key    text not null default 'ddong',
  created_at  timestamptz not null default now()  -- 서버 시각. 랭킹/기간필터/레이트리밋 기준.
);

comment on table  game.scores            is '개별 플레이 결과 로그(append-only). insert는 service_role Edge Function만.';
comment on column game.scores.player_id  is 'game.players(id).';
comment on column game.scores.score      is '이번 판 점수(0~100000). 서버측 치트 검증 통과분만 기록.';
comment on column game.scores.played_ms  is '플레이 지속 시간(ms). 치트 검증(plausibility)에 사용.';
comment on column game.scores.game_key   is '게임 식별자. 기본 ddong(똥피하기). 멀티게임 확장용.';
comment on column game.scores.created_at is '서버 기록 시각(now()). 절대 클라이언트 시각 신뢰 안 함.';

-- 내 점수 이력 조회 / 리더보드 / 레이트리밋 질의 최적화
create index if not exists scores_player_score_idx
  on game.scores (player_id, score desc);
create index if not exists scores_created_idx
  on game.scores (created_at);
create index if not exists scores_gamekey_score_idx
  on game.scores (game_key, score desc);


-- ============================================================================
-- 3) game.best_scores  —  (player, game) 별 최고점 (리더보드 소스)
--    upsert는 service_role Edge Function만.
-- ============================================================================
create table if not exists game.best_scores (
  player_id   uuid not null
                references game.players (id) on delete cascade,
  game_key    text not null default 'ddong',
  best        int  not null default 0 check (best >= 0),
  updated_at  timestamptz not null default now(),
  primary key (player_id, game_key)
);

comment on table  game.best_scores            is '플레이어×게임 최고점. 리더보드 소스. upsert는 service_role만.';
comment on column game.best_scores.player_id  is 'game.players(id).';
comment on column game.best_scores.game_key   is '게임 식별자(scores.game_key와 동일 규약).';
comment on column game.best_scores.best        is '해당 게임 최고 점수(>=0).';
comment on column game.best_scores.updated_at is '최고점 갱신 시각(주간 랭킹 등 참고용).';

-- 게임별 상위 정렬(리더보드) 인덱스
create index if not exists best_gamekey_best_idx
  on game.best_scores (game_key, best desc);


-- ============================================================================
-- 4) RLS  —  전 테이블 활성화. "내 것만" 접근. 쓰기는 service_role만.
-- ----------------------------------------------------------------------------
--   • Supabase 에서 service_role 키는 RLS 를 우회한다(Edge Function 서버측 전용).
--   • anon / authenticated 클라이언트는 아래 정책 범위로만 접근 가능.
--   • 리더보드(타인 점수)는 테이블 직접 select 가 아니라 SECURITY DEFINER
--     함수 game.top_scores() 로만 노출 → PII/원본행 비노출.
-- ============================================================================

alter table game.players     enable row level security;
alter table game.scores      enable row level security;
alter table game.best_scores enable row level security;

-- ---- players: 본인 행만 select / insert / update ----------------------------
-- (idempotent 하도록 기존 정책 drop 후 재생성)
drop policy if exists players_select_own on game.players;
create policy players_select_own on game.players
  for select using (id = auth.uid());

drop policy if exists players_insert_self on game.players;
create policy players_insert_self on game.players
  for insert with check (id = auth.uid());

drop policy if exists players_update_own on game.players;
create policy players_update_own on game.players
  for update using (id = auth.uid()) with check (id = auth.uid());
-- delete 정책 없음 → 클라이언트가 직접 삭제 불가(계정 삭제는 auth cascade로 처리).

-- ---- scores: 본인 것만 select. 직접 insert/update/delete 정책 없음 ----------
-- (insert 는 service_role Edge Function 만 → 치트 검증 강제)
drop policy if exists scores_select_own on game.scores;
create policy scores_select_own on game.scores
  for select using (player_id = auth.uid());

-- ---- best_scores: 본인 것만 select. 쓰기는 service_role 만 --------------------
drop policy if exists best_select_own on game.best_scores;
create policy best_select_own on game.best_scores
  for select using (player_id = auth.uid());


-- ============================================================================
-- 5) game.top_scores()  —  공개 리더보드 (PII 미노출)
-- ----------------------------------------------------------------------------
--   SECURITY DEFINER: 함수 소유자(스키마 소유 role) 권한으로 실행 →
--   anon/authenticated 가 best_scores/players 테이블에 직접 접근 권한 없어도
--   nickname + best + updated_at 만 안전하게 반환.
--
--   p_period:
--     'all'  → 전체 기간 최고점(best_scores 기준).
--     'week' → 이번 주(월요일 00:00 로컬 = date_trunc('week', now())) 이후
--              scores 로그에서 산출한 주간 최고점.
--   p_limit: 상한 클램프(1~100).
-- ============================================================================
create or replace function game.top_scores(
  p_game   text default 'ddong',
  p_limit  int  default 20,
  p_period text default 'all'
)
returns table (nickname citext, best int, updated_at timestamptz)
language sql
stable
security definer
set search_path = game, public   -- 안전한 search_path 고정(정의자 권한 함수 필수)
as $$
  -- limit 은 1~100 사이로 강제(anon 이 임의 큰 값 못 넣게)
  with lim as (
    select least(greatest(coalesce(p_limit, 20), 1), 100) as n
  ),
  -- 두 기간 브랜치를 UNION ALL 로 모으고(각각 where 로 하나만 활성),
  -- 정렬/LIMIT 은 바깥에서 한 번만 적용(UNION 내부 order/limit 문법오류 회피).
  ranked as (
    -- 전체 기간: best_scores 를 그대로 사용
    select p.nickname, b.best, b.updated_at
    from game.best_scores b
    join game.players p on p.id = b.player_id
    where p_period = 'all'
      and b.game_key = p_game
      and b.best > 0

    union all

    -- 주간: 이번 주(date_trunc('week', now()) = 월요일 00:00) scores 로그 기준
    select p.nickname, w.wbest as best, w.wlast as updated_at
    from (
      select s.player_id,
             max(s.score)      as wbest,
             max(s.created_at) as wlast
      from game.scores s
      where s.game_key = p_game
        and s.created_at >= date_trunc('week', now())
      group by s.player_id
    ) w
    join game.players p on p.id = w.player_id
    where p_period = 'week'
      and w.wbest > 0
  )
  select r.nickname, r.best, r.updated_at
  from ranked r
  order by r.best desc, r.updated_at asc
  limit (select n from lim);
$$;

comment on function game.top_scores(text, int, text) is
  '공개 리더보드. (nickname,best,updated_at) 반환. period all|week. PII 미노출. anon/authenticated 실행 가능.';

-- 테이블 직접 select 는 anon 에 부여하지 않는다. 함수 실행만 허용.
grant execute on function game.top_scores(text, int, text) to anon, authenticated;


-- ============================================================================
-- 6) game.nickname_available()  —  닉네임 사용 가능 여부(대소문자 무시)
-- ----------------------------------------------------------------------------
--   SECURITY DEFINER: players 에 직접 select 권한 없이도 존재여부만 boolean 반환
--   (닉네임 목록/PII 는 노출하지 않음). 로그인 사용자만 실행.
-- ============================================================================
create or replace function game.nickname_available(p_nick text)
returns boolean
language sql
stable
security definer
set search_path = game, public
as $$
  select
    -- 형식 유효(2~12자)하고, 동일 닉(대소문자 무시) 없으면 true
    char_length(btrim(p_nick)) between 2 and 12
    and not exists (
      select 1 from game.players p
      where p.nickname = btrim(p_nick)::citext   -- citext 비교 = 대소문자 무시
    );
$$;

comment on function game.nickname_available(text) is
  '닉네임 사용 가능 여부(형식+중복, 대소문자 무시). boolean. 로그인 사용자만 실행.';

grant execute on function game.nickname_available(text) to authenticated;


-- ============================================================================
-- 7) 스키마 사용 권한
-- ----------------------------------------------------------------------------
--   테이블 자체의 select/insert 권한은 부여하지 않는다(위 함수 경유만).
--   단, RLS 정책이 적용되는 authenticated 의 players/scores/best_scores
--   "본인 행" 접근을 위해 스키마 usage + 최소 테이블 권한을 부여한다.
-- ============================================================================
grant usage on schema game to anon, authenticated;

-- authenticated: RLS 정책 범위 내에서만 동작(본인 행). service_role 은 항상 우회.
grant select, insert, update on game.players     to authenticated;
grant select                 on game.scores      to authenticated;
grant select                 on game.best_scores to authenticated;

-- identity 컬럼 시퀀스 사용권(생성 always identity 라 클라 insert 없지만, 명시적 안전)
-- (scores 는 클라 insert 안 하므로 시퀀스 grant 불필요 → 생략)

-- anon: 리더보드 함수만. 테이블 직접 접근 없음.
-- (grant execute 는 위 함수 정의부에서 처리)

-- ============================================================================
-- 8) service_role  —  ★M2 최초본 누락(2026-07-18 운영 중 발견·핫픽스)
-- ----------------------------------------------------------------------------
--   원인: submit_score Edge Function 은 service_role 로 game 테이블에 쓴다.
--         그런데 최초본은 anon/authenticated 에만 grant → service_role 이
--         game 스키마 usage 조차 없어 permission denied → Edge Function 500
--         → "점수가 기록 안 됨". (리더보드 조회는 anon 함수라 정상 → 증상 헷갈림)
--   교훈: RLS 우회 = 권한 우회 아님. service_role 도 스키마/테이블 grant 필요.
grant usage on schema game to service_role;
grant select, insert, update, delete on game.players     to service_role;
grant select, insert, update, delete on game.scores      to service_role;
grant select, insert, update, delete on game.best_scores to service_role;
grant usage, select on all sequences in schema game to service_role;

-- ============================================================================
-- 9) PostgREST 스키마 노출  —  ★M2 최초본 누락(2026-07-18 발견·핫픽스)
-- ----------------------------------------------------------------------------
--   원인: PostgREST 는 노출 스키마 화이트리스트(pgrst.db_schemas)에 든
--         스키마만 REST/RPC 로 서빙. game 이 목록에 없어 프론트의 RPC 호출이
--         "Invalid schema: game" → 닉네임 저장/리더보드 실패.
--   적용: (기존 목록에 game 추가 — 다른 도메인 스키마 유지)
--     alter role authenticator set pgrst.db_schemas =
--       'public, graphql_public, crm, thinksalon, chat, game';
--     notify pgrst, 'reload config';
--     notify pgrst, 'reload schema';
--   ⚠ 이 스키마는 다른 도메인과 공유 role 설정이므로 지휘자/guardian 경유로
--     기존 목록을 보존하며 추가할 것(덮어쓰기 금지).

-- ============================================================================
-- 끝. 적용 전 guardian 검수 + 유저 승인 필수.
-- ============================================================================
