/* 로그인 UI 배선 (M2 1단계 — 로그인만)
 *
 * 지금은 "카카오 로그인 작동"만 붙인다. 로그인은 game 스키마 없이도 된다(인증만).
 * 닉네임 모달 · 온라인 랭킹은 game 스키마 승인·적용 후 game.js에 이어붙인다.
 *   → 그때까지 로그인한 사용자에게는 "랭킹 준비 중"으로 안내한다.
 *
 * SaruruAuth(m2-auth.js)의 공개 API에만 의존한다.
 */
(function () {
  "use strict";

  var btn = document.getElementById("btn-login");
  var who = document.getElementById("who");
  if (!btn || !window.SaruruAuth) return;

  var state = { user: null, player: null };

  // 로그인 상태에 따라 버튼·라벨 갱신
  SaruruAuth.onAuth(function (s) {
    state.user = s.user;
    state.player = s.player;
    if (s.user) {
      btn.textContent = "↩";
      btn.title = "로그아웃";
      btn.setAttribute("aria-label", "로그아웃");
      // 닉네임이 있으면 닉네임, 없으면(스키마 전) "로그인됨"
      who.textContent = s.player ? s.player.nickname : "로그인됨";
      who.hidden = false;
    } else {
      btn.textContent = "🔑";
      btn.title = "카카오 로그인";
      btn.setAttribute("aria-label", "카카오 로그인");
      who.hidden = true;
      who.textContent = "";
    }
  });

  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (state.user) {
      SaruruAuth.logout();
    } else {
      // 클릭 → 카카오 로그인 페이지로 리다이렉트(돌아오면 세션 복원)
      SaruruAuth.loginKakao().then(function (r) {
        if (!r.ok) {
          who.hidden = false;
          who.textContent = "로그인 오류";
          console.warn("[auth-ui] 로그인 실패", r.error);
        }
      });
    }
  });
})();
