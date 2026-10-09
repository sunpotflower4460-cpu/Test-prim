"use strict";
(() => {
  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const $ = id => document.getElementById(id);
  const ui = {
    home: $("home"), overlay: $("overlay"), top: $("topbar"), controls: $("mobileControls"),
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
  let saved = { best: 0, wins: 0, music: true };
  try { saved = Object.assign(saved, JSON.parse(localStorage.getItem(storageKey) || "{}")); } catch (_) {}
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
    { id: "luck", icon: "✿", name: "星のめぐみ", desc: "集める経験値が20%増加する", max: 3, apply: p => { p.luck += .2; } }
  ];
  const keys = new Set();
  const stick = { x: 0, y: 0, id: null, centerX: 0, centerY: 0 };
  const particles = [];
  const texts = [];
  const rings = [];
  const motes = Array.from({ length: 72 }, () => ({ x: Math.random(), y: Math.random(), s: rand(.5, 2.1), t: rand(0, TWO), z: rand(.2, 1) }));
  let W = 390, H = 800, DPR = 1, scene = "home", game = null, last = 0, clock = 0;
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
    const roots = [174.61, 146.83, 196][game.stage];
    const patterns = [[0, 7, 12, 16, 12, 7, 4, 7], [0, 3, 7, 12, 15, 12, 7, 3], [0, 4, 9, 12, 16, 12, 9, 4]];
    const semitone = patterns[game.stage][beat % 8];
    const frequency = roots * Math.pow(2, semitone / 12);
    tone(frequency * 2, .45, "sine", .008);
    if (beat % 8 === 0) {
      tone(roots, 2.9, "sine", .018);
      tone(roots * 1.498, 2.8, "sine", .01);
    }
    beat++;
  }

  function loadRecord() {
    ui.record.textContent = saved.best ? ("BEST · 第" + saved.best + "章到達  /  全制覇 " + saved.wins + " 回") : "あなたの物語は、ここから。";
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
    ui.home.classList.toggle("hidden", value !== "home");
    ui.overlay.classList.toggle("hidden", value === "home" || value === "playing");
    ui.top.classList.toggle("hidden", value === "home");
    ui.controls.classList.toggle("hidden", value !== "playing");
    if (value !== "playing") resetStick();
  }
  function overlayCard(kicker, title, message, content) {
    ui.overlay.innerHTML = '<div class="card"><div class="card-kicker">' + kicker + '</div><h2>' + title + '</h2><p>' + message + '</p>' + (content || "") + '</div>';
  }
  function bindButton(id, callback) { const el = $(id); if (el) el.addEventListener("click", callback); }

  function freshPlayer() {
    return {
      x: 0, y: 0, r: 16, hp: 100, maxHp: 100, speed: 220, damage: 22, fireRate: .44, fireCd: .1,
      bolts: 1, orbit: 0, magnet: 106, regen: 0, frost: 0, pulse: 0, nova: 0, novaCd: 5,
      luck: 1, invuln: 0, dashCd: 0, dashTime: 0, dashX: 0, dashY: -1, dashSerial: 0,
      facingX: 0, facingY: -1, walk: 0, perkLevels: {}
    };
  }
  function startRun() {
    audioInit();
    game = {
      player: freshPlayer(), stage: 0, stageTime: 0, time: 0,
      enemies: [], shots: [], hostile: [], orbs: [], kills: 0, level: 1,
      xp: 0, totalXp: 0, bossSpawned: false, bossId: null,
      spawned: 0, spawnCd: 1.5, nextId: 1, hudCd: 0, settled: false,
      score: 0
    };
    particles.length = 0; rings.length = 0; texts.length = 0;
    musicAt = clock; beat = 0;
    camX = -W / 2; camY = -H / 2; shake = 0;
    beginChapter();
  }
  function beginChapter() {
    const t = themes[game.stage];
    game.stageTime = 0; game.spawnCd = .7; game.bossSpawned = false; game.bossId = null;
    game.enemies.length = 0; game.shots.length = 0; game.hostile.length = 0;
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 24);
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
    game = null;
    setScene("home");
    ui.bossbar.classList.add("hidden");
    loadRecord();
  }
  function gameOver() {
    if (!game || scene !== "playing") return;
    saved.best = Math.max(saved.best, game.stage + 1);
    persist();
    setScene("over");
    sound("hit");
    overlayCard("YOUR LIGHT REMAINS", "星は、消えない。", "歩いてきた光は、きっと次の旅に残っている。", '<div class="stats"><span><strong>' + (game.stage + 1) + '</strong>到達した章</span><span><strong>' + game.kills + '</strong>浄化した影</span><span><strong>' + game.level + '</strong>レベル</span></div><button class="primary" id="retry">もう一度、旅へ <b>↗</b></button><br><button class="secondary" id="quit">タイトルへ戻る</button>');
    bindButton("retry", startRun); bindButton("quit", backHome);
  }
  function win() {
    if (!game || game.settled) return;
    game.settled = true;
    saved.best = 3; saved.wins++;
    persist();
    setScene("won");
    flash(.55); sound("win");
    overlayCard("THE STARS REMEMBER YOU", "世界に、光が戻った。", "最後の星は、ずっとあなたの中にあった。<br>そして庭は、また花を咲かせる。", '<div class="special">✦</div><div class="stats"><span><strong>' + game.kills + '</strong>浄化した影</span><span><strong>' + game.level + '</strong>レベル</span><span><strong>' + Math.floor(game.time / 60) + ':' + String(Math.floor(game.time % 60)).padStart(2, "0") + '</strong>旅の時間</span></div><button class="primary" id="retry">新しい夜明けへ <b>↗</b></button><br><button class="secondary" id="quit">タイトルへ戻る</button>');
    bindButton("retry", startRun); bindButton("quit", backHome);
  }
  function chapterClear() {
    if (!game || scene !== "playing") return;
    if (game.stage === 2) { win(); return; }
    saved.best = Math.max(saved.best, game.stage + 2); persist();
    setScene("chapter");
    const t = themes[game.stage + 1];
    sound("level"); flash(.36);
    overlayCard("CHAPTER COMPLETE", themes[game.stage].short + "に光が戻った", "旅はまだ終わらない。<br>次は、" + t.short + "へ。", '<div class="special">✧</div><button class="primary" id="nextChapter">次の世界へ <b>↗</b></button>');
    bindButton("nextChapter", () => { game.stage++; beginChapter(); });
  }

  function expNeed() { return Math.floor(16 + game.level * 13 + Math.pow(game.level, 1.26) * 3); }
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
  function levelUp() {
    if (scene !== "playing") return;
    setScene("upgrade");
    sound("level"); flash(.18); haptic(25);
    overlayCard("A GIFT FROM THE STARS", "星の祝福を選んで", "新しい光が、あなたに宿ろうとしている。", '<div class="upgrade-list" id="upgradeList"></div>');
    const available = perks.filter(item => (game.player.perkLevels[item.id] || 0) < item.max);
    available.sort(() => Math.random() - .5);
    const options = available.slice(0, 3);
    const list = $("upgradeList");
    for (const item of options) {
      const n = game.player.perkLevels[item.id] || 0;
      const button = document.createElement("button");
      button.className = "upgrade";
      button.innerHTML = '<div class="upgrade-icon">' + item.icon + '</div><div><div class="upgrade-title">' + item.name + '</div><div class="upgrade-desc">' + item.desc + '</div><span class="upgrade-rank">現在 ' + n + ' / ' + item.max + ' · 次の強化 ' + (n + 1) + '</span></div>';
      button.addEventListener("click", () => {
        item.apply(game.player);
        game.player.perkLevels[item.id] = n + 1;
        setScene("playing");
        showToast(item.name);
        haptic(20);
        updateHud();
        if (game.xp >= expNeed()) {
          game.xp -= expNeed(); game.level++; levelUp();
        }
      });
      list.appendChild(button);
    }
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
    const m = { wisp: [27, 86, 8, 18], runner: [19, 136, 8, 14], brute: [95, 49, 15, 25], archer: [50, 65, 10, 22], boss: [660, 56, 35, 24] }[type];
    const scale = 1 + game.stage * .45 + Math.min(1.2, game.stageTime / 140);
    const e = {
      id: game.nextId++, type, x, y, hp: m[0] * scale, maxHp: m[0] * scale,
      speed: m[1] * (1 + game.stage * .13), radius: m[2] + (type === "boss" ? game.stage * 4 : 0),
      damage: m[3] + game.stage * 3, phase: rand(0, TWO), cd: rand(.4, 2.6), hitFx: 0,
      slow: 0, orbitHit: 0, dashSerial: -1, score: type === "boss" ? 100 : 1
    };
    if (type === "boss") { e.hp *= 1 + game.stage * .28; e.maxHp = e.hp; e.cd = 1.5; }
    game.enemies.push(e);
    return e;
  }
  function spawnRandom() {
    if (game.enemies.length > 70) return;
    const a = rand(0, TWO), r = Math.max(W, H) * .62 + rand(70, 190);
    const x = game.player.x + Math.cos(a) * r, y = game.player.y + Math.sin(a) * r;
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
    const a = rand(0, TWO), r = Math.max(W, H) * .53;
    const e = spawnEnemy("boss", game.player.x + Math.cos(a) * r, game.player.y + Math.sin(a) * r);
    game.bossId = e.id;
    ui.bossName.textContent = themes[game.stage].boss;
    ui.bossbar.classList.remove("hidden");
    showToast("⚠ " + themes[game.stage].boss + " が現れた");
    sound("boss"); haptic([40, 80, 65]);
    ring(game.player.x, game.player.y, 170, "#e4a4b8", 1.2);
  }
  function hurtEnemy(e, dmg, x = e.x, y = e.y) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.hitFx = .13;
    if (dmg >= 25 || Math.random() < .3) rise(e.x + rand(-8, 8), e.y - 18, String(Math.ceil(dmg)), "#fff0be");
    if (e.hp <= 0) {
      game.kills += e.score; game.score += e.score * 8;
      const color = e.type === "boss" ? "#ffdfb6" : themes[game.stage].orb;
      burst(e.x, e.y, e.type === "boss" ? 55 : 10, color, e.type === "boss" ? 2 : .75);
      ring(e.x, e.y, e.type === "boss" ? 240 : 45, color, e.type === "boss" ? 1.1 : .35);
      sound("kill");
      if (e.type === "boss") {
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * TWO, d = rand(25, 105);
          game.orbs.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, value: 12, r: 6, phase: rand(0, TWO) });
        }
        game.bossId = null;
        game.enemies = game.enemies.filter(mob => mob.type !== "boss");
        chapterClear();
        return;
      }
      const drop = e.type === "brute" ? 9 : e.type === "archer" ? 7 : 5;
      game.orbs.push({ x: e.x, y: e.y, value: drop, r: e.type === "brute" ? 6 : 4, phase: rand(0, TWO) });
      if (Math.random() < .012 && game.player.hp < game.player.maxHp * .7) game.orbs.push({ x: e.x + 14, y: e.y, value: -20, r: 7, phase: 0 });
    } else if (Math.random() < .25) burst(x, y, 3, "#c9ffef", .35);
  }
  function hurtPlayer(dmg, x, y) {
    const p = game.player;
    if (p.invuln > 0 || p.dashTime > 0 || scene !== "playing") return;
    p.hp = Math.max(0, p.hp - dmg);
    p.invuln = .82; shake = Math.max(shake, 10);
    ring(p.x, p.y, 42, "#ff9aaa", .24);
    burst(p.x, p.y, 13, "#ffb6bc", .85);
    rise(p.x + 8, p.y - 26, "−" + Math.round(dmg), "#ffa9ba");
    sound("hit"); haptic(40); flash(.18);
    if (p.hp <= 0) gameOver();
  }
  function dash() {
    if (scene !== "playing") return;
    const p = game.player;
    if (p.dashCd > 0 || p.dashTime > 0) return;
    let dx = stick.x, dy = stick.y;
    if (Math.abs(dx) + Math.abs(dy) < .15) {
      dx = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
      dy = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
    }
    const d = Math.hypot(dx, dy);
    p.dashX = d > .12 ? dx / d : p.facingX;
    p.dashY = d > .12 ? dy / d : p.facingY;
    p.dashTime = .25; p.dashCd = 2.35; p.invuln = .39; p.dashSerial++;
    sound("dash"); haptic(18);
    ring(p.x, p.y, 70 + p.pulse * 25, "#b4fff0", .36);
    burst(p.x, p.y, 19, "#caffed", .9);
    if (p.pulse) {
      for (const e of game.enemies) {
        if (distance(e, p) < 115 + p.pulse * 17) hurtEnemy(e, 25 + p.pulse * 20);
      }
    }
  }
  function readMove() {
    let dx = stick.x, dy = stick.y;
    const keyboardX = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    const keyboardY = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
    if (keyboardX || keyboardY) { dx = keyboardX; dy = keyboardY; }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return [dx, dy];
  }
  function resetStick() {
    stick.x = 0; stick.y = 0; stick.id = null;
    ui.stick.style.transform = "translate(0px, 0px)";
  }
  function moveStick(event) {
    const x = event.clientX - stick.centerX, y = event.clientY - stick.centerY;
    const len = Math.hypot(x, y), d = Math.min(42, len);
    stick.x = len ? x / len * Math.min(1, len / 42) : 0;
    stick.y = len ? y / len * Math.min(1, len / 42) : 0;
    ui.stick.style.transform = "translate(" + (len ? x / len * d : 0) + "px," + (len ? y / len * d : 0) + "px)";
  }
  $("joystick").addEventListener("pointerdown", event => {
    if (scene !== "playing") return;
    event.preventDefault();
    stick.id = event.pointerId;
    const r = $("joystick").getBoundingClientRect();
    stick.centerX = r.left + r.width / 2; stick.centerY = r.top + r.height / 2 - 1;
    $("joystick").setPointerCapture(event.pointerId);
    moveStick(event);
  });
  $("joystick").addEventListener("pointermove", event => {
    if (stick.id === event.pointerId) { event.preventDefault(); moveStick(event); }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    $("joystick").addEventListener(type, event => { if (stick.id === event.pointerId) resetStick(); });
  }
  ui.dash.addEventListener("pointerdown", event => { event.preventDefault(); dash(); });
  $("startBtn").addEventListener("click", startRun);
  $("pauseBtn").addEventListener("click", pause);
  ui.sound.addEventListener("click", () => { saved.music = !saved.music; persist(); if (saved.music) audioInit(); loadRecord(); });
  window.addEventListener("keydown", event => {
    const k = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar"].includes(k)) event.preventDefault();
    keys.add(k === " " ? "space" : k);
    if ((k === " " || k === "shift") && !event.repeat) dash();
    if ((k === "escape" || k === "p") && !event.repeat) {
      if (scene === "playing") pause(); else if (scene === "paused") $("resume").click();
    }
    if (k === "enter" && scene === "home") startRun();
  }, { passive: false });
  window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase()));
  window.addEventListener("blur", () => { keys.clear(); resetStick(); if (scene === "playing") pause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "playing") pause(); });
  document.addEventListener("contextmenu", event => event.preventDefault());
  loadRecord();
  if ("serviceWorker" in navigator && location.protocol === "https:" && !location.hostname.includes("htmlpreview")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function fire() {
    const p = game.player;
    let target = null, d2 = Infinity;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const v = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (v < d2) { d2 = v; target = e; }
    }
    if (!target || d2 > 740 ** 2) return;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    for (let i = 0; i < p.bolts; i++) {
      const spread = (i - (p.bolts - 1) / 2) * .17;
      const a = angle + spread;
      game.shots.push({ x: p.x + Math.cos(a) * 17, y: p.y + Math.sin(a) * 17,
        vx: Math.cos(a) * 510, vy: Math.sin(a) * 510, r: 5, life: 1.5,
        damage: p.damage, slow: p.frost, trail: [] });
    }
    burst(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16, 2, "#f3ffe8", .18);
    sound("shoot");
  }

  function update(dt) {
    const g = game, p = g.player;
    g.time += dt; g.stageTime += dt;
    p.walk += dt * 8;
    p.fireCd -= dt; p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    p.novaCd -= dt;
    const [mx, my] = readMove();
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.x += p.dashX * 700 * dt;
      p.y += p.dashY * 700 * dt;
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
      for (const e of g.enemies) if (distance(e, p) < 260) hurtEnemy(e, 22 + p.nova * 22);
    }
    if (!g.bossSpawned && g.stageTime < 60) {
      g.spawnCd -= dt;
      if (g.spawnCd <= 0) {
        const interval = Math.max(.23, 1.23 - g.stage * .21 - g.stageTime * .008);
        g.spawnCd += interval;
        spawnRandom();
        if (g.stageTime > 33 && Math.random() < .35) spawnRandom();
      }
    }
    if (!g.bossSpawned && g.stageTime >= 60) spawnBoss();

    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      if (e.hp <= 0) { g.enemies.splice(i, 1); continue; }
      e.phase += dt * 3.2; e.hitFx = Math.max(0, e.hitFx - dt);
      e.slow = Math.max(0, e.slow - dt); e.orbitHit = Math.max(0, e.orbitHit - dt);
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.max(1, Math.hypot(dx, dy));
      let move = 1;
      if (e.type === "archer") move = dist < 185 ? -.45 : dist < 265 ? .13 : .82;
      if (e.type === "boss") move = dist < 135 ? .15 : 1;
      const slowness = e.slow > 0 ? .55 : 1;
      const weave = e.type === "runner" ? Math.sin(e.phase * 1.7) * 26 : 0;
      e.x += ((dx / dist * e.speed * move) + (-dy / dist * weave)) * slowness * dt;
      e.y += ((dy / dist * e.speed * move) + (dx / dist * weave)) * slowness * dt;
      e.cd -= dt;
      if (e.type === "archer" && e.cd <= 0 && dist < 550) {
        e.cd = rand(2.1, 3);
        const speed = 170 + g.stage * 25;
        g.hostile.push({ x: e.x, y: e.y, vx: dx / dist * speed, vy: dy / dist * speed, r: 6, life: 4, damage: 12 + g.stage * 3 });
        ring(e.x, e.y, 25, "#ffaad8", .38);
      }
      if (e.type === "boss" && e.cd <= 0 && dist < 750) {
        e.cd = Math.max(2, 3.3 - g.stage * .35);
        const n = 9 + g.stage * 3;
        for (let j = 0; j < n; j++) {
          const a = j / n * TWO + clock * .22, speed = 115 + g.stage * 16;
          g.hostile.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6, life: 4.6, damage: 13 + g.stage * 2 });
        }
        ring(e.x, e.y, 125, "#ffabbf", .65);
        burst(e.x, e.y, 13, "#ffc2c6", .6);
      }
      if (dist < p.r + e.radius - 3) hurtPlayer(e.damage, e.x, e.y);
      if (p.orbit && e.orbitHit === 0) {
        for (let j = 0; j < p.orbit; j++) {
          const a = clock * 2.25 + j * TWO / p.orbit, r = 64;
          const ox = p.x + Math.cos(a) * r, oy = p.y + Math.sin(a) * r;
          if ((e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.radius + 12) ** 2) {
            e.orbitHit = .45;
            hurtEnemy(e, 13 + p.damage * .42, ox, oy);
            break;
          }
        }
      }
    }

    for (let i = g.shots.length - 1; i >= 0; i--) {
      const s = g.shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let hit = false;
      for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < (e.radius + s.r) ** 2) {
          hurtEnemy(e, s.damage, s.x, s.y);
          if (s.slow) e.slow = 1.2 + .65 * s.slow;
          hit = true; break;
        }
      }
      if (hit || s.life <= 0) g.shots.splice(i, 1);
    }
    for (let i = g.hostile.length - 1; i >= 0; i--) {
      const s = g.hostile[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < (p.r + s.r) ** 2) {
        hurtPlayer(s.damage, s.x, s.y); g.hostile.splice(i, 1);
      } else if (s.life <= 0) g.hostile.splice(i, 1);
    }
    for (let i = g.orbs.length - 1; i >= 0; i--) {
      const o = g.orbs[i];
      o.phase += dt * 4;
      const dx = p.x - o.x, dy = p.y - o.y, dist = Math.max(1, Math.hypot(dx, dy));
      if (dist < p.magnet) {
        const speed = clamp((p.magnet - dist) * 3.6, 140, 800);
        o.x += dx / dist * speed * dt;
        o.y += dy / dist * speed * dt;
      }
      if (dist < p.r + 15) {
        if (o.value < 0) { p.hp = Math.min(p.maxHp, p.hp - o.value); showToast("生命のかけら +20"); }
        else addExp(o.value);
        if (Math.random() < .13) sound("pick");
        burst(o.x, o.y, 3, o.value < 0 ? "#ffa5b2" : themes[g.stage].orb, .2);
        g.orbs.splice(i, 1);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const a = particles[i]; a.ttl -= dt; a.x += a.vx * dt; a.y += a.vy * dt;
      a.vx *= .967; a.vy *= .967;
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
    shake *= .86;
    camX = ease(camX, p.x - W / 2, Math.min(1, dt * 5.8));
    camY = ease(camY, p.y - H / 2, Math.min(1, dt * 5.8));
    g.hudCd -= dt;
    if (g.hudCd <= 0) { updateHud(); g.hudCd = .12; }
    music();
  }

  function updateHud() {
    if (!game) return;
    const g = game, p = g.player;
    ui.hp.style.width = (100 * p.hp / p.maxHp) + "%";
    ui.hpLabel.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    ui.xp.style.width = (100 * clamp(g.xp / expNeed(), 0, 1)) + "%";
    ui.level.textContent = "LV " + g.level;
    ui.kills.textContent = "✧ " + g.kills;
    ui.time.textContent = String(Math.floor(g.stageTime / 60)).padStart(2, "0") + ":" + String(Math.floor(g.stageTime % 60)).padStart(2, "0");
    ui.hint.textContent = g.bossSpawned ? "守護者を浄化せよ" : "守護者まで " + Math.max(0, Math.ceil(60 - g.stageTime)) + " 秒";
    const boss = g.enemies.find(e => e.id === g.bossId);
    if (boss) ui.bossFill.style.width = (100 * Math.max(0, boss.hp) / boss.maxHp) + "%";
    const dashRatio = clamp(p.dashCd / 2.35, 0, 1);
    ui.dashProgress.style.transform = "scaleY(" + dashRatio + ")";
    ui.dash.classList.toggle("recharging", p.dashCd > 0);
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
      const x = (m.x * W + Math.sin(clock * .21 + m.t) * 12 + W) % W, y = (m.y * H + Math.sin(clock * .25 + m.t) * 16 + H) % H;
      const twinkle = .19 + .38 * (Math.sin(clock * m.z + m.t) ** 2);
      ctx.fillStyle = "rgba(213,247,232," + twinkle + ")";
      ctx.beginPath(); ctx.arc(x, y, m.s * .6, 0, TWO); ctx.fill();
    }
  }
  function terrain() {
    const t = themes[game.stage], cell = 132;
    const left = Math.floor(camX / cell) - 1, right = Math.ceil((camX + W) / cell) + 1;
    const top = Math.floor(camY / cell) - 1, bottom = Math.ceil((camY + H) / cell) + 1;
    ctx.strokeStyle = game.stage === 2 ? "rgba(235,188,191,.052)" : "rgba(147,219,205,.06)";
    ctx.lineWidth = 1;
    for (let x = left; x <= right; x++) {
      ctx.beginPath(); ctx.moveTo(x * cell, camY - 160); ctx.lineTo(x * cell, camY + H + 160); ctx.stroke();
    }
    for (let y = top; y <= bottom; y++) {
      ctx.beginPath(); ctx.moveTo(camX - 160, y * cell); ctx.lineTo(camX + W + 160, y * cell); ctx.stroke();
    }
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const seed = hash(x, y);
      if (seed < .43) continue;
      const fx = x * cell + hash(x + 19, y + 4) * 100 + 14;
      const fy = y * cell + hash(x + 4, y + 81) * 100 + 14;
      const size = 2 + seed * 3;
      ctx.globalAlpha = .11 + seed * .12;
      ctx.strokeStyle = t.accent; ctx.fillStyle = t.accent; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.arc(fx, fy, size * 2.5, 0, TWO); ctx.stroke();
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI / 2 + clock * .035;
        ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * size * 2, fy + Math.sin(a) * size * 2, size * 1.1, size * .44, a, 0, TWO); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(fx, fy, 1.1, 0, TWO); ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    const base = e.type === "runner" ? "#ffb6ca" : e.type === "brute" ? "#c4ace4" : e.type === "archer" ? "#c5c1fd" : isBoss ? "#ff9ac1" : "#78b4bb";
    ctx.shadowColor = base; ctx.shadowBlur = isBoss ? 28 : 12;
    if (isBoss) {
      for (let j = 0; j < 10; j++) {
        const a = j / 10 * TWO + clock * .17;
        ctx.fillStyle = j % 2 ? "rgba(238,132,180,.55)" : "rgba(176,142,213,.55)";
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * .92, Math.sin(a) * r * .92, r * .55, r * .2, a, 0, TWO); ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,218,234,.62)"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, TWO); ctx.stroke();
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
    }
    ctx.fillStyle = e.hitFx > 0 ? "#fffef1" : base;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.14);
    ctx.bezierCurveTo(r * 1.1, -r * .7, r * 1.1, r * 1.06, 0, r * .92);
    ctx.bezierCurveTo(-r * .95, r * 1.08, -r * 1.1, -r * .7, 0, -r * 1.14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isBoss ? "#42243b" : "#173145";
    ctx.beginPath();
    ctx.ellipse(-r * .3, 0, r * .1 + 1, r * .2 + 1, -.2, 0, TWO);
    ctx.ellipse(r * .3, 0, r * .1 + 1, r * .2 + 1, .2, 0, TWO);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,248,229,.28)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 0, r * .7, Math.PI * 1.03, Math.PI * 1.93); ctx.stroke();
    ctx.restore();
    if (e.type === "brute" && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,6,20,.5)"; ctx.fillRect(e.x - 17, e.y - r - 12, 34, 3);
      ctx.fillStyle = t.orb; ctx.fillRect(e.x - 17, e.y - r - 12, 34 * (e.hp / e.maxHp), 3);
    }
  }
  function drawGame() {
    const g = game, p = g.player, theme = themes[g.stage];
    ctx.save();
    const wobbleX = shake > .1 ? rand(-shake, shake) : 0, wobbleY = shake > .1 ? rand(-shake, shake) : 0;
    ctx.translate(-camX + wobbleX, -camY + wobbleY);
    terrain();
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
    for (const e of g.enemies) if (e.hp > 0) drawEnemy(e);
    for (const s of g.shots) {
      ctx.strokeStyle = "rgba(138,241,212,.47)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x - s.vx * .036, s.y - s.vy * .036); ctx.lineTo(s.x, s.y); ctx.stroke();
      orbShape(s.x, s.y, s.r, "#edffe2", Math.atan2(s.vy, s.vx));
    }
    for (const s of g.hostile) {
      ctx.shadowColor = "#ff96d1"; ctx.shadowBlur = 14;
      ctx.fillStyle = "#eea4d7"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + Math.sin(clock * 7) * .8, 0, TWO); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff1f1";
      ctx.beginPath(); ctx.arc(s.x - 1, s.y - 1, 1.8, 0, TWO); ctx.fill();
    }
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
    if (g.bossSpawned) {
      ctx.fillStyle = "rgba(226,128,164," + (.045 + .03 * Math.sin(clock * 2)) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }
  function drawHome() {
    const cx = W * .5, cy = H * .32;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * .66);
    glow.addColorStop(0, "rgba(182,249,218,.20)"); glow.addColorStop(.3, "rgba(94,192,193,.09)"); glow.addColorStop(1, "rgba(96,167,200,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(cx, cy);
    ctx.rotate(clock * .06);
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
  function frame(now) {
    if (!last) last = now;
    const dt = clamp((now - last) / 1000, 0, .034);
    last = now; clock += dt;
    if (scene === "playing" && game) update(dt);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    background();
    if (game) drawGame(); else drawHome();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();