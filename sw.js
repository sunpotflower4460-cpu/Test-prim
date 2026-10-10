// Network-first updates keep the latest title and controls visible after a deploy.
// Successful responses are saved for offline use when the network becomes unavailable.
const CACHE = "test-prim-gallery-v11";
const ASSETS = [
  "./index.html", "./style.css", "./sumifu.css", "./code.css", "./sync.css",
  "./game.js", "./sumifu.js", "./code-sim.js", "./code.js", "./sync-sim.js", "./sync.js",
  "./sol/index.html", "./sol/tide.css", "./sol/sim.js", "./sol/levels.js",
  "./sol/sea.js", "./sol/audio.js", "./sol/game.js", "./sol/entry.js",
  "./luna/index.html", "./luna/luna.css", "./luna/luna.js",
  "./icon.svg", "./manifest.webmanifest"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(asset => new Request(new URL(asset, self.location.href), { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("test-prim-gallery-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request, { cache: "no-cache" }).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // A freshly installed worker precaches index.html, while a browser normally
    // opens the gallery (or a game) at its directory URL. Resolve that alias.
    const url = new URL(request.url);
    if (url.pathname.endsWith("/")) {
      url.pathname += "index.html";
      url.search = "";
      const index = await cache.match(url.href);
      if (index) return index;
    }
    return Response.error();
  }));
});
