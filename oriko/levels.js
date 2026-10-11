/* 折光室の九室。solution は手で置いた配置で、テストが月の息まで含めて点灯を確かめる。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OrikoLevels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MIRROR = Math.PI / 4;
  const R = 1, G = 2, B = 4;

  const wings = [
    { name: "静月", en: "STILL MOON" },
    { name: "染色", en: "DYED LIGHT" },
    { name: "月の息", en: "THE MOON BREATHES" }
  ];

  const levels = [
    {
      id: "first-fold", wing: 0, name: "最初の折り",
      hint: "鏡を光の通り道に置く。斜めに向けると、月は上へ返る。",
      letter: "月は、まっすぐには届かない。\n一度、折ってごらんなさい。",
      from: "前の番人",
      w: 96, h: 64,
      source: { x: 12, y: 40, a: 0, sweep: 0 },
      walls: [],
      plants: [{ x: 48, y: 16, r: 6, need: "w" }],
      inventory: [{ type: "mirror" }],
      fixed: [],
      solution: [{ type: "mirror", x: 48, y: 40, rot: MIRROR }]
    },
    {
      id: "past-the-wall", wing: 0, name: "壁のむこう",
      hint: "壁は光を覚えない。先に上へ折り、それから横へ折る。",
      letter: "光は壁を覚えていない。\n回り道だけが、覚えている。",
      from: "前の番人",
      w: 96, h: 72,
      source: { x: 10, y: 52, a: 0, sweep: 0 },
      walls: [{ x1: 44, y1: 30, x2: 44, y2: 68 }],
      plants: [{ x: 74, y: 16, r: 6, need: "w" }],
      inventory: [{ type: "mirror" }, { type: "mirror" }],
      fixed: [],
      solution: [
        { type: "mirror", x: 24, y: 52, rot: MIRROR },
        { type: "mirror", x: 24, y: 16, rot: MIRROR }
      ]
    },
    {
      id: "two-buds", wing: 0, name: "通り過ぎる花",
      hint: "花は光を止めない。一つの筋が、二つの蕾を起こす。",
      letter: "花は光を止めない。\n通り過ぎたあとも、色は残る。",
      from: "温室の日誌",
      w: 96, h: 64,
      source: { x: 10, y: 48, a: 0, sweep: 0 },
      walls: [],
      plants: [
        { x: 42, y: 32, r: 5, need: "w" },
        { x: 42, y: 16, r: 5, need: "w" }
      ],
      inventory: [{ type: "mirror" }],
      fixed: [],
      solution: [{ type: "mirror", x: 42, y: 48, rot: MIRROR }]
    },
    {
      id: "only-red", wing: 1, name: "紅だけ",
      hint: "白い月のままでは、この花は開かない。紅の硝子を筋に交差させる。",
      letter: "白い月のままでは、この花は目を覚まさない。\n赤だけを、通して。",
      from: "紅の花",
      w: 96, h: 64,
      source: { x: 8, y: 32, a: 0, sweep: 0 },
      walls: [],
      plants: [{ x: 76, y: 32, r: 6, need: "r" }],
      inventory: [{ type: "dye", mask: R }],
      fixed: [],
      solution: [{ type: "dye", mask: R, x: 42, y: 32, rot: 0 }]
    },
    {
      id: "two-colors", wing: 1, name: "二つの色",
      hint: "水晶は一つの光を二つに分ける。上の筋に紅、下の筋に青。",
      letter: "一つの光を、二つに分ける。\nそれぞれに、欲しい色がある。",
      from: "前の番人",
      w: 96, h: 76,
      source: { x: 8, y: 36, a: 0, sweep: 0 },
      walls: [],
      plants: [
        { x: 80, y: 16, r: 6, need: "r" },
        { x: 80, y: 56, r: 6, need: "b" }
      ],
      inventory: [{ type: "split" }, { type: "dye", mask: R }, { type: "dye", mask: B }],
      fixed: [],
      solution: [
        { type: "split", x: 40, y: 36, rot: 0 },
        { type: "dye", mask: R, x: 64, y: 24, rot: 0 },
        { type: "dye", mask: B, x: 64, y: 48, rot: 0 }
      ]
    },
    {
      id: "gold-and-red", wing: 1, name: "金のまま",
      hint: "金の花は、染めていない光だけを飲む。もう一方の筋にだけ、紅を置く。",
      letter: "金の花は、染めていない光だけを飲む。\n隣の赤は、染めた光だけ。",
      from: "金の花",
      w: 96, h: 76,
      source: { x: 8, y: 40, a: 0, sweep: 0 },
      walls: [],
      plants: [
        { x: 72, y: 24, r: 7, need: "gold" },
        { x: 78, y: 60, r: 6, need: "r" }
      ],
      inventory: [{ type: "split" }, { type: "dye", mask: R }],
      fixed: [],
      solution: [
        { type: "split", x: 36, y: 40, rot: 0 },
        { type: "dye", mask: R, x: 58, y: 50, rot: 0 }
      ]
    },
    {
      id: "moon-breath", wing: 2, name: "月の息",
      hint: "月は息をする。鏡を光源の近くに置き、花までの距離を短くする。",
      letter: "当たった瞬間ではない。\n息のあいだ中、届いていること。",
      from: "前の番人",
      w: 96, h: 64,
      source: { x: 12, y: 40, a: 0, sweep: 0.1 },
      walls: [],
      plants: [{ x: 36, y: 16, r: 8, need: "w" }],
      inventory: [{ type: "mirror", length: 26 }],
      fixed: [],
      solution: [{ type: "mirror", x: 36, y: 40, rot: MIRROR, length: 26 }]
    },
    {
      id: "breath-green", wing: 2, name: "揺れても翠",
      hint: "折ったあとの筋に、翠の硝子を横切らせる。月が揺れても色は残る。",
      letter: "揺れても、色は変えない。\n翠は、そのままで待っている。",
      from: "翠の花",
      w: 96, h: 64,
      source: { x: 12, y: 46, a: 0, sweep: 0.08 },
      walls: [],
      plants: [{ x: 40, y: 14, r: 8, need: "g" }],
      inventory: [{ type: "mirror", length: 26 }, { type: "dye", mask: G, length: 20 }],
      fixed: [],
      solution: [
        { type: "mirror", x: 40, y: 46, rot: MIRROR, length: 26 },
        { type: "dye", mask: G, x: 40, y: 28, rot: Math.PI / 2, length: 20 }
      ]
    },
    {
      id: "last-letter", wing: 2, name: "閉園の手紙",
      hint: "壁の上を回る。二枚の鏡で、息をしている月を金の花まで連れていく。",
      letter: "前の番人へ。\n温室は、まだ花を覚えていた。\nあなたの番は、ここで終わりでいい。",
      from: "最後の花",
      w: 96, h: 72,
      source: { x: 10, y: 54, a: 0, sweep: 0.06 },
      walls: [{ x1: 50, y1: 28, x2: 50, y2: 68 }],
      plants: [{ x: 76, y: 16, r: 8, need: "gold" }],
      inventory: [{ type: "mirror", length: 26 }, { type: "mirror", length: 26 }],
      fixed: [],
      solution: [
        { type: "mirror", x: 26, y: 54, rot: MIRROR, length: 26 },
        { type: "mirror", x: 26, y: 16, rot: MIRROR, length: 26 }
      ]
    }
  ];

  return { wings: wings, levels: levels, R: R, G: G, B: B };
});
