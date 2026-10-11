/* 折光室の光学。描画も入力も持たない。ゲームとテストが同じ規則を使う。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Oriko = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const R = 1, G = 2, B = 4, WHITE = 7;
  const LENGTH = { mirror: 22, dye: 16, split: 14, wall: 0 };
  const SPLIT = 0.42;

  function maskOf(need) {
    if (need === "r") return R;
    if (need === "g") return G;
    if (need === "b") return B;
    return WHITE;
  }

  function pieceName(type, mask) {
    if (type === "mirror") return "鏡";
    if (type === "split") return "分かつ";
    if (type === "dye" && mask === R) return "紅";
    if (type === "dye" && mask === G) return "翠";
    if (type === "dye" && mask === B) return "青";
    return "硝子";
  }

  function segmentOf(piece) {
    const half = (piece.length || LENGTH[piece.type] || 16) / 2;
    const tangent = piece.rot + Math.PI / 2;
    const tx = Math.cos(tangent), ty = Math.sin(tangent);
    return {
      x1: piece.x - tx * half, y1: piece.y - ty * half,
      x2: piece.x + tx * half, y2: piece.y + ty * half,
      type: piece.type, mask: piece.mask || 0, rot: piece.rot, fixed: !!piece.fixed
    };
  }

  function hitSegment(ox, oy, dx, dy, seg) {
    const rx = seg.x2 - seg.x1, ry = seg.y2 - seg.y1;
    const den = dx * ry - dy * rx;
    if (Math.abs(den) < 1e-8) return null;
    const qx = seg.x1 - ox, qy = seg.y1 - oy;
    const t = (qx * ry - qy * rx) / den;
    const u = (qx * dy - qy * dx) / den;
    if (t > 0.05 && u >= -0.001 && u <= 1.001) return t;
    return null;
  }

  function plantAlong(ox, oy, dx, dy, limit, plant) {
    const t = (plant.x - ox) * dx + (plant.y - oy) * dy;
    if (t < -0.01 || t > limit + 0.01) return false;
    const px = ox + dx * t, py = oy + dy * t;
    const ddx = px - plant.x, ddy = py - plant.y;
    return ddx * ddx + ddy * ddy <= plant.r * plant.r + 0.01;
  }

  function colorOk(need, colors) {
    if (need === "w" || need === "gold") return colors.indexOf(WHITE) >= 0;
    const exact = maskOf(need);
    return colors.indexOf(exact) >= 0;
  }

  function trace(level, placed, angleOffset) {
    const segs = [];
    (level.walls || []).forEach(wall => segs.push({
      x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, type: "wall", rot: 0, mask: 0, fixed: true
    }));
    (level.fixed || []).concat(placed || []).forEach(piece => segs.push(segmentOf(piece)));
    const seen = level.plants.map(() => []);
    const beams = [];
    const source = level.source;
    const angle = source.a + (angleOffset || 0);
    const dx = Math.cos(angle), dy = Math.sin(angle);

    function march(x, y, dirX, dirY, color, depth) {
      if (depth > 8 || !color) return;
      let best = null, bestT = 260;
      for (let i = 0; i < segs.length; i++) {
        const t = hitSegment(x, y, dirX, dirY, segs[i]);
        if (t != null && t < bestT) { bestT = t; best = segs[i]; }
      }
      const limit = Math.min(bestT, 260);
      for (let i = 0; i < level.plants.length; i++) {
        if (plantAlong(x, y, dirX, dirY, limit, level.plants[i])) seen[i].push(color);
      }
      const reach = best ? bestT : Math.min(260, Math.hypot(level.w, level.h));
      beams.push({ x1: x, y1: y, x2: x + dirX * reach, y2: y + dirY * reach, color: color });
      if (!best) return;
      const hx = x + dirX * bestT, hy = y + dirY * bestT;
      if (best.type === "wall") return;
      if (best.type === "mirror") {
        let nx = Math.cos(best.rot), ny = Math.sin(best.rot);
        let dot = dirX * nx + dirY * ny;
        if (dot > 0) { nx = -nx; ny = -ny; dot = -dot; }
        const rx = dirX - 2 * dot * nx, ry = dirY - 2 * dot * ny;
        const len = Math.hypot(rx, ry) || 1;
        march(hx + rx / len * 0.45, hy + ry / len * 0.45, rx / len, ry / len, color, depth + 1);
        return;
      }
      if (best.type === "dye") {
        const next = color & best.mask;
        if (!next) return;
        march(hx + dirX * 0.45, hy + dirY * 0.45, dirX, dirY, next, depth + 1);
        return;
      }
      if (best.type === "split") {
        const base = Math.atan2(dirY, dirX);
        [SPLIT, -SPLIT].forEach(delta => {
          const a = base + delta;
          const ndx = Math.cos(a), ndy = Math.sin(a);
          march(hx + ndx * 0.55, hy + ndy * 0.55, ndx, ndy, color, depth + 1);
        });
      }
    }

    march(source.x, source.y, dx, dy, WHITE, 0);
    const ok = level.plants.every((plant, index) => colorOk(plant.need, seen[index]));
    return { beams: beams, seen: seen, ok: ok };
  }

  function samples(level) {
    const sweep = level.source.sweep || 0;
    return sweep ? [-sweep, 0, sweep] : [0];
  }

  function holds(level, placed) {
    return samples(level).every(offset => trace(level, placed, offset).ok);
  }

  function sampleReport(level, placed) {
    return samples(level).map(offset => trace(level, placed, offset).ok);
  }

  return {
    R: R, G: G, B: B, WHITE: WHITE, LENGTH: LENGTH,
    maskOf: maskOf, pieceName: pieceName, segmentOf: segmentOf,
    trace: trace, holds: holds, samples: samples, sampleReport: sampleReport, colorOk: colorOk
  };
});
