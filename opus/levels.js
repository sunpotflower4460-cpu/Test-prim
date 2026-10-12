/* MIZUHO — 瑞穂 / the valleys.
   Each stage is a height field written as a function of the cell, plus the
   springs, houses and weather of its year. North (y = 0) is uphill. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MizuhoLevels = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const inRect = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
  const ring = (x, y, r) => inRect(x, y, r) && (x === r[0] || x === r[2] || y === r[1] || y === r[3]);

  const LEVELS = [
    {
      id: "ichimai", no: 1, name: "一枚目", kana: "いちまいめ",
      poem: ["畦が、ひとところ崩れている。", "水は、そこから逃げていく。"],
      brief: "崩れた畦を盛って、古い田に水を張る。",
      w: 40, h: 40, seed: 11, goal: 6, stars: [8, 10],
      basket: 14, cap: 120,
      tools: ["heap", "dig"],
      springs: [{ x: 20, y: 3, rate: 1.25 }],
      houses: [{ x: 32, y: 22, w: 4, h: 3 }],
      edges: { s: true, e: true, w: true },
      rain: { rainy: 0.0026 },
      settle: 0,
      terrain(x, y, n) {
        const slope = 3 + (39 - y) * 0.16 + n.fbm(x * 0.09, y * 0.09, 4) * 1.1;
        // the brook: a shallow runnel from the spring down to the old field
        const meander = 20 + Math.sin(y * 0.42) * 1.6;
        const runnel = y >= 3 && y <= 19 ? 0.45 * Math.exp(-((x - meander) ** 2) / 1.6) : 0;
        const field = [13, 20, 27, 27], floor = 3 + 11 * 0.16 + 0.15;
        if (inRect(x, y, field)) {
          if (ring(x, y, field)) {
            const gap = y === 27 && x >= 19 && x <= 21;
            return { ground: floor + (gap ? 0.02 : 0.36), bed: floor - 2 };
          }
          return { ground: floor, bed: floor - 2.2 };
        }
        // the old stone wall above the field
        if (x >= 12 && x <= 28 && (y === 18 || y === 19)) {
          const g = Math.max(floor + 0.36, slope - runnel - (y === 19 ? 0.6 : 0));
          return { ground: g, bed: g, rock: true };
        }
        return { ground: slope - runnel, bed: slope - runnel - 2.6 };
      },
      letter: { text: "この田は、おじいさんと最後に植えた田です。<br>畦が崩れて水が逃げるたびに、もう戻らないと思っていました。<br>今年の稲の匂いは、あの年と同じです。", from: "祖母 ハル" },
      hints: [
        { at: "start", text: "崩れた畦（光る印）を、指でなぞって「盛る」。" },
        { at: "suitable", text: "水が張った所に、苗が植わる。「田植え」で一年がはじまる。" }
      ],
      marks: [{ x: 20, y: 27, r: 2 }]
    },
    {
      id: "dan", no: 2, name: "段", kana: "だん",
      poem: ["斜面に、水は止まらない。", "平らな段をつくれば、水は休む。"],
      brief: "「均す」で斜面に平らな段を削り出し、縁に畦を盛る。",
      w: 44, h: 44, seed: 23, goal: 6, stars: [9, 12],
      basket: 160, cap: 240,
      tools: ["level", "heap", "dig"],
      springs: [{ x: 22, y: 3, rate: 1.3 }],
      houses: [{ x: 4, y: 36, w: 4, h: 3 }],
      edges: { s: true, e: true, w: true },
      rain: { rainy: 0.0026 },
      terrain(x, y, n) {
        const meander = 22 + Math.sin(y * 0.3) * 2.2 + n.noise(y * 0.1, 3.3) * 3;
        const runnel = 0.5 * Math.exp(-((x - meander) ** 2) / 2.2);
        const g = 3 + (43 - y) * 0.3 + n.fbm(x * 0.07, y * 0.07, 4) * 1.4 - runnel;
        return { ground: g, bed: g - 3 };
      },
      letter: { text: "斜面に段ができると、水がそこで止まって空を映します。<br>昔の人は、それを「田毎の月」と呼びました。<br>秋の夜に、見に来てください。", from: "隣の家の タキ" },
      hints: [
        { at: "start", text: "「均す」：なぞり始めた高さに、まわりの土を揃える。流れのそばを横になぞってみよう。" },
        { at: "suitable", text: "段の縁が低いと、水は流れ落ちる。<b>盛る</b>で縁に畦をつくろう。" }
      ]
    }
,
    {
      id: "tanada", no: 3, name: "棚田", kana: "たなだ",
      poem: ["上の田であふれた水は、", "下の田を満たす。"],
      brief: "段を重ね、上の田からあふれる水で下の田を満たす。",
      w: 48, h: 56, seed: 37, goal: 14, stars: [18, 22],
      basket: 120, cap: 260,
      springs: [{ x: 24, y: 3, rate: 1.6 }],
      houses: [{ x: 39, y: 47, w: 4, h: 3, rot: 0.1 }, { x: 4, y: 49, w: 3, h: 3, rot: -0.2 }],
      edges: { s: true, e: true, w: true },
      rain: { rainy: 0.003 },
      terrain(x, y, n) {
        const meander = 24 + Math.sin(y * 0.22) * 3 + n.noise(y * 0.08, 7.7) * 4;
        const runnel = 0.55 * Math.exp(-((x - meander) ** 2) / 2.4);
        const shoulder = 1.6 * Math.exp(-(((x - 24) / 26) ** 2)) ;
        const g = 2 + (55 - y) * 0.42 - shoulder * 0 + n.fbm(x * 0.06, y * 0.06, 4) * 1.8 - runnel + Math.abs(x - 24) * 0.04;
        return { ground: g, bed: g - 3.2 };
      },
      letter: { text: "うえの田んぼから、したの田んぼに水がおちる音が、<br>夜ずっときこえます。カエルがたくさんいます。<br>ぼくは二十ぴき、かぞえました。", from: "湊（みなと）七さい" },
      hints: [
        { at: "start", text: "上の段からあふれる水は、下の段へ落ちる。段を重ねて、一筋の水をすべての田に通そう。" },
        { at: "suitable", text: "畦の一か所を<b>掘る</b>で軽く欠くと、そこが水口になる。水の出口を、下の田の上に。" }
      ]
    }
,
    {
      id: "tsuyu", no: 4, name: "梅雨", kana: "つゆ",
      poem: ["谷の底に、三つの家。", "長雨は、低い所へ集まる。"],
      brief: "梅雨の雨は谷の底に集まる。家が浸かる前に、水の逃げ道を掘っておく。",
      w: 56, h: 52, seed: 41, goal: 8, stars: [11, 14],
      basket: 140, cap: 300,
      springs: [{ x: 28, y: 3, rate: 1.4 }],
      houses: [{ x: 17, y: 37, w: 3, h: 3, rot: 0.15 }, { x: 24, y: 36, w: 4, h: 3 }, { x: 33, y: 35, w: 3, h: 3, rot: -0.2 }],
      edges: { s: true, e: true, w: true },
      rain: { rainy: 0.0075, summer: 0.0004 },
      terrain(x, y, n) {
        const north = (51 - y) * 0.27;
        const side = ((x - 28) / 28) ** 2 * 7;
        const ridge = y > 41 ? (y - 41) * 0.55 : 0;
        const notch = ridge * 0.92 * Math.exp(-((x - 37) ** 2) / 0.8);
        const meander = 28 + Math.sin(y * 0.25) * 3;
        const runnel = y < 33 ? 0.5 * Math.exp(-((x - meander) ** 2) / 2.2) : 0;
        const g = 2 + north + side + ridge - notch + n.fbm(x * 0.07, y * 0.07, 4) * 1.1 - runnel;
        return { ground: g, bed: g - 3 };
      },
      letter: { text: "長雨の夜、家の前を水が音を立てて通りすぎていきました。<br>あなたが掘った溝です。<br>三軒とも、畳が乾いています。", from: "谷の底の三軒より" },
      hints: [
        { at: "start", text: "谷の底には家がある。梅雨の雨は、まわりの斜面からここへ集まってくる。" },
        { at: "rainy", text: "梅雨。家の近くの水かさを見て、南の尾根へ<b>掘って</b>水を逃がそう。" }
      ]
    }
,
    {
      id: "ishigaki", no: 5, name: "石垣", kana: "いしがき",
      poem: ["岩がちの斜面には、", "田を埋める土が足りない。"],
      brief: "斜面の土は薄い。谷の下の扇状地を掘って、籠に土を集めてから段を築く。",
      w: 52, h: 56, seed: 53, goal: 10, stars: [13, 16],
      basket: 0, cap: 320,
      springs: [{ x: 27, y: 3, rate: 1.5 }],
      houses: [{ x: 40, y: 46, w: 4, h: 3, rot: -0.1 }],
      edges: { s: true, e: true, w: true },
      rain: { rainy: 0.0028 },
      terrain(x, y, n) {
        const meander = 27 + Math.sin(y * 0.2 + 1) * 2.5 + n.noise(y * 0.09, 2.1) * 3;
        const runnel = 0.45 * Math.exp(-((x - meander) ** 2) / 2.2);
        let g = 2 + (55 - y) * 0.44 + n.fbm(x * 0.07, y * 0.07, 4) * 1.6 - runnel + Math.abs(x - 26) * 0.03;
        // the alluvial fan: deep, soft soil spread at the foot of the west slope
        const fan = Math.exp(-(((x - 8) / 9) ** 2 + ((y - 47) / 9) ** 2));
        // granite boulders break through the thin soil
        const b = n.noise(x * 0.23 + 40, y * 0.23 + 9);
        const boulder = b > 0.21 && fan < 0.3 ? (b - 0.21) * 6 : 0;
        if (boulder > 0) { g += boulder; return { ground: g, bed: g, rock: true }; }
        const soil = 0.35 + fan * 4.2;
        return { ground: g + fan * 0.6, bed: g + fan * 0.6 - soil };
      },
      letter: { text: "土は運べば減る。だから昔は、一籠ずつ大事に積んだ。<br>岩の上に、よく土を載せたな。<br>石の間に根が張れば、もう崩れん。", from: "石工 源蔵" },
      hints: [
        { at: "start", text: "この斜面の土は薄く、岩はびくともしない。左下の扇状地は土が深い。<b>掘って</b>籠を満たそう。" },
        { at: "suitable", text: "籠の土で、段の低い側を埋めていく。" }
      ]
    },
    {
      id: "one", no: 6, name: "尾根越え", kana: "おねごえ",
      poem: ["泉は、尾根の向こう側。", "なだらかな畑は、こちら側。"],
      brief: "西の谷の水を、尾根の鞍部を掘り抜いて東の斜面へ引く。",
      w: 60, h: 52, seed: 67, goal: 14, stars: [20, 26],
      basket: 170, cap: 320,
      springs: [{ x: 12, y: 3, rate: 1.9 }],
      houses: [{ x: 48, y: 43, w: 4, h: 3, rot: 0.2 }, { x: 40, y: 46, w: 3, h: 3 }],
      edges: { s: true, e: true, w: true },
      rain: { rainy: 0.003, summer: 0.0002 },
      terrain(x, y, n) {
        // west: a steep, rocky ravine; east: a broad gentle slope
        const ridgeX = 24 + n.noise(y * 0.07, 5.5) * 3;
        const ridgeH = 3.4 * Math.exp(-((x - ridgeX) ** 2) / 14) * (1 - 0.86 * Math.exp(-((y - 14) ** 2) / 12));
        const ravine = x < ridgeX ? 1.4 * Math.exp(-((x - 12) ** 2) / 18) : 0;
        const slopeW = (51 - y) * 0.5, slopeE = (51 - y) * 0.27 + 1.6;
        const k = 1 / (1 + Math.exp(-(x - ridgeX) * 0.9));
        const base = slopeW * (1 - k) + slopeE * k;
        const g = 2 + base + ridgeH - ravine + n.fbm(x * 0.07, y * 0.07, 4) * 1.2;
        const rocky = x < ridgeX - 3 && Math.abs(y - 13) > 4 && n.noise(x * 0.3, y * 0.3) > 0.05;
        return rocky ? { ground: g + 0.3, bed: g + 0.3, rock: true } : { ground: g, bed: g - 3 };
      },
      letter: { text: "尾根の向こうの水がこちらに来たのは、祖父の代以来です。<br>夕方、水口の音が聞こえると、<br>みんな外に出てきて、黙って聞いています。", from: "東の斜面 佐和" },
      hints: [
        { at: "start", text: "泉の水は西の谷を流れ落ちていく。尾根の低いところ（鞍部）を<b>掘り抜けば</b>、水は東へ回る。" }
      ],
      marks: [{ x: 24, y: 14, r: 2.5 }]
    },
    {
      id: "hideri", no: 7, name: "日照り", kana: "ひでり",
      poem: ["夏、泉は細くなる。", "春の水を、ため池に貯えておく。"],
      brief: "崩れたため池の堤を盛って春の水を貯える。夏の日照りには堤を少しずつ掘って、田へ水を落とす。",
      w: 56, h: 60, seed: 71, goal: 15, stars: [18, 22],
      basket: 150, cap: 320,
      springs: [{ x: 28, y: 3, rate: 2.6, drought: 0.06 }],
      houses: [{ x: 6, y: 51, w: 4, h: 3, rot: 0.1 }],
      edges: { s: true, e: true, w: true },
      evap: 0.0065, heat: 1.6,
      rain: { rainy: 0.0022 },
      terrain(x, y, n) {
        const slope = 2 + (59 - y) * 0.36;
        const DAM = 2 + (59 - 19) * 0.36 + 1.25;
        // the old reservoir: a deep hollow below the spring, walled by a stone bank
        const bowl = 2.8 * Math.exp(-(((x - 28) / 8.5) ** 2 + ((y - 12.5) / 4.6) ** 2));
        const g = slope + n.fbm(x * 0.06, y * 0.06, 4) * 1.2 - bowl;
        const dx = Math.abs(x - 28);
        const bank = (y >= 18 && y <= 19 && dx <= 10) || (dx >= 9 && dx <= 10 && y >= 9 && y <= 19);
        if (bank) {
          // the breach: a stone sill a full step below the bank; its earth plug washed away
          if ((y === 18 || y === 19) && dx <= 1) return { ground: DAM - 1.6, bed: DAM - 1.6, rock: true };
          // the spillway: a fixed stone lip that lets the full pond overflow toward the fields
          if ((y === 18 || y === 19) && (x === 34 || x === 35)) return { ground: DAM, bed: DAM, rock: true };
          const top = Math.max(g, DAM + 0.5);
          return { ground: top, bed: top, rock: true };
        }
        const meander = 28 + Math.sin(y * 0.18) * 2.5;
        const runnel = y > 19 ? 0.45 * Math.exp(-((x - meander) ** 2) / 2.2) : 0;
        // last winter's water still stands in the reservoir, leaking through the breach
        const stored = dx < 9 && y < 18 && y > 5 ? Math.max(0, DAM - 0.05 - g) : 0;
        return { ground: g - runnel, bed: g - runnel - 3.2, water: stored };
      },
      letter: { text: "日照りの夏に、池の水を少しずつ落とすのは、<br>昔は村の大事な役目でした。焦らず、少しずつ。<br>あなたは、それが上手です。", from: "祖母 ハル" },
      hints: [
        { at: "start", text: "泉の下の石積みは、昔のため池の堤。真ん中の崩れを<b>盛って</b>ふさぎ、春の水を貯めておこう。" },
        { at: "summer", text: "日照り。泉が細った。ため池の堤の土を少しだけ<b>掘って</b>、田へ水を落とそう。" }
      ],
      marks: [{ x: 28, y: 18.5, r: 2 }]
    },
    {
      id: "senmai", no: 8, name: "千枚田", kana: "せんまいだ",
      poem: ["海へ落ちる斜面に、", "千の田を。"],
      brief: "二つの泉、村、梅雨と日照り。海までの斜面いっぱいに、棚田を重ねる。",
      w: 72, h: 84, seed: 89, goal: 32, stars: [42, 52],
      basket: 900, cap: 1000,
      springs: [{ x: 20, y: 3, rate: 1.8, drought: 0.5 }, { x: 52, y: 4, rate: 1.8, drought: 0.5 }],
      houses: [{ x: 60, y: 40, w: 4, h: 3, rot: -0.15 }, { x: 64, y: 46, w: 3, h: 3, rot: 0.1 }, { x: 57, y: 47, w: 3, h: 3 }, { x: 3, y: 68, w: 4, h: 3, rot: 0.2 }],
      edges: { s: false, e: true, w: true },
      seaLevel: 1.2, edgesNote: "the sea takes the water; the shore is not an open edge",
      rain: { rainy: 0.0045 },
      heat: 1.5,
      yaw: 0, pitch: 0.8,
      terrain(x, y, n) {
        const g0 = 2.2 + (77 - y) * 0.36 + n.fbm(x * 0.05, y * 0.05, 5) * 2.2 + Math.abs(x - 36) * 0.025;
        // the village shoulder: a gentle flat on the east side
        const shoulder = Math.exp(-(((x - 61) / 9) ** 2 + ((y - 44) / 7) ** 2));
        let g = g0 * (1 - shoulder * 0.25) + shoulder * 0.0;
        // the shore: a beach falling into the sea
        if (y > 76) { g = Math.min(g, 2.2 - (y - 76) * 0.45 + n.noise(x * 0.2, y * 0.2) * 0.4); }
        if (g < 1.2 && y > 74) return { ground: g, bed: g - 1, sea: true };
        return { ground: g, bed: g - 3 };
      },
      letter: { text: "今年、谷に灯がともりました。<br>海から見ると、田の一枚一枚に月が映って、<br>千の月が並んでいるそうです。来年も、ここで。", from: "瑞穂の村 一同" },
      hints: [
        { at: "start", text: "最後の谷。二つの泉から海まで、水をすべて田に通してから海へ返そう。" }
      ]
    }
  ];

  // The title valley: old terraces that follow the contours of the hill,
  // already farmed. It is a picture, not a puzzle.
  const SHOWCASE = {
    id: "furusato", no: 0, name: "ふるさと", kana: "ふるさと", poem: [], brief: "",
    w: 52, h: 56, seed: 5, goal: 0, stars: [1, 2], basket: 0, cap: 0,
    springs: [{ x: 27, y: 2, rate: 2.2 }],
    houses: [{ x: 8, y: 47, w: 4, h: 3, rot: 0.3 }, { x: 40, y: 49, w: 4, h: 3, rot: -0.2 }, { x: 15, y: 51, w: 3, h: 3, rot: 0.1 }],
    edges: { s: true, e: true, w: true },
    settle: 900,
    terrain(x, y, n) {
      const bend = Math.sin(x * 0.11 + 0.6) * 2.4 + n.noise(x * 0.05, 3) * 3;
      const raw = 2 + (55 - y + bend) * 0.4 + n.fbm(x * 0.05, y * 0.05, 4) * 0.8 + ((x - 27) / 10) ** 2 * 0.35;
      const inside = Math.abs(x - 27) < 17 - (y < 12 ? (12 - y) * 0.9 : 0) && y > 6 && y < 45;
      if (!inside) return { ground: raw + n.fbm(x * 0.13, y * 0.13, 3) * 0.6, bed: raw - 3 };
      const STEP = 1.9;
      const k = Math.floor(raw / STEP), floor = k * STEP;
      // the downhill edge of each paddy carries a low ridge
      const below = 2 + (55 - (y + 1) + bend) * 0.4 + n.fbm(x * 0.05, (y + 1) * 0.05, 4) * 0.8 + ((x - 27) / 10) ** 2 * 0.35;
      const lip = Math.floor(below / STEP) < k ? 0.3 : 0;
      // the riser under a ridge is a dry-stone wall that never slumps
      if (lip) return { ground: floor + lip, bed: floor + lip, rock: true };
      return { ground: floor, bed: floor - 2.5, water: 0.25 };
    }
  };

  function byId(id) { return id === SHOWCASE.id ? SHOWCASE : LEVELS.find(l => l.id === id); }
  return { LEVELS, SHOWCASE, byId, inRect, ring };
});
