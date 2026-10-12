const test = require("node:test");
const assert = require("node:assert/strict");
const levels = require("../gpt6-sol/levels.js");
const rules = require("../gpt6-sol/rules.js");

const route = require("./helpers/reprise-solve.cjs");

test("all twelve scenes can be performed, including their optional script fragments", () => {
  assert.equal(levels.length, 12);
  for (const level of levels) {
    assert.ok(level.fragment, `${level.name} has a fragment`);
    assert.equal(level.plates.length, level.echoes, `${level.name} has one footlight per echo`);
    const echoes = [];
    for (const plate of level.plates) {
      const path = route(level, echoes, plate);
      assert.ok(path, `${level.name}: can reach footlight ${echoes.length + 1}`);
      echoes.push(path);
    }
    const clear = route(level, echoes, level.goal);
    assert.ok(clear, `${level.name}: can reach final spotlight`);
    assert.ok(rules.simulate(level, echoes, clear).complete);
    const full = route(level, echoes, level.goal, true);
    assert.ok(full, `${level.name}: can collect fragment and finish within ${level.beats} beats`);
    const result = rules.simulate(level, echoes, full);
    assert.ok(result.complete && result.collected);
    assert.ok(rules.validateTake(level, echoes, full));
  }
});

test("curtains open only while every footlight is illuminated", () => {
  const level = levels[0];
  const blocked = rules.simulate(level, [], ["R", "R"]);
  assert.deepEqual(blocked.lit, [false]);
  assert.throws(() => rules.simulate(level, [], ["R", "R", "R"]), /Blocked/);
  const echo = [["D", "D", "D"]];
  const waiting = rules.simulate(level, echo, ["R", "R", "W"]);
  assert.deepEqual(waiting.lit, [true]);
  const through = rules.simulate(level, echo, ["R", "R", "W", "R"]);
  assert.deepEqual(through.actors[0], [4, 1]);
});

test("timed curtains wait for an even beat after both echoes arrive", () => {
  const level = levels[4];
  const echoes = [["D", "D", "D", "D"], ["R", "R", "R", "R", "D", "D", "D", "D", "D", "D"]];
  const approach = ["R", "R", "R", "R", ...Array(6).fill("W")];
  const waiting = rules.simulate(level, echoes, approach);
  assert.deepEqual(waiting.lit, [true, true]);
  assert.equal(rules.canMove(level, echoes, approach, "R"), false, "eleventh beat is closed");
  assert.equal(rules.canMove(level, echoes, [...approach, "W"], "R"), true, "twelfth beat opens");
});

test("invalid saved performances cannot be resumed", () => {
  const level = levels[0];
  assert.ok(rules.validateTake(level, [["D", "D", "D"]], ["R", "R", "W", "R"]));
  assert.equal(rules.validateTake(level, [["D", "D", "D", "X"]], []), false);
  assert.equal(rules.validateTake(level, [], ["R", "R", "R"]), false);
  assert.equal(rules.validateTake(level, [[], []], []), false);
  assert.equal(rules.validateTake(level, [["R"]], []), false, "an echo must finish on a footlight");
  assert.equal(rules.validateTake(level, [], Array(level.beats + 1).fill("W")), false);
});
