// Procedural ink-wash painting for 句ゆき. Every static layer is pre-rendered
// to an offscreen canvas; the frame loop only blits them. Ridges come from
// KuSim.ridgeY, so neighbouring tiles share one continuous horizon.
(function () {
  "use strict";

  const TILE = 640;
  // Tiles abut without overlap, so their washes never double up at a seam.
  const PAD = 0;

  // Season palettes. far / mid / near are ridge washes; field is the meadow; ink is the brush.
  const PALETTE = {
    "春": { skyTop: "#f4ebe6", skyBottom: "#e9efe4", sun: "#f1cfc8", cloud: "#c9b7bc",
      far: ["#c7b6bd", "#a6b6ab"], mid: ["#a2b8a6", "#6f8e7b"], near: ["#7b9a84", "#4b6b57"],
      field: ["#cad8a9", "#9cb584"], road: "#8a7b68", ink: "#2a2f2c", tree: ["#eab6c3", "#b9cba9", "#f1d3da"], dot: "#e9a3b2" },
    "夏": { skyTop: "#e7ede9", skyBottom: "#dbe5e0", sun: "#f1e4c4", cloud: "#66747f",
      far: ["#7e9d98", "#587873"], mid: ["#4d6f69", "#2c4c48"], near: ["#345450", "#1c3836"],
      field: ["#6f8f58", "#48683a"], road: "#857a64", ink: "#14201e", tree: ["#2d4f45", "#3f6358", "#1f3c35"], dot: "#e2d27b" },
    "秋": { skyTop: "#f3e8d8", skyBottom: "#ecdcc0", sun: "#e7aa62", cloud: "#b99a79",
      far: ["#cba47a", "#a57a4f"], mid: ["#bb833f", "#8c5a2c"], near: ["#9b6b39", "#6c4a2a"],
      field: ["#c4a45a", "#9e8140"], road: "#8c7858", ink: "#2a2118", tree: ["#c4553b", "#d98f3d", "#8f6a2c"], dot: "#c4553b" },
    "冬": { skyTop: "#e6eaee", skyBottom: "#d9e0e7", sun: "#f2f4f5", cloud: "#8e9aa8",
      far: ["#b7c2cd", "#97a5b4"], mid: ["#8595a7", "#64768a"], near: ["#637486", "#44535f"],
      field: ["#e6ecf0", "#cad4dc"], road: "#7a8590", ink: "#1b2430", tree: ["#eef2f5", "#6f7f8f", "#dfe6ec"], dot: "#ffffff" }
  };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // A noise tile for paper grain, generated once and tiled as a pattern.
  let grain = null;
  function grainTile() {
    if (grain) return grain;
    const c = makeCanvas(160, 160);
    const g = c.getContext("2d");
    const rand = KuSim.mulberry32(9001);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rand() < 0.5 ? "rgba(40,32,24," + (0.01 + rand() * 0.025) + ")" : "rgba(255,255,255," + (0.04 + rand() * 0.06) + ")";
      const r = 0.4 + rand() * 1.1;
      g.beginPath();
      g.arc(rand() * 160, rand() * 160, r, 0, Math.PI * 2);
      g.fill();
    }
    grain = c;
    return c;
  }

  // One dry-brush hair: a few slightly offset passes that skip on the paper.
  function hair(ctx, x0, y0, x1, y1, width, color, alpha, rand) {
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    for (let p = 0; p < 2; p++) {
      ctx.globalAlpha = alpha * (0.45 + rand() * 0.55);
      ctx.lineWidth = width * (0.55 + rand() * 0.7);
      const jx = (rand() - 0.5) * width * 1.4;
      const jy = (rand() - 0.5) * width * 1.4;
      const mx = (x0 + x1) / 2 + (rand() - 0.5) * width * 3;
      const my = (y0 + y1) / 2 + (rand() - 0.5) * width * 3;
      ctx.beginPath();
      ctx.moveTo(x0 + jx, y0 + jy);
      ctx.quadraticCurveTo(mx + jx, my + jy, x1 + jx, y1 + jy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // A wash that bleeds: a soft gradient body plus faint offset copies at the edges.
  function wash(ctx, pts, top, bottom, alpha, yTop, yEnd, rand) {
    const grad = ctx.createLinearGradient(0, yTop, 0, yEnd);
    grad.addColorStop(0, rgba(top, 1));
    grad.addColorStop(0.6, rgba(bottom, 0.8));
    grad.addColorStop(1, rgba(bottom, 0));
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    // Bleed only along the crest. Stroking the closing sides would draw a seam at each tile edge.
    const crest = pts.slice(0, pts.length - 2);
    for (let b = 0; b < 3; b++) {
      ctx.save();
      ctx.translate((rand() - 0.5) * 2.4, (rand() - 0.5) * 1.6);
      ctx.globalAlpha = alpha * 0.16;
      ctx.lineWidth = 2.5 + rand() * 2;
      ctx.strokeStyle = rgba(top, 1);
      ctx.beginPath();
      crest.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function polyFrom(xs, fn, yBottom) {
    const pts = [];
    for (const x of xs) pts.push([x, fn(x)]);
    pts.push([xs[xs.length - 1], yBottom]);
    pts.push([xs[0], yBottom]);
    return pts;
  }

  // Sample columns always reach both tile edges, so no column is left empty.
  function ridgeXs(step) {
    const xs = [];
    for (let x = -PAD; x < TILE + PAD; x += step) xs.push(x);
    xs.push(TILE + PAD);
    return xs;
  }

  // A mountain band. layerX runs in parallax space; the tile covers [t*TILE - PAD, (t+1)*TILE + PAD].
  function ridgeTile(H, season, spec, tileIndex, scale) {
    const pal = PALETTE[season];
    // Only the band above the ground line is ever visible, so the canvas stops there.
    const cnv = makeCanvas((TILE + PAD * 2) * scale, H * 0.84 * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(spec.seed * 7919 + tileIndex * 104729 + season.charCodeAt(0));
    const originX = tileIndex * TILE - PAD;
    const base = spec.base * H;
    const amp = spec.amp * H;
    const yOf = x => KuSim.ridgeY(x + originX, spec.seed, base, amp, spec.scale) +
      (KuSim.noise1((x + originX) / 9, spec.seed + 3) - 0.5) * 3;
    const xs = ridgeXs(4);
    const pts = polyFrom(xs, yOf, H);
    wash(ctx, pts, pal[spec.tint][0], pal[spec.tint][1], spec.alpha, base - amp, H * spec.fade, rand);

    // Dry-brush hair along the crest, and a thin dark contour just under it.
    const hairs = Math.round(TILE * 0.32);
    for (let i = 0; i < hairs; i++) {
      const x = rand() * (TILE + PAD * 2) - PAD;
      const y = yOf(x) + rand() * 14;
      const slope = (yOf(x + 6) - yOf(x - 6)) / 12;
      const len = 14 + rand() * 24;
      hair(ctx, x, y, x + len, y + slope * len, 0.6 + rand() * 0.9, pal.ink, 0.035 + rand() * 0.07, rand);
    }
    ctx.strokeStyle = rgba(pal.ink, 0.16);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    xs.forEach((x, i) => {
      const y = yOf(x) + 1.5 + KuSim.noise1((x + originX) / 13, spec.seed + 9) * 2;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();

    if (spec.trees) {
      const trees = Math.round(TILE / 90);
      for (let i = 0; i < trees; i++) {
        const x = rand() * TILE;
        const y = yOf(x) + 4 + rand() * 8;
        const r = 7 + rand() * 9;
        for (let d = 0; d < 9; d++) {
          ctx.fillStyle = rgba(pal.tree[Math.floor(rand() * pal.tree.length)], 0.5 + rand() * 0.3);
          ctx.beginPath();
          ctx.ellipse(x + (rand() - 0.5) * r * 2.2, y - rand() * r * 0.9, r * (0.35 + rand() * 0.3), r * (0.22 + rand() * 0.18), rand() * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = rgba(pal.ink, 0.3);
        hair(ctx, x, y, x + (rand() - 0.5) * 2, y + r * 1.1, 1.1, pal.ink, 0.5, rand);
      }
    }

    // Atmospheric haze at the foot of each band so that layers recede.
    const haze = ctx.createLinearGradient(0, H * 0.58, 0, H * 0.74);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(0.6, "rgba(246,242,234," + (0.22 * spec.haze) + ")");
    haze.addColorStop(1, "rgba(246,242,234,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(-PAD, H * 0.58, TILE + PAD * 2, H * 0.16);
    return cnv;
  }

  // The meadow band between the last ridge and the road.
  function fieldTile(H, season, tileIndex, scale, top, ground) {
    const pal = PALETTE[season];
    const cnv = makeCanvas((TILE + PAD * 2) * scale, (ground + 24) * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(5003 + tileIndex * 7177 + season.charCodeAt(0));
    const xs = ridgeXs(12);
    const bandTop = top;
    const pts = [];
    for (const x of xs) pts.push([x, bandTop + (KuSim.noise1((x + tileIndex * TILE) / 60, 61) - 0.5) * 6]);
    pts.push([xs[xs.length - 1], ground + 20]);
    pts.push([xs[0], ground + 20]);
    wash(ctx, pts, pal.field[0], pal.field[1], 0.5, bandTop - 8, ground + 20, rand);
    const strokes = Math.round(TILE * 0.32);
    for (let i = 0; i < strokes; i++) {
      const x = rand() * (TILE + PAD * 2) - PAD;
      const y = bandTop + rand() * (ground - bandTop);
      const len = 4 + rand() * 7;
      hair(ctx, x, y, x + (rand() - 0.5) * 3, y - len, 0.5 + rand() * 0.5, pal.ink, 0.04 + rand() * 0.06, rand);
    }
    const dots = Math.round(TILE / 22);
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = rgba(pal.dot, 0.45 + rand() * 0.35);
      ctx.beginPath();
      ctx.arc(rand() * (TILE + PAD * 2) - PAD, bandTop + rand() * (ground - bandTop), 1.2 + rand() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    return cnv;
  }

  // Foreground tufts below the road. They sit at parallax 1 and give the lower
  // third some texture instead of an empty wash.
  function foreTile(H, season, tileIndex, scale, ground) {
    const pal = PALETTE[season];
    const band = Math.max(40, H - ground);
    const cnv = makeCanvas(TILE * scale, band * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(9311 + tileIndex * 53 + season.charCodeAt(0));
    for (let i = 0; i < 46; i++) {
      const x = rand() * TILE;
      const y = 6 + rand() * (band - 8);
      const len = 6 + rand() * 12 * (0.4 + y / band);
      hair(ctx, x, y, x + (rand() - 0.5) * 8, y - len, 0.6 + rand() * 0.8, pal.ink, 0.06 + rand() * 0.08, rand);
    }
    for (let i = 0; i < 9; i++) {
      const x = rand() * TILE;
      const y = 14 + rand() * (band - 18);
      ctx.fillStyle = rgba(pal.ink, 0.08 + rand() * 0.06);
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + rand() * 6, 1.5 + rand() * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return cnv;
  }

  // The road ribbon, drawn in world space at parallax 1.
  // Local y is 45 at the ground line, so the canvas is placed at (ground - 45).
  function roadTile(season, tileIndex, scale) {
    const pal = PALETTE[season];
    const width = TILE;
    const cnv = makeCanvas(width * scale, 90 * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(8101 + tileIndex * 31 + season.charCodeAt(0));
    const originX = tileIndex * TILE;
    const yOf = x => 45 + (KuSim.noise1((x + originX) / 140, 77) - 0.5) * 8;
    const top = [];
    const bottom = [];
    for (let x = 0; x < width; x += 6) {
      const y = yOf(x);
      top.push([x, y - 9 - rand() * 2]);
      bottom.push([x, y + 12 + rand() * 3]);
    }
    const yEnd = yOf(width);
    top.push([width, yEnd - 9]);
    bottom.push([width, yEnd + 12]);
    const pts = top.concat(bottom.reverse());
    ctx.fillStyle = rgba(pal.road, 0.42);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    // Worn centre of the path, and dark ink along both edges.
    ctx.fillStyle = rgba("#f4eee2", 0.35);
    ctx.beginPath();
    ctx.moveTo(0, 46);
    for (let x = 0; x <= width; x += 6) ctx.lineTo(x, yOf(x) + 2 + KuSim.noise1((x + originX) / 30, 5) * 2);
    ctx.lineTo(width, yOf(width) + 6);
    ctx.lineTo(0, 46);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.ink, 0.32);
    ctx.lineWidth = 1;
    for (const edge of [top, bottom]) {
      ctx.beginPath();
      edge.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = rand() * width;
      const y = yOf(x) + rand() * 9;
      ctx.fillStyle = rgba(pal.ink, 0.22);
      ctx.beginPath();
      ctx.ellipse(x, y, 1 + rand() * 1.6, 0.8 + rand() * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return cnv;
  }

  // The sky with a sun or moon, cloud washes and paper grain. Opaque, drawn at viewport size.
  function skyCanvas(W, H, season, scale) {
    const pal = PALETTE[season];
    const cnv = makeCanvas(W * scale, H * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(1337 + season.charCodeAt(0));
    // Lower ground tone, so the foreground settles into the paper.
    const land = ctx.createLinearGradient(0, H * 0.8, 0, H);
    land.addColorStop(0, rgba(pal.field[1], 0.22));
    land.addColorStop(1, rgba(pal.skyBottom, 0.85));
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = land;
    ctx.fillRect(0, H * 0.8, W, H * 0.2);
    const sunR = Math.max(26, Math.min(W, H) * 0.075);
    const sx = W * 0.78;
    const sy = H * 0.2;
    const halo = ctx.createRadialGradient(sx, sy, sunR * 0.4, sx, sy, sunR * 3.4);
    halo.addColorStop(0, rgba(pal.sun, 0.55));
    halo.addColorStop(1, rgba(pal.sun, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(pal.sun, season === "夏" ? 0.7 : 0.82);
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.fill();
    const clouds = season === "夏" ? 9 : 5;
    for (let i = 0; i < clouds; i++) {
      const cx = rand() * W;
      const cy = H * (0.08 + rand() * 0.32);
      const dark = season === "夏" && i % 3 === 0;
      const rx = (dark ? 120 : 70) + rand() * (dark ? 120 : 80);
      const ry = (dark ? 26 : 12) + rand() * 10;
      ctx.fillStyle = rgba(pal.cloud, dark ? 0.32 : 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, (rand() - 0.5) * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    if (season === "春") {
      const mist = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.5);
      mist.addColorStop(0, "rgba(250,244,240,0)");
      mist.addColorStop(0.5, "rgba(250,244,240,0.55)");
      mist.addColorStop(1, "rgba(250,244,240,0)");
      ctx.fillStyle = mist;
      ctx.fillRect(0, H * 0.25, W, H * 0.25);
    }
    if (season === "冬") {
      ctx.fillStyle = "rgba(245,247,249,0.35)";
      ctx.fillRect(0, 0, W, H * 0.4);
    }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ctx.createPattern(grainTile(), "repeat");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // The vignette is baked in here, so the frame loop does not blit it again.
    ctx.fillStyle = vignetteGradient(ctx, W, H);
    ctx.fillRect(0, 0, W, H);
    return cnv;
  }

  // Inn silhouette with a vertical signboard. Drawn once per 宿.
  function innSprite(name, season, scale) {
    const W = 230;
    const H = 210;
    const cnv = makeCanvas(W * scale, H * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const pal = PALETTE[season];
    const rand = KuSim.mulberry32(4444 + name.length * 13);
    // Walls and shadow.
    ctx.fillStyle = "rgba(240,233,216,0.96)";
    ctx.fillRect(40, 96, 150, 96);
    ctx.fillStyle = rgba(pal.ink, 0.12);
    ctx.fillRect(40, 176, 150, 14);
    // Roof with curved eaves.
    ctx.fillStyle = rgba(pal.ink, 0.92);
    ctx.beginPath();
    ctx.moveTo(14, 98);
    ctx.quadraticCurveTo(60, 64, 115, 58);
    ctx.quadraticCurveTo(170, 64, 216, 98);
    ctx.quadraticCurveTo(190, 84, 160, 88);
    ctx.lineTo(70, 88);
    ctx.quadraticCurveTo(40, 84, 14, 98);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(pal.ink, 0.5);
    ctx.fillRect(34, 90, 162, 9);
    // Pillars and a dark doorway with a warm glow.
    ctx.fillStyle = rgba(pal.ink, 0.8);
    ctx.fillRect(44, 96, 6, 96);
    ctx.fillRect(180, 96, 6, 96);
    ctx.fillStyle = "rgba(38,30,24,0.9)";
    ctx.fillRect(96, 130, 46, 62);
    ctx.fillStyle = "rgba(246,198,120,0.5)";
    ctx.fillRect(100, 136, 38, 56);
    // Lattice windows.
    ctx.strokeStyle = rgba(pal.ink, 0.5);
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.strokeRect(56 + i * 16, 112, 12, 12);
      ctx.strokeRect(134 + i * 8, 112, 6, 12);
    }
    // Hanging sign with the inn name written top to bottom.
    ctx.fillStyle = "rgba(246,240,226,0.97)";
    ctx.fillRect(18, 66, 22, 118);
    ctx.strokeStyle = rgba(pal.ink, 0.6);
    ctx.strokeRect(18.5, 66.5, 21, 117);
    ctx.fillStyle = rgba(pal.ink, 0.9);
    ctx.font = "600 13px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','IPAMincho','IPAGothic',serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = Array.from(name);
    chars.forEach((ch, i) => ctx.fillText(ch, 29, 78 + i * 15));
    // Two brush strokes for a pine beside the eave.
    hair(ctx, 206, 120, 214, 176, 1.4, pal.ink, 0.5, rand);
    hair(ctx, 210, 138, 222, 150, 1.0, pal.ink, 0.4, rand);
    return cnv;
  }

  // A pale ink bloom used when a 宿 clears.
  function bloomSprite(season, scale) {
    const size = 360;
    const cnv = makeCanvas(size * scale, size * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const pal = PALETTE[season];
    const rand = KuSim.mulberry32(777 + season.charCodeAt(0));
    for (let r = 0; r < 6; r++) {
      const rad = 60 + r * 22 + rand() * 12;
      const grad = ctx.createRadialGradient(size / 2, size / 2, rad * 0.7, size / 2, size / 2, rad);
      grad.addColorStop(0, rgba(pal.ink, 0));
      grad.addColorStop(0.8, rgba(pal.ink, 0.05 + 0.02 * (6 - r)));
      grad.addColorStop(1, rgba(pal.ink, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    return cnv;
  }

  // A red seal (落款) with two or three glyphs written top to bottom.
  function sealCanvas(text, scale) {
    const size = 84;
    const cnv = makeCanvas(size * scale, size * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(KuSim.hashText(text));
    ctx.fillStyle = "rgba(184,58,50,0.92)";
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 36 + (rand() - 0.5) * 2.4;
      const x = size / 2 + Math.cos(a) * r * 0.92;
      const y = size / 2 + Math.sin(a) * r * 0.92;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,246,236,0.94)";
    ctx.font = "700 20px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','IPAMincho','IPAGothic',serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    Array.from(text).forEach((ch, i, all) => {
      const step = all.length === 2 ? 22 : 18;
      ctx.fillText(ch, size / 2, size / 2 + (i - (all.length - 1) / 2) * step);
    });
    return cnv;
  }

  // Ink mist that hides the road past the frontier 宿.
  function mistSprite(W, H, scale) {
    const cnv = makeCanvas(W * scale, H * scale);
    const ctx = cnv.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const rand = KuSim.mulberry32(616);
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "rgba(243,238,228,0)");
    grad.addColorStop(0.16, "rgba(243,238,228,0.84)");
    grad.addColorStop(1, "rgba(243,238,228,0.92)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = "rgba(90,96,100," + (0.02 + rand() * 0.04) + ")";
      ctx.beginPath();
      ctx.ellipse(rand() * W, rand() * H, 80 + rand() * 180, 14 + rand() * 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return cnv;
  }

  function vignetteGradient(ctx, W, H) {
    const grad = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    grad.addColorStop(0, "rgba(30,24,18,0)");
    grad.addColorStop(1, "rgba(30,24,18,0.14)");
    return grad;
  }

  const API = {
    TILE: TILE,
    PAD: PAD,
    PALETTE: PALETTE,
    rgba: rgba,
    makeCanvas: makeCanvas,
    ridgeTile: ridgeTile,
    fieldTile: fieldTile,
    roadTile: roadTile,
    foreTile: foreTile,
    skyCanvas: skyCanvas,
    innSprite: innSprite,
    bloomSprite: bloomSprite,
    sealCanvas: sealCanvas,
    mistSprite: mistSprite,
    hair: hair
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.KuPaint = API;
})();
