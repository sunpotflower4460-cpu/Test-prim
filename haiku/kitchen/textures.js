// Procedural canvas textures for おばちゃんの台所. No image files.
import * as THREE from "../vendor/three.module.js";

// Small seeded RNG so every texture comes out the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

// Warm wood floor: planks with grain and slight tone variation.
export function woodFloor() {
  const c = makeCanvas(1024, 1024);
  const g = c.getContext("2d");
  const r = rng(11);
  const planks = 8;
  const ph = 1024 / planks;
  for (let i = 0; i < planks; i++) {
    const tone = 0.9 + r() * 0.2;
    const base = [Math.round(196 * tone), Math.round(146 * tone), Math.round(96 * tone)];
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    g.fillRect(0, i * ph, 1024, ph);
    for (let k = 0; k < 26; k++) {
      const y0 = i * ph + r() * ph;
      const amp = 2 + r() * 4;
      const freq = 0.004 + r() * 0.006;
      g.strokeStyle = `rgba(90,52,28,${0.10 + r() * 0.15})`;
      g.lineWidth = 0.8 + r() * 1.4;
      g.beginPath();
      for (let x = 0; x <= 1024; x += 16) {
        const y = y0 + Math.sin(x * freq + k) * amp;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = "rgba(60,34,18,0.55)";
    g.fillRect(0, i * ph, 1024, 2);
    const jx = r() * 1024;
    g.fillRect(jx, i * ph, 2, ph);
  }
  return toTexture(c, 2, 2);
}

// Cream tiles with a blue-and-white pattern for the splashback.
export function tileSplashback() {
  const c = makeCanvas(512, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#fbf6ea";
  g.fillRect(0, 0, 512, 256);
  const s = 64;
  for (let y = 0; y < 256; y += s) {
    for (let x = 0; x < 512; x += s) {
      g.strokeStyle = "#2c5f9e";
      g.lineWidth = 3;
      g.strokeRect(x + 3, y + 3, s - 6, s - 6);
      const cx = x + s / 2;
      const cy = y + s / 2;
      g.fillStyle = "#2c5f9e";
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#5a8fc9";
      g.lineWidth = 2;
      for (let a = 0; a < 4; a++) {
        const ang = (Math.PI / 2) * a + Math.PI / 4;
        g.beginPath();
        g.arc(cx + Math.cos(ang) * 18, cy + Math.sin(ang) * 18, 9, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
  return toTexture(c, 4, 1);
}

// Plain warm wall with faint stripes.
export function plasterWall(tint = "#f3e6cf") {
  const c = makeCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = tint;
  g.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120,90,60,${r() * 0.035})`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3);
  }
  return toTexture(c, 2, 2);
}

// Small flowers on cream, for the apron.
export function apronCloth() {
  const c = makeCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#fff6ec";
  g.fillRect(0, 0, 256, 256);
  const colors = ["#f0a3b3", "#f6c85f", "#9ec9e8", "#f29a7c"];
  const r = rng(5);
  for (let y = 16; y < 256; y += 42) {
    for (let x = (y / 42) % 2 ? 20 : 0; x < 256; x += 42) {
      const col = colors[Math.floor(r() * colors.length)];
      const cx = x + 8 + r() * 8;
      const cy = y + 8 + r() * 6;
      g.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        const a = (Math.PI * 2 * p) / 5;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 4.5, 4.5, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#e8b04a";
      g.beginPath();
      g.arc(cx, cy, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(c, 1, 1);
}

// Tatami mats: green straw with seams.
export function tatami() {
  const c = makeCanvas(512, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#c9d27a";
  g.fillRect(0, 0, 512, 256);
  const r = rng(31);
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(90,110,40,${r() * 0.12})`;
    g.fillRect(r() * 512, r() * 256, 1 + r() * 20, 1);
  }
  g.strokeStyle = "rgba(70,80,30,0.7)";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 252);
  return toTexture(c, 1, 1);
}

// Grass for the garden with a few lighter patches.
export function grass() {
  const c = makeCanvas(512, 512);
  const g = c.getContext("2d");
  g.fillStyle = "#7cb84e";
  g.fillRect(0, 0, 512, 512);
  const r = rng(91);
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(160,210,95,${0.2 + r() * 0.25})` : `rgba(70,130,50,${0.2 + r() * 0.25})`;
    g.fillRect(r() * 512, r() * 512, 2 + r() * 4, 2 + r() * 4);
  }
  return toTexture(c, 10, 10);
}

// Tilled soil for the 畑 rows.
export function soil() {
  const c = makeCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#7a5233";
  g.fillRect(0, 0, 256, 256);
  const r = rng(61);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${40 + r() * 40},${25 + r() * 20},${10 + r() * 10},0.5)`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3);
  }
  return toTexture(c, 1, 3);
}

// Vertical sky gradient for the background dome.
export function skyGradient() {
  const c = makeCanvas(4, 256);
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#5fa9e6");
  grd.addColorStop(0.55, "#bfe3f5");
  grd.addColorStop(0.8, "#fde7b9");
  grd.addColorStop(1, "#ffd9a0");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft radial sprite. Used for steam, cheeks, clouds and glows.
export function softDot(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const c = makeCanvas(64, 64);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A cloud made of overlapping puffs.
export function cloudPuff() {
  const c = makeCanvas(256, 128);
  const g = c.getContext("2d");
  const puffs = [[70, 70, 46], [120, 58, 56], [170, 72, 44], [100, 84, 40], [150, 86, 38]];
  for (const [x, y, r] of puffs) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.7, "rgba(255,255,255,0.8)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Wall clock face, drawn for a given time.
export function clockFace(now) {
  const c = makeCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#fffaf0";
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#7b4b2a";
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = "#4a2e1a";
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    g.beginPath();
    g.arc(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98, i % 3 === 0 ? 7 : 4, 0, Math.PI * 2);
    g.fill();
  }
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  const hand = (len, w, ang, col) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(ang) * len, 128 + Math.sin(ang) * len);
    g.stroke();
  };
  hand(62, 9, ((h + m / 60) / 12) * Math.PI * 2 - Math.PI / 2, "#3d2716");
  hand(92, 6, (m / 60) * Math.PI * 2 - Math.PI / 2, "#3d2716");
  hand(100, 2.5, (s / 60) * Math.PI * 2 - Math.PI / 2, "#d9534f");
  g.fillStyle = "#3d2716";
  g.beginPath();
  g.arc(128, 128, 8, 0, Math.PI * 2);
  g.fill();
  return c;
}

// Wall calendar for late summer.
export function calendarFace() {
  const c = makeCanvas(256, 320);
  const g = c.getContext("2d");
  g.fillStyle = "#fffdf6";
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = "#e8856a";
  g.fillRect(0, 0, 256, 74);
  g.fillStyle = "#fff";
  g.font = "bold 40px 'Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif";
  g.textAlign = "center";
  g.fillText("10月", 128, 52);
  g.fillStyle = "#6b4a33";
  g.font = "18px 'Noto Sans JP',sans-serif";
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  days.forEach((d, i) => g.fillText(d, 22 + i * 34, 104));
  g.font = "18px sans-serif";
  for (let d = 1; d <= 31; d++) {
    const idx = (d + 3) % 7;
    const row = Math.floor((d + 3) / 7);
    g.fillStyle = d === 12 ? "#d9534f" : "#4a3322";
    g.fillText(String(d), 22 + idx * 34, 134 + row * 30);
  }
  return c;
}

// Labelled jar and bottle. Each seasoning reads at a glance.
export function jarLabel(text, color = "#fff7e6") {
  const c = makeCanvas(128, 96);
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = "#8a5a33";
  g.lineWidth = 5;
  g.strokeRect(4, 4, 120, 88);
  g.fillStyle = "#4a2e1a";
  g.textAlign = "center";
  g.font = "bold 34px 'Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif";
  g.fillText(text, 64, 60);
  return toTexture(c, 1, 1);
}

// Chalkboard menu listing the dishes.
export function chalkMenu(lines) {
  const c = makeCanvas(512, 320);
  const g = c.getContext("2d");
  g.fillStyle = "#2f3b35";
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = "#a57c4f";
  g.lineWidth = 16;
  g.strokeRect(8, 8, 496, 304);
  g.fillStyle = "#f4f1e6";
  g.textAlign = "center";
  g.font = "bold 44px 'Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif";
  g.fillText("お品書き", 256, 76);
  g.font = "bold 34px 'Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif";
  lines.forEach((t, i) => g.fillText(t, 256, 144 + i * 52));
  return toTexture(c, 1, 1);
}

// Towel with blue stripes.
export function towelStripes() {
  const c = makeCanvas(64, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#fbfaf3";
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = "#5b8fc6";
  for (let y = 0; y < 256; y += 48) g.fillRect(0, y, 64, 14);
  return toTexture(c, 1, 1);
}

// Plain wood grain for the tables and counter tops.
export function woodGrain(tone = 1) {
  const c = makeCanvas(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = `rgb(${Math.round(190 * tone)},${Math.round(136 * tone)},${Math.round(84 * tone)})`;
  g.fillRect(0, 0, 256, 256);
  const r = rng(Math.round(tone * 1000));
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(90,50,25,${0.1 + r() * 0.15})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    const y = r() * 256;
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    g.stroke();
  }
  return toTexture(c, 1, 1);
}

// Cutting board top.
export function boardTop() {
  const c = makeCanvas(128, 128);
  const g = c.getContext("2d");
  g.fillStyle = "#d9a86c";
  g.fillRect(0, 0, 128, 128);
  const r = rng(12);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,70,30,${0.1 + r() * 0.2})`;
    g.beginPath();
    g.moveTo(r() * 128, r() * 128);
    g.lineTo(r() * 128, r() * 128);
    g.stroke();
  }
  return toTexture(c, 1, 1);
}

// Fine flower and leaf pattern for the cardigan or the book page.
export function paperNotes() {
  const c = makeCanvas(512, 512);
  const g = c.getContext("2d");
  g.fillStyle = "#fbf4e4";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(140,110,80,0.12)";
  g.lineWidth = 2;
  for (let y = 40; y < 512; y += 36) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  return c;
}

export function glowRing(color = "#ffd27a") {
  const c = makeCanvas(128, 128);
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 40, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,200,110,0)");
  grd.addColorStop(0.55, color);
  grd.addColorStop(0.75, "rgba(255,230,160,0.9)");
  grd.addColorStop(1, "rgba(255,230,160,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function fruitDetail() {
  return null;
}
