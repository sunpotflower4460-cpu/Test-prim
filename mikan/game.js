/* 蜜柑の夜。落下は phys.js、晩の文章は levels.js。 */
(function () {
  "use strict";
  const P = window.Mikan;
  const book = window.MikanLevels;
  const $ = id => document.getElementById(id);
  const canvas = $("kotatsu");
  const ctx = canvas.getContext("2d");
  const SAVE = "mikan-grok-v1";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const view = { w: 1, h: 1, dpr: 1, ox: 0, oy: 0, scale: 1 };
  let save = load();
  let soundOn = save.sound !== false;
  let viewName = "title";
  let level = null;
  let drops = [];
  let bodies = [];
  let time = 0;
  let aim = 180;
  let falling = false;
  let budget = 0;
  let settled = false;
  let last = 0;
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
      audio.master.gain.value = 0.16;
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
    [174, 220].forEach((freq, index) => {
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      amp.gain.value = index ? 0.01 : 0.016;
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
    toast.timer = setTimeout(() => el.classList.remove("show"), 1500);
  }

  function show(name) {
    viewName = name;
    $("app").dataset.view = name;
    ["title", "map", "play"].forEach(id => { $(id).hidden = id !== name; });
    if (name !== "play") { falling = false; bed(false); }
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
    const n = book.levels.filter(night => save.cleared[night.id]).length;
    $("titleRecord").textContent = n ? "過ごした晩 " + n + " / " + book.levels.length : "まだ、どの晩も寒い。";
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
    const n = book.levels.filter(night => save.cleared[night.id]).length;
    $("mapProgress").textContent = "過ごした晩 " + n + " / " + book.levels.length;
    const list = $("nightList");
    list.innerHTML = "";
    book.levels.forEach((night, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "night" + (save.cleared[night.id] ? " done" : "") + (unlocked(index) ? "" : " locked");
      btn.disabled = !unlocked(index);
      btn.innerHTML = '<span class="no">' + String(index + 1).padStart(2, "0") + '</span><span><b>' + night.name + '</b><small>' + night.goal + " 個、残す</small></span>";
      btn.addEventListener("click", () => startNight(night));
      list.appendChild(btn);
    });
  }

  function startNight(night) {
    level = night;
    drops = [];
    bodies = [];
    time = 0;
    aim = (night.x0 + night.x1) / 2;
    falling = false;
    budget = 0;
    settled = false;
    closeDialog();
    $("nightName").textContent = night.name;
    $("hintLine").textContent = night.hint;
    show("play");
    paintTools();
    bed(true);
  }
  function nextRadius() {
    return level && drops.length < level.queue.length ? level.queue[drops.length] : 0;
  }
  function paintTools() {
    const ready = viewName === "play" && !falling && $("modal").hidden && nextRadius() > 0 && !settled;
    $("dropBtn").disabled = !ready;
    $("undoBtn").disabled = !drops.length || falling;
    const left = level ? level.queue.length - drops.length : 0;
    $("remain").textContent = left ? "のこり " + left : "もう、置くものはない";
  }
  function release() {
    const r = nextRadius();
    if (!r || falling || viewName !== "play" || !$("modal").hidden || settled) return;
    const x = clampAim(aim, r);
    aim = x;
    drops.push({ x: x, r: r });
    P.dropBody(bodies, x, r, level);
    falling = true;
    budget = 900;
    tone(520 + r * 4, 0.07, "triangle", 0.04);
    paintTools();
  }
  function clampAim(x, r) {
    const left = level.x0 - level.hang + r;
    const right = level.x1 + level.hang - r;
    return Math.max(left, Math.min(right, x));
  }
  function rewind() {
    if (!drops.length || falling) return;
    drops.pop();
    const again = P.simulate(level, drops);
    bodies = again.bodies;
    time = 0;
    falling = false;
    settled = false;
    paintTools();
    tone(300, 0.06, "sine", 0.03);
  }

  function layout() {
    const rect = $("boardWrap").getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(10, rect.width);
    const h = Math.max(10, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view.w = w; view.h = h; view.dpr = dpr;
    if (!level) return;
    const pad = 16;
    view.scale = Math.min((w - pad * 2) / level.w, (h - pad * 2) / level.h);
    view.ox = (w - level.w * view.scale) / 2;
    view.oy = (h - level.h * view.scale) / 2;
  }
  function toScreen(x, y) { return [view.ox + x * view.scale, view.oy + y * view.scale]; }
  function toWorld(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (view.w / Math.max(1, rect.width));
    return (x - view.ox) / view.scale;
  }

  function drawCloth(segs) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    segs.forEach(seg => {
      if (seg.kind === "floor" || seg.kind === "side") return;
      const a = toScreen(seg.x1, seg.y1), b = toScreen(seg.x2, seg.y2);
      ctx.strokeStyle = seg.kind === "hang" ? "#6e242c" : "#9a343c";
      ctx.lineWidth = Math.max(10, view.scale * (seg.kind === "hang" ? 2.2 : 3.2));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
  }
  function drawFruit(body, ghost) {
    const p = toScreen(body.x, body.y);
    const rad = Math.max(4, body.r * view.scale);
    ctx.save();
    ctx.globalAlpha = ghost ? 0.45 : body.singed ? 0.55 : 1;
    const g = ctx.createRadialGradient(p[0] - rad * 0.35, p[1] - rad * 0.4, rad * 0.15, p[0], p[1], rad);
    g.addColorStop(0, "#ffe0b8");
    g.addColorStop(0.55, "#f08920");
    g.addColorStop(1, "#b84810");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3c7434";
    ctx.beginPath();
    ctx.ellipse(p[0] + rad * 0.05, p[1] - rad * 0.86, rad * 0.34, rad * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (!level) return;
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, "#2a1c16");
    sky.addColorStop(0.55, "#1a120e");
    sky.addColorStop(1, "#24160f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h);

    const segs = P.segments(level, time);
    const floor = segs.filter(seg => seg.kind === "floor")[0];
    const topY = toScreen(0, level.top)[1];
    const floorY = toScreen(0, floor.y1)[1];
    const left = toScreen(level.x0, 0)[0];
    const right = toScreen(level.x1, 0)[0];
    ctx.fillStyle = "#3c4630";
    ctx.fillRect(0, floorY, view.w, view.h - floorY);
    ctx.strokeStyle = "rgba(90, 70, 40, .35)";
    ctx.lineWidth = 1;
    for (let x = 0; x < view.w; x += 28) {
      ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, view.h); ctx.stroke();
    }

    const glow = ctx.createRadialGradient((left + right) / 2, topY + 30, 8, (left + right) / 2, topY + 36, (right - left) * 0.7);
    glow.addColorStop(0, "rgba(255, 170, 70, .55)");
    glow.addColorStop(1, "rgba(255, 140, 40, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(left, topY, right - left, floorY - topY);

    ctx.fillStyle = "#7a4a28";
    const legW = Math.max(6, view.scale * 1.4);
    const thick = level.thick * view.scale;
    ctx.fillRect(left + 8, topY, legW, floorY - topY);
    ctx.fillRect(right - 8 - legW, topY, legW, floorY - topY);
    ctx.fillStyle = "#a86b3c";
    ctx.fillRect(left, topY, right - left, thick);

    drawCloth(segs);

    if (level.bulb) {
      const bulb = toScreen(level.bulb.x, level.bulb.y);
      const br = level.bulb.r * view.scale;
      ctx.strokeStyle = "rgba(232, 208, 170, .7)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bulb[0], bulb[1] - br); ctx.lineTo(bulb[0], toScreen(0, 8)[1]); ctx.stroke();
      ctx.fillStyle = "rgba(255, 214, 150, .9)";
      ctx.beginPath(); ctx.arc(bulb[0], bulb[1], br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255, 236, 200, .8)";
      ctx.stroke();
    }

    bodies.forEach(body => drawFruit(body, false));
    const r = nextRadius();
    if (r && !falling && !settled && $("modal").hidden) {
      const ghostY = level.bulb ? level.bulb.y + level.bulb.r + r + 8 : r + 12;
      drawFruit({ x: clampAim(aim, r), y: ghostY, r: r }, true);
    }
  }

  function judge() {
    const kept = bodies.filter(body => P.onTable(body, level)).length;
    settled = true;
    paintTools();
    if (kept >= level.goal) finish(kept);
    else {
      tone(180, 0.2, "sine", 0.04);
      openDialog(
        '<p class="eyebrow">STILL ON THE FLOOR</p><h2 id="dialogTitle">畳まで、転がった。</h2>' +
        "<p>残ったのは " + kept + " 個。この晩は " + level.goal + " 個、欲しい。</p>" +
        '<button class="primary" id="retryBtn" type="button"><span>この晩をやりなおす</span></button>' +
        '<button class="text" id="failUndo" type="button">一つ戻す</button>'
      );
      $("retryBtn").addEventListener("click", () => startNight(level));
      $("failUndo").addEventListener("click", () => { closeDialog(); settled = false; rewind(); });
    }
  }
  function finish(kept) {
    const first = !save.cleared[level.id];
    save.cleared[level.id] = true;
    persist();
    tone(523, 0.16, "sine", 0.05);
    setTimeout(() => tone(659, 0.2, "sine", 0.05), 90);
    const index = book.levels.findIndex(night => night.id === level.id);
    const next = book.levels[index + 1];
    const actions = next
      ? '<button class="primary" id="letterNext" type="button"><span>つぎの晩へ</span><b>↗</b></button>'
      : '<button class="primary" id="letterEnd" type="button"><span>晩の一覧へ</span><b>↗</b></button>';
    openDialog(
      '<p class="eyebrow">NIGHT ' + String(index + 1).padStart(2, "0") + " · " + (kept || level.goal) + " KEPT</p>" +
      '<h2 id="dialogTitle">' + level.name + "</h2>" +
      "<p>" + level.letter + "</p>" +
      '<p class="from">' + level.from + "</p>" +
      actions +
      '<button class="text" id="letterMap" type="button">晩の一覧</button>'
    );
    const goNext = $("letterNext");
    if (goNext) goNext.addEventListener("click", () => startNight(next));
    const end = $("letterEnd");
    if (end) end.addEventListener("click", () => { closeDialog(); show("map"); });
    $("letterMap").addEventListener("click", () => { closeDialog(); show("map"); });
    if (!first) toast("もう一度、残った");
  }

  function how() {
    openDialog(
      '<p class="eyebrow">HOW TO KEEP THEM</p><h2 id="dialogTitle">あそびかた</h2>' +
      '<div class="rules">' +
      "<div><b>置く</b><span>指で左右を決めて、置く。矢印キーでも動く。</span></div>" +
      "<div><b>天板</b><span>上に乗った蜜柑は、朝まで残る。</span></div>" +
      "<div><b>裾</b><span>天板の外は、布団の裾を転げて畳に落ちる。</span></div>" +
      "<div><b>灯り</b><span>笠に触れた蜜柑は、そこには止まれない。</span></div>" +
      "<div><b>谷</b><span>沈んだ布団は、蜜柑を真ん中へ集める。</span></div>" +
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
      '<p class="eyebrow">PAUSED</p><h2 id="dialogTitle">こたつは、待っている。</h2>' +
      '<button class="primary" id="resumeBtn" type="button"><span>つづける</span></button>' +
      '<button class="text" id="retryPause" type="button">この晩をやりなおす</button>' +
      '<button class="text" id="quitBtn" type="button">晩の一覧</button>'
    );
    $("resumeBtn").addEventListener("click", () => { closeDialog(); viewName = "play"; bed(true); });
    $("retryPause").addEventListener("click", () => startNight(level));
    $("quitBtn").addEventListener("click", () => { closeDialog(); show("map"); });
  }

  canvas.addEventListener("pointerdown", event => {
    if (viewName !== "play" || !level || !$("modal").hidden || settled) return;
    aim = clampAim(toWorld(event.clientX), nextRadius() || 16);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (viewName !== "play" || !level || !event.buttons) return;
    aim = clampAim(toWorld(event.clientX), nextRadius() || 16);
  });
  canvas.addEventListener("pointerup", event => {
    if (viewName !== "play" || falling || settled) return;
    aim = clampAim(toWorld(event.clientX), nextRadius() || 16);
    release();
  });
  canvas.addEventListener("contextmenu", event => { if (event.preventDefault) event.preventDefault(); });

  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    const modalOpen = !$("modal").hidden;
    if (key === "escape") {
      if (modalOpen && viewName === "pause") { closeDialog(); viewName = "play"; bed(true); return; }
      if (modalOpen) { closeDialog(); return; }
      if (viewName === "play") pause();
      return;
    }
    if (modalOpen || viewName !== "play" || event.repeat && key !== "arrowleft" && key !== "arrowright") return;
    if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      const step = event.shiftKey ? 14 : 6;
      aim = clampAim(aim + (key === "arrowright" ? step : -step), nextRadius() || 16);
    } else if ((key === " " || key === "enter") && !event.repeat) {
      event.preventDefault();
      release();
    } else if ((key === "z" || key === "backspace") && !event.repeat) {
      event.preventDefault();
      rewind();
    }
  });
  window.addEventListener("resize", () => { if (viewName === "play") layout(); });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (viewName === "play" && level) {
      const hops = reduce ? 8 : 2;
      if (falling) {
        for (let i = 0; i < hops && budget > 0; i++) {
          P.step(bodies, level, time);
          time += P.DT;
          budget -= 1;
        }
        if (P.asleep(bodies) || budget <= 0) {
          falling = false;
          paintTools();
          if (drops.length === level.queue.length) judge();
        }
      }
      draw();
    }
  }

  $("startBtn").addEventListener("click", () => { ensureAudio(); show("map"); });
  $("howBtn").addEventListener("click", how);
  $("titleSound").addEventListener("click", toggleSound);
  $("mapSound").addEventListener("click", toggleSound);
  $("mapBack").addEventListener("click", () => show("title"));
  $("playBack").addEventListener("click", () => { closeDialog(); show("map"); });
  $("pauseBtn").addEventListener("click", pause);
  $("dropBtn").addEventListener("click", release);
  $("undoBtn").addEventListener("click", rewind);

  window.__mikan = {
    placeSolution() {
      if (!level) return false;
      drops = book.pack(level, level.solution);
      const result = P.simulate(level, drops);
      bodies = result.bodies;
      time = 0;
      falling = false;
      settled = result.ok;
      paintTools();
      if (result.ok) finish(result.kept);
      else judge();
      return result.ok;
    },
    getNight() { return level && level.id; },
    kept() { return bodies.filter(body => level && P.onTable(body, level)).length; }
  };

  refreshTitle();
  paintTools();
  requestAnimationFrame(frame);
})();
