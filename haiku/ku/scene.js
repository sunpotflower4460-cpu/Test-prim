// Frame renderer for 句ゆき. Layers are pre-rendered by KuPaint into an LRU
// tile cache; each frame blits them with parallax and draws the few moving things.
(function () {
  "use strict";

  const TILE = KuPaint.TILE;
  const PAD = KuPaint.PAD;
  // Enough for every visible tile of every layer in one season, plus a fade partner.
  const CACHE_LIMIT = 72;
  const FADE_SECONDS = 3.2;

  // depth: how much of the paler air lies over a band (distant ranges are paler).
  const LAYERS = {
    far: { p: 0.18, kind: "ridge", spec: { seed: 11, base: 0.47, amp: 0.2, scale: 300, tint: "far", alpha: 0.7, haze: 1.2, trees: false, fade: 0.7, depth: 0.3 } },
    mid: { p: 0.36, kind: "ridge", spec: { seed: 23, base: 0.57, amp: 0.14, scale: 190, tint: "mid", alpha: 0.8, haze: 1, trees: true, fade: 0.72, depth: 0.17 } },
    near: { p: 0.6, kind: "ridge", spec: { seed: 37, base: 0.69, amp: 0.07, scale: 110, tint: "near", alpha: 0.85, haze: 0.6, trees: false, fade: 0.8, depth: 0.06 } },
    field: { p: 0.9, kind: "field" },
    road: { p: 1, kind: "road" },
    fore: { p: 1, kind: "fore" }
  };

  const LANTERN_FONT = "600 16px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','IPAMincho','IPAGothic',serif";
  // Lantern metrics: width, and the height per kana.
  const LANTERN_W = 30;
  const LANTERN_STEP = 20;

  function smooth(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function create(canvas, options) {
    const opts = options || {};
    let ctx = canvas.getContext("2d");
    const state = {
      W: 0,
      H: 0,
      scale: 1,
      tileScale: 1,
      cap: opts.cap || 1.5,
      reduced: !!opts.reduced,
      season: null,
      fade: null,
      cache: new Map(),
      sprites: new Map(),
      sky: new Map(),
      mist: null,
      particles: [],
      birds: [],
      drops: [],
      t: 0,
      seed: 0,
      warm: [],
      warmNeeded: true,
      fadeBuf: null,
      fadeMask: null
    };

    function ground() {
      return state.H * 0.8;
    }

    function resize(cssW, cssH, dpr) {
      state.W = Math.max(1, Math.round(cssW));
      state.H = Math.max(1, Math.round(cssH));
      state.scale = Math.min(dpr || 1, state.cap);
      state.tileScale = Math.min(state.scale, opts.coarse ? 1 : 1.25);
      canvas.width = Math.round(state.W * state.scale);
      canvas.height = Math.round(state.H * state.scale);
      canvas.style.width = state.W + "px";
      canvas.style.height = state.H + "px";
      state.cache.clear();
      state.sky.clear();
      state.sprites.clear();
      state.mist = null;
      state.particles = [];
      state.birds = [];
      state.blades = null;
      state.warmNeeded = true;
      if (state.season) seedMotion(state.season);
    }

    // Builds the tiles just around the view in small slices, so that the first steps
    // do not stall while layers are generated. Runs a few milliseconds per frame.
    function queueWarm(cam, season) {
      state.warm = [];
      for (const key of Object.keys(LAYERS)) {
        const layer = LAYERS[key];
        const p = state.reduced ? 1 - (1 - layer.p) * 0.5 : layer.p;
        const from = Math.floor((cam * p) / TILE) - 1;
        const to = Math.floor((cam * p + state.W * 2) / TILE) + 1;
        for (let t = from; t <= to; t++) state.warm.push([key, season, t]);
      }
    }

    function runWarm() {
      const start = performance.now();
      while (state.warm.length && performance.now() - start < 6) {
        const job = state.warm.shift();
        tileFor(job[0], job[1], job[2]);
      }
    }

    // Every tile is keyed by season, so a fade can keep both seasons alive.
    function cached(key, make) {
      if (state.cache.has(key)) {
        const value = state.cache.get(key);
        state.cache.delete(key);
        state.cache.set(key, value);
        return value;
      }
      const value = make();
      state.cache.set(key, value);
      while (state.cache.size > CACHE_LIMIT) {
        state.cache.delete(state.cache.keys().next().value);
      }
      return value;
    }

    // Small sprites (lanterns, glows, inns) have their own cache, so that many
    // lanterns on screen never evict the large tiles.
    function sprite(key, make) {
      if (state.sprites.has(key)) return state.sprites.get(key);
      if (state.sprites.size > 600) state.sprites.clear();
      const value = make();
      state.sprites.set(key, value);
      return value;
    }

    function skyFor(season) {
      return cached("sky|" + season, () => KuPaint.skyCanvas(state.W, state.H, season, state.tileScale));
    }

    function tileFor(key, season, index) {
      const id = season + "|" + key + "|" + index;
      return cached(id, () => {
        const layer = LAYERS[key];
        if (layer.kind === "ridge") return KuPaint.ridgeTile(state.H, season, layer.spec, index, state.tileScale);
        if (layer.kind === "field") return KuPaint.fieldTile(state.H, season, index, state.tileScale, state.H * 0.7, ground());
        if (layer.kind === "fore") return KuPaint.foreTile(state.H, season, index, state.tileScale, ground() + 26);
        return KuPaint.roadTile(season, index, state.tileScale);
      });
    }

    function drawTileRow(key, season, alpha, cam) {
      const layer = LAYERS[key];
      const offset = layer.kind === "road" ? 0 : PAD;
      const p = state.reduced ? 1 - (1 - layer.p) * 0.5 : layer.p;
      const base = cam * p;
      const first = Math.floor((base - offset) / TILE);
      const last = Math.floor((base + state.W + offset) / TILE);
      // Snap to device pixels so neighbouring tiles meet with no antialiased seam.
      const snap = v => Math.round(v * state.scale) / state.scale;
      ctx.globalAlpha = alpha;
      for (let t = first; t <= last; t++) {
        const img = tileFor(key, season, t);
        const x = snap(t * TILE - offset - base);
        let y = 0;
        if (layer.kind === "road") y = ground() - 45;
        if (layer.kind === "fore") y = ground() + 26;
        const tw = img.width / state.tileScale;
        const th = img.height / state.tileScale;
        // Draw only the part of the tile that is on screen; overdraw is the costly part.
        const x0 = Math.max(0, x);
        const x1 = Math.min(state.W, x + tw);
        if (x1 <= x0) continue;
        const k = state.tileScale;
        ctx.drawImage(img, (x0 - x) * k, 0, (x1 - x0) * k, img.height, x0, y, x1 - x0, th);
      }
      ctx.globalAlpha = 1;
    }

    // Keeps one tile of prefetch ahead of the walk so that no frame builds a whole layer.
    function prefetch(season, cam, dir) {
      if (!dir) return;
      for (const key of ["far", "mid", "near", "field", "road"]) {
        const layer = LAYERS[key];
        const p = state.reduced ? 1 - (1 - layer.p) * 0.5 : layer.p;
        const edge = Math.floor((cam * p + (dir > 0 ? state.W + 120 : -120)) / TILE);
        const id = season + "|" + key + "|" + edge;
        if (!state.cache.has(id)) {
          tileFor(key, season, edge);
          return;
        }
      }
    }

    function seedMotion(season) {
      state.particles = [];
      state.birds = [];
      const count = state.reduced ? 10 : 42;
      const rand = KuSim.mulberry32(7000 + season.charCodeAt(0));
      const W = state.W;
      const H = state.H;
      for (let i = 0; i < count; i++) {
        state.particles.push({ x: rand() * W, y: rand() * H, vx: (rand() - 0.5) * 16, vy: 14 + rand() * 26,
          r: 2 + rand() * 3, phase: rand() * 6.28, rot: rand() * 6.28 });
      }
      const fireflies = state.reduced ? 3 : 14;
      if (season === "夏") {
        for (let i = 0; i < fireflies; i++) {
          state.particles.push({ x: rand() * W, y: H * (0.5 + rand() * 0.25), vx: (rand() - 0.5) * 10, vy: (rand() - 0.5) * 6,
            r: 1.5, phase: rand() * 6.28, firefly: true });
        }
      }
      if (season === "春" || season === "夏") {
        const flocks = state.reduced ? 1 : 3;
        for (let i = 0; i < flocks; i++) state.birds.push({ x: rand() * W, y: H * (0.14 + rand() * 0.22), speed: 18 + rand() * 14, phase: rand() * 6.28, kind: "swallow" });
      }
      if (season === "秋") {
        state.birds.push({ x: W * 0.3, y: H * 0.2, speed: 16, phase: 0, kind: "geese" });
      }
    }

    // wx: the world x where the change happens (the 宿 that was cleared), if known.
    function setSeason(season, wx) {
      if (!season) return;
      if (state.season === null) {
        state.season = season;
        seedMotion(season);
        return;
      }
      const target = state.fade ? state.fade.to : state.season;
      if (season === target) return;
      state.fade = { from: state.season, to: season, t: 0, wx: wx, seed: season.charCodeAt(0) * 0.37 + (wx || 0) * 0.001 };
      state.warmNeeded = true;
      seedMotion(season);
    }

    function advanceFade(dt) {
      if (!state.fade) return;
      state.fade.t += dt / (state.reduced ? FADE_SECONDS * 0.5 : FADE_SECONDS);
      if (state.fade.t >= 1) {
        const to = state.fade.to;
        state.season = to;
        state.fade = null;
        for (const key of Array.from(state.cache.keys())) {
          if (!key.startsWith(to + "|") && !key.startsWith("sky|" + to)) state.cache.delete(key);
        }
      }
    }

    // One season's backdrop, painted into the current context: sky, drifting cloud, ridges and meadow.
    function paintBackdrop(season, cam) {
      ctx.drawImage(skyFor(season), 0, 0, state.W, state.H);
      drawClouds(season, cam);
      for (const key of ["far", "mid", "near", "field"]) drawTileRow(key, season, 1, cam);
    }

    // Clouds drift slowly across the sky, with a little parallax against the walk.
    function drawClouds(season, cam) {
      const span = state.W + 420;
      for (let i = 0; i < 5; i++) {
        const img = sprite("cloud|" + season + "|" + i, () => KuPaint.cloudSprite(season, i, state.tileScale));
        const drift = state.t * (4 + i * 1.6) - cam * 0.05;
        const x = (((i * 611 + 200 - drift) % span) + span) % span - 210;
        const y = state.H * (0.06 + (i * 0.11) % 0.26);
        ctx.drawImage(img, x, y, img.width / state.tileScale, img.height / state.tileScale);
      }
    }

    function drawBackdrop(view) {
      const cam = view.camX;
      const fade = state.fade;
      if (!fade) {
        paintBackdrop(state.season, cam);
        return;
      }
      paintBackdrop(fade.from, cam);
      revealSeason(fade, smooth(fade.t), view);
    }

    // The new season spreads outward from the 宿 like ink on washi: an irregular blot
    // grows over the old scene, with a faint dark edge where it soaks in.
    function ensureFadeBuffers() {
      const w = canvas.width;
      const h = canvas.height;
      if (!state.fadeBuf || state.fadeBuf.width !== w || state.fadeBuf.height !== h) {
        state.fadeBuf = KuPaint.makeCanvas(w, h);
        state.fadeMask = KuPaint.makeCanvas(w, h);
      }
    }

    // Traces the blot in the given context's user units, centred on (cx, cy) with radius r.
    function blotPath(g, cx, cy, r, seed) {
      const p1 = seed * 2.1;
      const p2 = seed * 3.7;
      const p3 = seed * 5.3;
      g.beginPath();
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const wob = 1 + 0.07 * Math.sin(3 * a + p1) + 0.04 * Math.sin(5 * a + p2) + 0.02 * Math.sin(9 * a + p3);
        const x = cx + Math.cos(a) * r * wob;
        const y = cy + Math.sin(a) * r * wob * 0.78;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
    }

    function revealSeason(fade, ease, view) {
      ensureFadeBuffers();
      const w = canvas.width;
      const h = canvas.height;
      const s = state.scale;
      const cx = fade.wx === undefined ? state.W * 0.5 : fade.wx - view.camX;
      const cy = state.H * 0.72;
      const reach = Math.hypot(state.W, state.H) * (0.1 + ease * 1.02);

      // 1. The new season is painted off-screen.
      const bg = state.fadeBuf.getContext("2d");
      bg.setTransform(1, 0, 0, 1, 0, 0);
      bg.clearRect(0, 0, w, h);
      bg.setTransform(s, 0, 0, s, 0, 0);
      const screen = ctx;
      ctx = bg;
      try {
        paintBackdrop(fade.to, view.camX);
      } finally {
        ctx = screen;
      }

      // 2. The blot is the mask that lets the new season through.
      const mg = state.fadeMask.getContext("2d");
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, w, h);
      mg.setTransform(s, 0, 0, s, 0, 0);
      mg.fillStyle = "#000";
      if ("filter" in mg) mg.filter = "blur(9px)";
      blotPath(mg, cx, cy, reach, fade.seed);
      mg.fill();
      if ("filter" in mg) mg.filter = "none";
      bg.setTransform(1, 0, 0, 1, 0, 0);
      bg.globalCompositeOperation = "destination-in";
      bg.drawImage(state.fadeMask, 0, 0);
      bg.globalCompositeOperation = "source-over";

      // 3. Composite over the old scene, then draw the soaked edge.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(state.fadeBuf, 0, 0);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.save();
      ctx.strokeStyle = KuPaint.rgba(KuPaint.PALETTE[fade.to].ink, 0.2 * (1 - ease * 0.7));
      ctx.lineWidth = 2.2;
      blotPath(ctx, cx, cy, reach, fade.seed);
      ctx.stroke();
      ctx.restore();
    }

    function drawBirds(dt) {
      for (const bird of state.birds) {
        bird.x -= bird.speed * dt;
        if (bird.x < -120) bird.x = state.W + 120;
        // Flap in bursts with short glides between them, the way a bird crosses the sky.
        const cycle = ((state.t * 0.3 + bird.phase / 6.28) % 1 + 1) % 1;
        const flapping = cycle < 0.6;
        const wing = flapping ? Math.sin(state.t * 9 + bird.phase) * 0.6 : 0.2;
        const lift = Math.sin(state.t * 0.8 + bird.phase) * 3;
        ctx.strokeStyle = KuPaint.rgba(KuPaint.PALETTE[state.season].ink, 0.75);
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        if (bird.kind === "geese") {
          for (let i = 0; i < 5; i++) {
            const bx = bird.x + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 15;
            const by = bird.y + Math.ceil(i / 2) * 7 + lift;
            drawGull(bx, by, 9, wing * 0.5);
          }
        } else {
          for (let i = 0; i < 2; i++) drawGull(bird.x + i * 26, bird.y + i * 6 + lift + Math.sin(state.t + i) * 1.5, 7, wing);
        }
      }
    }

    function drawGull(x, y, span, wing) {
      ctx.beginPath();
      ctx.moveTo(x - span, y - span * wing);
      ctx.quadraticCurveTo(x - span * 0.4, y - span * 0.2, x, y);
      ctx.quadraticCurveTo(x + span * 0.4, y - span * 0.2, x + span, y - span * wing);
      ctx.stroke();
    }

    function drawParticles(dt, season) {
      const W = state.W;
      const H = state.H;
      const ink = KuPaint.PALETTE[season].ink;
      for (const p of state.particles) {
        if (p.firefly) {
          p.x += Math.sin(state.t * 0.7 + p.phase) * 8 * dt;
          p.y += Math.cos(state.t * 0.5 + p.phase) * 6 * dt;
          const glow = 0.25 + Math.max(0, Math.sin(state.t * 2.4 + p.phase)) * 0.75;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
          grad.addColorStop(0, "rgba(252,236,150," + 0.8 * glow + ")");
          grad.addColorStop(1, "rgba(252,236,150,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(state.t * 1.1 + p.phase) * 14) * dt;
        p.rot += dt * 1.4;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (season === "春") {
          ctx.fillStyle = "rgba(236,170,186,0.75)";
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 1.3, p.r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (season === "秋") {
          const pal = KuPaint.PALETTE["秋"].tree;
          ctx.fillStyle = KuPaint.rgba(pal[Math.floor(p.phase * 10) % pal.length], 0.8);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (season === "冬") {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = KuPaint.rgba(ink, 0.2);
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    function drawRain(view) {
      if (!view.rain || state.reduced) return;
      const W = state.W;
      const H = state.H;
      const rand = KuSim.mulberry32(Math.floor(state.t * 30));
      ctx.strokeStyle = "rgba(60,72,84,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = (rand() * W + state.t * 240) % W;
        const y = (rand() * H + state.t * 700) % H;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 14);
      }
      ctx.stroke();
    }

    // Wind-blown grass along the road edge. A small fixed set of blades, swayed per frame.
    function ensureBlades() {
      if (state.blades) return state.blades;
      const rand = KuSim.mulberry32(3131);
      state.blades = [];
      for (let i = 0; i < 220; i++) {
        state.blades.push({ wx: rand() * KuSim.innX(7) + 900, side: rand() < 0.5 ? -1 : 1,
          h: 10 + rand() * 16, ph: rand() * 6.28, lean: (rand() - 0.5) * 0.5 });
      }
      return state.blades;
    }

    function drawGrass(cam, season) {
      const blades = ensureBlades();
      const gy = ground() + 2;
      const ink = KuPaint.PALETTE[season].ink;
      ctx.strokeStyle = KuPaint.rgba(ink, 0.5);
      ctx.lineWidth = 1.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const b of blades) {
        const sx = b.wx - cam;
        if (sx < -20 || sx > state.W + 20) continue;
        const y = gy + b.side * 14 + (b.wx % 7) * 0.2;
        // A breeze that travels along the road: each blade leans as the gust passes it.
        const gust = Math.sin(state.t * 0.85 - b.wx * 0.006) * 0.6 + Math.sin(state.t * 0.4) * 0.15;
        const flutter = Math.sin(state.t * 2.6 + b.ph) * 0.14;
        const sway = (gust + flutter) * b.h * 0.6 + b.lean * b.h;
        ctx.moveTo(sx, y);
        ctx.quadraticCurveTo(sx + sway * 0.3, y - b.h * 0.6, sx + sway, y - b.h);
      }
      ctx.stroke();
    }

    // A paper lantern hung beside each door, warm enough to find the inn from the road.
    function drawInnLantern(x, season) {
      const lx = x - 92;
      const ly = ground() - 118 + Math.sin(state.t * 1.4 + x) * 1.5;
      const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 40);
      glow.addColorStop(0, "rgba(250,206,130,0.5)");
      glow.addColorStop(1, "rgba(250,206,130,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 40, ly - 40, 80, 80);
      ctx.fillStyle = "rgba(252,240,214,0.96)";
      ctx.beginPath();
      ctx.ellipse(lx, ly, 8, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = KuPaint.rgba(KuPaint.PALETTE[season].ink, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(190,60,48,0.85)";
      ctx.fillRect(lx - 3, ly - 13, 6, 3);
    }

    function drawInn(station, name, x, season) {
      const img = sprite("inn|" + station + "|" + season, () => KuPaint.innSprite(name, season, state.tileScale));
      const w = img.width / state.tileScale;
      const h = img.height / state.tileScale;
      ctx.drawImage(img, x - w / 2, ground() - h + 14, w, h);
      drawInnLantern(x, season);
    }

    function drawFire(view) {
      const fireX = view.fireX;
      if (fireX === undefined) return;
      const sx = fireX - view.camX;
      if (sx < -80 || sx > state.W + 80) return;
      const flick = 1 + Math.sin(state.t * 9) * 0.05 + Math.sin(state.t * 23) * 0.03;
      const gy = ground() - 6;
      const glow = ctx.createRadialGradient(sx, gy, 2, sx, gy, 110 * flick);
      glow.addColorStop(0, "rgba(246,170,88,0.42)");
      glow.addColorStop(0.5, "rgba(246,170,88,0.12)");
      glow.addColorStop(1, "rgba(246,170,88,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 120, gy - 120, 240, 240);
      ctx.fillStyle = "rgba(190,84,40,0.85)";
      ctx.beginPath();
      ctx.moveTo(sx - 9, gy);
      ctx.quadraticCurveTo(sx - 4, gy - 22 * flick, sx, gy - 28 * flick);
      ctx.quadraticCurveTo(sx + 4, gy - 16 * flick, sx + 9, gy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(252,214,120,0.9)";
      ctx.beginPath();
      ctx.ellipse(sx, gy - 6, 4, 9 * flick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(40,30,24,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 12, gy + 2);
      ctx.lineTo(sx + 12, gy - 3);
      ctx.moveTo(sx - 12, gy - 3);
      ctx.lineTo(sx + 12, gy + 2);
      ctx.stroke();
    }

    // Lanterns are pre-rendered per word and season; the frame only blits them.
    function lanternSprite(word, season) {
      return sprite("lan|" + season + "|" + word, () => {
        const chars = Array.from(word);
        const w = LANTERN_W;
        const h = 24 + chars.length * LANTERN_STEP;
        const pad = 4;
        const cnv = KuPaint.makeCanvas((w + pad * 2) * state.tileScale, (h + pad * 2) * state.tileScale);
        const g = cnv.getContext("2d");
        g.setTransform(state.tileScale, 0, 0, state.tileScale, 0, 0);
        const pal = KuPaint.PALETTE[season];
        g.fillStyle = "rgba(251,244,228,0.96)";
        g.beginPath();
        g.roundRect ? g.roundRect(pad, pad, w, h, 9) : g.rect(pad, pad, w, h);
        g.fill();
        g.strokeStyle = KuPaint.rgba(pal.ink, 0.45);
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = KuPaint.rgba(pal.ink, 0.85);
        g.fillRect(pad + 4, pad - 3, w - 8, 3);
        g.fillRect(pad + 4, pad + h, w - 8, 3);
        g.font = LANTERN_FONT;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#1f1812";
        chars.forEach((ch, i) => g.fillText(ch, pad + w / 2, pad + 16 + i * LANTERN_STEP));
        return cnv;
      });
    }

    function glowSprite(hot) {
      return sprite("glow|" + (hot ? 1 : 0), () => {
        const size = 112;
        const cnv = KuPaint.makeCanvas(size * state.tileScale, size * state.tileScale);
        const g = cnv.getContext("2d");
        g.setTransform(state.tileScale, 0, 0, state.tileScale, 0, 0);
        const grad = g.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
        grad.addColorStop(0, "rgba(250,224,160," + (hot ? 0.7 : 0.45) + ")");
        grad.addColorStop(1, "rgba(250,224,160,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return cnv;
      });
    }

    function drawLantern(lantern, cam, season, hot, near) {
      const sx = lantern.x - cam;
      const sway = Math.sin(state.t * 1.1 + lantern.id) * 4;
      const y = state.H * (0.16 + (1 - lantern.h) * 0.42) + Math.sin(state.t * 0.9 + lantern.id * 0.7) * 5;
      const cx = sx + sway;
      const glow = glowSprite(hot || near);
      ctx.drawImage(glow, cx - 56, y - 56, 112, 112);
      if (hot) {
        const pulse = 1 + Math.sin(state.t * 4) * 0.06;
        const h = 24 + Array.from(lantern.word).length * LANTERN_STEP;
        ctx.strokeStyle = KuPaint.rgba(KuPaint.PALETTE[season].dot, 0.9);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cx, y, (LANTERN_W / 2 + 12) * pulse, (h / 2 + 12) * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const img = lanternSprite(lantern.word, season);
      const w = img.width / state.tileScale;
      const h = img.height / state.tileScale;
      ctx.drawImage(img, cx - w / 2, y - h / 2, w, h);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawTraveler(view) {
      const s = Math.max(0.72, Math.min(1.15, state.H / 760));
      const x = view.px - view.camX;
      const gy = ground();
      const walk = view.walking ? view.walkT : 0;
      const sway = Math.sin(walk) * 7 * (view.walking ? 1 : 0);
      const bob = view.walking ? Math.abs(Math.sin(walk)) * 1.6 : 0;
      const ink = KuPaint.PALETTE[state.season].ink;
      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(s * view.facing, s);
      ctx.translate(0, -bob);
      ctx.strokeStyle = KuPaint.rgba(ink, 0.92);
      ctx.lineCap = "round";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-4, -26);
      ctx.lineTo(-6 - sway, 0);
      ctx.moveTo(4, -26);
      ctx.lineTo(6 + sway, 0);
      ctx.stroke();
      ctx.fillStyle = KuPaint.rgba(ink, 0.9);
      ctx.beginPath();
      ctx.moveTo(-10, -58);
      ctx.quadraticCurveTo(-13, -40, -12, -24);
      ctx.lineTo(12, -24);
      ctx.quadraticCurveTo(13, -40, 10, -58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(240,230,210,0.92)";
      ctx.beginPath();
      ctx.arc(0, -66, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = KuPaint.rgba(ink, 0.88);
      ctx.beginPath();
      ctx.moveTo(0, -84);
      ctx.lineTo(-9, -72);
      ctx.lineTo(9, -72);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -72, 22, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = KuPaint.rgba(ink, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, -52);
      ctx.lineTo(19 - sway * 0.2, 0);
      ctx.stroke();
      ctx.fillStyle = KuPaint.rgba("#c9566a", 0.8);
      ctx.beginPath();
      ctx.arc(19 - sway * 0.2, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSplashes(dt) {
      for (let i = state.drops.length - 1; i >= 0; i--) {
        const d = state.drops[i];
        d.life -= dt;
        if (d.life <= 0) { state.drops.splice(i, 1); continue; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 30 * dt;
        ctx.fillStyle = KuPaint.rgba(d.color, 0.5 * (d.life / d.max));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function splash(worldX, worldY, color, camX) {
      const rand = Math.random;
      const sx = worldX - camX;
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const v = 40 + rand() * 90;
        state.drops.push({ x: sx, y: worldY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: 1.5 + rand() * 3.5,
          life: 0.9 + rand() * 0.5, max: 1.2, color: color || "#2a2f2c" });
      }
    }

    function drawBloom(view) {
      if (!view.bloom) return;
      const b = view.bloom;
      const season = state.season;
      const bloom = sprite("bloom|" + season, () => KuPaint.bloomSprite(season, state.tileScale));
      const size = (180 + 240 * smooth(b.t)) * 2;
      ctx.globalAlpha = 0.85 * (1 - smooth(b.t) * 0.7);
      ctx.drawImage(bloom, b.x - view.camX - size / 2, ground() - 70 - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    function drawMist(view) {
      if (!view.mistAlpha || view.mistAlpha <= 0) return;
      if (!state.mist) state.mist = KuPaint.mistSprite(Math.max(state.W * 2, 900), state.H, state.tileScale);
      const sx = view.mistX - view.camX;
      ctx.globalAlpha = Math.min(1, view.mistAlpha);
      ctx.drawImage(state.mist, sx, 0, state.mist.width / state.tileScale, state.H);
      ctx.globalAlpha = 1;
    }

    function frame(dt, view) {
      if (!state.W) return;
      dt = Math.min(0.05, Math.max(0, dt || 0));
      state.t += dt;
      ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
      ctx.clearRect(0, 0, state.W, state.H);
      setSeason(view.season, view.bloom ? view.bloom.x : undefined);
      advanceFade(dt);
      const season = state.fade ? state.fade.to : state.season;
      if (!state.particles.length) seedMotion(season);
      if (state.warmNeeded && state.season) {
        queueWarm(view.camX, season);
        state.warmNeeded = false;
      }
      runWarm();
      if (view.prefetch) prefetch(season, view.camX, view.prefetch);

      drawBackdrop(view);
      drawBirds(dt);
      const cam = view.camX;
      for (const inn of view.inns) {
        const sx = inn.x - cam;
        if (sx < -260 || sx > state.W + 260) continue;
        drawInn(inn.station, inn.name, sx, season);
      }
      drawFire(view);
      drawTileRow("road", season, 1, cam);
      drawTileRow("fore", season, 1, cam);
      drawGrass(cam, season);
      const visible = view.lanterns.filter(l => l.x - cam > -60 && l.x - cam < state.W + 60);
      for (const lantern of visible) {
        const near = Math.abs(lantern.x - view.px) < 120;
        drawLantern(lantern, cam, season, view.hint && view.hint.has(lantern.id), near);
      }
      drawParticles(dt, season);
      drawTraveler(view);
      drawRain(view);
      drawMist(view);
      drawBloom(view);
      drawSplashes(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    return {
      resize: resize,
      frame: frame,
      splash: splash,
      setSeason: setSeason,
      setReduced: function (value) { state.reduced = !!value; state.cache.clear(); seedMotion(state.season || "春"); },
      currentSeason: function () { return state.fade ? state.fade.to : state.season; },
      ground: ground,
      width: function () { return state.W; },
      height: function () { return state.H; }
    };
  }

  window.KuScene = { create: create, LAYERS: LAYERS };
})();
