// Builds the farmhouse, garden and well from the sim's world description.
// Map (x, y) becomes world (x, z). Heights are metres above the house floor.
import * as THREE from "../vendor/three.module.js";

// Merged-geometry helper: quads and boxes collected into one BufferGeometry.
export class Geo {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
  }

  quad(a, b, c, d, n, us = 1, vs = 1) {
    // Pick the triangle winding that faces the normal n.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const tris = flip ? [[a, d, c], [a, c, b]] : [[a, b, c], [a, c, d]];
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    for (const tri of tris) {
      for (const p of tri) {
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(n[0], n[1], n[2]);
        let u;
        let v;
        if (ax >= ay && ax >= az) { u = p[2]; v = p[1]; }
        else if (ay >= az) { u = p[0]; v = p[2]; }
        else { u = p[0]; v = p[1]; }
        this.uv.push(u * us, v * vs);
      }
    }
  }

  box(x0, y0, z0, x1, y1, z1, us = 1, vs = 1) {
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], us, vs);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], us, vs);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], us, vs);
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], us, vs);
    this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1], us, vs);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], us, vs);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  empty() {
    return this.pos.length === 0;
  }
}

const FLOOR_Y = { earth: -0.04, wood: 0, tatami: 0.035, tile: 0, mud: -0.12, stone: -0.07 };
const CEILING_Y = 2.6;
const EAVE_Y = 2.4;

function addMesh(group, geo, mat, cast = true) {
  if (geo.empty()) return null;
  const m = new THREE.Mesh(geo.geometry(), mat);
  m.receiveShadow = true;
  m.castShadow = cast;
  group.add(m);
  return m;
}

// Applies the sliding position of a door's two leaves. t: 0 closed, 1 open.
export function applyLeaves(state, t) {
  const along = state.vertical ? "z" : "x";
  const off = -0.5 * t;
  state.leafA.position[along] = -0.25 + off;
  state.leafB.position[along] = 0.25 + off;
}

// Static house: floors, ceilings, beams, walls, roof, garden ground and doors.
export function buildHouse(world, M) {
  const group = new THREE.Group();
  const floors = {};
  const ceilings = new Geo();
  const beams = new Geo();
  const walls = { plaster: new Geo(), boarding: new Geo(), clay: new Geo(), trim: new Geo() };

  for (const c of world.cells) {
    if (!c || !c.walk) continue;
    if (!floors[c.floor]) floors[c.floor] = new Geo();
    const g = floors[c.floor];
    if (c.floor === "tatami") {
      g.box(c.x, 0, c.y, c.x + 1, FLOOR_Y.tatami, c.y + 1, 1 / 1.8, 1 / 1.8);
    } else {
      const Y = FLOOR_Y[c.floor];
      g.quad([c.x, Y, c.y], [c.x + 1, Y, c.y], [c.x + 1, Y, c.y + 1], [c.x, Y, c.y + 1], [0, 1, 0], 1 / 2, 1 / 2);
    }
    if (c.room === "garden") continue;
    const h = c.room === "engawa" ? EAVE_Y : CEILING_Y;
    ceilings.quad([c.x, h, c.y], [c.x + 1, h, c.y], [c.x + 1, h, c.y + 1], [c.x, h, c.y + 1], [0, -1, 0], 1 / 2, 1 / 2);
  }

  // Exposed beams across the house, roughly every two metres.
  for (const yb of [6, 8, 10, 12]) {
    beams.box(1, CEILING_Y - 0.22, yb - 0.09, 14, CEILING_Y, yb + 0.09, 1 / 2, 1 / 2);
  }
  beams.box(1, EAVE_Y - 0.2, 4.95, 14, EAVE_Y, 5.12, 1 / 2, 1 / 2);

  for (const s of world.walls) {
    const T = 0.08;
    const bucket = s.kind === "outer" ? walls.boarding : s.kind === "fence" ? walls.clay : walls.plaster;
    const H = s.height;
    if (s.vertical) {
      bucket.box(s.x0 - T, -0.12, s.y0, s.x0 + T, H, s.y1, 1 / 2, 1 / 2.6);
      if (s.kind === "partition" || s.kind === "kura") {
        walls.trim.box(s.x0 - 0.09, 0, s.y0, s.x0 + 0.09, 0.14, s.y1, 1, 1);
      }
    } else {
      bucket.box(s.x0, -0.12, s.y0 - T, s.x1, H, s.y0 + T, 1 / 2, 1 / 2.6);
      if (s.kind === "partition" || s.kind === "kura") {
        walls.trim.box(s.x0, 0, s.y0 - 0.09, s.x1, 0.14, s.y0 + 0.09, 1, 1);
      }
    }
  }

  // Ground beyond the cells, under everything.
  const ground = new Geo();
  ground.quad([-12, -0.16, -12], [30, -0.16, -12], [30, -0.16, 26], [-12, -0.16, 26], [0, 1, 0], 1 / 3, 1 / 3);

  // Roof slabs: a flat lid over the house and a tiled cap over the storehouse.
  const roof = new Geo();
  roof.box(0.4, 2.62, 4.6, 14.6, 2.78, 13.6, 1 / 3, 1 / 3);
  roof.box(13.9, 2.6, -0.3, 16.3, 2.8, 3.8, 1 / 2, 1 / 2);

  for (const kind of Object.keys(floors)) {
    addMesh(group, floors[kind], M.floor[kind]);
  }
  addMesh(group, ceilings, M.ceiling);
  addMesh(group, beams, M.beam);
  addMesh(group, walls.plaster, M.plaster);
  addMesh(group, walls.boarding, M.boarding);
  addMesh(group, walls.clay, M.clay);
  addMesh(group, walls.trim, M.trim);
  addMesh(group, roof, M.roof);
  addMesh(group, ground, M.ground, false);

  // Sliding doors: two leaves in a frame, moved by applyLeaves.
  const doors = world.doors.map(d => {
    const vertical = d.dir === "E" || d.dir === "W";
    const g = new THREE.Group();
    g.position.set(d.cx, 0, d.cy);
    const leafMat = d.kind === "shoji" ? M.shojiMat : M.fusumaMat;
    const leafGeo = vertical ? new THREE.BoxGeometry(0.03, 2.08, 0.5) : new THREE.BoxGeometry(0.5, 2.08, 0.03);
    const leafA = new THREE.Mesh(leafGeo, leafMat);
    const leafB = new THREE.Mesh(leafGeo, leafMat);
    leafA.castShadow = true;
    leafB.castShadow = true;
    leafA.position.y = 1.04;
    leafB.position.y = 1.04;
    g.add(leafA, leafB);
    const frame = new Geo();
    if (vertical) {
      frame.box(-0.04, 2.08, -0.5, 0.04, 2.2, 0.5, 1, 1);
      frame.box(-0.04, 0, -0.56, 0.04, 2.2, -0.46, 1, 1);
      frame.box(-0.04, 0, 0.46, 0.04, 2.2, 0.56, 1, 1);
    } else {
      frame.box(-0.5, 2.08, -0.04, 0.5, 2.2, 0.04, 1, 1);
      frame.box(-0.56, 0, -0.04, -0.46, 2.2, 0.04, 1, 1);
      frame.box(0.46, 0, -0.04, 0.56, 2.2, 0.04, 1, 1);
    }
    addMesh(g, frame, M.trim);
    group.add(g);
    const state = { t: d.defaultOpen ? 1 : 0, vertical, leafA, leafB };
    applyLeaves(state, state.t);
    return { index: d.index, id: d.id, obj: g, state };
  });

  return { group, doors };
}

// The well: stone ring, dark shaft, wooden frame with rope and bucket, and the lid.
export function buildWell(world, M) {
  const g = new THREE.Group();
  const w = world.well;
  g.position.set(w.x, 0, w.y);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 1.0, 26, 1, true), M.wellStone || M.stone);
  ring.position.y = 0.5;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);
  const top = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 26), M.wellStone || M.stone);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 1.005;
  top.receiveShadow = true;
  g.add(top);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 18, 1, true), M.wellInside);
  shaft.position.y = 0.5;
  g.add(shaft);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), M.wellWater);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  g.add(water);

  const postGeo = new THREE.BoxGeometry(0.1, 1.85, 0.1);
  const postA = new THREE.Mesh(postGeo, M.woodDark);
  const postB = new THREE.Mesh(postGeo, M.woodDark);
  postA.position.set(-0.52, 0.92, 0);
  postB.position.set(0.52, 0.92, 0);
  postA.castShadow = true;
  postB.castShadow = true;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.09, 0.09), M.woodDark);
  bar.position.set(0, 1.84, 0);
  bar.castShadow = true;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.32, 5), M.rope);
  rope.position.set(0, 1.18, 0);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.2, 12, 1, true), M.woodDark);
  bucket.position.set(0, 0.52, 0);
  g.add(postA, postB, bar, rope, bucket);

  // The lid lies open on the ground. It is moved onto the mouth when the well is sealed.
  const lid = new THREE.Group();
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.92), M.woodDark);
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  lid.add(lidMesh);
  for (const sx of [-0.3, 0, 0.3]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.94), M.trim);
    slat.position.set(sx, 0.03, 0);
    lid.add(slat);
  }
  lid.position.set(1.05, 0.05, 0.25);
  lid.rotation.set(0, 0.3, 1.5);
  g.add(lid);

  const mist = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.mistTex, transparent: true, depthWrite: false, opacity: 0.45 }));
    s.scale.set(1.6, 1.1, 1);
    s.position.set(0, 0.25 + i * 0.25, 0);
    g.add(s);
    mist.push(s);
  }

  return {
    group: g,
    lid,
    mist,
    lidOpen: { pos: new THREE.Vector3(1.05, 0.05, 0.25), rot: new THREE.Euler(0, 0.3, 1.5) },
    lidClosed: { pos: new THREE.Vector3(0, 1.03, 0), rot: new THREE.Euler(0, 0, 0) }
  };
}

// Bare trees at the garden's edge, mostly swallowed by the fog.
export function buildTrees(M, spots) {
  const g = new THREE.Group();
  for (const p of spots) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 3.4, 7), M.bark);
    trunk.position.y = 1.7;
    trunk.castShadow = true;
    t.add(trunk);
    for (let i = 0; i < 5; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1.2, 5), M.bark);
      br.position.set(Math.cos(i * 1.3) * 0.45, 2.5 + i * 0.13, Math.sin(i * 1.3) * 0.45);
      br.rotation.set(Math.sin(i * 2.1) * 0.7, 0, Math.cos(i * 2.1) * 0.9);
      br.castShadow = true;
      t.add(br);
    }
    t.position.set(p[0], 0, p[1]);
    t.rotation.y = p[2] || 0;
    g.add(t);
  }
  return g;
}
