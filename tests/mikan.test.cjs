"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const phys = require("../mikan/phys.js");
const book = require("../mikan/levels.js");

test("each evening stays piled with its authored drops and collapses with the bad ones", () => {
  assert.equal(book.levels.length, 6);
  const ids = new Set();
  for (const level of book.levels) {
    assert.ok(!ids.has(level.id));
    ids.add(level.id);
    assert.equal(level.solution.length, level.queue.length);
    assert.equal(level.fail.length, level.queue.length);
    const good = phys.simulate(level, book.pack(level, level.solution));
    assert.equal(good.ok, true, level.id + " should keep " + level.goal + " kept " + good.kept);
    const bad = phys.simulate(level, book.pack(level, level.fail));
    assert.equal(bad.ok, false, level.id + " bad placement should not clear");
  }
});

test("a third mikan stacked under the lamp is singed, while a row is not", () => {
  const level = book.levels.find(night => night.id === "lamp");
  const tower = phys.simulate(level, book.pack(level, level.fail));
  assert.ok(tower.bodies.some(body => body.singed), "the tall stack meets the shade");
  assert.ok(tower.kept < level.goal);
  const row = phys.simulate(level, book.pack(level, level.solution));
  assert.equal(row.bodies.some(body => body.singed), false);
});

test("fruit on the hanging skirt leave the table", () => {
  const level = book.levels[0];
  const cast = phys.simulate(level, book.pack(level, level.fail));
  assert.equal(cast.kept, 0);
  assert.equal(phys.onTable(cast.bodies[0], level), false);
});
