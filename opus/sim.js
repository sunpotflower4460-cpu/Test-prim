/* MIZUHO — 瑞穂 / simulation core.
   Pure, deterministic and DOM-free so the same code runs the game and the
   Node tests. The world is a height field: bedrock, soil on top of it and a
   shallow-water layer moved by the virtual-pipes model. Rice is planted on
   water that stands still and shallow, and grows while it stays that way. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MizuhoSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- tuning ------------------------------------------------------------
  const K = Object.freeze({
    G: 9.8,              // gravity in the pipes model
    DT: 1 / 30,          // fixed water substep (game seconds)
    DAMP: 0.992,         // flux damping, removes ringing on still pools
    EDGE_DROP: 0.6,      // how far below the rim an open edge drains to
    MIN_WATER: 1e-4,
    TALUS: 1.5,          // steepest soil step between neighbours before it slumps
    TALUS_WET: 1.1,      // soaked soil slumps sooner
    SLUMP_RATE: 0.12,
    TRENCH: 0.6,         // one swipe of 掘る goes at most this far below the ground beside it
    PLANT_MIN: 0.045,    // shallow enough to wade, deep enough to keep roots wet
    PLANT_MAX: 0.5,
    GROW_MIN: 0.02,
    GROW_MAX: 0.75,      // deeper than this the seedlings drown
    FLAT: 0.14,          // largest step to a neighbour that still counts as a flat paddy
    STILL: 0.55,         // outflow per depth above which the water is a stream, not a paddy
    STRESS_MAX: 12,      // game seconds of drought or drowning before a plant is lost
    GROW_TIME: 0.62,     // fraction of the year a healthy plant needs to ripen
    PLANT_UNTIL: 0.3,    // late planting allowed until this point of the year
    CELLS_PER_BALE: 8,
    YEAR: 120,           // game seconds from planting to harvest
    DIG_RATE: 1.2,
    HEAP_RATE: 7,        // how fast a swipe of 盛る reaches its height
    AZE: 0.32,           // one swipe of 盛る rises this far above the highest ground beside it
    LEVEL_RATE: 5.5,
    HOUSE_FLOOD: 0.18,   // water depth on a house that soaks it
    HOUSE_SOAK: 2.2      // seconds of soaking before the house is damaged
  });

  // ---- phases of the year (fractions of K.YEAR) ----------------------------
  const PHASES = [
    { id: "early", name: "初夏", from: 0, to: 0.2 },
    { id: "rainy", name: "梅雨", from: 0.2, to: 0.42 },
    { id: "summer", name: "盛夏", from: 0.42, to: 0.75 },
    { id: "autumn", name: "秋", from: 0.75, to: 1 }
  ];
  function phaseAt(t) {
    for (const p of PHASES) if (t < p.to) return p;
    return PHASES[PHASES.length - 1];
  }

  // Plant states
  const NONE = 0, GROWING = 1, RIPE = 2, DEAD = 3;
  // Cell flags
  const F_HOUSE = 1, F_RIVER = 2, F_LOCK = 4, F_SPRING = 8, F_ROCK = 16, F_SEA = 32;

  // ---- deterministic noise ----------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNoise(seed) {
    const rnd = mulberry32(seed);
    const perm = new Uint8Array(512);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const s = p[i]; p[i] = p[j]; p[j] = s; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    function noise(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const a = perm[X] + Y, b = perm[X + 1] + Y;
      const n = (1 - v) * ((1 - u) * grad(perm[a], x, y) + u * grad(perm[b], x - 1, y)) +
        v * ((1 - u) * grad(perm[a + 1], x, y - 1) + u * grad(perm[b + 1], x - 1, y - 1));
      return n * 0.35;
    }
    function fbm(x, y, oct) {
      let s = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < (oct || 4); o++) { s += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
      return s / norm;
    }
    return { noise, fbm, rnd };
  }

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---- world ---------------------------------------------------------------
  function create(level) {
    const W = level.w, H = level.h, N = W * H;
    const ground = new Float32Array(N), bed = new Float32Array(N), water = new Float32Array(N);
    const fl = new Float32Array(N), fr = new Float32Array(N), ft = new Float32Array(N), fb = new Float32Array(N);
    const flags = new Uint8Array(N), plant = new Uint8Array(N);
    const grow = new Float32Array(N), stress = new Float32Array(N), suit = new Float32Array(N);
    const disturb = new Float32Array(N), wet = new Float32Array(N), flow = new Float32Array(N);
    const noise = makeNoise(level.seed || 1);

    // Terrain comes from the level as a function of the cell.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = level.terrain(x, y, noise, { W, H, smooth, clamp });
      ground[i] = c.ground;
      bed[i] = Math.min(c.ground, c.bed === undefined ? c.ground - 2.5 : c.bed);
      if (c.water) water[i] = c.water;
      if (c.rock) flags[i] |= F_ROCK;
      if (c.sea) flags[i] |= F_SEA | F_LOCK;
    }
    const houses = (level.houses || []).map(h => ({ x: h.x, y: h.y, w: h.w || 3, h: h.h || 3, rot: h.rot || 0, kind: h.kind || "minka", soak: 0, damaged: false }));
    for (const h of houses) {
      // Houses sit on a level plinth so they read as built, not floating.
      let avg = 0, n = 0;
      for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) { avg += ground[y * W + x]; n++; }
      avg = avg / n + 0.15; h.base = avg; // a raised stone plinth sheds sheet runoff
      for (let y = h.y - 1; y <= h.y + h.h; y++) for (let x = h.x - 1; x <= h.x + h.w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        const inside = x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h;
        if (inside) { ground[i] = avg; bed[i] = avg; flags[i] |= F_HOUSE; }
        flags[i] |= F_LOCK;
      }
    }
    const springs = (level.springs || []).map(s => ({ x: s.x, y: s.y, rate: s.rate, drought: s.drought === undefined ? 1 : s.drought }));
    for (const s of springs) {
      for (let y = s.y - 1; y <= s.y + 1; y++) for (let x = s.x - 1; x <= s.x + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        flags[y * W + x] |= F_LOCK;
      }
      flags[s.y * W + s.x] |= F_SPRING;
    }
    const river = level.river || null; // { cells:[i], depth, flood }
    if (river) for (const i of river.cells) { flags[i] |= F_RIVER | F_LOCK; }
    const edges = Object.assign({ n: false, s: true, e: false, w: false }, level.edges || {});

    const world = {
      level, W, H, N, K, ground, bed, water, fl, fr, ft, fb, flags, plant, grow, stress, suit,
      disturb, wet, flow, houses, springs, river, edges,
      basket: level.basket || 0, cap: level.cap || 260,
      started: false, t: 0, time: 0, finished: false,
      clock: 0, riceClock: 0, slumpClock: 0,
      undoStack: [], stroke: null,
      lost: 0, sourced: 0, rained: 0, evaporated: 0, events: [],
      counts: { suitable: 0, growing: 0, ripe: 0, dead: 0, planted: 0 },
      terrainVersion: 0
    };
    // Initial calm: let the authored water settle so ponds and rivers start full.
    if (level.settle) for (let k = 0; k < level.settle; k++) waterStep(world, K.DT, true);
    updateRice(world, 0);
    return world;
  }

  // ---- calendar ------------------------------------------------------------
  function rainAt(w) {
    if (!w.started) return w.level.springRain || 0;
    const p = phaseAt(w.t);
    const r = w.level.rain || {};
    if (p.id === "rainy") {
      // Swells to a peak in the middle of the season, like a real tsuyu front.
      const k = (w.t - p.from) / (p.to - p.from);
      return (r.rainy === undefined ? 0.004 : r.rainy) * (0.45 + 0.9 * Math.sin(Math.PI * k));
    }
    if (p.id === "summer") return r.summer || 0;
    if (p.id === "early") return r.early || 0;
    return r.autumn || 0;
  }
  function springFactor(w, s) {
    if (!w.started) return 1;
    const p = phaseAt(w.t);
    if (p.id === "summer") return s.drought;
    if (p.id === "autumn") return Math.max(s.drought, 0.6);
    return 1;
  }
  function evapAt(w) {
    const base = w.level.evap === undefined ? 0.0042 : w.level.evap;
    if (!w.started) return base;
    const p = phaseAt(w.t);
    if (p.id === "rainy") return base * 0.35;
    if (p.id === "summer") return base * (w.level.heat || 1.45);
    if (p.id === "autumn") return base * 0.8;
    return base;
  }
  function riverDepthAt(w) {
    const r = w.river;
    if (!r) return 0;
    if (!w.started) return r.depth;
    const p = phaseAt(w.t);
    if (p.id === "rainy" && r.flood) {
      const k = (w.t - p.from) / (p.to - p.from);
      return r.depth + r.flood * Math.sin(Math.PI * clamp(k * 1.15, 0, 1));
    }
    return r.depth;
  }

  // ---- water: virtual pipes -------------------------------------------------
  function waterStep(w, dt, quiet) {
    const { W, H, ground, water, fl, fr, ft, fb, edges } = w;
    const g = K.G * dt, damp = K.DAMP;
    // 1. fluxes
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        const d = water[i];
        const hi = ground[i] + d;
        let l, r, t, b;
        if (x > 0) { l = fl[i] * damp + g * (hi - ground[i - 1] - water[i - 1]); } else l = edges.w ? fl[i] * damp + g * (d + K.EDGE_DROP) : 0;
        if (x < W - 1) { r = fr[i] * damp + g * (hi - ground[i + 1] - water[i + 1]); } else r = edges.e ? fr[i] * damp + g * (d + K.EDGE_DROP) : 0;
        if (y > 0) { t = ft[i] * damp + g * (hi - ground[i - W] - water[i - W]); } else t = edges.n ? ft[i] * damp + g * (d + K.EDGE_DROP) : 0;
        if (y < H - 1) { b = fb[i] * damp + g * (hi - ground[i + W] - water[i + W]); } else b = edges.s ? fb[i] * damp + g * (d + K.EDGE_DROP) : 0;
        if (l < 0) l = 0; if (r < 0) r = 0; if (t < 0) t = 0; if (b < 0) b = 0;
        const out = (l + r + t + b) * dt;
        if (out > d) {
          const s = out > 0 ? d / out : 0;
          l *= s; r *= s; t *= s; b *= s;
        }
        fl[i] = l; fr[i] = r; ft[i] = t; fb[i] = b;
      }
    }
    // 2. depths
    let lost = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        let inflow = 0;
        if (x > 0) inflow += fr[i - 1];
        if (x < W - 1) inflow += fl[i + 1];
        if (y > 0) inflow += fb[i - W];
        if (y < H - 1) inflow += ft[i + W];
        const outflow = fl[i] + fr[i] + ft[i] + fb[i];
        if (x === 0) lost += fl[i]; if (x === W - 1) lost += fr[i];
        if (y === 0) lost += ft[i]; if (y === H - 1) lost += fb[i];
        let d = water[i] + dt * (inflow - outflow);
        if (d < K.MIN_WATER) d = d < 0 ? 0 : d * 0.5;
        water[i] = d;
      }
    }
    w.lost += lost * dt;
    if (quiet) return;
    // 3. sources and sinks
    const rain = rainAt(w) * dt;
    const evap = evapAt(w) * dt;
    const { flags, N } = w;
    let ev = 0;
    for (let i = 0; i < N; i++) {
      let d = water[i] + rain;
      // a running film loses little; standing water loses the full rate
      if (d > 0) { const e = Math.min(d, evap * (d < 0.06 ? 0.25 + d * 12.5 : 1)); d -= e; ev += e; }
      water[i] = d;
    }
    w.rained += rain * N; w.evaporated += ev;
    for (const s of w.springs) {
      const q = s.rate * springFactor(w, s) * dt;
      water[s.y * W + s.x] += q; w.sourced += q;
    }
    if (w.river) {
      const rd = riverDepthAt(w);
      for (const i of w.river.cells) {
        // The river carries water away (and in flood, brings it up the banks).
        const target = rd - (ground[i] - w.river.floor);
        water[i] = target > 0 ? target : 0;
      }
    }
    // Sea cells hold a fixed level.
    if (w.level.seaLevel !== undefined) {
      for (let i = 0; i < N; i++) if (flags[i] & F_SEA) { const d = w.level.seaLevel - ground[i]; water[i] = d > 0 ? d : 0; }
    }
  }

  // Soil slumps when a step is steeper than it can hold, so mounds look like earth.
  function slump(w) {
    const { W, H, ground, bed, flags, water } = w;
    let moved = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (flags[i] & (F_LOCK)) continue;
      let soil = ground[i] - bed[i];
      if (soil <= 0.001) continue;
      const talus = water[i] > 0.05 ? K.TALUS_WET : K.TALUS;
      for (let k = 0; k < 4; k++) {
        let n;
        if (k === 0) { if (x === 0) continue; n = i - 1; }
        else if (k === 1) { if (x === W - 1) continue; n = i + 1; }
        else if (k === 2) { if (y === 0) continue; n = i - W; }
        else { if (y === H - 1) continue; n = i + W; }
        if (flags[n] & (F_HOUSE | F_SEA)) continue;
        const diff = ground[i] - ground[n];
        if (diff > talus) {
          const m = Math.min(soil, (diff - talus) * K.SLUMP_RATE);
          ground[i] -= m; ground[n] += m; soil -= m; moved = true;
          w.disturb[n] = Math.max(w.disturb[n], 0.5);
        }
      }
    }
    if (moved) w.terrainVersion++;
  }

  // ---- rice -----------------------------------------------------------------
  // Flat means the floor under the paddy water is level. Dry neighbours are the
  // bank or the ridge (aze) that holds the water in, so they do not count.
  function isFlat(w, i) {
    const { W, H, ground, water } = w;
    const x = i % W, y = (i / W) | 0, g = ground[i], wet = K.PLANT_MIN * 0.5;
    if (x > 0 && water[i - 1] > wet && Math.abs(g - ground[i - 1]) > K.FLAT) return false;
    if (x < W - 1 && water[i + 1] > wet && Math.abs(g - ground[i + 1]) > K.FLAT) return false;
    if (y > 0 && water[i - W] > wet && Math.abs(g - ground[i - W]) > K.FLAT) return false;
    if (y < H - 1 && water[i + W] > wet && Math.abs(g - ground[i + W]) > K.FLAT) return false;
    return true;
  }
  function stillness(w, i) {
    return (w.fl[i] + w.fr[i] + w.ft[i] + w.fb[i]) / (w.water[i] + 0.03);
  }
  function plantable(w, i) {
    const d = w.water[i];
    if (d < K.PLANT_MIN || d > K.PLANT_MAX) return false;
    if (w.flags[i] & (F_HOUSE | F_RIVER | F_SPRING | F_SEA | F_ROCK)) return false;
    if (w.ground[i] - w.bed[i] < 0.12) return false; // bare rock cannot hold roots
    if (!isFlat(w, i)) return false;
    return stillness(w, i) < K.STILL;
  }
  // Why standing water is not a paddy yet: it lets the game explain itself.
  function whyNot(w, i) {
    const d = w.water[i];
    if (d < K.PLANT_MIN) return null;
    if (w.flags[i] & (F_HOUSE | F_RIVER | F_SPRING | F_SEA)) return null;
    if (w.ground[i] - w.bed[i] < 0.12 || (w.flags[i] & F_ROCK)) return "rock";
    if (!isFlat(w, i)) return null;
    if (d > K.PLANT_MAX) return "deep";
    if (stillness(w, i) >= K.STILL) return "flow";
    return null;
  }
  function updateRice(w, dt) {
    const { N, plant, grow, stress, suit, water } = w;
    let suitable = 0, growing = 0, ripe = 0, dead = 0, deep = 0, flow = 0, rock = 0;
    const diagnose = !w.started;
    const canPlant = w.started && w.t <= K.PLANT_UNTIL;
    const rate = 1 / (K.GROW_TIME * K.YEAR);
    const lateFactor = w.started ? 1 : 0;
    let newly = 0;
    for (let i = 0; i < N; i++) {
      const p = plant[i];
      if (p === NONE) {
        if (plantable(w, i)) {
          suit[i] = Math.min(4, suit[i] + Math.max(dt, 0.05));
          suitable++;
          if (canPlant && suit[i] > 0.8) { plant[i] = GROWING; grow[i] = 0.02; stress[i] = 0; newly++; growing++; }
        } else {
          suit[i] = Math.max(0, suit[i] - Math.max(dt, 0.05) * 2);
          if (diagnose) { const why = whyNot(w, i); if (why === "deep") deep++; else if (why === "flow") flow++; else if (why === "rock") rock++; }
        }
      } else if (p === GROWING) {
        const d = water[i];
        if (d >= K.GROW_MIN && d <= K.GROW_MAX) {
          grow[i] += rate * dt * lateFactor;
          stress[i] = Math.max(0, stress[i] - dt * 0.6);
        } else if (w.started && w.t < 0.82) {
          // Late in autumn the ears are full; drained fields are how a harvest is prepared.
          stress[i] += dt * (d < K.GROW_MIN ? 1 : 1.25);
          // a field that dried only lately is still moist: the plant keeps growing a little
          if (stress[i] < 4 && d < K.GROW_MIN) grow[i] += rate * dt * 0.6;
        }
        if (stress[i] > K.STRESS_MAX) { plant[i] = DEAD; dead++; w.events.push({ type: "wilt", i }); continue; }
        if (grow[i] >= 1) { grow[i] = 1; plant[i] = RIPE; ripe++; continue; }
        growing++;
      } else if (p === RIPE) ripe++;
      else dead++;
    }
    if (newly) w.events.push({ type: "plant", n: newly });
    w.counts.suitable = suitable; w.counts.growing = growing; w.counts.ripe = ripe; w.counts.dead = dead;
    w.counts.deep = deep; w.counts.flow = flow; w.counts.rock = rock;
    w.counts.planted = growing + ripe;
  }

  function updateHouses(w, dt) {
    const { W, water } = w;
    for (const h of w.houses) {
      if (h.damaged) continue;
      let deep = 0;
      for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) deep = Math.max(deep, water[y * W + x]);
      h.depth = deep;
      if (deep > K.HOUSE_FLOOD) {
        h.soak += dt;
        if (h.soak > K.HOUSE_SOAK) { h.damaged = true; w.events.push({ type: "flood", house: h }); }
      } else h.soak = Math.max(0, h.soak - dt * 0.5);
    }
  }

  // ---- stepping ---------------------------------------------------------------
  function step(w, seconds) {
    if (w.finished) return;
    w.clock += seconds;
    let steps = 0;
    while (w.clock >= K.DT && steps < 240) {
      w.clock -= K.DT; steps++;
      waterStep(w, K.DT, false);
      w.time += K.DT;
      if (w.started && !w.hold) {
        w.t = Math.min(1, w.t + K.DT / K.YEAR);
      }
      w.slumpClock += K.DT;
      if (w.slumpClock >= 0.2) { w.slumpClock = 0; slump(w); }
      w.riceClock += K.DT;
      if (w.riceClock >= 0.25 && !w.hold) {
        const dt = w.riceClock; w.riceClock = 0;
        updateRice(w, dt); updateHouses(w, dt);
        for (let i = 0; i < w.N; i++) {
          if (w.disturb[i] > 0) w.disturb[i] = Math.max(0, w.disturb[i] - dt * 0.012);
          const target = w.water[i] > 0.01 ? 1 : 0;
          w.wet[i] += (target - w.wet[i]) * Math.min(1, dt * (target ? 1.5 : 0.08));
        }
      }
      if (w.started && w.t >= 1) { finish(w); break; }
    }
    if (w.clock > K.DT * 4) w.clock = 0; // never spiral after a long hitch
  }

  function start(w) {
    if (w.started) return;
    w.started = true; w.t = 0;
    w.undoStack.length = 0;
    updateRice(w, 1); // plants every field that is ready right now
  }

  function finish(w) {
    if (w.finished) return;
    updateRice(w, 0);
    w.finished = true;
    w.events.push({ type: "harvest" });
  }

  function result(w) {
    const bales = Math.floor(w.counts.ripe / K.CELLS_PER_BALE);
    const damaged = w.houses.filter(h => h.damaged).length;
    const goal = w.level.goal;
    const ok = bales >= goal && damaged === 0;
    let stars = 0;
    if (ok) { stars = 1; if (bales >= w.level.stars[0]) stars = 2; if (bales >= w.level.stars[1]) stars = 3; }
    return { bales, ripe: w.counts.ripe, damaged, goal, ok, stars };
  }

  // Bales the field would give if every healthy plant ripens (shown while it grows).
  function forecast(w) {
    if (!w.started) return Math.floor(w.counts.suitable / K.CELLS_PER_BALE);
    return Math.floor((w.counts.growing + w.counts.ripe) / K.CELLS_PER_BALE);
  }

  // ---- tools ----------------------------------------------------------------
  function beginStroke(w, tool, x, y) {
    w.undoStack.push({ ground: w.ground.slice(), basket: w.basket });
    if (w.undoStack.length > 30) w.undoStack.shift();
    const stroke = { tool, target: sampleGround(w, x, y), moved: 0, snap: w.undoStack[w.undoStack.length - 1].ground };
    w.stroke = stroke;
    return stroke;
  }
  function endStroke(w) {
    const s = w.stroke; w.stroke = null;
    if (s && s.moved < 0.01) w.undoStack.pop();
    return s;
  }
  function undo(w) {
    const u = w.undoStack.pop();
    if (!u) return false;
    w.ground.set(u.ground); w.basket = u.basket; w.terrainVersion++;
    return true;
  }
  function sampleGround(w, x, y) {
    const xi = clamp(Math.round(x), 0, w.W - 1), yi = clamp(Math.round(y), 0, w.H - 1);
    return w.ground[yi * w.W + xi];
  }
  function heapCap(w, snap, x, y) {
    let m = -Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const xx = x + ox, yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= w.W || yy >= w.H) continue;
      const g = snap[yy * w.W + xx];
      if (g > m) m = g;
    }
    return m + K.AZE;
  }
  function trenchFloor(w, snap, x, y) {
    let m = Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const xx = x + ox, yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= w.W || yy >= w.H) continue;
      const g = snap[yy * w.W + xx];
      if (g < m) m = g;
    }
    return m - K.TRENCH;
  }
  function sculptable(w, i) { return !(w.flags[i] & F_LOCK); }

  // Applies a tool for dt seconds of the player's real time at (x, y) in cells.
  function brush(w, tool, x, y, radius, dt) {
    const { W, H, ground, bed } = w;
    const s = w.stroke || beginStroke(w, tool, x, y);
    const r = radius, r2 = r * r;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    let moved = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x, dy = yy - y, q = (dx * dx + dy * dy) / r2;
      if (q >= 1) continue;
      const i = yy * W + xx;
      if (!sculptable(w, i)) continue;
      const fall = (1 - q) * (1 - q);
      let delta = 0;
      if (tool === "dig") {
        const floor = trenchFloor(w, s.snap, xx, yy);
        delta = -Math.max(0, Math.min(K.DIG_RATE * dt * fall, ground[i] - bed[i], w.cap - w.basket, ground[i] - floor));
      } else if (tool === "heap") {
        // An aze rises one step above the highest ground next to it as the stroke began,
        // so a single swipe along the edge of a terrace makes a ridge that holds water.
        const cap = heapCap(w, s.snap, xx, yy);
        const want = (cap - ground[i]) * (1 - Math.exp(-K.HEAP_RATE * dt * (0.3 + 0.7 * fall)));
        if (want > 0) delta = Math.min(want, w.basket);
      } else if (tool === "level") {
        // Leveling shaves the high side and fills the low side toward one height.
        const want = (s.target - ground[i]) * (1 - Math.exp(-K.LEVEL_RATE * dt * (0.25 + 0.75 * fall)));
        if (want < 0) delta = -Math.min(-want, ground[i] - bed[i], w.cap - w.basket);
        else delta = Math.min(want, w.basket);
      }
      if (delta === 0) continue;
      ground[i] += delta; w.basket -= delta; moved += Math.abs(delta);
      w.disturb[i] = Math.min(1, w.disturb[i] + Math.abs(delta) * 3 + 0.05);
    }
    if (w.basket < 0) w.basket = 0;
    if (moved > 0) { s.moved += moved; w.terrainVersion++; }
    return moved;
  }

  // Total soil in the world plus the basket: tools never create or destroy earth.
  function soilTotal(w) {
    let s = w.basket;
    for (let i = 0; i < w.N; i++) s += w.ground[i];
    return s;
  }
  function waterTotal(w) {
    let s = 0;
    for (let i = 0; i < w.N; i++) s += w.water[i];
    return s;
  }

  return {
    K, PHASES, phaseAt, create, step, start, finish, result, forecast,
    brush, beginStroke, endStroke, undo, sampleGround, soilTotal, waterTotal,
    rainAt, riverDepthAt, plantable, whyNot, makeNoise, smooth, clamp,
    NONE, GROWING, RIPE, DEAD, F_HOUSE, F_RIVER, F_LOCK, F_SPRING, F_ROCK, F_SEA
  };
});
