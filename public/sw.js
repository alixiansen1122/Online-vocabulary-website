const CACHE = "ielts-offline-v1";
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ielts-offline-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
// Never cache account pages, OAuth redirects, API responses or user data.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || event.request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname !== "/") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) || new Response("当前离线，请连接网络后重试。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
});
