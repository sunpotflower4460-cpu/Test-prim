/*
 * 鳴き井戸 pure simulation. No DOM, no rendering, no wall clock, no unseeded randomness.
 * Every random choice draws from the seeded state.rng, so a fixed seed and a
 * fixed input sequence always produce the same run.
 *
 * Coordinates: world units are metres. Cell (x, y) covers [x, x+1] x [y, y+1].
 * Yaw 0 looks toward -y (north). forward = (-sin yaw, -cos yaw).
 */
(function () {
  "use strict";

  const C = {
    R_PLAYER: 0.25,
    R_ENT: 0.3,
    CAPTURE: 1.1,
    SIGHT_HALF: (50 * Math.PI) / 180,
    BEAM_HALF: 0.45,
    BEAM_RANGE: 14,
    FREEZE_RANGE: 8,
    DARK_SEE: 3.0,
    MOON_SEE: 9,
    BATTERY_SECONDS: 240,
    FLICKER_AT: 0.2,
    WALK: 2.1,
    RUN: 4.0,
    STAMINA_DRAIN: 0.13,
    STAMINA_REGEN: 0.16,
    ENT_SPEED: 1.05,
    ENT_ANGER_STEP: 0.15,
    ENT_NOISE_BOOST: 1.2,
    ENT_STUN_SPEED: 2.4,
    NOISE_DECAY: 0.35,
    SHOT_RANGE: 9,
    SHOT_SPREAD: 0.06,
    STUN_MIN: 6,
    STUN_MAX: 8,
    FREEZE_MIN: 1.5,
    FREEZE_MAX: 2.5,
    CALL_RANGE: 9,
    CALL_WAIT: 6,
    CALL_GAP_MIN: 26,
    CALL_GAP_MAX: 38,
    RESPAWN_TIME: 1.6,
    GRACE: 25,
    DOOR_WAIT: 1.1,
    SEAL_DAWN: 7,
    SHELL_MAX: 12,
    BATTERY_MAX: 9,
    PUSH_BACK: 2,
    WALL_T: 0.08,
    DOOR_T: 0.1
  };

  const EDGE_WALL = 0;
  const EDGE_OPEN = 1;
  const EDGE_DOOR = 2;
  // Direction index: 0 N, 1 E, 2 S, 3 W.
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DIR_INDEX = { N: 0, E: 1, S: 2, W: 3 };
  const OPP = [2, 3, 0, 1];
  const FUDA_IDS = ["fuda-1", "fuda-2", "fuda-3"];
  const DIARY_IDS = ["diary-1", "diary-2", "diary-3"];

  // ---------- seeded random ----------

  // mulberry32-style step. Mutates s.rng and returns a float in [0, 1).
  function rnd(s) {
    s.rng = (s.rng + 0x6d2b79f5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function rndRange(s, a, b) {
    return a + (b - a) * rnd(s);
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function round(v, n) {
    const k = Math.pow(10, n || 3);
    return Math.round(v * k) / k;
  }

  // ---------- world ----------

  function buildWorld(level) {
    const rows = level.rows;
    const H = rows.length;
    const W = rows[0].length;
    for (let y = 0; y < H; y++) {
      if (rows[y].length !== W) throw new Error("row " + y + " has length " + rows[y].length);
    }
    const N = W * H;
    const cells = new Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = rows[y][x];
        if (ch === "#") {
          cells[y * W + x] = null;
          continue;
        }
        const g = level.glyphs[ch];
        if (!g) throw new Error("unknown glyph " + ch + " at " + x + "," + y);
        cells[y * W + x] = {
          x, y, idx: y * W + x,
          room: g.room,
          floor: g.floor,
          solid: !!g.solid,
          walk: !g.solid
        };
      }
    }
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : cells[y * W + x]);
    const isWalk = (x, y) => {
      const c = at(x, y);
      return !!(c && c.walk);
    };

    // Neighbour index for each walkable cell and direction, or -1.
    const nb = new Int32Array(N * 4).fill(-1);
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      if (!c || !c.walk) continue;
      for (let d = 0; d < 4; d++) {
        const n = at(c.x + DIRS[d][0], c.y + DIRS[d][1]);
        if (n && n.walk) nb[i * 4 + d] = n.idx;
      }
    }

    const edge = new Uint8Array(N * 4).fill(EDGE_WALL);
    const edgeDoor = new Int16Array(N * 4).fill(-1);
    const openPair = (a, b) =>
      (level.openPairs || []).some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));

    const doors = [];
    (level.doors || []).forEach((d, i) => {
      const dir = DIR_INDEX[d.dir];
      const [dx, dy] = DIRS[dir];
      if (!isWalk(d.x, d.y) || !isWalk(d.x + dx, d.y + dy)) {
        throw new Error("door " + d.id + " is not between two walkable cells");
      }
      const cx = d.x + 0.5 + dx * 0.5;
      const cy = d.y + 0.5 + dy * 0.5;
      const T = C.DOOR_T;
      const aabb = dir % 2 === 1
        ? [cx - T, d.y, cx + T, d.y + 1]
        : [d.x, cy - T, d.x + 1, cy + T];
      const a = d.y * W + d.x;
      const b = (d.y + dy) * W + (d.x + dx);
      doors.push({
        id: d.id, index: i, kind: d.kind, dir: d.dir,
        x: d.x, y: d.y, a, b, cx, cy, aabb,
        defaultOpen: !!d.open
      });
      edge[a * 4 + dir] = EDGE_DOOR;
      edgeDoor[a * 4 + dir] = i;
      edge[b * 4 + OPP[dir]] = EDGE_DOOR;
      edgeDoor[b * 4 + OPP[dir]] = i;
    });

    // Walls: one segment per blocked edge between a walkable cell and a non-walkable
    // neighbour, or between two walkable cells of different rooms.
    const walls = [];
    const wallBoxes = [];
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      if (!c || !c.walk) continue;
      for (let d = 0; d < 4; d++) {
        const n = at(c.x + DIRS[d][0], c.y + DIRS[d][1]);
        const k = i * 4 + d;
        if (edge[k] === EDGE_DOOR) continue;
        if (n && n.walk) {
          if (n.room === c.room || openPair(n.room, c.room)) {
            edge[k] = EDGE_OPEN;
            continue;
          }
          edge[k] = EDGE_WALL;
          // Create the segment once, from the east or south side.
          if (d === 1 || d === 2) {
            pushWall(c, n, d);
          }
          continue;
        }
        edge[k] = EDGE_WALL;
        if (n && n.solid) continue; // The well box covers this side.
        pushWall(c, null, d);
      }
    }

    function pushWall(c, n, d) {
      const vertical = d % 2 === 1;
      let seg;
      if (vertical) {
        const X = d === 1 ? c.x + 1 : c.x;
        seg = { x0: X, y0: c.y, x1: X, y1: c.y + 1 };
      } else {
        const Y = d === 2 ? c.y + 1 : c.y;
        seg = { x0: c.x, y0: Y, x1: c.x + 1, y1: Y };
      }
      let kind;
      if (!n) {
        kind = c.room === "garden" ? "fence" : c.room === "kura" ? "kura" : "outer";
      } else if (c.room === "kura" || n.room === "kura") {
        kind = "kura";
      } else {
        kind = "partition";
      }
      seg.kind = kind;
      seg.vertical = vertical;
      seg.height = kind === "fence" ? 1.6 : 2.6;
      walls.push(seg);
      const T = C.WALL_T;
      const box = vertical
        ? [seg.x0 - T, seg.y0, seg.x0 + T, seg.y1]
        : [seg.x0, seg.y0 - T, seg.x1, seg.y0 + T];
      wallBoxes.push(box);
    }

    const colliders = wallBoxes.slice();
    let well = null;
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      if (c && c.solid) {
        colliders.push([c.x + 0.12, c.y + 0.12, c.x + 0.88, c.y + 0.88]);
        well = { x: c.x + 0.5, y: c.y + 0.5, cell: c.idx };
      }
    }

    const props = (level.props || []).map((p, i) => {
      const t = level.propTypes[p.type];
      if (!t) throw new Error("unknown prop " + p.type);
      const q = { index: i, type: p.type, x: p.x, y: p.y, face: p.face || "S", dims: t, interact: p.interact || null, sound: p.sound || null };
      const ew = q.face === "E" || q.face === "W";
      q.hx = ew ? t.d / 2 : t.w / 2;
      q.hy = ew ? t.w / 2 : t.d / 2;
      if (t.solid) {
        colliders.push([p.x - q.hx, p.y - q.hy, p.x + q.hx, p.y + q.hy]);
      }
      return q;
    });
    const interactables = props.filter(p => p.interact);

    const items = (level.items || []).map(it => ({
      id: it.id, kind: it.kind, x: it.x, y: it.y, hidden: !!it.hidden
    }));
    const itemById = {};
    items.forEach(it => { itemById[it.id] = it; });

    const rooms = {};
    Object.keys(level.rooms).forEach(k => {
      const r = level.rooms[k];
      rooms[k] = { id: k, label: r.label, lit: r.light === "moon", outdoor: !!r.outdoor, save: !!r.save };
    });

    const gardenCells = cells.filter(c => c && c.walk && c.room === "garden").map(c => c.idx);

    // Doors whose edge is inside the house, used for ambient slams.
    const slamDoors = (level.slamDoors || []).map(id => doors.find(d => d.id === id)).filter(Boolean).map(d => d.index);
    const silhouetteDoors = (level.silhouetteDoors || []).map(id => doors.find(d => d.id === id)).filter(Boolean).map(d => d.index);

    const spawnCell = Math.floor(level.spawn.y) * W + Math.floor(level.spawn.x);
    return {
      id: level.id,
      W, H, N, cells, at, nb, edge, edgeDoor,
      doors, walls, wallBoxes, colliders, props, interactables,
      items, itemById, rooms, gardenCells, slamDoors, silhouetteDoors,
      spawn: level.spawn,
      well: well ? { x: well.x, y: well.y, cell: well.cell } : null,
      wellMouth: level.wellMouth,
      soundSpots: level.soundSpots || {},
      spawnCell
    };
  }

  function cellIdx(world, x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= world.W || cy >= world.H) return -1;
    return cy * world.W + cx;
  }

  function roomAt(world, x, y) {
    const i = cellIdx(world, x, y);
    if (i < 0) return null;
    const c = world.cells[i];
    return c && c.walk ? c.room : null;
  }

  function floorAt(world, x, y) {
    const i = cellIdx(world, x, y);
    if (i < 0) return "wood";
    const c = world.cells[i];
    return c ? c.floor : "wood";
  }

  function forward(yaw) {
    return [-Math.sin(yaw), -Math.cos(yaw)];
  }

  // ---------- collision ----------

  function pushOut(p, r, b) {
    const cx = clamp(p.x, b[0], b[2]);
    const cy = clamp(p.y, b[1], b[3]);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      const k = (r - d) / d;
      p.x += dx * k;
      p.y += dy * k;
      return;
    }
    const left = p.x - b[0];
    const right = b[2] - p.x;
    const top = p.y - b[1];
    const bottom = b[3] - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = b[0] - r;
    else if (m === right) p.x = b[2] + r;
    else if (m === top) p.y = b[1] - r;
    else p.y = b[3] + r;
  }

  function resolveBody(world, doorOpen, p, r) {
    for (let it = 0; it < 2; it++) {
      const cs = world.colliders;
      for (let i = 0; i < cs.length; i++) pushOut(p, r, cs[i]);
      for (let i = 0; i < world.doors.length; i++) {
        if (!doorOpen[i]) pushOut(p, r, world.doors[i].aabb);
      }
    }
  }

  // Move a body by (dx, dy) in small steps so it cannot tunnel through a wall.
  function moveBody(world, doorOpen, body, dx, dy, r) {
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / 0.05));
    const sx = dx / steps;
    const sy = dy / steps;
    const x0 = body.x;
    const y0 = body.y;
    for (let i = 0; i < steps; i++) {
      body.x += sx;
      body.y += sy;
      resolveBody(world, doorOpen, body, r);
    }
    return Math.hypot(body.x - x0, body.y - y0);
  }

  // Slab test: does segment (ax,ay)-(bx,by) cross the box?
  function segHitsBox(ax, ay, bx, by, b) {
    let t0 = 0;
    let t1 = 1;
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) < 1e-9) {
      if (ax < b[0] || ax > b[2]) return false;
    } else {
      let ta = (b[0] - ax) / dx;
      let tb = (b[2] - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    if (Math.abs(dy) < 1e-9) {
      if (ay < b[1] || ay > b[3]) return false;
    } else {
      let ta = (b[1] - ay) / dy;
      let tb = (b[3] - ay) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    return true;
  }

  // Line of sight: walls and closed doors block. Props do not.
  function losClear(world, doorOpen, ax, ay, bx, by) {
    const wb = world.wallBoxes;
    for (let i = 0; i < wb.length; i++) {
      if (segHitsBox(ax, ay, bx, by, wb[i])) return false;
    }
    for (let i = 0; i < world.doors.length; i++) {
      if (!doorOpen[i] && segHitsBox(ax, ay, bx, by, world.doors[i].aabb)) return false;
    }
    return true;
  }

  // ---------- pathing ----------

  // Breadth-first search over walkable cells and passable edges.
  // Closed doors count as passable: the entity opens them.
  function bfs(world, start, maxDepth) {
    const N = world.N;
    const dist = new Int16Array(N).fill(-1);
    const parent = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      if (maxDepth !== undefined && dist[cur] >= maxDepth) continue;
      for (let d = 0; d < 4; d++) {
        if (world.edge[cur * 4 + d] === EDGE_WALL) continue;
        const n = world.nb[cur * 4 + d];
        if (n < 0 || dist[n] >= 0) continue;
        dist[n] = dist[cur] + 1;
        parent[n] = cur;
        queue[tail++] = n;
      }
    }
    return { dist, parent };
  }

  function bfsPath(world, from, to) {
    if (from < 0 || to < 0) return null;
    const { dist, parent } = bfs(world, from);
    if (dist[to] < 0) return null;
    const path = [];
    let cur = to;
    while (cur !== -1) {
      path.push(cur);
      if (cur === from) break;
      cur = parent[cur];
    }
    path.reverse();
    return path;
  }

  function dirBetween(world, a, b) {
    for (let d = 0; d < 4; d++) {
      if (world.nb[a * 4 + d] === b) return d;
    }
    return -1;
  }

  // ---------- visibility ----------

  function beamHits(world, s) {
    if (!s.light || s.charge <= 0) return false;
    const p = s.player;
    const e = s.ent;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > C.BEAM_RANGE) return false;
    const f = forward(p.yaw);
    if ((dx * f[0] + dy * f[1]) / Math.max(d, 1e-6) < Math.cos(C.BEAM_HALF)) return false;
    return losClear(world, s.doorOpen, p.x, p.y, e.x, e.y);
  }

  // The player sees the entity: inside the view cone, not occluded, and lit well enough.
  // Outside the cone, or behind a wall or a closed door, she is not seen.
  function seesEntity(world, s) {
    const p = s.player;
    const e = s.ent;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > C.BEAM_RANGE) return false;
    const f = forward(p.yaw);
    if ((dx * f[0] + dy * f[1]) / Math.max(d, 1e-6) < Math.cos(C.SIGHT_HALF)) return false;
    if (!losClear(world, s.doorOpen, p.x, p.y, e.x, e.y)) return false;
    if (beamHits(world, s)) return true;
    const room = roomAt(world, e.x, e.y);
    const lit = room && world.rooms[room] ? world.rooms[room].lit : false;
    return d <= (lit ? C.MOON_SEE : C.DARK_SEE);
  }

  // ---------- state construction ----------

  function newEnt(world) {
    const m = world.wellMouth;
    return {
      x: m.x, y: m.y,
      state: "DORMANT",
      stunT: 0, frozenT: 0, freezeCD: 0,
      anger: 0, grace: 0,
      path: [], pathI: 1, goal: -1, replanT: 0,
      doorT: 0, stuckT: 0, stepAcc: 0,
      retreat: -1,
      seen: false
    };
  }

  function newGame(world, seed) {
    const sd = (seed >>> 0) || 1;
    const sp = world.spawn;
    const s = {
      v: 1,
      seed: sd,
      rng: sd,
      t: 0,
      player: {
        x: sp.x, y: sp.y, yaw: sp.yaw,
        stamina: 1, running: false, moving: false,
        stepAcc: 0, room: roomAt(world, sp.x, sp.y)
      },
      inv: { fuda: 0, battery: 0, shell: 2 },
      placed: 0,
      charge: 1,
      light: false,
      flicker: 1,
      flickT: 0,
      gun: { chambers: [0, 0], state: "ready", timer: 0 },
      taken: {},
      revealed: {},
      notes: {},
      doorOpen: world.doors.map(d => d.defaultOpen),
      noise: { x: 0, y: 0, level: 0 },
      ent: newEnt(world),
      awakened: false,
      callCD: 0,
      choice: null,
      silences: 0,
      seal: { lid: false, dawnT: -1 },
      ending: null,
      endingT: 0,
      respawnT: -1,
      grabs: 0,
      cp: null,
      amb: { next: 9, lightning: 22, thunderAt: -1, thunderX: 0, thunderY: 0, chimeAt: -1 },
      visited: {},
      fear: 0,
      seen: false
    };
    return s;
  }

  // ---------- checkpoints and storage ----------

  function serialize(world, s) {
    return {
      v: 1,
      seed: s.seed,
      rng: s.rng >>> 0,
      room: roomAt(world, s.player.x, s.player.y),
      x: round(s.player.x, 3),
      y: round(s.player.y, 3),
      yaw: round(wrapAngle(s.player.yaw), 3),
      inv: { fuda: s.inv.fuda, battery: s.inv.battery, shell: s.inv.shell },
      charge: round(s.charge, 4),
      placed: s.placed,
      taken: Object.keys(s.taken).sort(),
      revealed: Object.keys(s.revealed).sort(),
      notes: Object.keys(s.notes).sort(),
      doors: s.doorOpen.slice(),
      awakened: !!s.awakened,
      t: round(s.t, 2)
    };
  }

  function isInt(v, lo, hi) {
    return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  }

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  function validCheckpoint(world, o) {
    if (!o || typeof o !== "object" || o.v !== 1) return null;
    if (!isNum(o.x) || !isNum(o.y) || !isNum(o.yaw) || !isNum(o.charge) || !isNum(o.t)) return null;
    if (!isInt(o.seed, 1, 0xffffffff) || !isInt(o.rng, 0, 0xffffffff)) return null;
    if (!isInt(o.placed, 0, 3) || typeof o.awakened !== "boolean") return null;
    if (o.charge < 0 || o.charge > 1) return null;
    const cell = world.at(Math.floor(o.x), Math.floor(o.y));
    if (!cell || !cell.walk) return null;
    if (cell.room !== o.room) return null;
    if (!o.inv || !isInt(o.inv.fuda, 0, 3) || !isInt(o.inv.battery, 0, C.BATTERY_MAX) || !isInt(o.inv.shell, 0, C.SHELL_MAX)) return null;
    const lists = [o.taken, o.revealed, o.notes];
    if (lists.some(a => !Array.isArray(a))) return null;
    if (o.taken.some(id => typeof id !== "string" || !world.itemById[id])) return null;
    if (o.revealed.some(id => typeof id !== "string" || !world.itemById[id])) return null;
    if (o.notes.some(id => DIARY_IDS.indexOf(id) < 0)) return null;
    if (!Array.isArray(o.doors) || o.doors.length !== world.doors.length) return null;
    if (o.doors.some(v => typeof v !== "boolean")) return null;
    const fudaTaken = o.taken.filter(id => world.itemById[id].kind === "fuda").length;
    if (fudaTaken !== o.inv.fuda + o.placed) return null;
    return {
      v: 1,
      seed: o.seed,
      rng: o.rng,
      room: o.room,
      x: o.x,
      y: o.y,
      yaw: o.yaw,
      inv: { fuda: o.inv.fuda, battery: o.inv.battery, shell: o.inv.shell },
      charge: o.charge,
      placed: o.placed,
      taken: o.taken.slice(),
      revealed: o.revealed.slice(),
      notes: o.notes.slice(),
      doors: o.doors.slice(),
      awakened: o.awakened,
      t: o.t
    };
  }

  function restore(world, cp) {
    const s = newGame(world, cp.seed);
    s.rng = cp.rng >>> 0 || 1;
    s.player.x = cp.x;
    s.player.y = cp.y;
    s.player.yaw = cp.yaw;
    s.player.room = roomAt(world, cp.x, cp.y);
    s.inv = { fuda: cp.inv.fuda, battery: cp.inv.battery, shell: cp.inv.shell };
    s.placed = cp.placed;
    s.charge = cp.charge;
    cp.taken.forEach(id => { s.taken[id] = true; });
    cp.revealed.forEach(id => { s.revealed[id] = true; });
    cp.notes.forEach(id => { s.notes[id] = true; });
    s.doorOpen = cp.doors.slice();
    s.t = cp.t;
    s.awakened = cp.awakened;
    if (s.awakened) {
      const e = s.ent;
      e.x = world.wellMouth.x;
      e.y = world.wellMouth.y;
      e.state = "STALK";
      e.grace = C.GRACE;
    }
    s.amb.next = s.t + 9;
    s.amb.lightning = s.t + 22;
    s.visited = {};
    if (s.player.room === "butsuma" || s.player.room === "engawa" || s.player.room === "garden") {
      s.visited[s.player.room] = true;
    }
    s.cp = cp;
    return s;
  }

  function validSettings(o) {
    const d = DEFAULT_SETTINGS;
    if (!o || typeof o !== "object") return Object.assign({}, d);
    return {
      sens: isNum(o.sens) ? clamp(o.sens, 0.2, 3) : d.sens,
      gamma: isNum(o.gamma) ? clamp(o.gamma, 0.6, 1.6) : d.gamma,
      sound: typeof o.sound === "boolean" ? o.sound : d.sound
    };
  }

  const DEFAULT_SETTINGS = { sens: 1, gamma: 1, sound: true };

  // Store format: { v: 1, cp, settings }. Anything invalid is dropped on its own.
  function decodeStore(world, raw) {
    const out = { cp: null, settings: validSettings(null) };
    if (!raw || typeof raw !== "object" || raw.v !== 1) return out;
    out.cp = validCheckpoint(world, raw.cp);
    out.settings = validSettings(raw.settings);
    return out;
  }

  function encodeStore(cp, settings) {
    return { v: 1, cp: cp || null, settings: validSettings(settings) };
  }

  // ---------- helpers for actions ----------

  function noiseAt(s, x, y, level) {
    const n = s.noise;
    if (level >= n.level) {
      n.x = x;
      n.y = y;
      n.level = level;
    }
  }

  function takeItem(world, s, item, ev) {
    if (s.taken[item.id]) return;
    s.taken[item.id] = true;
    if (item.kind === "battery") {
      s.inv.battery = Math.min(C.BATTERY_MAX, s.inv.battery + 1);
      ev.push({ type: "msg", key: "battery-got" });
    } else if (item.kind === "shell") {
      s.inv.shell = Math.min(C.SHELL_MAX, s.inv.shell + 1);
      ev.push({ type: "msg", key: "shell-got" });
    } else if (item.kind === "fuda") {
      s.inv.fuda = Math.min(3, s.inv.fuda + 1);
      const first = fudaCount(world, s) === 1;
      ev.push({ type: "narr", key: first ? "fuda-first" : "fuda-got" });
    } else if (item.kind === "diary") {
      s.notes[item.id] = true;
      ev.push({ type: "note", id: item.id });
    }
    ev.push({ type: "pickup", id: item.id, kind: item.kind });
  }

  function fudaCount(world, s) {
    return FUDA_IDS.reduce((n, id) => n + (s.taken[id] ? 1 : 0), 0);
  }

  // Interaction target: the nearest thing the player is facing and close to.
  function findTarget(world, s) {
    const p = s.player;
    const f = forward(p.yaw);
    const facing = (x, y) => {
      const dx = x - p.x;
      const dy = y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.8) return { d, ok: true };
      return { d, ok: (dx * f[0] + dy * f[1]) / d >= 0.35 };
    };
    let best = null;
    const consider = (score, t) => {
      if (!best || score < best.score) best = Object.assign({ score }, t);
    };
    for (const it of world.items) {
      if (s.taken[it.id]) continue;
      if (it.hidden && !s.revealed[it.id]) continue;
      const f1 = facing(it.x, it.y);
      if (!f1.ok || f1.d > 1.4) continue;
      const isNote = it.kind === "diary";
      consider(f1.d, { kind: isNote ? "read" : "take", id: it.id, key: isNote ? "read" : "take" });
    }
    for (const door of world.doors) {
      const f2 = facing(door.cx, door.cy);
      if (!f2.ok || f2.d > 1.4) continue;
      const open = s.doorOpen[door.index];
      consider(f2.d + 0.05, { kind: "door", id: door.id, key: open ? "close" : "open" });
    }
    for (const pr of world.interactables) {
      const f3 = facing(pr.x, pr.y);
      if (!f3.ok || f3.d > 1.7) continue;
      const it = pr.interact;
      consider(f3.d + 0.1, { kind: it.kind, id: it.id, key: it.kind === "burn" ? "burn" : "search", search: it.label || null, reveals: it.reveals || [] });
    }
    if (world.well) {
      const f4 = facing(world.well.x, world.well.y);
      if (f4.ok && f4.d <= 2.0) {
        const key = s.placed < 3 ? (s.inv.fuda > 0 ? "well" : "wellLook") : (!s.seal.lid ? "lid" : null);
        if (key) consider(f4.d + 0.05, { kind: "well", id: "well", key });
      }
    }
    return best;
  }

  // What the context prompt should say, or null.
  function contextAction(world, s) {
    const t = findTarget(world, s);
    if (!t) return null;
    return { kind: t.kind, id: t.id, key: t.key, search: t.search || null };
  }

  // ---------- actions ----------

  function toggleLight(s, ev) {
    if (s.light) {
      s.light = false;
      ev.push({ type: "flash", on: false });
      return;
    }
    if (s.charge > 0.0005) {
      s.light = true;
      ev.push({ type: "flash", on: true });
      return;
    }
    if (s.inv.battery > 0) {
      s.inv.battery -= 1;
      s.charge = 1;
      s.light = true;
      ev.push({ type: "battery-swap" });
      ev.push({ type: "flash", on: true });
      return;
    }
    ev.push({ type: "msg", key: "battery-none" });
  }

  function fire(world, s, ev) {
    const g = s.gun;
    if (g.state !== "ready") return;
    const barrel = g.chambers[0] ? 0 : g.chambers[1] ? 1 : -1;
    if (barrel < 0) {
      g.state = "dry";
      g.timer = 0.35;
      ev.push({ type: "dry" });
      return;
    }
    g.chambers[barrel] = 0;
    g.state = "recoil";
    g.timer = 0.55;
    const p = s.player;
    noiseAt(s, p.x, p.y, 1);
    const hit = shotHits(world, s);
    ev.push({ type: "shot", hit, barrel });
    if (hit) stunEntity(world, s, ev);
  }

  function reload(s, ev) {
    const g = s.gun;
    if (g.state !== "ready") return;
    if (g.chambers[0] && g.chambers[1]) {
      ev.push({ type: "msg", key: "chamber-full" });
      return;
    }
    if (s.inv.shell <= 0) {
      ev.push({ type: "msg", key: "shell-none" });
      ev.push({ type: "dry" });
      return;
    }
    g.state = "reload";
    g.timer = 0.8;
    ev.push({ type: "break" });
  }

  function tickGun(s, dt, ev) {
    const g = s.gun;
    if (g.state === "ready") return;
    g.timer -= dt;
    if (g.timer > 0) return;
    if (g.state === "reload") {
      const slot = g.chambers[0] ? (g.chambers[1] ? -1 : 1) : 0;
      if (slot >= 0 && s.inv.shell > 0) {
        g.chambers[slot] = 1;
        s.inv.shell -= 1;
        ev.push({ type: "load" });
      }
    }
    g.state = "ready";
    g.timer = 0;
  }

  // A hit: an entity in front, within range, not behind a wall, inside the spread.
  function shotHits(world, s) {
    const p = s.player;
    const e = s.ent;
    if (e.state === "SEALED") return false;
    const f = forward(p.yaw);
    const vx = e.x - p.x;
    const vy = e.y - p.y;
    const along = vx * f[0] + vy * f[1];
    if (along <= 0.2 || along > C.SHOT_RANGE) return false;
    const perp = Math.abs(f[0] * vy - f[1] * vx);
    if (perp > C.R_ENT + C.SHOT_SPREAD * along) return false;
    return losClear(world, s.doorOpen, p.x, p.y, e.x, e.y);
  }

  function stunEntity(world, s, ev) {
    const e = s.ent;
    const p = s.player;
    s.awakened = true;
    e.grace = 0;
    e.frozenT = 0;
    e.path = [];
    e.goal = -1;
    e.stunT = rndRange(s, C.STUN_MIN, C.STUN_MAX);
    e.anger = Math.min(3, e.anger + 1);
    e.state = "STUNNED";
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    moveBody(world, s.doorOpen, e, (dx / d) * C.PUSH_BACK, (dy / d) * C.PUSH_BACK, C.R_ENT);
    e.retreat = pickRetreat(world, s);
    e.replanT = 0;
    ev.push({ type: "stun" });
    ev.push({ type: "scream" });
  }

  // The cell she runs to while stunned: far from the player, out of sight if possible.
  function pickRetreat(world, s) {
    const e = s.ent;
    const p = s.player;
    const start = cellIdx(world, e.x, e.y);
    const { dist } = bfs(world, start, 10);
    let best = start;
    let score = -1e9;
    for (let i = 0; i < world.N; i++) {
      if (dist[i] <= 0) continue;
      const c = world.cells[i];
      const dp = Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y);
      const hidden = !losClear(world, s.doorOpen, p.x, p.y, c.x + 0.5, c.y + 0.5);
      const sc = dp + (hidden ? 3 : 0) - dist[i] * 0.05;
      if (sc > score) {
        score = sc;
        best = i;
      }
    }
    return best;
  }

  // Walk along a path toward goal cell, then to the point (tx, ty).
  // A closed door in the way is approached, waited at, then opened.
  function navigate(world, s, e, goal, tx, ty, speed, dt, ev) {
    const here = cellIdx(world, e.x, e.y);
    e.replanT -= dt;
    if (e.replanT <= 0 || goal !== e.goal) {
      e.path = bfsPath(world, here, goal) || [here];
      e.pathI = 1;
      e.goal = goal;
      e.replanT = 0.7;
    }
    while (e.pathI < e.path.length && Math.hypot(e.x - (world.cells[e.path[e.pathI]].x + 0.5), e.y - (world.cells[e.path[e.pathI]].y + 0.5)) < 0.15) {
      e.pathI += 1;
    }
    let wx = tx;
    let wy = ty;
    let atDoor = null;
    if (e.pathI < e.path.length) {
      const next = e.path[e.pathI];
      const d = dirBetween(world, here, next);
      if (d >= 0 && world.edge[here * 4 + d] === EDGE_DOOR) {
        const door = world.doors[world.edgeDoor[here * 4 + d]];
        if (!s.doorOpen[door.index]) atDoor = door;
      }
      if (!atDoor) {
        wx = world.cells[next].x + 0.5;
        wy = world.cells[next].y + 0.5;
      }
    }
    if (atDoor) {
      wx = atDoor.cx;
      wy = atDoor.cy;
      if (Math.hypot(e.x - wx, e.y - wy) < 0.5) {
        e.doorT += dt;
        if (e.doorT >= C.DOOR_WAIT) {
          s.doorOpen[atDoor.index] = true;
          e.doorT = 0;
          ev.push({ type: "door", id: atDoor.id, open: true, by: "ent" });
        }
        return 0;
      }
    } else {
      e.doorT = 0;
    }
    const dx = wx - e.x;
    const dy = wy - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return 0;
    const stepLen = Math.min(dist, speed * dt);
    const moved = moveBody(world, s.doorOpen, e, (dx / dist) * stepLen, (dy / dist) * stepLen, C.R_ENT);
    if (moved < 0.2 * stepLen) {
      e.stuckT += dt;
      if (e.stuckT > 1.5) {
        e.replanT = 0;
        e.stuckT = 0;
      }
    } else {
      e.stuckT = 0;
    }
    return moved;
  }

  // ---------- per-frame updates ----------

  function movePlayer(world, s, input, dt, ev) {
    const p = s.player;
    if (input.turn) p.yaw = wrapAngle(p.yaw + input.turn);
    let mx = clamp(input.mx || 0, -1, 1);
    let mz = clamp(input.mz || 0, -1, 1);
    const len = Math.hypot(mx, mz);
    p.moving = len > 0.05;
    p.running = p.moving && !!input.run && p.stamina > 0.02;
    if (p.running) {
      p.stamina = Math.max(0, p.stamina - dt * C.STAMINA_DRAIN);
    } else {
      p.stamina = Math.min(1, p.stamina + dt * C.STAMINA_REGEN);
    }
    if (p.moving) {
      const k = Math.min(1, len) / len;
      mx *= k;
      mz *= k;
      const speed = p.running ? C.RUN : C.WALK;
      const f = forward(p.yaw);
      const rx = Math.cos(p.yaw);
      const ry = -Math.sin(p.yaw);
      const dx = (f[0] * mz + rx * mx) * speed * dt;
      const dy = (f[1] * mz + ry * mx) * speed * dt;
      const moved = moveBody(world, s.doorOpen, p, dx, dy, C.R_PLAYER);
      p.stepAcc += moved;
      noiseAt(s, p.x, p.y, p.running ? 0.7 : 0.22);
      const stride = p.running ? 0.85 : 1.05;
      if (p.stepAcc >= stride) {
        p.stepAcc = 0;
        ev.push({ type: "footstep", surface: floorAt(world, p.x, p.y), running: p.running });
      }
    }
    const room = roomAt(world, p.x, p.y);
    if (room && room !== p.room) {
      p.room = room;
      enterRoom(world, s, room, ev);
    }
  }

  function enterRoom(world, s, room, ev) {
    if (s.visited[room]) return;
    s.visited[room] = true;
    if (room === "engawa") {
      s.awakened = true;
      ev.push({ type: "narr", key: "engawa" });
    } else if (room === "garden") {
      s.awakened = true;
    } else if (room === "butsuma") {
      ev.push({ type: "narr", key: "butsuma" });
    } else if (room === "kura") {
      ev.push({ type: "narr", key: "kura" });
    }
  }

  function updateLight(s, dt, ev) {
    if (!s.light) {
      s.flicker = 1;
      return;
    }
    s.charge = Math.max(0, s.charge - dt / C.BATTERY_SECONDS);
    if (s.charge <= 0) {
      s.light = false;
      s.flicker = 1;
      ev.push({ type: "flash", on: false, dead: true });
      ev.push({ type: "msg", key: "light-dead" });
      return;
    }
    if (s.charge < C.FLICKER_AT) {
      s.flickT -= dt;
      if (s.flickT <= 0) {
        s.flickT = rndRange(s, 0.05, 0.3);
        s.flicker = rnd(s) < 0.4 ? rndRange(s, 0.05, 0.5) : 1;
      }
    } else {
      s.flicker = 1;
    }
  }

  function updateEntity(world, s, dt, ev) {
    const e = s.ent;
    const p = s.player;
    if (e.state === "SEALED") return;
    if (!s.awakened) {
      e.state = "DORMANT";
      return;
    }
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.state = "STUNNED";
      if (e.retreat >= 0 && e.stunT > 0) {
        const rc = world.cells[e.retreat];
        navigate(world, s, e, e.retreat, rc.x + 0.5, rc.y + 0.5, C.ENT_STUN_SPEED, dt, ev);
      }
      if (e.stunT <= 0) {
        e.stunT = 0;
        e.state = "STALK";
        e.path = [];
        e.goal = -1;
        e.replanT = 0;
      }
      return;
    }
    if (e.grace > 0) {
      e.grace -= dt;
      e.state = "STALK";
      return;
    }
    if (d <= C.CAPTURE) {
      grab(world, s, ev);
      return;
    }
    if (e.frozenT > 0) {
      e.frozenT -= dt;
      e.state = "FROZEN";
      if (e.frozenT <= 0) {
        e.frozenT = 0;
        e.state = "STALK";
      }
      return;
    }
    e.freezeCD -= dt;
    if (e.freezeCD <= 0 && d <= C.FREEZE_RANGE && beamHits(world, s)) {
      e.frozenT = rndRange(s, C.FREEZE_MIN, C.FREEZE_MAX);
      e.freezeCD = e.frozenT + 2.5;
      e.state = "FROZEN";
      ev.push({ type: "freeze" });
      return;
    }
    e.state = "STALK";
    e.seen = seesEntity(world, s);
    s.seen = e.seen;
    if (e.seen) {
      e.replanT = Math.min(e.replanT, 0.3);
      return;
    }
    const noisy = s.noise.level > 0.12;
    const tx = noisy ? s.noise.x : p.x;
    const ty = noisy ? s.noise.y : p.y;
    const goal = cellIdx(world, tx, ty);
    if (goal < 0) return;
    const speed = C.ENT_SPEED * (1 + C.ENT_ANGER_STEP * e.anger) * (noisy ? C.ENT_NOISE_BOOST : 1);
    const moved = navigate(world, s, e, goal, tx, ty, speed, dt, ev);
    e.stepAcc += moved;
    if (e.stepAcc >= 0.6) {
      e.stepAcc = 0;
      if (d <= 8) {
        ev.push({ type: "ent-step", surface: floorAt(world, e.x, e.y), x: e.x, y: e.y });
      }
    }
  }

  function grab(world, s, ev) {
    if (s.respawnT >= 0) return;
    s.respawnT = C.RESPAWN_TIME;
    s.grabs += 1;
    s.noise.level = 0;
    s.choice = null;
    ev.push({ type: "grab" });
  }

  function updateCall(world, s, dt, ev) {
    if (s.choice) {
      s.choice.timer -= dt;
      if (s.choice.timer <= 0) silence(s, ev);
      return;
    }
    if (!s.awakened || s.ending || s.seal.lid) return;
    s.callCD -= dt;
    if (s.callCD > 0 || !world.well) return;
    const p = s.player;
    const d = Math.hypot(p.x - world.well.x, p.y - world.well.y);
    if (d <= C.CALL_RANGE) {
      s.choice = { timer: C.CALL_WAIT };
      s.callCD = 1e9;
      ev.push({ type: "call" });
    }
  }

  function silence(s, ev) {
    s.choice = null;
    s.silences += 1;
    s.callCD = rndRange(s, C.CALL_GAP_MIN, C.CALL_GAP_MAX);
    ev.push({ type: "silence" });
    ev.push({ type: "narr", key: "silence" });
  }

  function answer(s, ev) {
    if (!s.choice) return;
    s.choice = null;
    s.ending = "taken";
    s.endingT = 0;
    ev.push({ type: "answer" });
    ev.push({ type: "ending", kind: "taken" });
  }

  function updateNoise(s, dt) {
    s.noise.level = Math.max(0, s.noise.level - C.NOISE_DECAY * dt);
  }

  function updateAmbient(world, s, dt, ev) {
    const a = s.amb;
    const e = s.ent;
    const p = s.player;
    if (s.t >= a.lightning) {
      a.lightning = s.t + rndRange(s, 20, 42);
      let fx;
      let fy;
      const inGarden = roomAt(world, e.x, e.y) === "garden";
      if (inGarden) {
        fx = e.x;
        fy = e.y;
      } else if (world.gardenCells.length) {
        const c = world.cells[world.gardenCells[Math.floor(rnd(s) * world.gardenCells.length)]];
        fx = c.x + 0.5;
        fy = c.y + 0.5;
      } else {
        fx = p.x;
        fy = p.y;
      }
      ev.push({ type: "lightning", x: fx, y: fy, figure: rnd(s) < 0.7 });
      a.thunderAt = s.t + rndRange(s, 1.2, 4.2);
      a.thunderX = fx;
      a.thunderY = fy;
    }
    if (a.thunderAt >= 0 && s.t >= a.thunderAt) {
      a.thunderAt = -1;
      ev.push({ type: "thunder", strength: rndRange(s, 0.6, 1) });
    }
    if (a.chimeAt >= 0 && s.t >= a.chimeAt) {
      a.chimeAt = -1;
      ev.push({ type: "ambient", kind: "chime-ping", x: 9.5, y: 5.5 });
    }
    if (s.t < a.next) return;
    a.next = s.t + rndRange(s, 14, 24);
    const r = rnd(s);
    if (r < 0.34) {
      // Door slam: a closed-off house door that is open and empty.
      const candidates = world.slamDoors.filter(i => {
        if (!s.doorOpen[i]) return false;
        const d = world.doors[i];
        return Math.hypot(d.cx - e.x, d.cy - e.y) > 1.6 && Math.hypot(d.cx - p.x, d.cy - p.y) > 3;
      });
      if (candidates.length) {
        const i = candidates[Math.floor(rnd(s) * candidates.length)];
        s.doorOpen[i] = false;
        ev.push({ type: "door", id: world.doors[i].id, open: false, by: "ambient" });
        ev.push({ type: "ambient", kind: "slam", id: world.doors[i].id });
      }
    } else if (r < 0.55) {
      const spot = world.soundSpots.nando || { x: 9.5, y: 12 };
      ev.push({ type: "ambient", kind: "rustle", x: spot.x, y: spot.y });
    } else if (r < 0.78) {
      const closed = world.silhouetteDoors.filter(i => !s.doorOpen[i]);
      if (closed.length) {
        const i = closed[Math.floor(rnd(s) * closed.length)];
        ev.push({ type: "ambient", kind: "silhouette", id: world.doors[i].id });
      }
    } else {
      if (a.chimeAt < 0) {
        a.chimeAt = s.t + rndRange(s, 2.2, 3.2);
        ev.push({ type: "ambient", kind: "chime-stop", x: 9.5, y: 5.5 });
      }
    }
  }

  function updateSeal(s, dt, ev) {
    if (!s.seal.lid || s.ending) return;
    s.seal.dawnT += dt;
    if (s.seal.dawnT >= C.SEAL_DAWN) {
      s.ending = "seal";
      s.endingT = 0;
      ev.push({ type: "ending", kind: "seal" });
    }
  }

  function fearOf(world, s) {
    const e = s.ent;
    const p = s.player;
    let prox = 0;
    if (s.awakened && e.state !== "SEALED") {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      prox = clamp(1 - (d - 1.1) / 9, 0, 1);
    }
    const dark = s.light ? 0 : 0.22;
    const low = s.light && s.charge < 0.2 ? 0.1 : 0;
    const watch = e.seen ? 0.1 : 0;
    return clamp(prox * 0.62 + dark + low + watch, 0, 1);
  }

  function interact(world, s, ev) {
    const t = findTarget(world, s);
    if (!t) return;
    if (t.kind === "take" || t.kind === "read") {
      takeItem(world, s, world.itemById[t.id], ev);
      return;
    }
    if (t.kind === "door") {
      const door = world.doors.find(d => d.id === t.id);
      const i = door.index;
      if (s.doorOpen[i]) {
        const ed = Math.hypot(door.cx - s.player.x, door.cy - s.player.y);
        const enemyNear = Math.hypot(door.cx - s.ent.x, door.cy - s.ent.y) < 0.8;
        if (ed < 0.45 || enemyNear) {
          ev.push({ type: "msg", key: "door-blocked" });
          return;
        }
        s.doorOpen[i] = false;
        ev.push({ type: "door", id: door.id, open: false, by: "player" });
      } else {
        s.doorOpen[i] = true;
        ev.push({ type: "door", id: door.id, open: true, by: "player" });
      }
      return;
    }
    if (t.kind === "burn") {
      s.cp = serialize(world, s);
      ev.push({ type: "burn" });
      ev.push({ type: "checkpoint", cp: s.cp });
      ev.push({ type: "narr", key: "senko" });
      return;
    }
    if (t.kind === "search") {
      let any = false;
      t.reveals.forEach(id => {
        if (s.revealed[id]) return;
        s.revealed[id] = true;
        any = true;
        const item = world.itemById[id];
        if (item) takeItem(world, s, item, ev);
      });
      ev.push({ type: "search", id: t.id, found: any });
      if (!any) ev.push({ type: "msg", key: "search-none" });
      return;
    }
    if (t.kind === "well") {
      if (s.placed < 3) {
        if (s.inv.fuda <= 0) {
          ev.push({ type: "msg", key: t.key === "wellLook" ? "well-look" : "well-nofuda" });
          return;
        }
        s.inv.fuda -= 1;
        s.placed += 1;
        ev.push({ type: "seal", count: s.placed });
        ev.push({ type: "narr", key: s.placed === 3 ? "seal-ready" : "seal-place" });
        return;
      }
      if (!s.seal.lid) {
        s.seal.lid = true;
        s.seal.dawnT = 0;
        s.ent.state = "SEALED";
        s.choice = null;
        ev.push({ type: "lid" });
        ev.push({ type: "narr", key: "lid" });
      }
    }
  }

  // Main step. Mutates s, returns an array of events for the presentation layers.
  function step(world, s, input, dt) {
    const ev = [];
    input = input || {};
    if (s.ending) {
      s.endingT += dt;
      return ev;
    }
    if (s.respawnT >= 0) {
      s.respawnT -= dt;
      if (s.respawnT <= 0) respawn(world, s, ev);
      return ev;
    }
    if (!(dt > 0)) return ev;
    s.t += dt;
    const acts = input.actions || [];
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (a === "fire") fire(world, s, ev);
      else if (a === "reload") reload(s, ev);
      else if (a === "flash") toggleLight(s, ev);
      else if (a === "interact") interact(world, s, ev);
      else if (a === "answer") answer(s, ev);
      else if (a === "silence") {
        if (s.choice) silence(s, ev);
      }
      if (s.ending || s.respawnT >= 0) return ev;
    }
    movePlayer(world, s, input, dt, ev);
    updateLight(s, dt, ev);
    tickGun(s, dt, ev);
    updateNoise(s, dt);
    updateEntity(world, s, dt, ev);
    if (s.respawnT >= 0) return ev;
    updateCall(world, s, dt, ev);
    updateAmbient(world, s, dt, ev);
    updateSeal(s, dt, ev);
    s.fear = fearOf(world, s);
    return ev;
  }

  function respawn(world, s, ev) {
    const cp = s.cp;
    const next = cp ? restore(world, cp) : newGame(world, s.seed);
    const keep = s.grabs;
    Object.keys(s).forEach(k => { delete s[k]; });
    Object.assign(s, next);
    s.cp = cp;
    s.grabs = keep;
    s.respawnT = -1;
    ev.push({ type: "respawn", fromCheckpoint: !!cp });
  }

  const API = {
    C,
    DEFAULT_SETTINGS,
    FUDA_IDS,
    DIARY_IDS,
    buildWorld,
    newGame,
    step,
    rnd,
    contextAction,
    findTarget,
    seesEntity,
    beamHits,
    losClear,
    bfs,
    bfsPath,
    moveBody,
    serialize,
    validCheckpoint,
    restore,
    decodeStore,
    encodeStore,
    validSettings,
    fudaCount,
    fearOf,
    roomAt,
    floorAt,
    cellIdx,
    forward,
    shotHits,
    stunEntity,
    fire,
    reload,
    tickGun,
    toggleLight,
    EDGE_WALL,
    EDGE_OPEN,
    EDGE_DOOR
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.NakiIdoSim = API;
})();
