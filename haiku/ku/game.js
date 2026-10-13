// Controller for 句ゆき: screens, walking, the 宿 dialogue, 句帳 composition,
// judging, the 句集 and saving. Rules live in KuSim; drawing in KuScene and KuPaint.
//
// window.kuDebug is a test hook used by tests/haiku-ku-browser.cjs:
//   state()              -> plain snapshot of progress, hand and draft
//   collect(id)          -> takes a lantern into the hand by its id
//   setX(x)              -> places the traveler (clamped to the road)
//   setCleared(n)        -> jumps the 宿 count (for testing screens only)
//   openJournal()/closeJournal()
//   openAnthology()/openEnding()   (screens for review)
(function () {
  "use strict";

  const KEY = "ku-journey-v1";
  const SOUND_KEY = "ku-sound";
  const HAND_CAP = 36;
  const WALK_SPEED = 170;
  const LINE_NAMES = ["上の句", "中の句", "下の句"];
  const SEAL_GLYPH = { meiku: "名句", kaku: "佳句", yoi: "良し" };

  const $ = id => document.getElementById(id);
  const stations = KuWords.stations;
  const lanterns = KuSim.allLanterns();
  const lanternById = new Map(lanterns.map(l => [l.id, l]));
  const reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const coarseQuery = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;

  const game = {
    screen: "title",
    progress: KuSim.emptyProgress(),
    taken: new Set(),
    live: lanterns.slice(),
    hand: [],
    draft: KuSim.emptyPoem(),
    activeLine: 0,
    x: 40,
    camX: -40,
    walkT: 0,
    facing: 1,
    keyDir: 0,
    holdDir: 0,
    overlay: null,
    dialog: null,
    entered: false,
    verdict: null,
    hintIds: null,
    hintUntil: 0,
    bloom: null,
    mistAlpha: 1,
    mistX: 0,
    mistTarget: 1,
    rainOn: false,
    handNoticed: false,
    dirty: false,
    loaded: false,
    sound: true,
    running: false,
    last: 0,
    time: 0,
    dragging: null,
    ignoreClick: false,
    lastSaved: 0
  };

  let journeyScene = null;
  let titleScene = null;
  let reduced = false;

  // ---- storage (per-viewer convenience only) -------------------------

  function readSave() {
    try {
      const text = window.localStorage.getItem(KEY);
      return text ? KuSim.parseSave(text) : null;
    } catch (error) {
      return null;
    }
  }

  // Writes only after a journey has been started or continued, so that
  // reloading the title never overwrites a saved journey with an empty one.
  function persist() {
    if (!game.loaded) return;
    try {
      const ids = game.hand.map(tile => tile.id).concat([...KuSim.usedIds(game.draft)]);
      window.localStorage.setItem(KEY, KuSim.serialize({
        progress: game.progress,
        taken: [...game.taken],
        hand: ids,
        x: game.x
      }));
    } catch (error) {
      // Storage may be blocked; the game still plays.
    }
    game.dirty = false;
  }

  function readSound() {
    try {
      return window.localStorage.getItem(SOUND_KEY) !== "off";
    } catch (error) {
      return true;
    }
  }

  function writeSound(on) {
    try {
      window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch (error) {
      // ignored
    }
  }

  // ---- state helpers ----------------------------------------------------

  function tileById(id) {
    const lantern = lanternById.get(id);
    return lantern ? KuSim.tileFor(lantern.word, id) : null;
  }

  function currentStation() {
    return Math.min(game.progress.cleared, stations.length - 1);
  }

  function seasonNow() {
    return KuSim.sceneSeason(game.progress.cleared);
  }

  function requestSeason() {
    return stations[currentStation()].season;
  }

  function lanternY(lantern, H) {
    return H * (0.16 + (1 - lantern.h) * 0.42);
  }

  function setLive() {
    game.live = lanterns.filter(l => !game.taken.has(l.id));
  }

  function gateX() {
    return KuSim.innX(game.progress.cleared) - KuSim.WORLD.gate;
  }

  function atGate() {
    return KuSim.atGate(game.progress.cleared, game.x);
  }

  // ---- screens --------------------------------------------------------

  function showScreen(name) {
    game.screen = name;
    $("app").dataset.screen = name;
    $("title").hidden = name !== "title";
    $("journey").hidden = name !== "journey";
    $("hud") && ($("hud").hidden = name !== "journey");
    if (name === "title") {
      game.overlay = null;
      closeAllOverlays();
    }
  }

  function closeAllOverlays() {
    for (const id of ["journal", "verdict", "anthology", "ending"]) $(id).hidden = true;
    game.overlay = null;
  }

  function setStatus(text, warn) {
    const el = $("jStatus");
    el.textContent = text || "";
    el.classList.toggle("warn", !!warn);
  }

  function updateSoundButtons() {
    for (const id of ["btnSound", "hudSound"]) {
      const btn = $(id);
      if (!btn) continue;
      btn.setAttribute("aria-pressed", String(game.sound));
      btn.textContent = id === "btnSound" ? (game.sound ? "音：入" : "音：切") : "♪";
    }
  }

  function toggleSound() {
    game.sound = !game.sound;
    writeSound(game.sound);
    KuAudio.setMuted(!game.sound);
    if (game.sound) KuAudio.start();
    updateSoundButtons();
  }

  // ---- title -------------------------------------------------------------

  function refreshTitle() {
    const save = readSave();
    const hasSave = !!save && (save.progress.cleared > 0 || save.taken.length > 0 || save.x > 40);
    $("btnContinue").hidden = !hasSave;
    $("titleNote").textContent = hasSave
      ? (save.progress.cleared >= KuSim.STATION_COUNT ? "句集は完成しています。" : "第 " + (save.progress.cleared + 1) + " 宿から、旅をつづけられます。")
      : "";
    return save;
  }

  function startNew() {
    game.progress = KuSim.emptyProgress();
    game.taken = new Set();
    game.hand = [];
    game.draft = KuSim.emptyPoem();
    game.x = 40;
    game.camX = -40;
    game.entered = false;
    game.mistTarget = 1;
    game.mistAlpha = 1;
    game.mistX = KuSim.innX(0) + 120;
    setLive();
    game.loaded = true;
    enterJourney(true);
  }

  function continueSaved() {
    const save = readSave();
    if (!save) return startNew();
    game.progress = save.progress;
    game.taken = new Set(save.taken);
    game.hand = save.hand.map(tileById).filter(Boolean);
    game.draft = KuSim.emptyPoem();
    game.x = Math.min(save.x, KuSim.walkLimit(game.progress.cleared));
    game.camX = game.x - 200;
    game.entered = false;
    game.mistAlpha = game.progress.cleared >= KuSim.STATION_COUNT ? 0 : 1;
    game.mistX = KuSim.innX(Math.min(game.progress.cleared, 7)) + 120;
    setLive();
    game.loaded = true;
    enterJourney(false);
  }

  function enterJourney(fresh) {
    KuAudio.start();
    KuAudio.setMuted(!game.sound);
    showScreen("journey");
    game.holdDir = 0;
    game.keyDir = 0;
    persist();
    if (fresh) {
      say([
        { who: "", text: "春の道へ出る。道ばたには、言の葉が浮いている。" },
        { who: "", text: "← → か A・D で歩きます。言の葉にふれると、手に入ります。" },
        { who: "", text: "画面の下半分を押し続けても歩けます。" },
        { who: stations[0].host, text: "霞の宿はこの先です。ゆっくりおいでなさい。" }
      ]);
    } else {
      say([{ who: "", text: "旅をつづけます。宿の灯が見えてきたら、戸口で句を請いましょう。" }]);
    }
    scheduleBird();
  }

  // ---- dialogue -------------------------------------------------------------

  function say(lines, onDone) {
    game.dialog = { lines: lines, i: 0, pos: 0, typing: true, onDone: onDone || null };
    showDialogLine();
  }

  function showDialogLine() {
    const d = game.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    $("dialog").hidden = false;
    $("dlgSpeaker").textContent = line.who || "";
    $("dlgSpeaker").hidden = !line.who;
    if (reduced) d.pos = line.text.length;
    d.typing = d.pos < line.text.length;
    updateDialogText();
    $("dlgNext").textContent = d.i === d.lines.length - 1 && !d.typing ? "閉じる ▾" : "続ける ▾";
  }

  function updateDialogText() {
    const d = game.dialog;
    if (!d) return;
    const text = d.lines[d.i].text;
    $("dlgText").textContent = text.slice(0, Math.floor(d.pos));
  }

  function advanceDialog() {
    const d = game.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.pos < line.text.length) {
      d.pos = line.text.length;
      d.typing = false;
      updateDialogText();
      $("dlgNext").textContent = d.i === d.lines.length - 1 ? "閉じる ▾" : "続ける ▾";
      return;
    }
    if (d.i < d.lines.length - 1) {
      d.i++;
      d.pos = 0;
      showDialogLine();
      return;
    }
    const done = d.onDone;
    game.dialog = null;
    $("dialog").hidden = true;
    if (done) done();
  }

  function scheduleBird() {
    const delay = 6000 + Math.random() * 6000;
    window.setTimeout(() => {
      if (game.screen === "journey" && game.sound) KuAudio.bird();
      scheduleBird();
    }, delay);
  }

  // ---- walking and collecting -----------------------------------------------

  function walkingAllowed() {
    return game.screen === "journey" && !game.overlay && !game.dialog;
  }

  function collectNear(H) {
    if (game.overlay) return;
    for (const lantern of game.live.slice()) {
      if (Math.abs(lantern.x - game.x) > 46) continue;
      if (game.hand.length >= HAND_CAP) {
        if (!game.handNoticed) {
          game.handNoticed = true;
          say([{ who: "", text: "手に言の葉が余ります。句帳で句にしてみてください。" }]);
        }
        continue;
      }
      const tile = KuSim.tileFor(lantern.word, lantern.id);
      if (!tile) continue;
      game.taken.add(lantern.id);
      game.hand.push(tile);
      game.live = game.live.filter(l => l.id !== lantern.id);
      KuAudio.pluck(lantern.id % 5, lantern.id % 2 ? 1 : 0);
      if (journeyScene) journeyScene.splash(lantern.x, lanternY(lantern, H), KuPaint.PALETTE[seasonNow()].ink, game.camX);
      game.dirty = true;
      renderHud();
    }
  }

  function updateWorld(dt) {
    const limit = KuSim.walkLimit(game.progress.cleared);
    const dir = walkingAllowed() ? (game.keyDir || game.holdDir) : 0;
    const before = game.x;
    if (dir) {
      game.x = Math.max(0, Math.min(limit, game.x + dir * WALK_SPEED * dt));
      game.facing = dir;
    }
    const moved = game.x - before;
    game.walking = Math.abs(moved) > 0.01;
    game.walkT += dt * (game.walking ? 9 : 0);
    const target = game.x - 300;
    game.camX += (target - game.camX) * Math.min(1, dt * 6);

    const H = journeyScene ? journeyScene.height() : 600;
    collectNear(H);

    // The door prompt waits at the gate and resets once the traveler walks away.
    const gate = atGate();
    if (!gate && game.x < gateX() - 40) game.entered = false;

    // Rain falls over the 夕立 road (the third 宿's segment) in summer.
    const seg = KuSim.segmentRange(2);
    const rain = seasonNow() === "夏" && game.x >= seg[0] && game.x <= seg[1] + 150;
    if (rain !== game.rainOn) {
      game.rainOn = rain;
      KuAudio.rain(rain);
    }

    // The veil beyond the frontier 宿 lifts when it clears, and a new one settles past the next.
    game.mistTarget = game.progress.cleared >= KuSim.STATION_COUNT ? 0 : 1;
    game.mistAlpha += (game.mistTarget - game.mistAlpha) * Math.min(1, dt * 1.6);

    if (game.bloom) {
      game.bloom.t += dt / 1.8;
      if (game.bloom.t >= 1) game.bloom = null;
    }
    if (game.dirty && performance.now() - game.lastSaved > 4000) {
      game.lastSaved = performance.now();
      persist();
    }
    updateDoor();
  }

  function updateDoor() {
    const show = walkingAllowed() && atGate() && !game.entered && !game.overlay;
    const btn = $("doorBtn");
    if (btn.hidden === !show) return;
    btn.hidden = !show;
    if (show) btn.textContent = stations[currentStation()].inn + "に入る";
  }

  // ---- journal (句帳) -----------------------------------------------------------

  function openJournal() {
    if (game.dialog || game.screen !== "journey") return;
    game.overlay = "journal";
    $("journal").hidden = false;
    document.querySelector("#journal .sheet").scrollTop = 0;
    KuAudio.rustle();
    renderJournal();
    setStatus(game.progress.cleared >= KuSim.STATION_COUNT
      ? "句集は完成しています。句帳では、旅の句を自由に詠めます。"
      : (atGate() ? "句が整ったら「句をよむ」を押してください。" : "宿の戸口で、この句を宿の主にお見せします。"));
    $("jClose").focus({ preventScroll: true });
  }

  function closeJournal() {
    if (game.overlay !== "journal") return;
    $("journal").hidden = true;
    game.overlay = null;
    persist();
    renderHud();
  }

  function sealedCount() {
    return [0, 1, 2].filter(i => KuSim.isSealed(game.draft, i)).length;
  }

  function renderJournal() {
    const cleared = game.progress.cleared;
    const complete = cleared >= KuSim.STATION_COUNT;
    const station = stations[Math.min(cleared, stations.length - 1)];
    $("jKicker").textContent = complete ? "旅の句帳" : "第 " + (cleared + 1) + " 宿 · " + station.inn;
    $("jTheme").textContent = station.theme;
    $("jSeason").textContent = station.season || "どの季も";

    let flatIndex = 0;
    for (let i = 0; i < 3; i++) {
      const slots = $("slots" + i);
      const col = slots.parentElement;
      const target = KuSim.TARGETS[i];
      slots.textContent = "";
      const line = game.draft.lines[i];
      for (const tile of line) {
        const hue = flatIndex++ % 4;
        tile.morae.forEach((m, j) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "slot filled h" + hue + (tile.kire ? " kire" : "") + (j > 0 ? " joined" : "") + (j < tile.morae.length - 1 ? " tail" : "");
          b.textContent = m;
          b.dataset.tile = String(tile.id);
          b.setAttribute("aria-label", tile.word + "を外す");
          b.title = tile.word;
          b.addEventListener("click", () => removeFromDraft(tile.id));
          slots.appendChild(b);
        });
      }
      const empty = target - KuSim.lineMora(game.draft, i);
      for (let n = 0; n < empty; n++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "slot";
        b.setAttribute("aria-label", LINE_NAMES[i] + "の空き");
        b.addEventListener("click", () => { game.activeLine = i; renderJournal(); });
        slots.appendChild(b);
      }
      $("count" + i).textContent = KuSim.lineMora(game.draft, i) + "/" + target;
      col.classList.toggle("active", game.activeLine === i && !KuSim.isSealed(game.draft, i));
      col.classList.toggle("sealed", KuSim.isSealed(game.draft, i));
    }

    const handEl = $("hand");
    handEl.textContent = "";
    if (!game.hand.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "手の中の言の葉は、すべて句帳にあります。";
      handEl.appendChild(empty);
    }
    const hintSet = game.hintIds || new Set();
    for (const tile of game.hand) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (tile.kire ? " kire" : "") + (hintSet.has(tile.id) ? " hint" : "");
      chip.dataset.id = String(tile.id);
      chip.setAttribute("role", "listitem");
      chip.setAttribute("aria-label", tile.word + "、" + tile.mora + "モーラ");
      const word = document.createElement("span");
      word.textContent = tile.word;
      const dots = document.createElement("span");
      dots.className = "dots";
      dots.setAttribute("aria-hidden", "true");
      for (let k = 0; k < tile.mora; k++) dots.appendChild(document.createElement("i"));
      chip.append(word, dots);
      chip.addEventListener("click", () => {
        if (game.ignoreClick) { game.ignoreClick = false; return; }
        addToDraft(tile.id, game.activeLine);
      });
      chip.addEventListener("pointerdown", e => startDrag(e, chip, tile));
      handEl.appendChild(chip);
    }
    $("handCount").textContent = "言の葉 " + game.hand.length;

    const exact = KuSim.isExact(game.draft);
    const submit = $("jSubmit");
    submit.disabled = !exact || complete;
    submit.title = exact ? "" : "五・七・五がそろうと、句をよめます";
  }

  function addToDraft(id, lineIndex) {
    const tile = game.hand.find(t => t.id === id);
    if (!tile) return;
    const next = KuSim.addTile(game.draft, lineIndex, tile);
    if (!next) {
      const col = document.querySelector('.line-col[data-line="' + lineIndex + '"]');
      if (col) { col.classList.remove("shake"); void col.offsetWidth; col.classList.add("shake"); }
      const remain = KuSim.TARGETS[lineIndex] - KuSim.lineMora(game.draft, lineIndex);
      setStatus("「" + tile.word + "」は" + LINE_NAMES[lineIndex] + "に入りませぬ。残りは" + remain + "モーラです。", true);
      return;
    }
    game.draft = next;
    game.hand = game.hand.filter(t => t.id !== id);
    KuAudio.tap();
    if (KuSim.isSealed(game.draft, lineIndex)) {
      setStatus(LINE_NAMES[lineIndex] + "が整いました。");
      const nextLine = [0, 1, 2].find(i => !KuSim.isSealed(game.draft, i));
      if (nextLine !== undefined) game.activeLine = nextLine;
    } else {
      setStatus("");
    }
    game.hintIds = null;
    renderJournal();
    game.dirty = true;
  }

  function removeFromDraft(id) {
    const removed = KuSim.removeTile(game.draft, id);
    if (!removed) return;
    game.draft = removed.poem;
    game.hand.push(removed.tile);
    KuAudio.tap();
    setStatus("「" + removed.tile.word + "」を手にもどしました。");
    renderJournal();
  }

  function resetDraft() {
    for (const line of game.draft.lines) for (const tile of line) game.hand.push(tile);
    game.draft = KuSim.emptyPoem();
    game.activeLine = 0;
    game.hintIds = null;
    setStatus("句帳を白紙にもどしました。");
    renderJournal();
  }

  function showHint() {
    const season = requestSeason();
    const ids = KuSim.hintIds(game.hand, season);
    game.hintIds = new Set(ids);
    const words = game.hand.filter(t => ids.includes(t.id)).map(t => "「" + t.word + "」");
    setStatus(ids.length
      ? (season ? season + "の季語: " : "季語: ") + words.join("・")
      : (season ? "手に" + season + "の季語はまだありません。道で探してみましょう。" : "季語はまだ手にありません。"));
    // The matching 言の葉 on the road also glow for a few seconds.
    const worldIds = new Set(game.live.filter(l => {
      const tile = KuSim.tileFor(l.word, l.id);
      return tile && tile.season && (season === null || tile.season === season);
    }).map(l => l.id));
    game.hintWorld = worldIds;
    game.hintUntil = game.time + 6;
    renderJournal();
  }

  function submitPoem() {
    if (game.overlay !== "journal") return;
    if (!KuSim.isExact(game.draft)) return;
    if (!atGate() || game.progress.cleared >= KuSim.STATION_COUNT) {
      setStatus("宿の戸口で、句をお読みください。", true);
      return;
    }
    const words = game.draft.lines.map(line => line.map(tile => tile.word));
    const result = KuSim.acceptPoem(game.progress, words);
    if (!result.ok) {
      setStatus("句が形をなしません。", true);
      return;
    }
    game.verdict = result;
    openVerdict(result.result);
  }

  // ---- verdict ----------------------------------------------------------------

  function openVerdict(judged) {
    game.overlay = "verdict";
    $("journal").hidden = true;
    const station = stations[game.progress.cleared];
    $("verdict").hidden = false;
    $("vStation").textContent = "第 " + (game.progress.cleared + 1) + " 宿 · " + station.inn + " · 題「" + station.theme + "」";
    $("vHostName").textContent = station.host;
    $("vSays").textContent = judged.hostLine;
    const poem = $("vPoem");
    poem.textContent = "";
    for (const line of judged.lines) {
      const p = document.createElement("p");
      p.textContent = line.join("");
      poem.appendChild(p);
    }
    $("vRank").textContent = judged.rank + (judged.kigo ? " · 季「" + judged.kigo + "」" : "");
    const notes = $("vNotes");
    notes.textContent = "";
    for (const note of [judged.rankText].concat(judged.notes)) {
      const li = document.createElement("li");
      li.textContent = note;
      notes.appendChild(li);
    }
    const seal = $("vSeal");
    seal.width = 168;
    seal.height = 168;
    const g = seal.getContext("2d");
    g.clearRect(0, 0, 168, 168);
    g.drawImage(KuPaint.sealCanvas(SEAL_GLYPH[judged.rankKey], 2), 0, 0, 168, 168);
    KuAudio.thunk();
    $("vProceed").focus({ preventScroll: true });
    persist();
  }

  function proceedFromVerdict() {
    if (!game.verdict) return;
    const result = game.verdict;
    game.verdict = null;
    $("verdict").hidden = true;
    game.overlay = null;
    const before = game.progress.cleared;
    game.progress = result.progress;
    game.draft = KuSim.emptyPoem();
    game.activeLine = 0;
    game.hintIds = null;
    game.entered = false;
    game.bloom = { x: KuSim.innX(before), t: 0 };
    if (journeyScene) journeyScene.splash(KuSim.innX(before), journeyScene.ground() - 40, "#2a2f2c", game.camX);
    game.mistX = KuSim.innX(Math.min(game.progress.cleared, 7)) + 120;
    game.mistAlpha = 0;
    persist();
    renderHud();
    const station = stations[before];
    const after = [{ who: station.host, text: station.farewell }];
    if (KuSim.isComplete(game.progress)) {
      after.push({ who: "", text: "八つの宿を越え、句集が一冊になりました。" });
    }
    say(after, () => {
      if (KuSim.isComplete(game.progress)) window.setTimeout(openEnding, 500);
    });
  }

  // ---- anthology and ending -------------------------------------------------

  function openAnthology() {
    if (game.screen !== "journey" && game.screen !== "title") return;
    closeJournal();
    game.overlay = "anthology";
    const list = $("anthList");
    list.textContent = "";
    for (let k = 0; k < stations.length; k++) {
      const poem = game.progress.poems[k];
      const st = stations[k];
      const item = document.createElement("article");
      item.className = "anth-item" + (poem ? "" : " empty");
      if (poem) {
        const v = document.createElement("div");
        v.className = "poem-v";
        for (const line of poem.lines) {
          const p = document.createElement("p");
          p.textContent = line.join("");
          v.appendChild(p);
        }
        const meta = document.createElement("div");
        meta.className = "anth-meta";
        const strong = document.createElement("strong");
        strong.textContent = st.theme + "（" + (st.season || "どの季も") + "）";
        const place = document.createElement("span");
        place.textContent = st.inn;
        const tag = document.createElement("span");
        tag.className = "rank-tag";
        tag.textContent = KuSim.RANK_LABEL[poem.rank];
        meta.append(strong, document.createElement("br"), place, document.createElement("br"), tag);
        item.append(v, meta);
      } else {
        const meta = document.createElement("div");
        meta.className = "anth-meta";
        const strong = document.createElement("strong");
        strong.textContent = "第 " + (k + 1) + " 宿・題「" + st.theme + "」";
        const place = document.createElement("span");
        place.textContent = st.inn + " — まだ詠まれていません";
        meta.append(strong, document.createElement("br"), place);
        item.append(meta);
      }
      list.appendChild(item);
    }
    $("anthology").hidden = false;
    document.querySelector("#anthology .sheet").scrollTop = 0;
    $("anthBack").focus({ preventScroll: true });
  }

  function closeAnthology() {
    $("anthology").hidden = true;
    game.overlay = null;
  }

  function openEnding() {
    game.overlay = "ending";
    $("ending").hidden = false;
    $("endAnth").focus();
    KuAudio.pluck(0, 0);
    window.setTimeout(() => KuAudio.pluck(2, 0), 380);
    window.setTimeout(() => KuAudio.pluck(3, 1), 760);
    persist();
  }

  // ---- drag and drop from the hand -------------------------------------------------

  function startDrag(e, chip, tile) {
    if (e.button && e.button !== 0) return;
    game.dragging = { id: tile.id, chip: chip, x: e.clientX, y: e.clientY, moved: false, ghost: null, pointer: e.pointerId };
  }

  function moveDrag(e) {
    const d = game.dragging;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) {
      d.moved = true;
      d.chip.classList.add("dragging");
      const ghost = document.createElement("div");
      ghost.className = "chip ghost-tile";
      ghost.textContent = d.chip.firstChild.textContent;
      document.body.appendChild(ghost);
      d.ghost = ghost;
    }
    if (d.moved && d.ghost) {
      d.ghost.style.left = e.clientX + "px";
      d.ghost.style.top = e.clientY + "px";
      const col = columnAt(e.clientX, e.clientY);
      document.querySelectorAll(".line-col").forEach(c => c.classList.toggle("active", c === col));
    }
  }

  function columnAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".line-col") : null;
  }

  function endDrag(e) {
    const d = game.dragging;
    if (!d) return;
    game.dragging = null;
    if (!d.moved) return;
    game.ignoreClick = true;
    window.setTimeout(() => { game.ignoreClick = false; }, 0);
    if (d.ghost) d.ghost.remove();
    d.chip.classList.remove("dragging");
    const col = columnAt(e.clientX, e.clientY);
    if (col && game.overlay === "journal") {
      addToDraft(d.id, Number(col.dataset.line));
    } else {
      renderJournal();
    }
  }

  // ---- HUD -------------------------------------------------------------------------

  function renderHud() {
    const cleared = game.progress.cleared;
    $("seasonBadge").textContent = seasonNow();
    $("handCount").textContent = "言の葉 " + game.hand.length;
    const dots = $("stationDots");
    if (!dots.children.length) {
      for (let k = 0; k < stations.length; k++) {
        const li = document.createElement("li");
        li.setAttribute("aria-label", "第 " + (k + 1) + " 宿");
        dots.appendChild(li);
      }
    }
    Array.from(dots.children).forEach((li, k) => {
      li.className = k < cleared ? "done" : (k === cleared ? "current" : "");
    });
  }

  // ---- input ----------------------------------------------------------------

  function onKeyDown(e) {
    if (game.screen !== "journey" && game.screen !== "title") return;
    const key = e.key;
    if (key === "Escape") {
      if (game.overlay === "journal") { e.preventDefault(); closeJournal(); }
      else if (game.overlay === "anthology") { e.preventDefault(); closeAnthology(); }
      return;
    }
    if (game.screen !== "journey") return;
    if (key === "ArrowLeft" || key === "a" || key === "A") { game.keyDir = -1; e.preventDefault(); return; }
    if (key === "ArrowRight" || key === "d" || key === "D") { game.keyDir = 1; e.preventDefault(); return; }
    if (key === " " || key === "Enter") {
      // A focused button handles its own click; advancing here too would count twice.
      if (e.target && e.target.tagName === "BUTTON") return;
      if (game.dialog) { e.preventDefault(); advanceDialog(); return; }
      if (!game.overlay && atGate() && !game.entered) { e.preventDefault(); enterStation(); }
    }
  }

  function onKeyUp(e) {
    if (["ArrowLeft", "a", "A"].includes(e.key) && game.keyDir < 0) game.keyDir = 0;
    if (["ArrowRight", "d", "D"].includes(e.key) && game.keyDir > 0) game.keyDir = 0;
  }

  function enterStation() {
    game.entered = true;
    const station = stations[game.progress.cleared];
    const lines = station.ask.map(text => ({ who: station.host, text: text }));
    say(lines, () => {
      openJournal();
    });
  }

  function stageDown(e) {
    if (game.screen !== "journey") return;
    if (game.dialog) { advanceDialog(); return; }
    if (game.overlay) return;
    const H = journeyScene.height();
    if (e.clientY < H * 0.42) return;
    game.holdDir = e.clientX < window.innerWidth / 2 ? -1 : 1;
    try { e.target.setPointerCapture(e.pointerId); } catch (error) { /* ignored */ }
  }

  function stageUp() {
    game.holdDir = 0;
  }

  // ---- resize and loops -------------------------------------------------------

  function cap() {
    return coarseQuery && coarseQuery.matches ? 1.5 : 2;
  }

  function resizeAll() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    journeyScene.resize(W, H, dpr);
    titleScene.resize(W, H, dpr);
  }

  function titleView(t) {
    const cam = t * 14;
    return {
      camX: cam, px: cam + window.innerWidth * 0.36, facing: 1, walking: true, walkT: t * 9,
      season: "春", lanterns: [], inns: [], hint: null, rain: false, mistAlpha: 0, prefetch: 1
    };
  }

  function journeyView() {
    const cleared = game.progress.cleared;
    const season = seasonNow();
    return {
      camX: game.camX,
      px: game.x,
      facing: game.facing,
      walking: game.walking,
      walkT: game.walkT,
      season: season,
      lanterns: game.live,
      inns: stations.map((s, k) => ({ station: k, name: s.inn, x: KuSim.innX(k) })),
      hint: game.hintWorld && game.time < game.hintUntil ? game.hintWorld : null,
      rain: game.rainOn,
      fireX: season === "冬" ? KuSim.innX(6) + 96 : undefined,
      mistAlpha: game.mistAlpha,
      mistX: game.mistX,
      bloom: game.bloom,
      prefetch: game.walking ? Math.sign(game.facing) : 0
    };
  }

  let titleT = 0;

  function frame(now) {
    if (!game.running) return;
    const dt = Math.min(0.05, Math.max(0, (now - game.last) / 1000 || 0));
    game.last = now;
    game.time += dt;
    if (game.screen === "title") {
      titleT += dt;
      titleScene.frame(dt, titleView(titleT));
    } else if (game.screen === "journey") {
      updateWorld(dt);
      if (game.dialog && game.dialog.typing) {
        const line = game.dialog.lines[game.dialog.i];
        game.dialog.pos = Math.min(line.text.length, game.dialog.pos + dt * 46);
        if (game.dialog.pos >= line.text.length) game.dialog.typing = false;
        updateDialogText();
        if (!game.dialog.typing) $("dlgNext").textContent = game.dialog.i === game.dialog.lines.length - 1 ? "閉じる ▾" : "続ける ▾";
      }
      journeyScene.frame(dt, journeyView());
    }
    window.requestAnimationFrame(frame);
  }

  function start() {
    if (game.running) return;
    game.running = true;
    game.last = performance.now();
    window.requestAnimationFrame(frame);
  }

  function stop() {
    game.running = false;
  }

  // ---- wiring -------------------------------------------------------------

  function bind() {
    $("btnNew").addEventListener("click", () => {
      KuAudio.start();
      const save = readSave();
      const hasProgress = !!save && (save.progress.cleared > 0 || save.taken.length > 0);
      if (hasProgress) {
        $("confirmNew").hidden = false;
        $("confirmYes").focus();
        return;
      }
      startNew();
    });
    $("confirmYes").addEventListener("click", () => {
      $("confirmNew").hidden = true;
      startNew();
    });
    $("confirmNo").addEventListener("click", () => {
      $("confirmNew").hidden = true;
      $("btnNew").focus();
    });
    $("btnContinue").addEventListener("click", () => {
      KuAudio.start();
      continueSaved();
    });
    $("btnSound").addEventListener("click", toggleSound);
    $("hudSound").addEventListener("click", toggleSound);
    $("hudJournal").addEventListener("click", () => {
      if (game.overlay === "journal") closeJournal();
      else if (!game.overlay) openJournal();
    });
    $("hudAnthology").addEventListener("click", openAnthology);
    $("doorBtn").addEventListener("click", () => { if (!game.dialog) enterStation(); });
    $("dlgNext").addEventListener("click", advanceDialog);
    $("dialog").addEventListener("click", e => { if (e.target.id !== "dlgNext") advanceDialog(); });
    $("jClose").addEventListener("click", closeJournal);
    $("jHint").addEventListener("click", showHint);
    $("jReset").addEventListener("click", resetDraft);
    $("jSubmit").addEventListener("click", submitPoem);
    $("vProceed").addEventListener("click", proceedFromVerdict);
    $("anthClose").addEventListener("click", closeAnthology);
    $("anthBack").addEventListener("click", closeAnthology);
    $("endAnth").addEventListener("click", () => {
      $("ending").hidden = true;
      game.overlay = null;
      openAnthology();
    });
    $("endTitleBtn").addEventListener("click", () => {
      $("ending").hidden = true;
      game.overlay = null;
      showScreen("title");
      refreshTitle();
      $("btnContinue").focus();
    });

    const stage = $("stage");
    stage.addEventListener("pointerdown", stageDown);
    window.addEventListener("pointerup", e => { stageUp(); endDrag(e); });
    window.addEventListener("pointercancel", () => { stageUp(); game.dragging = null; });
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => { game.keyDir = 0; game.holdDir = 0; });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stop();
        persist();
      } else {
        start();
      }
    });
    window.addEventListener("pagehide", persist);

    let resizeQueued = false;
    const queueResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      window.requestAnimationFrame(() => {
        resizeQueued = false;
        resizeAll();
      });
    };
    window.addEventListener("resize", queueResize);
    window.addEventListener("orientationchange", queueResize);

    if (reduceQuery) {
      const onReduce = () => {
        reduced = reduceQuery.matches;
        journeyScene.setReduced(reduced);
        titleScene.setReduced(reduced);
      };
      if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onReduce);
    }
  }

  function boot() {
    reduced = !!(reduceQuery && reduceQuery.matches);
    game.sound = readSound();
    KuAudio.setMuted(!game.sound);
    updateSoundButtons();
    journeyScene = KuScene.create($("stage"), { cap: cap(), coarse: !!(coarseQuery && coarseQuery.matches), reduced: reduced });
    titleScene = KuScene.create($("titleStage"), { cap: cap(), coarse: !!(coarseQuery && coarseQuery.matches), reduced: reduced });
    resizeAll();
    refreshTitle();
    bind();
    renderHud();
    showScreen("title");
    start();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) game.last = performance.now(); });
  }

  // Test hook (see the comment at the top of this file).
  window.kuDebug = {
    state: function () {
      return {
        screen: game.screen,
        cleared: game.progress.cleared,
        poems: game.progress.poems.length,
        hand: game.hand.map(t => t.word),
        draft: game.draft.lines.map(line => line.map(t => t.word)),
        x: Math.round(game.x),
        limit: KuSim.walkLimit(game.progress.cleared),
        overlay: game.overlay,
        dialog: !!game.dialog,
        atGate: atGate(),
        season: seasonNow()
      };
    },
    collect: function (id) {
      const lantern = lanternById.get(id);
      if (!lantern || game.taken.has(id)) return false;
      const tile = KuSim.tileFor(lantern.word, id);
      game.taken.add(id);
      game.hand.push(tile);
      setLive();
      renderHud();
      return true;
    },
    setX: function (x) {
      game.x = Math.max(0, Math.min(KuSim.walkLimit(game.progress.cleared), x));
      game.camX = game.x - 300;
      return game.x;
    },
    setCleared: function (n) {
      game.progress.cleared = Math.max(0, Math.min(KuSim.STATION_COUNT, n));
      renderHud();
    },
    openJournal: openJournal,
    closeJournal: closeJournal,
    openAnthology: openAnthology,
    openEnding: openEnding,
    lanterns: function () {
      return lanterns.map(l => ({ id: l.id, word: l.word, x: l.x, station: l.station }));
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
