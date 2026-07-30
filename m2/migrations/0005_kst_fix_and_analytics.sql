-- ============================================================================
-- 사르르목장 게임 · M2 0005 — KST 타임존 정정 + 액티브유저/작마클 세그먼트 분석
-- ----------------------------------------------------------------------------
-- 대상 프로젝트 : SHARED multi-store Supabase (ref: rstazttwlghsorpzsugy)
-- 상태          : ★미적용(승인 대기) — 유저 승인 + guardian 검수 게이트
--
-- 배경/근거 (실데이터 검증 2026-07-30, 서버 TimeZone=UTC):
--  (1) ★버그 — game.top_scores 주간 랭킹이 `date_trunc('week', now())` = **UTC 기준**.
--      서버 TZ가 UTC라 주 경계가 실제로는 **KST 월요일 09:00**이 된다.
--      → KST 월요일 00:00~09:00 플레이가 "지난주"로 오분류.
--      ★주간 TOP3 = 팝콘 리워드 대상 선정과 직결되는 실질 버그.
--      실증: scores에 `2026-07-20 23:44Z` = `KST 07-21 08:44` 건 존재 →
--            UTC일자(07-20)와 KST일자(07-21)가 하루 어긋남(멤버십 KST버그와 동류).
--  (2) game.public_stats.plays_today 는 **이미 KST 기준(정상)** — 검증만, 변경 없음.
--      ("오늘 4회" 표기는 정확함을 실데이터로 확인.)
--  (3) 액티브유저 통계 + 작마클 세그먼트(1회=경험/2회=결정/3회+=단골) 집계 신설.
--      ※ 세그먼트는 crm 스키마와 섞지 않고 **game 데이터 안에서 독립 산출**(유저 지시).
--
-- 안전성: game 스키마 내 **읽기전용 함수만**. 테이블/RLS/타 스키마/공유 role 무변경.
--         blast radius = game 스키마 격리(0003 public_stats 선례와 동일 성격).
-- 권한  : 신규 분석 함수는 authenticated 전용(anon EXECUTE 회수 — 0004 규율 계승).
--         top_scores 는 게임 내 랭킹 조회라 기존 권한(anon 포함) 유지.
-- ============================================================================

-- (1) ★주간 랭킹 KST 정정 (버그 수정) ---------------------------------------
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
        -- ★KST 주 시작(월요일 00:00 KST)으로 정정 (구: date_trunc('week', now()) = UTC)
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

-- (2) 액티브 유저: 회원별 플레이 요약(KST 표기) ------------------------------
--     닉네임만 노출(게임 스키마엔 PII 없음). 대시보드=마스터 전용 접근 유지.
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
  group by p.id, p.nickname
  order by count(s.id) desc, max(s.created_at) desc nulls last
  limit least(greatest(coalesce(p_limit,200),1),1000);
$function$;

-- (3) 작마클 세그먼트 분포(1경험/2결정/3+단골) — game 데이터 독립 산출 --------
--     pct 분모 = 플레이 경험자(미플레이 제외). 미플레이는 별도 행으로 표시.
create or replace function game.segments(p_game text default 'ddong')
returns table(segment text, label text, users bigint, pct numeric, plays bigint)
language sql stable security definer set search_path to 'game','public'
as $function$
  with per as (
    select p.id, count(s.id) as c
    from game.players p
    left join game.scores s on s.player_id=p.id and s.game_key=p_game
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
         round(100.0*count(*)/nullif((select n from tot),0), 1) as pct,
         coalesce(sum(g.c),0)::bigint                        as plays
  from seg g
  group by g.segment
  order by case g.segment when 'experience' then 1 when 'decision' then 2
                          when 'regular' then 3 else 4 end;
$function$;

-- (4) 일자별 플레이 추이(KST) — 대시보드 추이 차트용 -------------------------
create or replace function game.plays_daily(p_game text default 'ddong', p_days integer default 14)
returns table(day_kst date, plays bigint, players bigint)
language sql stable security definer set search_path to 'game','public'
as $function$
  select (s.created_at at time zone 'Asia/Seoul')::date as day_kst,
         count(*)::bigint                               as plays,
         count(distinct s.player_id)::bigint            as players
  from game.scores s
  where s.game_key=p_game
    and (s.created_at at time zone 'Asia/Seoul')::date
        > ((now() at time zone 'Asia/Seoul')::date - least(greatest(coalesce(p_days,14),1),90))
  group by 1
  order by 1;
$function$;

-- 권한 (0004 규율 계승: 기본 PUBLIC EXECUTE 회수 후 명시 grant) ---------------
revoke execute on function game.active_users(text,integer) from public;
revoke execute on function game.segments(text)             from public;
revoke execute on function game.plays_daily(text,integer)  from public;
grant  execute on function game.active_users(text,integer) to authenticated;
grant  execute on function game.segments(text)             to authenticated;
grant  execute on function game.plays_daily(text,integer)  to authenticated;
-- top_scores: 게임 랭킹 조회라 기존 권한 유지(별도 변경 없음).

-- 검증 쿼리(적용 후) ---------------------------------------------------------
-- select * from game.segments('ddong');
-- select * from game.active_users('ddong', 50);
-- select * from game.plays_daily('ddong', 14);
-- select * from game.top_scores('ddong', 10, 'week');
