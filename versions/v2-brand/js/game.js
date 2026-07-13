/* 사르르목장 · 젖소 똥피하기 (M1 + 브랜드 리뉴얼)
 * 플레이어 = 사르르목장 로고 젖소를 본뜬 캔버스 벡터 캐릭터(우유팩 모자·걷기 애니메이션).
 * 낙하물 = 브랜드 라인아트(우유팩·소프트콘·아이스크림컵 = 로고의 3요소) + 소똥.
 * 로그인/DB 없이 로컬 플레이. 랭킹·인증은 M2. (최고점 = localStorage)
 */
(() => {
  'use strict';

  const W = 360, H = 540;
  const GROUND = 70;
  const PLAYER_Y = H - GROUND - 4;

  // 브랜드 색
  const NAVY = '#385088';
  const NAVY_DEEP = '#2b3d68';
  const CREAM = '#fffdf6';
  const MILKW = '#ffffff';
  const BERRY = '#ef6f92';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  const el = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    lives: document.getElementById('lives'),
    start: document.getElementById('overlay-start'),
    over: document.getElementById('overlay-over'),
    finalScore: document.getElementById('final-score'),
    bestLine: document.getElementById('best-line'),
    overBadge: document.getElementById('over-badge'),
    overTitle: document.getElementById('over-title'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
  };

  const BEST_KEY = 'saruru.ddong.best';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  el.best.textContent = best;

  // 낙하물 종류 (good = 수집, poop = 회피)
  const KINDS = {
    poop: { r: 15, good: false, draw: drawPoop },
    milk: { r: 15, good: true, points: 5, draw: drawMilk },
    cone: { r: 16, good: true, points: 10, draw: drawCone },
    cup:  { r: 16, good: true, points: 15, draw: drawCup },
  };

  let state = 'ready';
  const player = { x: W / 2, w: 48, speed: 5.2, vx: 0, phase: 0, blink: 0, blinkTimer: 2 };
  let items = [];
  let particles = [];
  let score = 0;
  let lives = 3;
  let elapsed = 0;
  let spawnTimer = 0;
  let invuln = 0;
  let lastTime = 0;
  const input = { left: false, right: false, targetX: null };

  // ---- 입력 ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    else if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'ready' || state === 'over') startGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
  });

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

  // ---- 게임 흐름 ----
  function startGame() {
    state = 'playing';
    items = []; particles = [];
    score = 0; lives = 3; elapsed = 0; spawnTimer = 0; invuln = 0;
    player.x = W / 2; player.vx = 0;
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
    el.overBadge.textContent = newBest ? '🏆' : '🥛';
    el.overTitle.textContent = newBest ? '신기록!' : '또 도전!';
    el.bestLine.textContent = newBest ? '🎉 사르르목장 최고 기록 달성!' : '최고 ' + best + '점';
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
    const speed = 2.0 + elapsed * 0.07 + Math.random() * 1.4;
    items.push({
      kind, x: k.r + Math.random() * (W - k.r * 2), y: -24,
      vy: speed, r: k.r, good: k.good, points: k.points || 0,
      sway: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.04,
      rot: 0,
    });
  }

  function addParticles(x, y, color, n, txt) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y, color, txt: txt || null,
        vx: (Math.random() - 0.5) * 4.5, vy: -Math.random() * 4 - 1,
        r: 3 + Math.random() * 3, life: 1,
      });
    }
  }

  // ---- 업데이트 ----
  function update(dt) {
    if (state !== 'playing') return;
    const f = dt / 16.7;
    elapsed += dt / 1000;
    score += (dt / 1000) * 10;

    const prevX = player.x;
    if (input.targetX != null) {
      const d = input.targetX - player.x;
      player.x += Math.max(-player.speed * 1.6, Math.min(player.speed * 1.6, d));
    }
    if (input.left) player.x -= player.speed * f;
    if (input.right) player.x += player.speed * f;
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
    player.vx = player.x - prevX;
    const moving = Math.abs(player.vx) > 0.3;
    if (moving) player.phase += 0.35 * f;
    // 눈 깜빡임
    player.blinkTimer -= dt / 1000;
    if (player.blinkTimer <= 0) { player.blink = 0.12; player.blinkTimer = 2 + Math.random() * 2.5; }
    if (player.blink > 0) player.blink -= dt / 1000;

    const spawnInterval = Math.max(340, 900 - elapsed * 22);
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawn(); }

    if (invuln > 0) invuln -= dt;

    const hitY = PLAYER_Y - 30;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * f;
      it.sway += 0.05 * f;
      it.x += Math.sin(it.sway) * 0.3 * f;
      it.rot += it.spin * f;

      if (it.y > hitY && it.y < PLAYER_Y + 12) {
        if (Math.abs(it.x - player.x) < player.w / 2 + it.r * 0.6) {
          if (it.good) {
            score += it.points;
            addParticles(it.x, it.y - 6, BERRY, 1, '+' + it.points);
            addParticles(it.x, it.y, '#fff', 5);
          } else if (invuln <= 0) {
            lives -= 1;
            invuln = 1000;
            addParticles(player.x, PLAYER_Y - 24, '#8a5a2b', 7);
            if (lives <= 0) { items.splice(i, 1); updateHud(); gameOver(); return; }
          } else {
            continue;
          }
          items.splice(i, 1);
          updateHud();
          continue;
        }
      }
      if (it.y > H + 34) items.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= dt / 700;
      if (p.life <= 0) particles.splice(i, 1);
    }
    updateHud();
  }

  // ===================== 렌더 =====================
  function stroke(w) { ctx.lineWidth = w; ctx.strokeStyle = NAVY; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }

  function drawBackground() {
    // 하늘
    const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND);
    sky.addColorStop(0, '#e8f1fb');
    sky.addColorStop(1, '#f4f9ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H - GROUND);

    // 구름
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    cloud(64, 68, 1); cloud(272, 104, 0.8); cloud(180, 46, 0.6);

    // 초원 (절제된 세이지)
    const g = ctx.createLinearGradient(0, H - GROUND, 0, H);
    g.addColorStop(0, '#cfe6cf');
    g.addColorStop(1, '#bcdcb9');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - GROUND, W, GROUND);
    // 언덕 능선
    ctx.strokeStyle = 'rgba(120,170,120,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND + 3);
    for (let x = 0; x <= W; x += 30) ctx.lineTo(x, H - GROUND + 3 + Math.sin(x * 0.05) * 2);
    ctx.stroke();
  }
  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 15 * s, 0, 7); ctx.arc(x + 17 * s, y + 4, 19 * s, 0, 7);
    ctx.arc(x + 38 * s, y, 14 * s, 0, 7); ctx.arc(x + 19 * s, y - 8, 15 * s, 0, 7);
    ctx.fill();
  }

  // ---------- 사르르목장 젖소 (로고 스타일) ----------
  function drawCow(cx, cy, R, walkPhase, tilt, blink, moving) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    const lw = R * 0.15;

    // 다리 (걸을 때 교차)
    const legSwing = moving ? Math.sin(walkPhase) * R * 0.18 : 0;
    stroke(lw);
    for (const side of [-1, 1]) {
      const off = side * legSwing;
      ctx.beginPath();
      ctx.moveTo(side * R * 0.4, R * 0.72);
      ctx.lineTo(side * R * 0.4 + off, R * 1.02);
      ctx.stroke();
      // 발굽
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      ctx.arc(side * R * 0.4 + off, R * 1.04, lw * 0.75, 0, 7);
      ctx.fill();
    }

    // 몸통
    ctx.fillStyle = MILKW; stroke(lw);
    roundRect(-R * 0.62, R * 0.28, R * 1.24, R * 0.6, R * 0.28);
    ctx.fill(); ctx.stroke();
    // 몸통 점박이
    ctx.fillStyle = NAVY;
    blob(-R * 0.18, R * 0.5, R * 0.24, R * 0.16);

    // 뿔
    ctx.fillStyle = '#f0e2c8'; stroke(lw * 0.85);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * R * 0.34, -R * 0.86, R * 0.13, R * 0.2, side * 0.3, 0, 7);
      ctx.fill(); ctx.stroke();
    }

    // 귀
    ctx.fillStyle = MILKW; stroke(lw);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * R * 0.92, -R * 0.05);
      ctx.rotate(side * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.34, R * 0.2, 0, 0, 7);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // 얼굴 (흰 채움 + 네이비 라인)
    ctx.fillStyle = MILKW; stroke(lw);
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.12, R * 0.86, R * 0.9, 0, 0, 7);
    ctx.fill(); ctx.stroke();

    // 얼굴 점박이 (좌상단)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.12, R * 0.86, R * 0.9, 0, 0, 7);
    ctx.clip();
    ctx.fillStyle = NAVY;
    blob(-R * 0.42, -R * 0.34, R * 0.3, R * 0.24);
    ctx.restore();

    // 주둥이
    ctx.fillStyle = '#fbe7ea'; stroke(lw);
    roundRect(-R * 0.56, R * 0.12, R * 1.12, R * 0.62, R * 0.3);
    ctx.fill(); ctx.stroke();
    // 콧구멍
    ctx.fillStyle = NAVY;
    ctx.beginPath(); ctx.ellipse(-R * 0.2, R * 0.36, R * 0.09, R * 0.07, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R * 0.2, R * 0.36, R * 0.09, R * 0.07, 0, 0, 7); ctx.fill();
    // 웃는 입
    stroke(lw * 0.9);
    ctx.beginPath();
    ctx.arc(0, R * 0.42, R * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // 눈
    ctx.fillStyle = NAVY;
    if (blink > 0) {
      stroke(lw);
      ctx.beginPath(); ctx.moveTo(-R * 0.48, -R * 0.12); ctx.lineTo(-R * 0.24, -R * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R * 0.24, -R * 0.12); ctx.lineTo(R * 0.48, -R * 0.12); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(-R * 0.36, -R * 0.14, R * 0.11, R * 0.13, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(R * 0.36, -R * 0.14, R * 0.11, R * 0.13, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-R * 0.33, -R * 0.18, R * 0.035, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(R * 0.39, -R * 0.18, R * 0.035, 0, 7); ctx.fill();
    }

    // 머리 위 우유팩 (브랜드 · 걸을 때 살짝 흔들)
    ctx.save();
    ctx.translate(0, -R * 1.02);
    ctx.rotate(moving ? Math.sin(walkPhase) * 0.08 : 0);
    drawMilkCarton(0, 0, R * 0.5);
    ctx.restore();

    ctx.restore();
  }

  // ---------- 낙하물 (브랜드 라인아트) ----------
  function drawMilkCarton(cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    const lw = s * 0.16;
    ctx.fillStyle = MILKW; stroke(lw);
    // 몸통
    roundRect(-s * 0.55, -s * 0.5, s * 1.1, s * 1.15, s * 0.12);
    ctx.fill(); ctx.stroke();
    // 지붕
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.5);
    ctx.lineTo(0, -s * 0.9);
    ctx.lineTo(s * 0.55, -s * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 물방울 마크
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(0, s * 0.18, s * 0.2, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawMilk(cx, cy, s) { drawMilkCarton(cx, cy, s * 0.92); }

  function drawCone(cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    const lw = s * 0.15;
    // 콘
    ctx.fillStyle = '#f0dfc0'; stroke(lw);
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.05);
    ctx.lineTo(0, s * 0.95);
    ctx.lineTo(s * 0.42, -s * 0.05);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 와플 격자
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, s * 0.12); ctx.lineTo(s * 0.28, s * 0.12);
    ctx.moveTo(-s * 0.18, s * 0.42); ctx.lineTo(s * 0.18, s * 0.42);
    ctx.stroke();
    // 소프트 아이스크림
    ctx.fillStyle = MILKW; stroke(lw);
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.05);
    ctx.bezierCurveTo(-s * 0.55, -s * 0.7, s * 0.55, -s * 0.7, s * 0.5, -s * 0.05);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -s * 0.62, s * 0.24, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawCup(cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    const lw = s * 0.15;
    // 컵
    ctx.fillStyle = CREAM; stroke(lw);
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.05);
    ctx.lineTo(-s * 0.38, s * 0.75);
    ctx.lineTo(s * 0.38, s * 0.75);
    ctx.lineTo(s * 0.5, s * 0.05);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 아이스크림 두 스쿱
    ctx.fillStyle = MILKW;
    ctx.beginPath(); ctx.arc(-s * 0.18, -s * 0.08, s * 0.3, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.14, s * 0.32, 0, 7); ctx.fill(); ctx.stroke();
    // 딸기 토핑
    ctx.fillStyle = BERRY;
    ctx.beginPath(); ctx.arc(s * 0.16, -s * 0.42, s * 0.12, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawPoop(cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    const lw = s * 0.14;
    ctx.fillStyle = '#8a5a2b'; ctx.strokeStyle = '#5f3c1c';
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 3단 무더기
    ctx.beginPath(); ctx.ellipse(0, s * 0.55, s * 0.72, s * 0.3, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.5, s * 0.26, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -s * 0.22, s * 0.28, s * 0.2, 0, 0, 7); ctx.fill(); ctx.stroke();
    // 눈 (장난스럽게)
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.12, s * 0.12, s * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.12, s * 0.12, s * 0.11, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.arc(-s * 0.1, s * 0.14, s * 0.05, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.14, s * 0.14, s * 0.05, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- 도형 유틸 ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function blob(x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.3, 0, 7);
    ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      KINDS[it.kind].draw(0, 0, it.r);
      ctx.restore();
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.txt) {
        ctx.fillStyle = p.color;
        ctx.font = 'bold 18px Jua, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.txt, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (state === 'playing' || state === 'over') {
      const moving = Math.abs(player.vx) > 0.3 && state === 'playing';
      const bounce = moving ? Math.abs(Math.sin(player.phase)) * 4 : 0;
      const tilt = Math.max(-0.18, Math.min(0.18, player.vx * 0.03));
      const blink = state === 'over' ? 0 : player.blink;
      const flash = invuln > 0 && Math.floor(invuln / 100) % 2 === 0;
      if (!flash) drawCow(player.x, PLAYER_Y - 30 - bounce, 22, player.phase, tilt, blink, moving);
    }
  }

  function loop(now) {
    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    if (dt > 60) dt = 60;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  render();
  requestAnimationFrame(loop);
})();
