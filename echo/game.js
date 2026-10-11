"use strict";
/* ECHO — きろくの協力者 / 画面の進行・入力・保存・音
   塔の中核ロジックは sim.js（window.EchoSim）。描画は render.js（window.TowerArt）。 */
(() => {
  const T = window.EchoSim;
  const Art = window.TowerArt;
  const Sound = window.EchoSound;
  const $ = id => document.getElementById(id);
  if (!T || !Art || !Sound || !window.EchoLevels) return;

  const LEVELS = window.EchoLevels.map(spec => T.parseLevel(spec));
  const CHAPTERS = ["第1章 · めざめの階", "第2章 · こだまの階", "第3章 · きろくの階"];
  const STORAGE = "echo-tower-v1";

  /* ---------- 保存と設定 ---------- */
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE) || "null"); } catch (_) {}
  let save = T.cleanSave(raw, LEVELS);
  const persist = () => { try { localStorage.setItem(STORAGE, JSON.stringify(save)); } catch (_) {} };

  /* ---------- 状態 ---------- */
  let scene = "title";
  let index = 0;
  let session = null;
  let busy = false;
  let modalKind = null;
  let focusBefore = null;
  let undoCount = 0;
  let winTimer = 0;
  let toastTimer = 0;
  let announceTimer = 0;

  const sound = new Sound();
  sound.settings(save.sound);
  const motion = () => save.motion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const art = new Art($("tower"));
  art.motion = motion();
  const current = () => LEVELS[index];
  const esc = text => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (save.session) {
    const i = LEVELS.findIndex(l => l.id === save.session.id);
    if (i >= 0) index = i;
  }

  function unlocked(id) {
    const i = LEVELS.findIndex(l => l.id === id);
    if (i <= 0) return true;
    return !!save.records[LEVELS[i - 1].id];
  }
  const clearedCount = () => LEVELS.filter(l => save.records[l.id]).length;
  const starCount = () => Object.values(save.records).reduce((sum, r) => sum + r.stars, 0);
  function nextFloorId() {
    const level = LEVELS.find(l => !save.records[l.id]);
    return level ? level.id : null;
  }
  function nameOf(id) {
    const level = LEVELS.find(l => l.id === id);
    return level ? level.name : "";
  }
  function snapshot() {
    if (!session || session.status !== "running") return null;
    return { id: session.level.id, plans: session.plans.map(plan => plan.slice()) };
  }
  function saveNow() { save.session = snapshot(); persist(); }
  function restoreSession() {
    const data = save.session;
    if (!data) return null;
    const level = LEVELS.find(l => l.id === data.id);
    if (!level) return null;
    const restored = T.createSession(level);
    for (const plan of data.plans) for (const action of plan) T.advance(restored, action);
    return restored.status === "running" ? restored : null;
  }

  /* ---------- アナウンスとトースト ---------- */
  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function announce(text) {
    const el = $("announcement");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- モーダル ---------- */
  function openModal(kind, html) {
    focusBefore = document.activeElement;
    modalKind = kind;
    $("modalCard").innerHTML = html;
    $("modal").hidden = false;
    for (const id of ["title", "floors", "play"]) $(id).inert = true;
    $("modalCard").focus();
    refreshControls();
    sound.scene(current().chapter, false);
  }
  function closeModal() {
    if (!modalKind) return;
    modalKind = null;
    $("modal").hidden = true;
    for (const id of ["title", "floors", "play"]) $(id).inert = false;
    if (focusBefore && focusBefore.isConnected) focusBefore.focus();
    sound.scene(current().chapter, true, session ? session.world.echoes.length : 0);
    refreshControls();
  }
  const closeButton = '<button class="modal-close" data-ui="close" aria-label="閉じる">×</button>';

  function showHelp() {
    if (modalKind) return;
    openModal("help",
      closeButton +
      '<p class="eyebrow">HOW TO CLIMB</p><h2 id="modalTitle">塔の あるきかた</h2>' +
      '<div class="help-grid">' +
      "<p><b>1手</b> うごくと、時間が ひとつ 進む。</p>" +
      "<p>決められた ターン数を使いきると、<b>時間が 巻きもどる</b>。あなたの動きは <b>エコー</b> になって、もう一度 再生される。</p>" +
      "<p>エコーは <b>プレート</b> を 押さえつづけてくれる。扉は、プレートが 押されている間だけ ひらく。</p>" +
      "<p>エコーは 光。重なっても ぶつからない。</p>" +
      "<p>金色の プレートを ぜんぶ おさえて、白い <b>門</b> へ。</p>" +
      "</div>" +
      "<p>WASD / ↑↓←→ 移動 · Space 待つ · Z 1手もどす · R 周をやりなおす · N 時をすすめる · H ヒント</p>" +
      '<div class="modal-actions"><button type="button" data-ui="close" class="wide-primary">わかった</button></div>');
  }

  /* ---------- 画面の切り替え ---------- */
  function setView(next) {
    scene = next;
    $("app").dataset.scene = next;
    $("title").hidden = next !== "title";
    $("floors").hidden = next !== "floors";
    $("play").hidden = next !== "play";
    if (next === "title") updateTitle();
    if (next === "floors") buildFloorGrid();
    if (next === "play") requestAnimationFrame(relayout);
    sound.scene(current().chapter, true, session ? session.world.echoes.length : 0);
  }

  function updateTitle() {
    const done = clearedCount();
    const stopover = save.session && LEVELS.some(l => l.id === save.session.id);
    $("start").firstElementChild.textContent = stopover ? "塔の とちゅうから"
      : done >= LEVELS.length ? "もう一度、塔へ" : done ? "つづきから" : "塔へ のぼる";
    $("titleRecord").textContent = stopover
      ? "第" + save.session.id + "階 · " + nameOf(save.session.id) + " の とちゅう"
      : done ? "のぼった階 " + done + " / " + LEVELS.length + " · ★ " + starCount() + " / " + LEVELS.length * 3
        : "ぜんぶで " + LEVELS.length + "階。1手ずつ、のぼろう。";
  }

  /* ---------- フロア選択 ---------- */
  function buildFloorGrid() {
    const grid = $("floorGrid");
    grid.replaceChildren();
    for (const level of LEVELS) {
      const stars = save.records[level.id] ? save.records[level.id].stars : 0;
      const open = unlocked(level.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "floor-card";
      btn.dataset.chapter = String(level.chapter);
      btn.classList.toggle("locked", !open);
      if (open && level.id === nextFloorId()) btn.classList.add("next");
      btn.innerHTML = '<span class="chap"></span>' +
        '<span class="no">FLOOR <b>' + String(level.id).padStart(2, "0") + "</b></span>" +
        '<span class="nm">' + esc(level.name) + "</span>" +
        '<span class="en">' + esc(level.en) + "</span>" +
        '<span class="stars">' + "★".repeat(stars) + "☆".repeat(3 - stars) + "</span>";
      btn.addEventListener("click", () => {
        sound.unlock();
        if (!unlocked(level.id)) {
          sound.fx("blocked");
          toast("まえの階を クリアすると ひらく");
          return;
        }
        sound.fx("tap");
        startLevel(level.id, false);
      });
      grid.appendChild(btn);
    }
    $("floorsProgress").textContent = "のぼった階 " + clearedCount() + " / " + LEVELS.length + " · ★ " + starCount() + " / " + LEVELS.length * 3;
  }

  /* ---------- プレイ ---------- */
  function startLevel(id, resume) {
    const idx = LEVELS.findIndex(l => l.id === id);
    if (idx < 0) return;
    clearTimeout(winTimer);
    closeModal();
    index = idx;
    const level = current();
    sound.unlock();
    session = resume ? restoreSession() : null;
    if (!session) session = T.createSession(level);
    undoCount = 0;
    save.last = id;
    save.session = snapshot();
    persist();
    art.motion = motion();
    art.resetFx();
    art.setLevel(level);
    setView("play");
    art.setWorld(session.world, true);
    buildTiles();
    relayout();
    refreshHUD();
    announce(level.note);
  }

  function startFromTitle() {
    sound.unlock();
    sound.fx("tap");
    if (save.session && LEVELS.some(l => l.id === save.session.id)) {
      startLevel(save.session.id, true);
      return;
    }
    const next = nextFloorId();
    startLevel(next != null ? next : LEVELS[0].id, false);
  }

  function tileAt(x, y) {
    const level = current();
    if (!level || y < 0 || y >= level.h || x < 0 || x >= level.w) return "";
    return level.tiles[y][x];
  }
  function tileLabel(x, y) {
    const level = current();
    const ch = tileAt(x, y);
    let what = "床";
    if (ch === "D") what = "扉";
    else if (ch === "G") what = "門。めざす場所";
    else if (ch >= "1" && ch <= "4") what = "プレート" + ch;
    return "(" + (x + 1) + ", " + (y + 1) + ") の" + what + "。押すと その方向へ 一歩";
  }

  function buildTiles() {
    const container = $("tileButtons");
    container.replaceChildren();
    const level = current();
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        if (level.tiles[y][x] === "#") continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tile-hit";
        btn.dataset.x = String(x);
        btn.dataset.y = String(y);
        btn.addEventListener("click", () => {
          sound.unlock();
          tileAct(x, y);
        });
        container.append(btn);
      }
    }
    positionTiles();
  }

  function positionTiles() {
    const area = $("boardArea");
    const r = area.getBoundingClientRect();
    const c = art.cell;
    const size = Math.max(30, c * .94);
    for (const btn of $("tileButtons").children) {
      const p = art.pointOf(Number(btn.dataset.x), Number(btn.dataset.y));
      btn.style.left = (p.x - r.left) + "px";
      btn.style.top = (p.y - r.top) + "px";
      btn.style.width = size + "px";
      btn.style.height = size + "px";
    }
  }

  function updateTiles() {
    if (!session) return;
    const active = scene === "play" && !busy && session.status === "running" && !modalKind;
    const player = session.world.player;
    for (const btn of $("tileButtons").children) {
      const x = Number(btn.dataset.x), y = Number(btn.dataset.y);
      const near = Math.abs(x - player.x) + Math.abs(y - player.y) <= 1;
      btn.disabled = !active;
      btn.tabIndex = active && near ? 0 : -1;
      btn.setAttribute("aria-label", tileLabel(x, y));
    }
  }

  function relayout() {
    const area = $("boardArea");
    if (!area) return;
    const r = area.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    art.resize({ left: r.left, top: r.top, width: r.width, height: r.height });
    if (scene === "play" && session) positionTiles();
  }

  function refreshHUD() {
    if (!session) return;
    const level = current();
    const plan = session.plans[session.plans.length - 1];
    const running = session.status === "running";
    $("floorName").textContent = "第" + level.id + "階 · " + level.name;
    $("chapterName").textContent = CHAPTERS[Math.min(level.chapter, CHAPTERS.length - 1)];
    $("boardIndex").textContent = "FLOOR " + String(level.id).padStart(2, "0") + " / " + LEVELS.length;
    $("boardCaption").textContent = level.en;
    $("loopName").textContent = "第" + session.loop + "周";
    $("loopRule").textContent = plan.length + " / " + level.loop + " ターン";
    $("floorNote").textContent = level.note;
    const left = level.loop - plan.length;
    $("loopNext").textContent = !running ? "時間は とじた"
      : session.loop >= level.maxLoops ? "これが 最後の周"
        : "のこり " + left + " ターンで 巻きもどる";
    $("loopDisplay").classList.toggle("final", session.loop >= level.maxLoops);
    $("echoCount").textContent = session.world.echoes.length;
    $("undoCount").textContent = undoCount;
    $("turnCount").textContent = session.totalTurns;
    refreshControls();
    updateTiles();
    sound.scene(level.chapter, true, session.world.echoes.length);
  }

  function refreshControls() {
    if (!session) {
      for (const id of ["undo", "undoAll", "skip", "hint"]) $(id).disabled = true;
      for (const btn of document.querySelectorAll(".dpad button")) btn.disabled = true;
      return;
    }
    const plan = session.plans[session.plans.length - 1];
    const running = session.status === "running";
    const idle = isIdle();
    $("undo").disabled = !(idle && running && plan.length > 0);
    $("undoAll").disabled = !(idle && running && plan.length > 0);
    $("skip").disabled = !(idle && running && plan.length < current().loop);
    $("hint").disabled = !idle;
    for (const btn of document.querySelectorAll(".dpad button")) btn.disabled = !(idle && running);
  }
  const isIdle = () => scene === "play" && !busy && !modalKind;

  /* ---------- ターン ---------- */
  function playEventSound(events) {
    if (events.some(e => e.type === "win")) return sound.fx("win");
    const door = events.find(e => e.type === "door");
    if (door) return sound.fx(door.open ? "door-open" : "door-close");
    const plate = events.find(e => e.type === "plate");
    if (plate) return sound.fx(plate.on ? "plate-on" : "plate-off");
    if (events.some(e => e.type === "stay" && e.blocked)) return sound.fx("blocked");
    const moved = events.find(e => e.type === "move");
    if (moved) return sound.fx(moved.actor === 0 ? "move" : "echo");
  }

  function beginRewind(wait, message) {
    busy = true;
    refreshHUD();
    const delay = motion() ? wait : 60;
    setTimeout(() => {
      busy = false;
      refreshHUD();
      saveNow();
      if (message) announce(message);
    }, delay);
  }

  function act(action) {
    if (!isIdle() || !session || session.status !== "running") return;
    const plan = session.plans[session.plans.length - 1];
    if (plan.length >= current().loop) return;
    const events = T.advance(session, action);
    if (!events) return;
    const flags = art.handle(events);
    playEventSound(events);
    if (flags.rewind) {
      art.setWorld(session.world, true);
      beginRewind(850, "時間が 巻きもどった。エコー " + session.world.echoes.length + "人。");
      return;
    }
    art.setWorld(session.world, false);
    if (flags.win) { finish(); return; }
    if (session.status === "exhausted") { exhaust(); return; }
    refreshHUD();
    saveNow();
  }

  function undo(all) {
    if (!isIdle() || !session || session.status !== "running") return;
    const plan = session.plans[session.plans.length - 1];
    if (!plan.length) {
      sound.fx("blocked");
      toast("この周は まだ 1手も ない");
      return;
    }
    const removed = all ? plan.length : 1;
    T.undo(session, all);
    undoCount += removed;
    for (const actor of [session.world.player, ...session.world.echoes]) {
      const p = art.pointOf(actor.x, actor.y);
      art.spark(p.x, p.y, "#9cc4ff", art.cell * .8, .5, 2);
    }
    art.setWorld(session.world, true);
    sound.fx("undo");
    refreshHUD();
    saveNow();
    announce(all ? "この周を、はじめから。" : "1手 もどした。");
  }

  function skipForward() {
    if (!isIdle() || !session || session.status !== "running") return;
    const plan = session.plans[session.plans.length - 1];
    if (plan.length >= current().loop) return;
    const events = T.skipLoop(session);
    if (!events) return;
    const flags = art.handle(events);
    sound.fx(flags.rewind ? "rewind" : "skip");
    art.setWorld(session.world, true);
    if (flags.rewind) {
      beginRewind(850, "時間が 巻きもどった。");
      return;
    }
    refreshHUD();
    saveNow();
  }

  function finish() {
    const level = current();
    const stars = T.starsFor(level, session.loop);
    const prev = save.records[level.id];
    if (!prev || stars > prev.stars || (stars === prev.stars && session.loop < prev.loop)) {
      save.records[level.id] = { stars, loop: session.loop };
    }
    save.session = null;
    saveNow();
    art.celebrate();
    sound.fx("win");
    clearTimeout(winTimer);
    winTimer = setTimeout(() => openResult(stars), motion() ? 1150 : 200);
  }

  function openResult(stars) {
    const level = current();
    const next = nextFloorId();
    openModal("result",
      '<p class="eyebrow">FLOOR CLEARED</p>' +
      '<h2 id="modalTitle">きろく された。</h2>' +
      '<p class="result-stars">' + "★".repeat(stars) + "☆".repeat(3 - stars) + "</p>" +
      '<p class="result-line">第' + level.id + '階 · ' + session.loop + "周で クリア · 手数 " + session.totalTurns + "</p>" +
      "<p>過去のあなたが、扉を ひらいた。</p>" +
      '<div class="modal-actions">' +
      (next != null ? '<button type="button" data-ui="next" class="wide-primary">つぎの階へ（第' + next + "階）</button>" : "") +
      '<button type="button" data-ui="retry"' + (next == null ? ' class="wide-primary"' : "") + ">この階を もう一度</button>" +
      '<button type="button" data-ui="floors">フロアを えらぶ</button>' +
      "</div>");
  }

  function exhaust() {
    save.session = null;
    persist();
    sound.fx("lose");
    const level = current();
    clearTimeout(winTimer);
    winTimer = setTimeout(() => openModal("result",
      '<p class="eyebrow">TIME OVER</p>' +
      '<h2 id="modalTitle">時間が とじた。</h2>' +
      "<p>周を 使いきった。ちがう 順番を ためそう。<br>エコーは、あなたの 歩いた とおりに 動く。</p>" +
      '<div class="modal-actions">' +
      '<button type="button" data-ui="retry" class="wide-primary">第' + level.id + "階を もう一度</button>" +
      '<button type="button" data-ui="floors">フロアを えらぶ</button>' +
      "</div>"), motion() ? 700 : 150);
  }

  function showHint() {
    if (modalKind || busy) return;
    const level = current();
    openModal("hint",
      closeButton +
      '<p class="eyebrow">A LITTLE HELP</p>' +
      '<h2 id="modalTitle">第' + level.id + "階 " + esc(level.name) + "</h2>" +
      "<p>" + esc(level.hint) + "</p>" +
      '<p style="opacity:.75">' + esc(level.note) + "</p>" +
      '<div class="modal-actions"><button type="button" data-ui="close" class="wide-primary">わかった</button></div>');
  }

  /* ---------- 入力 ---------- */
  function tileAct(x, y) {
    if (!isIdle() || !session || session.status !== "running") return;
    const player = session.world.player;
    const dx = x - player.x, dy = y - player.y;
    if (dx === 0 && dy === 0) { act("wait"); return; }
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    act(dx === 1 ? "right" : dx === -1 ? "left" : dy === 1 ? "down" : "up");
  }

  function toggleSound() {
    save.sound = !save.sound;
    sound.settings(save.sound);
    persist();
    for (const id of ["titleSound", "floorsSound", "playSound"]) {
      const el = $(id);
      if (el) el.classList.toggle("off", !save.sound);
    }
    sound.unlock();
    toast(save.sound ? "音を いれた" : "音を けした");
  }

  function wire() {
    $("start").addEventListener("click", startFromTitle);
    $("openFloors").addEventListener("click", () => { sound.unlock(); sound.fx("tap"); closeModal(); setView("floors"); });
    $("floorsBack").addEventListener("click", () => { sound.fx("tap"); setView("title"); });
    $("playBack").addEventListener("click", () => { sound.fx("tap"); closeModal(); setView("floors"); });
    $("playHelp").addEventListener("click", () => { sound.fx("tap"); showHelp(); });
    for (const id of ["titleSound", "floorsSound", "playSound"]) $(id).addEventListener("click", toggleSound);
    for (const btn of document.querySelectorAll(".dpad button")) {
      btn.addEventListener("click", () => { sound.unlock(); act(btn.dataset.action); });
    }
    $("undo").addEventListener("click", () => undo(false));
    $("undoAll").addEventListener("click", () => undo(true));
    $("skip").addEventListener("click", skipForward);
    $("hint").addEventListener("click", showHint);

    $("modalCard").addEventListener("click", event => {
      const btn = event.target.closest("[data-ui]");
      if (!btn) return;
      const ui = btn.dataset.ui;
      sound.fx("tap");
      if (ui === "close") { closeModal(); return; }
      if (ui === "next") {
        const next = nextFloorId();
        closeModal();
        if (next != null) startLevel(next, false);
        else setView("floors");
        return;
      }
      if (ui === "retry") {
        const id = session ? session.level.id : current().id;
        closeModal();
        startLevel(id, false);
        return;
      }
      if (ui === "floors") { closeModal(); setView("floors"); }
    });
    $("modal").addEventListener("click", event => {
      if (event.target === $("modal") && (modalKind === "help" || modalKind === "hint")) closeModal();
    });

    window.addEventListener("keydown", event => {
      if (event.defaultPrevented) return;
      const key = (event.key || "").toLowerCase();
      if (key === "escape") {
        event.preventDefault();
        if (modalKind) { closeModal(); return; }
        if (scene === "play") { setView("floors"); return; }
        if (scene === "floors") { setView("title"); return; }
        return;
      }
      if (modalKind) {
        if (key === "enter") {
          const primary = $("modalCard").querySelector(".wide-primary");
          if (primary) primary.click();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (scene === "title") {
        if (key === "enter" || key === " ") { event.preventDefault(); startFromTitle(); }
        return;
      }
      if (scene !== "play") return;
      const actions = {
        arrowup: "up", w: "up", arrowdown: "down", s: "down",
        arrowleft: "left", a: "left", arrowright: "right", d: "right",
        " ": "wait"
      };
      if (actions[key]) { event.preventDefault(); sound.unlock(); act(actions[key]); return; }
      if (key === "z") { event.preventDefault(); undo(false); return; }
      if (key === "r") { event.preventDefault(); undo(true); return; }
      if (key === "n") { event.preventDefault(); skipForward(); return; }
      if (key === "h") { event.preventDefault(); showHint(); }
    });

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 80);
    });
    window.addEventListener("orientationchange", () => setTimeout(relayout, 200));
    window.addEventListener("pointerdown", function unlockOnce() {
      sound.unlock();
      sound.scene(current().chapter, true, session ? session.world.echoes.length : 0);
      window.removeEventListener("pointerdown", unlockOnce);
    });
  }

  /* ---------- 起動 ---------- */
  wire();
  for (const id of ["titleSound", "floorsSound", "playSound"]) $(id).classList.toggle("off", !save.sound);
  art.resize();
  updateTitle();
  setView("title");

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
    last = now;
    art.update(dt);
    art.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
