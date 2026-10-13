// Furniture and small objects, built from primitives. Local front is +z.
import * as THREE from "../vendor/three.module.js";

function part(group, w, h, d, mat, x, y, z, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function cyl(group, rt, rb, h, seg, mat, x, y, z, cast = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// Build one prop. dims = { w, d, h } from the level table.
export function buildProp(type, dims, M) {
  const g = new THREE.Group();
  const { w, d, h } = dims;
  const extra = {};
  switch (type) {
    case "chabudai": {
      part(g, w, 0.035, d, M.lacquer, 0, h - 0.018, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        part(g, 0.05, h - 0.035, 0.05, M.woodDark, sx * (w / 2 - 0.08), (h - 0.035) / 2, sz * (d / 2 - 0.08));
      }
      break;
    }
    case "clock": {
      part(g, w, h, d, M.woodDark, 0, h / 2, 0);
      part(g, w * 0.82, h * 0.32, 0.012, M.glass, 0, h * 0.7, d / 2 + 0.004);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), M.paper);
      face.position.set(0, h * 0.7, d / 2 + 0.012);
      g.add(face);
      part(g, 0.008, 0.08, 0.004, M.ink, 0, h * 0.7 + 0.04, d / 2 + 0.014);
      part(g, 0.06, 0.008, 0.004, M.ink, 0.02, h * 0.7, d / 2 + 0.014);
      // Pendulum behind the glass door.
      const pivot = new THREE.Group();
      pivot.position.set(0, h * 0.36, 0);
      g.add(pivot);
      part(pivot, 0.01, 0.6, 0.01, M.metal, 0, -0.3, 0, false);
      cyl(pivot, 0.07, 0.07, 0.02, 16, M.metal, 0, -0.62, 0, false).rotation.x = Math.PI / 2;
      extra.pendulum = pivot;
      part(g, w + 0.04, 0.05, d + 0.04, M.woodDark, 0, h + 0.025, 0);
      break;
    }
    case "hibachi": {
      const body = cyl(g, 0.25, 0.22, h, 22, M.glaze, 0, h / 2, 0);
      body.castShadow = true;
      cyl(g, 0.27, 0.27, 0.03, 22, M.glaze, 0, h, 0);
      cyl(g, 0.22, 0.22, 0.02, 22, M.ash, 0, h - 0.02, 0, false);
      const ember = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), M.ember);
      ember.rotation.x = -Math.PI / 2;
      ember.position.set(0, h - 0.005, 0);
      g.add(ember);
      extra.ember = ember;
      break;
    }
    case "zabuton": {
      const cushion = part(g, w, h, d, M.cushion, 0, h / 2, 0);
      cushion.scale.set(1, 1, 1);
      part(g, w * 0.7, h * 1.05, d * 0.7, M.cushionTrim, 0, h / 2 + 0.002, 0, false);
      break;
    }
    case "butsudan": {
      // Base cabinet, then the shrine with a gold-framed opening and a cornice roof.
      part(g, w, h * 0.42, d, M.lacquerBlack, 0, h * 0.21, 0);
      part(g, w * 0.86, h * 0.42, d * 0.9, M.lacquerBlack, 0, h * 0.63, -0.02 * d);
      part(g, w * 0.7, h * 0.3, 0.02, M.altarInside, 0, h * 0.66, d * 0.45 + 0.01);
      part(g, w * 0.74, 0.03, 0.025, M.gold, 0, h * 0.66 + h * 0.15, d * 0.45 + 0.02, false);
      part(g, w * 0.74, 0.03, 0.025, M.gold, 0, h * 0.66 - h * 0.15, d * 0.45 + 0.02, false);
      part(g, 0.03, h * 0.3, 0.025, M.gold, -w * 0.35, h * 0.66, d * 0.45 + 0.02, false);
      part(g, 0.03, h * 0.3, 0.025, M.gold, w * 0.35, h * 0.66, d * 0.45 + 0.02, false);
      part(g, w * 1.12, 0.06, d * 1.2, M.lacquerBlack, 0, h * 0.86, d * 0.05);
      part(g, w * 1.0, 0.025, d * 1.02, M.gold, 0, h * 0.835, d * 0.4, false);
      part(g, w * 0.5, 0.1, d * 0.6, M.lacquerBlack, 0, h * 0.93, -0.02 * d);
      // Tablets: a row of memorial plates on the inner shelf, behind the gold frame.
      const tablets = new THREE.Group();
      tablets.position.set(0, h * 0.6, d * 0.1);
      g.add(tablets);
      for (let i = 0; i < 5; i++) {
        part(tablets, 0.07, 0.26, 0.018, M.tablet, -0.2 + i * 0.1, 0.02, 0, false);
      }
      extra.tablets = tablets;
      // Candlesticks and a small vase inside the frame.
      cyl(g, 0.03, 0.03, 0.2, 10, M.gold, -0.3, h * 0.42, d * 0.3, false);
      cyl(g, 0.03, 0.03, 0.2, 10, M.gold, 0.3, h * 0.42, d * 0.3, false);
      cyl(g, 0.02, 0.02, 0.1, 8, M.candle, -0.3, h * 0.42 + 0.15, d * 0.3, false);
      cyl(g, 0.02, 0.02, 0.1, 8, M.candle, 0.3, h * 0.42 + 0.15, d * 0.3, false);
      cyl(g, 0.05, 0.04, 0.12, 12, M.glaze, 0, h * 0.42 + 0.06, d * 0.3, false);
      break;
    }
    case "tsukue": {
      part(g, w, 0.04, d, M.lacquer, 0, h - 0.02, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        part(g, 0.04, h - 0.04, 0.04, M.woodDark, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
      }
      const burner = cyl(g, 0.07, 0.09, 0.09, 16, M.bronze, 0, h + 0.045, 0);
      burner.castShadow = true;
      for (let i = 0; i < 3; i++) {
        const stick = cyl(g, 0.003, 0.003, 0.2, 4, M.incense, -0.03 + i * 0.03, h + 0.18, 0.01 * i, false);
        stick.rotation.z = (i - 1) * 0.08;
      }
      extra.burner = new THREE.Vector3(0, h + 0.2, 0);
      break;
    }
    case "tansu": {
      part(g, w, h, d, M.lacquerWood, 0, h / 2, 0);
      part(g, w + 0.06, 0.04, d + 0.06, M.woodDark, 0, h + 0.02, 0);
      for (const yy of [0.22, 0.46, 0.7, 0.94]) {
        part(g, w - 0.04, 0.012, 0.01, M.woodDark, 0, yy, d / 2 + 0.004, false);
        cyl(g, 0.018, 0.018, 0.02, 8, M.metal, 0, yy + 0.07, d / 2 + 0.02, false).rotation.x = Math.PI / 2;
      }
      break;
    }
    case "kakejiku": {
      const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.22), new THREE.MeshStandardMaterial({ map: M.scrollTex, roughness: 0.9 }));
      scroll.position.set(0, 0.62, 0.012);
      g.add(scroll);
      cyl(g, 0.02, 0.02, 0.72, 8, M.woodDark, 0, 1.25, 0.012).rotation.z = Math.PI / 2;
      cyl(g, 0.02, 0.02, 0.72, 8, M.woodDark, 0, 0.0, 0.012).rotation.z = Math.PI / 2;
      part(g, 0.02, 0.1, 0.02, M.woodDark, 0, 1.31, 0.012, false);
      break;
    }
    case "andon": {
      part(g, w, 0.04, d, M.woodDark, 0, 0.02, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        part(g, 0.03, h, 0.03, M.woodDark, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03));
      }
      part(g, w * 0.84, 0.36, 0.01, M.lanternPaper, 0, 0.6, d / 2 - 0.01, false);
      part(g, w * 0.84, 0.36, 0.01, M.lanternPaper, 0, 0.6, -d / 2 + 0.01, false);
      part(g, w, 0.04, d, M.woodDark, 0, h - 0.02, 0);
      break;
    }
    case "geta": {
      part(g, w, h, d, M.woodDark, 0, h / 2, 0);
      for (const yy of [0.33, 0.66]) {
        part(g, w - 0.05, 0.015, 0.01, M.lacquerBlack, 0, yy, d / 2 + 0.004, false);
      }
      for (let i = 0; i < 4; i++) {
        part(g, 0.1, 0.02, 0.22, M.lacquerBlack, -0.36 + i * 0.24, 0.45, 0, false);
      }
      part(g, 0.08, 0.02, 0.2, M.lacquerBlack, -0.12, 0.99, 0.03, false);
      break;
    }
    case "kamado": {
      part(g, w, h, d, M.clay, 0, h / 2, 0);
      cyl(g, 0.22, 0.22, 0.02, 14, M.blackIron, -0.25, h + 0.01, 0.05, false);
      cyl(g, 0.16, 0.16, 0.02, 14, M.blackIron, 0.28, h + 0.01, 0.05, false);
      cyl(g, 0.1, 0.1, 0.02, 12, M.ash, 0.28, h + 0.02, 0.05, false);
      break;
    }
    case "sink": {
      part(g, w, h, d, M.stone, 0, h / 2, 0);
      part(g, w * 0.7, 0.02, d * 0.5, M.wellInside, 0, h + 0.005, 0.02, false);
      cyl(g, 0.015, 0.015, 0.25, 8, M.metal, 0, h + 0.13, -d / 2 + 0.07, false);
      break;
    }
    case "shelf": {
      part(g, w, h, d, M.woodDark, 0, h / 2, 0);
      for (const yy of [0.4, 0.8, 1.2]) {
        part(g, w - 0.03, 0.03, d - 0.02, M.woodDark, 0, yy, 0.01, false);
      }
      for (let i = 0; i < 3; i++) {
        cyl(g, 0.07, 0.08, 0.2, 12, M.glaze, -0.28 + i * 0.28, 0.5, 0.05, false);
      }
      break;
    }
    case "hako": {
      part(g, w, h, d, M.woodPlain, 0, h / 2, 0);
      for (const xx of [-0.22, 0.22]) {
        part(g, 0.03, h + 0.01, d + 0.01, M.blackIron, xx, h / 2, 0, false);
      }
      part(g, w + 0.02, 0.03, d + 0.02, M.woodDark, 0, h + 0.015, 0, false);
      break;
    }
    case "toilet": {
      part(g, w, h * 0.5, d, M.ceramic, 0, h * 0.25, -0.05);
      cyl(g, 0.15, 0.12, 0.25, 16, M.ceramic, 0, h * 0.5, 0.06);
      part(g, w, h * 0.5, 0.18, M.ceramic, 0, h * 0.75, -d / 2 + 0.09);
      break;
    }
    case "kurachest": {
      part(g, w, h, d, M.lacquerBlack, 0, h / 2, 0);
      part(g, w + 0.04, 0.05, d + 0.04, M.woodDark, 0, h - 0.02, 0);
      for (const xx of [-w / 2 + 0.07, w / 2 - 0.07]) {
        part(g, 0.05, h - 0.1, d + 0.01, M.blackIron, xx, h / 2, 0, false);
      }
      cyl(g, 0.02, 0.02, 0.1, 8, M.metal, 0, h * 0.55, d / 2 + 0.03, false).rotation.z = Math.PI / 2;
      break;
    }
    case "desk": {
      part(g, w, 0.04, d, M.lacquer, 0, h - 0.02, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        part(g, 0.04, h - 0.04, 0.04, M.woodDark, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
      }
      cyl(g, 0.07, 0.08, 0.03, 14, M.inkstone, -0.25, h + 0.015, -0.08, false);
      cyl(g, 0.012, 0.012, 0.18, 6, M.woodDark, 0.12, h + 0.09, 0.05, false).rotation.z = 0.5;
      break;
    }
    case "lantern": {
      part(g, 0.5, 0.2, 0.5, M.stone, 0, 0.1, 0);
      cyl(g, 0.09, 0.11, 0.8, 10, M.stone, 0, 0.6, 0);
      part(g, 0.3, 0.3, 0.3, M.stone, 0, 1.15, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.2, 4), M.stone);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(0, 1.4, 0);
      roof.castShadow = true;
      g.add(roof);
      break;
    }
    case "bucket": {
      cyl(g, 0.17, 0.15, 0.35, 14, M.woodPlain, 0, 0.175, 0);
      for (const yy of [0.06, 0.29]) cyl(g, 0.175, 0.175, 0.015, 14, M.blackIron, 0, yy, 0, false);
      break;
    }
    case "bell": {
      const hang = new THREE.Group();
      hang.position.set(0, dims.hang || 2.05, 0);
      g.add(hang);
      cyl(hang, 0.003, 0.003, 0.35, 4, M.rope, 0, -0.17, 0, false);
      const glass = cyl(hang, 0.065, 0.075, 0.09, 16, M.glassBell, 0, -0.39, 0, false);
      glass.castShadow = false;
      const tongue = cyl(hang, 0.012, 0.012, 0.06, 6, M.metal, 0, -0.42, 0, false);
      tongue.rotation.z = 0.2;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.22), M.strip);
      strip.position.set(0, -0.52, 0.001);
      hang.add(strip);
      extra.bell = hang;
      break;
    }
    case "tree": {
      cyl(g, 0.08, 0.22, 3.2, 7, M.bark, 0, 1.6, 0);
      break;
    }
    default:
      break;
  }
  return { group: g, extra };
}

// Small carried or found objects: battery, shell, talisman, diary.
export function buildItem(kind, M) {
  const g = new THREE.Group();
  if (kind === "battery") {
    const body = cyl(g, 0.026, 0.026, 0.09, 12, M.batteryBody, 0, 0.026, 0);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    const cap = cyl(g, 0.014, 0.014, 0.01, 10, M.metal, 0.05, 0.026, 0, false);
    cap.rotation.z = Math.PI / 2;
  } else if (kind === "shell") {
    const body = cyl(g, 0.013, 0.013, 0.07, 10, M.shellRed, 0, 0.013, 0);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    const cap = cyl(g, 0.0135, 0.0135, 0.02, 10, M.brass, 0.04, 0.013, 0, false);
    cap.rotation.z = Math.PI / 2;
  } else if (kind === "fuda") {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.18), M.fudaMat);
    card.rotation.x = -Math.PI / 2;
    card.position.y = 0.006;
    g.add(card);
  } else if (kind === "diary") {
    part(g, 0.16, 0.02, 0.22, M.diaryCover, 0, 0.01, 0);
    part(g, 0.15, 0.012, 0.21, M.paperPage, 0, 0.024, 0, false);
  }
  return g;
}
