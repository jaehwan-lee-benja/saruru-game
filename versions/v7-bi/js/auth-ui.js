/* 로그인 UI 배선 (M2 — 카카오 + 구글)
 *
 * 상단바 버튼: 미로그인 → 로그인 모달 열기 / 로그인 → 로그아웃.
 * 로그인 모달에서 카카오·구글 중 선택. 둘 다 Supabase에 provider 설정됨(구글은 백오피스와 공유).
 * 로그인은 game 스키마 없이도 작동(인증만). 닉네임·랭킹은 스키마 승인 후 game.js에 이어붙인다.
 */
(function () {
  "use strict";

  var btn = document.getElementById("btn-login");
  var who = document.getElementById("who");
  var modal = document.getElementById("login-modal");
  if (!btn || !window.SaruruAuth) return;

  var state = { user: null, player: null };

  function openModal() { if (modal) modal.classList.remove("hidden"); }
  function closeModal() { if (modal) modal.classList.add("hidden"); }

  SaruruAuth.onAuth(function (s) {
    state.user = s.user;
    state.player = s.player;
    if (s.user) {
      btn.textContent = "로그아웃";
      btn.classList.add("logged-in");
      btn.title = "로그아웃";
      btn.setAttribute("aria-label", "로그아웃");
      who.textContent = s.player ? s.player.nickname : "로그인됨";
      who.hidden = false;
      closeModal();
    } else {
      btn.textContent = "로그인";
      btn.classList.remove("logged-in");
      btn.title = "로그인";
      btn.setAttribute("aria-label", "로그인");
      who.hidden = true;
      who.textContent = "";
    }
  });

  // 상단바 버튼: 로그인 상태면 로그아웃, 아니면 로그인 모달
  btn.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    if (state.user) SaruruAuth.logout();
    else openModal();
  });

  // 모달 배경 클릭 → 닫기
  if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  var closeBtn = document.getElementById("login-close");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  function wire(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function () {
      fn().then(function (r) {
        if (!r.ok) { console.warn("[auth-ui] 로그인 실패", r.error); }
        // ok면 브라우저가 OAuth로 리다이렉트됨
      });
    });
  }
  wire("login-kakao", function () { return SaruruAuth.loginKakao(); });
  wire("login-google", function () { return SaruruAuth.loginGoogle(); });
})();
