-- ============================================================================
-- 사르르목장 게임 · M2 추가 DDL  —  game.public_stats()  (집계 KPI 노출용)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트 : SHARED multi-store Supabase  (ref: rstazttwlghsorpzsugy)
-- 스키마       : game  (기존 0001에 함수 1개 추가 — 테이블/RLS 변경 없음)
--
-- ⚠️ 이 파일은 아직 적용되지 않은 "리뷰용 프리뷰"다.
--    적용 전 필수 게이트:
--      1) supabase-guardian 검수 (공유 DB DDL)
--      2) 유저 명시 승인
--      3) 소유 통합세션(game)이 Supabase에 적용
--
-- 배경/필요:
--   게임 관리 대시보드(saruru-game-dashboard)의 KPI 3칸
--     · 누적 플레이   = count(game.scores)
--     · 등록 플레이어 = count(game.players)
--     · 오늘 플레이   = count(game.scores where 오늘 KST)
--   을 라이브로 채우려는데, 0001의 RLS가 anon/authenticated 의 "전체 count"를
--   막는다(본인 행만 select). 리더보드처럼 SECURITY DEFINER 집계 함수로만
--   "PII 없는 합계 숫자"를 노출한다.
--
-- 안전성:
--   • 반환값은 정수 3개뿐 — nickname/원본행/PII 일절 노출 안 함.
--   • top_scores()(이미 anon 공개)와 동일한 수준의 비민감 집계.
--   • 보수적으로 execute 권한을 authenticated 에만 부여(대시보드 관리자=Google
--     로그인 authenticated). anon 에는 부여하지 않는다.
--   • set search_path 고정(정의자 권한 함수 필수).
-- ============================================================================

create or replace function game.public_stats(
  p_game text default 'ddong'
)
returns table (
  players_total  bigint,   -- 등록 플레이어(닉네임) 수
  plays_total    bigint,   -- 누적 플레이(제출 로그) 수
  plays_today    bigint    -- 오늘(KST 기준) 플레이 수
)
language sql
stable
security definer
set search_path = game, public
as $$
  select
    (select count(*) from game.players)                                    as players_total,
    (select count(*) from game.scores  where game_key = p_game)            as plays_total,
    (select count(*) from game.scores
       where game_key = p_game
         and created_at >= date_trunc('day', (now() at time zone 'Asia/Seoul'))
                             at time zone 'Asia/Seoul')                     as plays_today;
$$;

comment on function game.public_stats(text) is
  '게임 집계 KPI(등록 플레이어/누적 플레이/오늘 플레이). PII 미노출(정수만). 대시보드 관리자용 — authenticated 실행.';

-- ⚠ Postgres 는 함수 생성 시 EXECUTE 를 PUBLIC 에 기본 부여한다(anon 포함).
--    문서화한 최소권한(anon 미부여)을 지키려면 PUBLIC 회수 후 authenticated 만 부여.
revoke execute on function game.public_stats(text) from public;
grant  execute on function game.public_stats(text) to authenticated;

-- ============================================================================
-- 끝. 적용 전 guardian 검수 + 유저 승인 필수.
--   ※ '치트 의심 제출' KPI는 현재 소스 없음 — submit_score 가 거부분을 테이블에
--     적재하지 않고 인라인 400 + console.log 만 함. 별도 로깅 테이블 신설 시 확장.
-- ============================================================================
