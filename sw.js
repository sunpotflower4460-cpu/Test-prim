// Network-first updates keep the latest title and controls visible after a deploy.
// Successful responses are saved for offline use when the network becomes unavailable.
const CACHE = "test-prim-gallery-v22";
const ASSETS = [
  "./index.html", "./style.css", "./sumifu.css", "./code.css", "./sync.css", "./helix.css",
  "./game.js", "./sumifu.js", "./code-sim.js", "./code.js", "./sync-sim.js", "./sync.js",
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
  "./haiku/index.html", "./haiku/works.css", "./haiku/vendor/three.module.js",
  "./haiku/ku/index.html", "./haiku/ku/ku.css", "./haiku/ku/words.js", "./haiku/ku/sim.js",
  "./haiku/ku/paint.js", "./haiku/ku/scene.js", "./haiku/ku/audio.js", "./haiku/ku/game.js",
  "./haiku/horror/audio.js", "./haiku/horror/entity.js", "./haiku/horror/house.js", "./haiku/horror/index.html",
  "./haiku/horror/input.js", "./haiku/horror/levels.js", "./haiku/horror/main.js", "./haiku/horror/props.js",
  "./haiku/horror/render.js", "./haiku/horror/sim.js", "./haiku/horror/story.js", "./haiku/horror/style.css",
  "./haiku/horror/textures.js", "./haiku/horror/ui.js", "./haiku/horror/viewmodel.js", "./haiku/kitchen/app.js",
  "./haiku/kitchen/audio.js", "./haiku/kitchen/characters.js", "./haiku/kitchen/fx.js", "./haiku/kitchen/index.html",
  "./haiku/kitchen/lines.js", "./haiku/kitchen/props.js", "./haiku/kitchen/recipes.js", "./haiku/kitchen/sim.js",
  "./haiku/kitchen/style.css", "./haiku/kitchen/textures.js", "./haiku/kitchen/ui.js", "./haiku/kitchen/world.js",

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
