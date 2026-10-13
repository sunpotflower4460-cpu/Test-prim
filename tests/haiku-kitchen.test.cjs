"use strict";
// Pure logic checks for おばちゃんの台所 (haiku/kitchen/sim.js and recipes.js).
// Run: node --test tests/haiku-kitchen.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const KITCHEN = path.join(__dirname, "..", "haiku", "kitchen");
const Sim = require(path.join(KITCHEN, "sim.js"));
const Recipes = require(path.join(KITCHEN, "recipes.js"));
const DT = 1 / 60;

// Runs ticks until a predicate holds. Fails loudly if the world never gets there.
function tickUntil(world, pred, limit = 60 * 120) {
  for (let i = 0; i < limit; i++) {
    if (pred()) return i;
    Sim.tick(world, DT);
  }
  throw new Error("tick limit reached");
}

// Presses chop or crack when the indicator is in the green zone.
function pressWhenInZone(world, limit = 60 * 30) {
  for (let i = 0; i < limit; i++) {
    const ind = Sim.indicatorOf(world);
    if (!ind) return;
    if (Math.abs(ind.pos - ind.center) <= ind.half * 0.8) {
      const r = Sim.press(world);
      assert.ok(r.ok, "press accepted");
      if (r.hit) continue;
    }
    Sim.tick(world, DT);
  }
  throw new Error("timed session never finished");
}

// Drags until the drag session finishes. Motion is a constant arc.
function dragThrough(world, limit = 4000) {
  for (let i = 0; i < limit && world.session; i++) {
    Sim.drag(world, { angle: 0.3, dist: 6 });
    Sim.tick(world, DT);
  }
  assert.equal(world.session, null, "drag session finished");
}

// Holds until the hold session finishes.
function holdThrough(world, limit = 4000) {
  for (let i = 0; i < limit && world.session; i++) {
    Sim.hold(world, DT, true);
    Sim.tick(world, DT);
  }
  assert.equal(world.session, null, "hold session finished");
}

// One scripted action: act at a station, and finish whatever session it starts.
function act(world, station) {
  const r = Sim.interact(world, station);
  assert.ok(r.ok, "interact " + station + " ok, got " + (r.reason || "?"));
  if (r.started === "chop" || r.started === "crack") pressWhenInZone(world);
  else if (r.started === "drag") dragThrough(world);
  else if (r.started === "hold") holdThrough(world);
  else Sim.tick(world, DT);
  return r;
}

function waitFor(world, stepId) {
  tickUntil(world, () => Sim.isDone(world, stepId));
}

// Waits for the pan's egg layer to reach a state, as the player would between pours.
function waitLayer(world, layer) {
  tickUntil(world, () => {
    const pan = world.burners.burnerL.vessel || world.burners.burnerR.vessel;
    return !!pan && pan.layer === layer;
  });
}

// Scripted solutions. Each line is one player action: the station to use, or a wait.
const SOLUTIONS = {
  miso: [
    ["shelf_pot"], ["sink"], ["burnerL"], ["burnerL"],
    () => waitFor(SOLUTIONS._w, "small_bubbles"),
    ["fridge"], ["board"], ["burnerL"],
    ["fridge"], ["board"], ["burnerL"],
    ["burnerL"],
    ["miso"], ["burnerL"], ["burnerL"],
    ["shelf_bowl"], ["burnerL"], ["table"],
    ["shelf_bowl"], ["burnerL"], ["table"]
  ],
  tamago: [
    ["shelf_bowl"], ["counter"],
    ["fridge"], ["counter"], ["fridge"], ["counter"], ["fridge"], ["counter"],
    ["counter"],
    ["shelf_pan"], ["burnerL"], ["oil"], ["burnerL"],
    () => waitFor(SOLUTIONS._w, "hot_pan"),
    ["counter"], ["burnerL"],
    () => waitLayer(SOLUTIONS._w, "set"),
    ["burnerL"],
    ["burnerL"],
    () => waitLayer(SOLUTIONS._w, "set"),
    ["burnerL"],
    ["sink"],
    ["shelf_plate"], ["counter"],
    ["burnerL"],
    ["board"],
    ["counter"], ["counter"],
    ["table"]
  ],
  niku: [
    ["shelf_pot"], ["burnerL"], ["burnerL"],
    ["fridge"], ["burnerL"], ["burnerL"],
    ["veg_bin"], ["board"], ["burnerL"],
    ["veg_bin"], ["board"], ["burnerL"],
    ["veg_bin"], ["sink"], ["board"], ["burnerL"],
    ["veg_bin"], ["sink"], ["board"], ["burnerL"],
    ["kettle"],
    ["burnerL"],
    ["rack_lid"], ["burnerL"],
    ["drawer_spoon"],
    ["sugar"], ["sugar"], ["mirin"], ["shoyu"], ["shoyu"], ["shoyu"], ["burnerL"],
    () => waitFor(SOLUTIONS._w, "simmer"),
    ["shelf_bowl"], ["burnerL"], ["table"],
    ["shelf_bowl"], ["burnerL"], ["table"]
  ],
  onigiri: [
    ["salt"], ["shelf_plate"], ["counter"],
    ["ricecooker"], ["counter"], ["counter"],
    ["ricecooker"], ["counter"], ["counter"],
    ["ricecooker"], ["counter"], ["counter"],
    ["fridge"], ["counter"],
    ["counter"],
    ["table"]
  ]
};

function playSolution(id, seed) {
  const world = Sim.createWorld(id, seed);
  SOLUTIONS._w = world;
  SOLUTIONS[id].forEach((line, i) => {
    try {
      if (typeof line === "function") line();
      else act(world, line[0]);
    } catch (e) {
      e.message = id + " step " + i + " (" + (typeof line === "function" ? "wait" : line[0]) + "): " + e.message;
      throw e;
    }
  });
  return world;
}

test("recipe data: station ids exist, step ids are unique, needs point backwards", () => {
  for (const r of Recipes.RECIPES) {
    const seen = new Set();
    r.steps.forEach((s, i) => {
      assert.ok(!seen.has(s.id), r.id + " repeats step " + s.id);
      seen.add(s.id);
      const stations = Array.isArray(s.station) ? s.station : s.station ? [s.station] : [];
      for (const st of stations) {
        assert.ok(st === "burner" || Recipes.STATIONS[st], r.id + " uses unknown station " + st);
      }
      for (const dep of s.needs || []) {
        const j = r.steps.findIndex((x) => x.id === dep);
        assert.ok(j >= 0 && j < i, r.id + ":" + s.id + " needs " + dep + " which must come earlier");
        assert.ok(!r.steps[j].optional, "optional steps never block");
      }
      for (const dep of s.after || []) {
        const j = r.steps.findIndex((x) => x.id === dep);
        assert.ok(j >= 0 && j < i, r.id + ":" + s.id + " after " + dep + " must come earlier");
      }
    });
  }
  assert.equal(Recipes.RECIPES.length >= 4, true, "at least four recipes");
});

test("state machine: correct order works and out-of-order actions are refused without changing the world", () => {
  const w = Sim.createWorld("miso", 3);
  // Tofu cannot be chopped before it is taken from the fridge.
  const before = JSON.stringify(w);
  let r = Sim.interact(w, "board");
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(w), before, "refusal leaves the world untouched");
  // The heating step needs the pot on a burner first.
  r = Sim.interact(w, "burnerL");
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(w), before);
  // Correct order.
  act(w, "shelf_pot");
  assert.equal(w.hand.kind, "pot");
  r = Sim.interact(w, "shelf_pot");
  assert.equal(r.ok, false, "a second pot is refused while the hand is full");
  assert.equal(w.hand.kind, "pot", "hand unchanged after refusal");
  act(w, "sink");
  assert.equal(w.hand.water, true);
  act(w, "burnerL");
  assert.ok(w.burners.burnerL.vessel, "pot on the burner");
  assert.equal(w.burners.burnerL.level, 0);
  act(w, "burnerL");
  assert.equal(w.burners.burnerL.level, 2);
});

test("state machine: a held item blocks the wrong station and the counter takes it when free", () => {
  const w = Sim.createWorld("tamago", 9);
  act(w, "shelf_bowl");
  const r = Sim.interact(w, "fridge");
  assert.equal(r.ok, false, "cannot grab an egg with a bowl in hand");
  assert.equal(r.reason, "hand-full");
  act(w, "counter");
  assert.equal(w.counter.kind, "bowl", "bowl set down on the counter");
  assert.equal(w.hand, null);
  act(w, "fridge");
  assert.equal(w.hand.kind, "egg");
  // The egg can be cracked into the bowl on the counter.
  act(w, "counter");
  assert.equal(w.counter.eggs, 1);
});

test("each recipe completes via its scripted solution and yields a served dish", () => {
  for (const id of ["miso", "tamago", "niku", "onigiri"]) {
    const w = playSolution(id, 17);
    assert.equal(w.done, true, id + " is done");
    assert.ok(w.served >= 1, id + " served a dish");
    assert.equal(Sim.progressOf(w).done, Sim.progressOf(w).total, id + " checklist complete");
  }
  const miso = playSolution("miso", 5);
  assert.equal(miso.served, 2, "miso serves two bowls");
  const niku = playSolution("niku", 5);
  assert.equal(niku.served, 2, "niku serves two bowls");
});

test("chopping: the green zone is generous, misses do not lose progress, and presses are judged", () => {
  // Pure judgement at the centre, inside the zone edge, and outside.
  assert.equal(Sim.judgeTiming(0.5, 0.5, 0.17), "nice");
  assert.equal(Sim.judgeTiming(0.5 + 0.1, 0.5, 0.17), "good");
  assert.equal(Sim.judgeTiming(0.5 + 0.2, 0.5, 0.17), "miss");
  // The indicator rises across one period and falls across the next: 0 -> 1 -> 0.
  assert.equal(Sim.sweep(0, 1), 0);
  assert.ok(Math.abs(Sim.sweep(0.5, 1) - 0.5) < 1e-9);
  assert.ok(Math.abs(Sim.sweep(1, 1) - 1) < 1e-9);
  assert.ok(Math.abs(Sim.sweep(2, 1)) < 1e-9);
  // A miss keeps the session open with no progress.
  const w = Sim.createWorld("miso", 2);
  act(w, "shelf_pot");
  act(w, "sink");
  act(w, "burnerL");
  act(w, "fridge");
  const start = Sim.interact(w, "board");
  assert.equal(start.started, "chop");
  const ind = Sim.indicatorOf(w);
  // Press in the far corner of the bar.
  w.session.center = ind.pos > 0.5 ? 0.05 : 0.95;
  w.session.half = 0.05;
  const miss = Sim.press(w);
  assert.equal(miss.grade, "miss");
  assert.equal(w.session.hits, 0);
  assert.equal(w.prog.chop_tofu || 0, 0, "no progress on a miss");
});

test("cracking an egg: a miss still cracks it, but leaves shell bits", () => {
  const w = Sim.createWorld("tamago", 4);
  act(w, "shelf_bowl");
  act(w, "counter");
  act(w, "fridge");
  Sim.interact(w, "counter");
  Sim.indicatorOf(w);
  w.session.center = 0.05;
  w.session.half = 0.02;
  const r = Sim.press(w);
  assert.equal(r.grade, "miss");
  assert.ok(r.events.some((e) => e.type === "shell"), "shell event on a miss");
  assert.equal(w.counter.eggs, 1, "the egg still goes into the bowl");
});

test("seasoning: amounts map to warm verdicts, and good amounts read as just right", () => {
  const profile = Recipes.RECIPES.find((r) => r.id === "niku").profile;
  const verdict = (seasoning) => Sim.tasteVerdict({ seasoning }, profile);
  assert.equal(verdict({ sugar: 2, mirin: 1, shoyu: 3 }).ok, true, "the ideal amounts");
  assert.equal(verdict({ sugar: 2, mirin: 1, shoyu: 3 }).sweetLevel, "ok");
  assert.equal(verdict({ sugar: 3, mirin: 2, shoyu: 3 }).sweetLevel, "high", "a little too sweet");
  assert.equal(verdict({ sugar: 1, mirin: 0, shoyu: 3 }).sweetLevel, "low", "not sweet enough");
  assert.equal(verdict({ sugar: 2, mirin: 1, shoyu: 5 }).saltLevel, "high", "too salty");
  assert.equal(verdict({ sugar: 2, mirin: 1, shoyu: 1 }).saltLevel, "low", "too light");
  assert.equal(verdict({}).none, true, "not seasoned at all");
  assert.equal(verdict({}).ok, false);
});

test("seasoning in play: each tap adds one measured spoon, capped at the maximum", () => {
  const w = playSolution("niku", 21);
  const pot = Object.values(w.burners).map((b) => b.vessel).find((v) => v && v.kind === "pot");
  assert.ok(pot, "pot still on the stove");
  assert.ok(pot.seasoning.sugar >= 2 && pot.seasoning.sugar <= 4);
  assert.ok(pot.seasoning.shoyu >= 3 && pot.seasoning.shoyu <= 5);
  assert.ok(w.verdict, "taste step recorded a verdict");
});

test("unlock logic: a card stays hidden until its dish is first served", () => {
  let save = Sim.emptySave();
  assert.equal(Sim.isUnlocked(save, "miso"), false);
  const hidden = Sim.cardOf(save, "miso");
  assert.equal(hidden.locked, true);
  assert.equal(hidden.ingredients, null, "locked cards reveal no ingredients");
  assert.equal(hidden.steps, null, "locked cards reveal no steps");
  save = Sim.recordCooked(save, "miso");
  assert.equal(Sim.isUnlocked(save, "miso"), true);
  const open = Sim.cardOf(save, "miso");
  assert.equal(open.locked, false);
  assert.ok(open.ingredients.length >= 3);
  assert.ok(open.steps.length >= 5);
  assert.equal(Sim.isUnlocked(save, "tamago"), false, "other cards stay closed");
  assert.equal(Sim.recordCooked(save, "not-a-recipe").cooked["not-a-recipe"], undefined, "unknown ids are ignored");
  assert.equal(Sim.recordCooked(save, "miso").cooked.miso, 2, "cook count grows");
});

test("save: round trip keeps progress and settings, and corrupt data is rejected", () => {
  let save = Sim.recordCooked(Sim.emptySave(), "onigiri");
  save.settings = { music: 0.2, sfx: 0.9, muted: true };
  const text = Sim.serializeSave(save);
  assert.equal(typeof text, "string");
  const back = Sim.parseSave(text);
  assert.deepEqual(back.cooked, { onigiri: 1 });
  assert.deepEqual(back.settings, { music: 0.2, sfx: 0.9, muted: true });
  assert.equal(Sim.serializeSave(back), text, "a second round trip is identical");

  assert.equal(Sim.parseSave(null), null);
  assert.equal(Sim.parseSave("{not json"), null, "broken JSON");
  assert.equal(Sim.parseSave(JSON.stringify({ v: 2, cooked: {}, settings: {} })), null, "unknown version");
  assert.equal(Sim.parseSave(JSON.stringify({ v: 1, cooked: [], settings: {} })), null, "wrong shape");
  assert.equal(Sim.parseSave(JSON.stringify({ v: 1, cooked: { miso: "lots" }, settings: {} })).cooked.miso, undefined, "bad counts dropped");
  assert.equal(Sim.parseSave("[1,2,3]"), null);
  const clamped = Sim.parseSave(JSON.stringify({ v: 1, cooked: {}, settings: { music: 9, sfx: -4, muted: "yes" } }));
  assert.deepEqual(clamped.settings, { music: 1, sfx: 0, muted: false });
});

test("save: an in-progress dish survives a round trip and a corrupt dish is dropped", () => {
  const w = Sim.createWorld("onigiri", 8);
  act(w, "salt");
  act(w, "shelf_plate");
  act(w, "counter");
  const text = Sim.serializeSave({ v: 1, cooked: {}, settings: { music: 0.3, sfx: 0.5, muted: false }, dish: w });
  const back = Sim.parseSave(text);
  assert.ok(back.dish, "dish restored");
  assert.equal(back.dish.recipe, "onigiri");
  assert.equal(back.dish.flags.handsSalted, true);
  assert.deepEqual(back.dish.prog, w.prog);
  const bad = JSON.parse(text);
  bad.dish.burners.burnerL.level = 9;
  const dropped = Sim.parseSave(JSON.stringify(bad));
  assert.ok(dropped, "the save itself still loads");
  assert.equal(dropped.dish, null, "a corrupt dish is dropped, not trusted");
  const unknown = JSON.parse(text);
  unknown.dish.recipe = "pudding";
  assert.equal(Sim.parseSave(JSON.stringify(unknown)).dish, null);
});

test("determinism: the same seed and the same actions give the same world", () => {
  const a = JSON.stringify(playSolution("miso", 123));
  const b = JSON.stringify(playSolution("miso", 123));
  assert.equal(a, b);
  const c = JSON.stringify(playSolution("miso", 124));
  assert.notEqual(a, c, "a different seed changes the chop centres");
});

test("no soft-lock: auntie's assist finishes every recipe from a fresh start", () => {
  for (const r of Recipes.RECIPES) {
    const w = Sim.createWorld(r.id, 99);
    let guard = 0;
    while (!w.done && guard++ < 500) {
      const res = Sim.assist(w);
      assert.ok(res.ok, r.id + " assist moved on: " + (res.reason || ""));
      Sim.tick(w, DT);
    }
    assert.equal(w.done, true, r.id + " finished by assist alone");
  }
});

test("no soft-lock: assist finishes a recipe from random partial play", () => {
  // Random but seeded actions, then auntie takes over. Every recipe must still finish.
  const rng = Sim.createRng(4242);
  const stations = Object.keys(Recipes.STATIONS).concat(["burnerL", "burnerR"]);
  for (const r of Recipes.RECIPES) {
    for (let trial = 0; trial < 6; trial++) {
      const w = Sim.createWorld(r.id, 1000 + trial);
      for (let i = 0; i < 180 && !w.done; i++) {
        const roll = rng.next();
        if (w.session) {
          if (w.session.type === "chop" || w.session.type === "crack") Sim.press(w);
          else if (w.session.type === "drag") Sim.drag(w, { angle: 0.2, dist: 4 });
          else Sim.hold(w, DT, rng.next() > 0.3);
          Sim.tick(w, DT);
          continue;
        }
        if (roll < 0.7) Sim.interact(w, stations[Math.floor(rng.next() * stations.length)]);
        else Sim.tick(w, 0.5);
      }
      let guard = 0;
      while (!w.done && guard++ < 500) {
        const res = Sim.assist(w);
        assert.ok(res.ok, r.id + " trial " + trial + " stuck");
        Sim.tick(w, DT);
      }
      assert.equal(w.done, true, r.id + " trial " + trial + " finished after random play");
    }
  }
});

test("validateWorld: a finished world round-trips, and malformed worlds are refused", () => {
  const w = playSolution("tamago", 6);
  const clean = Sim.validateWorld(JSON.parse(JSON.stringify(w)));
  assert.ok(clean);
  assert.equal(clean.done, true);
  assert.equal(Sim.validateWorld({ v: 1 }), null);
  assert.equal(Sim.validateWorld(null), null);
  const bad = JSON.parse(JSON.stringify(w));
  bad.hand = 5;
  assert.equal(Sim.validateWorld(bad), null);
});

test("the module exports the public API and reads no clock or Math.random", () => {
  const api = Sim;
  for (const name of ["createWorld", "interact", "press", "drag", "hold", "tick", "assist", "hintOf", "peek", "tasteVerdict", "parseSave", "serializeSave", "cardOf"]) {
    assert.equal(typeof api[name], "function", name);
  }
  const src = fs.readFileSync(path.join(KITCHEN, "sim.js"), "utf8");
  assert.doesNotMatch(src, /Date\.now|Math\.random|new Date\(|performance\./);
});
