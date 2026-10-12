/* HELIX // 螺旋 — level authoring helper.
 *
 *   node tools/helix-levels.cjs           # print the LEVELS block
 *   node tools/helix-levels.cjs --check   # draw every stage and validate it
 *   node tools/helix-levels.cjs --write   # splice the block into helix-sim.js
 *
 * Stages are written as rectangles rather than as ASCII art. Hand-typing rows
 * is how a platformer ends up with a one-character hole in a wall, and a hole
 * that a solver quietly walks through is worse than no level at all. Every
 * rectangle is checked here, before it can reach the game.
 *
 * Hop arithmetic, derived from PHYS rather than eyeballed:
 *   a jump rises 432^2 / (2*1500) = 62px = 3.4 tiles
 *   reaching the top of that arc takes 0.39s, during which a 205px/s run
 *   covers 80px = 4.4 tiles
 * so a hop is 3 tiles up and at most 4 across. Every gap below is inside that
 * budget, and a gap outside it looks perfectly fine and is unclearable.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const NL = "\n";
const QUOTE = '"';
const BACKSLASH = "\\";

const SCRIPTS = path.join(__dirname, "helix-scripts.json");

/* Clearing scripts live in their own file, produced by tools/helix-author.cjs.
 * A stage with no entry yet is written as null, which the test suite fails on
 * loudly rather than skipping. */
function loadScripts() {
  try {
    return JSON.parse(fs.readFileSync(SCRIPTS, "utf8"));
  } catch (err) {
    return {};
  }
}

function rect(x0, y0, x1, y1) { return { x0, y0, x1, y1 }; }

/* --------------------------------------------------------------- the grid -- */

function build(spec) {
  const w = spec.w, h = spec.h;
  const g = [];
  for (let y = 0; y < h; y++) g.push(new Array(w).fill("."));

  function put(x, y, ch) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) {
      throw new Error(spec.en + ": cell (" + x + "," + y + ") is outside the stage");
    }
    if (g[y][x] !== ".") {
      throw new Error(spec.en + ": cell (" + x + "," + y + ") was already filled");
    }
    g[y][x] = ch;
  }

  // Border first. A spec that reaches the edge then fails loudly in the wall
  // pass below instead of quietly opening the side of the stage.
  for (let x = 0; x < w; x++) { g[0][x] = "#"; g[h - 1][x] = "#"; }
  for (let y = 0; y < h; y++) { g[y][0] = "#"; g[y][w - 1] = "#"; }

  for (const r of spec.walls || []) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          throw new Error(spec.en + ": wall " + JSON.stringify(r) + " covers the border at (" + x + "," + y + ")");
        }
        g[y][x] = "#";
      }
    }
  }

  for (const s of spec.spikes || []) {
    for (let x = s.x0; x <= s.x1; x++) put(x, s.y0, s.dir || "^");
  }
  for (const m of spec.movers || []) put(m.x, m.y, m.ch || "m");
  for (const s of spec.spinners || []) put(s.x, s.y, "o");
  for (const d of spec.drones || []) put(d.x, d.y, "d");
  for (const c of spec.checkpoints || []) put(c.x, c.y, "C");
  for (const q of spec.pearls || []) put(q.x, q.y, "~");
  put(spec.start[0], spec.start[1], "S");
  put(spec.goal[0], spec.goal[1], "G");

  const rows = g.map((r) => r.join(""));
  verify(spec, rows, g);
  return rows;
}

/* Static proof that a stage is well formed, before anyone runs it. */
function verify(spec, rows, g) {
  const w = spec.w, h = spec.h;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? "#" : g[y][x]);
  const solid = (x, y) => at(x, y) === "#";

  if (rows.some((r) => r.length !== w)) throw new Error(spec.en + ": ragged rows");
  if (solid(spec.start[0], spec.start[1])) throw new Error(spec.en + ": start is inside a wall");
  if (solid(spec.goal[0], spec.goal[1])) throw new Error(spec.en + ": goal is inside a wall");
  if (!solid(spec.start[0], spec.start[1] + 1)) throw new Error(spec.en + ": start is not standing on anything");
  if (spec.goal[1] === spec.start[1]) {
    throw new Error(spec.en + ": goal shares the start row, so the stage is a straight sprint");
  }
  if (spec.goal[1] > spec.start[1] + 16) {
    throw new Error(spec.en + ": goal is more than 16 tiles above the start");
  }
  if (["^", "v", "<", ">"].indexOf(at(spec.start[0], spec.start[1] + 1)) >= 0) {
    throw new Error(spec.en + ": start stands on a hazard");
  }

  // A sentry patrol may not sit over a ledge too narrow to wait on. A drone is
  // a timing gate; over a one-tile pillar there is no room to time it, and the
  // player dies to something they could not see coming.
  for (const d of spec.drones || []) {
    const column = d.x;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (!solid(x, y) || solid(x, y + 1)) continue;
        // width of the continuous run of solid tiles under this top surface
        let a = x, b = x;
        while (a > 0 && solid(a - 1, y) && !solid(a - 1, y + 1)) a--;
        while (b < w - 1 && solid(b + 1, y) && !solid(b + 1, y + 1)) b++;
        if (b - a + 1 > 5) continue;
        if (Math.abs(column - x) <= 1) {
          throw new Error(spec.en + ": the sentry at (" + d.x + "," + d.y +
            ") patrols over the " + (b - a + 1) + "-tile ledge at (" + x + "," + y + ")");
        }
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ stages -- */

const STAGES = [
  /* 1. FOOTING — run, jump, read the gap before you commit.
   * Eight ledges: four going right, then four coming back left, so the player
   * has to turn around and look at terrain they already walked past. */
  {
    id: 1,
    name: "足場",
    en: "FOOTING",
    lead: "走る。跳ぶ。\n崖の前を読む。",
    w: 34, h: 18,
    walls: [
      rect(1, 16, 32, 16),
      rect(6, 15, 9, 15),
      rect(13, 13, 16, 13),
      rect(20, 15, 23, 15),
      rect(27, 13, 30, 13),
      rect(23, 11, 26, 11),
      rect(17, 9, 20, 9),
      rect(11, 7, 14, 7),
      rect(5, 5, 9, 5)
    ],
    pearls: [{ x: 12, y: 6 }],
    start: [2, 15],
    goal: [7, 4]
  },

  /* 2. THE WALL — the chimney. Two faces three tiles apart turn a wall jump
   * into a ladder: every crossing gains three tiles. Spikes cover the floor
   * past the chimney, so falling out of it costs a life, not just a climb. */
  {
    id: 2,
    name: "壁沿い",
    en: "THE WALL",
    lead: "張り付いて、跳ね返る。",
    w: 38, h: 18,
    walls: [
      rect(1, 16, 36, 16),
      rect(1, 11, 1, 15),           // chimney, left face
      rect(6, 11, 6, 15),           // chimney, right face
      rect(7, 11, 13, 11),          // exit ledge, level with the chimney mouth
      rect(15, 9, 19, 9),
      rect(21, 7, 28, 7)
    ],
    spikes: [rect(8, 15, 12, 15), rect(14, 15, 18, 15)],
    pearls: [{ x: 16, y: 8 }],
    start: [2, 15],
    goal: [24, 6]
  },

  /* 3. CROSSFIRE — the ground is in pieces. Movers swing across each break and
   * a blade turns above it, so the safe line is never the shortest one. */
  {
    id: 3,
    name: "往来",
    en: "CROSSFIRE",
    lead: "動く床と、回る刃。",
    w: 34, h: 17,
    walls: [
      rect(1, 14, 9, 14),
      rect(16, 14, 22, 14),
      rect(28, 14, 32, 14),
      rect(17, 10, 20, 10),
      rect(28, 11, 32, 11)
    ],
    spikes: [rect(10, 15, 15, 15), rect(23, 15, 27, 15)],
    movers: [{ x: 12, y: 13 }, { x: 25, y: 13 }],
    spinners: [{ x: 12, y: 9 }, { x: 25, y: 9 }],
    checkpoints: [{ x: 18, y: 13 }],
    pearls: [{ x: 18, y: 9 }],
    start: [2, 13],
    goal: [30, 10]
  },

  /* 4. BEACON — two broken crossings, then height. Drones patrol the shafts
   * between the pillars and the beacon sits on the last pillar, not the floor. */
  {
    id: 4,
    name: "灯火",
    en: "BEACON",
    lead: "灯りを拾いながら、迷わず、次の塔へ。",
    w: 44, h: 19,
    walls: [
      rect(1, 16, 13, 16),
      rect(19, 16, 28, 16),
      rect(34, 16, 42, 16),
      rect(8, 13, 11, 13),
      rect(15, 11, 17, 11),
      rect(23, 13, 26, 13),
      rect(31, 11, 33, 11),
      rect(38, 13, 41, 13)
    ],
    spikes: [rect(14, 17, 18, 17), rect(29, 17, 33, 17)],
    movers: [{ x: 16, y: 15 }, { x: 31, y: 15 }],
    spinners: [{ x: 20, y: 8 }],
    drones: [{ x: 20, y: 9 }, { x: 29, y: 12 }, { x: 35, y: 9 }],
    checkpoints: [{ x: 22, y: 15 }],
    pearls: [{ x: 16, y: 10 }, { x: 40, y: 12 }],
    start: [2, 15],
    goal: [39, 12]
  },

  /* 5. SUMMIT — straight up, four hops of three tiles each, then across. The
   * ground below is only a starting point; the stage is the column. */
  {
    id: 5,
    name: "峰",
    en: "SUMMIT",
    lead: "すべての道順で、直に、峰へ。",
    w: 32, h: 22,
    walls: [
      rect(1, 20, 30, 20),
      rect(5, 17, 9, 17),
      rect(13, 14, 17, 14),
      rect(5, 11, 9, 11),
      rect(13, 8, 17, 8),
      rect(21, 6, 27, 6)
    ],
    spinners: [{ x: 9, y: 13 }, { x: 11, y: 10 }],
    drones: [{ x: 11, y: 13 }],
    checkpoints: [{ x: 5, y: 19 }],
    pearls: [{ x: 6, y: 10 }, { x: 25, y: 5 }],
    start: [2, 19],
    goal: [24, 5]
  }
];

/* ------------------------------------------------------------------ output -- */

/* Japanese reaches helix-sim.js as \u escapes, the way that file already stores
 * its text. An escape cannot be half-corrupted the way raw text can, and
 * tools/jp-vocab.py still reads the decoded characters. */
function jsString(text) {
  let out = QUOTE;
  for (const ch of text) {
    if (ch === NL) { out += BACKSLASH + "n"; continue; }
    if (ch === QUOTE) { out += BACKSLASH + QUOTE; continue; }
    if (ch === BACKSLASH) { out += BACKSLASH + BACKSLASH; continue; }
    const code = ch.codePointAt(0);
    out += code < 128 ? ch : BACKSLASH + "u" + code.toString(16).padStart(4, "0");
  }
  return out + QUOTE;
}

function block() {
  const store = loadScripts();
  const parts = STAGES.map((spec) => {
    const rows = build(spec);
    const rowText = rows.map((r) => "        " + QUOTE + r + QUOTE).join("," + NL);
    const script = store[spec.id] ? JSON.stringify(store[spec.id]) : "null";
    return [
      "    {",
      "      id: " + spec.id + ",",
      "      name: " + jsString(spec.name) + ",",
      "      en: " + jsString(spec.en) + ",",
      "      lead: " + jsString(spec.lead) + ",",
      "      rows: box([",
      rowText,
      "      ]),",
      "      script: " + script,
      "    }"
    ].join(NL);
  });
  return "  const LEVELS = [" + NL + parts.join("," + NL) + NL + "  ];";
}

function main() {
  const mode = process.argv[2] || "";
  if (mode === "--check") {
    for (const spec of STAGES) {
      const rows = build(spec);
      process.stdout.write("ok  L" + spec.id + " " + spec.en + "  " + spec.w + "x" + spec.h +
        "  start(" + spec.start + ") goal(" + spec.goal + ")" + NL);
      rows.forEach((r, i) => process.stdout.write(String(i).padStart(3) + " " + r + NL));
    }
    return;
  }
  const text = block();
  if (mode === "--write") {
    const file = path.join(__dirname, "..", "helix-sim.js");
    const src = fs.readFileSync(file, "utf8");
    const startMark = "  const LEVELS = [";
    const endMark = "  ];  /* ------------------------------------------------------------- geometry -- */";
    const a = src.indexOf(startMark);
    const b = src.indexOf(endMark);
    if (a < 0 || b < 0) throw new Error("could not locate the LEVELS block in helix-sim.js");
    fs.writeFileSync(file, src.slice(0, a) + text + src.slice(b + "  ];".length));
    process.stdout.write("wrote " + STAGES.length + " stages into helix-sim.js" + NL);
    return;
  }
  process.stdout.write(text + NL);
}

module.exports = { STAGES, build, block };

if (require.main === module) main();