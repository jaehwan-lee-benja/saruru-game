-- ============================================================================
-- 사르르목장 게임 · M2 0005 (rev2) — KST 타임존 정정 + 액티브유저/작마클 세그먼트 분석
-- ----------------------------------------------------------------------------
-- 대상 프로젝트 : ★SHARED **multi-store** Supabase (ref: rstazttwlghsorpzsugy)
--                 (thinkmap 프로젝트 아님 — 검수 브리핑 오기재 정정, 파일·대시보드는 multi-store 기준)
-- 상태          : ★미적용 — 유저 명시 승인 + 지휘자 "적용 승인" 블록 수신 후에만 적용
-- 리비전        : rev2 (guardian APPROVE-WITH-FIXES 반영 · 2026-07-30)
--
-- ── 배경 / 사실관계 (실데이터 검증 2026-07-30, 서버 TimeZone=UTC) ─────────────
--  (1) game.public_stats.plays_today 는 **이미 KST 기준(정상)**. 변경 없음.
--      대시보드 "오늘 4회" 표기는 정확함을 실측 확인(today_kst=4).
--  (2) ★수정 대상(잠재 로직버그 · 선제수정) — game.top_scores 주간 랭킹이
--      `date_trunc('week', now())` = **UTC 기준**. 서버 TZ가 UTC라 주 경계가 실제로는
--      **KST 월요일 09:00**이 된다 → KST 월요일 00:00~09:00 플레이가 "지난주"로 오분류될 수 있다.
--      주간 TOP3 = 팝콘 리워드 대상 선정과 직결(docs/reward-policy.md "월~일 KST 고정").
--      ※**현재까지 실제 오분류는 없다**: KST 월 00~09시 기록 **역대 0건**,
--        주 버킷 UTC/KST 미스매치 **역대 0건**(총 36건 기준).
--        → **적용해도 기존 랭킹 결과 변화 0, 과거 팝콘 소급 불필요.** 재발 방지 선제수정이다.
--        (참고: `2026-07-20 23:44Z`=`KST 07-21 08:44` 건은 **일자(day) 어긋남** 예시일 뿐,
--         화요일이라 **주 경계 실례가 아니다**.)
--  (3) 액티브유저 통계 + 작마클 세그먼트(1회=경험/2회=결정/3회+=단골) 신설.
--      ※ 세그먼트는 crm 스키마와 섞지 않고 **game 데이터 안에서 독립 산출**(유저 지시).
--
-- ── 안전성 / 권한 ────────────────────────────────────────────────────────────
--  · game 스키마 내 **읽기전용 함수만**. 테이블/RLS/타 스키마/공유 role 무변경.
--  · ★분석 3함수(active_users·segments·plays_daily)는 **game.is_admin() 게이트 필수**.
--    authenticated 만으로는 임의 플레이어가 JWT로 RPC 직호출해 전체 닉네임 + 행단위
--    활동 프로파일을 수집할 수 있다(대시보드의 클라이언트측 이메일 배열은 방어가 아님).
--    → 비관리자 호출 시 **0행**. 프론트 수정 불필요.
--  · 신규 함수 기본 PUBLIC EXECUTE 회수 후 authenticated 명시 grant(0004 규율 계승).
--
-- ── 롤백 절차 ────────────────────────────────────────────────────────────────
--    drop function if exists game.active_users(text,integer);
--    drop function if exists game.segments(text);
--    drop function if exists game.plays_daily(text,integer);
--    drop function if exists game.is_admin();
--    -- top_scores 는 교체이므로 **0001 §5의 top_scores 정의를 재실행**해 원복한다.
--
-- ── 별건(이번 범위 아님) ─────────────────────────────────────────────────────
--    top_scores PUBLIC EXECUTE 잔존 회수는 **0006 후보**로 분리(guardian 지시).
-- ============================================================================

-- (0) ★관리자 판별 게이트 (신설) ---------------------------------------------
--     PostgREST가 주입하는 request.jwt.claims 의 email 로 판별. 클라 조작 불가.
create or replace function game.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'game','public'
as $function$
  select coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
           ''
         ) in ('designerbenja@gmail.com', 'kbl0226@gmail.com');
$function$;

comment on function game.is_admin() is
  '대시보드 마스터 판별(JWT claims email 화이트리스트). 분석 함수의 행 노출 게이트. 비관리자=false.';

-- (1) ★주간 랭킹 KST 정정 (선제 버그수정) ------------------------------------
create or replace function game.top_scores(
  p_game text default 'ddong', p_limit integer default 20, p_period text default 'all')
returns table(nickname citext, best integer, updated_at timestamptz)
language sql stable security definer set search_path to 'game','public'
as $function$
  with lim as (select least(greatest(coalesce(p_limit,20),1),100) as n),
  ranked as (
    select p.nickname, b.best, b.updated_at
    from game.best_scores b join game.players p on p.id=b.player_id
    where p_period='all' and b.game_key=p_game and b.best>0
    union all
    select p.nickname, w.wbest as best, w.wlast as updated_at
    from (
      select s.player_id, max(s.score) as wbest, max(s.created_at) as wlast
      from game.scores s
      where s.game_key=p_game
        -- ★KST 주 시작(월요일 00:00 KST). 구: date_trunc('week', now()) = UTC 기준.
        --   sargable: 좌변 created_at 무가공, 우변은 상수 timestamptz.
        and s.created_at >= (date_trunc('week', (now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul')
      group by s.player_id
    ) w
    join game.players p on p.id=w.player_id
    where p_period='week' and w.wbest>0
  )
  select r.nickname, r.best, r.updated_at
  from ranked r order by r.best desc, r.updated_at asc
  limit (select n from lim);
$function$;

comment on function game.top_scores(text,integer,text) is
  '랭킹 조회. p_period=week 는 **KST 주(월 00:00 Asia/Seoul) 기준**(rev2에서 UTC→KST 정정). all=역대 최고.';

-- (2) 액티브 유저: 회원별 플레이 요약(KST 표기) · 관리자 전용 ----------------
create or replace function game.active_users(p_game text default 'ddong', p_limit integer default 200)
returns table(
  nickname citext, plays bigint, best integer,
  first_play_kst timestamp, last_play_kst timestamp,
  days_since_last integer, segment text)
language sql stable security definer set search_path to 'game','public'
as $function$
  select p.nickname,
         count(s.id)                                        as plays,
         max(s.score)                                       as best,
         (min(s.created_at) at time zone 'Asia/Seoul')      as first_play_kst,
         (max(s.created_at) at time zone 'Asia/Seoul')      as last_play_kst,
         ( (now() at time zone 'Asia/Seoul')::date
           - (max(s.created_at) at time zone 'Asia/Seoul')::date )::int as days_since_last,
         case when count(s.id)=0 then 'none'
              when count(s.id)=1 then 'experience'
              when count(s.id)=2 then 'decision'
              else 'regular' end                            as segment
  from game.players p
  left join game.scores s on s.player_id=p.id and s.game_key=p_game
  where game.is_admin()                                     -- ★관리자만 행 반환(비관리자=0행)
  group by p.id, p.nickname
  order by count(s.id) desc, max(s.created_at) desc nulls last
  limit least(greatest(coalesce(p_limit,200),1),1000);
$function$;

comment on function game.active_users(text,integer) is
  '회원별 플레이 요약(누가·언제·몇 회, KST). ★game.is_admin() 게이트 — 비관리자 호출 시 0행. 닉네임만(PII 없음).';

-- (3) 작마클 세그먼트(1경험/2결정/3+단골) · game 독립 산출 · 관리자 전용 ------
create or replace function game.segments(p_game text default 'ddong')
returns table(segment text, label text, users bigint, pct numeric, plays bigint)
language sql stable security definer set search_path to 'game','public'
as $function$
  with per as (
    select p.id, count(s.id) as c
    from game.players p
    left join game.scores s on s.player_id=p.id and s.game_key=p_game
    where game.is_admin()                                   -- ★관리자만(비관리자=0행)
    group by p.id
  ), seg as (
    select case when c=0 then 'none' when c=1 then 'experience'
                when c=2 then 'decision' else 'regular' end as segment,
           c
    from per
  ), tot as (select count(*)::numeric as n from seg where segment <> 'none')
  select g.segment,
         case g.segment when 'experience' then '1회 · 경험'
                        when 'decision'   then '2회 · 결정'
                        when 'regular'    then '3회+ · 단골'
                        else '미플레이' end                  as label,
         count(*)::bigint                                    as users,
         -- ★pct 분모 = 플레이 경험자. 'none'(미플레이)은 분모 밖이므로 비율 없음(null).
         case when g.segment = 'none' then null
              else round(100.0*count(*)/nullif((select n from tot),0), 1)
         end                                                 as pct,
         coalesce(sum(g.c),0)::bigint                        as plays
  from seg g
  group by g.segment
  order by case g.segment when 'experience' then 1 when 'decision' then 2
                          when 'regular' then 3 else 4 end;
$function$;

comment on function game.segments(text) is
  '작마클 세그먼트 분포(1회=경험/2회=결정/3회+=단골). pct 분모=플레이 경험자(미플레이 제외, none.pct=null). game 데이터 독립 산출(crm 미연동). ★is_admin() 게이트.';

-- (4) 일자별 플레이 추이(KST) · 제로필 · 관리자 전용 --------------------------
create or replace function game.plays_daily(p_game text default 'ddong', p_days integer default 14)
returns table(day_kst date, plays bigint, players bigint)
language sql stable security definer set search_path to 'game','public'
as $function$
  with b as (
    select least(greatest(coalesce(p_days,14),1),90) as n,
           (now() at time zone 'Asia/Seoul')::date   as today_kst
  ), span as (
    select (today_kst - (n-1))                                          as from_day,
           today_kst                                                    as to_day,
           -- ★sargable 경계: 좌변 created_at 무가공, 우변 상수 timestamptz(인덱스 사용 가능)
           (((today_kst - (n-1))::timestamp) at time zone 'Asia/Seoul') as from_ts
    from b
  ), days as (
    select generate_series((select from_day from span),
                           (select to_day   from span),
                           interval '1 day')::date as day_kst          -- ★제로필용 달력
  ), agg as (
    select (s.created_at at time zone 'Asia/Seoul')::date as day_kst,
           count(*)::bigint                               as plays,
           count(distinct s.player_id)::bigint            as players
    from game.scores s
    where s.game_key = p_game
      and s.created_at >= (select from_ts from span)
    group by 1
  )
  select d.day_kst,
         coalesce(a.plays,   0)::bigint as plays,
         coalesce(a.players, 0)::bigint as players
  from days d
  left join agg a on a.day_kst = d.day_kst
  where game.is_admin()                                    -- ★관리자만(비관리자=0행)
  order by d.day_kst;
$function$;

comment on function game.plays_daily(text,integer) is
  '일자별 플레이 추이(KST 자정 기준, 무플레이 날짜 0으로 제로필). ★is_admin() 게이트.';

-- 권한 (0004 규율: 기본 PUBLIC EXECUTE 회수 후 명시 grant) --------------------
revoke execute on function game.is_admin()                 from public;
revoke execute on function game.active_users(text,integer)  from public;
revoke execute on function game.segments(text)              from public;
revoke execute on function game.plays_daily(text,integer)   from public;
grant  execute on function game.is_admin()                 to authenticated;
grant  execute on function game.active_users(text,integer)  to authenticated;
grant  execute on function game.segments(text)              to authenticated;
grant  execute on function game.plays_daily(text,integer)   to authenticated;
-- top_scores: 게임 내 랭킹 조회라 기존 권한 유지(PUBLIC 회수는 0006 후보로 분리).

-- ── 검증 (적용 후) ──────────────────────────────────────────────────────────
-- ※ MCP execute_sql 은 JWT claims 가 비어 있어 **0행이 정상**이다.
--    관리자 경로 확인은 claims 를 주입해서 본다:
--
--   select set_config('request.jwt.claims','{"email":"designerbenja@gmail.com"}', true);
--   select * from game.segments('ddong');        -- 경험/결정/단골/미플레이 분포
--   select * from game.active_users('ddong',50); -- 회원별 요약
--   select * from game.plays_daily('ddong',14);  -- 14일 제로필 추이
--   select * from game.top_scores('ddong',10,'week');
--
--   -- 비관리자(게이트 동작 확인) — 전부 0행이어야 한다:
--   select set_config('request.jwt.claims','{"email":"someone@example.com"}', true);
--   select count(*) from game.active_users('ddong',50);   -- 0
--   select count(*) from game.segments('ddong');          -- 0
--   select count(*) from game.plays_daily('ddong',14);    -- 0
