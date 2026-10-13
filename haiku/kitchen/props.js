// Visuals for pots, pans, bowls, plates, food and items. They are rebuilt only when the
// world changes, and they mirror the sim state. Nothing here changes game state.
import * as THREE from "../vendor/three.module.js";
import { LAYOUT } from "./world.js";

const cache = {};
function mat(key, opts) {
  if (!cache[key]) cache[key] = new THREE.MeshLambertMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, opts));
  return cache[key];
}
const steel = () => mat("potSteel", { color: 0xa4acb1, roughness: 0.35, metalness: 0.6 });
const dark = () => mat("pDark", { color: 0x3b3f44, roughness: 0.5, metalness: 0.3 });
const wood = () => mat("pWood", { color: 0x9a6a3e, roughness: 0.7 });
const white = () => mat("pWhite", { color: 0xfbf8f2, roughness: 0.45, side: THREE.DoubleSide });

// Each call makes geometry that the caller disposes when the group is rebuilt.
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material, x, y, z) {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
  m.position.set(x, y, z);
  return m;
}

function disc(r, h, material, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  m.position.set(x, y, z);
  return m;
}

const BROTH = {
  water: [0x9fd3e6, 0.6],
  dashi: [0xe8c88a, 0.9],
  miso: [0xd6a24e, 0.95],
  niku: [0x8d4f26, 0.96]
};

function brothFor(v) {
  if (v.seasoning && (v.seasoning.shoyu || 0) > 0) return BROTH.niku;
  if (v.contents && v.contents.indexOf("miso") >= 0) return BROTH.miso;
  if (v.contents && v.contents.indexOf("dashi") >= 0) return BROTH.dashi;
  return BROTH.water;
}

// Small cut pieces in a ring, so the pot reads as full of food.
function ingredientPiece(kind, i, n) {
  const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
  const r = 0.07 + (i % 2) * 0.035;
  let m;
  if (kind === "tofu") m = box(0.04, 0.03, 0.04, white(), 0, 0, 0);
  else if (kind === "negi") m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), mat("pNegi", { color: 0x7dbb4a }));
  else if (kind === "beef") m = box(0.045, 0.02, 0.03, mat("pBeef", { color: 0x9a3d32 }), 0, 0, 0);
  else if (kind === "potato") m = box(0.045, 0.04, 0.045, mat("pPotato", { color: 0xe8cc8e }), 0, 0, 0);
  else if (kind === "onion") m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat("pOnion", { color: 0xd9c0dd }));
  else if (kind === "carrot") m = box(0.04, 0.02, 0.04, mat("pCarrot", { color: 0xe8772e }), 0, 0, 0);
  else if (kind === "miso") m = disc(0.07, 0.01, mat("pMisoSpot", { color: 0x8a5424 }), 0, 0, 0, 12);
  else m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), mat("pDashi", { color: 0xf0d8a0 }));
  m.position.set(Math.cos(a) * r, 0.03 + (i % 3) * 0.01, Math.sin(a) * r);
  m.rotation.y = a;
  return shadowed(m);
}

function buildPot(v) {
  const g = new THREE.Group();
  const profile = [[0.14, 0.0], [0.16, 0.02], [0.165, 0.12], [0.17, 0.145], [0.0, 0.145]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, 28), steel()));
  g.add(body);
  g.add(box(0.1, 0.02, 0.03, wood(), 0.23, 0.12, 0));
  g.add(box(0.1, 0.02, 0.03, wood(), -0.23, 0.12, 0));
  if (v.water) {
    const [col, op] = brothFor(v);
    const water = disc(0.155, 0.01, mat("pBroth" + col, { color: col, transparent: true, opacity: op, roughness: 0.2 }), 0, 0.128, 0, 28);
    g.add(water);
  }
  const contents = v.contents || [];
  contents.forEach((kind, i) => g.add(ingredientPiece(kind, i, contents.length)));
  if (v.lid) {
    const lid = new THREE.Group();
    lid.position.set(0, 0.155, 0);
    lid.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark())));
    lid.add(disc(0.02, 0.04, wood(), 0, 0.16, 0));
    g.add(lid);
  }
  return g;
}

function buildPan(v) {
  const g = new THREE.Group();
  g.add(shadowed(disc(0.19, 0.03, dark(), 0, 0.015, 0, 28)));
  g.add(box(0.28, 0.025, 0.04, wood(), 0.33, 0.02, 0));
  if (v.oil) g.add(disc(0.175, 0.005, mat("pOil", { color: 0xf3d37a, transparent: true, opacity: 0.6, roughness: 0.2 }), 0, 0.034, 0, 26));
  if (v.layer === "raw") {
    g.add(disc(0.16, 0.012, mat("pEggRaw", { color: 0xfbe9a5, transparent: true, opacity: 0.75, roughness: 0.4 }), 0, 0.04, 0, 24));
  } else if (v.layer === "set") {
    const col = v.burnt ? 0xb9803f : 0xf6c64d;
    g.add(disc(0.16, 0.018, mat(v.burnt ? "pEggBurnt" : "pEggSet", { color: col, roughness: 0.6 }), 0, 0.045, 0, 24));
    if (v.burnt) g.add(disc(0.05, 0.02, mat("pSpot", { color: 0x4d2a14 }), 0.04, 0.055, 0.03, 8));
  }
  for (let i = 0; i < (v.rolls || 0); i++) {
    const roll = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), mat("pRoll", { color: 0xf5c243, roughness: 0.55 })));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(-0.07 + i * 0.09, 0.07, -0.1);
    g.add(roll);
  }
  return g;
}

// Item in hand, on the board or on the counter. These are small primitives.
export function buildItem(item) {
  const g = new THREE.Group();
  const k = item.kind;
  if (k === "pot") return buildPot(Object.assign({ contents: [], water: !!item.water }, {}));
  if (k === "pan") return buildPan({ oil: false, layer: "none", rolls: 0 });
  if (k === "bowl") {
    const profile = [[0.0, 0.0], [0.06, 0.01], [0.1, 0.05], [0.125, 0.1], [0.13, 0.11]].map(([r, y]) => new THREE.Vector2(r, y));
    g.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, 24), white())));
    if (item.beaten) g.add(disc(0.118, 0.01, mat("pEggBeat", { color: 0xf9d86b, roughness: 0.3 }), 0, 0.085, 0, 24));
    else if (item.eggs) g.add(disc(0.118, 0.01, mat("pEggLiquid", { color: 0xfbe39a, roughness: 0.4 }), 0, 0.085, 0, 24));
    if (item.food === "miso") g.add(disc(0.118, 0.012, mat("pMisoSoup", { color: 0xd6a24e, roughness: 0.2 }), 0, 0.09, 0, 24));
    if (item.food === "niku") g.add(disc(0.118, 0.012, mat("pNikuSoup", { color: 0x8d4f26, roughness: 0.2 }), 0, 0.09, 0, 24));
    if (item.food) {
      for (let i = 0; i < 3; i++) {
        const piece = box(0.03, 0.02, 0.03, item.food === "miso" ? white() : mat("pPotatoSm", { color: 0xe8cc8e }), Math.cos(i * 2.1) * 0.05, 0.1, Math.sin(i * 2.1) * 0.05);
        g.add(piece);
      }
    }
    return g;
  }
  if (k === "plate") {
    g.add(shadowed(disc(0.14, 0.012, white(), 0, 0.006, 0, 28)));
    (item.contents || []).forEach((c, i) => g.add(plateItem(c, i)));
    return g;
  }
  if (k === "tofu") {
    if (item.cut) for (let i = 0; i < 4; i++) g.add(box(0.05, 0.05, 0.05, white(), (i % 2) * 0.06 - 0.03, 0.03, Math.floor(i / 2) * 0.06 - 0.03));
    else g.add(shadowed(box(0.13, 0.07, 0.1, white(), 0, 0.035, 0)));
    return g;
  }
  if (k === "negi") {
    if (item.cut) for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8), mat("pNegi", { color: 0x7dbb4a })).translateX(i * 0.05 - 0.05));
    else {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 8), mat("pNegi", { color: 0x7dbb4a }));
      n.position.y = 0.05;
      n.rotation.z = Math.PI / 2.4;
      g.add(shadowed(n));
    }
    return g;
  }
  if (k === "egg") {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), mat("pEgg", { color: 0xfdf6ea, roughness: 0.4 }));
    e.scale.set(0.85, 1.15, 0.85);
    e.position.y = 0.05;
    g.add(shadowed(e));
    return g;
  }
  if (k === "beef") {
    g.add(shadowed(box(0.16, 0.04, 0.1, mat("pBeefRaw", { color: 0xb5524a, roughness: 0.6 }), 0, 0.03, 0)));
    return g;
  }
  if (k === "potato") {
    const c = item.peeled ? 0xf1e0b0 : 0x9c7248;
    g.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), mat("pSpud" + c, { color: c, roughness: 0.8 }))).translateY(0.06));
    if (item.cut) g.add(box(0.12, 0.06, 0.12, mat("pSpudCut", { color: 0xf1e0b0 }), 0, 0.03, 0));
    return g;
  }
  if (k === "onion") {
    g.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), mat("pOnionW", { color: 0xd8b8dc, roughness: 0.7 }))).translateY(0.06));
    if (item.cut) g.add(box(0.13, 0.05, 0.1, mat("pOnionCut", { color: 0xf5eef7 }), 0, 0.03, 0));
    return g;
  }
  if (k === "carrot") {
    if (item.cut) g.add(box(0.12, 0.05, 0.08, mat("pCarrotCut", { color: 0xe8772e }), 0, 0.03, 0));
    else {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.22, 8), mat("pCarrot", { color: 0xe8772e }));
      c.rotation.z = Math.PI / 2;
      c.position.y = 0.04;
      g.add(shadowed(c));
    }
    return g;
  }
  if (k === "miso") {
    g.add(shadowed(disc(0.07, 0.07, mat("pMisoTub", { color: 0x7a4a24, roughness: 0.6 }), 0, 0.035, 0, 16)));
    g.add(disc(0.072, 0.02, mat("pTubLid", { color: 0xf6f0e2 }), 0, 0.075, 0, 16));
    return g;
  }
  if (k === "rice") {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), white());
    r.position.y = 0.07;
    g.add(shadowed(r));
    return g;
  }
  if (k === "onigiri") {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.13, 3), white());
    tri.position.y = 0.07;
    tri.rotation.y = 0.5;
    tri.scale.set(1.2, 1, 1);
    g.add(shadowed(tri));
    if (item.nori) g.add(box(0.1, 0.07, 0.11, mat("pNori", { color: 0x253b2c, roughness: 0.8 }), 0, 0.045, 0));
    return g;
  }
  if (k === "tsukemono") {
    g.add(shadowed(box(0.1, 0.04, 0.05, mat("pTsuke", { color: 0xc9d26a, roughness: 0.7 }), 0, 0.02, 0)));
    return g;
  }
  if (k === "tamago") {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, item.cut ? 0.05 : 0.2, 12), mat("pTamago", { color: 0xf5c243, roughness: 0.55 }));
    roll.rotation.z = item.cut ? 0 : Math.PI / 2;
    roll.position.y = 0.035;
    g.add(shadowed(roll));
    return g;
  }
  if (k === "lid") {
    g.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark())));
    return g;
  }
  if (k === "spoon") {
    g.add(box(0.02, 0.01, 0.2, steel(), 0, 0.01, 0));
    g.add(disc(0.02, 0.01, steel(), 0, 0.012, 0.1, 10));
    return g;
  }
  // Unknown kinds show as a small grey block so nothing goes missing.
  g.add(box(0.08, 0.06, 0.08, mat("pUnknown", { color: 0x999999 }), 0, 0.03, 0));
  return g;
}

function plateItem(kind, i) {
  const g = new THREE.Group();
  const a = i * 2.1;
  if (kind === "onigiri") {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), white());
    tri.position.set(Math.cos(a) * 0.06, 0.05, Math.sin(a) * 0.06);
    g.add(shadowed(tri));
  } else if (kind === "tsukemono") {
    g.add(box(0.05, 0.02, 0.03, mat("pTsuke", { color: 0xc9d26a }), Math.cos(a) * 0.1, 0.012, Math.sin(a) * 0.1));
  } else {
    g.add(box(0.05, 0.03, 0.05, mat("pTamago", { color: 0xf5c243 }), Math.cos(a) * 0.05, 0.02, Math.sin(a) * 0.05));
  }
  return g;
}

export function createProps(scene) {
  const burnerMounts = {};
  const root = new THREE.Group();
  root.name = "props";
  scene.add(root);
  const flameMat = new THREE.MeshLambertMaterial({ color: 0xff8a2a, emissive: 0xff7a1a, emissiveIntensity: 1.6, transparent: true, opacity: 0.85, roughness: 0.4 });
  for (const id of ["burnerL", "burnerR"]) {
    const mount = new THREE.Group();
    mount.position.copy(LAYOUT.burners[id]);
    mount.position.y = 0.97;
    root.add(mount);
    const flames = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), flameMat);
      const a = (i / 6) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12);
      f.visible = false;
      mount.add(f);
      flames.push(f);
    }
    burnerMounts[id] = { mount, flames, key: "", vesselGroup: null, lastLevel: -1 };
  }
  const counterGroup = new THREE.Group();
  counterGroup.position.copy(LAYOUT.counterSlot);
  root.add(counterGroup);
  const boardGroup = new THREE.Group();
  boardGroup.position.copy(LAYOUT.boardSlot);
  root.add(boardGroup);
  const tableGroup = new THREE.Group();
  tableGroup.position.copy(LAYOUT.table);
  root.add(tableGroup);
  let counterKey = "";
  let boardKey = "";
  let counterObj = null;
  let boardObj = null;
  let served = [];

  function swapGroup(parent, old, next) {
    if (old) {
      parent.remove(old);
      disposeTree(old);
    }
    if (next) parent.add(next);
    return next;
  }

  function itemKey(item) {
    return item ? JSON.stringify(item) : "";
  }

  function vesselKey(v) {
    return [v.kind, v.water, v.lid, v.oil, v.layer, v.rolls, v.burnt, (v.contents || []).join("|"), JSON.stringify(v.seasoning || {}), v.dissolved].join(";");
  }

  return {
    burnerMounts,
    // Sync with the world. Returns the mount points so the app can place effects.
    update(world, t) {
      for (const id of ["burnerL", "burnerR"]) {
        const bm = burnerMounts[id];
        const b = world.burners[id];
        const v = b.vessel;
        const key = v ? vesselKey(v) : "";
        if (key !== bm.key) {
          bm.key = key;
          bm.vesselGroup = swapGroup(bm.mount, bm.vesselGroup, v ? (v.kind === "pot" ? buildPot(v) : buildPan(v)) : null);
        }
        const lvl = b.level;
        const on = lvl > 0 && !!v;
        for (let i = 0; i < bm.flames.length; i++) {
          const f = bm.flames[i];
          f.visible = on;
          if (on) {
            const flick = 0.85 + 0.25 * Math.sin(t * 17 + i * 1.7) * Math.sin(t * 9.1 + i);
            const h = (lvl / 3) * 0.9 + 0.3;
            f.scale.set(1, h * flick, 1);
          }
        }
      }
      const ck = itemKey(world.counter);
      if (ck !== counterKey) {
        counterKey = ck;
        counterObj = swapGroup(counterGroup, counterObj, world.counter ? buildItem(world.counter) : null);
      }
      const bk = itemKey(world.board);
      if (bk !== boardKey) {
        boardKey = bk;
        boardObj = swapGroup(boardGroup, boardObj, world.board ? buildItem(world.board) : null);
      }
    },
    // Hand items: rebuilt when the item changes. Parent is the player's hand group.
    holdItem(parent, item, state) {
      const k = itemKey(item);
      if (state.key === k) return state;
      if (state.obj) {
        parent.remove(state.obj);
        disposeTree(state.obj);
      }
      const obj = item ? buildItem(item) : null;
      if (obj) {
        obj.position.set(0, -0.02, 0.06);
        obj.scale.setScalar(0.9);
        parent.add(obj);
      }
      return { key: k, obj };
    },
    // A finished dish on the dining table, for the family to see.
    serveDish(item) {
      const idx = served.length;
      const g = buildItem(item);
      g.position.set(-0.6 + (idx % 3) * 0.55, 0.0, idx < 3 ? -0.25 : 0.35);
      g.scale.setScalar(1.1);
      tableGroup.add(g);
      served.push(g);
      return g;
    },
    clearServed() {
      for (const g of served) {
        tableGroup.remove(g);
        disposeTree(g);
      }
      served = [];
    },
    vesselTop(id) {
      return new THREE.Vector3(LAYOUT.burners[id].x, 1.12, LAYOUT.burners[id].z);
    }
  };
}
