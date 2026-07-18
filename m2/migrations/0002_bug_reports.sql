-- ============================================================================
-- 사르르목장 게임 · 버그 신고 수신 테이블  —  game.bug_reports
-- ----------------------------------------------------------------------------
-- 대상 프로젝트 : SHARED multi-store Supabase (ref: rstazttwlghsorpzsugy)
-- 적용         : 2026-07-18 (apply_migration: game_bug_reports)
--
-- 목적: 사이트 내 "🐞 버그 신고"를 메일(mailto) 대신 우리 서버로 직접 수신.
-- 격리: game 스키마 전용. crm/thinksalon 등 타 도메인 무관.
-- 보안: 로그인 사용자 "본인 명의"로만 insert(익명 삽입 차단 = 스팸 억제).
--       조회/삭제는 service_role(운영)만. authenticated 는 select 권한 없음.
-- ============================================================================
create table if not exists game.bug_reports (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  nickname    text,
  body        text not null check (char_length(body) between 1 and 2000),
  meta        jsonb,
  user_agent  text,
  created_at  timestamptz not null default now()
);
comment on table game.bug_reports is '게임 버그 신고. 로그인 사용자 본인 insert만(RLS). 조회는 service_role.';

alter table game.bug_reports enable row level security;

drop policy if exists bug_insert_self on game.bug_reports;
create policy bug_insert_self on game.bug_reports
  for insert to authenticated
  with check (user_id = auth.uid());

grant usage  on schema game to authenticated;
grant insert on game.bug_reports to authenticated;
grant select, insert, update, delete on game.bug_reports to service_role;

-- PostgREST 가 새 테이블을 서빙하도록:
--   notify pgrst, 'reload schema';
