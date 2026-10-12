// Top-down debug view of a MIZUHO world: hillshade, water depth, rice.
// node tools/mizuho-view.cjs <level> [seconds] [out.png] [--script]
"use strict";
const path = require("node:path");
const Sim = require("../opus/sim.js");
const Levels = require("../opus/levels.js");
const { writePNG } = require("./png.cjs");

function render(w, scale) {
  const { W, H, ground, water, plant, grow, flags, bed } = w;
  const S = scale || 8, out = new Uint8Array(W * S * H * S * 4);
  let gmin = Infinity, gmax = -Infinity;
  for (let i = 0; i < w.N; i++) { gmin = Math.min(gmin, ground[i]); gmax = Math.max(gmax, ground[i]); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const gx = (ground[Math.min(i + 1, i - x + W - 1)] - ground[Math.max(i - 1, i - x)]);
    const gy = (ground[Math.min(i + W, w.N - 1)] - ground[Math.max(i - W, 0)]);
    let shade = 0.75 + (-gx - gy) * 0.35;
    const hgt = (ground[i] - gmin) / (gmax - gmin + 1e-6);
    let r = 120 + 70 * hgt, g = 140 + 60 * hgt, b = 80 + 30 * hgt;
    if (ground[i] - bed[i] < 0.12) { r = g = b = 150 + 60 * hgt; }
    r *= shade; g *= shade; b *= shade;
    if (plant[i] === Sim.GROWING) { r = 70; g = 150 + 80 * grow[i]; b = 60; }
    else if (plant[i] === Sim.RIPE) { r = 230; g = 190; b = 70; }
    else if (plant[i] === Sim.DEAD) { r = 120; g = 90; b = 60; }
    const d = water[i];
    if (d > 0.005) {
      const a = Math.min(0.9, 0.25 + d * 1.8);
      const wr = 40, wg = 110 + 60 * Math.min(1, d), wb = 200;
      r = r * (1 - a) + wr * a; g = g * (1 - a) + wg * a; b = b * (1 - a) + wb * a;
    }
    if (w.suit[i] > 0.8 && plant[i] === 0) { r = r * 0.6 + 180 * 0.4; g = g * 0.6 + 255 * 0.4; b = b * 0.6 + 120 * 0.4; }
    if (flags[i] & Sim.F_HOUSE) { r = w.houses.some(h => h.damaged && x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) ? 255 : 90; g = 50; b = 40; }
    if (flags[i] & Sim.F_SPRING) { r = 255; g = 255; b = 255; }
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const o = ((y * S + sy) * W * S + x * S + sx) * 4;
      // contour lines every 1 unit of height
      const edge = (sx === 0 || sy === 0) && Math.floor(ground[i]) !== Math.floor(ground[sx === 0 ? Math.max(i - 1, 0) : Math.max(i - W, 0)]);
      const cl = v => Math.max(0, Math.min(255, v));
      out[o] = cl(edge ? r * 0.7 : r); out[o + 1] = cl(edge ? g * 0.7 : g); out[o + 2] = cl(edge ? b * 0.7 : b); out[o + 3] = 255;
    }
  }
  return { w: W * S, h: H * S, data: out };
}

if (require.main === module) {
  const id = process.argv[2] || "ichimai";
  const seconds = Number(process.argv[3] || 30);
  const file = process.argv[4] || path.join(process.env.TMPDIR || "/tmp", "mizuho-" + id + ".png");
  const level = Levels.byId(id);
  const w = Sim.create(level);
  const script = process.argv.includes("--script");
  if (script) {
    const Play = require("../opus/script.js");
    Play.run(w, require("../opus/solutions.js")[id], { log: true });
  } else {
    for (let s = 0; s < seconds; s++) Sim.step(w, 1);
  }
  const img = render(w, 8);
  writePNG(file, img.w, img.h, img.data);
  console.log(file, "t=" + w.t.toFixed(2), "time=" + w.time.toFixed(1), "water=" + Sim.waterTotal(w).toFixed(1), "suitable=" + w.counts.suitable, "planted=" + w.counts.planted, "ripe=" + w.counts.ripe, "dead=" + w.counts.dead, "basket=" + w.basket.toFixed(1), "lost=" + w.lost.toFixed(1), JSON.stringify(Sim.result(w)));
}
module.exports = { render };
