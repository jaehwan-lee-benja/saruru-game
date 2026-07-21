/* 버그 신고 — 우리 서버(game.bug_reports)로 수신.
 *
 * 로그인 사용자 본인 명의로 insert(RLS bug_insert_self). 익명 삽입은 차단 = 스팸 억제.
 * 자동 수집 맥락(버전·점수·기기 등)은 meta(jsonb)로 함께 저장 → 운영이 재현에 활용.
 * 로그인이 필요하므로, 미로그인 상태면 로그인 안내만 한다(게임 자체가 로그인 게이트라 보통은 로그인 상태).
 */
(() => {
  'use strict';

  const VERSION = 'v7-bi';

  const $ = (id) => document.getElementById(id);
  const modal = $('bug-modal'), text = $('bug-text'), meta = $('bug-meta'), msg = $('bug-msg');
  if (!modal) return;

  // 재현에 필요한 맥락을 자동 수집 — 유저가 안 적어도 되는 것들
  function collect() {
    return {
      version: VERSION,
      score: $('score') ? $('score').textContent : null,
      best: localStorage.getItem('saruru.ddong.best') || '0',
      lives: $('lives') ? $('lives').textContent : null,
      hat: localStorage.getItem('saruru.ddong.hat') || 'milk',
      muted: localStorage.getItem('saruru.muted') === '1',
      screen: window.innerWidth + '×' + window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      vibrate: typeof navigator.vibrate === 'function',
      url: location.href,
    };
  }
  function metaText(m) {
    return [
      '버전: ' + m.version,
      '점수: ' + m.score + ' / 최고: ' + m.best,
      '목숨: ' + m.lives,
      '모자: ' + m.hat,
      '음소거: ' + (m.muted ? '켜짐(소리·진동 꺼짐)' : '꺼짐'),
      '화면: ' + m.screen + ' (dpr ' + m.dpr + ')',
      '진동지원: ' + (m.vibrate ? '있음' : '없음(iOS 등)'),
    ].join('\n');
  }

  let curMeta = null;
  function open() {
    curMeta = collect();
    meta.textContent = metaText(curMeta);
    msg.textContent = '';
    msg.className = 'bug-msg';
    text.value = '';
    modal.classList.remove('hidden');
    text.focus();
  }
  function close() { modal.classList.add('hidden'); }

  $('btn-bug').addEventListener('click', open);
  $('bug-cancel').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  const sendBtn = $('bug-send');
  sendBtn.addEventListener('click', async () => {
    const body = text.value.trim();
    if (!body) { msg.className = 'bug-msg err'; msg.textContent = '무엇이 이상했는지 한 줄만 적어주세요.'; return; }

    const A = window.SaruruAuth;
    const st = A && A.getState ? A.getState() : null;
    if (!A || !st || !st.user) {
      msg.className = 'bug-msg err';
      msg.textContent = '로그인 후 신고할 수 있어요. 하단 "로그인"을 눌러주세요.';
      return;
    }

    sendBtn.disabled = true;
    msg.className = 'bug-msg';
    msg.textContent = '보내는 중…';
    const r = await A.submitBug(body, curMeta || collect());
    sendBtn.disabled = false;
    if (r.ok) {
      msg.className = 'bug-msg ok';
      msg.textContent = '고마워요! 신고가 접수됐어요. 🐮';
      text.value = '';
      setTimeout(close, 1200);
    } else {
      const m = { empty: '내용을 적어주세요.', too_long: '너무 길어요(2000자 이내).',
                  not_logged_in: '로그인 후 신고할 수 있어요.' };
      msg.className = 'bug-msg err';
      msg.textContent = m[r.error] || '전송에 실패했어요. 잠시 후 다시 시도해주세요.';
    }
  });
})();
