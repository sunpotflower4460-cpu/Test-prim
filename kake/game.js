/* 屋根の駆け。動きは sim.js、屋根の文章は levels.js。 */
(function () {
  "use strict";
  const K = window.Kake;
  const book = window.KakeLevels;
  const $ = id => document.getElementById(id);
  const canvas = $("roof");
  const ctx = canvas.getContext("2d");
  const SAVE = "kake-grok-v1";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STARS = [[30, 28], [80, 64], [140, 22], [210, 48], [280, 18], [360, 70], [430, 30], [520, 54], [610, 20], [700, 46], [790, 26], [880, 62]];

  const view = { w: 1, h: 1, dpr: 1, scale: 1, cam: 0 };
  let save = load();
  let soundOn = save.sound !== false;
  let viewName = "title";
  let level = null;
  let state = null;
  let won = false;
  let hurt = 0;
  let acc = 0;
  let time = 0;
  let last = 0;
  let wasGround = true;
  const held = { left: false, right: false };
  const edge = { jump: false, dash: false };
  const trail = [];
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
    [110, 165].forEach((freq, index) => {
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      amp.gain.value = index ? 0.008 : 0.012;
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
    toast.timer = setTimeout(() => el.classList.remove("show"), 900);
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
    const n = book.levels.filter(roof => save.cleared[roof.id]).length;
    $("titleRecord").textContent = n ? "走った屋根 " + n + " / " + book.levels.length : "まだ、どの屋根も暗い。";
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
    const n = book.levels.filter(roof => save.cleared[roof.id]).length;
    $("mapProgress").textContent = "走った屋根 " + n + " / " + book.levels.length;
    const list = $("roofList");
    list.innerHTML = "";
    book.levels.forEach((roof, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "roof" + (save.cleared[roof.id] ? " done" : "") + (unlocked(index) ? "" : " locked");
      btn.disabled = !unlocked(index);
      btn.innerHTML = '<span class="no">' + String(index + 1).padStart(2, "0") + '</span><span><b>' + roof.name + '</b><small>' + roof.note + '</small></span>';
      btn.addEventListener("click", () => startRoof(roof));
      list.appendChild(btn);
    });
  }

  function startRoof(roof) {
    level = roof;
    state = K.create(roof);
    won = false;
    hurt = 0;
    acc = 0;
    wasGround = true;
    trail.length = 0;
    view.cam = Math.max(0, roof.spawn.x - 80);
    closeDialog();
    $("roofName").textContent = roof.name;
    $("hintLine").textContent = roof.hint;
    show("play");
    paintTools();
    bed(true);
  }
  function paintTools() {
    const ready = viewName === "play" && $("modal").hidden && !won && hurt <= 0;
    ["leftBtn", "rightBtn", "jumpBtn"].forEach(id => { $(id).disabled = !ready; });
    const dash = $("dashBtn");
    dash.disabled = !ready;
    dash.classList.toggle("cool", !!(state && state.dashCd > 0.05));
    $("statusLine").textContent = state && state.dashCd > 0.05 ? "駆 まだ" : "駆 できる";
  }
  function takeInput() {
    const input = {
      left: held.left,
      right: held.right,
      jump: edge.jump,
      dash: edge.dash
    };
    edge.jump = false;
    edge.dash = false;
    return input;
  }
  function failReset() {
    hurt = 0.42;
    acc = 0;
    toast("落ちた");
    tone(120, 0.16, "sine", 0.04);
    paintTools();
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
    view.scale = h / 250;
  }
  function aimCamera() {
    if (!level) return;
    const viewW = view.w / view.scale;
    const max = Math.max(0, level.span - viewW);
    const target = Math.max(0, Math.min(max, state.x - viewW * 0.28));
    view.cam = reduce ? target : view.cam + (target - view.cam) * 0.16;
  }

  function worldX(x) { return (x - view.cam) * view.scale; }
  function worldY(y) { return y * view.scale; }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (!level || !state) return;
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, "#243044");
    sky.addColorStop(0.55, "#1a2230");
    sky.addColorStop(1, "#12161e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = "rgba(232, 238, 246, .8)";
    STARS.forEach(star => {
      const x = (star[0] - view.cam * 0.15) % (view.w + 40);
      ctx.fillRect(x < 0 ? x + view.w : x, star[1] * view.scale * 0.7, 2, 2);
    });
    ctx.fillStyle = "#2a3548";
    for (let i = 0; i < 8; i++) {
      const x = ((i * 150 - view.cam * 0.25) % (view.w + 180)) - 40;
      const h = 90 + (i % 3) * 28;
      ctx.fillRect(x, view.h * 0.62 - h, 108, h);
    }
    ctx.fillStyle = "rgba(214, 224, 238, .85)";
    ctx.beginPath();
    ctx.arc(view.w * 0.78, 36 * view.scale, 16 * view.scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(-view.cam * view.scale, -28 * view.scale);
    ctx.scale(view.scale, view.scale);
    ctx.fillStyle = "#0c1018";
    ctx.fillRect(0, 200, level.span, 140);
    level.solids.forEach(solid => {
      const beam = solid.h < 40;
      ctx.fillStyle = beam ? "#5c4336" : "#3d4a60";
      ctx.fillRect(solid.x, solid.y, solid.w, beam ? solid.h : 46);
      if (beam) {
        ctx.fillStyle = "#8a6854";
        ctx.fillRect(solid.x, solid.y, solid.w, 3);
        ctx.fillStyle = "#3a2a22";
        ctx.fillRect(solid.x, solid.y + solid.h - 3, solid.w, 3);
      }
      if (!beam) {
        ctx.fillStyle = "#8ea0b8";
        ctx.fillRect(solid.x, solid.y, solid.w, 3);
      }
      if (!beam) {
        ctx.strokeStyle = "rgba(18, 22, 32, .45)";
        ctx.lineWidth = 1;
        for (let x = solid.x; x < solid.x + solid.w; x += 16) {
          ctx.beginPath();
          ctx.arc(x + 8, solid.y + 8, 7, Math.PI, 0);
          ctx.stroke();
        }
        ctx.fillStyle = "#2c3548";
        ctx.fillRect(solid.x, solid.y + 18, solid.w, 28);
      }
    });
    level.gates.forEach(gate => {
      const phase = K.gatePhase(gate, state.time);
      const open = phase < gate.open;
      const soon = !open && phase > gate.period - 0.35;
      ctx.fillStyle = soon ? "#e7c9a4" : "#8a6a52";
      ctx.fillRect(gate.x - 4, gate.y, 4, gate.h);
      ctx.fillRect(gate.x + gate.w, gate.y, 4, gate.h);
      if (!open) {
        ctx.fillStyle = "#6e5344";
        const slats = 7;
        for (let i = 0; i < slats; i++) {
          const y = gate.y + 6 + i * ((gate.h - 12) / slats);
          ctx.fillRect(gate.x, y, gate.w, Math.max(4, (gate.h - 12) / slats - 3));
        }
      }
    });
    const goal = level.goal;
    const glow = ctx.createRadialGradient(goal.x, goal.y, 4, goal.x, goal.y, 54);
    glow.addColorStop(0, "rgba(255, 196, 110, .55)");
    glow.addColorStop(1, "rgba(255, 196, 110, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a211c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(goal.x, goal.y - 46);
    ctx.lineTo(goal.x, goal.y - 12);
    ctx.stroke();
    ctx.fillStyle = "#3a2e28";
    ctx.fillRect(goal.x - 12, goal.y - 48, 24, 3);
    ctx.fillStyle = "#f0b15a";
    ctx.beginPath();
    ctx.ellipse(goal.x, goal.y, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff1d0";
    ctx.beginPath();
    ctx.ellipse(goal.x, goal.y + 1, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    state.enemies.forEach(enemy => {
      if (!enemy.alive) return;
      drawBat(enemy);
    });
    drawHare();
    ctx.restore();

    if (hurt > 0) {
      ctx.fillStyle = "rgba(80, 16, 16, " + Math.min(0.35, hurt) + ")";
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function drawBat(enemy) {
    const wing = Math.sin(state.time * 16) * 10;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = "#1a1420";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-22, -12 - wing, -10, 6);
    ctx.quadraticCurveTo(-8, 2, -3, 0);
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(22, -12 - wing, 10, 6);
    ctx.quadraticCurveTo(8, 2, 3, 0);
    ctx.fill();
    ctx.fillStyle = "#3a3044";
    ctx.beginPath();
    ctx.ellipse(0, 1, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0d7c4";
    ctx.beginPath();
    ctx.arc(-2.5, 0, 1, 0, Math.PI * 2);
    ctx.arc(2.5, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHare() {
    trail.forEach((mark, index) => {
      ctx.globalAlpha = (index + 1) / trail.length * 0.35;
      ctx.fillStyle = "#f4efe6";
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y - 14, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = hurt > 0 ? 0.45 : 1;
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.scale(state.facing, 1);
    ctx.fillStyle = "rgba(0, 0, 0, .28)";
    ctx.beginPath();
    ctx.ellipse(0, -2, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const stride = state.ground && Math.abs(state.vx) > 20 ? Math.sin(state.time * 18) : 0;
    ctx.strokeStyle = "#f4efe6";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(-6, -2 + stride * 3);
    ctx.moveTo(3, -8);
    ctx.lineTo(5, -2 - stride * 3);
    ctx.stroke();
    ctx.fillStyle = "#f4efe6";
    ctx.beginPath();
    ctx.ellipse(-1, -16, 11, 7, state.dash > 0 ? -0.2 : 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(9, -20, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, -30, 2, 7, -0.4, 0, Math.PI * 2);
    ctx.ellipse(11, -31, 2, 8, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e7b7b0";
    ctx.beginPath();
    ctx.ellipse(11, -30, 0.8, 4.5, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c140f";
    ctx.beginPath();
    ctx.arc(13, -21, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d25a4a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.quadraticCurveTo(-18, -10 + stride * 2, -16, -6);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function finish() {
    const first = !save.cleared[level.id];
    save.cleared[level.id] = true;
    persist();
    tone(523, 0.14, "sine", 0.05);
    setTimeout(() => tone(784, 0.2, "sine", 0.045), 100);
    const index = book.levels.findIndex(roof => roof.id === level.id);
    const next = book.levels[index + 1];
    const actions = next
      ? '<button class="primary" id="letterNext" type="button"><span>つぎの屋根へ</span><b>↗</b></button>'
      : '<button class="primary" id="letterEnd" type="button"><span>屋根の一覧へ</span><b>↗</b></button>';
    openDialog(
      '<p class="eyebrow">ROOF ' + String(index + 1).padStart(2, "0") + "</p>" +
      '<h2 id="dialogTitle">' + level.name + "</h2>" +
      "<p>" + level.letter + "</p>" +
      '<p class="from">' + level.from + "</p>" +
      actions +
      '<button class="text" id="letterMap" type="button">屋根の一覧</button>'
    );
    const goNext = $("letterNext");
    if (goNext) goNext.addEventListener("click", () => startRoof(next));
    const end = $("letterEnd");
    if (end) end.addEventListener("click", () => { closeDialog(); show("map"); });
    $("letterMap").addEventListener("click", () => { closeDialog(); show("map"); });
    if (!first) toast("もう一度、着いた");
    paintTools();
  }
  function how() {
    openDialog(
      '<p class="eyebrow">HOW TO RUN</p><h2 id="dialogTitle">あそびかた</h2>' +
      '<div class="rules">' +
      "<div><b>走る</b><span>左と右。屋根の上を進む。</span></div>" +
      "<div><b>跳ぶ</b><span>空きの手前で跳ぶ。落ちたら、その屋根の最初へ戻る。</span></div>" +
      "<div><b>駆ける</b><span>一気に前へ出る。羽を突き抜け、開いた戸を抜ける。</span></div>" +
      "<div><b>灯り</b><span>屋根の先の灯りに触れれば、その夜は終わる。</span></div>" +
      "</div>" +
      '<p>落ちても、回数は数えない。もう一度、走ればいい。</p>' +
      '<button class="primary" id="howClose" type="button"><span>わかった</span></button>'
    );
    $("howClose").addEventListener("click", closeDialog);
  }
  function pause() {
    if (viewName !== "play" || !$("modal").hidden) return;
    viewName = "pause";
    bed(false);
    openDialog(
      '<p class="eyebrow">PAUSED</p><h2 id="dialogTitle">屋根は、待っている。</h2>' +
      '<button class="primary" id="resumeBtn" type="button"><span>つづける</span></button>' +
      '<button class="text" id="retryPause" type="button">この屋根をやりなおす</button>' +
      '<button class="text" id="quitBtn" type="button">屋根の一覧</button>'
    );
    $("resumeBtn").addEventListener("click", () => { closeDialog(); viewName = "play"; bed(true); paintTools(); });
    $("retryPause").addEventListener("click", () => startRoof(level));
    $("quitBtn").addEventListener("click", () => { closeDialog(); show("map"); });
  }

  function bindHold(btn) {
    const act = btn.dataset.act;
    const down = event => {
      event.preventDefault();
      if (btn.setPointerCapture) btn.setPointerCapture(event.pointerId);
      if (act === "jump" || act === "dash") edge[act] = true;
      else held[act] = true;
    };
    const up = () => { if (act === "left" || act === "right") held[act] = false; };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }
  document.querySelectorAll("[data-act]").forEach(bindHold);

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
    if (key === "ArrowLeft" || lower === "a") { event.preventDefault(); held.left = true; }
    else if (key === "ArrowRight" || lower === "d") { event.preventDefault(); held.right = true; }
    else if (!event.repeat && (key === " " || key === "ArrowUp" || lower === "z" || lower === "w")) {
      event.preventDefault();
      edge.jump = true;
    } else if (!event.repeat && (key === "Shift" || lower === "x" || lower === "k")) {
      event.preventDefault();
      edge.dash = true;
    }
  });
  window.addEventListener("keyup", event => {
    const key = event.key;
    const lower = key.toLowerCase();
    if (key === "ArrowLeft" || lower === "a") held.left = false;
    if (key === "ArrowRight" || lower === "d") held.right = false;
  });
  window.addEventListener("resize", () => { if (viewName === "play" || viewName === "pause") layout(); });
  window.addEventListener("blur", () => { held.left = false; held.right = false; });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    time += dt;
    const running = (viewName === "play" || viewName === "pause") && level && state;
    if (viewName === "play" && level && state && !won && $("modal").hidden) {
      if (hurt > 0) {
        hurt -= dt;
        if (hurt <= 0) {
          state = K.create(level);
          wasGround = true;
          trail.length = 0;
          paintTools();
        }
      } else {
        acc += dt;
        let guard = 0;
        while (acc >= K.DT && guard < 5) {
          guard += 1;
          acc -= K.DT;
          const before = state.ground;
          const dashing = state.dash > 0;
          const rising = state.vy;
          state = K.step(state, level, takeInput());
          if (!before && state.ground) tone(150, 0.04, "triangle", 0.03);
          if (!dashing && state.dash > 0) tone(210, 0.09, "triangle", 0.035);
          if (rising > -200 && state.vy < -400) tone(520, 0.06, "triangle", 0.035);
          if (state.dash > 0 || Math.abs(state.vx) > 40) {
            trail.push({ x: state.x, y: state.y });
            if (trail.length > 8) trail.shift();
          } else if (trail.length) trail.shift();
          if (state.dead) { failReset(); break; }
          if (state.won) { won = true; finish(); break; }
        }
      }
    }
    if (running) {
      aimCamera();
      draw();
      if (viewName === "play") paintTools();
    }
  }

  $("startBtn").addEventListener("click", () => { ensureAudio(); show("map"); });
  $("howBtn").addEventListener("click", how);
  $("titleSound").addEventListener("click", toggleSound);
  $("mapSound").addEventListener("click", toggleSound);
  $("mapBack").addEventListener("click", () => show("title"));
  $("playBack").addEventListener("click", () => { closeDialog(); show("map"); });
  $("pauseBtn").addEventListener("click", pause);

  window.__kake = {
    playScript() {
      if (!level) return false;
      const result = K.play(level, level.script);
      if (!result.won) return false;
      state = result.state;
      won = true;
      finish();
      return true;
    },
    jump() { edge.jump = true; return true; },
    getRoof() { return level && level.id; },
    x() { return state ? state.x : 0; }
  };

  refreshTitle();
  paintTools();
  requestAnimationFrame(frame);
})();
