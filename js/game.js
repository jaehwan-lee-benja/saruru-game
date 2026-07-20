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
    btnPause: document.getElementById('btn-pause'),
    btnResume: document.getElementById('btn-resume'),
    pause: document.getElementById('overlay-pause'),
    welcome: document.getElementById('overlay-welcome'),
    welcomeFace: document.getElementById('welcome-face'),
    hatPick: document.getElementById('hat-pick'),
    pad: document.getElementById('pad'),
  };

  const GAME_KEY = (window.SARURU && window.SARURU.gameKey) || 'ddong';  // dev면 ddong_dev(랭킹/통계 격리)
  const BEST_KEY = 'saruru.' + GAME_KEY + '.best';
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
    V: '#8698bd', v: '#63749d',                                // 목장 건물 지붕(연한 슬레이트블루 · 벽과 대조 완화)
    A: '#e9ddc2', a: '#cfc0a0', z: '#b3a486',                  // 목장 건물 벽(베이지 벽돌 · 정면/측면/줄눈)
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
  //   tier0 유리 우유병 = 작고 수수한 흰/스카이 유리 · 5점 · 반짝임 없음
  //   tier1 소프트콘    = 확 크고 화려한 스월 + 와플콘 + 딸기 · 20점 · 반짝임 + 진동
  //   두 등급의 값어치가 크기·색·반짝임으로 한눈에 갈리게 한 것이 요점.
  function milkItem() { // tier0 — 유리 우유병(목장 우유병)
    const g = blank(14, 21);
    // 네이비 뚜껑 + 목테
    for (let r = 0; r < 3; r++) for (let c = 5; c < 9; c++) g[r][c] = 'L';
    for (let c = 4; c < 10; c++) g[3][c] = 'L';
    // 목 → 어깨 → 몸통 (유리병 실루엣)
    for (let r = 4; r < 7; r++) for (let c = 5; c < 9; c++) g[r][c] = 'W';
    for (let c = 4; c < 10; c++) g[7][c] = 'W';
    for (let c = 3; c < 11; c++) g[8][c] = 'W';
    for (let r = 9; r < 20; r++) for (let c = 2; c < 12; c++) g[r][c] = 'W';
    // 유리 = 우유 위 빈 공간(스카이 톤) + 오른쪽 유리 그림자 + 왼쪽 하이라이트
    for (let r = 4; r < 9; r++) for (let c = 5; c < 9; c++) g[r][c] = 's';
    for (let r = 9; r < 11; r++) for (let c = 3; c < 11; c++) g[r][c] = 's';
    for (let r = 9; r < 20; r++) { g[r][10] = 's'; g[r][11] = 'S'; }
    for (let r = 11; r < 19; r++) g[r][3] = 'W';
    outlineDir(g, ['W', 's', 'S', 'L'], 7, 11, false); despeckle(g); return g;
  }
  function scoopItem() { // tier1 — 소프트콘 아이스크림(최고득점) · 우유병과 같은 크기
    const g = blank(14, 21);
    // 소프트서브 스월 = 위로 갈수록 작아지는 디스크 3단
    discShade(g, 7, 8, 5, 3.4, ['W', 'W', 'e', 's', 'S']);
    discShade(g, 7, 5, 3.6, 2.6, ['W', 'W', 'e', 's']);
    discShade(g, 7, 2.5, 2.2, 1.8, ['W', 'W', 'e']);
    // 와플콘
    for (let r = 12; r < 20; r++) {
      const w = Math.max(0, Math.round((20 - r) * 0.62));
      for (let c = 7 - w; c <= 7 + w; c++) g[r][c] = ((c - 7 + r) % 3 === 0) ? 'u' : 't';
    }
    outlineDir(g, ['W', 'e', 's', 'S', 't', 'u'], 7, 10, false);
    despeckle(g); return g;
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

  // --- 배경: 실제 사르르목장 건물(포천 산정호수로 130)을 픽셀로 귀엽게 ------
  // 실물 특징: 단층 · 박공지붕(진회색 금속) · 베이지 벽돌 벽 · 게이블 면에 큰 네이비 젖소
  // 엠블럼 · 오른쪽 통창 입구. 베이지 벽은 BI 크림 램프(c/y/Y)와 그대로 맞아떨어진다.
  // 실제 목장 건물 = 게이블이 앞을 보고 용마루가 뒤로 길게 뻗은 단층.
  // ★수평선 3개가 나란하다: 용마루(위) · 처마(중간) · 바닥(아래).
  //   기우는 건 앞뒤 게이블의 두 변뿐이고, 그 둘도 서로 나란하다(평행 투영).
  //   측면 벽은 직사각형. 지붕면은 용마루~처마 사이의 평행사변형.
  function farmHouse() {
    const g = blank(54, 34);
    const AX = 13, APY = 3;       // 앞 게이블 꼭지 = 용마루 왼쪽 끝
    const EY = 17, BY = 31;       // 처마선 · 바닥선
    const LX = 2, NX = 24;        // 정면 왼쪽 끝 · 정면/측면 모서리
    const RUN = 27;               // 용마루 길이(뒤로 물러나는 만큼)
    const SHEAR = NX - AX;        // 게이블 변의 x 이동량 — 앞뒤 게이블이 나란하다
    const WALL_R = 49;            // 측면 벽 오른쪽 끝(지붕이 조금 돌출)

    // 지붕면 — 위=용마루(수평), 아래=처마(수평), 좌우 변은 나란한 게이블 변
    for (let y = APY; y <= EY; y++) {
      const t = (y - APY) / (EY - APY);
      const xL = Math.round(AX + t * SHEAR), xR = Math.round(AX + RUN + t * SHEAR);
      for (let x = xL; x <= xR; x++) if (x < 54) g[y][x] = 'v';
    }
    // 측면 벽 — 직사각형(위=처마, 아래=바닥)
    for (let y = EY; y <= BY; y++) for (let x = NX; x <= WALL_R; x++) g[y][x] = 'a';
    // 앞 게이블 삼각형 + 정면 벽 (밝은 베이지)
    for (let y = APY; y <= EY; y++) {
      const hw = Math.round(((y - APY) / (EY - APY)) * SHEAR);
      for (let x = AX - hw; x <= AX + hw; x++) if (x >= 0) g[y][x] = 'A';
    }
    for (let y = EY; y <= BY; y++) for (let x = LX; x <= NX; x++) g[y][x] = 'A';
    // 정면/지붕이 만나는 모서리 = 앞 게이블 오른쪽 변 (잉크선)
    for (let y = APY; y <= EY; y++) {
      const x = Math.round(AX + ((y - APY) / (EY - APY)) * SHEAR);
      if (g[y][x]) g[y][x] = 'D';
    }
    // 앞 게이블 왼쪽 변 지붕 마감(밝은 면 · 처마 돌출)
    for (let y = APY; y <= EY; y++) {
      const x = Math.round(AX - ((y - APY) / (EY - APY)) * SHEAR);
      for (let k = 0; k < 3; k++) if (x - k >= 0) g[y][x - k] = 'V';
    }
    // 용마루 마감(수평 하이라이트)
    for (let x = AX; x <= AX + RUN; x++) g[APY][x] = 'V';
    outlineDir(g, ['A', 'a', 'V', 'v', 'D'], 24, 18, false);
    despeckle(g); return g;
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
  const HOUSE_SP = S(farmHouse());

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
    scoop: { sp: ITEM_SP.scoop, good: true, points: 20, tier: 1, glow: '#fff6e6' },
  };

  // ===== 상태 =====
  let state = 'locked';   // 초기 = 로그인 게이트(웰컴). 로그인해야 'ready'로 풀린다.
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

  // ===== 로그인 게이트 (로그아웃 상태에선 게임 불가 · 웰컴 화면) =====
  // 웰컴 화면 마스코트(우유팩 얼굴) 1회 렌더
  if (el.welcomeFace) {
    const wsp = FACE_SP.milk, wx = el.welcomeFace.getContext('2d');
    wx.imageSmoothingEnabled = false;
    for (let r = 0; r < wsp.length; r++) for (let c = 0; c < wsp[r].length; c++) {
      const col = PAL[wsp[r][c]];
      if (col) { wx.fillStyle = col; wx.fillRect(c, r, 1, 1); }
    }
  }
  function lockGame() {   // 미로그인: 웰컴만 노출, 나머지 오버레이 숨김, 진행 중이면 중단
    state = 'locked';
    items = []; sparks = [];
    if (el.welcome) el.welcome.classList.remove('hidden');
    el.start.classList.add('hidden');
    el.over.classList.add('hidden');
    if (el.pause) el.pause.classList.add('hidden');
  }
  function unlockGame() { // 로그인: 웰컴 닫고 시작 화면으로
    if (el.welcome) el.welcome.classList.add('hidden');
    if (state === 'locked') { state = 'ready'; el.start.classList.remove('hidden'); }
  }
  if (window.SaruruAuth) {
    SaruruAuth.onAuth(function (s) { if (s.user) unlockGame(); else lockGame(); });
  } else {
    // 계정 모듈이 없으면(오프라인 등) 게임을 막지 않는다 — 로컬 플레이 폴백
    unlockGame();
  }

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
  // 캔버스와 컨트롤 패드 둘 다 조작면. 패드는 캐릭터 아래라 엄지가 화면을 안 가린다.
  function bindDrag(surface) {
    // 조작 위치를 좌우 비율(0~1)로 환산 — 캔버스든 패드든 같은 컨트롤 축이라
    // 어느 쪽에서 조작해도 아래 패드 음영이 같은 위치에 뜬다.
    const toFrac = (clientX) => {
      const r = surface.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    };
    const onPointer = (e) => {
      if (state !== 'playing') return;
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      const frac = toFrac(t.clientX);
      input.targetX = frac * VW;
      padGlow(frac, true);
      e.preventDefault();
    };
    const release = () => { input.targetX = null; padGlow(0, false); };
    surface.addEventListener('touchstart', onPointer, { passive: false });
    surface.addEventListener('touchmove', onPointer, { passive: false });
    surface.addEventListener('touchend', release);
    surface.addEventListener('mousedown', (e) => { surface._drag = true; onPointer(e); });
    window.addEventListener('mousemove', (e) => { if (surface._drag) onPointer(e); });
    window.addEventListener('mouseup', () => { if (surface._drag) { surface._drag = false; release(); } });
  }
  // 컨트롤 패드의 음영 — 지금 조작 중인 좌우 위치를 보여준다(캔버스·패드 공용).
  //   frac: 0(왼쪽)~1(오른쪽). 캔버스에서 조작해도 이 함수가 패드를 구동한다.
  function padGlow(frac, on) {
    if (!el.pad) return;
    if (on) {
      const w = el.pad.getBoundingClientRect().width;
      // 8px 그리드에 스냅 — 픽셀 컨셉이라 음영도 뚝뚝 끊겨 움직인다
      const snapped = Math.round((frac * w) / 8) * 8;
      el.pad.style.setProperty('--px', Math.max(0, Math.min(w, snapped)) + 'px');
    }
    el.pad.style.setProperty('--pg', on ? '1' : '0');
    el.pad.classList.toggle('touching', !!on);
  }
  bindDrag(canvas);
  if (el.pad) {
    bindDrag(el.pad);
    // 마우스로 그냥 지나가도 따라오게(데스크톱 재미 요소)
    el.pad.addEventListener('mousemove', (e) => {
      const r = el.pad.getBoundingClientRect();
      padGlow(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), true);
    });
    el.pad.addEventListener('mouseleave', () => padGlow(0, false));
  }
  el.btnStart.addEventListener('click', startGame);
  el.btnRetry.addEventListener('click', startGame);

  // ===== 흐름 =====
  function startGame() {
    if (state === 'locked') return;   // 로그인 게이트 — 미로그인이면 시작 불가
    state = 'playing';
    items = []; sparks = [];
    // playT = 난이도 시계. 이걸 안 지우면 재시작해도 이전 판의 속도가 그대로 넘어온다.
    score = 0; lives = 3; spawnTimer = 0; invuln = 0; playT = 0;
    player.x = VW / 2; player.vx = 0;
    input.targetX = null;
    el.start.classList.add('hidden');
    el.over.classList.add('hidden');
    flashT = 0;
    SFX.start();
    updateHud();
  }
  // 일시정지 — 점수는 그대로 메모리에 남는다(기록이 사라지지 않는다).
  function setPaused(p) {
    if (p && state !== 'playing') return;
    if (!p && state !== 'paused') return;
    state = p ? 'paused' : 'playing';
    input.left = input.right = false; input.targetX = null;
    el.pause.classList.toggle('hidden', !p);
    // btn-pause는 HUD 칸 구조(label+value) — value span만 교체(라벨 유지)
    const pv = el.btnPause && el.btnPause.querySelector('.hud-value');
    if (pv) pv.textContent = p ? '▶' : '⏸';
  }
  if (el.btnPause) el.btnPause.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    setPaused(state === 'playing');
  });
  if (el.btnResume) el.btnResume.addEventListener('click', () => setPaused(false));
  // 탭을 벗어나면 자동 일시정지 — 안 그러면 돌아왔을 때 이미 죽어 있다
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  function gameOver() {
    state = 'over';
    const fs = Math.floor(score);
    const nb = fs > best;
    if (nb) { best = fs; localStorage.setItem(BEST_KEY, String(best)); el.best.textContent = best; }
    el.finalScore.textContent = fs;
    el.bestLine.textContent = nb ? '★ 새 최고기록! 사르르목장 신기록 ★' : '최고 ' + best;
    el.over.classList.remove('hidden');
    SFX.over();
    submitAndShowRank(fs);   // 로그인 시 서버 점수 제출 + 리더보드(미로그인/오프라인이면 조용히 스킵)
  }

  // ===== 온라인 랭킹 (M2 · SaruruAuth 있을 때만) =====
  const rankPanel = document.getElementById('rank-panel');
  const rankList = document.getElementById('rank-list');
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  // 공용 리더보드 렌더 — 게임오버 패널과 '랭킹 보기' 모달이 함께 쓴다
  function renderRankInto(listEl, period) {
    const A = window.SaruruAuth;
    if (!A || !listEl) return;
    listEl.innerHTML = '<li class="rank-loading">불러오는 중…</li>';
    A.getLeaderboard(GAME_KEY, period, 20).then(({ rows }) => {
      const st = A.getState();
      const myNick = st.player && st.player.nickname;
      if (!rows || !rows.length) { listEl.innerHTML = '<li class="rank-empty">아직 기록이 없어요. 첫 주인공이 되어보세요!</li>'; return; }
      listEl.innerHTML = rows.map((r, i) => {
        const me = myNick && r.nickname === myNick ? ' me' : '';
        return '<li class="rank-row' + me + '"><span class="rk-no">' + (i + 1) + '</span>' +
               '<span class="rk-nick">' + escapeHtml(r.nickname) + '</span>' +
               '<span class="rk-best">' + r.best + '</span></li>';
      }).join('');
    });
  }

  // 게임오버 화면: 점수 제출 + 리더보드
  let overPeriod = 'week';
  function submitAndShowRank(fs) {
    const A = window.SaruruAuth;
    if (!A || !rankPanel) return;
    const st = A.getState();
    if (!st.user || !st.player) { rankPanel.classList.add('hidden'); return; } // 로그인+닉네임 있어야
    A.submitScore(fs, Math.floor(playT * 1000), GAME_KEY).then((r) => {
      if (r.ok && r.best > best) { best = r.best; localStorage.setItem(BEST_KEY, String(best)); el.best.textContent = best; }
      rankPanel.classList.remove('hidden');
      renderRankInto(rankList, overPeriod);
    });
  }
  document.querySelectorAll('#rank-panel .rank-tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#rank-panel .rank-tab').forEach((x) => x.classList.remove('on'));
      t.classList.add('on');
      overPeriod = t.getAttribute('data-period') === 'all' ? 'all' : 'week';
      renderRankInto(rankList, overPeriod);
    });
  });

  // '랭킹 보기' 모달 (하단 버튼 · 게임 안 해도 순위 열람)
  const rankModal = document.getElementById('rank-modal');
  const rankModalList = document.getElementById('rank-modal-list');
  const btnRank = document.getElementById('btn-rank');
  let modalPeriod = 'week';
  if (btnRank && rankModal) {
    btnRank.addEventListener('click', () => { rankModal.classList.remove('hidden'); renderRankInto(rankModalList, modalPeriod); });
    rankModal.addEventListener('click', (e) => { if (e.target === rankModal) rankModal.classList.add('hidden'); });
    const rc = document.getElementById('rank-modal-close');
    if (rc) rc.addEventListener('click', () => rankModal.classList.add('hidden'));
    document.querySelectorAll('#rank-modal-tabs .rank-tab').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('#rank-modal-tabs .rank-tab').forEach((x) => x.classList.remove('on'));
        t.classList.add('on');
        modalPeriod = t.getAttribute('data-period') === 'all' ? 'all' : 'week';
        renderRankInto(rankModalList, modalPeriod);
      });
    });
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
  let flashT = 0, flashMax = 1, flashCol = '#ffffff', flashPeak = 0.5;
  // peak = 화면 오버레이 최대 알파(효과별로 조절). 미지정 시 0.5.
  function flash(color, amt, peak) { flashCol = color || '#ffffff'; flashT = amt || 0.15; flashMax = flashT; flashPeak = (peak == null ? 0.5 : peak); }

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
          flash(it.glow, 0.10 + t * 0.12, 0.18);  // 획득 flash는 은은하게(흰 화면 깜박임 방지)
          SFX.collect(t);
        } else if (invuln <= 0) {
          lives -= 1; invuln = 1000;
          burst(player.x, PLAYER_Y - 22, '#a8763f', 9, 1.1);
          flash('#e07d94', 0.24, 0.42);  // 피격은 핑크로 좀 더 뚜렷하게(피드백 유지)
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
  // 흰색 목장 울타리 — 얇게, 집 좌우 구간에만(지평선을 다 가리지 않는다).
  function drawFence(yBase, x0, x1) {
    const top = yBase - 12, w = x1 - x0;
    for (const ry of [top + 2, top + 7]) {          // 가로 레일 2단 (얇게)
      ctx.fillStyle = '#26365e'; ctx.fillRect(x0, ry - 1, w, 1);   // 딥잉크 상단선
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, ry, w, 2);
      ctx.fillStyle = '#bcccea'; ctx.fillRect(x0, ry + 2, w, 1);   // 레일 아래 그림자
    }
    for (let x = x0 + 2; x < x1 - 2; x += 22) {     // 기둥 (얇게)
      ctx.fillStyle = '#26365e'; ctx.fillRect(x - 1, top, 5, 13);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, top + 1, 3, 12);
      ctx.fillStyle = '#bcccea'; ctx.fillRect(x + 2, top + 1, 1, 12);
    }
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
    // 사르르목장 건물 — 바닥이 지평선에 닿게(땅에 서 있다)
    const hx = 136, hw = sizeOf(HOUSE_SP).w, hh = sizeOf(HOUSE_SP).h;
    drawSprite(HOUSE_SP, hx, hillTop - hh);
    // 목초지 = CREAM + 딥잉크 룰(BI 그래픽 문법)
    ctx.fillStyle = '#fff6e6'; ctx.fillRect(0, hillTop, VW, GROUND);
    ctx.fillStyle = '#26365e'; ctx.fillRect(0, hillTop, VW, 3);
    // 흰 울타리 — 집을 피해서 나머지 전 구간에 이어진다(집을 가리지 않는다)
    drawFence(hillTop, 0, hx);
    drawFence(hillTop, hx + hw - 4, VW);
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
      // 스프라이트 윗부분(소프트서브 스월) 근처에 찍는다 — 아래는 콘이라 빈 공간이다
      const cxp = Math.round(it.x + (k === 0 ? it.w - 4 : 3) + Math.sin(it.sway) * it.swayA);
      const cyp = Math.round(it.y + (k === 0 ? 3 : 9));
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
      ctx.globalAlpha = Math.max(0, Math.min(flashPeak, (flashT / flashMax) * flashPeak));
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
  }

  // 아트 검수·대시보드 프리뷰용 — 생성된 BI 스프라이트를 그대로 노출(읽기 전용 용도)
  window.SaruruGameArt = { PAL, HEAD_SP, HAT_SP, FACE_SP, ITEM_SP, HOUSE_SP };

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
