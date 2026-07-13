# 사르르목장 게임 · M2 준비 패키지 (리뷰용 — 아직 아무것도 적용/배포 안 됨)

Kakao OAuth 로그인 + 유니크 닉네임 + 랭킹. 이 폴더는 **프리뷰**다.
실 적용/배포 전에는 아래 게이트를 모두 통과해야 한다.

> ⚠️ **여기 있는 어떤 것도 아직 적용/배포되지 않았다.**
> 공유 multi-store DB(`rstazttwlghsorpzsugy`)에 대한 DDL이라 특히 조심.

## 파일 구성
| 파일 | 내용 |
|---|---|
| `migrations/0001_game_schema.sql` | `game` 스키마 DDL — players / scores / best_scores, RLS, `top_scores()`·`nickname_available()` 함수. PII 미저장, crm/thinksalon 미참조. |
| `functions/submit_score/index.ts` | Supabase Edge Function(Deno/TS). 점수 제출을 **서버측 치트 검증** 후 service_role로만 기록하는 유일한 경로. |
| `frontend/m2-auth.js` | 바닐라 JS 계정 모듈(`window.SaruruAuth`). Kakao 로그인·닉네임·점수제출·리더보드. supabase-js v2 CDN 사용. |
| `frontend/m2-ui-notes.md` | 기존 똥피하기(js/game.js)에 배선하는 법(로그인 버튼·닉네임 모달·리더보드 패널). |

## 데이터 모델 요약
- `game.players(id=auth.users.id, nickname citext unique 2~12자)` — PII 없음.
- `game.scores(player_id, score 0~100000, played_ms, game_key='ddong', created_at)` — append-only, 클라 직접 insert 불가.
- `game.best_scores(player_id, game_key, best)` PK(player_id, game_key) — 리더보드 소스.
- 리더보드는 `top_scores()` SECURITY DEFINER 함수로만 노출(nickname/best만, 원본행·PII 비노출).

## 이름/시그니처 정합성 (SQL ↔ Edge ↔ Front)
- game_key 기본값 `'ddong'` 세 계층 동일.
- `nickname_available(p_nick text)` / `top_scores(p_game, p_limit, p_period)` RPC 이름·인자 프론트와 일치.
- Edge Function `submit_score` 입력 `{score, played_ms, game_key, events_sig?}`, 반환 `{ok, best, isNewBest}` — 프론트 `submitScore()`와 일치.

## 배포/적용 순서 & 게이트 (반드시 순서대로)

### 게이트 1 — 스키마 SQL 적용 (공유 DB)
1. `migrations/0001_game_schema.sql` → **supabase-guardian 검수**(공유 DB DDL 규율).
2. **유저 명시 승인**(지휘자 경유).
3. 소유 통합세션(game)이 Supabase에 적용(`apply_migration` 등). 그 전엔 실행 금지.
- 확인: `game` 스키마만 생성, crm/thinksalon 무영향, RLS 3개 테이블 enabled.

### 게이트 2 — Edge Function 배포 + 시크릿
1. Supabase에 Kakao provider 키 설정(유저가 Kakao dev console + Supabase Auth에서 진행).
2. Function secret 설정:
   - `SUPABASE_SERVICE_ROLE_KEY` (⚠ 서버 전용, 절대 프론트 금지)
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (기본 주입될 수 있음 — 확인)
   - `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... ` 등
3. `supabase functions deploy submit_score`.
- 확인: CORS 허용 오리진에 실제 게임 도메인 포함(`functions/submit_score/index.ts`의 `ALLOWED_ORIGINS`).

### 게이트 3 — 프론트 배선 + Kakao redirect URL
1. `frontend/m2-auth.js` → `js/m2-auth.js` 복사, `index.html`에 supabase-js CDN + 키 주입(`m2-ui-notes.md` 참조).
2. **anon(publishable) 키**만 프론트에 주입(public-safe). service_role 절대 금지.
3. Kakao/Supabase Auth redirect URL 등록:
   - Supabase Auth → URL Configuration: `https://jaehwan-lee-benja.github.io/saruru-game/` (+ localhost dev).
   - Kakao dev console: Supabase가 요구하는 콜백(`https://rstazttwlghsorpzsugy.supabase.co/auth/v1/callback`).
4. 배선/커밋/푸시/배포는 **유저 명시 승인 게이트**.

## 보안/PII 체크
- 전화번호·실명 미저장. Kakao `sub`는 `auth.identities`에 있고 중복 저장 안 함.
- crm/thinksalon 스키마로의 FK/뷰/함수 참조 없음(strict isolation).
- 점수 쓰기 경로는 Edge Function(service_role) 하나뿐 — 클라 RLS는 read-own만.
- 치트 방어: 범위/최소플레이시간(3s)/plausibility 상한/레이트리밋(3s·20/h), 서버 시각만 신뢰.

## 미결/확인 필요
- **anon(publishable) 키** 실제 값 필요(프론트 주입 placeholder 상태).
- Kakao provider 키 + redirect URL 등록(유저 진행 중).
- 게임 실제 배포 도메인이 `.../saruru-game/`가 맞는지(CORS/redirect에 반영).
- plausibility 상수(`played_ms/40 + 60`)는 실측 후 튜닝 여지.
