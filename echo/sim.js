"use strict";
/* ECHO — きろくの協力者
   時間が巻き戻る塔の中で、過去の自分の残像（エコー）と協力して扉をひらくパズルの、
   DOMに依存しない中核ロジック。
   ブラウザでは window.EchoSim、Node では module.exports として読み込める。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EchoSim = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const ACTIONS = ["up", "down", "left", "right", "wait"];
  const VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };

  // レベル記号: . 床 / # 壁 / @ スタート / G ゴール / D ドア / 1-4 プレート
  // doors は [{x, y, needs:[1,2]}] で、needs のプレートが全部ふまれている間だけ開く。
  function parseLevel(spec) {
    const rows = spec.rows;
    if (!Array.isArray(rows) || !rows.length) throw new Error("empty level rows: " + spec.id);
    const w = rows[0].length, h = rows.length;
    if (rows.some(row => row.length !== w)) throw new Error("ragged level rows: " + spec.id);
    const tiles = rows.map(row => row.split(""));
    let start = null, goal = null;
    const plates = new Map();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = tiles[y][x];
        if (ch === "@") {
          if (start) throw new Error("two starts: " + spec.id);
          start = { x, y };
          tiles[y][x] = ".";
        } else if (ch === "G") {
          if (goal) throw new Error("two goals: " + spec.id);
          goal = { x, y };
        } else if (ch >= "1" && ch <= "4") {
          if (plates.has(Number(ch))) throw new Error("two plates " + ch + ": " + spec.id);
          plates.set(Number(ch), { x, y });
        } else if (ch !== "#" && ch !== "." && ch !== "D") {
          throw new Error("unknown tile " + ch + ": " + spec.id);
        }
      }
    }
    if (!start) throw new Error("no start: " + spec.id);
    if (!goal) throw new Error("no goal: " + spec.id);
    const doors = (spec.doors || []).map((door, i) => {
      if (tiles[door.y]?.[door.x] !== "D") throw new Error("door " + i + " is not on a D: " + spec.id);
      const needs = Array.isArray(door.needs) ? door.needs.slice() : [];
      if (!needs.length) throw new Error("door " + i + " needs a plate: " + spec.id);
      for (const id of needs) if (!plates.has(id)) throw new Error("door " + i + " needs missing plate " + id + ": " + spec.id);
      return { x: door.x, y: door.y, needs };
    });
    let doorCells = 0;
    for (const row of tiles) for (const ch of row) if (ch === "D") doorCells++;
    if (doorCells !== doors.length) throw new Error("D tiles and door list disagree: " + spec.id);
    return {
      id: spec.id, name: spec.name, en: spec.en, hint: spec.hint, note: spec.note,
      chapter: spec.chapter || 0, loop: spec.loop, maxLoops: spec.maxLoops, par: spec.par,
      w, h, tiles, start, goal,
      plates: [...plates.keys()].sort((a, b) => a - b).map(id => ({ id, ...plates.get(id) })),
      doors,
      solution: spec.solution || []
    };
  }

  function beginWorld(level, echoes) {
    const world = {
      level, w: level.w, h: level.h, tiles: level.tiles,
      player: { x: level.start.x, y: level.start.y },
      echoes: [],
      plateOn: new Set(),
      doorsOpen: new Set(),
      turn: 0,
      status: "running"
    };
    for (let i = 0; i < echoes; i++) world.echoes.push({ x: level.start.x, y: level.start.y });
    return world;
  }

  function doorIndexAt(world, x, y) {
    return world.level.doors.findIndex(door => door.x === x && door.y === y);
  }

  // ドアは閉じている間だけ壁。プレートの上に誰かいる間は開いている。
  function walkable(world, x, y) {
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
    const ch = world.tiles[y][x];
    if (ch === "#") return false;
    if (ch === "D") return world.doorsOpen.has(doorIndexAt(world, x, y));
    return true;
  }

  // エコーは実体ではなく「きろくの光」。プレイヤーとも、エコー同士とも重なれる。
  // 動けないのは壁と閉じたドアだけ。プレートは誰かが立っていればおされる。
  function stepWorld(world, actions) {
    const actors = [world.player, ...world.echoes];
    const events = [];
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      const action = ACTIONS.includes(actions[i]) ? actions[i] : "wait";
      const [dx, dy] = VECTORS[action];
      const moving = dx !== 0 || dy !== 0;
      const to = { x: actor.x + dx, y: actor.y + dy };
      if (moving && walkable(world, to.x, to.y)) {
        const from = { x: actor.x, y: actor.y };
        actor.x = to.x;
        actor.y = to.y;
        events.push({ type: "move", actor: i, from, to: { x: actor.x, y: actor.y }, action });
      } else {
        events.push({ type: "stay", actor: i, from: { x: actor.x, y: actor.y }, to: { x: actor.x, y: actor.y }, action, blocked: moving });
      }
    }
    world.turn++;
    const on = new Set();
    for (const plate of world.level.plates) {
      if (actors.some(actor => actor.x === plate.x && actor.y === plate.y)) on.add(plate.id);
    }
    for (const id of on) if (!world.plateOn.has(id)) events.push({ type: "plate", id, on: true });
    for (const id of world.plateOn) if (!on.has(id)) events.push({ type: "plate", id, on: false });
    world.plateOn = on;
    const open = new Set();
    world.level.doors.forEach((door, i) => {
      if (door.needs.every(id => on.has(id))) open.add(i);
    });
    for (const i of open) if (!world.doorsOpen.has(i)) events.push({ type: "door", index: i, open: true });
    for (const i of world.doorsOpen) if (!open.has(i)) events.push({ type: "door", index: i, open: false });
    world.doorsOpen = open;
    if (world.player.x === world.level.goal.x && world.player.y === world.level.goal.y) {
      world.status = "won";
      events.push({ type: "win" });
    }
    return events;
  }

  // 1回のプレイ（セッション）。plans の最後が現在の周で、それより前は全部エコーになる。
  function createSession(level) {
    return {
      level,
      plans: [[]],
      world: beginWorld(level, 0),
      loop: 1,
      status: "running",
      events: [],
      totalTurns: 0
    };
  }

  function advance(session, action) {
    if (!session || session.status !== "running") return null;
    const plan = session.plans[session.plans.length - 1];
    if (plan.length >= session.level.loop) return null;
    const move = ACTIONS.includes(action) ? action : "wait";
    plan.push(move);
    const t = plan.length - 1;
    const echoes = session.plans.slice(0, -1).map(past => past[t] || "wait");
    const events = stepWorld(session.world, [move, ...echoes]);
    session.totalTurns++;
    session.events = events;
    if (session.world.status === "won") {
      session.status = "won";
    } else if (plan.length >= session.level.loop) {
      if (session.plans.length >= session.level.maxLoops) {
        session.status = "exhausted";
      } else {
        session.plans.push([]);
        session.loop = session.plans.length;
        session.world = beginWorld(session.level, session.plans.length - 1);
        events.push({ type: "rewind" });
      }
    }
    return events;
  }

  // いまの周の手をすべて取り消して、同じ周のはじめから考え直す。
  // これまでの周（エコー）はそのまま残る。
  function undo(session, all) {
    if (!session || session.status === "won") return null;
    const plan = session.plans[session.plans.length - 1];
    if (!plan.length) return null;
    if (all) plan.length = 0;
    else plan.pop();
    const flat = [];
    for (const past of session.plans) for (const action of past) flat.push(action);
    const fresh = createSession(session.level);
    let events = [];
    for (const action of flat) {
      const out = advance(fresh, action);
      if (out) events = out;
    }
    session.plans = fresh.plans;
    session.world = fresh.world;
    session.loop = fresh.loop;
    session.status = fresh.status;
    session.totalTurns = fresh.totalTurns;
    session.events = events;
    return events;
  }

  // この周の残りターンを「待つ」でうめて、時間を先へ進める。
  function skipLoop(session) {
    if (!session || session.status !== "running") return null;
    const plan = session.plans[session.plans.length - 1];
    const remaining = session.level.loop - plan.length;
    let events = null;
    for (let i = 0; i < remaining && session.status === "running"; i++) {
      const out = advance(session, "wait");
      if (out) events = out;
    }
    return events;
  }

  // 模範解答やテストのための一括実行。
  function simulate(level, plans) {
    const session = createSession(level);
    for (const plan of plans) {
      for (const action of plan) {
        if (session.status !== "running") break;
        advance(session, action);
      }
      if (session.status !== "running") break;
    }
    return session;
  }

  function starsFor(level, loop) {
    if (loop <= level.par) return 3;
    if (loop <= level.par + 1) return 2;
    return 1;
  }

  // 保存データは、座標ではなく行動列を再生して検証する。
  function cleanSave(raw, levels) {
    const data = raw && typeof raw === "object" ? raw : {};
    const records = {};
    for (const level of levels) {
      const record = data.records?.[level.id];
      if (record && Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3 &&
          Number.isInteger(record.loop) && record.loop >= 1 && record.loop <= level.maxLoops) {
        records[level.id] = { stars: record.stars, loop: record.loop };
      }
    }
    let session = null;
    const pending = data.session;
    if (pending && typeof pending === "object") {
      const level = levels.find(l => l.id === pending.id);
      if (level && Array.isArray(pending.plans) && pending.plans.length >= 1 && pending.plans.length <= level.maxLoops) {
        const ok = pending.plans.every((plan, i) =>
          Array.isArray(plan) && plan.length <= level.loop &&
          plan.every(action => ACTIONS.includes(action)) &&
          (i === pending.plans.length - 1 || plan.length === level.loop));
        if (ok) {
          const check = simulate(level, pending.plans);
          if (check.status === "running" && check.loop === pending.plans.length) {
            session = { id: level.id, plans: pending.plans.map(plan => plan.slice()) };
          }
        }
      }
    }
    return {
      records, session,
      sound: data.sound !== false,
      motion: data.motion !== false,
      last: levels.some(level => level.id === data.last) ? data.last : levels[0].id
    };
  }

  return {
    ACTIONS, VECTORS, parseLevel, beginWorld, walkable, doorIndexAt, stepWorld,
    createSession, advance, undo, skipLoop, simulate, starsFor, cleanSave
  };
});
