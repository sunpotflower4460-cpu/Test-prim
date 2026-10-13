/* Recipe and station data for おばちゃんの台所.
 * Plain data in UMD style. The rules that read it live in sim.js.
 *
 * A step is one thing the player does (or one thing that cooks by itself).
 *   kind     take | place | tap | toggle | chop | crack | drag | hold | season | taste | serve | wait
 *   station  where the step happens (a station id, a list, or "burner" for either burner)
 *   hand     pattern the item in hand must match (null = empty hand, omitted = any)
 *   give     item placed in hand afterwards
 *   into     vessel or counter item the step writes to ("pot", "pan", "plate", "bowl")
 *   needs    step ids that must be finished first (only for steps that run once)
 *   goal     how many runs finish the step (default 1)
 *   when     conditions that must hold on the target before the step can run
 *   until    conditions for a passive wait step
 *   add/set/inc/flag  effects on the target, the world flags
 * Repeating steps (goal > 1) are gated by the hand and conditions, not by their own count.
 */
(function () {
  "use strict";

  var STATIONS = {
    fridge: { name: "冷蔵庫" },
    sink: { name: "シンク" },
    board: { name: "まないた" },
    counter: { name: "作業台" },
    burnerL: { name: "コンロ" },
    burnerR: { name: "コンロ" },
    kettle: { name: "やかん" },
    salt: { name: "お塩" },
    sugar: { name: "砂糖" },
    mirin: { name: "みりん" },
    shoyu: { name: "醤油" },
    oil: { name: "サラダ油" },
    miso: { name: "お味噌" },
    nori: { name: "海苔" },
    ricecooker: { name: "炊飯器" },
    veg_bin: { name: "野菜かご" },
    shelf_pot: { name: "鍋の棚" },
    shelf_pan: { name: "フライパン" },
    shelf_bowl: { name: "ボウルの棚" },
    shelf_plate: { name: "お皿の棚" },
    rack_lid: { name: "ふた立て" },
    drawer_spoon: { name: "スプーンの引き出し" },
    table: { name: "食卓" },
    menu: { name: "お品書き" },
    door: { name: "裏口" }
  };

  var MISO = {
    id: "miso",
    name: "お味噌汁",
    blurb: "ねぎと豆腐の、いつものお味噌汁",
    ingredients: ["豆腐 半丁", "ねぎ 1本", "お味噌 大さじ2", "水 3カップ"],
    profile: null,
    steps: [
      { id: "pot_get", kind: "take", station: "shelf_pot", hand: null, give: { kind: "pot" }, label: "鍋を出す", hint: "棚から鍋を出してね", quiet: true },
      { id: "fill", kind: "hold", station: "sink", hand: { kind: "pot", water: false }, seconds: 2.2, give: { kind: "pot", water: true }, label: "鍋に水をはる", hint: "シンクで押さえて、水をためてね", say: "たっぷりね" },
      { id: "pot_on", kind: "place", station: "burner", hand: { kind: "pot", water: true }, label: "鍋をコンロにのせる", hint: "空いているコンロの前で「する」" },
      { id: "heat_on", kind: "toggle", station: "burner", into: "pot", set: 2, when: { level: 0 }, needs: ["pot_on"], label: "火をつける", hint: "コンロの前で「する」で火がつくわ", say: "火をつけるわね" },
      { id: "small_bubbles", kind: "wait", into: "pot", until: { stage: "small" }, needs: ["heat_on"], label: "ぽこぽこするまで待つ", hint: "小さな泡が出るまで、少し待ちましょう", say: "ぽこぽこしてきたわね" },
      { id: "get_tofu", kind: "take", station: "fridge", hand: null, give: { kind: "tofu" }, label: "豆腐を出す", hint: "冷蔵庫から豆腐を出して", quiet: true },
      { id: "chop_tofu", kind: "chop", station: "board", hand: { kind: "tofu" }, hits: 4, give: { kind: "tofu", cut: true }, label: "豆腐を切る", hint: "緑のところで「する」をトントン", say: "いい音ね" },
      { id: "add_tofu", kind: "tap", station: "burner", into: "pot", hand: { kind: "tofu", cut: true }, add: "tofu", needs: ["pot_on"], label: "豆腐を入れる", hint: "鍋の前で「する」", say: "やわらかくね" },
      { id: "get_negi", kind: "take", station: "fridge", hand: null, give: { kind: "negi" }, label: "ねぎを出す", hint: "ねぎも冷蔵庫に", quiet: true },
      { id: "chop_negi", kind: "chop", station: "board", hand: { kind: "negi" }, hits: 3, give: { kind: "negi", cut: true }, label: "ねぎを切る", hint: "ねぎは小口にトントン", say: "香りがいいわ" },
      { id: "add_negi", kind: "tap", station: "burner", into: "pot", hand: { kind: "negi", cut: true }, add: "negi", needs: ["pot_on"], label: "ねぎを入れる", hint: "鍋の前で「する」" },
      { id: "heat_off", kind: "toggle", station: "burner", into: "pot", set: 0, when: { level: ">0" }, needs: ["small_bubbles", "add_tofu", "add_negi"], label: "火を止める", hint: "火を止めてからお味噌を", say: "ぐつぐつさせないのが、コツなのよ" },
      { id: "get_miso", kind: "take", station: "miso", hand: null, give: { kind: "miso" }, label: "お味噌を出す", hint: "お味噌を取ってきて", quiet: true },
      { id: "add_miso", kind: "tap", station: "burner", into: "pot", hand: { kind: "miso" }, add: "miso", when: { level: 0 }, needs: ["heat_off", "get_miso"], label: "お味噌を入れる", hint: "火を止めた鍋に、お味噌を", say: "お味噌ね" },
      { id: "dissolve", kind: "drag", station: "burner", into: "pot", hand: null, metric: "rot", need: 2.5, set: { dissolved: true }, needs: ["add_miso"], label: "お味噌をとく", hint: "鍋の中で、お玉をぐるぐる", say: "ふわっととけてきたわ" },
      { id: "get_bowl", kind: "take", station: "shelf_bowl", hand: null, give: { kind: "bowl", food: null, eggs: 0, beaten: false }, goal: 2, label: "お椀を出す", hint: "お椀を2つ出してね", quiet: true },
      { id: "ladle", kind: "tap", station: "burner", into: "pot", hand: { kind: "bowl", food: null }, give: { kind: "bowl", food: "miso" }, goal: 2, needs: ["dissolve"], label: "お椀によそう", hint: "お椀を持って、鍋の前で「する」", say: "はい、よそったわよ" },
      { id: "serve", kind: "serve", station: "table", hand: { kind: "bowl", food: "miso" }, goal: 2, needs: ["dissolve"], label: "食卓に出す", hint: "お椀を、テーブルまで運びましょう", say: "はい、どうぞ" }
    ]
  };

  var TAMAGO = {
    id: "tamago",
    name: "卵焼き",
    blurb: "ふわっと巻いた、甘くない卵焼き",
    ingredients: ["卵 3個", "醤油 少々", "サラダ油 少々"],
    profile: null,
    steps: [
      { id: "get_bowl", kind: "take", station: "shelf_bowl", hand: null, give: { kind: "bowl", food: null, eggs: 0, beaten: false }, label: "ボウルを出す", hint: "ボウルを棚から出してね", quiet: true },
      { id: "bowl_on", kind: "place", station: "counter", hand: { kind: "bowl" }, label: "ボウルを置く", hint: "作業台に、ボウルを置いてね" },
      { id: "get_egg", kind: "take", station: "fridge", hand: null, give: { kind: "egg" }, goal: 3, label: "卵を出す", hint: "卵を冷蔵庫から", quiet: true },
      { id: "crack", kind: "crack", station: "counter", hand: { kind: "egg" }, when: { counter: "bowl" }, add: "egg", goal: 3, needs: ["bowl_on"], label: "卵を割る", hint: "光ったところで「する」", say: "ぱかっ" },
      { id: "beat", kind: "drag", station: "counter", hand: null, metric: "dist", need: 180, when: { counter: "bowl", eggs: ">=1" }, set: { beaten: true }, needs: ["crack"], label: "卵をほぐす", hint: "さっさっと、いきおいよく混ぜて", say: "いい感じにほぐれたわ" },
      { id: "get_pan", kind: "take", station: "shelf_pan", hand: null, give: { kind: "pan", oil: false, layer: "none", cook: 0, rolls: 0, burnt: false }, label: "フライパンを出す", hint: "フライパンを棚から", quiet: true },
      { id: "pan_on", kind: "place", station: "burner", hand: { kind: "pan" }, needs: ["get_pan"], label: "フライパンをのせる", hint: "コンロにフライパンをのせて" },
      { id: "oil", kind: "tap", station: "oil", into: "pan", set: { oil: true }, needs: ["pan_on"], label: "油をひく", hint: "油を、ひと回し" },
      { id: "heat_pan", kind: "toggle", station: "burner", into: "pan", set: 2, when: { level: 0 }, needs: ["oil"], label: "火をつける", hint: "中火で、ゆっくり温めましょう" },
      { id: "hot_pan", kind: "wait", into: "pan", until: { stage: "hot" }, needs: ["heat_pan"], label: "油が温まるまで待つ", hint: "じゅっと音がしたら、流し入れて", say: "ほら、いい音" },
      { id: "pour", kind: "tap", station: "burner", into: "pan", hand: { kind: "bowl", beaten: true }, keep: true, when: { layer: "none" }, set: { layer: "raw", cook: 0 }, goal: 2, needs: ["hot_pan", "beat"], label: "卵液を流す", hint: "薄く、薄く流してね", say: "じゅわっ" },
      { id: "roll", kind: "tap", station: "burner", into: "pan", when: { layer: "set" }, set: { layer: "none" }, inc: { rolls: 1 }, goal: 2, needs: ["hot_pan"], after: ["pour"], label: "くるくる巻く", hint: "固まったら、端から巻いて", say: "くるっと" },
      { id: "wash", kind: "tap", station: "sink", hand: { kind: "bowl" }, needs: ["pour"], label: "ボウルを洗う", hint: "シンクでさっと洗いましょう", say: "ぴかぴかね" },
      { id: "lift", kind: "tap", station: "burner", into: "pan", hand: null, when: { rolls: ">=2" }, give: { kind: "tamago" }, needs: ["roll", "wash"], label: "卵焼きを取り出す", hint: "できたら、フライパンから", say: "きれいに巻けたわ" },
      { id: "cut_tamago", kind: "chop", station: "board", hand: { kind: "tamago" }, hits: 3, give: { kind: "tamago", cut: true }, needs: ["lift"], label: "卵焼きを切る", hint: "一口サイズに、トントン" },
      { id: "get_plate", kind: "take", station: "shelf_plate", hand: null, give: { kind: "plate", contents: [] }, needs: ["wash"], label: "お皿を出す", hint: "お皿を棚から", quiet: true },
      { id: "plate_on", kind: "place", station: "counter", hand: { kind: "plate" }, needs: ["get_plate", "wash"], label: "お皿を置く", hint: "作業台にお皿をおいて" },
      { id: "add_tamago", kind: "tap", station: "counter", into: "plate", hand: { kind: "tamago", cut: true }, add: "tamago", needs: ["cut_tamago", "plate_on"], label: "お皿に並べる", hint: "お皿の上に、そっと" },
      { id: "lift_plate", kind: "take", station: "counter", from: "counter", hand: null, when: { counter: "plate" }, needs: ["add_tamago"], label: "お皿を運ぶ", hint: "できたお皿を、食卓へ" },
      { id: "serve", kind: "serve", station: "table", hand: { kind: "plate" }, needs: ["lift_plate"], label: "食卓に出す", hint: "テーブルまで運びましょう", say: "はい、どうぞ" }
    ]
  };

  var NIKU = {
    id: "niku",
    name: "肉じゃが",
    blurb: "ほっくり、甘辛いおうちの肉じゃが",
    ingredients: ["牛薄切り肉 150g", "じゃがいも 2個", "玉ねぎ 1個", "にんじん 1本", "砂糖 大さじ2", "みりん 大さじ1", "醤油 大さじ3", "出汁 2カップ"],
    profile: { sweet: { ideal: 3, tol: 1 }, salt: { ideal: 3, tol: 1 } },
    steps: [
      { id: "get_pot", kind: "take", station: "shelf_pot", hand: null, give: { kind: "pot" }, label: "鍋を出す", hint: "鍋を棚から出してね", quiet: true },
      { id: "pot_on", kind: "place", station: "burner", hand: { kind: "pot" }, needs: ["get_pot"], label: "鍋をコンロにのせる", hint: "コンロの前で「する」" },
      { id: "heat_on", kind: "toggle", station: "burner", into: "pot", set: 2, when: { level: 0 }, needs: ["pot_on"], label: "火をつける", hint: "中火にしましょう", say: "まずは牛肉を炒めるわよ" },
      { id: "get_beef", kind: "take", station: "fridge", hand: null, give: { kind: "beef" }, label: "牛肉を出す", hint: "牛肉を冷蔵庫から", quiet: true },
      { id: "add_beef", kind: "tap", station: "burner", into: "pot", hand: { kind: "beef" }, add: "beef", needs: ["heat_on"], label: "牛肉を入れる", hint: "鍋の前で「する」" },
      { id: "fry_beef", kind: "drag", station: "burner", into: "pot", hand: null, metric: "rot", need: 1.5, needs: ["add_beef"], label: "牛肉を炒める", hint: "鍋の中で、ぐるぐる炒めて", say: "いい香りね" },
      { id: "get_onion", kind: "take", station: "veg_bin", hand: null, give: { kind: "onion" }, label: "玉ねぎを出す", hint: "玉ねぎを野菜かごから", quiet: true },
      { id: "chop_onion", kind: "chop", station: "board", hand: { kind: "onion" }, hits: 4, give: { kind: "onion", cut: true }, label: "玉ねぎを切る", hint: "くし切りにトントン" },
      { id: "add_onion", kind: "tap", station: "burner", into: "pot", hand: { kind: "onion", cut: true }, add: "onion", needs: ["fry_beef"], label: "玉ねぎを入れる", hint: "鍋の前で「する」" },
      { id: "get_carrot", kind: "take", station: "veg_bin", hand: null, give: { kind: "carrot" }, label: "にんじんを出す", hint: "にんじんを、野菜かごから", quiet: true },
      { id: "chop_carrot", kind: "chop", station: "board", hand: { kind: "carrot" }, hits: 4, give: { kind: "carrot", cut: true }, label: "にんじんを切る", hint: "乱切りにしましょう" },
      { id: "add_carrot", kind: "tap", station: "burner", into: "pot", hand: { kind: "carrot", cut: true }, add: "carrot", needs: ["fry_beef"], label: "にんじんを入れる", hint: "鍋の前で「する」" },
      { id: "get_potato", kind: "take", station: "veg_bin", hand: null, give: { kind: "potato" }, goal: 2, label: "じゃがいもを出す", hint: "じゃがいもを2つ", quiet: true },
      { id: "peel_potato", kind: "drag", station: "sink", hand: { kind: "potato", peeled: false }, metric: "dist", need: 110, give: { kind: "potato", peeled: true }, goal: 2, label: "じゃがいもの皮をむく", hint: "シンクで、皮をするする", say: "むきむき" },
      { id: "chop_potato", kind: "chop", station: "board", hand: { kind: "potato", peeled: true, cut: null }, hits: 3, give: { kind: "potato", peeled: true, cut: true }, goal: 2, label: "じゃがいもを切る", hint: "ひと口大に、トントン" },
      { id: "add_potato", kind: "tap", station: "burner", into: "pot", hand: { kind: "potato", cut: true }, add: "potato", goal: 2, needs: ["fry_beef"], label: "じゃがいもを入れる", hint: "鍋の前で「する」", say: "ほっくりしそうね" },
      { id: "pour_dashi", kind: "hold", station: "kettle", into: "pot", hand: null, seconds: 2.4, add: "dashi", set: { water: true }, needs: ["add_onion", "add_carrot", "add_potato"], label: "出汁を注ぐ", hint: "やかんの前で、長押しで注いでね", say: "出汁をたっぷりね" },
      { id: "heat_low", kind: "toggle", station: "burner", into: "pot", set: 1, when: { level: 2 }, needs: ["pour_dashi"], label: "弱火にする", hint: "弱火で、じっくり煮ましょう", say: "弱火でじっくりね" },
      { id: "get_lid", kind: "take", station: "rack_lid", hand: null, give: { kind: "lid" }, label: "ふたを出す", hint: "ふたを、ふた立てから", quiet: true },
      { id: "lid_on", kind: "tap", station: "burner", into: "pot", hand: { kind: "lid" }, set: { lid: true }, needs: ["pour_dashi"], label: "ふたをする", hint: "鍋の前で「する」" },
      { id: "get_spoon", kind: "take", station: "drawer_spoon", hand: null, give: { kind: "spoon" }, label: "スプーンを出す", hint: "味見用のスプーンを", quiet: true },
      { id: "sugar", kind: "season", station: "sugar", into: "pot", name: "sugar", goal: 2, max: 4, needs: ["pour_dashi"], label: "砂糖を入れる", hint: "大さじ2くらいね。ちょっとずつ" },
      { id: "mirin", kind: "season", station: "mirin", into: "pot", name: "mirin", goal: 1, max: 3, needs: ["pour_dashi"], label: "みりんを入れる", hint: "大さじ1くらいで" },
      { id: "shoyu", kind: "season", station: "shoyu", into: "pot", name: "shoyu", goal: 3, max: 5, needs: ["pour_dashi"], label: "醤油を入れる", hint: "大さじ3くらい。ちょっとずつね", say: "醤油は、ちょっとずつね" },
      { id: "taste", kind: "taste", station: "burner", into: "pot", hand: { kind: "spoon" }, needs: ["sugar", "mirin", "shoyu", "get_spoon"], label: "味見をする", hint: "スプーンで、ひと口味見", say: "どれどれ" },
      { id: "simmer", kind: "wait", into: "pot", until: { simmer: ">=8" }, needs: ["heat_low", "lid_on"], label: "じっくり煮る", hint: "ふたをして、ぽこぽこ煮えるまで", say: "いい香りがしてきたわ" },
      { id: "get_bowl", kind: "take", station: "shelf_bowl", hand: null, give: { kind: "bowl", food: null, eggs: 0, beaten: false }, goal: 2, label: "お椀を出す", hint: "お椀を2つ出してね", quiet: true },
      { id: "ladle", kind: "tap", station: "burner", into: "pot", hand: { kind: "bowl", food: null }, give: { kind: "bowl", food: "niku" }, goal: 2, needs: ["simmer", "taste"], label: "お椀によそう", hint: "お椀を持って、鍋の前で「する」", say: "はい、よそったわよ" },
      { id: "serve", kind: "serve", station: "table", hand: { kind: "bowl", food: "niku" }, goal: 2, needs: ["simmer"], label: "食卓に出す", hint: "テーブルまで運びましょう", say: "はい、どうぞ" }
    ]
  };

  var ONIGIRI = {
    id: "onigiri",
    name: "おにぎり",
    blurb: "塩むすびと、海苔をまいたの",
    ingredients: ["ご飯 3杯分", "お塩 少々", "海苔 お好みで", "漬物 少々"],
    profile: null,
    steps: [
      { id: "salt_hands", kind: "tap", station: "salt", flag: "handsSalted", label: "手に塩をつける", hint: "お塩を、手にほんの少し", say: "手に塩をね。おいしくなるのよ" },
      { id: "get_plate", kind: "take", station: "shelf_plate", hand: null, give: { kind: "plate", contents: [] }, label: "お皿を出す", hint: "お皿を棚から", quiet: true },
      { id: "plate_on", kind: "place", station: "counter", hand: { kind: "plate" }, needs: ["get_plate"], label: "お皿を置く", hint: "作業台にお皿を" },
      { id: "scoop", kind: "drag", station: "ricecooker", hand: null, metric: "dist", need: 90, give: { kind: "rice" }, goal: 3, needs: ["salt_hands"], label: "ご飯をよそう", hint: "炊飯器から、ゆっくり引き出して", say: "あったかいわね" },
      { id: "shape", kind: "drag", station: "counter", hand: { kind: "rice" }, metric: "rot", need: 1.6, give: { kind: "onigiri", nori: false }, when: { counter: "plate" }, goal: 3, needs: ["plate_on"], label: "おにぎりをにぎる", hint: "手のひらで、くるくる回して", say: "ふんわりにぎれたわ" },
      { id: "wrap", kind: "tap", station: "nori", hand: { kind: "onigiri", nori: false }, give: { kind: "onigiri", nori: true }, goal: 3, optional: true, label: "海苔を巻く（おすすめ）", hint: "あったら、海苔をくるっと", say: "ぱりっと巻けたわ" },
      { id: "put_onigiri", kind: "tap", station: "counter", into: "plate", hand: { kind: "onigiri" }, add: "onigiri", goal: 3, needs: ["plate_on"], label: "お皿に並べる", hint: "お皿の上に、そっと" },
      { id: "get_tsukemono", kind: "take", station: "fridge", hand: null, give: { kind: "tsukemono" }, label: "漬物を出す", hint: "漬物を冷蔵庫から", quiet: true },
      { id: "put_tsukemono", kind: "tap", station: "counter", into: "plate", hand: { kind: "tsukemono" }, add: "tsukemono", needs: ["plate_on"], label: "漬物を添える", hint: "お皿のすみに、漬物を" },
      { id: "lift_plate", kind: "take", station: "counter", from: "counter", hand: null, when: { counter: "plate" }, needs: ["put_onigiri", "put_tsukemono"], label: "お皿を運ぶ", hint: "できたお皿を、食卓へ" },
      { id: "serve", kind: "serve", station: "table", hand: { kind: "plate" }, needs: ["lift_plate"], label: "食卓に出す", hint: "テーブルまで運びましょう", say: "はい、どうぞ" }
    ]
  };

  var RECIPES = [MISO, TAMAGO, NIKU, ONIGIRI];

  var API = {
    RECIPES: RECIPES,
    STATIONS: STATIONS
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.ObachanRecipes = API;
})();
