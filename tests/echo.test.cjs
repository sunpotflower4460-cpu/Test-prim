"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const sim = require("../echo/sim.js");
const levels = require("../echo/levels.js");

function makeLevel(rows, extra) {
  return Object.assign({
    id: 99, name: "test", en: "TEST", hint: "", note: "",
    loop: 6, maxLoops: 3, par: 2, rows, doors: []
  }, extra || {});
}

test("all ten floors are solvable with their model solution", () => {
  assert.equal(levels.length, 10);
  for (const level of levels) {
    const parsed = sim.parseLevel(level);
    const result = sim.simulate(parsed, level.solution);
    assert.equal(result.status, "won", "floor " + level.id + " (" + level.name + ") -> " + result.status);
    assert.equal(result.loop, level.solution.length, "floor " + level.id + " clears on the planned loop");
    assert.ok(level.solution.length <= level.maxLoops, "floor " + level.id + " fits in " + level.maxLoops + " loops");
    assert.ok(sim.starsFor(parsed, result.loop) >= 2, "floor " + level.id + " model solution is near par");
    for (const plan of level.solution) {
      assert.ok(plan.length <= level.loop, "floor " + level.id + " loop fits " + level.loop + " turns");
      for (const action of plan) assert.ok(sim.ACTIONS.includes(action), "floor " + level.id + " action " + action);
    }
  }
});

test("floor data is consistent: unique ids, chapters and goals", () => {
  const seen = new Set();
  for (const level of levels) {
    assert.ok(!seen.has(level.id), "floor ids are unique");
    seen.add(level.id);
    assert.ok(Number.isInteger(level.chapter) && level.chapter >= 0 && level.chapter <= 3, "floor " + level.id + " has a music chapter");
    assert.ok(level.par >= 1 && level.par <= level.maxLoops, "floor " + level.id + " par sits inside the loop budget");
    const parsed = sim.parseLevel(level);
    assert.equal(parsed.tiles[parsed.goal.y][parsed.goal.x], "G", "floor " + level.id + " keeps its goal tile");
    assert.equal(parsed.tiles[parsed.start.y][parsed.start.x], ".", "floor " + level.id + " start is a free tile");
  }
});

test("parseLevel rejects broken floors instead of producing holes", () => {
  assert.throws(() => sim.parseLevel({ id: 1, rows: [] }), /empty/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["....", "..."] }), /ragged/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["#####", "#@@.#", "#..G#", "#####"] }), /two starts/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["#####", "#@..#", "#####"] }), /no goal/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["#####", "#@X.#", "#..G#", "#####"] }), /unknown tile/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["####", "#@.#", "#.G#", "####"], doors: [{ x: 2, y: 1, needs: [1] }] }), /not on a D/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["####", "#@D#", "#1G#", "####"], doors: [{ x: 2, y: 1, needs: [2] }] }), /missing plate/);
  assert.throws(() => sim.parseLevel({ id: 1, rows: ["####", "#@D#", "#1G#", "####"] }), /disagree/);
});

test("echoes replay past loops and may share a cell with the player", () => {
  const level = sim.parseLevel(makeLevel(["######", "#@...#", "#....#", "#1..G#", "######"], { loop: 5, maxLoops: 3 }));
  const session = sim.createSession(level);
  for (const action of ["down", "down", "wait", "wait", "wait"]) sim.advance(session, action);
  assert.equal(session.loop, 2, "time rewound into the second loop");
  assert.equal(session.world.echoes.length, 1, "the past self became an echo");
  assert.deepEqual(session.world.echoes[0], { x: 1, y: 1 }, "an echo waits at the start until its record plays");
  const events = sim.advance(session, "down");
  assert.deepEqual(session.world.player, { x: 1, y: 2 });
  assert.deepEqual(session.world.echoes[0], { x: 1, y: 2 }, "the echo walks its own record");
  assert.ok(events.some(e => e.type === "move" && e.actor === 0));
  sim.advance(session, "down");
  assert.deepEqual(session.world.player, { x: 1, y: 3 }, "the player may stand on the echo");
  assert.deepEqual(session.world.echoes[0], { x: 1, y: 3 });
  sim.advance(session, "right");
  assert.deepEqual(session.world.player, { x: 2, y: 3 }, "the player may overtake the echo");
  assert.deepEqual(session.world.echoes[0], { x: 1, y: 3 });
});

test("walls and closed doors block movement, open doors let everyone through", () => {
  const level = sim.parseLevel(makeLevel(
    ["#######", "#@....#", "#1...D#", "#....G#", "#######"],
    { loop: 6, maxLoops: 3, doors: [{ x: 5, y: 2, needs: [1] }] }
  ));
  const session = sim.createSession(level);
  let events = sim.advance(session, "left");
  assert.ok(events.some(e => e.type === "stay" && e.blocked === true), "a wall blocks the player");
  assert.deepEqual(session.world.player, { x: 1, y: 1 });
  assert.equal(sim.walkable(session.world, 5, 2), false, "a door without its plate is a wall");
  events = sim.advance(session, "down");
  assert.ok(events.some(e => e.type === "plate" && e.id === 1 && e.on === true), "the plate lights up");
  assert.ok(events.some(e => e.type === "door" && e.index === 0 && e.open === true), "the door opens");
  assert.equal(sim.walkable(session.world, 5, 2), true);
  for (let i = 0; i < 4; i++) sim.advance(session, "wait");
  assert.equal(session.loop, 2, "the first loop became an echo");
  assert.equal(session.world.echoes.length, 1);
  // 2周目: エコーがプレートを守っているあいだに、プレイヤーがドアをくぐる
  for (let i = 0; i < 4; i++) sim.advance(session, "right");
  sim.advance(session, "down");
  assert.deepEqual(session.world.player, { x: 5, y: 2 }, "the player steps onto the open door");
  events = sim.advance(session, "down");
  assert.ok(events.some(e => e.type === "win"), "the goal waits beyond the door");
  assert.equal(session.status, "won");
  assert.deepEqual(session.world.echoes[0], { x: 1, y: 2 }, "the echo still guards the plate");
});

test("doors with two plates wait for both lights", () => {
  const level = sim.parseLevel(makeLevel(
    ["#######", "#@....#", "#1.D.2#", "#....G#", "#######"],
    { loop: 12, maxLoops: 3, doors: [{ x: 3, y: 2, needs: [1, 2] }] }
  ));
  const session = sim.createSession(level);
  // 1周目: プレート1の上で時間をまつ
  let events = sim.advance(session, "down");
  assert.ok(events.some(e => e.type === "plate" && e.id === 1 && e.on === true));
  assert.ok(!events.some(e => e.type === "door" && e.open === true), "one plate is not enough");
  assert.equal(sim.walkable(session.world, 3, 2), false);
  for (let i = 0; i < 11; i++) sim.advance(session, "wait");
  assert.equal(session.loop, 2, "the first loop became an echo on the plate");
  // 2周目: エコーがプレート1を守り、プレイヤーがプレート2へ
  sim.advance(session, "up");
  for (let i = 0; i < 4; i++) sim.advance(session, "right");
  events = sim.advance(session, "down");
  assert.ok(events.some(e => e.type === "plate" && e.id === 2 && e.on === true));
  assert.ok(events.some(e => e.type === "door" && e.open === true), "both plates open the door");
  assert.equal(sim.walkable(session.world, 3, 2), true);
});

test("the tower rewinds when a loop fills and collapses after the last loop", () => {
  const level = sim.parseLevel(makeLevel(["####", "#@.#", "#.G#", "####"], { loop: 3, maxLoops: 2 }));
  const session = sim.createSession(level);
  sim.advance(session, "right");
  sim.advance(session, "right");
  const events = sim.advance(session, "wait");
  assert.ok(events.some(e => e.type === "rewind"), "the last turn of the loop rewinds time");
  assert.equal(session.loop, 2);
  assert.equal(session.world.echoes.length, 1);
  assert.deepEqual(session.world.player, { x: 1, y: 1 }, "the player is back at the start of the loop");
  sim.advance(session, "wait");
  sim.advance(session, "wait");
  sim.advance(session, "wait");
  assert.equal(session.status, "exhausted", "the last loop ends the climb");
});

test("undo rewinds the current loop only, keeping the echoes of the past", () => {
  const level = sim.parseLevel(makeLevel(["#####", "#@..#", "#..G#", "#####"], { loop: 3, maxLoops: 3 }));
  const session = sim.createSession(level);
  for (const action of ["right", "right", "wait"]) sim.advance(session, action);
  assert.equal(session.loop, 2);
  sim.advance(session, "down");
  sim.advance(session, "right");
  assert.equal(session.plans[1].length, 2);
  sim.undo(session, false);
  assert.equal(session.plans[1].length, 1);
  assert.equal(session.loop, 2, "the first loop and its echo stay");
  assert.equal(session.world.echoes.length, 1);
  assert.deepEqual(session.world.player, { x: 1, y: 2 }, "undo replays the turns that remain");
  sim.undo(session, true);
  assert.equal(session.plans[1].length, 0);
  assert.deepEqual(session.world.player, { x: 1, y: 1 });
  assert.equal(session.plans[0].length, 3, "undo never eats the recorded past");
});

test("skipLoop fills the rest of the loop with waits", () => {
  const level = sim.parseLevel(makeLevel(["#####", "#@..#", "#..G#", "#####"], { loop: 4, maxLoops: 3 }));
  const session = sim.createSession(level);
  sim.advance(session, "right");
  sim.skipLoop(session);
  assert.equal(session.plans[0].length, 4);
  assert.equal(session.plans[0][3], "wait");
  assert.equal(session.loop, 2, "skipping to the end of the loop rewinds time");
});

test("a finished session refuses further input", () => {
  const parsed = sim.parseLevel(levels[0]);
  const session = sim.simulate(parsed, levels[0].solution);
  assert.equal(session.status, "won");
  assert.equal(sim.advance(session, "wait"), null);
  assert.equal(sim.skipLoop(session), null);
  assert.equal(sim.undo(session, true), null);
});

test("cleanSave replays recorded loops and drops forged data", () => {
  const parsed = sim.parseLevel(levels[0]);
  const plans = [["right", "right", "right"]];
  const cleaned = sim.cleanSave({
    records: { 1: { stars: 3, loop: 1 } },
    session: { id: 1, plans },
    sound: false,
    last: 1
  }, [parsed]);
  assert.deepEqual(cleaned.records[1], { stars: 3, loop: 1 });
  assert.equal(cleaned.session.id, 1);
  assert.deepEqual(cleaned.session.plans, plans);
  assert.equal(cleaned.sound, false);
  assert.equal(cleaned.last, 1);

  const forged = sim.cleanSave({
    records: { 1: { stars: 0, loop: 1 }, 2: { stars: 3, loop: 99 } },
    session: { id: 1, plans: [["jump"]] },
    last: 999
  }, [parsed]);
  assert.deepEqual(forged.records, {}, "forged records are dropped");
  assert.equal(forged.session, null, "a session with unknown moves is not restored");
  assert.equal(forged.last, 1, "unknown last floor falls back to the first");
  assert.equal(forged.sound, true, "missing toggles default to on");
});

test("stars follow par: within par is three, one loop over is two", () => {
  const level = { par: 3 };
  assert.equal(sim.starsFor(level, 1), 3);
  assert.equal(sim.starsFor(level, 3), 3);
  assert.equal(sim.starsFor(level, 4), 2);
  assert.equal(sim.starsFor(level, 5), 1);
});
