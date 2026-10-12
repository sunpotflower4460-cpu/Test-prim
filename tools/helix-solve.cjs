/* Offline solver for HELIX. Finds an input script that reaches a stage's goal.
 *
 *   node tools/helix-solve.cjs [levelIndex] [--verbose] [--seconds=N]
 *
 * This is an AUTHORING tool, not a test. It runs a beam search over the real
 * simulation to produce the timed script stored in helix-sim.js, so "this
 * stage is clearable" is demonstrated by a replay rather than asserted by
 * hand. The test suite replays the stored script; it never runs the search.
 *
 * Three details decide whether this works at all:
 *
 *  - Cost is goal-directed. Sorting by elapsed time alone keeps only the
 *    fastest states, which is a straight line into the floor.
 *  - Selection is stratified by position. Keeping the N cheapest states fills
 *    the beam with one crowd converging on a single wall, and the stage beyond
 *    that wall is never represented. Capping how much any one region of the
 *    map may contribute keeps the whole stage covered.
 *  - The search has a wall-clock budget. A beam that cannot find a route would
 *    otherwise run until the machine dies, and "it was still thinking" is not
 *    an answer. It reports how far it got instead.
 */
"use strict";
const sim = require("../helix-sim.js");

const NL = String.fromCharCode(10);
const DT = 1 / 60;

const ACTIONS = ["", "L", "R", "LJ", "RJ", "LK", "RK", "LKJ", "RKJ"];

function priority(s) {
  const p = s.player;
  const g = s.map.goal;
  return s.deaths * 1200 + Math.hypot(g.x - p.x, g.y - p.y) + s.time * 0.03;
}

/* The key has to separate states the simulation will treat differently, or the
 * dedupe silently deletes the one that could make the next move.
 *
 *  - wallStick gates whether a wall jump is legal, so two states at the same
 *    tile with the same velocity and the same facing wall can still be one
 *    that can jump and one that cannot. Without it the whole chimney collapses
 *    into a single entry.
 *  - The entity phases matter for the same reason. A blade sweeping over the
 *    only crossing is a timing gate, not a wall: two states at the same tile
 *    one frame apart can have the blade pointing in opposite directions, and
 *    dropping one of them makes the stage unclearable even though it is not.
 */
function keyOf(s) {
  const p = s.player;
  return [
    Math.round(p.x / 5), Math.round(p.y / 5),
    Math.round(p.vx / 28), Math.round(p.vy / 28),
    p.onGround ? 1 : 0, p.onWall + 1,
    p.wallStick >= 0 ? 1 : 0, p.coyote > 0 ? 1 : 0, p.buffer > 0 ? 1 : 0,
    p.dashTime > 0 ? 1 : 0, p.dashWait > 0 ? 1 : 0,
    s.spinners.map((o) => Math.round(o.angle * 2)).join("."),
    s.drones.map((d) => Math.round(d.phase * 2)).join("."),
    s.movers.map((m) => Math.round(m.phase * 2)).join("."),
    Math.round(s.time * 30)
  ].join("|");
}

/* A search node is a simulation state plus the bookkeeping the beam needs.
 * Those fields are added after the clone and are never copied forward, so a
 * state never inherits another state's parent chain. */
function clone(s) {
  return {
    level: s.level, map: s.map, levelIndex: s.levelIndex,
    player: Object.assign({}, s.player),
    movers: s.movers.map((m) => Object.assign({}, m)),
    spinners: s.spinners.map((o) => Object.assign({}, o)),
    drones: s.drones.map((d) => Object.assign({}, d)),
    checkpoints: s.checkpoints.map((c) => Object.assign({}, c)),
    pearls: s.pearls.map((p) => Object.assign({}, p)),
    events: [], status: s.status, running: s.running, time: s.time,
    pearlsTaken: s.pearlsTaken, deaths: s.deaths,
    finished: s.finished, finishTime: s.finishTime
  };
}

function advance(node, action) {
  const next = clone(node);
  const input = sim.makeInput(action);
  input.jumpPressed = input.jump && !node.prevJump;
  input.dashPressed = input.dash && !node.prevDash;
  next.prevJump = input.jump;
  next.prevDash = input.dash;
  sim.update(next, DT, input);
  next.cost = priority(next);
  next.action = action;
  next.parent = node;
  return next;
}

/* A dash already in flight or still waiting makes "LK" and "L" the same state.
 * Expanding a wide beam over actions that cannot differ is how a solver turns
 * slow, and this stage has no dash-timing puzzles the search needs to keep. */
function usefulActions(p) {
  if (p.dashTime <= 0 && p.dashWait <= 0) return ACTIONS;
  return ACTIONS.filter((a) => a.indexOf("K") < 0);
}

/* Selection is stratified by where the player is, so one crowded region cannot
 * swallow the whole beam and leave the rest of the stage unrepresented.
 *
 * The quota is a fraction of the beam rather than a fixed number, and that
 * matters. A flat quota looks fine on an open stage, where position spreads
 * across hundreds of buckets and it never binds, and then starves a confined
 * one: the wall-jump chimney is six buckets wide, so a quota of thirty caps the
 * entire beam at a hundred and eighty near-identical states clinging to one
 * wall. Scaling with the beam means the cap only ever binds when one region
 * really is trying to take everything. */
function selectBeam(sorted, beamWidth, quota) {
  const bucket = 2 * sim.TILE;
  const per = new Map();
  const out = [];
  for (const node of sorted) {
    const key = Math.floor(node.player.x / bucket) + ":" + Math.floor(node.player.y / bucket);
    const used = per.get(key) || 0;
    if (used >= quota) continue;
    per.set(key, used + 1);
    out.push(node);
    if (out.length >= beamWidth) break;
  }
  return out;
}

function quotaFor(beamWidth) {
  return Math.max(24, Math.floor(beamWidth / 4));
}

function reconstruct(node) {
  const actions = [];
  let cur = node;
  // "" is a real action, so test for undefined rather than truthiness.
  while (cur && cur.action !== undefined) {
    actions.push(cur.action);
    cur = cur.parent;
  }
  return actions.reverse();
}

function trim(actions) {
  const out = [];
  for (const a of actions) {
    const last = out[out.length - 1];
    if (last && last[0] === a) last[1] += 1;
    else out.push([a, 1]);
  }
  return out;
}

function solve(levelIndex, opts) {
  const options = opts || {};
  const beamWidth = options.beam || 1600;
  const maxSteps = options.steps || 2400;
  const quota = options.quota || quotaFor(beamWidth);
  const budgetMs = options.budgetMs || 0;
  const verbose = !!options.verbose;
  const started = Date.now();

  const root = Object.assign(sim.createState(levelIndex), {
    prevJump: false, prevDash: false, cost: 0, action: undefined, parent: null
  });
  let beam = [root];
  const seen = new Set([keyOf(root)]);
  let best = Infinity;
  let bestTile = null;

  for (let step = 0; step < maxSteps; step++) {
    if (budgetMs && (step & 7) === 0 && Date.now() - started > budgetMs) {
      return { ok: false, reason: "budget", best: best, bestTile: bestTile, wall: Date.now() - started };
    }

    const next = [];
    for (const node of beam) {
      if (node.finished) continue;
      for (const action of usefulActions(node.player)) {
        const child = advance(node, action);
        if (child.finished) {
          return {
            ok: true, script: trim(reconstruct(child)), steps: step + 1,
            deaths: child.deaths, time: child.time, wall: Date.now() - started
          };
        }
        const key = keyOf(child);
        if (seen.has(key)) continue;
        seen.add(key);
        if (child.cost < best) {
          best = child.cost;
          bestTile = [Math.floor(child.player.x / sim.TILE), Math.floor(child.player.y / sim.TILE)];
        }
        next.push(child);
      }
    }
    if (!next.length) break;
    next.sort((a, b) => a.cost - b.cost);
    beam = selectBeam(next, beamWidth, quota);
    if (verbose && step % 200 === 0) {
      process.stderr.write("  step " + step + " beam=" + beam.length +
        " best=" + best.toFixed(1) + " at tile " + bestTile + NL);
    }
  }
  return { ok: false, reason: "exhausted", best: best, bestTile: bestTile, wall: Date.now() - started };
}

/* Re-run a candidate through runScript, the same path the test suite uses.
 * A script the search liked but the replay disagrees with is not a solution. */
function verify(levelIndex, script) {
  const state = sim.createState(levelIndex);
  sim.runScript(state, script);
  return { finished: state.finished, deaths: state.deaths, time: state.time };
}

function main() {
  const argSeconds = process.argv.indexOf("--seconds=");
  const budgetMs = argSeconds >= 0
    ? Number(process.argv[argSeconds].slice("--seconds=".length)) * 1000
    : 120000;
  const verbose = process.argv.indexOf("--verbose") >= 0;
  let only = null;
  for (let i = 2; i < process.argv.length; i++) {
    if (/^[0-9]+$/.test(process.argv[i])) { only = Number(process.argv[i]); break; }
  }

  for (let i = 0; i < sim.LEVELS.length; i++) {
    if (only !== null && i !== only) continue;
    const level = sim.LEVELS[i];
    process.stdout.write("L" + level.id + " " + level.en + " ... ");
    const res = solve(i, { verbose, budgetMs });
    if (res.ok) {
      const proof = verify(i, res.script);
      const tag = proof.finished && proof.deaths === 0 ? "SOLVED" : "REPLAY MISMATCH";
      process.stdout.write(tag + " frames=" + res.steps +
        " sim=" + proof.time.toFixed(2) + "s deaths=" + proof.deaths +
        " wall=" + (res.wall / 1000).toFixed(1) + "s" + NL);
      process.stdout.write(JSON.stringify(res.script) + NL);
    } else {
      process.stdout.write("NO SOLUTION (" + res.reason +
        ", closest " + Math.round(res.best) + "px at tile " + res.bestTile +
        ", wall=" + (res.wall / 1000).toFixed(1) + "s)" + NL);
    }
  }
}

module.exports = { solve, trim, reconstruct, verify, DT, ACTIONS };

if (require.main === module) main();