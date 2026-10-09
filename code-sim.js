"use strict";
/* RELAY — ひかりの手順
   命令ブロックを組んでユニットを導くパズルゲームの、DOMに依存しない中核ロジック。
   ブラウザでは window.CodeSim、Node では module.exports として読み込める。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CodeSim = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W
  const DIR_NAMES = ["N", "E", "S", "W"];
  const ACTIONS = new Set(["fwd", "jump", "left", "right", "wait", "rep", "end"]);
  const MAX_DEPTH = 3;
  const MAX_STEPS = 4000;

  // ステージ記号: . 床 / # 壁 / C コア / S スイッチ / E 出口 / ^ とげ / O あな
  const LEVELS = [
    {
      id: 1, name: "はじめの一行", en: "FIRST LINE",
      hint: "▶ 前進 を 2 ついれて、▶ 実行 をおそう",
      par: 2, slots: 8,
      rows: [
        "#####",
        "#...#",
        "#.CE#",
        "#...#",
        "#####"
      ],
      start: { x: 1, y: 2, dir: 1 },
      patrols: [],
      solution: ["fwd", "fwd"]
    },
    {
      id: 2, name: "まがりかど", en: "TURNING POINT",
      hint: "↻ 右折 で むきを かえよう",
      par: 5, slots: 10,
      rows: [
        "#####",
        "#..C#",
        "#...#",
        "#..E#",
        "#####"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["fwd", "fwd", "right", "fwd", "fwd"]
    },
    {
      id: 3, name: "ふたつの光", en: "TWO LIGHTS",
      hint: "コアを すべて 集めると 出口が ひらく",
      par: 9, slots: 14,
      rows: [
        "######",
        "#.C..#",
        "#....#",
        "#..C.#",
        "#...E#",
        "######"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["fwd", "fwd", "right", "fwd", "fwd", "left", "fwd", "right", "fwd"]
    },
    {
      id: 4, name: "あぶないゆか", en: "HAZARD FLOOR",
      hint: "とげ にふれると こしょう。まわりみちを さがそう",
      par: 9, slots: 13,
      rows: [
        "#####",
        "#..C#",
        "#.^.#",
        "#...#",
        "#E..#",
        "#####"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["fwd", "fwd", "right", "fwd", "fwd", "fwd", "right", "fwd", "fwd"]
    },
    {
      id: 5, name: "はねこえ", en: "CLEAR THE GAP",
      hint: "⤒ 跳ぶ は となりの あな・とげ を とびこえて 2マス すすむ",
      par: 5, slots: 10,
      rows: [
        "#####",
        "#...#",
        "#.O.#",
        "#...#",
        "#..C#",
        "#..E#",
        "#####"
      ],
      start: { x: 1, y: 2, dir: 1 },
      patrols: [],
      solution: ["jump", "right", "fwd", "fwd", "fwd"]
    },
    {
      id: 6, name: "くりかえし", en: "LOOP",
      hint: "⟳ 繰り返し で 同じ命令を まとめよう",
      par: 6, slots: 12,
      rows: [
        "##########",
        "#........#",
        "#.C......#",
        "#........#",
        "#.......E#",
        "##########"
      ],
      start: { x: 1, y: 2, dir: 1 },
      patrols: [],
      solution: ["rep7", "fwd", "end", "right", "fwd", "fwd"]
    },
    {
      id: 7, name: "かいだん", en: "STAIRCASE",
      hint: "すこしずつ ずれる 道は、くりかえしと 相性がいい",
      par: 6, slots: 12,
      rows: [
        "#######",
        "#.....#",
        "#.C...#",
        "#.....#",
        "#...C.#",
        "#....E#",
        "#######"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["rep4", "fwd", "right", "fwd", "left", "end"]
    },
    {
      id: 8, name: "スイッチ", en: "SWITCHBOARD",
      hint: "スイッチをふむと 出口の ロックが とける",
      par: 8, slots: 12,
      rows: [
        "######",
        "#....#",
        "#.S..#",
        "#....#",
        "#.C.E#",
        "######"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["fwd", "right", "fwd", "fwd", "fwd", "left", "fwd", "fwd"]
    },
    {
      id: 9, name: "とびいし", en: "STEPPING STONES",
      hint: "あなの ならびは 跳躍で いっきに とびこえよう",
      par: 6, slots: 12,
      rows: [
        "#######",
        "#.....#",
        "#.O.O.#",
        "#.....#",
        "#....C#",
        "#....E#",
        "#######"
      ],
      start: { x: 1, y: 2, dir: 1 },
      patrols: [],
      solution: ["jump", "jump", "right", "fwd", "fwd", "fwd"]
    },
    {
      id: 10, name: "みはり", en: "SENTRY",
      hint: "みはりは 1命令ごとに 1マス うごく。◷ 待つ で すれちがおう",
      par: 14, slots: 20,
      rows: [
        "#######",
        "#...C.#",
        "#.....#",
        "#.....#",
        "#.....#",
        "#...E.#",
        "#######"
      ],
      start: { x: 1, y: 5, dir: 0 },
      patrols: [{ path: [[2, 3], [3, 3], [4, 3], [5, 3]] }],
      solution: ["wait", "fwd", "fwd", "fwd", "fwd", "right", "fwd", "fwd", "fwd", "right", "fwd", "fwd", "fwd", "fwd"]
    },
    {
      id: 11, name: "ふたつの みはり", en: "TWIN SENTRIES",
      hint: "みはりは ふたつ。2本の ラインを リズムよく よこぎろう",
      par: 15, slots: 22,
      rows: [
        "#######",
        "#....E#",
        "#.....#",
        "#.....#",
        "#.....#",
        "#....C#",
        "#######"
      ],
      start: { x: 1, y: 1, dir: 2 },
      patrols: [
        { path: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]] },
        { path: [[5, 2], [4, 2], [3, 2], [2, 2], [1, 2]], at: 0, dir: 1 }
      ],
      solution: ["wait", "fwd", "fwd", "fwd", "fwd", "left", "fwd", "fwd", "fwd", "fwd", "left", "fwd", "fwd", "fwd", "fwd"]
    },
    {
      id: 12, name: "らせん", en: "SERPENTINE",
      hint: "入れ子の 繰り返しで、うずまきの ような 道も すいすい",
      par: 14, slots: 22,
      rows: [
        "######",
        "#...C#",
        "#C...#",
        "#...C#",
        "#E...#",
        "######"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["rep2", "rep3", "fwd", "end", "right", "fwd", "right", "rep3", "fwd", "end", "left", "fwd", "left", "end"]
    },
    {
      id: 13, name: "きけんなこうじ", en: "DANGER SITE",
      hint: "あなの あいだを、跳躍で リズムよく",
      par: 11, slots: 20,
      rows: [
        "#########",
        "#..O.O..#",
        "#.......#",
        "#.O.O...#",
        "#.......#",
        "#E.C....#",
        "#########"
      ],
      start: { x: 1, y: 1, dir: 1 },
      patrols: [],
      solution: ["fwd", "jump", "jump", "right", "rep4", "fwd", "end", "right", "rep5", "fwd", "end"]
    },
    {
      id: 14, name: "みはりのおく", en: "BEYOND THE WATCH",
      hint: "スイッチをふんで、2本のラインを ぬけて出口へ",
      par: 13, slots: 20,
      rows: [
        "#######",
        "#.....#",
        "#.....#",
        "#.....#",
        "#..S..#",
        "#.....#",
        "#.....#",
        "#....E#",
        "#######"
      ],
      start: { x: 1, y: 1, dir: 2 },
      patrols: [
        { path: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]] },
        { path: [[5, 5], [4, 5], [3, 5], [2, 5], [1, 5]], at: 2, dir: -1 }
      ],
      solution: ["wait", "fwd", "fwd", "fwd", "left", "fwd", "fwd", "fwd", "fwd", "right", "fwd", "fwd", "fwd"]
    },
    {
      id: 15, name: "さいごのひかり", en: "LAST LIGHT",
      hint: "壁のすきまは 左端と 右端だけ。スイッチと コアを とって 出口へ",
      par: 18, slots: 32,
      rows: [
        "########",
        "#.....C#",
        "#.####.#",
        "#......#",
        "#...E..#",
        "#......#",
        "#..S...#",
        "########"
      ],
      start: { x: 1, y: 6, dir: 0 },
      patrols: [
        { path: [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]], at: 0, dir: 1 },
        { path: [[6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5]], at: 4, dir: -1 }
      ],
      solution: ["right", "rep5", "fwd", "end", "left", "rep5", "fwd", "end", "left", "left", "fwd", "fwd", "fwd", "right", "fwd", "fwd"]
    }
  ];

  // 記号を走査して コア・スイッチ・出口 を集める。出口(E)が無いレベルは exit: null になり、
  // クリアはできないが実行は安全に終わる（描画側も null を許容する）。
  function parseGrid(rows) {
    const tiles = rows.map(row => row.split(""));
    const cores = [], switches = [];
    let exit = null;
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        const ch = tiles[y][x];
        if (ch === "C") cores.push([x, y]);
        else if (ch === "S") switches.push([x, y]);
        else if (ch === "E") exit = [x, y];
      }
    }
    return { tiles, w: tiles[0].length, h: tiles.length, cores, switches, exit };
  }

  for (const level of LEVELS) {
    level.grid = parseGrid(level.rows);
    level.parsed = true;
  }

  function tokenOf(code) {
    if (typeof code === "object" && code) return code;
    const repr = /^(rep)(\d+)$/.exec(code);
    if (repr) return { t: "rep", n: Math.max(2, Math.min(9, Number(repr[2]))) };
    if (code === "fwd" || code === "left" || code === "right" || code === "wait" || code === "jump") return { t: code };
    if (code === "end") return { t: "end" };
    return null;
  }

  // ブロックの対応と入れ子の深さを調べる。UIは実行前の検証に使う。
  function validate(tokens) {
    let depth = 0, maxDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token || !ACTIONS.has(token.t)) return { ok: false, error: "unknown", index: i };
      if (token.t === "rep") {
        depth++;
        if (depth > MAX_DEPTH) return { ok: false, error: "deep", index: i };
        maxDepth = Math.max(maxDepth, depth);
      } else if (token.t === "end") {
        if (depth === 0) return { ok: false, error: "extraEnd", index: i };
        depth--;
      }
    }
    if (depth > 0) return { ok: false, error: "unclosed", index: tokens.length - 1 };
    if (!tokens.length) return { ok: false, error: "empty", index: 0 };
    return { ok: true, depth: maxDepth };
  }

  // 実行順（rep は中身を n 回ぶん展開する）をあらかじめ作る。命令数は必ず有限。
  function expand(tokens) {
    const check = validate(tokens);
    if (!check.ok) return { ok: false, error: check.error, index: check.index, steps: [] };
    const steps = [];
    const walk = (from, to, loops) => {
      for (let i = from; i < to; i++) {
        const token = tokens[i];
        if (token.t === "rep") {
          const close = matchEnd(tokens, i);
          for (let n = 0; n < token.n; n++) {
            if (!walk(i + 1, close, loops + 1)) return false;
          }
          i = close;
        } else if (token.t !== "end") {
          if (steps.length >= MAX_STEPS) return false;
          steps.push({ index: i, token });
        }
      }
      return true;
    };
    const done = walk(0, tokens.length, 0);
    if (!done || steps.length >= MAX_STEPS) return { ok: false, error: "tooLong", index: 0, steps: [] };
    return { ok: true, steps };
  }

  function matchEnd(tokens, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < tokens.length; i++) {
      if (tokens[i].t === "rep") depth++;
      else if (tokens[i].t === "end") { depth--; if (depth === 0) return i; }
    }
    return tokens.length - 1;
  }

  function createRun(level) {
    const grid = level.grid || parseGrid(level.rows);
    const run = {
      level, w: grid.w, h: grid.h, tiles: grid.tiles,
      unit: { x: level.start.x, y: level.start.y, dir: level.start.dir },
      cores: grid.cores.map(([x, y]) => ({ x, y, got: false })),
      switches: grid.switches.map(([x, y]) => ({ x, y, got: false })),
      exit: grid.exit ? { x: grid.exit[0], y: grid.exit[1] } : null,
      patrols: (level.patrols || []).map(p => ({ path: p.path, index: p.at || 0, dir: p.dir || 1 })),
      ticks: 0, status: "running", reason: null, last: "start"
    };
    return run;
  }

  function tileAt(run, x, y) {
    if (y < 0 || y >= run.h || x < 0 || x >= run.w) return "#";
    return run.tiles[y][x];
  }

  function allObjectivesMet(run) {
    return run.cores.every(c => c.got) && run.switches.every(s => s.got);
  }

  function objectivesDone(run) {
    return run.cores.filter(c => c.got).length + run.switches.filter(s => s.got).length;
  }

  function advancePatrols(run) {
    for (const patrol of run.patrols) {
      patrol.index += patrol.dir;
      if (patrol.index < 0) { patrol.index = 1; patrol.dir = 1; }
      else if (patrol.index >= patrol.path.length) { patrol.index = patrol.path.length - 2; patrol.dir = -1; }
    }
  }

  function patrolCell(patrol) {
    const cell = patrol.path[patrol.index];
    return { x: cell[0], y: cell[1] };
  }

  function checkZap(run, events) {
    for (const patrol of run.patrols) {
      const cell = patrolCell(patrol);
      if (cell.x === run.unit.x && cell.y === run.unit.y) {
        run.status = "zapped"; run.reason = "patrol";
        events.push({ type: "zap", at: { x: cell.x, y: cell.y } });
        return true;
      }
    }
    return false;
  }

  function enterCell(run, x, y, events, how) {
    run.unit.x = x; run.unit.y = y;
    events.push({ type: "move", to: { x, y }, how });
    const core = run.cores.find(c => !c.got && c.x === x && c.y === y);
    if (core) { core.got = true; events.push({ type: "pick", what: "core", at: { x, y } }); }
    const plate = run.switches.find(s => !s.got && s.x === x && s.y === y);
    if (plate) { plate.got = true; events.push({ type: "pick", what: "switch", at: { x, y } }); }
    const tile = tileAt(run, x, y);
    if (tile === "^" || tile === "O") {
      run.status = "crashed"; run.reason = tile === "^" ? "spike" : "pit";
      events.push({ type: "crash", kind: run.reason, at: { x, y } });
      return;
    }
    if (run.exit && run.exit.x === x && run.exit.y === y) {
      if (allObjectivesMet(run)) {
        run.status = "won"; run.reason = "exit";
        events.push({ type: "won", at: { x, y } });
      } else {
        events.push({ type: "locked", at: { x, y }, done: objectivesDone(run), total: run.cores.length + run.switches.length });
      }
    }
  }

  // 命令1つぶんの時間を進める。rep / end は時間を消費しない（expand 済みの行動だけ渡す）。
  function step(run, token) {
    if (!run || run.status !== "running") return [];
    const events = [];
    const dir = DIRS[run.unit.dir];
    if (token.t === "left" || token.t === "right") {
      run.unit.dir = (run.unit.dir + (token.t === "right" ? 1 : 3)) % 4;
      run.last = token.t;
      events.push({ type: "turn" });
    } else if (token.t === "wait") {
      run.last = "wait";
      events.push({ type: "wait" });
    } else if (token.t === "fwd" || token.t === "jump") {
      const aheadX = run.unit.x + dir[0], aheadY = run.unit.y + dir[1];
      const ahead = tileAt(run, aheadX, aheadY);
      if (token.t === "fwd") {
        if (ahead === "#") {
          run.last = "bump";
          events.push({ type: "bump", at: { x: aheadX, y: aheadY } });
        } else {
          run.last = "fwd";
          enterCell(run, aheadX, aheadY, events, "walk");
        }
      } else {
        // 跳躍は「となりの あな・とげ を とびこす」専用。安全な道では とべない。
        const landX = run.unit.x + dir[0] * 2, landY = run.unit.y + dir[1] * 2;
        const landing = tileAt(run, landX, landY);
        const leapable = ahead === "^" || ahead === "O";
        if (!leapable || landing === "#") {
          run.last = "bump";
          events.push({ type: "bump", why: leapable ? "blocked" : "noVault", at: { x: aheadX, y: aheadY } });
        } else {
          run.last = "jump";
          enterCell(run, landX, landY, events, "jump");
        }
      }
    }
    // 時間は「行動」だけが進める。ユニットの行動 → みはりの移動 → 接触判定。
    run.ticks++;
    if (run.status === "running") {
      advancePatrols(run);
      checkZap(run, events);
    }
    return events;
  }

  // テストや模範解答の検証に使う一括実行。
  function runProgram(level, program) {
    const tokens = program.map(tokenOf);
    const check = validate(tokens);
    if (!check.ok) return { status: "invalid", reason: check.error, index: check.index, ticks: 0, run: null, tokens };
    const plan = expand(tokens);
    if (!plan.ok) return { status: "invalid", reason: plan.error, index: plan.index, ticks: 0, run: null, tokens };
    const run = createRun(level);
    for (const item of plan.steps) {
      step(run, item.token);
      if (run.status !== "running") break;
    }
    const status = run.status === "running" ? "exhausted" : run.status;
    return {
      status, reason: run.status === "running" ? "ended" : run.reason,
      ticks: run.ticks, run, tokens, length: tokens.length,
      collected: run.cores.filter(c => c.got).length + run.switches.filter(s => s.got).length,
      total: run.cores.length + run.switches.length
    };
  }

  function starsFor(level, length) {
    if (length <= level.par) return 3;
    if (length <= level.par + 3) return 2;
    return 1;
  }

  return {
    DIRS, DIR_NAMES, LEVELS, MAX_DEPTH,
    parseGrid, tokenOf, validate, expand, matchEnd,
    createRun, step, tileAt, allObjectivesMet, objectivesDone, patrolCell,
    runProgram, starsFor
  };
});
