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
      // 로그인은 됐는데 닉네임이 없으면(최초) 닉네임 모달 열기
      if (s.needsNickname) openNick();
    } else {
      btn.textContent = "로그인";
      btn.classList.remove("logged-in");
      btn.title = "로그인";
      btn.setAttribute("aria-label", "로그인");
      who.hidden = true;
      who.textContent = "";
    }
  });

  // ===== 닉네임 모달 (최초 설정 + 변경 공용) =====
  var nickModal = document.getElementById("nick-modal");
  var nickInput = document.getElementById("nick-input");
  var nickMsg = document.getElementById("nick-msg");
  var nickTitle = document.getElementById("nick-title");
  var nickLater = document.getElementById("nick-later");
  function openNick(changeMode) {
    if (!nickModal) return;
    if (nickTitle) nickTitle.textContent = changeMode ? "닉네임 변경" : "닉네임 정하기";
    if (nickLater) nickLater.textContent = changeMode ? "취소" : "나중에";
    if (nickInput) nickInput.value = changeMode && state.player ? state.player.nickname : "";
    nickMsg.textContent = "";
    nickModal.classList.remove("hidden");
    if (nickInput) { nickInput.focus(); nickInput.select(); }
  }
  function closeNick() { if (nickModal) nickModal.classList.add("hidden"); }
  if (nickModal) {
    var laterBtn = document.getElementById("nick-later");
    var saveBtn = document.getElementById("nick-save");
    if (laterBtn) laterBtn.addEventListener("click", closeNick);
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var v = (nickInput.value || "").trim();
      nickMsg.textContent = "확인 중…";
      SaruruAuth.setNickname(v).then(function (r) {
        if (r.ok) { closeNick(); }
        else {
          var m = { taken: "이미 쓰는 닉네임이에요.", too_short: "2자 이상이어야 해요.",
                    too_long: "12자까지만 돼요.", bad_chars: "한글·영문·숫자만 돼요.",
                    banned: "쓸 수 없는 단어예요.", not_logged_in: "로그인이 필요해요." };
          nickMsg.textContent = m[r.error] || "저장에 실패했어요. 잠시 후 다시.";
        }
      });
    });
  }

  // 상단바 버튼: 로그인 상태면 로그아웃, 아니면 로그인 모달
  btn.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    if (state.user) SaruruAuth.logout();
    else openModal();
  });

  // 닉네임(who) 클릭 → 닉네임 변경 모달
  if (who) who.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    if (state.user) openNick(true);
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
  // 웰컴(로그인 게이트) 화면의 버튼도 같은 로그인에 연결
  wire("welcome-kakao", function () { return SaruruAuth.loginKakao(); });
  wire("welcome-google", function () { return SaruruAuth.loginGoogle(); });
})();
