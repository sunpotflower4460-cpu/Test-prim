"use strict";
/* ECHO — きろくの協力者 レベルデータ
   rows の記号: . 床 / # 壁 / @ スタート / G ゴール / D ドア / 1-4 プレート
   solution は各周の手順（U上下 L左 R右 W待つ）。周の数がそのままクリア周回になる。 */
(function (root) {
  const U = "up", D = "down", L = "left", R = "right", W = "wait";
  const levels = [
    {
      id: 1, name: "めざめ", en: "AWAKENING", chapter: 0,
      hint: "1ターンに 1マスずつ。ゴール（白い門）を めざそう",
      note: "時間は、あなたが動いた分だけ進む。",
      loop: 8, maxLoops: 3, par: 1,
      rows: [
        "#######",
        "#@....#",
        "#.###.#",
        "#....G#",
        "#######"
      ],
      doors: [],
      solution: [[R, R, R, R, D, D]]
    },
    {
      id: 2, name: "かど", en: "TURNING", chapter: 0,
      hint: "壁の内がわを まわって、右下の門へ。まわりみちも 近道",
      note: "同じ道は、二度はない。でも、何度でも歩ける。",
      loop: 12, maxLoops: 3, par: 1,
      rows: [
        "#########",
        "#@......#",
        "#.#####.#",
        "#.......#",
        "#.#####.#",
        "#......G#",
        "#########"
      ],
      doors: [],
      solution: [[R, R, R, R, R, R, D, D, D, D]]
    },
    {
      id: 3, name: "はじめてのこだま", en: "FIRST ECHO", chapter: 1,
      hint: "ターンが 0になると 時間は 巻きもどる。1周目の あなたが エコーになる",
      note: "プレートの 上で まちつづけると、つぎの周の あなたが そこに 立っている。",
      loop: 12, maxLoops: 4, par: 2,
      rows: [
        "#########",
        "#@......#",
        "#..###..#",
        "#..#G#..#",
        "#..#D#..#",
        "#.......#",
        "#..1....#",
        "#########"
      ],
      doors: [{ x: 4, y: 4, needs: [1] }],
      solution: [
        [D, D, D, D, D, R, R, W, W, W, W, W],
        [D, D, D, D, R, R, R, U, U]
      ]
    },
    {
      id: 4, name: "ふたつのあかり", en: "TWO LIGHTS", chapter: 1,
      hint: "ドアは ふたつの プレートが 同時に おされている間だけ ひらく",
      note: "エコーは ふたりまで。1周ずつ、役わりを まかせよう。",
      loop: 12, maxLoops: 4, par: 3,
      rows: [
        "#########",
        "#@......#",
        "#..###..#",
        "#..#G#.2#",
        "#..#D#..#",
        "#.......#",
        "#..1....#",
        "#########"
      ],
      doors: [{ x: 4, y: 4, needs: [1, 2] }],
      solution: [
        [D, D, D, D, D, R, R, W, W, W, W, W],
        [R, R, R, R, R, R, D, D, W, W, W, W],
        [D, D, D, D, R, R, R, W, U, U]
      ]
    },
    {
      id: 5, name: "とおい扉", en: "THE FAR DOOR", chapter: 1,
      hint: "下の まわりみちは 長い。エコーには プレートを まもってもらおう",
      note: "遠回りを えらべるのは、急がなくて いいから。",
      loop: 14, maxLoops: 3, par: 2,
      rows: [
        "#########",
        "#@......#",
        "#.......#",
        "#...1...#",
        "#.......#",
        "#..###..#",
        "#..#G#..#",
        "#..#D#..#",
        "#.......#",
        "#########"
      ],
      doors: [{ x: 4, y: 7, needs: [1] }],
      solution: [
        [D, D, R, R, R, W, W, W, W, W, W, W, W, W],
        [D, D, D, D, D, D, D, R, R, R, U, U]
      ]
    },
    {
      id: 6, name: "ひらく しゅんかん", en: "THE WINDOW", chapter: 1,
      hint: "エコーは とおりすぎる だけ。扉が ひらく 一瞬を ねらおう",
      note: "プレートを ふむ 音が したら、それが 合図。",
      loop: 12, maxLoops: 4, par: 2,
      rows: [
        "#########",
        "#...G...#",
        "#...D...#",
        "#@......#",
        "#.......#",
        "#..1....#",
        "#.......#",
        "#########"
      ],
      doors: [{ x: 4, y: 2, needs: [1] }],
      solution: [
        [R, R, D, D, D, W, W, W, W, W, W, W],
        [R, R, R, W, U, U]
      ]
    },
    {
      id: 7, name: "ふたはしら", en: "TWO PILLARS", chapter: 2,
      hint: "エコーは かげ。重なっても ぶつからない。おそれずに すすもう",
      note: "過去の自分は あなたを とめない。だから、前へ すすめる。",
      loop: 14, maxLoops: 4, par: 3,
      rows: [
        "#########",
        "#@......#",
        "#.#####.#",
        "#.......#",
        "#.#####.#",
        "#..1....#",
        "#.......#",
        "#..2...D#",
        "#......G#",
        "#########"
      ],
      doors: [{ x: 7, y: 7, needs: [1, 2] }],
      solution: [
        [D, D, D, D, R, R, W, W, W, W, W, W, W, W],
        [D, D, D, D, D, D, R, R, W, W, W, W, W, W],
        [R, R, R, R, R, R, D, D, D, D, D, D, D]
      ]
    },
    {
      id: 8, name: "みっつの あかり", en: "THREE LIGHTS", chapter: 2,
      hint: "プレートが 三つ。エコーを 三人まで ふやして、同時に ひかりを ともそう",
      note: "手順は ちがっても、同じ場所で 待てば いい。",
      loop: 16, maxLoops: 5, par: 4,
      rows: [
        "#########",
        "#@......#",
        "#..###..#",
        "#..#G#..#",
        "#..#D#..#",
        "#.......#",
        "#.1.2.3.#",
        "#########"
      ],
      doors: [{ x: 4, y: 4, needs: [1, 2, 3] }],
      solution: [
        [D, D, D, D, D, R, W, W, W, W, W, W, W, W, W, W],
        [D, D, D, D, D, R, R, R, W, W, W, W, W, W, W, W],
        [D, D, D, D, D, R, R, R, R, R, W, W, W, W, W, W],
        [D, D, D, D, R, R, R, W, W, W, W, U, U]
      ]
    },
    {
      id: 9, name: "かがみの まど", en: "MIRRORED WINDOW", chapter: 2,
      hint: "扉は にまい。ひらく じゅんばんを かんがえよう",
      note: "プレートを ふんでいる間だけ、扉は ひらいたまま。",
      loop: 12, maxLoops: 4, par: 3,
      rows: [
        "#########",
        "#...1...#",
        "#...D...#",
        "#@......#",
        "#.....2.#",
        "#...D...#",
        "#...G...#",
        "#########"
      ],
      doors: [{ x: 4, y: 2, needs: [1] }, { x: 4, y: 5, needs: [1, 2] }],
      solution: [
        [U, U, R, R, R, W, W, W, W, W, W, W],
        [R, R, R, R, R, D, W, W, W, W, W, W],
        [R, R, R, W, W, W, D, D, D]
      ]
    },
    {
      id: 10, name: "みっつの扉", en: "THREE DOORS", chapter: 2,
      hint: "扉の むこうに つぎの プレート。一まいずつ ひらいていこう",
      note: "扉の おくの ひかりを、つぎの 周の あなたに たくす。",
      loop: 12, maxLoops: 5, par: 4,
      rows: [
        "#########",
        "#@..1...#",
        "#...D...#",
        "#...2...#",
        "#...D...#",
        "#...3...#",
        "#...D...#",
        "#...G...#",
        "#########"
      ],
      doors: [
        { x: 4, y: 2, needs: [1] },
        { x: 4, y: 4, needs: [1, 2] },
        { x: 4, y: 6, needs: [1, 2, 3] }
      ],
      solution: [
        [R, R, R, W, W, W, W, W, W, W, W, W],
        [R, R, R, D, D, W, W, W, W, W, W, W],
        [R, R, R, D, D, D, D, W, W, W, W, W],
        [R, R, R, D, D, D, D, W, D, D]
      ]
    }
  ];
  if (typeof module === "object" && module.exports) module.exports = levels;
  else root.EchoLevels = levels;
})(typeof self !== "undefined" ? self : globalThis);
