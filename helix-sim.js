/* HELIX // 螺旋 — pure simulation layer.
 *
 *   node tools/balance-helix.cjs
 *   node --test tests/helix.test.cjs
 *
 * No DOM on purpose: the physics, the level data and the entities are plain
 * numbers, so a stage can be proven clearable by replaying a timed input
 * script in Node. The renderer and the audio live in helix.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.HelixSim = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------- constants -- */

  const TILE = 18;

  // The numbers that decide whether a jump feels honest. Kept together and
  // asserted as a set by the tests, because tuning them one at a time is how
  // platformers end up feeling inconsistent.
  const PHYS = {
    gravity: 1500,
    maxFall: 660,
    run: 205,
    groundAccel: 1700,
    airAccel: 1000,
    groundFriction: 2200,
    airDrag: 340,
    jump: -432,
    jumpCut: 0.42,
    coyote: 0.1,
    buffer: 0.12,
    wallSlide: 120,
    wallJumpX: 240,
    wallJumpY: -410,
    wallStick: 0.14,
    dashSpeed: 470,
    dashTime: 0.15,
    dashWait: 0.45,
    dashEndSpeed: 0.72,
    stepUp: 6
  };

  // Smaller than one tile on purpose: a body taller than the tile would already
  // overlap the ceiling tile at its spawn, which reads as "stuck in a wall".
  const PLAYER_W = 11;
  const PLAYER_H = 15;

  const DT = 1 / 60;

  const RESPAWN_DELAY = 0.32;
  const INVULN = 0.9;

  const KIND = {
    ".": "empty",
    "#": "solid",
    "^": "spike",
    "v": "spike",
    "<": "spike",
    ">": "spike",
    "S": "start",
    "G": "goal",
    "C": "checkpoint",
    "m": "mover",
    "M": "mover",
    "o": "spinner",
    "d": "drone",
    "~": "pearl"
  };

  /* ------------------------------------------------------------ level data -- */

  /* Each stage ships with the input script that clears it. The script is the
   * proof: the tests replay it and fail if a stage ever becomes unclearable. */
  /* Authoring helper. Rows are written as text and padded to a common width
   * with the level's border wall, so a row that is one character short cannot
   * silently open a hole in the side of a stage. parseLevel below still
   * refuses ragged input, so the padding is visible rather than implicit. */
  function box(rows) {
    const w = Math.max.apply(null, rows.map((r) => r.length));
    return rows.map((r) => r + "#".repeat(Math.max(0, w - r.length)));
  }

  const LEVELS = [
    {
      id: 1,
      name: "\u8db3\u5834",
      en: "FOOTING",
      lead: "\u8d70\u308b\u3002\u8df3\u3076\u3002\n\u5d16\u306e\u524d\u3092\u8aad\u3080\u3002",
      rows: box([
        "##################################",
        "#................................#",
        "#................................#",
        "#................................#",
        "#......G.........................#",
        "#....#####.......................#",
        "#...........~....................#",
        "#..........####..................#",
        "#................................#",
        "#................####............#",
        "#................................#",
        "#......................####......#",
        "#................................#",
        "#............####..........####..#",
        "#................................#",
        "#.S...####..........####.........#",
        "##################################",
        "##################################"
      ]),
      script: [["R",1],["LJ",1],["L",1],["LJ",2],["RJ",1],["LJ",7],["RJ",1],["LJ",2],["",1],["R",1],["LJ",3],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["",1],["R",1],["",1],["R",1],["",2],["RJ",1],["",1],["LK",1],["",11],["R",1],["LJ",3],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["R",1],["",4],["LK",1],["",10],["R",1],["LJ",3],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",2],["LJ",1],["RJ",1],["R",1],["",3],["R",1],["LJ",2],["RK",1],["",5]]
    },
    {
      id: 2,
      name: "\u58c1\u6cbf\u3044",
      en: "THE WALL",
      lead: "\u5f35\u308a\u4ed8\u3044\u3066\u3001\u8df3\u306d\u8fd4\u308b\u3002",
      rows: box([
        "######################################",
        "#....................................#",
        "#....................................#",
        "#....................................#",
        "#....................................#",
        "#....................................#",
        "#.......................G............#",
        "#....................########........#",
        "#...............~....................#",
        "#..............#####.................#",
        "#....................................#",
        "##....########.......................#",
        "##....#..............................#",
        "##....#..............................#",
        "##....#..............................#",
        "##S...#.^^^^^.^^^^^..................#",
        "######################################",
        "######################################"
      ]),
      script: [["R",1],["LJ",1],["L",1],["LJ",2],["RJ",1],["L",1],["LJ",3],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["",2],["RJ",1],["L",1],["",2],["LJ",4],["RK",1],["",10],["RJ",1],["R",1],["",1],["R",1],["",3],["R",1],["",2],["RJ",2],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["R",1],["RK",1],["",9],["RJ",1],["R",2],["",1],["R",1],["",1],["R",1],["LJ",1],["RJ",2],["LJ",1],["RJ",2],["LJ",1],["RJ",1],["R",1],["",2],["R",1],["RK",1],["",7]]
    },
    {
      id: 3,
      name: "\u5f80\u6765",
      en: "CROSSFIRE",
      lead: "\u52d5\u304f\u5e8a\u3068\u3001\u56de\u308b\u5203\u3002",
      rows: box([
        "##################################",
        "#................................#",
        "#................................#",
        "#................................#",
        "#................................#",
        "#................................#",
        "#................................#",
        "#................................#",
        "#................................#",
        "#...........o.....~......o.......#",
        "#................####.........G..#",
        "#...........................######",
        "#................................#",
        "#.S.........m.....C......m.......#",
        "##########......#######.....######",
        "#.........^^^^^^.......^^^^^.....#",
        "##################################"
      ]),
      script: [["RK",1],["",10],["R",1],["RJ",2],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["",3],["R",1],["",2],["R",1],["",2],["RK",1],["",10],["R",1],["",1],["R",2],["RJ",1],["",4],["R",1],["",1],["R",1],["",2],["R",1],["",2],["R",1],["RK",1],["",10],["RJ",3],["",2],["RJ",1],["",4],["R",1],["",3],["L",1],["R",2],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["RK",1],["",5]]
    },
    {
      id: 4,
      name: "\u706f\u706b",
      en: "BEACON",
      lead: "\u706f\u308a\u3092\u62fe\u3044\u306a\u304c\u3089\u3001\u8ff7\u308f\u305a\u3001\u6b21\u306e\u5854\u3078\u3002",
      rows: box([
        "############################################",
        "#..........................................#",
        "#..........................................#",
        "#..........................................#",
        "#..........................................#",
        "#..........................................#",
        "#..........................................#",
        "#..........................................#",
        "#...................o......................#",
        "#...................d..............d.......#",
        "#...............~..........................#",
        "#..............###.............###.........#",
        "#............................d.........G~..#",
        "#.......####...........####...........####.#",
        "#..........................................#",
        "#.S.............m.....C........m...........#",
        "##############.....##########.....##########",
        "#.............^^^^^..........^^^^^.........#",
        "############################################"
      ]),
      script: [["RK",1],["",10],["R",1],["RJ",1],["R",1],["",2],["RJ",1],["",3],["R",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["R",1],["",2],["R",1],["",2],["R",2],["",1],["RJ",1],["LJ",1],["RJ",1],["",2],["RK",1],["",10],["R",1],["",1],["R",2],["RJ",1],["",1],["R",1],["",1],["LJ",1],["R",1],["RJ",1],["",2],["RJ",1],["",4],["RK",1],["",10],["R",1],["RJ",1],["R",1],["",2],["R",1],["",2],["R",1],["",4],["R",1],["",2],["R",1],["RJ",1],["LJ",1],["RK",1],["",10],["R",1],["RJ",1],["",3],["R",1],["",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["LJ",1],["RJ",1],["",1],["LJ",1],["RJ",1],["",1],["RK",1],["",7]]
    },
    {
      id: 5,
      name: "\u5cf0",
      en: "SUMMIT",
      lead: "\u3059\u3079\u3066\u306e\u9053\u9806\u3067\u3001\u76f4\u306b\u3001\u5cf0\u3078\u3002",
      rows: box([
        "################################",
        "#..............................#",
        "#..............................#",
        "#..............................#",
        "#..............................#",
        "#.......................G~.....#",
        "#....................#######...#",
        "#..............................#",
        "#............#####.............#",
        "#..............................#",
        "#.....~....o...................#",
        "#....#####.....................#",
        "#..............................#",
        "#........o.d...................#",
        "#............#####.............#",
        "#..............................#",
        "#..............................#",
        "#....#####.....................#",
        "#..............................#",
        "#.S..C.........................#",
        "################################",
        "################################"
      ]),
      script: [["RK",1],["",10],["R",1],["",1],["R",1],["RJ",1],["",2],["R",1],["",2],["R",1],["",2],["R",1],["",4],["RJ",2],["LJ",1],["RJ",1],["",1],["LJ",3],["RJ",1],["LJ",5],["RJ",4],["LJ",2],["",2],["LJ",5],["RJ",1],["RK",1],["",10],["R",1],["",1],["R",2],["",1],["LJ",2],["",5],["LJ",1],["L",1],["",1],["L",1],["R",1],["",1],["LJ",2],["RJ",1],["LJ",2],["RJ",3],["LJ",2],["RJ",1],["LJ",2],["RJ",2],["LJ",1],["",2],["RK",1],["",10],["R",1],["RJ",1],["R",1],["",2],["R",1],["",7],["R",1],["LJ",1],["L",1],["R",1],["L",1],["RK",1],["",10],["LJ",1],["",3],["R",2],["",1],["LJ",15],["",1],["LJ",1],["",4],["L",1],["RK",1],["",13],["L",1],["LJ",14],["",1],["LJ",1],["",3],["RK",1],["",11],["LJ",16],["",4],["RK",1],["",11],["L",1],["LJ",15],["",1],["LK",1],["",4]]
    }
  ];  /* ------------------------------------------------------------- geometry -- */

  function parseLevel(rows) {
    const tiles = rows.map((r) => r.split(""));
    const h = tiles.length;
    const w = tiles[0].length;
    for (let y = 0; y < h; y++) {
      if (tiles[y].length !== w) {
        throw new Error("ragged level rows: " + tiles.map((r) => r.length).join(","));
      }
    }

    // Flat lookup so collision stays O(1) per probe at 120 Hz.
    const solid = new Uint8Array(w * h);
    const spike = new Uint8Array(w * h);
    const spikeDir = new Array(w * h).fill("");
    let start = null;
    let goal = null;
    const movers = [];
    const spinners = [];
    const drones = [];
    const checkpoints = [];
    const pearls = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = tiles[y][x];
        const kind = KIND[ch];
        if (!kind) throw new Error("unknown level glyph: " + JSON.stringify(ch));
        const i = y * w + x;
        if (kind === "solid") solid[i] = 1;
        else if (kind === "spike") { spike[i] = 1; spikeDir[i] = ch; }
        else if (kind === "start") start = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
        else if (kind === "goal") goal = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
        else if (kind === "checkpoint") checkpoints.push({ x, y, taken: false });
        else if (kind === "pearl") pearls.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, taken: false });
        else if (kind === "mover") movers.push(makeMover(x, y, ch));
        else if (kind === "spinner") spinners.push(makeSpinner(x, y));
        else if (kind === "drone") drones.push(makeDrone(x, y));
      }
    }
    if (!start) throw new Error("level has no start tile");
    if (!goal) throw new Error("level has no goal tile");

    return {
      rows, w, h, tiles, solid, spike, spikeDir,
      movers, spinners, drones, checkpoints, pearls,
      start, goal,
      pixelW: w * TILE, pixelH: h * TILE
    };
  }

  function solidAt(map, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    return map.solid[ty * map.w + tx] === 1;
  }

  /* Movers swing between two points, are solid, and carry the player. */
  function makeMover(x, y, ch) {
    const vertical = ch === "M";
    return {
      w: TILE, h: TILE,
      ox: x * TILE, oy: y * TILE,
      x: x * TILE, y: y * TILE,
      px: x * TILE, py: y * TILE,
      vertical,
      range: 1.9 * TILE,
      speed: vertical ? 0.9 : 1.15,
      phase: ((x * 7 + y * 13) % 100) / 100 * Math.PI * 2
    };
  }

  function makeSpinner(x, y) {
    return {
      x: x * TILE + TILE / 2,
      y: y * TILE + TILE / 2,
      arm: 1.5 * TILE,
      thick: 4.5,
      angle: ((x * 5 + y * 11) % 100) / 100 * Math.PI * 2,
      speed: 2.0
    };
  }

  /* Sentries patrol vertically. A horizontal sweeper at ledge height is an
   * unavoidable death the moment the player lands; a rising and falling one is
   * a timing gate the player can see coming and wait out. */
  function makeDrone(x, y) {
    return {
      ox: x * TILE + TILE / 2,
      oy: y * TILE + TILE / 2,
      x: x * TILE + TILE / 2,
      y: y * TILE + TILE / 2,
      range: 2.2 * TILE,
      speed: 1.0,
      phase: ((x * 3 + y * 5) % 100) / 100 * Math.PI * 2,
      w: 13, h: 12
    };
  }

  /* ---------------------------------------------------------------- state -- */

  /* rows is an optional override. Tests need a bare arena to measure physics on,
   and reaching for it by swapping LEVELS does not work: LEVELS is read from
   this closure, so reassigning the exported property leaves createState still
   building the first real stage. Every fixture test silently measured stage 1
   that way, which is worse than no fixture at all. */
function createState(levelIndex, rows) {
    const level = rows
      ? { id: levelIndex, name: "", en: "TEST", lead: "", rows: rows, script: [] }
      : LEVELS[levelIndex];
    if (!level) throw new Error("no such stage: " + levelIndex);
    const map = parseLevel(level.rows);
    const p = {
      x: map.start.x, y: map.start.y,
      vx: 0, vy: 0,
      w: PLAYER_W, h: PLAYER_H,
      onGround: false,
      onWall: 0,
      coyote: 0,
      buffer: 0,
      wallStick: 0,
      facing: 1,
      dashTime: 0,
      dashWait: 0,
      dead: false,
      deadTimer: 0,
      invuln: 0,
      checkpoint: { x: map.start.x, y: map.start.y },
      checkpointIndex: -1,
      jumps: 0,
      wallJumps: 0,
      dashes: 0,
      maxX: map.start.x,
      maxY: map.start.y
    };
    return {
      level, map, levelIndex,
      player: p,
      movers: map.movers.map((m) => Object.assign({}, m)),
      spinners: map.spinners.map((s) => Object.assign({}, s)),
      drones: map.drones.map((d) => Object.assign({}, d)),
      checkpoints: map.checkpoints.map((c) => Object.assign({}, c)),
      pearls: map.pearls.map((c) => Object.assign({}, c)),
      events: [],
      status: "running",
      running: true,
      time: 0,
      pearlsTaken: 0,
      deaths: 0,
      finished: false,
      finishTime: 0
    };
  }

  function emit(state, ev) { state.events.push(ev); }

  /* ------------------------------------------------------------- collision -- */

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function boxHitsMap(map, box) {
    const x0 = Math.floor(box.x / TILE);
    const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
    const y0 = Math.floor(box.y / TILE);
    const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (solidAt(map, tx, ty)) return true;
      }
    }
    return false;
  }

  function playerBox(p) {
    return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
  }

  function moverBox(m) {
    return { x: m.x, y: m.y, w: m.w, h: m.h };
  }

  /* ---------------------------------------------------------------- update -- */

  function makeInput(flags) {
    const s = typeof flags === "string" ? flags : "";
    return {
      left: s.indexOf("L") >= 0,
      right: s.indexOf("R") >= 0,
      up: s.indexOf("U") >= 0,
      down: s.indexOf("D") >= 0,
      jump: s.indexOf("J") >= 0,
      dash: s.indexOf("K") >= 0,
      jumpPressed: false,
      dashPressed: false
    };
  }

  function updateEntities(state, dt) {
    for (const m of state.movers) {
      m.px = m.x; m.py = m.y;
      m.phase += m.speed * dt;
      const off = Math.sin(m.phase) * m.range;
      m.x = m.ox + (m.vertical ? 0 : off);
      m.y = m.oy + (m.vertical ? off : 0);
    }
    for (const s of state.spinners) s.angle += s.speed * dt;
    for (const d of state.drones) {
      d.phase += d.speed * dt;
      d.x = d.ox;
      d.y = d.oy + Math.sin(d.phase) * d.range;
    }
  }

  function update(state, dt, input) {
    state.events.length = 0;
    if (!state.running) return state.events;

    updateEntities(state, dt);
    const p = state.player;

    if (p.dead) {
      p.deadTimer -= dt;
      if (p.deadTimer <= 0) respawn(state);
      return state.events;
    }

    state.time += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.dashWait > 0) p.dashWait -= dt;

    const inp = input || makeInput("");

    /* --- horizontal --- */
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) p.facing = dir;

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      if (p.dashTime <= 0) p.vx = p.facing * PHYS.run * PHYS.dashEndSpeed;
    } else if (dir !== 0) {
      const accel = p.onGround ? PHYS.groundAccel : PHYS.airAccel;
      p.vx += dir * accel * dt;
      /* Hard clamp, not a proportional pull toward the cap. A pull settles
       * where acceleration equals the pull, which for these constants is
       * 326px/s — the player ran a third faster than the run speed the rest
       * of the design is built on, and the dash barely beat a flat sprint. */
      if (p.vx > PHYS.run) p.vx = PHYS.run;
      else if (p.vx < -PHYS.run) p.vx = -PHYS.run;
    } else {
      const drag = p.onGround ? PHYS.groundFriction : PHYS.airDrag;
      const s = Math.sign(p.vx);
      p.vx -= s * drag * dt;
      if (s !== 0 && Math.sign(p.vx) !== s) p.vx = 0;
    }

    /* --- jump --- */
    /* A touch on the right half raises jump and dash together, and the dash
     * zeroes vy a few lines below — so without this guard the first tap of
     * every attempt was swallowed by the dash and the player never left the
     * ground. The jump owns the frame it fires on; the dash is the next tap. */
    const jumpsAtFrameStart = p.jumps;
    if (inp.jumpPressed) p.buffer = PHYS.buffer;
    else if (p.buffer > 0) p.buffer -= dt;

    if (p.buffer > 0 && p.dashTime <= 0) {
      if (p.onGround || p.coyote > 0) {
        p.vy = PHYS.jump;
        p.onGround = false;
        p.coyote = 0;
        p.buffer = 0;
        p.wallStick = PHYS.wallStick;
        p.jumps++;
        emit(state, { type: "jump" });
      } else if (p.onWall !== 0 && p.wallStick >= 0) {
        p.vy = PHYS.wallJumpY;
        p.vx = -p.onWall * PHYS.wallJumpX;
        p.facing = -p.onWall;
        p.wallStick = -1;
        p.buffer = 0;
        p.jumps++;
        p.wallJumps++;
        emit(state, { type: "wallJump", away: p.facing });
      }
    }

    // Variable jump height: releasing while rising bleeds the climb off.
    if (!inp.jump && p.vy < 0 && p.dashTime <= 0) {
      p.vy *= Math.pow(PHYS.jumpCut, dt * 60);
    }

    // Wall slide clamps the fall while a wall is in reach.
    if (!p.onGround && p.onWall !== 0 && p.vy > 0) {
      if (p.vy > PHYS.wallSlide) p.vy = PHYS.wallSlide;
      p.wallStick = Math.max(0, p.wallStick - dt);
    } else if (p.onGround) {
      p.wallStick = PHYS.wallStick;
    } else {
      p.wallStick = Math.min(PHYS.wallStick, p.wallStick + dt);
    }

    /* --- dash --- */
    if (inp.dashPressed && p.dashWait <= 0 && p.jumps === jumpsAtFrameStart) {
      p.dashTime = PHYS.dashTime;
      p.dashWait = PHYS.dashWait;
      p.vy = 0;
      p.vx = p.facing * PHYS.dashSpeed;
      p.dashes++;
      emit(state, { type: "dash", dir: p.facing });
    }

    /* --- gravity --- */
    if (p.dashTime > 0) p.vy = 0;
    else {
      p.vy += PHYS.gravity * dt;
      if (p.vy > PHYS.maxFall) p.vy = PHYS.maxFall;
    }

    /* --- carried by a mover --- */
    for (const m of state.movers) {
      const dx = m.x - m.px;
      const dy = m.y - m.py;
      if (!dx && !dy) continue;
      if (rectsOverlap(playerBox(p), moverBox(m))) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!boxHitsMap(state.map, playerBox({ x: nx, y: ny, w: p.w, h: p.h }))) {
          p.x = nx;
          p.y = ny;
        }
      }
    }

    /* --- move, X then Y --- */
    /* Wall contact is decided by geometry, not by whether this frame happened
     * to be blocked. A substepped AABB alternates between "moved" and
     * "blocked" while resting against a face, so deriving contact from the
     * collision made the wall flag flicker on and off every other frame, which
     * visibly stuttered the slide and kept resetting the wall-jump window.
     * The probe band is the middle of the body, so a floor the player stands
     * on never registers as a wall. */
    p.onWall = 0;
    const bandY = p.y - p.h * 0.36;
    const bandH = p.h * 0.72;
    if (boxHitsMap(state.map, { x: p.x - p.w / 2 - 1, y: bandY, w: 2, h: bandH })) p.onWall = -1;
    else if (boxHitsMap(state.map, { x: p.x + p.w / 2 - 1, y: bandY, w: 2, h: bandH })) p.onWall = 1;

    moveAxis(state, p, p.vx * dt, 0);

    const wasOnGround = p.onGround;
    p.onGround = false;
    moveAxis(state, p, 0, p.vy * dt);

    if (p.onGround) p.coyote = PHYS.coyote;
    else if (wasOnGround) p.coyote = PHYS.coyote;
    else if (p.coyote > 0) p.coyote -= dt;

    if (p.x > p.maxX) p.maxX = p.x;
    if (p.y < p.maxY) p.maxY = p.y;

    /* --- hazards --- */
    if (checkSpikes(state, p)) return state.events;
    if (checkSpinners(state, p)) return state.events;
    if (checkDrones(state, p)) return state.events;

    /* --- pickups --- */
    for (const c of state.checkpoints) {
      if (c.taken) continue;
      if (Math.abs(c.x * TILE + TILE / 2 - p.x) < TILE && Math.abs(c.y * TILE + TILE / 2 - p.y) < TILE) {
        c.taken = true;
        p.checkpoint = { x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 };
        p.checkpointIndex = state.checkpoints.indexOf(c);
        emit(state, { type: "checkpoint", index: p.checkpointIndex });
      }
    }
    for (const q of state.pearls) {
      if (q.taken) continue;
      if (Math.abs(q.x - p.x) < TILE && Math.abs(q.y - p.y) < TILE) {
        q.taken = true;
        state.pearlsTaken++;
        emit(state, { type: "pearl", left: state.pearls.length - state.pearlsTaken });
      }
    }

    /* --- goal --- */
    const g = state.map.goal;
    if (Math.abs(g.x - p.x) < TILE && Math.abs(g.y - p.y) < TILE) {
      state.finished = true;
      state.running = false;
      state.finishTime = state.time;
      emit(state, { type: "goal", time: state.time });
    }

    return state.events;
  }

  /* Swept per axis in small substeps so fast motion cannot tunnel through a tile. */
  function moveAxis(state, p, dx, dy) {
    const longest = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(1, Math.ceil(longest / 4));
    const sx = dx / steps;
    const sy = dy / steps;
    const map = state.map;

    for (let i = 0; i < steps; i++) {
      if (sx !== 0) {
        const nx = p.x + sx;
        if (boxHitsMap(map, playerBox({ x: nx, y: p.y, w: p.w, h: p.h }))) {
          p.vx = 0;
        } else {
          p.x = nx;
        }
      }

      if (sy !== 0) {
        const ny = p.y + sy;
        if (boxHitsMap(map, playerBox({ x: p.x, y: ny, w: p.w, h: p.h }))) {
          if (sy > 0) {
            p.onGround = true;
            emit(state, { type: "land" });
          }
          p.vy = 0;
        } else {
          p.y = ny;
        }
      }

      // Solid movers behave like ground and like ceilings.
      for (const m of state.movers) {
        const box = playerBox(p);
        const mb = moverBox(m);
        if (!rectsOverlap(box, mb)) continue;
        if (sy > 0 && (box.y + box.h) - mb.y < 10) { p.onGround = true; p.vy = 0; }
        else if (sy < 0 && (mb.y + mb.h) - box.y < 10) { p.vy = Math.max(p.vy, -PHYS.stepUp * 6); }
        else if (sy === 0 && (box.y + box.h) - mb.y < 6) { p.onGround = true; }
      }
    }
  }

  /* --------------------------------------------------------------- hazards -- */

  function checkSpikes(state, p) {
    if (p.invuln > 0) return false;
    const map = state.map;
    const box = playerBox(p);
    const x0 = Math.floor(box.x / TILE), x1 = Math.floor((box.x + box.w - 0.001) / TILE);
    const y0 = Math.floor(box.y / TILE), y1 = Math.floor((box.y + box.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
        if (map.spike[ty * map.w + tx]) {
          // Only the facing third of the cell bites, so a spike you skim past
          // does not read as a hit.
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          const dir = map.spikeDir[ty * map.w + tx];
          let hit = false;
          if (dir === "^") hit = p.y + p.h / 2 > cy - 1;
          else if (dir === "v") hit = p.y - p.h / 2 < cy + 1;
          else if (dir === "<") hit = p.x - p.w / 2 < cx + 1;
          else hit = p.x + p.w / 2 > cx - 1;
          if (hit && Math.abs(cx - p.x) < TILE * 0.72 && Math.abs(cy - p.y) < TILE * 0.72) {
            kill(state, "spike");
            return true;
          }
        }
      }
    }
    return false;
  }

  function checkSpinners(state, p) {
    if (p.invuln > 0) return false;
    for (const s of state.spinners) {
      for (let k = 0; k < 2; k++) {
        const a = s.angle + k * Math.PI;
        const ex = s.x + Math.cos(a) * s.arm;
        const ey = s.y + Math.sin(a) * s.arm;
        if (pointSegDistance(p.x, p.y, s.x, s.y, ex, ey) < s.thick + PLAYER_W * 0.3) {
          kill(state, "spinner");
          return true;
        }
      }
    }
    return false;
  }

  function checkDrones(state, p) {
    if (p.invuln > 0) return false;
    const box = playerBox(p);
    for (const d of state.drones) {
      if (rectsOverlap(box, { x: d.x - d.w / 2, y: d.y - d.h / 2, w: d.w, h: d.h })) {
        kill(state, "drone");
        return true;
      }
    }
    return false;
  }

  function pointSegDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function kill(state, cause) {
    const p = state.player;
    if (p.dead) return;
    p.dead = true;
    p.deadTimer = RESPAWN_DELAY;
    p.vx = 0;
    p.vy = 0;
    p.dashTime = 0;
    state.deaths++;
    emit(state, { type: "death", cause, x: p.x, y: p.y });
  }

  function respawn(state) {
    const p = state.player;
    p.x = p.checkpoint.x;
    p.y = p.checkpoint.y;
    p.vx = 0;
    p.vy = 0;
    p.dead = false;
    p.invuln = INVULN;
    p.dashTime = 0;
    p.dashWait = 0;
    emit(state, { type: "respawn" });
  }

  /* --------------------------------------------------------- script replay -- */

  /* A script is a list of [intent, frames]. The intent holds keys: L/R move,
   * J jump, K dash. jumpPressed and dashPressed come from the rising edge,
   * which is what a human key press means. Frames rather than seconds, so a
   * replay is exactly the simulation the solver ran -- no float drift.
   * The array is never mutated, so a stage can be replayed many times. */
  function runScript(state, script, dt) {
    const step = dt || DT;
    let index = 0;
    let remaining = script.length ? script[0][1] : 0;
    let prevJump = false;
    let prevDash = false;
    let total = 0;
    for (const pair of script) total += pair[1];

    let guard = total + 240;
    while (guard-- > 0) {
      const intent = index < script.length ? script[index][0] : "";
      const input = makeInput(intent);
      input.jumpPressed = input.jump && !prevJump;
      input.dashPressed = input.dash && !prevDash;
      prevJump = input.jump;
      prevDash = input.dash;

      update(state, step, input);
      if (state.finished || !state.running) break;

      if (index < script.length) {
        remaining--;
        if (remaining <= 0) {
          index++;
          remaining = index < script.length ? script[index][1] : 0;
        }
      }
    }
    return state;
  }

  const api = {
    TILE, DT, PHYS, PLAYER_W, PLAYER_H, LEVELS, KIND,
    RESPAWN_DELAY, INVULN,
    parseLevel, createState, update, makeInput, runScript,
    rectsOverlap, pointSegDistance, solidAt
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  return api;
});