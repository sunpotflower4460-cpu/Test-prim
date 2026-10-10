"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const sim = require("../code-sim.js");

function makeLevel(rows, start, patrols) {
  return { id: 99, name: "test", en: "TEST", hint: "", par: 2, slots: 8, rows, start, patrols: patrols || [] };
}

test("all fifteen stages are solvable with their model solution", () => {
  assert.equal(sim.LEVELS.length, 15);
  for (const level of sim.LEVELS) {
    const result = sim.runProgram(level, level.solution);
    assert.equal(result.status, "won", "stage " + level.id + " (" + level.name + ") -> " + result.status + "/" + result.reason);
    assert.ok(level.solution.length <= level.slots, "stage " + level.id + " solution fits in " + level.slots + " slots");
    assert.ok(sim.starsFor(level, level.solution.length) >= 2, "stage " + level.id + " model solution is near par");
  }
});

test("stage data is consistent: geometry, objectives and patrol routes", () => {
  const seen = new Set();
  for (const level of sim.LEVELS) {
    assert.ok(!seen.has(level.id), "stage ids are unique");
    seen.add(level.id);
    const grid = level.grid;
    assert.ok(grid.exit, "stage " + level.id + " has an exit");
    assert.ok(grid.cores.length + grid.switches.length >= 1, "stage " + level.id + " has an objective");
    assert.equal(grid.w, level.rows[0].length, "stage " + level.id + " rows are rectangular");
    assert.equal(grid.h, level.rows.length);
    assert.equal(sim.tileAt({ ...grid, tiles: grid.tiles }, level.start.x, level.start.y), ".");
    for (const patrol of level.patrols || []) {
      assert.ok(patrol.path.length >= 2, "stage " + level.id + " patrol path can patrol");
      for (const cell of patrol.path) {
        assert.equal(grid.tiles[cell[1]][cell[0]], ".", "stage " + level.id + " patrol walks free floor");
      }
    }
    for (const [x, y] of grid.cores.concat(grid.switches)) {
      assert.notEqual(grid.tiles[y][x], "#", "stage " + level.id + " objectives stand on the map");
    }
  }
});

test("the twin sentries stage fields two patrols as its name promises", () => {
  const level = sim.LEVELS.find(lv => lv.id === 11);
  assert.equal(level.patrols.length, 2, "stage 11 has two sentries");
  for (const patrol of level.patrols) {
    for (const [x, y] of patrol.path) {
      assert.equal(level.grid.tiles[y][x], ".", "sentry walks free floor");
    }
  }
});

test("a stage without an exit cannot be cleared but never crashes", () => {
  const level = makeLevel(["####", "#..#", "#..#", "####"], { x: 1, y: 1, dir: 2 });
  const run = sim.createRun(level);
  assert.equal(run.exit, null, "a level without E has no exit");
  const result = sim.runProgram(level, ["fwd", "fwd", "fwd"]);
  assert.equal(result.status, "exhausted");
  assert.equal(result.reason, "ended");
  assert.equal(result.run.unit.y, 2, "the unit still walks the floor");
  assert.equal(result.run.unit.x, 1);
});

test("validate reports broken programs before they run", () => {
  assert.equal(sim.validate([]).error, "empty");
  assert.equal(sim.validate([{ t: "xx" }]).error, "unknown");
  assert.equal(sim.validate([sim.tokenOf("end")]).error, "extraEnd");
  assert.equal(sim.validate([sim.tokenOf("rep3"), sim.tokenOf("fwd")]).error, "unclosed");
  const tooDeep = [
    sim.tokenOf("rep2"), sim.tokenOf("rep2"), sim.tokenOf("rep2"), sim.tokenOf("rep2"),
    sim.tokenOf("fwd"), sim.tokenOf("end"), sim.tokenOf("end"), sim.tokenOf("end"), sim.tokenOf("end")
  ];
  assert.equal(sim.validate(tooDeep).error, "deep");
  assert.equal(sim.validate([sim.tokenOf("rep2"), sim.tokenOf("fwd"), sim.tokenOf("end")]).ok, true);
  assert.equal(sim.tokenOf("rep1").n, 2, "repeat count is clamped to at least 2");
  assert.equal(sim.tokenOf("rep12").n, 9, "repeat count is clamped to at most 9");
});

test("expand unfolds nested repeats in order and refuses runaway programs", () => {
  const nested = sim.expand([sim.tokenOf("rep2"), sim.tokenOf("rep3"), sim.tokenOf("fwd"), sim.tokenOf("end"), sim.tokenOf("end")]);
  assert.equal(nested.ok, true);
  assert.equal(nested.steps.length, 6);
  const runaway = [
    sim.tokenOf("rep9"), sim.tokenOf("rep9"), sim.tokenOf("rep9"),
    sim.tokenOf("fwd"), sim.tokenOf("fwd"), sim.tokenOf("fwd"), sim.tokenOf("fwd"), sim.tokenOf("fwd"), sim.tokenOf("fwd"),
    sim.tokenOf("end"), sim.tokenOf("end"), sim.tokenOf("end")
  ];
  assert.equal(sim.expand(runaway).error, "tooLong");
});

test("a program of exactly MAX_STEPS is still legal", () => {
  // rep5 * rep5 * rep5 * 32 fwd = 4000 = MAX_STEPS; the walk already caps the list,
  // so the outer bound must not reject the boundary value.
  const prog = [
    sim.tokenOf("rep5"), sim.tokenOf("rep5"), sim.tokenOf("rep5"),
    ...Array.from({ length: 32 }, () => sim.tokenOf("fwd")),
    sim.tokenOf("end"), sim.tokenOf("end"), sim.tokenOf("end")
  ];
  const plan = sim.expand(prog);
  assert.equal(plan.error, undefined, "boundary program is not tooLong");
  assert.equal(plan.ok, true);
  assert.equal(plan.steps.length, 4000);
});

test("a ragged level is rejected instead of producing holes", () => {
  assert.throws(() => sim.parseGrid([".....", "..."]), /ragged/);
  assert.equal(sim.tileAt({ w: 3, h: 2, tiles: [["a", "b", "c"], ["a"]] }, 2, 1), "#");
});

test("a one-cell patrol path bounces instead of crashing", () => {
  const level = makeLevel(["......", "..C...", "..S...", "......", "......", "..E..."], { x: 1, y: 1 },
    [{ path: [[3, 2]], at: 0, dir: 1 }]);
  const result = sim.runProgram(level, ["fwd", "fwd", "fwd", "end"]);
  assert.ok(result.status !== undefined);
});

test("jump clears hazards but cannot be used as a free shortcut", () => {
  const level = sim.LEVELS[0];
  const hop = sim.runProgram(level, ["jump"]);
  assert.equal(hop.status, "exhausted");
  assert.equal(hop.run.unit.x, level.start.x, "jumping on safe floor does not move the unit");
  assert.equal(hop.run.unit.y, level.start.y);
  const gap = sim.LEVELS.find(lv => lv.id === 5);
  const crossed = sim.runProgram(gap, ["jump"]);
  assert.equal(crossed.run.unit.x, 3, "jump crosses the pit two cells ahead");
  assert.equal(crossed.status, "exhausted");
});

test("sentries advance once per command and can be dodged or collide", () => {
  const rows = ["#####", "#...#", "#...#", "#...#", "#...#", "#####"];
  const level = makeLevel(rows, { x: 1, y: 1, dir: 2 }, [{ path: [[3, 3], [2, 3], [1, 3]] }]);
  const hit = sim.runProgram(level, ["fwd", "fwd"]);
  assert.equal(hit.status, "zapped");
  assert.equal(hit.reason, "patrol");
  const dodged = sim.runProgram(level, ["wait", "fwd", "fwd"]);
  assert.equal(dodged.status, "exhausted");
  assert.equal(dodged.run.unit.x, 1);
  assert.equal(dodged.run.unit.y, 3);
});

test("the exit stays locked until every objective is collected", () => {
  const level = sim.LEVELS.find(lv => lv.id === 8);
  const locked = sim.runProgram(level, ["fwd", "fwd", "fwd", "right", "fwd", "fwd", "fwd"]);
  assert.equal(locked.status, "exhausted", "wandering to the exit without the switch does not clear the stage");
  assert.equal(locked.collected, 0);
  const run = sim.createRun(level);
  let events = [];
  const tokens = ["fwd", "fwd", "fwd", "right", "fwd", "fwd", "fwd"].map(sim.tokenOf);
  for (const token of tokens) events = sim.step(run, token);
  assert.ok(events.some(event => event.type === "locked"), "reaching the exit early reports a locked door");
  const solved = sim.runProgram(level, level.solution);
  assert.equal(solved.status, "won");
  assert.equal(solved.collected, solved.total);
});

test("stars follow par: within par is three, par plus three is two", () => {
  const level = { par: 5 };
  assert.equal(sim.starsFor(level, 1), 3);
  assert.equal(sim.starsFor(level, 5), 3);
  assert.equal(sim.starsFor(level, 6), 2);
  assert.equal(sim.starsFor(level, 8), 2);
  assert.equal(sim.starsFor(level, 9), 1);
});

test("runProgram rejects unknown commands instead of dropping them silently", () => {
  const level = sim.LEVELS[0];
  const result = sim.runProgram(level, ["fwd", "nope", "fwd"]);
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "unknown");
  assert.equal(result.index, 1);
  assert.equal(result.ticks, 0, "nothing runs on an invalid program");
});

test("spikes and pits end the run with their own reason", () => {
  const level = makeLevel(["####", "#..#", "#^.#", "#O.#", "####"], { x: 1, y: 1, dir: 2 });
  const spike = sim.runProgram(level, ["fwd"]);
  assert.equal(spike.status, "crashed");
  assert.equal(spike.reason, "spike");
  const pit = makeLevel(["####", "#..#", "#O.#", "####"], { x: 1, y: 1, dir: 2 });
  const fall = sim.runProgram(pit, ["fwd"]);
  assert.equal(fall.status, "crashed");
  assert.equal(fall.reason, "pit");
});
