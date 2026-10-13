// 鳴き井戸 entry point. Owns the mode (title, play, pause, diary, ending) and the frame loop.
//
// Debug hook: window.nakiIdoDebug is read-only except teleport(x, y, yaw), which moves the
// player for tests. snapshot() returns plain data about the current run.
import { createRender } from "./render.js";
import { createAudio } from "./audio.js";
import { createInput } from "./input.js";
import { createUI } from "./ui.js";

const Sim = window.NakiIdoSim;
const Levels = window.NakiIdoLevels;
const Story = window.NakiIdoStory;
const STORE_KEY = "haiku-horror-v1";
const SEED = Levels.LEVEL.seed;
const world = Sim.buildWorld(Levels.LEVEL);
const touchDevice = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

// ---------- storage (per-viewer convenience only; every access is guarded) ----------

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return Sim.decodeStore(world, null);
    return Sim.decodeStore(world, JSON.parse(raw));
  } catch (e) {
    return Sim.decodeStore(world, null);
  }
}

function writeStore() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(Sim.encodeStore(cp, settings)));
  } catch (e) {
    // Storage may be blocked. The game keeps working without it.
  }
}

// ---------- state ----------

const stored = readStore();
let settings = stored.settings;
let cp = stored.cp;
let mode = "title";
let state = null;
let pendingActions = [];
let pendingDiary = null;
let pitchView = 0;
let last = performance.now();
let rendered = null;

const canvas = document.getElementById("view");
const render = createRender(canvas, world);
const audio = createAudio();
const ui = createUI({
  roomLabel: r => (Levels.LEVEL.rooms[r] ? Levels.LEVEL.rooms[r].label : ""),
  showLockHint: () => mode === "play" && !touchDevice
});
const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
void reduced;

const input = createInput({
  canvas,
  touchLayer: document.getElementById("touch"),
  isPlaying: () => mode === "play",
  sens: () => settings.sens,
  onPause: () => pause(),
  onLockLost: () => pause(),
  onStick: s => ui.setStick(s)
});

render.setExposure(settings.gamma);
audio.setEnabled(settings.sound);

function setMode(next) {
  mode = next;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------- flows ----------

function toTitle() {
  mode = "title";
  state = null;
  pendingActions = [];
  pendingDiary = null;
  input.clear();
  input.unlock();
  ui.clearSubs();
  ui.hideChoice();
  ui.hideDiary();
  ui.hideCard();
  ui.hidePause();
  ui.setHudVisible(false);
  ui.setTouchVisible(false);
  ui.showTitle(!!cp);
}

function startNew() {
  audio.unlock();
  audio.setEnabled(settings.sound);
  cp = null;
  writeStore();
  state = Sim.newGame(world, SEED);
  begin();
  ui.say(Story.LINES.arrive, 5200);
  ui.say(Story.LINES.arrive2, 5200);
}

function continueRun() {
  if (!cp) return;
  audio.unlock();
  audio.setEnabled(settings.sound);
  state = Sim.restore(world, cp);
  begin();
}

function begin() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  mode = "play";
  ui.hideTitle();
  ui.hidePause();
  ui.setHudVisible(true);
  ui.setTouchVisible(touchDevice);
  ui.resetShown();
  input.clear();
  input.lock();
  rendered = null;
}

function pause() {
  if (mode !== "play") return;
  mode = "pause";
  input.unlock();
  ui.hideChoice();
  ui.showPause(settings);
  ui.setHudVisible(false);
  ui.setTouchVisible(false);
}

function resume() {
  if (mode !== "pause") return;
  mode = "play";
  ui.hidePause();
  ui.setHudVisible(true);
  ui.setTouchVisible(touchDevice);
  input.clear();
  if (!touchDevice) input.lock();
}

function openDiary(id) {
  if (mode !== "play") return;
  mode = "diary";
  ui.setHudVisible(false);
  ui.setTouchVisible(false);
  input.unlock();
  ui.showDiary(id);
}

function closeDiary() {
  if (mode !== "diary") return;
  ui.hideDiary();
  mode = "play";
  ui.setHudVisible(true);
  ui.setTouchVisible(touchDevice);
  input.clear();
  if (!touchDevice) input.lock();
}

function endGame(kind) {
  const E = Story.ENDINGS[kind];
  mode = "ending";
  ui.hideChoice();
  ui.setHudVisible(false);
  ui.setTouchVisible(false);
  input.unlock();
  // A finished run is not kept as a save.
  cp = null;
  writeStore();
  ui.showCard(E.title, E.body.join("\n"), 5600, () => toTitle());
}

// ---------- events from the sim ----------

function humInfo(s) {
  const e = s.ent;
  const p = s.player;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  const prox = clamp01(1 - d / 22);
  let vol;
  if (!s.awakened) vol = 0.035;
  else vol = 0.05 + 0.24 * prox * prox;
  if (e.state === "FROZEN") vol *= 1.5;
  if (e.state === "STUNNED") vol *= 1.25;
  if (e.state === "SEALED") vol = 0.015;
  const right = [Math.cos(p.yaw), -Math.sin(p.yaw)];
  const side = (dx * right[0] + dy * right[1]) / d;
  return { humVol: vol, humPan: Math.max(-0.9, Math.min(0.9, side * 0.9)), fear: s.fear };
}

function onGrab() {
  audio.grab();
  ui.fade(true);
  const C = Story.CARDS;
  const line = cp ? C.grabCheckpoint : C.grabStart;
  ui.showCard(C.grab.title, line, 1500, () => {});
}

function handleEvents(events) {
  render.onEvents(events);
  for (const e of events) {
    switch (e.type) {
      case "msg":
        ui.say(Story.LINES[e.key], 2600);
        audio.msg();
        break;
      case "narr":
        ui.say(Story.LINES[e.key], 5200);
        break;
      case "call":
        ui.say(Story.LINES.call, 5600);
        ui.showChoice(6);
        audio.voice();
        break;
      case "silence":
        ui.hideChoice();
        ui.say(Story.LINES.silence, 3600);
        break;
      case "answer":
        ui.hideChoice();
        break;
      case "ending":
        endGame(e.kind);
        break;
      case "pickup":
        audio.pickup();
        break;
      case "note":
        pendingDiary = e.id;
        break;
      case "door":
        if (e.by !== "ambient") audio.door(e.open);
        break;
      case "shot":
        audio.shot();
        break;
      case "dry":
        audio.click("dry");
        break;
      case "break":
        audio.click("break");
        break;
      case "load":
        audio.click("load");
        break;
      case "flash":
        audio.flash();
        break;
      case "battery-swap":
        audio.click("battery");
        break;
      case "footstep":
        audio.footstep(e.surface, e.running);
        break;
      case "ent-step":
        audio.entStep(e.surface);
        break;
      case "freeze":
        audio.freeze();
        break;
      case "scream":
      case "stun":
        if (e.type === "scream") audio.scream();
        break;
      case "grab":
        onGrab();
        break;
      case "respawn":
        ui.fade(false);
        ui.hideCard();
        ui.clearSubs();
        break;
      case "burn":
        audio.burn();
        break;
      case "checkpoint":
        cp = e.cp;
        writeStore();
        break;
      case "seal":
        audio.seal();
        break;
      case "lid":
        audio.lid();
        break;
      case "thunder":
        audio.thunder(e.strength);
        break;
      case "ambient":
        if (e.kind === "slam") audio.slam();
        else if (e.kind === "rustle") audio.paper();
        else if (e.kind === "silhouette") audio.door(true);
        else if (e.kind === "chime-ping") audio.chimePing();
        break;
      case "narr-line":
        break;
      default:
        break;
    }
  }
  if (pendingDiary && mode === "play") {
    const id = pendingDiary;
    pendingDiary = null;
    openDiary(id);
  }
}

// ---------- wiring ----------

ui.el.btnNew.addEventListener("click", startNew);
ui.el.btnContinue.addEventListener("click", continueRun);
ui.el.btnResume.addEventListener("click", resume);
ui.el.btnTitle.addEventListener("click", toTitle);
ui.el.sens.addEventListener("input", e => {
  settings = Object.assign({}, settings, { sens: Number(e.target.value) });
  writeStore();
});
ui.el.gamma.addEventListener("input", e => {
  settings = Object.assign({}, settings, { gamma: Number(e.target.value) });
  render.setExposure(settings.gamma);
  writeStore();
});
ui.el.sound.addEventListener("click", () => {
  settings = Object.assign({}, settings, { sound: !settings.sound });
  audio.setEnabled(settings.sound);
  ui.showPause(settings);
  writeStore();
});
ui.el.diaryClose.addEventListener("click", closeDiary);
ui.el.btnAnswer.addEventListener("click", () => pendingActions.push("answer"));
ui.el.btnSilence.addEventListener("click", () => pendingActions.push("silence"));
ui.el.btnPauseTouch.addEventListener("click", pause);
ui.el.actInteract.addEventListener("pointerdown", e => e.stopPropagation());

// Keys that belong to menus: Escape resumes or closes, E closes the diary.
window.addEventListener("keydown", e => {
  if (mode === "pause" && e.code === "Escape") {
    e.preventDefault();
    resume();
  } else if (mode === "diary" && (e.code === "Escape" || e.code === "KeyE")) {
    e.preventDefault();
    closeDiary();
  }
});

// Touch controls: the on-screen actions go through the same queue as the keyboard.
document.querySelectorAll("[data-act]").forEach(btn => {
  btn.addEventListener("click", e => {
    if (mode !== "play") return;
    const name = btn.dataset.act;
    if (name === "pause") pause();
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "play") pause();
  }
});

window.addEventListener("resize", () => {
  render.resize(window.innerWidth, window.innerHeight);
});
render.resize(window.innerWidth, window.innerHeight);

// ---------- frame loop ----------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  let ev = [];
  const inp = input.poll();
  if (mode === "play" && state) {
    inp.actions = pendingActions.splice(0).concat(inp.actions);
    ev = Sim.step(world, state, inp, dt);
    pitchView = inp.pitch;
  } else {
    pendingActions.length = 0;
    pitchView = inp.pitch;
  }
  if (ev.length) handleEvents(ev);

  render.update(mode === "title" || !state ? null : state, dt, now / 1000, { pitch: pitchView });
  rendered = now;

  if (state && (mode === "play" || mode === "pause" || mode === "diary" || mode === "ending")) {
    const info = humInfo(state);
    info.outdoors = render.outdoors;
    info.clockSec = Math.floor(state.t);
    const r = state.player.room;
    info.clockOn = r === "ima" || r === "hall" || r === "zashiki";
    info.dt = dt;
    audio.update(dt, info);
  }
  if (state && mode === "play") {
    const ctx = Sim.contextAction(world, state);
    ui.updateHud(state, ctx, input.isLocked(), touchDevice);
  }
  ui.updateGlass(dt, !!state && !render.outdoors && mode !== "title");
}

requestAnimationFrame(frame);
toTitle();

window.nakiIdoDebug = {
  mode: () => mode,
  snapshot() {
    if (!state) return { mode, cp: !!cp };
    const e = state.ent;
    return {
      mode,
      room: state.player.room,
      x: state.player.x,
      y: state.player.y,
      yaw: state.player.yaw,
      inv: Object.assign({}, state.inv),
      charge: state.charge,
      light: state.light,
      gun: { chambers: state.gun.chambers.slice(), state: state.gun.state },
      taken: Object.keys(state.taken).length,
      placed: state.placed,
      lid: state.seal.lid,
      ending: state.ending,
      choice: !!state.choice,
      awakened: state.awakened,
      ent: { x: e.x, y: e.y, state: e.state, seen: !!e.seen },
      cp: !!cp
    };
  },
  teleport(x, y, yaw) {
    if (!state) return false;
    const c = world.at(Math.floor(x), Math.floor(y));
    if (!c || !c.walk) return false;
    state.player.x = x;
    state.player.y = y;
    if (typeof yaw === "number") state.player.yaw = yaw;
    state.player.room = Sim.roomAt(world, x, y);
    return true;
  }
};
