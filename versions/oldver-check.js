/* ============================================================================
 * 사르르 게임 · 구버전 자동 안내 (versions/oldver-check.js)
 * ----------------------------------------------------------------------------
 * 각 아카이브 스냅샷 페이지(versions/vN/)가 이 파일을 로드한다.
 * 자기 버전(URL의 /versions/vN/에서 추출) ≠ 현재 버전(../../version.json의 current)이면
 * "이전 버전 · 최신 버전으로 →" 배너를 화면 최상단에 자동 표시한다.
 *   · 단일 진실원천 = /saruru-game/version.json. 배포 시 그 파일만 갱신하면 자동 반영.
 *   · 자기 버전 == 현재면 배너 없음. fetch 실패 시엔 안전하게 배너 표시.
 * ==========================================================================*/
(function () {
  "use strict";
  var m = location.pathname.match(/\/versions\/(v\d+)/);
  if (!m) return;                 // 스냅샷 경로가 아니면(루트 등) 아무것도 안 함
  var mine = m[1];                // 예: "v8"

  function showBanner() {
    if (document.querySelector(".oldver-banner")) return;
    var d = document.createElement("div");
    d.className = "oldver-banner";
    d.style.cssText = "background:#2D4B82;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:700;text-align:center;padding:10px 12px;line-height:1.45";
    d.innerHTML = '⚠ 이전 버전(아카이브)입니다 · <a href="../../" style="color:#fff;text-decoration:underline;font-weight:800">최신 버전으로 →</a>';
    var body = document.body || document.documentElement;
    body.insertBefore(d, body.firstChild);
  }

  fetch("../../version.json", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (v) {
      var cur = (String(v && v.current).match(/v\d+/) || [])[0];
      if (!cur || mine !== cur) showBanner();     // 현재 버전과 다르면 안내
    })
    .catch(function () { showBanner(); });          // 원천 못 읽으면 안전하게 안내
})();
