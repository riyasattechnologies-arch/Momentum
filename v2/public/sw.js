// Momentum service worker: offline shell + notification actions (+ Web Push when the backend is connected).
const CACHE = "momentum-v2-1";
const SHELL = ["/app/today", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// Network first, cache fallback for page navigations
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/app/today"))),
    );
  }
});
// Web Push (used once Supabase + VAPID are configured)
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "Momentum", body: "Time for your next block." };
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "/icon.svg",
      tag: d.blockId || "momentum",
      data: d,
      actions: [
        { action: "start", title: "Start" },
        { action: "snooze", title: "Snooze 15m" },
      ],
    }),
  );
});
// Notification buttons -> tell the open app (or open it)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const action = e.action || "open";
  const blockId = e.notification.data && e.notification.data.blockId;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        c.postMessage({ type: "block-action", action, blockId });
        return c.focus();
      }
      return self.clients.openWindow(`/app/today${blockId ? `?block=${blockId}&action=${action}` : ""}`);
    }),
  );
});
