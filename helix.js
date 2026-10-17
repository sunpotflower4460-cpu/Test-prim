/* HELIX // 螺旋 — renderer, audio, input and flow. Minimax M3.1.
 *
 * The simulation lives in helix-sim.js and knows nothing about the DOM. This
 * file drives it at a fixed 60 Hz step, draws it, and turns input into the
 * intent strings the sim understands.
 */
(function () {
  "use strict";

  const sim = window.HelixSim;
  const canvas = document.getElementById("helixWorld");
  const ctx = canvas.getContext("2d");
  if (!sim || !canvas || !ctx) return;

  const TILE = sim.TILE;
  const PHYS = sim.PHYS;
  const DT = sim.DT;

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const SAVE_KEY = "helix-record-v1";
  const SOUND_KEY = "helix-sound-v1";

  /* ------------------------------------------------------------- storage -- */

  let record = load();
  let soundOn = loadSound();

  function load() {
    const blank = { stages: {}, bestTotal: 0, ending: false };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return blank;
      const parsed = JSON.parse(raw);
      return { stages: parsed.stages || {}, bestTotal: parsed.bestTotal || 0, ending: !!parsed.ending };
    } catch (_) { return blank; }
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(record)); } catch (_) {}
  }
  function loadSound() {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (_) { return true; }
  }
  function saveSound() {
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (_) {}
  }

  /* ---------------------------------------------------------------- audio -- */

  const audio = (function () {
    let ac = null;
    let master = null;
    let musicBus = null;
    let sfxBus = null;
    let noiseBuffer = null;

    function context() {
      if (!soundOn) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ac) {
        try { ac = new AC(); } catch (_) { return null; }
        master = ac.createGain();
        master.gain.value = 0.9;
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 5;
        master.connect(comp);
        comp.connect(ac.destination);
        musicBus = ac.createGain();
        musicBus.gain.value = 0.34;
        musicBus.connect(master);
        sfxBus = ac.createGain();
        sfxBus.gain.value = 0.7;
        sfxBus.connect(master);
        const len = Math.floor(ac.sampleRate * 0.6);
        noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ac.state === "suspended") ac.resume().catch(() => {});
      return ac;
    }

    function rawContext() { return ac; }

    function applyMute() {
      if (!master || !ac) return;
      const target = soundOn ? 0.9 : 0;
      try {
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setTargetAtTime(target, ac.currentTime, 0.02);
      } catch (_) { master.gain.value = target; }
    }

    function now() {
      const c = context();
      return c ? c.currentTime : performance.now() / 1000;
    }

    function tone(freq, dur, type, gain, at, bus) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at === undefined ? c.currentTime : at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t0);
      const g = gain === undefined ? 0.06 : gain;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(g, t0 + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env);
      env.connect(bus || sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, gain, at, filterHz) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at === undefined ? c.currentTime : at);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = filterHz || 1400;
      f.Q.value = 1.1;
      const env = c.createGain();
      env.gain.setValueAtTime(gain === undefined ? 0.05 : gain, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(env);
      env.connect(sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    function kick(at, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, t0);
      osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
      env.gain.setValueAtTime(gain || 0.4, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(env);
      env.connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }

    function bass(freq, at, dur, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t0);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(420, t0);
      lp.frequency.exponentialRampToValueAtTime(150, t0 + dur);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(lp);
      lp.connect(env);
      env.connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    function pluck(freq, at, dur, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain || 0.09, t0 + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env);
      env.connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    return { context, rawContext, applyMute, now, tone, noise, kick, bass, pluck };
  })();

  /* --------------------------------------------------------------- music -- */

  let musicBeat = 0;
  let musicTimer = null;
  let musicBpm = 128;

  const SCALE = [0, 3, 5, 7, 10, 12];
  const CHORDS = [0, -4, -2, -5];

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function stopMusic() {
    if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* Lookahead scheduler. Everything is scheduled on the AudioContext timeline;
   * the interval only tops the queue up. */
  function startMusic(bpm) {
    stopMusic();
    if (!audio.context()) return;
    musicBpm = bpm || 128;
    musicBeat = 0;
    const spb = 60 / musicBpm;
    function pump() {
      const c = audio.rawContext();
      if (!c) return;
      while (musicBeat * spb < c.currentTime + 0.25) {
        playBeat(musicBeat, musicBeat * spb + audio.now());
        musicBeat++;
      }
    }
    pump();
    musicTimer = setInterval(pump, 25);
  }

  function playBeat(beat, at) {
    const spb = 60 / musicBpm;
    const inBar = beat % 4;
    const chord = CHORDS[Math.floor(beat / 8) % CHORDS.length];
    if (inBar === 0 || inBar === 2) audio.kick(at, inBar === 0 ? 0.34 : 0.24);
    if (inBar === 1 || inBar === 3) audio.noise(0.06, 0.035, at, 2400);
    const step = beat % 8;
    audio.pluck(midiToFreq(57 + chord + SCALE[step % SCALE.length]), at, 0.2, 0.075);
    if (step === 0) audio.bass(midiToFreq(33 + chord), at, spb * 1.6, 0.16);
  }

  const SFX = {
    jump() { audio.tone(430, 0.1, "square", 0.05); },
    wallJump() { audio.tone(560, 0.12, "square", 0.055); audio.noise(0.05, 0.03, undefined, 2600); },
    land() { audio.noise(0.06, 0.035, undefined, 700); },
    dash() { audio.tone(760, 0.14, "sawtooth", 0.05); audio.noise(0.09, 0.03, undefined, 3200); },
    death() { audio.tone(150, 0.3, "sawtooth", 0.07); audio.noise(0.2, 0.05, undefined, 380); },
    pearl() { [880, 1174, 1568].forEach((f, i) => audio.tone(f, 0.16, "triangle", 0.05, audio.now() + i * 0.05)); },
    checkpoint() { [523, 784, 1046].forEach((f, i) => audio.tone(f, 0.2, "sine", 0.05, audio.now() + i * 0.06)); },
    clear() { [659, 880, 1174, 1568].forEach((f, i) => audio.tone(f, 0.3, "triangle", 0.06, audio.now() + i * 0.08)); },
    over() { [392, 330, 262].forEach((f, i) => audio.tone(f, 0.4, "triangle", 0.06, audio.now() + i * 0.14)); },
    ui() { audio.tone(880, 0.05, "square", 0.035); }
  };

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
  }

  /* -------------------------------------------------------------- state -- */

  let mode = "off";
  let state = null;
  let levelIndex = 0;
  let unlocked = 0;

  const view = { w: 0, h: 0, dpr: 1, scale: 2, cx: 0, cy: 0 };
  let particles = [];
  let ghosts = [];
  let shake = 0;
  let flash = 0;
  let camX = 0;
  let zoomed = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  let lastBeatDrawn = -1;

  const input = {
    left: false, right: false, jump: false, dash: false,
    jumpPressed: false, dashPressed: false
  };
  let prevJump = false;
  let prevDash = false;

  /* ------------------------------------------------------------- helpers -- */

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = dpr;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutCamera();
    if (state) camX = cameraTarget();
  }

  /* Fit the whole stage for survey; on touch screens magnify it so the actor
   and gaps remain legible. The HUD switch lets a player survey at any time. */
  function layoutCamera() {
    if (!state) return;
    const map = state.map;
    const usableH = view.h * (view.h < 560 ? 0.78 : 0.86);
    const usableW = view.w - 8;
    view.scale = clamp(Math.min(usableH / map.pixelH, usableW / map.pixelW) * (zoomed ? 1.5 : 1), 0.35, 3.4);
    view.cy = view.h * 0.52;
  }

  function worldToScreen(x, y) {
    const o = origin();
    return { x: o.x + x * view.scale, y: o.y + y * view.scale };
  }

  function cameraTarget() {
    if (!state) return 0;
    const halfTravel = Math.max(0, (state.map.pixelW - view.w / view.scale) * 0.5);
    return clamp(state.player.x - state.map.pixelW * 0.5, -halfTravel, halfTravel);
  }

  function updateCamera() {
    if (!state) return;
    camX += (cameraTarget() - camX) * 0.12;
  }

  function toggleZoom() {
    zoomed = !zoomed;
    layoutCamera();
    camX = cameraTarget();
    $("helixZoomBtn").textContent = zoomed ? "全体" : "拡大";
    $("helixZoomBtn").setAttribute("aria-label", zoomed ? "ステージ全体を見る" : "ステージを拡大する");
  }

  /* -------------------------------------------------------------- stages -- */

  function startStage(index) {
    levelIndex = clamp(index, 0, sim.LEVELS.length - 1);
    state = sim.createState(levelIndex);
    particles = [];
    ghosts = [];
    shake = 0;
    flash = 0;
    prevJump = false;
    prevDash = false;
    releaseAll();
    lastActTap = 0;   // a tap clock from the last life must not dash the first
    layoutCamera();
    camX = cameraTarget();
    $("helixZoomBtn").textContent = zoomed ? "全体" : "拡大";
    $("helixZoomBtn").setAttribute("aria-label", zoomed ? "ステージ全体を見る" : "ステージを拡大する");
    hideCard();
    $("helixTitle").classList.add("off");
    $("helixPlay").classList.remove("off");
    document.body.classList.add("helix-active", "helix-playing");
    mode = "play";
    startMusic(124 + levelIndex * 8);
    const level = sim.LEVELS[levelIndex];
    $("helixStageNo").textContent = "STAGE " + String(level.id).padStart(2, "0");
    $("helixStageName").textContent = level.name;
    const lead = $("helixLead");
    if (lead) {
      // Restart the fade by forcing a reflow; re-assigning the same string
      // would otherwise leave the previous animation already finished.
      lead.classList.remove("show");
      lead.textContent = level.lead;
      void lead.offsetWidth;
      lead.classList.add("show");
    }
    updateHud();
  }

  function toTitle() {
    stopMusic();
    mode = "title";
    state = null;
    $("helixTitle").classList.remove("off");
    $("helixPlay").classList.add("off");
    hideCard();
    refreshTitle();
  }

  function exitHelix() {
    stopMusic();
    mode = "off";
    state = null;
    releaseAll();
    lastActTap = 0;
    document.body.classList.remove("helix-active", "helix-playing");
    $("helixTitle").classList.remove("off");
    $("helixPlay").classList.add("off");
    hideCard();
  }

  function refreshTitle() {
    const cleared = Object.keys(record.stages).length;
    const total = sim.LEVELS.length;
    $("helixRecord").textContent = cleared
      ? "CLEARED " + cleared + " / " + total + (record.ending ? " · SUMMIT REACHED" : "")
      : "STAGE 0 / " + total + " CLEARED";
    const btn = $("helixSoundBtn");
    if (btn) {
      btn.textContent = soundOn ? "\u266B" : "\u266A\u0338";
      btn.setAttribute("aria-label", soundOn ? "\u97F3\u3092\u6d88\u3059" : "\u97F3\u3092\u51fa\u3059");
    }
  }

  function stageUnlocked(i) {
    if (i === 0) return true;
    return !!(record.stages[i - 1] && record.stages[i - 1].cleared);
  }

  function stageCleared(i) {
    return !!(record.stages[i] && record.stages[i].cleared);
  }

  /* ---------------------------------------------------------------- flow -- */

  function onClear() {
    stopMusic();
    SFX.clear();
    const level = sim.LEVELS[levelIndex];
    const prev = record.stages[levelIndex] || { best: Infinity, deaths: 0 };
    const isBest = state.time < prev.best;
    record.stages[levelIndex] = {
      cleared: true,
      best: isBest ? state.time : prev.best,
      deaths: Math.min(prev.deaths || 0, state.deaths),
      pearls: Math.max(prev.pearls || 0, state.pearlsTaken)
    };
    const last = levelIndex >= sim.LEVELS.length - 1;
    if (last) {
      const sum = Object.keys(record.stages).reduce((acc, k) => acc + (record.stages[k].best || 0), 0);
      record.bestTotal = sum;
      record.ending = true;
    }
    save();

    const lastIdx = levelIndex >= sim.LEVELS.length - 1;
    setTimeout(() => {
      if (lastIdx) { showEnding(); return; }
      card("STAGE " + String(level.id).padStart(2, "0") + " CLEAR", level.name + " を越えた",
        gradeBlock() + (isBest ? '<p class="helix-sub">BEST TIME</p>' : ""),
        '<div class="helix-actions">' +
        '<button class="helix-primary" data-act="next">次の段へ <b>\u2197</b></button>' +
        '<button class="helix-ghost" data-act="stages">段を選ぶ</button>' +
        "</div>");
    }, 420);
  }

  function gradeBlock() {
    const t = state.time;
    const grade = state.deaths === 0 && state.pearlsTaken === totalPearls() ? "S"
      : state.deaths === 0 ? "A" : state.deaths <= 3 ? "B" : "C";
    return '<p class="helix-grade">' + grade + "</p>" +
      '<p class="helix-sub">TIME ' + t.toFixed(2) + "s \u00b7 DEATHS " + state.deaths + "</p>" +
      '<div class="helix-stats">' +
      "<div><strong>" + state.pearlsTaken + "</strong><span>PEARLS</span></div>" +
      "<div><strong>" + state.player.jumps + "</strong><span>JUMPS</span></div>" +
      "<div><strong>" + state.player.wallJumps + "</strong><span>WALL JUMPS</span></div>" +
      "</div>";
  }

  function totalPearls() {
    return state ? state.pearls.length : 0;
  }

  function showEnding() {
    mode = "ending";
    const sum = Object.keys(record.stages).reduce((acc, k) => acc + (record.stages[k].best || 0), 0);
    card("SUMMIT", "\u5cf0\u306b\u3064\u3044\u305f",
      '<p class="helix-grade">\u9053\u5f8c</p>' +
      '<p class="helix-sub">TOTAL ' + sum.toFixed(2) + "s \u00b7 " + Object.keys(record.stages).length + " / " + sim.LEVELS.length + "</p>" +
      "<p>\u4e94\u3064\u306e\u6bb5\u3092\u3001\u6b6a\u306e\u9014\u3067\u6e08\u307f\u8de8\u3057\u305f\u3002\n" +
      "\u4ed6\u306f\u4eca\u5ea6\u3001\u3053\u3053\u304b\u3089\u3082\u6c17\u3092\u6240\u3059\u306e\u3067\u3001\u5f1f\u306e\u9055\u306b\u9055\u3055\u308c\u3066\u3044\u305f\u3002</p>",
      '<div class="helix-actions">' +
      '<button class="helix-primary" data-act="stages">段を選び直す <b>\u2197</b></button>' +
      '<button class="helix-ghost" data-act="title">\u30bf\u30a4\u30c8\u30eb\u3078</button>' +
      "</div>");
    SFX.clear();
  }

  function onDeath() {
    if (state.deaths === 3) SFX.over();
  }

  function showStageSelect() {
    mode = "select";
    stopMusic();
    const cells = sim.LEVELS.map((lv, i) => {
      const open = stageUnlocked(i);
      const rec = record.stages[i];
      const sub = rec && rec.cleared ? rec.best.toFixed(2) + "s" : "\u2014";
      return '<button class="helix-stage-btn" data-stage="' + i + '"' + (open ? "" : " disabled") + ">" +
        String(lv.id).padStart(2, "0") + "<br><small>" + sub + "</small></button>";
    }).join("");
    card("STAGES", "\u6bb5\u3092\u9078\u3076",
      '<p class="helix-sub">\u6e05\u3051\u305f\u6bb5\u304b\u3089\u30d5\u30a9\u30fc\u30ab\u30b9\u306f\u89e3\u304d\u307e\u3059\u3002</p>' +
      '<div class="helix-stages">' + cells + "</div>",
      '<div class="helix-actions"><button class="helix-ghost" data-act="title">\u30bf\u30a4\u30c8\u30eb\u3078</button></div>');
  }

  /* -------------------------------------------------------------- overlay -- */

  function card(kicker, title, body, actions = "") {
    const el = $("helixOverlay");
    el.innerHTML = '<div class="helix-card wide"><p class="helix-kicker">' + kicker + "</p>" +
      "<h2>" + title + "</h2>" + body + actions + "</div>";
    el.classList.add("on");
  }

  function hideCard() {
    const el = $("helixOverlay");
    el.classList.remove("on");
    el.innerHTML = "";
  }

  let toastTimer = null;
  function toast(text) {
    const el = $("helixToast");
    el.textContent = text;
    el.classList.add("on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 1700);
  }

  function updateHud() {
    if (!state) return;
    $("helixTime").textContent = state.time.toFixed(2) + "s";
    $("helixDeaths").innerHTML = "落下 <b>" + state.deaths + "</b>";
    $("helixPearls").textContent = state.pearlsTaken + " / " + totalPearls();
  }

  /* ---------------------------------------------------------------- input -- */

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    Space: "jump", ArrowUp: "jump", KeyW: "jump", KeyZ: "jump",
    ShiftLeft: "dash", ShiftRight: "dash", KeyX: "dash", KeyK: "dash"
  };

  function applyKey(code, down) {
    const slot = KEYMAP[code];
    if (!slot) return false;
    input[slot] = down;
    return true;
  }

  function onKeyDown(e) {
    /* HELIX must not answer the keyboard until its own door is open. The mode
     * is "title" from page load, so without this guard a plain Enter on any
     * launcher button started a stage and covered the whole gallery. */
    if (!document.body.classList.contains("helix-active")) return;
    if (document.body.classList.contains("code-active") ||
        document.body.classList.contains("sync-active") ||
        document.body.classList.contains("sumifu-open")) return;
    if (e.repeat) return;
    if (mode !== "play") {
      if (mode === "title" && (e.key === "Enter" || e.code === "Space")) {
        /* A focused control wins. Enter on "‹ Test prim にもどる" is a click on
         * that button, and preventDefault here cancelled the activation, so
         * the gallery could never be left with the keyboard alone. */
        const el = document.activeElement;
        const onControl = !!el && el !== document.body &&
          (el.tagName === "BUTTON" || el.tagName === "A" ||
           el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable);
        if (!onControl) { startStage(0); e.preventDefault(); }
      }
      return;
    }
    if (e.code === "KeyP" || e.code === "Escape") { pause(); e.preventDefault(); return; }
    if (applyKey(e.code, true)) e.preventDefault();
  }

  function onKeyUp(e) {
    if (!document.body.classList.contains("helix-active")) return;
    if (applyKey(e.code, false)) e.preventDefault();
  }

  function releaseAll() {
    input.left = input.right = input.jump = input.dash = false;
    touches.clear();
  }

  /* Touch: the left thumb walks, the right thumb acts. One thumb carries two
   * verbs, so the second one is a double tap. A plain tap always jumps —
   * otherwise a tap can only ever jump and the dash has no route at all from
   * the ground, which is where most gaps are crossed from. */
  const touches = new Map();
  const DOUBLE_TAP_MS = 260;
  let lastActTap = 0;

  function pointerLane(x) {
    return x < view.w * 0.5 ? "move" : "act";
  }

  function onPointerDown(e) {
    if (mode !== "play") return;
    e.preventDefault();
    /* Capture keeps a thumb tracked past the canvas edge, but it is a request,
     * not a fact: a pointer that already ended, or an id the browser no longer
     * considers active, makes this throw. Uncaught, that aborts the handler
     * before the touch is recorded and the controls go dead for good. */
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* keep playing */ }
    const side = pointerLane(e.clientX);
    const action = side === "act" && performance.now() - lastActTap < DOUBLE_TAP_MS ? "dash" : "jump";
    touches.set(e.pointerId, { side, x: e.clientX, action });
    if (side === "act") lastActTap = action === "dash" ? 0 : performance.now();
    syncTouches();
  }

  function syncTouches() {
    let move = null;
    let jump = false;
    let dash = false;
    for (const touch of touches.values()) {
      if (touch.side === "move") move = touch;
      else if (touch.action === "dash") dash = true;
      else jump = true;
    }
    input.left = !!move && move.x < view.w * 0.25;
    input.right = !!move && move.x >= view.w * 0.25;
    input.jump = jump;
    input.dash = dash;
  }

  function onPointerMove(e) {
    const t = touches.get(e.pointerId);
    if (!t || t.side !== "move") return;
    e.preventDefault();
    t.x = e.clientX;
    syncTouches();
  }

  function onPointerUp(e) {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    syncTouches();
  }

  function pause() {
    if (mode !== "play") return;
    mode = "paused";
    stopMusic();
    releaseAll();
    card("PAUSED", "\u4e00\u62cd\u3001\u6b62\u3081\u308b",
      "<p>\u62cd\u306f\u3061\u3083\u3063\u3068\u6d88\u3048\u305f\u3002\u306b\u304d\u3081\u3066\u3044\u308b\u3002</p>",
      '<div class="helix-actions">' +
      '<button class="helix-primary" data-act="resume">\u3064\u305a\u3051\u308b</button>' +
      '<button class="helix-ghost" data-act="title">\u30bf\u30a4\u30c8\u30eb\u3078</button>' +
      "</div>");
  }

  function resume() {
    if (mode !== "paused") return;
    mode = "play";
    hideCard();
    prevJump = false;
    prevDash = false;
    startMusic(124 + levelIndex * 8);
  }

  /* --------------------------------------------------------------- update -- */

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === "jump") { SFX.jump(); burst(ev, 3); }
      else if (ev.type === "wallJump") { SFX.wallJump(); burst(ev, 4); }
      else if (ev.type === "land") { SFX.land(); shake = Math.max(shake, 2); }
      else if (ev.type === "dash") { SFX.dash(); shake = Math.max(shake, 3.5); dashTrail(); }
      else if (ev.type === "death") {
        SFX.death(); haptic(30); shake = 9; flash = 1;
        spawnDeathBurst(ev.x, ev.y);
      }
      else if (ev.type === "checkpoint") { SFX.checkpoint(); toast("\u706f\u3092\u8a18\u3057\u305f"); }
      else if (ev.type === "pearl") { SFX.pearl(); toast("\u706f " + (totalPearls() - ev.left) + " / " + totalPearls()); }
      else if (ev.type === "goal") { onClear(); }
    }
  }

  function step() {
    if (!state || mode !== "play") return;
    input.jumpPressed = input.jump && !prevJump;
    input.dashPressed = input.dash && !prevDash;
    prevJump = input.jump;
    prevDash = input.dash;
    const events = sim.update(state, DT, input);
    handleEvents(events);
    if (state.deaths > 0 && !state.player.dead && state.status === "running") onDeath();
  }

  /* --------------------------------------------------------------- effects -- */

  function burst(ev, count) {
    if (!state) return;
    const p = state.player;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: p.x, y: p.y + p.h / 2, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 70,
        life: 0.4, max: 0.4, size: 1.6, color: "#c9ff3d"
      });
    }
  }

  function dashTrail() {
    const p = state.player;
    ghosts.push({ x: p.x, y: p.y, life: 0.26, max: 0.26, dir: p.facing });
    if (ghosts.length > 10) ghosts.shift();
  }

  function spawnDeathBurst(x, y) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 190;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.6, max: 0.6, size: 1.8, color: "#ff3d7f"
      });
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].life -= dt;
      if (ghosts[i].life <= 0) ghosts.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 26);
    flash = Math.max(0, flash - dt * 2.4);
  }

  /* ---------------------------------------------------------------- draw -- */

  const BG = { deep: "#05060a", mid: "#0a0e16", line: "rgba(201,255,61,.07)" };

  function draw() {
    if (!state) { drawIdle(); return; }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, BG.mid);
    g.addColorStop(1, BG.deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawGrid();
    drawLevel();
    drawEntities();
    drawGhosts();
    drawPlayer();
    drawParticles();

    ctx.restore();

    if (flash > 0.01) {
      ctx.fillStyle = "rgba(255,61,127," + (flash * 0.45).toFixed(3) + ")";
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function drawIdle() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = BG.deep;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawGrid() {
    const map = state.map;
    const step = TILE * view.scale;
    const offX = -camX * view.scale + view.w * 0.5 - map.pixelW * view.scale * 0.5;
    const offY = view.cy - map.pixelH * view.scale * 0.5;
    ctx.save();
    ctx.strokeStyle = BG.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= map.w; x++) {
      const sx = offX + x * step;
      if (sx < -step || sx > view.w + step) continue;
      ctx.moveTo(sx, offY);
      ctx.lineTo(sx, offY + map.pixelH * view.scale);
    }
    for (let y = 0; y <= map.h; y++) {
      const sy = offY + y * step;
      ctx.moveTo(offX, sy);
      ctx.lineTo(offX + map.pixelW * view.scale, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function origin() {
    const map = state.map;
    return {
      x: -camX * view.scale + view.w * 0.5 - map.pixelW * view.scale * 0.5,
      y: view.cy - map.pixelH * view.scale * 0.5
    };
  }

  function drawLevel() {
    const map = state.map;
    const o = origin();
    const s = view.scale;
    const px = map.pixelW * s;
    const py = map.pixelH * s;

    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x, o.y, px, py);
    ctx.clip();

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (!map.solid[y * map.w + x]) continue;
        const sx = o.x + x * TILE * s;
        const sy = o.y + y * TILE * s;
        const w = TILE * s;
        /* A slab has to read instantly against a near-black backdrop: this is a
         * precision platformer and a platform you cannot see is a platform you
         * cannot land on. The lime cap is the light source, the darker lower
         * band is its shadow. */
        const openAbove = y === 0 || !map.solid[(y - 1) * map.w + x];
        ctx.fillStyle = "#1b2230";
        ctx.fillRect(sx, sy, w, w);
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.fillRect(sx, sy + w * 0.66, w, w * 0.34);
        /* The lime cap marks a surface you can actually stand on. Painting it
         * on every solid tile turned the level's border walls into a barcode
         * and told the eye nothing. */
        if (openAbove) {
          const cap = Math.max(2, 1.7 * s);
          ctx.fillStyle = "#c9ff3d";
          ctx.fillRect(sx, sy, w, cap);
          ctx.fillStyle = "rgba(201,255,61,.16)";
          ctx.fillRect(sx, sy + cap, w, Math.max(1, 0.9 * s));
        }
        ctx.strokeStyle = "rgba(238,242,246,.07)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, w - 1, w - 1);
      }
    }

    for (let i = 0; i < map.spike.length; i++) {
      if (!map.spike[i]) continue;
      const x = i % map.w;
      const y = Math.floor(i / map.w);
      const dir = map.spikeDir[i];
      const sx = o.x + x * TILE * s;
      const sy = o.y + y * TILE * s;
      const w = TILE * s;
      ctx.fillStyle = "#ff3d7f";
      ctx.beginPath();
      if (dir === "^") { ctx.moveTo(sx, sy + w); ctx.lineTo(sx + w * 0.5, sy + w * 0.12); ctx.lineTo(sx + w, sy + w); }
      else if (dir === "v") { ctx.moveTo(sx, sy); ctx.lineTo(sx + w * 0.5, sy + w * 0.88); ctx.lineTo(sx + w, sy); }
      else if (dir === "<") { ctx.moveTo(sx + w, sy); ctx.lineTo(sx + w * 0.12, sy + w * 0.5); ctx.lineTo(sx + w, sy + w); }
      else { ctx.moveTo(sx, sy); ctx.lineTo(sx + w * 0.88, sy + w * 0.5); ctx.lineTo(sx, sy + w); }
      ctx.closePath();
      ctx.fill();
    }

    for (const c of state.checkpoints) {
      const p = worldToScreen((c.x + 0.5) * TILE, (c.y + 0.5) * TILE);
      const r = 7 * s;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = c.taken ? "#c9ff3d" : "rgba(238,242,246,.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      if (c.taken) {
        ctx.fillStyle = "rgba(201,255,61,.3)";
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.5 + 0.3 * Math.sin(clock * 3)), 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(238,242,246,.4)";
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, r * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const q of state.pearls) {
      if (q.taken) continue;
      const p = worldToScreen(q.x, q.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(clock * 2);
      ctx.fillStyle = "#c9ff3d";
      ctx.shadowBlur = 14 * s * 0.5;
      ctx.shadowColor = "rgba(201,255,61,.8)";
      const r = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const goal = worldToScreen(state.map.goal.x, state.map.goal.y);
    ctx.save();
    ctx.translate(goal.x, goal.y);
    ctx.strokeStyle = "#c9ff3d";
    ctx.shadowBlur = 24;
    ctx.shadowColor = "rgba(201,255,61,.7)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const rr = (8 + i * 4) * s * (0.9 + 0.1 * Math.sin(clock * 2 + i));
      ctx.globalAlpha = 0.85 - i * 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  function drawEntities() {
    const o = origin();
    const s = view.scale;

    for (const m of state.movers) {
      const p = worldToScreen(m.x + m.w / 2, m.y + m.h / 2);
      const w = m.w * s;
      const h = m.h * s;
      ctx.fillStyle = "#1b2230";
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.strokeStyle = "rgba(77,227,255,.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
    }

    for (const sp of state.spinners) {
      const p = worldToScreen(sp.x, sp.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(sp.angle);
      ctx.strokeStyle = "#ff3d7f";
      ctx.lineWidth = Math.max(2, sp.thick * s * 0.5);
      ctx.lineCap = "round";
      for (let k = 0; k < 2; k++) {
        ctx.rotate(Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(sp.arm * s, 0);
        ctx.stroke();
      }
      ctx.rotate(-sp.angle);
      ctx.fillStyle = "#eef2f6";
      ctx.beginPath();
      ctx.arc(0, 0, 3.2 * s * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const d of state.drones) {
      // The rail first: a sentry you cannot see the path of is a coin flip.
      const top = worldToScreen(d.ox, d.oy - d.range);
      const bot = worldToScreen(d.ox, d.oy + d.range);
      ctx.save();
      ctx.strokeStyle = "rgba(77,227,255,.22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3 * s, 4 * s]);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bot.x, bot.y);
      ctx.stroke();
      ctx.restore();

      const p = worldToScreen(d.x, d.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(clock * 1.6);
      ctx.fillStyle = "#4de3ff";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "rgba(77,227,255,.7)";
      const r = d.w * s * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    void o;
  }

  function drawGhosts() {
    const s = view.scale;
    for (const g of ghosts) {
      const p = worldToScreen(g.x, g.y);
      const a = g.life / g.max;
      ctx.save();
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = "#c9ff3d";
      const w = state.player.w * s;
      const h = state.player.h * s;
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.restore();
    }
  }

  function drawPlayer() {
    const p = state.player;
    const s = view.scale;
    const at = worldToScreen(p.x, p.y);
    const w = p.w * s;
    const h = p.h * s;

    if (p.dead) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ff3d7f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, Math.max(w, h) * 0.8, 0, TAU);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    if (p.invuln > 0 && Math.floor(clock * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.translate(at.x, at.y);

    // facing nub so the dash direction reads at a glance
    ctx.fillStyle = "#05060a";
    ctx.fillRect(p.facing > 0 ? w * 0.1 : -w * 0.34, -h * 0.16, w * 0.24, h * 0.2);
    ctx.fillStyle = "#c9ff3d";
    ctx.fillRect(p.facing > 0 ? w * 0.1 : -w * 0.34, -h * 0.16, w * 0.24, h * 0.2);

    ctx.fillStyle = "#eef2f6";
    ctx.fillRect(-w / 2, -h / 2, w, h);

    ctx.strokeStyle = p.dashTime > 0 ? "#4de3ff" : "#c9ff3d";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawParticles() {
    const s = view.scale;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      const at = worldToScreen(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      const r = p.size * s * 0.5;
      ctx.fillRect(at.x - r, at.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- loop -- */

  let clock = 0;
  let acc = 0;
  let lastFrame = 0;

  function frame(nowMs) {
    requestAnimationFrame(frame);
    /* While HELIX is closed its canvas is display:none. Painting into it still
     * costs a full frame of work at 60 Hz for a picture nobody sees, so the
     * loop idles until the launcher button is pressed. */
    if (mode === "off") { lastFrame = 0; acc = 0; return; }
    if (!lastFrame) lastFrame = nowMs;
    let dt = (nowMs - lastFrame) / 1000;
    lastFrame = nowMs;
    if (!(dt >= 0)) dt = 0;
    dt = Math.min(dt, 0.25);
    clock += dt;

    acc += dt;
    let guard = 6;
    while (acc >= DT && guard-- > 0) {
      step();
      acc -= DT;
    }
    if (acc > DT * 6) acc = 0;

    updateEffects(dt);
    updateCamera();
    draw();
    if (mode === "play") updateHud();
  }

  /* ----------------------------------------------------------------- wire -- */

  function bind(id, fn) {
    const el = $(id);
    if (el) el.addEventListener("click", (e) => { e.preventDefault(); fn(e); });
  }

  bind("helixOpenBtn", () => {
    SFX.ui();
    audio.context();
    document.body.classList.add("helix-active");
    toTitle();
  });
  bind("helixReturnBtn", () => { SFX.ui(); exitHelix(); });
  bind("helixStartBtn", () => { SFX.ui(); audio.context(); startStage(0); });
  bind("helixStagesBtn", () => { SFX.ui(); showStageSelect(); });
  bind("helixZoomBtn", () => { SFX.ui(); toggleZoom(); });
  bind("helixPauseBtn", () => { SFX.ui(); pause(); });
  bind("helixSoundBtn", () => {
    soundOn = !soundOn;
    saveSound();
    audio.context();
    audio.applyMute();
    const btn = $("helixSoundBtn");
    if (btn) {
      btn.textContent = soundOn ? "\u266B" : "\u266A\u0338";
      btn.setAttribute("aria-label", soundOn ? "\u97F3\u3092\u6d88\u3059" : "\u97F3\u3092\u51fa\u3059");
    }
  });

  $("helixOverlay").addEventListener("click", (e) => {
    const stage = e.target.closest ? e.target.closest("[data-stage]") : null;
    if (stage) {
      SFX.ui();
      startStage(Number(stage.dataset.stage));
      return;
    }
    const btn = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn) return;
    const act = btn.dataset.act;
    SFX.ui();
    if (act === "next") startStage(levelIndex + 1);
    else if (act === "stages") showStageSelect();
    else if (act === "resume") resume();
    else if (act === "title") { stopMusic(); toTitle(); }
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => { releaseAll(); if (mode === "play") pause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") pause(); });
  window.addEventListener("resize", () => { resize(); });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* Boot with mode "off" so the render loop idles until the launcher button
   * is pressed. toTitle() here would flip the mode to "title" immediately and
   * the loop would paint a display:none canvas sixty times a second for the
   * whole session. refreshTitle() is all the markup actually needs. */
  refreshTitle();
  resize();
  requestAnimationFrame(frame);

  window.__helix = {
    enter() { document.body.classList.add("helix-active"); toTitle(); },
    exit: exitHelix,
    start: startStage,
    getMode: () => mode,
    getState: () => state,
    getRecord: () => JSON.parse(JSON.stringify(record)),
    press(key, down) { applyKey(key, down); },
    setIntent(str) {
      input.left = str.indexOf("L") >= 0;
      input.right = str.indexOf("R") >= 0;
      input.jump = str.indexOf("J") >= 0;
      input.dash = str.indexOf("K") >= 0;
    },
    tick() { step(); },
    setClock(v) { clock = v; },

    /* Drive a stage's stored clearing script through the real input path:
     * the same key state a player produces, including the rising-edge detection
     * that a held jump needs. The node test replays the script straight through
     * runScript; this one proves the renderer and input layer agree with it. */
    replayScript(index) {
      startStage(index);
      const script = sim.LEVELS[index].script || [];
      let frames = 0;
      for (const pair of script) {
        for (let i = 0; i < pair[1]; i++) {
          window.__helix.setIntent(pair[0]);
          window.__helix.tick();
          frames++;
          if (!state || state.status !== "running") break;
        }
        if (!state || state.status !== "running") break;
      }
      releaseAll();
      return {
        finished: !!(state && state.finished),
        deaths: state ? state.deaths : 0,
        time: state ? state.time : 0,
        frames: frames
      };
    },

    /* What the canvas actually contains. A DOM assertion cannot tell a rendered
     * stage from a display:none canvas that was never painted, and a
     * brightness ratio drifts with the viewport. Counting the game's own
     * signature colour does not: a bare backdrop has none of it at all. */
    painted() {
      const w = canvas.width, h = canvas.height;
      if (!w || !h) return { samples: 0, lit: 0, lime: 0, magenta: 0 };
      const data = ctx.getImageData(0, 0, w, h).data;
      let lit = 0, lime = 0, magenta = 0, samples = 0;
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const i = (y * w + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          samples++;
          if (r + g + b > 150) lit++;
          if (g > 130 && g > r + 45 && g > b + 45) lime++;
          if (r > 130 && b > 80 && r > g + 45) magenta++;
        }
      }
      return { samples, lit, lime, magenta };
    }
  };
})();
