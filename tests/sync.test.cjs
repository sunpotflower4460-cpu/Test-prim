"use strict";
/* Minimax M3.1 — SYNC// 共鳴 の検証。
 *
 *   node --test tests/sync.test.cjs
 *
 * 譜面の構造が破綻していないこと、そして「打てる」ことを主に確かめる。
 * 実際に画面を触るのは tests/browser-smoke.cjs の役割。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../sync-sim.js");

const DT = 1 / 120;

/** 譜面どおりに叩き切る。jitterMs は打つ瞬間の誤差（0 なら完璧）。 */
function play(chapterIndex, jitterMs, upgrades, seed) {
  const state = sim.createState({
    chapterIndex,
    upgrades: upgrades || [],
    seed: seed === undefined ? 0x5eed1 : seed
  });
  const random = sim.createState({ seed: 0x9e37 }).random;
  sim.start(state, 0);
  const holding = {};
  for (let t = 0; t < state.chart.duration + 140; t += DT) {
    const now = t;
    sim.update(state, now);
    if (state.over || state.cleared) break;
    if (state.silence) continue;
    if (jitterMs !== null) {
      for (const note of state.chart.notes) {
        if (note.judged || note.holdBroken || note.holdDone) continue;
        const delta = note.time - now;
        if (note.kind === "hold") {
          if (delta <= 0.02 && holding[note.lane] !== note.id) {
            sim.press(state, note.lane, now);
            holding[note.lane] = note.id;
          }
        } else if (delta <= 0 && delta > -0.1) {
          sim.press(state, note.lane, now + (jitterMs ? (random() - 0.5) * 2 * jitterMs / 1000 : 0));
        }
      }
    }
    for (const lane of Object.keys(holding)) {
      const note = state.chart.notes.find(n => n.id === holding[lane]);
      if (!note) { holding[lane] = null; continue; }
      if (now >= note.time + note.lenTime) {
        sim.release(state, Number(lane), now + 0.02);
        holding[lane] = null;
      }
    }
  }
  return state;
}

/* -------------------------------------------------------------- 譜面 -- */

test("5つの章が定義され、それぞれに譜面が組まれている", () => {
  assert.equal(sim.CHAPTERS.length, 5);
  sim.CHAPTERS.forEach((chapter, i) => {
    const chart = sim.buildChart(i);
    assert.ok(chart, chapter.jp + " に譜面が無い");
    assert.ok(chart.notes.length >= 40, chapter.jp + " の音符が少なすぎる（" + chart.notes.length + "）");
    assert.ok(chart.bpm >= 84 && chart.bpm <= 140);
    assert.ok(chart.duration > 25 && chart.duration < 90, chapter.jp + " の長さが適正でない");
  });
});

test("音符は時刻順に並んでおり、レーンと拍の値が範囲内に収まる", () => {
  sim.CHAPTERS.forEach((chapter, i) => {
    const chart = sim.buildChart(i);
    for (let a = 1; a < chart.notes.length; a++) {
      assert.ok(
        chart.notes[a].time >= chart.notes[a - 1].time,
        chapter.jp + " の音符が時刻順に並んでいない"
      );
    }
    chart.notes.forEach(note => {
      assert.ok(note.lane >= 0 && note.lane < sim.LANES, chapter.jp + " のレーン番号が範囲外");
      assert.ok(note.kind === "tap" || note.kind === "hold" || note.kind === "accent");
      assert.ok(note.time >= sim.LEAD_BEATS * chart.spb - 1e-9, chapter.jp + " はカウントインより前に音が始まる");
    });
  });
});

test("静寂の区間に音符が重なっていない（打たざるを得ない状況を作らない）", () => {
  sim.CHAPTERS.forEach((chapter, i) => {
    const chart = sim.buildChart(i);
    chart.silences.forEach(s => {
      const from = s.time;
      const to = s.time + s.lenTime;
      for (const note of chart.notes) {
        const noteEnd = note.time + (note.lenTime || 0);
        assert.ok(
          note.time >= to || noteEnd <= from,
          chapter.jp + ": " + note.beat + "拍目の音符が静寂区間 " + s.beat + "〜" +
          (s.beat + s.lenBeats) + " と重なっている"
        );
      }
    });
  });
});

test("同じ時刻・同じレーンの音符が重複していない（必ず片方が逃げる）", () => {
  sim.CHAPTERS.forEach((chapter, i) => {
    const chart = sim.buildChart(i);
    for (let a = 1; a < chart.notes.length; a++) {
      const prev = chart.notes[a - 1];
      const cur = chart.notes[a];
      assert.ok(
        !(cur.time - prev.time < 1e-4 && cur.lane === prev.lane),
        chapter.jp + " に同時刻・同レーンの音符が重複している"
      );
    }
  });
});

test("連続する音符は0.3拍未満に詰まってない", () => {
  sim.CHAPTERS.forEach((chapter, i) => {
    const chart = sim.buildChart(i);
    for (let a = 1; a < chart.notes.length; a++) {
      const gap = (chart.notes[a].time - chart.notes[a - 1].time) / chart.spb;
      assert.ok(gap >= 0.3, chapter.jp + " に 0.3拍未満の連続がある（" + gap.toFixed(2) + "拍）");
    }
  });
});

test("譜面の全トークンが書式どおりに解釈される（黙って捨てられない）", () => {
  sim.CHAPTERS.forEach(chapter => {
    chapter.bars.forEach((bar, index) => {
      const tokens = bar.trim().split(/\s+/).filter(Boolean);
      tokens.forEach(token => {
        const isNote = /^(\d+(?:\.\d+)?):([0-5])(?:h(\d+(?:\.\d+)?))?(!)?$/.test(token);
        const isRest = /^z(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.test(token);
        assert.ok(isNote || isRest,
          chapter.jp + " " + (index + 1) + "行目の \"" + token + "\" が解釈できない");
      });
    });
  });
});

test("長音符（ホールド）は各章に 1 個以上置かれている", () => {
  [1, 2, 3, 4].forEach(i => {
    const chart = sim.buildChart(i);
    const holds = chart.notes.filter(n => n.kind === "hold");
    assert.ok(holds.length >= 1, sim.CHAPTERS[i].jp + " に長音符が無い");
    holds.forEach(note => {
      assert.ok(note.lenBeats > 0 && note.lenTime > 0, "長音符の長さが 0");
    });
  });
});

/* -------------------------------------------------------------- 判定 -- */

test("判定幅は指定した誤差に応じて PERFECT / GREAT / GOOD になる", () => {
  const state = sim.createState({ chapterIndex: 0 });
  sim.start(state, 0);
  const note = state.chart.notes[0];
  const freshGrade = (state, offset) => {
    sim.press(state, state.chart.notes[0].lane, state.chart.notes[0].time + offset);
    return state.chart.notes[0].grade;
  };
  const gradeAt = offset => {
    const fresh = sim.createState({ chapterIndex: 0 });
    sim.start(fresh, 0);
    return freshGrade(fresh, offset);
  };
  assert.equal(gradeAt(0), "perfect");
  assert.equal(gradeAt(0.02), "perfect");
  assert.equal(gradeAt(0.06), "great");
  assert.equal(gradeAt(0.12), "good");
  assert.equal(gradeAt(0.2), undefined, "判定幅の外は当たりにならない");
  assert.equal(gradeAt(-0.06), "great", "早く打っても同じ幅で判定される");
  assert.ok(note.lane >= 0);
});

test("空振りはコンボを削るが、当たりでは点が入る", () => {
  const state = sim.createState({ chapterIndex: 0 });
  sim.start(state, 0);
  const note = state.chart.notes[0];
  sim.press(state, note.lane, note.time);
  assert.equal(state.combo, 1);
  assert.ok(state.stats.score > 0);
  sim.press(state, (note.lane + 3) % sim.LANES, note.time);
  assert.ok(state.combo < 1, "空振りでコンボが減る");
});

test("PERFECT を重ねると倍率と得点が上がる", () => {
  const state = sim.createState({ chapterIndex: 0 });
  sim.start(state, 0);
  const first = state.chart.notes[0];
  sim.press(state, first.lane, first.time);
  const earlyScore = state.stats.score;
  for (const note of state.chart.notes.slice(1, 21)) sim.press(state, note.lane, note.time);
  assert.equal(state.combo, 21);
  assert.ok(state.stats.score > earlyScore * 15, "コンボで得点が伸びている");
  assert.ok(sim.multiplier(state) > 1.1, "倍率が上がっている");
});

/* -------------------------------------------------------------- 戦闘 -- */

test("音を逃すと核が削られ、削り切ると終わる", () => {
  const state = sim.createState({ chapterIndex: 0 });
  sim.start(state, 0);
  const before = state.integrity;
  const note = state.chart.notes[0];
  sim.update(state, note.time + sim.WINDOWS.good + 0.01);
  assert.equal(state.stats.miss, 1);
  assert.ok(state.integrity < before, "逃すと核が傷つく");
  assert.equal(state.combo, 0);

  for (let k = 1; k < 40 && !state.over; k++) {
    const n = state.chart.notes[k];
    if (n) sim.update(state, n.time + sim.WINDOWS.good + 0.01);
  }
  assert.ok(state.over, " nucleus が 0 になると終わる");
  assert.equal(state.integrity, 0);
});

test("静寂の区間で叩くと破り、コンボが折れる", () => {
  const chapterIndex = 3;   // 静寂のある章
  const chart = sim.buildChart(chapterIndex);
  const silence = chart.silences[0];
  const state = sim.createState({ chapterIndex });
  sim.start(state, silence.time - 0.01);
  sim.update(state, silence.time + 0.01);
    assert.ok(state.silence, "静寂区間に入ったことが状態に保持されている");
  const before = state.integrity;
  sim.press(state, 0, silence.time + 0.05);
    assert.ok(state.integrity < before, "静寂中の打撃は核に響く");
});

test("長音符は押しっぱなしなら完走し、離すと断拍になる", () => {
  const chapterIndex = 1;   // 長音符のある章
  const chart = sim.buildChart(chapterIndex);
  const hold = chart.notes.find(n => n.kind === "hold");
  assert.ok(hold, "第2章に長音符がある");

  const good = sim.createState({ chapterIndex });
  sim.start(good, hold.time);
  sim.press(good, hold.lane, hold.time);
  sim.update(good, hold.time + hold.lenTime);
  assert.equal(good.stats.holds, 1, "押しっぱなしで完走する");

  const bad = sim.createState({ chapterIndex });
  sim.start(bad, hold.time);
  sim.press(bad, hold.lane, hold.time);
  sim.release(bad, hold.lane, hold.time + 0.05);
  assert.equal(bad.stats.holds, 0);
  assert.equal(bad.stats.breaks, 1, "早めに離すと断拍");
});

/* --------------------------------------------------------- クリア可能性 -- */

test("すべての章は、打てる手で通せる", () => {
  sim.CHAPTERS.forEach((chapter, i) => {
    const state = play(i, 0);
    assert.ok(state.cleared, chapter.jp + " を完璧に叩いても クリア できない");
    assert.equal(state.stats.miss, 0, chapter.jp + " で音符が1つでも逃げた");
    assert.equal(sim.accuracyOf(state), 1, chapter.jp + " の正確さが 100% にならない");
    assert.equal(sim.gradeOf(state), "SSS");
    assert.equal(state.integrity, state.maxIntegrity, chapter.jp + " で核が傷ついた");
  });
});

test("少しぶれる指でも通せるが、放置すると必ず負ける", () => {
  sim.CHAPTERS.forEach((chapter, i) => {
    const shaky = play(i, 30);
    assert.ok(shaky.cleared, chapter.jp + " を少しぶれる指で通せない");

    const idle = play(i, null);
    assert.ok(idle.over, chapter.jp + " は何もしなければ素通りで勝ててしまう");
    assert.equal(idle.integrity, 0);
  });
});

test("ボス戦では、完璧に叩けば倒せる", () => {
  const state = play(sim.CHAPTERS.length - 1, 0);
  assert.ok(state.cleared, "終拍の主に勝てなかった");
  assert.ok(state.boss, "ボス状態が存在する");
  assert.ok(state.boss.dead, "ボスを倒しきれなかった");
  assert.equal(state.boss.hp, 0);
});

test("ボスの音符が譜面の分母と食い違わない", () => {
  const chapterIndex = 4;
  const state = play(chapterIndex, 0);
  // 生成された音符数と、正しく数え上げられた判定数が一致すること
  const judged = state.stats.perfect + state.stats.great + state.stats.good + state.stats.miss;
  assert.equal(judged, state.stats.judged);
  assert.equal(state.stats.judged, state.stats.total,
    "ボスを倒したあとに未判定の音符が残っている");
  assert.ok(state.stats.total > 41, "ボスの音符が加算されている");
});

/* -------------------------------------------------------------- 強化 -- */

test("共鳴は12種あり、取るほど効果が変わる", () => {
  assert.equal(sim.RESONANCES.length, 12);
  const ids = new Set(sim.RESONANCES.map(r => r.id));
  assert.equal(ids.size, 12, "IDが重複している");
  sim.RESONANCES.forEach(r => {
    assert.ok(r.jp && r.en && r.desc && r.icon, r.id + " の表示が足りない");
  });
  const mods = id => JSON.stringify(sim.modsFor([id]));
  const seen = new Set(sim.RESONANCES.map(r => mods(r.id)));
  assert.equal(seen.size, 12, "効果の内容が重複している");
});

test("広幅を取ると判定幅が伸びる", () => {
  const plain = sim.createState({ chapterIndex: 0 });
  const wide = sim.createState({ chapterIndex: 0, upgrades: ["wide"] });
  assert.ok(wide.windows.perfect > plain.windows.perfect);
  assert.ok(wide.windows.good > plain.windows.good);
});

test("静寂（QUIET）を取ると破りの痛みが軽くなる", () => {
  const plain = sim.createState({ chapterIndex: 3 });
  const quiet = sim.createState({ chapterIndex: 3, upgrades: ["quiet"] });
  assert.ok(quiet.mods.silenceDamageScale < plain.mods.silenceDamageScale);
  assert.ok(quiet.mods.silenceScale < plain.mods.silenceScale);
});

test("抽選は持っていない共鳴しか返さない", () => {
  const state = sim.createState({ chapterIndex: 0, upgrades: ["wide", "amplify"], seed: 7 });
  for (let i = 0; i < 40; i++) {
    const offers = sim.rollResonances(state, 3);
    assert.ok(offers.length > 0);
    const picked = offers.map(o => o.id);
    assert.equal(new Set(picked).size, picked.length, "同じものを二重に出している");
    for (const id of picked) {
      assert.ok(!state.upgrades.includes(id), "持っている " + id + " を再度提示している");
    }
  }
});

test("抽選は常に取り分を揃える", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const state = sim.createState({ chapterIndex: 0, upgrades: ["wide"], seed });
    const offers = sim.rollResonances(state, 3);
    assert.equal(offers.length, 3, "seed " + seed + " で候補が減った");
    assert.equal(new Set(offers.map(o => o.id)).size, 3, "seed " + seed + " で重複がある");
  }
  const full = sim.createState({ chapterIndex: 0, upgrades: sim.RESONANCES.map(r => r.id) });
  assert.deepEqual(sim.rollResonances(full, 3), []);
});

test("同じレーンの長音符が連続すると、前のものは片づく", () => {
  const chapterIndex = 1;
  const state = sim.createState({ chapterIndex });
  const hold = state.chart.notes.find(n => n.kind === "hold" && n.lane === 0);
  assert.ok(hold, "第2章のレーン0に長音符がある");
  const spb = state.chart.spb;

  // 今の譜面にはこの並びは出ない。状態の前提として、
  // 前の長音符が終わる前に次の長音符が始まるようにしておく。
  const second = {
    id: -1, beat: hold.beat + 1, time: hold.time + spb, lane: 0,
    kind: "hold", lenBeats: 1, lenTime: spb, boss: false,
    judged: false, grade: "", offset: 0, holdDone: false, holdBroken: false
  };
  state.chart.notes.push(second);
  state.chart.notes.sort((a, b) => a.time - b.time);

  sim.start(state, hold.time);
  sim.press(state, 0, hold.time);
  assert.equal(state.activeHold[0], hold, "一つ目の長音符が始まっている");

  sim.update(state, second.time);
  sim.press(state, 0, second.time);
  assert.equal(hold.holdBroken, true, "前の長音符は断拍になる");
  assert.equal(state.stats.breaks, 1, "断拍として計数される");
  assert.equal(state.activeHold[0], second, "新しいものが入っている");
  assert.equal(hold.holdDone, false, "完走にはならない");
});

/* -------------------------------------------------------------- 記録 -- */

test("正確さは判定済みの音符だけを母数にする", () => {
  const state = sim.createState({ chapterIndex: 0 });
  sim.start(state, 0);
  assert.equal(sim.accuracyOf(state), 0);
  const note = state.chart.notes[0];
  sim.press(state, note.lane, note.time);
  assert.equal(sim.accuracyOf(state), 1, "1音だけ打てば 100% になる");
  const second = state.chart.notes[1];
  sim.update(state, second.time + sim.WINDOWS.good + 0.01);
  assert.ok(sim.accuracyOf(state) < 1, "逃すと下がる");
});

test("最後まで打てたぶん、評価は高くなる", () => {
  const rank = { C: 0, B: 1, A: 2, S: 3, SS: 4, SSS: 5 };
  const state = sim.createState({ chapterIndex: 0 });
  sim.start(state, 0);
  assert.equal(sim.gradeOf(state), "C");
  for (const note of state.chart.notes) sim.press(state, note.lane, note.time);
  assert.equal(sim.gradeOf(state), "SSS");
  assert.ok(rank[sim.gradeOf(state)] > rank[sim.gradeOf(state)] === false);
});
