// 更新時は VERSION と、このファイル・index.html・app.js・store.js の ?v= を一緒に上げる
const VERSION = 5;
const CACHE = `tabi-shiori-v${VERSION}`;
const FB = 'https://www.gstatic.com/firebasejs/12.5.0';
const SHELL = [
  './',
  'index.html',
  'style.css?v=5',
  'js/app.js?v=5',
  'js/store.js?v=5',
  'js/settlement.js',
  'js/covers.js',
  'js/firebase-config.js?v=5',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-512.png',
];
const SDK = [
  `${FB}/firebase-app.js`,
  `${FB}/firebase-auth.js`,
  `${FB}/firebase-firestore.js`,
  `${FB}/firebase-app-check.js`,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // ブラウザのHTTPキャッシュから古いファイルを取り込まないよう、取り直す
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
    await cache.addAll(SDK.map((url) => new Request(url, { mode: 'cors' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isOwn = url.origin === self.location.origin;
  const isSdk = url.href.startsWith(FB);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isOwn && !isSdk && !isFont) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: false })
      || (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok && (isFont || isSdk)) cache.put(request, res.clone());
    return res;
  })());
});
