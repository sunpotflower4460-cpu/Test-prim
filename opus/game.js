/* MIZUHO — 瑞穂 / controller.
   Screens, input, camera, seasons, effects and saving. The simulation and
   the renderer know nothing about the page; this file joins them. */
(function () {
  "use strict";
  const Sim = window.MizuhoSim, Levels = window.MizuhoLevels, Script = window.MizuhoScript;
  const $ = s => document.querySelector(s);
  const view = $("#view"), fxCanvas = $("#fx"), fx = fxCanvas.getContext("2d");
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SAVE_KEY = "mizuho-opus55-v1";
  const KANJI_NO = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  // ---- save ------------------------------------------------------------------------
  const save = (() => {
    let data = { unlocked: 0, stars: {}, best: {}, sound: true, plays: 0 };
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* private mode */ }
    if (typeof data.unlocked !== "number" || data.unlocked < 0) data.unlocked = 0;
    data.unlocked = Math.min(data.unlocked, Levels.LEVELS.length - 1);
    return {
      data,
      write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ } }
    };
  })();

  // ---- renderer and sound --------------------------------------------------------------
  const R = window.MizuhoRender.create(view);
  if (!R) {
    const f = document.createElement("div");
    f.className = "fallback";
    f.innerHTML = "<p>この箱庭を描くには WebGL2 が必要です。<br>別のブラウザか端末で、もう一度ひらいてください。<br><br><a href=\"../index.html\">‹ Test prim へ戻る</a></p>";
    document.body.appendChild(f);
    $("#curtain").classList.add("open");
    return;
  }
  const audio = window.MizuhoAudio.create();
  audio.enabled = save.data.sound !== false;

  // ---- seasons as light ---------------------------------------------------------------
  const PAL = {
    spring: { sun: [0.62, 0.48], sunCol: [1.0, 0.92, 0.84], skyTop: [0.42, 0.6, 0.84], skyHorizon: [0.94, 0.86, 0.86], groundAmb: [0.36, 0.33, 0.3], fog: [0.84, 0.82, 0.84], fogDen: 0.00248,
      grass: [0.47, 0.6, 0.3], grassDry: [0.6, 0.6, 0.36], earth: [0.48, 0.36, 0.25], stone: [0.62, 0.6, 0.56], mud: [0.36, 0.3, 0.2], waterDeep: [0.12, 0.25, 0.3], waterShallow: [0.42, 0.5, 0.42], mount: [0.5, 0.58, 0.66],
      leaves: [[0.2, 0.32, 0.2], [0.46, 0.64, 0.32], [0.98, 0.76, 0.84], [0.56, 0.7, 0.34]], night: 0 },
    early: { sun: [0.9, 0.5], sunCol: [1.04, 1.0, 0.92], skyTop: [0.34, 0.58, 0.9], skyHorizon: [0.82, 0.9, 0.95], groundAmb: [0.32, 0.36, 0.3], fog: [0.78, 0.86, 0.9], fogDen: 0.0022,
      grass: [0.36, 0.58, 0.22], grassDry: [0.5, 0.6, 0.3], earth: [0.46, 0.35, 0.24], stone: [0.6, 0.6, 0.56], mud: [0.33, 0.29, 0.2], waterDeep: [0.1, 0.24, 0.3], waterShallow: [0.38, 0.5, 0.4], mount: [0.42, 0.55, 0.62],
      leaves: [[0.18, 0.32, 0.18], [0.34, 0.56, 0.24], [0.4, 0.58, 0.3], [0.42, 0.6, 0.28]], night: 0 },
    rainy: { sun: [0.95, 0.6], sunCol: [0.62, 0.66, 0.7], skyTop: [0.46, 0.5, 0.55], skyHorizon: [0.66, 0.7, 0.72], groundAmb: [0.34, 0.37, 0.38], fog: [0.6, 0.64, 0.66], fogDen: 0.00605,
      grass: [0.3, 0.5, 0.24], grassDry: [0.36, 0.52, 0.28], earth: [0.38, 0.3, 0.22], stone: [0.5, 0.52, 0.52], mud: [0.28, 0.26, 0.2], waterDeep: [0.12, 0.2, 0.24], waterShallow: [0.36, 0.44, 0.42], mount: [0.42, 0.47, 0.5],
      leaves: [[0.15, 0.28, 0.17], [0.28, 0.48, 0.24], [0.32, 0.5, 0.28], [0.34, 0.52, 0.26]], night: 0 },
    summer: { sun: [1.02, 0.42], sunCol: [1.12, 1.04, 0.9], skyTop: [0.2, 0.46, 0.88], skyHorizon: [0.82, 0.9, 0.96], groundAmb: [0.3, 0.34, 0.28], fog: [0.76, 0.85, 0.92], fogDen: 0.00193,
      grass: [0.3, 0.52, 0.16], grassDry: [0.52, 0.56, 0.26], earth: [0.5, 0.38, 0.24], stone: [0.64, 0.62, 0.56], mud: [0.36, 0.3, 0.2], waterDeep: [0.08, 0.22, 0.3], waterShallow: [0.36, 0.5, 0.42], mount: [0.38, 0.52, 0.64],
      leaves: [[0.14, 0.28, 0.14], [0.26, 0.48, 0.18], [0.3, 0.5, 0.2], [0.32, 0.52, 0.2]], night: 0 },
    autumn: { sun: [0.5, 0.36], sunCol: [1.12, 0.86, 0.6], skyTop: [0.38, 0.52, 0.78], skyHorizon: [0.98, 0.82, 0.64], groundAmb: [0.36, 0.3, 0.26], fog: [0.9, 0.8, 0.7], fogDen: 0.00248,
      grass: [0.56, 0.54, 0.28], grassDry: [0.68, 0.56, 0.3], earth: [0.52, 0.38, 0.24], stone: [0.64, 0.6, 0.54], mud: [0.4, 0.32, 0.2], waterDeep: [0.14, 0.22, 0.3], waterShallow: [0.5, 0.48, 0.38], mount: [0.52, 0.5, 0.58],
      leaves: [[0.2, 0.3, 0.18], [0.84, 0.56, 0.2], [0.78, 0.42, 0.24], [0.86, 0.26, 0.12]], night: 0 },
    night: { sun: [0.18, 0.2], sunCol: [0.9, 0.56, 0.4], skyTop: [0.1, 0.12, 0.24], skyHorizon: [0.62, 0.38, 0.38], groundAmb: [0.16, 0.16, 0.24], fog: [0.36, 0.28, 0.34], fogDen: 0.0033,
      grass: [0.4, 0.4, 0.24], grassDry: [0.5, 0.44, 0.26], earth: [0.4, 0.3, 0.22], stone: [0.5, 0.48, 0.46], mud: [0.3, 0.24, 0.18], waterDeep: [0.06, 0.08, 0.16], waterShallow: [0.3, 0.26, 0.3], mount: [0.24, 0.22, 0.32],
      leaves: [[0.14, 0.2, 0.14], [0.6, 0.38, 0.16], [0.56, 0.3, 0.2], [0.64, 0.2, 0.1]], night: 1 }
  };
  const lerp = (a, b, k) => a + (b - a) * k;
  function mixPal(a, b, k) {
    const o = {};
    for (const key in a) {
      const va = a[key], vb = b[key];
      if (Array.isArray(va)) o[key] = Array.isArray(va[0]) ? va.map((x, i) => x.map((y, j) => lerp(y, vb[i][j], k))) : va.map((x, i) => lerp(x, vb[i], k));
      else o[key] = lerp(va, vb, k);
    }
    return o;
  }
  function seasonOf(w) {
    if (!w) return { a: "spring", b: "spring", k: 0, id: "spring" };
    if (w.festival) return { a: "night", b: "night", k: 0, id: "night" };
    if (!w.started) return { a: "spring", b: "spring", k: 0, id: "spring" };
    if (w.finished) return { a: "autumn", b: "night", k: Math.min(1, state.harvestClock / 4), id: "night" };
    const t = w.t, P = Sim.PHASES;
    const ids = ["early", "rainy", "summer", "autumn"];
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (t < p.to) {
        const edge = 0.035;
        if (i < P.length - 1 && t > p.to - edge) return { a: ids[i], b: ids[i + 1], k: (t - (p.to - edge)) / edge * 0.5, id: ids[i] };
        if (i > 0 && t < p.from + edge) return { a: ids[i - 1], b: ids[i], k: 0.5 + (t - p.from) / edge * 0.5, id: ids[i] };
        return { a: ids[i], b: ids[i], k: 0, id: ids[i] };
      }
    }
    return { a: "autumn", b: "autumn", k: 0, id: "autumn" };
  }
  function environment(w, time) {
    const s = seasonOf(w);
    const p = mixPal(PAL[s.a], PAL[s.b], Math.max(0, Math.min(1, s.k)));
    const elev = p.sun[1], az = p.sun[0] + (state.cam ? 0 : 0);
    p.sun = [Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev) * 0.6 + 0.4];
    const l = Math.hypot(...p.sun); p.sun = p.sun.map(v => v / l);
    p.time = time;
    p.rain = w ? Math.min(1, Sim.rainAt(w) / 0.0045) : 0;
    p.season = s.id;
    return p;
  }

  // ---- state ------------------------------------------------------------------------------
  const state = {
    screen: "title", world: null, level: null, levelIndex: 0,
    tool: "heap", size: 0, speed: 1, paused: false,
    cam: null, camGoal: null, showcase: null,
    pointers: new Map(), sculpt: null, hover: null, gesture: null,
    hintsShown: new Set(), hintTimer: 0, lastHud: 0, harvestClock: 0, resultShown: false,
    particles: [], seasonId: "spring", warned: false, prevCounts: null, time: 0, toastTimer: 0,
    marksDone: new Set(), lastSuitable: 0
  };
  const SIZES = [1.6, 2.7];

  function defaultCam(w) {
    let sum = 0; for (let i = 0; i < w.N; i++) sum += w.ground[i];
    const avg = sum / w.N;
    const aspect = view.clientWidth / Math.max(1, view.clientHeight);
    const span = Math.max(w.W, w.H);
    const fit = aspect < 1 ? 1.05 / Math.max(0.5, aspect) : 1.05;
    return { target: [w.W / 2 - 0.5, avg, w.H / 2 - 0.5 + span * 0.04], yaw: w.level.yaw || 0, pitch: w.level.pitch || 0.86, dist: span * 1.05 * fit, fov: 0.72, shiftY: aspect < 1 ? 0.06 : 0 };
  }

  // Pull the camera back until the whole block of earth sits between the HUD and the toolbar.
  function fitCam(cam, w, insets) {
    const cw = view.clientWidth, ch = view.clientHeight;
    if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < w.N; i++) { mn = Math.min(mn, w.ground[i]); mx = Math.max(mx, w.ground[i]); }
    const pts = [];
    for (const x of [0, w.W - 1]) for (const z of [0, w.H - 1]) for (const y of [mn - 2, mx + 1]) pts.push([x, y, z]);
    // also the middle of each edge, at its real height
    for (let k = 0; k <= 8; k++) {
      const x = Math.round((w.W - 1) * k / 8), z = Math.round((w.H - 1) * k / 8);
      pts.push([x, w.ground[x], 0], [x, w.ground[(w.H - 1) * w.W + x], w.H - 1], [0, w.ground[z * w.W], z], [w.W - 1, w.ground[z * w.W + w.W - 1], z]);
    }
    const fits = d => {
      cam.dist = d; R.camera(cam);
      for (const p of pts) {
        const q = R.project(p[0], p[1], p[2]);
        if (!q || q.x < insets.left || q.x > cw - insets.right || q.y < insets.top || q.y > ch - insets.bottom) return false;
      }
      return true;
    };
    let lo = Math.max(w.W, w.H) * 0.4, hi = Math.max(w.W, w.H) * 6;
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    cam.dist = hi;
    return cam;
  }
  function playCam(w) {
    const cam = defaultCam(w);
    const cw = view.clientWidth, ch = view.clientHeight, landscape = cw > ch;
    const insets = landscape ? { top: 58, bottom: 12, left: Math.min(160, cw * 0.16), right: 92 } : { top: 140, bottom: 96, left: 8, right: 8 };
    // aim between the insets, then fit
    cam.shiftY = landscape ? 0.06 : ((insets.bottom - insets.top) / ch);
    return fitCam(cam, w, insets);
  }

  // ---- screens ----------------------------------------------------------------------------
  const screens = { title: $("#title"), select: $("#select"), play: $("#play") };
  function show(name) {
    state.screen = name;
    for (const k in screens) screens[k].hidden = k !== name;
    document.body.dataset.screen = name;
  }

  function loadWorld(level) {
    const w = Sim.create(level);
    R.setWorld(w);
    return w;
  }

  // The title shows an old terraced valley, in the season of the month you open it.
  function titleSeason() {
    const m = new Date().getMonth();
    if (m >= 8 && m <= 10) return { t: 0.86, grow: 1 };
    if (m === 7) return { t: 0.55, grow: 0.7 };
    if (m === 5 || m === 6) return { t: 0.3, grow: 0.3 };
    return null; // spring and winter: the paddies are flooded mirrors, waiting
  }
  function titleCam(w) {
    const cam = defaultCam(w); cam.pitch = 0.46; cam.yaw = -0.3;
    const portrait = view.clientHeight > view.clientWidth;
    cam.dist *= portrait ? 1.12 : 1.55;
    cam.shiftY = portrait ? 0.3 : 0.2;
    // wide screens: the words on the left, the valley on the right
    if (view.clientWidth >= 900 && !portrait && view.clientHeight >= 560) { cam.shiftX = 0.34; cam.shiftY = 0.05; cam.dist *= 0.97; }
    return cam;
  }
  function enterTitle() {
    closeModal();
    show("title");
    const lv = Levels.SHOWCASE;
    if (!state.titleWorld) {
      const w = Sim.create(lv);
      const season = titleSeason();
      if (season) {
        Sim.start(w);
        w.t = season.t;
        for (let i = 0; i < w.N; i++) if (w.plant[i]) { w.grow[i] = season.grow; if (season.grow >= 1) w.plant[i] = Sim.RIPE; }
        Sim.step(w, 0.3);
      }
      w.hold = true;
      // once every valley is farmed, the title is the harvest-moon night of the village
      if (Object.keys(save.data.stars).length >= Levels.LEVELS.length) {
        if (!season) { Sim.start(w); for (let i = 0; i < w.N; i++) if (w.plant[i]) { w.grow[i] = 1; w.plant[i] = Sim.RIPE; } }
        w.t = 0.9; w.festival = true;
      }
      state.titleWorld = w;
      state.lanterns = null;
    }
    const w = state.titleWorld;
    R.setWorld(w);
    state.world = w; state.level = lv;
    state.showcase = true;
    state.cam = titleCam(w);
    state.camGoal = null;
    const st = Object.values(save.data.stars).reduce((a, b) => a + b, 0);
    const cleared = Object.keys(save.data.stars).length;
    $("#titleRecord").textContent = cleared ? `ひらいた谷 ${cleared} / ${Levels.LEVELS.length}　·　穂 ${st} / ${Levels.LEVELS.length * 3}` : "谷は、まだ眠っている。";
    $("#startBtn span").textContent = cleared >= Levels.LEVELS.length ? "谷の暦をひらく" : cleared ? "つづきの谷へ" : "田をひらく";
  }

  function enterSelect() {
    closeModal();
    state.showcase = true;
    show("select");
    const list = $("#valleyList");
    list.innerHTML = "";
    let total = 0;
    Levels.LEVELS.forEach((lv, i) => {
      const locked = i > save.data.unlocked;
      const stars = save.data.stars[lv.id] || 0; total += stars;
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "valley" + (locked ? " locked" : "") + (i === save.data.unlocked && !save.data.stars[lv.id] ? " current" : "");
      b.disabled = locked;
      b.setAttribute("aria-label", `第${KANJI_NO[i]}の谷 ${lv.name}${locked ? "（まだ閉じている）" : ""}`);
      const cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
      b.appendChild(cv);
      const best = save.data.best[lv.id];
      b.insertAdjacentHTML("beforeend", `<div class="valley-body"><span class="valley-no">第${KANJI_NO[i]}の谷 · VALLEY ${String(i + 1).padStart(2, "0")}</span><span class="valley-name">${lv.name}<small>${lv.kana}</small></span><p class="valley-poem">${locked ? "まだ、霧の向こう。" : lv.poem.join("<br>")}</p><span class="valley-meta"><span>目標 ${lv.goal} 俵${best !== undefined ? "　·　最高 " + best + " 俵" : ""}</span><span class="valley-stars">${"<span>★</span>".repeat(stars)}${"<span class=\"off\">★</span>".repeat(3 - stars)}</span></span></div>`);
      b.addEventListener("click", () => { audio.unlock(); audio.event("select"); startLevel(i); });
      li.appendChild(b); list.appendChild(li);
      requestAnimationFrame(() => drawThumb(cv, lv));
    });
    $("#selectProgress").textContent = `穂 ${total} / ${Levels.LEVELS.length * 3}　·　ひらいた谷 ${Object.keys(save.data.stars).length} / ${Levels.LEVELS.length}`;
  }

  // A shaded relief of the valley at the card's own resolution, drawn once per card.
  const thumbCache = new Map();
  function drawThumb(cv, lv) {
    const ctx = cv.getContext("2d");
    let img = thumbCache.get(lv.id);
    if (!img) {
      const w = Sim.create(lv);
      for (let k = 0; k < 6; k++) Sim.step(w, 1);
      const TW = cv.width, TH = cv.height, W = w.W, H = w.H;
      const s = Math.min((W - 1) / TW, (H - 1) / TH) * 0.98; // cells per pixel, cover the card
      const ox = (W - 1 - TW * s) / 2, oy = (H - 1 - TH * s) / 2;
      const id = ctx.createImageData(TW, TH);
      const at = (arr, x, y) => {
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1), fx = x - x0, fy = y - y0;
        return (arr[y0 * W + x0] * (1 - fx) + arr[y0 * W + x1] * fx) * (1 - fy) + (arr[y1 * W + x0] * (1 - fx) + arr[y1 * W + x1] * fx) * fy;
      };
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < w.N; i++) { mn = Math.min(mn, w.ground[i]); mx = Math.max(mx, w.ground[i]); }
      for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
        const x = ox + px * s, y = oy + py * s;
        const g = at(w.ground, x, y), e = 0.6;
        const gx = at(w.ground, Math.min(W - 1, x + e), y) - at(w.ground, Math.max(0, x - e), y);
        const gy = at(w.ground, x, Math.min(H - 1, y + e)) - at(w.ground, x, Math.max(0, y - e));
        const sh = Math.max(0.45, Math.min(1.35, 0.92 - gx * 0.5 - gy * 0.62));
        const hgt = (g - mn) / (mx - mn + 1e-6);
        const i = Math.round(y) * W + Math.round(x);
        let r = 86 + 46 * hgt, gg = 128 + 40 * hgt, b = 66 + 18 * hgt;
        const soil = at(w.ground, x, y) - at(w.bed, x, y);
        if (soil < 0.15 || (w.flags[i] & Sim.F_ROCK)) { r = 150 + 30 * hgt; gg = 146 + 28 * hgt; b = 134 + 24 * hgt; }
        r *= sh; gg *= sh; b *= sh;
        // contour lines every unit of height, like an old survey map
        const f = g - Math.floor(g);
        if (f < 0.07) { r *= 0.82; gg *= 0.84; b *= 0.8; }
        const d = at(w.water, x, y);
        if (d > 0.01 || (w.flags[i] & Sim.F_SEA)) { const a = Math.min(0.9, 0.5 + d * 1.5); r = r * (1 - a) + 92 * a; gg = gg * (1 - a) + 150 * a; b = b * (1 - a) + 190 * a; }
        if (w.flags[i] & Sim.F_HOUSE) { r = 176; gg = 128; b = 82; }
        if (w.flags[i] & Sim.F_SPRING) { r = 235; gg = 248; b = 255; }
        // vignette
        const vx = px / TW - 0.5, vy = py / TH - 0.5, v = 1 - (vx * vx + vy * vy) * 0.9;
        const o = (py * TW + px) * 4;
        id.data[o] = r * v; id.data[o + 1] = gg * v; id.data[o + 2] = b * v; id.data[o + 3] = 255;
      }
      img = id; thumbCache.set(lv.id, img);
    }
    ctx.putImageData(img, 0, 0);
  }

  function prologue(then) {
    openDialog(`
      <p class="eyebrow">PROLOGUE</p>
      <h2>山の田</h2>
      <div class="letter">山の田は、もう十年も水を張っていません。<br>畦は崩れ、段は草に埋もれました。<br>それでも春になると、泉はいまも湧いています。<br>一枚でいい。もう一度、この谷に稲を。<cite>祖母 ハル</cite></div>
      <div class="dialog-actions"><button type="button" class="accent" data-dialog="go">谷へ向かう</button></div>`, { go: () => { save.data.prologue = true; save.write(); closeModal(); then(); } });
  }
  function startLevel(i) {
    if (i === 0 && !save.data.prologue) { prologue(() => startLevel(0)); return; }
    const lv = Levels.LEVELS[i];
    state.levelIndex = i; state.level = lv;
    state.world = loadWorld(lv);
    state.showcase = false;
    state.cam = playCam(state.world); state.camGoal = null;
    state.paused = false; state.speed = 1; state.harvestClock = 0; state.resultShown = false;
    state.hintsShown = new Set(); state.warned = false; state.marksDone = new Set(); state.particles.length = 0;
    state.sculpt = null; state.seasonId = "spring";
    const tools = lv.tools || ["heap", "dig", "level"];
    document.querySelectorAll(".tool[data-tool]").forEach(b => {
      const t = b.dataset.tool;
      b.classList.toggle("locked", t !== "look" && !tools.includes(t));
    });
    setTool(tools[0]);
    show("play");
    $("#hudNo").textContent = `第${KANJI_NO[i]}の谷`;
    $("#hudName").textContent = lv.name;
    $("#riceGoal").textContent = lv.goal;
    buildAlmanac();
    updateHud(true);
    save.data.plays++; save.write();
    openDialog(`
      <p class="eyebrow">第${KANJI_NO[i]}の谷 · VALLEY ${String(i + 1).padStart(2, "0")}</p>
      <h2>${lv.name}</h2>
      <p class="poem">${lv.poem.join("<br>")}</p>
      <p>${lv.brief}</p>
      <p class="keys">目標 ${lv.goal} 俵（${Sim.K.CELLS_PER_BALE} 区画で 1 俵）　·　★★ ${lv.stars[0]} 俵　·　★★★ ${lv.stars[1]} 俵</p>
      <div class="dialog-actions"><button type="button" class="accent" data-dialog="begin">谷に入る</button></div>`, { begin: () => { closeModal(); hintAt("start"); } });
  }

  // ---- HUD -----------------------------------------------------------------------------------
  function arcPath(a0, a1, r) {
    const p = a => [32 + Math.sin(a * Math.PI * 2) * r, 32 - Math.cos(a * Math.PI * 2) * r];
    const [x0, y0] = p(a0 + 0.006), [x1, y1] = p(a1 - 0.006);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function buildAlmanac() {
    const ids = { early: "#almEarly", rainy: "#almRainy", summer: "#almSummer", autumn: "#almAutumn" };
    for (const p of Sim.PHASES) $(ids[p.id]).setAttribute("d", arcPath(p.from, p.to, 22));
  }
  function updateHud(force) {
    const w = state.world;
    if (!w || state.screen !== "play") return;
    const lv = state.level;
    const fc = Sim.forecast(w);
    const ripeBales = Math.floor(w.counts.ripe / Sim.K.CELLS_PER_BALE);
    $("#riceLabel").textContent = !w.started ? "植えられる田" : w.finished ? "収穫" : w.t > 0.75 ? "実った稲" : "育つ稲";
    $("#riceNow").textContent = w.finished ? ripeBales : fc;
    $("#statRice").classList.toggle("met", fc >= lv.goal);
    $("#soilNum").textContent = Math.round(w.basket);
    $("#soilFill").style.width = Math.min(100, w.basket / w.cap * 100) + "%";
    const hs = $("#statHouses");
    if (hs.childElementCount !== w.houses.length) hs.innerHTML = w.houses.map(() => "<i class=\"house-dot\"></i>").join("");
    w.houses.forEach((h, k) => {
      const el = hs.children[k];
      el.classList.toggle("lost", h.damaged);
      el.classList.toggle("warn", !h.damaged && h.soak > 0);
    });
    const needle = $("#almNeedle");
    needle.style.transform = `rotate(${(w.started ? w.t : 0) * 360}deg)`;
    $("#almLabel").textContent = !w.started ? "春" : Sim.phaseAt(w.t).name;
    const cta = $("#plantCta");
    const canPlant = !w.started && w.counts.suitable > 0;
    cta.hidden = !canPlant;
    if (canPlant) {
      $("#plantCount").textContent = fc + " 俵";
      cta.classList.toggle("short", fc < lv.goal);
    }
    $("#undoBtn").disabled = w.undoStack.length === 0;
    $("#speedBtn").textContent = state.paused ? "▶" : state.speed === 8 ? "»»" : state.speed === 3 ? "»" : "▸";
    $("#speedBtn").classList.toggle("fast", state.speed > 1 && !state.paused);
    $("#speedBtn").setAttribute("aria-label", state.paused ? "時を動かす" : state.speed === 8 ? "ふつうの速さにする" : "早送り");
  }

  // ---- hints and toasts --------------------------------------------------------------------
  let hintTimer = null;
  function hint(text, seconds) {
    const el = $("#hint");
    el.innerHTML = text;
    el.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove("show"), (seconds || 7) * 1000);
  }
  function hintAt(at) {
    const lv = state.level;
    if (!lv || !lv.hints || state.hintsShown.has(at)) return;
    const h = lv.hints.find(x => x.at === at);
    if (!h) return;
    state.hintsShown.add(at);
    hint(h.text, h.seconds || 8);
  }
  function toast(text) {
    const el = $("#toast");
    el.textContent = text; el.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ---- dialogs -----------------------------------------------------------------------------
  let dialogActions = {};
  function openDialog(html, actions) {
    const m = $("#modal"), d = $("#dialog");
    d.innerHTML = html;
    dialogActions = actions || {};
    m.hidden = false;
    setTimeout(() => { const b = d.querySelector(".accent") || d.querySelector("button"); if (b) b.focus({ preventScroll: true }); else d.focus(); }, 30);
  }
  function closeModal() { $("#modal").hidden = true; dialogActions = {}; }
  function modalOpen() { return !$("#modal").hidden; }
  $("#dialog").addEventListener("click", e => {
    const b = e.target.closest("button[data-dialog]");
    if (!b) return;
    audio.unlock(); audio.event("click");
    const f = dialogActions[b.dataset.dialog];
    if (f) f(); else closeModal();
  });

  function howTo(back) {
    openDialog(`
      <p class="eyebrow">HOW TO FARM A VALLEY</p>
      <h2>あそびかた</h2>
      <ul class="how-list">
        <li><i>盛</i><span>籠の土を盛る。崩れた畦をふさぎ、水をせき止める。</span></li>
        <li><i>掘</i><span>土を掘って籠に入れる。水路をつけ、水を逃がす。</span></li>
        <li><i>均</i><span>なぞり始めた高さに、まわりを揃える。斜面に平らな段をつくる。</span></li>
        <li><i>水</i><span>平らな所に浅く溜まった水に、苗が植わる。深すぎても、流れていても植わらない。</span></li>
        <li><i>眺</i><span>「眺める」では指でなぞると景色が動く。＋－で寄る・引く、⟲⟳でまわる。二本指でも動かせる。</span></li>
        <li><i>暦</i><span>「田植え」をすると一年が始まる。梅雨の雨は家を濡らし、夏の日照りは田を乾かす。秋に実った稲が収穫になる。</span></li>
      </ul>
      <p class="keys">PC：右ドラッグでまわす、Shift＋ドラッグで動かす、ホイールで寄る<br>1 盛る · 2 掘る · 3 均す · 4 眺める · Z 戻す · Space 止める · F 早送り · Q/E まわす</p>
      <div class="dialog-actions"><button type="button" class="accent" data-dialog="ok">わかった</button></div>`, { ok: back || closeModal });
  }

  function pauseMenu() {
    if (state.screen !== "play" || modalOpen()) return;
    const lv = state.level;
    openDialog(`
      <p class="eyebrow">第${KANJI_NO[state.levelIndex]}の谷 · ${lv.name}</p>
      <h2>ひと休み</h2>
      <p>${lv.brief}</p>
      <p class="keys">目標 ${lv.goal} 俵　·　★★ ${lv.stars[0]}　·　★★★ ${lv.stars[1]}</p>
      <div class="toggle-row"><button type="button" data-dialog="sound" aria-pressed="${audio.enabled}">音 ${audio.enabled ? "あり" : "なし"}</button><button type="button" data-dialog="how">あそびかた</button></div>
      <div class="dialog-actions">
        <button type="button" class="accent" data-dialog="resume">つづける</button>
        <button type="button" data-dialog="retry">はじめから</button>
        <button type="button" data-dialog="select">谷の暦へ</button>
      </div>`, {
      resume: closeModal,
      retry: () => { closeModal(); startLevel(state.levelIndex); },
      select: () => enterSelect(),
      sound: () => { toggleSound(); closeModal(); pauseMenu(); },
      how: () => howTo(() => { closeModal(); pauseMenu(); })
    });
  }

  function resultDialog() {
    const w = state.world, lv = state.level, r = Sim.result(w);
    const id = lv.id, i = state.levelIndex;
    const prev = save.data.stars[id] || 0;
    if (r.ok) {
      save.data.stars[id] = Math.max(prev, r.stars);
      save.data.unlocked = Math.max(save.data.unlocked, Math.min(Levels.LEVELS.length - 1, i + 1));
    }
    save.data.best[id] = Math.max(save.data.best[id] || 0, r.bales);
    save.write();
    const last = i === Levels.LEVELS.length - 1;
    const stars = `<p class="result-stars" aria-label="穂 ${r.stars} / 3">${"★".repeat(r.stars)}<span class="off">${"★".repeat(3 - r.stars)}</span></p>`;
    const stats = `<div class="result-stats"><div><b>${r.bales}</b>収穫（俵）</div><div><b>${r.goal}</b>目標</div><div><b>${w.houses.length - r.damaged}/${w.houses.length}</b>無事な家</div></div>`;
    if (r.ok) {
      audio.event("stars", { n: r.stars });
      openDialog(`
        <p class="eyebrow">HARVEST · 第${KANJI_NO[i]}の谷</p>
        <h2>${lv.name}、実る</h2>
        ${stars}${stats}
        ${lv.letter ? `<div class="letter">${lv.letter.text}<cite>${lv.letter.from}</cite></div>` : ""}
        <div class="dialog-actions">
          ${last ? "<button type=\"button\" class=\"warm\" data-dialog=\"epilogue\">村へ帰る</button>" : "<button type=\"button\" class=\"accent\" data-dialog=\"next\">次の谷へ</button>"}
          <button type="button" data-dialog="retry">もう一度</button>
          <button type="button" ${last ? "class=\"accent\"" : ""} data-dialog="select">谷の暦へ</button>
        </div>`, {
        next: () => { closeModal(); startLevel(i + 1); },
        retry: () => { closeModal(); startLevel(i); },
        select: () => enterSelect(),
        epilogue: () => epilogue()
      });
    } else {
      audio.event("fail");
      const why = r.damaged ? `家が ${r.damaged} 軒、水に浸かった。<br>雨の行き先を、先に掘っておこう。` : `目標の ${r.goal} 俵に届かなかった。<br>平らで浅い水を、もう少し広く。`;
      openDialog(`
        <p class="eyebrow">HARVEST · 第${KANJI_NO[i]}の谷</p>
        <h2>来年こそ</h2>
        ${stars}${stats}
        <p>${why}</p>
        <div class="dialog-actions">
          <button type="button" class="accent" data-dialog="retry">もう一度</button>
          <button type="button" data-dialog="select">谷の暦へ</button>
        </div>`, {
        retry: () => { closeModal(); startLevel(i); },
        select: () => enterSelect()
      });
    }
  }

  function epilogue() {
    const st = Object.values(save.data.stars).reduce((a, b) => a + b, 0);
    openDialog(`
      <p class="eyebrow">EPILOGUE</p>
      <h2>瑞穂</h2>
      <p class="poem">崩れた畦をひとつ盛ったところから、<br>八つの谷に、水の段ができました。<br><br>水は上の田から下の田へ、<br>一枚ずつを満たして、海へ帰っていきます。<br>来年の春も、同じ水が来ます。</p>
      <p class="keys">穂 ${st} / ${Levels.LEVELS.length * 3}</p>
      <div class="dialog-actions"><button type="button" class="accent" data-dialog="title">おわり</button></div>`, { title: () => { state.titleWorld = null; enterTitle(); } });
  }

  // ---- actions -----------------------------------------------------------------------------
  function setTool(t) {
    state.tool = t;
    document.querySelectorAll(".tool[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
  }
  function toggleSound() {
    audio.setEnabled(!audio.enabled);
    if (audio.enabled) audio.unlock();
    save.data.sound = audio.enabled; save.write();
    document.querySelectorAll("[data-action=sound]").forEach(b => b.classList.toggle("muted", !audio.enabled));
  }
  function plant(confirmed) {
    const w = state.world, lv = state.level;
    if (!w || w.started) return;
    const fc = Sim.forecast(w);
    if (!confirmed && fc < lv.goal) {
      openDialog(`
        <p class="eyebrow">BEFORE PLANTING</p>
        <h2>田植えをする？</h2>
        <p>いまの見込みは <b>${fc} 俵</b>。目標は ${lv.goal} 俵です。<br>田植えのあとも土は動かせますが、<br>遅れて植わった苗は実りきらないことがあります。</p>
        <div class="dialog-actions"><button type="button" class="accent" data-dialog="wait">まだ整える</button><button type="button" data-dialog="go">田植えをする</button></div>`,
      { wait: closeModal, go: () => { closeModal(); plant(true); } });
      return;
    }
    Sim.start(w);
    state.paused = false;
    audio.event("plant");
    toast("田植え。一年がはじまる");
    burstPlanting(w);
    hintAt("planted");
    if (!save.data.speedTip) { save.data.speedTip = true; save.write(); setTimeout(() => { if (state.screen === "play" && !state.hintsShown.has("planted")) hint("一年が流れはじめた。右の <b>▸</b> で早送りできる。梅雨の雨と夏の日照りに気をつけて。", 8); }, 2600); }
    updateHud(true);
  }
  function rotate(dir) {
    if (!state.cam) return;
    state.camGoal = Object.assign({}, state.camGoal || {}, { yaw: (state.camGoal && state.camGoal.yaw !== undefined ? state.camGoal.yaw : state.cam.yaw) + dir * Math.PI / 4 });
  }
  function zoom(f) {
    if (!state.cam) return;
    const goal = clampDist((state.camGoal && state.camGoal.dist) || state.cam.dist) * f;
    state.camGoal = Object.assign({}, state.camGoal || {}, { dist: clampDist(goal) });
  }
  // Move the point the camera looks at across the ground, in screen directions.
  function pan(dx, dy) {
    const c = state.cam, w = state.world;
    const k = c.dist * 0.0021;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    c.target[0] = Math.max(0, Math.min(w.W - 1, c.target[0] - (dx * cy - dy * sy / Math.max(0.35, Math.sin(c.pitch))) * k));
    c.target[2] = Math.max(0, Math.min(w.H - 1, c.target[2] - (-dx * sy - dy * cy / Math.max(0.35, Math.sin(c.pitch))) * k * -1));
  }
  function undo() {
    if (state.world && Sim.undo(state.world)) { audio.event("click"); toast("ひとつ戻した"); }
  }
  function toggleSpeed() {
    if (state.paused) { state.paused = false; }
    else state.speed = state.speed === 1 ? 3 : state.speed === 3 ? 8 : 1;
    toast(state.speed === 1 ? "ふつうの速さ" : state.speed === 3 ? "早送り ×3" : "早送り ×8");
    updateHud(true);
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-action]");
    if (a) {
      audio.unlock();
      const act = a.dataset.action;
      if (act !== "sound") audio.event("click");
      if (act === "select") enterSelect();
      else if (act === "title") enterTitle();
      else if (act === "how") howTo();
      else if (act === "sound") toggleSound();
      else if (act === "pause") pauseMenu();
      else if (act === "plant") plant(false);
      else if (act === "zoomin") zoom(0.75);
      else if (act === "zoomout") zoom(1 / 0.75);
      else if (act === "rotl") rotate(-1);
      else if (act === "rotr") rotate(1);
      else if (act === "speed") toggleSpeed();
      else if (act === "size") { state.size = 1 - state.size; $("#sizeGlyph").textContent = state.size ? "大" : "小"; }
      else if (act === "undo") undo();
      return;
    }
    const t = e.target.closest(".tool[data-tool]");
    if (t) { audio.unlock(); audio.event("select"); setTool(t.dataset.tool); }
  });
  document.querySelectorAll("[data-action=sound]").forEach(b => b.classList.toggle("muted", !audio.enabled));

  // ---- input on the valley -------------------------------------------------------------------
  function toolAllowed() {
    const w = state.world;
    return state.screen === "play" && w && !w.finished && !modalOpen() && state.tool !== "look";
  }
  function localXY(e) { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  view.addEventListener("contextmenu", e => e.preventDefault());
  view.addEventListener("pointerdown", e => {
    audio.unlock();
    if (state.screen !== "play" || modalOpen()) return;
    view.setPointerCapture && view.setPointerCapture(e.pointerId);
    const p = localXY(e);
    state.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, button: e.button, type: e.pointerType });
    if (state.pointers.size >= 2) {
      // a second finger turns the stroke into a camera gesture
      if (state.sculpt) {
        const st = Sim.endStroke(state.world);
        if (st && st.moved >= 0.01) Sim.undo(state.world); // the first finger's touch was not meant as a stroke
        state.sculpt = null;
      }
      beginGesture();
      return;
    }
    if (e.button === 2) { state.gesture = { orbit: true }; return; }
    if (e.button === 1 || e.shiftKey || state.tool === "look" || !toolAllowed()) { state.gesture = { pan: true }; return; }
    const hit = R.pick(p.x, p.y);
    if (!hit) { state.gesture = { pan: true }; return; }
    Sim.beginStroke(state.world, state.tool, hit.x, hit.y);
    state.sculpt = { id: e.pointerId, x: p.x, y: p.y, target: state.world.stroke.target };
    state.hover = hit;
  });
  view.addEventListener("pointermove", e => {
    const p = localXY(e);
    const ptr = state.pointers.get(e.pointerId);
    if (e.pointerType === "mouse" && state.screen === "play") state.hover = R.pick(p.x, p.y);
    if (!ptr) return;
    const px = ptr.x, py = ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (state.pointers.size >= 2) { moveGesture(); return; }
    if (state.sculpt && state.sculpt.id === e.pointerId) { state.sculpt.x = p.x; state.sculpt.y = p.y; return; }
    if (state.gesture && state.gesture.orbit) {
      const dx = p.x - px, dy = p.y - py;
      state.cam.yaw -= dx * 0.008;
      state.cam.pitch = clampPitch(state.cam.pitch + dy * 0.005);
      state.camGoal = null;
    } else if (state.gesture && state.gesture.pan) {
      pan(p.x - px, p.y - py);
    }
  });
  function endPointer(e) {
    state.pointers.delete(e.pointerId);
    if (state.sculpt && state.sculpt.id === e.pointerId) {
      Sim.endStroke(state.world); state.sculpt = null; state.lastStrokeEnd = state.time;
      if (e.pointerType !== "mouse") state.hover = null;
    }
    if (state.pointers.size < 2) state.pinch = null;
    if (state.pointers.size === 0) state.gesture = null;
  }
  view.addEventListener("pointerup", endPointer);
  view.addEventListener("pointercancel", endPointer);
  view.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !state.sculpt) state.hover = null; });
  function clampPitch(p) { return Math.max(0.32, Math.min(1.42, p)); }
  function twoPointers() { const it = [...state.pointers.values()]; return [it[0], it[1]]; }
  function beginGesture() {
    const [a, b] = twoPointers();
    state.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: state.cam.dist, yaw: state.cam.yaw, pitch: state.cam.pitch };
    state.gesture = null;
  }
  function moveGesture() {
    if (!state.pinch) beginGesture();
    const [a, b] = twoPointers(), g = state.pinch;
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    const my = (a.y + b.y) / 2;
    state.cam.dist = clampDist(g.dist * g.d / Math.max(20, d));
    let da = ang - g.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    state.cam.yaw = g.yaw - da;
    state.cam.pitch = clampPitch(g.pitch + (my - g.my) * 0.004);
    const mx = (a.x + b.x) / 2;
    if (g.lastMx !== undefined) pan(mx - g.lastMx, 0);
    g.lastMx = mx;
    state.camGoal = null;
  }
  function clampDist(d) { const w = state.world, span = Math.max(w.W, w.H); return Math.max(span * 0.3, Math.min(span * 4, d)); }
  view.addEventListener("wheel", e => {
    if (state.screen !== "play") return;
    e.preventDefault();
    state.cam.dist = clampDist(state.cam.dist * Math.exp(e.deltaY * 0.0012));
    state.camGoal = null;
  }, { passive: false });

  document.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (modalOpen()) {
      if (e.key === "Escape" && state.screen === "play" && !state.world.finished) closeModal();
      return;
    }
    if (state.screen !== "play") return;
    const tools = state.level.tools || ["heap", "dig", "level"];
    const k = e.key.toLowerCase();
    if (k === "1" && tools.includes("heap")) setTool("heap");
    else if (k === "2" && tools.includes("dig")) setTool("dig");
    else if (k === "3" && tools.includes("level")) setTool("level");
    else if (k === "4") setTool("look");
    else if (k === "z") undo();
    else if (k === "q") rotate(-1);
    else if (k === "+" || k === "=") zoom(0.75);
    else if (k === "-") zoom(1 / 0.75);
    else if (k === "e") rotate(1);
    else if (k === "f") toggleSpeed();
    else if (k === "b") { state.size = 1 - state.size; $("#sizeGlyph").textContent = state.size ? "大" : "小"; }
    else if (k === " " && !(e.target.closest && e.target.closest("button"))) { e.preventDefault(); state.paused = !state.paused; toast(state.paused ? "時を止めた（土は動かせる）" : "時が流れだす"); updateHud(true); }
    else if (k === "escape" || k === "p") pauseMenu();
    else return;
    audio.unlock();
  });
  // a turned phone or a resized window gets a freshly framed view
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.world) return;
      if (state.screen === "play") { const yaw = state.cam.yaw; state.cam = playCam(state.world); state.cam.yaw = yaw; state.camGoal = null; }
      else { const yaw = state.cam.yaw; state.cam = titleCam(state.world); state.cam.yaw = yaw; }
    }, 160);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { audio.suspend(); if (state.screen === "play" && state.world && !state.world.finished) state.paused = true; }
    else audio.resume();
  });
  window.addEventListener("blur", () => { if (state.sculpt) { Sim.endStroke(state.world); state.sculpt = null; } state.pointers.clear(); state.pinch = null; state.gesture = null; });

  // ---- effects (2D overlay) --------------------------------------------------------------------
  function sizeFx(dpr) {
    const cw = Math.round(fxCanvas.clientWidth * dpr), ch = Math.round(fxCanvas.clientHeight * dpr);
    if (fxCanvas.width !== cw || fxCanvas.height !== ch) { fxCanvas.width = cw; fxCanvas.height = ch; }
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn(p) { if (state.particles.length < 900) state.particles.push(p); }
  function burstPlanting(w) {
    let n = 0;
    for (let i = 0; i < w.N && n < 260; i += 1 + ((i * 7) % 3)) {
      if (w.plant[i] !== Sim.GROWING) continue;
      const x = i % w.W, y = (i / w.W) | 0;
      spawn({ kind: "mote", x: x + Math.random() - 0.5, y: w.ground[i] + 0.2, z: y + Math.random() - 0.5, vy: 0.6 + Math.random(), life: 1.4 + Math.random(), age: -Math.random() * 0.6, col: "190,240,150" });
      n++;
    }
  }
  function ambient(env, dt, w) {
    const W = view.clientWidth, H = view.clientHeight;
    // rain streaks in screen space
    const rain = env.rain;
    if (rain > 0.02 && !reduceMotion) {
      const n = Math.round(rain * 7 * (W * H) / 300000 * dt * 60);
      for (let k = 0; k < n; k++) spawn({ kind: "rain", sx: Math.random() * (W + 120) - 60, sy: -20, vx: -80, vy: 900 + Math.random() * 300, life: 1.5, age: 0 });
    }
    if (!w) return;
    const season = env.season;
    const pick = () => { const x = Math.random() * (w.W - 1), z = Math.random() * (w.H - 1); const i = Math.round(z) * w.W + Math.round(x); return { x, z, i }; };
    if (season === "spring" && Math.random() < dt * 2.5 && !reduceMotion) {
      spawn({ kind: "petal", sx: Math.random() * W, sy: -10, vx: 30 + Math.random() * 40, vy: 30 + Math.random() * 30, life: 14, age: 0, rot: Math.random() * 6, spin: 1 + Math.random() * 2 });
    }
    if ((season === "early" || season === "rainy") && Math.random() < dt * 6) {
      const c = pick();
      if (w.water[c.i] > 0.02) spawn({ kind: "firefly", x: c.x, y: w.ground[c.i] + w.water[c.i] + 0.4 + Math.random() * 1.2, z: c.z, life: 4 + Math.random() * 3, age: 0, ph: Math.random() * 6, dx: Math.random() - 0.5, dz: Math.random() - 0.5 });
    }
    if ((season === "early" || season === "summer") && Math.random() < dt * 0.25 && state.particles.filter(p => p.kind === "sagi").length < 3) {
      const c = pick();
      if (w.plant[c.i] === Sim.GROWING && w.water[c.i] > 0.03) spawn({ kind: "sagi", x: Math.round(c.x), y: w.ground[c.i] + w.water[c.i], z: Math.round(c.z), life: 16 + Math.random() * 10, age: 0, ph: Math.random() * 6, face: Math.random() < 0.5 ? -1 : 1, fly: 0 });
    }
    if (season === "autumn" && Math.random() < dt * 1.2) {
      const c = pick();
      spawn({ kind: "tombo", x: c.x, y: w.ground[c.i] + 1.5 + Math.random() * 2, z: c.z, life: 8, age: 0, dir: Math.random() * 6.28, ph: Math.random() * 6 });
    }
    if (w.festival && !state.lanterns) {
      state.lanterns = [];
      for (let i = 0; i < w.N && state.lanterns.length < 70; i += 7) if ((w.flags[i] & Sim.F_ROCK) && Math.random() < 0.55) state.lanterns.push({ x: i % w.W, z: (i / w.W) | 0, y: w.ground[i] + 0.55, ph: Math.random() * 6 });
    }
    if (season === "night" && Math.random() < dt * 4) {
      const c = pick();
      if (w.plant[c.i] === Sim.RIPE) spawn({ kind: "mote", x: c.x, y: w.ground[c.i] + 0.6, z: c.z, vy: 0.3 + Math.random() * 0.5, life: 3, age: 0, col: "255,220,140" });
    }
  }
  function drawFx(env, dt) {
    const W = view.clientWidth, H = view.clientHeight;
    fx.clearRect(0, 0, W, H);
    // paper lanterns along the ridges on the harvest night
    if (state.world && state.world.festival && state.lanterns && state.screen !== "play") {
      const scale = Math.max(0.5, Math.min(2, 50 / state.cam.dist));
      for (const l of state.lanterns) {
        const s = R.project(l.x, l.y, l.z);
        if (!s) continue;
        const fl = 0.8 + 0.2 * Math.sin(state.time * 3 + l.ph) * Math.sin(state.time * 1.7 + l.ph * 2);
        const r = 17 * scale;
        const g = fx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, `rgba(255,226,160,${0.95 * fl})`); g.addColorStop(0.25, `rgba(255,170,80,${0.55 * fl})`); g.addColorStop(1, "rgba(255,140,60,0)");
        fx.fillStyle = g; fx.beginPath(); fx.arc(s.x, s.y, r, 0, Math.PI * 2); fx.fill();
      }
    }
    const ps = state.particles;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      if (p.age > p.life) continue;
      ps[j++] = p;
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (p.kind === "rain") {
        p.sx += p.vx * dt; p.sy += p.vy * dt;
        if (p.sy > H + 20) { p.age = p.life + 1; continue; }
        fx.strokeStyle = "rgba(220,232,245,.35)"; fx.lineWidth = 1;
        fx.beginPath(); fx.moveTo(p.sx, p.sy); fx.lineTo(p.sx - p.vx * 0.022, p.sy - p.vy * 0.022); fx.stroke();
      } else if (p.kind === "petal") {
        p.sx += (p.vx + Math.sin(p.age * 1.3 + p.rot) * 25) * dt; p.sy += p.vy * dt; p.rot += p.spin * dt;
        if (p.sy > H + 10) { p.age = p.life + 1; continue; }
        fx.save(); fx.translate(p.sx, p.sy); fx.rotate(p.rot); fx.scale(1, Math.abs(Math.sin(p.rot * 1.7)) * 0.7 + 0.3);
        fx.fillStyle = "rgba(255,214,226,.85)"; fx.beginPath(); fx.ellipse(0, 0, 4, 2.6, 0, 0, Math.PI * 2); fx.fill(); fx.restore();
      } else {
        if (p.kind === "mote") p.y += p.vy * dt;
        if (p.kind === "firefly") { p.x += p.dx * dt * 0.4; p.z += p.dz * dt * 0.4; p.y += Math.sin(p.age * 1.7 + p.ph) * dt * 0.2; }
        if (p.kind === "tombo") { p.dir += Math.sin(p.age * 0.8 + p.ph) * dt; p.x += Math.cos(p.dir) * dt * 1.6; p.z += Math.sin(p.dir) * dt * 1.6; p.y += Math.sin(p.age * 3 + p.ph) * dt * 0.3; }
        const s = R.project(p.x, p.y, p.z);
        if (!s) continue;
        const scale = Math.max(0.4, Math.min(2.2, 40 / (state.cam ? state.cam.dist : 40)));
        if (p.kind === "mote") {
          const a = Math.sin(k * Math.PI);
          fx.fillStyle = `rgba(${p.col},${0.8 * a})`; fx.beginPath(); fx.arc(s.x, s.y, 2.2 * scale, 0, Math.PI * 2); fx.fill();
        } else if (p.kind === "firefly") {
          const a = Math.max(0, Math.sin(p.age * 2.6 + p.ph)) * Math.sin(k * Math.PI);
          const g = fx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 9 * scale);
          g.addColorStop(0, `rgba(230,255,150,${0.95 * a})`); g.addColorStop(1, "rgba(200,255,120,0)");
          fx.fillStyle = g; fx.beginPath(); fx.arc(s.x, s.y, 9 * scale, 0, Math.PI * 2); fx.fill();
        } else if (p.kind === "tombo") {
          const a = Math.sin(k * Math.PI);
          fx.save(); fx.translate(s.x, s.y); fx.rotate(-p.dir);
          fx.strokeStyle = `rgba(200,60,40,${a})`; fx.lineWidth = 1.6 * scale;
          fx.beginPath(); fx.moveTo(-5 * scale, 0); fx.lineTo(5 * scale, 0); fx.stroke();
          const flap = Math.sin(p.age * 40) * 0.5 + 0.5;
          fx.strokeStyle = `rgba(240,240,240,${0.55 * a})`; fx.lineWidth = 1;
          fx.beginPath(); fx.moveTo(1 * scale, 0); fx.lineTo(3 * scale, (4 + flap * 2) * scale); fx.moveTo(1 * scale, 0); fx.lineTo(3 * scale, -(4 + flap * 2) * scale); fx.stroke();
          fx.restore();
        } else if (p.kind === "sagi") {
          // a little egret wading in the paddy; near the end of its stay it lifts off
          const left = p.life - p.age;
          if (left < 3) { p.fly += dt; p.y += dt * (1.5 + p.fly * 2); p.x += p.face * dt * 3; }
          const a = Math.min(1, p.age * 2, left);
          const sc = scale * 1.15;
          fx.save(); fx.translate(s.x, s.y); fx.scale(p.face * sc, sc); fx.globalAlpha = a;
          if (p.fly > 0) {
            const flap = Math.sin(p.age * 14) * 5;
            fx.fillStyle = "#f7f6f0";
            fx.beginPath(); fx.ellipse(0, -2, 5, 2, 0, 0, Math.PI * 2); fx.fill();
            fx.beginPath(); fx.moveTo(-2, -2); fx.lineTo(1, -8 - flap); fx.lineTo(3, -2); fx.fill();
            fx.strokeStyle = "#f7f6f0"; fx.lineWidth = 1.2; fx.beginPath(); fx.moveTo(4, -2); fx.lineTo(7, -4); fx.stroke();
          } else {
            const bob = Math.sin(p.age * 1.3 + p.ph) > 0.85 ? 2 : 0; // now and then it dips its bill
            fx.strokeStyle = "#2b2a26"; fx.lineWidth = 0.9;
            fx.beginPath(); fx.moveTo(-1, 0); fx.lineTo(-1, -5); fx.moveTo(1, 0); fx.lineTo(1, -5); fx.stroke();
            fx.fillStyle = "#f7f6f0";
            fx.beginPath(); fx.ellipse(0, -7, 3.6, 2.4, -0.3, 0, Math.PI * 2); fx.fill();
            fx.strokeStyle = "#f7f6f0"; fx.lineWidth = 1.5;
            fx.beginPath(); fx.moveTo(2, -8); fx.quadraticCurveTo(4, -11, 2.6, -13 + bob); fx.stroke();
            fx.strokeStyle = "#3a3934"; fx.lineWidth = 0.8;
            fx.beginPath(); fx.moveTo(2.6, -13 + bob); fx.lineTo(5.4, -12.4 + bob * 1.4); fx.stroke();
          }
          fx.restore(); fx.globalAlpha = 1;
        } else if (p.kind === "dust") {
          p.y += p.vy * dt; p.vy -= 6 * dt; p.x += p.vx * dt; p.z += p.vz * dt;
          fx.fillStyle = `rgba(${p.col},${0.9 * (1 - k)})`; fx.fillRect(s.x - 1.5 * scale, s.y - 1.5 * scale, 3 * scale, 3 * scale);
        }
      }
    }
    ps.length = j;
  }

  // ---- events from the simulation -----------------------------------------------------------------
  function handleEvents(w) {
    for (const ev of w.events) {
      if (ev.type === "flood") { audio.event("flood"); toast("家が水に浸かった"); }
      else if (ev.type === "wilt") { if (Math.random() < 0.08) audio.event("wilt"); }
      else if (ev.type === "plant" && w.started && w.t > 0.001) { /* late planting: quiet */ }
    }
    w.events.length = 0;
  }
  function watchSeasons(w) {
    const id = !w.started ? "spring" : Sim.phaseAt(w.t).id;
    if (id !== state.seasonId) {
      state.seasonId = id;
      if (w.started && id !== "early") {
        audio.event("season", { id });
        toast({ rainy: "梅雨に入った", summer: "夏の日照り", autumn: "秋。稲が色づく" }[id] || "");
        hintAt(id);
      }
    }
    if (!w.started && w.counts.suitable >= Sim.K.CELLS_PER_BALE && state.lastSuitable < Sim.K.CELLS_PER_BALE && w.undoStack.length) hintAt("suitable");
    state.lastSuitable = w.counts.suitable;
    // explain standing water that will not take seedlings, once each, after the player has worked the soil
    if (!w.started && w.undoStack.length && state.screen === "play") {
      if (w.counts.deep >= 12 && !state.hintsShown.has("why-deep")) { state.hintsShown.add("why-deep"); hint("水が<b>深すぎる</b>所には、苗は植わらない。畦の一か所を軽く<b>掘って</b>、水位を下げよう。", 8); }
      else if (w.counts.flow >= 16 && !state.hintsShown.has("why-flow") && state.time - (state.lastStrokeEnd || 0) > 6) { state.hintsShown.add("why-flow"); hint("<b>流れている</b>水には、苗は植わらない。平らに均して、縁に畦を<b>盛ろう</b>。", 8); }
      else if (w.counts.rock >= 12 && !state.hintsShown.has("why-rock")) { state.hintsShown.add("why-rock"); hint("むき出しの<b>岩</b>には根が張らない。籠の土を<b>盛って</b>覆おう。", 8); }
    }
    if (w.started && !w.finished) {
      if (w.counts.parched >= 10 && !state.hintsShown.has("parched")) { state.hintsShown.add("parched"); audio.event("warn"); hint("田が<b>乾いて</b>苗がしおれはじめた。上から水を引くか、水口を少し<b>掘って</b>水を落とそう。", 8); }
      if (w.counts.drowning >= 10 && !state.hintsShown.has("drowning")) { state.hintsShown.add("drowning"); audio.event("warn"); hint("水が<b>深すぎて</b>苗が沈んでいる。畦の低い所を<b>掘って</b>、水を逃がそう。", 8); }
    }
    const soaking = w.houses.some(h => !h.damaged && h.soak > 0);
    if (soaking && !state.warned) { state.warned = true; audio.event("warn"); hintAt("warn"); if (!state.hintsShown.has("warn")) hint("家に水が迫っている。<b>掘って</b>、水の道を逸らそう。", 6); state.hintsShown.add("warn"); }
    if (!soaking) state.warned = false;
  }

  // ---- the loop ------------------------------------------------------------------------------------
  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000; lastT = now;
    if (dt > 0.1) dt = 0.1;
    state.time += dt;
    const w = state.world;
    if (!w) return;
    // adaptive resolution: if frames run long for a while, render fewer pixels
    state.slowFor = dt > 0.026 ? (state.slowFor || 0) + dt : Math.max(0, (state.slowFor || 0) - dt * 0.5);
    if (state.slowFor > 2 && (state.quality || 1) > 0.5) { state.quality = (state.quality || 1) * 0.8; state.slowFor = 0; }
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, view.clientWidth * view.clientHeight > 900000 ? 1.5 : 2) * (state.quality || 1));

    // simulation
    if (state.screen === "play") {
      const blocked = modalOpen();
      if (!blocked && !state.paused && !w.finished) Sim.step(w, dt * state.speed);
      if (state.sculpt && !blocked) {
        const hit = R.pick(state.sculpt.x, state.sculpt.y);
        if (hit) {
          const moved = Sim.brush(w, state.tool, hit.x, hit.y, SIZES[state.size], dt);
          state.hover = hit;
          if (moved > 0.002) {
            audio.event(state.tool, { amount: moved * 8 });
            if (Math.random() < 0.6 && !reduceMotion) spawn({ kind: "dust", x: hit.x + (Math.random() - 0.5) * 2, y: Sim.sampleGround(w, hit.x, hit.y) + 0.1, z: hit.y + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5), vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5), life: 0.6, age: 0, col: state.tool === "dig" ? "120,90,60" : "150,115,75" });
            for (const m of state.level.marks || []) if (Math.hypot(hit.x - m.x, hit.y - m.y) < m.r + 1) state.marksDone.add(m);
          } else if (state.tool === "heap" && w.basket < 0.05) { if (!state.emptyWarned) { toast("籠が空。どこかを掘って土を得よう"); state.emptyWarned = true; } }
          else if ((state.tool === "dig") && w.basket >= w.cap - 0.05) { if (!state.fullWarned) { toast("籠がいっぱい。どこかに盛ろう"); state.fullWarned = true; } }
        }
      }
      if (!state.sculpt) { state.emptyWarned = false; state.fullWarned = false; }
      handleEvents(w);
      watchSeasons(w);
      if (w.finished) {
        state.harvestClock += dt;
        if (state.harvestClock < dt * 1.5) { audio.event("harvest"); toast("収穫の秋"); }
        // gold motes rise where the sickle passes
        const row = Math.round(w.H + 2 - Math.min(1, state.harvestClock / 2.6) * (w.H + 4));
        if (row >= 0 && row < w.H && !reduceMotion) for (let x = 0; x < w.W; x += 2) { const i = row * w.W + x; if (w.plant[i] === Sim.RIPE && Math.random() < 0.5) spawn({ kind: "mote", x, y: w.ground[i] + 0.5, z: row, vy: 0.8 + Math.random(), life: 1.6, age: 0, col: "255,214,120" }); }
        if (state.harvestClock > 4 && !state.resultShown) { state.resultShown = true; resultDialog(); }
      }
      if (now - state.lastHud > 120) { state.lastHud = now; updateHud(); }
    } else {
      // title and select: the showcase valley keeps flowing, the camera drifts
      Sim.step(w, dt);
      w.events.length = 0;
      if (!reduceMotion) state.cam.yaw += dt * 0.035;
    }

    // camera easing
    if (state.camGoal) {
      let done = true;
      if (state.camGoal.yaw !== undefined) {
        const d = state.camGoal.yaw - state.cam.yaw;
        state.cam.yaw += d * Math.min(1, dt * 8);
        if (Math.abs(d) > 0.001) done = false;
      }
      if (state.camGoal.dist !== undefined) {
        const d = state.camGoal.dist - state.cam.dist;
        state.cam.dist += d * Math.min(1, dt * 8);
        if (Math.abs(d) > 0.01) done = false;
      }
      if (done) state.camGoal = null;
    }

    const env = environment(w, state.time);
    // haze is about the air between us and the valley, not the valley's size
    env.fogDen *= Math.max(0.3, Math.min(1.4, 64 / state.cam.dist));
    env.autumn = !w.started ? 0 : w.finished ? 1 : Math.max(0, Math.min(1, (w.t - 0.64) / 0.14));
    // the harvest sweeps up the valley from the foot, row by row
    env.front = state.screen === "play" && w.finished ? w.H + 2 - Math.min(1, state.harvestClock / 2.6) * (w.H + 4) : 1e6;
    env.dpr = dpr;
    // cursor and marks
    const showCursor = state.screen === "play" && state.hover && state.tool !== "look" && !w.finished && !modalOpen();
    env.cursor = showCursor ? { x: state.hover.x, y: state.hover.y, r: SIZES[state.size], visible: true, tool: state.tool, target: state.sculpt && state.tool === "level" ? w.stroke && w.stroke.target : Sim.sampleGround(w, state.hover.x, state.hover.y) } : null;
    env.marks = state.screen === "play" && !w.started ? (state.level.marks || []).filter(m => !state.marksDone.has(m)) : [];
    if (state.screen === "play") for (const h of w.houses) if (!h.damaged && (h.soak > 0 || (h.depth || 0) > Sim.K.HOUSE_FLOOD * 0.5)) env.marks = env.marks.concat([{ x: h.x + h.w / 2 - 0.5, y: h.y + h.h / 2 - 0.5, r: Math.max(h.w, h.h) * 0.9, danger: 1 }]);
    env.showSuit = state.screen === "play" && !w.started ? 1 : 0;
    R.render(state.cam, env, dt);

    // audio
    let flow = 0, falls = 0, wet = 0;
    for (let i = 0; i < w.N; i += 3) {
      const out = w.fl[i] + w.fr[i] + w.ft[i] + w.fb[i];
      if (out > 0.05) { flow += Math.min(1, out); if (out > 1.2) falls += 1; }
      if (w.water[i] > 0.02) wet++;
    }
    audio.update({ flow: Math.min(1.5, flow / 60), falls: Math.min(1.5, falls / 20), rain: env.rain, season: env.season, paddy: (w.counts.planted) / Math.max(40, w.N * 0.12), quiet: state.screen !== "play" }, dt);

    sizeFx(dpr);
    ambient(env, dt, w);
    drawFx(env, dt);
  }

  // ---- test hooks -----------------------------------------------------------------------------------
  window.__mizuho = {
    get state() { return state; },
    get world() { return state.world; },
    audio,
    startLevel, enterSelect, enterTitle, plant: () => plant(true),
    run(script) { Script.run(state.world, script); updateHud(true); },
    pickCenter() { return R.project(state.world.W / 2, Sim.sampleGround(state.world, state.world.W / 2, state.world.H / 2), state.world.H / 2); },
    project: (x, y, z) => R.project(x, y, z),
    finish() { const w = state.world; Sim.start(w); while (!w.finished) Sim.step(w, 1); }
  };

  enterTitle();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
  setTimeout(() => $("#curtain").classList.add("open"), 60);
})();
