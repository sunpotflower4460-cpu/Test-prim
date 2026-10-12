"use strict";
// MIZUHO (Opus 5.5): the valleys are farmed by the real tools, through the
// real water, from planting to harvest.
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../opus/sim.js");
const Levels = require("../opus/levels.js");
const Script = require("../opus/script.js");
const Solutions = require("../opus/solutions.js");

const idle = [{ op: "wait", s: 30 }, { op: "start" }, { op: "until", t: 1 }];
function play(id, script) {
  const w = Sim.create(Levels.byId(id));
  Script.run(w, script);
  return { w, r: Sim.result(w) };
}

test("eight valleys with unique ids, sane goals and things placed inside the map", () => {
  assert.equal(Levels.LEVELS.length, 8);
  const ids = new Set();
  for (const lv of Levels.LEVELS) {
    assert.ok(!ids.has(lv.id), "unique id " + lv.id); ids.add(lv.id);
    assert.ok(lv.goal < lv.stars[0] && lv.stars[0] < lv.stars[1], lv.id + " star thresholds rise");
    for (const s of lv.springs) assert.ok(s.x > 0 && s.y >= 0 && s.x < lv.w && s.y < lv.h, lv.id + " spring inside");
    for (const h of lv.houses || []) assert.ok(h.x >= 1 && h.y >= 1 && h.x + h.w < lv.w && h.y + h.h < lv.h, lv.id + " house inside");
    assert.ok(Array.isArray(Solutions[lv.id]), lv.id + " has a proof");
    const w = Sim.create(lv);
    for (let i = 0; i < w.N; i++) assert.ok(Number.isFinite(w.ground[i]) && w.bed[i] <= w.ground[i] + 1e-6, lv.id + " terrain is finite and above bedrock");
  }
});

for (const lv of Levels.LEVELS) {
  test(`${lv.no}. ${lv.name}: the scripted hand reaches the goal with every house dry`, () => {
    const { w, r } = play(lv.id, Solutions[lv.id]);
    assert.ok(w.finished, "the year ends in a harvest");
    assert.equal(r.damaged, 0, "no house is flooded");
    assert.ok(r.bales >= lv.goal, `${r.bales} bales reach the goal of ${lv.goal}`);
    assert.ok(r.ok && r.stars >= 1);
  });
  test(`${lv.no}. ${lv.name}: a valley left alone does not farm itself`, () => {
    const { r } = play(lv.id, idle);
    assert.ok(!r.ok, `idle valley gives ${r.bales} bales`);
  });
}

test("the rainy season floods the village of 梅雨 unless a drain is dug", () => {
  const { r } = play("tsuyu", idle);
  assert.equal(r.damaged, 3);
  const sol = Solutions.tsuyu.filter(a => a.tool !== "dig");
  assert.ok(play("tsuyu", sol).r.damaged > 0, "terraces alone do not save the houses");
});

test("日照り needs the reservoir: the same fields without it miss the goal", () => {
  assert.ok(!play("hideri", Solutions.hideriPlain).r.ok);
});

test("尾根越え needs the cut through the saddle", () => {
  const sol = Solutions.one.filter(a => a.tool !== "dig" || a.op === "tap");
  assert.ok(!play("one", sol).r.ok);
});

test("tools move earth but never create or destroy it", () => {
  const lv = Levels.byId("dan"), w = Sim.create(lv);
  const before = Sim.soilTotal(w);
  for (const [tool, x, y] of [["dig", 20, 20], ["heap", 24, 30], ["level", 15, 25], ["dig", 30, 10], ["heap", 10, 10]]) {
    Sim.beginStroke(w, tool, x, y);
    for (let k = 0; k < 40; k++) Sim.brush(w, tool, x + k * 0.1, y, 2.7, 1 / 30);
    Sim.endStroke(w);
  }
  for (let k = 0; k < 20; k++) Sim.step(w, 1); // slumping moves soil too
  assert.ok(Math.abs(Sim.soilTotal(w) - before) < 1e-2, "soil is conserved");
});

test("water is conserved by the flow itself", () => {
  const lv = Object.assign({}, Levels.byId("ichimai"), { springs: [], evap: 0, edges: { n: false, s: false, e: false, w: false } });
  const w = Sim.create(lv);
  for (let i = 0; i < w.N; i += 7) w.water[i] = 0.3;
  const before = Sim.waterTotal(w);
  for (let k = 0; k < 10; k++) Sim.step(w, 1);
  assert.ok(Math.abs(Sim.waterTotal(w) - before) / before < 0.01);
});

test("one swipe of 盛る makes one aze height above its neighbours", () => {
  const w = Sim.create(Levels.byId("dan"));
  const i = 25 * w.W + 20, top = Math.max(...[-w.W - 1, -w.W, -w.W + 1, -1, 0, 1, w.W - 1, w.W, w.W + 1].map(o => w.ground[i + o]));
  Sim.beginStroke(w, "heap", 20, 25);
  for (let k = 0; k < 300; k++) Sim.brush(w, "heap", 20, 25, 1.6, 1 / 30);
  Sim.endStroke(w);
  assert.ok(w.ground[i] <= top + Sim.K.AZE + 1e-4 && w.ground[i] > top + Sim.K.AZE - 0.02);
});

test("undo restores the ground and the basket", () => {
  const w = Sim.create(Levels.byId("dan"));
  const g = w.ground.slice(), b = w.basket;
  Sim.beginStroke(w, "dig", 20, 20);
  for (let k = 0; k < 30; k++) Sim.brush(w, "dig", 20, 20, 2.7, 1 / 30);
  Sim.endStroke(w);
  assert.notEqual(w.basket, b);
  assert.ok(Sim.undo(w));
  assert.equal(w.basket, b);
  assert.deepEqual(Array.from(w.ground), Array.from(g));
});

test("rice only takes root in still, shallow water on level ground", () => {
  const w = Sim.create(Levels.byId("ichimai"));
  for (let k = 0; k < 40; k++) Sim.step(w, 1);
  assert.ok(Sim.forecast(w) < Levels.byId("ichimai").goal, "a broken field does not reach the goal");
  Script.run(w, Solutions.ichimai.slice(0, 2));
  assert.ok(Sim.forecast(w) >= Levels.byId("ichimai").goal, "the mended field is ready");
  Sim.start(w);
  assert.ok(w.counts.planted > 0);
  for (let i = 0; i < w.N; i++) if (w.plant[i]) assert.ok(w.water[i] >= Sim.K.PLANT_MIN && w.water[i] <= Sim.K.PLANT_MAX);
});
