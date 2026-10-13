// おばちゃんの台所: the controller. It connects the pure sim (sim.js) to the 3D scene, input, camera, audio and save.
//
// Test hook: window.obachanKitchenDebug (read-only snapshot plus a few helpers for browser tests).
//   .state()          current phase, recipe, step and hand
//   .world()          a copy of the sim world
//   .run(stationId)   perform the player action at a station (same path as the E key)
//   .assist()         auntie does the current step (same path as the button)
//   .teleport(id)     move the player next to a station
//   .startDish(id)    start a recipe directly
//   .save()           the save object as stored
import * as THREE from "../vendor/three.module.js";
import { buildWorld, updateWorld, STATION_ANCHORS, STATION_NAMES, BOUNDS, LAYOUT } from "./world.js";
import { createAuntie, createPlayer, createUncle, createMisaki, animateWalk, setPose, blinkEyes, lookAt } from "./characters.js";
import { createFx } from "./fx.js";
import { createProps } from "./props.js";
import { createAudio } from "./audio.js";
import { createUI } from "./ui.js";
import * as TX from "./textures.js";

const Sim = window.ObachanSim;
const LINES = window.ObachanLines.LINES;
const pick = window.ObachanLines.pick;
const RECIPES = Sim.RECIPES;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touchDevice = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const AUNTIE = "ちよおばちゃん";
const UNCLE = "たつおおじさん";
const MISAKI = "みさきちゃん";

// ---------- Save -----------------------------------------------------------
function readSave() {
  try {
    return Sim.parseSave(localStorage.getItem(Sim.SAVE_KEY)) || Sim.emptySave();
  } catch (e) {
    return Sim.emptySave();
  }
}
let save = readSave();
function writeSave() {
  try {
    const text = Sim.serializeSave(Object.assign({}, save, { dish: world && !world.done ? world : null }));
    if (text) localStorage.setItem(Sim.SAVE_KEY, text);
  } catch (e) {
    /* storage can be blocked: the game still works */
  }
}
function hasSave() {
  try {
    return localStorage.getItem(Sim.SAVE_KEY) !== null;
  } catch (e) {
    return false;
  }
}

// ---------- Renderer, scene, camera ------------------------------------------
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3f5);
scene.fog = new THREE.Fog(0xf2dcb8, 70, 170);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const w3 = buildWorld(scene);
const props = createProps(scene);
const fx = createFx(scene);
const auntie = createAuntie();
const player = createPlayer();
const uncle = createUncle();
const misaki = createMisaki();
scene.add(auntie, player, uncle, misaki);
uncle.position.set(LAYOUT.seats.uncle.x, 0, LAYOUT.seats.uncle.z);
uncle.rotation.y = LAYOUT.seats.uncle.rot;
misaki.position.set(LAYOUT.seats.misaki.x, 0, LAYOUT.seats.misaki.z);
misaki.rotation.y = LAYOUT.seats.misaki.rot;
const audio = createAudio();
audio.setSettings(save.settings);
const ui = createUI();
ui.setBlip(() => audio.sfx.blip());
const handHolder = player.userData.parts.handR;
player.visible = false;
const auntieHome = { x: 1.0, z: -2.25 };
auntie.position.set(auntieHome.x, 0, auntieHome.z);
auntie.rotation.y = Math.PI;

// ---------- State -------------------------------------------------------------
let phase = "title";
let world = null;
let recipe = null;
let t = 0;
let lineIdx = 0;
let nearest = null;
let idleT = 0;
let ambientT = { chime: 8, bird: 4, cat: 22, hum: 18, tick: 0 };
let clockSec = -1;
const P = { x: 0.3, z: 1.3, vx: 0, vz: 0, yaw: Math.PI };
const cam = { yaw: 0, pitch: 0.36, dist: 5.0, pos: new THREE.Vector3(0, 2, 6), look: new THREE.Vector3(), ready: false };
const input = { keys: new Set(), joy: null, orbit: null, actDown: false, drag: null, hold: false };
const auntieState = { goal: null, speed: 1.6, cookT: 0, hopT: 0, tiltT: 0, busy: 0 };
const handState = { key: "", obj: null };
const basket = {};
const sizzleOn = { pot: false, pan: false };
const emitT = { bubbles: 0, steam: 0, sizzle: 0 };
let chopLast = 0;
let serveCount = 0;
let finishing = false;
const burnerIds = ["burnerL", "burnerR"];

// ---------- Helpers -----------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Where the object itself sits, so the highlight ring lands on it rather than on the standing spot.
const OBJECT_SPOTS = {
  sink: [-1.7, -3.9], board: [-0.3, -3.9], counter: [0.6, -3.9], burnerL: [1.4, -3.9], burnerR: [2.2, -3.9],
  kettle: [3.0, -3.9], fridge: [3.9, -3.0], ricecooker: [-3.2, -3.9], drawer_spoon: [-3.9, -3.5],
  miso: [-1.3, -1.25], sugar: [-0.85, -1.25], mirin: [-0.4, -1.25], shoyu: [0.05, -1.25], oil: [0.5, -1.25],
  nori: [0.95, -1.25], salt: [1.4, -1.25], shelf_pot: [-4.1, -1.0], shelf_pan: [-4.1, -1.6],
  shelf_bowl: [-4.1, -0.2], shelf_plate: [-4.1, 0.4], rack_lid: [4.3, -0.9], veg_bin: [3.2, 0.9],
  menu: [-4.43, 1.1], door: [-4.5, 3.0], table: [7.6, 0.4]
};
function objectSpot(id) {
  const o = OBJECT_SPOTS[id];
  if (o) return { x: o[0], z: o[1] };
  const a = STATION_ANCHORS[id];
  return { x: a.x, z: a.z };
}

function stationPos(id) {
  const a = STATION_ANCHORS[id];
  return a ? { x: a.x, z: a.z } : null;
}

function stepOf(stepId) {
  if (!recipe || !stepId) return null;
  return recipe.steps.find((s) => s.id === stepId) || null;
}

function burnerFor(into) {
  if (!world) return "burnerL";
  for (const id of burnerIds) if (world.burners[id].vessel && world.burners[id].vessel.kind === into) return id;
  return "burnerL";
}

function auntieSay(text, opts = {}) {
  if (!text) return;
  ui.say(AUNTIE, text, opts);
  auntieState.hopT = reduced ? 0 : 0.6;
  auntieState.tiltT = 0.9;
}

let familyLines = 0;
function familySay(who, text) {
  familyLines += 1;
  ui.say(who === "uncle" ? UNCLE : MISAKI, text, { family: true });
}

function nextLine(list) {
  lineIdx++;
  return pick(list, lineIdx);
}

function sayStart(recipeName) {
  auntieSay(recipeName + "ね。いいわね、ゆっくり、いっしょにいきましょう", { persist: false });
}

// ---------- Title and dish flow ----------------------------------------------
function enterPlay() {
  phase = "play";
  player.visible = true;
  ui.setPhase("play");
  audio.unlock();
  audio.startMusic();
  if (world && !world.done) {
    startDishUI(false);
    ui.say(AUNTIE, "おかえりなさい。続きを、いっしょにやりましょうね", { speed: 34 });
  } else {
    world = null;
    recipe = null;
    updateHud();
    auntieSay(nextLine(LINES.auntie.start));
    setTimeout(() => {
      if (phase === "play" && !world) openMenu();
    }, reduced ? 200 : 1100);
  }
}

function startDish(id) {
  const seed = (Math.random() * 1e9) >>> 0 || 1;
  const w = Sim.createWorld(id, seed);
  if (!w) return;
  world = w;
  recipe = Sim.recipeById(id);
  props.clearServed();
  serveCount = 0;
  handState.key = "";
  if (handState.obj) {
    handHolder.remove(handState.obj);
    handState.obj = null;
  }
  ui.closeDialogs();
  startDishUI(true);
  writeSave();
}

function startDishUI(fresh) {
  ui.setPhase("play");
  ui.setDish(recipe.name);
  updateHud();
  if (fresh) {
    sayStart(recipe.name);
    audio.sfx.chime();
  }
  idleT = 0;
}

function resumeDish() {
  if (!world) return;
  recipe = Sim.recipeById(world.recipe);
  ui.setDish(recipe ? recipe.name : "");
}

function openMenu() {
  const list = RECIPES.map((r) => {
    const c = Sim.cardOf(save, r.id);
    return { id: r.id, name: r.name, blurb: r.blurb, cooked: c.cooked };
  });
  ui.renderMenu(list, (id) => startDish(id));
  ui.openDialog(document.getElementById("dlgMenu"));
}

function openNote() {
  const ids = RECIPES.map((r) => r.id);
  let selected = ids.find((id) => Sim.isUnlocked(save, id)) || ids[0];
  const draw = () => {
    const cards = ids.map((id) => Sim.cardOf(save, id));
    ui.renderNote(cards, selected, (id) => {
      selected = id;
      draw();
    });
  };
  draw();
  ui.openDialog(document.getElementById("dlgNote"));
}

function openPause() {
  if (phase !== "play") return;
  syncPauseSliders();
  ui.openDialog(document.getElementById("dlgPause"));
  audio.sfx.click();
}

function closePause() {
  closeAllDialogs();
}

function finishDish() {
  if (finishing || !world) return;
  finishing = true;
  const id = recipe.id;
  const wasOpen = Sim.isUnlocked(save, id);
  save = Sim.recordCooked(save, id);
  writeSave();
  audio.sfx.cheer();
  const title = wasOpen ? "できあがり！" : "レシピカードができました";
  const sub = wasOpen ? recipe.name + "、いただきます！" : recipe.name + "のページが、ノートに増えました";
  if (!wasOpen) audio.sfx.unlock();
  auntieSay(nextLine(LINES.auntie.finished), { persist: true });
  setTimeout(() => {
    familySay("uncle", pick(LINES.family.uncle.reactFinish, lineIdx));
  }, 2600);
  setTimeout(() => {
    ui.finish(true, title, sub);
  }, 1800);
}

function closeFinish() {
  ui.finish(false);
  finishing = false;
  world = null;
  recipe = null;
  props.clearServed();
  serveCount = 0;
  if (handState.obj) {
    handHolder.remove(handState.obj);
    handState.obj = null;
  }
  handState.key = "";
  ui.setDish("");
  updateHud();
  ui.hideTalk();
  setTimeout(() => {
    if (phase === "play" && !world) openMenu();
  }, 250);
  writeSave();
}

// ---------- HUD ---------------------------------------------------------------
let hudT = 0;
function updateHud() {
  if (!world || !recipe) {
    ui.setStep("", "", null);
    ui.setChecklist([]);
    ui.setActions(phase === "play", { helpDisabled: true });
    return;
  }
  const hint = Sim.hintOf(world);
  const prog = Sim.progressOf(world);
  ui.setStep(hint ? hint.label : "できあがり", hint ? hint.hint : "", prog);
  const visible = recipe.steps.filter((s) => !s.quiet && !s.optional);
  let cur = visible.findIndex((s) => hint && s.id === hint.stepId);
  if (cur < 0) cur = visible.findIndex((s) => !Sim.isDone(world, s.id));
  if (cur < 0) cur = 0;
  const from = Math.max(0, cur - 2);
  const rows = visible.slice(from, from + 5).map((s, i) => ({
    label: s.label,
    done: Sim.isDone(world, s.id),
    current: from + i === cur
  }));
  ui.setChecklist(rows);
  ui.setActions(phase === "play", { helpDisabled: !!world.done });
  const names = Object.keys(basket);
  ui.setBasket(names.length ? "かご " + names.map((n) => n + " " + basket[n]).join("・") : "");
}

// ---------- Visual and sound events ---------------------------------------
function burnerTop(id) {
  return new THREE.Vector3(LAYOUT.burners[id].x, 1.1, LAYOUT.burners[id].z);
}

function handleEvents(events, ctx = {}) {
  if (!events || !events.length) return;
  for (const e of events) {
    if (e.type === "hit") {
      audio.sfx.chop();
      fx.sparkle(LAYOUT.boardSlot.x, LAYOUT.boardSlot.y + 0.1, LAYOUT.boardSlot.z, 3, 0xffe7a0);
      if (e.grade === "nice" && Math.random() < 0.5) auntieSay(nextLine(LINES.auntie.nice), { speed: 30 });
    } else if (e.type === "shell") {
      audio.sfx.crack(false);
      fx.shell(LAYOUT.counterSlot.x, 1.0, LAYOUT.counterSlot.z, 6);
      auntieSay(nextLine(LINES.auntie.shell));
    } else if (e.type === "counter") {
      if (e.action === "put") audio.sfx.step();
      else audio.sfx.cupboard();
      fx.puff(LAYOUT.counterSlot.x, 1.0, LAYOUT.counterSlot.z, 2);
    } else if (e.type === "serve") {
      serveSequence(ctx.before);
    } else if (e.type === "stage") {
      const v = world.burners[e.station].vessel;
      const pos = burnerTop(e.station);
      if (e.kind === "pot") {
        if (e.stage === "small") {
          audio.sfx.bubbling("small");
          auntieSay(nextLine(LINES.auntie.bubbles), { speed: 30 });
        }
        if (e.stage === "boil") audio.sfx.bubbling("boil");
        fx.steam(pos.x, pos.y, pos.z, 2);
      }
      if (e.kind === "pan" && e.stage === "hot") {
        audio.sfx.sizzle(1.2);
        auntieSay(nextLine(LINES.auntie.sizzle), { speed: 30 });
      }
      if (e.kind === "pan" && e.stage === "cold") fx.puff(pos.x, pos.y, pos.z, 2);
      void v;
    } else if (e.type === "layer") {
      auntieSay(nextLine(LINES.auntie.layerSet));
    } else if (e.type === "burnt") {
      auntieSay(nextLine(LINES.auntie.burnt), { persist: false });
    } else if (e.type === "session") {
      // Visual only. Handled when the session starts.
    } else if (e.type === "complete" || e.type === "run") {
      const s = stepOf(e.stepId);
      stepSfx(s, e);
      if (s && s.say && (e.type === "complete" || s.kind === "tap" && !s.goal)) auntieSay(s.say);
      else if (s && s.say && e.final) auntieSay(s.say);
      if (e.type === "complete") idleT = 0;
    } else if (e.type === "finished") {
      finishDish();
    }
  }
  updateHud();
  if (world) writeSave();
}

function stepSfx(s, e) {
  if (!s) return;
  const k = e.kind || s.kind;
  if (k === "take") audio.sfx.cupboard();
  else if (k === "place") { audio.sfx.step(); fx.puff(LAYOUT.counterSlot.x, 1.0, LAYOUT.counterSlot.z, 2); }
  else if (k === "tap") {
    audio.sfx.spoon();
    const p = s.station === "counter" ? LAYOUT.counterSlot : (s.station === "burner" || s.into === "pot" || s.into === "pan") ? burnerTop(burnerFor(s.into)) : null;
    if (p) fx.splash(p.x, p.y, p.z, 4);
  } else if (k === "toggle") audio.sfx.click();
  else if (k === "season") audio.sfx.spoon();
  else if (k === "taste") tasteLines();
  else if (k === "wait") audio.sfx.chime();
  else if (k === "crack") audio.sfx.crack(true);
  else if (k === "drag") audio.sfx.beat();
  else if (k === "hold") audio.sfx.waterStop();
  else if (k === "serve") { /* serve handled separately */ }
  if (e.type === "complete" && s.id === "fill") fx.splash(LAYOUT.sink.x, LAYOUT.sink.y + 0.1, LAYOUT.sink.z, 10);
}

function tasteLines() {
  const v = world.verdict;
  if (!v) return;
  const L = LINES.auntie;
  let line;
  if (v.none) line = L.tasteNone;
  else if (v.ok) line = L.tasteOk;
  else if (v.sweetLevel === "high") line = L.tasteSweetHigh;
  else if (v.sweetLevel === "low") line = L.tasteSweetLow;
  else if (v.saltLevel === "high") line = L.tasteSaltHigh;
  else line = L.tasteSaltLow;
  auntieSay(line, { persist: true });
}

function serveSequence(item) {
  if (!item) return;
  serveCount += 1;
  props.serveDish(item);
  fx.sparkle(LAYOUT.table.x, 1.2, LAYOUT.table.z, 10);
  audio.sfx.cheer();
  if (serveCount === 1) {
    setTimeout(() => familySay("misaki", pick(LINES.family.misaki.reactServe, lineIdx + 1)), 500);
    setTimeout(() => familySay("uncle", pick(LINES.family.uncle.reactServe, lineIdx + 2)), 2200);
  } else {
    setTimeout(() => familySay("misaki", pick(LINES.family.misaki.reactFinish, lineIdx + 3)), 500);
  }
  uncle.userData.reactT = 0;
  misaki.userData.reactT = 0;
  auntieState.hopT = reduced ? 0 : 0.8;
}

// ---------- Player actions ---------------------------------------------------
function closeAllDialogs() {
  ui.closeDialogs();
  input.drag = null;
  input.hold = false;
}

function refuse(reason) {
  const text = LINES.auntie.refuse[reason];
  if (text) auntieSay(text);
  audio.sfx.miss();
}

function harvest(id) {
  const plant = w3.plants.find((p) => p.id === id);
  if (!plant || !plant.ready) {
    auntieSay("まだ小さいわね。もう少し待ってね");
    return;
  }
  plant.ready = false;
  plant.regrow = reduced ? 6 : 22;
  for (const f of plant.fruit) f.visible = false;
  const name = STATION_NAMES[id] || "野菜";
  basket[name] = (basket[name] || 0) + 1;
  fx.sparkle(STATION_ANCHORS[id].x, 1.0, STATION_ANCHORS[id].z, 8, 0xc8f08a);
  audio.sfx.click();
  auntieSay(nextLine(LINES.auntie.harvest));
  updateHud();
}

function act() {
  if (phase !== "play" || ui.dialogOpen() || finishing) return;
  if (ui.talkVisible()) ui.finishTyping();
  if (world && world.session) {
    if (world.session.type === "chop" || world.session.type === "crack") {
      const r = Sim.press(world);
      if (!r.ok) return;
      if (r.grade === "miss") audio.sfx.miss();
      idleT = 0;
      handleEvents(r.events);
      if (!r.hit && Math.random() < 0.25) auntieSay(nextLine(LINES.auntie.miss), { speed: 30 });
    } else if (world.session.type === "hold") {
      input.hold = true;
    }
    return;
  }
  if (!nearest) return;
  const st = nearest;
  if (st.indexOf("plant") === 0) return harvest(st);
  if (st === "menu") return openMenu();
  if (st === "door") return auntieSay("お庭には、裏口からどうぞ。収穫も、そこでできるわよ");
  if (!world || world.done) return;
  idleT = 0;
  const before = world.hand ? JSON.parse(JSON.stringify(world.hand)) : null;
  const r = Sim.interact(world, st);
  if (!r.ok) {
    refuse(r.reason);
    return;
  }
  if (r.started === "chop" || r.started === "crack") {
    audio.sfx.click();
    return;
  }
  if (r.started === "drag") {
    startDrag(st);
    return;
  }
  if (r.started === "hold") {
    startHold(st);
    return;
  }
  handleEvents(r.events, { before, station: st });
  updateHud();
}

function startDrag(st) {
  const sess = world.session;
  input.drag = { metric: sess.metric, lastA: null, px: 0, py: 0, pivot: pivotFor(st), cool: 0 };
  auntieSay(sess.metric === "rot" ? "鍋の中で、ぐるぐるよ" : "さっさっと、リズムよくね", { speed: 30 });
}

function startHold(st) {
  const sess = world.session;
  input.hold = true;
  if (st === "sink" || st === "kettle") audio.sfx.water();
  void sess;
}

function pivotFor(st) {
  const map = { burnerL: new THREE.Vector3(LAYOUT.burners.burnerL.x, 1.1, LAYOUT.burners.burnerL.z), burnerR: new THREE.Vector3(LAYOUT.burners.burnerR.x, 1.1, LAYOUT.burners.burnerR.z), counter: new THREE.Vector3(LAYOUT.counterSlot.x, 1.0, LAYOUT.counterSlot.z), sink: new THREE.Vector3(LAYOUT.sink.x, 1.0, LAYOUT.sink.z), ricecooker: new THREE.Vector3(-3.2, 1.0, -3.9), board: new THREE.Vector3(-0.3, 1.0, -3.9) };
  return map[st] || new THREE.Vector3(LAYOUT.counterSlot.x, 1.0, LAYOUT.counterSlot.z);
}

function screenOf(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
}

function assist() {
  if (phase !== "play" || !world || world.done || ui.dialogOpen() || finishing) return;
  const hint = Sim.hintOf(world);
  if (!hint) return;
  let st = Array.isArray(hint.station) ? hint.station[0] : hint.station;
  if (st === "burner") st = burnerFor(hintInto(hint));
  if (!st) st = "counter";
  if (world.session) world.session = null;
  const before = world.hand ? JSON.parse(JSON.stringify(world.hand)) : null;
  auntieGoTo(st);
  const stepLine = pick(LINES.auntie.help, lineIdx++);
  auntieSay(stepLine);
  auntieState.cookT = 1.6;
  const r = Sim.assist(world);
  if (r.events && r.events.length) handleEvents(r.events, { before, station: st });
  input.drag = null;
  input.hold = false;
  updateHud();
}

function hintInto(hint) {
  const s = stepOf(hint.stepId);
  return s && s.into ? s.into : "pot";
}

function auntieGoTo(st) {
  const p = stationPos(st) || { x: auntieHome.x, z: auntieHome.z };
  auntieState.goal = { x: p.x, z: p.z + (p.z < -1 ? 0.45 : 0) };
}

// ---------- Movement and camera ---------------------------------------------
function collideMove(nx, nz) {
  const r = 0.28;
  let x = clamp(nx, BOUNDS.x0, BOUNDS.x1);
  let z = clamp(nz, BOUNDS.z0, BOUNDS.z1);
  for (const c of w3.colliders) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) {
      const dl = Math.abs(x + r - c.x0), dr = Math.abs(x - r - c.x1);
      const dt2 = Math.abs(z + r - c.z0), db = Math.abs(z - r - c.z1);
      const m = Math.min(dl, dr, dt2, db);
      if (m === dl) x = c.x0 - r;
      else if (m === dr) x = c.x1 + r;
      else if (m === dt2) z = c.z0 - r;
      else z = c.z1 + r;
    }
  }
  return { x, z };
}

function updateMovement(dt) {
  let ix = 0;
  let iz = 0;
  if (input.keys.has("ArrowLeft") || input.keys.has("KeyA")) ix -= 1;
  if (input.keys.has("ArrowRight") || input.keys.has("KeyD")) ix += 1;
  if (input.keys.has("ArrowUp") || input.keys.has("KeyW")) iz += 1;
  if (input.keys.has("ArrowDown") || input.keys.has("KeyS")) iz -= 1;
  if (input.joy) {
    ix += input.joy.x;
    iz -= input.joy.y;
  }
  const busy = !!(world && world.session && (world.session.type === "drag" || world.session.type === "hold"));
  if (busy) { ix = 0; iz = 0; }
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  // Forward is away from the camera, in the direction the camera looks.
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const fx2 = -sy, fz2 = -cy;
  const rx = cy, rz = -sy;
  const wx = rx * ix + fx2 * iz;
  const wz = rz * ix + fz2 * iz;
  const speed = 2.3;
  const moving = Math.hypot(wx, wz) > 0.05;
  if (moving) {
    const nx = P.x + wx * speed * dt;
    const nz = P.z + wz * speed * dt;
    const p = collideMove(nx, nz);
    P.x = p.x;
    P.z = p.z;
    P.yaw = Math.atan2(wx, wz);
  }
  const want = moving ? speed : 0;
  animateWalk(player, want, dt);
  player.position.set(P.x, 0, P.z);
  const turn = normalizeAngle(P.yaw - player.rotation.y);
  player.rotation.y = normalizeAngle(player.rotation.y + turn * Math.min(1, dt * 10));
  return moving;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function segmentHit(a, b) {
  // First hit of segment a->b against the colliders, returned as a fraction 0..1.
  let tMin = 1;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (const c of w3.colliders) {
    const m = 0.2;
    const x0 = c.x0 - m, x1 = c.x1 + m, z0 = c.z0 - m, z1 = c.z1 + m;
    let t0 = 0, t1 = 1;
    const axes = [[a.x, dx, x0, x1], [a.z, dz, z0, z1]];
    let ok = true;
    for (const [p, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-6) {
        if (p < lo || p > hi) { ok = false; break; }
      } else {
        let ta = (lo - p) / d, tb = (hi - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && a.y + dy * t0 < 3.2 && t0 < tMin && t0 > 0) tMin = t0;
  }
  return tMin;
}

function updateCamera(dt) {
  let focus;
  let look;
  if (phase === "title") {
    focus = new THREE.Vector3(auntieHome.x - 0.2, 1.0, auntieHome.z);
    if (!reduced) cam.yaw += dt * 0.05;
    look = focus.clone();
    cam.dist = 5.6;
    cam.pitch = 0.16;
  } else {
    focus = new THREE.Vector3(P.x, 1.1, P.z);
    look = focus.clone();
    if (ui.talkVisible() && auntieState.goal === null && auntie.position.distanceTo(player.position) < 6) {
      const ap = new THREE.Vector3(auntie.position.x, 1.1, auntie.position.z);
      look.lerp(ap, 0.3);
    }
  }
  const off = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist);
  const desired = look.clone().add(off);
  const frac = segmentHit(look, desired);
  const kept = Math.max(0.12, frac * 0.94);
  const target = look.clone().add(off.clone().multiplyScalar(kept));
  const k = 1 - Math.exp(-dt * (reduced ? 4 : 7));
  target.z = Math.min(target.z, 4.3);
  if (!cam.ready) {
    cam.pos.copy(target);
    cam.ready = true;
  }
  cam.pos.lerp(target, k);
  camera.position.copy(cam.pos);
  cam.look.lerp(look, k);
  camera.lookAt(cam.look);
}

// ---------- Nearest station and prompt ---------------------------------------
function updateNearest() {
  nearest = null;
  if (phase !== "play" || ui.dialogOpen() || finishing) {
    ui.setPrompt("", false);
    w3.anim.ring.visible = false;
    return;
  }
  let best = Infinity;
  for (const id in STATION_ANCHORS) {
    const a = STATION_ANCHORS[id];
    const d = Math.hypot(a.x - P.x, a.z - P.z);
    if (d < a.r && d < best) {
      best = d;
      nearest = id;
    }
  }
  if (!nearest) {
    ui.setPrompt("", false);
    w3.anim.ring.visible = false;
    return;
  }
  let text = "";
  if (nearest.indexOf("plant") === 0) {
    const plant = w3.plants.find((p) => p.id === nearest);
    text = plant && plant.ready ? STATION_NAMES[nearest] + "を、かごに入れる" : STATION_NAMES[nearest] + "は、まだ小さい";
  } else if (nearest === "menu") {
    text = "お品書きを見る";
  } else if (nearest === "door") {
    text = "";
  } else if (world && !world.done && !world.session) {
    const pk = Sim.peek(world, nearest);
    if (pk.ok && pk.label) text = STATION_NAMES[nearest] + "：" + pk.label;
    else if (pk.label && pk.reason !== "done") text = STATION_NAMES[nearest] + "：" + pk.label + "（" + (LINES.auntie.refuse[pk.reason] ? "まだ" : "") + "）";
    else if (pk.reason === "nothing") text = "";
    else text = "";
  } else if (world && world.session) {
    text = "";
  }
  const showPrompt = !!text;
  ui.setPrompt(text, showPrompt);
  const ringOn = showPrompt && !!(nearest.indexOf("plant") === 0 || nearest === "menu" || (world && Sim.peek(world, nearest).ok));
  if (ringOn) {
    const o = objectSpot(nearest);
    w3.anim.ring.visible = true;
    w3.anim.ring.position.set(o.x, 0.035, o.z);
  } else {
    w3.anim.ring.visible = false;
  }
}

// ---------- Character and world updates -----------------------------------
function updateAuntie(dt) {
  const ud = auntie.userData;
  let speed = 0;
  if (auntieState.goal) {
    const dx = auntieState.goal.x - auntie.position.x;
    const dz = auntieState.goal.z - auntie.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.06) {
      speed = auntieState.speed;
      const step = Math.min(d, speed * dt);
      auntie.position.x += (dx / d) * step;
      auntie.position.z += (dz / d) * step;
      auntie.rotation.y = normalizeAngle(Math.atan2(dx, dz));
    } else {
      auntieState.goal = null;
      auntie.rotation.y = Math.PI;
    }
  }
  animateWalk(auntie, speed, dt);
  if (auntieState.cookT > 0) {
    auntieState.cookT -= dt;
    setPose(auntie, "cook", t);
  } else {
    setPose(auntie, phase === "title" ? "wave" : "idle", t);
  }
  auntieState.hopT = Math.max(0, auntieState.hopT - dt);
  auntieState.tiltT = Math.max(0, auntieState.tiltT - dt);
  const hop = auntieState.hopT > 0 ? Math.sin((0.6 - auntieState.hopT) * Math.PI / 0.6) * (reduced ? 0.02 : 0.12) : 0;
  auntie.position.y = Math.max(0, hop);
  ud.parts.head.rotation.z = auntieState.tiltT > 0 ? 0.2 * Math.sin(auntieState.tiltT * 6) : 0;
  if (phase === "play" && !auntieState.goal && auntieState.cookT <= 0) {
    const pp = new THREE.Vector3(P.x, 1.2, P.z);
    lookAt(auntie, pp);
  } else if (phase === "title") {
    ud.parts.head.rotation.y *= 0.9;
  }
  blinkEyes(auntie, dt);
  if (!reduced) ud.parts.bun.rotation.z = Math.sin(t * 1.3) * 0.02;
  if (!auntieState.goal) {
    const want = phase === "title" ? 0 : Math.PI;
    const turn = normalizeAngle(want - auntie.rotation.y);
    auntie.rotation.y = normalizeAngle(auntie.rotation.y + turn * Math.min(1, dt * 3));
  }
  // Idle breathing
  ud.parts.body.scale.y = 1 + Math.sin(t * 2.2) * 0.005;
}

function updateFamily(dt) {
  for (const [char, dir] of [[uncle, "uncle"], [misaki, "misaki"]]) {
    const u = char.userData;
    u.reactT = (u.reactT || 0) + dt;
    const hopAmp = u.reactT < 0.9 && !reduced ? Math.sin(u.reactT * 14) * (dir === "misaki" ? 0.05 : 0.02) : 0;
    char.position.y = Math.max(0, hopAmp);
    blinkEyes({ userData: { parts: { eyes: [] }, blink: 3 } }, dt);
    u.parts.head.rotation.y = Math.sin(t * 0.5 + (dir === "uncle" ? 0 : 2)) * 0.12;
    if (dir === "misaki" && u.reactT < 1.2) u.parts.armL.rotation.x = -1.8 + Math.sin(t * 9) * 0.3;
    else if (dir === "misaki") u.parts.armL.rotation.x = -0.8;
    if (dir === "uncle" && u.reactT > 0 && u.reactT < 2) u.parts.paper.position.y = 0.98 + 0.12 * Math.sin(u.reactT * 3);
  }
}

function updatePlayerTools(dt) {
  const ud = player.userData;
  const armR = ud.parts.armR;
  const sess = world && world.session;
  if (sess && (sess.type === "chop" || sess.type === "crack")) {
    armR.rotation.x = -1.1 + 0.8 * Math.abs(Math.sin(t * 7.5));
    armR.rotation.z = 0.05;
  } else if (sess && sess.type === "drag") {
    armR.rotation.x = -1.0 + 0.2 * Math.sin(t * 6);
    armR.rotation.z = 0.25 * Math.sin(t * 6.5);
  } else {
    armR.rotation.z *= 0.85;
    if (!input.moving) armR.rotation.x *= 0.9;
  }
  const holding = world ? world.hand : null;
  const state = props.holdItem(handHolder, holding, handState);
  handState.key = state.key;
  handState.obj = state.obj;
  void dt;
}

function updateEffects(dt) {
  if (!world) return;
  for (const id of burnerIds) {
    const b = world.burners[id];
    const v = b.vessel;
    if (!v) continue;
    const top = burnerTop(id);
    if (v.kind === "pot") {
      if (v.stage === "small" || v.stage === "boil") {
        emitT.bubbles += dt;
        const every = v.stage === "boil" ? 0.12 : 0.34;
        if (emitT.bubbles > every) {
          emitT.bubbles = 0;
          fx.bubbles(top.x, top.y - 0.04, top.z, v.stage === "boil" ? 2 : 1);
        }
      }
      if (v.temp > 58 && b.level > 0) {
        emitT.steam += dt;
        if (emitT.steam > 0.6) {
          emitT.steam = 0;
          fx.steam(top.x, top.y + 0.1, top.z, 1);
        }
      }
    }
    if (v.kind === "pan") {
      const hot = v.stage === "hot" || v.stage === "smoke";
      if (hot && v.oil && !sizzleOn.pan) {
        sizzleOn.pan = true;
        audio.sfx.sizzleLoop(true);
      }
      if (!hot && sizzleOn.pan) {
        sizzleOn.pan = false;
        audio.sfx.sizzleLoop(false);
      }
      if (hot && v.oil) {
        emitT.sizzle += dt;
        if (emitT.sizzle > 0.25) {
          emitT.sizzle = 0;
          fx.sizzle(top.x, top.y + 0.04, top.z, 2);
        }
      }
    }
  }
  const anyPan = burnerIds.some((id) => world.burners[id].vessel && world.burners[id].vessel.kind === "pan");
  if (!anyPan && sizzleOn.pan) {
    sizzleOn.pan = false;
    audio.sfx.sizzleLoop(false);
  }
}

function updateSessions(dt) {
  const sess = world && world.session;
  if (!sess) {
    ui.timing(false);
    ui.dragRing(false);
    ui.holdBar(false);
    if (input.drag) {
      input.drag = null;
      audio.sfx.stirLoop(false);
    }
    if (input.hold) {
      input.hold = false;
      audio.sfx.waterStop();
    }
    return;
  }
  if (sess.type === "chop" || sess.type === "crack") {
    const ind = Sim.indicatorOf(world);
    if (ind) ui.timing(true, ind);
    ui.dragRing(false);
    ui.holdBar(false);
  } else if (sess.type === "drag") {
    ui.timing(false);
    const p = input.drag ? input.drag.pivot : pivotFor(sess.station);
    const s = screenOf(p);
    const prog = Math.min(1, sess.progress / sess.need);
    ui.dragRing(true, s.x, s.y, prog, sess.metric === "rot" ? "ぐるぐる" : "さっさっと");
    if (sess.metric === "rot" && input.drag) audio.sfx.stirLoop(input.drag.moving === true);
  } else if (sess.type === "hold") {
    ui.timing(false);
    ui.dragRing(false);
    ui.holdBar(true, Math.min(1, sess.progress / sess.need));
    const r = Sim.hold(world, dt, input.hold);
    if (r.events && r.events.length) handleEvents(r.events, { before: null });
    if (r.events && r.events.some((e) => e.type === "complete" || e.type === "run")) {
      input.hold = false;
      audio.sfx.waterStop();
    }
    if (input.hold && (sess.station === "sink" || sess.station === "kettle") && Math.random() < dt * 9) fx.splash(sess.station === "sink" ? LAYOUT.sink.x : LAYOUT.counterSlot.x, 1.1, sess.station === "sink" ? LAYOUT.sink.z : LAYOUT.counterSlot.z, 1);
  }
  if (world && world.session && nearest) {
    const a = STATION_ANCHORS[world.session.station] || STATION_ANCHORS[nearest];
    if (a && Math.hypot(a.x - P.x, a.z - P.z) > a.r + 1.2) {
      Sim.cancel(world);
      input.drag = null;
      input.hold = false;
      audio.sfx.stirLoop(false);
      audio.sfx.waterStop();
      auntieSay("はなれると、やり直しになるわよ。また近くでね");
    }
  }
}

function updateAmbient(dt) {
  if (!audio.ready) return;
  ambientT.chime -= dt;
  ambientT.bird -= dt;
  ambientT.cat -= dt;
  ambientT.hum -= dt;
  ambientT.tick -= dt;
  if (ambientT.chime < 0) { audio.sfx.chime(); ambientT.chime = 14 + ((t * 7) % 6); }
  if (ambientT.bird < 0) { audio.sfx.bird(); ambientT.bird = 9 + ((t * 3) % 7); }
  if (ambientT.cat < 0) { audio.sfx.meow(); ambientT.cat = 40 + ((t * 5) % 20); }
  if (ambientT.hum < 0) {
    if (phase === "play" && !world) audio.sfx.hum();
    ambientT.hum = 30 + ((t * 2) % 15);
  }
  if (ambientT.tick < 0) { audio.sfx.tick(); ambientT.tick = 1; }
}

function updateClock() {
  const now = new Date();
  const sec = now.getSeconds();
  if (sec === clockSec) return;
  clockSec = sec;
  const c = TX.clockFace(now);
  const tex = w3.anim.clockTex;
  tex.image = c;
  tex.needsUpdate = true;
}

function updateBasketCheck() {
  for (const p of w3.plants) {
    if (!p.ready) {
      p.regrow -= 1 / 60;
      if (p.regrow <= 0) {
        p.ready = true;
        for (const f of p.fruit) f.visible = true;
      }
    }
  }
}

// ---------- Input -------------------------------------------------------------
const UI_SELECTOR = "button, input, label, a, .dialog, .sheet, .talk, .card, .hud-tools, .actions";
function isUiTarget(target) {
  return !!(target && target.closest && target.closest(UI_SELECTOR));
}

window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  audio.unlock();
  if (e.code === "Escape") {
    if (ui.dialogOpen()) closeAllDialogs();
    else if (phase === "play") openPause();
    e.preventDefault();
    return;
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyE" || e.code === "Space") {
    if (!e.repeat) {
      input.actDown = true;
      if (phase === "title") enterPlay();
      else act();
    }
    e.preventDefault();
    return;
  }
  if (e.code === "KeyH") { assist(); return; }
  if (e.code === "KeyN" || e.code === "KeyB") { if (phase === "play" && !ui.dialogOpen()) openNote(); return; }
  input.keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  input.keys.delete(e.code);
  if (e.code === "KeyE" || e.code === "Space") {
    input.actDown = false;
    input.hold = false;
  }
});
window.addEventListener("blur", () => {
  input.keys.clear();
  input.actDown = false;
  input.hold = false;
});

canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  if (phase !== "play" || ui.dialogOpen()) return;
  const sess = world && world.session;
  if (sess && sess.type === "drag") {
    const p = input.drag ? input.drag.pivot : pivotFor(sess.station);
    const s = screenOf(p);
    input.drag = { metric: sess.metric, lastA: Math.atan2(e.clientY - s.y, e.clientX - s.x), px: e.clientX, py: e.clientY, pivot: p, moving: false, down: true, pointerId: e.pointerId, cool: 0 };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.pointerType === "touch" && e.clientX < window.innerWidth * 0.42 && !sess) {
    input.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 };
    ui.joystick(true, e.clientX, e.clientY, 0, 0);
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  input.orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (input.drag && input.drag.down && e.pointerId === input.drag.pointerId && world && world.session && world.session.type === "drag") {
    const d = input.drag;
    const s = screenOf(d.pivot);
    const a = Math.atan2(e.clientY - s.y, e.clientX - s.x);
    let da = a - d.lastA;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    d.lastA = a;
    const dist = Math.hypot(e.movementX || 0, e.movementY || 0) / Math.min(window.innerWidth, window.innerHeight) * 100;
    d.moving = Math.abs(da) > 0.01 || dist > 0.5;
    const r = Sim.drag(world, { angle: da, dist: dist });
    if (r.ok) {
      if (world.session && world.session.type === "drag") {
        if (d.metric === "dist" && dist > 0.5 && (d.cool -= 1) < 0) { audio.sfx.beat(); d.cool = 4; }
      }
      if (r.events && r.events.length) handleEvents(r.events, { before: null });
    }
    return;
  }
  if (input.joy && e.pointerId === input.joy.id) {
    const dx = e.clientX - input.joy.x0;
    const dy = e.clientY - input.joy.y0;
    const max = 56;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    input.joy.x = (dx * k) / max;
    input.joy.y = (dy * k) / max;
    ui.joystick(true, input.joy.x0, input.joy.y0, dx * k, dy * k);
    return;
  }
  if (input.orbit && e.pointerId === input.orbit.id) {
    const dx = e.clientX - input.orbit.x;
    const dy = e.clientY - input.orbit.y;
    input.orbit.x = e.clientX;
    input.orbit.y = e.clientY;
    cam.yaw -= dx * 0.0065;
    cam.pitch = clamp(cam.pitch + dy * 0.0035, 0.12, 0.95);
  }
});
function endPointer(e) {
  if (input.drag && input.drag.pointerId === e.pointerId) input.drag = world && world.session && world.session.type === "drag" ? input.drag : null;
  if (input.drag && input.drag.down && input.drag.pointerId === e.pointerId) {
    input.drag.down = false;
    audio.sfx.stirLoop(false);
  }
  if (input.joy && input.joy.id === e.pointerId) {
    input.joy = null;
    ui.joystick(false);
  }
  if (input.orbit && input.orbit.id === e.pointerId) input.orbit = null;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener(
  "wheel",
  (e) => {
    if (phase !== "play") return;
    cam.dist = clamp(cam.dist + e.deltaY * 0.004, 2.0, 7.0);
    e.preventDefault();
  },
  { passive: false }
);

const btnAct = document.getElementById("btnAct");
const btnHelp = document.getElementById("btnHelp");
btnAct.addEventListener("pointerdown", (e) => {
  audio.unlock();
  e.stopPropagation();
  input.actDown = true;
  if (phase === "title") return enterPlay();
  act();
  if (world && world.session && world.session.type === "hold") input.hold = true;
});
btnAct.addEventListener("pointerup", () => { input.actDown = false; input.hold = false; });
btnAct.addEventListener("pointerleave", () => { input.actDown = false; input.hold = false; });
btnAct.addEventListener("pointercancel", () => { input.actDown = false; input.hold = false; });
btnHelp.addEventListener("click", () => assist());
document.getElementById("btnStart").addEventListener("click", () => {
  audio.unlock();
  world = null;
  enterPlay();
});
document.getElementById("btnContinue").addEventListener("click", () => {
  audio.unlock();
  enterPlay();
});
document.getElementById("btnNote").addEventListener("click", () => { audio.unlock(); openNote(); });
document.getElementById("btnPause").addEventListener("click", () => { audio.unlock(); openPause(); });
document.getElementById("btnResume").addEventListener("click", () => { closePause(); });
document.getElementById("btnToTitle").addEventListener("click", () => {
  closePause();
  writeSave();
  phase = "title";
  player.visible = false;
  ui.setPhase("title");
  ui.hideTalk();
  ui.finish(false);
  updateTitleButtons();
});
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeAllDialogs()));
document.getElementById("talk").addEventListener("click", () => {
  if (!ui.finishTyping()) ui.hideTalk();
});
document.getElementById("finishOk").addEventListener("click", () => closeFinish());
ui.bindPause(
  () => save.settings,
  (patch) => {
    save.settings = Object.assign({}, save.settings, patch);
    audio.setSettings(save.settings);
    writeSave();
  }
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    writeSave();
    audio.suspend();
  } else {
    audio.resume();
  }
});
window.addEventListener("pagehide", writeSave);

// Pause dialog: keep the sliders in sync with the saved settings.
function syncPauseSliders() {
  document.getElementById("musicVol").value = String(Math.round(save.settings.music * 100));
  document.getElementById("sfxVol").value = String(Math.round(save.settings.sfx * 100));
  document.getElementById("mute").checked = !!save.settings.muted;
}

function updateTitleButtons() {
  const cont = document.getElementById("btnContinue");
  cont.hidden = !(hasSave() && (world || save.dish || Object.keys(save.cooked).length));
}
updateTitleButtons();
if (save.dish) {
  world = save.dish;
  resumeDish();
}

// ---------- Frame loop -------------------------------------------------------
let last = performance.now();
let hudAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!document.hidden) {
    t += dt;
    updateClock();
    updateAmbient(dt);
    const playing = phase === "play" && !ui.dialogOpen() && !finishing;
    let moving = false;
    if (playing) {
      if (world && !world.done) {
        const ev = Sim.tick(world, dt);
        if (ev.length) handleEvents(ev, { before: null });
      }
      moving = updateMovement(dt);
      input.moving = moving;
      idleT += dt;
      if (world && !world.done && idleT > 36 && !world.session) {
        idleT = 0;
        auntieSay(nextLine(LINES.auntie.idle));
      }
    }
    updateSessions(dt);
    updateNearest();
    updatePlayerTools(dt);
    updateAuntie(dt);
    updateFamily(dt);
    updateBasketCheck();
    if (world) props.update(world, t);
    else props.update({ burners: { burnerL: { level: 0, vessel: null }, burnerR: { level: 0, vessel: null } }, counter: null, board: null }, t);
    updateEffects(dt);
    updateWorld(w3, t, dt);
    if (w3.anim.stoveLight) w3.anim.stoveLight.intensity = 1.0 + Math.sin(t * 13) * 0.08 + Math.sin(t * 5.3) * 0.05;
    hudAcc += dt;
    if (hudAcc > 0.25 && world) { hudAcc = 0; updateHud(); }
    updateCamera(dt);
    fx.update(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hook for the browser checks (documented in the file header).
window.obachanKitchenDebug = {
  state() {
    return {
      phase,
      recipe: recipe ? recipe.id : null,
      done: world ? world.done : null,
      served: world ? world.served : 0,
      hand: world && world.hand ? world.hand.kind : null,
      hint: world ? Sim.hintOf(world) : null,
      progress: world ? Sim.progressOf(world) : null,
      nearest,
      session: world && world.session ? world.session.type : null,
      dialogOpen: ui.dialogOpen(),
      talk: ui.talkVisible(),
      cam: camera.position.toArray().map((v) => +v.toFixed(2)),
      indicator: Sim.indicatorOf(world || { session: null }),
      familyLines: familyLines,
      servedDishes: serveCount,
      player: [P.x, P.z],
      save: save
    };
  },
  world() {
    return world ? JSON.parse(JSON.stringify(world)) : null;
  },
  run(station) {
    if (!world) return null;
    const before = world.hand ? JSON.parse(JSON.stringify(world.hand)) : null;
    const r = Sim.interact(world, station);
    if (r.ok && r.events) handleEvents(r.events, { before, station });
    return { ok: r.ok, reason: r.reason || null, started: r.started || null };
  },
  assist() {
    assist();
    return world ? Sim.hintOf(world) : null;
  },
  teleport(station) {
    const a = STATION_ANCHORS[station];
    if (!a) return false;
    P.x = a.x;
    P.z = a.z + 0.2;
    player.position.set(P.x, 0, P.z);
    return true;
  },
  startDish(id) {
    if (phase !== "play") enterPlay();
    startDish(id);
    return true;
  },
  save() {
    return save;
  },
  perf(opts) {
    if ("shadows" in opts) renderer.shadowMap.enabled = !!opts.shadows;
    if ("dpr" in opts) renderer.setPixelRatio(opts.dpr);
    return renderer.shadowMap.enabled;
  },
  renderInfo() {
    const i = renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
};

export { startDish, enterPlay };
