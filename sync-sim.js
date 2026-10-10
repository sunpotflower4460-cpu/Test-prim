"use strict";
/* Minimax M3.1 — SYNC// 共鳴（きょうめい）
 *
 * リズム × 防衛。中心のコア（核）を、6本のレーンから迫るノイズから守る。
 * ノイズは拍に合わせて迫ってくる。だから拍の、その一瞬を叩けば砕け散る。
 *
 * このファイルは譜面の生成・判定・戦闘・強化という「純ロジック」だけを持つ。
 * 描画と音は sync.js、スタイルは sync.css が担当する。
 * ブラウザでは window.SyncSim、Node では module.exports として読み込める。
 */

/* ---------------------------------------------------------------- 定数 -- */

const LANES = 6;
// 判定幅は拍ではなく「秒」。テンポが速くなっても人の感覚は変わらないため固定値。
const WINDOWS = { perfect: 0.048, great: 0.092, good: 0.136 };
const GRADE_SCORE = { perfect: 1000, great: 620, good: 340 };
const GRADE_WEIGHT = { perfect: 1, great: 0.66, good: 0.32 };
const LANE_KEYS = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK"];
const LANE_KEY_LABEL = ["A", "S", "D", "F", "J", "K"];
const APPROACH_BEATS = 3;   // 音符が戦線に出てから判定点まで何拍か
const LEAD_BEATS = 4;       // 譜面の前に置くカウントイン
const TAIL_BEATS = 3;       // 最後の音符のあとに核を守る時間
const BASE_INTEGRITY = 100;
const MISS_DAMAGE = 5;
const SILENCE_DAMAGE = 9;
const WHIFF_COMBO_LOSS = 0.25;
const BREAK_DAMAGE = 2;
const HOLD_GRACE = 0.12;   // 指を離しても猶予される長さ
const BOSS_SILENCE = { boss: true, time: 0 };

/* -------------------------------------------------- 共鳴（選ぶ強化） -- */
// 章の合間に3つから選ぶ。取るほど譜面ではなく「音と戦いの設計」が変わる。
const RESONANCES = [
  { id: "wide", jp: "広幅", en: "WIDE", icon: "◈",
    desc: "すべての判定幅を18ms 広くする。呼吸のぶれを許す。" },
  { id: "insight", jp: "洞察", en: "INSIGHT", icon: "◉",
    desc: "5拍先まで、次の音が読めて見える。" },
  { id: "amplify", jp: "増幅", en: "AMPLIFY", icon: "✦",
    desc: "PERFECTのたび核が1回復し、得点が1.15倍になる。" },
  { id: "rhythm", jp: "韻律", en: "RHYTHM", icon: "≋",
    desc: "コンボが12までは落ちない。倍率の上限が2.5になる。" },
  { id: "plating", jp: "鎧", en: "PLATING", icon: "▣",
    desc: "核の最大値が25上がり、いまその25を修復する。" },
  { id: "mending", jp: "修復", en: "MENDING", icon: "❖",
    desc: "いま30修復。以後は25コンボごとに2回復する。" },
  { id: "shortwave", jp: "短波", en: "SHORTWAVE", icon: "⌁",
    desc: "長音符の長さが30%短くなる。指が疲れない。" },
  { id: "echo", jp: "残響", en: "ECHO", icon: "◎",
    desc: "逃してもダメージが40%減り、空振りも無害になる。" },
  { id: "pulse", jp: "拍動", en: "PULSE", icon: "❋",
    desc: "25コンボごとに衝撃波。近くの音を消し、3修復する。" },
  { id: "quiet", jp: "静寂", en: "QUIET", icon: "◐",
    desc: "静寂の区間が45%短く、破ったときの痛みも40%減る。" },
  { id: "split", jp: "倍波", en: "SPLIT", icon: "⋯",
    desc: "GOODもPERFECTとして数える。得点は0.8倍になる。" },
  { id: "tempo", jp: "拍読み", en: "METRONOME", icon: "◷",
    desc: "PERFECTが10連鎖するたび、核を5修復する。" }
];

/* ------------------------------------------------------------------ 章 -- */
// bars は 8拍 = 2小節 を1行で表す。
//   "拍:レーン" に続けて、長音符なら h<拍数>、アクセントなら ! を付ける。
const CHAPTERS = [
  {
    id: 1, jp: "第零拍", en: "PRELUDE", bpm: 84, boss: false,
    lead: "拍ちょうどでレーンを叩けば、ノイズは砕ける。",
    tip: "タップ / A S D F J K",
    root: 57, scale: [0, 3, 5, 7, 10], chords: [0, -4, 3, -2],
    mood: { bg: "#04070f", deep: "#0a1526", glow: "#6ef0d0", warm: "#ffd98a", ink: "#e9fbff" },
    bars: [
      "0:2 2:5 4:2 6:5",
      "0:2 2:5 4:2 6:0",
      "0:2 2:5 4:2 6:5",
      "0:1 2:4 4:1 6:4",
      "0:0 1:3 2:5 4:3 6:0",
      "0:2 2:5 4:2 6:5",
      "0:2 2:5 4:2 6:0",
      "0:1 2:4 4:1 6:4",
      "0:0 2:3 4:5 6:2",
      "0:0 1:3 2:5 3:4 4:3 5:1 6:5 7:2"
    ]
  },
  {
    id: 2, jp: "加速", en: "ACCELERANDO", bpm: 104, boss: false,
    lead: "長音符は押しっぱなし。離せば拍が切れる。",
    tip: "長音符は押しっぱなし",
    root: 62, scale: [0, 2, 3, 5, 7, 9, 10], chords: [0, 5, -2, -4],
    mood: { bg: "#06060f", deep: "#111026", glow: "#b39cff", warm: "#8fd8ff", ink: "#f1ecff" },
    bars: [
      "0:1 2:4 4:1 6:4",
      "0:1 2:4 4:1 5:0h2",
      "0:2 2:5 4:2 6:5",
      "0:0 2:3 4:0 6:3h2",
      "0:1 2:4 4:1 6:4",
      "0:2 2:5 4:2 6:5",
      "0:1 1.5:4 2:2 3.5:5 4:1 5.5:0 7:2",
      "0:1 2:4 4:1 5:5h2",
      "0:0 2:3 4:0 6:3",
      "0:2 2:5 4:2 5:4h2",
      "0:1 2:4 3.5:1 5:2 6:5",
      "0:0 1:3 2:5 3:4 4:2 5:0 6:3 7:5"
    ]
  },
  {
    id: 3, jp: "分裂", en: "FRACTURE", bpm: 122, boss: false,
    lead: "半拍の連打。指を並べるな、心で数えろ。",
    tip: "半拍の連打に注意",
    root: 65, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 3, -2, 5],
    mood: { bg: "#0a0510", deep: "#1c0c26", glow: "#ff8fd0", warm: "#ffd0f0", ink: "#fff0fa" },
    bars: [
      "0:0 1:3 2:0 3:3",
      "0:1 1.5:4 2:2 3.5:5 4:1 5.5:4",
      "0:2 2:5 4:2 6:5",
      "0:0 0.5:3 1:0 1.5:3 2:0 3:3 4:0 5:3",
      "0:1 2:4 4:1 6:4",
      "0:2 2:5 3:1h2 5:2 7:4",
      "0:0 1.5:2 2:5 3:2 3.5:5 4:2 5:5",
      "0:2 2:5 4:2 6:5h2",
      "0:1 1.5:4 2:2 3.5:5 4:1 5.5:4 6:2 7:5",
      "0:0 1:3 2:0 3:3 4:0 5:3 6:0 7:3",
      "0:2 2:5 3.5:2 5:5 6:1h2",
      "0:0 1:2 2:5 3:2 4:0 5:3 6:5 7:2"
    ]
  },
  {
    id: 4, jp: "静寂", en: "SILENCE", bpm: 130, boss: false,
    lead: "赤い輪が縮む間は、叩いてはならない。息を止める。",
    tip: "赤い区間では無効",
    root: 60, scale: [0, 1, 3, 5, 7, 8, 10], chords: [0, -4, 3, -2],
    mood: { bg: "#0b0407", deep: "#230812", glow: "#ff7f9e", warm: "#ffc59a", ink: "#fff0f2" },
    bars: [
      "0:0 1:3 2:0 3:3 4:5 5:2",
      "0:1 2:4 z6:2",
      "0:0 1:3 2:5 4:3 6:0",
      "0:2 2:5 4:2 z6:2",
      "0:0 1:3 2:0 3:3 4:5 5:2 6:0 7:3",
      "0:1 2:4 4:1 z6:2",
      "0:2 2:5 3:1h2 5:2 7:4",
      "0:0 1:3 2:0 z4:3",
      "0:1 2:4 4:1 5:3h2",
      "0:0 1:3 2:0 3:3 z5:3",
      "0:1 2:4 4:1 6:4 7:2",
      "0:0 1:3 2:0 3:3 z5:2 7:2"
    ]
  },
  {
    id: 5, jp: "終拍", en: "FINALE", bpm: 140, boss: true,
    lead: "最後の拍は、だれかが刻んでいる。",
    tip: "赤＝沈黙 / 白弾＝大ダメージ",
    root: 55, scale: [0, 2, 3, 5, 7, 8, 11], chords: [0, 3, -2, -4],
    mood: { bg: "#0d0405", deep: "#2a0d10", glow: "#ff9a6e", warm: "#ffe08a", ink: "#fff2ec" },
    bars: [
      "0:0 1:3 2:0 3:3",
      "0:1 1.5:4 2:2 3.5:5 4:1 5.5:4",
      "0:2 2:5 3.5:2 5:5 z6:2",
      "0:0 1:3 2:0 3:3 4:5 5:2 6:0 7:3",
      "0:1 2:4 4:1 5:3h2",
      "0:2 2:5 3.5:2 4:5 5:2 z6:2",
      "0:0 1:3 2:0 3:3 z5:2 7:3",
      "0:1 2:4 3.5:1 5:2 6:5 7:2"
    ]
  }
];

const BOSS = {
  jp: "終拍の主", en: "THE LAST BEAT", hp: 190,
  cycle: 8,          // 1サイクルは8拍
  silentAt: 4,       // 4拍目から2拍は静寂
  silentLen: 2,
  maxCycles: 48      // 暴走防止（ボスを倒しきれなかった場合の保険）
};

/* --------------------------------------------------------------- 道具 -- */

function makeRandom(seed) {
  let a = (seed >>> 0) || 1;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTE_RE = /^(\d+(?:\.\d+)?):([0-5])(?:h(\d+(?:\.\d+)?))?(!)?$/;
const REST_RE = /^z(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

// 1行 = 8拍。音符トークンと静寂トークンを分けて返す。
function parseBar(text) {
  const notes = [];
  const silences = [];
  const trimmed = String(text).trim();
  if (!trimmed) return { notes, silences };
  trimmed.split(/\s+/).forEach(token => {
    const rest = REST_RE.exec(token);
    if (rest) {
      silences.push({ beat: parseFloat(rest[1]), len: parseFloat(rest[2]) });
      return;
    }
    const m = NOTE_RE.exec(token);
    // 書式を間違えたトークンは黙って捨てない。
    // 黙って捨てると、譜面から音が消えていることに誰も気づけないまま成品になる。
    if (!m) throw new Error("譜面の書式が間違っています: \"" + token + "\"（拍:レーン[ h長さ][ !]）");
    notes.push({
      beat: parseFloat(m[1]),
      lane: parseInt(m[2], 10),
      hold: m[3] ? parseFloat(m[3]) : 0,
      accent: !!m[4]
    });
  });
  return { notes, silences };
}

/* ------------------------------------------------------------- 譜面生成 -- */

function buildChart(index) {
  const chapter = CHAPTERS[index];
  if (!chapter) return null;
  const spb = 60 / chapter.bpm;
  const notes = [];
  const silenceDraft = [];
  let id = 0;

  chapter.bars.forEach((bar, barIndex) => {
    const parsed = parseBar(bar);
    parsed.notes.forEach(entry => {
      const beat = barIndex * 8 + entry.beat + LEAD_BEATS;
      const lenBeats = entry.hold > 0 ? entry.hold : 0;
      notes.push({
        id: id++,
        beat,
        time: beat * spb,
        lane: entry.lane,
        kind: lenBeats > 0 ? "hold" : (entry.accent ? "accent" : "tap"),
        lenBeats,
        lenTime: lenBeats * spb
      });
    });
    parsed.silences.forEach(entry => {
      silenceDraft.push({ beat: barIndex * 8 + entry.beat + LEAD_BEATS, lenBeats: entry.len });
    });
  });

  const silences = silenceDraft.map((entry, i) => ({
    id: "s" + i,
    beat: entry.beat,
    time: entry.beat * spb,
    lenBeats: entry.lenBeats,
    lenTime: entry.lenBeats * spb
  }));

  let endBeat = LEAD_BEATS;
  for (const note of notes) endBeat = Math.max(endBeat, note.beat + note.lenBeats);
  for (const s of silences) endBeat = Math.max(endBeat, s.beat + s.lenBeats);
  const bossStart = chapter.boss ? endBeat : null;
  endBeat += TAIL_BEATS;

  const chart = {
    index,
    chapter,
    bpm: chapter.bpm,
    spb,
    notes,
    silences,
    bossStart,
    bossStartTime: bossStart === null ? null : bossStart * spb,
    endBeat,
    duration: endBeat * spb
  };
  chart.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return chart;
}

/* ---------------------------------------------------------------- 状態 -- */

function defaultMods() {
  return {
    windowBonus: 0,
    preview: 0,
    perfectHeal: 0,
    scoreMul: 1,
    comboFloor: 0,
    comboCap: 120,
    maxIntegrityBonus: 0,
    healNow: 0,
    comboHealAt: 0,
    comboHeal: 0,
    holdScale: 1,
    missScale: 1,
    pulseAt: 0,
    pulseHeal: 0,
    silenceScale: 1,
    silenceDamageScale: 1,
    goodCountsAsPerfect: false,
    perfectChain: 0,
    whiffFree: false
  };
}

function modsFor(ids) {
  const mods = defaultMods();
  for (const id of ids || []) {
    switch (id) {
      case "wide": mods.windowBonus += 0.018; break;
      case "insight": mods.preview = Math.max(mods.preview, 5); break;
      case "amplify": mods.perfectHeal += 1; mods.scoreMul *= 1.15; break;
      case "rhythm": mods.comboFloor = 12; mods.comboCap = 180; break;
      case "plating": mods.maxIntegrityBonus += 25; mods.healNow += 25; break;
      case "mending": mods.healNow += 30; mods.comboHealAt = 25; mods.comboHeal += 2; break;
      case "shortwave": mods.holdScale *= 0.7; break;
      case "echo": mods.missScale *= 0.6; mods.whiffFree = true; break;
      case "pulse": mods.pulseAt = 25; mods.pulseHeal += 3; break;
      case "quiet": mods.silenceScale *= 0.55; mods.silenceDamageScale *= 0.6; break;
      case "split": mods.goodCountsAsPerfect = true; mods.scoreMul *= 0.8; break;
      case "tempo": mods.perfectChain += 1; break;
      default: break;
    }
  }
  return mods;
}

function windowsFor(mods) {
  return {
    perfect: WINDOWS.perfect + mods.windowBonus,
    great: WINDOWS.great + mods.windowBonus,
    good: WINDOWS.good + mods.windowBonus
  };
}

function createState(options) {
  const opts = options || {};
  const chapterIndex = Number.isInteger(opts.chapterIndex) ? opts.chapterIndex : 0;
  const chart = buildChart(chapterIndex);
  const upgrades = (opts.upgrades || []).slice();
  const mods = modsFor(upgrades);
  const maxIntegrity = BASE_INTEGRITY + mods.maxIntegrityBonus;
  const state = {
    chart,
    chapterIndex,
    upgrades,
    mods,
    windows: windowsFor(mods),
    random: makeRandom(opts.seed === undefined ? 0x5eed1 : opts.seed),
    running: false,
    over: false,
    cleared: false,
    time: 0,
    missCursor: 0,
    integrity: Math.min(maxIntegrity, BASE_INTEGRITY + mods.healNow),
    maxIntegrity,
    combo: 0,
    comboSincePulse: 0,
    perfectChain: 0,
    held: {},
    activeHold: {},
    silence: null,
    boss: null,
    events: [],
    stats: {
      score: 0, combo: 0, maxCombo: 0,
      perfect: 0, great: 0, good: 0, miss: 0, whiff: 0, breaks: 0, holds: 0,
      total: chart.notes.length, judged: 0, weight: 0
    }
  };
  if (chart.bossStart !== null) {
    state.boss = { hp: BOSS.hp, maxHp: BOSS.hp, active: false, dead: false, cycles: -1, hitFlash: 0 };
  }
  return state;
}

/* ------------------------------------------------------------ 補助関数 -- */

function emit(state, event) { state.events.push(event); }

function multiplier(state) {
  return 1 + Math.min(state.combo, state.mods.comboCap) / state.mods.comboCap;
}

// 正確率は「判定済みの音」に対する割合。
// 譜面全体の音符数で割ると、途中までしか打っていない時に 50% 台に見えてしまう。
function accuracyOf(state) {
  const judged = state.stats.judged;
  return judged ? state.stats.weight / judged : 0;
}

function gradeOf(state) {
  const acc = accuracyOf(state);
  const clean = state.stats.miss === 0 && state.stats.breaks === 0;
  if (clean && state.stats.judged > 0 && acc >= 0.97) return "SSS";
  if (acc >= 0.95) return "SS";
  if (acc >= 0.88) return "S";
  if (acc >= 0.78) return "A";
  if (acc >= 0.65) return "B";
  return "C";
}

function damage(state, amount, source) {
  if (state.over) return 0;
  const dealt = Math.min(state.integrity, Math.max(0, amount));
  state.integrity -= dealt;
  emit(state, { type: "damage", amount: dealt, source, integrity: state.integrity });
  if (state.integrity <= 0) {
    state.integrity = 0;
    state.over = true;
    state.running = false;
    emit(state, { type: "dead" });
  }
  return dealt;
}

function heal(state, amount) {
  if (state.over) return 0;
  const before = state.integrity;
  state.integrity = Math.min(state.maxIntegrity, state.integrity + amount);
  return state.integrity - before;
}

function breakCombo(state, ratio) {
  state.combo = Math.max(state.mods.comboFloor, Math.floor(state.combo * (1 - ratio)));
  state.stats.combo = state.combo;
  state.perfectChain = 0;
}

/* ------------------------------------------------------------ 判定の中核 -- */

// 判定窓に入る最初の位置を二分探索で探す。
// notes は時刻順で、すでに打った音も配列に残るため、
// 先頭から走査すると「もう過ぎた音」で探索を打ち切ってしまう。
function lowerBound(notes, time) {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function nearestNote(state, lane, now) {
  const w = state.windows;
  const notes = state.chart.notes;
  let best = null;
  let bestDelta = Infinity;
  const from = lowerBound(notes, now - w.good);
  for (let i = from; i < notes.length; i++) {
    const note = notes[i];
    const delta = note.time - now;
    if (delta > w.good) break;
    if (note.lane !== lane || note.judged) continue;
    const abs = Math.abs(delta);
    if (abs < bestDelta) { bestDelta = abs; best = note; }
  }
  return best;
}

function gradeOfDelta(delta, w) {
  const abs = Math.abs(delta);
  if (abs <= w.perfect) return "perfect";
  if (abs <= w.great) return "great";
  return "good";
}

const BOSS_DAMAGE = { perfect: 3.4, great: 2.2, good: 1.1 };

function bossDamage(state, amount) {
  const boss = state.boss;
  if (!boss || boss.dead || !boss.active) return;
  boss.hp = Math.max(0, boss.hp - amount);
  boss.hitFlash = 1;
  emit(state, { type: "bossHit", hp: boss.hp, maxHp: boss.maxHp, damage: amount });
  if (boss.hp <= 0) {
    boss.dead = true;
    // 倒した瞬間にまだ鳴っていないボスの音符は譜面から外す。
    // 残しておくと「誰も打たなかった音」として正確率の分母に残ってしまう。
    const notes = state.chart.notes;
    let dropped = 0;
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].boss && !notes[i].judged) { notes.splice(i, 1); dropped++; }
    }
    state.stats.total = Math.max(0, state.stats.total - dropped);
    emit(state, { type: "bossDown", boss: BOSS, dropped });
  }
}

function award(state, grade, lane, note) {
  const mods = state.mods;
  const effective = mods.goodCountsAsPerfect && grade === "good" ? "perfect" : grade;
  const scale = note.kind === "hold" ? 0.6 : 1;
  const gain = Math.round(GRADE_SCORE[grade] * scale * multiplier(state) * mods.scoreMul);
  state.stats.score += gain;
  state.stats.weight += GRADE_WEIGHT[grade];
  state.stats[grade] += 1;
  state.stats.judged += 1;
  state.combo += 1;
  state.comboSincePulse += 1;
  state.stats.combo = state.combo;
  if (state.combo > state.stats.maxCombo) state.stats.maxCombo = state.combo;

  let healed = 0;
  if (grade === "perfect") {
    state.perfectChain += 1;
    healed += heal(state, mods.perfectHeal);
    if (mods.perfectChain > 0 && state.perfectChain % 10 === 0) {
      const extra = heal(state, 5 * mods.perfectChain);
      healed += extra;
      emit(state, { type: "chain", count: state.perfectChain, healed: extra });
    }
  } else {
    state.perfectChain = 0;
  }
  if (mods.comboHealAt > 0 && state.comboSincePulse >= mods.comboHealAt) {
    state.comboSincePulse = 0;
    healed += heal(state, mods.comboHeal);
  }
  if (mods.pulseAt > 0 && state.comboSincePulse >= mods.pulseAt) {
    state.comboSincePulse = 0;
    const cleared = [];
    for (const other of state.chart.notes) {
      if (cleared.length >= 6) break;
      if (other.judged || Math.abs(other.time - state.time) > state.chart.spb * 1.5) continue;
      other.judged = true;
      other.grade = "perfect";
      state.stats.judged += 1;
      state.stats.perfect += 1;
      state.stats.weight += GRADE_WEIGHT.perfect;
      cleared.push(other.lane);
    }
    const gained = heal(state, mods.pulseHeal);
    if (cleared.length) {
      state.combo += cleared.length;
      state.stats.combo = state.combo;
      if (state.combo > state.stats.maxCombo) state.stats.maxCombo = state.combo;
    }
    emit(state, { type: "pulse", lanes: cleared, healed: gained });
  }

  if (state.boss && state.boss.active && !state.boss.dead) {
    const accent = note.kind === "accent" ? 1.7 : 1;
    bossDamage(state, BOSS_DAMAGE[grade] * accent);
  }
  emit(state, { type: "judge", grade, effective, lane, note, gain, combo: state.combo, healed });
}

/* ------------------------------------------------------------ 操作の入口 -- */

function start(state, now) {
  state.running = true;
  state.time = now;
  emit(state, { type: "start" });
}

function press(state, lane, now) {
  if (!state.running || state.over) return null;
  if (state.silence) {
    const dealt = damage(state, SILENCE_DAMAGE * state.mods.silenceDamageScale, "silence");
    breakCombo(state, 0.5);
    const event = { type: "violation", lane, dealt };
    emit(state, event);
    return event;
  }
  const note = nearestNote(state, lane, now);
  if (!note) {
    state.stats.whiff += 1;
    if (!state.mods.whiffFree) breakCombo(state, WHIFF_COMBO_LOSS);
    emit(state, { type: "whiff", lane });
    return { type: "whiff", lane };
  }
  note.judged = true;
  note.grade = gradeOfDelta(note.time - now, state.windows);
  note.offset = now - note.time;
  award(state, note.grade, lane, note);
  if (note.kind === "hold") {
    // 同じレーンで次の長音符が始まったなら、前のを先に片づける。
    // 決着しないまま永久に消える。
    // 決着しないまま永久に消える。
    const prev = state.activeHold[lane];
    if (prev && !prev.holdDone && !prev.holdBroken) release(state, lane, now);
    note.holdDone = false;
    note.holdBroken = false;
    state.held[lane] = true;
    state.activeHold[lane] = note;
    emit(state, { type: "holdStart", lane, note });
  }
  return { type: "hit", lane, note };
}

function release(state, lane, now) {
  state.held[lane] = false;
  const note = state.activeHold[lane];
  if (!note || note.holdDone || note.holdBroken) {
    state.activeHold[lane] = null;
    return null;
  }
  if (now >= note.time + note.lenTime - HOLD_GRACE) return finishHold(state, lane, note, true);
  return finishHold(state, lane, note, false);
}

function finishHold(state, lane, note, completed) {
  state.activeHold[lane] = null;
  state.held[lane] = false;
  if (completed) {
    note.holdDone = true;
    state.stats.holds += 1;
    const gain = Math.round(400 * multiplier(state) * state.mods.scoreMul);
    state.stats.score += gain;
    state.combo += 1;
    state.comboSincePulse += 1;
    state.stats.combo = state.combo;
    if (state.combo > state.stats.maxCombo) state.stats.maxCombo = state.combo;
    const healed = heal(state, 1 + state.mods.comboHeal);
    if (state.boss && state.boss.active && !state.boss.dead) bossDamage(state, 1.6);
    emit(state, { type: "holdEnd", lane, note, completed: true, gain, healed });
    return { type: "holdEnd", completed: true, gain };
  }
  note.holdBroken = true;
  state.stats.breaks += 1;
  breakCombo(state, 0.5);
  damage(state, BREAK_DAMAGE, "break");
  emit(state, { type: "holdEnd", lane, note, completed: false });
  return { type: "holdEnd", completed: false };
}

/* ------------------------------------------------------------------ ボス -- */

const BOSS_ORDER = [0, 2, 4, 1, 3, 5];

function bossNotesFor(state, cycleIndex) {
  const startBeat = state.chart.bossStart + cycleIndex * BOSS.cycle;
  const spb = state.chart.spb;
  const base = Math.floor(state.random() * 6);
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push({
      beat: startBeat + i, time: (startBeat + i) * spb,
      lane: BOSS_ORDER[(base + i * 2) % 6],
      kind: "tap", lenBeats: 0, lenTime: 0, boss: true
    });
  }
  out.push({
    beat: startBeat + 6, time: (startBeat + 6) * spb,
    lane: BOSS_ORDER[(base + 5) % 6], kind: "accent", lenBeats: 0, lenTime: 0, boss: true
  });
  out.push({
    beat: startBeat + 7, time: (startBeat + 7) * spb,
    lane: BOSS_ORDER[(base + 1) % 6], kind: "accent", lenBeats: 0, lenTime: 0, boss: true
  });
  return out;
}

function silenceAt(state, now) {
  const scale = state.mods.silenceScale;
  for (const s of state.chart.silences) {
    if (now >= s.time && now < s.time + s.lenTime * scale) return s;
  }
  const boss = state.boss;
  if (boss && boss.active && !boss.dead && state.chart.bossStartTime !== null) {
    const spb = state.chart.spb;
    const into = (now - state.chart.bossStartTime) % (BOSS.cycle * spb);
    const at = BOSS.silentAt * spb;
    const until = at + BOSS.silentLen * spb * scale;
    if (into >= at && into < until) return BOSS_SILENCE;
  }
  return null;
}

function updateBoss(state, now) {
  const boss = state.boss;
  if (!boss || boss.dead) return;
  const startTime = state.chart.bossStartTime;
  if (startTime === null) return;
  boss.hitFlash = Math.max(0, boss.hitFlash - 0.045);
  if (!boss.active && now >= startTime) {
    boss.active = true;
    emit(state, { type: "bossStart", boss: BOSS });
  }
  if (!boss.active) return;
  // 最初のサイクルの生成もこの一本道で行う。
  // 起動フレームで別に push すると、同じ時刻・同じレーンの音符が二重に出来上がる。
  const cycleIndex = Math.floor((now - startTime) / (BOSS.cycle * state.chart.spb));
  if (cycleIndex > boss.cycles && cycleIndex <= BOSS.maxCycles) {
    boss.cycles = cycleIndex;
    const fresh = bossNotesFor(state, cycleIndex);
    state.chart.notes.push.apply(state.chart.notes, fresh);
    // 生成した個数をそのまま加算する。数をここで書くと、
    // 実際に出した音符とずれて正確率の分母が壊れる。
    state.stats.total += fresh.length;
    emit(state, { type: "bossCycle", cycle: cycleIndex });
  }
}

/* ------------------------------------------------------------ 毎フレーム -- */

function update(state, now) {
  state.events.length = 0;
  if (!state.running || state.over) return state.events;
  state.time = now;
  const w = state.windows;

  const silence = silenceAt(state, now);
  if (silence !== state.silence) {
    state.silence = silence;
    emit(state, { type: "silence", active: !!silence });
  }

  // 押しっぱなしのまま、終端の拍まで来たら完走とみなす
  for (const key of Object.keys(state.activeHold)) {
    const lane = Number(key);
    const note = state.activeHold[lane];
    if (!note || note.holdDone || note.holdBroken) { state.activeHold[lane] = null; continue; }
    if (now >= note.time + note.lenTime) finishHold(state, lane, note, state.held[lane] === true);
  }

  // 逃した音。走査位置は保持して、アレイの先頭から毎回探し直さない。
  const notes = state.chart.notes;
  for (let i = state.missCursor; i < notes.length; i++) {
    const note = notes[i];
    if (note.time + w.good >= now) break; // まだ打てる時間がある
    state.missCursor = i + 1;
    if (note.judged) continue;
    note.judged = true;
    note.grade = "miss";
    state.stats.miss += 1;
    state.stats.judged += 1;
    breakCombo(state, 1);
    const dealt = damage(state, MISS_DAMAGE * state.mods.missScale, "miss");
    emit(state, { type: "miss", lane: note.lane, note, dealt });
  }

  updateBoss(state, now);

  if (!state.over && !state.cleared) {
    const last = notes[notes.length - 1];
    const finishAt = last
      ? last.time + (last.lenTime || 0) + TAIL_BEATS * state.chart.spb
      : state.chart.duration;
    if (now >= finishAt) {
      if (state.boss && !state.boss.dead) {
        damage(state, 999, "timeout");
      } else {
        state.cleared = true;
        state.running = false;
        emit(state, { type: "clear", chapter: state.chart.chapter, grade: gradeOf(state) });
      }
    }
  }
  return state.events;
}

/* ------------------------------------------------------------- 強化の抽選 -- */

function rollResonances(state, count) {
  const owned = new Set(state.upgrades);
  const pool = RESONANCES.filter(r => !owned.has(r.id));
  const want = Math.max(0, Math.min(count || 3, pool.length));
  const out = [];
  // 引くたびにプールを短くする。
  // 重複で切ると候補が減る。
  for (let i = 0; i < want; i++) {
    const at = Math.floor(state.random() * pool.length) % pool.length;
    out.push(pool[at]);
    pool.splice(at, 1);
  }
  return out;
}

/* ------------------------------------------------------------- 公開 API -- */

const api = {
  LANES, LANE_KEYS, LANE_KEY_LABEL, WINDOWS, GRADE_SCORE, APPROACH_BEATS, LEAD_BEATS,
  BASE_INTEGRITY, MISS_DAMAGE, SILENCE_DAMAGE, TAIL_BEATS,
  CHAPTERS, BOSS, RESONANCES,
  buildChart, createState, start, press, release, update,
  rollResonances, modsFor, windowsFor, accuracyOf, gradeOf, multiplier, bossNotesFor
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.SyncSim = api;
