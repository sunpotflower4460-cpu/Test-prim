/* 蛇の蔵。七つ。solution は戸口まで届く進み方、fail は届かない進み方。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HebiLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parse(lines, slit) {
    const h = lines.length;
    const w = lines[0].length;
    const walls = [];
    const stones = [];
    const molts = [];
    const slits = [];
    const dishes = [];
    const latches = [];
    let exit = null;
    let head = null;
    const parts = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = lines[y][x];
        if (c === "#") walls.push({ x: x, y: y });
        if (c === "o" || c === "*") stones.push({ x: x, y: y });
        if (c === "m") molts.push({ x: x, y: y });
        if (c === "s") slits.push({ x: x, y: y, max: slit });
        if (c === "d") dishes.push({ x: x, y: y });
        if (c === "k" || c === "*") latches.push({ x: x, y: y });
        if (c === "E") exit = { x: x, y: y };
        if (c === "H") head = { x: x, y: y };
        if (c >= "1" && c <= "9") parts.push({ x: x, y: y, n: Number(c) });
      }
    }
    parts.sort((a, b) => a.n - b.n);
    return {
      w: w, h: h, walls: walls, stones: stones, molts: molts, slits: slits,
      dishes: dishes, latches: latches, exit: exit,
      snake: [head].concat(parts.map(part => ({ x: part.x, y: part.y })))
    };
  }

  function room(spec) {
    const level = parse(spec.map, spec.slit || 0);
    level.id = spec.id;
    level.name = spec.name;
    level.note = spec.note;
    level.hint = spec.hint;
    level.letter = spec.letter;
    level.from = spec.from;
    level.solution = spec.solution;
    level.fail = spec.fail;
    (spec.latches || []).forEach(latch => level.latches.push(latch));
    return level;
  }

  const from = "この蔵の人";
  const levels = [
    room({
      id: "face", name: "顔を出す", note: "温石を一つ",
      hint: "頭を一マスずつ。温石を踏んで、戸口へ。自分の胴には進めない。",
      letter: "床の下で、音がした。\n顔だけ、出してみた。",
      from: from,
      solution: "DDRD",
      fail: ["L", "DDD"],
      map: [
        "#######",
        "#.....#",
        "#21H..#",
        "#.....#",
        "#...o.#",
        "#...E.#",
        "#######"
      ]
    }),
    room({
      id: "body", name: "自分の胴", note: "温石を二つ",
      hint: "右の温石を先に取る。尾がどいた跡なら、通ってよい。上の道を、胴で塞がない。",
      letter: "長い胴は、自分の道を塞ぐ。\n尾がどいてから、その跡を通る。",
      from: from,
      solution: "DDDRUUULLLDDDLDDRR",
      fail: ["L"],
      map: [
        "#########",
        "#.......#",
        "#.321H..#",
        "#...#...#",
        "#...#...#",
        "#.o.#.o.#",
        "#...#...#",
        "#...E...#",
        "#########"
      ]
    }),
    room({
      id: "molt", name: "抜け殻", note: "抜けて、くぐる",
      hint: "左端の抜け殻を踏むと、一マス短くなる。短くなってから、割れ目をくぐる。",
      letter: "皮を一枚、床に残した。\n短くなったぶんだけ、狭いところへ入れる。",
      from: from,
      slit: 5,
      solution: "DLLULLLDRRRRDDD",
      fail: ["DLD"],
      map: [
        "#########",
        "#54321H.#",
        "#m......#",
        "#####s###",
        "#....o..#",
        "#....E..#",
        "#########"
      ]
    }),
    room({
      id: "dish", name: "皿のそば", note: "皿を避ける",
      hint: "真下は皿。触れると進めない。右へ回って、温石から戸口へ。",
      letter: "皿は、人が置いたものだ。\n倒さずに、横を通る。",
      from: from,
      solution: "RDDDRD",
      fail: ["D"],
      map: [
        "#######",
        "#21H..#",
        "#..d..#",
        "#.....#",
        "#....o#",
        "#....E#",
        "#######"
      ]
    }),
    room({
      id: "latch", name: "掛け金", note: "掛け金を踏む",
      hint: "戸口では、胴が掛け金の上に残っていること。抜け殻を踏むと短くなり、届かない。",
      letter: "掛け金は、重みで下がる。\n胴を残したまま、頭を戸へ。",
      from: from,
      solution: "DDLDDDD",
      fail: ["DLLDRDDDD"],
      map: [
        "#########",
        "#.......#",
        "#4321H..#",
        "#..m....#",
        "#...*...#",
        "#..#.#..#",
        "#..#.#..#",
        "#..#.#..#",
        "####E####"
      ]
    }),
    room({
      id: "once", name: "一度だけ", note: "一度だけ抜ける",
      hint: "右の抜け殻を、一度だけ。二度抜けると掛け金まで届かない。抜ける前の割れ目は、通らない。",
      letter: "一枚で足りる。\nもう一枚抜くと、扉の前で胴が足りない。",
      from: from,
      slit: 5,
      solution: "RDLLDDDDDD",
      fail: ["DLD", "RDLLULLLLDRRRRDDDDDD"],
      map: [
        "#########",
        "#54321H.#",
        "#m.....m#",
        "#####s###",
        "#....*..#",
        "#...#.#.#",
        "#...#.#.#",
        "#...#.#.#",
        "#####E###"
      ]
    }),
    room({
      id: "deep", name: "蔵の奥", note: "奥の戸まで",
      hint: "右で一枚抜け、左の温石を踏んでから割れ目へ。皿には触れない。割れ目に胴を残したまま、戸口へ。",
      letter: "奥の戸は、今夜でいい。\n白い蛇は、朝までに戻る。",
      from: from,
      slit: 5,
      latches: [{ x: 3, y: 4 }],
      solution: "RDLLLLLLDRRDDDDD",
      fail: ["DLD", "DLLLDD"],
      map: [
        "#########",
        "#54321H.#",
        "#o.....m#",
        "#....d..#",
        "###s#####",
        "#..*....#",
        "#.#.#...#",
        "#.#.#...#",
        "###E#####"
      ]
    })
  ];

  return { levels: levels };
});
