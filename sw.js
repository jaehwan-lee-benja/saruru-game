/* 사르르목장 · 똥피하기 — 서비스워커 (설치형 PWA + 오프라인 앱셸)
 * 전략:
 *   • 내비게이션(HTML) = network-first → 오프라인이면 캐시된 index.html 폴백.
 *   • 동일 출처 정적자원(css/js/img) = cache-first → 없으면 네트워크 후 캐시 적재.
 *   • 교차 출처(CDN: Galmuri·supabase·kakao adfit) = 그냥 네트워크 통과(캐시 안 함).
 * 버전 올리면(activate에서) 옛 캐시 자동 정리.
 */
const VERSION = 'saruru-ddong-v1';
const CACHE = `saruru-${VERSION}`;

// 설치 시 최소 앱셸 미리 캐시(오프라인 첫 실행 보장). 쿼리 없는 기본 경로.
const PRECACHE = [
  './',
  './index.html',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // 프리캐시 일부 실패해도 설치는 진행
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 교차 출처(CDN) — 캐시 관여 안 함(opaque 응답 방지). 그대로 네트워크로.
  if (!sameOrigin) return;

  // 내비게이션(주소창/새로고침) = network-first → 오프라인 시 index.html 폴백
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 동일 출처 정적자원 = cache-first(쿼리스트링 포함 URL 그대로 키). 없으면 네트워크 후 적재.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
