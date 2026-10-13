// Primitive characters: auntie, the player, and the seated uncle and Misaki.
// Each one is a hierarchy of groups. Animation only changes rotations and small offsets.
import * as THREE from "../vendor/three.module.js";
import * as T from "./textures.js";

const geoCache = [];
function track(g) {
  geoCache.push(g);
  return g;
}

const matCache = {};
function mat(key, opts) {
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, opts));
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
const skin = () => mat("skin", { color: 0xf2c7a5, roughness: 0.7 });
const hairDark = () => mat("hairDark", { color: 0x5a4a45, roughness: 0.6 });
const eyeDark = () => mat("eyeDark", { color: 0x2b1d18, roughness: 0.5 });

// -- Auntie -----------------------------------------------------------------
export function createAuntie() {
  const root = new THREE.Group();
  root.name = "auntie";
  const apronTex = T.apronCloth();
  const apronMat = new THREE.MeshLambertMaterial({ map: apronTex, roughness: 0.9 });
  mat("apron", { map: apronTex });

  const skirt = lathe([[0.02, 0.36], [0.2, 0.36], [0.27, 0.6], [0.31, 0.84], [0.0, 0.86]]);
  const skirtMesh = new THREE.Mesh(skirt, mat("auntieSkirt", { color: 0x4f6685, roughness: 0.85, side: THREE.DoubleSide }));
  skirtMesh.castShadow = true;
  root.add(skirtMesh);
  const cardigan = lathe([[0.3, 0.84], [0.31, 0.98], [0.27, 1.12], [0.22, 1.24], [0.16, 1.3], [0.0, 1.31]]);
  const cardMesh = new THREE.Mesh(cardigan, mat("cardigan", { color: 0xc8b5e6, roughness: 0.8, side: THREE.DoubleSide }));
  cardMesh.castShadow = true;
  root.add(cardMesh);
  const apron = part(root, new THREE.PlaneGeometry(0.46, 0.56), apronMat, 0, 0.8, 0.37);
  apron.rotation.x = -0.05;
  part(root, new THREE.BoxGeometry(0.5, 0.04, 0.03), mat("apronBand", { color: 0xf6f0e2 }), 0, 1.12, 0.36);

  // Legs and slippers
  const legL = group(root, -0.1, 0.36, 0);
  part(legL, new THREE.CylinderGeometry(0.06, 0.06, 0.34, 10), skin(), 0, -0.17, 0);
  part(legL, new THREE.BoxGeometry(0.15, 0.05, 0.24), mat("slipper", { color: 0xf1a4b8 }), 0, -0.36, 0.04);
  const legR = group(root, 0.1, 0.36, 0);
  part(legR, new THREE.CylinderGeometry(0.06, 0.06, 0.34, 10), skin(), 0, -0.17, 0);
  part(legR, new THREE.BoxGeometry(0.15, 0.05, 0.24), mat("slipper", { color: 0xf1a4b8 }), 0, -0.36, 0.04);

  // Arms. The right arm carries things and does the chopping.
  const armL = capsuleLimb(root, 0.072, 0.4, mat("cardSleeve", { color: 0xc8b5e6, roughness: 0.8 }), -0.3, 1.18, 0);
  part(armL, new THREE.SphereGeometry(0.075, 12, 10), skin(), 0, -0.6, 0);
  const armR = capsuleLimb(root, 0.072, 0.4, mat("cardSleeve", { color: 0xc8b5e6, roughness: 0.8 }), 0.3, 1.18, 0);
  part(armR, new THREE.SphereGeometry(0.075, 12, 10), skin(), 0, -0.6, 0);
  const handR = group(armR, 0, -0.66, 0.02);

  // Head with hair, bun, pin, round glasses, cheeks and dot eyes
  const head = group(root, 0, 1.36, 0);
  part(head, new THREE.SphereGeometry(0.17, 24, 18), skin(), 0, 0.05, 0);
  part(head, new THREE.SphereGeometry(0.182, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hairDark(), 0, 0.07, -0.01);
  const bun = part(head, new THREE.SphereGeometry(0.085, 14, 12), hairDark(), 0, 0.22, -0.1);
  part(head, new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), mat("pin", { color: 0xe8b04a, metalness: 0.4 }), 0.05, 0.25, -0.1).rotation.z = 0.9;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = part(head, new THREE.SphereGeometry(0.018, 10, 8), eyeDark(), sx * 0.062, 0.05, 0.155, false);
    eyes.push(eye);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.052, 0.007, 8, 24)), mat("glasses", { color: 0x8a6a3c, roughness: 0.4, metalness: 0.3 }));
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
  const smile = new THREE.Mesh(track(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI)), mat("mouth", { color: 0x9b4b44 }));
  smile.position.set(0, -0.07, 0.16);
  smile.rotation.z = Math.PI;
  head.add(smile);

  root.userData = {
    kind: "auntie",
    parts: { body: root, head, armL, armR, legL, legR, handR, bun, eyes },
    walk: 0,
    blink: 2,
    mode: "idle",
    modeT: 0,
    tilt: 0,
    hop: 0,
    lookYaw: 0
  };
  return root;
}

// -- Player ------------------------------------------------------------------
export function createPlayer() {
  const root = new THREE.Group();
  root.name = "player";
  const shorts = lathe([[0.02, 0.4], [0.2, 0.4], [0.22, 0.6], [0.2, 0.66], [0.0, 0.67]]);
  const shortMesh = new THREE.Mesh(shorts, mat("shorts", { color: 0x2c7a7b, roughness: 0.8, side: THREE.DoubleSide }));
  shortMesh.castShadow = true;
  root.add(shortMesh);
  const tee = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14)), mat("tee", { color: 0x8fdcc4, roughness: 0.8 }));
  tee.position.set(0, 1.0, 0);
  tee.scale.set(1, 1, 0.8);
  tee.castShadow = true;
  root.add(tee);
  const legL = group(root, -0.1, 0.4, 0);
  part(legL, new THREE.CylinderGeometry(0.058, 0.055, 0.42, 10), skin(), 0, -0.21, 0);
  part(legL, new THREE.BoxGeometry(0.16, 0.08, 0.26), mat("sneaker", { color: 0xf8f8f4 }), 0, -0.44, 0.05);
  const legR = group(root, 0.1, 0.4, 0);
  part(legR, new THREE.CylinderGeometry(0.058, 0.055, 0.42, 10), skin(), 0, -0.21, 0);
  part(legR, new THREE.BoxGeometry(0.16, 0.08, 0.26), mat("sneaker", { color: 0xf8f8f4 }), 0, -0.44, 0.05);

  const armL = capsuleLimb(root, 0.06, 0.36, mat("teeSleeve", { color: 0x8fdcc4, roughness: 0.8 }), -0.25, 1.32, 0);
  part(armL, new THREE.SphereGeometry(0.06, 10, 8), skin(), 0, -0.56, 0);
  const armR = capsuleLimb(root, 0.06, 0.36, mat("teeSleeve", { color: 0x8fdcc4, roughness: 0.8 }), 0.25, 1.32, 0);
  part(armR, new THREE.SphereGeometry(0.06, 10, 8), skin(), 0, -0.56, 0);
  const handR = group(armR, 0, -0.62, 0.03);

  const head = group(root, 0, 1.56, 0);
  part(head, new THREE.SphereGeometry(0.15, 22, 16), skin(), 0, 0.02, 0);
  part(head, new THREE.SphereGeometry(0.158, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat("playerHair", { color: 0x3b2a22, roughness: 0.6 }), 0, 0.04, -0.01);
  const tail = part(head, new THREE.SphereGeometry(0.07, 12, 10), mat("playerHair"), 0, 0.02, -0.15);
  tail.scale.set(1, 1.6, 0.8);
  const eyes = [];
  for (const sx of [-1, 1]) {
    eyes.push(part(head, new THREE.SphereGeometry(0.016, 10, 8), eyeDark(), sx * 0.055, 0.03, 0.13, false));
  }
  const smile = new THREE.Mesh(track(new THREE.TorusGeometry(0.025, 0.005, 6, 12, Math.PI)), mat("mouth", { color: 0xa4544c }));
  smile.position.set(0, -0.06, 0.135);
  smile.rotation.z = Math.PI;
  head.add(smile);
  root.userData = {
    kind: "player",
    parts: { body: root, head, armL, armR, legL, legR, handR, eyes },
    walk: 0,
    blink: 1.5,
    mode: "idle",
    modeT: 0,
    tilt: 0,
    hop: 0
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
  const shirt = new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 18, 14)), mat("uncleShirt", { color: 0xd7c7a0, roughness: 0.85 }));
  shirt.scale.set(1, 1.1, 0.85);
  shirt.position.set(0, 0.92, 0);
  shirt.castShadow = true;
  root.add(shirt);
  const trousers = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.2, 0.7)), mat("uncleTrousers", { color: 0x4a5a6b, roughness: 0.85 }));
  trousers.position.set(0, 0.5, 0.32);
  root.add(trousers);
  part(root, new THREE.BoxGeometry(0.16, 0.36, 0.16), mat("uncleTrousers"), -0.13, 0.28, 0.6);
  part(root, new THREE.BoxGeometry(0.16, 0.36, 0.16), mat("uncleTrousers"), 0.13, 0.28, 0.6);
  part(root, new THREE.BoxGeometry(0.17, 0.06, 0.26), mat("shoe", { color: 0x3a2a20 }), -0.13, 0.08, 0.7);
  part(root, new THREE.BoxGeometry(0.17, 0.06, 0.26), mat("shoe", { color: 0x3a2a20 }), 0.13, 0.08, 0.7);
  const head = group(root, 0, 1.22, 0);
  part(head, new THREE.SphereGeometry(0.17, 22, 16), skin(), 0, 0, 0);
  part(head, new THREE.SphereGeometry(0.1, 12, 10), mat("uncleHair", { color: 0xbab6b0 }), -0.15, -0.02, -0.02, true);
  part(head, new THREE.SphereGeometry(0.1, 12, 10), mat("uncleHair"), 0.15, -0.02, -0.02, true);
  for (const sx of [-1, 1]) part(head, new THREE.SphereGeometry(0.016, 8, 6), eyeDark(), sx * 0.06, 0.03, 0.155, false);
  const bs = new THREE.Mesh(track(new THREE.TorusGeometry(0.05, 0.006, 6, 16)), mat("glasses", { color: 0x5b5b5b }));
  bs.position.set(0.0, 0.03, 0.158);
  head.add(bs);
  const armL = capsuleLimb(root, 0.065, 0.34, mat("uncleShirt"), -0.3, 0.98, 0.04);
  armL.rotation.x = -1.2;
  const armR = capsuleLimb(root, 0.065, 0.34, mat("uncleShirt"), 0.3, 0.98, 0.04);
  armR.rotation.x = -1.2;
  // Newspaper, held up in front
  const paper = new THREE.Mesh(track(new THREE.PlaneGeometry(0.5, 0.36)), new THREE.MeshLambertMaterial({ map: newsTexture(), side: THREE.DoubleSide, roughness: 0.95 }));
  paper.position.set(0, 0.98, 0.42);
  paper.rotation.x = -0.25;
  paper.castShadow = true;
  root.add(paper);
  root.userData = { kind: "uncle", parts: { head, armL, armR, paper }, t: 0, reactT: -10, mode: "idle" };
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
  const dress = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 18, 14)), mat("misakiDress", { color: 0xe8594b, roughness: 0.8 }));
  dress.scale.set(1, 1.1, 0.9);
  dress.position.set(0, 0.7, 0);
  dress.castShadow = true;
  root.add(dress);
  part(root, new THREE.BoxGeometry(0.14, 0.14, 0.44), mat("misakiTights", { color: 0xf3e3c7 }), -0.12, 0.2, 0.25);
  part(root, new THREE.BoxGeometry(0.14, 0.14, 0.44), mat("misakiTights"), 0.12, 0.2, 0.25);
  part(root, new THREE.BoxGeometry(0.14, 0.06, 0.18), mat("misakiShoe", { color: 0xe8594b }), -0.12, 0.13, 0.5);
  part(root, new THREE.BoxGeometry(0.14, 0.06, 0.18), mat("misakiShoe"), 0.12, 0.13, 0.5);
  const head = group(root, 0, 0.98, 0);
  part(head, new THREE.SphereGeometry(0.15, 20, 14), skin(), 0, 0, 0);
  part(head, new THREE.SphereGeometry(0.155, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat("misakiHair", { color: 0x3c2a20 }), 0, 0.03, -0.01);
  part(head, new THREE.SphereGeometry(0.05, 10, 8), mat("misakiHair"), -0.17, 0.02, -0.02);
  part(head, new THREE.SphereGeometry(0.05, 10, 8), mat("misakiHair"), 0.17, 0.02, -0.02);
  for (const sx of [-1, 1]) part(head, new THREE.SphereGeometry(0.018, 8, 6), eyeDark(), sx * 0.055, 0.02, 0.135, false);
  const smile = new THREE.Mesh(track(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI)), mat("mouth", { color: 0xa4544c }));
  smile.position.set(0, -0.06, 0.14);
  smile.rotation.z = Math.PI;
  head.add(smile);
  const armL = capsuleLimb(root, 0.05, 0.26, mat("misakiDress"), -0.22, 0.7, 0.05);
  armL.rotation.x = -0.8;
  const armR = capsuleLimb(root, 0.05, 0.26, mat("misakiDress"), 0.22, 0.7, 0.05);
  armR.rotation.x = -0.8;
  root.userData = { kind: "misaki", parts: { head, armL, armR, dress }, t: 0, reactT: -10 };
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

export function blinkEyes(char, dt) {
  const u = char.userData;
  u.blink -= dt;
  let s = 1;
  if (u.blink < 0.12 && u.blink > 0) s = 0.1;
  if (u.blink <= 0) u.blink = 2 + ((u.blinkCount = ((u.blinkCount || 0) + 1)) * 0.618) % 3;
  for (const e of u.parts.eyes) e.scale.y = s;
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
