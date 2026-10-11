/* 蛇の蔵。歩みは sim.js、蔵の文章は levels.js。 */
(function () {
  "use strict";
  const H = window.Hebi;
  const book = window.HebiLevels;
  const $ = id => document.getElementById(id);
  const canvas = $("floor");
  const ctx = canvas.getContext("2d");
  const SAVE = "hebi-grok-v1";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const view = { w: 1, h: 1, dpr: 1, ox: 0, oy: 0, cell: 32 };
  let save = load();
  let soundOn = save.sound !== false;
  let viewName = "title";
  let level = null;
  let state = null;
  let history = [];
  let visual = [];
  let won = false;
  let appear = 1;
  let time = 0;
  let last = 0;
  let flash = "";
  const audio = { ctx: null, master: null, bed: [] };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE) || "{}");
      return { cleared: raw.cleared || {}, sound: raw.sound };
    } catch (err) {
      return { cleared: {}, sound: true };
    }
  }
  function persist() {
    save.sound = soundOn;
    try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (err) {}
  }
  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.14;
      audio.master.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return audio.ctx;
  }
  function tone(freq, dur, type, gain) {
    if (!soundOn) return;
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain || 0.04, ac.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(amp); amp.connect(audio.master);
    osc.start(); osc.stop(ac.currentTime + dur + 0.02);
  }
  function bed(on) {
    if (!soundOn || !on) {
      audio.bed.forEach(node => { try { node.stop(); } catch (err) {} });
      audio.bed = [];
      return;
    }
    const ac = ensureAudio();
    if (!ac || audio.bed.length) return;
    [98, 146].forEach((freq, index) => {
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      amp.gain.value = index ? 0.008 : 0.014;
      osc.connect(amp); amp.connect(audio.master);
      osc.start();
      audio.bed.push(osc);
    });
  }
  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 1400);
  }

  function show(name) {
    viewName = name;
    $("app").dataset.view = name;
    ["title", "map", "play"].forEach(id => { $(id).hidden = id !== name; });
    if (name !== "play") bed(false);
    if (name === "title") refreshTitle();
    if (name === "map") renderMap();
    if (name === "play") {
      layout();
      requestAnimationFrame(() => { if (viewName === "play") layout(); });
    }
  }
  function openDialog(html) {
    $("dialog").innerHTML = html;
    $("modal").hidden = false;
    $("dialog").focus();
  }
  function closeDialog() {
    $("modal").hidden = true;
    $("dialog").innerHTML = "";
  }
  function refreshTitle() {
    const n = book.levels.filter(room => save.cleared[room.id]).length;
    $("titleRecord").textContent = n ? "抜けた蔵 " + n + " / " + book.levels.length : "まだ、どの蔵も暗い。";
    paintSound();
  }
  function paintSound() {
    ["titleSound", "mapSound"].forEach(id => {
      const el = $(id);
      if (el) el.style.opacity = soundOn ? "" : ".4";
    });
  }
  function toggleSound() {
    soundOn = !soundOn;
    if (!soundOn) bed(false);
    else { ensureAudio(); bed(viewName === "play"); tone(392, 0.12, "sine", 0.04); }
    persist();
    paintSound();
  }
  function unlocked(index) {
    return index === 0 || !!save.cleared[book.levels[index - 1].id];
  }
  function renderMap() {
    const n = book.levels.filter(room => save.cleared[room.id]).length;
    $("mapProgress").textContent = "抜けた蔵 " + n + " / " + book.levels.length;
    const list = $("vaultList");
    list.innerHTML = "";
    book.levels.forEach((room, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vault" + (save.cleared[room.id] ? " done" : "") + (unlocked(index) ? "" : " locked");
      btn.disabled = !unlocked(index);
      btn.innerHTML = '<span class="no">' + String(index + 1).padStart(2, "0") + '</span><span><b>' + room.name + '</b><small>' + room.note + '</small></span>';
      btn.addEventListener("click", () => startVault(room));
      list.appendChild(btn);
    });
  }

  function startVault(room) {
    level = room;
    state = H.initial(room);
    history = [];
    won = false;
    flash = "";
    appear = reduce ? 1 : 0;
    const tail = state.snake[state.snake.length - 1];
    const before = state.snake[state.snake.length - 2] || tail;
    const dx = tail.x - before.x;
    const dy = tail.y - before.y;
    visual = state.snake.map((part, index) => ({
      x: part.x + dx * (state.snake.length - index) * (reduce ? 0 : 0.2),
      y: part.y + dy * (state.snake.length - index) * (reduce ? 0 : 0.2)
    }));
    closeDialog();
    $("vaultName").textContent = room.name;
    $("hintLine").textContent = room.hint;
    show("play");
    paintTools();
    bed(true);
  }
  function paintTools() {
    const ready = viewName === "play" && $("modal").hidden && !won;
    $("undoBtn").disabled = !history.length || !ready;
    document.querySelectorAll("[data-dir]").forEach(btn => { btn.disabled = !ready; });
    if (!level || !state) {
      $("statusLine").textContent = "胴 0";
      return;
    }
    const seen = level.stones.filter(stone => state.stones[H.key(stone.x, stone.y)]).length;
    $("statusLine").textContent = "胴 " + state.snake.length + "  ·  温石 " + seen + " / " + level.stones.length;
  }
  function refuse(result) {
    const words = {
      wall: "壁がある",
      self: "自分の胴だ",
      dish: "皿には、触れない",
      slit: "まだ、くぐれない",
      short: "もう、抜けられない"
    };
    if (result.reason === "early") {
      const left = level.stones.some(stone => !state.stones[H.key(stone.x, stone.y)]);
      flash = left ? "stones" : "latch";
      toast(left ? "温石が、まだ残っている" : "掛け金の上に、胴がない");
      tone(180, 0.12, "sine", 0.03);
      return;
    }
    flash = result.reason;
    toast(words[result.reason] || "そこには進めない");
    tone(result.reason === "dish" ? 140 : 210, 0.1, "triangle", 0.035);
  }
  function tryMove(dir) {
    if (!level || !state || won || viewName !== "play" || !$("modal").hidden) return;
    const result = H.step(level, state, dir);
    if (result.win) {
      state = result.state;
      visual.length = state.snake.length;
      won = true;
      paintTools();
      tone(520, 0.08, "triangle", 0.04);
      finish();
      return;
    }
    if (!result.ok) {
      refuse(result);
      return;
    }
    history.push(H.copyState(state));
    const shed = result.state.snake.length < state.snake.length;
    state = result.state;
    if (visual.length > state.snake.length) visual.pop();
    while (visual.length < state.snake.length) visual.unshift({ x: visual[0].x, y: visual[0].y });
    flash = "";
    paintTools();
    tone(shed ? 660 : 330, shed ? 0.14 : 0.05, shed ? "sine" : "triangle", shed ? 0.04 : 0.03);
  }
  function undo() {
    if (!history.length || won || viewName !== "play") return;
    state = history.pop();
    visual = state.snake.map(part => ({ x: part.x, y: part.y }));
    flash = "";
    paintTools();
    tone(280, 0.06, "sine", 0.03);
  }

  function layout() {
    const rect = $("boardWrap").getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(10, rect.width);
    const h = Math.max(10, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    if (!level) return;
    const pad = 12;
    view.cell = Math.min((w - pad * 2) / level.w, (h - pad * 2) / level.h);
    view.ox = (w - level.w * view.cell) / 2;
    view.oy = (h - level.h * view.cell) / 2;
  }
  function cellBox(x, y) {
    return [view.ox + x * view.cell, view.oy + y * view.cell, view.cell, view.cell];
  }
  function centerOf(part) {
    return [view.ox + (part.x + 0.5) * view.cell, view.oy + (part.y + 0.5) * view.cell];
  }
  function occupied(x, y) {
    return state.snake.some(part => part.x === x && part.y === y);
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (!level || !state) return;
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, "#1c2428");
    sky.addColorStop(1, "#12161a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h);

    const cell = view.cell;
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        if (level.walls.some(wall => wall.x === x && wall.y === y)) continue;
        const box = cellBox(x, y);
        ctx.fillStyle = (x + y) % 2 ? "#3c342c" : "#342e26";
        ctx.fillRect(box[0], box[1], box[2] + 0.5, box[3] + 0.5);
      }
    }
    ctx.strokeStyle = "rgba(90, 70, 48, .28)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= level.h; y++) {
      ctx.beginPath();
      ctx.moveTo(view.ox, view.oy + y * cell);
      ctx.lineTo(view.ox + level.w * cell, view.oy + y * cell);
      ctx.stroke();
    }

    const door = centerOf(level.exit);
    const moon = ctx.createRadialGradient(door[0], door[1], cell * 0.2, door[0], door[1], cell * 3.4);
    moon.addColorStop(0, "rgba(214, 226, 236, .34)");
    moon.addColorStop(1, "rgba(214, 226, 236, 0)");
    ctx.fillStyle = moon;
    ctx.fillRect(view.ox, view.oy, level.w * cell, level.h * cell);

    level.stones.forEach(stone => {
      const seen = !!state.stones[H.key(stone.x, stone.y)];
      const at = centerOf(stone);
      const pulse = flash === "stones" && !seen ? 0.5 + Math.sin(time * 8) * 0.5 : 0;
      ctx.fillStyle = seen ? "rgba(196, 154, 96, .35)" : "rgba(240, 190, 110, " + (0.28 + pulse * 0.4) + ")";
      ctx.beginPath();
      ctx.arc(at[0], at[1], cell * (0.34 + pulse * 0.06), 0, Math.PI * 2);
      ctx.fill();
      const gravel = ctx.createRadialGradient(at[0] - cell * 0.08, at[1] - cell * 0.1, cell * 0.04, at[0], at[1], cell * 0.22);
      gravel.addColorStop(0, seen ? "#e6d2b0" : "#ffe6bf");
      gravel.addColorStop(1, seen ? "#a07848" : "#e09a45");
      ctx.fillStyle = gravel;
      ctx.beginPath();
      ctx.arc(at[0], at[1], cell * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });

    level.molts.forEach(molt => {
      const at = centerOf(molt);
      const used = !!state.molts[H.key(molt.x, molt.y)];
      ctx.save();
      ctx.translate(at[0], at[1]);
      ctx.strokeStyle = used ? "rgba(232, 236, 228, .8)" : "rgba(210, 220, 206, .45)";
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.beginPath();
      if (used) {
        ctx.moveTo(-cell * 0.22, cell * 0.12);
        ctx.quadraticCurveTo(0, -cell * 0.28, cell * 0.2, cell * 0.02);
        ctx.quadraticCurveTo(cell * 0.08, cell * 0.24, -cell * 0.12, cell * 0.16);
      } else {
        ctx.ellipse(0, 0, cell * 0.24, cell * 0.16, -0.4, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    });

    level.dishes.forEach(dish => {
      const at = centerOf(dish);
      ctx.fillStyle = "rgba(0, 0, 0, .25)";
      ctx.beginPath();
      ctx.ellipse(at[0], at[1] + cell * 0.08, cell * 0.24, cell * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c5ddd4";
      ctx.beginPath();
      ctx.ellipse(at[0], at[1], cell * 0.26, cell * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6f9488";
      ctx.beginPath();
      ctx.ellipse(at[0], at[1], cell * 0.14, cell * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    level.latches.forEach(latch => {
      const at = centerOf(latch);
      const held = occupied(latch.x, latch.y);
      const pulse = flash === "latch" && !held;
      ctx.fillStyle = held ? "#d7c39a" : (pulse ? "#e7d7b0" : "#8d867c");
      ctx.fillRect(at[0] - cell * 0.22, at[1] - cell * 0.05, cell * 0.44, cell * 0.1);
      ctx.fillRect(at[0] - cell * 0.04, at[1] - cell * 0.16, cell * 0.08, cell * 0.16);
    });

    level.slits.forEach(slit => {
      const box = cellBox(slit.x, slit.y);
      ctx.fillStyle = "#0e1216";
      ctx.fillRect(box[0] + cell * 0.38, box[1] + cell * 0.12, cell * 0.24, cell * 0.76);
      ctx.fillStyle = "rgba(210, 224, 236, .55)";
      ctx.fillRect(box[0] + cell * 0.46, box[1] + cell * 0.18, cell * 0.06, cell * 0.64);
    });

    level.walls.forEach(wall => {
      const box = cellBox(wall.x, wall.y);
      ctx.fillStyle = "#1a1714";
      ctx.fillRect(box[0], box[1], box[2] + 0.5, box[3] + 0.5);
      ctx.fillStyle = "rgba(255, 244, 220, .05)";
      ctx.fillRect(box[0], box[1], box[2], Math.max(2, cell * 0.12));
    });

    const exit = cellBox(level.exit.x, level.exit.y);
    ctx.fillStyle = "#d5e0ea";
    ctx.fillRect(exit[0] + cell * 0.18, exit[1] + cell * 0.12, cell * 0.64, cell * 0.76);
    ctx.fillStyle = "#1a1714";
    ctx.fillRect(exit[0] + cell * 0.28, exit[1] + cell * 0.22, cell * 0.44, cell * 0.66);

    drawSnake();
  }

  function drawSnake() {
    const cell = view.cell;
    const posed = visual.map((part, index) => {
      const wobble = reduce ? 0 : Math.sin(time * 1.7 + index * 0.85) * 0.035;
      const prev = visual[Math.max(0, index - 1)];
      const next = visual[Math.min(visual.length - 1, index + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: part.x - (dy / len) * wobble, y: part.y + (dx / len) * wobble };
    });
    const pts = posed.map(centerOf);
    if (pts.length < 2) return;
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let step = 0; step < 7; step++) {
        const t = step / 7;
        samples.push({
          x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
          y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
          u: i + t
        });
      }
    }
    samples.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], u: pts.length - 1 });
    const span = Math.max(1, pts.length - 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, appear));
    for (let i = samples.length - 1; i >= 0; i--) {
      const along = samples[i].u / span;
      const radius = cell * (0.32 - along * 0.14);
      ctx.fillStyle = "rgba(0, 0, 0, .2)";
      ctx.beginPath();
      ctx.arc(samples[i].x + cell * 0.04, samples[i].y + cell * 0.07, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = samples.length - 1; i >= 0; i--) {
      const along = samples[i].u / span;
      const radius = cell * (0.32 - along * 0.14);
      ctx.fillStyle = "#5d7268";
      ctx.beginPath();
      ctx.arc(samples[i].x, samples[i].y, radius + 1.1, 0, Math.PI * 2);
      ctx.fill();
      const shade = ctx.createRadialGradient(
        samples[i].x - radius * 0.35, samples[i].y - radius * 0.45, radius * 0.08,
        samples[i].x, samples[i].y, radius
      );
      shade.addColorStop(0, "#f7faf5");
      shade.addColorStop(0.62, "#d5e2d2");
      shade.addColorStop(1, "#8ea496");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(samples[i].x, samples[i].y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(63, 88, 74, .55)";
    ctx.lineWidth = Math.max(1, cell * 0.045);
    for (let i = 3; i < samples.length - 2; i += 3) {
      const sample = samples[i];
      const nxt = samples[Math.min(samples.length - 1, i + 1)];
      let dx = nxt.x - sample.x;
      let dy = nxt.y - sample.y;
      const len = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(-dx / len, dy / len);
      const radius = cell * (0.18 - (sample.u / span) * 0.06);
      ctx.beginPath();
      ctx.arc(sample.x, sample.y, Math.max(2, radius), angle - 0.85, angle + 0.85);
      ctx.stroke();
    }
    const head = pts[0];
    const neck = pts[1];
    let fx = head[0] - neck[0];
    let fy = head[1] - neck[1];
    const flen = Math.hypot(fx, fy) || 1;
    fx /= flen;
    fy /= flen;
    ctx.save();
    ctx.translate(head[0] + fx * cell * 0.16, head[1] + fy * cell * 0.16);
    ctx.rotate(Math.atan2(fy, fx));
    ctx.fillStyle = "#5d7268";
    ctx.beginPath();
    ctx.ellipse(0, 0, cell * 0.36, cell * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f8f3";
    ctx.beginPath();
    ctx.ellipse(-cell * 0.02, 0, cell * 0.32, cell * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e7c96a";
    ctx.beginPath();
    ctx.arc(cell * 0.02, -cell * 0.08, cell * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a140f";
    ctx.beginPath();
    ctx.ellipse(cell * 0.035, -cell * 0.08, cell * 0.022, cell * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    const flick = reduce ? true : Math.sin(time * 3.1) > 0.25;
    if (flick) {
      ctx.strokeStyle = "#d24b42";
      ctx.lineWidth = Math.max(1.2, cell * 0.04);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cell * 0.28, 0);
      ctx.lineTo(cell * 0.52, -cell * 0.11);
      ctx.moveTo(cell * 0.28, 0);
      ctx.lineTo(cell * 0.54, cell * 0.09);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  function finish() {
    const first = !save.cleared[level.id];
    save.cleared[level.id] = true;
    persist();
    tone(523, 0.16, "sine", 0.05);
    setTimeout(() => tone(784, 0.22, "sine", 0.045), 110);
    const index = book.levels.findIndex(room => room.id === level.id);
    const next = book.levels[index + 1];
    const actions = next
      ? '<button class="primary" id="letterNext" type="button"><span>つぎの蔵へ</span><b>↗</b></button>'
      : '<button class="primary" id="letterEnd" type="button"><span>蔵の一覧へ</span><b>↗</b></button>';
    openDialog(
      '<p class="eyebrow">ROOM ' + String(index + 1).padStart(2, "0") + "</p>" +
      '<h2 id="dialogTitle">' + level.name + "</h2>" +
      "<p>" + level.letter + "</p>" +
      '<p class="from">' + level.from + "</p>" +
      actions +
      '<button class="text" id="letterMap" type="button">蔵の一覧</button>'
    );
    const goNext = $("letterNext");
    if (goNext) goNext.addEventListener("click", () => startVault(next));
    const end = $("letterEnd");
    if (end) end.addEventListener("click", () => { closeDialog(); show("map"); });
    $("letterMap").addEventListener("click", () => { closeDialog(); show("map"); });
    if (!first) toast("もう一度、抜けた");
  }
  function how() {
    openDialog(
      '<p class="eyebrow">HOW THE SNAKE MOVES</p><h2 id="dialogTitle">あそびかた</h2>' +
      '<div class="rules">' +
      "<div><b>進む</b><span>頭を一マス。矢印か、床を払う。</span></div>" +
      "<div><b>温石</b><span>頭が踏むと灯る。全部踏んでから戸口へ。</span></div>" +
      "<div><b>胴</b><span>自分の胴には進めない。尾がどいたマスには進める。</span></div>" +
      "<div><b>抜け殻</b><span>踏むと、一マス短くなる。</span></div>" +
      "<div><b>割れ目</b><span>長いあいだは、くぐれない。</span></div>" +
      "<div><b>皿</b><span>触れると、そのマスには進めない。</span></div>" +
      "<div><b>掛け金</b><span>頭が戸口に入るとき、胴がその上にある。</span></div>" +
      "</div>" +
      '<p>戻す、に制限はない。急がなくていい。</p>' +
      '<button class="primary" id="howClose" type="button"><span>わかった</span></button>'
    );
    $("howClose").addEventListener("click", closeDialog);
  }
  function pause() {
    if (viewName !== "play" || !$("modal").hidden) return;
    viewName = "pause";
    bed(false);
    openDialog(
      '<p class="eyebrow">PAUSED</p><h2 id="dialogTitle">蛇は、待っている。</h2>' +
      '<button class="primary" id="resumeBtn" type="button"><span>つづける</span></button>' +
      '<button class="text" id="retryPause" type="button">この蔵をやりなおす</button>' +
      '<button class="text" id="quitBtn" type="button">蔵の一覧</button>'
    );
    $("resumeBtn").addEventListener("click", () => { closeDialog(); viewName = "play"; bed(true); paintTools(); });
    $("retryPause").addEventListener("click", () => startVault(level));
    $("quitBtn").addEventListener("click", () => { closeDialog(); show("map"); });
  }

  let swipe = null;
  canvas.addEventListener("pointerdown", event => {
    if (viewName !== "play" || !$("modal").hidden || won) return;
    swipe = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", event => {
    if (!swipe || viewName !== "play") return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.hypot(dx, dy) < 18) return;
    tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U"));
  });
  canvas.addEventListener("contextmenu", event => { if (event.preventDefault) event.preventDefault(); });

  window.addEventListener("keydown", event => {
    const key = event.key;
    const lower = key.toLowerCase();
    const modalOpen = !$("modal").hidden;
    if (key === "Escape") {
      if (modalOpen && viewName === "pause") { closeDialog(); viewName = "play"; bed(true); paintTools(); return; }
      if (modalOpen) { closeDialog(); return; }
      if (viewName === "play") pause();
      return;
    }
    if (modalOpen || viewName !== "play") return;
    const dir = { arrowup: "U", arrowdown: "D", arrowleft: "L", arrowright: "R", w: "U", a: "L", s: "D", d: "R" }[lower];
    if (dir) {
      event.preventDefault();
      tryMove(dir);
    } else if ((lower === "z" || key === "Backspace") && !event.repeat) {
      event.preventDefault();
      undo();
    }
  });
  window.addEventListener("resize", () => { if (viewName === "play" || viewName === "pause") layout(); });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    time += dt;
    if ((viewName === "play" || viewName === "pause") && level && state) {
      const k = reduce ? 1 : Math.min(1, dt * 9);
      state.snake.forEach((part, index) => {
        if (!visual[index]) visual[index] = { x: part.x, y: part.y };
        visual[index].x += (part.x - visual[index].x) * k;
        visual[index].y += (part.y - visual[index].y) * k;
      });
      if (visual.length > state.snake.length) visual.length = state.snake.length;
      if (appear < 1) appear = Math.min(1, appear + dt * 1.4);
      if (viewName === "play" || viewName === "pause") draw();
    }
  }

  $("startBtn").addEventListener("click", () => { ensureAudio(); show("map"); });
  $("howBtn").addEventListener("click", how);
  $("titleSound").addEventListener("click", toggleSound);
  $("mapSound").addEventListener("click", toggleSound);
  $("mapBack").addEventListener("click", () => show("title"));
  $("playBack").addEventListener("click", () => { closeDialog(); show("map"); });
  $("pauseBtn").addEventListener("click", pause);
  $("undoBtn").addEventListener("click", undo);
  document.querySelectorAll("[data-dir]").forEach(btn => {
    btn.addEventListener("click", () => tryMove(btn.dataset.dir));
  });

  window.__hebi = {
    playSolution() {
      if (!level) return false;
      const result = H.play(level, level.solution);
      if (!result.win) return false;
      state = result.state;
      visual = state.snake.map(part => ({ x: part.x, y: part.y }));
      history = [];
      won = true;
      appear = 1;
      paintTools();
      finish();
      return true;
    },
    getRoom() { return level && level.id; }
  };

  refreshTitle();
  paintTools();
  requestAnimationFrame(frame);
})();
