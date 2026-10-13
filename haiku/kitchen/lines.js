/* Dialogue lines for おばちゃんの台所. Plain data in UMD style.
 * Auntie (ちよおばちゃん) speaks warmly and never scolds. The family reacts when a dish is served.
 * Lines are picked with a seeded index, so a given moment always reads the same. */
(function () {
  "use strict";

  var LINES = {
    auntie: {
      title: ["いらっしゃい、よく来たわね。さあ、いっしょにごはんをつくりましょう"],
      start: [
        "ようこそ。まずは、今日のお品書きから選んでちょうだい",
        "エプロン、貸すわね。手は、あとで洗えばいいのよ"
      ],
      walk: ["ゆっくりでいいのよ。台所は逃げないから"],
      idle: [
        "迷ったら、ノートを開いてみてね",
        "焦らなくていいのよ。ちょっとずつね",
        "そうそう、その調子よ"
      ],
      refuse: {
        "hand-full": "手に持っているものを、先に置いてね",
        "hand-empty": "まずは材料を持ってきてね",
        "wrong-item": "それは、ここじゃないわね",
        "no-vessel": "鍋かフライパンを、先にコンロへね",
        "no-counter": "まずは作業台に、お皿かボウルを置いてね",
        "not-ready": "まだ待ってね。もうちょっとよ",
        "locked": "ちょっと、前の手順が先よ",
        "occupied": "そこは、もう使ってるわ",
        "enough": "もう十分よ。ちょっとずつね",
        "not-here": "それは、ここに置かないのよ",
        "done": "それは、もう済んだわよ",
        "busy": "今はそのまま、押さえていてね",
        "wrong-place": "そこじゃないみたい",
        "nothing": ""
      },
      nice: ["上手ね！", "いい手つきよ", "さすがね"],
      good: ["いい感じ", "そうそう"],
      miss: ["あら、ちょっとずれたわ。もう一度ね", "もう少し、緑のところよ"],
      shell: ["殻が入っちゃったわ。ご愛嬌よ"],
      burnt: ["焦げちゃった。でもこれはこれで香ばしいわね"],
      layerSet: ["そろそろ、巻けそうよ"],
      sizzle: ["ほら、いい音がしてきたわ"],
      bubbles: ["ぽこぽこしてきたわね", "いい具合よ"],
      help: ["おばちゃんがやるわね。見ててね", "あらあら、ここはおばちゃんにまかせて", "ほいほい、やっちゃうわね"],
      stepDone: {
        fill: "たっぷりね",
        heat_on: "火をつけたわよ",
        add_miso: "お味噌ね。ほら、いい香り",
        dissolve: "ふわっと溶けてきたわ",
        ladle: "はい、よそったわよ",
        pour_dashi: "出汁をたっぷりね",
        heat_low: "弱火でじっくりね",
        lid_on: "ふたをして、味をしみこませるわ",
        simmer: "いい香りがしてきたわね",
        wash: "ぴかぴかね",
        lift: "きれいに巻けたわ",
        shape: "ふんわりにぎれたわ"
      },
      // Short words shown on each timed press (chop, crack).
      grade: { nice: "ぴったり！", good: "おしい", miss: "もうすこし" },
      // Shown at each third of a stir or beat.
      stir: ["いい感じ", "その調子", "もうひと息"],
      // Two lines the first time a recipe is started. Never repeated after that.
      firstTip: {
        miso: ["まずは、棚から鍋を出してね。", "鍋を持ったら、シンクで「する」を長押しして、お水をためるのよ。"],
        tamago: ["まずは、棚からボウルを出して、作業台に置いてね。", "卵は冷蔵庫から3つ。光ったところで「する」で割りましょう。"],
        niku: ["まずは、棚から鍋を出して、コンロにのせましょう。", "火をつけたら、牛肉を入れて、鍋の中でぐるぐる炒めるのよ。"],
        onigiri: ["まずは、お塩の台で「する」を押して、手に塩をつけましょう。", "そのあと、炊飯器からご飯をゆっくり引き出して、にぎるのよ。"]
      },
      tasteOk: "ちょうどいいわ",
      tasteSweetHigh: "少し、あまめね",
      tasteSweetLow: "もうちょっと、甘くしてもいいかも",
      tasteSaltHigh: "しょっぱいかも。次はちょっとだけね",
      tasteSaltLow: "うすいかしら。醤油を足してみてね",
      tasteNone: "まだ味がしないわ。砂糖や醤油を入れてね",
      finished: ["できあがり！ 今日もおいしくできたわね"],
      unlock: "レシピカードができたわよ。ノートに、しまっておくわね",
      harvest: ["いいのが採れたわね", "新鮮ね。おいしいわよ"],
      cat: "にゃあ"
    },
    family: {
      uncle: {
        reactServe: ["おっ、いい匂いだなあ", "ちよ、いいね。ありがたい", "待ってました"],
        reactFinish: ["うまい。やっぱり、ちよの味だな"],
        hum: "ふん、ふふん"
      },
      misaki: {
        reactServe: ["わーい！ おなかすいた！", "いただきまーす！", "これ、だいすき！"],
        reactFinish: ["おかわり、ある？"]
      }
    }
  };

  var API = { LINES: LINES, pick: pick };

  // Pick a line from a list by index. Deterministic when given the same index.
  function pick(list, index) {
    if (!list || !list.length) return "";
    var i = Math.abs(index | 0) % list.length;
    return list[i];
  }

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.ObachanLines = API;
})();
