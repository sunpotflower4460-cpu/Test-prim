"use strict";
/* HELIX // 螺旋 の検証。
 *
 *   node --test tests/helix.test.cjs
 *
 * 「打てる」ことは主張ではなく、各ステージのスクリプトを再生して示す。
 * ステージとスクリプトは同一ファイル内にあり、片方だけ書き換えると
 * このテストが落ちる。
 *
 * 段の地形は tools/helix-levels.cjs が矩形から描くので、跳躍の予算を
 * 超える隙はそこで弾かれる。进行检查するのは、出荷した helix-sim.js
 * のほうである。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("../helix-sim.js");

const DT = sim.DT;
const TILE = sim.TILE;

/** 横幅と高さを指定しただけの空のステージを作る。 */
function arena(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = "#";
    if (y === h - 1) row = "#".repeat(w);
    else if (y === 0) row = "#".repeat(w);
    else row = "#" + ".".repeat(w - 2) + "#";
    rows.push(row);
  }
  rows[1] = "#S" + ".".repeat(w - 4) + "G#";
  return rows;
}

function run(state, intent, frames) {
  const input = sim.makeInput(intent);
  let prevJump = false;
  let prevDash = false;
  for (let i = 0; i < frames; i++) {
    input.jumpPressed = input.jump && !prevJump;
    input.dashPressed = input.dash && !prevDash;
    prevJump = input.jump;
    prevDash = input.dash;
    sim.update(state, DT, input);
  }
  return state;
}

/** 検査用のステージを作る。createState は rows を直接受け取る。 */
function makeState(rows) {
  return sim.createState(0, rows);
}

/* --------------------------------------------------------------- データ -- */

test("ステージは 5 つあり、どれも長方形で、開始点と終点を持つ", () => {
  assert.equal(sim.LEVELS.length, 5);
  const ids = new Set();
  for (const level of sim.LEVELS) {
    assert.ok(!ids.has(level.id), "id が重複している: " + level.id);
    ids.add(level.id);
    const map = sim.parseLevel(level.rows);
    assert.ok(map.start, level.en + " に開始点がない");
    assert.ok(map.goal, level.en + " に終点がない");
    for (const row of level.rows) assert.equal(row.length, map.w, level.en + " の行の幅が揃っていない");
  }
});

test("未知の記号は黙って捨てられずエラーになる", () => {
  assert.throws(() => sim.parseLevel(["###", "#S#", "#@#", "###"]), /unknown level glyph/);
});

test("幅の不齐なステージは拒否される", () => {
  assert.throws(() => sim.parseLevel(["####", "#S.#", "###", "####"]), /ragged/);
});

test("開始点は壁に埋まらず、 立っていられる", () => {
  for (const level of sim.LEVELS) {
    const map = sim.parseLevel(level.rows);
    for (const key of ["start", "goal"]) {
      const p = map[key];
      assert.ok(!sim.solidAt(map, Math.floor(p.x / TILE), Math.floor(p.y / TILE)),
        level.en + " の " + key + " が壁の中");
    }
    const sx = Math.floor(map.start.x / TILE);
    const sy = Math.floor(map.start.y / TILE);
    assert.ok(sim.solidAt(map, sx, sy + 1), level.en + " の開始点の下に足場がない");
  }
});

/* これが「ステージ」になっているかの最低条件。goal が start と同じ行にある
 * 段は、横に走るだけの競走であって足場の精度を問うものにならない。 */
test("終点は開始点より上にあり、 走れば終わるだけの段は無い", () => {
  for (const level of sim.LEVELS) {
    const startY = Math.floor(sim.parseLevel(level.rows).start.y / TILE);
    const goalY = Math.floor(sim.parseLevel(level.rows).goal.y / TILE);
    assert.ok(goalY < startY, level.en + " は終点が始点と同じか下の行にある");
    assert.ok(startY - goalY <= 16, level.en + " の登り幅が大きすぎる");
  }
});

test("どの段にも足場が複数ある（一本道でない）", () => {
  for (const level of sim.LEVELS) {
    const map = sim.parseLevel(level.rows);
    let tops = 0;
    for (let y = 0; y < map.h - 1; y++) {
      for (let x = 1; x < map.w - 1; x++) {
        if (sim.solidAt(map, x, y) && !sim.solidAt(map, x, y + 1)) tops++;
      }
    }
    assert.ok(tops >= 6, level.en + " の足場が少なすぎる: " + tops);
  }
});

/* tools/helix-levels.cjs が描く地形と、 agonise として出した地形がずれて
 * いないか。生成したファイルだけを見ていても、気付かないずれが残る。 */
test("出荷したステージは authoring ファイルと一致する", () => {
  const authored = require("../tools/helix-levels.cjs");
  assert.equal(authored.STAGES.length, sim.LEVELS.length);
  for (let i = 0; i < sim.LEVELS.length; i++) {
    assert.deepEqual(sim.LEVELS[i].rows, authored.build(authored.STAGES[i]),
      sim.LEVELS[i].en + " が helix-levels.cjs とずれている");
    assert.equal(sim.LEVELS[i].name, authored.STAGES[i].name);
    assert.equal(sim.LEVELS[i].en, authored.STAGES[i].en);
    assert.equal(sim.LEVELS[i].lead, authored.STAGES[i].lead);
  }
});

/* --------------------------------------------------------------- 物理 -- */

/* ここからはすべて createState の rows 差し替えで測る。LEVELS を入れ替える
 * 方法は使えない。createState はクロージャの LEVELS を読むので、公開した
 * プロパティを差替えても、生成されるのは実際の 1 番目である。
 * かつてはそれで全テストが 1 番目を測っていた。 */

test("ジャンプの高さは PHYS から計算した値と一致する", () => {
  const s = makeState(arena(24, 12));
  s.player.y = 100;
  s.player.vy = 0;
  const start = s.player.y;
  run(s, "RJ", 200);
  const apex = start - sim.PHYS.jump * sim.PHYS.jump / (2 * sim.PHYS.gravity);
  assert.ok(apex < start, "定数から求めた頂点が始点より上");
  assert.ok(apex > start - 120 && apex < start - 20, "頂点が理屈の範囲に収まる: " + apex);
});

test("最高速は PHYS.run ちょうどで、 それを超えない", () => {
  const s = makeState(arena(40, 12));
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    run(s, "R", 1);
    if (Math.abs(s.player.vx) > peak) peak = Math.abs(s.player.vx);
  }
  assert.ok(peak > sim.PHYS.run - 1, "最高速には届く: " + peak);
  assert.ok(peak <= sim.PHYS.run + 0.001,
    "PHYS.run を超える: " + peak + " > " + sim.PHYS.run);
});

test("押しっぱなしで走ると、 摩擦で止まる", () => {
  const s = makeState(arena(40, 12));
  run(s, "R", 30);
  assert.ok(s.player.vx > 150, "加速する: " + s.player.vx);
  run(s, "", 90);
  assert.equal(s.player.vx, 0, "摩擦で止まる");
});

test("ダッシュは一定時間だけ加速が効く", () => {
  const s = makeState(arena(40, 12));
  run(s, "RK", 1);
  assert.equal(s.player.dashes, 1);
  assert.ok(s.player.vx > sim.PHYS.run, "ダッシュ中は最高速度を超える");
  run(s, "", Math.ceil(sim.PHYS.dashTime / DT) + 2);
  assert.ok(s.player.vx <= sim.PHYS.run + 1, "ダッシュ後は最高速度に戻る");
});

test("同フレームで跳ぶ指定とダッシュの指定が来ても、跳躍が消えない", () => {
  /* The right half of the screen raises jump and dash on one touch. The dash
   * zeroes vy a few lines after the jump, so without the guard in helix-sim.js
   * the very first tap was eaten by the dash and the player never left the
   * floor on a phone at all. */
  const s = makeState(arena(40, 12));
  run(s, "", 70);                 // fall the whole way; a jump needs ground or coyote
  assert.ok(s.player.onGround, "接地している");
  const input = sim.makeInput("R");
  input.jumpPressed = true;
  input.dashPressed = true;
  sim.update(s, DT, input);
  assert.equal(s.player.jumps, 1, "同フレームでも跳ぶ");
  assert.equal(s.player.dashes, 0, "同フレームのダッシュは後回しになる");
  assert.ok(s.player.vy < 0, "上昇残っている: " + s.player.vy);

  // 次のフレームでダッシュだけなら、それが効く。
  const next = sim.makeInput("RK");
  next.jumpPressed = false;
  next.dashPressed = true;
  sim.update(s, DT, next);
  assert.equal(s.player.dashes, 1, "次のタップでダッシュする");
  assert.ok(s.player.vx > sim.PHYS.run, "ダッシュ中は最高速度を超える");
});

test("跳んでいなければ、同フレームのダッシュは普通のまま効く", () => {
  const s = makeState(arena(40, 12));
  run(s, "", 70);
  const input = sim.makeInput("RK");
  input.jumpPressed = false;      // no jump this frame; the dash must not depend on it
  input.dashPressed = true;
  sim.update(s, DT, input);
  assert.equal(s.player.dashes, 1, "ダッシュは跳ぶ指定に依存しない");
  assert.equal(s.player.jumps, 0, "跳んでいない");
});

test("壁に触れている間は壁が検出される", () => {
  const s = makeState(arena(40, 12));
  run(s, "L", 60);
  assert.equal(s.player.onWall, -1, "左の壁に張り付く");
  const flush = s.player.x - sim.PLAYER_W / 2;
  assert.ok(flush <= 18 + 4, "壁 面まで詰まって接している: " + flush.toFixed(2));
});

test("壁跳びは壁から離れて跳ね上がる", () => {
  const s = makeState(arena(40, 12));
  run(s, "", 90);          // まず着地させる
  assert.ok(s.player.onGround, "着地している");
  run(s, "J", 1);          // 地面跳び
  run(s, "L", 8);          // 上昇しながら左の壁へ押し付ける
  assert.equal(s.player.onWall, -1, "壁に張り付く");
  assert.ok(!s.player.onGround, "空中にいる");
  const wall = s.player.onWall;
  const before = s.player.y;
  run(s, "J", 2);
  assert.equal(s.player.wallJumps, 1, "壁跳びとして数えられる");
  assert.ok(s.player.vx * wall < 0, "壁から離れる向きに跳ぶ: vx=" + s.player.vx + " wall=" + wall);
  assert.ok(s.player.vy < 0, "上へ跳ぶ");
  assert.ok(before - s.player.y > 0, "高くなる");
});

test("壁を離すと、壁の判定も消える", () => {
  const s = makeState(arena(40, 12));
  run(s, "L", 60);
  assert.equal(s.player.onWall, -1);
  run(s, "R", 40);
  assert.equal(s.player.onWall, 0, "離れたら壁ではない");
});

/* 索敵の番人。横に掃く sentry は、乗った瞬間に必ず殺される。 */
test("番人は縦に往復する", () => {
  const s = makeState([
    "##########",
    "#S.....G.#",
    "#........#",
    "#....d...#",
    "#........#",
    "##########"
  ]);
  const drone = s.drones[0];
  assert.ok(drone, "番人が配置されている");
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < 400; i++) {
    run(s, "", 1);
    assert.equal(drone.x, drone.ox, "x は動かない");
    if (drone.y < low) low = drone.y;
    if (drone.y > high) high = drone.y;
  }
  const swept = high - low;
  assert.ok(swept > drone.range * 1.8,
    "上下に往復している: " + swept.toFixed(1) + "px");
  assert.ok(Math.abs((low + high) / 2 - drone.oy) < 1,
    "往復の中心が原地: " + ((low + high) / 2).toFixed(1) + " vs " + drone.oy.toFixed(1));
});

/* --------------------------------------------------------- 可解性 -- */

test("すべてのステージは、添えられたスクリプトで 0 死でクリアできる", () => {
  for (let i = 0; i < sim.LEVELS.length; i++) {
    const level = sim.LEVELS[i];
    assert.ok(level.script && level.script.length, level.en + " にスクリプトがない");
    const state = sim.createState(i);
    sim.runScript(state, level.script);
    assert.ok(state.finished, level.en + " をスクリプトでクリアできない（time=" + state.time.toFixed(2) + "）");
    assert.equal(state.deaths, 0, level.en + " のスクリプトは死んでいる");
  }
});

test("スクリプトは副作用を起こさない（何度再生しても同じ結果）", () => {
  for (let i = 0; i < sim.LEVELS.length; i++) {
    const before = JSON.stringify(sim.LEVELS[i].script);
    const a = sim.createState(i);
    sim.runScript(a, sim.LEVELS[i].script);
    const b = sim.createState(i);
    sim.runScript(b, sim.LEVELS[i].script);
    assert.equal(a.finished, b.finished);
    assert.equal(a.time, b.time, sim.LEVELS[i].en + " の再生が非決定的");
    assert.equal(JSON.stringify(sim.LEVELS[i].script), before,
      sim.LEVELS[i].en + " のスクリプトが再生中に書き換えられた");
  }
});

test("ステージは座標が NaN にならず、到達点が後退しない", () => {
  for (let i = 0; i < sim.LEVELS.length; i++) {
    const state = sim.createState(i);
    sim.runScript(state, sim.LEVELS[i].script);
    assert.ok(state.player.maxX >= state.map.start.x, "最大到達点が始点を下回る");
    for (const key of ["x", "y", "vx", "vy"]) {
      assert.ok(Number.isFinite(state.player[key]), "座標が NaN になった: " + key);
    }
  }
});

test("スクリプトは実際に跳んでいる（全フレーム walk ではない）", () => {
  for (let i = 0; i < sim.LEVELS.length; i++) {
    const state = sim.createState(i);
    sim.runScript(state, sim.LEVELS[i].script);
    assert.ok(state.player.jumps >= 3, sim.LEVELS[i].en + " で跳んでいない: " + state.player.jumps);
  }
});

test("壁沿いの段は壁跳びを使っている", () => {
  const state = sim.createState(1);
  sim.runScript(state, sim.LEVELS[1].script);
  assert.ok(state.player.wallJumps >= 1,
    "THE WALL で壁跳びを使っていない: " + state.player.wallJumps);
});

/* --------------------------------------------------------------- 危険物 -- */

test("棘に触れると死に、待ち時間のあとに開始点へ戻る", () => {
  const s = makeState([
    "#########",
    "#.S..G..#",
    "#.^^^^^.#",
    "#########"
  ]);
  let died = false;
  for (let i = 0; i < 60 && !died; i++) {
    run(s, "", 1);
    died = s.player.dead;
  }
  assert.ok(died, "棘で死ぬ");
  assert.equal(s.deaths, 1);
  run(s, "", 40);
  assert.ok(!s.player.dead, "時間切れで復活する");
  assert.equal(s.player.x, s.map.start.x, "開始点へ戻る");
  assert.ok(s.player.invuln > 0, "復活直後は無敵: " + s.player.invuln);
});

test("旗に届くと、そこが次の開始点になる", () => {
  const s = makeState([
    "############",
    "#S.......G.#",
    "#..........#",
    "#....C.....#",
    "############"
  ]);
  run(s, "R", 200);
  assert.equal(s.player.checkpointIndex, 0, "旗を取った");
  const cp = { x: s.player.checkpoint.x, y: s.player.checkpoint.y };
  // Die somewhere else entirely, then check where the player comes back.
  s.player.x = cp.x + 200;
  s.player.y = cp.y - 200;
  s.player.invuln = 0;
  s.player.dead = true;
  s.player.deadTimer = 0.01;
  run(s, "", 4);
  assert.ok(!s.player.dead, "復活する");
  assert.ok(Math.abs(s.player.x - cp.x) < 0.5 && Math.abs(s.player.y - cp.y) < 3,
    "旗の位置へ復帰する: " + s.player.x.toFixed(1) + "," + s.player.y.toFixed(1));
});

test("動く足場は乗ると一緒に運ばれる", () => {
  const s = makeState([
    "############",
    "#S.......G.#",
    "#..........#",
    "#....m.....#",
    "############"
  ]);
  run(s, "", 1);          // 先に足場を進めます
  const mover = s.movers[0];
  s.player.x = mover.x + TILE / 2;
  s.player.y = mover.y - sim.PLAYER_H / 2 - 2;
  s.player.vy = 0;
  run(s, "", 3);
  assert.ok(s.player.onGround, "足場の上に乗る");
  const p0 = s.player.x, m0 = mover.x;
  run(s, "", 20);
  const dp = s.player.x - p0, dm = mover.x - m0;
  assert.ok(Math.abs(dm) > 1, "足場が動いている: " + dm.toFixed(2));
  assert.ok(Math.abs(dp) > 0.5, "プレイヤーも運ばれる: " + dp.toFixed(2));
  assert.equal(Math.sign(dp), Math.sign(dm), "足場と同じ向きに運ばれる");
});

test("全ての段の番人が、狭すぎる足場の上を通らない", () => {
  for (const level of sim.LEVELS) {
    const map = sim.parseLevel(level.rows);
    for (const d of map.drones) {
      for (let x = 1; x < map.w - 1; x++) {
        for (let y = 0; y < map.h - 1; y++) {
          if (!sim.solidAt(map, x, y) || sim.solidAt(map, x, y + 1)) continue;
          let a = x, b = x;
          while (a > 0 && sim.solidAt(map, a - 1, y) && !sim.solidAt(map, a - 1, y + 1)) a--;
          while (b < map.w - 2 && sim.solidAt(map, b + 1, y) && !sim.solidAt(map, b + 1, y + 1)) b++;
          if (b - a + 1 > 5) continue;
          assert.ok(Math.abs(d.x - x * TILE - TILE / 2) > TILE,
            level.en + " の番人が幅" + (b - a + 1) + "の足場の上を通る");
        }
      }
    }
  }
});
