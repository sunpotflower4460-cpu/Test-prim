/* Regenerate every stage's clearing script and write them into helix-sim.js.
 *
 *   node tools/helix-author.cjs [--seconds=N] [--only=index] [--beam=N] [--quota=N]
 *
 * Geometry is authored in tools/helix-levels.cjs. The scripts are not authored
 * at all: they are found by tools/helix-solve.cjs and stored in
 * tools/helix-scripts.json, which this tool then splices back through the level
 * builder into helix-sim.js. Keep those two apart deliberately — geometry that
 * someone can hand-tune and scripts that something has to prove are not the
 * same kind of artifact, and mixing them makes it impossible to tell which one
 * broke.
 *
 * Each candidate is replayed through runScript before it is stored, which is
 * the same call tests/helix.test.cjs makes. A script the search liked but the
 * replay disagrees with is not stored.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const solver = require("./helix-solve.cjs");
const levels = require("./helix-levels.cjs");

const NL = String.fromCharCode(10);
const SCRIPTS = path.join(__dirname, "helix-scripts.json");

/* Match on the "--name=" prefix, not on the bare string "--name=". An exact
   lookup for "--seconds=" never matches "--seconds=170", so the flag silently
   fell back to its default and every budget I thought I was setting was
   ignored. */
function flag(name, fallback) {
  const prefix = "--" + name + "=";
  const arg = process.argv.find((a) => a.indexOf(prefix) === 0);
  if (arg === undefined) return fallback;
  const value = Number(arg.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

function has(name) {
  return process.argv.some((a) => a === "--" + name || a.indexOf("--" + name + "=") === 0);
}

function load() {
  return JSON.parse(fs.readFileSync(SCRIPTS, "utf8"));
}

function save(store) {
  const ordered = { _comment: store._comment };
  for (const key of Object.keys(store)) {
    if (key === "_comment") continue;
    ordered[key] = store[key];
  }
  fs.writeFileSync(SCRIPTS, JSON.stringify(ordered, null, 2) + NL);
}

function main() {
  const seconds = flag("seconds", 180);
  const only = has("only") ? flag("only", 0) : null;
  const verbose = has("verbose");
  const opts = {
    budgetMs: seconds * 1000,
    beam: flag("beam", 1600),
    quota: flag("quota", 0) || undefined
  };

  const store = load();
  let solved = 0, failed = 0;

  for (let i = 0; i < levels.STAGES.length; i++) {
    const spec = levels.STAGES[i];
    if (only !== null && i !== only) continue;

    process.stdout.write("L" + spec.id + " " + spec.en + " ... ");
    const res = solver.solve(i, Object.assign({ verbose }, opts));
    if (!res.ok) {
      failed++;
      process.stdout.write("NO SOLUTION (" + res.reason + ", closest " +
        Math.round(res.best) + "px at tile " + res.bestTile + ")" + NL);
      continue;
    }

    const proof = solver.verify(i, res.script);
    if (!proof.finished || proof.deaths !== 0) {
      failed++;
      process.stdout.write("REPLAY MISMATCH (finished=" + proof.finished +
        " deaths=" + proof.deaths + ") - not stored" + NL);
      continue;
    }

    store[spec.id] = res.script;
    solved++;
    process.stdout.write("SOLVED  sim=" + proof.time.toFixed(2) + "s" +
      " frames=" + res.steps + " deaths=0" +
      " wall=" + (res.wall / 1000).toFixed(1) + "s" + NL);
  }

  save(store);
  process.stdout.write("stored " + solved + " script(s), " + failed + " failure(s)" + NL);

  // Push geometry + scripts into helix-sim.js so the tests read one file.
  const target = path.join(__dirname, "..", "helix-sim.js");
  const src = fs.readFileSync(target, "utf8");
  const startMark = "  const LEVELS = [";
  const endMark = "  ];  /* ------------------------------------------------------------- geometry -- */";
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0) throw new Error("could not locate the LEVELS block in helix-sim.js");
  fs.writeFileSync(target, src.slice(0, a) + levels.block() + src.slice(b + "  ];".length));
  process.stdout.write("helix-sim.js updated" + NL);

  // Prove the file that was just written actually replays, before claiming it.
  // The require cache still holds the pre-write copy of helix-sim.js, so it has
  // to be dropped explicitly or this check silently verifies the old levels.
  const simPath = require.resolve("../helix-sim.js");
  delete require.cache[simPath];
  const fresh = require(simPath);

  let ok = 0, bad = 0;
  const missing = [];
  for (let i = 0; i < fresh.LEVELS.length; i++) {
    const level = fresh.LEVELS[i];
    if (!level.script) { missing.push(level.en); continue; }
    const state = fresh.createState(i);
    fresh.runScript(state, level.script);
    if (state.finished && state.deaths === 0) ok++;
    else bad++;
  }
  process.stdout.write("replay check: " + ok + " clear, " + bad + " failed" +
    (missing.length ? ", " + missing.length + " without a script (" + missing.join(", ") + ")" : "") +
    NL);
}

module.exports = { load, save };

if (require.main === module) main();