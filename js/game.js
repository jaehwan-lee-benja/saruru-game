/* 사르르목장 · 젖소 똥피하기 — 레트로 픽셀아트 (M1)
 * 128x192 저해상도 가상 캔버스 + 도트 스프라이트 + image-rendering:pixelated.
 * 브랜드(로고 젖소 마스코트 · 네이비 #385088 · 우유/아이스크림)를 8bit 픽셀로 재해석.
 * 로그인/DB 없이 로컬 플레이. 랭킹·인증은 M2. (최고점 = localStorage)
 */
(() => {
  'use strict';

  const VW = 128, VH = 192;      // 가상(픽셀) 해상도
  const GROUND = 26;
  const PLAYER_Y = VH - GROUND;  // 젖소 발 높이

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    lives: document.getElementById('lives'),
    start: document.getElementById('overlay-start'),
    over: document.getElementById('overlay-over'),
    finalScore: document.getElementById('final-score'),
    bestLine: document.getElementById('best-line'),
    bestNum: document.getElementById('best'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
  };

  const BEST_KEY = 'saruru.ddong.best';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  el.best.textContent = best;

  // ===== 팔레트 (3톤 색상변이 셰이딩 · 검정 대신 다크네이비 외곽선) =====
  const PAL = {
    '.': null,
    D: '#2b3a63', // 소프트 네이비 외곽선(검정 대신)
    N: '#415c99', // 젖소 무늬 네이비
    n: '#2f4576', // 무늬 그림자
    W: '#ffffff', // 흰
    s: '#d3ddf0', // 흰 그림자(쿨톤 변이)
    K: '#2a3559', // 눈동자(진네이비)
    L: '#ffffff', // 눈 글린트
    p: '#f7a8c4', // 볼터치 핑크
    P: '#e8698f', // 콧구멍/입 진핑크
    m: '#ffdfe8', // 주둥이 연핑크
    o: '#f6c3d2', // 주둥이 그림자
    c: '#fff7db', // 크림(우유팩)
    y: '#efdcac', // 크림 그림자
    R: '#5f7fc4', // 우유팩 라벨 밝은 네이비
    t: '#f6dca8', // 콘/바닐라
    u: '#d8b877', // 콘 그림자
    r: '#c98a55', // 콘 격자선
    B: '#ad7742', // 소똥
    b: '#7c4f26', // 소똥 그림자
    h: '#cd975d', // 소똥 하이라이트
    F: '#ff5a8a', // 딸기(컵 토핑)
    G: '#8fc07a', g: '#6fa85a', // 잔디
  };

  // ===== 스프라이트 (문자맵) =====
  // 젖소 = 측면(옆모습) 24칸 폭 · 다리는 절차적으로 그림. 이동방향으로 flip.
  // 우유팩 모자·귀·글린트 눈·볼터치·핑크 주둥이·젖소무늬·꼬리.
  const COW = [
    '...............DDDD.....',
    '...............DccD.....',
    '..............DccccD....',
    '...........DW.DcRRcD....',
    '...........DWWDccccD....',
    '.............DWWWWWWD...',
    '...DDWWWWWWWWWWWWWWWWD..',
    '.nDWWNNNWWWWWWWWWLKWWWD.',
    'nnDWNNNNNWWWWWWWWKKWmmDD',
    '.nDWWNNNWWWWWWWWWppmmmoD',
    '.DsWWWWWWWWWWWWWWWWmPmoD',
    '.DsWWWWWWWWWWWWWWWWmooD.',
    '..DsWWWWWWWWWWWWWWWWsD..',
    '...DDWWWWWWWWWWWWWDD....',
  ];

  const MILK = [
    '....DD....',
    '...DccD...',
    '..DcccyD..',
    '.DccccyyD.',
    '.DccccyyD.',
    '.DcRRRcyD.',
    '.DcRRRcyD.',
    '.DccccyyD.',
    '.DDDDDDDD.',
  ];

  const CONE = [
    '.WWWWWWWW.',
    'WWWWWWWWsW',
    'WWWWWWWWsW',
    '.tttttttt.',
    '.trtttrtu.',
    '.DtrttrtuD',
    '..DtrrtuD.',
    '..DturtuD.',
    '...DtutD..',
    '...DtuD...',
    '....DD....',
  ];

  const CUP = [
    '...FF.....',
    '..FFFF.FF.',
    '.WWWWWWFFW',
    'WWWWWWWWsW',
    'WWWWWWWWsW',
    '.tttttttt.',
    '.tFtttFtu.',
    '.tttttttu.',
    '..tttttu..',
    '..DtttuD..',
    '...DDDD...',
  ];

  // 소똥 — 살짝 능글맞지만 미워할 수 없게(눈+반짝)
  const POOP = [
    '....hh....',
    '...hBBh...',
    '..hBBBBb..',
    '..BWKBKWb.',  // 눈(흰자+눈동자)
    '.hBBBBBBb.',
    'hBBWKKWBBb',  // 반짝 입
    'BBBBBBBBBb',
    '.bBBBBBBb.',
    '..bbbbbb..',
  ];

  const CLOUD = [
    '...WWWW...',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWssssWW',
  ];

  function sizeOf(sp) { return { w: Math.max(...sp.map(r => r.length)), h: sp.length }; }

  function drawSprite(sp, x, y, flip) {
    x = Math.round(x); y = Math.round(y);
    const w = Math.max(...sp.map(r => r.length));
    for (let r = 0; r < sp.length; r++) {
      const row = sp[r];
      for (let c = 0; c < row.length; c++) {
        const col = PAL[row[c]];
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(x + (flip ? (w - 1 - c) : c), y + r, 1, 1);
        }
      }
    }
  }

  // ===== 낙하물 종류 =====
  const KINDS = {
    poop: { sp: POOP, good: false },
    milk: { sp: MILK, good: true, points: 5 },
    cone: { sp: CONE, good: true, points: 10 },
    cup:  { sp: CUP,  good: true, points: 15 },
  };

  // ===== 상태 =====
  let state = 'ready';
  const player = { x: VW / 2, w: 18, speed: 1.7, vx: 0, phase: 0, facing: 1 };
  let items = [];
  let sparks = [];
  let score = 0, lives = 3, elapsed = 0, spawnTimer = 0, invuln = 0, lastTime = 0;
  let clouds = [{ x: 20, y: 22, s: 0.11 }, { x: 78, y: 12, s: 0.07 }, { x: 104, y: 34, s: 0.09 }];
  const input = { left: false, right: false, targetX: null };

  // ===== 입력 =====
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    else if (e.key === ' ' || e.key === 'Enter') { if (state !== 'playing') startGame(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
  });
  function vx(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * VW;
  }
  function onPointer(e) {
    if (state !== 'playing') return;
    const t = e.touches ? e.touches[0] : e;
    if (!t) return;
    input.targetX = vx(t.clientX);
    e.preventDefault();
  }
  canvas.addEventListener('touchstart', onPointer, { passive: false });
  canvas.addEventListener('touchmove', onPointer, { passive: false });
  canvas.addEventListener('touchend', () => { input.targetX = null; });
  canvas.addEventListener('mousedown', (e) => { canvas._drag = true; onPointer(e); });
  window.addEventListener('mousemove', (e) => { if (canvas._drag) onPointer(e); });
  window.addEventListener('mouseup', () => { canvas._drag = false; input.targetX = null; });
  el.btnStart.addEventListener('click', startGame);
  el.btnRetry.addEventListener('click', startGame);

  // ===== 흐름 =====
  function startGame() {
    state = 'playing';
    items = []; sparks = [];
    score = 0; lives = 3; elapsed = 0; spawnTimer = 0; invuln = 0;
    player.x = VW / 2; player.vx = 0; player.phase = 0; player.facing = 1;
    input.targetX = null;
    el.start.classList.add('hidden');
    el.over.classList.add('hidden');
    updateHud();
  }
  function gameOver() {
    state = 'over';
    const fs = Math.floor(score);
    const nb = fs > best;
    if (nb) { best = fs; localStorage.setItem(BEST_KEY, String(best)); el.best.textContent = best; }
    el.finalScore.textContent = fs;
    el.bestLine.textContent = nb ? '★ NEW BEST! 사르르목장 최고기록 ★' : 'BEST ' + best;
    el.over.classList.remove('hidden');
  }
  function updateHud() {
    el.score.textContent = Math.floor(score);
    el.lives.textContent = '♥'.repeat(Math.max(0, lives)) || '·';
  }

  function spawn() {
    const roll = Math.random();
    let kind;
    if (roll < 0.10) kind = 'cup';
    else if (roll < 0.26) kind = 'cone';
    else if (roll < 0.46) kind = 'milk';
    else kind = 'poop';
    const k = KINDS[kind];
    const sz = sizeOf(k.sp);
    const speed = 0.7 + elapsed * 0.02 + Math.random() * 0.5;
    items.push({
      kind, sp: k.sp, good: k.good, points: k.points || 0, w: sz.w, h: sz.h,
      x: 4 + Math.random() * (VW - sz.w - 8), y: -sz.h,
      vy: speed, sway: Math.random() * 6.28, swayA: 0.15 + Math.random() * 0.2,
    });
  }
  function addSparks(x, y, color, n) {
    for (let i = 0; i < n; i++) sparks.push({
      x, y, color, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.6 - 0.4, life: 1,
    });
  }
  function addPopup(x, y, txt, color) {
    sparks.push({ x, y, txt, color, vx: 0, vy: -0.5, life: 1.2 });
  }

  // ===== 업데이트 =====
  function update(dt) {
    // 구름은 항상 흐름
    for (const cl of clouds) {
      cl.x += cl.s * (dt / 16.7);
      if (cl.x > VW + 8) cl.x = -12;
    }
    if (state !== 'playing') return;
    const f = dt / 16.7;
    elapsed += dt / 1000;
    score += (dt / 1000) * 10;

    const prev = player.x;
    if (input.targetX != null) {
      const d = input.targetX - player.x;
      player.x += Math.max(-player.speed * 1.7, Math.min(player.speed * 1.7, d));
    }
    if (input.left) player.x -= player.speed * f;
    if (input.right) player.x += player.speed * f;
    player.x = Math.max(player.w / 2, Math.min(VW - player.w / 2, player.x));
    player.vx = player.x - prev;
    if (Math.abs(player.vx) > 0.15) {
      player.phase += 0.3 * f;
      player.facing = player.vx > 0 ? 1 : -1; // 이동방향 바라보기
    }

    const spawnInterval = Math.max(340, 900 - elapsed * 22);
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawn(); }
    if (invuln > 0) invuln -= dt;

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * f;
      it.sway += 0.08 * f;
      const cx = it.x + it.w / 2 + Math.sin(it.sway) * it.swayA;
      const cy = it.y + it.h / 2;
      // 젖소 몸통과 충돌
      if (cy > PLAYER_Y - 18 && cy < PLAYER_Y + 2 && Math.abs(cx - player.x) < player.w / 2 + it.w / 2 - 2) {
        if (it.good) {
          score += it.points;
          addPopup(cx, PLAYER_Y - 20, '+' + it.points, '#ef6f92');
          addSparks(cx, cy, '#ffffff', 5);
        } else if (invuln <= 0) {
          lives -= 1; invuln = 1000;
          addSparks(player.x, PLAYER_Y - 12, '#9a6733', 6);
          if (lives <= 0) { items.splice(i, 1); updateHud(); gameOver(); return; }
        } else { continue; }
        items.splice(i, 1); updateHud(); continue;
      }
      if (it.y > VH + 4) items.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; if (!s.txt) s.vy += 0.08;
      s.life -= dt / 700;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    updateHud();
  }

  // ===== 렌더 =====
  function drawBackground() {
    // 하늘 (3단 그라데이션 밴드)
    ctx.fillStyle = '#cfeafb'; ctx.fillRect(0, 0, VW, VH - GROUND);
    ctx.fillStyle = '#dff2fc'; ctx.fillRect(0, 0, VW, 52);
    ctx.fillStyle = '#eaf8fe'; ctx.fillRect(0, 0, VW, 22);
    // 뒤쪽 언덕 (부드러운 곡선 실루엣)
    const hillTop = VH - GROUND;
    ctx.fillStyle = '#a6d089';
    for (let x = 0; x < VW; x++) {
      const h = 10 + Math.round(6 * Math.sin(x * 0.05 + 1.5) + 4 * Math.sin(x * 0.13));
      ctx.fillRect(x, hillTop - h, 1, h);
    }
    ctx.fillStyle = '#b7dc9b';
    for (let x = 0; x < VW; x++) {
      const h = 6 + Math.round(4 * Math.sin(x * 0.07 + 3.2));
      ctx.fillRect(x, hillTop - h, 1, h);
    }
    // 구름
    for (const cl of clouds) drawSprite(CLOUD, cl.x, cl.y);
    // 초원
    ctx.fillStyle = '#8fc07a';
    ctx.fillRect(0, hillTop, VW, GROUND);
    ctx.fillStyle = '#7bb168';
    ctx.fillRect(0, hillTop, VW, 2);
    ctx.fillStyle = '#6fa85a';
    ctx.fillRect(0, hillTop + 2, VW, 1);
    // 잔디 픽셀 texture
    ctx.fillStyle = '#7bb168';
    for (let x = 2; x < VW; x += 7) {
      const yy = hillTop + 6 + ((x * 7) % 9);
      ctx.fillRect(x, yy, 1, 2);
      ctx.fillRect(x + 3, yy + 4, 1, 2);
    }
    // 작은 꽃 (분홍/노랑 포인트)
    const flowers = [[10, 6, '#ffd7e6'], [46, 12, '#fff0a8'], [88, 7, '#ffd7e6'], [116, 14, '#fff0a8']];
    for (const [fx, fo, fc] of flowers) {
      const fy = hillTop + fo;
      ctx.fillStyle = fc; ctx.fillRect(fx, fy, 2, 2);
      ctx.fillStyle = '#e58fb0'; ctx.fillRect(fx, fy, 1, 1);
    }
  }

  function drawCow() {
    const playing = state === 'playing';
    const moving = Math.abs(player.vx) > 0.15 && playing;
    // 걷기 = 발맞춰 1px 바운스 / 정지 = 느린 숨쉬기 1px 바운스(아이들)
    const bob = moving
      ? (Math.floor(player.phase * 2) % 2)
      : (Math.floor(elapsed * 2.2) % 2);
    const sz = sizeOf(COW);
    const legLen = 3;
    const flip = player.facing < 0;         // 왼쪽 이동 시 좌우 반전
    const x = player.x - sz.w / 2;
    const y = PLAYER_Y - legLen - sz.h - bob;
    const flash = invuln > 0 && Math.floor(invuln / 100) % 2 === 0;
    if (flash) return;
    // 발밑 그림자
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#26365c';
    ctx.fillRect(Math.round(player.x) - 9, PLAYER_Y - 1, 18, 2);
    ctx.globalAlpha = 1;
    // 다리 4개 (절차적 · 걷기 2프레임 · 발 planted, 발굽 진네이비)
    const bodyBottom = y + sz.h;
    const step = Math.floor(player.phase * 2) % 2;
    const offs = [-7, -3, 3, 7];
    ctx.fillStyle = PAL.D;
    for (let i = 0; i < offs.length; i++) {
      const lifted = moving && ((i + step) % 2 === 0) ? 1 : 0;
      const h = (PLAYER_Y - lifted) - bodyBottom;
      if (h > 0) ctx.fillRect(Math.round(player.x) + offs[i] - 1, bodyBottom, 2, h);
    }
    // 몸통(측면 스프라이트)
    drawSprite(COW, x, y, flip);
  }

  function render() {
    ctx.clearRect(0, 0, VW, VH);
    drawBackground();
    for (const it of items) drawSprite(it.sp, it.x + Math.sin(it.sway) * it.swayA, it.y);
    if (state === 'playing' || state === 'over') drawCow();
    // 스파크 / 점수 팝업
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
      if (s.txt) {
        ctx.fillStyle = s.color;
        ctx.font = '7px Galmuri11, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.txt, s.x, s.y);
      } else {
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!lastTime) lastTime = now;
    let dt = now - lastTime; lastTime = now;
    if (dt > 60) dt = 60;
    update(dt); render();
    requestAnimationFrame(loop);
  }
  render();
  requestAnimationFrame(loop);
})();
