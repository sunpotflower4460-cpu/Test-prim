// DOM layer: dialogue card with typewriter, HUD, timing and drag overlays, dialogs and toast.
// It only shows what the controller hands it. It holds no game state.

export function createUI(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const els = {
    title: $("title"), btnStart: $("btnStart"), btnContinue: $("btnContinue"),
    hud: $("hud"), dishName: $("dishName"), stepLabel: $("stepLabel"), stepHint: $("stepHint"),
    progressBar: $("progressBar"), checklist: $("checklist"), basket: $("basket"),
    btnNote: $("btnNote"), btnPause: $("btnPause"),
    prompt: $("prompt"), promptText: $("promptText"),
    timing: $("timing"), zone: $("zone"), needle: $("needle"),
    dragRing: $("dragRing"), dragText: $("dragText"), holdBar: $("holdBar"), holdFill: $("holdFill"),
    actions: $("actions"), btnAct: $("btnAct"), btnHelp: $("btnHelp"),
    joy: $("joy"), knob: $("knob"),
    talk: $("talk"), speaker: $("speaker"), line: $("line"),
    dlgMenu: $("dlgMenu"), menuList: $("menuList"),
    dlgNote: $("dlgNote"), noteTabs: $("noteTabs"), noteCard: $("noteCard"),
    dlgPause: $("dlgPause"), musicVol: $("musicVol"), sfxVol: $("sfxVol"), mute: $("mute"),
    btnResume: $("btnResume"), btnToTitle: $("btnToTitle"),
    finish: $("finish"), finishTitle: $("finishTitle"), finishSub: $("finishSub"), finishOk: $("finishOk"),
    toast: $("toast")
  };

  let typeTimer = 0;
  let hideTimer = 0;
  let typing = null;
  let toastTimer = 0;
  let onBlip = null;

  // Typewriter dialogue. Click or tap advances or finishes the line.
  function say(speaker, text, opts = {}) {
    if (!text) return;
    clearTimeout(hideTimer);
    clearInterval(typeTimer);
    els.speaker.textContent = speaker || "ちよおばちゃん";
    els.line.textContent = "";
    els.talk.hidden = false;
    doc.body.classList.add("talking");
    els.talk.classList.toggle("family", !!opts.family);
    els.talk.classList.remove("show");
    void els.talk.offsetWidth;
    els.talk.classList.add("show");
    const chars = Array.from(text);
    let i = 0;
    typing = { full: text, speed: opts.speed || 34 };
    if (reduced) {
      els.line.textContent = text;
    } else {
      typeTimer = setInterval(() => {
        i++;
        els.line.textContent = chars.slice(0, i).join("");
        if (i % 2 === 0 && onBlip) onBlip();
        if (i >= chars.length) {
          clearInterval(typeTimer);
          typing = null;
          scheduleHide(opts);
        }
      }, typing.speed);
    }
    if (reduced) {
      typing = null;
      scheduleHide(opts);
    }
  }

  function scheduleHide(opts) {
    clearTimeout(hideTimer);
    if (opts.persist) return;
    const ms = Math.min(9000, 3200 + Array.from(els.line.textContent).length * 70);
    hideTimer = setTimeout(hideTalk, ms);
  }

  function finishTyping() {
    if (!typing) return false;
    clearInterval(typeTimer);
    els.line.textContent = typing.full;
    typing = null;
    return true;
  }

  function hideTalk() {
    clearTimeout(hideTimer);
    clearInterval(typeTimer);
    typing = null;
    els.talk.classList.remove("show");
    els.talk.hidden = true;
    doc.body.classList.remove("talking");
  }

  function talkVisible() {
    return !els.talk.hidden;
  }

  function setBlip(fn) {
    onBlip = fn;
  }

  function setPhase(phase) {
    doc.body.dataset.phase = phase;
    doc.body.classList.toggle("phase-play", phase === "play");
    doc.body.classList.toggle("phase-title", phase === "title");
    els.title.hidden = phase !== "title";
    els.hud.hidden = phase !== "play";
  }

  // HUD
  function setDish(name) {
    els.dishName.textContent = name || "";
  }

  function setStep(step, hint, progress) {
    els.stepLabel.textContent = step || "";
    els.stepHint.textContent = hint || "";
    const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    els.progressBar.style.width = pct + "%";
  }

  // rows: [{ label, done }]
  function setChecklist(rows) {
    const frag = doc.createDocumentFragment();
    for (const r of rows) {
      const li = doc.createElement("li");
      li.className = r.done ? "done" : r.current ? "current" : "";
      li.textContent = r.label;
      frag.appendChild(li);
    }
    els.checklist.replaceChildren(frag);
  }

  function setBasket(text) {
    els.basket.textContent = text || "";
    els.basket.hidden = !text;
  }

  function setPrompt(text, show) {
    if (!show || !text) {
      els.prompt.hidden = true;
      return;
    }
    els.prompt.hidden = false;
    els.promptText.textContent = text;
  }

  function setActions(show, opts = {}) {
    els.actions.hidden = !show;
    if (opts.act !== undefined) els.btnAct.textContent = opts.act;
    els.btnHelp.disabled = !!opts.helpDisabled;
  }

  function timing(show, state) {
    els.timing.hidden = !show;
    if (!show || !state) return;
    els.zone.style.left = ((state.center - state.half) * 100).toFixed(2) + "%";
    els.zone.style.width = (state.half * 200).toFixed(2) + "%";
    els.needle.style.left = (state.pos * 100).toFixed(2) + "%";
  }

  function dragRing(show, x, y, progress, text) {
    els.dragRing.hidden = !show;
    if (!show) return;
    els.dragRing.style.left = x + "px";
    els.dragRing.style.top = y + "px";
    els.dragRing.style.setProperty("--p", String(Math.max(0, Math.min(1, progress))));
    els.dragText.textContent = text || "";
  }

  function holdBar(show, progress) {
    els.holdBar.hidden = !show;
    if (show) els.holdFill.style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + "%";
  }

  function joystick(show, x, y, kx, ky) {
    els.joy.hidden = !show;
    if (!show) return;
    els.joy.style.left = x + "px";
    els.joy.style.top = y + "px";
    els.knob.style.transform = "translate(" + kx + "px," + ky + "px)";
  }

  function toast(text, ms = 2400) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
  }

  function finish(show, title, sub) {
    els.finish.hidden = !show;
    if (show) {
      els.finishTitle.textContent = title || "できあがり！";
      els.finishSub.textContent = sub || "";
    }
  }

  // Dialogs
  const dialogs = [els.dlgMenu, els.dlgNote, els.dlgPause];
  function openDialog(node) {
    for (const d of dialogs) d.hidden = d !== node;
  }
  function closeDialogs() {
    for (const d of dialogs) d.hidden = true;
  }
  function dialogOpen() {
    return dialogs.some((d) => !d.hidden);
  }
  function openNode() {
    return dialogs.find((d) => !d.hidden) || null;
  }

  // Menu of dishes
  function renderMenu(list, onPick) {
    const frag = doc.createDocumentFragment();
    list.forEach((item) => {
      const card = doc.createElement("button");
      card.type = "button";
      card.className = "menu-item";
      card.innerHTML = '<span class="mi-name"></span><span class="mi-blurb"></span><span class="mi-meta"></span>';
      card.querySelector(".mi-name").textContent = item.name;
      card.querySelector(".mi-blurb").textContent = item.blurb;
      card.querySelector(".mi-meta").textContent = item.cooked > 0 ? item.cooked + "回つくりました" : "はじめて";
      card.addEventListener("click", () => onPick(item.id));
      frag.appendChild(card);
    });
    els.menuList.replaceChildren(frag);
  }

  // Notebook: tabs for each recipe, then the card. Locked cards show question marks.
  function renderNote(cards, selected, onSelect) {
    const tabFrag = doc.createDocumentFragment();
    cards.forEach((c) => {
      const b = doc.createElement("button");
      b.type = "button";
      b.role = "tab";
      b.className = "tab" + (c.id === selected ? " on" : "") + (c.locked ? " locked" : "");
      b.setAttribute("aria-selected", c.id === selected ? "true" : "false");
      b.textContent = c.locked ? "？？？" : c.name;
      b.addEventListener("click", () => onSelect(c.id));
      tabFrag.appendChild(b);
    });
    els.noteTabs.replaceChildren(tabFrag);
    const card = cards.find((c) => c.id === selected) || cards[0];
    const page = doc.createElement("div");
    if (!card) return;
    if (card.locked) {
      page.innerHTML = '<h3 class="cn"></h3><p class="cb"></p><p class="cq">まだ作ったことがないのよ。作ってみると、このページに書けるわ。</p>';
      page.querySelector(".cn").textContent = "？？？";
      page.querySelector(".cb").textContent = "ひみつの一品";
    } else {
      page.innerHTML = '<h3 class="cn"></h3><p class="cb"></p><h4>材料</h4><ul class="cing"></ul><h4>手順</h4><ol class="csteps"></ol><p class="cc"></p>';
      page.querySelector(".cn").textContent = card.name;
      page.querySelector(".cb").textContent = card.blurb;
      const ing = page.querySelector(".cing");
      card.ingredients.forEach((t) => { const li = doc.createElement("li"); li.textContent = t; ing.appendChild(li); });
      const st = page.querySelector(".csteps");
      card.steps.forEach((t) => { const li = doc.createElement("li"); li.textContent = t; st.appendChild(li); });
      page.querySelector(".cc").textContent = "つくった回数：" + card.cooked + "回";
    }
    els.noteCard.replaceChildren(page);
  }

  function bindPause(get, set) {
    const syncFromSettings = () => {
      const s = get();
      els.musicVol.value = String(Math.round(s.music * 100));
      els.sfxVol.value = String(Math.round(s.sfx * 100));
      els.mute.checked = !!s.muted;
    };
    els.musicVol.addEventListener("input", () => set({ music: Number(els.musicVol.value) / 100 }));
    els.sfxVol.addEventListener("input", () => set({ sfx: Number(els.sfxVol.value) / 100 }));
    els.mute.addEventListener("change", () => set({ muted: els.mute.checked }));
    return syncFromSettings;
  }

  return {
    els,
    say, hideTalk, finishTyping, talkVisible, setBlip,
    setPhase, setDish, setStep, setChecklist, setBasket,
    setPrompt, setActions, timing, dragRing, holdBar, joystick,
    toast, finish,
    openDialog, closeDialogs, dialogOpen, openNode,
    renderMenu, renderNote, bindPause,
    reduced
  };
}
