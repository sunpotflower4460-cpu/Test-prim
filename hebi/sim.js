/* 蛇の歩み。頭を一マス進め、胴は通った場所に残る。食べて伸びることはない。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Hebi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

  function key(x, y) { return x + "," + y; }
  function has(list, x, y) {
    for (let i = 0; i < list.length; i++) if (list[i].x === x && list[i].y === y) return list[i];
    return null;
  }
  function copyState(state) {
    return {
      snake: state.snake.map(part => ({ x: part.x, y: part.y })),
      stones: Object.assign({}, state.stones),
      molts: Object.assign({}, state.molts)
    };
  }
  function initial(level) {
    return {
      snake: level.snake.map(part => ({ x: part.x, y: part.y })),
      stones: {},
      molts: {}
    };
  }

  function step(level, state, dir) {
    const delta = DIRS[dir];
    if (!delta) return { ok: false, win: false, reason: "dir", state: state };
    const head = state.snake[0];
    const x = head.x + delta[0];
    const y = head.y + delta[1];
    if (x < 0 || y < 0 || x >= level.w || y >= level.h || has(level.walls, x, y)) {
      return { ok: false, win: false, reason: "wall", state: state };
    }
    if (has(level.dishes, x, y)) return { ok: false, win: false, reason: "dish", state: state };
    const slit = has(level.slits, x, y);
    if (slit && state.snake.length > slit.max) return { ok: false, win: false, reason: "slit", state: state };
    const molt = has(level.molts, x, y);
    const shedding = !!(molt && !state.molts[key(x, y)]);
    if (shedding && state.snake.length < 3) return { ok: false, win: false, reason: "short", state: state };
    const freed = shedding ? 2 : 1;
    const length = state.snake.length;
    for (let i = 0; i <= length - freed - 1; i++) {
      if (state.snake[i].x === x && state.snake[i].y === y) {
        return { ok: false, win: false, reason: "self", state: state };
      }
    }
    const snake = [{ x: x, y: y }].concat(state.snake.slice(0, length - freed));
    const stones = Object.assign({}, state.stones);
    if (has(level.stones, x, y)) stones[key(x, y)] = true;
    const molts = Object.assign({}, state.molts);
    if (shedding) molts[key(x, y)] = true;
    const next = { snake: snake, stones: stones, molts: molts };
    if (level.exit && level.exit.x === x && level.exit.y === y) {
      const stonesDone = level.stones.every(stone => stones[key(stone.x, stone.y)]);
      const latched = level.latches.every(latch => snake.some(part => part.x === latch.x && part.y === latch.y));
      if (stonesDone && latched) return { ok: true, win: true, reason: "win", state: next };
      return { ok: false, win: false, reason: "early", state: state };
    }
    return { ok: true, win: false, reason: "", state: next };
  }

  function play(level, moves) {
    let state = initial(level);
    let reason = "open";
    for (let i = 0; i < moves.length; i++) {
      const result = step(level, state, moves[i]);
      if (result.win) return { ok: true, win: true, reason: "win", state: result.state };
      if (result.reason === "early") {
        reason = "early";
        continue;
      }
      if (!result.ok) return { ok: false, win: false, reason: result.reason, state: result.state };
      state = result.state;
      reason = "open";
    }
    return { ok: false, win: false, reason: reason, state: state };
  }

  return { DIRS: DIRS, key: key, initial: initial, copyState: copyState, step: step, play: play };
});
