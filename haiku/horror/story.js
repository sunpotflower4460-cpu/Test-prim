/*
 * 鳴き井戸: player-facing Japanese text. The sim emits keys; the UI looks them up here.
 */
(function () {
  "use strict";

  const TITLE = {
    name: "鳴き井戸",
    en: "NAKI-IDO",
    tagline: "呼ばれても、返事をしてはいけない。"
  };

  // Subtitles and short messages, keyed by the events the sim emits.
  const LINES = {
    arrive: "雨で峠の道が切れた。祖母の家に着いたのは、夜更けだった。",
    arrive2: "家を片付けて、売りに出す。それだけのはずだった。",
    engawa: "庭の奥、井戸のあたりから、子どもの歌が聞こえる。",
    butsuma: "線香の匂いがする。位牌が、こちらを向いている気がした。",
    kura: "蔵の中は、埃と湿気の匂いがした。",
    "fuda-first": "札だ。祖母の字で「封」と書いてある。",
    "fuda-all": "三枚そろった。井戸に納めれば、歌は止むはずだ。",
    call: "……わたし。井戸の底から、わたしを呼ぶ声がした。",
    silence: "黙っていると、声は少しずつ遠のいていった。",
    senko: "線香の煙がまっすぐ立ち上る。ここでなら、息をつける。",
    "seal-place": "札を井戸の縁に置いた。",
    "seal-ready": "札は三枚納まった。あとは蓋を閉めるだけだ。",
    lid: "蓋を閉めると、歌がふつりと途切れた。",
    "battery-none": "電池が切れている。",
    "battery-swap": "電池を入れ替えた。",
    "battery-got": "電池を拾った。",
    "shell-got": "散弾を拾った。",
    "fuda-got": "札を拾った。",
    "diary-got": "祖母の日記が挟まっていた。",
    "door-blocked": "戸の前に、何かが立っている。",
    "shell-none": "散弾がない。",
    "chamber-full": "二つの銃身にはもう装填されている。",
    dry: "カチッ。空だ。",
    "well-nofuda": "札がない。今は蓋を開けられない。",
    "well-lid": "井戸の蓋は、重くて動かない。",
    "well-look": "井戸の底は暗く、見えない。",
    "search-none": "何もなかった。",
    "break-open": "二連銃を折る。",
    "load-click": "カチリ。",
    "light-on": "懐中電灯をつけた。",
    "light-off": "懐中電灯を消した。",
    "light-dead": "電池が切れた。"
  };

  // Labels shown next to the context prompt and on the touch 調べる button.
  const LABELS = {
    take: "拾う",
    read: "読む",
    open: "開ける",
    close: "閉める",
    burn: "線香を焚く",
    well: "札を納める",
    lid: "蓋を閉める",
    wellLook: "井戸を覗く"
  };

  // Prompt text: the key name comes first in the UI ("E 障子を開ける").
  const ACTION = {
    take: { battery: "電池を拾う", shell: "散弾を拾う", fuda: "札を拾う" },
    read: "日記を読む",
    open: { shoji: "障子を開ける", fusuma: "襖を開ける", genkan: "戸を開ける", hikido: "引き戸を開ける" },
    close: { shoji: "障子を閉める", fusuma: "襖を閉める", genkan: "戸を閉める", hikido: "引き戸を閉める" },
    burn: "線香を焚く",
    well: "札を井戸に納める",
    lid: "井戸の蓋を閉める",
    wellLook: "井戸を覗く",
    search: "調べる"
  };

  // Short words for the round touch button, which is only 64 px across.
  const ACTION_SHORT = {
    take: "拾う", read: "読む", open: "開ける", close: "閉める", burn: "焚く",
    well: "納める", lid: "閉じる", wellLook: "覗く", search: "調べる"
  };

  // Where the next talisman is. Keyed by the talisman that is still missing.
  const NEXT_FUDA = {
    "fuda-1": "納戸の箱を調べる",
    "fuda-2": "仏間の位牌の下を調べる",
    "fuda-3": "蔵の箱を開ける"
  };

  // Quiet hints after a long pause without progress. Once per objective.
  const STALL = {
    "fuda-1": "……納戸の、箱の裏が気になる。",
    "fuda-2": "仏壇の位牌の下。祖母は、そこに何かを隠していた。",
    "fuda-3": "蔵の箱。さっきの日記に、そう書いてあった。",
    well: "札を三枚納めれば、歌は止むはずだ。井戸の縁へ。",
    lid: "あとは蓋を閉めるだけだ。井戸の縁で、蓋を。"
  };

  // The objective line, from the sim's objectiveOf() result.
  function objectiveText(o) {
    if (o.stage === "fuda") return "札 " + o.n + "/3 — 次は、" + NEXT_FUDA[o.next];
    if (o.stage === "well") return "札を納める " + o.placed + "/3 — 井戸の縁で";
    if (o.stage === "lid") return "井戸の蓋を閉める — 札は三枚納まった";
    return "蓋は閉じた — 夜明けを待つ";
  }

  function stallHint(o) {
    if (o.stage === "fuda") return STALL[o.next] || null;
    if (o.stage === "well") return STALL.well;
    if (o.stage === "lid") return STALL.lid;
    return null;
  }

  const SEARCH_LABELS = {
    tansu: "引き出しを開ける",
    ihai: "位牌の下を見る",
    hako: "箱をどかす",
    chest: "箱を開ける"
  };

  const CALL = {
    answer: "返事をする",
    silence: "黙る"
  };

  // Diary pages found around the house. Each page has a title and body lines.
  const DIARY = {
    "diary-1": {
      title: "十月三日",
      place: "居間",
      body: [
        "雨が三日、降り続いている。峠の橋が流れたそうで、あの子は今年も来られないという。",
        "電話の声がやけに遠かった。",
        "井戸の蓋は、いつも通り石で押さえておいた。夜に蓋の下から歌が聞こえても、耳を貸してはいけない。あれは呼ぶ声だから。"
      ]
    },
    "diary-2": {
      title: "十一月の末",
      place: "座敷",
      body: [
        "あれが来るようになって、家の中の物が、よく場所を変える。戸を閉めても、向こうから開けてしまう。",
        "「ねえ、入れて」と言うから、障子は開けない。",
        "札は三枚書いた。ひとつは納戸の箱の裏。ひとつは仏壇の位牌の下。もうひとつは蔵の箱に入れた。"
      ]
    },
    "diary-3": {
      title: "最後の頁",
      place: "蔵",
      body: [
        "井戸に返事をした日から、わたしの名を呼ぶのは、わたしの声になった。",
        "ずっと、わたしを呼んでいる。",
        "札を三枚納めて蓋を閉めれば、歌は止むと書いてあった。",
        "どうか、呼ばれても、返事をしないで。"
      ]
    }
  };

  const ENDINGS = {
    seal: {
      title: "封じ",
      body: [
        "蓋を閉めると、歌がふつりと途切れた。",
        "窓の外が白み、鳥の声が戻ってくる。雨が、静かに止んでいく。"
      ]
    },
    taken: {
      title: "連れていかれた",
      body: [
        "返事をした。",
        "井戸の底から、白く濡れた手が伸びてきた。"
      ]
    }
  };

  const CARDS = {
    grab: { title: "夜の底", body: "引き戻された。" },
    grabCheckpoint: "最後に線香を焚いた場所から、もう一度。",
    grabStart: "家の入口から、もう一度。"
  };

  const CONTROLS = {
    pc: [
      ["WASD", "歩く"],
      ["Shift", "走る（息が切れる）"],
      ["マウス", "見回す"],
      ["左クリック", "撃つ"],
      ["R", "装填（一発ずつ）"],
      ["F", "懐中電灯（電池を入れ替える）"],
      ["E", "調べる・開ける・拾う"],
      ["Esc", "一時停止"]
    ],
    touch: [
      ["左をなぞる", "歩く"],
      ["右をなぞる", "見回す"],
      ["撃つ・装填・灯・走る・調べる", "下のボタン"]
    ]
  };

  const API = {
    TITLE, LINES, LABELS, SEARCH_LABELS, CALL, DIARY, ENDINGS, CARDS, CONTROLS,
    ACTION, ACTION_SHORT, NEXT_FUDA, STALL, objectiveText, stallHint
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else window.NakiIdoStory = API;
})();
