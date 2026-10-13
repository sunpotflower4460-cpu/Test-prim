// Pure rules for 句ゆき: mora counting, composition fit, judging, progress,
// seeded word spawns and save validation. No DOM, no Date, no Math.random.
(function () {
  "use strict";

  const W = typeof KuWords !== "undefined" ? KuWords : require("./words.js");

  // Small kana add no mora of their own; they belong to the mora before them.
  const SMALL = "ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ";
  const TARGETS = [5, 7, 5];
  const CUT_LIMIT_SAVE = 40;
  const SAVE_VERSION = 1;
  const SPAWN_SEED = 20261012;
  const LANTERNS_PER_SEGMENT = 18;
  const BUNDLE_ATTEMPTS = 600;

  const byWord = new Map(W.bank.map(entry => [entry.w, entry]));
  const kireWords = W.bank.filter(entry => entry.kire);

  function isKana(ch) {
    const c = ch.codePointAt(0);
    return (c >= 0x3041 && c <= 0x3096) || (c >= 0x30A1 && c <= 0x30FA) || c === 0x30FC;
  }

  // Counts kana only. Small kana add nothing; っ, ん and ー each count one mora.
  function moraCount(text) {
    let n = 0;
    for (const ch of String(text)) {
      if (isKana(ch) && !SMALL.includes(ch)) n++;
    }
    return n;
  }

  // Splits text into its morae, so that morae.length === moraCount(text).
  function splitMorae(text) {
    const morae = [];
    for (const ch of String(text)) {
      if (!isKana(ch)) continue;
      if (SMALL.includes(ch)) {
        if (morae.length) morae[morae.length - 1] += ch;
        continue;
      }
      morae.push(ch);
    }
    return morae;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rand, list) {
    return list[Math.floor(rand() * list.length)];
  }

  function shuffle(rand, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function hashText(text) {
    let h = 2166136261;
    for (const ch of String(text)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Smooth 1D value noise in [0, 1). Continuous in x, so tiles that share
  // absolute coordinates line up without seams.
  function hash1(i, seed) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function noise1(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u;
  }

  function fbm1(x, seed) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let fx = x;
    for (let o = 0; o < 4; o++) {
      sum += noise1(fx, seed + o * 17) * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2.03;
    }
    return sum / norm;
  }

  // Screen y of a mountain crest at absolute x. Smaller y is higher.
  function ridgeY(x, seed, base, amp, scale) {
    return base - amp * fbm1(x / scale, seed);
  }

  // ---- tiles and poems -------------------------------------------------

  function tileFor(word, id) {
    const entry = byWord.get(word);
    if (!entry) return null;
    return {
      id: id,
      word: word,
      mora: moraCount(word),
      morae: splitMorae(word),
      season: entry.s,
      kire: !!entry.kire
    };
  }

  function emptyPoem() {
    return { lines: [[], [], []] };
  }

  function lineMora(poem, i) {
    return poem.lines[i].reduce((n, tile) => n + tile.mora, 0);
  }

  function usedIds(poem) {
    const ids = new Set();
    for (const line of poem.lines) for (const tile of line) ids.add(tile.id);
    return ids;
  }

  function isExact(poem) {
    return TARGETS.every((target, i) => lineMora(poem, i) === target);
  }

  function isSealed(poem, i) {
    return lineMora(poem, i) === TARGETS[i];
  }

  // A tile fits only when its whole mora count fits the line's remaining slots.
  function canAdd(poem, i, tile) {
    if (!poem || !tile || i < 0 || i > 2) return false;
    if (usedIds(poem).has(tile.id)) return false;
    return lineMora(poem, i) + tile.mora <= TARGETS[i];
  }

  function addTile(poem, i, tile) {
    if (!canAdd(poem, i, tile)) return null;
    return {
      lines: poem.lines.map((line, j) => (j === i ? line.concat([tile]) : line.slice()))
    };
  }

  function removeTile(poem, id) {
    for (let i = 0; i < 3; i++) {
      const at = poem.lines[i].findIndex(tile => tile.id === id);
      if (at < 0) continue;
      const tile = poem.lines[i][at];
      return {
        poem: { lines: poem.lines.map((line, j) => (j === i ? line.filter((_, k) => k !== at) : line.slice())) },
        tile: tile
      };
    }
    return null;
  }

  // What the draft still needs before it can be read. `line` is the first line not yet
  // sealed (上の句, then 中の句, then 下の句); `fits` is false when no tile in hand
  // can go into any unsealed line.
  function composeStatus(poem, hand) {
    if (isExact(poem)) return { exact: true, line: null, remaining: 0, empty: false, fits: true };
    const line = [0, 1, 2].find(i => !isSealed(poem, i));
    const used = lineMora(poem, line);
    const open = [0, 1, 2].filter(i => !isSealed(poem, i));
    const fits = (hand || []).some(tile => open.some(i => canAdd(poem, i, tile)));
    return { exact: false, line: line, remaining: TARGETS[line] - used, empty: used === 0, fits: fits };
  }

  function poemWords(lines) {
    return lines.map(line => line.map(item => (typeof item === "string" ? item : item.word)));
  }

  // ---- judging ---------------------------------------------------------

  const RANK_LABEL = { meiku: "名句", kaku: "佳句", yoi: "よい句じゃ" };

  function pickNote(seedText, notes) {
    return notes[hashText(seedText) % notes.length];
  }

  // Judges three lines of words against the requested season.
  // requested: '春' | '夏' | '秋' | '冬', or null when any season is accepted.
  function judge(lines, requested) {
    const words = poemWords(lines);
    const flat = words.reduce((all, line) => all.concat(line), []);
    const counts = words.map(line => line.reduce((n, w) => n + moraCount(w), 0));
    const form = counts[0] === 5 && counts[1] === 7 && counts[2] === 5 && words.length === 3;
    const entries = flat.map(w => byWord.get(w));
    const unknown = entries.some(entry => !entry);
    const text = words.map(line => line.join("")).join("／");
    const season = requested === undefined ? null : requested;

    const kigoAll = entries.filter(entry => entry && entry.s);
    const matches = season === null ? kigoAll : kigoAll.filter(entry => entry.s === season);
    const cuts = entries.filter(entry => entry && entry.kire).map(entry => entry.w);
    const repeated = flat.some((w, i) => flat.indexOf(w) !== i);
    const kigo = matches.length ? matches[0] : null;
    const kigoSeason = kigoAll.length ? kigoAll[0].s : null;
    const cut = cuts.length ? cuts[0] : null;
    const reasons = [];
    const notes = [];

    if (unknown) {
      return { form: false, unknown: true, counts: counts, reasons: ["unknown"], notes: ["言の葉が見あたりません。"],
        rank: null, rankKey: null, kigo: null, cuts: [], season: season, lines: words, text: text, repeated: false };
    }

    if (!form) {
      reasons.push("form");
      notes.push("五・七・五が揃うまで、句は宿の主に届けられません。");
      return { form: false, counts: counts, reasons: reasons, notes: notes, rank: null, rankKey: null,
        kigo: null, kigoSeason: kigoSeason, cuts: cuts, season: season, lines: words, text: text, repeated: repeated };
    }

    let rankKey;
    if (matches.length) {
      reasons.push("kigo");
      notes.push(season === null
        ? "「" + kigo.w + "」が季を届けています。どの季でも、句は立ちます。"
        : "「" + kigo.w + "」が" + season + "の季をさだめています。");
    } else if (kigoAll.length) {
      reasons.push("wrong-kigo");
      notes.push("「" + kigoAll[0].w + "」は" + kigoSeason + "の季です。今日の題は" + season + "でございます。");
    } else {
      reasons.push("missing-kigo");
      notes.push("この句には季の言の葉がありません。" + season + "の言の葉を一つ加えると、句が澄みましょう。");
    }

    if (cuts.length === 1) {
      reasons.push("cut");
      notes.push("「" + cut + "」で句に間が生まれました。");
    } else if (cuts.length === 0) {
      reasons.push("no-cut");
      notes.push("切れ字（や・かな・けり）を一つ置くと、句に息が通ります。");
    } else {
      reasons.push("too-many-cuts");
      notes.push("切れ字が" + cuts.length + "つあると、句が重なりすぎます。一つに絞ってみてください。");
    }

    if (repeated) {
      reasons.push("repeat");
      notes.push("同じ言の葉が重なっております。一つを別の言葉にすると、句が広がります。");
    }

    if (matches.length && cuts.length === 1 && !repeated) rankKey = "meiku";
    else if (matches.length) rankKey = "kaku";
    else rankKey = "yoi";

    const hostLine = rankKey === "meiku" ? "よい句でございます。季が定まり、句に息が通っております。"
      : rankKey === "kaku" ? "季はよく届いております。句は、この道にしっかり結ばれました。"
      : "形は整っております。ただ、季の言の葉がまだ見えませぬ。";
    const rankText = rankKey === "meiku" ? pickNote(text, ["見事な一句です。", "心に残る句です。", "旅の宿にふさわしい一句です。"])
      : rankKey === "kaku" ? pickNote(text, ["静かに、よく詠まれました。", "季の働きがよく見えます。"])
      : pickNote(text, ["まずは形がととのいました。", "次の宿で季を探してみましょう。"]);

    return {
      form: true,
      counts: counts,
      rank: RANK_LABEL[rankKey],
      rankKey: rankKey,
      reasons: reasons,
      notes: notes,
      hostLine: hostLine,
      rankText: rankText,
      kigo: kigo ? kigo.w : null,
      kigoSeason: kigo ? kigo.s : null,
      kigoWord: kigoAll.length ? kigoAll[0].w : null,
      kigoWordSeason: kigoSeason,
      cuts: cuts,
      season: season,
      lines: words,
      text: text,
      repeated: repeated
    };
  }

  // Tiles in hand that would count as a 季語 for the requested season.
  function hintIds(tiles, requested) {
    const season = requested === undefined ? null : requested;
    return tiles.filter(tile => tile.season && (season === null || tile.season === season)).map(tile => tile.id);
  }

  // ---- progression -----------------------------------------------------

  const STATION_COUNT = W.stations.length;

  function emptyProgress() {
    return { cleared: 0, poems: [] };
  }

  function stationUnlocked(progress, k) {
    return k >= 0 && k < STATION_COUNT && k <= progress.cleared;
  }

  function isComplete(progress) {
    return progress.cleared >= STATION_COUNT;
  }

  function sceneSeason(cleared) {
    return W.stations[Math.min(Math.max(cleared, 0), STATION_COUNT - 1)].scene;
  }

  // Judges a poem for the frontier 宿. A form-valid poem clears it; the rank is a keepsake.
  function acceptPoem(progress, lines) {
    if (isComplete(progress)) return { ok: false, reason: "complete", progress: progress };
    const station = W.stations[progress.cleared];
    const result = judge(lines, station.season);
    if (!result.form) return { ok: false, reason: "form", result: result, progress: progress };
    const poem = {
      station: progress.cleared,
      theme: station.theme,
      season: station.season,
      rank: result.rankKey,
      lines: poemWords(lines)
    };
    return {
      ok: true,
      result: result,
      poem: poem,
      progress: { cleared: progress.cleared + 1, poems: progress.poems.concat([poem]) }
    };
  }

  // ---- world geometry ---------------------------------------------------

  const WORLD = { start: 40, firstInn: 1000, spacing: 1500, road: 1100, doorGap: 150, gate: 210 };

  function innX(k) {
    return WORLD.firstInn + k * WORLD.spacing;
  }

  // The farthest x the traveler may reach. The road opens past each 宿 once it is cleared.
  function walkLimit(cleared) {
    if (cleared >= STATION_COUNT) return innX(STATION_COUNT - 1) + WORLD.road;
    return innX(cleared) - WORLD.doorGap;
  }

  // The traveler is at the 宿 gate once within this distance of the frontier 宿.
  function atGate(cleared, x) {
    return cleared < STATION_COUNT && x >= innX(cleared) - WORLD.gate;
  }

  function segmentRange(k) {
    const from = k === 0 ? WORLD.start + 60 : innX(k - 1) + 120;
    return [from, innX(k) - 150];
  }

  // Builds three lines of words that form an exact 5-7-5 with one 季語 for `season`
  // and one 切れ字. Seeded, so the same seed always gives the same answer.
  function buildBundle(rand, season) {
    const kigoPool = W.bank.filter(entry => entry.s === season);
    for (let attempt = 0; attempt < BUNDLE_ATTEMPTS; attempt++) {
      const kigo = pick(rand, kigoPool);
      const cut = pick(rand, kireWords);
      const rest = shuffle(rand, W.bank.filter(entry => !entry.kire && entry.w !== kigo.w &&
        (entry.s === null || entry.s === season)));
      const order = [kigo.w, cut.w].concat(rest.map(entry => entry.w));
      const lines = [[], [], []];
      const sums = [0, 0, 0];
      for (const w of order) {
        if (sums.every((sum, i) => sum === TARGETS[i])) break;
        const mora = moraCount(w);
        const room = [0, 1, 2].filter(i => sums[i] + mora <= TARGETS[i]);
        if (!room.length) continue;
        const i = pick(rand, room);
        lines[i].push(w);
        sums[i] += mora;
      }
      if (sums.every((sum, i) => sum === TARGETS[i])) return lines;
    }
    return null;
  }

  // Lanterns for one 宿 segment. Each segment carries an answer bundle, so every
  // 宿 can be met with a 名句 from what the road offers.
  function segmentFor(k, seed) {
    const rand = mulberry32((seed === undefined ? SPAWN_SEED : seed) ^ Math.imul(k + 1, 0x9e3779b1));
    const station = W.stations[k];
    const season = station.season === null ? station.scene : station.season;
    const answer = buildBundle(rand, season);
    const words = answer.reduce((all, line) => all.concat(line), []);
    const fillers = shuffle(rand, W.bank.filter(entry => !words.includes(entry.w) && !entry.kire)).slice(0, LANTERNS_PER_SEGMENT - words.length);
    const all = shuffle(rand, words.concat(fillers.map(entry => entry.w)));
    const range = segmentRange(k);
    const step = (range[1] - range[0]) / all.length;
    const lanterns = all.map((word, j) => ({
      id: k * 100 + j,
      station: k,
      word: word,
      x: Math.round(range[0] + step * (j + 0.5) + (rand() - 0.5) * step * 0.5),
      h: 0.15 + rand() * 0.8
    }));
    return { station: k, from: range[0], to: range[1], answer: answer, lanterns: lanterns };
  }

  function allLanterns(seed) {
    let list = [];
    for (let k = 0; k < STATION_COUNT; k++) list = list.concat(segmentFor(k, seed).lanterns);
    return list;
  }

  // ---- saving ------------------------------------------------------------

  function serialize(state) {
    const poems = state.progress.poems.map(poem => ({
      station: poem.station,
      rank: poem.rank,
      lines: poem.lines
    }));
    return JSON.stringify({
      v: SAVE_VERSION,
      cleared: state.progress.cleared,
      poems: poems,
      x: Math.round(state.x || 0),
      taken: state.taken,
      hand: state.hand
    });
  }

  // Returns a clean save, or null when the text is not a 句ゆき save at all.
  // Bad poems are dropped, and a gap in the 宿 order ends the kept run.
  function parseSave(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      return null;
    }
    if (!raw || typeof raw !== "object" || raw.v !== SAVE_VERSION) return null;
    const list = Array.isArray(raw.poems) ? raw.poems : [];
    const kept = [];
    const sorted = list
      .filter(poem => poem && Number.isInteger(poem.station) && poem.station >= 0 && poem.station < STATION_COUNT)
      .sort((a, b) => a.station - b.station);
    for (const poem of sorted) {
      if (poem.station !== kept.length) break;
      if (!Array.isArray(poem.lines) || poem.lines.length !== 3) break;
      if (!poem.lines.every(line => Array.isArray(line) && line.every(w => typeof w === "string" && byWord.has(w)))) break;
      const station = W.stations[poem.station];
      const result = judge(poem.lines, station.season);
      if (!result.form) break;
      kept.push({ station: poem.station, theme: station.theme, season: station.season, rank: result.rankKey,
        lines: poemWords(poem.lines) });
    }
    const taken = Array.isArray(raw.taken) ? [...new Set(raw.taken.filter(id => Number.isInteger(id) && id >= 0 && id < 800))] : [];
    const hand = Array.isArray(raw.hand)
      ? [...new Set(raw.hand.filter(id => Number.isInteger(id) && taken.includes(id)))].slice(0, CUT_LIMIT_SAVE)
      : [];
    const x = Number.isFinite(raw.x) ? Math.max(0, raw.x) : 0;
    return {
      progress: { cleared: kept.length, poems: kept },
      taken: taken,
      hand: hand,
      x: x
    };
  }

  const API = {
    moraCount: moraCount,
    splitMorae: splitMorae,
    isKana: isKana,
    mulberry32: mulberry32,
    pick: pick,
    shuffle: shuffle,
    hashText: hashText,
    noise1: noise1,
    fbm1: fbm1,
    ridgeY: ridgeY,
    TARGETS: TARGETS,
    RANK_LABEL: RANK_LABEL,
    SAVE_VERSION: SAVE_VERSION,
    STATION_COUNT: STATION_COUNT,
    WORLD: WORLD,
    tileFor: tileFor,
    emptyPoem: emptyPoem,
    lineMora: lineMora,
    usedIds: usedIds,
    isExact: isExact,
    isSealed: isSealed,
    canAdd: canAdd,
    composeStatus: composeStatus,
    addTile: addTile,
    removeTile: removeTile,
    judge: judge,
    hintIds: hintIds,
    emptyProgress: emptyProgress,
    stationUnlocked: stationUnlocked,
    isComplete: isComplete,
    sceneSeason: sceneSeason,
    acceptPoem: acceptPoem,
    innX: innX,
    walkLimit: walkLimit,
    atGate: atGate,
    segmentRange: segmentRange,
    segmentFor: segmentFor,
    allLanterns: allLanterns,
    buildBundle: buildBundle,
    serialize: serialize,
    parseSave: parseSave
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.KuSim = API;
})();
