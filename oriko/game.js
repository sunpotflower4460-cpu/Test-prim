/* 折光室。光学は optics.js、室の文章と解答は levels.js。 */
(function () {
  "use strict";
  const O = window.Oriko;
  const book = window.OrikoLevels;
  const $ = id => document.getElementById(id);
  const app = $("app");
  const canvas = $("glass");
  const ctx = canvas.getContext("2d");
  const SAVE = "oriko-grok-v1";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const view = { w: 1, h: 1, dpr: 1, ox: 0, oy: 0, scale: 1 };
  let save = load();
  let soundOn = save.sound !== false;
  let viewName = "title";
  let level = null;
  let placed = [];
  let undo = [];
  let selected = -1;
  let uid = 1;
  let drag = null;
  let moving = null;
  let hold = 0;
  let cleared = false;
  let last = 0;
  let blooms = [];
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
      audio.master.gain.value = 0.18;
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
    amp.gain.setValueAtTime(gain || 0.05, ac.currentTime);
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
    [196, 247].forEach((freq, index) => {
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      amp.gain.value = index ? 0.012 : 0.018;
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
    toast.timer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  function show(name) {
    viewName = name;
    app.dataset.view = name;
    ["title", "map", "play"].forEach(id => { $(id).hidden = id !== name; });
    if (name !== "play") { drag = null; moving = null; hold = 0; bed(false); }
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
    $("titleRecord").textContent = n
      ? "開いた花 " + n + " / " + book.levels.length
      : "まだ、どの花も眠っている。";
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
    else { ensureAudio(); bed(viewName === "play"); tone(440, 0.12, "sine", 0.04); }
    persist();
    paintSound();
  }

  function unlocked(index) {
    return index === 0 || !!save.cleared[book.levels[index - 1].id];
  }
  function renderMap() {
    const n = book.levels.filter(room => save.cleared[room.id]).length;
    $("mapProgress").textContent = "開いた花 " + n + " / " + book.levels.length;
    const list = $("roomList");
    list.innerHTML = "";
    let wing = -1;
    book.levels.forEach((room, index) => {
      if (room.wing !== wing) {
        wing = room.wing;
        const label = document.createElement("p");
        label.className = "wing-label";
        label.textContent = book.wings[wing].name;
        list.appendChild(label);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "room" + (save.cleared[room.id] ? " done" : "") + (unlocked(index) ? "" : " locked");
      btn.disabled = !unlocked(index);
      btn.innerHTML = '<span class="no">' + String(index + 1).padStart(2, "0") + '</span><span><b>' + room.name + '</b><small>' + book.wings[room.wing].en + '</small></span>';
      btn.addEventListener("click", () => startRoom(room));
      list.appendChild(btn);
    });
  }

  function startRoom(room) {
    level = room;
    placed = [];
    undo = [];
    selected = -1;
    uid = 1;
    hold = 0;
    cleared = false;
    blooms = room.plants.map(() => 0);
    closeDialog();
    $("wingName").textContent = book.wings[room.wing].name;
    $("roomName").textContent = room.name;
    $("hintLine").textContent = room.hint;
    const pips = $("moonPips");
    pips.hidden = !room.source.sweep;
    pips.innerHTML = room.source.sweep ? "<i></i><i></i><i></i>" : "";
    show("play");
    renderTray();
    paintTools();
    bed(true);
  }

  function snapshot() { undo.push(JSON.stringify(placed)); if (undo.length > 40) undo.shift(); }
  function renderTray() {
    const tray = $("tray");
    tray.innerHTML = "";
    const used = {};
    placed.forEach(piece => {
      const key = piece.type + ":" + (piece.mask || 0);
      used[key] = (used[key] || 0) + 1;
    });
    const counts = {};
    level.inventory.forEach(item => {
      const key = item.type + ":" + (item.mask || 0);
      counts[key] = counts[key] || { item: item, total: 0 };
      counts[key].total += 1;
    });
    Object.keys(counts).forEach(key => {
      const left = counts[key].total - (used[key] || 0);
      const item = counts[key].item;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "piece-btn";
      btn.disabled = left <= 0;
      btn.innerHTML = O.pieceName(item.type, item.mask) + "<small>のこり " + left + "</small>";
      btn.addEventListener("pointerdown", event => {
        if (left <= 0 || viewName !== "play") return;
        event.preventDefault();
        drag = { type: item.type, mask: item.mask || 0, x: 0, y: 0, pointer: event.pointerId, over: false };
        btn.setPointerCapture(event.pointerId);
      });
      btn.addEventListener("pointermove", event => {
        if (!drag || drag.pointer !== event.pointerId) return;
        const board = toBoard(event.clientX, event.clientY);
        drag.x = board[0]; drag.y = board[1];
        drag.over = inside(board[0], board[1]);
      });
      btn.addEventListener("pointerup", event => {
        if (!drag || drag.pointer !== event.pointerId) return;
        if (drag.over) placeNew(drag.type, drag.mask, drag.x, drag.y);
        drag = null;
      });
      tray.appendChild(btn);
    });
  }
  function inside(x, y) {
    return x > 8 && y > 8 && x < level.w - 8 && y < level.h - 8;
  }
  function snap(n) { return Math.round(n / 2) * 2; }
  function defaultRot(type) { return type === "mirror" ? Math.PI / 4 : 0; }
  function pieceLength(type, mask) {
    const spec = level.inventory.find(item => item.type === type && (item.mask || 0) === mask && item.length);
    if (spec && spec.length) return spec.length;
    const authored = level.solution.find(item => item.type === type && (item.mask || 0) === mask && item.length);
    return authored && authored.length;
  }
  function placeNew(type, mask, x, y) {
    if (!inside(x, y)) { toast("温室の中に置いて"); return; }
    snapshot();
    const piece = { uid: uid++, type: type, mask: mask, x: snap(x), y: snap(y), rot: defaultRot(type) };
    const length = pieceLength(type, mask);
    if (length) piece.length = length;
    placed.push(piece);
    selected = placed.length - 1;
    tone(520, 0.08, "triangle", 0.04);
    renderTray();
    paintTools();
  }
  function paintTools() {
    const on = selected >= 0;
    $("turnLeft").disabled = !on;
    $("turnRight").disabled = !on;
    $("liftBtn").disabled = !on;
    $("undoBtn").disabled = !undo.length;
  }
  function turn(dir) {
    if (selected < 0) return;
    snapshot();
    placed[selected].rot += dir * Math.PI / 12;
    tone(640, 0.05, "sine", 0.03);
    paintTools();
  }
  function lift() {
    if (selected < 0) return;
    snapshot();
    placed.splice(selected, 1);
    selected = -1;
    renderTray();
    paintTools();
  }
  function rewind() {
    if (!undo.length) return;
    placed = JSON.parse(undo.pop());
    selected = -1;
    renderTray();
    paintTools();
  }

  function layout() {
    const wrap = $("boardWrap");
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(10, rect.width);
    const h = Math.max(10, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view.w = w; view.h = h; view.dpr = dpr;
    if (!level) return;
    const pad = 26;
    view.scale = Math.min((w - pad * 2) / level.w, (h - pad * 2) / level.h);
    view.ox = (w - level.w * view.scale) / 2;
    view.oy = (h - level.h * view.scale) / 2;
  }
  function toScreen(x, y) { return [view.ox + x * view.scale, view.oy + y * view.scale]; }
  function toBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (view.w / rect.width);
    const y = (clientY - rect.top) * (view.h / rect.height);
    return [(x - view.ox) / view.scale, (y - view.oy) / view.scale];
  }

  function cssColor(mask, alpha) {
    if (mask === O.WHITE) return "rgba(255,244,220," + alpha + ")";
    const r = (mask & 1) ? 255 : 30;
    const g = (mask & 2) ? 210 : 40;
    const b = (mask & 4) ? 170 : 36;
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  function petal(need) {
    if (need === "r") return "#e07070";
    if (need === "g") return "#7dca8a";
    if (need === "b") return "#79b7e0";
    return "#f0d78a";
  }

  function drawPiece(piece, ghost) {
    const seg = O.segmentOf(piece);
    const a = toScreen(seg.x1, seg.y1);
    const b = toScreen(seg.x2, seg.y2);
    ctx.save();
    ctx.globalAlpha = ghost ? 0.45 : 1;
    ctx.lineCap = "round";
    if (piece.type === "mirror") {
      ctx.strokeStyle = "#e7c27a";
      ctx.lineWidth = Math.max(3, view.scale * 0.7);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,235,.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (piece.type === "dye") {
      ctx.strokeStyle = cssColor(piece.mask, 0.85);
      ctx.lineWidth = Math.max(8, view.scale * 1.4);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else if (piece.type === "split") {
      const c = toScreen(piece.x, piece.y);
      const s = Math.max(8, view.scale * 1.5);
      ctx.fillStyle = "rgba(220,240,255,.85)";
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] - s); ctx.lineTo(c[0] + s * 0.7, c[1]);
      ctx.lineTo(c[0], c[1] + s); ctx.lineTo(c[0] - s * 0.7, c[1]);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (!level) return;
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, "#10241c");
    g.addColorStop(1, "#07140f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    const s0 = toScreen(0, 0), s1 = toScreen(level.w, level.h);
    ctx.strokeStyle = "rgba(214,196,150,.35)";
    ctx.lineWidth = 2;
    roundRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1], 16);
    ctx.stroke();

    ctx.strokeStyle = "rgba(40,28,22,.9)";
    ctx.lineWidth = Math.max(6, view.scale * 1.1);
    ctx.lineCap = "round";
    (level.walls || []).forEach(wall => {
      const a = toScreen(wall.x1, wall.y1), b = toScreen(wall.x2, wall.y2);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });

    const phase = reduce ? 0 : Math.sin(performance.now() / 900);
    const sweep = level.source.sweep || 0;
    const shown = sweep ? phase * sweep : 0;
    const cast = O.trace(level, placed, shown);
    ctx.save();
    ctx.beginPath();
    ctx.rect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]);
    ctx.clip();
    cast.beams.forEach(beam => {
      const a = toScreen(beam.x1, beam.y1), b = toScreen(beam.x2, beam.y2);
      ctx.strokeStyle = cssColor(beam.color, 0.18);
      ctx.lineWidth = Math.max(7, view.scale * 1.3);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = cssColor(beam.color, 0.9);
      ctx.lineWidth = Math.max(1.5, view.scale * 0.28);
      ctx.stroke();
    });
    ctx.restore();

    const moon = toScreen(level.source.x, level.source.y);
    ctx.fillStyle = "#f6f1e4";
    ctx.beginPath(); ctx.arc(moon[0] - 16, moon[1], 9, 0, Math.PI * 2); ctx.fill();

    level.plants.forEach((plant, index) => {
      const lit = O.colorOk(plant.need, cast.seen[index]);
      const goal = lit ? 1 : 0;
      blooms[index] = reduce ? goal : blooms[index] + (goal - blooms[index]) * 0.12;
      const p = toScreen(plant.x, plant.y);
      const r = Math.max(7, plant.r * view.scale * 0.55);
      ctx.fillStyle = "#143026";
      ctx.fillRect(p[0] - 1, p[1], 2, r + 8);
      const open = blooms[index];
      ctx.fillStyle = petal(plant.need);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const pr = r * (0.35 + open * 0.85);
        ctx.beginPath();
        ctx.ellipse(p[0] + Math.cos(a) * pr * 0.45, p[1] + Math.sin(a) * pr * 0.45, r * 0.38, r * (0.45 + open * 0.35), a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = open > 0.6 ? "#fff6d8" : "#2a2118";
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.28, 0, Math.PI * 2); ctx.fill();
    });

    placed.forEach((piece, index) => {
      drawPiece(piece, false);
      if (index === selected) {
        const c = toScreen(piece.x, piece.y);
        ctx.strokeStyle = "rgba(255,250,235,.7)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c[0], c[1], 16, 0, Math.PI * 2); ctx.stroke();
      }
    });
    if (drag && drag.over) drawPiece({ type: drag.type, mask: drag.mask, x: snap(drag.x), y: snap(drag.y), rot: defaultRot(drag.type), length: pieceLength(drag.type, drag.mask) }, true);

    if (sweep) {
      const report = O.sampleReport(level, placed);
      const dots = $("moonPips").querySelectorAll("i");
      report.forEach((ok, index) => { if (dots[index]) dots[index].classList.toggle("on", ok); });
    }
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

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (viewName === "play" && level) {
      draw();
      const steady = O.holds(level, placed);
      hold = steady ? hold + dt : 0;
      if (steady && !cleared && hold > 0.65) finishRoom();
    }
  }

  function finishRoom() {
    cleared = true;
    const first = !save.cleared[level.id];
    save.cleared[level.id] = true;
    persist();
    tone(523, 0.18, "sine", 0.05);
    setTimeout(() => tone(659, 0.22, "sine", 0.05), 90);
    setTimeout(() => tone(784, 0.3, "sine", 0.05), 180);
    const index = book.levels.findIndex(room => room.id === level.id);
    const next = book.levels[index + 1];
    const actions = next
      ? '<button class="primary" id="letterNext" type="button"><span>つぎの室へ</span><b>↗</b></button>'
      : '<button class="primary" id="letterEnd" type="button"><span>室の一覧へ</span><b>↗</b></button>';
    openDialog(
      '<p class="eyebrow">ROOM ' + String(index + 1).padStart(2, "0") + "</p>" +
      '<h2 id="dialogTitle">' + level.name + "</h2>" +
      "<p>" + level.letter + "</p>" +
      '<p class="from">' + level.from + "</p>" +
      actions +
      '<button class="text" id="letterMap" type="button">室の一覧</button>'
    );
    const goNext = $("letterNext");
    if (goNext) goNext.addEventListener("click", () => startRoom(next));
    const end = $("letterEnd");
    if (end) end.addEventListener("click", () => { closeDialog(); show("map"); });
    $("letterMap").addEventListener("click", () => { closeDialog(); show("map"); });
    if (!first) toast("もう一度、灯った");
  }

  function how() {
    openDialog(
      '<p class="eyebrow">HOW THE MOON BENDS</p><h2 id="dialogTitle">あそびかた</h2>' +
      '<div class="rules">' +
      "<div><b>鏡</b><span>光を折る。斜めに向けると、月は向きを変える。</span></div>" +
      "<div><b>紅・翠・青</b><span>その色だけを通す。白い月のままでは、その色の花は開かない。</span></div>" +
      "<div><b>分かつ</b><span>一つの光を、上下二つに分ける。</span></div>" +
      "<div><b>金の花</b><span>染めていない月だけを飲む。</span></div>" +
      "<div><b>月の息</b><span>右上の三つが全部灯るまで、花は起きない。当たった一瞬では足りない。</span></div>" +
      "</div>" +
      '<p>花は光を止めない。壁は止める。戻す、に制限はない。</p>' +
      '<button class="primary" id="howClose" type="button"><span>わかった</span></button>'
    );
    $("howClose").addEventListener("click", closeDialog);
  }
  function pause() {
    if (viewName !== "play" || !$("modal").hidden) return;
    viewName = "pause";
    bed(false);
    openDialog(
      '<p class="eyebrow">PAUSED</p><h2 id="dialogTitle">月は、待っている。</h2>' +
      '<button class="primary" id="resumeBtn" type="button"><span>つづける</span></button>' +
      '<button class="text" id="retryBtn" type="button">この室をやりなおす</button>' +
      '<button class="text" id="quitBtn" type="button">室の一覧</button>'
    );
    $("resumeBtn").addEventListener("click", () => { closeDialog(); viewName = "play"; bed(true); });
    $("retryBtn").addEventListener("click", () => startRoom(level));
    $("quitBtn").addEventListener("click", () => { closeDialog(); show("map"); });
  }

  function distToPiece(piece, x, y) {
    const seg = O.segmentOf(piece);
    const vx = seg.x2 - seg.x1, vy = seg.y2 - seg.y1;
    const len2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - seg.x1) * vx + (y - seg.y1) * vy) / len2));
    return Math.hypot(x - (seg.x1 + vx * t), y - (seg.y1 + vy * t));
  }
  canvas.addEventListener("contextmenu", event => { if (event.preventDefault) event.preventDefault(); });
  canvas.addEventListener("pointerdown", event => {
    if (viewName !== "play" || !level || !$("modal").hidden) return;
    const board = toBoard(event.clientX, event.clientY);
    let found = -1, best = 8;
    placed.forEach((piece, index) => {
      const d = distToPiece(piece, board[0], board[1]);
      if (d < best) { best = d; found = index; }
    });
    selected = found;
    moving = null;
    if (found >= 0) {
      moving = { index: found, pointer: event.pointerId, dirty: false };
      canvas.setPointerCapture(event.pointerId);
    }
    paintTools();
  });
  canvas.addEventListener("pointermove", event => {
    if (!moving || moving.pointer !== event.pointerId || viewName !== "play") return;
    const board = toBoard(event.clientX, event.clientY);
    const piece = placed[moving.index];
    if (!piece) return;
    const x = snap(board[0]), y = snap(board[1]);
    if (!inside(x, y) || (piece.x === x && piece.y === y)) return;
    if (!moving.dirty) { snapshot(); moving.dirty = true; }
    piece.x = x;
    piece.y = y;
    paintTools();
  });
  canvas.addEventListener("pointerup", event => {
    if (!moving || moving.pointer !== event.pointerId) return;
    moving = null;
  });
  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    const modalOpen = !$("modal").hidden;
    if (key === "escape") {
      if (modalOpen && viewName === "pause") { closeDialog(); viewName = "play"; bed(true); return; }
      if (modalOpen) { closeDialog(); return; }
      if (viewName === "play") pause();
      return;
    }
    if (modalOpen || viewName !== "play" || event.repeat) return;
    if (key === "z" || key === "backspace") { event.preventDefault(); rewind(); }
    else if (key === "q" || key === "[") turn(-1);
    else if (key === "e" || key === "r" || key === "]") turn(1);
    else if (selected >= 0 && key.indexOf("arrow") === 0) {
      event.preventDefault();
      const piece = placed[selected];
      const nextX = piece.x + (key === "arrowright" ? 2 : key === "arrowleft" ? -2 : 0);
      const nextY = piece.y + (key === "arrowdown" ? 2 : key === "arrowup" ? -2 : 0);
      if (inside(nextX, nextY)) { snapshot(); piece.x = nextX; piece.y = nextY; paintTools(); }
    }
  });
  window.addEventListener("resize", () => { if (viewName === "play") layout(); });

  $("startBtn").addEventListener("click", () => { ensureAudio(); show("map"); });
  $("howBtn").addEventListener("click", how);
  $("titleSound").addEventListener("click", toggleSound);
  $("mapSound").addEventListener("click", toggleSound);
  $("mapBack").addEventListener("click", () => show("title"));
  $("playBack").addEventListener("click", () => { closeDialog(); show("map"); });
  $("pauseBtn").addEventListener("click", pause);
  $("turnLeft").addEventListener("click", () => turn(-1));
  $("turnRight").addEventListener("click", () => turn(1));
  $("liftBtn").addEventListener("click", lift);
  $("undoBtn").addEventListener("click", rewind);

  window.__oriko = {
    placeSolution() {
      if (!level) return false;
      placed = level.solution.map((piece, index) => Object.assign({ uid: index + 1, mask: piece.mask || 0 }, piece));
      uid = placed.length + 1;
      selected = -1;
      renderTray();
      paintTools();
      return O.holds(level, placed);
    },
    getRoom() { return level && level.id; },
    placedCount() { return placed.length; }
  };

  refreshTitle();
  requestAnimationFrame(frame);
})();
