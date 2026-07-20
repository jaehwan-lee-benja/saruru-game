-- ============================================================================
-- 사르르목장 게임 · M2 보강 — game.nickname_available PUBLIC EXECUTE 회수
-- ----------------------------------------------------------------------------
-- 대상 프로젝트 : SHARED multi-store Supabase (ref: rstazttwlghsorpzsugy)
-- 배경: 0001은 nickname_available 를 authenticated 전용 의도로 grant 했으나,
--       Postgres 기본 PUBLIC EXECUTE 를 revoke 하지 않아 anon 도 실행 가능했음
--       (guardian 백스톱 검수 중 발견, 2026-07-19). 반환은 boolean(닉 중복여부)뿐
--       이라 위험도 낮으나 문서화 의도와 불일치 → 최소권한으로 정정.
-- 안전성: game 스키마 격리·권한 회수만(테이블/RLS/타 스키마/공유 role 무변경).
--         게임은 로그인(authenticated) 세션에서만 호출하므로 무영향.
-- 적용: 2026-07-20 game 세션 apply(execute_sql). 검증 authed=exec / anon=no.
-- ============================================================================

revoke execute on function game.nickname_available(text) from public;
grant  execute on function game.nickname_available(text) to authenticated;
