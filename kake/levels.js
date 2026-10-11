/* 屋根の六夜。script は灯りまで届く操作、fail は届かない操作。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KakeLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function ground(x, w) { return { x: x, y: 200, w: w, h: 80 }; }
  function go(n) { return { n: n, right: 1 }; }
  function hop(n) { return { n: n, right: 1, jump: 1 }; }
  function cut(n) { return { n: n, right: 1, dash: 1 }; }

  const from = "屋根の人";
  const levels = [
    {
      id: "eave", name: "軒", note: "空きを跳ぶ",
      hint: "右へ走る。空きの手前で跳ぶ。灯りまで、届ける。",
      letter: "屋根は、続いている。\n空きだけ、跳べ。",
      from: from, span: 860, kill: 340,
      spawn: { x: 48, y: 200 }, goal: { x: 700, y: 168, r: 18 },
      solids: [ground(0, 300), ground(364, 420)],
      gates: [], enemies: [],
      script: [go(80), hop(1), go(160)],
      fail: [go(200)]
    },
    {
      id: "beam", name: "梁", note: "早く跳ばない",
      hint: "低い梁がある。早く跳ぶと頭を打ち、空きに落ちる。梁を過ぎてから跳ぶ。",
      letter: "梁が低い。\n早く跳ぶと、頭を打つ。",
      from: from, span: 900, kill: 340,
      spawn: { x: 40, y: 200 }, goal: { x: 740, y: 168, r: 18 },
      solids: [ground(0, 280), ground(352, 480), { x: 70, y: 150, w: 70, h: 16 }],
      gates: [], enemies: [],
      script: [go(80), hop(1), go(180)],
      fail: [go(40), hop(1), go(180)]
    },
    {
      id: "bat", name: "蝙蝠", note: "跳ぶか、駆ける",
      hint: "羽に触れると落ちる。跳んで越えるか、駆けて突き抜ける。",
      letter: "羽の下は、通らない。\n跳ぶか、駆け抜けろ。",
      from: from, span: 920, kill: 340,
      spawn: { x: 40, y: 200 }, goal: { x: 780, y: 168, r: 18 },
      solids: [ground(0, 860)],
      gates: [],
      enemies: [{ x: 360, y: 166, x0: 320, x1: 500, speed: 78, amp: 0 }],
      script: [go(128), cut(1), go(180)],
      fail: [go(300)]
    },
    {
      id: "shutter", name: "戸", note: "開いたら駆ける",
      hint: "戸は、開いた短いあいだだけ通れる。開いたら、駆けて抜ける。",
      letter: "戸は、開いたあいだだけ。\n駆ければ、間に合う。",
      from: from, span: 960, kill: 340,
      spawn: { x: 40, y: 200 }, goal: { x: 760, y: 168, r: 18 },
      solids: [ground(0, 900)],
      gates: [{ x: 430, y: 20, w: 28, h: 180, period: 2.2, open: 0.2, offset: 0.55 }],
      enemies: [],
      script: [go(232), cut(1), go(100)],
      fail: [go(400)]
    },
    {
      id: "leaps", name: "三つの空き", note: "三つ目は駆ける",
      hint: "空きが三つ。三つ目は広い。跳んでから、空中で駆ける。",
      letter: "三つ目の空きは、広い。\n跳んでから、駆ける。",
      from: from, span: 1180, kill: 340,
      spawn: { x: 36, y: 200 }, goal: { x: 1040, y: 168, r: 18 },
      solids: [ground(0, 240), ground(308, 200), ground(584, 160), ground(860, 280)],
      gates: [], enemies: [],
      script: [go(60), hop(1), go(88), hop(1), go(46), { n: 1, right: 1, jump: 1, dash: 1 }, go(160)],
      fail: [go(60), hop(1), go(88), hop(1), go(46), hop(1), go(160)]
    },
    {
      id: "dawn", name: "夜明け", note: "一気に灯まで",
      hint: "空きを跳び、羽を駆けて抜き、戸が開いたらもう一度駆ける。",
      letter: "戸と、羽と、空き。\n灯りまで、一気に。",
      from: from, span: 960, kill: 340,
      spawn: { x: 40, y: 200 }, goal: { x: 800, y: 168, r: 18 },
      solids: [ground(0, 270), ground(348, 520)],
      gates: [{ x: 640, y: 20, w: 28, h: 180, period: 2.4, open: 0.22, offset: 0.7 }],
      enemies: [{ x: 460, y: 164, x0: 400, x1: 560, speed: 90, amp: 18, freq: 2.4, phase: 0.4 }],
      script: [go(64), hop(1), go(34), cut(1), go(140), cut(1), go(90)],
      fail: [go(400)]
    }
  ];

  return { levels: levels };
});
