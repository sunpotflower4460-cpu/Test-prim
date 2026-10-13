// Builds the farmhouse kitchen, the dining room through the doorway, and the garden outside.
// Everything is primitives plus procedural textures. Stations are anchors the player walks to.
import * as THREE from "../vendor/three.module.js";
import * as T from "./textures.js";

// Station anchors: where the player stands to use each one, and what it is called.
export const STATION_ANCHORS = {
  fridge: { x: 3.9, z: -2.2, r: 0.9 },
  sink: { x: -1.7, z: -2.8, r: 0.6 },
  board: { x: -0.3, z: -2.8, r: 0.6 },
  counter: { x: 0.6, z: -2.8, r: 0.6 },
  burnerL: { x: 1.4, z: -2.8, r: 0.6 },
  burnerR: { x: 2.2, z: -2.8, r: 0.6 },
  kettle: { x: 3.0, z: -2.8, r: 0.6 },
  ricecooker: { x: -3.2, z: -2.8, r: 0.6 },
  drawer_spoon: { x: -3.9, z: -2.8, r: 0.6 },
  miso: { x: -1.3, z: -0.55, r: 0.5 },
  sugar: { x: -0.85, z: -0.55, r: 0.5 },
  mirin: { x: -0.4, z: -0.55, r: 0.5 },
  shoyu: { x: 0.05, z: -0.55, r: 0.5 },
  oil: { x: 0.5, z: -0.55, r: 0.5 },
  nori: { x: 0.95, z: -0.55, r: 0.5 },
  salt: { x: 1.4, z: -0.55, r: 0.5 },
  shelf_pot: { x: -3.6, z: -1.0, r: 0.5 },
  shelf_pan: { x: -3.6, z: -1.6, r: 0.5 },
  shelf_bowl: { x: -3.6, z: -0.2, r: 0.5 },
  shelf_plate: { x: -3.6, z: 0.4, r: 0.5 },
  rack_lid: { x: 4.1, z: -0.9, r: 0.6 },
  veg_bin: { x: 3.2, z: 0.9, r: 1.0 },
  menu: { x: -4.0, z: 1.1, r: 1.0 },
  door: { x: -3.5, z: 3.0, r: 1.0 },
  table: { x: 6.0, z: 0.4, r: 1.6 },
  plant0: { x: -6.2, z: -1.6, r: 1.0 },
  plant1: { x: -7.4, z: 0.6, r: 1.0 },
  plant2: { x: -8.6, z: -1.6, r: 1.0 },
  plant3: { x: -9.8, z: 0.6, r: 1.0 },
  plant4: { x: -6.6, z: 2.8, r: 1.0 },
  plant5: { x: -9.0, z: 2.8, r: 1.0 }
};

export const STATION_NAMES = {
  fridge: "冷蔵庫", sink: "シンク", board: "まないた", counter: "作業台",
  burnerL: "コンロ", burnerR: "コンロ", kettle: "やかん", miso: "お味噌", sugar: "砂糖",
  mirin: "みりん", shoyu: "醤油", oil: "サラダ油", nori: "海苔", salt: "お塩",
  ricecooker: "炊飯器", drawer_spoon: "スプーン", shelf_pot: "鍋の棚", shelf_pan: "フライパン",
  shelf_bowl: "ボウルの棚", shelf_plate: "お皿の棚", rack_lid: "ふた", veg_bin: "野菜かご",
  menu: "お品書き", door: "裏口", table: "食卓", plant0: "トマト", plant1: "きゅうり",
  plant2: "なす", plant3: "ねぎ", plant4: "かぼちゃ", plant5: "ひまわり"
};

// Walkable bounds and collision boxes (x0, x1, z0, z1).
export const BOUNDS = { x0: -11.2, x1: 10.2, z0: -6.8, z1: 4.1 };

export const LAYOUT = {
  burners: { burnerL: new THREE.Vector3(1.4, 0.93, -3.95), burnerR: new THREE.Vector3(2.2, 0.93, -3.95) },
  counterSlot: new THREE.Vector3(0.6, 0.93, -3.95),
  boardSlot: new THREE.Vector3(-0.3, 0.95, -3.95),
  sink: new THREE.Vector3(-1.7, 0.93, -3.95),
  table: new THREE.Vector3(7.6, 0.75, 0.4),
  seats: {
    uncle: { x: 7.6, z: -0.75, rot: 0 },
    misaki: { x: 7.6, z: 1.55, rot: Math.PI }
  },
  stove: new THREE.Vector3(1.8, 1.4, -3.2)
};

function rounded(w, h, d, r) {
  // Rounded rectangle prism for fridge and cabinets. Centred on the origin.
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  return g;
}

export function buildWorld(scene) {
  const stations = {};
  for (const id in STATION_ANCHORS) stations[id] = Object.assign({ name: STATION_NAMES[id] || id }, STATION_ANCHORS[id]);
  const colliders = [];
  const anim = { fanBlades: null, chime: null, clockMesh: null, clockCtx: null, windowLight: null, clouds: [], cat: null, cat0: 0, sunGlow: null };
  const geoCache = [];
  const mats = {};
  const mat = (key, opts) => {
    if (!mats[key]) mats[key] = new THREE.MeshLambertMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, opts));
    return mats[key];
  };
  const add = (parent, mesh, cast = true, recv = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = recv;
    parent.add(mesh);
    return mesh;
  };
  const boxAt = (parent, w, h, d, m, x, y, z, cast = true, recv = true) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geoCache.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    add(parent, mesh, cast, recv);
    return mesh;
  };
  const cyl = (parent, rt, rb, h, seg, m, x, y, z, cast = true) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    add(parent, mesh, cast, true);
    return mesh;
  };
  const sph = (parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1, cast = true) => {
    const g = new THREE.SphereGeometry(r, 16, 12);
    geoCache.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    add(parent, mesh, cast, true);
    return mesh;
  };
  const collide = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });

  const wallTex = T.plasterWall("#f3e6cf");
  const wallMat = mat("wall", { map: wallTex, roughness: 0.95 });
  const dinWallMat = mat("dinwall", { map: T.plasterWall("#efe0c6"), roughness: 0.95 });
  const woodFloorMat = mat("floor", { map: T.woodFloor(), roughness: 0.7 });
  const dinFloorMat = mat("dinfloor", { map: T.woodGrain(0.8), roughness: 0.75 });
  const tileMat = mat("tile", { map: T.tileSplashback(), roughness: 0.4 });
  const steel = mat("steel", { color: 0xbfc5c8, roughness: 0.35, metalness: 0.6 });
  const cabinet = mat("cabinet", { map: T.woodGrain(0.92), roughness: 0.7 });
  const counterTop = mat("counter", { color: 0xe9dfcc, roughness: 0.55 });
  const white = mat("white", { color: 0xfbf8f2, roughness: 0.5 });
  const cream = mat("cream", { color: 0xf5ecd9, roughness: 0.6 });
  const darkMetal = mat("dark", { color: 0x3b3f44, roughness: 0.5, metalness: 0.3 });
  const grassMat = mat("grass", { map: T.grass(), roughness: 1 });
  const soilMat = mat("soil", { map: T.soil(), roughness: 1 });
  const stoneMat = mat("stone", { color: 0xcfc6b2, roughness: 0.95 });
  const roofMat = mat("roof", { color: 0x9a7b67, roughness: 0.9 });

  const root = new THREE.Group();
  root.name = "kitchen";
  scene.add(root);

  // Floors
  const floorG = new THREE.PlaneGeometry(9, 9);
  geoCache.push(floorG);
  const kitchenFloor = new THREE.Mesh(floorG, woodFloorMat);
  kitchenFloor.rotation.x = -Math.PI / 2;
  kitchenFloor.receiveShadow = true;
  root.add(kitchenFloor);

  const dinFloorG = new THREE.PlaneGeometry(6.6, 9);
  geoCache.push(dinFloorG);
  const dinFloor = new THREE.Mesh(dinFloorG, dinFloorMat);
  dinFloor.rotation.x = -Math.PI / 2;
  dinFloor.position.set(7.8, 0.001, 0);
  dinFloor.receiveShadow = true;
  root.add(dinFloor);

  // Tatami corner in the dining room
  const tatamiMat = mat("tatami", { map: T.tatami(), roughness: 0.95 });
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const g = new THREE.PlaneGeometry(1.1, 0.95);
      geoCache.push(g);
      const m = new THREE.Mesh(g, tatamiMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(9.0 + i * 1.12, 0.004, 2.85 + j * 0.98);
      m.receiveShadow = true;
      root.add(m);
    }
  }

  // Walls. Back wall (window), left wall (door), right wall (doorway), front wall.
  const H = 3.2;
  boxAt(root, 9.4, 0.12, 0.12, wallMat, 0, H, 0, false, false); // ceiling trim line
  boxAt(root, 2.0, H, 0.16, wallMat, -3.6, H / 2, -4.5);
  boxAt(root, 1.9, 0.7, 0.16, wallMat, -1.7, 2.85, -4.5);
  boxAt(root, 1.9, 1.4, 0.16, wallMat, -1.7, 0.7, -4.5);
  boxAt(root, 3.5, H, 0.16, wallMat, 2.85, H / 2, -4.5);
  collide(-4.6, -2.6, -4.6, -4.4);
  collide(-2.6, -0.8, -4.6, -4.4);
  collide(-0.8, 4.6, -4.6, -4.4);
  // Window with garden view
  const winMat = new THREE.MeshBasicMaterial({ map: T.skyGradient(), color: 0xffffff });
  const winG = new THREE.PlaneGeometry(1.8, 1.2);
  geoCache.push(winG);
  const win = new THREE.Mesh(winG, winMat);
  win.position.set(-1.7, 1.9, -4.49);
  root.add(win);
  const frameMat = mat("frame", { color: 0xf7f1e4, roughness: 0.6 });
  boxAt(root, 1.98, 0.08, 0.06, frameMat, -1.7, 2.5, -4.46, false, false);
  boxAt(root, 1.98, 0.08, 0.06, frameMat, -1.7, 1.3, -4.46, false, false);
  boxAt(root, 0.08, 1.28, 0.06, frameMat, -2.7, 1.9, -4.46, false, false);
  boxAt(root, 0.08, 1.28, 0.06, frameMat, -0.7, 1.9, -4.46, false, false);
  boxAt(root, 0.05, 1.22, 0.05, frameMat, -1.7, 1.9, -4.46, false, false);
  // Wind chime hangs in the window
  const chime = new THREE.Group();
  chime.position.set(-1.7, 2.35, -4.2);
  root.add(chime);
  const bar = new THREE.Group();
  chime.add(bar);
  const cstr = mat("chimeStr", { color: 0x8a6f52 });
  for (let i = 0; i < 5; i++) {
    const x = -0.22 + i * 0.11;
    const len = 0.16 + (i % 3) * 0.05;
    const g = new THREE.CylinderGeometry(0.012, 0.012, len, 6);
    geoCache.push(g);
    const m = new THREE.Mesh(g, i % 2 ? mat("chimeA", { color: 0xcde6f5, metalness: 0.5, roughness: 0.3 }) : mat("chimeB", { color: 0xf3d28e, metalness: 0.5, roughness: 0.3 }));
    m.position.set(x, -len / 2, 0);
    bar.add(m);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), cstr);
    geoCache.push(s.geometry);
    s.position.set(x, 0.06, 0);
    bar.add(s);
  }
  anim.chime = bar;

  // Back wall cabinets and the counter run
  boxAt(root, 3.5, 0.68, 0.42, cream, 2.85, 2.55, -4.25);
  boxAt(root, 3.4, 0.04, 0.44, cabinet, 2.85, 2.2, -4.25, false, false);
  for (let i = 0; i < 4; i++) boxAt(root, 0.8, 0.5, 0.02, cabinet, 1.45 + i * 0.85, 2.55, -4.03, false, false);
  // Counter: carcass and worktop
  boxAt(root, 8.8, 0.9, 0.7, cabinet, 0, 0.45, -4.05);
  boxAt(root, 8.9, 0.04, 0.78, counterTop, 0, 0.92, -4.02);
  collide(-4.45, 4.45, -4.45, -3.55);
  // Splashback tiles
  boxAt(root, 8.8, 0.9, 0.04, tileMat, 0, 1.45, -4.42, false, true);
  // Stove top
  boxAt(root, 1.5, 0.02, 0.8, darkMetal, 1.8, 0.945, -3.5, false, false);
  // Sink
  const sinkBasin = boxAt(root, 0.82, 0.12, 0.58, steel, -1.7, 0.9, -3.92, false, false);
  sinkBasin.material = steel;
  boxAt(root, 0.84, 0.03, 0.62, steel, -1.7, 0.945, -3.92, false, false);
  const faucet = new THREE.Group();
  faucet.position.set(-1.7, 0.95, -4.25);
  root.add(faucet);
  cyl(faucet, 0.03, 0.03, 0.42, 10, steel, 0, 0.21, 0);
  cyl(faucet, 0.025, 0.025, 0.2, 10, steel, 0, 0.42, 0.1).rotation.x = Math.PI / 2;
  // Drip spot (read by the effects module)
  anim.drip = new THREE.Vector3(-1.7, 0.95, -3.85);
  // Burners, grates and a range hood
  for (const k of ["burnerL", "burnerR"]) {
    const p = LAYOUT.burners[k];
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), darkMetal);
    geoCache.push(ring.geometry);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.96, p.z);
    root.add(ring);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 16), darkMetal);
    geoCache.push(cap.geometry);
    cap.position.set(p.x, 0.97, p.z);
    root.add(cap);
  }
  boxAt(root, 1.4, 0.36, 0.7, steel, 1.8, 2.38, -3.95, true, false).visible = true;
  boxAt(root, 0.9, 0.02, 0.4, steel, 1.8, 2.2, -3.8, false, false);

  // Seasoning island in front of the counter. Each jar is a station at its own spot.
  boxAt(root, 3.5, 0.08, 0.6, counterTop, 0.15, 0.9, -1.25);
  boxAt(root, 3.3, 0.84, 0.56, cabinet, 0.15, 0.48, -1.25);
  collide(-1.6, 1.9, -1.55, -0.95);
  const jarSpots = [
    ["お味噌", -1.3, 0x7a4a24], ["砂糖", -0.85, 0xf5f0e0], ["みりん", -0.4, 0xe9c96a], ["醤油", 0.05, 0x6b3a22],
    ["油", 0.5, 0xf0d070], ["海苔", 0.95, 0x2f4a3b], ["お塩", 1.4, 0xfbfbf6]
  ];
  for (const [label, x, col] of jarSpots) {
    const bodyG = new THREE.CylinderGeometry(0.075, 0.085, 0.2, 14);
    geoCache.push(bodyG);
    const body = new THREE.Mesh(bodyG, mat("jar" + label, { color: col, roughness: 0.3 }));
    body.position.set(x, 1.04, -1.4);
    add(root, body);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.08), new THREE.MeshBasicMaterial({ map: T.jarLabel(label) }));
    geoCache.push(lab.geometry);
    lab.position.set(x, 1.04, -1.31);
    root.add(lab);
  }
  // Salt, rice cooker, toaster, radio, kettle, drawer
  const rice = new THREE.Group();
  rice.position.set(-3.2, 0.92, -3.9);
  root.add(rice);
  boxAt(rice, 0.46, 0.22, 0.36, cream, 0, 0.11, 0);
  boxAt(rice, 0.44, 0.04, 0.34, white, 0, 0.23, 0, false, false);
  boxAt(rice, 0.38, 0.03, 0.26, darkMetal, 0, 0.245, 0.02, false, false);
  const toaster = new THREE.Group();
  toaster.position.set(3.8, 0.92, -3.9);
  root.add(toaster);
  boxAt(toaster, 0.44, 0.22, 0.26, steel, 0, 0.11, 0);
  boxAt(toaster, 0.4, 0.02, 0.22, darkMetal, 0, 0.23, 0, false, false);
  const radio = new THREE.Group();
  radio.position.set(-2.1, 0.92, -3.85);
  root.add(radio);
  boxAt(radio, 0.34, 0.2, 0.16, mat("radio", { color: 0xd98c5f, roughness: 0.6 }), 0, 0.1, 0);
  cyl(radio, 0.05, 0.05, 0.02, 14, darkMetal, 0, 0.16, 0.085).rotation.x = Math.PI / 2;
  // Drawer under the counter at the left (spoon station)
  boxAt(root, 0.6, 0.18, 0.02, cabinet, -3.9, 0.55, -3.52, false, false);
  // Hanging towel on the counter end
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.02), new THREE.MeshLambertMaterial({ map: T.towelStripes(), roughness: 0.9 }));
  geoCache.push(towel.geometry);
  towel.position.set(-4.3, 0.7, -3.5);
  root.add(towel);

  // Fridge: rounded corners, photo magnets
  const fridge = new THREE.Group();
  fridge.position.set(4.0, 0, -3.5);
  root.add(fridge);
  const fridgeBody = new THREE.Mesh(rounded(0.92, 1.95, 0.9, 0.12), mat("fridge", { color: 0xf8f6ef, roughness: 0.35, metalness: 0.05 }));
  geoCache.push(fridgeBody.geometry);
  fridgeBody.position.set(0, 0.975, 0);
  fridgeBody.castShadow = true;
  fridgeBody.receiveShadow = true;
  fridge.add(fridgeBody);
  boxAt(fridge, 0.86, 0.02, 0.02, steel, 0, 1.33, 0.46, false, false);
  boxAt(fridge, 0.86, 0.02, 0.02, steel, 0, 0.5, 0.46, false, false);
  const magnetCols = [0xe66c5c, 0x5aa8d8, 0xf3c24c];
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({ map: T.jarLabel(["写真", "地図", "絵"][i], "#fffdf6") }));
    geoCache.push(pg.geometry);
    pg.position.set(-0.2 + i * 0.22, 1.5 - (i % 2) * 0.22, 0.465);
    fridge.add(pg);
  }
  collide(3.5, 4.5, -4.5, -3.0);

  // Ceiling fan
  const fan = new THREE.Group();
  fan.position.set(0, H - 0.22, 0.2);
  root.add(fan);
  cyl(fan, 0.06, 0.06, 0.2, 10, white, 0, 0.05, 0);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    blade.rotation.y = (Math.PI / 2) * i;
    fan.add(blade);
    const b = boxAt(blade, 0.9, 0.02, 0.18, cabinet, 0.5, -0.02, 0, true, false);
    b.rotation.y = 0.2;
  }
  anim.fanBlades = fan;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), mat("ceil", { color: 0xfff7ea, roughness: 1 }));
  geoCache.push(ceiling.geometry);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(3.1, H, 0);
  ceiling.receiveShadow = false;
  root.add(ceiling);

  // Wall clock, updated in real time by the app
  const clockCanvas = T.clockFace(new Date());
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ map: clockTex }));
  geoCache.push(clock.geometry);
  clock.position.set(0.6, 2.55, -4.41);
  root.add(clock);
  anim.clockMesh = clock;
  anim.clockTex = clockTex;
  anim.clockCanvas = clockCanvas;

  // Calendar on the right wall
  const calTex = new THREE.CanvasTexture(T.calendarFace());
  calTex.colorSpace = THREE.SRGBColorSpace;
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshBasicMaterial({ map: calTex }));
  geoCache.push(cal.geometry);
  cal.rotation.y = -Math.PI / 2;
  cal.position.set(4.44, 1.9, -1.6);
  root.add(cal);

  // Chalkboard menu on the left wall
  const menuTex = T.chalkMenu(["ひとつ お味噌汁", "ひとつ 卵焼き", "ひとつ 肉じゃが", "ひとつ おにぎり"]);
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: menuTex }));
  geoCache.push(menu.geometry);
  menu.rotation.y = Math.PI / 2;
  menu.position.set(-4.43, 1.5, 1.1);
  root.add(menu);
  boxAt(root, 0.08, 1.0, 0.08, cabinet, -4.36, 0.5, 1.6, false, false);

  // Left wall with the back door (door opening at z 2.2..3.8), and the pantry shelf
  boxAt(root, 0.16, H, 6.9, wallMat, -4.54, H / 2, -1.15);
  collide(-4.7, -4.4, -4.6, 2.2);
  boxAt(root, 0.16, 0.6, 1.6, wallMat, -4.54, 2.9, 3.0);
  boxAt(root, 0.16, H, 0.85, wallMat, -4.54, H / 2, 4.1);
  // Shelf unit for pots, pans, bowls, plates
  boxAt(root, 0.5, 1.95, 2.4, cabinet, -4.1, 0.975, -1.4);
  collide(-4.35, -3.85, -2.6, -0.2);
  for (const [yy, things] of [[0.6, "pot"], [1.12, "bowl"], [1.5, "plate"], [1.85, "pan"]]) {
    boxAt(root, 0.48, 0.03, 2.3, cabinet, -4.1, yy, -1.4, false, false);
    if (things === "pot") {
      const pot = cyl(root, 0.16, 0.14, 0.2, 18, steel, -4.1, yy + 0.12, -1.9);
      pot.name = "shelfpot";
    }
    if (things === "bowl") {
      for (let i = 0; i < 3; i++) cyl(root, 0.11, 0.06, 0.07, 16, white, -4.1, yy + 0.04, -0.9 + i * 0.26);
    }
    if (things === "plate") {
      for (let i = 0; i < 3; i++) cyl(root, 0.14, 0.14, 0.02, 18, white, -4.1, yy + 0.02 + i * 0.02, -0.5 + i * 0.001);
    }
    if (things === "pan") {
      cyl(root, 0.18, 0.18, 0.04, 20, darkMetal, -4.1, yy + 0.04, -1.5).rotation.z = 0;
    }
  }

  // Veg basket and the small bench near the window
  const basket = new THREE.Group();
  basket.position.set(3.2, 0, 0.9);
  root.add(basket);
  cyl(basket, 0.36, 0.32, 0.3, 20, mat("wicker", { color: 0xc89b5c, roughness: 0.9 }), 0, 0.15, 0);
  const vegCols = [0xd9643f, 0x6fa84f, 0xb868a8, 0xe3a040, 0x84b85c];
  for (let i = 0; i < 6; i++) {
    const v = sph(basket, 0.08, mat("veg" + i, { color: vegCols[i % vegCols.length], roughness: 0.6 }), -0.15 + (i % 3) * 0.15, 0.36 + Math.floor(i / 3) * 0.06, 0.05 * (i % 2 ? 1 : -1), 1, 0.8, 1);
    v.name = "veg";
  }
  collide(2.8, 3.6, 0.5, 1.3);

  // Front wall: full height. Camera collision keeps the view inside.
  boxAt(root, 9.2, H, 0.16, wallMat, 0, H / 2, 4.55);
  collide(-4.6, 4.6, 4.46, 4.7);

  // Dining room
  const dinBack = boxAt(root, 6.6, H, 0.16, dinWallMat, 7.8, H / 2, -4.5);
  dinBack.name = "dinBack";
  boxAt(root, 0.16, H, 9.2, dinWallMat, 11.0, H / 2, 0);
  boxAt(root, 6.4, H, 0.16, dinWallMat, 7.8, H / 2, 4.55);
  boxAt(root, 0.16, H, 3.8, wallMat, 4.5, H / 2, -2.6);
  boxAt(root, 0.16, H, 2.4, wallMat, 4.5, H / 2, 3.2);
  boxAt(root, 0.16, 0.9, 2.0, wallMat, 4.5, 2.75, 0.6);
  collide(4.4, 4.6, -4.6, -0.4);
  collide(4.4, 4.6, 1.6, 4.6);
  collide(10.9, 11.1, -4.6, 4.6);
  collide(4.4, 11.2, -4.6, -4.4);
  // Sideboard and vase along the back wall
  boxAt(root, 2.2, 0.8, 0.5, cabinet, 9.6, 0.4, -4.0);
  boxAt(root, 2.25, 0.04, 0.55, counterTop, 9.6, 0.82, -4.0, false, true);
  collide(8.5, 10.7, -4.3, -3.6);
  // The vase with sunflowers
  const vase = cyl(root, 0.1, 0.07, 0.3, 16, mat("vase", { color: 0x6aa6c9, roughness: 0.3 }), 10.2, 1.0, -4.0);
  vase.name = "vase";
  for (let i = 0; i < 3; i++) {
    const sf = new THREE.Group();
    sf.position.set(10.2 + (i - 1) * 0.08, 1.2 + i * 0.05, -4.0 + (i - 1) * 0.05);
    sf.rotation.z = (i - 1) * 0.2;
    root.add(sf);
    cyl(sf, 0.008, 0.008, 0.4, 4, mat("stem", { color: 0x5b8d3a }), 0, -0.2, 0);
    const petals = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), mat("sunpetal", { color: 0xf5c02e, side: THREE.DoubleSide, roughness: 0.6 }));
    geoCache.push(petals.geometry);
    petals.position.set(0, 0.02, 0.01);
    sf.add(petals);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), mat("sunCore", { color: 0x6b4226 }));
    geoCache.push(core.geometry);
    core.position.set(0, 0.02, 0.02);
    sf.add(core);
  }

  // Dining table with cloth and cushion chairs
  const table = new THREE.Group();
  table.position.set(7.6, 0, 0.4);
  root.add(table);
  boxAt(table, 2.4, 0.08, 1.4, mat("tableTop", { map: T.woodGrain(1.05), roughness: 0.55 }), 0, 0.71, 0);
  for (const [x, z] of [[-1.05, -0.6], [1.05, -0.6], [-1.05, 0.6], [1.05, 0.6]]) cyl(table, 0.04, 0.05, 0.7, 10, cabinet, x, 0.35, z);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.1), mat("cloth", { color: 0xf3c7b7, roughness: 0.95 }));
  geoCache.push(cloth.geometry);
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.set(0, 0.755, 0);
  table.add(cloth);
  for (let i = 0; i < 3; i++) {
    const dish = cyl(table, 0.12, 0.09, 0.02, 18, white, -0.5 + i * 0.5, 0.78, 0.0);
    dish.name = "dish";
  }
  collide(6.3, 8.9, -0.3, 1.1);
  for (const seat of [LAYOUT.seats.uncle, LAYOUT.seats.misaki]) {
    const chair = new THREE.Group();
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = seat.rot;
    root.add(chair);
    boxAt(chair, 0.5, 0.08, 0.5, mat("cushion", { color: 0xe38d6b, roughness: 0.95 }), 0, 0.45, 0);
    boxAt(chair, 0.46, 0.5, 0.06, cabinet, 0, 0.75, -0.24);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(chair, 0.025, 0.025, 0.42, 8, cabinet, x, 0.21, z);
  }

  // Tatami corner cat
  const catGroup = new THREE.Group();
  catGroup.position.set(9.7, 0.02, 3.3);
  root.add(catGroup);
  const catMat = mat("cat", { color: 0xf0a04b, roughness: 0.9 });
  sph(catGroup, 0.22, catMat, 0, 0.18, 0, 1.4, 0.7, 0.9);
  sph(catGroup, 0.12, catMat, 0.22, 0.24, 0.02);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), catMat);
  geoCache.push(earL.geometry);
  earL.position.set(0.2, 0.34, -0.04);
  catGroup.add(earL);
  const earR = earL.clone();
  earR.position.set(0.25, 0.34, 0.06);
  catGroup.add(earR);
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 20), mat("catPillow", { color: 0x8fb8d6, roughness: 0.95 }));
  geoCache.push(cushion.geometry);
  cushion.position.set(0, 0.03, 0);
  catGroup.add(cushion);
  anim.cat = catGroup;

  // Back door: the garden beyond. Porch and stepping stones.
  const porch = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 2.4), stoneMat);
  geoCache.push(porch.geometry);
  porch.position.set(-5.2, 0.05, 3.0);
  porch.receiveShadow = true;
  root.add(porch);
  const basketG = new THREE.Group();
  basketG.position.set(-5.6, 0.1, 3.9);
  root.add(basketG);
  cyl(basketG, 0.22, 0.2, 0.16, 16, mat("wicker2", { color: 0xc89b5c, roughness: 0.9 }), 0, 0.08, 0);
  anim.harvestBasket = basketG;

  // Garden world: ground, sky, mountains, clouds.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), grassMat);
  geoCache.push(ground.geometry);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), new THREE.MeshBasicMaterial({ map: T.skyGradient(), side: THREE.BackSide, fog: false }));
  geoCache.push(dome.geometry);
  dome.name = "sky";
  scene.add(dome);

  const mountainMat = new THREE.MeshLambertMaterial({ color: 0x8ba6b8, roughness: 1, flatShading: true });
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6b9a5b, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const r = 110 + (i % 3) * 12;
    const hgt = 22 + ((i * 37) % 17);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(16 + (i % 4) * 4, hgt, 6), i % 2 ? mountainMat : hillMat);
    geoCache.push(cone.geometry);
    cone.position.set(Math.cos(a) * r, hgt / 2 - 1, Math.sin(a) * r);
    scene.add(cone);
  }

  const cloudTex = T.cloudPuff();
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.92 }));
    const a = (i / 9) * Math.PI * 2 + 0.6;
    s.position.set(Math.cos(a) * (60 + (i % 3) * 20), 26 + (i % 4) * 5, Math.sin(a) * (60 + (i % 2) * 22) - 10);
    s.scale.set(14 + (i % 3) * 4, 7 + (i % 2) * 2, 1);
    s.userData.speed = 0.25 + (i % 4) * 0.08;
    scene.add(s);
    anim.clouds.push(s);
  }

  // Garden beds: rows of tomatoes, cucumbers, eggplant, negi and pumpkins.
  const gardenRoot = new THREE.Group();
  gardenRoot.name = "garden";
  scene.add(gardenRoot);
  const plants = [];
  const stakeMat = mat("stake", { color: 0xa67c52, roughness: 0.9 });
  const leafMat = mat("leaf", { color: 0x4f9d3a, roughness: 0.8 });
  const leafMat2 = mat("leaf2", { color: 0x3f8a33, roughness: 0.8 });
  const tomatoMat = mat("tomato", { color: 0xe0452e, roughness: 0.5 });
  const cucMat = mat("cuc", { color: 0x2f7d3b, roughness: 0.6 });
  const eggMat = mat("egg", { color: 0x5b3c86, roughness: 0.5 });
  const negiMat = mat("negi", { color: 0xf4f7ef, roughness: 0.6 });
  const pumpkinMat = mat("pumpkin", { color: 0xe98a2b, roughness: 0.7 });
  const sunPetal = mat("sunpetal2", { color: 0xf5c02e, side: THREE.DoubleSide, roughness: 0.6 });
  const rowsX = [-6.2, -7.6, -9.0, -10.4];
  // Soil beds (collision on the bed edges)
  for (const x of rowsX) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 8.0), soilMat);
    geoCache.push(bed.geometry);
    bed.position.set(x, 0.06, 0.0);
    bed.receiveShadow = true;
    gardenRoot.add(bed);
  }
  const plantAt = (id, x, z) => {
    const g = new THREE.Group();
    g.position.set(x, 0.12, z);
    gardenRoot.add(g);
    plants.push({ id, group: g, fruit: [], ready: true, regrow: 0 });
    return g;
  };
  // Tomato row on stakes
  const tomatoRow = [];
  for (let i = 0; i < 4; i++) {
    const z = -2.2 + i * 1.5;
    const g = plantAt("plant0", rowsX[0], z);
    tomatoRow.push(g);
    cyl(g, 0.02, 0.02, 1.1, 6, stakeMat, 0, 0.55, 0);
    sph(g, 0.5, leafMat, 0, 0.7, 0, 0.9, 0.8, 0.9);
    for (let f = 0; f < 4; f++) {
      const t = sph(g, 0.07, tomatoMat, Math.cos(f * 1.6) * 0.3, 0.45 + (f % 2) * 0.2, Math.sin(f * 1.6) * 0.3, 1, 1, 1, false);
      t.userData.fruit = true;
      plants[plants.length - 1].fruit.push(t);
    }
  }
  // Cucumber trellis
  for (let i = 0; i < 4; i++) {
    const z = -2.2 + i * 1.5;
    const g = plantAt("plant1", rowsX[1], z);
    cyl(g, 0.02, 0.02, 1.4, 6, stakeMat, -0.3, 0.7, 0);
    cyl(g, 0.02, 0.02, 1.4, 6, stakeMat, 0.3, 0.7, 0);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1), new THREE.MeshLambertMaterial({ color: 0xbfd9a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
    geoCache.push(net.geometry);
    net.position.set(0, 0.7, 0);
    g.add(net);
    for (let f = 0; f < 3; f++) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), cucMat);
      geoCache.push(c.geometry);
      c.position.set((f - 1) * 0.18, 0.45 + f * 0.12, 0.08);
      c.rotation.z = 0.2;
      c.userData.fruit = true;
      g.add(c);
      plants[plants.length - 1].fruit.push(c);
    }
  }
  // Eggplant
  for (let i = 0; i < 4; i++) {
    const z = -2.2 + i * 1.5;
    const g = plantAt("plant2", rowsX[2], z);
    sph(g, 0.34, leafMat2, 0, 0.36, 0, 1.1, 0.7, 1.1);
    for (let f = 0; f < 3; f++) {
      const e = sph(g, 0.09, eggMat, Math.cos(f * 2.1) * 0.22, 0.25 + f * 0.04, Math.sin(f * 2.1) * 0.22, 0.6, 1.8, 0.6, false);
      e.userData.fruit = true;
      plants[plants.length - 1].fruit.push(e);
    }
  }
  // Negi, a dense row of thin green tubes
  for (let i = 0; i < 4; i++) {
    const z = -2.2 + i * 1.5;
    const g = plantAt("plant3", rowsX[3], z);
    for (let f = 0; f < 7; f++) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.38, 6), f % 2 ? leafMat : negiMat);
      geoCache.push(n.geometry);
      n.position.set(-0.22 + (f % 4) * 0.14, 0.2, -0.15 + Math.floor(f / 4) * 0.3);
      n.userData.fruit = true;
      g.add(n);
      plants[plants.length - 1].fruit.push(n);
    }
  }
  // Pumpkins and sunflowers on the far fence
  for (let i = 0; i < 2; i++) {
    const g = plantAt("plant4", -6.6, 2.6 - i * 0.8);
    sph(g, 0.2, pumpkinMat, 0, 0.12, 0, 1.2, 0.8, 1.2, true);
    for (let f = 0; f < 1; f++) {
      const p = sph(g, 0.2, pumpkinMat, 0.45, 0.1, 0.3, 1.2, 0.8, 1.2, false);
      p.userData.fruit = true;
      plants[plants.length - 1].fruit.push(p);
    }
  }
  for (let i = 0; i < 2; i++) {
    const g = plantAt("plant5", -9.0, 2.5 - i * 0.9);
    cyl(g, 0.02, 0.02, 1.8, 6, stakeMat, 0, 0.9, 0);
    const pet = new THREE.Mesh(new THREE.CircleGeometry(0.18, 14), sunPetal);
    geoCache.push(pet.geometry);
    pet.position.set(0, 1.8, 0.02);
    g.add(pet);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), mat("sfcore", { color: 0x5b3a1d }));
    geoCache.push(core.geometry);
    core.position.set(0, 1.8, 0.03);
    g.add(core);
  }
  // Fences along the garden edges
  for (let x = -11; x <= -5; x += 1.2) cyl(gardenRoot, 0.05, 0.05, 1.0, 6, stakeMat, x, 0.5, -6.5);
  boxAt(gardenRoot, 6.2, 0.05, 0.06, stakeMat, -8.1, 0.82, -6.5, false, false);
  boxAt(gardenRoot, 6.2, 0.05, 0.06, stakeMat, -8.1, 0.45, -6.5, false, false);
  // Colliders for the beds
  for (const x of rowsX) collide(x - 0.45, x + 0.45, -4.1, 4.1);

  // Lights: warm afternoon sun through the window, soft sky-and-earth fill, warm stove glow.
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xf1c08b, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.1);
  sun.position.set(-5.5, 8.5, -9);
  sun.target.position.set(0.5, 0, 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  anim.sun = sun;
  const stoveLight = new THREE.PointLight(0xffb86b, 1.1, 4.5, 1.8);
  stoveLight.position.copy(LAYOUT.stove);
  scene.add(stoveLight);
  anim.stoveLight = stoveLight;
  const dinLight = new THREE.PointLight(0xffe4b5, 0.9, 7, 1.6);
  dinLight.position.set(7.6, 2.6, 0.4);
  scene.add(dinLight);

  // Interaction ring material, shared
  const ringMat = new THREE.MeshBasicMaterial({ map: T.glowRing(), transparent: true, depthWrite: false, opacity: 0.9 });
  const ringGeo = new THREE.PlaneGeometry(1.1, 1.1);
  geoCache.push(ringGeo);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  scene.add(ring);
  anim.ring = ring;

  // Where station visuals are: used by the app to place the highlight and project pivots.
  const pivots = {
    fridge: new THREE.Vector3(3.6, 1.0, -3.0), sink: new THREE.Vector3(-1.7, 1.0, -3.4), board: new THREE.Vector3(-0.3, 1.0, -3.5),
    counter: LAYOUT.counterSlot.clone(), burnerL: LAYOUT.burners.burnerL.clone(), burnerR: LAYOUT.burners.burnerR.clone(), table: new THREE.Vector3(7.6, 0.9, 0.4),
    ricecooker: new THREE.Vector3(-3.2, 1.0, -3.9), salt: new THREE.Vector3(-2.6, 1.0, -3.9), kettle: new THREE.Vector3(3.0, 1.0, -3.6)
  };

  anim.elapsed = 0;
  return {
    root,
    stations,
    colliders,
    anim,
    plants,
    pivots,
    bounds: BOUNDS,
    dispose() {
      for (const g of geoCache) g.dispose();
      for (const k in mats) mats[k].dispose();
      scene.remove(root);
      scene.remove(ground);
      scene.remove(dome);
      scene.remove(gardenRoot);
      scene.remove(ring);
      scene.remove(hemi);
      scene.remove(sun);
      scene.remove(sun.target);
      scene.remove(stoveLight);
      scene.remove(dinLight);
    }
  };
}

export function updateWorld(w, t, dt) {
  const anim = w.anim;
  if (anim.fanBlades) anim.fanBlades.rotation.y += dt * 2.2;
  if (anim.chime) {
    anim.chime.rotation.z = Math.sin(t * 1.3) * 0.08 + Math.sin(t * 2.9) * 0.02;
  }
  for (const c of anim.clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 110) c.position.x = -110;
  }
  if (anim.cat) {
    // slow breathing for the sleeping cat
    anim.cat.children[0].scale.y = 0.7 + Math.sin(t * 1.4) * 0.02;
  }
}
