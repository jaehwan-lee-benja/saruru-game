# M2 프론트 배선 노트 — 똥피하기(js/game.js)에 계정 레이어 붙이기

핵심 원칙: **로그인은 옵셔널.** 미로그인/오프라인에서도 게임은 그대로 돈다.
localStorage best(`saruru.ddong.best`)는 유지하고, 로그인 시 서버 best와 동기화한다.

## 1) index.html — 스크립트/키 주입 (game.js 위, </body> 앞)
```html
<!-- supabase-js v2 (CDN) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="./js/m2-auth.js"></script>
<script>
  // anon 키는 public-safe(브라우저 노출 정상). 단, 하드코딩 대신 명확한 const 로.
  const SUPABASE_URL = "https://rstazttwlghsorpzsugy.supabase.co";
  const SUPABASE_ANON_KEY = "REPLACE_WITH_ANON_PUBLISHABLE_KEY"; // ← 배포 시 채움
  window.SaruruAuth && SaruruAuth.init(SUPABASE_URL, SUPABASE_ANON_KEY);
</script>
<script src="./js/game.js"></script>
```
- `m2-auth.js`는 스테이징의 `frontend/m2-auth.js`를 `js/m2-auth.js`로 복사.
- ⚠ service_role 키는 **절대** 프론트에 넣지 않는다(Edge Function 시크릿 전용).

## 2) 로그인 버튼 — topbar (index.html header, 음소거 버튼 옆)
```html
<button id="btn-login" class="mute-btn" title="로그인">🔑</button>
<span id="who" class="who"></span>
```
배선(game.js 또는 인라인):
- `SaruruAuth.onAuth(({user, player, needsNickname}) => { ... })`
  - `user && player` → `#who`에 `player.nickname` 표시, 버튼을 로그아웃(↩)으로.
  - `needsNickname` → 닉네임 모달 오픈.
  - `!user` → 버튼 클릭 시 `SaruruAuth.loginKakao()`.

## 3) 닉네임 모달 (신규 오버레이 div — overlay-start와 같은 패턴)
- 입력 + "확인 가능?" 버튼: `await SaruruAuth.checkNickname(v)` → `available` 표시.
- 확정: `await SaruruAuth.setNickname(v)` → `ok` 면 모달 닫고 `onAuth`가 갱신.
  - `error==='taken'` → "이미 쓰는 닉네임" 안내(유니크 위반 정상 처리).
- 규칙 힌트: 2~12자, 한글/영문/숫자/`_`/`-`.

## 4) 게임오버 화면 — 점수 제출 + 리더보드 패널 (overlay-over 확장)
`gameOver()` 안, localStorage best 저장 직후:
```js
// 서버 제출은 비동기 · 실패해도 게임 흐름 막지 않음
const st = SaruruAuth.getState();
if (st.user && st.player) {
  const playedMs = Math.floor(elapsed * 1000); // elapsed(초) → ms
  SaruruAuth.submitScore(fs, playedMs, 'ddong').then((r) => {
    if (r.ok) {
      if (r.best > best) { best = r.best; localStorage.setItem(BEST_KEY, String(best)); el.best.textContent = best; }
      if (r.isNewBest) { /* "온라인 신기록!" 배지 */ }
    }
    // r.error 는 조용히 무시(로컬 기록은 이미 저장됨)
  });
}
```
리더보드 패널(게임오버 카드 하단):
```js
SaruruAuth.getLeaderboard('ddong', 'week', 10).then(({rows}) => {
  // rows: [{nickname, best, updated_at}] → 순위 리스트 렌더
});
```
- 탭: 주간('week') / 전체('all') 토글.

## 5) 로그인 시 best 동기화
- `onAuth`에서 `player`가 로드되면 `getLeaderboard`/서버 best로 로컬과 비교,
  더 큰 값으로 `#best` 갱신(로컬 우선 저장 유지). 실질 동기화는 다음 제출에서 서버가 greatest 처리.

## 배선 체크리스트
- [ ] 미로그인 상태로 시작→플레이→게임오버까지 무동작 오류 없이 진행
- [ ] supabase-js 로드 실패해도 게임 정상(콘솔 경고만)
- [ ] 로그인→닉네임→재플레이→리더보드에 내 닉 노출
- [ ] service_role 키가 어디에도 프론트에 없음
