/* REPRISE — pure, deterministic rules shared by the game and its checks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RepriseRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DIR = Object.freeze({ U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0], W: [0, 0] });
  const KEYS = Object.keys(DIR);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const key = p => `${p[0]},${p[1]}`;

  function parse(raw) {
    const h = raw.map.length, w = raw.map[0].length;
    if (!raw.map.every(row => row.length === w)) throw new Error(`Uneven map: ${raw.name}`);
    const grid = raw.map.map(row => row.split(""));
    let start, goal, fragment = null;
    const plates = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tile = grid[y][x];
      if (tile === "S") start = [x, y];
      if (tile === "G") goal = [x, y];
      if (tile === "*") fragment = [x, y];
      if (tile === "a" || tile === "b") plates.push([x, y]);
      if (!"#.SDGTab*".includes(tile)) throw new Error(`Unknown tile ${tile}: ${raw.name}`);
    }
    if (!start || !goal || !plates.length) throw new Error(`Incomplete map: ${raw.name}`);
    return Object.freeze({ ...raw, w, h, grid, start, goal, fragment, plates });
  }
  function tileAt(level, p) { return level.grid[p[1]]?.[p[0]] || "#"; }
  function lit(level, actors) { return level.plates.map(plate => actors.some(actor => same(actor, plate))); }
  function step(level, actors, actions, tick = 0) {
    const open = lit(level, actors).every(Boolean);
    return actors.map((actor, index) => {
      const delta = DIR[actions[index]] || DIR.W;
      const next = [actor[0] + delta[0], actor[1] + delta[1]];
      const tile = tileAt(level, next);
      return tile === "#" || (tile === "D" && !open) || (tile === "T" && (!open || (tick + 1) % 2 !== 0)) ? actor.slice() : next;
    });
  }
  function simulate(level, echoes = [], actions = []) {
    const actors = [level.start.slice(), ...echoes.map(() => level.start.slice())];
    let collected = false;
    const history = [];
    for (let tick = 0; tick < actions.length; tick++) {
      const command = actions[tick];
      if (!DIR[command]) throw new Error("Invalid action");
      const prior = actors.map(p => p.slice());
      const moves = [command, ...echoes.map(path => path[tick] || "W")];
      const next = step(level, actors, moves, tick);
      if (command !== "W" && same(next[0], actors[0])) throw new Error("Blocked player action");
      next.forEach((p, i) => { actors[i] = p; });
      if (level.fragment && same(actors[0], level.fragment)) collected = true;
      history.push({ actors: actors.map(p => p.slice()), lit: lit(level, actors), command, collected });
      // A ghost's final position is held for the rest of the take.
      if (prior.length !== actors.length) throw new Error("Actor count changed");
    }
    return { actors, lit: lit(level, actors), collected, complete: same(actors[0], level.goal), history };
  }
  function canMove(level, echoes, actions, direction) {
    if (!DIR[direction] || actions.length >= level.beats) return false;
    try { simulate(level, echoes, [...actions, direction]); return true; }
    catch { return false; }
  }
  function validateTake(level, echoes, actions) {
    if (!Array.isArray(echoes) || echoes.length > level.echoes || !Array.isArray(actions) || actions.length > level.beats) return false;
    if (![...echoes, actions].every(path => Array.isArray(path) && path.length <= level.beats && path.every(move => KEYS.includes(move)))) return false;
    try {
      let previous = [];
      const used = new Set();
      for (const path of echoes) {
        if (path.length === 0) return false;
        const end = simulate(level, previous, path).actors[0];
        const plate = level.plates.findIndex(p => same(p, end));
        if (plate < 0 || used.has(plate)) return false;
        used.add(plate);
        previous = [...previous, path];
      }
      simulate(level, echoes, actions);
      return true;
    } catch { return false; }
  }
  return { DIR, parse, key, same, tileAt, lit, step, simulate, canMove, validateTake };
});
