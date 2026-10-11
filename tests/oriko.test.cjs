"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const optics = require("../oriko/optics.js");
const book = require("../oriko/levels.js");

test("nine rooms are solved by their authored placement, including the moon breath", () => {
  assert.equal(book.levels.length, 9);
  const ids = new Set();
  for (const level of book.levels) {
    assert.ok(!ids.has(level.id), "duplicate room " + level.id);
    ids.add(level.id);
    assert.ok(level.name && level.letter && level.hint);
    assert.ok(optics.holds(level, level.solution), level.id + " stays lit for the whole breath");
    assert.equal(optics.holds(level, []), false, level.id + " is dark until something is placed");
  }
});

test("a red flower ignores white light and opens under a red pane", () => {
  const level = book.levels.find(room => room.id === "only-red");
  const white = optics.trace(level, [], 0);
  assert.ok(white.seen[0].indexOf(optics.WHITE) >= 0, "the unfiltered moon reaches the flower");
  assert.equal(white.ok, false);
  assert.equal(optics.trace(level, level.solution, 0).ok, true);
});

test("flowers do not stop a beam, and a wall does", () => {
  const buds = book.levels.find(room => room.id === "two-buds");
  const both = optics.trace(buds, buds.solution, 0);
  assert.equal(both.ok, true);
  assert.ok(both.seen[0].length && both.seen[1].length);
  const walled = book.levels.find(room => room.id === "past-the-wall");
  const blocked = optics.trace(walled, [walled.solution[0]], 0);
  assert.equal(blocked.ok, false, "one mirror still leaves the flower behind the wall");
});

test("a crystal splits one moon into two colors", () => {
  const level = book.levels.find(room => room.id === "two-colors");
  const cast = optics.trace(level, level.solution, 0);
  assert.ok(cast.seen[0].indexOf(optics.R) >= 0);
  assert.ok(cast.seen[1].indexOf(optics.B) >= 0);
  assert.equal(cast.ok, true);
});

test("the breathing moon rejects a mirror that only works at the center of the breath", () => {
  const level = book.levels.find(room => room.id === "moon-breath");
  const aimed = level.solution.slice();
  assert.equal(optics.sampleReport(level, aimed).every(Boolean), true);
  const shifted = [{ type: "mirror", x: 70, y: 40, rot: Math.PI / 4, length: 10 }];
  assert.equal(optics.holds(level, shifted), false);
});
