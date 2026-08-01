# 팝콘 루프 — 게임측(S5~S7) 구현 노트

> 정본 스펙: `~/claude-project/docs/POPCORN-LOOP-SPEC.md`(지휘부 소유). 이 문서는 **게임 도메인 구현 메모**.
> 상태: **설계 준비 — 미착수**. membership 계약 스텁 도착 + **유저 복귀 승인까지 실배포·DDL HOLD**(지휘자 지시 2026-08-01).

---

## 0. 현재 게임측 사실관계 (실측 2026-08-01)

| 항목 | 현재 상태 |
|---|---|
| 게임 DB | **multi-store `rstazttwlghsorpzsugy`** — `game` 스키마 |
| crm 위치 | **같은 프로젝트**의 `crm` 스키마 (game과 공존) |
| `game.players` | `id, nickname, created_at, updated_at` — **`member_ref` 없음**(추가 필요) |
| `crm.customers` | 존재 |
| `crm.event_tickets` | 미생성(Phase 1 대기) |
| 로그인 | **카카오/구글 필수 게이트**(미로그인=웰컴만, 유저 확정). `auth.uid()` = `game.players.id` |
| 점수 제출 | Edge `submit_score`(JWT 인증, 치트검증 후 `game.scores` 기록) |
| 멤버십 가입 셸 | `membership-hold` 브랜치에 이미 존재 — 수집 순서 **이름→전화→이메일**(스펙 5-C "키오스크 동일 순서"와 일치, 재활용 가능) |
| KST 패턴 | 0005 rev2에서 확립 — `(now() at time zone 'Asia/Seoul')::date` |

### ★스펙 4절 정정 필요 (지휘부 보고함)
스펙에 **"game(thinkmap)"**, **"게임 ↔ crm 직접 조인 금지(다른 프로젝트)"**로 적혀 있으나 —
**game과 crm은 같은 프로젝트(multi-store)의 다른 스키마**다(실측). thinkmap은 별개 프로젝트.
→ "다른 프로젝트라서"라는 **근거는 성립하지 않는다**. 다만 **결론(직접 조인 금지·PII 미저장·계약 경유)은 유지**가 옳다:
근거를 *물리적 분리*가 아니라 **도메인 경계 + PII 격리 원칙**으로 바꿔 적는다.
※ 실무 함의: 같은 프로젝트이므로 Edge Function 외에 **crm 소유 SECURITY DEFINER 함수**로도 계약 구현이 가능하다(선택지 확대). 선택은 crm/membership 소관.

---

## 1. S5 — 회원 크로스체크 + 게임 내 가입

### 흐름 (로그인 게이트 이후)
1. 로그인 완료 → `game.players.member_ref` 조회
   - **있으면** → 회원 모드(쿠폰 자격 O)
2. **없으면** → 전화번호 입력 → 계약 `member_by_phone(phone)`
   - `member_id` 반환 → `member_ref` 저장 → **자동 회원 연결**
   - 없음 → **게임 내 멤버십 가입**(키오스크 UX 승계: 이름→전화번호→이메일, 동일 문구·순서)
     → crm 가입 → `member_id` 수신 → `member_ref` 저장

### PII 경계 (게임 도메인 원칙)
- 게임은 **전화번호·이름·이메일을 저장하지 않는다.** 입력값은 계약 호출에 실어 보내고 **`member_id`(uuid)만** `game.players.member_ref`에 보관.
- 콘솔 로그·에러 리포트·`game.bug_reports` meta에 PII가 새지 않도록 마스킹 확인(신규 코드 리뷰 체크포인트).
- 대시보드는 `member_ref` 유무(회원/비회원)만 노출, 전화번호 원문 노출 금지.

### 필요한 게임측 DDL (HOLD — 승인 후)
```sql
alter table game.players add column member_ref uuid;           -- crm.customers.id 논리 참조(FK 없음: 도메인 경계)
create index on game.players (member_ref) where member_ref is not null;
```
- FK를 걸지 않는 이유: 스키마 간 결합 최소화(경계 유지). 무결성은 계약이 보장.
- RLS: 본인 행만 update 가능한 기존 정책 재확인 필요 — **member_ref는 클라가 임의 수정 못 하게** 서버(계약) 경유로만 세팅해야 한다(아래 §3 보안).

---

## 2. S6 — 5,000점 쿠폰

### 조건 (스펙 1·5-C)
회원(`member_ref` 존재) **&&** 당일(KST) 최고점 ≥ 5,000 **&&** 당일 `channel='game'` 티켓 없음
→ `ticket_issue(member_id, 'game', meta={score})` → 토큰

### 화면
- "사르르 멤버십 이벤트 — 팝콘을 받아가세요!" + **CODE128 바코드** + 유효기간(발권일 23:59 KST) + 토큰 문자열(리더 실패 대비)
- 화면 밝기 안내. 재발급 시 **동일 토큰**(멱등 — 스펙 3절).
- 게임 BI 픽셀 톤 + 정본 팔레트(#2D4B82). 바코드는 스캔 정확도 우선(충분한 quiet zone·고대비, 픽셀 효과 금지).

### 일일 한도
- 서버 유니크 인덱스가 물리 보장(스펙 2절). 게임 UI는 "오늘 발급됨" 상태를 그대로 표시(중복 발급 시도 안 함).

---

## 3. ★계약에 반드시 반영돼야 할 보안 요구 (게임 특성 — membership에 전달)

게임은 **정적 사이트(GitHub Pages)라 서버가 없다.** 따라서:

1. **정적 API 키를 게임 클라이언트에 심을 수 없다.**
   `MEMBERSHIP_INTAKE_KEY` 같은 공유 시크릿을 프론트에 두면 즉시 노출된다.
   → 게임 경로는 **사용자 Supabase JWT 기반 인증**이어야 한다(기존 `submit_score` Edge 패턴 승계).

2. **★5,000점 달성 검증은 서버가 한다.** 클라이언트가 점수를 주장하면 안 된다.
   → `ticket_issue(channel='game')`는 클라 파라미터를 신뢰하지 말고, **서버가 `game.scores`를 직접 조회**해
   "해당 user의 당일(KST) 최고점 ≥ 5,000"을 확인한 뒤 발권해야 한다.
   (같은 프로젝트라 crm 소유 SECURITY DEFINER 함수에서 `game.scores` 조회가 가능하다 — §0 정정 참조.)
   대안: 기존 `submit_score` Edge가 점수 검증 직후 조건 충족 시 발권.

3. **`member_ref` 세팅도 서버 경유.** 클라가 `game.players.member_ref`를 직접 UPDATE할 수 있으면
   임의의 `member_id`를 사칭해 남의 회원 자격을 얻는다. → 계약 함수만 쓰기 가능해야 한다(RLS/권한 점검).

4. **전화번호 조회 남용 방지.** `member_by_phone`는 번호 존재 여부를 알려주는 오라클이 될 수 있다
   (임의 번호 대입 → 회원 여부 탐지). → 사용자당 레이트리밋 + 로그인 사용자 전용.

---

## 4. 미해결 (게임측)

1. **CODE128 렌더링 방식** — 구형 WebView 호환(스펙 6-2). 클라 라이브러리 vs 서버 이미지.
   게임은 PWA(오프라인 캐시)라 **인라인 경량 구현**이 유리할 수 있음. membership 결정과 통일 필요(같은 심볼·같은 quiet zone).
2. **게임 회원 전환 시 기존 기록 승계**(스펙 6-4) — 게임은 `auth.uid()` 고정이라 닉네임/점수는 그대로 유지된다.
   `member_ref`만 나중에 붙는 구조 → **승계 문제 없음**(게임측 결론). 확인만 필요.
3. 비회원 게스트: 현재 게임은 로그인 필수라 "비회원 플레이어"는 *로그인은 했으나 멤버십 미가입* 상태를 뜻한다. 문구를 그렇게 정리.

---

## 5. 착수 조건 (지켜야 할 게이트)

- [ ] Phase 1(crm `0018_event_tickets` + 계약 4종) 완료 — **선행조건**
- [ ] membership 계약 스텁 도착(시그니처·인증 방식·에러 코드)
- [ ] §3 보안 요구 4건 계약에 반영 확인
- [ ] game DDL(`member_ref`) — guardian 검수 + **유저 복귀 승인**
- [ ] 그 후 구현 → PII 경계 검증(S5) · 일일한도/중복 QA(S6) · 시각QA
