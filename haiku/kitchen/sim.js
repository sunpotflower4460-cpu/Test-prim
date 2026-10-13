/* おばちゃんの台所: pure game logic.
 * No DOM, no clock, no ambient randomness. Every timed action takes its time from the
 * caller (tick, press, drag, hold), and randomness comes from a seeded RNG kept in
 * the world, so the same inputs always produce the same world.
 * Recipe data lives in recipes.js. */
(function () {
  "use strict";

  var RECIPE_DATA = (typeof module !== "undefined" && module.exports)
    ? require("./recipes.js")
    : window.ObachanRecipes;
  var RECIPES = RECIPE_DATA.RECIPES;
  var STATIONS = RECIPE_DATA.STATIONS;

  var SAVE_KEY = "obachan-kitchen-v1";
  var SAVE_VERSION = 1;
  var BURNERS = ["burnerL", "burnerR"];
  var PLACEABLE = { pot: true, pan: true, bowl: true, plate: true, lid: true, spoon: true };

  // Heat: target temperature per burner level (0 off, 1 low, 2 mid, 3 high), approach rate, cooling rate.
  var HEAT = {
    pot: { target: [20, 65, 100, 100], rate: 0.16, cool: 0.05 },
    pan: { target: [20, 60, 110, 165], rate: 0.2, cool: 0.08 }
  };
  // Stage thresholds, highest first.
  var STAGES = {
    pot: [[92, "boil"], [52, "small"]],
    pan: [[125, "smoke"], [75, "hot"]]
  };
  // Minimum temperature a 'when' stage asks for.
  var STAGE_MIN = { pot: { small: 60, boil: 95 }, pan: { hot: 80, smoke: 130 } };

  var PAN_SET_TIME = 2.4;   // seconds over 75 degrees before the layer sets
  var PAN_BURN_TIME = 8.5;  // seconds of heat before it counts as burnt (never blocks)
  var SIMMER_MIN_TEMP = 52; // a lidded pot counts simmer time above this
  var CHOP_PERIOD = 0.85;
  var CRACK_PERIOD = 1.0;
  var CHOP_HALF = 0.17;     // green zone half-width, out of a 0..1 bar
  var CRACK_HALF = 0.12;
  var DEFAULT_PROFILE = { sweet: { ideal: 3, tol: 1 }, salt: { ideal: 3, tol: 1 } };

  var recipeIndex = {};

  function clone(v) {
    return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v));
  }

  function recipeById(id) {
    for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === id) return RECIPES[i];
    return null;
  }

  function indexOf(recipe) {
    var idx = recipeIndex[recipe.id];
    if (!idx) {
      idx = { byId: {} };
      for (var i = 0; i < recipe.steps.length; i++) idx.byId[recipe.steps[i].id] = recipe.steps[i];
      recipeIndex[recipe.id] = idx;
    }
    return idx;
  }

  function recipeOf(world) { return recipeById(world.recipe); }
  function stepById(world, id) { return indexOf(recipeOf(world)).byId[id] || null; }

  function fail(reason, extra) {
    var r = { ok: false, reason: reason, events: [] };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  // Seeded RNG (mulberry32). The state lives in world.rng.
  function rand(world) {
    var s = (world.rng + 0x6d2b79f5) >>> 0;
    world.rng = s;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function createRng(seed) {
    var state = (seed >>> 0) || 1;
    return {
      next: function () {
        var w = { rng: state };
        var v = rand(w);
        state = w.rng;
        return v;
      }
    };
  }

  // Triangle wave over one period, 0..1..0. Used for the chop and crack indicator.
  function sweep(t, period) {
    var p = (t / period) % 2;
    if (p < 0) p += 2;
    return p <= 1 ? p : 2 - p;
  }

  // Green zone judgement. "nice" is the centre of the zone, "good" the rest of it.
  function judgeTiming(pos, center, half) {
    var d = Math.abs(pos - center);
    if (d <= half * 0.4) return "nice";
    if (d <= half) return "good";
    return "miss";
  }

  function stageOf(vessel) {
    var table = STAGES[vessel.kind];
    for (var i = 0; i < table.length; i++) if (vessel.temp >= table[i][0]) return table[i][1];
    return "cold";
  }

  function makeVessel(kind) {
    if (kind === "pot") {
      return { kind: "pot", water: false, contents: [], seasoning: {}, lid: false, simmer: 0, dissolved: false, temp: 20 };
    }
    return { kind: "pan", oil: false, layer: "none", cook: 0, rolls: 0, burnt: false, contents: [], temp: 20 };
  }

  function vesselFrom(item) {
    var v = makeVessel(item.kind);
    for (var k in item) if (k !== "kind") v[k] = clone(item[k]);
    return v;
  }

  function defaultItem(kind) {
    if (kind === "plate") return { kind: "plate", contents: [] };
    if (kind === "bowl") return { kind: "bowl", food: null, eggs: 0, beaten: false };
    return { kind: kind };
  }

  function createWorld(recipeId, seed) {
    if (!recipeById(recipeId)) return null;
    var s = (seed >>> 0) || 1;
    return {
      v: 1,
      recipe: recipeId,
      seed: s,
      rng: s,
      t: 0,
      hand: null,
      counter: null,
      board: null,
      burners: {
        burnerL: { level: 0, vessel: null },
        burnerR: { level: 0, vessel: null }
      },
      prog: {},
      partial: {},
      flags: {},
      session: null,
      verdict: null,
      served: 0,
      done: false
    };
  }

  function isBurner(st) { return st === "burnerL" || st === "burnerR"; }

  function stationMatches(step, st) {
    var s = step.station;
    if (!s || !st) return false;
    if (Array.isArray(s)) return s.indexOf(st) >= 0;
    if (s === "burner") return isBurner(st);
    return s === st;
  }

  function burnerWith(world, kind, prefer) {
    if (prefer && world.burners[prefer] && world.burners[prefer].vessel && world.burners[prefer].vessel.kind === kind) return prefer;
    for (var i = 0; i < BURNERS.length; i++) {
      var b = world.burners[BURNERS[i]];
      if (b.vessel && b.vessel.kind === kind) return BURNERS[i];
    }
    return null;
  }

  function freeBurner(world) {
    for (var i = 0; i < BURNERS.length; i++) if (!world.burners[BURNERS[i]].vessel) return BURNERS[i];
    return BURNERS[0];
  }

  // Works out what a step writes to: a burner, the counter, or nothing.
  function resolveTarget(world, step, st) {
    if (step.kind === "take" && step.from === "counter") return { type: "counter" };
    if (step.kind === "place") {
      if (isBurner(st)) return { type: "burner", id: st };
      if (st === "counter") return { type: "counter" };
      return null;
    }
    var into = step.into;
    if (into === "pot" || into === "pan") {
      var id = burnerWith(world, into, isBurner(st) ? st : null);
      return id ? { type: "burner", id: id } : null;
    }
    if (into === "plate" || into === "bowl") {
      return world.counter && world.counter.kind === into ? { type: "counter" } : null;
    }
    if (st === "counter") return { type: "counter" };
    return { type: "none" };
  }

  function targetObj(world, target) {
    if (!target) return null;
    if (target.type === "burner") return world.burners[target.id].vessel;
    if (target.type === "counter") return world.counter;
    return null;
  }

  function matchItem(item, pattern) {
    if (pattern === undefined) return true;
    if (pattern === null) return !item;
    if (!item) return false;
    for (var k in pattern) {
      var want = pattern[k];
      var have = item[k];
      if (want === null) {
        if (have !== null && have !== undefined) return false;
      } else if (want === false) {
        if (have) return false;
      } else if (have !== want) {
        return false;
      }
    }
    return true;
  }

  function handReason(hand, pattern) {
    if (pattern === null) return "hand-full";
    if (!hand) return "hand-empty";
    return "wrong-item";
  }

  function matchCond(actual, cond) {
    if (typeof cond === "string") {
      var m = /^(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/.exec(cond);
      if (m) {
        var n = Number(m[2]);
        var a = Number(actual) || 0;
        if (m[1] === ">=") return a >= n;
        if (m[1] === "<=") return a <= n;
        if (m[1] === ">") return a > n;
        return a < n;
      }
    }
    return actual === cond;
  }

  function checkWhen(world, step, target) {
    var cond = step.when || step.until;
    if (!cond) return null;
    for (var key in cond) {
      var actual;
      if (key === "level") {
        actual = target && target.type === "burner" ? world.burners[target.id].level : undefined;
      } else if (key === "counter") {
        actual = world.counter ? world.counter.kind : null;
      } else if (key === "stage") {
        var v = targetObj(world, target);
        actual = v && v.kind ? stageOf(v) : null;
      } else {
        var obj = targetObj(world, target);
        actual = obj ? obj[key] : undefined;
      }
      if (!matchCond(actual, cond[key])) return "not-ready";
    }
    return null;
  }

  function isDone(world, step) {
    return (world.prog[step.id] || 0) >= (step.goal || 1);
  }

  // needs: steps that must be finished. after: steps that must have run at least once.
  function needsMet(world, step) {
    if (step.needs) {
      for (var i = 0; i < step.needs.length; i++) {
        var dep = stepById(world, step.needs[i]);
        if (!dep || !isDone(world, dep)) return false;
      }
    }
    if (step.after) {
      for (var j = 0; j < step.after.length; j++) {
        var first = stepById(world, step.after[j]);
        if (!first || (world.prog[first.id] || 0) < 1) return false;
      }
    }
    return true;
  }

  // Would the step's conditions hold right now, at the station it most likely uses?
  function readyNow(world, step) {
    var st = Array.isArray(step.station) ? step.station[0]
      : step.station === "burner" ? (burnerWith(world, step.into, null) || "burnerL")
      : step.station || null;
    if (step.kind === "wait") st = null;
    var tgt = resolveTarget(world, step, st);
    if (!tgt) return false;
    return checkWhen(world, step, tgt) === null;
  }

  function missingReason(step) {
    if (step.into === "pot" || step.into === "pan") return "no-vessel";
    if (step.into === "plate" || step.into === "bowl") return "no-counter";
    return "wrong-place";
  }

  function evalStep(world, step, st) {
    if (isDone(world, step)) return { ok: false, reason: "done" };
    if (!needsMet(world, step)) return { ok: false, reason: "locked" };
    if (step.kind === "wait") return { ok: false, reason: "passive" };
    var target = resolveTarget(world, step, st);
    if (!target) return { ok: false, reason: missingReason(step) };
    if (step.kind === "place" && target.type === "burner" && world.burners[target.id].vessel) return { ok: false, reason: "occupied" };
    if (step.kind === "place" && target.type === "counter" && world.counter) return { ok: false, reason: "occupied" };
    if (step.kind === "take" && step.from === "counter" && !world.counter) return { ok: false, reason: "no-counter" };
    if (!matchItem(world.hand, step.hand)) return { ok: false, reason: handReason(world.hand, step.hand) };
    if (step.kind === "season") {
      var vessel = targetObj(world, target);
      if (vessel && (vessel.seasoning[step.name] || 0) >= step.max) return { ok: false, reason: "enough" };
    }
    var w = checkWhen(world, step, target);
    if (w) return { ok: false, reason: w };
    return { ok: true, target: target };
  }

  // Effects of one completed run of a step. Returns events.
  function runStep(world, step, st, target) {
    var ev = [];
    var k = step.kind;
    var obj = targetObj(world, target);

    if (k === "take") {
      if (step.from === "counter") {
        world.hand = world.counter;
        world.counter = null;
      } else {
        world.hand = clone(step.give);
      }
    } else if (k === "place") {
      if (target.type === "burner") world.burners[target.id].vessel = vesselFrom(world.hand);
      else world.counter = world.hand;
      world.hand = null;
    } else if (k === "crack") {
      obj.eggs = (obj.eggs || 0) + 1;
      world.hand = null;
    } else if (k === "serve") {
      world.hand = null;
      world.served += 1;
      ev.push({ type: "serve", stepId: step.id, count: world.served });
    } else if (k === "toggle") {
      world.burners[target.id].level = step.set;
    } else if (k === "taste") {
      world.verdict = tasteVerdict(obj, recipeOf(world).profile);
      world.hand = null;
    } else if (k === "season") {
      if (obj && obj.seasoning) obj.seasoning[step.name] = Math.min(step.max, (obj.seasoning[step.name] || 0) + 1);
    } else if (k !== "wait") {
      // chop, drag, hold, tap: a hand pattern means the item in hand changes.
      if (!step.keep && step.hand !== undefined) world.hand = step.give ? clone(step.give) : null;
    }

    if (step.add && obj && obj.contents) obj.contents.push(step.add);
    if (step.set && typeof step.set === "object" && obj) {
      for (var key in step.set) obj[key] = step.set[key];
    }
    if (step.inc && obj) {
      for (var inc in step.inc) obj[inc] = (obj[inc] || 0) + step.inc[inc];
    }
    if (step.flag) world.flags[step.flag] = true;

    var n = Math.min(step.goal || 1, (world.prog[step.id] || 0) + 1);
    world.prog[step.id] = n;
    delete world.partial[step.id];
    if (n >= (step.goal || 1)) ev.push({ type: "complete", stepId: step.id, kind: k, final: true });
    else ev.push({ type: "run", stepId: step.id, kind: k, count: n });

    var fin = checkFinished(world);
    if (fin) ev.push(fin);
    return ev;
  }

  function checkFinished(world) {
    if (world.done) return null;
    var steps = recipeOf(world).steps;
    for (var i = 0; i < steps.length; i++) {
      if (!steps[i].optional && !isDone(world, steps[i])) return null;
    }
    world.done = true;
    return { type: "finished", recipe: world.recipe };
  }

  function begin(world, step, st, target) {
    if (step.kind === "chop" || step.kind === "crack") {
      var isChop = step.kind === "chop";
      world.session = {
        type: step.kind,
        stepId: step.id,
        station: st,
        t: 0,
        period: isChop ? CHOP_PERIOD : CRACK_PERIOD,
        half: isChop ? CHOP_HALF : CRACK_HALF,
        center: 0.3 + 0.4 * rand(world),
        need: step.hits || 1,
        hits: world.partial[step.id] || 0
      };
      return { ok: true, started: step.kind, stepId: step.id, events: [{ type: "session", kind: step.kind, stepId: step.id }] };
    }
    if (step.kind === "drag" || step.kind === "hold") {
      world.session = {
        type: step.kind,
        stepId: step.id,
        station: st,
        progress: world.partial[step.id] || 0,
        need: step.kind === "hold" ? step.seconds : step.need,
        metric: step.metric || "rot"
      };
      return { ok: true, started: step.kind, stepId: step.id, events: [{ type: "session", kind: step.kind, stepId: step.id }] };
    }
    return { ok: true, stepId: step.id, events: runStep(world, step, st, target) };
  }

  // The player's action at a station. Returns { ok, reason, events }.
  function interact(world, st) {
    if (world.session) {
      if (world.session.type === "chop" || world.session.type === "crack") return press(world);
      return fail("busy");
    }
    var recipe = recipeOf(world);
    var first = null;
    for (var i = 0; i < recipe.steps.length; i++) {
      var step = recipe.steps[i];
      if (!stationMatches(step, st)) continue;
      var r = evalStep(world, step, st);
      if (r.ok) return begin(world, step, st, r.target);
      if (!first && r.reason !== "done") first = { stepId: step.id, reason: r.reason };
    }
    if (st === "counter") {
      var g = genericCounter(world);
      if (g) return g;
    }
    if (st === "board") {
      var b = genericBoard(world);
      if (b) return b;
    }
    if (first) return fail(first.reason, { stepId: first.stepId });
    return fail("nothing");
  }

  // Set down or pick up at the counter, outside the recipe steps.
  function genericCounter(world) {
    if (!world.hand && world.counter) {
      world.hand = world.counter;
      world.counter = null;
      return { ok: true, started: null, stepId: null, events: [{ type: "counter", action: "pick" }] };
    }
    if (world.hand && !world.counter) {
      if (!PLACEABLE[world.hand.kind]) return fail("not-here");
      world.counter = world.hand;
      world.hand = null;
      return { ok: true, started: null, stepId: null, events: [{ type: "counter", action: "put" }] };
    }
    if (world.hand && world.counter) return fail("occupied");
    return null;
  }

  // The cutting board is a second place to set things down. Pots and pans stay on the stove.
  function genericBoard(world) {
    if (!world.hand && world.board) {
      world.hand = world.board;
      world.board = null;
      return { ok: true, started: null, stepId: null, events: [{ type: "counter", action: "pick" }] };
    }
    if (world.hand && !world.board) {
      if (world.hand.kind === "pot" || world.hand.kind === "pan") return fail("not-here");
      world.board = world.hand;
      world.hand = null;
      return { ok: true, started: null, stepId: null, events: [{ type: "counter", action: "put" }] };
    }
    if (world.hand && world.board) return fail("occupied");
    return null;
  }

  // Peek at what interacting with a station would do, without changing the world.
  function peek(world, st) {
    if (world.session) return { ok: false, reason: "busy", label: null, stepId: null };
    var recipe = recipeOf(world);
    var first = null;
    for (var i = 0; i < recipe.steps.length; i++) {
      var step = recipe.steps[i];
      if (!stationMatches(step, st)) continue;
      var r = evalStep(world, step, st);
      if (r.ok) return { ok: true, reason: null, label: step.label, stepId: step.id, kind: step.kind };
      if (!first && r.reason !== "done") first = { ok: false, reason: r.reason, label: step.label, stepId: step.id, kind: step.kind };
    }
    if (st === "counter") {
      if (!world.hand && world.counter) return { ok: true, reason: null, label: "作業台のものを持つ", stepId: null, kind: "counter" };
      if (world.hand && !world.counter && PLACEABLE[world.hand.kind]) return { ok: true, reason: null, label: "作業台に置く", stepId: null, kind: "counter" };
    }
    if (st === "board") {
      if (!world.hand && world.board) return { ok: true, reason: null, label: "まないたのものを持つ", stepId: null, kind: "counter" };
      if (world.hand && !world.board && world.hand.kind !== "pot" && world.hand.kind !== "pan") return { ok: true, reason: null, label: "まないたに置く", stepId: null, kind: "counter" };
    }
    return first || { ok: false, reason: "nothing", label: null, stepId: null, kind: null };
  }

  // Timed input. Press for chop and crack. Returns the grade and any run events.
  function press(world) {
    var s = world.session;
    if (!s || (s.type !== "chop" && s.type !== "crack")) return fail("no-session");
    var grade = judgeTiming(sweep(s.t, s.period), s.center, s.half);
    if (s.type === "crack") return finishTiming(world, grade);
    if (grade === "miss") return { ok: true, grade: "miss", hit: false, events: [] };
    s.hits += 1;
    world.partial[s.stepId] = s.hits;
    if (s.hits >= s.need) return finishTiming(world, grade);
    s.center = 0.3 + 0.4 * rand(world);
    return { ok: true, grade: grade, hit: true, events: [{ type: "hit", grade: grade, stepId: s.stepId, hits: s.hits }] };
  }

  function finishTiming(world, grade) {
    var s = world.session;
    var step = stepById(world, s.stepId);
    var target = resolveTarget(world, step, s.station);
    world.session = null;
    if (!target) return fail("no-target");
    var ev = runStep(world, step, s.station, target);
    if (s.type === "crack" && grade === "miss") ev.push({ type: "shell", stepId: step.id });
    return { ok: true, grade: grade, hit: true, events: ev };
  }

  // Dragging for stir, beat, scoop, shape and peel. delta = { angle (radians), dist (normalised) }.
  function drag(world, delta) {
    var s = world.session;
    if (!s || s.type !== "drag") return fail("no-session");
    var inc = s.metric === "rot" ? Math.abs(delta.angle || 0) / (2 * Math.PI) : Math.max(0, delta.dist || 0);
    s.progress += inc;
    world.partial[s.stepId] = s.progress;
    if (s.progress >= s.need) return finishSession(world);
    return { ok: true, progress: Math.min(1, s.progress / s.need), events: [] };
  }

  // Holding for fill and pour. Call every frame with the frame time.
  function hold(world, dt, on) {
    var s = world.session;
    if (!s || s.type !== "hold") return fail("no-session");
    if (!on) return { ok: true, progress: Math.min(1, s.progress / s.need), events: [] };
    s.progress += Math.max(0, Math.min(0.1, dt));
    world.partial[s.stepId] = s.progress;
    if (s.progress >= s.need) return finishSession(world);
    return { ok: true, progress: Math.min(1, s.progress / s.need), events: [] };
  }

  function finishSession(world) {
    var s = world.session;
    var step = stepById(world, s.stepId);
    var target = resolveTarget(world, step, s.station);
    world.session = null;
    if (!target) return fail("no-target");
    return { ok: true, progress: 1, events: runStep(world, step, s.station, target) };
  }

  function cancel(world) {
    world.session = null;
  }

  // Auntie's own steps. A cancelled session keeps its partial progress.
  function indicatorOf(world) {
    var s = world.session;
    if (!s || (s.type !== "chop" && s.type !== "crack")) return null;
    return { type: s.type, pos: sweep(s.t, s.period), center: s.center, half: s.half };
  }

  // Tick: heat, pan layer, simmer, sessions, passive waits. dt in seconds.
  function tick(world, dt) {
    var ev = [];
    dt = Math.max(0, Math.min(0.1, dt || 0));
    world.t += dt;
    if (world.session && (world.session.type === "chop" || world.session.type === "crack")) world.session.t += dt;

    for (var i = 0; i < BURNERS.length; i++) {
      var id = BURNERS[i];
      var b = world.burners[id];
      var v = b.vessel;
      if (!v) continue;
      var h = HEAT[v.kind];
      var target = h.target[b.level];
      var rate = b.level > 0 ? h.rate : h.cool;
      v.temp += (target - v.temp) * Math.min(1, rate * dt);
      var s = stageOf(v);
      if (s !== v.stage) {
        ev.push({ type: "stage", station: id, kind: v.kind, stage: s, prev: v.stage || "cold" });
        v.stage = s;
      }
      if (v.kind === "pan" && v.layer !== "none" && v.temp >= 75) {
        v.cook += dt;
        if (v.layer === "raw" && v.cook >= PAN_SET_TIME) {
          v.layer = "set";
          ev.push({ type: "layer", station: id, layer: "set" });
        }
        if (!v.burnt && v.cook >= PAN_BURN_TIME) {
          v.burnt = true;
          ev.push({ type: "burnt", station: id });
        }
      }
      if (v.kind === "pot" && v.lid && b.level > 0 && v.temp >= SIMMER_MIN_TEMP) {
        v.simmer = Math.min(999, v.simmer + dt);
      }
    }

    var steps = recipeOf(world).steps;
    for (var j = 0; j < steps.length; j++) {
      var step = steps[j];
      if (step.kind !== "wait" || isDone(world, step) || !needsMet(world, step)) continue;
      var tgt = resolveTarget(world, step, null);
      if (!tgt) continue;
      if (checkWhen(world, step, tgt) === null) {
        var run = runStep(world, step, null, tgt);
        for (var r = 0; r < run.length; r++) ev.push(run[r]);
      }
    }
    return ev;
  }

  // Next step the player should aim for: the first required step that is open.
  // Order: an open step that fits the item in hand, then a passive wait (time is already
  // moving), then the first open step in list order.
  // Order: fits the hand and is ready, then a passive wait, then ready steps that need a
  // different hand, then steps that fit the hand but are not ready yet, then list order.
  function nextStep(world) {
    var steps = recipeOf(world).steps;
    var slots = [null, null, null, null, null];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.optional || isDone(world, s) || !needsMet(world, s)) continue;
      var fits = matchItem(world.hand, s.hand);
      if (s.kind === "wait") { if (!slots[1]) slots[1] = s; continue; }
      var ready = readyNow(world, s);
      if (fits && ready) { if (!slots[0]) slots[0] = s; }
      else if (ready) { if (!slots[2]) slots[2] = s; }
      else if (fits) { if (!slots[3]) slots[3] = s; }
      else if (!slots[4]) slots[4] = s;
    }
    for (var k = 0; k < slots.length; k++) if (slots[k]) return slots[k];
    return null;
  }

  // Why a particular step can or cannot run at a station right now.
  function explainStep(world, stepId, st) {
    var step = stepById(world, stepId);
    if (!step) return { ok: false, reason: "nothing" };
    return evalStep(world, step, st);
  }

  function hintOf(world) {
    var s = nextStep(world);
    if (!s) return null;
    return { stepId: s.id, label: s.label, hint: s.hint, kind: s.kind, station: s.station };
  }

  function progressOf(world) {
    var steps = recipeOf(world).steps;
    var done = 0;
    var total = 0;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].quiet || steps[i].optional) continue;
      total += 1;
      if (isDone(world, steps[i])) done += 1;
    }
    return { done: done, total: total };
  }

  // Auntie does the current step herself. She tidies the hand, moves the pot if
  // needed, and makes any wait finish. The recipe can always be finished this way.
  function assist(world) {
    var step = nextStep(world);
    if (!step) return fail("finished");
    world.session = null;
    var events = [];
    var guard = 0;
    while (!isDone(world, step) && guard++ < 40) {
      var st = prepare(world, step);
      var target = resolveTarget(world, step, st);
      if (!target) break;
      var run = runStep(world, step, st, target);
      for (var i = 0; i < run.length; i++) events.push(run[i]);
    }
    var r = { ok: true, stepId: step.id, events: events, auntie: true };
    return r;
  }

  function prepare(world, step) {
    if (step.hand === null) world.hand = null;
    else if (step.hand && !matchItem(world.hand, step.hand)) world.hand = clone(step.hand);

    var st = null;
    if (step.kind === "place") {
      st = step.station === "counter" ? "counter" : freeBurner(world);
      if (st === "counter") world.counter = null;
      else world.burners[st].vessel = null;
    } else if (Array.isArray(step.station)) {
      st = step.station[0];
    } else if (step.station === "burner") {
      st = burnerWith(world, step.into, null) || "burnerL";
    } else {
      st = step.station || null;
    }

    if (step.into === "pot" || step.into === "pan") {
      if (!burnerWith(world, step.into, null)) {
        var free = freeBurner(world);
        world.burners[free].vessel = makeVessel(step.into);
      }
    }
    if (step.into === "plate" || step.into === "bowl") {
      if (!world.counter || world.counter.kind !== step.into) world.counter = defaultItem(step.into);
    }
    var target = resolveTarget(world, step, st);
    var cond = step.when || step.until;
    if (cond) applyCond(world, cond, target);
    return st;
  }

  function levelFor(want) {
    if (want === "0" || want === 0) return 0;
    if (want === ">0") return 2;
    if (typeof want === "number") return want;
    return 2;
  }

  function applyCond(world, cond, target) {
    for (var key in cond) {
      var want = cond[key];
      if (key === "level") {
        if (target && target.type === "burner") world.burners[target.id].level = levelFor(want);
        continue;
      }
      if (key === "counter") {
        if (!world.counter || world.counter.kind !== want) world.counter = defaultItem(want);
        continue;
      }
      var obj = targetObj(world, target);
      if (!obj) continue;
      if (key === "stage") {
        var min = STAGE_MIN[obj.kind] && STAGE_MIN[obj.kind][want];
        if (min !== undefined && obj.temp < min) obj.temp = min;
        continue;
      }
      if (key === "layer") {
        if (obj.kind === "pan") {
          obj.layer = want;
          if (want === "set") obj.cook = Math.max(obj.cook, PAN_SET_TIME);
          if (want === "none") obj.cook = 0;
        }
        continue;
      }
      if (typeof want === "string" && /^(>=|<=|>|<)/.test(want)) {
        var n = Number(want.replace(/^(>=|<=|>|<)/, ""));
        var cur = Number(obj[key]) || 0;
        if (want.indexOf(">") === 0 && cur <= n) obj[key] = want.indexOf(">=") === 0 ? n : n + 1;
        if (want.indexOf("<") === 0) obj[key] = n;
        continue;
      }
      obj[key] = want;
    }
  }

  // Taste verdict. Sweetness is sugar plus mirin. Saltiness is soy sauce.
  function tasteVerdict(vessel, profile) {
    var p = profile || DEFAULT_PROFILE;
    var s = (vessel && vessel.seasoning) || {};
    var sweet = (s.sugar || 0) + (s.mirin || 0);
    var salt = s.shoyu || 0;
    var none = sweet === 0 && salt === 0;
    var sweetLevel = sweet > p.sweet.ideal + p.sweet.tol ? "high" : sweet < p.sweet.ideal - p.sweet.tol ? "low" : "ok";
    var saltLevel = salt > p.salt.ideal + p.salt.tol ? "high" : salt < p.salt.ideal - p.salt.tol ? "low" : "ok";
    return {
      sweet: sweet,
      salt: salt,
      sweetLevel: sweetLevel,
      saltLevel: saltLevel,
      none: none,
      ok: !none && sweetLevel === "ok" && saltLevel === "ok"
    };
  }

  // Validation of a stored world. Returns a clean copy or null.
  function validateWorld(w) {
    if (!w || typeof w !== "object" || Array.isArray(w)) return null;
    if (w.v !== 1 || !recipeById(w.recipe)) return null;
    if (!isNum(w.rng) || !isNum(w.t) || !isNum(w.seed) || !isNum(w.served)) return null;
    if (typeof w.done !== "boolean") return null;
    if (!w.burners || typeof w.burners !== "object") return null;
    for (var i = 0; i < BURNERS.length; i++) {
      var b = w.burners[BURNERS[i]];
      if (!b || !isInt(b.level, 0, 3)) return null;
      if (b.vessel !== null && !validVessel(b.vessel)) return null;
    }
    if (w.hand !== null && !validItem(w.hand)) return null;
    if (w.counter !== null && !validItem(w.counter)) return null;
    if (w.board !== null && w.board !== undefined && !validItem(w.board)) return null;
    if (!w.prog || typeof w.prog !== "object" || !w.flags || typeof w.flags !== "object") return null;
    var recipe = recipeById(w.recipe);
    var clean = clone(w);
    clean.session = null;
    clean.partial = {};
    if (w.partial && typeof w.partial === "object") {
      for (var pk in w.partial) if (isNum(w.partial[pk]) && indexOf(recipe).byId[pk]) clean.partial[pk] = w.partial[pk];
    }
    clean.prog = {};
    for (var key in w.prog) {
      if (!indexOf(recipe).byId[key] || !isInt(w.prog[key], 0, 999)) return null;
      clean.prog[key] = w.prog[key];
    }
    clean.verdict = null;
    if (clean.board === undefined) clean.board = null;
    return clean;
  }

  function validVessel(v) {
    if (!v || typeof v !== "object") return false;
    if (v.kind !== "pot" && v.kind !== "pan") return false;
    if (!isNum(v.temp) || v.temp < 0 || v.temp > 300) return false;
    if (!Array.isArray(v.contents)) return false;
    return true;
  }

  function validItem(it) {
    return !!it && typeof it === "object" && typeof it.kind === "string" && it.kind.length > 0 && it.kind.length < 24;
  }

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isInt(v, lo, hi) { return isNum(v) && Math.floor(v) === v && v >= lo && v <= hi; }

  function serializeWorld(world) {
    var copy = clone(world);
    copy.session = null;
    return copy;
  }

  // Save file: per-viewer convenience only. Every read goes through parseSave.
  function emptySave() {
    return {
      v: SAVE_VERSION,
      cooked: {},
      settings: { music: 0.35, sfx: 0.7, muted: false },
      tips: {},
      dish: null
    };
  }

  function validateSave(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    if (obj.v !== SAVE_VERSION) return null;
    if (!obj.cooked || typeof obj.cooked !== "object" || Array.isArray(obj.cooked)) return null;
    if (!obj.settings || typeof obj.settings !== "object" || Array.isArray(obj.settings)) return null;
    var save = emptySave();
    for (var k in obj.cooked) {
      if (recipeById(k) && isInt(obj.cooked[k], 0, 9999)) save.cooked[k] = obj.cooked[k];
    }
    var music = obj.settings.music;
    var sfx = obj.settings.sfx;
    save.settings.music = isNum(music) ? clamp01(music) : save.settings.music;
    save.settings.sfx = isNum(sfx) ? clamp01(sfx) : save.settings.sfx;
    save.settings.muted = obj.settings.muted === true;
    // First-time tips per recipe: once a recipe has shown its tip it is never shown again.
    if (obj.tips && typeof obj.tips === "object" && !Array.isArray(obj.tips)) {
      for (var tk in obj.tips) if (recipeById(tk) && obj.tips[tk] === true) save.tips[tk] = true;
    }
    save.dish = obj.dish ? validateWorld(obj.dish) : null;
    return save;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function serializeSave(save) {
    var clean = validateSave(save);
    if (!clean) return null;
    if (clean.dish) clean.dish = serializeWorld(clean.dish);
    return JSON.stringify(clean);
  }

  function parseSave(text) {
    if (typeof text !== "string" || text.length > 200000) return null;
    var obj;
    try {
      obj = JSON.parse(text);
    } catch {
      return null;
    }
    return validateSave(obj);
  }

  function recordCooked(save, recipeId) {
    var next = validateSave(save) || emptySave();
    if (!recipeById(recipeId)) return next;
    next.cooked[recipeId] = Math.min(9999, (next.cooked[recipeId] || 0) + 1);
    return next;
  }

  function isUnlocked(save, recipeId) {
    return !!save && (save.cooked[recipeId] || 0) > 0;
  }

  // Recipe card for the notebook. Locked recipes reveal nothing but their name slot.
  function cardOf(save, recipeId) {
    var r = recipeById(recipeId);
    if (!r) return null;
    var open = isUnlocked(save, recipeId);
    return {
      id: r.id,
      name: r.name,
      blurb: r.blurb,
      locked: !open,
      cooked: save ? save.cooked[recipeId] || 0 : 0,
      ingredients: open ? r.ingredients.slice() : null,
      steps: open ? r.steps.filter(function (s) { return !s.quiet; }).map(function (s) { return s.label; }) : null
    };
  }

  var API = {
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION,
    RECIPES: RECIPES,
    STATIONS: STATIONS,
    CHOP_HALF: CHOP_HALF,
    CRACK_HALF: CRACK_HALF,
    createRng: createRng,
    rand: rand,
    recipeById: recipeById,
    createWorld: createWorld,
    interact: interact,
    peek: peek,
    explainStep: explainStep,
    press: press,
    drag: drag,
    hold: hold,
    cancel: cancel,
    indicatorOf: indicatorOf,
    tick: tick,
    assist: assist,
    nextStep: nextStep,
    hintOf: hintOf,
    progressOf: progressOf,
    isDone: function (world, id) {
      var s = stepById(world, id);
      return !!s && isDone(world, s);
    },
    sweep: sweep,
    judgeTiming: judgeTiming,
    tasteVerdict: tasteVerdict,
    stageOf: stageOf,
    serializeWorld: serializeWorld,
    validateWorld: validateWorld,
    emptySave: emptySave,
    validateSave: validateSave,
    serializeSave: serializeSave,
    parseSave: parseSave,
    recordCooked: recordCooked,
    isUnlocked: isUnlocked,
    cardOf: cardOf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.ObachanSim = API;
})();
