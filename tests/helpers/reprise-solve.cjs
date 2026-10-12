const rules = require("../../gpt6-sol/rules.js");
function route(level, echoes, target, withFragment = false) {
  const queue = [[]], seen = new Set();
  for (let head = 0; head < queue.length; head++) {
    const path = queue[head], state = rules.simulate(level, echoes, path);
    if (rules.same(state.actors[0], target) && (!withFragment || state.collected)) return path;
    if (path.length === level.beats) continue;
    const id = `${rules.key(state.actors[0])}:${path.length}:${state.collected}`;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const move of ["U", "R", "D", "L", "W"]) {
      const candidate = [...path, move];
      try { rules.simulate(level, echoes, candidate); queue.push(candidate); }
      catch { /* A wall or a closed curtain. */ }
    }
  }
  return null;
}

module.exports = route;
