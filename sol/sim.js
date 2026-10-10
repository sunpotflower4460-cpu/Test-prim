/* AFTERTIDE's rules are shared by the game, route hints, and solvability tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0], A: [0, 0] };
  const CURRENTS = { '^': 'N', '>': 'E', 'v': 'S', '<': 'W' };
  const ACTIONS = ['N', 'E', 'S', 'W', 'A'];
  function parse(spec) {
    const rows = spec.map;
    if (!rows.length || rows.some(r => r.length !== rows[0].length)) throw Error('Nonrectangular sea: ' + spec.name);
    const level = { ...spec, width: rows[0].length, height: rows.length, mail: [], shells: [], gates: [] };
    let starts = 0, goals = 0;
    rows.forEach((row, y) => [...row].forEach((tile, x) => {
      if (!'#.~^>v<SBmoO'.includes(tile)) throw Error('Unknown tile ' + tile);
      if (tile === 'S') { level.start = { x, y }; starts++; }
      if (tile === 'B') { level.goal = { x, y }; goals++; }
      if (tile === 'm') level.mail.push({ x, y });
      if (tile === 'o') level.shells.push({ x, y });
      if (tile === 'O') level.gates.push({ x, y });
    }));
    if (starts !== 1 || goals !== 1 || !level.mail.length || level.mail.length > 4 || level.shells.length > 4 || ![0, 2].includes(level.gates.length)) throw Error('Invalid landmarks: ' + spec.name);
    level.allMail = (1 << level.mail.length) - 1;
    level.allShells = (1 << level.shells.length) - 1;
    return level;
  }
  function initial(level) { return { ...level.start, tide: level.tide || 0, mail: 0, shells: 0, turns: 0 }; }
  function tile(level, x, y) { return level.map[y]?.[x] || '#'; }
  function collect(level, state) {
    level.mail.forEach((p, i) => { if (p.x === state.x && p.y === state.y) state.mail |= 1 << i; });
    level.shells.forEach((p, i) => { if (p.x === state.x && p.y === state.y) state.shells |= 1 << i; });
  }
  function won(level, state) { return state.mail === level.allMail && state.x === level.goal.x && state.y === level.goal.y; }
  function step(level, before, action) {
    if (!DIRS[action] || won(level, before)) return { ok: false, reason: 'done' };
    const state = { ...before }, path = [];
    if (action === 'A') {
      state.tide ^= 1; state.turns++;
      return { ok: true, state, path: [{ x: state.x, y: state.y, anchor: true }], events: [] };
    }
    const [dx, dy] = DIRS[action];
    state.x += dx; state.y += dy;
    const events = [], seen = new Set();
    let exitGate = false;
    while (true) {
      const t = tile(level, state.x, state.y);
      if (t === '#') return { ok: false, reason: path.length ? 'current-rock' : 'rock' };
      if (t === '~' && !before.tide) return { ok: false, reason: 'shallow' };
      const key = state.x + ',' + state.y;
      if (seen.has(key)) return { ok: false, reason: 'loop' };
      seen.add(key);
      path.push({ x: state.x, y: state.y, portal: exitGate });
      const m = state.mail, s = state.shells;
      collect(level, state);
      if (state.mail !== m) events.push({ type: 'mail', x: state.x, y: state.y });
      if (state.shells !== s) events.push({ type: 'shell', x: state.x, y: state.y });
      if (before.tide && t === 'O' && !exitGate) {
        const dest = level.gates.find(p => p.x !== state.x || p.y !== state.y);
        state.x = dest.x; state.y = dest.y; exitGate = true;
        events.push({ type: 'portal', x: state.x, y: state.y });
        continue;
      }
      if (before.tide && CURRENTS[t]) {
        const [cx, cy] = DIRS[CURRENTS[t]];
        state.x += cx; state.y += cy; exitGate = false;
        continue;
      }
      break;
    }
    state.tide ^= 1; state.turns++;
    return { ok: true, state, path, events };
  }
  function key(s, all) { return [s.x, s.y, s.tide, s.mail, all ? s.shells : 0].join(','); }
  // Breadth-first search: every action costs exactly one turn, including anchoring.
  // A bounded finite state space makes hints deterministic and safe offline.
  function solve(level, start = initial(level), all = false) {
    const queue = [{ state: start, prev: -1, action: null }], visited = new Set([key(start, all)]);
    for (let head = 0; head < queue.length; head++) {
      const item = queue[head];
      if (won(level, item.state) && (!all || item.state.shells === level.allShells)) {
        const route = [];
        for (let k = head; queue[k].prev !== -1; k = queue[k].prev) route.push(queue[k].action);
        return route.reverse();
      }
      for (const action of ACTIONS) {
        const r = step(level, item.state, action);
        if (!r.ok) continue;
        // Docking ends a voyage, so a route seeking every shell cannot dock early.
        if (all && won(level, r.state) && r.state.shells !== level.allShells) continue;
        const k = key(r.state, all);
        if (!visited.has(k)) { visited.add(k); queue.push({ state: r.state, prev: head, action }); }
      }
    }
    return null;
  }
  function count(mask) { let n = 0; while (mask) { n += mask & 1; mask >>>= 1; } return n; }
  function medal(level, state) { return won(level, state) ? (state.shells !== level.allShells ? 1 : state.turns <= level.par ? 3 : 2) : 0; }
  function cleanSave(data, levels) {
    const d = data && typeof data === 'object' ? data : {};
    const records = {};
    for (const level of levels) {
      const r = d.records?.[level.id];
      if (r && Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 3 && Number.isInteger(r.turns) && r.turns > 0 && r.turns < 100000) records[level.id] = { stars: r.stars, turns: r.turns, all: Number.isInteger(r.all) && r.all > 0 && r.all < 100000 ? r.all : null };
    }
    let voyage = null;
    const pending = d.voyage;
    const index = pending && levels.findIndex(l => l.id === pending.id);
    if (Number.isInteger(index) && index >= 0 && (index === 0 || records[levels[index - 1].id]) && Array.isArray(pending.actions) && pending.actions.length <= 4096) {
      let state = initial(levels[index]), valid = true;
      for (const action of pending.actions) {
        const result = step(levels[index], state, action);
        if (!result.ok) { valid = false; break; }
        state = result.state;
      }
      if (valid && !won(levels[index], state)) voyage = { id: pending.id, actions: pending.actions.slice() };
    }
    return { records, voyage, music: d.music !== false, effects: d.effects !== false, motion: d.motion !== false, last: levels.some(l => l.id === d.last) ? d.last : levels[0].id };
  }
  return { DIRS, CURRENTS, ACTIONS, parse, initial, tile, step, solve, won, count, medal, cleanSave };
});
