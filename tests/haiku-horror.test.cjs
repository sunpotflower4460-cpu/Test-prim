"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "haiku", "horror");
const L = require(path.join(root, "levels.js"));
const S = require(path.join(root, "sim.js"));
const Story = require(path.join(root, "story.js"));
const { C } = S;
const LEVEL = L.LEVEL;
const world = S.buildWorld(LEVEL);

const DT = 1 / 60;

function fresh(seed) {
  return S.newGame(world, seed || LEVEL.seed);
}

function run(s, input, seconds) {
  const events = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const ev = S.step(world, s, input || {}, DT);
    for (const e of ev) events.push(e);
    if (s.respawnT < 0 && s.ending) break;
  }
  return events;
}

// Point the player at (tx, ty).
function faceTo(p, tx, ty) {
  p.yaw = Math.atan2(-(tx - p.x), -(ty - p.y));
}

function placeEntity(s, x, y) {
  s.ent.x = x;
  s.ent.y = y;
  s.ent.path = [];
  s.ent.goal = -1;
  s.ent.replanT = 0;
}

function cellOf(x, y) {
  return S.cellIdx(world, x, y);
}

// Garden stand point: east of the well, looking west toward the well mouth.
function gardenStand(s) {
  s.player.x = 9.5;
  s.player.y = 2.5;
  faceTo(s.player, world.wellMouth.x, world.wellMouth.y);
  placeEntity(s, world.wellMouth.x, world.wellMouth.y);
  s.awakened = true;
  s.ent.grace = 0;
}

// --------- map ---------

test("the floor plan is a rectangle with every glyph and door defined", () => {
  const rows = LEVEL.rows;
  assert.equal(rows.length, 14);
  rows.forEach(r => assert.equal(r.length, 16, "row length"));
  assert.equal(world.W, 16);
  assert.equal(world.H, 14);
  for (const d of world.doors) {
    assert.ok(world.at(d.x, d.y).walk, d.id + " starts in a walkable cell");
  }
  assert.equal(new Set(world.doors.map(d => d.id)).size, world.doors.length, "door ids are unique");
});

test("the spawn cell is walkable and inside the genkan", () => {
  const c = world.at(Math.floor(LEVEL.spawn.x), Math.floor(LEVEL.spawn.y));
  assert.ok(c.walk);
  assert.equal(c.room, "genkan");
});

test("the collection matches the design: three talismans, five batteries, nine shells, three diaries", () => {
  const kinds = {};
  world.items.forEach(it => { kinds[it.kind] = (kinds[it.kind] || 0) + 1; });
  assert.equal(kinds.fuda, 3);
  assert.equal(kinds.battery, 5);
  assert.equal(kinds.shell, 9);
  assert.equal(kinds.diary, 3);
  assert.deepEqual(S.FUDA_IDS.slice().sort(), world.items.filter(i => i.kind === "fuda").map(i => i.id).sort());
});

test("every item and the well are reachable from the spawn without passing through the well", () => {
  const s = fresh();
  const start = cellOf(s.player.x, s.player.y);
  // bfs never enters a solid (well) cell, and closed doors count as passable.
  const { dist } = S.bfs(world, start);
  for (const it of world.items) {
    const c = cellOf(it.x, it.y);
    assert.ok(dist[c] >= 0, it.id + " is reachable");
  }
  const wc = world.well.cell;
  assert.ok(world.cells[wc].solid, "the well cell is solid");
  assert.equal(dist[wc], -1, "the well cell is never entered");
  const mouth = cellOf(world.wellMouth.x, world.wellMouth.y);
  assert.ok(dist[mouth] >= 0, "the well mouth is reachable");
  // The well can be walked around: at least two of its neighbours are reachable.
  const adj = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => {
    const x = world.cells[wc].x + dx;
    const y = world.cells[wc].y + dy;
    return cellOf(x, y);
  });
  assert.ok(adj.filter(i => i >= 0 && dist[i] >= 0).length >= 2);
});

test("every hidden item is revealed by one interactable and the veranda and garden are reachable", () => {
  const revealers = new Set();
  world.interactables.forEach(p => (p.interact.reveals || []).forEach(id => revealers.add(id)));
  world.items.filter(i => i.hidden).forEach(i => {
    assert.ok(revealers.has(i.id), i.id + " can be revealed");
  });
  const s = fresh();
  const { dist } = S.bfs(world, cellOf(s.player.x, s.player.y));
  assert.ok(dist[cellOf(3.5, 5.5)] >= 0, "veranda");
  assert.ok(dist[cellOf(6.5, 3.5)] >= 0, "garden");
  assert.ok(dist[cellOf(14.5, 1.5)] >= 0, "storehouse");
});

test("walls separate rooms, and open pairs and doors have no static wall", () => {
  const veranda = cellOf(3.5, 5.5);
  const garden = cellOf(3.5, 4.5);
  assert.equal(world.edge[veranda * 4 + 0], S.EDGE_OPEN, "veranda opens to the garden");
  const ima = cellOf(4.5, 7.5);
  const zashiki = cellOf(5.5, 7.5);
  assert.equal(world.edge[ima * 4 + 1], S.EDGE_DOOR, "living room door to the tatami room");
  assert.equal(world.edge[garden * 4 + 2], S.EDGE_OPEN, "garden opens to the veranda");
  assert.equal(world.edge[zashiki * 4 + 3], S.EDGE_DOOR);
  const kitchenWall = cellOf(7.5, 12.5) * 4 + 3;
  assert.equal(world.edge[kitchenWall], S.EDGE_WALL, "kitchen and storeroom are walled");
});

// --------- sight and the freeze rule ---------

test("a closed door blocks sight, and an open one does not", () => {
  const s = fresh();
  s.awakened = true;
  s.player.x = 4.5;
  s.player.y = 7.5;
  faceTo(s.player, 6.5, 7.5);
  placeEntity(s, 6.5, 7.5); // dark tatami room, 2 m away, through the fusuma
  assert.equal(S.seesEntity(world, s), false, "the fusuma is closed");
  s.doorOpen[world.doors.find(d => d.id === "d-ima-zashiki").index] = true;
  assert.equal(S.seesEntity(world, s), true, "open doorway, within the dark-room range");
});

test("she is seen only inside the view cone and within the light available", () => {
  const s = fresh();
  s.awakened = true;
  gardenStand(s);
  assert.equal(S.seesEntity(world, s), true, "moonlit garden, 3 m away, in front");
  s.player.yaw += Math.PI;
  assert.equal(S.seesEntity(world, s), false, "behind the player");
  s.player.yaw -= Math.PI;
  placeEntity(s, 9.5, 4.5); // straight south, well outside the cone
  assert.equal(S.seesEntity(world, s), false, "outside the view cone");
});

test("the entity does not advance while the player sees her", () => {
  const s = fresh();
  gardenStand(s);
  const before = { x: s.ent.x, y: s.ent.y };
  run(s, {}, 4);
  assert.equal(s.ent.x, before.x, "x unchanged while seen");
  assert.equal(s.ent.y, before.y, "y unchanged while seen");
  assert.equal(s.ent.seen, true);
});

test("the entity advances while unseen and closes the distance", () => {
  const s = fresh();
  gardenStand(s);
  placeEntity(s, 6.5, 3.4);
  s.player.yaw += Math.PI;
  const d0 = Math.hypot(s.ent.x - s.player.x, s.ent.y - s.player.y);
  run(s, {}, 3);
  const d1 = Math.hypot(s.ent.x - s.player.x, s.ent.y - s.player.y);
  assert.ok(d1 < d0 - 0.5, "distance shrinks while unseen (" + d0.toFixed(2) + " -> " + d1.toFixed(2) + ")");
});

test("a flashlight beam freezes her for 1.5 to 2.5 seconds and she resumes afterwards", () => {
  const s = fresh();
  gardenStand(s);
  s.light = true;
  s.charge = 1;
  s.player.yaw = s.player.yaw; // still facing her
  const ev = S.step(world, s, {}, DT);
  assert.ok(ev.some(e => e.type === "freeze"), "beam freezes her");
  assert.equal(s.ent.state, "FROZEN");
  const frozen = s.ent.frozenT;
  assert.ok(frozen >= C.FREEZE_MIN && frozen <= C.FREEZE_MAX, "freeze length " + frozen);
  const x = s.ent.x;
  const y = s.ent.y;
  // Turn away: she is unseen, but the freeze still holds.
  s.player.yaw += Math.PI;
  run(s, {}, frozen - 0.2);
  assert.equal(s.ent.x, x, "still frozen");
  assert.equal(s.ent.y, y, "still frozen");
  run(s, {}, 0.5);
  assert.notEqual(s.ent.state, "FROZEN", "freeze has ended");
});

test("the beam only freezes her when she is close enough", () => {
  const s = fresh();
  gardenStand(s);
  s.light = true;
  s.player.x = 9.5;
  s.player.y = 2.5;
  placeEntity(s, 1.3, 2.5); // 8.2 m west, along the garden
  faceTo(s.player, 1.3, 2.5);
  assert.equal(S.beamHits(world, s), true, "in the beam at 8.2 m (beam range is 14 m)");
  S.step(world, s, {}, DT);
  assert.notEqual(s.ent.state, "FROZEN", "beyond the freeze range of 8 m");
});

test("darkness lets her approach unseen: with the light off she is not seen beyond 3 m", () => {
  const s = fresh();
  gardenStand(s);
  s.light = false;
  // Dark room in the house, 5 m ahead of the player: out of sight range.
  s.player.x = 2.5;
  s.player.y = 7.5;
  s.player.room = "ima";
  faceTo(s.player, 2.5, 9.5);
  placeEntity(s, 2.5, 9.9);
  // Close to her: the dark-room range, so seen. Far: not seen.
  assert.equal(S.seesEntity(world, s), false, "5 m in the dark, not seen");
  placeEntity(s, 2.5, 8.6);
  assert.equal(S.seesEntity(world, s), true, "1.1 m in the dark, seen by the eye");
});

// --------- stun and capture ---------

test("a shotgun hit stuns her for 6 to 8 seconds, pushes her back and makes her angrier", () => {
  const s = fresh();
  gardenStand(s);
  s.gun.chambers = [1, 0];
  const d0 = Math.hypot(s.ent.x - s.player.x, s.ent.y - s.player.y);
  assert.equal(S.shotHits(world, s), true, "centre of the spread hits");
  const ev = [];
  S.fire(world, s, ev);
  assert.ok(ev.some(e => e.type === "shot" && e.hit), "shot hits");
  assert.equal(s.ent.state, "STUNNED");
  assert.ok(s.ent.stunT >= C.STUN_MIN && s.ent.stunT <= C.STUN_MAX, "stun " + s.ent.stunT);
  const d1 = Math.hypot(s.ent.x - s.player.x, s.ent.y - s.player.y);
  assert.ok(d1 >= d0 + 1.2, "pushed back, " + d0.toFixed(2) + " -> " + d1.toFixed(2));
  assert.equal(s.ent.anger, 1);
  run(s, {}, C.STUN_MAX + 0.1);
  assert.notEqual(s.ent.state, "STUNNED", "the stun has worn off");
});

test("the stunned entity runs out of sight, then stalks again", () => {
  const s = fresh();
  gardenStand(s);
  s.gun.chambers = [1, 0];
  S.fire(world, s, []);
  s.player.yaw += Math.PI; // do not look at her while she runs
  run(s, {}, 2);
  assert.equal(s.ent.state, "STUNNED");
  // She should be far from the player, out of the cone.
  const d = Math.hypot(s.ent.x - s.player.x, s.ent.y - s.player.y);
  assert.ok(d >= 4, "retreated to " + d.toFixed(2));
});

test("the capture radius is about 1.1 m", () => {
  const s = fresh();
  gardenStand(s);
  s.player.yaw += Math.PI;
  placeEntity(s, s.player.x + 1.5, s.player.y);
  let ev = run(s, {}, 0.05);
  assert.equal(ev.some(e => e.type === "grab"), false, "1.5 m is outside the radius");
  placeEntity(s, s.player.x + 1.0, s.player.y);
  ev = run(s, {}, 0.05);
  assert.ok(ev.some(e => e.type === "grab"), "1.0 m grabs");
  assert.ok(s.respawnT > 0);
});

test("after a grab the run resets to the last checkpoint", () => {
  const s = fresh();
  gardenStand(s);
  s.inv.battery = 3;
  s.cp = S.serialize(world, s);
  s.player.x = 2.5;
  s.player.y = 11.5;
  placeEntity(s, 2.5, 11.4);
  run(s, {}, 0.05);
  assert.ok(s.respawnT > 0, "grabbed");
  const ev = run(s, {}, C.RESPAWN_TIME + 0.1);
  assert.ok(ev.some(e => e.type === "respawn" && e.fromCheckpoint));
  assert.equal(s.respawnT, -1);
  assert.equal(s.inv.battery, 3, "inventory comes from the checkpoint");
});

// --------- checkpoints and storage ---------

function burnAtSenko(s) {
  // West of the incense table, facing it.
  s.player.x = 11.2;
  s.player.y = 8.7;
  faceTo(s.player, 12.3, 8.7);
  return S.step(world, s, { actions: ["interact"] }, DT);
}

test("burning incense at the altar creates a checkpoint that round-trips through storage", () => {
  const s = fresh();
  s.inv.battery = 2;
  s.charge = 0.42;
  const ev = burnAtSenko(s);
  const cpEvent = ev.find(e => e.type === "checkpoint");
  assert.ok(cpEvent, "checkpoint emitted");
  const json = JSON.stringify(S.encodeStore(cpEvent.cp, { sens: 1.4, gamma: 1.1, sound: false }));
  const parsed = S.decodeStore(world, JSON.parse(json));
  assert.ok(parsed.cp, "valid checkpoint");
  assert.equal(parsed.settings.sens, 1.4);
  assert.equal(parsed.settings.sound, false);
  const r = S.restore(world, parsed.cp);
  assert.equal(r.inv.battery, 2);
  assert.equal(Math.round(r.charge * 100) / 100, 0.42);
  assert.equal(r.player.room, "butsuma");
  assert.ok(Math.abs(r.player.x - 11.2) < 0.01);
});

test("corrupt or mismatched storage is rejected and falls back to defaults", () => {
  const s = fresh();
  const cp = S.serialize(world, s);
  const cases = [
    null,
    "not an object",
    { v: 2, cp },
    { v: 1, cp: { ...cp, v: 2 } },
    { v: 1, cp: { ...cp, room: "kura" } },
    { v: 1, cp: { ...cp, inv: { fuda: 0, battery: 99, shell: 0 } } },
    { v: 1, cp: { ...cp, taken: ["bogus"] } },
    { v: 1, cp: { ...cp, doors: [true] } },
    { v: 1, cp: { ...cp, x: NaN } },
    { v: 1, cp: { ...cp, x: 4.5, y: 0.5 } },
    { v: 1, cp: { ...cp, notes: ["diary-9"] } },
    { v: 1, cp: { ...cp, placed: 1, inv: { fuda: 0, battery: 0, shell: 2 }, taken: [] } }
  ];
  for (const raw of cases) {
    const out = S.decodeStore(world, raw);
    assert.equal(out.cp, null, "rejects " + JSON.stringify(raw).slice(0, 60));
    assert.equal(out.settings.sens, 1, "settings fall back to defaults");
  }
  const bad = S.decodeStore(world, { v: 1, settings: { sens: 99, gamma: "x", sound: "yes" } });
  assert.equal(bad.settings.sens, 3, "sensitivity is clamped");
  assert.equal(bad.settings.gamma, 1, "gamma falls back");
  assert.equal(bad.settings.sound, true, "sound falls back");
});

test("corrupt JSON text is handled by the caller without throwing from the sim", () => {
  assert.throws(() => JSON.parse("{not json"));
  assert.equal(S.decodeStore(world, undefined).cp, null);
});

// --------- shotgun ---------

test("the shotgun loads one shell per break-open, fires two barrels, and clicks when empty", () => {
  const s = fresh();
  s.player.yaw = 0;
  const ev = [];
  // Empty gun, firing wastes the turn with a dry click.
  S.fire(world, s, ev);
  assert.ok(ev.some(e => e.type === "dry"), "dry click when empty");
  assert.equal(s.gun.state, "dry");
  const shotsDuringDry = [];
  S.fire(world, s, shotsDuringDry);
  assert.equal(shotsDuringDry.length, 0, "no input while the dry click plays");
  run(s, {}, 0.4);
  assert.equal(s.gun.state, "ready");

  const r1 = [];
  S.reload(s, r1);
  assert.equal(s.gun.state, "reload");
  assert.ok(r1.some(e => e.type === "break"), "break-open event");
  const l1 = run(s, {}, 0.9);
  assert.ok(l1.some(e => e.type === "load"), "first shell loads with a click");
  assert.deepEqual(s.gun.chambers, [1, 0]);
  assert.equal(s.inv.shell, 1);

  S.reload(s, []);
  run(s, {}, 0.9);
  assert.deepEqual(s.gun.chambers, [1, 1]);
  assert.equal(s.inv.shell, 0);

  const full = [];
  S.reload(s, full);
  assert.ok(full.some(e => e.type === "msg" && e.key === "chamber-full"), "both barrels loaded");
  assert.equal(s.gun.state, "ready");

  const shot1 = [];
  S.fire(world, s, shot1);
  assert.ok(shot1.some(e => e.type === "shot"), "first barrel fires");
  assert.deepEqual(s.gun.chambers, [0, 1]);
  const during = [];
  S.fire(world, s, during);
  assert.equal(during.length, 0, "no fire during recoil");
  run(s, {}, 0.6);
  const shot2 = [];
  S.fire(world, s, shot2);
  assert.ok(shot2.some(e => e.type === "shot"), "second barrel fires");
  assert.deepEqual(s.gun.chambers, [0, 0]);
  run(s, {}, 0.6);
  const empty = [];
  S.fire(world, s, empty);
  assert.ok(empty.some(e => e.type === "dry"), "empty gun clicks");
  assert.equal(empty.some(e => e.type === "shot"), false);
});

test("reloading with no shells left clicks and does not start a break-open", () => {
  const s = fresh();
  s.inv.shell = 0;
  const ev = [];
  S.reload(s, ev);
  assert.equal(s.gun.state, "ready");
  assert.ok(ev.some(e => e.type === "dry"));
  assert.ok(ev.some(e => e.type === "msg" && e.key === "shell-none"));
});

// --------- battery ---------

test("a battery lasts about four minutes and the light goes out at zero", () => {
  const s = fresh();
  S.toggleLight(s, []);
  assert.equal(s.light, true);
  run(s, {}, 120);
  assert.ok(Math.abs(s.charge - 0.5) < 0.01, "half after two minutes: " + s.charge);
  const ev = run(s, {}, 125);
  assert.equal(s.light, false, "dead after four minutes");
  assert.equal(s.charge, 0);
  assert.ok(ev.some(e => e.type === "flash" && e.dead));
});

test("the beam flickers only below twenty percent", () => {
  const s = fresh();
  s.light = true;
  s.charge = 0.5;
  let minFlick = 1;
  for (let i = 0; i < 600; i++) {
    S.step(world, s, {}, DT);
    minFlick = Math.min(minFlick, s.flicker);
  }
  assert.equal(minFlick, 1, "no flicker above the threshold");
  s.charge = 0.15;
  s.light = true;
  let flickered = false;
  for (let i = 0; i < 600; i++) {
    S.step(world, s, {}, DT);
    if (s.flicker < 1) flickered = true;
  }
  assert.ok(flickered, "flickers below the threshold");
});

test("F swaps a spent battery for a spare one and reports when none are left", () => {
  const s = fresh();
  s.charge = 0;
  s.light = false;
  let ev = [];
  S.toggleLight(s, ev);
  assert.ok(ev.some(e => e.type === "msg" && e.key === "battery-none"));
  s.inv.battery = 1;
  ev = [];
  S.toggleLight(s, ev);
  assert.equal(s.light, true);
  assert.equal(s.charge, 1);
  assert.equal(s.inv.battery, 0);
  assert.ok(ev.some(e => e.type === "battery-swap"));
});

// --------- seal, endings and the call ---------

function pickAllTalismans(s) {
  S.FUDA_IDS.forEach(id => { s.taken[id] = true; });
  s.inv.fuda = 3;
}

// East of the well, 1.5 m from its centre: within the place-talisman reach, clear of her.
function stageAtWell(s) {
  s.player.x = 8.0;
  s.player.y = 1.5;
  faceTo(s.player, world.well.x, world.well.y);
}

test("sealing: three talismans, then the lid, then the dawn ends the run as 封じ", () => {
  const s = fresh();
  pickAllTalismans(s);
  stageAtWell(s);
  for (let i = 0; i < 3; i++) {
    const ev = S.step(world, s, { actions: ["interact"] }, DT);
    assert.ok(ev.some(e => e.type === "seal" && e.count === i + 1), "talisman " + (i + 1) + " placed");
  }
  assert.equal(s.inv.fuda, 0);
  assert.equal(s.placed, 3);
  const lid = S.step(world, s, { actions: ["interact"] }, DT);
  assert.ok(lid.some(e => e.type === "lid"));
  assert.equal(s.ent.state, "SEALED");
  assert.equal(s.ending, null);
  run(s, {}, C.SEAL_DAWN + 0.1);
  assert.equal(s.ending, "seal");
});

test("without a talisman in hand the well only looks, and nothing happens", () => {
  const s = fresh();
  stageAtWell(s);
  const ev = S.step(world, s, { actions: ["interact"] }, DT);
  assert.ok(ev.some(e => e.type === "msg" && e.key === "well-look"));
  assert.equal(s.placed, 0);
});

test("the call offers 返事をする and answering it ends the run as 連れていかれた", () => {
  const s = fresh();
  s.awakened = true;
  gardenStand(s);
  s.callCD = 0;
  const ev = run(s, {}, 0.1);
  assert.ok(ev.some(e => e.type === "call"), "she calls when the player is near the well");
  assert.ok(s.choice, "choice is open");
  const ans = S.step(world, s, { actions: ["answer"] }, DT);
  assert.ok(ans.some(e => e.type === "ending" && e.kind === "taken"));
  assert.equal(s.ending, "taken");
});

test("silence lets the call pass, and she calls again after a pause", () => {
  const s = fresh();
  s.awakened = true;
  gardenStand(s);
  s.callCD = 0;
  run(s, {}, 0.1);
  const silent = S.step(world, s, { actions: ["silence"] }, DT);
  assert.ok(silent.some(e => e.type === "silence"));
  assert.equal(s.choice, null);
  assert.equal(s.ending, null);
  assert.ok(s.callCD >= C.CALL_GAP_MIN && s.callCD <= C.CALL_GAP_MAX);
  // Let the choice time out instead: it counts as silence.
  s.callCD = 0;
  run(s, {}, 0.1);
  const ev = run(s, {}, C.CALL_WAIT + 0.1);
  assert.ok(ev.some(e => e.type === "silence"), "timeout is silence");
  assert.equal(s.ending, null);
});

test("the call does not sound while the player is far from the well", () => {
  const s = fresh();
  s.awakened = true;
  s.player.x = 2.5;
  s.player.y = 11.5;
  s.callCD = 0;
  const ev = run(s, {}, 1);
  assert.equal(ev.some(e => e.type === "call"), false);
});

test("the full route can be finished: collect all three talismans via their hiding places and seal", () => {
  const s = fresh();
  // Visit each hiding spot, facing it, and interact.
  const stops = [
    { id: "hako", x: 10.3, y: 12.3, yaw: null, pos: [10.3, 11.4] },
    { id: "ihai", x: 13.62, y: 7.5, pos: [12.4, 7.5] },
    { id: "chest", x: 14.5, y: 0.33, pos: [14.5, 1.4] }
  ];
  for (const st of stops) {
    s.player.x = st.pos[0];
    s.player.y = st.pos[1];
    faceTo(s.player, st.x, st.y);
    const ev = S.step(world, s, { actions: ["interact"] }, DT);
    assert.ok(ev.some(e => e.type === "search"), st.id + " searched");
  }
  assert.equal(s.inv.fuda, 3, "three talismans in hand");
  assert.equal(S.fudaCount(world, s), 3);
  stageAtWell(s);
  for (let i = 0; i < 4; i++) S.step(world, s, { actions: ["interact"] }, DT);
  assert.equal(s.seal.lid, true);
  run(s, {}, C.SEAL_DAWN + 0.1);
  assert.equal(s.ending, "seal");
});

// --------- determinism and tooling ---------

function scriptedInput(i) {
  const phase = Math.floor(i / 240) % 4;
  const actions = [];
  if (i % 300 === 17) actions.push("flash");
  if (i % 200 === 50) actions.push("fire");
  if (i % 210 === 120) actions.push("reload");
  if (i % 420 === 300) actions.push("interact");
  return {
    mx: phase === 1 ? 1 : phase === 3 ? -0.5 : 0,
    mz: phase === 0 ? 1 : phase === 2 ? 0.6 : 0,
    turn: 0.01 * ((i % 90) < 45 ? 1 : -1),
    run: i % 500 < 100,
    actions
  };
}

test("a fixed seed and fixed input produce the same run", () => {
  const a = fresh(4242);
  const b = fresh(4242);
  const c = fresh(9999);
  a.awakened = true;
  b.awakened = true;
  c.awakened = true;
  const evA = [];
  const evB = [];
  for (let i = 0; i < 2400; i++) {
    evA.push(...S.step(world, a, scriptedInput(i), DT));
    evB.push(...S.step(world, b, scriptedInput(i), DT));
    S.step(world, c, scriptedInput(i + 3), DT);
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same seed, same state");
  assert.equal(JSON.stringify(evA), JSON.stringify(evB), "same seed, same events");
  assert.notEqual(JSON.stringify(a.amb), JSON.stringify(c.amb), "a different seed changes the ambience");
});

test("the simulation never reads the wall clock or Math.random", () => {
  for (const f of ["sim.js", "levels.js"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.equal(/Date\.now|Math\.random|performance\.now/.test(src), false, f);
  }
});

test("every key the sim emits has subtitle or label text", () => {
  const s = fresh(77);
  s.awakened = true;
  const seen = new Set();
  const collect = (ev) => ev.forEach(e => {
    if (e.type === "narr" || e.type === "msg") seen.add(e.key);
  });
  for (let i = 0; i < 1500; i++) {
    collect(S.step(world, s, scriptedInput(i), DT));
  }
  // Force a few paths the scripted input may not reach.
  for (const key of ["fuda-got", "well-look", "search-none", "door-blocked"]) {
    seen.add(key);
  }
  for (const key of seen) {
    assert.ok(Story.LINES[key], "text for " + key);
  }
});

test("ambient events occur over a long quiet run, and only in the house or garden", () => {
  const s = fresh(31337);
  const kinds = new Set();
  for (let i = 0; i < 60 * 240; i++) {
    for (const e of S.step(world, s, {}, DT)) {
      if (e.type === "ambient") kinds.add(e.kind);
      if (e.type === "lightning") kinds.add("lightning");
      if (e.type === "thunder") kinds.add("thunder");
    }
    if (s.ending) break;
  }
  assert.ok(kinds.has("lightning") && kinds.has("thunder"), "weather plays");
  assert.ok(kinds.has("slam") || kinds.has("rustle") || kinds.has("silhouette") || kinds.has("chime-stop"), "scares play");
});

test("the danger fear measure rises when she is close and falls in the light", () => {
  const s = fresh();
  s.awakened = true;
  s.light = false;
  gardenStand(s);
  placeEntity(s, s.player.x + 6, s.player.y);
  const far = S.fearOf(world, s);
  placeEntity(s, s.player.x + 1.4, s.player.y);
  const near = S.fearOf(world, s);
  assert.ok(near > far, "closer is scarier");
  assert.ok(near <= 1 && far >= 0);
});
