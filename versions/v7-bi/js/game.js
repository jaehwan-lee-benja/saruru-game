/* 사르르목장 · 젖소 똥피하기 v7 — 확정 BI 적용판
 *
 * 플레이어 = 사르르목장 BI 확정 마스코트 "얼굴 마크".
 *   대시보드 BI 원페이저(saruru-game-dashboard/brand/bi-onepager.html)의 얼굴 마크 생성기를
 *   그대로 이식했다. 좌표·팔레트·셰이딩 램프를 바꾸면 BI와 어긋난다 — 변경은 BI 원본 먼저.
 * 모자 3종(우유팩·소프트콘·스쿱) = BI 마스코트 라인업 → 캐릭터 선택 + 낙하 아이템 모티프.
 * 애니메이션 = BI 확정 스펙(눈깜박 + 모자 둥둥 3초 주기 1회 왕복).
 * 팔레트/그래픽 문법 = BI(NAVY #385088 · DEEP INK #26365e · SKY #bcccea · CREAM #fff6e6 · STRAWBERRY).
 *
 * 로그인/DB 없이 로컬 플레이. 랭킹·인증은 M2. (최고점 = localStorage)
 */
(() => {
  'use strict';

  // 얼굴 마크는 BI 픽셀 마스터라 축소가 금지된다(비정수 배율 금지).
  // 그래서 캐릭터를 줄이는 대신 "월드를 넓혔다" — 마스코트는 40px 그대로, 화면이 224px로
  // 넓어져 화면 점유가 25% → 18%로 내려가고 피할 여유가 생긴다.
  const VW = 224, VH = 336;
  const GROUND = 90;
  const HILL_TOP = VH - GROUND;  // 목초지(크림) 시작선 — 언덕은 이 위로만
  const PLAYER_Y = VH - 28;      // 마스코트 발밑 — 얼굴 마크 전체가 목초지 안에 들어온다

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
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    hatPick: document.getElementById('hat-pick'),
  };

  const BEST_KEY = 'saruru.ddong.best';
  const HAT_KEY = 'saruru.ddong.hat';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  el.best.textContent = best;

  // ===================================================================
  // BI 픽셀 생성기 — 대시보드 BI 원페이저에서 이식(원본과 동일해야 함)
  // ===================================================================
  const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
  const put = (g, r, c, str) => {
    for (let i = 0; i < str.length; i++) {
      const cc = c + i;
      if (g[r] && cc >= 0 && cc < g[r].length && str[i] !== '~') g[r][cc] = str[i];
    }
  };
  const disc = (g, cx, cy, rx, ry, ch) => {
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
      const dx = (c - cx) / rx, dy = (r - cy) / ry;
      if (dx * dx + dy * dy <= 1) g[r][c] = ch;
    }
  };
  // 소프트 셰이딩(광원 위쪽)
  const discShade = (g, cx, cy, rx, ry, ramp, over, lx, ly) => {
    const LX = (lx === undefined ? 0.4 : lx), LY = (ly === undefined ? 0.72 : ly);
    for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
      const dx = (c - cx) / rx, dy = (r - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 <= 1) {
        if (over && g[r][c] !== '.' && g[r][c] !== over) continue;
        const light = -(dx * LX + dy * LY);
        let v = light * 0.5 + 0.5;
        if (d2 > 0.7) v -= 0.3;
        if (d2 > 0.9) v -= 0.16;
        let idx = Math.floor((1 - v) * ramp.length);
        idx = Math.max(0, Math.min(ramp.length - 1, idx));
        g[r][c] = ramp[idx];
      }
    }
  };
  // 방향성 아웃라인(2~3톤) — BI 그래픽 문법(딥잉크 외곽선)
  const outlineDir = (g, fills, cx, cy, tri) => {
    const H = g.length, W = g[0].length, src = g.map(r => r.slice()), F = new Set(fills);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (src[r][c] === '.') {
        let adj = false;
        for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]])
          if (src[r + dd[0]] && F.has(src[r + dd[0]][c + dd[1]])) adj = true;
        if (adj) {
          const dirv = (c - cx) + (r - cy);
          g[r][c] = tri ? (dirv > 6 ? 'X' : dirv > -4 ? 'D' : 'L') : (dirv > 7 ? 'X' : 'D');
        }
      }
    }
  };
  const despeckle = (g) => {
    const H = g.length, W = g[0].length, src = g.map(r => r.slice());
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (src[r][c] !== '.') {
        let n = 0;
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (src[r + d[0]] && src[r + d[0]][c + d[1]] && src[r + d[0]][c + d[1]] !== '.') n++;
        if (n === 0) g[r][c] = '.';
      }
    }
  };
  const S = (g) => g.map(r => r.join(''));

  // BI 확정 팔레트 (원페이저 facePal과 동일)
  const PAL = {
    '.': null,
    X: '#1c2748', D: '#26365e', d: '#385088', L: '#5a72aa',   // 잉크·네이비
    W: '#ffffff', e: '#eff4fc', s: '#d6e0f1', S: '#bcccea',   // 흰·스카이 그림자 램프
    N: '#3f5896', n: '#2a3d6e',                                // 젖소 무늬 네이비
    c: '#fff6e6', y: '#f3e6c6', Y: '#e2cfa4',                  // 크림 램프
    p: '#ffd9e2', P: '#f4a9b8', Q: '#e07d94',                  // 핑크·스트로베리·베리
    K: '#26365e', H: '#ffffff',                                // 눈동자·글린트
    t: '#f4d9a2', u: '#dcb873',                                // 와플콘
    // 게임 전용(BI 팔레트와 조화되게 톤 맞춤)
    B: '#a8763f', b: '#754c26', h: '#c9975c',                  // 소똥
  };

  // --- 얼굴 마크 (BI 확정 마스코트) -------------------------------------
  function faceHeadG() {
    const g = blank(40, 42);
    discShade(g, 7, 16, 3.4, 4, ['W', 'e', 's', 'S'], null, 0.62, 0.62);      // 왼 귀
    discShade(g, 33, 17, 2.8, 3.4, ['W', 'e', 's', 'S'], null, 0.62, 0.62);   // 오른 귀
    discShade(g, 20, 23, 13, 12, ['W', 'W', 'e', 'e', 's', 's', 'S'], null, 0.62, 0.62); // 머리
    discShade(g, 26, 17, 3.3, 2.7, ['N', 'N', 'n'], null, 0.62, 0.62);        // 젖소 무늬
    discShade(g, 10, 27, 2.5, 1.9, ['N', 'N', 'n'], null, 0.62, 0.62);
    discShade(g, 20, 30, 5.5, 3.4, ['p', 'P', 'P', 'Q'], null, 0.62, 0.62);   // 주둥이
    return g;
  }
  function faceDetails(g) {
    disc(g, 15, 23, 1.8, 2.4, 'K'); disc(g, 25, 23, 1.7, 2.2, 'K');           // 눈
    put(g, 21, 14, 'H'); put(g, 21, 24, 'H'); put(g, 24, 15, 'L'); put(g, 24, 25, 'L'); // 글린트
    put(g, 29, 18, 'Q'); put(g, 29, 22, 'Q');                                  // 콧구멍
    put(g, 32, 17, 'Q'); put(g, 33, 18, 'Q'); put(g, 33, 19, 'Q');
    put(g, 33, 20, 'Q'); put(g, 33, 21, 'Q'); put(g, 32, 22, 'Q');             // 입
    disc(g, 10, 30, 1.9, 1.4, 'P'); disc(g, 30, 30, 1.9, 1.4, 'P');            // 볼터치
  }
  const FILLS = ['W', 'e', 's', 'S', 'c', 'y', 'Y', 'L', 'N', 'n', 'p', 'P', 'Q', 't', 'u'];
  function faceMark(kind) {
    const g = faceHeadG();
    if (kind && kind !== 'none') topping(g, kind, 20);
    outlineDir(g, FILLS, 20, 23, true);
    faceDetails(g); despeckle(g); return g;
  }
  function hatSprite(kind) {
    const g = blank(16, 12); topping(g, kind, 8);
    outlineDir(g, ['c', 'y', 'Y', 'W', 't', 'u'], 8, 6, false); despeckle(g); return g;
  }
  // 모자 3종 = 우유팩 · 소프트콘 · 스쿱 (BI 마스코트 라인업)
  function topping(g, kind, cx) {
    if (kind === 'milk') {
      put(g, 0, cx - 2, 'cccc'); put(g, 1, cx - 3, 'cccccc');
      for (let r = 2; r < 10; r++) for (let c = cx - 4; c < cx + 4; c++) g[r][c] = 'c';
      for (let r = 2; r < 10; r++) { g[r][cx - 4] = 'W'; g[r][cx + 3] = 'Y'; }
      for (let c = cx - 2; c < cx + 2; c++) { g[4][c] = 'L'; g[5][c] = 'L'; }
    } else if (kind === 'cone') {
      discShade(g, cx, 3, 3.4, 3, ['W', 'W', 'e', 's']); put(g, 0, cx - 1, 'WW');
      for (let r = 7; r < 11; r++) {
        const w = Math.max(1, 10 - r);
        for (let c = cx - w; c <= cx + w; c++) g[r][c] = ((c - cx + r) % 3 === 0) ? 'u' : 't';
      }
    } else {
      discShade(g, cx, 3, 3.8, 3.4, ['W', 'c', 'c', 'y', 'Y']); put(g, 1, cx - 2, 'WW');
    }
  }

  // --- 낙하 아이템 = 2단계뿐 (BI 모자 모티프 · 같은 그래픽 문법) -------------
  //   tier0 우유팩  = 작고 수수한 크림/네이비 · 5점 · 반짝임 없음
  //   tier1 딸기스쿱 = 확 크고 화려한 딸기핑크 · 20점 · 반짝임 + 진동
  //   두 등급의 값어치가 크기·색·반짝임으로 한눈에 갈리게 한 것이 요점.
  function milkItem() { // tier0 — 우유팩
    const g = blank(14, 18);
    put(g, 0, 5, 'cccc'); put(g, 1, 4, 'cccccc');
    for (let r = 2; r < 17; r++) for (let c = 2; c < 12; c++) g[r][c] = 'c';
    for (let r = 2; r < 17; r++) { g[r][2] = 'W'; g[r][3] = 'W'; g[r][10] = 'y'; g[r][11] = 'Y'; }
    // 라벨 = 네이비 밴드(BI 모자의 우유팩과 동일 문법 — 작은 마크는 이 크기에서 뭉개진다)
    for (let r = 7; r < 11; r++) for (let c = 2; c < 12; c++) g[r][c] = 'L';
    outlineDir(g, ['c', 'y', 'Y', 'W', 'L'], 7, 9, false); despeckle(g); return g;
  }
  function scoopItem() { // tier1 — 딸기 선데이(최고득점) · 우유팩보다 확실히 크게
    const g = blank(24, 30);
    discShade(g, 12, 9, 9.5, 8.5, ['p', 'P', 'P', 'Q', 'Q']);                   // 큼직한 딸기 스쿱
    discShade(g, 12, 4, 4.5, 3, ['W', 'p', 'P']);                               // 위쪽 하이라이트
    put(g, 1, 11, 'WW');
    for (let r = 17; r < 28; r++) for (let c = 4; c < 20; c++) g[r][c] = 'c';   // 크림 컵
    for (let r = 17; r < 28; r++) { g[r][4] = 'W'; g[r][5] = 'W'; g[r][18] = 'y'; g[r][19] = 'Y'; }
    for (let r = 19; r < 23; r++) for (let c = 4; c < 20; c++) g[r][c] = 'L';   // 네이비 밴드
    outlineDir(g, ['p', 'P', 'Q', 'c', 'y', 'Y', 'W', 'L'], 12, 14, false); despeckle(g); return g;
  }
  function poopItem() { // 장애물 — 능글맞지만 미워할 수 없게
    const g = blank(19, 18);
    discShade(g, 9, 13, 8.8, 4.4, ['h', 'B', 'B', 'b']);
    discShade(g, 9, 8, 5.8, 3.8, ['h', 'B', 'B', 'b']);
    discShade(g, 9, 4, 3.3, 2.6, ['h', 'B', 'b']);
    disc(g, 6.5, 9, 1.4, 1.8, 'W'); disc(g, 11.5, 9, 1.4, 1.8, 'W');            // 눈 흰자
    put(g, 9, 6, 'K'); put(g, 9, 12, 'K');
    put(g, 13, 8, 'KKK');                                                        // 입
    outlineDir(g, ['B', 'b', 'h'], 9, 10, false); despeckle(g); return g;
  }

  const CLOUD = [
    '......WWWWWWWW......',
    '...WWWWWWWWWWWWWW...',
    '..WWWWWWWWWWWWWWWW..',
    '.WWWWWWWWWWWWWWWWWW.',
    'WWWWWWWWWWWWWWWWWWWW',
    'WWWWWWeeeeeessssssWW',
  ];

  // ===== 스프라이트 생성(로드 시 1회) =====
  const HATS = ['milk', 'cone', 'scoop'];
  const HAT_NAME = { milk: '우유팩', cone: '소프트콘', scoop: '스쿱' };
  const HEAD_SP = S(faceMark('none'));                 // 얼굴(모자 없음)
  const HAT_SP = {}; HATS.forEach(k => { HAT_SP[k] = S(hatSprite(k)); });
  const FACE_SP = {}; HATS.forEach(k => { FACE_SP[k] = S(faceMark(k)); }); // 정지컷(선택 UI용)
  const ITEM_SP = { milk: S(milkItem()), scoop: S(scoopItem()), poop: S(poopItem()) };

  const sizeOf = (sp) => ({ w: Math.max(...sp.map(r => r.length)), h: sp.length });

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

  // ===== 사운드 (8bit WebAudio 합성) + 햅틱 + 음소거 =====
  const MUTE_KEY = 'saruru.muted';
  let muted = localStorage.getItem(MUTE_KEY) === '1';
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function blip(freq, dur, type, vol, when) {
    const a = audio(); if (!a || muted) return;
    const t0 = a.currentTime + (when || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function slide(f1, f2, dur, type, vol) {
    const a = audio(); if (!a || muted) return;
    const t0 = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f1, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol) {
    const a = audio(); if (!a || muted) return;
    const t0 = a.currentTime, n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain(); g.gain.value = vol || 0.15;
    src.connect(g); g.connect(a.destination); src.start(t0);
  }
  function vibe(pattern) {
    if (!muted && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }
  const SFX = {
    // tier0 = 짧은 단음 / tier1 = 3음 아르페지오 + 진동(값어치가 손끝에도 느껴지게)
    collect(tier) {
      const base = tier ? 880 : 660;
      blip(base, 0.09, 'square', 0.16);
      if (tier >= 1) {
        blip(base * 1.5, 0.08, 'square', 0.14, 0.06);
        blip(base * 2, 0.10, 'square', 0.13, 0.12);
        vibe(22);
      }
    },
    hit() { noise(0.18, 0.2); slide(300, 80, 0.24, 'sawtooth', 0.16); vibe([0, 70, 40, 70]); },
    over() {
      blip(392, 0.14, 'square', 0.16); blip(311, 0.14, 'square', 0.16, 0.15);
      blip(262, 0.24, 'square', 0.16, 0.3); slide(220, 110, 0.5, 'triangle', 0.12);
      vibe([0, 90, 50, 130]);
    },
    start() { blip(523, 0.09, 'square', 0.15); blip(659, 0.09, 'square', 0.15, 0.09); blip(784, 0.13, 'square', 0.15, 0.18); },
    pick() { blip(880, 0.06, 'square', 0.12); },
  };
  function setMute(m) {
    muted = m; localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (el.btnMute) { el.btnMute.textContent = m ? '🔇' : '🔊'; el.btnMute.classList.toggle('muted', m); }
  }
  if (el.btnMute) {
    setMute(muted);
    el.btnMute.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const willMute = !muted; setMute(willMute);
      if (!willMute) { audio(); SFX.start(); }
    });
  }

  // ===== 낙하물 = 똥 + 점수 2단계뿐 (등급차가 크기·색·반짝임·점수로 드러난다) =====
  const KINDS = {
    poop:  { sp: ITEM_SP.poop,  good: false, tier: -1 },
    milk:  { sp: ITEM_SP.milk,  good: true, points: 5,  tier: 0, glow: '#eff4fc' },
    scoop: { sp: ITEM_SP.scoop, good: true, points: 20, tier: 1, glow: '#ffd9e2' },
  };

  // ===== 상태 =====
  let state = 'ready';
  let hat = localStorage.getItem(HAT_KEY);
  if (HATS.indexOf(hat) < 0) hat = 'milk';
  const player = { x: VW / 2, w: 26, speed: 3.1, vx: 0 };  // w=26 = 얼굴 코어(40px 전체 아님)
  let items = [];
  let sparks = [];
  let score = 0, lives = 3, elapsed = 0, spawnTimer = 0, invuln = 0, lastTime = 0;
  const clouds = [{ x: 34, y: 42, s: 0.11 }, { x: 134, y: 22, s: 0.07 }, { x: 196, y: 64, s: 0.09 }];
  const input = { left: false, right: false, targetX: null };

  // ===== 모자(캐릭터) 선택 — BI 마스코트 라인업 =====
  function buildHatPicker() {
    if (!el.hatPick) return;
    el.hatPick.innerHTML = '';
    HATS.forEach(k => {
      const b = document.createElement('button');
      b.className = 'hat-btn' + (k === hat ? ' on' : '');
      b.type = 'button';
      b.setAttribute('aria-label', HAT_NAME[k]);
      const sp = FACE_SP[k], sz = sizeOf(sp);
      const cv = document.createElement('canvas');
      cv.width = sz.w; cv.height = sz.h;
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      for (let r = 0; r < sp.length; r++) for (let c = 0; c < sp[r].length; c++) {
        const col = PAL[sp[r][c]];
        if (col) { x.fillStyle = col; x.fillRect(c, r, 1, 1); }
      }
      b.appendChild(cv);
      const n = document.createElement('span'); n.textContent = HAT_NAME[k]; b.appendChild(n);
      b.addEventListener('click', () => {
        hat = k; localStorage.setItem(HAT_KEY, k);
        [...el.hatPick.children].forEach(ch => ch.classList.remove('on'));
        b.classList.add('on');
        SFX.pick();
      });
      el.hatPick.appendChild(b);
    });
  }
  buildHatPicker();

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
  function toVX(clientX) {
    const r = canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * VW;
  }
  function onPointer(e) {
    if (state !== 'playing') return;
    const t = e.touches ? e.touches[0] : e;
    if (!t) return;
    input.targetX = toVX(t.clientX);
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
    score = 0; lives = 3; spawnTimer = 0; invuln = 0;
    player.x = VW / 2; player.vx = 0;
    input.targetX = null;
    el.start.classList.add('hidden');
    el.over.classList.add('hidden');
    flashT = 0;
    SFX.start();
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
    SFX.over();
  }
  function updateHud() {
    el.score.textContent = Math.floor(score);
    el.lives.textContent = '♥'.repeat(Math.max(0, lives)) || '·';
  }

  function spawn() {
    const roll = Math.random();
    let kind;
    if (roll < 0.12) kind = 'scoop';        // 귀함 = 20점
    else if (roll < 0.46) kind = 'milk';    // 흔함 = 5점
    else kind = 'poop';
    const k = KINDS[kind];
    const sz = sizeOf(k.sp);
    const speed = 0.85 + playT * 0.025 + Math.random() * 0.6;
    items.push({
      kind, sp: k.sp, good: k.good, points: k.points || 0, tier: k.tier, glow: k.glow,
      w: sz.w, h: sz.h,
      x: 5 + Math.random() * (VW - sz.w - 10), y: -sz.h,
      vy: speed, sway: Math.random() * 6.28, swayA: 0.15 + Math.random() * 0.2,
      tw: Math.random() * 6.28,
    });
  }
  function burst(x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + Math.random() * 0.5;
      const sp = (spread || 1) * (0.5 + Math.random() * 0.9);
      sparks.push({
        x, y, color, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4,
        life: 1, star: Math.random() < 0.5,
      });
    }
  }
  function addPopup(x, y, txt, color, big) {
    sparks.push({ x, y, txt, color, vx: 0, vy: -0.55, life: 1.3, big });
  }
  let flashT = 0, flashMax = 1, flashCol = '#ffffff';
  function flash(color, amt) { flashCol = color || '#ffffff'; flashT = amt || 0.15; flashMax = flashT; }

  // ===== 업데이트 =====
  let playT = 0;   // 플레이 경과(난이도) — elapsed는 애니용(대기 중에도 흐름)
  function update(dt) {
    for (const cl of clouds) {
      cl.x += cl.s * (dt / 16.7);
      if (cl.x > VW + 10) cl.x = -16;
    }
    // 플래시 감쇠는 상태와 무관하게 — 게임오버 순간의 피격 플래시가 화면에 영구히 남지 않도록
    if (flashT > 0) flashT -= dt / 1000 * 2.4;
    if (state !== 'playing') return;
    const f = dt / 16.7;
    playT += dt / 1000;
    score += (dt / 1000) * 10;

    const prev = player.x;
    if (input.targetX != null) {
      const d = input.targetX - player.x;
      player.x += Math.max(-player.speed * 1.7, Math.min(player.speed * 1.7, d));
    }
    if (input.left) player.x -= player.speed * f;
    if (input.right) player.x += player.speed * f;
    player.x = Math.max(player.w / 2 + 2, Math.min(VW - player.w / 2 - 2, player.x));
    player.vx = player.x - prev;

    const spawnInterval = Math.max(320, 880 - playT * 22);
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawn(); }
    if (invuln > 0) invuln -= dt;

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * f;
      it.sway += 0.08 * f;
      const cx = it.x + it.w / 2 + Math.sin(it.sway) * it.swayA;
      const cy = it.y + it.h / 2;
      // 얼굴 마크(머리)와 충돌
      if (cy > PLAYER_Y - 34 && cy < PLAYER_Y + 2 && Math.abs(cx - player.x) < player.w / 2 + it.w / 2 - 3) {
        if (it.good) {
          score += it.points;
          const t = it.tier;
          addPopup(cx, PLAYER_Y - 48, '+' + it.points, t ? '#e07d94' : '#385088', t >= 1);
          burst(cx, cy, it.glow || '#ffffff', 6 + t * 10, 0.8 + t * 0.8);
          burst(cx, cy, '#ffffff', 3 + t * 5, 0.5);
          flash(it.glow, 0.10 + t * 0.12);
          SFX.collect(t);
        } else if (invuln <= 0) {
          lives -= 1; invuln = 1000;
          burst(player.x, PLAYER_Y - 22, '#a8763f', 9, 1.1);
          flash('#e07d94', 0.24);
          SFX.hit();
          if (lives <= 0) { items.splice(i, 1); updateHud(); gameOver(); return; }
        } else { continue; }
        items.splice(i, 1); updateHud(); continue;
      }
      if (it.y > VH + 4) items.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy;
      if (!s.txt) { s.vy += 0.07; s.vx *= 0.96; }
      s.life -= dt / (s.txt ? 900 : 700);
      if (s.life <= 0) sparks.splice(i, 1);
    }
    updateHud();
  }

  // ===== 렌더 =====
  // BI 배경 문법: 옅은 스카이 하늘 → 스카이 언덕 → 크림 목초지 + 딥잉크 룰 + 브랜드 도트
  // (BI 팔레트에 그린이 없다 — 초원은 CREAM 지면 + 브랜드 도트로 표현한다.)
  // 밴드 경계를 체커 디더로 풀어 수평선처럼 딱 끊기지 않게
  function dither(y, color) {
    ctx.fillStyle = color;
    for (let x = 0; x < VW; x += 2) ctx.fillRect(x, y, 1, 1);
    for (let x = 1; x < VW; x += 2) ctx.fillRect(x, y + 1, 1, 1);
  }
  function drawBackground() {
    const hillTop = HILL_TOP;
    // 대기 원근: 위가 진한 SKY → 지평선이 밝게. (흰·크림 아이템이 낙하 중 대비를 얻는다)
    ctx.fillStyle = '#dfe7f6'; ctx.fillRect(0, 0, VW, hillTop);
    ctx.fillStyle = '#cbd8ee'; ctx.fillRect(0, 0, VW, 170);
    ctx.fillStyle = '#bcccea'; ctx.fillRect(0, 0, VW, 100);
    dither(100, '#cbd8ee'); dither(102, '#cbd8ee');
    dither(170, '#dfe7f6'); dither(172, '#dfe7f6');
    for (const cl of clouds) drawSprite(CLOUD, cl.x, cl.y);
    // 원경 언덕 2겹 (뒤 → 앞으로 진해짐)
    ctx.fillStyle = '#a7bce2';
    for (let x = 0; x < VW; x++) {
      const h = 28 + Math.round(13 * Math.sin(x * 0.025 + 1.5) + 7 * Math.sin(x * 0.065));
      ctx.fillRect(x, hillTop - h, 1, h);
    }
    ctx.fillStyle = '#8fa8d4';
    for (let x = 0; x < VW; x++) {
      const h = 14 + Math.round(8 * Math.sin(x * 0.043 + 3.2));
      ctx.fillRect(x, hillTop - h, 1, h);
    }
    // 목초지 = CREAM + 딥잉크 룰 + 점선 룰(BI 그래픽 문법)
    ctx.fillStyle = '#fff6e6'; ctx.fillRect(0, hillTop, VW, GROUND);
    ctx.fillStyle = '#26365e'; ctx.fillRect(0, hillTop, VW, 3);
    ctx.fillStyle = '#385088';
    for (let x = 0; x < VW; x += 6) ctx.fillRect(x, hillTop + 7, 3, 1);
    // 브랜드 도트 패턴 (크림 위 스트로베리·스카이 도트) — 원근감 위해 아래로 갈수록 넓게
    for (let row = 0; row < 6; row++) {
      const yy = hillTop + 15 + row * 11;
      const step = 20 + row * 3;
      for (let x = 4 + (row % 2 ? step / 2 : 0); x < VW; x += step) {
        const alt = (row + ((x / step) | 0)) % 2;
        ctx.fillStyle = alt ? '#f4a9b8' : '#bcccea';
        ctx.fillRect(Math.round(x), yy, 2, 2);
      }
    }
  }

  // 플레이어 = BI 얼굴 마크. 이동 시 통통 튀고, 모자는 BI 스펙대로 둥둥(3초 1회 왕복).
  function drawPlayer() {
    const flicker = invuln > 0 && Math.floor(invuln / 100) % 2 === 0;
    if (flicker) return;
    const moving = Math.abs(player.vx) > 0.15 && state === 'playing';
    const sz = sizeOf(HEAD_SP);
    const hop = moving
      ? Math.round(Math.abs(Math.sin(elapsed * 11)) * 3)
      : Math.round(Math.abs(Math.sin(elapsed * 2.2)));
    const x = player.x - sz.w / 2;
    const y = PLAYER_Y - sz.h - hop;
    // 접지 그림자 — 3단 타원형(홉 높이만큼 작아짐)
    const sw = 12 - hop;
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#385088';
    ctx.fillRect(Math.round(player.x) - sw, PLAYER_Y - 2, sw * 2, 1);
    ctx.fillRect(Math.round(player.x) - sw + 2, PLAYER_Y - 3, sw * 2 - 4, 3);
    ctx.globalAlpha = 1;
    drawSprite(HEAD_SP, x, y);
    // 모자 둥둥 — BI 확정 애니 스펙(3초 주기: 앞 1.2초 위아래 1회 왕복 후 정지)
    const hsp = HAT_SP[hat], hw = sizeOf(hsp).w;
    const ph = elapsed % 3.0;
    const bob = (ph < 1.2 ? -Math.round(Math.sin(ph / 1.2 * Math.PI) * 2) : 0) - 1;
    drawSprite(hsp, Math.round(x + (sz.w - hw) / 2), y + bob);
    // 눈깜박 — BI 확정 스펙(3초 주기 0.13초)
    if (ph < 0.13) {
      const bx = Math.round(x), by = Math.round(y);
      ctx.fillStyle = PAL.W;
      ctx.fillRect(bx + 13, by + 21, 5, 5); ctx.fillRect(bx + 23, by + 21, 5, 5);
      ctx.fillStyle = PAL.D;
      ctx.fillRect(bx + 14, by + 23, 3, 1); ctx.fillRect(bx + 24, by + 23, 3, 1);
    }
  }

  function drawTwinkle(it) {
    if (!it.good || it.tier < 1) return;
    const ph = it.tw + elapsed * 4;
    const n = it.tier;
    for (let k = 0; k <= n; k++) {
      const tw = Math.sin(ph + k * 2.1);
      if (tw < 0.3) continue;
      const cxp = Math.round(it.x + (k === 0 ? it.w - 2 : 1) + Math.sin(it.sway) * it.swayA);
      const cyp = Math.round(it.y + (k === 0 ? 1 : it.h - 3));
      ctx.globalAlpha = Math.min(1, (tw - 0.3) / 0.7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cxp, cyp, 1, 1);
      if (tw > 0.7) {
        ctx.fillRect(cxp - 1, cyp, 1, 1); ctx.fillRect(cxp + 1, cyp, 1, 1);
        ctx.fillRect(cxp, cyp - 1, 1, 1); ctx.fillRect(cxp, cyp + 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.clearRect(0, 0, VW, VH);
    drawBackground();
    for (const it of items) {
      drawSprite(it.sp, it.x + Math.sin(it.sway) * it.swayA, it.y);
      drawTwinkle(it);
    }
    drawPlayer();
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
      if (s.txt) {
        ctx.fillStyle = s.color;
        ctx.font = (s.big ? '11px' : '9px') + " Galmuri11, monospace";
        ctx.textAlign = 'center';
        ctx.fillText(s.txt, s.x, s.y);
      } else {
        const px = Math.round(s.x), py = Math.round(s.y);
        ctx.fillStyle = s.color;
        ctx.fillRect(px, py, 1, 1);
        if (s.star && s.life > 0.5) {
          ctx.fillRect(px - 1, py, 1, 1); ctx.fillRect(px + 1, py, 1, 1);
          ctx.fillRect(px, py - 1, 1, 1); ctx.fillRect(px, py + 1, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
    if (flashT > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(0.5, (flashT / flashMax) * 0.5));
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
  }

  // 아트 검수·대시보드 프리뷰용 — 생성된 BI 스프라이트를 그대로 노출(읽기 전용 용도)
  window.SaruruGameArt = { PAL, HEAD_SP, HAT_SP, FACE_SP, ITEM_SP };

  function loop(now) {
    if (!lastTime) lastTime = now;
    let dt = Math.max(0, now - lastTime); lastTime = now;
    if (dt > 60) dt = 60;
    elapsed += dt / 1000;   // 애니 시계(대기 화면에서도 마스코트는 살아 있음)
    update(dt); render();
    requestAnimationFrame(loop);
  }
  render();
  requestAnimationFrame(loop);
})();
