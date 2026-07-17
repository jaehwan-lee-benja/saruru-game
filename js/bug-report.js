/* 버그 신고 — 정적 사이트(백엔드 없음)라 전송은 메일 클라이언트에 넘긴다.
 *
 * ⚠ 이건 임시 경로다. 한계가 분명하다:
 *   · 메일 앱이 없는 기기(특히 웹메일만 쓰는 데스크톱)에선 아무 일도 안 일어난 것처럼 보인다.
 *   · 수신 주소가 클라이언트 코드에 노출된다 = 스팸 수집 대상.
 *   · 유저가 메일 앱에서 "보내기"를 눌러야 실제로 전송된다(중간 이탈률 높음).
 * 제대로 하려면 game 스키마에 bug_reports 테이블 + Edge Function(익명 insert, 레이트리밋)이다.
 * 그건 공유 DB DDL이라 supabase-guardian 검수 + 유저 승인 게이트가 필요하다(m2/README.md 참조).
 */
(() => {
  'use strict';

  const TO = 'designerbenja@gmail.com';   // ← 수신 주소. 스팸 우려 시 전용 주소로 교체할 것.
  const VERSION = 'v7-bi';

  const $ = (id) => document.getElementById(id);
  const modal = $('bug-modal'), text = $('bug-text'), meta = $('bug-meta'), msg = $('bug-msg');
  if (!modal) return;

  // 재현에 필요한 맥락을 자동 수집 — 유저가 안 적어도 되는 것들
  function collect() {
    const best = localStorage.getItem('saruru.ddong.best') || '0';
    return [
      '버전: ' + VERSION,
      '점수: ' + ($('score') ? $('score').textContent : '?') + ' / 최고: ' + best,
      '목숨: ' + ($('lives') ? $('lives').textContent : '?'),
      '모자: ' + (localStorage.getItem('saruru.ddong.hat') || 'milk'),
      '음소거: ' + (localStorage.getItem('saruru.muted') === '1' ? '켜짐(소리·진동 꺼짐)' : '꺼짐'),
      '화면: ' + window.innerWidth + '×' + window.innerHeight + ' (dpr ' + (window.devicePixelRatio || 1) + ')',
      '진동지원: ' + (typeof navigator.vibrate === 'function' ? '있음' : '없음(iOS 등)'),
      '기기: ' + navigator.userAgent,
    ].join('\n');
  }

  function open() {
    meta.textContent = collect();
    msg.textContent = '';
    modal.classList.remove('hidden');
    text.focus();
  }
  function close() { modal.classList.add('hidden'); }

  $('btn-bug').addEventListener('click', open);
  $('bug-cancel').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  $('bug-send').addEventListener('click', () => {
    const body = text.value.trim();
    if (!body) { msg.textContent = '무엇이 이상했는지 한 줄만 적어주세요.'; return; }
    const subject = '[사르르목장 게임] 버그 신고 (' + VERSION + ')';
    const full = body + '\n\n--- 자동 수집 정보 ---\n' + collect();
    const href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(full);
    // 메일 앱이 안 열리는 경우가 많아서, 복사 대체 경로를 함께 안내한다
    window.location.href = href;
    msg.textContent = '메일 앱이 열리지 않으면 아래 "함께 보내는 정보"를 복사해 ' + TO + ' 로 보내주세요.';
  });
})();
