// Primitive characters: auntie, the player, and the seated uncle and Misaki.
// Each one is a hierarchy of groups. Animation only changes rotations, small offsets and the
// face (eyebrows, eyes and mouth shapes). Faces have four moods: smile, laugh, surprise, worry.
import * as THREE from "../vendor/three.module.js";
import * as T from "./textures.js";
import { contactShadowMesh } from "./world.js";

const geoCache = [];
function track(g) {
  geoCache.push(g);
  return g;
}

const matCache = {};
// Standard material: lit by the hemisphere fill and the room reflections.
function mat(key, opts) {
  if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0, envMapIntensity: 0.4 }, opts));
  return matCache[key];
}
// Cloth: a matte weave (high roughness, no shine), so the apron and cardigan do not look like plastic.
function cloth(key, color, opts = {}) {
  if (!matCache[key]) {
    matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.94, metalness: 0, envMapIntensity: 0.2 }, opts));
  }
  return matCache[key];
}

function part(parent, geo, material, x, y, z, cast = true) {
  const m = new THREE.Mesh(track(geo), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function lathe(points, segments = 24) {
  return track(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments));
}

function capsuleLimb(parent, radius, length, material, x, y, z) {
  // A limb that hangs from its pivot: the capsule sits below the pivot.
  const pivot = group(parent, x, y, z);
  part(pivot, new THREE.CapsuleGeometry(radius, length, 4, 10), material, 0, -length / 2 - radius * 0.6, 0);
  return pivot;
}

// Shared skin and fabric
const skin = () => mat("skin", { color: 0xf2c7a5, roughness: 0.62, envMapIntensity: 0.25 });
const hairDark = () => mat("hairDark", { color: 0x5a4a45, roughness: 0.55 });
const eyeDark = () => mat("eyeDark", { color: 0x2b1d18, roughness: 0.35 });

// The face: two eyebrows, a smile, a frown, an open laugh (with a tongue) and a small "o" for surprise.
// All of them are built once; updateFace shows one at a time.
function buildFace(head, o) {
  const browMat = mat("brow" + (o.brow || 0).toString(16), { color: o.brow || 0x5a4a45, roughness: 0.8 });
  const brows = [];
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(track(new THREE.BoxGeometry(o.browW, 0.011, 0.016)), browMat);
    b.position.set(sx * o.eyeX, o.browY, o.browZ);
    b.userData.baseY = o.browY;
    b.userData.sx = sx;
    head.add(b);
    brows.push(b);
  }
  const mouthMat = mat("mouth", { color: 0x9b4b44, roughness: 0.55 });
  const smile = new THREE.Mesh(track(new THREE.TorusGeometry(o.mw, 0.006, 6, 12, Math.PI)), mouthMat);
  smile.position.set(0, o.my, o.z);
  smile.rotation.z = Math.PI;
  head.add(smile);
  const frown = new THREE.Mesh(track(new THREE.TorusGeometry(o.mw * 0.8, 0.006, 6, 12, Math.PI)), mouthMat);
  frown.position.set(0, o.my - 0.016, o.z);
  frown.visible = false;
  head.add(frown);
  const inside = mat("mouthIn", { color: 0x3a1d1a, roughness: 0.5, side: THREE.DoubleSide });
  const open = new THREE.Mesh(track(new THREE.CircleGeometry(o.mw * 1.1, 20, Math.PI, Math.PI)), inside);
  open.position.set(0, o.my + 0.002, o.z + 0.001);
  open.visible = false;
  head.add(open);
  const tongue = new THREE.Mesh(track(new THREE.CircleGeometry(o.mw * 0.62, 14, Math.PI, Math.PI)), mat("tongue", { color: 0xe98b8b, roughness: 0.5 }));
  tongue.position.set(0, o.my - 0.004, o.z + 0.0015);
  tongue.visible = false;
  head.add(tongue);
  const oh = new THREE.Mesh(track(new THREE.CircleGeometry(o.mw * 0.55, 16)), inside);
  oh.scale.set(0.9, 1.25, 1);
  oh.position.set(0, o.my - 0.004, o.z + 0.001);
  oh.visible = false;
  head.add(oh);
  return { brows, smile, frown, open, tongue, oh, mood: "smile", hold: 0, browLift: 0, browTilt: 0 };
}

// Moods: how the eyes open, how high the brows sit, which mouth shows.
const MOOD_EYES = { smile: 1, laugh: 0.28, surprise: 1.25, worry: 0.95 };

// Show a mood for a while (seconds). 0 keeps it until the next mood. Returns to smile after the hold.
export function setMood(char, mood, seconds = 0) {
  const f = char.userData.face;
  if (!f) return;
  f.mood = mood;
  f.hold = seconds;
}

// Per-frame face update: blends eyes and brows toward the mood, and picks the mouth shape.
export function updateFace(char, dt) {
  const u = char.userData;
  const f = u.face;
  if (!f) return;
  if (f.hold > 0) {
    f.hold -= dt;
    if (f.hold <= 0) f.mood = "smile";
  }
  const k = Math.min(1, dt * 10);
  const mood = f.mood;
  f.smile.visible = mood === "smile";
  f.frown.visible = mood === "worry";
  f.open.visible = mood === "laugh";
  f.tongue.visible = mood === "laugh";
  f.oh.visible = mood === "surprise";
  u.eyeOpen = (u.eyeOpen === undefined ? 1 : u.eyeOpen) + ((MOOD_EYES[mood] || 1) - (u.eyeOpen === undefined ? 1 : u.eyeOpen)) * k;
  const lift = mood === "surprise" ? 0.012 : mood === "laugh" ? 0.006 : 0;
  const tilt = mood === "worry" ? 1 : 0;
  f.browLift += (lift - f.browLift) * k;
  f.browTilt += (tilt - f.browTilt) * k;
  for (const b of f.brows) {
    b.position.y = b.userData.baseY + f.browLift;
    // Worry lifts the inner ends of the brows.
    b.rotation.z = -b.userData.sx * 0.35 * f.browTilt;
  }
}

// -- Auntie -----------------------------------------------------------------
export function createAuntie() {
  const root = new THREE.Group();
  root.name = "auntie";
  const apronTex = T.apronCloth();

  const skirt = lathe([[0.02, 0.36], [0.2, 0.36], [0.27, 0.6], [0.31, 0.84], [0.0, 0.86]]);
  const skirtMesh = new THREE.Mesh(skirt, cloth("auntieSkirt", 0x4f6685, { side: THREE.DoubleSide }));
  skirtMesh.castShadow = true;
  root.add(skirtMesh);
  // The collar sits low enough that the mouth on the face is not hidden behind it.
  const cardigan = lathe([[0.3, 0.84], [0.31, 0.98], [0.27, 1.11], [0.21, 1.19], [0.15, 1.24], [0.0, 1.25]]);
  const cardMesh = new THREE.Mesh(cardigan, cloth("cardigan", 0xc8b5e6, { side: THREE.DoubleSide }));
  cardMesh.castShadow = true;
  root.add(cardMesh);
  // The apron is a flowered cloth with a matte weave.
  const apron = part(root, new THREE.PlaneGeometry(0.46, 0.56), cloth("apron", 0xffffff, { map: apronTex, roughness: 0.95, sheenColor: new THREE.Color(0xfff4ea) }), 0, 0.8, 0.37);
  apron.rotation.x = -0.05;
  part(root, new THREE.BoxGeometry(0.5, 0.04, 0.03), mat("apronBand", { color: 0xf6f0e2, roughness: 0.9 }), 0, 1.12, 0.36);

  // Legs and slippers
  const legL = group(root, -0.1, 0.36, 0);
  part(legL, new THREE.CylinderGeometry(0.06, 0.06, 0.34, 10), skin(), 0, -0.17, 0);
  part(legL, new THREE.BoxGeometry(0.15, 0.05, 0.24), mat("slipper", { color: 0xf1a4b8, roughness: 0.7 }), 0, -0.36, 0.04);
  const legR = group(root, 0.1, 0.36, 0);
  part(legR, new THREE.CylinderGeometry(0.06, 0.06, 0.34, 10), skin(), 0, -0.17, 0);
  part(legR, new THREE.BoxGeometry(0.15, 0.05, 0.24), mat("slipper", { color: 0xf1a4b8, roughness: 0.7 }), 0, -0.36, 0.04);

  // Arms. The right arm carries things and does the chopping.
  const armL = capsuleLimb(root, 0.072, 0.4, cloth("cardSleeve", 0xc8b5e6), -0.3, 1.18, 0);
  part(armL, new THREE.SphereGeometry(0.075, 12, 10), skin(), 0, -0.6, 0);
  const armR = capsuleLimb(root, 0.072, 0.4, cloth("cardSleeve", 0xc8b5e6), 0.3, 1.18, 0);
  part(armR, new THREE.SphereGeometry(0.075, 12, 10), skin(), 0, -0.6, 0);
  const handR = group(armR, 0, -0.66, 0.02);

  // Head with hair (cap, fringe, sides, back and a bun with a pin), glasses and cheeks
  const head = group(root, 0, 1.36, 0);
  part(head, new THREE.SphereGeometry(0.17, 24, 18), skin(), 0, 0.05, 0);
  part(head, new THREE.SphereGeometry(0.182, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hairDark(), 0, 0.07, -0.01);
  // Fringe over the forehead, a little lower at the sides
  part(head, new THREE.SphereGeometry(0.1, 14, 8), hairDark(), 0, 0.15, 0.1).scale.set(1.5, 0.42, 0.72);
  // Hair over the ears, and the back of the head where the bun sits
  for (const sx of [-1, 1]) part(head, new THREE.SphereGeometry(0.085, 12, 10), hairDark(), sx * 0.13, 0.02, -0.03).scale.set(0.7, 1.7, 1.0);
  part(head, new THREE.SphereGeometry(0.13, 14, 10), hairDark(), 0, -0.01, -0.12).scale.set(1.2, 1.1, 0.8);
  const bun = part(head, new THREE.SphereGeometry(0.085, 14, 12), hairDark(), 0, 0.22, -0.1);
  part(head, new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), mat("pin", { color: 0xe8b04a, metalness: 0.5, roughness: 0.3 }), 0.05, 0.25, -0.1).rotation.z = 0.9;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = part(head, new THREE.SphereGeometry(0.018, 10, 8), eyeDark(), sx * 0.062, 0.05, 0.155, false);
    eyes.push(eye);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.052, 0.007, 8, 24)), mat("glasses", { color: 0x8a6a3c, roughness: 0.3, metalness: 0.4 }));
    ring.position.set(sx * 0.062, 0.05, 0.158);
    head.add(ring);
    const cheekMat = new THREE.SpriteMaterial({ map: T.softDot("rgba(240,140,150,0.75)", "rgba(240,140,150,0)"), transparent: true, depthWrite: false });
    const cheek = new THREE.Sprite(cheekMat);
    cheek.scale.set(0.07, 0.05, 1);
    cheek.position.set(sx * 0.1, -0.035, 0.15);
    head.add(cheek);
  }
  const bridge = new THREE.Mesh(track(new THREE.TorusGeometry(0.02, 0.005, 6, 10, Math.PI)), mat("glasses"));
  bridge.position.set(0, 0.06, 0.158);
  bridge.rotation.z = Math.PI;
  head.add(bridge);
  const face = buildFace(head, { z: 0.16, my: -0.07, mw: 0.03, eyeX: 0.062, browY: 0.11, browZ: 0.12, browW: 0.05, brow: 0x5a4a45 });

  const contact = contactShadowMesh(0.3, 0.006);
  root.add(contact);
  root.userData = {
    kind: "auntie",
    parts: { body: root, head, armL, armR, legL, legR, handR, bun, eyes },
    face,
    walk: 0,
    blink: 2,
    mode: "idle",
    modeT: 0,
    tilt: 0,
    hop: 0,
    lookYaw: 0,
    eyeOpen: 1
  };
  return root;
}

// -- Player ------------------------------------------------------------------
export function createPlayer() {
  const root = new THREE.Group();
  root.name = "player";
  const shorts = lathe([[0.02, 0.4], [0.2, 0.4], [0.22, 0.6], [0.2, 0.66], [0.0, 0.67]]);
  const shortMesh = new THREE.Mesh(shorts, cloth("shorts", 0x2c7a7b, { side: THREE.DoubleSide }));
  shortMesh.castShadow = true;
  root.add(shortMesh);
  const tee = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14)), cloth("tee", 0x8fdcc4));
  tee.position.set(0, 1.0, 0);
  tee.scale.set(1, 1, 0.8);
  tee.castShadow = true;
  root.add(tee);
  const legL = group(root, -0.1, 0.4, 0);
  part(legL, new THREE.CylinderGeometry(0.058, 0.055, 0.42, 10), skin(), 0, -0.21, 0);
  part(legL, new THREE.BoxGeometry(0.16, 0.08, 0.26), mat("sneaker", { color: 0xf8f8f4, roughness: 0.5 }), 0, -0.44, 0.05);
  const legR = group(root, 0.1, 0.4, 0);
  part(legR, new THREE.CylinderGeometry(0.058, 0.055, 0.42, 10), skin(), 0, -0.21, 0);
  part(legR, new THREE.BoxGeometry(0.16, 0.08, 0.26), mat("sneaker", { color: 0xf8f8f4, roughness: 0.5 }), 0, -0.44, 0.05);

  const armL = capsuleLimb(root, 0.06, 0.36, cloth("teeSleeve", 0x8fdcc4), -0.25, 1.32, 0);
  part(armL, new THREE.SphereGeometry(0.06, 10, 8), skin(), 0, -0.56, 0);
  const armR = capsuleLimb(root, 0.06, 0.36, cloth("teeSleeve", 0x8fdcc4), 0.25, 1.32, 0);
  part(armR, new THREE.SphereGeometry(0.06, 10, 8), skin(), 0, -0.56, 0);
  const handR = group(armR, 0, -0.62, 0.03);

  const head = group(root, 0, 1.56, 0);
  part(head, new THREE.SphereGeometry(0.15, 22, 16), skin(), 0, 0.02, 0);
  const hair = mat("playerHair", { color: 0x3b2a22, roughness: 0.55 });
  part(head, new THREE.SphereGeometry(0.158, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.04, -0.01);
  part(head, new THREE.SphereGeometry(0.085, 12, 8), hair, 0, 0.14, 0.095).scale.set(1.5, 0.42, 0.72);
  for (const sx of [-1, 1]) part(head, new THREE.SphereGeometry(0.075, 10, 8), hair, sx * 0.125, 0.02, -0.03).scale.set(0.7, 1.6, 1.0);
  const tail = part(head, new THREE.SphereGeometry(0.07, 12, 10), hair, 0, 0.02, -0.15);
  tail.scale.set(1, 1.6, 0.8);
  const eyes = [];
  for (const sx of [-1, 1]) {
    eyes.push(part(head, new THREE.SphereGeometry(0.016, 10, 8), eyeDark(), sx * 0.055, 0.03, 0.13, false));
  }
  const face = buildFace(head, { z: 0.136, my: -0.06, mw: 0.026, eyeX: 0.055, browY: 0.088, browZ: 0.1, browW: 0.04, brow: 0x3b2a22 });
  const contact = contactShadowMesh(0.26, 0.006);
  root.add(contact);
  root.userData = {
    kind: "player",
    parts: { body: root, head, armL, armR, legL, legR, handR, eyes },
    face,
    walk: 0,
    blink: 1.5,
    mode: "idle",
    modeT: 0,
    tilt: 0,
    hop: 0,
    eyeOpen: 1
  };
  return root;
}

// -- Seated family ----------------------------------------------------------
function seatedBase(kind) {
  const root = new THREE.Group();
  root.name = kind;
  return root;
}

export function createUncle() {
  const root = seatedBase("uncle");
  const shirt = new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 18, 14)), cloth("uncleShirt", 0xd7c7a0));
  shirt.scale.set(1, 1.1, 0.85);
  shirt.position.set(0, 0.92, 0);
  shirt.castShadow = true;
  root.add(shirt);
  const trousers = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.2, 0.7)), cloth("uncleTrousers", 0x4a5a6b));
  trousers.position.set(0, 0.5, 0.32);
  root.add(trousers);
  part(root, new THREE.BoxGeometry(0.16, 0.36, 0.16), cloth("uncleTrousers", 0x4a5a6b), -0.13, 0.28, 0.6);
  part(root, new THREE.BoxGeometry(0.16, 0.36, 0.16), cloth("uncleTrousers", 0x4a5a6b), 0.13, 0.28, 0.6);
  part(root, new THREE.BoxGeometry(0.17, 0.06, 0.26), mat("shoe", { color: 0x3a2a20, roughness: 0.45 }), -0.13, 0.08, 0.7);
  part(root, new THREE.BoxGeometry(0.17, 0.06, 0.26), mat("shoe", { color: 0x3a2a20, roughness: 0.45 }), 0.13, 0.08, 0.7);
  const head = group(root, 0, 1.22, 0);
  part(head, new THREE.SphereGeometry(0.17, 22, 16), skin(), 0, 0, 0);
  part(head, new THREE.SphereGeometry(0.1, 12, 10), mat("uncleHair", { color: 0xbab6b0, roughness: 0.6 }), -0.15, -0.02, -0.02, true);
  part(head, new THREE.SphereGeometry(0.1, 12, 10), mat("uncleHair"), 0.15, -0.02, -0.02, true);
  part(head, new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mat("uncleHair"), 0, 0.05, -0.02).scale.set(1, 0.7, 1);
  const eyes = [];
  for (const sx of [-1, 1]) eyes.push(part(head, new THREE.SphereGeometry(0.016, 8, 6), eyeDark(), sx * 0.06, 0.03, 0.155, false));
  const bs = new THREE.Mesh(track(new THREE.TorusGeometry(0.05, 0.006, 6, 16)), mat("glassesUncle", { color: 0x5b5b5b, roughness: 0.3, metalness: 0.4 }));
  bs.position.set(0.0, 0.03, 0.158);
  head.add(bs);
  const face = buildFace(head, { z: 0.16, my: -0.07, mw: 0.028, eyeX: 0.06, browY: 0.09, browZ: 0.12, browW: 0.04, brow: 0xbab6b0 });
  const armL = capsuleLimb(root, 0.065, 0.34, cloth("uncleShirt", 0xd7c7a0), -0.3, 0.98, 0.04);
  armL.rotation.x = -1.2;
  const armR = capsuleLimb(root, 0.065, 0.34, cloth("uncleShirt", 0xd7c7a0), 0.3, 0.98, 0.04);
  armR.rotation.x = -1.2;
  // Newspaper, held up in front
  const paper = new THREE.Mesh(track(new THREE.PlaneGeometry(0.5, 0.36)), new THREE.MeshStandardMaterial({ map: newsTexture(), side: THREE.DoubleSide, roughness: 0.95, metalness: 0 }));
  paper.position.set(0, 0.98, 0.42);
  paper.rotation.x = -0.25;
  paper.castShadow = true;
  root.add(paper);
  root.userData = { kind: "uncle", parts: { head, armL, armR, paper, eyes }, face, t: 0, reactT: -10, mode: "idle", eyeOpen: 1 };
  return root;
}

function newsTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 180;
  const g = c.getContext("2d");
  g.fillStyle = "#f3f0e8";
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = "#3b3b3b";
  g.fillRect(12, 12, 232, 14);
  for (let y = 40; y < 170; y += 12) {
    g.fillStyle = "rgba(60,60,60,0.55)";
    g.fillRect(14, y, 100 + ((y * 7) % 90), 4);
    g.fillRect(132, y, 100 - ((y * 3) % 40), 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMisaki() {
  const root = seatedBase("misaki");
  const dress = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 18, 14)), cloth("misakiDress", 0xe8594b));
  dress.scale.set(1, 1.1, 0.9);
  dress.position.set(0, 0.7, 0);
  dress.castShadow = true;
  root.add(dress);
  part(root, new THREE.BoxGeometry(0.14, 0.14, 0.44), mat("misakiTights", { color: 0xf3e3c7, roughness: 0.8 }), -0.12, 0.2, 0.25);
  part(root, new THREE.BoxGeometry(0.14, 0.14, 0.44), mat("misakiTights"), 0.12, 0.2, 0.25);
  part(root, new THREE.BoxGeometry(0.14, 0.06, 0.18), mat("misakiShoe", { color: 0xe8594b, roughness: 0.5 }), -0.12, 0.13, 0.5);
  part(root, new THREE.BoxGeometry(0.14, 0.06, 0.18), mat("misakiShoe"), 0.12, 0.13, 0.5);
  const head = group(root, 0, 0.98, 0);
  part(head, new THREE.SphereGeometry(0.15, 20, 14), skin(), 0, 0, 0);
  const hair = mat("misakiHair", { color: 0x3c2a20, roughness: 0.55 });
  part(head, new THREE.SphereGeometry(0.155, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.03, -0.01);
  part(head, new THREE.SphereGeometry(0.085, 12, 8), hair, 0, 0.13, 0.09).scale.set(1.5, 0.42, 0.72);
  part(head, new THREE.SphereGeometry(0.05, 10, 8), hair, -0.17, 0.02, -0.02);
  part(head, new THREE.SphereGeometry(0.05, 10, 8), hair, 0.17, 0.02, -0.02);
  const eyes = [];
  for (const sx of [-1, 1]) eyes.push(part(head, new THREE.SphereGeometry(0.018, 8, 6), eyeDark(), sx * 0.055, 0.02, 0.135, false));
  const face = buildFace(head, { z: 0.14, my: -0.06, mw: 0.03, eyeX: 0.055, browY: 0.08, browZ: 0.11, browW: 0.04, brow: 0x3c2a20 });
  const armL = capsuleLimb(root, 0.05, 0.26, cloth("misakiDress", 0xe8594b), -0.22, 0.7, 0.05);
  armL.rotation.x = -0.8;
  const armR = capsuleLimb(root, 0.05, 0.26, cloth("misakiDress", 0xe8594b), 0.22, 0.7, 0.05);
  armR.rotation.x = -0.8;
  root.userData = { kind: "misaki", parts: { head, armL, armR, dress, eyes }, face, t: 0, reactT: -10, eyeOpen: 1 };
  return root;
}

// Small helpers used by the app.

// Walking limbs swing and the body bobs.
export function animateWalk(char, speed, dt) {
  const u = char.userData;
  const p = u.parts;
  if (speed > 0.02) {
    u.walk += dt * speed * 6.5;
    const s = Math.sin(u.walk);
    p.legL.rotation.x = s * 0.5;
    p.legR.rotation.x = -s * 0.5;
    if (!u.carrying) {
      p.armL.rotation.x = -s * 0.4;
      p.armR.rotation.x = s * 0.4;
    }
    p.body.position.y = Math.abs(Math.cos(u.walk)) * 0.03;
  } else {
    p.legL.rotation.x *= 0.85;
    p.legR.rotation.x *= 0.85;
    p.body.position.y *= 0.8;
  }
}

// Rest pose: arms relaxed. Cooking pose: arms forward and down.
export function setPose(char, pose, t) {
  const p = char.userData.parts;
  if (pose === "cook") {
    p.armL.rotation.x += (-1.05 - p.armL.rotation.x) * 0.2;
    p.armR.rotation.x += (-1.1 + Math.sin(t * 5) * 0.12 - p.armR.rotation.x) * 0.2;
    p.armL.rotation.z += (-0.18 - p.armL.rotation.z) * 0.2;
    p.armR.rotation.z += (0.12 - p.armR.rotation.z) * 0.2;
  } else if (pose === "wave") {
    p.armR.rotation.z += (-2.5 + Math.sin(t * 6) * 0.25 - p.armR.rotation.z) * 0.2;
    p.armR.rotation.x += (-0.2 - p.armR.rotation.x) * 0.2;
  } else {
    p.armL.rotation.x *= 0.85;
    p.armR.rotation.x *= 0.85;
    p.armL.rotation.z *= 0.85;
    p.armR.rotation.z *= 0.85;
  }
}

// Blinks scale the eyes down for a moment. The mood sets how open they are (squinting when laughing).
export function blinkEyes(char, dt) {
  const u = char.userData;
  u.blink -= dt;
  let s = 1;
  if (u.blink < 0.12 && u.blink > 0) s = 0.1;
  if (u.blink <= 0) u.blink = 2 + ((u.blinkCount = ((u.blinkCount || 0) + 1)) * 0.618) % 3;
  const open = u.eyeOpen === undefined ? 1 : u.eyeOpen;
  for (const e of u.parts.eyes) e.scale.y = s * open;
}

// Look toward a world point: head yaw only, with a clamp.
export function lookAt(char, worldPos) {
  const u = char.userData;
  const local = char.worldToLocal(worldPos.clone());
  const yaw = Math.atan2(local.x, local.z);
  const clamped = Math.max(-1.0, Math.min(1.0, yaw));
  u.lookYaw += (clamped - u.lookYaw) * 0.12;
  u.parts.head.rotation.y = u.lookYaw;
}

export function faceAngle(char, angle) {
  char.rotation.y = angle;
}

export { T };
