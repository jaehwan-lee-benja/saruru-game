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
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
  };

  const BEST_KEY = 'saruru.ddong.best';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  el.best.textContent = best;

  // ===== 팔레트 =====
  const PAL = {
    '.': null,
    N: '#385088', // 네이비(브랜드)
    D: '#26365c', // 진한 네이비(외곽/그림자)
    W: '#ffffff', // 흰색
    c: '#fff7db', // 크림(우유팩)
    K: '#22315a', // 눈
    P: '#ef6f92', // 딸기/콧구멍
    p: '#f9c6d3', // 연분홍(주둥이)
    Y: '#e<f0ddb9', // 뿔(수정됨 아래)
    B: '#9a6733', // 소똥
    b: '#6d4520', // 진한 갈색
    t: '#f0ddb9', // 콘 반죽
    G: '#8fc07a', // 잔디
    g: '#6fa85a', // 진한 잔디
  };
  PAL.Y = '#f0ddb9';

  // ===== 스프라이트 (문자맵) =====
  // 젖소 (머리+우유팩모자+몸통, 18w x 18h) — 다리는 절차적으로 그림
  const COW = [
    '.....DDDDDD.....',
    '.....DccccD.....',
    '.....DcNNcD.....',
    '.....DccccD.....',
    '.....DDDDDD.....',
    '...DDDDDDDDDD...',
    '.D.DWWWWWWWWD.D.',
    '...DNNWWWWWWD...',
    '...DNNWWWWWWD...',
    '...DWWWWWWWWD...',
    '...DWKWWWWKWD...',
    '...DWWWWWWWWD...',
    '...DppppppppD...',
    '...DpPppppPpD...',
    '...DWWWWWWWWD...',
    '....DWNNWWWD....',
    '....DWWWWWWD....',
  ];

  const MILK = [
    '..DDDDDD..',
    '..DccccD..',
    '.DDccccDD.',
    '.DccccccD.',
    '.DccNNccD.',
    '.DcNNNNcD.',
    '.DccNNccD.',
    '.DccccccD.',
    '.DDDDDDDD.',
  ];

  const CONE = [
    '..WWWWWW..',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.tttttttt.',
    '.DttttttD.',
    '..DttttD..',
    '..DtttD...',
    '...DttD...',
    '...DtD....',
    '....D.....',
  ];

  const CUP = [
    '...WW.....',
    '..WWWW.WW.',
    '.WWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.tttttttt.',
    '.tPtttPtt.',
    '.tttttttt.',
    '..tttttt..',
    '..DttttD..',
    '...DDDD...',
  ];

  const POOP = [
    '....BB....',
    '...BbbB...',
    '..BbWWbB..',  // 눈 흰자
    '..BWKWKB..',  // 눈동자
    '.BbbbbbbB.',
    'BbbbWWbbbB',
    'BbbbbbbbbB',
    '.DBBBBBBD.',
  ];

  const CLOUD = [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    '.WWWWWW.',
  ];

  function sizeOf(sp) { return { w: Math.max(...sp.map(r => r.length)), h: sp.length }; }

  function drawSprite(sp, x, y) {
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < sp.length; r++) {
      const row = sp[r];
      for (let c = 0; c < row.length; c++) {
        const col = PAL[row[c]];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x + c, y + r, 1, 1); }
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
  const player = { x: VW / 2, w: 14, speed: 1.7, vx: 0, phase: 0 };
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
  function hold(btn, dir) {
    const set = (v) => (e) => { input[dir] = v; e.preventDefault(); };
    btn.addEventListener('touchstart', set(true), { passive: false });
    btn.addEventListener('touchend', set(false));
    btn.addEventListener('mousedown', set(true));
    btn.addEventListener('mouseup', set(false));
    btn.addEventListener('mouseleave', set(false));
  }
  hold(el.btnLeft, 'left');
  hold(el.btnRight, 'right');
  el.btnStart.addEventListener('click', startGame);
  el.btnRetry.addEventListener('click', startGame);

  // ===== 흐름 =====
  function startGame() {
    state = 'playing';
    items = []; sparks = [];
    score = 0; lives = 3; elapsed = 0; spawnTimer = 0; invuln = 0;
    player.x = VW / 2; player.vx = 0; player.phase = 0;
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
    if (Math.abs(player.vx) > 0.15) player.phase += 0.3 * f;

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
    // 하늘
    ctx.fillStyle = '#bfe0f5';
    ctx.fillRect(0, 0, VW, VH - GROUND);
    ctx.fillStyle = '#d6ecf9';
    ctx.fillRect(0, 0, VW, 40);
    // 구름
    for (const cl of clouds) drawSprite(CLOUD, cl.x, cl.y);
    // 초원
    ctx.fillStyle = '#8fc07a';
    ctx.fillRect(0, VH - GROUND, VW, GROUND);
    ctx.fillStyle = '#6fa85a';
    ctx.fillRect(0, VH - GROUND, VW, 3);
    // 잔디 픽셀 texture
    ctx.fillStyle = '#6fa85a';
    for (let x = 2; x < VW; x += 8) {
      const yy = VH - GROUND + 6 + ((x * 7) % 9);
      ctx.fillRect(x, yy, 1, 2);
      ctx.fillRect(x + 3, yy + 3, 1, 2);
    }
  }

  function drawCow() {
    const moving = Math.abs(player.vx) > 0.15 && state === 'playing';
    const bob = moving ? (Math.floor(player.phase * 2) % 2) : 0;
    const sz = sizeOf(COW);
    const x = player.x - sz.w / 2;
    const y = PLAYER_Y - sz.h - 2 - bob; // 다리 공간 2px
    const flash = invuln > 0 && Math.floor(invuln / 100) % 2 === 0;
    if (flash) return;
    drawSprite(COW, x, y);
    // 다리 (절차적 · 걷기 2프레임)
    ctx.fillStyle = PAL.D;
    const legTop = PLAYER_Y - 2 - bob;
    const swing = moving ? (Math.floor(player.phase * 2) % 2 === 0 ? 1 : -1) : 0;
    const lx = Math.round(player.x);
    ctx.fillRect(lx - 4, legTop, 2, 2 + (swing > 0 ? 0 : 1));
    ctx.fillRect(lx + 2, legTop, 2, 2 + (swing > 0 ? 1 : 0));
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
