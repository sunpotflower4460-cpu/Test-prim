"use strict";
// KASANE — 重ね
// A three-night ink arena for Test prim, written by Grok 4.7 Cursor.
// You move a brush-fox across a sheet of paper. Slashes leave wet strokes;
// crossing two strokes binds them. Cutting an attack during its gold flash parries.
(() => {
  const TAU = Math.PI * 2;
  const SAVE = "kasane-ink-v1";
  const $ = id => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  const THEMES = [
    { name: "第一夜 · 薄墨の間", short: "薄墨の間", boss: "にじむ表紙", line: "余白が、まだ息をしている。", paper: "#efe4d2", paperTop: "#fffaf3", ink: "#241c17", accent: "#9c3a30", gold: "#a67c3d", fox: "#fffaf3", fiber: "rgba(70,48,28,.16)", eye: "#f4ecdf" },
    { name: "第二夜 · 朱重ね", short: "朱重ね", boss: "朱の番人", line: "古い封が、熱を持っている。", paper: "#6a2a28", paperTop: "#7d3834", ink: "#f6e4da", accent: "#ffb15e", gold: "#f0d7a1", fox: "#fff7ef", fiber: "rgba(255,220,200,.16)", eye: "#5a2422" },
    { name: "第三夜 · 金の綴じ", short: "金の綴じ", boss: "夜を綴じる者", line: "夜は、ここで閉じられる。", paper: "#161922", paperTop: "#222633", ink: "#f3ead8", accent: "#e4c56a", gold: "#f0e2b0", fox: "#fffaf0", fiber: "rgba(230,220,190,.14)", eye: "#12141c" }
  ];
  const BOSS_AT = [8, 12, 14];
  const UP_AT = [[4], [6], [4, 9]];
  const SPAWN = [
    { interval: 1.35, table: [["blot", 0.72], ["press", 1]] },
    { interval: 1.12, table: [["blot", 0.34], ["dart", 0.7], ["press", 1]] },
    { interval: 0.98, table: [["dart", 0.42], ["press", 0.78], ["blot", 1]] }
  ];
  const KINDS = {
    blot: { hp: 36, speed: 68, r: 20, dmg: 9 },
    dart: { hp: 28, speed: 52, r: 15, dmg: 11 },
    press: { hp: 72, speed: 64, r: 23, dmg: 14 },
    boss: { hp: 260, speed: 48, r: 36, dmg: 16 }
  };
  const BRUSHES = [
    { id: "reach", icon: "長", name: "長い筆", desc: "斬撃が遠くまで届く", max: 3, apply: p => { p.slashRange += 14; } },
    { id: "haste", icon: "疾", name: "速い筆", desc: "次の一斬までの間が縮む", max: 3, apply: p => { p.slashCdMax *= 0.84; } },
    { id: "power", icon: "濃", name: "濃い墨", desc: "筆のダメージが増す", max: 4, apply: p => { p.damage += 6; } },
    { id: "seal", icon: "封", name: "二重封", desc: "封が早く戻り、範囲が広がる", max: 3, apply: p => { p.sealCdMax *= 0.82; p.sealR += 10; } },
    { id: "trail", icon: "糸", name: "残糸", desc: "ダッシュの墨跡が長く、鋭くなる", max: 3, apply: p => { p.trailLife += 0.22; p.trailPower += 0.85; } },
    { id: "parry", icon: "受", name: "受けの呼吸", desc: "受けの間が広がり、受けると回復する", max: 3, apply: p => { p.parryWin += 0.045; p.parryHeal += 6; } },
    { id: "wind", icon: "風", name: "風の余白", desc: "紙のうえを速く渡る", max: 3, apply: p => { p.speed *= 1.1; } },
    { id: "life", icon: "命", name: "生命の紙", desc: "最大生命が増え、その場で回復する", max: 4, apply: p => { p.maxHp += 28; p.hp = Math.min(p.maxHp, p.hp + 42); } }
  ];
  const MODES = [[0, 1, 5, 7, 10], [0, 2, 5, 7, 9], [0, 3, 5, 7, 10]];
  const MELODY = [[0, 2, -1, 4, 2, -1, 3, 1], [0, -1, 3, 1, 4, 2, -1, 0], [1, 0, 3, -1, 4, 2, 4, -1]];
  const ROOTS = [220, 196, 174.61];

  const canvas = $("sumifu-world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const ui = {
    root: $("sumifu"), title: $("sumifu-title"), top: $("sumifu-top"), controls: $("sumifu-controls"),
    overlay: $("sumifu-overlay"), flash: $("sumifu-flash"),
    chapter: $("sumifuChapter"), hp: $("sumifuHp"), hpLabel: $("sumifuHpLabel"),
    ink: $("sumifuInk"), time: $("sumifuTime"), hint: $("sumifuHint"), combo: $("sumifuCombo"),
    boss: $("sumifuBoss"), bossName: $("sumifuBossName"), bossFill: $("sumifuBossFill"),
    sound: $("sumifuSound"), titleSound: $("sumifuTitleSound"), record: $("sumifuRecord"),
    knob: $("sumifuKnob"), slashBtn: $("sumifuSlash"),
    sealFill: $("sumifuSealFill"), dashFill: $("sumifuDashFill"), sealBtn: $("sumifuSeal"), dashBtn: $("sumifuDash")
  };

  let saved = { best: 0, wins: 0, music: true };
  try { saved = Object.assign(saved, JSON.parse(localStorage.getItem(SAVE) || "{}")); } catch (err) {}
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch (err) {} };

  const keys = new Set();
  const stick = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
  const mouse = { x: 0, y: 0, hot: false, at: -10 };
  const paper = { x: 0, y: 0, w: 1, h: 1 };
  const view = { scale: 1 };
  const motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.6, 1.8), s: rand(0.012, 0.03), a: rand(0.15, 0.55), p: rand(0, TAU) }));
  let fibers = [];
  let W = 390, H = 800, DPR = 1;
  let scene = "closed";
  let game = null;
  let picks = [];
  let last = 0, clock = 0, shake = 0, freeze = 0, beat = 0, musicAt = 0;
  let audio = null, noiseBuf = null, toastUntil = 0;
  let reduced = false;
  try { reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (err) {}

  function T() { return THEMES[game ? game.stage : 0]; }
  function prad() { return 34 * view.scale; }
  function rad(e) { return e.baseR * view.scale; }
  function srange() { return game.player.slashRange * view.scale; }
  function clockText(t) {
    const s = Math.max(0, Math.floor(t));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function layout() {
    W = Math.max(280, window.innerWidth || 390);
    H = Math.max(420, window.innerHeight || 800);
    DPR = Math.min((window.devicePixelRatio || 1), 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const battle = game && scene !== "title" && scene !== "closed";
    const hud = battle ? (H < 680 ? 126 : 158) : 8;
    const foot = battle ? (H < 680 ? 124 : 156) : 8;
    const margin = Math.max(12, W * 0.045);
    const availW = Math.max(120, W - margin * 2);
    const availH = Math.max(120, H - hud - foot);
    let pw = Math.min(availW, 560);
    let ph = Math.min(availH, pw * 1.36);
    pw = Math.min(pw, Math.max(160, ph / 1.08));
    const prev = game && paper.w > 2 ? { x: (game.player.x - paper.x) / paper.w, y: (game.player.y - paper.y) / paper.h } : null;
    paper.w = pw;
    paper.h = ph;
    paper.x = (W - pw) / 2;
    paper.y = hud + Math.max(0, (availH - ph) / 2);
    view.scale = clamp(pw / 400, 0.78, 1.22);
    if (prev && game) {
      game.player.x = paper.x + clamp(prev.x, 0.08, 0.92) * pw;
      game.player.y = paper.y + clamp(prev.y, 0.08, 0.92) * ph;
    }
  }

  function buildFibers() {
    fibers = [];
    for (let i = 0; i < 40; i++) {
      fibers.push({ y: rand(0.05, 0.95), x0: rand(0, 0.18), x1: rand(0.62, 1), a: rand(0.04, 0.09), w: rand(0.4, 1.15), bow: rand(-0.012, 0.012) });
    }
  }

  function freshPlayer() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, speed: 232, damage: 22,
      facing: -Math.PI / 2, slashCd: 0, slashCdMax: 0.36, slashTime: 0, slashDur: 0.2,
      slashAngle: -Math.PI / 2, slashRange: 86, slashArc: 1.8, slashHit: new Set(),
      sealCd: 0, sealCdMax: 4.1, sealR: 56,
      dashCd: 0, dashTime: 0, dashX: 0, dashY: -1, invuln: 0,
      combo: 0, comboT: 0, trailLife: 0.72, trailPower: 1, parryWin: 0.2, parryHeal: 0,
      levels: {}, bleedT: 0, walk: 0
    };
  }
  function freshGame() {
    return {
      player: freshPlayer(), stage: 0, time: 0, chapterKills: 0, kills: 0,
      enemies: [], shots: [], seals: [], strokes: [], trails: [], particles: [], texts: [], decals: [],
      nextId: 1, spawnCd: 1.6, bossSpawned: false, boss: null, settled: false,
      didSlash: false, didBind: false, didParry: false, taughtBind: false, taughtParry: false,
      parries: 0, bestCombo: 0, bleed: 0
    };
  }

  function syncSound() {
    const on = !!saved.music;
    ui.sound.textContent = on ? "♫" : "×";
    ui.titleSound.textContent = on ? "音を消す" : "音を出す";
    ui.sound.setAttribute("aria-label", on ? "音を消す" : "音を出す");
  }
  function loadRecord() {
    ui.record.textContent = (saved.best || saved.wins) ? ("最深 第" + saved.best + "夜  /  全綴じ " + saved.wins + " 回") : "まだ、紙は白い。";
    syncSound();
  }
  function toggleSound() {
    saved.music = !saved.music;
    persist();
    if (saved.music) audioInit();
    syncSound();
  }
  function toast(message) {
    toastUntil = clock + 1.45;
    ui.hint.textContent = message;
    ui.hint.classList.add("sumifu-hint-hot");
  }
  function flash(alpha) {
    ui.flash.style.opacity = String(alpha || 0.35);
    setTimeout(() => { ui.flash.style.opacity = "0"; }, 40);
  }
  function haptic(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (err) {} } }
  function card(kicker, title, message, extra) {
    ui.overlay.innerHTML = '<div class="sumifu-card"><p class="sumifu-kicker">' + kicker + '</p><h2>' + title + '</h2><p class="sumifu-lead">' + message + '</p>' + (extra || "") + '</div>';
  }
  function bind(id, fn) {
    const el = $(id);
    if (el) el.addEventListener("click", fn);
    return el;
  }
  function setScene(next) {
    scene = next;
    const open = next !== "closed";
    ui.root.classList.toggle("hidden", !open);
    if (ui.root.setAttribute) ui.root.setAttribute("aria-hidden", open ? "false" : "true");
    if (document.body && document.body.classList) document.body.classList.toggle("sumifu-open", open);
    ui.title.classList.toggle("hidden", next !== "title");
    const battleChrome = open && next !== "title";
    ui.top.classList.toggle("hidden", !battleChrome);
    ui.controls.classList.toggle("hidden", next !== "playing");
    const modal = next === "paused" || next === "upgrade" || next === "chapter" || next === "over" || next === "won";
    ui.overlay.classList.toggle("hidden", !modal);
    if (next !== "playing") resetStick();
  }
  function hintText() {
    if (!game.didSlash) return "J / 斬 で筆を振る";
    if (!game.didBind) return "筆跡を交差させると結ぶ";
    if (!game.didParry) return "金の輪の瞬間を斬ると受ける";
    return T().line;
  }
  function updateHud() {
    if (!game) return;
    const p = game.player;
    ui.hp.style.width = (100 * clamp(p.hp, 0, p.maxHp) / p.maxHp) + "%";
    ui.hpLabel.textContent = Math.ceil(Math.max(0, p.hp)) + " / " + Math.round(p.maxHp);
    ui.ink.style.width = (100 * clamp(game.chapterKills / BOSS_AT[game.stage], 0, 1)) + "%";
    ui.chapter.textContent = T().name;
    ui.time.textContent = clockText(game.time);
    if (clock >= toastUntil) {
      ui.hint.textContent = hintText();
      ui.hint.classList.remove("sumifu-hint-hot");
    }
    ui.combo.textContent = p.combo > 1 ? ("結 " + p.combo) : "";
    ui.slashBtn.classList.toggle("sumifu-coach", !game.didSlash);
    ui.dashFill.style.transform = "scaleY(" + clamp(p.dashCd / 2.05, 0, 1) + ")";
    ui.sealFill.style.transform = "scaleY(" + clamp(p.sealCd / p.sealCdMax, 0, 1) + ")";
    ui.dashBtn.classList.toggle("recharging", p.dashCd > 0.08);
    ui.sealBtn.classList.toggle("recharging", p.sealCd > 0.08);
    if (game.boss && game.boss.hp > 0) ui.bossFill.style.width = (100 * game.boss.hp / game.boss.maxHp) + "%";
  }

  function audioInit(then) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!audio && Ctor) { try { audio = new Ctor(); } catch (err) { audio = null; } }
    if (audio && audio.state === "suspended") audio.resume().then(() => { if (then) then(); }).catch(() => {});
    else if (then) then();
  }
  function tone(freq, dur, type, volume, slide, delay) {
    if (!saved.music || !audio || audio.state !== "running") return;
    const at = audio.currentTime + (delay || 0);
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(Math.max(40, freq), at);
      if (slide && slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), at + dur);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + Math.min(0.03, dur / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    } catch (err) {}
  }
  function noise(dur, volume, freq) {
    if (!saved.music || !audio || audio.state !== "running") return;
    try {
      if (!noiseBuf) {
        const len = Math.floor(audio.sampleRate * 0.25);
        noiseBuf = audio.createBuffer(1, len, audio.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = audio.createBufferSource();
      src.buffer = noiseBuf;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq || 900;
      filter.Q.value = 0.6;
      const gain = audio.createGain();
      const at = audio.currentTime;
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(filter).connect(gain).connect(audio.destination);
      src.start(at);
      src.stop(at + dur);
    } catch (err) {}
  }
  function sound(kind) {
    if (kind === "slash") { noise(0.08, 0.045, 1200); tone(380, 0.09, "triangle", 0.028, 0.45); }
    else if (kind === "bind") [523, 659, 784].forEach((n, i) => tone(n, 0.26, "sine", 0.03, 1, i * 0.03));
    else if (kind === "parry") [784, 1046, 1568].forEach((n, i) => tone(n, 0.2, "sine", 0.034, 1, i * 0.02));
    else if (kind === "seal") tone(186, 0.16, "sine", 0.03, 0.75);
    else if (kind === "boom") { noise(0.18, 0.06, 220); tone(78, 0.3, "triangle", 0.05, 0.55); }
    else if (kind === "dash") tone(280, 0.14, "triangle", 0.03, 1.9);
    else if (kind === "hurt") tone(98, 0.18, "sawtooth", 0.04, 0.45);
    else if (kind === "kill") tone(620, 0.12, "sine", 0.028, 1.5);
    else if (kind === "cut") tone(980, 0.06, "sine", 0.02, 1.3);
    else if (kind === "boss") { tone(92, 0.55, "triangle", 0.04, 0.65); tone(184, 0.4, "sine", 0.02, 0.8, 0.06); }
    else if (kind === "win") [392, 494, 587, 784].forEach((n, i) => tone(n, 0.55, "triangle", 0.04, 1, i * 0.11));
    else if (kind === "ui") tone(523, 0.08, "sine", 0.02, 1.15);
  }
  function flourish() {
    [392, 440, 523, 659].forEach((f, i) => tone(f, 0.42, "triangle", 0.032, 1, i * 0.08));
  }
  function music() {
    if (!saved.music || !audio || audio.state !== "running") return;
    if (clock < musicAt) return;
    musicAt = clock + 0.48;
    const stage = game.stage;
    const step = MELODY[stage][beat % 8];
    const root = ROOTS[stage];
    if (step >= 0) {
      const freq = root * Math.pow(2, MODES[stage][step] / 12);
      tone(freq, 0.36, "triangle", 0.02, 1);
    }
    if (beat % 8 === 0) tone(root / 2, 1.5, "sine", 0.012, 1);
    beat++;
  }

  function burst(x, y, count, color, power) {
    if (!game) return;
    const n = reduced ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n && game.particles.length < 150; i++) {
      const a = rand(0, TAU), s = rand(28, 150) * (power || 1), life = rand(0.22, 0.65);
      game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: rand(1.2, 3.3), color });
    }
  }
  function rise(x, y, text, color) {
    if (!game) return;
    if (game.texts.length > 22) game.texts.shift();
    game.texts.push({ x, y, text, color: color || T().ink, life: 0.7, max: 0.7 });
  }
  function splatter(x, y, r) {
    if (game.decals.length > 26) game.decals.shift();
    game.decals.push({ x, y, r, life: 8, max: 8, phase: rand(0, TAU) });
  }

  function centerPlayer() {
    game.player.x = paper.x + paper.w * 0.5;
    game.player.y = paper.y + paper.h * 0.62;
    game.player.vx = 0;
    game.player.vy = 0;
  }
  function clampInto(r, x, y) {
    const minX = paper.x + r + 2, maxX = paper.x + paper.w - r - 2;
    const minY = paper.y + r + 2, maxY = paper.y + paper.h - r - 2;
    return [clamp(x, Math.min(minX, maxX), Math.max(minX, maxX)), clamp(y, Math.min(minY, maxY), Math.max(minY, maxY))];
  }
  function clampPlayer() {
    const p = game.player;
    const next = clampInto(prad(), p.x, p.y);
    p.x = next[0];
    p.y = next[1];
  }
  function edgePoint() {
    const m = 18;
    const side = Math.floor(Math.random() * 4);
    let x = paper.x + paper.w * 0.5, y = paper.y + paper.h * 0.5;
    if (side === 0) { x = rand(paper.x + m, paper.x + paper.w - m); y = paper.y + m; }
    else if (side === 1) { x = rand(paper.x + m, paper.x + paper.w - m); y = paper.y + paper.h - m; }
    else if (side === 2) { x = paper.x + m; y = rand(paper.y + m, paper.y + paper.h - m); }
    else { x = paper.x + paper.w - m; y = rand(paper.y + m, paper.y + paper.h - m); }
    const p = game.player;
    if (Math.hypot(x - p.x, y - p.y) < 90) x = paper.x + paper.w - (x - paper.x);
    return [x, y];
  }
  function spawnEnemy(type, x, y) {
    if (!game) return null;
    if (x === undefined) { const pt = edgePoint(); x = pt[0]; y = pt[1]; }
    const base = KINDS[type];
    const hp = base.hp * (1 + game.stage * 0.16);
    const e = {
      id: game.nextId++, type, x, y, hp, maxHp: hp, speed: base.speed * (1 + game.stage * 0.06),
      baseR: base.r, touchDmg: base.dmg + game.stage * 2, state: "move", cd: rand(0.15, 0.7),
      stun: 0, hitFx: 0, phase: rand(0, TAU), touch: 0.45, lungeAge: 0, parried: false,
      aimX: x, aimY: y, lx: 0, ly: -1, face: -Math.PI / 2, windMax: 0.6, slamMax: 0.9,
      safe: 0, phase2: false, didHit: false
    };
    if (type === "boss") {
      e.hp = [250, 360, 480][game.stage];
      e.maxHp = e.hp;
      e.state = "idle";
      e.cd = 1.05;
      e.baseR = 36 + game.stage * 3;
    }
    game.enemies.push(e);
    return e;
  }
  function openingWave() {
    const sets = [["blot", "blot"], ["blot", "dart"], ["press", "dart"]];
    for (let i = 0; i < sets[game.stage].length; i++) spawnEnemy(sets[game.stage][i]);
    game.spawnCd = game.stage === 0 ? 2.1 : 1.15;
  }
  function beginChapter() {
    game.chapterKills = 0;
    game.bossSpawned = false;
    game.boss = null;
    game.bleed = 0;
    game.spawnCd = 1.4;
    game.enemies = [];
    game.shots = [];
    game.seals = [];
    game.strokes = [];
    game.trails = [];
    game.player.slashTime = 0;
    game.player.dashTime = 0;
    game.player.invuln = 0.85;
    game.player.combo = 0;
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 34);
    ui.boss.classList.add("hidden");
    buildFibers();
    setScene("playing");
    layout();
    centerPlayer();
    openingWave();
    updateHud();
    toast(T().short);
    flash(0.18);
  }
  function startRun() {
    audioInit(flourish);
    game = freshGame();
    beat = 0;
    musicAt = clock;
    shake = 0;
    freeze = 0;
    mouse.hot = false;
    beginChapter();
  }
  function backTitle() {
    if (game && !game.settled) {
      saved.best = Math.max(saved.best, game.stage + 1);
      persist();
    }
    game = null;
    freeze = 0;
    setScene("title");
    loadRecord();
  }
  function pause() {
    if (scene !== "playing") return;
    card("STILL INK", "筆を、置く", "墨は乾かない。続きは、ここから。", '<button class="sumifu-go" id="sumifuResume" type="button">筆を続ける</button><br><button class="sumifu-quiet" id="sumifuQuit" type="button">題名に戻る</button>');
    bind("sumifuResume", () => { audioInit(); setScene("playing"); });
    bind("sumifuQuit", backTitle);
    setScene("paused");
  }
  function gameOver() {
    if (!game || game.settled || scene !== "playing") return;
    game.settled = true;
    saved.best = Math.max(saved.best, game.stage + 1);
    persist();
    card("INK DRIES", "墨が、先に乾いた。", "筆は、まだ手元にある。", '<div class="sumifu-stats"><span><strong>' + (game.stage + 1) + '</strong>夜</span><span><strong>' + game.kills + '</strong>打ち込み</span><span><strong>' + game.parries + '</strong>受け</span></div><button class="sumifu-go" id="sumifuRetry" type="button">もう一筆</button><br><button class="sumifu-quiet" id="sumifuToTitle" type="button">題名に戻る</button>');
    bind("sumifuRetry", startRun);
    bind("sumifuToTitle", backTitle);
    setScene("over");
    sound("hurt");
  }
  function win() {
    if (!game || game.settled) return;
    game.settled = true;
    saved.best = 3;
    saved.wins += 1;
    persist();
    card("THE NIGHT IS BOUND", "夜は、綴じられた。", "紙のうえに、あなたの筆だけが残る。", '<div class="sumifu-stats"><span><strong>' + game.kills + '</strong>打ち込み</span><span><strong>' + game.parries + '</strong>受け</span><span><strong>' + clockText(game.time) + '</strong>時間</span></div><button class="sumifu-go" id="sumifuRetry" type="button">新しい紙へ</button><br><button class="sumifu-quiet" id="sumifuToTitle" type="button">題名に戻る</button>');
    bind("sumifuRetry", startRun);
    bind("sumifuToTitle", backTitle);
    setScene("won");
    sound("win");
    flash(0.5);
  }
  function chapterClear() {
    if (!game || game.settled || scene !== "playing") return;
    if (game.stage >= 2) { win(); return; }
    saved.best = Math.max(saved.best, game.stage + 2);
    persist();
    const next = THEMES[game.stage + 1];
    card("A SHEET TURNS", THEMES[game.stage].short + "を、重ねた", "次の紙は、" + next.short + "。<br>" + next.line, '<button class="sumifu-go" id="sumifuNext" type="button">次の夜へ</button>');
    bind("sumifuNext", () => { game.stage++; beginChapter(); });
    setScene("chapter");
    sound("ui");
    flash(0.28);
  }
  function openUpgrade() {
    if (scene !== "playing") return;
    const options = BRUSHES.filter(b => (game.player.levels[b.id] || 0) < b.max).sort(() => Math.random() - 0.5).slice(0, 3);
    if (!options.length) {
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + 24);
      return;
    }
    card("BRUSH", "筆を、選ぶ", "この夜の残りを、どう置く。", '<div class="sumifu-brushes" id="sumifuUpgrade"></div>');
    const list = $("sumifuUpgrade");
    picks = [];
    for (let i = 0; i < options.length; i++) {
      const item = options[i];
      const n = game.player.levels[item.id] || 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sumifu-brush";
      button.innerHTML = '<span class="sumifu-brush-mark">' + item.icon + '</span><span><strong>' + item.name + '</strong><em>' + item.desc + '</em><small>' + (i + 1) + ' · 現在 ' + n + ' / ' + item.max + '</small></span>';
      button.addEventListener("click", () => {
        if (scene !== "upgrade") return;
        item.apply(game.player);
        game.player.levels[item.id] = n + 1;
        picks = [];
        setScene("playing");
        toast(item.name);
        sound("ui");
        updateHud();
      });
      list.appendChild(button);
      picks.push(button);
    }
    setScene("upgrade");
    sound("ui");
  }
  function spawnBoss() {
    if (!game || scene !== "playing" || game.bossSpawned) return null;
    game.bossSpawned = true;
    game.enemies = [];
    game.shots = [];
    const e = spawnEnemy("boss", paper.x + paper.w * 0.5, paper.y + paper.h * 0.3);
    game.boss = e;
    ui.boss.classList.remove("hidden");
    ui.bossName.textContent = T().boss;
    toast(T().boss);
    sound("boss");
    haptic([24, 36, 24]);
    updateHud();
    return e;
  }
  function hurtEnemy(e, dmg, label) {
    if (!e || e.hp <= 0 || !game || scene !== "playing") return;
    const bonus = 1 + Math.min(game.player.combo, 8) * 0.05;
    const amount = dmg * bonus;
    e.hp -= amount;
    e.hitFx = 0.12;
    const fx = game.player.facing;
    e.x += Math.cos(fx) * 7;
    e.y += Math.sin(fx) * 7;
    rise(e.x, e.y - rad(e) - 6, label || String(Math.ceil(amount)), label ? T().gold : T().ink);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    game.kills += 1;
    game.chapterKills += 1;
    splatter(e.x, e.y, e.type === "boss" ? 28 : rand(8, 15));
    burst(e.x, e.y, e.type === "boss" ? 28 : 10, e.type === "boss" ? T().gold : T().ink, e.type === "boss" ? 1.4 : 0.7);
    sound(e.type === "boss" ? "boss" : "kill");
    if (e.type === "boss") { chapterClear(); return; }
    if (scene !== "playing") return;
    if (!game.bossSpawned && game.chapterKills >= BOSS_AT[game.stage]) spawnBoss();
    else if (UP_AT[game.stage].indexOf(game.chapterKills) >= 0) openUpgrade();
  }
  function hurtPlayer(dmg) {
    const p = game && game.player;
    if (!p || scene !== "playing" || p.invuln > 0 || p.dashTime > 0) return;
    p.hp = Math.max(0, p.hp - dmg);
    p.invuln = 0.55;
    p.combo = 0;
    p.comboT = 0;
    shake = Math.max(shake, reduced ? 0 : 8);
    burst(p.x, p.y, 8, T().accent, 0.6);
    rise(p.x + 8, p.y - 24, "−" + Math.round(dmg), T().accent);
    sound("hurt");
    haptic(32);
    flash(0.2);
    if (p.hp <= 0) gameOver();
  }
  function grantKills(n) {
    for (let i = 0; i < n; i++) {
      if (!game || scene !== "playing") break;
      game.kills += 1;
      game.chapterKills += 1;
      if (!game.bossSpawned && game.chapterKills >= BOSS_AT[game.stage]) { spawnBoss(); break; }
      if (scene === "playing" && UP_AT[game.stage].indexOf(game.chapterKills) >= 0) { openUpgrade(); break; }
    }
  }

  function readMove() {
    let x = stick.x, y = stick.y;
    const kx = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
    const ky = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0);
    if (kx || ky) { x = kx; y = ky; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return [x, y];
  }
  function coneHit(ox, oy, angle, range, arc, x, y, extra) {
    const dx = x - ox, dy = y - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > range + extra) return false;
    if (dist < 10) return true;
    const a = Math.atan2(dy, dx);
    const limit = arc / 2 + Math.min(0.45, extra / Math.max(14, dist));
    return Math.abs(angDiff(a, angle)) < limit;
  }
  function slashWindow(p) { return p.slashTime > 0 && (p.slashDur - p.slashTime) < 0.1; }
  function canParry(e) { return e.state === "lunge" && e.lungeAge <= game.player.parryWin && !e.parried; }
  function parry(e) {
    const p = game.player;
    e.parried = true;
    e.stun = 0.95;
    e.state = "move";
    e.cd = 0.35;
    hurtEnemy(e, p.damage * 1.45 + 8, "受け");
    p.hp = Math.min(p.maxHp, p.hp + p.parryHeal);
    p.invuln = Math.max(p.invuln, 0.26);
    game.parries += 1;
    game.didParry = true;
    freeze = Math.max(freeze, reduced ? 0 : 0.055);
    shake = Math.max(shake, reduced ? 0 : 6);
    burst(e.x, e.y, 14, T().gold, 1);
    sound("parry");
    haptic(26);
    if (!game.taughtParry) { game.taughtParry = true; toast("受けた"); }
  }
  function resolveSlash() {
    const p = game.player;
    if (!slashWindow(p)) return;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.hp <= 0 || p.slashHit.has(e.id)) continue;
      if (!coneHit(p.x, p.y, p.slashAngle, srange(), p.slashArc, e.x, e.y, rad(e) * 0.65)) continue;
      p.slashHit.add(e.id);
      p.combo += 1;
      p.comboT = 1.65;
      game.bestCombo = Math.max(game.bestCombo, p.combo);
      if (canParry(e)) parry(e);
      else hurtEnemy(e, p.damage);
      if (scene !== "playing") return;
    }
    for (let i = 0; i < game.shots.length; i++) {
      const s = game.shots[i];
      if (s.life <= 0) continue;
      if (coneHit(p.x, p.y, p.slashAngle, srange(), p.slashArc, s.x, s.y, s.r)) {
        s.life = 0;
        burst(s.x, s.y, 4, T().ink, 0.4);
        sound("cut");
      }
    }
  }
  function tryBind(x, y, angle, range) {
    for (let i = 0; i < game.strokes.length; i++) {
      const s = game.strokes[i];
      if (s.bound || s.life <= 0) continue;
      const da = Math.abs(angDiff(angle, s.angle));
      const dist = Math.hypot(x - s.x, y - s.y);
      if (dist > (range + s.range) * 0.45 || da < 0.5 || da > 2.7) continue;
      s.bound = true;
      s.life = Math.min(s.life, 0.2);
      const mx = (x + s.x) / 2, my = (y + s.y) / 2;
      const radius = 74 * view.scale;
      for (let k = 0; k < game.enemies.length; k++) {
        const e = game.enemies[k];
        if (e.hp > 0 && Math.hypot(e.x - mx, e.y - my) < radius + rad(e)) hurtEnemy(e, game.player.damage * 0.85 + 6);
        if (scene !== "playing") return;
      }
      burst(mx, my, 16, T().gold, 1);
      game.player.combo += 1;
      game.player.comboT = 1.7;
      game.didBind = true;
      game.bestCombo = Math.max(game.bestCombo, game.player.combo);
      freeze = Math.max(freeze, reduced ? 0 : 0.04);
      rise(mx, my - 18, "結", T().gold);
      sound("bind");
      if (!game.taughtBind) { game.taughtBind = true; toast("筆跡が結ばれた"); }
      return;
    }
  }
  function slash() {
    if (scene !== "playing" || !game) return;
    const p = game.player;
    if (p.slashCd > 0) return;
    p.slashCd = p.slashCdMax;
    p.slashTime = p.slashDur;
    p.slashAngle = p.facing;
    p.slashHit = new Set();
    p.x += Math.cos(p.slashAngle) * 8 * view.scale;
    p.y += Math.sin(p.slashAngle) * 8 * view.scale;
    clampPlayer();
    game.didSlash = true;
    const stroke = { x: p.x, y: p.y, angle: p.slashAngle, range: srange(), arc: p.slashArc, life: 1.15, max: 1.15, bound: false };
    tryBind(p.x, p.y, p.slashAngle, srange());
    game.strokes.push(stroke);
    if (game.strokes.length > 5) game.strokes.shift();
    sound("slash");
    haptic(10);
    if (scene !== "playing") return;
    resolveSlash();
  }
  function seal() {
    if (scene !== "playing" || !game || game.player.sealCd > 0) return;
    const p = game.player;
    p.sealCd = p.sealCdMax;
    game.seals.push({ x: p.x, y: p.y, t: 0, arm: 0.48, r: p.sealR * view.scale, boom: false });
    sound("seal");
    haptic(8);
  }
  function dash() {
    if (scene !== "playing" || !game) return;
    const p = game.player;
    if (p.dashCd > 0 || p.dashTime > 0) return;
    let mx, my;
    const move = readMove();
    mx = move[0];
    my = move[1];
    if (Math.hypot(mx, my) < 0.2) { mx = Math.cos(p.facing); my = Math.sin(p.facing); }
    const len = Math.hypot(mx, my) || 1;
    p.dashX = mx / len;
    p.dashY = my / len;
    p.dashTime = 0.16;
    p.dashCd = 2.05;
    p.invuln = Math.max(p.invuln, 0.2);
    p.facing = Math.atan2(p.dashY, p.dashX);
    game.trails.push({ points: [{ x: p.x, y: p.y }], life: p.trailLife, max: p.trailLife, hits: new Set(), power: p.trailPower });
    sound("dash");
    haptic(12);
  }
  function face(angle) { if (game) game.player.facing = angle; }

  function distToSeg(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1);
    return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
  }
  function nearPoly(points, x, y, extra) {
    if (!points.length) return false;
    if (points.length === 1) return Math.hypot(points[0].x - x, points[0].y - y) <= extra;
    for (let i = 1; i < points.length; i++) if (distToSeg(x, y, points[i - 1], points[i]) <= extra) return true;
    return false;
  }
  function fireShot(x, y, angle, speed, damage) {
    game.shots.push({ x: x + Math.cos(angle) * 8, y: y + Math.sin(angle) * 8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5 * view.scale, life: 2.4, damage });
  }
  function updateEnemy(e, dt) {
    const p = game.player;
    e.hitFx = Math.max(0, e.hitFx - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.touch -= dt;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const nx = dx / d, ny = dy / d;
    if (e.stun > 0) {
      const held = clampInto(rad(e), e.x, e.y);
      e.x = held[0];
      e.y = held[1];
      return;
    }
    if (e.type === "boss") updateBoss(e, dt, nx, ny, d);
    else if (e.type === "dart") updateDart(e, dt, nx, ny, d);
    else if (e.type === "press") updatePress(e, dt, nx, ny, d);
    else {
      e.face = Math.atan2(ny, nx);
      e.x += nx * e.speed * view.scale * dt;
      e.y += ny * e.speed * view.scale * dt;
      if (d < rad(e) + prad() && e.touch <= 0) { e.touch = 0.72; hurtPlayer(e.touchDmg); }
    }
    const next = clampInto(rad(e), e.x, e.y);
    e.x = next[0];
    e.y = next[1];
  }
  function updateDart(e, dt, nx, ny, d) {
    const p = game.player;
    e.cd -= dt;
    if (e.state === "aim") {
      if (e.cd > 0.16) { e.aimX = p.x; e.aimY = p.y; }
      e.face = Math.atan2(e.aimY - e.y, e.aimX - e.x);
      if (e.cd <= 0) {
        fireShot(e.x, e.y, e.face, 250 * view.scale, e.touchDmg);
        e.state = "move";
        e.cd = 0.85;
      }
      return;
    }
    e.face = Math.atan2(ny, nx);
    if (d > 150 * view.scale) {
      e.x += nx * e.speed * view.scale * dt;
      e.y += ny * e.speed * view.scale * dt;
    } else if (e.cd <= 0) {
      e.state = "aim";
      e.cd = 0.66;
      e.windMax = 0.66;
      e.aimX = p.x;
      e.aimY = p.y;
    }
  }
  function updatePress(e, dt, nx, ny, d) {
    const state0 = e.state;
    if (state0 === "move") {
      e.cd -= dt;
      e.face = Math.atan2(ny, nx);
      e.x += nx * e.speed * view.scale * dt;
      e.y += ny * e.speed * view.scale * dt;
      if (d < 168 * view.scale && e.cd <= 0) {
        e.state = "windup";
        e.windMax = 0.62;
        e.cd = e.windMax;
      }
      return;
    }
    e.cd -= dt;
    if (state0 === "windup") {
      e.face = Math.atan2(ny, nx);
      if (e.cd <= 0) {
        e.state = "lunge";
        e.cd = 0.28;
        e.lungeAge = 0;
        e.parried = false;
        e.didHit = false;
        e.lx = nx;
        e.ly = ny;
        e.face = Math.atan2(ny, nx);
      }
    } else if (state0 === "lunge") {
      e.lungeAge += dt;
      e.x += e.lx * e.speed * view.scale * 3.15 * dt;
      e.y += e.ly * e.speed * view.scale * 3.15 * dt;
      if (!e.parried && !e.didHit && e.lungeAge > game.player.parryWin && d < rad(e) + prad() + 6) {
        e.didHit = true;
        hurtPlayer(e.touchDmg);
      }
      if (e.cd <= 0) { e.state = "recover"; e.cd = 0.42; }
    } else if (state0 === "recover") {
      if (e.cd <= 0) { e.state = "move"; e.cd = 0.35; }
    }
  }
  function updateBoss(e, dt, nx, ny, d) {
    const p = game.player;
    if (!e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true;
      game.bleed = Math.min(26 * view.scale, Math.min(paper.w, paper.h) * 0.12);
      toast("余白が、沈んでいく");
      if (game.stage === 2) {
        spawnEnemy("dart", paper.x + 28, paper.y + paper.h * 0.5);
        spawnEnemy("dart", paper.x + paper.w - 28, paper.y + paper.h * 0.5);
      }
      sound("boss");
    }
    const fast = e.phase2 ? 0.82 : 1;
    const state0 = e.state;
    if (state0 !== "lunge" && d < rad(e) + prad() - 2 && e.touch <= 0) {
      e.touch = 0.8;
      hurtPlayer(8 + game.stage * 2);
      if (scene !== "playing") return;
    }
    if (state0 === "idle") {
      e.cd -= dt;
      e.face = Math.atan2(ny, nx);
      e.x += nx * e.speed * view.scale * 0.65 * dt;
      e.y += ny * e.speed * view.scale * 0.65 * dt;
      if (e.cd <= 0) {
        const roll = Math.random();
        if (game.stage === 0) e.state = roll < 0.5 ? "aim" : "windup";
        else e.state = roll < 0.33 ? "aim" : roll < 0.66 ? "windup" : "slam";
        if (e.state === "aim") { e.windMax = 0.7 * fast; e.cd = e.windMax; e.aimX = p.x; e.aimY = p.y; }
        else if (e.state === "windup") { e.windMax = 0.6 * fast; e.cd = e.windMax; }
        else { e.slamMax = 0.92 * fast; e.cd = e.slamMax; e.safe = Math.random() * TAU; }
      }
      return;
    }
    e.cd -= dt;
    if (state0 === "aim") {
      if (e.cd > 0.18) { e.aimX = p.x; e.aimY = p.y; }
      e.face = Math.atan2(e.aimY - e.y, e.aimX - e.x);
      if (e.cd <= 0) {
        const shots = game.stage === 0 ? 1 : 3;
        for (let i = 0; i < shots; i++) fireShot(e.x, e.y, e.face + (i - (shots - 1) / 2) * 0.2, 230 * view.scale, 10 + game.stage * 2);
        e.state = "idle";
        e.cd = 0.72 * fast;
      }
    } else if (state0 === "windup") {
      e.face = Math.atan2(ny, nx);
      if (e.cd <= 0) {
        e.state = "lunge";
        e.cd = 0.32;
        e.lungeAge = 0;
        e.parried = false;
        e.didHit = false;
        e.lx = nx;
        e.ly = ny;
      }
    } else if (state0 === "lunge") {
      e.lungeAge += dt;
      e.x += e.lx * 380 * view.scale * dt;
      e.y += e.ly * 380 * view.scale * dt;
      if (!e.parried && !e.didHit && e.lungeAge > p.parryWin && d < rad(e) + prad() + 4) {
        e.didHit = true;
        hurtPlayer(e.touchDmg);
      }
      if (e.cd <= 0) { e.state = "idle"; e.cd = 0.8 * fast; }
    } else if (state0 === "slam") {
      if (e.cd <= 0) {
        const R = 128 * view.scale;
        if (d < R + prad()) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          if (Math.abs(angDiff(a, e.safe)) > 0.62) hurtPlayer(16 + game.stage * 3);
        }
        burst(e.x, e.y, 18, T().accent, 1);
        e.state = "idle";
        e.cd = 0.95 * fast;
      }
    }
  }
  function separate() {
    const list = game.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = rad(a) + rad(b) + 3;
        if (dist >= min) continue;
        const push = (min - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        if (a.state !== "lunge") { a.x -= nx * push; a.y -= ny * push; }
        if (b.state !== "lunge") { b.x += nx * push; b.y += ny * push; }
      }
    }
  }
  function maybeSpawn(dt) {
    if (game.bossSpawned || game.enemies.length >= 6) return;
    game.spawnCd -= dt;
    if (game.spawnCd > 0) return;
    const table = SPAWN[game.stage];
    game.spawnCd = table.interval * (0.92 + Math.random() * 0.2);
    const roll = Math.random();
    let type = table.table[table.table.length - 1][0];
    for (let i = 0; i < table.table.length; i++) if (roll <= table.table[i][1]) { type = table.table[i][0]; break; }
    spawnEnemy(type);
  }
  function updateFx(dt) {
    shake = Math.max(0, shake - dt * 26);
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const a = game.particles[i];
      a.life -= dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vx *= 0.98;
      a.vy *= 0.98;
      if (a.life <= 0) game.particles.splice(i, 1);
    }
    for (let i = game.texts.length - 1; i >= 0; i--) {
      const a = game.texts[i];
      a.life -= dt;
      a.y -= 28 * dt;
      if (a.life <= 0) game.texts.splice(i, 1);
    }
    for (let i = game.decals.length - 1; i >= 0; i--) {
      game.decals[i].life -= dt;
      if (game.decals[i].life <= 0) game.decals.splice(i, 1);
    }
    for (let i = game.strokes.length - 1; i >= 0; i--) {
      game.strokes[i].life -= dt;
      if (game.strokes[i].life <= 0) game.strokes.splice(i, 1);
    }
  }
  function update(dt) {
    const p = game.player;
    game.time += dt;
    p.walk += dt * (Math.hypot(p.vx, p.vy) > 8 ? 10 : 2);
    p.slashCd = Math.max(0, p.slashCd - dt);
    p.slashTime = Math.max(0, p.slashTime - dt);
    p.sealCd = Math.max(0, p.sealCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.comboT -= dt;
    if (p.comboT <= 0) p.combo = 0;
    const move = readMove();
    const mx = move[0], my = move[1];
    const moving = Math.hypot(mx, my) > 0.18;
    if (mouse.hot && clock - mouse.at < 1.25 && inside(mouse.x, mouse.y)) {
      const dx = mouse.x - p.x, dy = mouse.y - p.y;
      if (Math.hypot(dx, dy) > 8) p.facing = Math.atan2(dy, dx);
    } else if (moving && p.dashTime <= 0) p.facing = Math.atan2(my, mx);
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.x += p.dashX * 690 * view.scale * dt;
      p.y += p.dashY * 690 * view.scale * dt;
      const tr = game.trails[game.trails.length - 1];
      if (tr) {
        const lastPt = tr.points[tr.points.length - 1];
        if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) > 8) tr.points.push({ x: p.x, y: p.y });
      }
    } else {
      const accel = 1 - Math.exp(-14 * dt);
      p.vx = lerp(p.vx, mx * p.speed * view.scale, accel);
      p.vy = lerp(p.vy, my * p.speed * view.scale, accel);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    clampPlayer();
    if (game.bleed > 0) {
      const near = p.x < paper.x + game.bleed || p.y < paper.y + game.bleed || p.x > paper.x + paper.w - game.bleed || p.y > paper.y + paper.h - game.bleed;
      p.bleedT = near ? p.bleedT + dt : 0;
      if (p.bleedT > 0.42) { p.bleedT = 0; hurtPlayer(8); if (scene !== "playing") return; }
    }
    for (let i = 0; i < game.trails.length; i++) {
      const tr = game.trails[i];
      tr.life -= dt;
      if (tr.life <= 0) continue;
      for (let k = 0; k < game.enemies.length; k++) {
        const e = game.enemies[k];
        if (e.hp <= 0 || tr.hits.has(e.id)) continue;
        if (nearPoly(tr.points, e.x, e.y, rad(e) + 6)) {
          tr.hits.add(e.id);
          hurtEnemy(e, 8 * tr.power);
          if (scene !== "playing") return;
        }
      }
    }
    game.trails = game.trails.filter(tr => tr.life > 0);
    for (let i = 0; i < game.seals.length; i++) {
      const s = game.seals[i];
      s.t += dt;
      if (!s.boom && s.t >= s.arm) {
        s.boom = true;
        s.t = 0;
        for (let k = 0; k < game.enemies.length; k++) {
          const e = game.enemies[k];
          if (e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < s.r + rad(e)) hurtEnemy(e, p.damage * 1.3);
          if (scene !== "playing") return;
        }
        burst(s.x, s.y, 20, T().accent, 1);
        sound("boom");
        freeze = Math.max(freeze, reduced ? 0 : 0.035);
      }
    }
    game.seals = game.seals.filter(s => !(s.boom && s.t > 0.38));
    for (let i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].hp <= 0) continue;
      updateEnemy(game.enemies[i], dt);
      if (scene !== "playing") return;
    }
    separate();
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (e.hp <= 0) continue;
      const next = clampInto(rad(e), e.x, e.y);
      e.x = next[0];
      e.y = next[1];
    }
    for (let i = game.shots.length - 1; i >= 0; i--) {
      const s = game.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || s.x < paper.x - 20 || s.y < paper.y - 20 || s.x > paper.x + paper.w + 20 || s.y > paper.y + paper.h + 20) {
        game.shots.splice(i, 1);
        continue;
      }
      if (Math.hypot(s.x - p.x, s.y - p.y) < s.r + prad()) {
        game.shots.splice(i, 1);
        hurtPlayer(s.damage);
        if (scene !== "playing") return;
      }
    }
    resolveSlash();
    if (scene !== "playing") return;
    maybeSpawn(dt);
    game.enemies = game.enemies.filter(e => e.hp > 0);
    updateFx(dt);
    updateHud();
    music();
  }

  function inside(x, y) { return x >= paper.x && y >= paper.y && x <= paper.x + paper.w && y <= paper.y + paper.h; }
  function ribbon(x, y, angle, radius, arc, width, color, alpha) {
    if (arc < 0.05 || alpha <= 0) return;
    const steps = 12;
    const start = angle - arc / 2;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + arc * t;
      const w = Math.sin(t * Math.PI) * width;
      const r = radius * (0.25 + 0.75 * t);
      const px = x + Math.cos(a) * r + Math.cos(a + Math.PI / 2) * w;
      const py = y + Math.sin(a) * r + Math.sin(a + Math.PI / 2) * w;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const a = start + arc * t;
      const w = Math.sin(t * Math.PI) * width;
      const r = radius * (0.25 + 0.75 * t);
      ctx.lineTo(x + Math.cos(a) * r - Math.cos(a + Math.PI / 2) * w, y + Math.sin(a) * r - Math.sin(a + Math.PI / 2) * w);
    }
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function blot(x, y, r, phase, color, wobble) {
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + Math.sin(a * 3 + phase) * wobble + Math.sin(a * 5 - phase) * wobble * 0.45);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function drawFox(x, y, angle, opt) {
    const sc = opt.scale || 1;
    const bob = Math.sin(clock * (opt.walk ? 9 : 2.2) + (opt.phase || 0)) * (opt.walk ? 1.6 : 0.5);
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = "rgba(36,24,16,.2)";
    ctx.beginPath();
    ctx.ellipse(1 * sc, 9 * sc, 11 * sc, 3.8 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(angle);
    ctx.scale(sc, sc);
    if (opt.alpha) ctx.globalAlpha = opt.alpha;
    ctx.strokeStyle = opt.ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(-8, 1);
    ctx.quadraticCurveTo(-20, -7 + Math.sin(clock * 6 + (opt.phase || 0)) * 2.4, -32, 2);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.quadraticCurveTo(-36, 8, -38, 1);
    ctx.stroke();
    ctx.fillStyle = opt.fox;
    ctx.strokeStyle = opt.ink;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(-2, 1, 12, 8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, 0, 7.6, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opt.ink;
    ctx.beginPath();
    ctx.moveTo(5.2, -4.2); ctx.lineTo(3.2, -13); ctx.lineTo(9.4, -5.2); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10.2, -4.8); ctx.lineTo(12.8, -13.4); ctx.lineTo(16, -3.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = opt.accent;
    ctx.beginPath();
    ctx.moveTo(5.6, -5.2); ctx.lineTo(4.6, -10); ctx.lineTo(8.4, -5.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = opt.ink;
    ctx.beginPath();
    ctx.arc(12.2, -0.4, 1.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = opt.accent;
    ctx.fillRect(-5, -1.4, 3.6, 3.6);
    ctx.fillStyle = opt.ink;
    ctx.beginPath();
    ctx.arc(16.8, 0.8, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  function drawDesk() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a1c14");
    g.addColorStop(0.45, "#140e0b");
    g.addColorStop(1, "#0b0907");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,214,170,.045)";
    ctx.lineWidth = 1;
    for (let y = 6; y < H; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + Math.sin(y * 0.04) * 1.4);
      ctx.stroke();
    }
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(clock * 1.7 + m.p));
      ctx.fillStyle = "#e7cb8c";
      ctx.beginPath();
      ctx.arc(m.x * W, m.y * H, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawTitleWorld() {
    const cx = W * 0.5, cy = H * 0.48;
    const R = Math.min(W, H) * 0.36;
    const period = 7.2;
    const u = (clock % period) / period;
    const drawU = u < 0.58 ? u / 0.58 : 1;
    const alpha = u > 0.8 ? 1 - (u - 0.8) / 0.2 : (u < 0.08 ? u / 0.08 : 1);
    ctx.save();
    ctx.globalAlpha = 0.28 * alpha;
    ctx.strokeStyle = "#d9b98a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, drawU));
    ctx.stroke();
    if (drawU > 0.04) {
      const a = -Math.PI / 2 + TAU * drawU;
      ctx.globalAlpha = 0.45 * alpha;
      ctx.fillStyle = "#ead7b0";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (H > 640) {
      const t = reduced ? 0.5 : (clock * 0.04) % 1;
      const x = -20 + (W + 40) * t;
      if (x > 24 && x < W - 36) drawFox(x, H - Math.min(64, H * 0.08), 0, { scale: 0.9, walk: !reduced, phase: 1, fox: "#f7f1e6", ink: "#1a120e", accent: "#9c3a30" });
    }
  }
  function drawCorners() {
    const m = 12, len = 11;
    ctx.strokeStyle = T().gold;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    const pts = [[paper.x + m, paper.y + m, 1, 1], [paper.x + paper.w - m, paper.y + m, -1, 1], [paper.x + m, paper.y + paper.h - m, 1, -1], [paper.x + paper.w - m, paper.y + paper.h - m, -1, -1]];
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i];
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] + c[3] * len);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0] + c[2] * len, c[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawBattle() {
    const t = T();
    const sx = (!reduced && shake > 0.2) ? rand(-shake, shake) : 0;
    const sy = (!reduced && shake > 0.2) ? rand(-shake, shake) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = reduced ? 0 : 24;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = "#050403";
    ctx.fillRect(paper.x, paper.y, paper.w, paper.h);
    ctx.restore();
    const g = ctx.createLinearGradient(paper.x, paper.y, paper.x, paper.y + paper.h);
    g.addColorStop(0, t.paperTop);
    g.addColorStop(1, t.paper);
    ctx.fillStyle = g;
    ctx.fillRect(paper.x, paper.y, paper.w, paper.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(paper.x, paper.y, paper.w, paper.h);
    ctx.clip();
    ctx.strokeStyle = t.fiber;
    for (let i = 0; i < fibers.length; i++) {
      const f = fibers[i];
      ctx.globalAlpha = f.a;
      ctx.lineWidth = f.w;
      const y = paper.y + f.y * paper.h;
      const x0 = paper.x + f.x0 * paper.w;
      const x1 = paper.x + f.x1 * paper.w;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo((x0 + x1) / 2, y + f.bow * paper.h, x1, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (game.bleed > 0) {
      ctx.fillStyle = "rgba(0,0,0,.34)";
      ctx.fillRect(paper.x, paper.y, paper.w, game.bleed);
      ctx.fillRect(paper.x, paper.y + paper.h - game.bleed, paper.w, game.bleed);
      ctx.fillRect(paper.x, paper.y, game.bleed, paper.h);
      ctx.fillRect(paper.x + paper.w - game.bleed, paper.y, game.bleed, paper.h);
    }
    for (let i = 0; i < game.decals.length; i++) {
      const d = game.decals[i];
      ctx.globalAlpha = Math.min(0.2, d.life / d.max * 0.2);
      blot(d.x, d.y, d.r, d.phase, t.ink, 0.18);
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < game.trails.length; i++) {
      const tr = game.trails[i];
      if (tr.points.length < 2) continue;
      ctx.strokeStyle = t.ink;
      ctx.globalAlpha = Math.max(0.15, tr.life / tr.max);
      ctx.lineWidth = (7 + tr.power) * view.scale * Math.max(0.35, tr.life / tr.max);
      ctx.beginPath();
      ctx.moveTo(tr.points[0].x, tr.points[0].y);
      for (let k = 1; k < tr.points.length; k++) ctx.lineTo(tr.points[k].x, tr.points[k].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < game.strokes.length; i++) {
      const s = game.strokes[i];
      const age = s.max - s.life;
      if (age < 0.14 && !s.bound) continue;
      ribbon(s.x, s.y, s.angle, s.range, s.arc, 5.5 * view.scale, s.bound ? t.gold : t.ink, Math.max(0, s.life / s.max) * (s.bound ? 0.95 : 0.32));
    }
    for (let i = 0; i < game.seals.length; i++) drawSeal(game.seals[i]);
    for (let i = 0; i < game.enemies.length; i++) if (game.enemies[i].hp > 0) drawTelegraph(game.enemies[i]);
    for (let i = 0; i < game.enemies.length; i++) if (game.enemies[i].hp > 0) drawEnemy(game.enemies[i]);
    for (let i = 0; i < game.shots.length; i++) {
      const s = game.shots[i];
      ctx.strokeStyle = t.accent;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      blot(s.x, s.y, s.r, clock * 4, t.ink, 0.2);
    }
    const p = game.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = p.combo >= 5 ? t.gold : t.ink;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, srange(), -p.slashArc / 2, p.slashArc / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    ctx.arc(18 * view.scale, 0, 2.6, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (p.slashTime > 0) {
      const age = 1 - p.slashTime / p.slashDur;
      const alpha = age < 0.2 ? age / 0.2 : 1 - (age - 0.2) / 0.8;
      ribbon(p.x, p.y, p.slashAngle, srange(), p.slashArc * Math.min(1, age / 0.22), (p.combo >= 5 ? 11 : 9) * view.scale, p.combo >= 5 ? t.gold : t.ink, Math.max(0, alpha));
    }
    for (let i = 0; i < game.particles.length; i++) {
      const a = game.particles[i];
      ctx.globalAlpha = Math.max(0, a.life / a.max);
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = '600 13px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = "center";
    for (let i = 0; i < game.texts.length; i++) {
      const a = game.texts[i];
      ctx.globalAlpha = Math.min(1, a.life / a.max * 1.6);
      ctx.fillStyle = a.color;
      ctx.fillText(a.text, a.x, a.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = t.gold;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.strokeRect(paper.x + 7, paper.y + 7, paper.w - 14, paper.h - 14);
    ctx.globalAlpha = 1;
    drawCorners();
    const blink = p.invuln > 0 && Math.floor(clock * 16) % 2 === 0;
    drawFox(p.x, p.y, p.facing, { scale: view.scale * 1.55, walk: Math.hypot(p.vx, p.vy) > 12 || p.dashTime > 0, phase: 0.4, fox: t.fox, ink: t.ink, accent: t.accent, alpha: blink ? 0.45 : 1 });
    ctx.restore();
    if (p.hp < p.maxHp * 0.32) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(110,24,18," + (0.22 + 0.1 * Math.sin(clock * 5)) + ")");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
  }
  function drawSeal(s) {
    const t = T();
    ctx.save();
    ctx.translate(s.x, s.y);
    if (!s.boom) {
      const prog = clamp(s.t / s.arm, 0, 1);
      ctx.rotate(clock * 0.8);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, s.r * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-s.r * 0.28, -s.r * 0.28, s.r * 0.56, s.r * 0.56);
      ctx.globalAlpha = 0.18 + prog * 0.2;
      ctx.fillStyle = t.accent;
      ctx.beginPath();
      ctx.arc(0, 0, s.r * prog, 0, TAU);
      ctx.fill();
    } else {
      const u = s.t / 0.38;
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = t.gold;
      ctx.lineWidth = 4 * (1 - u);
      ctx.beginPath();
      ctx.arc(0, 0, s.r * (0.4 + u), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  function drawTelegraph(e) {
    const t = T();
    if (e.state === "windup") {
      const prog = 1 - clamp(e.cd / (e.windMax || 0.6), 0, 1);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, rad(e) + 12 * view.scale, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
      ctx.stroke();
    } else if (e.state === "aim") {
      ctx.strokeStyle = t.accent;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.aimX, e.aimY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.accent;
      ctx.beginPath();
      ctx.arc(e.aimX, e.aimY, 4, 0, TAU);
      ctx.fill();
    } else if (e.state === "slam") {
      const prog = 1 - clamp(e.cd / (e.slamMax || 0.9), 0, 1);
      const R = (40 + 90 * prog) * view.scale;
      ctx.globalAlpha = 0.22 + prog * 0.2;
      ctx.fillStyle = t.accent;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, R, e.safe + 0.62, e.safe + TAU - 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = t.gold;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, R, e.safe - 0.62, e.safe + 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (e.state === "lunge") {
      ctx.strokeStyle = t.accent;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 4 * view.scale;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(e.x - e.lx * 34 * view.scale, e.y - e.ly * 34 * view.scale);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (e.lungeAge <= game.player.parryWin) {
        ctx.strokeStyle = t.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, rad(e) + 8, 0, TAU);
        ctx.stroke();
      }
    }
  }
  function drawEnemy(e) {
    const t = T();
    const r = rad(e);
    const color = e.hitFx > 0 ? "#fffaf2" : t.ink;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.type === "boss") {
      ctx.rotate(Math.sin(clock * 0.7) * 0.08);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(6, r * 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, clock * 0.2, clock * 0.2 + TAU * 0.82);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = clock * 0.8 + i / 6 * TAU;
        blot(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.16, e.phase + i, color, 0.25);
      }
    } else if (e.type === "press") {
      ctx.rotate(e.face);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4);
      ctx.globalAlpha = 1;
      blot(0, 0, r * 0.72, e.phase, color, 0.12);
    } else if (e.type === "dart") {
      ctx.rotate(e.face);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(r * 1.35, 0);
      ctx.lineTo(-r * 0.8, r * 0.7);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(-r * 0.8, -r * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      blot(0, Math.sin(clock * 2 + e.phase) * 1.5, r, e.phase + clock * 0.4, color, 0.16);
    }
    ctx.fillStyle = t.eye;
    const eye = e.type === "boss" ? r * 0.18 : Math.max(1.6, r * 0.14);
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.05, eye, 0, TAU);
    ctx.arc(r * 0.22, -r * 0.05, eye, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function updateMotes(dt) {
    if (reduced) return;
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.s * dt;
      m.p += dt;
      if (m.y < 0) { m.y = 1; m.x = Math.random(); }
    }
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawDesk();
    if (!game || scene === "title") drawTitleWorld();
    else drawBattle();
  }
  function frame(now) {
    if (!last) last = now;
    const dt = clamp((now - last) / 1000, 0, 0.034);
    last = now;
    clock += dt;
    if (scene !== "closed") {
      let step = dt;
      if (freeze > 0) { freeze = Math.max(0, freeze - dt); step = 0; }
      if (game && scene !== "playing") updateFx(dt);
      if (scene === "playing" && game && step > 0) update(step);
      updateMotes(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }

  function resetStick() {
    stick.x = 0; stick.y = 0; stick.id = null;
    ui.knob.style.transform = "translate(0px, 0px)";
  }
  function moveStick(event) {
    const x = event.clientX - stick.cx, y = event.clientY - stick.cy;
    const len = Math.hypot(x, y);
    const d = Math.min(40, len);
    stick.x = len ? x / len * Math.min(1, len / 40) : 0;
    stick.y = len ? y / len * Math.min(1, len / 40) : 0;
    ui.knob.style.transform = "translate(" + (len ? x / len * d : 0) + "px," + (len ? y / len * d : 0) + "px)";
  }
  function pointerPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
  }
  $("sumifuJoy").addEventListener("pointerdown", event => {
    if (scene !== "playing") return;
    if (event.preventDefault) event.preventDefault();
    stick.id = event.pointerId;
    const rect = $("sumifuJoy").getBoundingClientRect();
    stick.cx = rect.left + rect.width / 2;
    stick.cy = rect.top + rect.height / 2;
    if ($("sumifuJoy").setPointerCapture) $("sumifuJoy").setPointerCapture(event.pointerId);
    moveStick(event);
  });
  $("sumifuJoy").addEventListener("pointermove", event => {
    if (stick.id === event.pointerId) { if (event.preventDefault) event.preventDefault(); moveStick(event); }
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
    $("sumifuJoy").addEventListener(type, event => { if (stick.id === event.pointerId) resetStick(); });
  });
  function press(el, fn) {
    el.addEventListener("pointerdown", event => {
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      fn();
    });
  }
  press(ui.slashBtn, slash);
  press(ui.sealBtn, seal);
  press(ui.dashBtn, dash);
  canvas.addEventListener("pointerdown", event => {
    if (scene !== "playing" || !game || event.pointerType === "touch") return;
    const pt = pointerPoint(event);
    mouse.x = pt.x; mouse.y = pt.y; mouse.hot = true; mouse.at = clock;
    if (inside(pt.x, pt.y)) game.player.facing = Math.atan2(pt.y - game.player.y, pt.x - game.player.x);
    if (event.button === 2) seal(); else slash();
  });
  canvas.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    const pt = pointerPoint(event);
    mouse.x = pt.x; mouse.y = pt.y; mouse.hot = true; mouse.at = clock;
  });
  $("openSumifuBtn").addEventListener("click", () => {
    audioInit(() => tone(196, 0.18, "triangle", 0.03, 0.6));
    setScene("title");
    loadRecord();
  });
  $("sumifuStart").addEventListener("click", startRun);
  $("sumifuReturn").addEventListener("click", () => { game = null; setScene("closed"); });
  ui.sound.addEventListener("click", toggleSound);
  ui.titleSound.addEventListener("click", toggleSound);
  $("sumifuPause").addEventListener("click", pause);
  window.addEventListener("keydown", event => {
    if (scene === "closed") return;
    const k = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(k) >= 0) event.preventDefault();
    keys.add(k === " " ? "space" : k);
    if (event.repeat) return;
    if (k === "m") toggleSound();
    if (scene === "title" && k === "enter") startRun();
    else if (scene === "playing") {
      if (k === "j" || k === "z") slash();
      else if (k === "k" || k === "x") seal();
      else if (k === " " || k === "shift") dash();
      else if (k === "escape" || k === "p") pause();
    } else if (scene === "paused" && (k === "escape" || k === "p" || k === "enter")) {
      const el = $("sumifuResume"); if (el) el.click();
    } else if (scene === "upgrade" && (k === "1" || k === "2" || k === "3")) {
      const choice = picks[Number(k) - 1]; if (choice) choice.click();
    } else if (scene === "chapter" && k === "enter") {
      const el = $("sumifuNext"); if (el) el.click();
    } else if ((scene === "over" || scene === "won") && k === "enter") {
      const el = $("sumifuRetry"); if (el) el.click();
    }
  });
  window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase()));
  window.addEventListener("blur", () => { keys.clear(); resetStick(); if (scene === "playing") pause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "playing") pause(); });
  window.addEventListener("resize", () => { layout(); if (game) updateHud(); });
  layout();
  loadRecord();
  setScene("closed");
  requestAnimationFrame(frame);
})();
