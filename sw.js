/* sw.js — 送り手アプリをオフライン（展示会場など）でも開けるようにキャッシュする */
const CACHE = 'meishi-v8';
const FONT_CACHE = 'meishi-fonts-v1';
const ASSETS = [
  './', './index.html', './card.html', './css/style.css',
  './js/meishi.js', './js/sender.js', './js/receiver.js',
  './vendor/qrcode.js', './vendor/pdf-lib.min.js',
  './manifest.webmanifest', './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Google Fonts は一度読み込んだ分を保存し、次回からはオフラインでも使えるようにする
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // アプリ本体はキャッシュ優先。card.html#... のフラグメントはリクエストに含まれないので同じキャッシュが使える
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
