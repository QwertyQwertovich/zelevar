// Офлайн-режим для веб-версии: файлы игры хранятся в кэше браузера.
// Стратегия «из кэша сразу, в фоне — обновить»: игра запускается без сети, а новая версия подтягивается при следующем запуске.
const CACHE = 'zelevar-v3';
const FILES = ['./', 'index.html', 'core.js', 'i18n.js', 'levels.js', 'manifest.json', 'icon.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
