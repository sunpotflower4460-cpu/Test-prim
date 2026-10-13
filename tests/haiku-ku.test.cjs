const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../haiku/ku/sim.js");
const words = require("../haiku/ku/words.js");

const KANA = /^[ぁ-ゖァ-ヺー]+$/;

function lines(...rows) {
  return rows.map(row => row.slice());
}

// 名句 for 春: さくら (kigo) + や (cut) in the first line.
const MEIKU = lines(["さくら", "や", "ひ"], ["かわず", "ひとり", "て"], ["いけ", "ねこ", "き"]);

test("mora counting follows the small kana, sokuon, ん and ー rules", () => {
  assert.equal(sim.moraCount("さくら"), 3);
  assert.equal(sim.moraCount("きょう"), 2);
  assert.equal(sim.moraCount("しゅんか"), 3);
  assert.equal(sim.moraCount("ちょうちょう"), 4);
  assert.equal(sim.moraCount("がっこう"), 4);
  assert.equal(sim.moraCount("ん"), 1);
  assert.equal(sim.moraCount("ー"), 1);
  // キ(1) ャ(0) ッ(1) シ(1) ュ(0): the rule gives 3 morae.
  assert.equal(sim.moraCount("キャッシュ"), 3);
  assert.equal(sim.moraCount("きゃ"), 1);
  assert.equal(sim.moraCount("ッ"), 1);
  assert.equal(sim.moraCount("ゃ"), 0);
  assert.equal(sim.moraCount("ぁぃぅぇぉゎャュョァィゥェォヮ"), 0);
});

test("splitMorae agrees with moraCount for every bank word", () => {
  for (const entry of words.bank) {
    const morae = sim.splitMorae(entry.w);
    assert.equal(morae.length, sim.moraCount(entry.w), entry.w);
    assert.equal(morae.join(""), entry.w, entry.w);
  }
  assert.deepEqual(sim.splitMorae("がっこう"), ["が", "っ", "こ", "う"]);
  assert.deepEqual(sim.splitMorae("キャッシュ"), ["キャ", "ッ", "シュ"]);
});

test("the word bank is kana only, unique, tagged and large enough", () => {
  assert.ok(words.bank.length >= 80, "at least 80 words");
  const seen = new Set();
  for (const entry of words.bank) {
    assert.match(entry.w, KANA, "kana only: " + entry.w);
    assert.ok(!seen.has(entry.w), "no duplicates: " + entry.w);
    seen.add(entry.w);
    assert.ok(entry.s === null || ["春", "夏", "秋", "冬"].includes(entry.s), "valid tag: " + entry.w);
    if (entry.kire) assert.equal(entry.s, null, "切れ字 is 無季: " + entry.w);
    assert.ok(sim.moraCount(entry.w) >= 1, entry.w);
  }
  for (const season of ["春", "夏", "秋", "冬"]) {
    assert.ok(words.bank.filter(e => e.s === season).length >= 15, "kigo for " + season);
  }
  const cuts = words.bank.filter(e => e.kire).map(e => e.w).sort();
  assert.deepEqual(cuts, ["かな", "けり", "や"]);
  assert.equal(words.bank.find(e => e.w === "ひぐらし").s, "秋");
  assert.equal(words.bank.find(e => e.w === "あめ").s, null);
});

test("exact forms are judged, and an inexact form is not submitted", () => {
  const exact = sim.judge(MEIKU, "春");
  assert.equal(exact.form, true);
  assert.deepEqual(exact.counts, [5, 7, 5]);
  const short = sim.judge(lines(["さくら"], ["かわず", "ひとり", "て"], ["いけ", "ねこ", "き"]), "春");
  assert.equal(short.form, false);
  assert.equal(short.rank, null);
  assert.deepEqual(short.counts, [3, 7, 5]);
  const unknown = sim.judge(lines(["さくら", "や", "ひ"], ["かわず", "ひとり", "て"], ["いけ", "ねこ", "ぽ"]), "春");
  assert.equal(unknown.form, false);
});

test("three ranks: 名句, 佳句 and よい句じゃ", () => {
  assert.equal(sim.judge(MEIKU, "春").rankKey, "meiku");
  assert.equal(sim.judge(MEIKU, "春").rank, "名句");

  const noCut = lines(["さくら", "みち"], ["かわず", "ひとり", "て"], ["いけ", "ねこ", "き"]);
  const kaku = sim.judge(noCut, "春");
  assert.equal(kaku.form, true);
  assert.equal(kaku.rankKey, "kaku");
  assert.ok(kaku.reasons.includes("no-cut"));

  const yoi = lines(["みち", "いけ", "て"], ["ひとり", "ねこ", "め", "ひ"], ["いぬ", "うま", "き"]);
  const plain = sim.judge(yoi, "春");
  assert.equal(plain.form, true);
  assert.equal(plain.rank, "よい句じゃ");
  assert.equal(plain.rankKey, "yoi");
});

test("a missing season and a wrong season both fall back to よい句じゃ with a gentle note", () => {
  const yoi = lines(["みち", "いけ", "て"], ["ひとり", "ねこ", "め", "ひ"], ["いぬ", "うま", "き"]);
  const missing = sim.judge(yoi, "夏");
  assert.equal(missing.rankKey, "yoi");
  assert.ok(missing.reasons.includes("missing-kigo"));
  assert.match(missing.notes.join(""), /夏の言の葉/);

  const wrong = sim.judge(MEIKU, "夏");
  assert.equal(wrong.rankKey, "yoi");
  assert.ok(wrong.reasons.includes("wrong-kigo"));
  assert.match(wrong.notes.join(""), /春の季/);
});

test("two cut words are too many, and the rank drops to 佳句", () => {
  const twoCuts = lines(["さくら", "や", "ひ"], ["かわず", "ひとり", "て"], ["いけ", "かな", "き"]);
  const result = sim.judge(twoCuts, "春");
  assert.equal(result.rankKey, "kaku");
  assert.ok(result.reasons.includes("too-many-cuts"));
  assert.equal(result.cuts.length, 2);
});

test("repeated words are noted and cannot reach 名句", () => {
  const overlong = lines(["さくら", "や", "ひ"], ["かわず", "ひとり", "て"], ["いけ", "さくら", "き"]);
  const result = sim.judge(overlong, "春");
  assert.equal(result.form, false, "いけ・さくら・き is 6 mora, not 5");
  const exact = lines(["さくら", "や", "ひ"], ["かわず", "ひとり", "て"], ["さくら", "き", "め"]);
  const dup = sim.judge(exact, "春");
  assert.equal(dup.form, true);
  assert.equal(dup.repeated, true);
  assert.equal(dup.rankKey, "kaku");
  assert.ok(dup.reasons.includes("repeat"));
});

test("a request that accepts any season takes any 季語", () => {
  const summer = lines(["なつ", "くも", "や"], ["かわず", "ひとり", "て"], ["いけ", "ねこ", "き"]);
  assert.equal(sim.judge(summer, null).rankKey, "meiku");
  assert.equal(sim.judge(summer, "春").rankKey, "meiku");
  const none = lines(["みち", "いけ", "て"], ["ひとり", "ねこ", "め", "ひ"], ["いぬ", "うま", "き"]);
  assert.equal(sim.judge(none, null).rankKey, "yoi");
});

test("the hint lists only the tiles that count as 季語 for the request", () => {
  const tiles = ["さくら", "なつ", "みち", "や"].map((w, i) => sim.tileFor(w, i));
  assert.deepEqual(sim.hintIds(tiles, "春"), [0]);
  assert.deepEqual(sim.hintIds(tiles, null), [0, 1]);
  assert.deepEqual(sim.hintIds(tiles, "冬"), []);
});

test("a tile can never overflow a line, and a used tile is refused", () => {
  const pool = words.bank.map((entry, i) => sim.tileFor(entry.w, i));
  let poem = sim.emptyPoem();
  let rng = sim.mulberry32(7);
  for (let step = 0; step < 4000; step++) {
    const tile = pool[Math.floor(rng() * pool.length)];
    const line = Math.floor(rng() * 3);
    const next = sim.addTile(poem, line, tile);
    if (next) {
      poem = next;
    } else if (rng() < 0.2) {
      const removed = sim.removeTile(poem, sim.usedIds(poem).values().next().value);
      if (removed) poem = removed.poem;
    }
    for (let i = 0; i < 3; i++) {
      assert.ok(sim.lineMora(poem, i) <= sim.TARGETS[i], "line " + i + " never overflows");
    }
    assert.equal(new Set([...sim.usedIds(poem)]).size, poem.lines.flat().length, "no tile is used twice");
  }
  // Words outside the bank still measure correctly; these tiles only test the fit rule.
  const raw = (word, id) => ({ id: id, word: word, mora: sim.moraCount(word), morae: sim.splitMorae(word), season: null, kire: false });
  const full = sim.addTile(sim.emptyPoem(), 0, raw("キャッシュ", 901));
  assert.equal(sim.lineMora(full, 0), 3);
  assert.equal(sim.addTile(full, 0, raw("がっこう", 902)), null, "4 mora does not fit 2 remaining");
  assert.equal(sim.addTile(full, 0, raw("き", 903)).lines[0].length, 2);
  assert.equal(sim.canAdd(full, 0, raw("さくら", 904)), false, "3 mora does not fit 2 remaining");
  const kigo = sim.tileFor("さくら", 910);
  const placed = sim.addTile(sim.emptyPoem(), 0, kigo);
  assert.equal(sim.canAdd(placed, 1, kigo), false, "a used tile is refused");
});

test("composeStatus names the first unsealed line and the morae it still lacks", () => {
  let poem = sim.emptyPoem();
  const hand = [sim.tileFor("さくら", 1), sim.tileFor("や", 2)];
  let status = sim.composeStatus(poem, hand);
  assert.equal(status.exact, false);
  assert.equal(status.line, 0);
  assert.equal(status.remaining, 5);
  assert.equal(status.empty, true);
  assert.equal(status.fits, true);

  poem = sim.addTile(poem, 0, sim.tileFor("さくら", 3));
  status = sim.composeStatus(poem, hand);
  assert.deepEqual([status.line, status.remaining, status.empty], [0, 2, false]);

  // 上の句 is 2 morae short. かわず (3) does not fit there, but it fits the open 中の句.
  const elsewhere = sim.composeStatus(poem, [sim.tileFor("かわず", 4)]);
  assert.equal(elsewhere.line, 0);
  assert.equal(elsewhere.fits, true);
  // An empty hand fits nothing.
  assert.equal(sim.composeStatus(poem, []).fits, false);

  // Once 上の句 and 中の句 are sealed, 下の句 is the line that is still open.
  poem = sim.addTile(poem, 0, sim.tileFor("や", 5));
  poem = sim.addTile(poem, 0, sim.tileFor("ひ", 6));
  poem = sim.addTile(poem, 1, sim.tileFor("かわず", 7));
  poem = sim.addTile(poem, 1, sim.tileFor("ひとり", 8));
  poem = sim.addTile(poem, 1, sim.tileFor("て", 9));
  status = sim.composeStatus(poem, []);
  assert.deepEqual([status.line, status.remaining], [2, 5]);
  assert.equal(sim.composeStatus(sim.emptyPoem(), []).line, 0);
});

test("a judged poem reports the 季語 word even when its season is wrong", () => {
  const wrong = sim.judge(MEIKU, "夏");
  assert.equal(wrong.kigo, null);
  assert.equal(wrong.kigoWord, "さくら");
  assert.equal(wrong.kigoWordSeason, "春");
  const right = sim.judge(MEIKU, "春");
  assert.equal(right.kigo, "さくら");
  assert.equal(right.kigoWord, "さくら");
});

test("a line is sealed exactly when its mora match the target", () => {
  let poem = sim.emptyPoem();
  let id = 0;
  for (const row of MEIKU.entries()) {
    for (const w of row[1]) poem = sim.addTile(poem, row[0], sim.tileFor(w, id++));
  }
  assert.equal(sim.isSealed(poem, 0), true);
  assert.equal(sim.isSealed(poem, 1), true);
  assert.equal(sim.isSealed(poem, 2), true);
  assert.equal(sim.isExact(poem), true);
});

test("stations unlock in order, and the 句集 completes after eight", () => {
  let progress = sim.emptyProgress();
  assert.equal(sim.stationUnlocked(progress, 0), true);
  assert.equal(sim.stationUnlocked(progress, 1), false);
  assert.equal(sim.stationUnlocked(progress, 7), false);
  assert.equal(words.stations.length, 8);
  assert.equal(words.stations[7].season, null, "峠 accepts any season");
  for (let k = 0; k < 8; k++) {
    assert.equal(sim.stationUnlocked(progress, k), k <= progress.cleared);
    assert.equal(sim.isComplete(progress), false);
    const station = words.stations[k];
    const bundle = sim.buildBundle(sim.mulberry32(100 + k), station.season === null ? "冬" : station.season);
    const accepted = sim.acceptPoem(progress, bundle);
    assert.equal(accepted.ok, true, "station " + k);
    assert.equal(accepted.poem.station, k);
    progress = accepted.progress;
  }
  assert.equal(sim.isComplete(progress), true);
  assert.equal(sim.acceptPoem(progress, MEIKU).reason, "complete");
  assert.equal(progress.poems.length, 8);
});

test("a form-invalid poem does not clear the 宿", () => {
  const progress = sim.emptyProgress();
  const result = sim.acceptPoem(progress, lines(["さくら"], ["かわず"], ["いけ"]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "form");
  assert.equal(result.progress.cleared, 0);
});

test("each 宿 has a 名句 bundle within its own segment", () => {
  for (let k = 0; k < 8; k++) {
    const seg = sim.segmentFor(k);
    const station = words.stations[k];
    const verdict = sim.judge(seg.answer, station.season);
    assert.equal(verdict.rankKey, "meiku", "station " + k);
    const laid = seg.lanterns.map(l => l.word);
    for (const w of seg.answer.flat()) assert.ok(laid.includes(w), "bundle word on the road: " + w);
    assert.ok(seg.lanterns.every(l => l.station === k));
    assert.ok(seg.lanterns.every(l => l.x >= seg.from && l.x <= seg.to), "lanterns stay in their segment");
  }
});

test("spawns and buildBundle are deterministic under a seed and vary across seeds", () => {
  const a = sim.segmentFor(3, 42);
  const b = sim.segmentFor(3, 42);
  assert.deepEqual(a, b);
  const c = sim.segmentFor(3, 43);
  assert.notDeepEqual(a.lanterns.map(l => l.word), c.lanterns.map(l => l.word));
  assert.deepEqual(sim.allLanterns(), sim.allLanterns());
  assert.equal(new Set(sim.allLanterns().map(l => l.id)).size, sim.allLanterns().length, "lantern ids are unique");
});

test("the noise field is continuous and stays inside [0, 1)", () => {
  let previous = sim.noise1(0, 5);
  for (let i = 1; i <= 2000; i++) {
    const value = sim.noise1(i / 40, 5);
    assert.ok(value >= 0 && value < 1);
    assert.ok(Math.abs(value - previous) < 0.1, "no jump at " + i / 40);
    previous = value;
  }
});

test("walk limits open the road one 宿 at a time", () => {
  assert.equal(sim.walkLimit(0), sim.innX(0) - sim.WORLD.doorGap);
  assert.ok(sim.walkLimit(1) > sim.walkLimit(0));
  assert.ok(sim.walkLimit(8) > sim.walkLimit(7));
});

test("a save round-trips, and corrupt saves are rejected or trimmed", () => {
  const first = sim.acceptPoem(sim.emptyProgress(), sim.buildBundle(sim.mulberry32(1), "春"));
  const text = sim.serialize({ progress: first.progress, taken: [0, 5, 100], hand: [5, 100], x: 812.4 });
  const back = sim.parseSave(text);
  assert.equal(back.progress.cleared, 1);
  assert.deepEqual(back.progress.poems[0].lines, first.poem.lines);
  assert.equal(back.progress.poems[0].rank, first.poem.rank);
  assert.deepEqual(back.taken, [0, 5, 100]);
  assert.deepEqual(back.hand, [5, 100]);
  assert.equal(back.x, 812);

  assert.equal(sim.parseSave("{not json"), null);
  assert.equal(sim.parseSave("null"), null);
  assert.equal(sim.parseSave(JSON.stringify({ v: 2, cleared: 8 })), null);

  const badLine = JSON.parse(text);
  badLine.poems[0].lines[0] = ["さくら"];
  assert.equal(sim.parseSave(JSON.stringify(badLine)).progress.cleared, 0, "bad poem is dropped");

  const gap = JSON.parse(text);
  gap.poems = [{ station: 1, rank: "meiku", lines: first.poem.lines }];
  assert.equal(sim.parseSave(JSON.stringify(gap)).progress.cleared, 0, "a gap in 宿 order is not kept");

  const junk = JSON.parse(text);
  junk.hand = [5, "x", -1, 5, 999];
  junk.taken = [5, "q"];
  junk.x = "far";
  const cleaned = sim.parseSave(JSON.stringify(junk));
  assert.deepEqual(cleaned.hand, [5]);
  assert.deepEqual(cleaned.taken, [5]);
  assert.equal(cleaned.x, 0);
});
