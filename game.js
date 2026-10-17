"use strict";
(() => {
  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const $ = id => document.getElementById(id);
  const ui = {
    launcher: $("launcher"), home: $("home"), overlay: $("overlay"), top: $("topbar"), controls: $("mobileControls"),
    hp: $("hpFill"), hpLabel: $("hpLabel"), xp: $("xpFill"), level: $("levelLabel"),
    time: $("timeLabel"), hint: $("stageHint"), kills: $("killLabel"), chapter: $("chapterLabel"),
    bossbar: $("bossbar"), bossFill: $("bossFill"), bossName: $("bossName"),
    dash: $("dashBtn"), dashProgress: $("dashProgress"), stick: $("stickKnob"),
    sound: $("soundBtn"), toast: $("toast"), flash: $("flash"), record: $("bestRecord")
  };
  const TWO = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ease = (a, b, t) => a + (b - a) * t;
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const themes = [
    { name: "第一章 · 黎明の森", short: "黎明の森", title: "眠れる森の、最初の灯。", intro: "木々に忘れられた星を、呼び醒まそう。", bg: ["#071d29", "#0a2c38"], glow: "#63dbc4", orb: "#b9ffdb", accent: "#c7edb9", boss: "根源を喰むもの", note: 0 },
    { name: "第二章 · 月影の湖", short: "月影の湖", title: "月は、まだ水底に。", intro: "静寂に沈んだ月を、空に還そう。", bg: ["#081426", "#17234b"], glow: "#93aeff", orb: "#b4c7ff", accent: "#c4cdff", boss: "深淵の歌い手", note: 2 },
    { name: "第三章 · 星の神殿", short: "星の神殿", title: "夜明けは、ここから。", intro: "あなたの光で、世界はまた巡りはじめる。", bg: ["#1b172a", "#34243b"], glow: "#e5a5ce", orb: "#ffd8b3", accent: "#ffe0c1", boss: "最後の夜", note: 4 }
  ];
  const storageKey = "lumina-garden-v1";
  let saved = { best: 0, wins: 0, music: true, bestKills: 0, bestLevel: 1 };
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [key, max] of [["best", 3], ["wins", Number.MAX_SAFE_INTEGER], ["bestKills", Number.MAX_SAFE_INTEGER], ["bestLevel", Number.MAX_SAFE_INTEGER]]) {
        if (Number.isSafeInteger(data[key]) && data[key] >= (key === "bestLevel" ? 1 : 0)) saved[key] = Math.min(data[key], max);
      }
      if (typeof data.music === "boolean") saved.music = data.music;
    }
  } catch (_) {}
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (_) {} };
  const perks = [
    { id: "bolts", icon: "✧", name: "双子星の矢", desc: "同時に放つ星の矢が１本増える", max: 4, apply: p => { p.bolts++; } },
    { id: "tempo", icon: "☄", name: "流星のリズム", desc: "星の矢の発射間隔を短縮", max: 5, apply: p => { p.fireRate *= .85; } },
    { id: "power", icon: "✦", name: "星の心臓", desc: "星の矢のダメージを大きくする", max: 5, apply: p => { p.damage += 9; } },
    { id: "speed", icon: "❋", name: "風の祝福", desc: "移動速度が12%上昇する", max: 4, apply: p => { p.speed *= 1.12; } },
    { id: "vitality", icon: "♡", name: "生命の花", desc: "最大生命＋30、生命を回復", max: 4, apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 55); } },
    { id: "orbit", icon: "◎", name: "守護する衛星", desc: "触れた敵を傷つける星が周囲を巡る", max: 4, apply: p => { p.orbit++; } },
    { id: "magnet", icon: "◇", name: "星を呼ぶ指先", desc: "経験値の吸い寄せ範囲が拡大", max: 3, apply: p => { p.magnet += 75; } },
    { id: "regen", icon: "❀", name: "再生の光", desc: "少しずつ生命が戻るようになる", max: 3, apply: p => { p.regen += 1.6; } },
    { id: "frost", icon: "❄", name: "月の結晶", desc: "星の矢に鈍化の力を宿す", max: 2, apply: p => { p.frost += 1; } },
    { id: "pulse", icon: "◈", name: "暁の衝撃", desc: "ダッシュが周囲に衝撃波を放つ", max: 3, apply: p => { p.pulse += 1; } },
    { id: "nova", icon: "☼", name: "小さな太陽", desc: "周期的に広がる光の波を放つ", max: 3, apply: p => { p.nova += 1; } },
    { id: "luck", icon: "✿", name: "星のめぐみ", desc: "集める経験値が20%増加する", max: 3, apply: p => { p.luck += .2; } },
    { id: "pierce", icon: "➶", name: "貫く彗星", desc: "星の矢が敵をさらに1体貫通する", max: 3, apply: p => { p.pierce++; } },
    { id: "crit", icon: "✶", name: "星読みの眼", desc: "会心の一撃の確率が9%上昇する", max: 4, apply: p => { p.crit += .09; } },
    { id: "ward", icon: "♢", name: "薄明の結界", desc: "受けるダメージを11%軽減する", max: 4, apply: p => { p.ward = Math.min(.5, p.ward + .11); } },
    { id: "flow", icon: "↝", name: "流れる羽衣", desc: "ダッシュの再使用までを0.27秒短縮", max: 3, apply: p => { p.dashCooldown = Math.max(1.04, p.dashCooldown - .27); } },
    { id: "echo", icon: "❖", name: "余光の連鎖", desc: "影の浄化で近くの敵へ光を伝える", max: 3, apply: p => { p.echo++; } },
    { id: "focus", icon: "⟡", name: "光の導き", desc: "星の矢の速さと射程が17%上昇", max: 3, apply: p => { p.projectileSpeed *= 1.17; } }
  ];
  const resonances = [
    { id: "stardust", first: "bolts", second: "pierce", name: "星屑の軌道", desc: "星矢の速さが15%上昇" },
    { id: "moonwave", first: "frost", second: "nova", name: "月輪の薄氷", desc: "光の波が敵を鈍らせる" },
    { id: "afterglow", first: "flow", second: "pulse", name: "残光の疾走", desc: "ダッシュ距離が25%上昇" },
    { id: "lifegarden", first: "vitality", second: "regen", name: "生命の庭", desc: "危機のとき再生速度が2倍" },
    { id: "lightchain", first: "power", second: "echo", name: "光の連鎖", desc: "連鎖ダメージが30%上昇" }
  ];
  function activeResonance(p, id) {
    const recipe = resonances.find(item => item.id === id);
    return Boolean(recipe && p.perkLevels[recipe.first] && p.perkLevels[recipe.second]);
  }
  const perkRoles = {
    bolts: "attack", tempo: "attack", power: "attack", orbit: "attack", frost: "attack",
    pulse: "attack", nova: "attack", pierce: "attack", crit: "attack", echo: "attack", focus: "attack",
    speed: "mobility", flow: "mobility", vitality: "defense", regen: "defense",
    ward: "defense", magnet: "support", luck: "support"
  };
  const perkFamilies = {
    bolts: ["pierce", "crit", "focus"], tempo: ["crit", "frost"], power: ["echo", "nova"],
    orbit: ["pulse", "nova"], frost: ["pierce", "tempo"], pulse: ["flow", "orbit"],
    nova: ["echo", "power"], pierce: ["bolts", "focus"], crit: ["tempo", "bolts"],
    echo: ["nova", "power"], focus: ["pierce", "bolts"], speed: ["flow", "pulse"],
    flow: ["speed", "pulse"], vitality: ["regen", "ward"], regen: ["vitality", "ward"],
    ward: ["vitality", "regen"], magnet: ["luck"], luck: ["magnet"]
  };
  const keys = new Set();
  const stick = { x: 0, y: 0, id: null, centerX: 0, centerY: 0 };
  const particles = [];
  const texts = [];
  const rings = [];
  const motes = Array.from({ length: 72 }, () => ({ x: Math.random(), y: Math.random(), s: rand(.5, 2.1), t: rand(0, TWO), z: rand(.2, 1) }));
  let W = 390, H = 800, DPR = 1, scene = "launcher", game = null, last = 0, clock = 0;
  let camX = 0, camY = 0, shake = 0, toastTimeout = null;
  let audio = null, musicAt = 0, beat = 0;
  let reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    W = Math.max(250, window.innerWidth);
    H = Math.max(350, window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    if (!game) { camX = -W / 2; camY = -H / 2; }
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  function audioInit() {
    if (!audio) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        try { audio = new AudioCtor(); } catch (_) {}
      }
    }
    if (audio && audio.state === "suspended") audio.resume().catch(() => {});
  }
  function tone(freq, dur, type = "sine", volume = .04, slide = 1, delay = 0) {
    if (!saved.music || !audio || audio.state !== "running") return;
    const at = audio.currentTime + delay;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), at);
      if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), at + dur);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), at + Math.min(.03, dur / 4));
      gain.gain.exponentialRampToValueAtTime(.0001, at + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + dur + .015);
    } catch (_) {}
  }
  function sound(type) {
    if (type === "shoot") tone(rand(440, 550), .085, "sine", .009, 1.35);
    else if (type === "hit") tone(125, .16, "triangle", .035, .55);
    else if (type === "kill") tone(470, .18, "sine", .025, 1.5);
    else if (type === "combo") [432, 648, 864].forEach((n, i) => tone(n, .22, "sine", .022, 1.03, i * .06));
    else if (type === "wave") { tone(216, .55, "sine", .024, 1.4); tone(432, .7, "sine", .011, 1.03, .1); }
    else if (type === "resonance") [432, 576, 648, 864].forEach((n, i) => tone(n, .65, "sine", .03, 1.02, i * .085));
    else if (type === "pick") tone(730, .11, "sine", .016, 1.27);
    else if (type === "dash") tone(240, .24, "triangle", .045, 2.1);
    else if (type === "boss") { tone(90, 1.2, "sawtooth", .045, .7); tone(360, 1.2, "sine", .03, .5, .2); }
    else if (type === "level") [523, 659, 784, 1047].forEach((n, i) => tone(n, .4, "sine", .05, 1.02, i * .12));
    else if (type === "win") [440, 554, 659, 880, 1047].forEach((n, i) => tone(n, 1, "sine", .06, 1, i * .18));
  }
  function music() {
    if (!game || !saved.music || !audio || audio.state !== "running") return;
    if (clock < musicAt) return;
    musicAt = clock + .42;
    // A=432 reference; each chapter is rooted in a different register.
    const roots = [171.44, 144.16, 192.43][game.stage];
    const patterns = [[0, 7, 12, 16, 12, 7, 4, 7], [0, 3, 7, 12, 15, 12, 7, 3], [0, 4, 9, 12, 16, 12, 9, 4]];
    const semitone = patterns[game.stage][beat % 8];
    const frequency = roots * Math.pow(2, semitone / 12);
    tone(frequency * 2, .48, "sine", game.bossSpawned ? .010 : .0075);
    if (beat % 4 === 2) tone(frequency, .85, "triangle", .004, .995);
    if (beat % 8 === 0) {
      tone(roots, 3.25, "sine", .016);
      tone(roots * (game.stage === 1 ? 1.2 : 1.498), 2.8, "sine", .0085);
      tone(roots / 2, 1.8, "triangle", .005);
    }
    if (game.bossSpawned && beat % 4 === 0) tone(roots / 2, .37, "triangle", .013, .87);
    beat++;
  }

  function loadRecord() {
    ui.record.textContent = saved.best
      ? ("BEST · 第" + saved.best + "章 / 全制覇 " + saved.wins + " 回 / LV " + (saved.bestLevel || 1) + " / ✧ " + (saved.bestKills || 0))
      : "あなたの物語は、ここから。";
    ui.sound.textContent = saved.music ? "♫" : "♪̸";
    ui.sound.setAttribute("aria-label", saved.music ? "音を消す" : "音を出す");
  }
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => ui.toast.classList.remove("show"), 1800);
  }
  function flash(alpha = .5) {
    ui.flash.style.transition = "none";
    ui.flash.style.opacity = String(alpha);
    requestAnimationFrame(() => {
      ui.flash.style.transition = "opacity .38s ease";
      ui.flash.style.opacity = "0";
    });
  }
  function haptic(ms = 15) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} } }
  function setScene(value) {
    scene = value;
    ui.launcher.classList.toggle("hidden", value !== "launcher");
    ui.home.classList.toggle("hidden", value !== "home");
    ui.overlay.classList.toggle("hidden", value === "home" || value === "launcher" || value === "playing");
    ui.top.classList.toggle("hidden", value === "home" || value === "launcher");
    ui.controls.classList.toggle("hidden", value !== "playing");
    if (value !== "playing") { keys.clear(); resetStick(); }
  }
  function overlayCard(kicker, title, message, content) {
    ui.overlay.innerHTML = '<div class="card"><div class="card-kicker">' + kicker + '</div><h2>' + title + '</h2><p>' + message + '</p>' + (content || "") + '</div>';
  }
  function bindButton(id, callback) { const el = $(id); if (el) el.addEventListener("click", callback); }

  function freshPlayer() {
    return {
      x: 0, y: 0, r: 16, hp: 100, maxHp: 100, speed: 235, damage: 22, fireRate: .44, fireCd: .15,
      bolts: 1, orbit: 0, magnet: 175, regen: 0, frost: 0, pulse: 0, nova: 0, novaCd: 5,
      pierce: 0, crit: 0, ward: 0, echo: 0, projectileSpeed: 1, dashCooldown: 1.85,
      luck: 1, invuln: .8, dashCd: 0, dashTime: 0, dashX: 0, dashY: -1, dashSerial: 0,
      facingX: 0, facingY: -1, walk: 0, perkLevels: {}
    };
  }
  function startRun() {
    audioInit();
    game = {
      player: freshPlayer(), stage: 0, stageTime: 0, time: 0,
      enemies: [], shots: [], hostile: [], orbs: [], kills: 0, level: 1,
      xp: 0, totalXp: 0, bossSpawned: false, bossId: null,
      spawned: 0, spawnCd: .28, nextId: 1, hudCd: 0, settled: false,
      rerolls: 2, previousOffers: [], score: 0, combo: 0, bestCombo: 0, comboTimer: 0, comboPending: 0, chapterReward: 0, bossMinionCd: 9, waveMark: 0
    };
    particles.length = 0; rings.length = 0; texts.length = 0;
    musicAt = clock; beat = 0;
    camX = -W / 2; camY = -H / 2; shake = 0;
    beginChapter();
  }
  function beginChapter() {
    const t = themes[game.stage];
    beat = 0; musicAt = clock;
    game.stageTime = 0; game.spawnCd = .38; game.waveMark = 0; game.bossMinionCd = 9;
    game.combo = 0; game.comboTimer = 0; game.bossSpawned = false; game.bossId = null;
    game.enemies.length = 0; game.shots.length = 0; game.hostile.length = 0;
    game.orbs.length = 0;
    game.rerolls = Math.min(3, game.rerolls + (game.stage > 0 ? 1 : 0));
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 24);
    // Introduce the first shadows within view, before the timer starts to ramp.
    const starters = game.stage === 0 ? 2 : 3;
    for (let i = 0; i < starters; i++) {
      const angle = TWO * (i + .16) / starters;
      spawnEnemy("wisp", game.player.x + Math.cos(angle) * Math.min(W * .39, 215),
        game.player.y + Math.sin(angle) * Math.min(H * .3, 200));
    }
    game.spawned += starters;
    ui.chapter.textContent = t.name;
    ui.bossbar.classList.add("hidden");
    setScene("playing");
    updateHud();
    showToast(t.short + "へようこそ");
    flash(.16);
  }
  function pause() {
    if (scene !== "playing") return;
    setScene("paused");
    overlayCard("A MOMENT OF STILLNESS", "星の休息", "光は、ここで待っていてくれる。", '<button id="resume" class="primary">旅をつづける <b>↗</b></button><br><button id="quit" class="secondary">タイトルへ戻る</button>');
    bindButton("resume", () => { audioInit(); setScene("playing"); });
    bindButton("quit", backHome);
  }
  function backHome() {
    if (game) saveProgress();
    game = null;
    setScene("home");
    ui.bossbar.classList.add("hidden");
    loadRecord();
  }
  function saveProgress() {
    if (!game) return;
    saved.best = Math.max(saved.best || 0, game.stage + 1);
    saved.bestKills = Math.max(saved.bestKills || 0, game.kills);
    saved.bestLevel = Math.max(saved.bestLevel || 1, game.level);
    persist();
  }
  function runSignature() {
    if (!game) return "";
    const owned = game.player.perkLevels;
    const dominant = perks.filter(item => owned[item.id]).sort((a, b) =>
      owned[b.id] - owned[a.id]).slice(0, 3);
    const awakened = resonances.filter(recipe => activeResonance(game.player, recipe.id));
    const blessings = dominant.length ? dominant.map(item =>
      item.icon + " " + item.name + " " + owned[item.id]).join(" / ") : "まだ名もない光";
    return '<div class="run-signature"><span class="run-signature-label">YOUR CONSTELLATION</span>' +
      '<strong>' + blessings + '</strong>' +
      (awakened.length ? '<span class="run-resonances">✦ ' + awakened.map(recipe => recipe.name).join(" · ") + '</span>' : '') +
      '<span class="run-streak">最長連鎖 ×' + game.bestCombo + '</span></div>';
  }
  function gameOver() {
    if (!game || scene !== "playing") return;
    saveProgress();
    setScene("over");
    sound("hit");
    overlayCard("YOUR LIGHT REMAINS", "星は、消えない。", "歩いてきた光は、きっと次の旅に残っている。", '<div class="stats"><span><strong>' + (game.stage + 1) + '</strong>到達した章</span><span><strong>' + game.kills + '</strong>浄化した影</span><span><strong>' + game.level + '</strong>レベル</span></div>' + runSignature() + '<button class="primary" id="retry">もう一度、旅へ <b>↗</b></button><br><button class="secondary" id="quit">タイトルへ戻る</button>');
    bindButton("retry", startRun); bindButton("quit", backHome);
  }
  function win() {
    if (!game || game.settled) return;
    game.settled = true;
    saveProgress(); saved.best = 3; saved.wins++;
    persist();
    setScene("won");
    ui.bossbar.classList.add("hidden");
    flash(.55); sound("win");
    overlayCard("THE STARS REMEMBER YOU", "世界に、光が戻った。", "最後の星は、ずっとあなたの中にあった。<br>そして庭は、また花を咲かせる。", '<div class="special">✦</div><div class="stats"><span><strong>' + game.kills + '</strong>浄化した影</span><span><strong>' + game.level + '</strong>レベル</span><span><strong>' + Math.floor(game.time / 60) + ':' + String(Math.floor(game.time % 60)).padStart(2, "0") + '</strong>旅の時間</span></div>' + runSignature() + '<button class="primary" id="retry">新しい夜明けへ <b>↗</b></button><br><button class="secondary" id="quit">タイトルへ戻る</button>');
    bindButton("retry", startRun); bindButton("quit", backHome);
  }
  function chapterClear() {
    if (!game || scene !== "playing") return;
    if (game.stage === 2) { win(); return; }
    saveProgress(); saved.best = Math.max(saved.best, game.stage + 2); persist();
    setScene("chapter");
    ui.bossbar.classList.add("hidden");
    const t = themes[game.stage + 1];
    sound("level"); flash(.36);
    overlayCard("CHAPTER COMPLETE", themes[game.stage].short + "に光が戻った", "守護者の星核を受け取った。<br>次は、" + t.short + "へ。",
      '<div class="special">✧</div><p class="chapter-reward">✦ 星核の経験値 +' + Math.round(game.chapterReward * game.player.luck) + '</p><button class="primary" id="nextChapter">次の世界へ <b>↗</b></button>');
    bindButton("nextChapter", () => {
      game.stage++; beginChapter();
      const reward = game.chapterReward; game.chapterReward = 0;
      if (reward) addExp(reward);
      if (scene === "playing") showToast("星核の祝福 +" + Math.round(reward * game.player.luck));
    });
  }

  function expNeed() { return Math.floor(12 + game.level * 8 + Math.pow(game.level, 1.23) * 2.3); }
  function addExp(amount) {
    if (!game) return;
    const value = Math.round(amount * game.player.luck);
    game.xp += value; game.totalXp += value; game.score += value;
    if (game.xp >= expNeed() && scene === "playing") {
      game.xp -= expNeed();
      game.level++;
      levelUp();
    }
  }
  function weightedOffers() {
    const owned = game.player.perkLevels;
    const pool = perks.filter(item => (owned[item.id] || 0) < item.max);
    const picked = [];
    // First two upgrades always include one immediately useful attack path.
    if (game.level <= 3) {
      const starters = pool.filter(item => ["bolts", "tempo", "power", "orbit", "crit"].includes(item.id));
      if (starters.length) picked.push(starters[Math.floor(Math.random() * starters.length)]);
    }
    while (picked.length < 3 && pool.some(item => !picked.includes(item))) {
      const remaining = pool.filter(item => !picked.includes(item));
      const weights = remaining.map(item => {
        const familiar = owned[item.id] || 0;
        const harmony = (perkFamilies[item.id] || []).reduce((sum, id) => sum + (owned[id] ? 1 : 0), 0);
        const recent = game.previousOffers.includes(item.id) ? .45 : 1;
        const rescue = perkRoles[item.id] === "defense" && game.player.hp < game.player.maxHp * .55 ? 1.7 : 1;
        return (1 + familiar * 1.5 + harmony * .7) * recent * rescue;
      });
      let draw = Math.random() * weights.reduce((sum, w) => sum + w, 0);
      let index = weights.length - 1;
      for (let i = 0; i < weights.length; i++) if ((draw -= weights[i]) <= 0) { index = i; break; }
      picked.push(remaining[index]);
    }
    game.previousOffers = picked.map(item => item.id);
    return picked;
  }
  function finishUpgrade(item) {
    if (scene !== "upgrade") return;
    const p = game.player, n = p.perkLevels[item.id] || 0;
    if (n >= item.max) return;
    const before = resonances.filter(recipe => activeResonance(p, recipe.id)).map(recipe => recipe.id);
    item.apply(p); p.perkLevels[item.id] = n + 1;
    const unlocked = resonances.find(recipe => !before.includes(recipe.id) && activeResonance(p, recipe.id));
    setScene("playing");
    showToast(unlocked ? "✦ 共鳴・" + unlocked.name : item.name + "  " + (n + 1) + "/" + item.max);
    if (unlocked) sound("resonance");
    haptic(20); updateHud();
    if (game.xp >= expNeed()) {
      game.xp -= expNeed(); game.level++; levelUp();
    }
  }
  function renderUpgrade() {
    if (scene !== "upgrade") return;
    const p = game.player, list = $("upgradeList");
    if (!list) return;
    list.replaceChildren();
    const options = weightedOffers();
    if (!options.length) {
      p.maxHp += 10; p.hp = Math.min(p.maxHp, p.hp + 30);
      setScene("playing"); showToast("すべての祝福があなたのものに");
      updateHud(); return;
    }
    options.forEach((item, i) => {
      const n = p.perkLevels[item.id] || 0, harmony = (perkFamilies[item.id] || []).filter(id => p.perkLevels[id]);
      const completing = resonances.find(recipe =>
        ((recipe.first === item.id && p.perkLevels[recipe.second]) ||
         (recipe.second === item.id && p.perkLevels[recipe.first])) && !activeResonance(p, recipe.id));
      const role = perkRoles[item.id] || "support";
      const button = document.createElement("button");
      button.type = "button"; button.className = "upgrade upgrade-" + role;
      const roleNames = { attack: "攻撃", defense: "防御", mobility: "機動", support: "収集" };
      button.innerHTML = '<div class="upgrade-icon">' + item.icon + '</div>' +
        '<div class="upgrade-body"><div class="upgrade-meta"><span>' + roleNames[role] + '</span><span>OPTION ' + (i + 1) + '</span></div>' +
        '<div class="upgrade-title">' + item.name + '</div><div class="upgrade-desc">' + item.desc + '</div>' +
        '<span class="upgrade-rank">RANK ' + n + ' → ' + (n + 1) + ' / ' + item.max + '</span>' +
        (completing ? '<span class="upgrade-harmony">✦ 共鳴解放：' + completing.name + ' · ' + completing.desc + '</span>'
          : harmony.length ? '<span class="upgrade-harmony">✧ 相性のよい祝福 · ' + harmony.length + '</span>' : '') + '</div>';
      button.addEventListener("click", () => finishUpgrade(item));
      list.appendChild(button);
    });
    const reroll = $("rerollUpgrade");
    if (reroll) {
      reroll.disabled = game.rerolls <= 0;
      reroll.textContent = game.rerolls ? "↻ 星を巡り直す · 残り " + game.rerolls + " 回 [R]" : "↻ 巡り直しは使い切りました";
      reroll.onclick = () => {
        if (scene !== "upgrade" || game.rerolls <= 0) return;
        game.rerolls--; sound("pick"); renderUpgrade();
      };
    }
    const current = $("upgradeBuild");
    if (current) {
      const built = perks.filter(item => p.perkLevels[item.id]);
      const awakened = resonances.filter(recipe => activeResonance(p, recipe.id));
      current.textContent = awakened.length
        ? "✦ 共鳴 " + awakened.map(recipe => recipe.name).join(" / ")
        : built.length ? "旅の祝福 · " + built.slice(-5).map(item => item.icon + " " + p.perkLevels[item.id]).join("  ")
        : "最初の祝福が、旅のかたちを決める";
    }
  }
  function levelUp() {
    if (scene !== "playing") return;
    setScene("upgrade");
    sound("level"); flash(.18); haptic(25);
    overlayCard("STARLIGHT ASCENSION · LV " + game.level, "星の祝福を選んで",
      "重ねるほどに力が育つ。組み合わせると光が共鳴する。",
      '<div id="upgradeBuild" class="upgrade-build"></div><div class="upgrade-list" id="upgradeList"></div>' +
      '<button type="button" id="rerollUpgrade" class="upgrade-reroll"></button>' +
      '<p class="upgrade-help">タップして選択 · キーボード 1 / 2 / 3</p>');
    renderUpgrade();
  }

  function burst(x, y, count, color, power = 1) {
    if (reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count && particles.length < 260; i++) {
      const a = rand(0, TWO), s = rand(35, 180) * power, ttl = rand(.24, .8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ttl, max: ttl, r: rand(1, 3.5), color });
    }
  }
  function rise(x, y, message, color = "#ffead1") {
    if (texts.length > 25) texts.shift();
    texts.push({ x, y, text: message, color, ttl: .7, max: .7 });
  }
  function ring(x, y, radius, color, ttl = .45, start = 0) {
    rings.push({ x, y, r: start, target: radius, ttl, max: ttl, color });
    if (rings.length > 30) rings.shift();
  }
  function spawnEnemy(type, x, y) {
    const m = { wisp: [22, 76, 8, 14], runner: [19, 136, 8, 14], brute: [95, 49, 15, 25], archer: [50, 65, 10, 22], boss: [660, 56, 35, 24] }[type];
    const scale = 1 + game.stage * .45 + Math.min(1.2, game.stageTime / 140);
    const e = {
      id: game.nextId++, type, x, y, hp: m[0] * scale, maxHp: m[0] * scale,
      speed: m[1] * (1 + game.stage * .13), radius: m[2] + (type === "boss" ? game.stage * 4 : 0),
      damage: m[3] + game.stage * 3, phase: rand(0, TWO), cd: rand(.4, 2.6), hitFx: 0,
      slow: 0, orbitHit: 0, dashSerial: -1, windup: 0, aimX: 0, aimY: 0,
      chargeCd: rand(3.0, 4.5), chargeWindup: 0, chargeTime: 0, chargeX: 0, chargeY: 0,
      score: type === "boss" ? 100 : 1
    };
    if (type === "boss") { e.hp *= 1 + game.stage * .28; e.maxHp = e.hp; e.cd = 1.5; }
    game.enemies.push(e);
    return e;
  }
  function spawnRandom() {
    if (game.enemies.length >= 55) return;
    const a = rand(0, TWO);
    // Stay close to the visible action on portrait and landscape screens.
    const x = game.player.x + Math.cos(a) * (Math.min(W * .43, 285) + rand(26, 62));
    const y = game.player.y + Math.sin(a) * (Math.min(H * .36, 275) + rand(26, 62));
    const n = Math.random();
    let type = "wisp";
    if (game.stageTime > 12 && n < .22) type = "runner";
    if (game.stageTime > 20 && n > .77) type = "brute";
    if (game.stageTime > 28 && n > .6 && n < .77) type = "archer";
    if (game.stage >= 1 && n > .5 && n < .66) type = "archer";
    spawnEnemy(type, x, y);
    game.spawned++;
  }
  function spawnBoss() {
    if (game.bossSpawned) return;
    game.bossSpawned = true;
    const a = rand(0, TWO);
    const e = spawnEnemy("boss", game.player.x + Math.cos(a) * Math.min(W * .48, 330),
      game.player.y + Math.sin(a) * Math.min(H * .38, 310));
    game.bossId = e.id;
    ui.bossName.textContent = themes[game.stage].boss;
    ui.bossbar.classList.remove("hidden");
    showToast("⚠ " + themes[game.stage].boss + " が現れた");
    sound("boss"); haptic([40, 80, 65]);
    ring(game.player.x, game.player.y, 170, "#e4a4b8", 1.2);
  }
  function hurtEnemy(e, dmg, x = e.x, y = e.y, fromEcho = false) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.hitFx = .13;
    if (dmg >= 25 || Math.random() < .3) rise(e.x + rand(-8, 8), e.y - 18, String(Math.ceil(dmg)), "#fff0be");
    if (e.hp <= 0) {
      game.kills += 1; game.score += e.score * 8;
      game.combo = game.comboTimer > 0 ? game.combo + 1 : 1;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      game.comboTimer = 3.8;
      if (game.combo > 0 && game.combo % 8 === 0 && e.type !== "boss") {
        // Award through addExp on the next frame, so luck and level-up accounting
        // stay consistent without opening a modal midway through an enemy loop.
        game.comboPending += 5; sound("combo");
        rise(e.x, e.y - 35, "✧ CHAIN " + game.combo, "#fce2a6");
        ring(e.x, e.y, 78, "#e8d8b2", .36);
      }
      const color = e.type === "boss" ? "#ffdfb6" : themes[game.stage].orb;
      burst(e.x, e.y, e.type === "boss" ? 55 : 10, color, e.type === "boss" ? 2 : .75);
      ring(e.x, e.y, e.type === "boss" ? 240 : 45, color, e.type === "boss" ? 1.1 : .35);
      if (e.type === "boss" || game.kills % 3 === 0) sound("kill");
      if (e.type === "boss") {
        // The old boss orbs vanished in the chapter reset; carry their reward forward.
        game.chapterReward = 80 + game.stage * 40; // addExp applies luck exactly once in the next chapter.
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + 18 + game.stage * 5);
        game.bossId = null;
        game.enemies = game.enemies.filter(mob => mob.type !== "boss");
        chapterClear();
        return;
      }
      // A direct kill can spark one ripple; echo kills never recursively echo.
      if (game.player.echo && !fromEcho) {
        const range = 94 + game.player.echo * 23;
        const neighbors = game.enemies.filter(other => other !== e && other.hp > 0 && distance(other, e) < range).slice(0, 4);
        if (neighbors.length) {
          ring(e.x, e.y, range, "#fce7b6", .45);
          neighbors.forEach(other => hurtEnemy(other,
            (8 + game.player.echo * 9) * (activeResonance(game.player, "lightchain") ? 1.3 : 1),
            other.x, other.y, true));
        }
      }
      const drop = e.type === "brute" ? 10 : e.type === "archer" ? 8 : 6;
      game.orbs.push({ x: e.x, y: e.y, value: drop, r: e.type === "brute" ? 6 : 4, phase: rand(0, TWO), age: 0 });
      if (Math.random() < .012 && game.player.hp < game.player.maxHp * .7) game.orbs.push({ x: e.x + 14, y: e.y, value: -20, r: 7, phase: 0, age: 0 });
    } else if (Math.random() < .25) burst(x, y, 3, "#c9ffef", .35);
  }
  function hurtPlayer(dmg, x, y) {
    const p = game.player;
    if (p.invuln > 0 || p.dashTime > 0 || scene !== "playing") return;
    const grace = game.stage === 0 && game.stageTime < 10 ? .6 : 1;
    const actual = Math.max(1, Math.round(dmg * grace * (1 - p.ward)));
    p.hp = Math.max(0, p.hp - actual);
    p.invuln = game.stageTime < 10 ? 1.05 : .82; shake = Math.max(shake, 10);
    ring(p.x, p.y, 42, "#ff9aaa", .24);
    burst(p.x, p.y, 13, "#ffb6bc", .85);
    rise(p.x + 8, p.y - 26, "−" + actual, "#ffa9ba");
    sound("hit"); haptic(40); flash(.18);
    if (p.hp <= 0) gameOver();
  }
  function dash() {
    if (scene !== "playing") return;
    const p = game.player;
    if (p.dashCd > 0 || p.dashTime > 0) return;
    const [dx, dy] = readMove();
    const d = Math.hypot(dx, dy);
    p.dashX = d > .12 ? dx / d : p.facingX;
    p.dashY = d > .12 ? dy / d : p.facingY;
    p.dashTime = activeResonance(p, "afterglow") ? .30 : .24; p.dashCd = p.dashCooldown; p.invuln = .39; p.dashSerial++;
    sound("dash"); haptic(18);
    ring(p.x, p.y, 70 + p.pulse * 25, "#b4fff0", .36);
    burst(p.x, p.y, 19, "#caffed", .9);
    if (p.pulse) {
      for (const e of game.enemies) {
        if (scene !== "playing") break;
        if (distance(e, p) < 115 + p.pulse * 17) hurtEnemy(e, 25 + p.pulse * 20);
      }
    }
  }
  function readMove() {
    let dx = stick.x, dy = stick.y;
    const keyboardX = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
    const keyboardY = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0);
    if (keyboardX || keyboardY) { dx = keyboardX; dy = keyboardY; }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return [dx, dy];
  }
  function resetStick() {
    stick.x = 0; stick.y = 0; stick.id = null;
    ui.stick.style.transform = "translate(0px, 0px)";
    const zone = $("joystick");
    zone.style.transform = "";
    const base = zone.querySelector(".joystick-base");
    if (base) base.style.transform = "";
  }
  function moveStick(event) {
    const x = event.clientX - stick.centerX, y = event.clientY - stick.centerY;
    const len = Math.hypot(x, y), d = Math.min(42, len);
    const amount = clamp((len - 5) / 38, 0, 1);
    stick.x = len ? x / len * amount : 0;
    stick.y = len ? y / len * amount : 0;
    ui.stick.style.transform = "translate(" + (len ? x / len * d : 0) + "px," + (len ? y / len * d : 0) + "px)";
  }
  const stickZone = $("joystick"), stickBase = stickZone.querySelector(".joystick-base");
  function beginStick(event, floating = false) {
    if (scene !== "playing" || stick.id !== null) return;
    event.preventDefault();
    stick.id = event.pointerId;
    stickZone.style.transform = "";
    if (stickBase) stickBase.style.transform = "";
    const r = stickZone.getBoundingClientRect();
    if (floating) {
      // Keep the control in the layout so the DASH button stays on the right.
      const offsetX = clamp(event.clientX - (r.left + r.width / 2), -r.left + 16, W - r.right - 16);
      const offsetY = event.clientY - (r.top + r.height / 2);
      stickZone.style.transform = "translate(" + offsetX + "px," + offsetY + "px)";
    } else if (stickBase) {
      const dx = clamp(event.clientX - (r.left + r.width / 2), -24, 24);
      const dy = clamp(event.clientY - (r.top + r.height / 2), -24, 24);
      stickBase.style.transform = "translate(" + dx + "px," + dy + "px)";
    }
    stick.centerX = event.clientX; stick.centerY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  stickZone.addEventListener("pointerdown", event => beginStick(event));
  stickZone.addEventListener("pointermove", event => {
    if (stick.id === event.pointerId) { event.preventDefault(); moveStick(event); }
  });
  // Touching the lower-left play field creates a floating steering origin.
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" || scene !== "playing" || foreignActive()) return;
    if (event.clientX > W * .59 || event.clientY < Math.max(125, H * .16)) return;
    beginStick(event, true);
  });
  canvas.addEventListener("pointermove", event => {
    if (stick.id === event.pointerId) { event.preventDefault(); moveStick(event); }
  });
  for (const target of [stickZone, canvas]) {
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      target.addEventListener(type, event => { if (stick.id === event.pointerId) resetStick(); });
    }
  }
  ui.dash.addEventListener("pointerdown", event => { event.preventDefault(); dash(); });
  ui.dash.addEventListener("click", event => { if (event.detail === 0) dash(); });
  // Only the GPT6 CHAT door opens its own two-work shelf. Other authors' doors are untouched.
  $("openGameBtn").addEventListener("click", () => { window.location.href = "gpt6-chat/index.html"; });
  $("returnPortalBtn").addEventListener("click", () => {
    if (game) saveProgress();
    game = null;
    window.location.href = "gpt6-chat/index.html";
  });
  $("startBtn").addEventListener("click", startRun);
  $("pauseBtn").addEventListener("click", pause);
  ui.sound.addEventListener("click", () => { saved.music = !saved.music; persist(); if (saved.music) audioInit(); loadRecord(); });
  window.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;
    if (document.body && document.body.classList && (document.body.classList.contains("sumifu-open") || document.body.classList.contains("code-active") || document.body.classList.contains("sync-active"))) return;
    const k = event.key.toLowerCase();
    // preventDefault() also cancels the default action of a focused button, so
    // Space could no longer activate つづける / もう一度 / 強化. Keep recording
    // the key so movement still works, but do not swallow the event.
    const t = event.target;
    const onControl = t && (t.tagName === "BUTTON" || t.tagName === "INPUT" || t.tagName === "A" || t.isContentEditable || (t.closest && t.closest("button, a, input")));
    // Enter on a focused door must open only that door. The shortcut below would also open LUMINA.
    if (onControl && k === "enter" && scene !== "playing") return;
    if (!onControl && ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar"].includes(k)) event.preventDefault();
    if (scene === "upgrade") {
      if (["1", "2", "3"].includes(k)) {
        event.preventDefault();
        const choice = $("upgradeList")?.querySelectorAll(".upgrade")[Number(k) - 1];
        if (choice) choice.click();
      } else if (k === "r") { event.preventDefault(); $("rerollUpgrade")?.click(); }
      return;
    }
    keys.add(k === " " ? "space" : k);
    if ((k === "shift" || (k === " " && !onControl)) && !event.repeat) dash();
    if ((k === "escape" || k === "p") && !event.repeat) {
      if (scene === "playing") pause(); else if (scene === "paused") $("resume").click();
    }
    if (k === "enter" && !onControl && !event.repeat && scene === "launcher") {
      window.location.href = "gpt6-chat/index.html";
    }
    else if (k === "enter" && !onControl && !event.repeat && scene === "home") startRun();
  }, { passive: false });
  window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase()));
  window.addEventListener("blur", () => { keys.clear(); resetStick(); if (scene === "playing") pause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "playing") pause(); });
  document.addEventListener("contextmenu", event => event.preventDefault());
  loadRecord();
  // The first work remains in its original place, linked from the GPT6 CHAT shelf.
  if (window.location.hash === "#lumina") setScene("home");
  if ("serviceWorker" in navigator && location.protocol === "https:" && !location.hostname.includes("htmlpreview")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function fire() {
    const p = game.player;
    let target = null, d2 = Infinity;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const v = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (v < d2 && v < Math.max(320, Math.min(550, Math.max(W, H) * .63)) ** 2) {
        d2 = v; target = e;
      }
    }
    if (!target) return;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    for (let i = 0; i < p.bolts; i++) {
      const spread = (i - (p.bolts - 1) / 2) * .17;
      const a = angle + spread, speed = 530 * p.projectileSpeed * (activeResonance(p, "stardust") ? 1.15 : 1);
      const critical = Math.random() < p.crit;
      game.shots.push({ x: p.x + Math.cos(a) * 17, y: p.y + Math.sin(a) * 17,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: critical ? 6.4 : 5,
        life: 1.35, damage: p.damage * (critical ? 1.85 : 1),
        critical, pierce: p.pierce, hits: new Set(), slow: p.frost, trail: [] });
    }
    burst(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16, 2, "#f3ffe8", .18);
    sound("shoot");
  }

  function update(dt) {
    const g = game, p = g.player;
    if (g.comboPending) {
      const bonus = g.comboPending; g.comboPending = 0;
      addExp(bonus);
      if (scene !== "playing") return;
    }
    g.time += dt; g.stageTime += dt;
    g.comboTimer = Math.max(0, g.comboTimer - dt);
    if (g.comboTimer <= 0) g.combo = 0;
    // Pause and modal transitions never advance this time budget.
    // Walking animation is calmer while standing still.
    const walking = readMove();
    p.walk += dt * ((Math.hypot(walking[0], walking[1]) > .06 || p.dashTime > 0) ? 10 : 1.3);
    p.fireCd -= dt; p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.hp = Math.min(p.maxHp, p.hp + p.regen * dt * (p.hp < p.maxHp * .4 && activeResonance(p, "lifegarden") ? 2 : 1));
    p.novaCd -= dt;
    const [mx, my] = readMove();
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.x += p.dashX * 760 * dt;
      p.y += p.dashY * 760 * dt;
      if (Math.random() < .85) burst(p.x, p.y, 2, "#bfffe6", .18);
    } else {
      p.x += mx * p.speed * dt;
      p.y += my * p.speed * dt;
      if (Math.hypot(mx, my) > .1) { p.facingX = mx; p.facingY = my; }
    }
    if (p.fireCd <= 0) { p.fireCd += p.fireRate; fire(); }
    if (p.nova > 0 && p.novaCd <= 0) {
      p.novaCd += Math.max(3.9, 8.2 - p.nova);
      ring(p.x, p.y, 260, "#ffe5a7", .64);
      burst(p.x, p.y, 28, "#ffedae", .8);
      for (const e of g.enemies) if (distance(e, p) < 260) {
        hurtEnemy(e, 22 + p.nova * 22);
        if (activeResonance(p, "moonwave")) e.slow = Math.max(e.slow, 3.5);
        if (scene !== "playing") return;
      }
    }
    if (!g.bossSpawned && g.stageTime < 60) {
      g.spawnCd -= dt;
      if (g.spawnCd <= 0) {
        const interval = Math.max(.48, .98 - g.stage * .12 - g.stageTime * .006);
        g.spawnCd += interval;
        spawnRandom();
        if (g.stageTime > 23 && Math.random() < .18) spawnRandom();
      }
    }
    if (!g.bossSpawned && g.stageTime >= 60) spawnBoss();
    if (g.bossSpawned) {
      g.bossMinionCd -= dt;
      if (g.bossMinionCd <= 0) {
        g.bossMinionCd = Math.max(6.5, 11 - g.stage);
        if (g.enemies.filter(e => e.hp > 0 && e.type !== "boss").length < 9) {
          spawnRandom();
          if (g.stage > 0) spawnRandom();
        }
      }
    } else if (g.stageTime >= (g.waveMark + 1) * 15 && g.stageTime < 59.5) {
      g.waveMark++;
      ring(p.x, p.y, 128, themes[g.stage].orb, .62);
      sound("wave");
      rise(p.x, p.y - 60, ["", "✦ 光のさざ波", "✧ 影の群れ", "✦ 星の気配"][g.waveMark] || "✦ 影が近づく", "#f6e5bf");
      if (g.waveMark >= 2) spawnRandom();
    }

    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      if (e.hp <= 0) { g.enemies.splice(i, 1); continue; }
      e.phase += dt * 3.2; e.hitFx = Math.max(0, e.hitFx - dt);
      e.slow = Math.max(0, e.slow - dt); e.orbitHit = Math.max(0, e.orbitHit - dt);
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.max(1, Math.hypot(dx, dy));
      let move = 1;
      if (e.type === "archer") move = e.windup > 0 ? .04 : dist < 185 ? -.45 : dist < 265 ? .13 : .82;
      if (e.type === "boss") move = dist < 135 ? .15 : 1;
      const slowness = e.slow > 0 ? .55 : 1;
      const weave = e.type === "runner" ? Math.sin(e.phase * 1.7) * 26 : 0;
      if (e.type === "brute") {
        e.chargeCd -= dt;
        if (e.chargeTime > 0) {
          e.chargeTime -= dt;
          e.x += e.chargeX * 330 * slowness * dt;
          e.y += e.chargeY * 330 * slowness * dt;
          if (Math.random() < .36) burst(e.x, e.y, 1, "#cbbde5", .14);
        } else if (e.chargeWindup > 0) {
          e.chargeWindup -= dt;
          if (e.chargeWindup <= 0) {
            e.chargeTime = .34;
            ring(e.x, e.y, 35, "#dfc6f0", .32);
          }
        } else {
          e.x += dx / dist * e.speed * slowness * dt;
          e.y += dy / dist * e.speed * slowness * dt;
          if (e.chargeCd <= 0 && dist > 65 && dist < 275) {
            e.chargeWindup = .72;
            e.chargeCd = rand(4.2, 6.2);
            e.chargeX = dx / dist; e.chargeY = dy / dist;
            tone(155, .21, "triangle", .012, .8);
          }
        }
      } else {
        e.x += ((dx / dist * e.speed * move) + (-dy / dist * weave)) * slowness * dt;
        e.y += ((dy / dist * e.speed * move) + (dx / dist * weave)) * slowness * dt;
      }
      e.cd -= dt;
      // Archers mark their destination before firing: the warning remains
      // aimed at the *old* position, so moving out of the lane is meaningful.
      if (e.type === "archer" && e.cd <= 0 && e.windup <= 0 && dist < 550 && g.hostile.length < 115) {
        e.cd = rand(2.5, 3.35);
        e.windup = .62; e.aimX = p.x; e.aimY = p.y;
        ring(e.x, e.y, 31, "#ffaddf", .62);
      }
      if (e.type === "archer" && e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0 && g.hostile.length < 115) {
          const ax = e.aimX - e.x, ay = e.aimY - e.y, length = Math.max(1, Math.hypot(ax, ay));
          const speed = 174 + g.stage * 26;
          g.hostile.push({ x: e.x, y: e.y, vx: ax / length * speed, vy: ay / length * speed,
            r: 6, life: 4, damage: 12 + g.stage * 3, origin: "archer" });
          burst(e.x, e.y, 5, "#dcbaff", .25);
        }
      }
      // Boss strikes have a visible wind-up: the player can read and dodge the attack.
      if (e.type === "boss" && e.cd <= 0 && e.windup <= 0 && dist < 730) {
        e.cd = Math.max(2.6, 3.9 - g.stage * .25);
        e.windup = .88;
        ring(e.x, e.y, 150, "#ffabbf", .88);
        tone(190 + g.stage * 30, .24, "triangle", .023, 1.75);
      }
      if (e.type === "boss" && e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          const n = 10 + g.stage * 3;
          const aim = Math.atan2(p.y - e.y, p.x - e.x);
          // Each guardian varies the ring's angle so repeat attempts stay expressive.
          const offset = g.stage === 0 ? Math.PI / n : g.stage === 1 ? clock * .27 : aim / 3 + clock * .13;
          for (let j = 0; j < n && g.hostile.length < 115; j++) {
            const a = j / n * TWO + offset, speed = 122 + g.stage * 19;
            g.hostile.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6, life: 4.6, damage: 13 + g.stage * 2 });
          }
          if (g.stage === 2) {
            // Last Night adds an aimed five-star fan after the regular ring.
            for (let j = -2; j <= 2 && g.hostile.length < 115; j++) {
              const a = aim + j * .19, speed = 185;
              g.hostile.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                r: 5.5, life: 4, damage: 13, origin: "fan" });
            }
          }
          ring(e.x, e.y, 125, g.stage === 0 ? "#aee5c5" : g.stage === 1 ? "#b4c3ff" : "#ffd3d0", .45);
          burst(e.x, e.y, 14, themes[g.stage].orb, .6);
          shake = Math.max(shake, 4);
        }
      }
      if (dist < p.r + e.radius - 3) hurtPlayer(e.damage, e.x, e.y);
      if (scene !== "playing") return;
      if (e.type !== "boss" && dist > Math.max(W, H) * 2.3) { g.enemies.splice(i, 1); continue; }
      if (p.orbit && e.orbitHit === 0) {
        for (let j = 0; j < p.orbit; j++) {
          const a = clock * 2.25 + j * TWO / p.orbit, r = 64;
          const ox = p.x + Math.cos(a) * r, oy = p.y + Math.sin(a) * r;
          if ((e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.radius + 12) ** 2) {
            e.orbitHit = .45;
            hurtEnemy(e, 13 + p.damage * .42, ox, oy);
            if (scene !== "playing") return;
            break;
          }
        }
      }
    }

    for (let i = g.shots.length - 1; i >= 0; i--) {
      const s = g.shots[i], oldX = s.x, oldY = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let hit = false;
      for (const e of g.enemies) {
        if (e.hp <= 0 || s.hits.has(e.id)) continue;
        const ux = s.x - oldX, uy = s.y - oldY;
        const t = clamp(((e.x - oldX) * ux + (e.y - oldY) * uy) / Math.max(.001, ux * ux + uy * uy), 0, 1);
        const hx = oldX + ux * t, hy = oldY + uy * t;
        if ((e.x - hx) ** 2 + (e.y - hy) ** 2 < (e.radius + s.r) ** 2) {
          s.hits.add(e.id);
          if (s.critical) rise(e.x, e.y - 32, "✦ CRIT", "#ffe4a5");
          hurtEnemy(e, s.damage, s.x, s.y);
          if (scene !== "playing") return;
          if (s.slow) e.slow = 1.2 + .65 * s.slow;
          hit = s.hits.size > s.pierce;
          if (hit) break;
        }
      }
      if (hit || s.life <= 0) g.shots.splice(i, 1);
    }
    for (let i = g.hostile.length - 1; i >= 0; i--) {
      const s = g.hostile[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < (p.r + s.r) ** 2) {
        hurtPlayer(s.damage, s.x, s.y); g.hostile.splice(i, 1);
        if (scene !== "playing") return;
      } else if (s.life <= 0) g.hostile.splice(i, 1);
    }
    for (let i = g.orbs.length - 1; i >= 0; i--) {
      const o = g.orbs[i];
      o.phase += dt * 4; o.age = (o.age || 0) + dt;
      const dx = p.x - o.x, dy = p.y - o.y, dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < p.magnet || o.age > 1.6) {
        const speed = dist < p.magnet ? clamp((p.magnet - dist) * 4.2, 170, 900) : 195 + Math.min(250, (o.age - 1.6) * 32);
        o.x += dx / dist * speed * dt;
        o.y += dy / dist * speed * dt;
      }
      if (dist < p.r + 15) {
        if (o.value < 0) { p.hp = Math.min(p.maxHp, p.hp - o.value); showToast("生命のかけら +20"); }
        else addExp(o.value);
        if (Math.random() < .13) sound("pick");
        burst(o.x, o.y, 3, o.value < 0 ? "#ffa5b2" : themes[g.stage].orb, .2);
        g.orbs.splice(i, 1);
        if (scene !== "playing") return;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const a = particles[i]; a.ttl -= dt; a.x += a.vx * dt; a.y += a.vy * dt;
      const drag = Math.pow(.967, dt * 60);
      a.vx *= drag; a.vy *= drag;
      if (a.ttl <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].ttl -= dt; texts[i].y -= dt * 44;
      if (texts[i].ttl <= 0) texts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const a = rings[i]; a.ttl -= dt;
      a.r = ease(a.r, a.target, Math.min(1, dt * 7));
      if (a.ttl <= 0) rings.splice(i, 1);
    }
    shake *= Math.pow(.86, dt * 60);
    camX = ease(camX, p.x - W / 2, Math.min(1, dt * 5.8));
    camY = ease(camY, p.y - H / 2, Math.min(1, dt * 5.8));
    g.hudCd -= dt;
    if (g.hudCd <= 0) { updateHud(); g.hudCd = .12; }
    music();
  }

  function updateHud() {
    if (!game) return;
    const g = game, p = g.player;
    ui.top.classList.toggle("low-hp", p.hp / p.maxHp < .3);
    ui.hp.style.width = (100 * p.hp / p.maxHp) + "%";
    ui.hpLabel.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    ui.xp.style.width = (100 * clamp(g.xp / expNeed(), 0, 1)) + "%";
    ui.level.textContent = "LV " + g.level;
    ui.kills.textContent = "✧ " + g.kills + (g.combo >= 4 ? " · ×" + g.combo : "");
    ui.time.textContent = String(Math.floor(g.stageTime / 60)).padStart(2, "0") + ":" + String(Math.floor(g.stageTime % 60)).padStart(2, "0");
    ui.hint.textContent = g.bossSpawned ? "守護者を浄化せよ" : g.stageTime < 5 && g.stage === 0 ? "移動とダッシュ · 攻撃は自動" : "守護者まで " + Math.max(0, Math.ceil(60 - g.stageTime)) + " 秒";
    const boss = g.enemies.find(e => e.id === g.bossId);
    if (boss) ui.bossFill.style.width = (100 * Math.max(0, boss.hp) / boss.maxHp) + "%";
    const dashRatio = clamp(p.dashCd / p.dashCooldown, 0, 1);
    ui.dashProgress.style.transform = "scaleY(" + dashRatio + ")";
    ui.dash.classList.toggle("recharging", p.dashCd > 0);
    const dashText = ui.dash.querySelector(".dash-text");
    if (dashText) dashText.textContent = p.dashCd > 0 ? p.dashCd.toFixed(1) + "s" : "DASH";
    ui.dash.setAttribute("aria-label", p.dashCd > 0 ? "ダッシュ再使用まで " + p.dashCd.toFixed(1) + "秒" : "ダッシュ");
  }

  function background() {
    const t = game ? themes[game.stage] : themes[0];
    const gr = ctx.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, t.bg[0]); gr.addColorStop(1, t.bg[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    let rg = ctx.createRadialGradient(W * .37 + Math.sin(clock * .18) * 90, H * .37, 0, W * .47, H * .48, H * .84);
    rg.addColorStop(0, "rgba(102,179,164,.13)"); rg.addColorStop(1, "rgba(80,130,176,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    rg = ctx.createRadialGradient(W * .75, H * .71, 0, W * .75, H * .71, W * .95);
    rg.addColorStop(0, game && game.stage === 2 ? "rgba(229,124,158,.12)" : "rgba(75,119,193,.10)");
    rg.addColorStop(1, "rgba(64,95,161,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    for (const m of motes) {
      const drift = reducedMotion ? 0 : clock;
      const x = (m.x * W + Math.sin(drift * .21 + m.t) * 12 + W) % W;
      const y = (m.y * H + Math.sin(drift * .25 + m.t) * 16 + H) % H;
      const twinkle = .19 + .38 * (Math.sin(clock * m.z + m.t) ** 2);
      ctx.fillStyle = "rgba(213,247,232," + twinkle + ")";
      ctx.beginPath(); ctx.arc(x, y, m.s * .6, 0, TWO); ctx.fill();
    }
  }
  function terrain() {
    const t = themes[game.stage], stage = game.stage, cell = stage === 1 ? 152 : 132;
    const left = Math.floor(camX / cell) - 1, right = Math.ceil((camX + W) / cell) + 1;
    const top = Math.floor(camY / cell) - 1, bottom = Math.ceil((camY + H) / cell) + 1;
    ctx.save();
    ctx.strokeStyle = stage === 2 ? "rgba(236,185,192,.052)" : stage === 1 ? "rgba(167,190,243,.033)" : "rgba(147,219,205,.05)";
    ctx.lineWidth = 1;
    if (stage === 2) {
      // Ancient stone seams: subtly offset diagonal lattice.
      for (let x = left - 1; x <= right + 1; x++) {
        ctx.beginPath(); ctx.moveTo(x * cell, camY - 170); ctx.lineTo(x * cell + H * .24, camY + H + 170); ctx.stroke();
      }
      for (let y = top - 1; y <= bottom + 1; y++) {
        ctx.beginPath(); ctx.moveTo(camX - 150, y * cell); ctx.lineTo(camX + W + 170, y * cell); ctx.stroke();
      }
    } else if (stage === 0) {
      for (let x = left; x <= right; x++) {
        ctx.beginPath(); ctx.moveTo(x * cell, camY - 160); ctx.lineTo(x * cell, camY + H + 160); ctx.stroke();
      }
      for (let y = top; y <= bottom; y++) {
        ctx.beginPath(); ctx.moveTo(camX - 160, y * cell); ctx.lineTo(camX + W + 160, y * cell); ctx.stroke();
      }
    }
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const seed = hash(x, y);
      if (seed < .3) continue;
      const fx = x * cell + hash(x + 19, y + 4) * (cell - 32) + 16;
      const fy = y * cell + hash(x + 4, y + 81) * (cell - 32) + 16;
      const size = 2.5 + seed * 3.2, drift = Math.sin(clock * .7 + seed * 15);
      ctx.globalAlpha = .10 + seed * .15;
      ctx.strokeStyle = t.accent; ctx.fillStyle = t.accent; ctx.lineWidth = .9;
      if (stage === 0) {
        // Glowing wildflowers in the dawn forest.
        ctx.beginPath(); ctx.arc(fx, fy, size * 2.3, 0, TWO); ctx.stroke();
        for (let j = 0; j < 5; j++) {
          const a = j * TWO / 5 + clock * .027;
          ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * size * 1.7, fy + Math.sin(a) * size * 1.7, size * .9, size * .36, a, 0, TWO); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(fx, fy, 1.1, 0, TWO); ctx.fill();
      } else if (stage === 1) {
        // Lake ripples, drifting gently with an independent phase per tile.
        for (let j = 0; j < 3; j++) {
          const radius = 8 + j * 10 + (drift + 1) * 3;
          ctx.globalAlpha = (.08 + seed * .12) * (1 - j * .22);
          ctx.beginPath(); ctx.ellipse(fx, fy, radius * 1.55, radius * .52, .12, 0, TWO); ctx.stroke();
        }
        ctx.globalAlpha = .3 + drift * .12;
        ctx.beginPath(); ctx.arc(fx + 6, fy - 2, 1.3, 0, TWO); ctx.fill();
      } else {
        // The star temple's geometric sigils, each at its own rotation.
        const a0 = hash(x + 2, y - 7) * TWO;
        for (let j = 0; j < 6; j++) {
          const a = a0 + j * TWO / 6;
          const b = a0 + (j + 1) * TWO / 6;
          ctx.beginPath(); ctx.moveTo(fx + Math.cos(a) * size * 3.1, fy + Math.sin(a) * size * 3.1);
          ctx.lineTo(fx + Math.cos(b) * size * 3.1, fy + Math.sin(b) * size * 3.1); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(fx, fy - size * 1.7); ctx.lineTo(fx + size * 1.3, fy + size);
        ctx.lineTo(fx - size * 1.3, fy + size); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, TWO); ctx.fill();
      }
    }
    ctx.restore();
  }
  function landmarks() {
    // Slow world-anchored patterns give each realm its own landscape signature.
    const cell = 610, stage = game.stage;
    const left = Math.floor(camX / cell) - 1, top = Math.floor(camY / cell) - 1;
    const right = Math.ceil((camX + W) / cell), bottom = Math.ceil((camY + H) / cell);
    for (let gx = left; gx <= right; gx++) for (let gy = top; gy <= bottom; gy++) {
      const seed = hash(gx + 82, gy - 39);
      const x = gx * cell + (seed - .5) * 290, y = gy * cell + (hash(gx - 52, gy + 17) - .5) * 260;
      ctx.save(); ctx.translate(x, y);
      const radius = 66 + seed * 48, spin = Math.sin(clock * .16 + seed * TWO) * .12;
      ctx.rotate(spin);
      ctx.globalAlpha = .18;
      ctx.strokeStyle = themes[stage].accent; ctx.lineWidth = 1.25;
      if (stage === 0) {
        for (let i = 0; i < 5; i++) {
          const a = i * TWO / 5;
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * radius * .38, Math.sin(a) * radius * .38,
            radius * .74, radius * .27, a, 0, TWO); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, radius * .52, 0, TWO); ctx.stroke();
      } else if (stage === 1) {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.ellipse(0, i * 7, radius * (1 + i * .21), radius * (.3 + i * .09),
            -.12, Math.PI * .07, Math.PI * 1.93); ctx.stroke();
        }
      } else {
        for (let k = 0; k < 8; k++) {
          const a = TWO * k / 8;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * radius * .35, Math.sin(a) * radius * .35);
          ctx.lineTo(Math.cos(a + .22) * radius, Math.sin(a + .22) * radius);
          ctx.lineTo(Math.cos(a + .45) * radius * .35, Math.sin(a + .45) * radius * .35); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, radius * .74, 0, TWO); ctx.stroke();
      }
      ctx.globalAlpha = .22 + .08 * Math.sin(clock + seed * 11);
      for (let i = 0; i < 8; i++) {
        const a = i * TWO / 8 + clock * .07;
        ctx.fillStyle = themes[stage].orb;
        ctx.beginPath(); ctx.arc(Math.cos(a) * radius * 1.24, Math.sin(a) * radius * 1.02, 1.5, 0, TWO); ctx.fill();
      }
      ctx.restore();
    }
  }
  function orbShape(x, y, r, color, spin = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.5); ctx.quadraticCurveTo(r * 1.15, 0, 0, r * 1.4);
    ctx.quadraticCurveTo(-r * 1.15, 0, 0, -r * 1.5); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.beginPath(); ctx.moveTo(-r * .1, -r * .88); ctx.lineTo(r * .18, -.5 * r); ctx.lineTo(-r * .1, -.1 * r); ctx.fill();
    ctx.restore();
  }
  function drawPlayer(p) {
    const bob = Math.sin(p.walk) * 2;
    ctx.save(); ctx.translate(p.x, p.y + bob);
    if (p.invuln > 0 && Math.floor(clock * 16) % 3 === 0) ctx.globalAlpha = .52;
    if (p.dashTime > 0) {
      ctx.strokeStyle = "rgba(179,255,236,.36)"; ctx.lineWidth = 14; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-p.dashX * 52, -p.dashY * 52); ctx.lineTo(0, 0); ctx.stroke();
    }
    // A pair of layered translucent wings catches the ambient light.
    ctx.shadowColor = "#d5ffe6"; ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(208,255,238,.23)";
    ctx.beginPath(); ctx.ellipse(-21, -5, 20, 11, -.65 + Math.sin(clock * 9) * .07, 0, TWO); ctx.fill();
    ctx.beginPath(); ctx.ellipse(21, -5, 20, 11, .65 - Math.sin(clock * 9) * .07, 0, TWO); ctx.fill();
    ctx.shadowColor = "#a9ffe0"; ctx.shadowBlur = 27;
    ctx.fillStyle = "#8af4dd";
    ctx.beginPath(); ctx.ellipse(-15, 1, 16, 7, -Math.PI / 5 + Math.sin(clock * 7) * .12, 0, TWO); ctx.fill();
    ctx.beginPath(); ctx.ellipse(15, 1, 16, 7, Math.PI / 5 - Math.sin(clock * 7) * .12, 0, TWO); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#577caa"; ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(-17, 21);
    ctx.quadraticCurveTo(0, 17 + Math.sin(clock * 5) * 3, 17, 21); ctx.lineTo(9, 6); ctx.closePath(); ctx.fill();
    ctx.shadowColor = "#d4ffe8"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#f6edda"; ctx.beginPath(); ctx.arc(0, 0, 11.4, 0, TWO); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e8ecdc"; ctx.beginPath(); ctx.arc(0, -4, 12, Math.PI, TWO); ctx.lineTo(12, 0);
    ctx.quadraticCurveTo(-3, -1, -12, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#173c53";
    ctx.beginPath(); ctx.arc(-4, 2, 1.65, 0, TWO); ctx.arc(4, 2, 1.65, 0, TWO); ctx.fill();
    ctx.strokeStyle = "#ffedd2"; ctx.lineWidth = 1.5;
    ctx.shadowColor = "#ffedb0"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(0, -17, 12, 4, 0, 0, TWO); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    if (!reducedMotion && Math.hypot(p.facingX, p.facingY) > .5 && Math.sin(p.walk) > .68 && p.dashTime <= 0) {
      orbShape(p.x - p.facingX * 21 + rand(-3, 3), p.y - p.facingY * 21 + rand(-3, 3), 1.9,
        "#93e3cd", clock);
    }
    if (p.orbit) for (let i = 0; i < p.orbit; i++) {
      const a = clock * 2.25 + i / p.orbit * TWO;
      const x = p.x + Math.cos(a) * 64, y = p.y + Math.sin(a) * 64;
      ctx.strokeStyle = "rgba(176,239,232,.1)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 64, 0, TWO); ctx.stroke();
      orbShape(x, y, 9, "#fbe8af", clock);
    }
  }
  function drawEnemy(e) {
    const t = themes[game.stage], isBoss = e.type === "boss";
    const r = e.radius;
    ctx.save(); ctx.translate(e.x, e.y + Math.sin(e.phase * .6) * 2);
    ctx.rotate(isBoss ? Math.sin(clock * .6) * .09 : Math.sin(e.phase) * .16);
    const base = isBoss ? ["#90d5b5", "#9eaff4", "#ffabc8"][game.stage]
      : e.type === "runner" ? "#ffb6ca" : e.type === "brute" ? "#c4ace4"
      : e.type === "archer" ? "#c5c1fd" : "#78b4bb";
    ctx.shadowColor = base; ctx.shadowBlur = isBoss ? 28 : 12;
    if (isBoss) {
      for (let j = 0; j < 10; j++) {
        const a = j / 10 * TWO + clock * .17;
        ctx.fillStyle = j % 2 ? t.orb : base;
        ctx.globalAlpha = j % 2 ? .38 : .21;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * .92, Math.sin(a) * r * .92, r * .55, r * .2, a, 0, TWO); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = t.accent; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, TWO); ctx.stroke();
      ctx.save(); ctx.rotate(clock * (game.stage === 1 ? -.24 : .12));
      const points = game.stage === 0 ? 6 : game.stage === 1 ? 8 : 10;
      ctx.strokeStyle = t.orb; ctx.globalAlpha = .45;
      ctx.beginPath();
      for (let j = 0; j <= points; j++) {
        const a = TWO * j / points;
        const rr = r * (j % 2 === 0 ? 1.65 : 1.28);
        if (j === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke(); ctx.restore();
      ctx.globalAlpha = 1;
    } else if (e.type === "brute") {
      for (let j = 0; j < 5; j++) {
        const a = j / 5 * TWO;
        ctx.fillStyle = "#80749e"; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .6, Math.sin(a) * r * .6);
        ctx.lineTo(Math.cos(a + .17) * r * 1.6, Math.sin(a + .17) * r * 1.6);
        ctx.lineTo(Math.cos(a + .52) * r * .75, Math.sin(a + .52) * r * .75); ctx.fill();
      }
    } else if (e.type === "archer") {
      ctx.strokeStyle = "#cfbbfb"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, r + 7, .1, Math.PI * 1.6); ctx.stroke();
      if (e.windup > 0) {
        ctx.strokeStyle = "#ffe4c8"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r + 12, -Math.PI / 2,
          -Math.PI / 2 + TWO * (1 - e.windup / .62)); ctx.stroke();
      }
    }
    ctx.fillStyle = e.hitFx > 0 ? "#fffef1" : base;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.14);
    ctx.bezierCurveTo(r * 1.1, -r * .7, r * 1.1, r * 1.06, 0, r * .92);
    ctx.bezierCurveTo(-r * .95, r * 1.08, -r * 1.1, -r * .7, 0, -r * 1.14);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isBoss && e.windup > 0) {
      const progress = clamp(1 - e.windup / .88, 0, 1);
      ctx.save();
      ctx.rotate(-Math.sin(clock * .6) * .09);
      ctx.strokeStyle = "rgba(255,221,191,.95)";
      ctx.lineWidth = 3.3;
      ctx.shadowColor = "#ffbdc1"; ctx.shadowBlur = 17;
      ctx.beginPath(); ctx.arc(0, 0, r + 19 + progress * 6, -Math.PI / 2, -Math.PI / 2 + TWO * progress); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = isBoss ? "#42243b" : "#173145";
    ctx.beginPath();
    ctx.ellipse(-r * .3, 0, r * .1 + 1, r * .2 + 1, -.2, 0, TWO);
    ctx.ellipse(r * .3, 0, r * .1 + 1, r * .2 + 1, .2, 0, TWO);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,248,229,.28)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 0, r * .7, Math.PI * 1.03, Math.PI * 1.93); ctx.stroke();
    ctx.restore();
    if (e.type === "brute" && e.chargeTime > 0) {
      ctx.save(); ctx.strokeStyle = "rgba(229,200,255,.44)";
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(e.x - e.chargeX * 40, e.y - e.chargeY * 40);
      ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.restore();
    }
    if (e.type === "brute" && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,6,20,.5)"; ctx.fillRect(e.x - 17, e.y - r - 12, 34, 3);
      ctx.fillStyle = t.orb; ctx.fillRect(e.x - 17, e.y - r - 12, 34 * (e.hp / e.maxHp), 3);
    }
  }
  function drawGame() {
    const g = game, p = g.player, theme = themes[g.stage];
    ctx.save();
    const wobbleX = !reducedMotion && shake > .1 ? rand(-shake, shake) : 0;
    const wobbleY = !reducedMotion && shake > .1 ? rand(-shake, shake) : 0;
    ctx.translate(-camX + wobbleX, -camY + wobbleY);
    terrain(); landmarks();
    for (const o of g.orbs) {
      const color = o.value < 0 ? "#ffa2bd" : theme.orb;
      orbShape(o.x, o.y + Math.sin(o.phase) * 3, o.r + 1, color, Math.sin(o.phase) * .15);
    }
    for (const a of rings) {
      ctx.globalAlpha = clamp(a.ttl / a.max, 0, 1) * .65;
      ctx.strokeStyle = a.color; ctx.lineWidth = 2;
      ctx.shadowColor = a.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TWO); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    for (const e of g.enemies) if (e.hp > 0 && e.type === "brute" && e.chargeWindup > 0) {
      ctx.save(); ctx.strokeStyle = "rgba(223,191,255,.45)"; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + e.chargeX * 155, e.y + e.chargeY * 155); ctx.stroke();
      ctx.strokeStyle = "rgba(255,242,219,.7)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 10 + (1 - e.chargeWindup / .72) * 6, 0, TWO); ctx.stroke();
      ctx.restore();
    }
    for (const e of g.enemies) if (e.hp > 0 && e.type === "archer" && e.windup > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,193,223,.47)";
      ctx.lineWidth = 1.35; ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.aimX, e.aimY); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
      ctx.save(); ctx.strokeStyle = "rgba(255,200,221,.64)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(e.aimX, e.aimY, 12 + Math.sin(clock * 12) * 1.5, 0, TWO); ctx.stroke(); ctx.restore();
    }
    for (const e of g.enemies) if (e.hp > 0) drawEnemy(e);
    for (const s of g.shots) {
      ctx.strokeStyle = "rgba(138,241,212,.47)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x - s.vx * .036, s.y - s.vy * .036); ctx.lineTo(s.x, s.y); ctx.stroke();
      orbShape(s.x, s.y, s.r, s.critical ? "#ffe2a3" : "#edffe2", Math.atan2(s.vy, s.vx));
    }
    for (const s of g.hostile) {
      ctx.shadowColor = "#ff96d1"; ctx.shadowBlur = 14;
      ctx.fillStyle = "#eea4d7"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + Math.sin(clock * 7) * .8, 0, TWO); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff1f1";
      ctx.beginPath(); ctx.arc(s.x - 1, s.y - 1, 1.8, 0, TWO); ctx.fill();
    }
    // A grounded glow keeps the tiny traveller legible during crowded fights.
    ctx.save(); ctx.globalAlpha = .28; ctx.fillStyle = "#87ebce";
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 24, 24, 6, 0, 0, TWO); ctx.fill(); ctx.restore();
    drawPlayer(p);
    for (const a of particles) {
      ctx.globalAlpha = Math.max(0, a.ttl / a.max);
      ctx.fillStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TWO); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.font = "600 13px Georgia,serif"; ctx.textAlign = "center";
    for (const a of texts) {
      ctx.globalAlpha = Math.min(1, a.ttl / a.max * 2);
      ctx.fillStyle = a.color; ctx.shadowColor = "#061728"; ctx.shadowBlur = 7;
      ctx.fillText(a.text, a.x, a.y);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
    if (!g.bossSpawned && g.stageTime < 20) {
      // Subtle direction hints ensure newly spawned enemies never feel absent.
      const candidates = g.enemies.filter(e => e.hp > 0).sort((a, b) =>
        (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2)).slice(0, 2);
      for (const e of candidates) {
        const x = e.x - camX, y = e.y - camY;
        const border = 45, topSafe = Math.min(156, H * .2), bottomSafe = H - Math.min(145, H * .19);
        if (x > border && x < W - border && y > topSafe && y < bottomSafe) continue;
        const edgeX = clamp(x, border, W - border), edgeY = clamp(y, topSafe, bottomSafe);
        ctx.save(); ctx.translate(edgeX, edgeY);
        ctx.rotate(Math.atan2(y - H * .5, x - W * .5));
        ctx.globalAlpha = .55 + .16 * Math.sin(clock * 4);
        ctx.fillStyle = "#b3e9d7";
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -4); ctx.lineTo(-3, 0); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    if (g.bossSpawned) {
      ctx.fillStyle = "rgba(226,128,164," + (.045 + .03 * Math.sin(clock * 2)) + ")";
      ctx.fillRect(0, 0, W, H);
      // When the guardian is beyond the visible play area, keep direction legible.
      const boss = g.enemies.find(e => e.id === g.bossId && e.hp > 0);
      if (boss) {
        const bx = boss.x - camX, by = boss.y - camY;
        const top = Math.min(176, H * .25), bottom = H - Math.min(171, H * .24);
        if (bx < 38 || bx > W - 38 || by < top || by > bottom) {
          const ax = clamp(bx, 40, W - 40), ay = clamp(by, top, bottom);
          const angle = Math.atan2(by - H * .5, bx - W * .5);
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(angle);
          ctx.globalAlpha = .82 + .18 * Math.sin(clock * 4);
          ctx.shadowColor = "#ff8fae"; ctx.shadowBlur = 14;
          ctx.fillStyle = "#ffe2cc";
          ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }
    }
  }
  function drawHome() {
    const cx = W * .5, cy = H * .32;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * .66);
    glow.addColorStop(0, "rgba(182,249,218,.20)"); glow.addColorStop(.3, "rgba(94,192,193,.09)"); glow.addColorStop(1, "rgba(96,167,200,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(cx, cy);
    ctx.rotate(reducedMotion ? 0 : clock * .06);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TWO;
      ctx.strokeStyle = "rgba(181,234,222," + (.05 + .05 * Math.sin(clock * .5 + i)) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 95, Math.sin(a) * 95);
      ctx.quadraticCurveTo(Math.cos(a + .4) * 175, Math.sin(a + .4) * 175, Math.cos(a + .9) * 105, Math.sin(a + .9) * 105);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TWO + clock * .12;
      orbShape(cx + Math.cos(a) * (125 + i % 3 * 25), cy + Math.sin(a) * (125 + i % 3 * 20), 2.6, i % 2 ? "#d5ffcb" : "#ffddb4", clock * .7);
    }
  }
  function foreignActive() {
    const c = document.body && document.body.classList;
    if (!c) return false;
    return c.contains("sumifu-open") || c.contains("code-active") || c.contains("sync-active");
  }
  function frame(now) {
    if (!last) last = now;
    const dt = clamp((now - last) / 1000, 0, .034);
    last = now; clock += dt;
    // 他の作品出てる間は、この canvas は display:none になっている。
    // 描画だけ停めて、60fps の無効な再描画を避ける。
    if (!foreignActive()) {
      if (scene === "playing" && game) update(dt);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      background();
      if (game) drawGame(); else drawHome();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
