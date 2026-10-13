// The figure at the well: a tall, thin woman in a wet white yukata, hair over her face.
// Built from primitives with a small rig. Her state drives the pose.
import * as THREE from "../vendor/three.module.js";

function strandFrom(seed) {
  // Deterministic pseudo-random for strand lengths and offsets.
  const r = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return r - Math.floor(r);
}

export function createEntity(M) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Hem and skirt: wet cloth falling to the ground.
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.23, 0.92, 14, 1, true), M.cloth);
  skirt.position.y = 0.46;
  skirt.castShadow = true;
  body.add(skirt);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.78, 12), M.cloth);
  torso.position.y = 1.27;
  torso.castShadow = true;
  body.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.16, 8), M.skin);
  neck.position.y = 1.72;
  body.add(neck);

  // Head pivot sits at the top of the neck.
  const head = new THREE.Group();
  head.position.set(0, 1.82, 0);
  body.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), M.skin);
  skull.castShadow = true;
  head.add(skull);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hair);
  cap.position.y = 0.012;
  cap.castShadow = true;
  head.add(cap);
  // Long hair falling behind her back.
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.15, 0.92, 14, 1, true), M.hair);
  back.position.set(0, -0.44, -0.035);
  back.castShadow = true;
  head.add(back);
  // Veil over the face, and loose strands in front.
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.46), M.hair);
  veil.position.set(0, -0.1, 0.104);
  head.add(veil);
  for (let i = 0; i < 16; i++) {
    const a = strandFrom(i * 3 + 1);
    const b = strandFrom(i * 3 + 2);
    const L = 0.3 + b * 0.32;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, L, 0.01), M.hair);
    s.position.set(-0.11 + a * 0.22, -0.02 - L / 2, 0.095 + b * 0.02);
    s.rotation.z = (a - 0.5) * 0.25;
    s.castShadow = true;
    head.add(s);
  }

  // Arms: pivot at the shoulder, with a jointed elbow.
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 1.6, 0);
    body.add(pivot);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.46, 8), M.cloth);
    upper.position.y = -0.23;
    upper.castShadow = true;
    pivot.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.46;
    pivot.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.44, 8), M.cloth);
    fore.position.y = -0.22;
    fore.castShadow = true;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), M.skin);
    hand.position.y = -0.46;
    hand.scale.set(0.8, 1.6, 0.6);
    elbow.add(hand);
    arms.push({ pivot, elbow, side });
  }

  // Bare feet at the hem.
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.skin);
    foot.scale.set(0.8, 0.45, 1.8);
    foot.position.set(side * 0.06, 0.02, 0.1);
    body.add(foot);
  }

  root.traverse(o => { if (o.isMesh) o.frustumCulled = true; });

  const rig = { root, body, head, arms, phase: 0, face: 0, lastX: null, lastY: null, sink: 0, jitter: 0 };
  return rig;
}

// Update the pose from the sim's entity and the player's position (map coordinates).
export function poseEntity(rig, ent, player, t, dt) {
  const moving = rig.lastX !== null && Math.hypot(ent.x - rig.lastX, ent.y - rig.lastY) > 0.0015;
  rig.root.position.set(ent.x, 0, ent.y);
  if (moving) {
    const vx = ent.x - rig.lastX;
    const vy = ent.y - rig.lastY;
    rig.face = Math.atan2(vx, vy);
    rig.phase += dt * (ent.state === "STUNNED" ? 14 : 5.5);
  }
  rig.lastX = ent.x;
  rig.lastY = ent.y;
  rig.root.rotation.y = rig.face;

  const st = ent.state;
  let swayZ = Math.sin(t * 0.8) * 0.025;
  let bob = 0;
  let armSwing = Math.sin(t * 0.9) * 0.05;
  let headX = 0.12;
  let headZ = Math.sin(t * 0.55) * 0.06;
  let headY = 0;

  if (st === "STALK" && moving) {
    // Jerky stalk: the body steps forward in small hitches.
    bob = Math.abs(Math.sin(rig.phase)) * 0.03;
    swayZ += Math.sin(rig.phase) * 0.03;
    armSwing = Math.sin(rig.phase) * 0.22;
    headX = 0.22;
  } else if (st === "FROZEN") {
    swayZ = 0;
    headX = 0.05;
    armSwing = 0.02;
  } else if (st === "STUNNED") {
    rig.jitter = (rig.jitter + dt * 25) % 1000;
    swayZ = Math.sin(t * 19) * 0.12;
    bob = Math.abs(Math.sin(t * 13)) * 0.08;
    armSwing = Math.sin(t * 31) * 0.9;
    headX = 0.5 + Math.sin(t * 17) * 0.35;
    headY = Math.sin(t * 23) * 0.5;
  } else if (st === "DORMANT") {
    headX = 0.35;
    armSwing = Math.sin(t * 0.5) * 0.03;
  }

  // Gaze: when she is seen, her head turns toward the player.
  if (ent.seen || st === "FROZEN") {
    const dx = player.x - ent.x;
    const dy = player.y - ent.y;
    const want = Math.atan2(dx, dy) - rig.face;
    let rel = Math.atan2(Math.sin(want), Math.cos(want));
    headY = rel * 0.9;
  }

  if (st === "SEALED") {
    rig.sink = Math.min(2.2, rig.sink + dt * 0.35);
  }

  rig.body.position.y = -rig.sink + bob;
  rig.body.rotation.z = swayZ;
  rig.head.rotation.set(headX, headY, headZ);
  rig.arms.forEach(a => {
    a.pivot.rotation.x = armSwing * (a.side === -1 ? 1 : -0.7);
    a.elbow.rotation.x = Math.max(0, -armSwing) * 0.4 + 0.08;
  });
}
