(function () {
  "use strict";
  const rules = window.RepriseRules, levels = window.RepriseLevels, sound = window.RepriseSound;
  const $ = id => document.getElementById(id);
  const STORE = "reprise-gpt6-sol-v1";
  const screens = { title: $("titleScreen"), select: $("selectScreen"), play: $("playScreen") };
  const glyph = { U: "↑", R: "→", D: "↓", L: "←", W: "·" };
  let data = load(), scene = 0, echoes = [], actions = [], screen = "title", modal = null, finished = false;
  let toastTimer = 0, pendingFinish = 0, pendingHelp = 0, lastFocus = null, boardCells = [];

  function load() {
    const base = { unlocked: 0, completed: [], fragments: [], muted: false, session: null };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (!saved || typeof saved !== "object") return base;
      base.completed = Array.isArray(saved.completed) ? saved.completed.filter(n => Number.isInteger(n) && n >= 0 && n < levels.length) : [];
      base.fragments = Array.isArray(saved.fragments) ? saved.fragments.filter(n => Number.isInteger(n) && n >= 0 && n < levels.length) : [];
      base.unlocked = Math.max(0, Math.min(levels.length - 1, Number.isInteger(saved.unlocked) ? saved.unlocked : 0));
      base.muted = saved.muted === true;
      if (saved.session && Number.isInteger(saved.session.scene) && saved.session.scene <= base.unlocked && saved.session.scene >= 0) {
        const level = levels[saved.session.scene];
        if (rules.validateTake(level, saved.session.echoes, saved.session.actions)) base.session = saved.session;
      }
    } catch { /* Private browsing may disable storage. */ }
    return base;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* Play continues without persistence. */ }
  }
  function saveSession() {
    data.session = { scene, echoes: echoes.map(path => path.slice()), actions: actions.slice() };
    save();
  }
  function setScreen(next) {
    clearTimeout(pendingHelp);
    screen = next;
    document.body.classList.toggle("playing", next === "play");
    Object.entries(screens).forEach(([name, element]) => element.classList.toggle("hidden", name !== next));
    if (next === "play") sound.startAmbient(); else sound.stopAmbient();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function notify(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
  }
  function openDialog(content, onOpen) {
    lastFocus = document.activeElement;
    modal = $("dialogLayer");
    $("dialog").innerHTML = content;
    modal.classList.remove("hidden");
    $("dialog").scrollTop = 0;
    $("dialog").focus({ preventScroll: true });
    onOpen?.();
  }
  function closeDialog() {
    modal?.classList.add("hidden");
    modal = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }
  function sceneSelect() {
    clearTimeout(pendingFinish);
    closeDialog();
    setScreen("select");
    const done = new Set(data.completed), found = new Set(data.fragments);
    $("progressText").textContent = done.size === 0 ? "最初の舞台があなたを待っています。" : done.size === levels.length ? "すべての幕が、もう一度上がりました。" : `${done.size} / ${levels.length} 場面を再演しました。`;
    $("fragmentProgress").textContent = `台本の欠片 ${found.size} / ${levels.length}`;
    $("sceneList").innerHTML = levels.map((level, index) => {
      const divider = index % 4 === 0 ? `<div class="act-divider">${level.act}</div>` : "";
      const locked = index > data.unlocked;
      const label = locked ? "まだ閉じた幕" : done.has(index) ? "再演済み" : "まだ知らない場面";
      return `${divider}<button class="scene-card ${locked ? "locked" : ""} ${done.has(index) ? "completed" : ""}" data-scene="${index}" type="button" ${locked ? "disabled" : ""} aria-label="場面 ${index + 1} ${level.name} ${label}"><span class="number">${String(index + 1).padStart(2, "0")}</span><span class="name">${locked ? "······" : level.name}</span><span class="meta">${locked ? "LOCKED" : label}</span>${found.has(index) ? `<span class="fragment-mark" aria-label="台本の欠片を取得">✦</span>` : ""}</button>`;
    }).join("");
  }
  function showScript() {
    const found = new Set(data.fragments);
    const pages = levels.map((level, index) => `<div class="script-line ${found.has(index) ? "found" : "missing"}"><span>${String(index + 1).padStart(2, "0")}</span><p>${found.has(index) ? level.line : "まだ見つからない一行"}</p></div>`).join("");
    openDialog(`<p class="eyebrow">THE LOST SCRIPT</p><h2 id="dialogTitle">残された台本</h2><p>舞台で拾った言葉は、ここに残ります。</p><div class="script-pages">${pages}</div><div class="dialog-actions"><button class="button button-primary" data-dialog="close" type="button">場面へ戻る</button></div>`);
  }
  function enterScene(index, resume = false) {
    if (!Number.isInteger(index) || index < 0 || index > data.unlocked || index >= levels.length) return;
    clearTimeout(pendingFinish);
    closeDialog();
    scene = index;
    finished = false;
    const level = levels[scene];
    document.body.classList.toggle("timed-scene", level.grid.some(row => row.includes("T")));
    const saved = data.session;
    if (resume && saved?.scene === scene && rules.validateTake(level, saved.echoes, saved.actions)) {
      echoes = saved.echoes.map(path => path.slice()); actions = saved.actions.slice();
    } else { echoes = []; actions = []; saveSession(); }
    $("actLabel").textContent = level.act;
    $("sceneTitle").textContent = level.name;
    $("sceneNote").textContent = level.note;
    buildBoard(level);
    setScreen("play");
    const state = render();
    if (state.complete) { finished = true; commitClear(state); pendingFinish = setTimeout(() => finish(state), 300); }
    if (scene === 0 && !data.completed.includes(0) && !resume) pendingHelp = setTimeout(showHelp, 280);
  }
  function buildBoard(level) {
    const board = $("board");
    board.style.setProperty("--w", level.w);
    board.style.setProperty("--h", level.h);
    board.innerHTML = "";
    boardCells = [];
    for (let y = 0; y < level.h; y++) for (let x = 0; x < level.w; x++) {
      const tile = level.grid[y][x], cell = document.createElement("div");
      cell.className = "tile " + ({ "#": "wall", ".": "floor", S: "start", G: "goal", D: "door", T: "door timed", a: "plate", b: "plate", "*": "fragment" }[tile]);
      cell.dataset.x = x; cell.dataset.y = y;
      if (tile === "a" || tile === "b") cell.dataset.label = tile === "a" ? "I" : "II";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", tileLabel(tile, x, y));
      board.appendChild(cell); boardCells.push(cell);
    }
    const paths = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    paths.classList.add("board-paths"); paths.setAttribute("viewBox", `0 0 ${level.w} ${level.h}`); paths.setAttribute("preserveAspectRatio", "none");
    board.appendChild(paths);
  }
  function tileLabel(tile, x, y) {
    const labels = { "#": "壁", ".": "床", S: "開始位置", G: "出口の照明", D: "幕", T: "拍子幕。偶数拍だけ開く", a: "足灯一", b: "足灯二", "*": "台本の欠片" };
    return `${x + 1}列${y + 1}行、${labels[tile]}`;
  }
  function drawPaths(level) {
    const svg = $("board").querySelector(".board-paths");
    svg.replaceChildren();
    echoes.forEach((path, i) => {
      const run = rules.simulate(level, echoes.slice(0, i), path);
      const points = [level.start, ...run.history.map(t => t.actors[0])];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", points.map(p => `${p[0] + .5},${p[1] + .5}`).join(" "));
      line.setAttribute("class", `path-${i === 0 ? "one" : "two"}`);
      svg.appendChild(line);
    });
  }
  function render() {
    if (screen !== "play") return;
    const level = levels[scene], result = rules.simulate(level, echoes, actions);
    const allLit = result.lit.every(Boolean);
    boardCells.forEach((cell, index) => {
      const tile = level.grid[Math.floor(index / level.w)][index % level.w];
      cell.classList.toggle("open", (tile === "D" && allLit) || (tile === "T" && allLit && (actions.length + 1) % 2 === 0));
      cell.classList.toggle("lit", (tile === "a" || tile === "b") && result.lit[level.plates.findIndex(p => rules.same(p, [+cell.dataset.x, +cell.dataset.y]))]);
      cell.classList.toggle("taken", tile === "*" && result.collected);
    });
    drawPaths(level);
    const existing = [...$("board").querySelectorAll(".actor")];
    existing.slice(result.actors.length).forEach(actor => actor.remove());
    result.actors.forEach((position, index) => {
      const actor = existing[index] || document.createElement("div");
      actor.className = index === 0 ? "actor player" : `actor echo-${index - 1}`;
      actor.setAttribute("aria-hidden", "true");
      if (!existing[index]) actor.innerHTML = `<span class="actor-dot"></span>`;
      actor.style.left = `${(position[0] + .5) / level.w * 100}%`;
      actor.style.top = `${(position[1] + .5) / level.h * 100}%`;
      if (!existing[index]) $("board").appendChild(actor);
    });
    const take = echoes.length + 1;
    $("takeLabel").textContent = `TAKE ${take} / ${level.echoes + 1}`;
    $("beatLabel").textContent = `${actions.length} / ${level.beats}`;
    $("beatTrack").innerHTML = Array.from({ length: level.beats }, (_, i) => `<i class="${i < actions.length ? "used" : ""}"></i>`).join("");
    const atPlate = level.plates.some(p => rules.same(p, result.actors[0]));
    const recorded = echoes.map((path, i) => rules.simulate(level, echoes.slice(0, i), path).actors[0]);
    const usedPlate = recorded.some(p => rules.same(p, result.actors[0]));
    const canRecord = atPlate && !usedPlate && echoes.length < level.echoes && actions.length > 0;
    $("recordBtn").disabled = !canRecord;
    $("recordLabel").textContent = echoes.length >= level.echoes ? "残光と一緒に出口へ" : usedPlate ? "別の足灯を探そう" : atPlate ? "この動きを記録" : "足灯の上で記録";
    $("undoBtn").disabled = actions.length === 0;
    $("eraseBtn").disabled = echoes.length === 0;
    const timed = level.grid.some(row => row.includes("T"));
    $("instruction").textContent = result.complete ? "幕が上がりました。" : echoes.length >= level.echoes ? (allLit ? (timed ? (actions.length + 1) % 2 === 0 ? "次の偶数拍に、拍子幕が開く。" : "拍子幕は偶数拍に開く。待とう。" : "幕が開いた。出口の光へ。") : "残光が足灯に着くまで、待ってみよう。") : usedPlate ? "ここにはもう残光がいる。別の足灯へ。" : atPlate ? "ここで記録すると、動きが残光になります。" : echoes.length === 0 ? "足灯へ進み、動きを記録しよう。" : "もう一つの足灯に、動きを残そう。";
    $("board").setAttribute("aria-label", `${level.name}。${level.w}列${level.h}行。あなたは${result.actors[0][0] + 1}列${result.actors[0][1] + 1}行。足灯${result.lit.filter(Boolean).length} / ${level.plates.length}点灯。`);
    return result;
  }
  function move(direction) {
    if (screen !== "play" || modal || finished) return;
    const level = levels[scene];
    if (actions.length >= level.beats) { notify("拍がいっぱいです。一手戻すか、記録を直してください。"); sound.effect("wrong"); return; }
    if (!rules.canMove(level, echoes, actions, direction)) { sound.effect("wrong"); return; }
    const before = rules.simulate(level, echoes, actions);
    actions.push(direction);
    const after = render();
    saveSession();
    sound.effect(direction === "W" ? "wait" : "step");
    if (!before.collected && after.collected) sound.effect("fragment");
    if (!before.lit.every(Boolean) && after.lit.every(Boolean)) { sound.effect("gate"); $("board").parentElement.classList.add("spotlight"); setTimeout(() => $("board").parentElement.classList.remove("spotlight"), 800); }
    if (after.complete) {
      finished = true;
      commitClear(after);
      sound.effect("clear");
      pendingFinish = setTimeout(() => finish(after), 530);
    }
  }
  function record() {
    if (screen !== "play" || modal || finished) return;
    const level = levels[scene], result = rules.simulate(level, echoes, actions);
    const recorded = echoes.map((path, i) => rules.simulate(level, echoes.slice(0, i), path).actors[0]);
    if (!actions.length || echoes.length >= level.echoes || !level.plates.some(p => rules.same(p, result.actors[0])) || recorded.some(p => rules.same(p, result.actors[0]))) return;
    echoes.push(actions.slice()); actions = [];
    saveSession(); render(); sound.effect("record");
    const shell = $("board").parentElement;
    shell.classList.remove("recording"); void shell.offsetWidth; shell.classList.add("recording");
    setTimeout(() => shell.classList.remove("recording"), 650);
    notify(echoes.length === level.echoes ? "残光が揃った。出口へ向かおう。" : "あなたの足音が、舞台に残った。次の足灯へ。");
  }
  function undo() {
    if (screen !== "play" || modal || finished || actions.length === 0) return;
    actions.pop(); clearTimeout(pendingFinish); render(); saveSession(); sound.effect("undo");
  }
  function erase() {
    if (screen !== "play" || modal || finished || echoes.length === 0) return;
    actions = echoes.pop(); clearTimeout(pendingFinish); render(); saveSession(); sound.effect("undo"); notify("前の記録に戻りました。続きを直せます。");
  }
  function askRestart() {
    if (screen !== "play" || modal || finished) return;
    openDialog(`<p class="eyebrow">START THIS SCENE AGAIN</p><h2 id="dialogTitle">最初からやり直す？</h2><p>この場面で残した足音を消して、最初の位置へ戻ります。</p><div class="dialog-actions"><button class="button button-primary" data-dialog="restart" type="button">やり直す</button><button class="button button-secondary" data-dialog="close" type="button">舞台へ戻る</button></div>`);
  }
  function finish(result) {
    if (screen !== "play" || modal) return;
    const level = levels[scene];
    if (!rules.simulate(level, echoes, actions).complete) return;
    const previouslyFound = data.fragments.includes(scene);
    commitClear(result);
    const final = scene === levels.length - 1;
    openDialog(`<p class="eyebrow">SCENE ${String(scene + 1).padStart(2, "0")} · CURTAIN CALL</p><div class="dialog-symbol">✦</div><h2 id="dialogTitle">${level.name}</h2><p>${final ? "忘れていた光が、客席の隅まで届きました。" : level.note}</p><p class="result-line">${result.collected ? `台本の欠片を見つけた ✦<br><em>「${level.line}」</em>` : previouslyFound ? `台本の欠片は記録済み ✦<br><em>「${level.line}」</em>` : "台本の欠片は、まだ舞台に残っています"}</p><div class="dialog-actions"><button class="button button-primary" data-dialog="${final ? "ending" : "next"}" type="button">${final ? "エピローグへ" : "次の場面へ"} <span aria-hidden="true">↗</span></button><button class="button button-secondary" data-dialog="select" type="button">場面を選ぶ</button><button class="button button-secondary" data-dialog="retry" type="button">この場面をもう一度</button></div>`);
  }
  function commitClear(result) {
    if (!data.completed.includes(scene)) data.completed.push(scene);
    if (result.collected && !data.fragments.includes(scene)) data.fragments.push(scene);
    data.unlocked = Math.max(data.unlocked, Math.min(levels.length - 1, scene + 1));
    data.session = null; save();
  }
  function showHelp() {
    if (screen !== "play" || modal || finished) return;
    openDialog(`<p class="eyebrow">HOW TO PLAY</p><h2 id="dialogTitle">足音を残す</h2><p>この舞台では、過去のあなたと一緒に歩きます。</p><div class="help-list"><div><b>①</b><span>矢印ボタンか WASD で歩き、丸い<strong>足灯</strong>の上に立ちます。</span></div><div><b>◎</b><span>「この動きを記録」で最初に戻ります。残光は、あなたが動くたび同じ道を進み、最後の位置に留まります。</span></div><div><b>✧</b><span>残光で足灯を灯すと幕が開きます。光る出口へ。台本の欠片は、拾わなくても進めます。</span></div>${levels[scene].index >= 4 ? `<div><b>Ⅱ</b><span>金の筋がある<strong>拍子幕</strong>は、足灯を灯したあと、偶数拍にだけ開きます。待つと拍が進みます。</span></div>` : ""}</div><p>Space / 中央ボタンで待つ。Z で一手戻す。記録を直せば、前の動きからやり直せます。時間制限はありません。</p><details class="hint-details"><summary>この場面のヒント</summary><p>${levels[scene].hint}</p></details><div class="dialog-actions"><button class="button button-primary" data-dialog="close" type="button">舞台へ</button></div>`);
  }
  function ending() {
    closeDialog();
    const all = data.fragments.length === levels.length;
    openDialog(`<p class="eyebrow">THE CURTAIN RISES AGAIN</p><div class="dialog-symbol">✧</div><h2 id="dialogTitle">ひかりの再演</h2><p>客席には、誰もいなかった。<br>それでも舞台に残した一歩ずつが、<br>最後の幕を上げた。</p><p>明かりがつく。<br>そこには、これまでのあなたがいる。</p><p class="result-line">${all ? "十二の台本の欠片が、ひとつの物語になった。" : `台本の欠片 ${data.fragments.length} / ${levels.length}。残りの光を探しに、いつでも戻れます。`}</p><div class="dialog-actions"><button class="button button-primary" data-dialog="select" type="button">場面を振り返る</button><button class="button button-secondary" data-dialog="title" type="button">タイトルへ</button></div>`);
  }
  function title() { clearTimeout(pendingFinish); closeDialog(); setScreen("title"); const saved = data.session; $("startBtn").firstChild.textContent = saved ? "続きを再開 " : "幕を上げる "; }

  $("startBtn").addEventListener("click", () => {
    const session = data.session;
    if (session) enterScene(session.scene, true);
    else enterScene(Math.min(data.unlocked, levels.length - 1));
  });
  $("selectBtn").addEventListener("click", sceneSelect);
  $("scriptBtn").addEventListener("click", showScript);
  $("selectBackBtn").addEventListener("click", title);
  $("playBackBtn").addEventListener("click", sceneSelect);
  $("helpBtn").addEventListener("click", showHelp);
  $("soundBtn").addEventListener("click", () => { data.muted = !data.muted; sound.setEnabled(!data.muted); $("soundBtn").textContent = data.muted ? "♪̸" : "♫"; $("soundBtn").setAttribute("aria-label", data.muted ? "音を鳴らす" : "音を切る"); save(); if (!data.muted) sound.effect("fragment"); });
  $("sceneList").addEventListener("click", event => { const button = event.target.closest("[data-scene]"); if (button) enterScene(Number(button.dataset.scene)); });
  $("playScreen").querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => move(button.dataset.move)));
  $("recordBtn").addEventListener("click", record);
  $("undoBtn").addEventListener("click", undo);
  $("eraseBtn").addEventListener("click", erase);
  $("restartBtn").addEventListener("click", askRestart);
  $("board").addEventListener("click", event => {
    const cell = event.target.closest(".tile");
    if (!cell || modal) return;
    const position = rules.simulate(levels[scene], echoes, actions).actors[0];
    const dx = Number(cell.dataset.x) - position[0], dy = Number(cell.dataset.y) - position[1];
    const direction = Object.entries(rules.DIR).find(([, d]) => d[0] === dx && d[1] === dy)?.[0];
    if (direction) move(direction);
  });
  $("dialog").addEventListener("click", event => {
    const button = event.target.closest("[data-dialog]"); if (!button) return;
    const action = button.dataset.dialog;
    if (action === "close") closeDialog();
    if (action === "restart") { closeDialog(); echoes = []; actions = []; saveSession(); render(); notify("最初の拍へ戻りました。"); }
    if (action === "next") enterScene(scene + 1);
    if (action === "select") sceneSelect();
    if (action === "retry") enterScene(scene);
    if (action === "ending") ending();
    if (action === "title") title();
  });
  document.addEventListener("keydown", event => {
    if (modal) {
      if (event.key === "Escape") { event.preventDefault(); if (finished) sceneSelect(); else closeDialog(); }
      if (event.key === "Tab") {
        const items = [...$("dialog").querySelectorAll("button:not(:disabled),a[href],summary")];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === $("dialog"))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (screen !== "play" || event.metaKey || event.ctrlKey || event.altKey) return;
    const focusedControl = event.target.closest?.("button,a,input,textarea,select");
    if (focusedControl && ["Enter", " ", "Spacebar"].includes(event.key)) return;
    const keys = { ArrowUp: "U", ArrowRight: "R", ArrowDown: "D", ArrowLeft: "L", w: "U", d: "R", s: "D", a: "L", " ": "W" };
    const direction = keys[event.key];
    if (direction) { event.preventDefault(); move(direction); return; }
    if (event.key.toLowerCase() === "z" || event.key === "Backspace") { event.preventDefault(); undo(); }
    if (event.key === "Enter" && !focusedControl) { event.preventDefault(); record(); }
    if (event.key === "Escape") { event.preventDefault(); showHelp(); }
  });
  window.addEventListener("pagehide", () => { if (data.session && screen === "play") saveSession(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) sound.stopAmbient(); else if (screen === "play") sound.startAmbient(); });
  sound.setEnabled(!data.muted);
  if (data.muted) { $("soundBtn").textContent = "♪̸"; $("soundBtn").setAttribute("aria-label", "音を鳴らす"); }
  title();
})();
