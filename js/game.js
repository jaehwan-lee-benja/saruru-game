/* 사르르목장 · 똥피하기 (M1)
 * 로그인/DB 없이 로컬에서 즐기는 캔버스 캐주얼 게임.
 * 랭킹·인증은 M2에서 추가 예정. (점수 = localStorage 최고점만 저장)
 */
(() => {
  'use strict';

  const W = 360, H = 540;            // 논리 좌표(캔버스 내부 해상도)
  const GROUND = 64;                 // 초원 높이
  const PLAYER_Y = H - GROUND - 6;   // 플레이어 발 위치

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // 고해상도 렌더링(레티나 대응)
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  // ---- DOM ----
  const el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    lives: document.getElementById('lives'),
    start: document.getElementById('overlay-start'),
    over: document.getElementById('overlay-over'),
    finalScore: document.getElementById('final-score'),
    bestLine: document.getElementById('best-line'),
    overEmoji: document.getElementById('over-emoji'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
  };

  const BEST_KEY = 'saruru.ddong.best';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  el.best.textContent = best;

  // ---- 아이템 종류 ----
  const KINDS = {
    poop:   { emoji: '💩', r: 16, good: false },
    milk:   { emoji: '🥛', r: 15, good: true, points: 5 },
    clover: { emoji: '🍀', r: 15, good: true, points: 15 },
  };

  // ---- 게임 상태 ----
  let state = 'ready';   // ready | playing | over
  const player = { x: W / 2, w: 42, speed: 5.2 };
  let items = [];
  let particles = [];
  let score = 0;
  let lives = 3;
  let elapsed = 0;       // 초
  let spawnTimer = 0;
  let invuln = 0;        // 피격 후 무적(ms)
  let lastTime = 0;

  const input = { left: false, right: false, targetX: null };

  // ---- 입력: 키보드 ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    else if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'ready') startGame();
      else if (state === 'over') startGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
  });

  // ---- 입력: 터치/드래그 (캔버스 위) ----
  function canvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }
  function onPointer(e) {
    if (state !== 'playing') return;
    const t = e.touches ? e.touches[0] : e;
    if (!t) return;
    input.targetX = canvasX(t.clientX);
    e.preventDefault();
  }
  canvas.addEventListener('touchstart', onPointer, { passive: false });
  canvas.addEventListener('touchmove', onPointer, { passive: false });
  canvas.addEventListener('touchend', () => { input.targetX = null; });
  canvas.addEventListener('mousedown', (e) => { canvas._drag = true; onPointer(e); });
  window.addEventListener('mousemove', (e) => { if (canvas._drag) onPointer(e); });
  window.addEventListener('mouseup', () => { canvas._drag = false; input.targetX = null; });

  // ---- 입력: 하단 버튼 패드 ----
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

  // ---- 게임 시작/종료 ----
  function startGame() {
    state = 'playing';
    items = [];
    particles = [];
    score = 0;
    lives = 3;
    elapsed = 0;
    spawnTimer = 0;
    invuln = 0;
    player.x = W / 2;
    input.targetX = null;
    el.start.classList.add('hidden');
    el.over.classList.add('hidden');
    updateHud();
  }

  function gameOver() {
    state = 'over';
    const finalScore = Math.floor(score);
    const newBest = finalScore > best;
    if (newBest) {
      best = finalScore;
      localStorage.setItem(BEST_KEY, String(best));
      el.best.textContent = best;
    }
    el.finalScore.textContent = finalScore;
    el.overEmoji.textContent = newBest ? '🏆🐄' : '🐄💫';
    el.bestLine.textContent = newBest
      ? '🎉 신기록 달성!'
      : '최고 ' + best + '점';
    el.over.classList.remove('hidden');
  }

  function updateHud() {
    el.score.textContent = Math.floor(score);
    el.lives.textContent = '❤️'.repeat(Math.max(0, lives)) || '💀';
  }

  // ---- 스폰 ----
  function spawn() {
    // 난이도: 시간이 지날수록 똥 비중↑
    const roll = Math.random();
    let kind;
    if (roll < 0.16) kind = 'clover';
    else if (roll < 0.42) kind = 'milk';
    else kind = 'poop';
    const k = KINDS[kind];
    const speed = 2.0 + elapsed * 0.07 + Math.random() * 1.4;
    items.push({
      kind, x: k.r + Math.random() * (W - k.r * 2), y: -20,
      vy: speed, r: k.r, emoji: k.emoji, good: k.good, points: k.points || 0,
      sway: Math.random() * Math.PI * 2,
    });
  }

  function addParticles(x, y, emoji, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y, emoji,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4 - 1,
        life: 1,
      });
    }
  }

  // ---- 업데이트 ----
  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt / 1000;
    score += (dt / 1000) * 10; // 생존 점수(초당 ~10). float 누적 → 표시 시 내림

    // 플레이어 이동
    if (input.targetX != null) {
      const d = input.targetX - player.x;
      player.x += Math.max(-player.speed * 1.6, Math.min(player.speed * 1.6, d));
    }
    if (input.left) player.x -= player.speed;
    if (input.right) player.x += player.speed;
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));

    // 스폰 주기(점점 빨라짐)
    const spawnInterval = Math.max(340, 900 - elapsed * 22);
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawn(); }

    if (invuln > 0) invuln -= dt;

    // 아이템 이동 + 충돌
    const hitY = PLAYER_Y - 26;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * (dt / 16.7);
      it.sway += 0.05;
      it.x += Math.sin(it.sway) * 0.3;

      // 플레이어와 충돌?
      if (it.y > hitY && it.y < PLAYER_Y + 10) {
        if (Math.abs(it.x - player.x) < player.w / 2 + it.r * 0.6) {
          if (it.good) {
            score += it.points;
            addParticles(it.x, it.y, it.kind === 'clover' ? '✨' : '🥛', 5);
          } else if (invuln <= 0) {
            lives -= 1;
            invuln = 1000;
            addParticles(player.x, PLAYER_Y - 20, '💥', 6);
            if (lives <= 0) { items.splice(i, 1); updateHud(); gameOver(); return; }
          } else {
            continue; // 무적 중 똥은 통과
          }
          items.splice(i, 1);
          updateHud();
          continue;
        }
      }
      if (it.y > H + 30) items.splice(i, 1);
    }

    // 파티클
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= dt / 700;
      if (p.life <= 0) particles.splice(i, 1);
    }

    updateHud();
  }

  // ---- 렌더 ----
  function drawBackground() {
    // 하늘
    const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND);
    sky.addColorStop(0, '#bfe6ff');
    sky.addColorStop(1, '#e6f7ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H - GROUND);

    // 구름
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    cloud(60, 70, 1); cloud(270, 110, 0.8); cloud(180, 50, 0.6);

    // 초원
    const g = ctx.createLinearGradient(0, H - GROUND, 0, H);
    g.addColorStop(0, '#a8e063');
    g.addColorStop(1, '#8fce4e');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - GROUND, W, GROUND);
    // 잔디 결
    ctx.strokeStyle = 'rgba(120,180,60,0.5)';
    ctx.lineWidth = 2;
    for (let x = 8; x < W; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, H - GROUND + 8);
      ctx.lineTo(x - 3, H - GROUND);
      ctx.stroke();
    }
  }
  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, 7); ctx.arc(x + 18 * s, y + 4, 20 * s, 0, 7);
    ctx.arc(x + 40 * s, y, 15 * s, 0, 7); ctx.arc(x + 20 * s, y - 8, 16 * s, 0, 7);
    ctx.fill();
  }

  function drawEmoji(emoji, x, y, size) {
    ctx.font = size + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    // 아이템
    for (const it of items) drawEmoji(it.emoji, it.x, it.y, it.r * 2);

    // 파티클
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      drawEmoji(p.emoji, p.x, p.y, 18);
    }
    ctx.globalAlpha = 1;

    // 플레이어(피격 무적 중 깜빡)
    if (state === 'playing' || state === 'over') {
      const blink = invuln > 0 && Math.floor(invuln / 100) % 2 === 0;
      if (!blink) {
        drawEmoji('🐄', player.x, PLAYER_Y - 16, 40);
      }
    }
  }

  // ---- 루프 ----
  function loop(now) {
    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    if (dt > 60) dt = 60; // 탭 전환 등으로 큰 점프 방지
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // 첫 화면 배경 한 번 그리기
  render();
  requestAnimationFrame(loop);
})();
