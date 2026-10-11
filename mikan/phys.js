/* 蜜柑の夜。描画も入力も持たない。ゲームとテストが同じ落下を使う。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Mikan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DT = 1 / 120;
  const GRAVITY = 1100;
  const ITER = 12;
  const REST = 0.04;
  const SLOP = 0.35;
  const SLEEP = 8;
  const MAX_DROP_STEPS = 720;
  const AIR = 0.015;

  function segments(level, time) {
    const omega = level.omega || 1.6;
    const lift = (level.breath || 0) * Math.max(0, Math.sin(time * omega));
    const peak = 0.5 + (level.wander || 0) * Math.sin(time * omega * 0.5);
    const x0 = level.x0, x1 = level.x1, top = level.top;
    const samples = 12;
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = x0 + (x1 - x0) * t;
      const hill = Math.exp(-((t - peak) * (t - peak)) / 0.08);
      const tilt = (level.tilt || 0) * (t - 0.5);
      const dip = (level.dip || 0) * Math.sin(Math.PI * t);
      pts.push({ x: x, y: top - lift * hill + tilt + dip });
    }
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push(makeSeg(pts[i], pts[i + 1], "top"));
    const hang = level.hang, drop = level.hangDrop;
    segs.push(makeSeg({ x: x0, y: top }, { x: x0 - hang, y: top + drop }, "hang"));
    segs.push(makeSeg({ x: x1, y: top }, { x: x1 + hang, y: top + drop }, "hang"));
    segs.push(makeSeg({ x: x0, y: top }, { x: x0, y: top + level.thick }, "side"));
    segs.push(makeSeg({ x: x1, y: top + level.thick }, { x: x1, y: top }, "side"));
    segs.push(makeSeg({ x: level.floorX0, y: level.floor }, { x: level.floorX1, y: level.floor }, "floor"));
    return segs;
  }

  function makeSeg(a, b, kind) {
    const dx = b.x - a.x, dy = b.y - a.y;
    let nx = -dy, ny = dx;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if ((kind === "top" || kind === "hang" || kind === "floor") && ny > 0) {
      nx = -nx; ny = -ny;
    }
    const friction = kind === "hang" ? 0.04 : kind === "floor" ? 0.45 : 0.18;
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, nx: nx, ny: ny, kind: kind, friction: friction };
  }

  function spawnY(bodies, x, r, level) {
    let y = r + 6;
    if (level && level.bulb) y = Math.max(y, level.bulb.y + level.bulb.r + r + 8);
    bodies.forEach(body => {
      if (body.lost || body.singed) return;
      if (Math.abs(body.x - x) < body.r + r + 1) y = Math.min(y, body.y - body.r - r - 3);
    });
    return y;
  }

  function dropBody(bodies, x, r, level) {
    bodies.push({
      x: x, y: spawnY(bodies, x, r, level), vx: 0, vy: 0, r: r,
      m: r * r, lost: false, singed: false
    });
  }

  function asleep(bodies) {
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.lost) continue;
      if (body.vx * body.vx + body.vy * body.vy > SLEEP * SLEEP) return false;
    }
    return true;
  }

  function separatePair(a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (dist >= min) return null;
    if (dist < 1e-6) { dx = 1; dy = 0; dist = 1; }
    const nx = dx / dist, ny = dy / dist;
    const corr = Math.max(0, min - dist - SLOP);
    const inv = 1 / a.m + 1 / b.m;
    a.x -= nx * corr * (1 / a.m) / inv;
    a.y -= ny * corr * (1 / a.m) / inv;
    b.x += nx * corr * (1 / b.m) / inv;
    b.y += ny * corr * (1 / b.m) / inv;
    return { nx: nx, ny: ny };
  }

  function bouncePair(a, b, hit) {
    const nx = hit.nx, ny = hit.ny;
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    const inv = 1 / a.m + 1 / b.m;
    if (rel < 0) {
      const j = -(1 + REST) * rel / inv;
      a.vx -= j * nx / a.m;
      a.vy -= j * ny / a.m;
      b.vx += j * nx / b.m;
      b.vy += j * ny / b.m;
    }
    const tx = -ny, ty = nx;
    const relT = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    const stick = Math.abs(ny) > 0.78 && Math.abs(relT) < 50;
    const jt = stick ? -relT / inv : Math.max(-0.45, Math.min(0.45, -relT / inv));
    a.vx -= jt * tx / a.m;
    a.vy -= jt * ty / a.m;
    b.vx += jt * tx / b.m;
    b.vy += jt * ty / b.m;
    if (ny > 0.82) a.flat = true;
    if (ny < -0.82) b.flat = true;
  }

  function separateSegment(body, seg) {
    const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((body.x - seg.x1) * dx + (body.y - seg.y1) * dy) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    const cx = seg.x1 + dx * t, cy = seg.y1 + dy * t;
    const ox = body.x - cx, oy = body.y - cy;
    const dist = Math.hypot(ox, oy);
    if (dist >= body.r + 0.8) return null;
    const nx = seg.nx, ny = seg.ny;
    const pen = body.r - dist;
    if (pen > 0) { body.x += nx * pen; body.y += ny * pen; }
    return { nx: nx, ny: ny, friction: seg.friction, kind: seg.kind };
  }

  function bounceSegment(body, hit) {
    const nx = hit.nx, ny = hit.ny;
    const vn = body.vx * nx + body.vy * ny;
    if (vn < 0) {
      body.vx -= (1 + REST) * vn * nx;
      body.vy -= (1 + REST) * vn * ny;
    }
    const tx = -ny, ty = nx;
    const vt = body.vx * tx + body.vy * ty;
    const cap = hit.friction * GRAVITY * Math.abs(ny) * DT;
    const hold = Math.abs(ty) < 0.07 && Math.abs(vt) < 60;
    const remove = hold ? vt : Math.sign(vt) * Math.min(Math.abs(vt), cap);
    body.vx -= remove * tx;
    body.vy -= remove * ty;
    if (hit.kind === "floor") body.lost = true;
    if (ny < -0.993) body.flat = true;
  }

  function shoveBulb(body, bulb) {
    if (!bulb || body.singed || body.lost) return;
    let dx = body.x - bulb.x, dy = body.y - bulb.y;
    let dist = Math.hypot(dx, dy);
    const min = body.r + bulb.r;
    if (dist >= min) return;
    if (dist < 1e-4) { dx = 0; dy = 1; dist = 1; }
    const nx = dx / dist, ny = dy / dist;
    body.x += nx * (min - dist + 2);
    body.y += ny * (min - dist + 2);
    body.vx = nx * 140;
    body.vy = ny * 40;
    body.singed = true;
  }

  function step(bodies, level, time) {
    bodies.forEach(body => {
      if (body.lost) return;
      body.flat = false;
      body.vy += GRAVITY * DT;
      body.vx *= 1 - AIR;
      body.vy *= 1 - AIR;
      body.x += body.vx * DT;
      body.y += body.vy * DT;
    });
    const segs = segments(level, time + DT);
    const hits = [];
    for (let n = 0; n < ITER; n++) {
      hits.length = 0;
      for (let i = 0; i < bodies.length; i++) {
        if (bodies[i].lost) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          if (bodies[j].lost || bodies[i].singed || bodies[j].singed) continue;
          const hit = separatePair(bodies[i], bodies[j]);
          if (hit && n === ITER - 1) hits.push(["pair", i, j, hit]);
        }
        for (let s = 0; s < segs.length; s++) {
          if (bodies[i].singed && segs[s].kind !== "floor") continue;
          const hit = separateSegment(bodies[i], segs[s]);
          if (hit && n === ITER - 1) hits.push(["seg", i, hit]);
        }
        if (n === ITER - 1) shoveBulb(bodies[i], level.bulb);
      }
    }
    hits.forEach(hit => {
      if (hit[0] === "pair") bouncePair(bodies[hit[1]], bodies[hit[2]], hit[3]);
      else bounceSegment(bodies[hit[1]], hit[2]);
    });
    bodies.forEach(body => {
      if (body.lost) return;
      if (body.y > level.floor - body.r + 0.5) body.lost = true;
      const speed = body.vx * body.vx + body.vy * body.vy;
      if (body.flat && speed < 4 * 4) { body.vx = 0; body.vy = 0; }
    });
  }

  function settle(bodies, level, time, limit) {
    let calm = 0;
    let t = time;
    const steps = limit || MAX_DROP_STEPS;
    for (let i = 0; i < steps; i++) {
      step(bodies, level, t);
      t += DT;
      if (asleep(bodies)) {
        calm += 1;
        if (calm > 18) break;
      } else calm = 0;
    }
    return t;
  }

  function simulate(level, drops) {
    const bodies = [];
    let time = 0;
    (drops || []).forEach(drop => {
      dropBody(bodies, drop.x, drop.r, level);
      time = settle(bodies, level, time, MAX_DROP_STEPS);
    });
    if (level.breath) {
      const period = Math.PI * 2 / (level.omega || 1.6);
      const end = time + period * 2;
      while (time < end) {
        step(bodies, level, time);
        time += DT;
      }
      time = settle(bodies, level, time, 360);
    }
    const kept = bodies.filter(body => onTable(body, level));
    return {
      bodies: bodies,
      kept: kept.length,
      lost: bodies.length - kept.length,
      asleep: asleep(bodies),
      ok: kept.length >= level.goal && bodies.length - kept.length === 0
    };
  }

  function onTable(body, level) {
    return !body.lost && !body.singed && body.x >= level.x0 && body.x <= level.x1 && body.y + body.r < level.floor - 4;
  }

  function normalize(level) {
    return {
      x0: level.x0, x1: level.x1, top: level.top,
      thick: level.thick || 24,
      floor: level.floor,
      floorX0: level.floorX0, floorX1: level.floorX1,
      hang: level.hang || 52,
      hangDrop: level.hangDrop || 78,
      breath: level.breath || 0,
      omega: level.omega || 1.7,
      goal: level.goal
    };
  }

  return {
    DT: DT,
    segments: segments,
    step: step,
    settle: settle,
    simulate: simulate,
    dropBody: dropBody,
    asleep: asleep,
    onTable: onTable,
    normalize: normalize
  };
});
