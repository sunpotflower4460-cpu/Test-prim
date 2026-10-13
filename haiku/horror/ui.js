// DOM overlays: title, pause, diary, call choice, cards, HUD, subtitles and the glass overlay.
const Story = window.NakiIdoStory;
const Sim = window.NakiIdoSim;

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
    choiceText: $("choiceText"),
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

  function showChoice(seconds, text) {
    el.choiceText.textContent = text || "返事を、しますか。";
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

  // The words for the prompt: what the key does, in Japanese.
  function promptLabel(ctx) {
    const A = Story.ACTION;
    switch (ctx.key) {
      case "take": return A.take[ctx.itemKind] || "拾う";
      case "read": return A.read;
      case "open": return A.open[ctx.doorKind] || "開ける";
      case "close": return A.close[ctx.doorKind] || "閉める";
      case "burn": return A.burn;
      case "search": return ctx.search || A.search;
      case "well": return A.well;
      case "lid": return A.lid;
      case "wellLook": return A.wellLook;
      default: return A.search;
    }
  }

  // The short word for the round touch button.
  function shortLabel(ctx) {
    if (!ctx) return "調べる";
    return Story.ACTION_SHORT[ctx.key] || "調べる";
  }

  function setText(node, value, key) {
    if (shown[key] === value) return;
    shown[key] = value;
    node.textContent = value;
  }

  // Colour states for the light line: off is muted, on is warm, low and dead are red.
  function setLightClass(cls) {
    if (shown.lightClass === cls) return;
    shown.lightClass = cls;
    el.lightState.classList.remove("on", "warn", "low", "dead");
    if (cls) el.lightState.classList.add(cls);
  }

  function updateHud(state, ctx, lookLocked, touch) {
    const O = Sim.objectiveOf(handlers.world, state);
    setText(el.objective, Story.objectiveText(O), "objective");
    const diaryN = Object.keys(state.notes).length;
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
    setText(el.batteryCount, `予備電池 ${state.inv.battery}`, "batteryCount");
    let light;
    let cls = "";
    if (state.light) {
      const warn = state.flicker < 1;
      light = `点灯 ${pct}%`;
      cls = state.charge < 0.2 ? "low" : warn ? "warn" : "on";
      if (warn) light = `点滅 ${pct}%`;
    } else if (state.charge <= 0 && state.inv.battery <= 0) {
      light = "電池切れ・予備なし";
      cls = "dead";
    } else if (state.charge <= 0) {
      light = "電池切れ・Fで交換";
      cls = "dead";
    } else {
      light = touch ? "消灯・「灯」で点ける" : "消灯・Fで点ける";
    }
    setText(el.lightState, light, "light");
    setLightClass(cls);

    const seen = !!state.ent.seen;
    el.crosshair.classList.toggle("seen", seen);
    // While the call box is up, the prompt steps aside so the two do not overlap.
    const choiceUp = !el.choice.hidden;
    const prompt = ctx && !choiceUp ? "E " + promptLabel(ctx) : "";
    if (shown.prompt !== prompt) {
      shown.prompt = prompt;
      el.prompt.textContent = prompt;
      el.prompt.classList.toggle("on", !!prompt);
    }
    if (touch) {
      const label = shortLabel(ctx);
      if (el.actInteractLabel.textContent !== label) el.actInteractLabel.textContent = label;
      el.actInteract.classList.toggle("idle", !ctx);
    }
    const wantHint = !lookLocked && !touch && !!(handlers.showLockHint && handlers.showLockHint());
    el.lockHint.hidden = !wantHint;
    el.vignette.style.setProperty("--fear", (state.fear || 0).toFixed(3));
  }

  // ---------- glass: beads of rain on a window, lit from the room side ----------

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

  // A bead either sits on the glass until it grows heavy (hold), then slides down
  // with a thin trail. Some beads never move; they are the stuck ones.
  function newBead(y) {
    const stuck = grand() < 0.35;
    return {
      x: grand() * window.innerWidth,
      y: y === undefined ? grand() * window.innerHeight : y,
      r: 1.1 + grand() * 2.4,
      v: 0,
      len: 0,
      hold: stuck ? 1e9 : grand() * 9,
      sliding: false
    };
  }
  for (let i = 0; i < 120; i++) drops.push(newBead());

  function updateGlass(dt, active) {
    el.glass.style.opacity = active ? "1" : "0";
    if (!active) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    glassCtx.clearRect(0, 0, w, h);
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.sliding) {
        d.hold -= dt;
        if (d.hold <= 0 && grand() < 0.02) {
          d.sliding = true;
          d.v = 2 + grand() * 3;
        }
      } else {
        d.v += dt * 2.2;
        d.len += d.v * dt * 0.7;
        d.y += d.v * dt * 0.7;
      }
      const r = d.r;
      // A bead: dark body, a bright specular glint on its upper left.
      glassCtx.fillStyle = "rgba(40,52,74,0.18)";
      glassCtx.beginPath();
      glassCtx.ellipse(d.x, d.y, r * 0.9, r * 1.05, 0, 0, Math.PI * 2);
      glassCtx.fill();
      glassCtx.fillStyle = "rgba(226,236,255,0.34)";
      glassCtx.beginPath();
      glassCtx.ellipse(d.x - r * 0.3, d.y - r * 0.4, r * 0.28, r * 0.36, 0, 0, Math.PI * 2);
      glassCtx.fill();
      if (d.sliding && d.len > 6) {
        glassCtx.strokeStyle = "rgba(190,206,234,0.14)";
        glassCtx.lineWidth = Math.max(0.6, r * 0.5);
        glassCtx.beginPath();
        glassCtx.moveTo(d.x, d.y - Math.min(d.len, 70));
        glassCtx.lineTo(d.x, d.y - r);
        glassCtx.stroke();
      }
      if (d.y > h + 12) {
        drops[i] = newBead(-12);
        drops[i].hold = 0.5 + grand() * 2;
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
    resetShown() {
      shown = { objective: null, diary: null, shells: null, reserve: null, battery: null, light: null, room: null, prompt: null, batteryCount: null };
    }
  };
}
