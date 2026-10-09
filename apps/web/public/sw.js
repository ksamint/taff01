const CACHE = "taff-public-m7-v1";
const OFFLINE = "/offline";
const PUBLIC =
  /^\/(?:_next\/static\/|fonts\/|icons\/|locales\/(?:en|zh-CN|zh-HK)$|manifest\.webmanifest$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          OFFLINE,
          "/icons/taff-192.png",
          "/icons/taff-512.png",
          "/manifest.webmanifest",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("taff-public-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-State-Tree") ||
    /^\/(?:api|mcp|auth)(?:\/|$)/.test(url.pathname)
  )
    return;
  if (request.mode === "navigate") {
    // Every private document goes to the server. Offline always shows a neutral shell.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (url.search || !PUBLIC.test(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const immutable = url.pathname.startsWith("/_next/static/");
      if (immutable && cached) return cached;
      let response;
      try {
        response = await fetch(
          request,
          immutable ? undefined : { cache: "no-cache" },
        );
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
      // A route error or HTML fallback must never enter the asset cache.
      if (
        response.ok &&
        response.type === "basic" &&
        !/(?:private|no-store)/i.test(
          response.headers.get("cache-control") ?? "",
        ) &&
        /(?:javascript|json|^text\/css|^font\/|^image\/|application\/(?:font|vnd\.ms-fontobject))/.test(
          response.headers.get("content-type") ?? "",
        )
      )
        await cache.put(request, response.clone());
      return response;
    }),
  );
});
