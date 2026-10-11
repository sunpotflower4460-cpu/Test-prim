const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../kake/sim.js");
const book = require("../kake/levels.js");

function go(n) { return { n: n, right: 1 }; }
function hop(n) { return { n: n, right: 1, jump: 1 }; }

test("each roof reaches the lantern on its route, and the wrong route does not", () => {
  assert.equal(book.levels.length, 6);
  for (const level of book.levels) {
    const won = sim.play(level, level.script);
    assert.equal(won.won, true, level.id);
    for (const fail of level.fail) {
      const lost = sim.play(level, fail);
      assert.equal(lost.won, false, level.id);
    }
  }
});

test("the first gap stays crossable through a stretch of the run", () => {
  const eave = book.levels[0];
  for (const n of [72, 80, 94]) {
    assert.equal(sim.play(eave, [go(n), hop(1), go(160)]).won, true, "jump at " + n);
  }
  assert.equal(sim.play(eave, [go(40), hop(1), go(160)]).won, false);
});

test("the left edge of a roof is a wall, not a hidden drop", () => {
  const eave = book.levels[0];
  let state = sim.create(eave);
  for (let i = 0; i < 180; i++) state = sim.step(state, eave, { left: true });
  assert.equal(state.dead, false);
  assert.ok(state.x > 0 && state.x < 20, "the runner stays on the first tiles, x=" + state.x);
  assert.equal(state.ground, true);
  for (let i = 0; i < 120; i++) state = sim.step(state, eave, { left: true, jump: i === 0 });
  assert.equal(state.dead, false);
  assert.ok(state.x > 0 && state.x < 20, "a jump against the wall stays on the roof, x=" + state.x);
  assert.equal(state.ground, true);
});

test("a dash cuts the bat, and a sprint does not open the shutter", () => {
  const bat = book.levels.find(level => level.id === "bat");
  const gate = book.levels.find(level => level.id === "shutter");
  const leaps = book.levels.find(level => level.id === "leaps");
  const cut = sim.play(bat, bat.script);
  assert.equal(cut.won, true);
  assert.equal(cut.state.enemies[0].alive, false);
  const blocked = sim.play(gate, gate.fail);
  assert.equal(blocked.won, false);
  assert.ok(blocked.x < gate.gates[0].x + 4, "the shutter still holds the runner");
  assert.equal(sim.play(leaps, leaps.fail).dead, true);
});
