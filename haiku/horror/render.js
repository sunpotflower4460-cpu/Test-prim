// Scene, lights and per-frame presentation. Reads the sim state; never writes to it.
import * as THREE from "../vendor/three.module.js";
import { createTextures } from "./textures.js";
import { buildHouse, buildWell, buildTrees, applyLeaves } from "./house.js";
import { buildProp, buildItem } from "./props.js";
import { createEntity, poseEntity } from "./entity.js";
import { createViewModel } from "./viewmodel.js";

const Sim = window.NakiIdoSim;
const deg = Math.PI / 180;
// The default exposure. The brightness slider multiplies this.
const EXPOSURE_BASE = 1.3;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMaterials(T) {
  // A textured surface. Where the texture carries a roughness map, the map alone sets the
  // roughness (worn and damp spots catch the light differently), so no flat value is applied.
  const tex = (t, extra = {}) => {
    const base = {
      map: t.map,
      normalMap: t.normal || null,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.85,
      metalness: 0
    };
    if (t.rough) {
      base.roughnessMap = t.rough;
      base.roughness = 1;
      delete extra.roughness;
    }
    return new THREE.MeshStandardMaterial(Object.assign(base, extra));
  };
  const flat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0 }, extra));
  const M = {};
  M.floor = {
    wood: tex(T.wood, { roughness: 0.7 }),
    tatami: tex(T.tatami, { roughness: 0.92 }),
    earth: tex(T.earth, { roughness: 0.96 }),
    tile: tex(T.tile, { roughness: 0.45 }),
    stone: tex(T.stone, { roughness: 0.82 }),
    mud: tex(T.mud, { roughness: 0.9, roughnessMap: T.mud.rough })
  };
  M.ground = tex(T.mud, { roughness: 0.92, roughnessMap: T.mud.rough });
  M.ceiling = tex(T.ceiling, { roughness: 0.85 });
  M.beam = tex(T.ceiling, { roughness: 0.8, color: 0x9a8270 });
  M.plaster = tex(T.plaster, { roughness: 0.92 });
  M.boarding = tex(T.boarding, { roughness: 0.9 });
  M.clay = tex(T.clay, { roughness: 0.95 });
  M.stone = tex(T.stone, { roughness: 0.82 });
  M.trim = flat(0x2a1c13, { roughness: 0.6 });
  M.roof = flat(0x15121a, { roughness: 0.9 });
  // Paper lit from behind: the emissive map carries the glow and its falloff.
  M.shojiMat = new THREE.MeshStandardMaterial({
    map: T.shoji.map,
    normalMap: T.shoji.normal,
    emissiveMap: T.shoji.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.72,
    roughness: 0.95
  });
  // Wet well stone: a clear coat over the stone, with wet patches that are glossier still.
  M.wellStone = new THREE.MeshPhysicalMaterial({
    map: T.stone.map,
    normalMap: T.stone.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: T.wetStone,
    roughness: 1,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22
  });
  M.water = new THREE.MeshBasicMaterial({ map: T.water, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  M.fusumaMat = tex(T.fusuma, { roughness: 0.92 });

  M.lacquer = flat(0x2a1410, { roughness: 0.35 });
  M.lacquerBlack = flat(0x0d0b0c, { roughness: 0.3 });
  M.lacquerWood = flat(0x3a2418, { roughness: 0.5 });
  M.woodDark = flat(0x2b1d14, { roughness: 0.7 });
  M.woodPlain = tex(T.wood, { roughness: 0.75, color: 0xb08a66 });
  M.gunWood = tex(T.wood, { roughness: 0.55, color: 0xc08a58 });
  M.glass = flat(0x1a2330, { roughness: 0.05, transparent: true, opacity: 0.32 });
  M.paper = new THREE.MeshStandardMaterial({ map: T.paper.map || T.paper, roughness: 0.9 });
  M.ink = flat(0x111111, { roughness: 0.8 });
  M.metal = flat(0x7d6a48, { metalness: 0.6, roughness: 0.4 });
  M.bronze = flat(0x5a4a2a, { metalness: 0.6, roughness: 0.45 });
  M.gold = flat(0xb8913e, { metalness: 0.8, roughness: 0.35 });
  M.glaze = flat(0x3b2a22, { roughness: 0.25 });
  M.ash = flat(0x6e6a60, { roughness: 1 });
  M.ember = new THREE.MeshStandardMaterial({ color: 0x3a1204, emissive: 0xff5a1a, emissiveIntensity: 1.6, roughness: 0.6 });
  M.cushion = flat(0x2e2430, { roughness: 0.95 });
  M.cushionTrim = flat(0x4b3a3f, { roughness: 0.95 });
  M.altarInside = flat(0x3a1210, { roughness: 0.6 });
  M.tablet = flat(0xe2d4ab, { roughness: 0.6, emissive: 0x2a2010, emissiveIntensity: 0.6 });
  M.candle = flat(0xe8e0c8, { roughness: 0.6 });
  M.incense = flat(0x6b1a14, { roughness: 0.8 });
  M.blackIron = flat(0x101012, { metalness: 0.3, roughness: 0.6 });
  M.ceramic = flat(0xc9c3b4, { roughness: 0.25 });
  M.inkstone = flat(0x111116, { roughness: 0.3 });
  M.lanternPaper = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, emissive: 0x2b2010, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide });
  M.rope = flat(0x6e5632, { roughness: 1 });
  M.glassBell = flat(0x6c8ca8, { roughness: 0.1, transparent: true, opacity: 0.6 });
  M.strip = new THREE.MeshStandardMaterial({ color: 0xd9c9a4, roughness: 0.8, side: THREE.DoubleSide });
  M.bark = flat(0x1d1510, { roughness: 1 });
  M.batteryBody = flat(0x202428, { metalness: 0.3, roughness: 0.5 });
  M.shellRed = flat(0x6e1812, { roughness: 0.4 });
  M.brass = flat(0xb08a3e, { metalness: 0.8, roughness: 0.3 });
  M.fudaMat = new THREE.MeshStandardMaterial({ map: T.fuda, roughness: 0.6, side: THREE.DoubleSide });
  M.diaryCover = flat(0x2a2c3a, { roughness: 0.9 });
  M.paperPage = new THREE.MeshStandardMaterial({ map: T.paper, roughness: 0.9 });
  M.gunMetal = flat(0x17181b, { metalness: 0.5, roughness: 0.35 });
  M.skin = flat(0xb9b0a2, { roughness: 0.55 });
  M.hair = flat(0x08070a, { roughness: 0.6, side: THREE.DoubleSide });
  M.cloth = new THREE.MeshStandardMaterial({ map: T.cloth.map, normalMap: T.cloth.normal, color: 0xb9b2a2, roughness: 0.7, side: THREE.DoubleSide });
  M.wellInside = flat(0x020203, { roughness: 1, side: THREE.BackSide });
  M.wellWater = flat(0x03060a, { roughness: 0.05, metalness: 0.1 });
  M.mistTex = T.mist;
  M.flashTex = T.flash;
  M.smokeTex = T.smoke;
  M.scrollTex = T.scroll;
  M.figureTex = T.figure;
  M.beamTex = T.beam;
  M.moteTex = T.mote;
  return M;
}

export function createRender(canvas, world) {
  const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06070d);
  scene.fog = new THREE.FogExp2(0x141a2e, 0.032);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 70);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const T = createTextures();
  const M = buildMaterials(T);

  // Lights: cool moon from the north-west, faint sky fill, warm torch on the camera.
  // The rooms get a faint cool fill, so dark reads as shadow and walls and furniture keep their shapes.
  const hemi = new THREE.HemisphereLight(0x6474a8, 0x2e2418, 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x4a5680, 0.36);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0x9fb4ff, 1.5);
  moon.position.set(-8, 18, -10);
  moon.target.position.set(6, 0, 5);
  moon.castShadow = true;
  const moonSize = touch ? 512 : 1024;
  moon.shadow.mapSize.set(moonSize, moonSize);
  moon.shadow.camera.left = -16;
  moon.shadow.camera.right = 16;
  moon.shadow.camera.top = 16;
  moon.shadow.camera.bottom = -16;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  const torch = new THREE.SpotLight(0xffe2b0, 0, 24, 0.45, 0.6, 2);
  torch.castShadow = true;
  torch.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024);
  torch.shadow.bias = -0.0006;
  torch.shadow.normalBias = 0.02;
  torch.shadow.camera.near = 0.1;
  torch.shadow.camera.far = 24;
  const torchTarget = new THREE.Object3D();
  torchTarget.position.set(0, 0, -8);
  camera.add(torch, torchTarget);
  torch.target = torchTarget;
  torch.position.set(0.12, -0.12, -0.05);

  const muzzle = new THREE.PointLight(0xffb070, 0, 5, 2);
  camera.add(muzzle);
  muzzle.position.set(0.2, -0.1, -0.7);

  // Warm sources that give the dark rooms their shapes: the lantern, the hibachi ember,
  // the candles on the altar, the incense burner. No shadows, so they stay cheap.
  const fillLights = [];
  const warm = (color, intensity, distance, x, y, z) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    scene.add(l);
    fillLights.push(l);
    return l;
  };
  const props0 = world.props;
  const byType = type => props0.find(p => p.type === type);
  const andon = byType("andon");
  const hibachi = byType("hibachi");
  const butsudan = byType("butsudan");
  const tsukue = byType("tsukue");
  const lampLight = andon ? warm(0xffb46a, 0, 5.5, andon.x, 1.0, andon.y) : null;
  const hibachiLight = hibachi ? warm(0xff7a33, 0, 3.2, hibachi.x, 0.7, hibachi.y) : null;
  // Candles stand inside the shrine, a little in front of the frame.
  const candleLight = butsudan ? warm(0xffc070, 0, 3.0, butsudan.x - 0.2, 1.1, butsudan.y) : null;
  const burnerLight = tsukue ? warm(0xffa860, 0, 2.2, tsukue.x, 0.95, tsukue.y) : null;
  // Moonlight through the shoji: a cool glow on the room side of each veranda door.
  const shojiLights = [2.5, 6.5, 11.5].map(x => warm(0x9fb4ff, 0, 4.5, x, 1.9, 6.6));
  const baseFill = {
    lamp: 1.1, hibachi: 0.55, candle: 0.45, burner: 0.22, shoji: 0.7
  };

  // Lightning from the garden side: a soft fill for the whole house, and a sun with
  // shadows that falls on the garden for a moment, so the well and the trees throw shade.
  const flashFill = warm(0xdfe8ff, 0, 20, 7.5, 2.3, 8);
  const flashSun = new THREE.DirectionalLight(0xdfe8ff, 0);
  flashSun.castShadow = true;
  flashSun.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024);
  flashSun.shadow.camera.left = -12;
  flashSun.shadow.camera.right = 12;
  flashSun.shadow.camera.top = 12;
  flashSun.shadow.camera.bottom = -12;
  flashSun.shadow.camera.near = 1;
  flashSun.shadow.camera.far = 50;
  flashSun.shadow.bias = -0.0008;
  flashSun.shadow.normalBias = 0.02;
  scene.add(flashSun, flashSun.target);
  flashSun.position.set(8, 16, 2);
  flashSun.target.position.set(7, 0, 4);

  // Beam: a soft cone along the torch axis. The edge falls off as the surface turns away
  // from the eye, and the light falls off along the length, so it has no hard rim.
  const beamGeo = new THREE.CylinderGeometry(6.2, 0.05, 14, 28, 1, true);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.6 }, uColor: { value: new THREE.Color(0xffe6bc) } },
    vertexShader: `
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vFacing = abs(normalize(normalMatrix * normal).z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        float edge = smoothstep(0.04, 0.9, vFacing);
        float along = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        float falloff = 0.25 + 0.75 * along * along;
        float a = uOpacity * edge * falloff;
        gl_FragColor = vec4(uColor * a, a);
      }`
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0, -7);
  camera.add(beam);
  const moteCount = touch ? 90 : 170;
  const moteGeo = new THREE.BufferGeometry();
  const moteArr = new Float32Array(moteCount * 3);
  const rnd = seeded(7);
  for (let i = 0; i < moteCount; i++) {
    const d = 1 + rnd() * 11;
    const r = rnd() * d * Math.tan(0.45) * 0.9;
    const a = rnd() * Math.PI * 2;
    moteArr[i * 3] = Math.cos(a) * r;
    moteArr[i * 3 + 1] = Math.sin(a) * r;
    moteArr[i * 3 + 2] = -d;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(moteArr, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: T.mote, size: 0.04, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff4e0 }));
  camera.add(motes);

  // Building.
  const house = buildHouse(world, M);
  scene.add(house.group);
  const doors = house.doors;
  const trees = buildTrees(M, [[0.8, 0.5], [12.6, 0.4, 0.6], [15.5, 6.5, 1.2], [-1.8, 9.5, 0.4], [18, 4, 2.3]]);
  scene.add(trees);

  const well = buildWell(world, M);
  scene.add(well.group);

  // Water running off the eaves of the house: thin streaks down from the roof's north edge.
  const eaves = new THREE.Group();
  const streakGeo = new THREE.PlaneGeometry(0.035, 2.5);
  for (let x = 1.0; x <= 14.0; x += 0.75) {
    const streak = new THREE.Mesh(streakGeo, M.water);
    streak.position.set(x, 1.25, 4.66);
    eaves.add(streak);
  }
  T.water.repeat.set(1, 3);
  scene.add(eaves);
  const wellRim = [0.3, 2.4, 4.1].map((a, i) => {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.22), M.fudaMat);
    const wx = world.well.x + Math.cos(a) * 0.5;
    const wz = world.well.y + Math.sin(a) * 0.5;
    card.position.set(wx, 1.13, wz);
    card.rotation.set(0, -a + Math.PI / 2, 0);
    card.rotation.x = -0.25;
    card.visible = false;
    card.castShadow = true;
    scene.add(card);
    return card;
  });

  // Props and items.
  const propObjs = [];
  for (const p of world.props) {
    const built = buildProp(p.type, p.dims, M);
    const g = built.group;
    const rotY = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 }[p.face] || 0;
    g.position.set(p.x, p.type === "kakejiku" ? 0.95 : 0, p.y);
    g.rotation.y = rotY;
    if (p.type === "kakejiku") g.position.y = 0.95;
    scene.add(g);
    propObjs.push({ prop: p, group: g, extra: built.extra });
  }
  const itemObjs = {};
  for (const it of world.items) {
    const g = buildItem(it.kind, M);
    // Diary-1 lies on the low table and diary-3 on the desk; the rest lie on the floor.
    const onTop = { "diary-1": 0.36, "diary-3": 0.7 };
    g.position.set(it.x, onTop[it.id] || 0, it.y);
    g.rotation.y = (it.x * 17.3) % 3;
    g.visible = false;
    scene.add(g);
    itemObjs[it.id] = g;
  }

  // Entity.
  const ent = createEntity(M);
  scene.add(ent.root);

  // Viewmodel on the camera.
  const vm = createViewModel(M, camera);

  // Rain: streaks falling around the camera.
  const rainN = touch ? 320 : 640;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainN * 6);
  const rainSeed = seeded(99);
  const drops = new Float32Array(rainN * 3);
  for (let i = 0; i < rainN; i++) {
    drops[i * 3] = (rainSeed() - 0.5) * 30;
    drops[i * 3 + 1] = rainSeed() * 10;
    drops[i * 3 + 2] = (rainSeed() - 0.5) * 30;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb0cc, transparent: true, opacity: 0.22, depthWrite: false }));
  rain.frustumCulled = false;
  scene.add(rain);

  // Incense smoke: a pool of puffs above the burner.
  const smokeMat = [];
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({ map: T.smoke, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.visible = false;
    scene.add(s);
    puffs.push({ s, life: 0, age: 0, vx: 0, vz: 0 });
    smokeMat.push(m);
  }

  // Figures and silhouettes for scares.
  const figure = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.figure, color: 0x050508, transparent: true, depthWrite: false }));
  figure.scale.set(0.9, 1.9, 1);
  figure.visible = false;
  scene.add(figure);
  const silhouette = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.45), new THREE.MeshBasicMaterial({ map: T.figure, color: 0x000000, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  silhouette.visible = false;
  scene.add(silhouette);

  // Bell (wind chime) pivot.
  const bell = world.props.findIndex(p => p.type === "bell");
  const bellObj = bell >= 0 ? propObjs[bell].extra.bell : null;

  // Clock pendulum.
  const clockIdx = world.props.findIndex(p => p.type === "clock");
  const clockPend = clockIdx >= 0 ? propObjs[clockIdx].extra.pendulum : null;

  // Hemi/moon base intensities, for lightning.
  const base = { hemi: hemi.intensity, moon: moon.intensity, amb: ambient.intensity };

  const st = {
    flash: 0,
    shake: 0,
    recoil: 0,
    smokeT: 0,
    smokeAcc: 0,
    silT: 0,
    figT: 0,
    bellStop: false,
    bellAngle: 0,
    bellVel: 0,
    bobPhase: 0,
    lidT: 0,
    lidDone: false,
    burnerWorld: null,
    demoT: 0,
    outdoors: false,
    swayT: 0,
    strikeX: 0,
    strikeY: 0,
  };
  if (world.well) {
    const b = propObjs.find(o => o.prop.type === "tsukue");
    if (b && b.extra.burner) {
      const v = b.extra.burner.clone();
      b.group.localToWorld(v);
      st.burnerWorld = v;
    }
  }
  const aspectScale = () => {
    const a = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    return a < 0.8 ? 0.7 : 0.8;
  };

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Taller vertical field on portrait screens so the sides stay visible.
    const vfov = camera.aspect >= 1 ? 66 : Math.min(92, Math.max(66, 2 * Math.atan(0.65 / camera.aspect) / deg));
    camera.fov = vfov;
    camera.updateProjectionMatrix();
  }

  function syncDoors(state, dt) {
    for (const d of doors) {
      const target = state.doorOpen[d.index] ? 1 : 0;
      const s = d.state;
      if (s.t !== target) {
        const step = dt * 2.8;
        s.t = Math.abs(target - s.t) <= step ? target : s.t + Math.sign(target - s.t) * step;
        applyLeaves(s, s.t);
      }
    }
  }

  function syncItems(state) {
    for (const it of world.items) {
      const vis = !state.taken[it.id] && (!it.hidden || state.revealed[it.id]);
      itemObjs[it.id].visible = vis;
    }
  }

  function syncWell(state, dt) {
    if (state.seal.lid && !st.lidDone) st.lidDone = true;
    if (st.lidDone && st.lidT < 1) st.lidT = Math.min(1, st.lidT + dt / 1.6);
    const k = st.lidT * st.lidT * (3 - 2 * st.lidT);
    const a = well.lidOpen;
    const b = well.lidClosed;
    well.lid.position.lerpVectors(a.pos, b.pos, k);
    well.lid.rotation.set(
      a.rot.x + (b.rot.x - a.rot.x) * k,
      a.rot.y + (b.rot.y - a.rot.y) * k,
      a.rot.z + (b.rot.z - a.rot.z) * k
    );
    wellRim.forEach((c, i) => { c.visible = i < state.placed; });
    well.mist.forEach((m, i) => {
      m.material.opacity = (0.3 + 0.1 * Math.sin(st.demoT * 0.7 + i)) * (state.seal.lid ? 0.2 : 1);
    });
  }

  function syncLight(state, dt) {
    // After the lid closes, the dark thins toward dawn.
    const dawn = state.seal.lid ? Math.min(1, state.seal.dawnT / 7) : 0;
    scene.fog.density = 0.032 - 0.02 * dawn;
    const on = state.light;
    const k = on ? state.flicker * (0.55 + 0.45 * state.charge) : 0;
    torch.intensity = 36 * k;
    beamMat.uniforms.uOpacity.value = 0.6 * k;
    motes.material.opacity = on ? 0.65 * k : 0;
    motes.rotation.z = Math.sin(st.demoT * 0.3) * 0.08;
    muzzle.intensity = Math.max(0, muzzle.intensity - dt * 280);
    // Lightning: a brief lift of the moon and fill, scaled down for reduced motion.
    const f = st.flash * (reduced ? 0.35 : 1);
    moon.intensity = base.moon * (1 + 3.2 * f);
    hemi.intensity = base.hemi * (1 + 2.4 * f + 1.1 * dawn);
    ambient.intensity = base.amb * (1 + 2 * f);
    flashFill.intensity = 7 * f;
    flashSun.intensity = 2.4 * f;
    st.flash = Math.max(0, st.flash - dt * 4.2);
    // The warm sources flicker a little, as a real flame does.
    const t = st.demoT;
    const fl = (k2, rate) => 0.92 + 0.08 * Math.sin(t * rate) + 0.04 * Math.sin(t * rate * 2.7 + k2);
    if (lampLight) lampLight.intensity = baseFill.lamp * fl(1, 6.1) * (on ? 1 : 0.85);
    if (hibachiLight) hibachiLight.intensity = baseFill.hibachi * fl(2, 8.3);
    if (candleLight) candleLight.intensity = baseFill.candle * fl(3, 5.4);
    if (burnerLight) burnerLight.intensity = baseFill.burner * fl(4, 3.1) * (st.smokeT > 0 ? 1.4 : 1);
    for (const l of shojiLights) l.intensity = baseFill.shoji * (1 + 0.6 * dawn);
    // The eaves water runs down.
    T.water.offset.y = -t * 0.9;
  }

  function syncEntity(state, dt, now) {
    poseEntity(ent, state.ent, state.player, now, dt);
    const e = state.ent;
    ent.root.visible = !(e.state === "SEALED" && ent.sink > 2.1);
  }

  function syncPlayerCamera(state, view, dt) {
    const p = state.player;
    const run = p.running;
    if (p.moving) st.bobPhase += dt * (run ? 10 : 7);
    const bob = p.moving ? Math.sin(st.bobPhase) * (run ? 0.045 : 0.028) : 0;
    const shake = st.shake > 0 ? (Math.random() - 0.5) * 0.08 * st.shake * (reduced ? 0.3 : 1) : 0;
    camera.position.set(p.x + shake, 1.55 + bob, p.y + shake * 0.5);
    camera.rotation.set((view.pitch || 0) + st.recoil * (reduced ? 0.35 : 0.9), p.yaw, Math.sin(st.bobPhase) * (p.moving ? 0.004 : 0));
    // Breathing and hand tremor. Both grow with fear and with a low battery, and are
    // reduced for prefers-reduced-motion.
    st.swayT += dt;
    const fear = state.fear || 0;
    const lowBat = state.light && state.charge < 0.2 ? 1 : 0;
    const tremor = (0.0006 + 0.0024 * fear + 0.0012 * lowBat) * (reduced ? 0.3 : 1);
    const breath = Math.sin(st.swayT * 1.25) * (0.0028 + 0.0028 * fear) * (reduced ? 0.4 : 1);
    const tx = Math.sin(st.swayT * 6.3) * 0.6 + Math.sin(st.swayT * 13.1 + 0.8) * 0.4;
    const ty = Math.sin(st.swayT * 4.7 + 1.9) * 0.6 + Math.sin(st.swayT * 9.9) * 0.4;
    camera.rotation.x += breath + tx * tremor;
    camera.rotation.y += ty * tremor;
    camera.rotation.z += ty * tremor * 0.6;
    st.recoil = Math.max(0, st.recoil - dt * 6);
    st.shake = Math.max(0, st.shake - dt * 3);
  }

  function updateDemo(now, dt) {
    st.demoT += dt;
    const t = st.demoT;
    camera.position.set(9.6 + Math.sin(t * 0.05) * 0.8, 1.6, 3.3);
    camera.rotation.set(-0.02, 3.0 + Math.sin(t * 0.09) * 0.25, 0);
  }

  function updateSmoke(dt) {
    if (!st.burnerWorld) return;
    if (st.smokeT > 0) {
      st.smokeT -= dt;
      st.smokeAcc += dt;
      if (st.smokeAcc > 0.35) {
        st.smokeAcc = 0;
        const p = puffs.find(q => q.life <= 0);
        if (p) {
          p.life = 5;
          p.age = 0;
          p.s.position.copy(st.burnerWorld);
          p.s.position.y += 0.12;
          p.vx = (Math.random() - 0.5) * 0.02;
          p.vz = (Math.random() - 0.5) * 0.02;
          p.s.visible = true;
        }
      }
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.age += dt;
      p.s.position.y += dt * 0.22;
      p.s.position.x += p.vx * dt * 10;
      p.s.position.z += p.vz * dt * 10;
      const a = Math.min(1, p.age * 0.7) * Math.max(0, p.life / 5) * 0.28;
      p.s.material.opacity = a;
      const sc = 0.2 + p.age * 0.12;
      p.s.scale.set(sc, sc, 1);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  function updateRain(dt) {
    const cx = camera.position.x;
    const cz = camera.position.z;
    const speed = 12;
    for (let i = 0; i < rainN; i++) {
      drops[i * 3 + 1] -= speed * dt * (0.8 + (i % 7) * 0.05);
      if (drops[i * 3 + 1] < 0) {
        drops[i * 3 + 1] += 10;
        drops[i * 3] = (rainSeed() - 0.5) * 30;
        drops[i * 3 + 2] = (rainSeed() - 0.5) * 30;
      }
      const x = drops[i * 3] + cx;
      const y = drops[i * 3 + 1];
      const z = drops[i * 3 + 2] + cz;
      const len = 0.5;
      rainPos[i * 6] = x;
      rainPos[i * 6 + 1] = y + len;
      rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x - 0.08;
      rainPos[i * 6 + 4] = y;
      rainPos[i * 6 + 5] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  function updateBell(dt) {
    if (!bellObj) return;
    if (st.bellStop) {
      st.bellVel *= Math.pow(0.02, dt);
    } else {
      st.bellVel *= Math.pow(0.4, dt);
    }
    st.bellAngle += st.bellVel * dt;
    st.bellAngle *= 0.97;
    const sway = st.bellStop ? 0 : Math.sin(st.demoT * 1.3) * 0.05;
    bellObj.rotation.z = st.bellAngle + sway;
    bellObj.rotation.x = Math.sin(st.demoT * 0.9) * 0.02;
  }

  function updateScares(dt) {
    if (st.silT > 0) {
      st.silT -= dt;
      silhouette.material.opacity = Math.min(0.85, st.silT * 1.4);
      if (st.silT <= 0) silhouette.visible = false;
    }
    if (st.figT > 0) {
      st.figT -= dt;
      figure.material.opacity = st.figT > 0 ? 0.95 : 0;
      if (st.figT <= 0) figure.visible = false;
    }
  }

  const api = {
    camera,
    renderer,
    world,
    get outdoors() {
      return st.outdoors;
    },
    // Advance one frame. state may be null on the title screen.
    update(state, dt, now, view = {}) {
      st.demoT += dt;
      if (state) {
        const room = state.player.room;
        st.outdoors = room === "garden" || room === "engawa";
        syncPlayerCamera(state, view, dt);
        syncDoors(state, dt);
        syncItems(state);
        syncWell(state, dt);
        syncEntity(state, dt, now / 1000);
        syncLight(state, dt);
        if (clockPend) clockPend.rotation.z = Math.sin(state.t * Math.PI) * 0.22;
        for (const pObj of propObjs) {
          if (pObj.prop.type === "hibachi" && pObj.extra.ember) {
            pObj.extra.ember.material.emissiveIntensity = 1.2 + 0.4 * Math.sin(state.t * 3.7);
          }
        }
      } else {
        updateDemo(now, dt);
        st.outdoors = true;
        torch.intensity = 0;
        beamMat.uniforms.uOpacity.value = 0;
        motes.material.opacity = 0;
        muzzle.intensity = 0;
        well.lid.position.copy(well.lidOpen.pos);
        ent.root.visible = false;
        wellRim.forEach(c => { c.visible = false; });
      }
      rain.visible = st.outdoors;
      if (rain.visible) updateRain(dt);
      updateSmoke(dt);
      updateBell(dt);
      updateScares(dt);
      vm.update(state ? state.gun : { state: "ready", timer: 0, chambers: [0, 0] }, dt, aspectScale());
      renderer.render(scene, camera);
    },
    onEvents(events) {
      for (const e of events) {
        switch (e.type) {
          case "shot":
            vm.muzzle();
            muzzle.intensity = 9;
            st.recoil = 1;
            st.shake = 1;
            break;
          case "lightning":
            st.flash = 1;
            st.strikeX = e.x;
            st.strikeY = e.y;
            // The sun for the flash comes from above the strike point, so shadows fall away from it.
            flashSun.target.position.set(e.x, 0, e.y);
            flashSun.position.set(e.x + 5, 16, e.y - 3);
            if (e.figure) {
              figure.position.set(e.x, 0.95, e.y);
              figure.visible = true;
              st.figT = 0.12;
            }
            break;
          case "thunder":
            st.flash = Math.max(st.flash, 0.25 * e.strength);
            break;
          case "ambient":
            if (e.kind === "silhouette") {
              const door = doors.find(d => d.id === e.id);
              if (door) {
                // The shadow falls on the paper from the veranda side.
                const vertical = door.state.vertical;
                const ox = vertical ? 0.04 : 0;
                const oz = vertical ? 0 : -0.05;
                silhouette.position.set(door.obj.position.x + ox, 1.0, door.obj.position.z + oz);
                silhouette.rotation.y = vertical ? Math.PI / 2 : 0;
                silhouette.visible = true;
                st.silT = 1.6;
              }
            } else if (e.kind === "chime-stop") {
              st.bellStop = true;
            } else if (e.kind === "chime-ping") {
              st.bellStop = false;
              st.bellVel = 1.4;
            }
            break;
          case "burn":
            st.smokeT = 60;
            break;
          case "stun":
            st.shake = 0.6;
            break;
          default:
            break;
        }
      }
    },
    resize,
    dispose() {
      renderer.dispose();
    },
    setExposure(v) {
      // The slider sets the level; the base is brighter so the rooms read at the default.
      renderer.toneMappingExposure = v * EXPOSURE_BASE;
    }
  };

  resize(canvas.clientWidth || 800, canvas.clientHeight || 600);
  return api;
}
