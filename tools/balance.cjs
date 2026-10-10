"use strict";
/* 譜面の成立検証 — 各章が「実際に打通れる」ことを機械で確かめる。
 *
 *   node tools/balance.cjs
 *
 * 自動プレイヤーは打つ瞬間に誤差を与え、人の指を模す。
 * 指の振れが小さいほどクリアできる、という前提で各章を回す。
 * 何も打たない場合は必ず倒れること（= 章に圧があること）も期待する。
 */
const path = require("node:path");
const S = require(path.join(__dirname, "..", "sync-sim.js"));

const DT = 1 / 120;

/** 今、静寂の区間中ならその区間の終わりを返す。区間外なら 0。 */
function silenceEndAt(state, now) {
  const scale = state.mods.silenceScale;
  for (const s of state.chart.silences) {
    if (now >= s.time && now < s.time + s.lenTime * scale) return s.time + s.lenTime * scale;
  }
  return 0;
}

/**
 * @param {number} chapterIndex
 * @param {object} opt
 *   opt.jitterMs  打つ瞬間の誤差（0 なら完璧）。null なら全く打たない。
 *   opt.upgrades  持つ強化の ID 配列
 *   opt.seed      乱数シード
 */
function autoplay(chapterIndex, opt) {
  const opts = opt || {};
  const state = S.createState({
    chapterIndex,
    upgrades: opts.upgrades || [],
    seed: opts.seed || 0x5eed1
  });
  const random = S.createState({ seed: (opts.seed || 7) ^ 0x9e37 }).random;
  S.start(state, 0);
  const holding = {};
  const idle = opts.jitterMs === null;
  const limit = state.chart.duration + 140;

  for (let t = 0; t < limit; t += DT) {
    const now = t;
    S.update(state, now);
    if (state.over || state.cleared) break;
    const quietUntil = idle ? 0 : silenceEndAt(state, now);

    if (!idle) {
      for (const note of state.chart.notes) {
        if (note.judged || note.holdBroken || note.holdDone) continue;
        // 静寂中は打たない。ボスが出す静寂は譜面に載っていないので、
        // update() が立てた state.silence をそのまま信頼する。
        if (state.silence) continue;
        if (quietUntil && note.time < quietUntil) continue;
        const delta = note.time - now;
        if (note.kind === "hold") {
          // 長音符は頭の少し前から押しっぱなしにする
          if (delta <= 0.02 && holding[note.lane] !== note.id) {
            S.press(state, note.lane, now);
            holding[note.lane] = note.id;
          }
        } else if (delta <= 0 && delta > -0.1) {
          const jitter = opts.jitterMs ? (random() - 0.5) * 2 * opts.jitterMs / 1000 : 0;
          S.press(state, note.lane, now + jitter);
        }
      }
    }

    for (const lane of Object.keys(holding)) {
      const id = holding[lane];
      const note = state.chart.notes.find(n => n.id === id);
      if (!note) { holding[lane] = null; continue; }
      if (now >= note.time + note.lenTime) {
        S.release(state, Number(lane), now + 0.02);
        holding[lane] = null;
      }
    }
  }
  return {
    cleared: state.cleared,
    over: state.over,
    hp: Math.round(state.integrity),
    grade: S.gradeOf(state),
    acc: +(S.accuracyOf(state) * 100).toFixed(1),
    maxCombo: state.stats.maxCombo,
    score: state.stats.score,
    stats: state.stats
  };
}

const RUNS = [
  { label: "perfect", jitterMs: 0, upgrades: [] },
  { label: "steady ", jitterMs: 28, upgrades: ["wide", "amplify"] },
  { label: "rough  ", jitterMs: 55, upgrades: ["wide", "echo", "plating", "mending", "pulse", "quiet"] },
  { label: "idle   ", jitterMs: null, upgrades: [] }
];

let failures = 0;
for (let i = 0; i < S.CHAPTERS.length; i++) {
  const chapter = S.CHAPTERS[i];
  console.log(`CH${i + 1} ${chapter.jp} (${chapter.bpm}bpm)`);
  for (const run of RUNS) {
    const r = autoplay(i, run);
    const tail = r.cleared ? "" : (r.over ? "  ← 倒れた" : "  ← 未クリア");
    console.log(
      `   ${run.label}  hp=${String(r.hp).padStart(3)}  ${r.grade.padEnd(3)}` +
      `  acc=${String(r.acc).padStart(5)}%  maxCombo=${String(r.maxCombo).padStart(3)}${tail}`
    );
    const mustClear = run.label !== "idle   ";
    if (mustClear && !r.cleared) {
      failures++;
      console.log(`   !! chapter ${i + 1} cannot be cleared by a "${run.label.trim()}" player`);
    }
    if (!mustClear && !r.over) {
      failures++;
      console.log(`   !! chapter ${i + 1} survives with no input at all — no pressure`);
    }
  }
}

console.log("\n--- 譜面の自己点検 ---");
for (let i = 0; i < S.CHAPTERS.length; i++) {
  const chart = S.buildChart(i);
  let clashes = 0;
  let tooClose = 0;
  let duplicates = 0;
  for (const s of chart.silences) {
    const end = s.time + s.lenTime;
    for (const n of chart.notes) {
      if (n.time < end && n.time + (n.lenTime || 0) > s.time) clashes++;
    }
  }
  for (let a = 1; a < chart.notes.length; a++) {
    const gap = chart.notes[a].time - chart.notes[a - 1].time;
    if (gap < chart.spb * 0.3) tooClose++;
    // 同じ時刻・同じレーンが2つあると片方は必ず逃げになる
    if (gap <= 0.0001 && chart.notes[a].lane === chart.notes[a - 1].lane) duplicates++;
  }
  console.log(`  CH${i + 1} 音符${String(chart.notes.length).padStart(3)}` +
    `  静寂${String(chart.silences.length).padStart(2)}` +
    `  静寂と音符の重なり=${clashes}` +
    `  0.3拍未満の連続=${tooClose}` +
    `  同時刻同レーンの重複=${duplicates}`);
  if (clashes) failures++;
  if (duplicates) failures++;
}

console.log(failures ? `\nFAIL ${failures}` : "\nOK — すべての章が成立している");
process.exit(failures ? 1 : 0);
