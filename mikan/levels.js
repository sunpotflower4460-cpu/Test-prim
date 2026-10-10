/* 蜜柑の夜。六つの晩。solution は天板に残る置き方、fail は残らない置き方。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MikanLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const shared = {
    thick: 26, floor: 320, floorX0: 0, floorX1: 360,
    hang: 48, hangDrop: 84, breath: 0, wander: 0, omega: 1.8,
    tilt: 0, dip: 0, bulb: null, w: 360, h: 340
  };

  function night(spec) {
    const level = Object.assign({}, shared, spec);
    level.bulb = spec.bulb || null;
    return level;
  }

  const levels = [
    night({
      id: "first", name: "最初の晩",
      hint: "天板の上に置くと止まる。裾の外へ落とすと、畳まで転げる。",
      letter: "冷えてきた。\nひとつ、ここに置いておく。",
      from: "この部屋の人",
      x0: 80, x1: 280, top: 200, goal: 1,
      queue: [18],
      solution: [180],
      fail: [28]
    }),
    night({
      id: "three", name: "三つ",
      hint: "並べても、重ねてもいい。三つとも、朝まで天板の上に。",
      letter: "三つなら、手を伸ばせば届く。\nそれ以上は、明日でいい。",
      from: "この部屋の人",
      x0: 70, x1: 290, top: 200, goal: 3,
      queue: [16, 16, 16],
      solution: [130, 180, 230],
      fail: [18, 22, 26]
    }),
    night({
      id: "lamp", name: "灯りの下",
      hint: "灯りが低い。同じ場所へ積むと、三つ目が笠に触れて転がる。横に置く。",
      letter: "高く積むと、額に当たる。\n横に置けば、みんな座っていられる。",
      from: "この部屋の人",
      x0: 90, x1: 270, top: 210, goal: 3,
      bulb: { x: 180, y: 118, r: 16 },
      queue: [16, 16, 16],
      solution: [120, 180, 240],
      fail: [180, 180, 180]
    }),
    night({
      id: "narrow", name: "小さい天板",
      hint: "天板が狭い。端に置くと裾へ落ちる。真ん中へ、四つ。",
      letter: "この天板は、昔から小さい。\n真ん中を、外さないこと。",
      from: "この部屋の人",
      x0: 150, x1: 210, top: 200, goal: 4,
      queue: [13, 13, 13, 13],
      solution: [180, 180, 180, 180],
      fail: [150, 150, 150, 150]
    }),
    night({
      id: "valley", name: "沈む布団",
      hint: "真ん中が沈んでいる。天板のどこに置いても、谷が集める。裾の外は集められない。",
      letter: "布団の真ん中が、少し沈んでいる。\n蜜柑は、自分で寄ってくる。",
      from: "この部屋の人",
      x0: 100, x1: 260, top: 186, dip: 32, goal: 5,
      queue: [14, 14, 14, 14, 14],
      solution: [120, 150, 180, 210, 240],
      fail: [24, 28, 32, 36, 40]
    }),
    night({
      id: "late", name: "夜ふけ",
      hint: "狭い天板に、低い灯り。積むと笠に触れる。端は落ちる。低く、内側へ。",
      letter: "夜が更けても、灯りは消さない。\n低く置いたぶんだけ、朝に残る。",
      from: "この部屋の人",
      x0: 125, x1: 235, top: 210, goal: 4,
      bulb: { x: 180, y: 112, r: 15 },
      queue: [14, 14, 14, 14],
      solution: [140, 165, 195, 220],
      fail: [180, 180, 180, 180]
    })
  ];

  function pack(level, xs) {
    return xs.map((x, index) => ({ x: x, r: level.queue[index] }));
  }

  return { levels: levels, pack: pack };
});
