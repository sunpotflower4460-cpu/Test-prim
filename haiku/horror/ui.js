// DOM overlays: title, pause, diary, call choice, cards, HUD, subtitles and the glass overlay.
const Story = window.NakiIdoStory;

const $ = id => document.getElementById(id);

export function createUI(handlers) {
  const el = {
    title: $("title"),
    btnNew: $("btnNew"),
    btnContinue: $("btnContinue"),
    controls: $("controlsList"),
    pause: $("pause"),
    btnResume: $("btnResume"),
    sens: $("sensRange"),
    gamma: $("gammaRange"),
    sound: $("soundToggle"),
    btnTitle: $("btnTitle"),
    diary: $("diary"),
    diaryTitle: $("diaryTitle"),
    diaryPlace: $("diaryPlace"),
    diaryBody: $("diaryBody"),
    diaryClose: $("diaryClose"),
    choice: $("choice"),
    btnAnswer: $("btnAnswer"),
    btnSilence: $("btnSilence"),
    choiceBar: $("choiceBar"),
    card: $("card"),
    cardTitle: $("cardTitle"),
    cardBody: $("cardBody"),
    subs: $("subs"),
    prompt: $("prompt"),
    objective: $("objective"),
    diaryCount: $("diaryCount"),
    roomName: $("roomName"),
    shells: [$("shell0"), $("shell1")],
    reserve: $("reserveCount"),
    batteryFill: $("batteryFill"),
    batteryCount: $("batteryCount"),
    lightState: $("lightState"),
    crosshair: $("crosshair"),
    vignette: $("vignette"),
    fade: $("fade"),
    hud: $("hud"),
    touch: $("touch"),
    stick: $("stick"),
    stickKnob: $("stickKnob"),
    actInteract: $("actInteract"),
    actInteractLabel: $("actInteractLabel"),
    btnPauseTouch: $("btnPauseTouch"),
    lockHint: $("lockHint"),
    glass: $("glass"),
    loading: null
  };
  const glassCtx = el.glass.getContext("2d");

  // Controls card on the title screen, from the shared text.
  if (el.controls && Story.CONTROLS) {
    const rows = Story.CONTROLS.pc.concat(Story.CONTROLS.touch);
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      el.controls.appendChild(dt);
      el.controls.appendChild(dd);
    }
  }
  let subQueue = [];
  let subTimer = null;
  let cardTimer = null;
  let shown = { objective: null, diary: null, shells: null, reserve: null, battery: null, light: null, room: null, prompt: null };

  // ---------- title and pause ----------

  function showTitle(hasSave) {
    el.title.hidden = false;
    el.pause.hidden = true;
    el.btnContinue.hidden = !hasSave;
    el.hud.hidden = true;
    el.touch.hidden = true;
    el.lockHint.hidden = true;
    el.fade.classList.remove("on");
  }

  function hideTitle() {
    el.title.hidden = true;
  }

  function showPause(settings) {
    el.pause.hidden = false;
    el.sens.value = String(settings.sens);
    el.gamma.value = String(settings.gamma);
    el.sound.setAttribute("aria-pressed", settings.sound ? "true" : "false");
    el.sound.textContent = settings.sound ? "音 あり" : "音 なし";
    el.lockHint.hidden = true;
  }

  function hidePause() {
    el.pause.hidden = true;
  }

  function setTouchVisible(on) {
    el.touch.hidden = !on;
    el.btnPauseTouch.hidden = !on;
  }

  function setHudVisible(on) {
    el.hud.hidden = !on;
  }

  // ---------- diary, choice, cards ----------

  function showDiary(id) {
    const d = Story.DIARY[id];
    if (!d) return;
    el.diaryTitle.textContent = d.title;
    el.diaryPlace.textContent = d.place ? d.place + "で見つけた" : "";
    el.diaryBody.textContent = "";
    for (const line of d.body) {
      const p = document.createElement("p");
      p.textContent = line;
      el.diaryBody.appendChild(p);
    }
    el.diary.hidden = false;
    el.diaryClose.focus();
  }

  function hideDiary() {
    el.diary.hidden = true;
  }

  function showChoice(seconds) {
    el.choice.hidden = false;
    el.choiceBar.style.animation = "none";
    void el.choiceBar.offsetWidth;
    el.choiceBar.style.animation = `choiceDrain ${seconds}s linear forwards`;
    el.btnSilence.focus();
  }

  function hideChoice() {
    el.choice.hidden = true;
  }

  function showCard(title, body, ms, onDone) {
    el.cardTitle.textContent = title;
    el.cardBody.textContent = body;
    el.card.hidden = false;
    el.card.classList.add("on");
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      el.card.classList.remove("on");
      el.card.hidden = true;
      if (onDone) onDone();
    }, ms);
  }

  function hideCard() {
    clearTimeout(cardTimer);
    el.card.classList.remove("on");
    el.card.hidden = true;
  }

  function fade(on) {
    el.fade.classList.toggle("on", !!on);
  }

  // ---------- subtitles ----------

  function say(text, ms = 4200) {
    if (!text) return;
    subQueue.push({ text, ms });
    if (!subTimer) nextSub();
  }

  function nextSub() {
    const item = subQueue.shift();
    if (!item) {
      el.subs.classList.remove("on");
      subTimer = null;
      return;
    }
    el.subs.textContent = item.text;
    el.subs.classList.add("on");
    subTimer = setTimeout(() => {
      subTimer = null;
      nextSub();
    }, item.ms);
  }

  function clearSubs() {
    subQueue = [];
    clearTimeout(subTimer);
    subTimer = null;
    el.subs.classList.remove("on");
  }

  // ---------- HUD ----------

  function labelFor(ctx) {
    if (!ctx) return null;
    const L = Story.LABELS;
    switch (ctx.key) {
      case "take": return L.take;
      case "read": return L.read;
      case "open": return L.open;
      case "close": return L.close;
      case "burn": return L.burn;
      case "search": return ctx.search || "調べる";
      case "well": return L.well;
      case "lid": return L.lid;
      case "wellLook": return L.wellLook;
      default: return "調べる";
    }
  }

  function setText(node, value, key) {
    if (shown[key] === value) return;
    shown[key] = value;
    node.textContent = value;
  }

  function updateHud(state, ctx, lookLocked, touch) {
    const fudaN = Math.min(3, Object.keys(state.taken).filter(id => id.startsWith("fuda")).length);
    const diaryN = Object.keys(state.notes).length;
    setText(el.objective, `札 ${fudaN}/3`, "objective");
    setText(el.diaryCount, `日記 ${diaryN}/3`, "diary");
    const room = state.player.room;
    const roomLabel = room && handlers.roomLabel ? handlers.roomLabel(room) : "";
    setText(el.roomName, roomLabel, "room");
    const g = state.gun;
    el.shells.forEach((slot, i) => {
      const v = g.chambers[i] ? "loaded" : "empty";
      if (slot.dataset.v !== v) {
        slot.dataset.v = v;
        slot.classList.toggle("full", !!g.chambers[i]);
      }
    });
    setText(el.reserve, String(state.inv.shell), "reserve");
    const pct = Math.round(state.charge * 100);
    if (shown.battery !== pct) {
      shown.battery = pct;
      el.batteryFill.style.transform = `scaleX(${state.charge.toFixed(3)})`;
      el.batteryFill.classList.toggle("low", state.charge < 0.2);
    }
    setText(el.batteryCount, `電池 ${state.inv.battery}`, "batteryCount");
    let light;
    if (state.light) light = state.flicker < 1 ? "点滅" : "点灯";
    else light = state.charge <= 0 && state.inv.battery <= 0 ? "切れた" : "消灯";
    setText(el.lightState, light, "light");

    const seen = !!state.ent.seen;
    el.crosshair.classList.toggle("seen", seen);
    const prompt = ctx ? "E " + labelFor(ctx) : "";
    if (shown.prompt !== prompt) {
      shown.prompt = prompt;
      el.prompt.textContent = prompt;
      el.prompt.classList.toggle("on", !!prompt);
    }
    if (touch) {
      const label = ctx ? labelFor(ctx) : "調べる";
      if (el.actInteractLabel.textContent !== label) el.actInteractLabel.textContent = label;
      el.actInteract.classList.toggle("idle", !ctx);
    }
    const wantHint = !lookLocked && !touch && !!(handlers.showLockHint && handlers.showLockHint());
    el.lockHint.hidden = !wantHint;
    el.vignette.style.setProperty("--fear", (state.fear || 0).toFixed(3));
  }

  // ---------- glass: rain running down a window ----------

  const drops = [];
  let glassSeed = 3;
  function grand() {
    glassSeed = (glassSeed * 16807) % 2147483647;
    return glassSeed / 2147483647;
  }
  function sizeGlass() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    el.glass.width = Math.floor(w * dpr);
    el.glass.height = Math.floor(h * dpr);
    el.glass.style.width = w + "px";
    el.glass.style.height = h + "px";
    glassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeGlass();
  window.addEventListener("resize", sizeGlass);
  for (let i = 0; i < 46; i++) {
    drops.push({ x: grand() * window.innerWidth, y: grand() * window.innerHeight, r: 2 + grand() * 5, v: 8 + grand() * 26, len: 0 });
  }

  function updateGlass(dt, active) {
    el.glass.style.opacity = active ? "1" : "0";
    if (!active) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    glassCtx.clearRect(0, 0, w, h);
    for (const d of drops) {
      if (grand() < 0.004) {
        d.x = grand() * w;
        d.y = -10;
        d.r = 2 + grand() * 5;
        d.v = 8 + grand() * 26;
        d.len = 0;
      }
      d.v += dt * 2;
      d.len += d.v * dt * 0.6;
      d.y += d.v * dt * 0.6;
      const r = d.r;
      glassCtx.fillStyle = "rgba(190,205,230,0.10)";
      glassCtx.beginPath();
      glassCtx.ellipse(d.x, d.y, r * 0.8, r, 0, 0, Math.PI * 2);
      glassCtx.fill();
      glassCtx.fillStyle = "rgba(255,255,255,0.22)";
      glassCtx.beginPath();
      glassCtx.ellipse(d.x - r * 0.3, d.y - r * 0.35, r * 0.25, r * 0.3, 0, 0, Math.PI * 2);
      glassCtx.fill();
      if (d.len > 6) {
        glassCtx.strokeStyle = "rgba(180,196,224,0.08)";
        glassCtx.lineWidth = r * 0.5;
        glassCtx.beginPath();
        glassCtx.moveTo(d.x, d.y - d.len);
        glassCtx.lineTo(d.x, d.y - r);
        glassCtx.stroke();
      }
      if (d.y > h + 12) {
        d.y = -12;
        d.len = 0;
        d.x = grand() * w;
      }
    }
  }

  return {
    el,
    showTitle, hideTitle, showPause, hidePause, setTouchVisible, setHudVisible,
    showDiary, hideDiary, showChoice, hideChoice, showCard, hideCard, fade,
    say, clearSubs, updateHud, updateGlass,
    setStick(s) {
      if (!s.active) {
        el.stick.hidden = true;
        return;
      }
      el.stick.hidden = false;
      el.stick.style.left = s.ax + "px";
      el.stick.style.top = s.ay + "px";
      el.stickKnob.style.transform = `translate(${s.kx}px, ${s.ky}px)`;
    },
    setLockHintVisible(on) {
      el.lockHint.hidden = !on;
    },
    resetShown() {
      shown = { objective: null, diary: null, shells: null, reserve: null, battery: null, light: null, room: null, prompt: null, batteryCount: null };
    }
  };
}
