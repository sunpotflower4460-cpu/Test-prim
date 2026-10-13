// Procedural canvas textures for 鳴き井戸. No image files: every map is computed here.
import * as THREE from "../vendor/three.module.js";

// Deterministic per-seed hash in [0, 1).
function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Tileable value noise on a period (px, py).
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal noise in [0, 1], tileable over a w x h texture of period (w, h) in noise cells.
function fbm(x, y, px, py, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = px;
  let fy = py;
  let sx = x;
  let sy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(sx, sy, fx, fy, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
    sx *= 2;
    sy *= 2;
  }
  return sum / norm;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a colour map and a normal map from a per-pixel function.
// fn(x, y) returns [r, g, b, height] with channels in 0..1 (r,g,b are sRGB-ish values).
function paint(size, fn, opts = {}) {
  const w = opts.w || size;
  const h = opts.h || size;
  const colour = document.createElement("canvas");
  colour.width = w;
  colour.height = h;
  const cctx = colour.getContext("2d");
  const img = cctx.createImageData(w, h);
  const heights = new Float32Array(w * h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x / w, y / h, x, y);
      const i = y * w + x;
      d[i * 4] = Math.max(0, Math.min(255, p[0] * 255));
      d[i * 4 + 1] = Math.max(0, Math.min(255, p[1] * 255));
      d[i * 4 + 2] = Math.max(0, Math.min(255, p[2] * 255));
      d[i * 4 + 3] = 255;
      heights[i] = p[3];
    }
  }
  cctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  let normal = null;
  if (opts.normal !== false) {
    normal = normalFrom(heights, w, h, opts.bump || 2.5);
  }
  return { map, normal, heights, w, h, canvas: colour };
}

function normalFrom(heights, w, h, strength) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = heights[y * w + ((x - 1 + w) % w)];
      const r = heights[y * w + ((x + 1) % w)];
      const t = heights[((y - 1 + h) % h) * w + x];
      const b = heights[((y + 1) % h) * w + x];
      let nx = (l - r) * strength;
      let ny = (t - b) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Random-walk crack marks: returns a mask (1 = crack) over w x h.
function cracks(w, h, count, seed) {
  const r = rng(seed);
  const mask = new Uint8Array(w * h);
  for (let k = 0; k < count; k++) {
    let x = r() * w;
    let y = r() * h;
    let dir = r() * Math.PI * 2;
    const len = 30 + r() * 60;
    for (let s = 0; s < len; s++) {
      dir += (r() - 0.5) * 0.9;
      x += Math.cos(dir) * 0.8;
      y += Math.sin(dir) * 0.8;
      const xi = Math.floor(((x % w) + w) % w);
      const yi = Math.floor(((y % h) + h) % h);
      mask[yi * w + xi] = 1;
    }
  }
  return mask;
}

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function createTextures() {
  const T = {};

  // Tatami: two mats per 1.8 m tile, woven lines, a dark edge binding.
  {
    const p = paint(256, (u, v, x, y) => {
      const mat = v < 0.5 ? 0 : 1;
      const lv = (v * 2) % 1;
      const weave = 0.5 + 0.5 * Math.sin((y / 8) * Math.PI * 2);
      const n = fbm(u * 4, v * 4, 4, 4, 4, 11);
      const col = 0.5 + 0.12 * (fbm(u * 2, mat, 2, 2, 3, 3) - 0.5);
      let base = 0.68 * col + 0.05 * (n - 0.5);
      const edge = lv < 0.025 || lv > 0.975 || u < 0.01 || u > 0.99 ? 0.4 : 1;
      const seam = Math.abs(v - 0.5) < 0.012 ? 0.6 : 1;
      base *= (0.9 + 0.1 * weave) * edge * seam;
      const hgt = 0.5 + 0.4 * (weave - 0.5) + 0.2 * (n - 0.5);
      return [base * 0.78, base * 0.72, base * 0.42, hgt];
    }, { bump: 1.2 });
    T.tatami = p;
  }

  // Wood planks running along v. Grain streaks stretch along the plank.
  {
    const p = paint(256, (u, v) => {
      const plank = Math.floor(u * 6);
      const pu = (u * 6) % 1;
      const tone = 0.85 + 0.3 * hash(plank, 1, 7);
      const grain = fbm(u * 12, v * 2, 12, 2, 4, 21);
      const streak = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (v * 12 + grain * 2));
      const seam = pu < 0.02 || pu > 0.98 ? 0.45 : 1;
      const k = tone * (0.72 + 0.22 * streak * (0.6 + grain * 0.6)) * seam;
      return [0.42 * k, 0.28 * k, 0.17 * k, 0.5 + 0.5 * streak * 0.4 - (seam < 1 ? 0.5 : 0)];
    }, { bump: 1.5 });
    T.wood = p;
  }

  // Darker, aged boards for the ceiling and the beams.
  {
    const p = paint(256, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 6, 4, 33);
      const streak = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (u * 20) + n * 12);
      const k = 0.4 + 0.25 * streak * n;
      return [0.24 * k, 0.16 * k, 0.1 * k, streak * 0.5];
    }, { bump: 1.0 });
    T.ceiling = p;
  }

  // Packed earth (土間).
  {
    const p = paint(256, (u, v) => {
      const n = fbm(u * 8, v * 8, 8, 8, 5, 41);
      const pebble = hash(Math.floor(u * 64), Math.floor(v * 64), 5) > 0.93 ? 0.35 : 0;
      const k = 0.4 + 0.5 * n + pebble;
      return [0.3 * k, 0.24 * k, 0.18 * k, n];
    }, { bump: 3 });
    T.earth = p;
  }

  // Tiles for the toilet: small grey-green squares with grout.
  {
    const p = paint(256, (u, v) => {
      const tu = (u * 4) % 1;
      const tv = (v * 4) % 1;
      const grout = tu < 0.04 || tv < 0.04 ? 0.5 : 1;
      const n = fbm(u * 4, v * 4, 4, 4, 3, 51);
      const k = (0.62 + 0.15 * n) * grout;
      return [0.36 * k, 0.42 * k, 0.38 * k, grout < 1 ? 0.2 : 0.8 + n * 0.2];
    }, { bump: 2 });
    T.tile = p;
  }

  // Garden mud with glossy puddles (roughness map: low = wet).
  {
    const pud = [];
    const p = paint(512, (u, v) => {
      const n = fbm(u * 3, v * 3, 3, 3, 5, 61);
      const m = fbm(u * 6, v * 6, 6, 6, 3, 67);
      const wet = Math.max(0, Math.min(1, (m - 0.56) * 9));
      const k = 0.5 + 0.5 * n;
      pud.push(wet);
      const r = 0.26 * k * (1 - wet * 0.5) + 0.05 * wet;
      const g = 0.2 * k * (1 - wet * 0.5) + 0.06 * wet;
      const b = 0.15 * k * (1 - wet * 0.5) + 0.09 * wet;
      return [r, g, b, n * (1 - wet) + wet * 0.2];
    }, { bump: 3 });
    // Roughness: puddles are wet and glossy.
    const rc = document.createElement("canvas");
    rc.width = p.w;
    rc.height = p.h;
    const rctx = rc.getContext("2d");
    const img = rctx.createImageData(p.w, p.h);
    for (let i = 0; i < p.w * p.h; i++) {
      const v = Math.round((1 - pud[i]) * 200 + 40);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    rctx.putImageData(img, 0, 0);
    const rough = new THREE.CanvasTexture(rc);
    rough.wrapS = THREE.RepeatWrapping;
    rough.wrapT = THREE.RepeatWrapping;
    p.rough = rough;
    T.mud = p;
  }

  // Stepping stones: irregular flagstones with grout.
  {
    const p = paint(256, (u, v) => {
      const su = Math.floor(u * 2);
      const sv = Math.floor(v * 2);
      const fu = u * 2 - su;
      const fv = v * 2 - sv;
      const jitter = hash(su, sv, 71);
      const grout = fu < 0.05 || fv < 0.05 || fu > 0.95 || fv > 0.95 ? 0.35 : 1;
      const n = fbm(u * 8, v * 8, 8, 8, 4, 73);
      const k = (0.36 + 0.2 * jitter + 0.22 * n) * grout;
      return [0.5 * k, 0.5 * k, 0.48 * k, grout < 1 ? 0.1 : 0.7 + n * 0.3];
    }, { bump: 2 });
    T.stone = p;
  }

  // Plaster walls (漆喰): off-white, stains, hairline cracks.
  {
    const w = 256;
    const mask = cracks(w, w, 3, 91);
    const p = paint(w, (u, v, x, y) => {
      const n = fbm(u * 4, v * 4, 4, 4, 5, 81);
      const stain = Math.max(0, fbm(u * 3, v * 3, 3, 3, 3, 83) - 0.55) * 1.8;
      const dirt = Math.max(0, 0.45 - v) * 0.6;
      const crack = mask[y * w + x] ? 1 : 0;
      const k = 0.83 + 0.1 * (n - 0.5) - stain * 0.12 - dirt * 0.4 - crack * 0.25;
      return [0.8 * k, 0.74 * k, 0.6 * k, 0.5 + n * 0.3 - crack * 0.6];
    }, { bump: 2 });
    T.plaster = p;
  }

  // Exterior clay wall (土塀): ochre with straw speckles.
  {
    const p = paint(256, (u, v) => {
      const n = fbm(u * 5, v * 5, 5, 5, 5, 97);
      const straw = hash(Math.floor(u * 128), Math.floor(v * 128), 99) > 0.9 ? 0.2 : 0;
      const k = 0.5 + 0.25 * n + straw;
      return [0.36 * k, 0.26 * k, 0.16 * k, n];
    }, { bump: 3 });
    T.clay = p;
  }

  // Exterior timber boarding (板壁): vertical boards, dark, weathered.
  {
    const p = paint(256, (u, v) => {
      const board = Math.floor(u * 8);
      const bu = (u * 8) % 1;
      const seam = bu < 0.04 ? 0.5 : 1;
      const tone = 0.7 + 0.3 * hash(board, 3, 101);
      const grain = fbm(u * 16, v * 2, 16, 2, 4, 103);
      const k = tone * (0.5 + 0.4 * grain) * seam;
      return [0.25 * k, 0.18 * k, 0.12 * k, grain * seam];
    }, { bump: 1.5 });
    T.boarding = p;
  }

  // Shoji: glowing paper behind a dark lattice.
  {
    const size = 256;
    const p = paint(size, (u, v) => {
      const gu = (u * 3) % 1;
      const gv = (v * 4) % 1;
      const bar = gu < 0.05 || gv < 0.04 || gu > 0.95 || gv > 0.96 ? 1 : 0;
      const n = fbm(u * 3, v * 3, 3, 3, 3, 111);
      const k = bar ? 0.2 : 0.9 + 0.08 * (n - 0.5);
      return [0.92 * k, 0.9 * k, 0.8 * k, bar ? 0.2 : 0.7];
    }, { bump: 0.5 });
    const emissive = canvasTex(size, size, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const gu = (u * 3) % 1;
          const gv = (v * 4) % 1;
          const bar = gu < 0.05 || gv < 0.04 || gu > 0.95 || gv > 0.96;
          const i = (y * w + x) * 4;
          const k = bar ? 0.05 : 0.8;
          img.data[i] = 150 * k;
          img.data[i + 1] = 175 * k;
          img.data[i + 2] = 230 * k;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
    T.shoji = { map: p.map, normal: p.normal, emissive };
  }

  // Fusuma: cream paper panel with fibre texture.
  {
    const p = paint(256, (u, v) => {
      const n = fbm(u * 2, v * 4, 2, 4, 4, 121);
      const fibre = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (v * 44) + n * 8);
      const k = 0.7 + 0.1 * (n - 0.5) + 0.03 * fibre;
      return [0.72 * k, 0.66 * k, 0.5 * k, n * 0.6 + fibre * 0.2];
    }, { bump: 1 });
    T.fusuma = p;
  }

  // Tatami-free lacquer for the altar and the chests.
  {
    const p = paint(256, (u, v) => {
      const n = fbm(u * 3, v * 3, 3, 3, 4, 131);
      const streak = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (u * 10) + n * 6);
      const k = 0.22 + 0.06 * streak + 0.05 * n;
      return [0.5 * k, 0.4 * k, 0.32 * k, streak * 0.3 + n * 0.7];
    }, { bump: 1.5 });
    T.lacquer = p;
  }

  // Cloth for the yukata: faint vertical weave.
  {
    const p = paint(128, (u, v) => {
      const n = fbm(u * 6, v * 6, 6, 6, 3, 141);
      const weave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (u * 50));
      const k = 0.82 + 0.08 * (n - 0.5) + 0.02 * weave;
      return [0.86 * k, 0.84 * k, 0.78 * k, weave * 0.3 + n * 0.7];
    }, { bump: 0.6 });
    T.cloth = p;
  }

  // Paper talisman (封の札): cream paper, red seal character.
  T.fuda = canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#e8dbb8";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(150,40,30,0.85)";
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 14, w - 24, h - 28);
    ctx.fillStyle = "rgba(160,30,24,0.95)";
    ctx.font = "bold 92px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("封", w / 2, h * 0.52);
    ctx.font = "bold 22px serif";
    ctx.fillText("封", w / 2, 40);
  });

  // Diary cover and paper for the booklets.
  T.paper = canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#efe5cc");
    g.addColorStop(1, "#d8c9a4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = "rgba(90,70,40," + (0.04 + r() * 0.05) + ")";
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
    }
  });

  // Hanging scroll with an ink landscape.
  T.scroll = canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = "#d9cfb2";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(40,40,46,0)");
    g.addColorStop(1, "rgba(30,30,34,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Misty mountains in ink wash.
    const mountain = (base, amp, alpha, seed) => {
      const r = rng(seed);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.02 + seed) * r()) - amp * 0.4 * Math.sin(x * 0.05 + seed * 2);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = "rgba(34,34,40," + alpha + ")";
      ctx.fill();
    };
    mountain(h * 0.52, 120, 0.22, 3);
    mountain(h * 0.62, 90, 0.4, 5);
    mountain(h * 0.75, 60, 0.62, 9);
    // A lone pine silhouette.
    ctx.strokeStyle = "rgba(24,24,28,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.7, h * 0.7);
    ctx.lineTo(w * 0.72, h * 0.42);
    ctx.stroke();
    // Seal.
    ctx.fillStyle = "rgba(160,40,30,0.9)";
    ctx.fillRect(w * 0.78, h * 0.86, 28, 28);
  });

  // Soft dust mote and mist sprites.
  T.mote = canvasTex(32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,240,210,1)");
    g.addColorStop(1, "rgba(255,240,210,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  T.mist = canvasTex(128, 128, (ctx, w, h) => {
    const r = rng(19);
    for (let i = 0; i < 26; i++) {
      const x = w * (0.3 + r() * 0.4);
      const y = h * (0.3 + r() * 0.4);
      const rad = w * (0.2 + r() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(190,200,220,0.16)");
      g.addColorStop(1, "rgba(190,200,220,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  });

  // Smoke puff from the incense.
  T.smoke = canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(220,220,225,0.5)");
    g.addColorStop(0.6, "rgba(200,200,210,0.2)");
    g.addColorStop(1, "rgba(200,200,210,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Flash burst for the muzzle.
  T.flash = canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,246,220,1)");
    g.addColorStop(0.3, "rgba(255,190,110,0.8)");
    g.addColorStop(1, "rgba(255,120,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Beam cone: brightest near the lamp, fading toward the far end.
  T.beam = canvasTex(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,236,200,0.55)");
    g.addColorStop(0.5, "rgba(255,230,190,0.16)");
    g.addColorStop(1, "rgba(255,230,190,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // A woman's silhouette with long hair, for the shoji and the lightning figure.
  T.figure = canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "rgba(6,6,10,1)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.14, w * 0.11, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.2);
    ctx.lineTo(w * 0.66, h * 0.2);
    ctx.lineTo(w * 0.74, h * 0.95);
    ctx.lineTo(w * 0.26, h * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(w * 0.42, h * 0.18, w * 0.16, h * 0.15);
  });

  return T;
}

export { canvasTex };
