const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../hebi/sim.js");
const book = require("../hebi/levels.js");

test("each storehouse lets the authored path through and refuses the wrong one", () => {
  assert.equal(book.levels.length, 7);
  for (const level of book.levels) {
    const won = sim.play(level, level.solution);
    assert.equal(won.win, true, level.id);
    assert.ok(won.state.snake.length >= 2, level.id);
    for (const moves of level.fail) {
      const lost = sim.play(level, moves);
      assert.equal(lost.win, false, level.id + " " + moves);
    }
  }
});

test("the crack refuses a long snake and accepts the snake after one shed", () => {
  const molt = book.levels.find(level => level.id === "molt");
  assert.equal(sim.play(molt, "DLD").reason, "slit");
  const shed = sim.play(molt, molt.solution);
  assert.equal(shed.state.snake.length, 5);
});

test("two sheds leave the latch up, and the dish is not a door", () => {
  const once = book.levels.find(level => level.id === "once");
  const latch = book.levels.find(level => level.id === "latch");
  const dish = book.levels.find(level => level.id === "dish");
  assert.equal(sim.play(once, "RDLLULLLLDRRRRDDDDDD").reason, "early");
  assert.equal(sim.play(latch, "DLLDRDDDD").reason, "early");
  assert.equal(sim.play(dish, "D").reason, "dish");
  assert.equal(sim.play(book.levels[0], "L").reason, "self");
});
