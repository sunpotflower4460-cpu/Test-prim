// Network-first updates keep the latest title and controls visible after a deploy.
// Successful responses are saved for offline use when the network becomes unavailable.
const CACHE = "test-prim-gallery-v25";
const ASSETS = [
  "./index.html", "./style.css", "./sumifu.css", "./code.css", "./sync.css", "./helix.css",
  "./game.js", "./sumifu.js", "./code-sim.js", "./code.js", "./sync-sim.js", "./sync.js",
  "./gpt6-chat/index.html", "./gpt6-chat/sen.html", "./gpt6-chat/sen.css", "./gpt6-chat/sen.js",
  "./gpt6-chat/setsuna.html", "./gpt6-chat/setsuna.css", "./gpt6-chat/setsuna.js",
  "./helix-sim.js", "./helix.js",
  "./sol/index.html", "./sol/tide.css", "./sol/sim.js", "./sol/levels.js",
  "./sol/sea.js", "./sol/audio.js", "./sol/game.js", "./sol/entry.js",
  "./luna/index.html", "./luna/luna.css", "./luna/luna.js",
  "./grok/index.html", "./grok/shelf.css",
  "./oriko/index.html", "./oriko/oriko.css", "./oriko/optics.js", "./oriko/levels.js", "./oriko/game.js",
  "./mikan/index.html", "./mikan/mikan.css", "./mikan/phys.js", "./mikan/levels.js", "./mikan/game.js",
  "./hebi/index.html", "./hebi/hebi.css", "./hebi/sim.js", "./hebi/levels.js", "./hebi/game.js",
  "./kake/index.html", "./kake/kake.css", "./kake/sim.js", "./kake/levels.js", "./kake/game.js",
  "./echo/index.html", "./echo/echo.css", "./echo/sim.js", "./echo/levels.js",
  "./echo/audio.js", "./echo/render.js", "./echo/game.js",
  "./sol/works.html", "./sol/works.css",
  "./sol/skyward/index.html", "./sol/skyward/skyward.css", "./sol/skyward/sim.js",
  "./sol/skyward/scene.js", "./sol/skyward/hud.js", "./sol/skyward/audio.js", "./sol/skyward/game.js",
  "./sol/skyward/vendor/three.module.js",
  "./gpt6-sol/index.html", "./gpt6-sol/reprise.css", "./gpt6-sol/rules.js",
  "./gpt6-sol/levels.js", "./gpt6-sol/sound.js", "./gpt6-sol/game.js",
  "./opus/index.html", "./opus/mizuho.css", "./opus/sim.js", "./opus/levels.js", "./opus/script.js",
  "./opus/render.js", "./opus/audio.js", "./opus/game.js", "./opus/guide.js", "./opus/door.js",
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
