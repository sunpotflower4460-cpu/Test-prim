// Word bank and 宿 (inn) stations for 句ゆき.
// Every word is kana only, so its mora count comes from KuSim.moraCount.
// s: season of a 季語 ('春','夏','秋','冬'), or null for 無季.
// kire: true marks a 切れ字.
(function () {
  "use strict";

  // 季語 checked against a standard saijiki. Ambiguous or purely 無季 words are left out
  // (つゆ is either 梅雨 or 露; ひざし and あめ are 無季 on their own).
  // ひぐらし (蜩) is 秋, not 夏.
  const SPRING = ["はる", "はな", "さくら", "はるかぜ", "かすみ", "おぼろ", "うぐいす", "かわず", "ちょう",
    "つばめ", "ひばり", "つくし", "なのはな", "ふじ", "すみれ", "のどか", "はなみ", "やなぎ", "ふきのとう"];
  const SUMMER = ["なつ", "せみ", "ほたる", "あおば", "ゆうだち", "さみだれ", "すいか", "ふうりん", "ひまわり",
    "ゆかた", "すずし", "あつさ", "ほととぎす", "ところてん", "うちわ", "かや", "にじ", "ゆうがお", "みずあび", "なつくさ"];
  const AUTUMN = ["あき", "つき", "もみじ", "かり", "とんぼ", "いね", "こおろぎ", "すすき", "きく", "くり", "かき",
    "きのこ", "もず", "あきかぜ", "ながつき", "しらつゆ", "はぎ", "すずむし", "ひぐらし", "きりぎりす", "あきさめ"];
  const WINTER = ["ふゆ", "ゆき", "はつゆき", "こがらし", "たきび", "こたつ", "しも", "しもばしら", "さむさ",
    "ゆきだるま", "ふぐ", "みかん", "ゆず", "くじら", "はくちょう", "しもやけ", "おちば", "はつしも"];
  const MUKI = ["みち", "かげ", "こえ", "そら", "ふね", "とり", "まど", "ひかり", "こころ", "あし", "ひと", "たび",
    "いえ", "くも", "みず", "のき", "かさ", "つえ", "あめ", "うみ", "かぜ", "やま", "かわ", "いし", "はし", "ふる",
    "まつ", "こけ", "むら", "さと", "ゆうべ", "あさ", "よる", "ひる", "おと", "いろ", "なみ", "いけ", "てら", "ねこ",
    "いぬ", "うま", "にわ", "ひ", "め", "て", "き", "そで", "ゆめ", "うた", "ふみ", "ひとり", "いと", "たに", "かま"];
  const KIRE = ["や", "かな", "けり"];

  const bank = []
    .concat(SPRING.map(w => ({ w: w, s: "春" })))
    .concat(SUMMER.map(w => ({ w: w, s: "夏" })))
    .concat(AUTUMN.map(w => ({ w: w, s: "秋" })))
    .concat(WINTER.map(w => ({ w: w, s: "冬" })))
    .concat(MUKI.map(w => ({ w: w, s: null })))
    .concat(KIRE.map(w => ({ w: w, s: null, kire: true })));

  // Eight 宿 in order. season is the 題's requirement (null accepts any season).
  // scene is the season the road is painted in while this 宿 is the frontier.
  const stations = [
    {
      season: "春", scene: "春", theme: "花", inn: "霞の宿", host: "宿の主",
      ask: ["霞の宿へようこそ。春のさかりでございます。", "花の句を一つ、この宿の灯のもとで。"],
      farewell: "よい旅を。花はいつか散りますが、句は残ります。"
    },
    {
      season: "春", scene: "春", theme: "蛙", inn: "田の宿", host: "宿の主",
      ask: ["田の水もぬるんで、蛙の声がきこえはじめました。", "蛙の句を、一つお聞かせください。"],
      farewell: "その声を忘れずに、北へお進みなさい。"
    },
    {
      season: "夏", scene: "夏", theme: "夕立", inn: "風鈴の宿", host: "宿の主",
      ask: ["風鈴だけが鳴っております。雲の色が変わりました。", "夕立の句を、どうぞ。"],
      farewell: "雨のあとは、道がいっそう青く見えましょう。"
    },
    {
      season: "夏", scene: "夏", theme: "蛍", inn: "川原の宿", host: "宿の主",
      ask: ["川原に蛍が出はじめました。宵のあかりです。", "蛍の句を一つ、川の音とともに。"],
      farewell: "蛍は一夜の灯。句に残せば、夜が長くなります。"
    },
    {
      season: "秋", scene: "秋", theme: "月", inn: "紅葉の宿", host: "宿の主",
      ask: ["もみじの山の上に、月が昇りました。", "月の句を、お願いできますか。"],
      farewell: "月は旅人を照らし、句は道を照らします。"
    },
    {
      season: "秋", scene: "秋", theme: "稲", inn: "里の宿", host: "旅の僧",
      ask: ["稲穂が重くなりました。里の人は皆、田に出ております。", "稲の句をいただけましょうか。"],
      farewell: "実りの句は、冬の火のそばで読み返すとよいものです。"
    },
    {
      season: "冬", scene: "冬", theme: "雪", inn: "たき火の宿", host: "宿の主",
      ask: ["雪が降りはじめ、たき火が赤くなりました。", "雪の句を一つ、火にあたりながら。"],
      farewell: "雪は静かに道を消し、句だけを残します。"
    },
    {
      season: null, scene: "冬", theme: "旅", inn: "峠の茶屋", host: "旅の僧",
      ask: ["ここは峠でございます。季は、どれでも構いません。", "旅の句を、ひとつどうぞ。"],
      farewell: "句集は、あなたの旅の道しるべになりましょう。"
    }
  ];

  const API = {
    bank: bank,
    stations: stations,
    seasons: ["春", "夏", "秋", "冬"]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.KuWords = API;
})();
