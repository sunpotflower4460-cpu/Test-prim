"use strict";
/* 玄人コード（自作ツール） — RELAY ひかりの手順
   画面の描画（アイソメ）・演出・UI・効果音を担当する。
   パズルの中核ロジックは code-sim.js（window.CodeSim）。 */
(() => {
  const sim = window.CodeSim;
  const $ = id => document.getElementById(id);
  const canvas = $("codeWorld");
  if (!sim || !canvas) return;

  const LEVELS = sim.LEVELS;
  const TOTAL_STARS = LEVELS.length * 3;
  const TILE_W = 62, TILE_H = 31, WALL_H = 27;
  const SAVE_KEY = "relay-progress-v1";
  const SOUND_KEY = "relay-sound-v1";

  /* ---------- 進行状況と設定 ---------- */
  let progress = loadProgress();
  let soundOn = loadSound();

  function loadProgress() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === "object" && data.stars && typeof data.stars === "object") {
        return { stars: data.stars };
      }
    } catch (_) {}
    return { stars: {} };
  }
  function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (_) {} }
  function loadSound() { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (_) { return true; } }
  function saveSound() { try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (_) {} }
  function starOf(id) { const n = Number(progress.stars[String(id)] || 0); return n >= 1 && n <= 3 ? n : 0; }
  function unlocked(id) { return id <= 1 || starOf(id - 1) > 0; }
  function totalStars() { return LEVELS.reduce((sum, lv) => sum + starOf(lv.id), 0); }
  function resumeStage() { for (const lv of LEVELS) if (!starOf(lv.id)) return lv.id; return LEVELS.length; }

  /* ---------- 効果音（Web Audio） ---------- */
  let audioCtx = null;
  function audioContext() {
    if (!soundOn) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) { try { audioCtx = new AC(); } catch (_) { return null; } }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  function tone(freq, dur, type, gain, delay) {
    const ctx = audioContext();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain || .03, t0 + .012);
    env.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + .03);
  }
  const SFX = {
    tap() { tone(660, .05, "square", .022); },
    add() { tone(520, .06, "triangle", .03); tone(784, .07, "triangle", .026, .05); },
    del() { tone(320, .09, "triangle", .028); },
    turn() { tone(430, .06, "sine", .024); },
    move() { tone(520, .05, "square", .018); },
    jump() { tone(392, .07, "sine", .03); tone(784, .1, "sine", .026, .06); },
    pick() { tone(880, .07, "triangle", .034); tone(1318, .1, "triangle", .028, .06); },
    bump() { tone(150, .1, "sawtooth", .03); },
    locked() { tone(300, .09, "square", .026); tone(220, .14, "square", .024, .08); },
    run() { tone(700, .07, "square", .024); tone(1046, .1, "square", .024, .07); },
    crash() { tone(240, .28, "sawtooth", .04); tone(130, .4, "square", .034, .08); },
    zap() { tone(1240, .07, "sawtooth", .034); tone(180, .34, "square", .04, .07); },
    win() { [659, 880, 1109, 1318].forEach((f, i) => tone(f, .18, "triangle", .04, i * .11)); },
    star() { tone(1568, .12, "triangle", .032); }
  };

  /* ---------- キャンバスと状態 ---------- */
  const ctx = canvas.getContext("2d");
  let W = 390, H = 800, DPR = 1;
  let mode = "off";           // off | title | select | play
  let current = null;
  let run = null;
  let program = [];
  let rowEls = [];
  let queue = [];
  let executed = 0, totalSteps = 0;
  let running = false;
  let selected = -1;
  let time = 0;
  let bursts = [];
  let labels = [];
  let backdrop = null;
  let toastTimer = 0;
  const view = { zoom: 1, ox: 0, oy: 0 };
  const anim = { beat: null, t: 0, speed: 1, gap: 0, after: null };
  // アイソメ画面での向き（N, E, S, W）の角度
  const SCREEN_ANGLE = [-0.4636, 0.4636, 2.6779, -2.6779];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  function lerpAngle(a, b, p) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * p;
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(240, window.innerWidth);
    H = Math.max(320, window.innerHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildBackdrop();
    if (current && mode === "play") layoutLevel();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 180));

  function buildBackdrop() {
    const dots = [];
    const count = Math.round(Math.min(84, (W * H) / 15000));
    for (let i = 0; i < count; i++) {
      const rx = ((i * 127.1) % 100) / 100;
      const ry = ((i * 311.7) % 100) / 100;
      dots.push({ x: rx * W, y: ry * H, r: .7 + ((i * 53) % 11) / 9, p: (i % 7) * .9 });
    }
    backdrop = dots;
  }

  /* ---------- 画面の切り替え ---------- */
  const screens = { title: $("codeTitle"), select: $("codeSelect"), play: $("codePlay") };
  function isActive() { return document.body.classList.contains("code-active"); }
  function showScreen(name) {
    mode = name;
    for (const key of Object.keys(screens)) screens[key].classList.toggle("hidden", key !== name);
    if (name === "play") {
      layoutLevel();
      requestAnimationFrame(layoutLevel);
    }
  }
  function enterCode() {
    document.body.classList.add("code-active");
    canvas.classList.remove("hidden");
    canvas.setAttribute("aria-hidden", "false");
    refreshTitle();
    showScreen("title");
    resize();
  }
  function exitCode() {
    stopRun(true);
    hideOverlay();
    for (const key of Object.keys(screens)) screens[key].classList.add("hidden");
    mode = "off";
    document.body.classList.remove("code-active");
    canvas.classList.add("hidden");
    canvas.setAttribute("aria-hidden", "true");
  }

  function toast(message) {
    const el = $("codeToast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
  }
  function wiggle(el) {
    if (!el) return;
    el.classList.remove("code-shake");
    void el.offsetWidth;
    el.classList.add("code-shake");
    setTimeout(() => el.classList.remove("code-shake"), 340);
  }
  function later(seconds, fn) { anim.gap = seconds; anim.after = fn; }
  // True while a result card is scheduled. Running the program again inside that
  // gap reset anim.after, so the card was silently discarded.
  let cardPending = false;

  /* ---------- タイトル / ステージ選択 ---------- */
  function refreshTitle() {
    const line = $("codeProgressLine");
    if (line) line.textContent = "★ " + totalStars() + " / " + TOTAL_STARS;
  }
  function buildGrid() {
    const grid = $("codeStageGrid");
    if (!grid || grid.children.length) return;
    for (const level of LEVELS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-stage";
      btn.dataset.id = String(level.id);
      btn.innerHTML = "<strong>" + String(level.id).padStart(2, "0") + "</strong><small>" + level.name + "</small><div class=\"stars\"></div>";
      btn.addEventListener("click", () => {
        if (!unlocked(level.id)) {
          SFX.bump();
          toast("まえの ステージを クリアすると ひらく");
          wiggle(btn);
          return;
        }
        SFX.tap();
        startLevel(level.id);
      });
      grid.appendChild(btn);
    }
  }
  function refreshGrid() {
    buildGrid();
    const next = resumeStage();
    for (const btn of $("codeStageGrid").children) {
      const id = Number(btn.dataset.id);
      const stars = starOf(id);
      const open = unlocked(id);
      btn.classList.toggle("locked", !open);
      btn.classList.toggle("next", open && id === next);
      btn.querySelector(".stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    }
  }

  /* ---------- プレイ画面 ---------- */
  function levelById(id) { return LEVELS.find(lv => lv.id === id) || LEVELS[0]; }

  function startLevel(id) {
    current = levelById(id);
    program = [];
    selected = -1;
    queue = [];
    executed = 0;
    totalSteps = 0;
    running = false;
    bursts = [];
    labels = [];
    anim.beat = null;
    anim.t = 0;
    anim.gap = 0;
    anim.after = null;
    run = sim.createRun(current);
    hideOverlay();
    $("codeStageNo").textContent = "STAGE " + String(current.id).padStart(2, "0");
    $("codeStageName").textContent = current.name;
    $("codeHint").textContent = current.hint;
    buildProgram();
    setRunningUI(false);
    updateMeters();
    showScreen("play");
    resize();
  }

  function stopRun(reset) {
    anim.beat = null;
    anim.t = 0;
    anim.gap = 0;
    anim.after = null;
    queue = [];
    if (running) {
      running = false;
      setRunningUI(false);
      markNow(-1);
    }
    if (reset && current) {
      run = sim.createRun(current);
      executed = 0;
      totalSteps = 0;
      updateMeters();
    }
  }

  function setRunningUI(on) {
    running = on;
    const btn = $("codeRunBtn");
    if (btn) {
      btn.classList.toggle("running", on);
      btn.textContent = on ? "■ とめる" : "▶ 実行";
    }
    for (const key of document.querySelectorAll(".code-key")) key.disabled = on;
    const clear = $("codeClearBtn");
    if (clear) clear.disabled = on || !program.length;
  }

  function updateMeters() {
    if (!current) return;
    const goals = current.grid.cores.length + current.grid.switches.length;
    let done = 0;
    if (run) done = run.cores.filter(c => c.got).length + run.switches.filter(s => s.got).length;
    $("codeMeterGoals").innerHTML = "もくひょう <b>" + done + "</b> / " + goals;
    $("codeMeterSteps").innerHTML = "てじゅん <b>" + (totalSteps ? executed + " / " + totalSteps : "—") + "</b>";
    $("codeMeterPar").innerHTML = "パー <b>" + current.par + "</b> ブロック";
  }

  /* ---------- プログラムの組立 ---------- */
  function rowInfo(token) {
    switch (token.t) {
      case "fwd": return { glyph: "▶", text: "前進" };
      case "jump": return { glyph: "⤒", text: "跳ぶ" };
      case "left": return { glyph: "↺", text: "左折" };
      case "right": return { glyph: "↻", text: "右折" };
      case "wait": return { glyph: "◷", text: "待つ" };
      case "rep": return { glyph: "⟳", text: "繰り返し" };
      case "end": return { glyph: "■", text: "終わり" };
      default: return { glyph: "?", text: "?" };
    }
  }
  function buildProgram() {
    const list = $("codeProgram");
    list.innerHTML = "";
    rowEls = [];
    let depth = 0;
    program.forEach((token, index) => {
      const info = rowInfo(token);
      const rowDepth = token.t === "end" ? Math.max(0, depth - 1) : depth;
      const li = document.createElement("li");
      li.className = "code-row" + (token.t === "rep" ? " rep" : token.t === "end" ? " end" : "") +
        (rowDepth ? " depth" + Math.min(3, rowDepth) : "");
      li.innerHTML = "<span class=\"ln\">" + (index + 1) + "</span>" +
        "<span class=\"glyph\">" + info.glyph + "</span>" +
        "<span class=\"label\">" + info.text + "</span>" +
        (token.t === "rep" ? "<span class=\"meta\">×" + token.n + "</span>" : "");
      li.addEventListener("click", () => onRowTap(index));
      list.appendChild(li);
      rowEls.push(li);
      if (token.t === "rep") depth++;
      else if (token.t === "end") depth = Math.max(0, depth - 1);
    });
    $("codeProgramEmpty").classList.toggle("hidden", program.length > 0);
    $("codeProgramCount").textContent = program.length + " / " + current.slots;
    $("codeClearBtn").disabled = running || program.length === 0;
    refreshSelection();
  }
  function refreshSelection() {
    rowEls.forEach((row, index) => row.classList.toggle("sel", index === selected));
  }
  function onRowTap(index) {
    if (running) return;
    const token = program[index];
    if (!token) return;
    if (token.t === "rep") {
      token.n = token.n >= 9 ? 2 : token.n + 1;
      SFX.add();
      buildProgram();
      toast("繰り返し ×" + token.n);
      return;
    }
    selected = selected === index ? -1 : index;
    refreshSelection();
    SFX.tap();
  }
  function addToken(token) {
    if (running || !current) return;
    if (program.length >= current.slots) {
      SFX.bump();
      toast("これいじょう おけない（" + current.slots + " こまで）");
      return;
    }
    program.push(token);
    selected = program.length - 1;
    SFX.add();
    buildProgram();
    const row = rowEls[rowEls.length - 1];
    scrollProgramTo(row);
  }
  function undoToken() {
    if (running || !current) return;
    const index = selected >= 0 && selected < program.length ? selected : program.length - 1;
    if (index < 0) { SFX.bump(); return; }
    program.splice(index, 1);
    selected = Math.min(index - 1, program.length - 1);
    SFX.del();
    buildProgram();
  }
  function onPalette(act) {
    if (!current) return;
    if (act === "undo") { undoToken(); return; }
    if (act === "rep") { addToken({ t: "rep", n: 2 }); return; }
    if (act === "end") { addToken({ t: "end" }); return; }
    if (act === "fwd" || act === "jump" || act === "left" || act === "right" || act === "wait") addToken({ t: act });
  }
  function scrollProgramTo(row) {
    const wrap = document.querySelector(".code-program-wrap");
    if (!wrap || !row) return;
    const innerTop = row.offsetTop - wrap.offsetTop - wrap.clientTop;
    const target = innerTop - wrap.clientHeight / 2 + row.clientHeight / 2;
    wrap.scrollTop = clamp(target, 0, Math.max(0, wrap.scrollHeight - wrap.clientHeight));
  }
  function markNow(index) {
    for (const row of rowEls) row.classList.remove("now");
    if (index >= 0 && rowEls[index]) {
      rowEls[index].classList.add("now");
      scrollProgramTo(rowEls[index]);
    }
  }
  function programError(info) {
    const messages = {
      empty: "めいれいが からっぽだよ",
      unknown: "つかえない めいれいが ある",
      deep: "繰り返しの 入れ子は 3つまで",
      extraEnd: "■ 終わり に あう ⟳ がない",
      unclosed: "⟳ 繰り返し が とじられていない",
      tooLong: "めいれいが おおすぎて うごかせない"
    };
    toast(messages[info.error] || "プログラムを みなおそう");
    SFX.bump();
    const row = rowEls[clamp(info.index, 0, Math.max(0, rowEls.length - 1))];
    if (row) {
      row.classList.add("bad");
      scrollProgramTo(row);
      setTimeout(() => row.classList.remove("bad"), 1700);
    }
    wiggle(document.querySelector(".code-panel"));
  }

  /* ---------- 実行と演出 ---------- */
  function runProgramUI() {
    if (!current || running || cardPending) return;
    const check = sim.validate(program);
    if (!check.ok) { programError(check); return; }
    const plan = sim.expand(program);
    if (!plan.ok) { programError(plan); return; }
    if (!plan.steps.length) {
      SFX.bump();
      toast("\u306a\u306b\u3082 \u306f\u305f\u3089\u304b\u306a\u3044 \u3081\u3044\u308c\u3044\u3060\u3088\u3002");
      return;
    }
    hideOverlay();
    run = sim.createRun(current);
    queue = plan.steps.slice();
    executed = 0;
    totalSteps = plan.steps.length;
    anim.beat = null;
    anim.gap = 0;
    anim.after = null;
    anim.t = 0;
    bursts = [];
    labels = [];
    setRunningUI(true);
    markNow(-1);
    updateMeters();
    SFX.run();
    startNextBeat();
  }

  function startNextBeat() {
    if (!run || !queue.length) { finishRun(); return; }
    const item = queue.shift();
    const token = item.token;
    const before = run.patrols.map(p => sim.patrolCell(p));
    const from = { x: run.unit.x, y: run.unit.y, dir: run.unit.dir };
    const events = sim.step(run, token);
    const to = { x: run.unit.x, y: run.unit.y, dir: run.unit.dir };
    const after = run.patrols.map(p => sim.patrolCell(p));
    const kind = token.t === "wait" ? "wait" : token.t === "left" || token.t === "right" ? "turn"
      : token.t === "jump" ? "jump" : token.t === "fwd" && (from.x !== to.x || from.y !== to.y) ? "move" : "bump";
    const dur = kind === "wait" ? .44 : kind === "turn" ? .24 : kind === "jump" ? .44 : kind === "move" ? .3 : .28;
    anim.beat = {
      item, token, kind, events, from, to,
      patrolFrom: before, patrolTo: after, dur, phase: 0
    };
    anim.t = 0;
    executed++;
    updateMeters();
    markNow(item.index);
    if (kind === "move") SFX.move();
    else if (kind === "jump") SFX.jump();
    else if (kind === "turn") SFX.turn();
  }

  function updateAnim(dt) {
    if (!anim.beat && anim.gap > 0) {
      anim.gap -= dt;
      if (anim.gap <= 0 && anim.after) {
        const fn = anim.after;
        anim.after = null;
        fn();
      }
    }
    if (anim.beat) {
      const beat = anim.beat;
      anim.t += dt * anim.speed / beat.dur;
      if (beat.phase === 0 && anim.t >= .5) {
        beat.phase = 1;
        for (const event of beat.events) {
          if (event.type === "pick") {
            SFX.pick();
            bursts.push({ x: event.at.x, y: event.at.y, life: .55, max: .55, kind: "pick" });
          } else if (event.type === "bump") {
            SFX.bump();
            addLabel(event.at.x, event.at.y, event.why === "noVault" ? "ここでは とべない" : "かべ！", "#ff9db5");
          } else if (event.type === "locked") {
            SFX.locked();
            addLabel(event.at.x, event.at.y, "ロック中 " + event.done + " / " + event.total, "#ffd479");
          }
        }
      }
      if (anim.t >= 1) {
        anim.beat = null;
        anim.t = 0;
        resolveBeat(beat);
      }
    }
    for (const burst of bursts) burst.life -= dt;
    bursts = bursts.filter(b => b.life > 0);
    for (const label of labels) label.life -= dt;
    labels = labels.filter(l => l.life > 0);
  }

  function resolveBeat(beat) {
    if (!run) return;
    if (run.status === "won") { showWin(); return; }
    if (run.status === "crashed" || run.status === "zapped") { showCrash(); return; }
    if (queue.length) {
      later(anim.speed > 2 ? .04 : .07, startNextBeat);
    } else {
      finishRun();
    }
  }

  function finishRun() {
    setRunningUI(false);
    markNow(-1);
    updateMeters();
    if (run && run.status === "running") {
      SFX.locked();
      toast("めいれいが おわった。ゴールは まだ さき");
      addLabel(run.unit.x, run.unit.y, "ここで おしまい", "#8fb0c6");
    }
  }

  function showCrash() {
    setRunningUI(false);
    cardPending = true;
    const zapped = run.status === "zapped";
    if (zapped) SFX.zap(); else SFX.crash();
    bursts.push({ x: run.unit.x, y: run.unit.y, life: .7, max: .7, kind: zapped ? "zap" : "poof" });
    wiggle(canvas);
    const messages = {
      spike: "とげに ふれて ユニットが こしょうした。となりの とげ は ⤒ 跳ぶ で とびこえられる。",
      pit: "あなに おちてしまった。あな の となりから ⤒ 跳ぶ で むこうがわへ わたろう。",
      patrol: "みはりに みつかってしまった。みはりは 1命令ごとに 1マス うごく。◷ 待つ で タイミングを ずらそう。"
    };
    later(.55, () => {
      showCard({
        kicker: "SYSTEM FAILURE",
        title: "こしょう",
        body: messages[run.reason] || "ユニットが うごけなくなった。",
        buttons: [
          { label: "もういちど（同じプログラム）", primary: true, action() { hideOverlay(); runProgramUI(); } },
          { label: "プログラムを なおす", action() { hideOverlay(); stopRun(true); } }
        ]
      });
    });
  }

  function showWin() {
    setRunningUI(false);
    cardPending = true;
    const blocks = program.length;
    const stars = sim.starsFor(current, blocks);
    if (stars > starOf(current.id)) {
      progress.stars[String(current.id)] = stars;
      saveProgress();
    }
    bursts.push({ x: run.unit.x, y: run.unit.y, life: .8, max: .8, kind: "win" });
    SFX.win();
    const next = LEVELS.find(lv => lv.id === current.id + 1);
    later(.45, () => {
      const buttons = [];
      if (next) {
        buttons.push({ label: "つぎの ステージへ", primary: true, action() { hideOverlay(); refreshGrid(); startLevel(next.id); } });
      } else {
        buttons.push({ label: "タイトルへ もどる", primary: true, action() { hideOverlay(); refreshTitle(); showScreen("title"); } });
      }
      buttons.push({ label: "もういちど あそぶ", action() { hideOverlay(); startLevel(current.id); } });
      buttons.push({ label: "ステージを えらぶ", action() { hideOverlay(); refreshGrid(); showScreen("select"); } });
      const body = next
        ? (stars === 3 ? "かんぺき！ パー いないの ブロックで クリアした。"
          : "クリア！ ブロックを へらすと ★ が ふえる。⟳ 繰り返し を ためそう。")
        : "ぜんステージ クリア！ あつめた ★ は " + totalStars() + " / " + TOTAL_STARS + "。きみは コードの 玄人だ。";
      const card = showCard({
        kicker: "STAGE CLEAR",
        title: "STAGE " + String(current.id).padStart(2, "0") + " — " + current.name,
        stars,
        body,
        stats: [["ブロック", blocks], ["パー", current.par], ["てじゅん", totalSteps]],
        buttons
      });
      const starEls = card.querySelectorAll(".stars-row span");
      for (let i = 0; i < stars; i++) {
        setTimeout(() => {
          if (starEls[i]) { starEls[i].classList.remove("off"); SFX.star(); }
        }, 320 + i * 250);
      }
      refreshGrid();
      refreshTitle();
    });
  }

  function showHelp() {
    showCard({
      kicker: "HOW TO PLAY",
      title: "あそびかた",
      body: "コアと スイッチを ぜんぶ あつめると 出口が ひらく。あな・とげ・みはりに ふれたら こしょう。",
      keys: [
        { glyph: "▶", text: "前進 — むいている ほうへ 1マス すすむ" },
        { glyph: "⤒", text: "跳ぶ — となりの あな・とげ を とびこえて 2マス" },
        { glyph: "↺ ↻", text: "左折・右折 — その場で むきを かえる" },
        { glyph: "◷", text: "待つ — その場で 1命令ぶん まつ。みはりの タイミング調整に" },
        { glyph: "⟳ ■", text: "繰り返し・終わり — あいだの 命令を n 回。⟳ の行を タップで 回数を かえられる" },
        { glyph: "⌫", text: "もどす — えらんだ 行（なければ さいごの行）を けす" }
      ],
      buttons: [{ label: "わかった", primary: true, action: hideOverlay }]
    });
  }

  function showCard(options) {
    const overlay = $("codeOverlay");
    const card = document.createElement("div");
    card.className = "code-card";
    let html = "<div class=\"kicker\">" + options.kicker + "</div>";
    if (options.title) html += "<h2>" + options.title + "</h2>";
    if (typeof options.stars === "number") {
      html += "<div class=\"stars-row\">";
      for (let i = 0; i < 3; i++) html += "<span class=\"off\">★</span>";
      html += "</div>";
    }
    if (options.body) html += "<p>" + options.body + "</p>";
    if (options.stats && options.stats.length) {
      html += "<div class=\"stats-row\">" + options.stats.map(item =>
        "<div><strong>" + item[1] + "</strong>" + item[0] + "</div>").join("") + "</div>";
    }
    if (options.keys && options.keys.length) {
      html += "<div class=\"keys\">" + options.keys.map(key =>
        "<div class=\"keyline\"><i>" + key.glyph + "</i><span>" + key.text + "</span></div>").join("") + "</div>";
    }
    card.innerHTML = html;
    if (options.buttons) {
      const bar = document.createElement("div");
      bar.className = "buttons";
      for (const spec of options.buttons) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = spec.primary ? "go" : "sub";
        btn.textContent = spec.label;
        btn.addEventListener("click", () => { SFX.tap(); spec.action(); });
        bar.appendChild(btn);
      }
      card.appendChild(bar);
    }
    overlay.innerHTML = "";
    overlay.appendChild(card);
    overlay.classList.remove("hidden");
    return card;
  }
  function hideOverlay() { cardPending = false; $("codeOverlay").classList.add("hidden"); }

  function addLabel(x, y, text, color) {
    labels.push({ x, y, text, color: color || "#e8f4ff", life: 1.5, max: 1.5 });
  }

  /* ---------- 描画 ---------- */
  function layoutLevel() {
    if (!current) return;
    const grid = current.grid;
    const hud = document.querySelector(".code-hud");
    const panel = document.querySelector(".code-panel");
    const meters = document.querySelector(".code-meters");
    let top = H * .16, bottom = H * .6;
    if (mode === "play") {
      if (hud) top = hud.getBoundingClientRect().bottom + 34;
      if (meters) top = Math.max(top, meters.getBoundingClientRect().bottom + 8);
      if (panel) bottom = panel.getBoundingClientRect().top - 12;
    }
    if (!(bottom > top + 120)) { top = H * .16; bottom = H * .62; }
    const spanX = (grid.w - 1 + grid.h - 1) * TILE_W / 2 + TILE_W;
    const spanY = (grid.w - 1 + grid.h - 1) * TILE_H / 2 + TILE_H + WALL_H;
    const zoom = clamp(Math.min((W * .94) / spanX, ((bottom - top) * .92) / spanY), .42, 1.45);
    const minX = -(grid.h - 1) * TILE_W / 2 - TILE_W / 2;
    const maxX = (grid.w - 1) * TILE_W / 2 + TILE_W / 2;
    const minY = -WALL_H;
    const maxY = (grid.w - 1 + grid.h - 1) * TILE_H / 2 + TILE_H;
    view.zoom = zoom;
    view.ox = W / 2 - zoom * (minX + maxX) / 2;
    view.oy = (top + bottom) / 2 - zoom * ((minY + maxY) / 2 + TILE_H / 2);
  }

  function cellPos(x, y) {
    const z = view.zoom;
    return {
      x: view.ox + (x - y) * TILE_W * z / 2,
      y: view.oy + (x + y) * TILE_H * z / 2 + TILE_H * z / 2
    };
  }
  function diamondPath(px, py, tw, th) {
    ctx.beginPath();
    ctx.moveTo(px, py - th / 2);
    ctx.lineTo(px + tw / 2, py);
    ctx.lineTo(px, py + th / 2);
    ctx.lineTo(px - tw / 2, py);
    ctx.closePath();
  }
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawBackdrop() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#04070e");
    grad.addColorStop(.55, "#060b16");
    grad.addColorStop(1, "#03060c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    if (backdrop) {
      for (const dot of backdrop) {
        const twinkle = .18 + .18 * (1 + Math.sin(time * .8 + dot.p)) / 2;
        ctx.fillStyle = "rgba(122,215,255," + twinkle.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y - (time * 6 + dot.p * 40) % (H + 60), dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const sweep = (time * 70) % (H + 240);
    const sg = ctx.createLinearGradient(0, sweep - 120, 0, sweep);
    sg.addColorStop(0, "rgba(110,242,168,0)");
    sg.addColorStop(1, "rgba(110,242,168,.045)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, sweep - 120, W, 120);
    const vignette = ctx.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .25, W / 2, H * .45, Math.max(W, H) * .78);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWall(px, py, tw, th, wh) {
    const top = py - wh;
    ctx.beginPath();
    ctx.moveTo(px - tw / 2, py);
    ctx.lineTo(px, py + th / 2);
    ctx.lineTo(px, py + th / 2 - wh);
    ctx.lineTo(px - tw / 2, top);
    ctx.closePath();
    ctx.fillStyle = "#16223a";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px + tw / 2, py);
    ctx.lineTo(px, py + th / 2);
    ctx.lineTo(px, py + th / 2 - wh);
    ctx.lineTo(px + tw / 2, top);
    ctx.closePath();
    ctx.fillStyle = "#0d1626";
    ctx.fill();
    diamondPath(px, top, tw, th);
    ctx.fillStyle = "#233352";
    ctx.fill();
    ctx.strokeStyle = "rgba(122,215,255,.34)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(110,242,168,.16)";
    ctx.beginPath();
    ctx.moveTo(px - tw / 2, py);
    ctx.lineTo(px, py - th / 2 - wh);
    ctx.stroke();
  }

  function drawSpikes(px, py, tw, th) {
    for (let i = -1; i <= 1; i++) {
      const sx = px + i * tw * .17;
      const base = py + th * .13;
      const tip = base - th * .78;
      ctx.beginPath();
      ctx.moveTo(sx - tw * .085, base);
      ctx.lineTo(sx, tip);
      ctx.lineTo(sx + tw * .085, base);
      ctx.closePath();
      const g = ctx.createLinearGradient(sx, tip, sx, base);
      g.addColorStop(0, "#ff9db5");
      g.addColorStop(.45, "#d6e8f5");
      g.addColorStop(1, "#33445f");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,107,138,.4)";
      ctx.lineWidth = .8;
      ctx.stroke();
    }
  }

  function drawSwitch(px, py, tw, th, hit) {
    diamondPath(px, py, tw * .64, th * .64);
    ctx.fillStyle = hit ? "rgba(255,212,121,.5)" : "rgba(52,68,94,.95)";
    ctx.fill();
    ctx.strokeStyle = hit ? "rgba(255,212,121,.9)" : "rgba(160,196,222,.5)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    if (hit) {
      ctx.save();
      ctx.globalAlpha = .35 + .3 * (1 + Math.sin(time * 6)) / 2;
      diamondPath(px, py, tw * .92, th * .92);
      ctx.strokeStyle = "rgba(255,212,121,.85)";
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawExit(px, py, open, tw, th) {
    const z = view.zoom;
    const rise = 26 * z, rx = 15 * z, ry = 19 * z;
    const cy = py - rise;
    ctx.save();
    ctx.strokeStyle = open ? "rgba(110,242,168,.95)" : "rgba(255,212,121,.7)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(px, cy - ry * .3, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(px, cy - ry * .3, rx * .6, ry * .62, 0, 0, Math.PI * 2);
    ctx.fillStyle = open
      ? "rgba(110,242,168," + (.26 + .1 * (1 + Math.sin(time * 3)) / 2).toFixed(3) + ")"
      : "rgba(255,212,121,.12)";
    ctx.fill();
    ctx.strokeStyle = open ? "rgba(110,242,168,.55)" : "rgba(255,212,121,.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(px, py - 2 * z, rx * 1.2, th * .22, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!open) {
      ctx.strokeStyle = "rgba(255,212,121,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - rx * .5, cy - ry * 1.15);
      ctx.lineTo(px + rx * .5, cy - ry * 1.15);
      ctx.stroke();
    }
    ctx.restore();
    if (open) {
      ctx.save();
      ctx.globalAlpha = .35;
      const glow = ctx.createRadialGradient(px, cy - ry * .3, 0, px, cy - ry * .3, rx * 3);
      glow.addColorStop(0, "rgba(110,242,168,.5)");
      glow.addColorStop(1, "rgba(110,242,168,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, cy - ry * .3, rx * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCore(px, py, z) {
    const bob = Math.sin(time * 2.6 + px * .05) * 3 * z;
    const r = 7.4 * z;
    const cy = py - 16 * z + bob;
    const glow = ctx.createRadialGradient(px, cy, 0, px, cy, r * 2.7);
    glow.addColorStop(0, "rgba(255,255,255,.95)");
    glow.addColorStop(.32, "rgba(150,255,222,.7)");
    glow.addColorStop(1, "rgba(110,242,168,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, cy, r * 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2fff9";
    ctx.beginPath();
    ctx.arc(px, cy, r * .56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(122,215,255,.85)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(px, cy, r * 1.2, r * .42, time * 1.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawUnit(px, py, lift, angle) {
    const z = view.zoom;
    const s = 23 * z;
    ctx.fillStyle = "rgba(1,4,10,.45)";
    ctx.beginPath();
    ctx.ellipse(px, py + 3 * z, s * .5, s * .2, 0, 0, Math.PI * 2);
    ctx.fill();
    const cy = py - (lift + 12) * z;
    ctx.save();
    ctx.translate(px, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(s * .52, 0);
    ctx.lineTo(s * .14, -s * .32);
    ctx.lineTo(s * .14, s * .32);
    ctx.closePath();
    ctx.fillStyle = "#6ef2a8";
    ctx.fill();
    ctx.rotate(-angle);
    const g = ctx.createLinearGradient(0, -s * .5, 0, s * .55);
    g.addColorStop(0, "#e6f9ff");
    g.addColorStop(.45, "#93d6f0");
    g.addColorStop(1, "#3f6d94");
    roundRectPath(-s * .42, -s * .46, s * .84, s * .92, s * .22);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(214,247,255,.9)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    roundRectPath(-s * .27, -s * .15, s * .54, s * .3, s * .12);
    ctx.fillStyle = "#0b2338";
    ctx.fill();
    ctx.fillStyle = "rgba(122,215,255,.95)";
    ctx.fillRect(-s * .2, -s * .07, s * .4, s * .11);
    ctx.restore();
  }

  function drawPatrol(px, py, angle) {
    const z = view.zoom;
    const s = 16 * z;
    const cy = py - (16 + Math.sin(time * 3 + px * .04) * 2.4) * z;
    ctx.fillStyle = "rgba(1,4,10,.4)";
    ctx.beginPath();
    ctx.ellipse(px, py + 3 * z, s * .5, s * .2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,107,138,.32)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(px, py, s * 1.5, s * .5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, cy);
    ctx.rotate(Math.PI / 4);
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, "#ffd9e2");
    g.addColorStop(.5, "#ff7d9c");
    g.addColorStop(1, "#7a2338");
    roundRectPath(-s * .55, -s * .55, s * 1.1, s * 1.1, s * .2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,222,232,.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    const ex = px + Math.cos(angle) * s * .34;
    const ey = cy + Math.sin(angle) * s * .34;
    ctx.beginPath();
    ctx.arc(ex, ey, s * .26, 0, Math.PI * 2);
    ctx.fillStyle = "#2a0713";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, s * .14, 0, Math.PI * 2);
    ctx.fillStyle = "#ff8fa8";
    ctx.fill();
  }

  function drawBursts() {
    for (const burst of bursts) {
      const p = 1 - burst.life / burst.max;
      const pos = cellPos(burst.x, burst.y);
      const z = view.zoom;
      ctx.save();
      if (burst.kind === "pick") {
        ctx.strokeStyle = "rgba(110,242,168," + (1 - p).toFixed(3) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y - 16 * z, (8 + p * 26) * z, (5 + p * 13) * z, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (burst.kind === "zap") {
        ctx.strokeStyle = "rgba(255,107,138," + (1 - p).toFixed(3) + ")";
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3 + time * 3;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - 14 * z);
          ctx.lineTo(pos.x + Math.cos(a) * (22 + p * 16) * z, pos.y - 14 * z + Math.sin(a) * (16 + p * 12) * z);
          ctx.stroke();
        }
      } else if (burst.kind === "win") {
        ctx.strokeStyle = "rgba(255,212,121," + (1 - p).toFixed(3) + ")";
        ctx.lineWidth = 2.2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(pos.x, pos.y - 12 * z, (10 + p * (30 + i * 12)) * z, (6 + p * (16 + i * 7)) * z, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "rgba(255,157,181," + ((1 - p) * .5).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 12 * z, (6 + p * 20) * z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawLabels() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "600 " + Math.max(10, Math.round(11 * clamp(view.zoom, .6, 1.2))) + "px ui-monospace,Menlo,monospace";
    for (const label of labels) {
      const pos = cellPos(label.x, label.y);
      const p = 1 - label.life / label.max;
      ctx.globalAlpha = clamp(1 - p * p, 0, 1);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, pos.x, pos.y - (34 + p * 16) * view.zoom);
    }
    ctx.restore();
  }

  function unitState() {
    const state = {
      x: run.unit.x, y: run.unit.y,
      angle: SCREEN_ANGLE[run.unit.dir], lift: 0
    };
    const beat = anim.beat;
    if (!beat) {
      state.lift = Math.sin(time * 2.2) * 1.5;
      return state;
    }
    const p = ease(clamp(anim.t, 0, 1));
    if (beat.kind === "move" || beat.kind === "jump") {
      state.x = beat.from.x + (beat.to.x - beat.from.x) * p;
      state.y = beat.from.y + (beat.to.y - beat.from.y) * p;
      if (beat.kind === "jump") state.lift = Math.sin(Math.PI * clamp(anim.t, 0, 1)) * 30;
    } else if (beat.kind === "turn") {
      state.angle = lerpAngle(SCREEN_ANGLE[beat.from.dir], SCREEN_ANGLE[beat.to.dir], p);
    } else if (beat.kind === "bump") {
      const dir = sim.DIRS[run.unit.dir];
      const push = Math.sin(Math.PI * clamp(anim.t, 0, 1)) * .18;
      state.x += dir[0] * push;
      state.y += dir[1] * push;
      state.lift = Math.sin(Math.PI * clamp(anim.t, 0, 1)) * 2;
    }
    return state;
  }

  function patrolStates() {
    return run.patrols.map((patrol, index) => {
      // beat 中は「移動前 → 移動後」を補間する。run 側の位置は移動後なので、始点は beat から取る
      const beat = anim.beat;
      const from = beat && beat.patrolFrom[index] ? beat.patrolFrom[index] : sim.patrolCell(patrol);
      const target = beat && beat.patrolTo[index] ? beat.patrolTo[index] : from;
      const p = beat ? ease(clamp((anim.t - .42) / .58, 0, 1)) : 1;
      const x = from.x + (target.x - from.x) * p;
      const y = from.y + (target.y - from.y) * p;
      let angle = patrol.angle || 0;
      const dx = target.x - from.x, dy = target.y - from.y;
      if (dx || dy) {
        const want = Math.atan2((dx + dy) * TILE_H / 2, (dx - dy) * TILE_W / 2);
        angle = lerpAngle(angle, want, beat ? .06 : .2);
      }
      patrol.angle = angle;
      return { x, y, angle };
    });
  }

  function drawLevel() {
    const grid = current.grid;
    const z = view.zoom;
    const tw = TILE_W * z, th = TILE_H * z, wh = WALL_H * z;
    const unit = unitState();
    const patrols = patrolStates();
    const beat = anim.beat;

    // 床（重ならないので手前優先の順序だけでよい）
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const tile = grid.tiles[y][x];
        if (tile === "#") continue;
        const pos = cellPos(x, y);
        const odd = (x + y) % 2 === 0;
        if (tile === "O") {
          diamondPath(pos.x, pos.y, tw, th);
          ctx.fillStyle = "#02040a";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,107,138,.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
          diamondPath(pos.x, pos.y, tw * .78, th * .78);
          ctx.fillStyle = "rgba(255,107,138,.08)";
          ctx.fill();
        } else {
          diamondPath(pos.x, pos.y, tw, th);
          ctx.fillStyle = odd ? "rgba(14,24,40,.96)" : "rgba(19,31,52,.96)";
          ctx.fill();
          ctx.strokeStyle = "rgba(122,215,255,.14)";
          ctx.lineWidth = 1;
          ctx.stroke();
          if (tile === "E") {
            diamondPath(pos.x, pos.y, tw * .72, th * .72);
            ctx.fillStyle = "rgba(110,242,168,.1)";
            ctx.fill();
          }
        }
      }
    }

    // 立ち上がりのあるもの（奥から描く）
    const raised = [];
    const add = (key, draw) => raised.push({ key, draw });
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const tile = grid.tiles[y][x];
        const key = x + y;
        const pos = cellPos(x, y);
        if (tile === "#") add(key + .05, () => drawWall(pos.x, pos.y, tw, th, wh));
        else if (tile === "^") add(key + .1, () => drawSpikes(pos.x, pos.y, tw, th));
      }
    }
    const objectivesOpen = run.cores.every(c => c.got) && run.switches.every(s => s.got);
    if (run.exit) {
      const pos = cellPos(run.exit.x, run.exit.y);
      add(run.exit.x + run.exit.y + .2, () => drawExit(pos.x, pos.y, objectivesOpen, tw, th));
    }
    for (const plate of run.switches) {
      const pos = cellPos(plate.x, plate.y);
      add(plate.x + plate.y + .3, () => drawSwitch(pos.x, pos.y, tw, th, plate.got));
    }
    for (const core of run.cores) {
      let visible = !core.got;
      if (!visible && beat && beat.kind !== "wait") {
        const pick = beat.events.find(e => e.type === "pick" && e.what === "core" && e.at.x === core.x && e.at.y === core.y);
        if (pick && anim.t < .5) visible = true;
      }
      if (!visible) continue;
      const pos = cellPos(core.x, core.y);
      add(core.x + core.y + .35, () => drawCore(pos.x, pos.y, z));
    }
    patrols.forEach((patrol, index) => {
      const pos = cellPos(patrol.x, patrol.y);
      add(patrol.x + patrol.y + .25, () => drawPatrol(pos.x, pos.y, patrol.angle));
    });
    {
      const pos = cellPos(unit.x, unit.y);
      add(unit.x + unit.y + .4, () => drawUnit(pos.x, pos.y, unit.lift, unit.angle));
    }
    raised.sort((a, b) => a.key - b.key);
    for (const item of raised) item.draw();

    drawBursts();
    drawLabels();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    if (mode === "play" && current && run) drawLevel();
  }

  /* ---------- ループ ---------- */
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (isActive()) {
      time += dt;
      updateAnim(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- UI の配線 ---------- */
  $("openCodeBtn").addEventListener("click", () => { SFX.tap(); enterCode(); });
  $("codeReturnBtn").addEventListener("click", () => { SFX.tap(); exitCode(); });
  $("codeStartBtn").addEventListener("click", () => { SFX.tap(); refreshGrid(); showScreen("select"); });
  $("codeSelectBack").addEventListener("click", () => { SFX.tap(); refreshTitle(); showScreen("title"); });
  $("codePlayBack").addEventListener("click", () => {
    SFX.tap();
    stopRun(true);
    refreshGrid();
    showScreen("select");
  });
  $("codeHelpBtn").addEventListener("click", () => { SFX.tap(); showHelp(); });
  $("codeClearBtn").addEventListener("click", () => {
    if (running) return;
    program = [];
    selected = -1;
    SFX.del();
    buildProgram();
  });
  $("codeRunBtn").addEventListener("click", () => {
    if (running) { SFX.del(); stopRun(true); } else { runProgramUI(); }
  });
  $("codeSpeedBtn").addEventListener("click", () => {
    anim.speed = anim.speed === 1 ? 2 : anim.speed === 2 ? 3 : 1;
    $("codeSpeedBtn").textContent = "×" + anim.speed;
    SFX.tap();
  });
  $("codeSoundBtn").addEventListener("click", () => {
    soundOn = !soundOn;
    saveSound();
    $("codeSoundBtn").classList.toggle("off", !soundOn);
    $("codeSoundBtn").style.opacity = soundOn ? "" : ".45";
    if (soundOn) { SFX.tap(); toast("音を いれた"); } else { toast("音を けした"); }
  });
  $("codePalette").addEventListener("click", event => {
    const btn = event.target.closest ? event.target.closest(".code-key") : null;
    if (!btn || btn.disabled) return;
    onPalette(btn.dataset.act);
  });

  // 玄人コードが開いている間は、LUMINA 側のキー操作に渡さない
  window.addEventListener("keydown", event => {
    if (!isActive()) return;
    if (document.body.classList.contains("sumifu-open")) return;
    const key = (event.key || "").toLowerCase();
    event.stopImmediatePropagation();
    if (key === "escape") {
      event.preventDefault();
      hideOverlay();
      if (mode === "play") { stopRun(true); refreshGrid(); showScreen("select"); }
      else if (mode === "select") { refreshTitle(); showScreen("title"); }
      else exitCode();
      return;
    }
    if (!document.querySelector("#codeOverlay.hidden")) return;
    // This listener runs in the capture phase, so preventDefault() here would
    // cancel the focused button's activation: Enter on the clear button would run
    // the program instead. Hand the key back when a control owns it.
    const target = event.target;
    const onControl = target && target.closest && target.closest("button, a, input, select, textarea");
    if (key === "enter" || key === " ") {
      if (onControl) return;
      event.preventDefault();
      if (mode === "play" && !running) runProgramUI();
      else if (mode === "select") startLevel(resumeStage());
      else if (mode === "title") { refreshGrid(); showScreen("select"); }
    } else if (key.indexOf("arrow") === 0) {
      event.preventDefault();
    }
  }, true);

  /* ---------- 起動 ---------- */
  $("codeSoundBtn").style.opacity = soundOn ? "" : ".45";
  resize();
  requestAnimationFrame(frame);
})();
