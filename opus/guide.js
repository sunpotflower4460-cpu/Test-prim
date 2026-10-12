/* MIZUHO — 瑞穂 / the illustrated guide.
   Five short pages for a first-time player: why, which water takes
   seedlings, the three tools, the year, and the hands. Drawn as small
   cross-sections in inline SVG so it needs no images. */
(function (root) {
  "use strict";
  const C = { soil: "#9a7650", soilDark: "#7a5a3a", grass: "#7ea85a", water: "#7db4d8", waterDeep: "#4f86b3", rice: "#6ea64a", gold: "#d9a93c", stone: "#a49c90", ink: "#3b352c", mute: "#8b8170", red: "#a8433a", ok: "#4f8a3c" };
  const svg = (body, h) => `<svg class="guide-art" viewBox="0 0 280 ${h || 120}" role="img" aria-hidden="true">${body}</svg>`;
  const sprout = (x, y, s) => { s = s || 1; return `<path d="M${x} ${y}v${-7 * s}M${x} ${y - 4 * s}l${-3 * s} ${-4 * s}M${x} ${y - 4 * s}l${3 * s} ${-4 * s}" stroke="${C.rice}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`; };
  const ear = (x, y) => `<path d="M${x} ${y}v-9" stroke="${C.gold}" stroke-width="1.6"/><path d="M${x} ${y - 9}q4 1 5 6" stroke="${C.gold}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const house = (x, y) => `<path d="M${x - 11} ${y - 10}L${x} ${y - 22}L${x + 11} ${y - 10}Z" fill="#b48a52"/><rect x="${x - 8}" y="${y - 10}" width="16" height="10" fill="#efe4cc" stroke="#8a6a44" stroke-width=".8"/><rect x="${x - 2}" y="${y - 7}" width="4" height="7" fill="#7a5a3a"/>`;
  const mark = (x, y, good) => good
    ? `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${C.ok}" stroke-width="2.4"/>`
    : `<path d="M${x - 7} ${y - 7}l14 14M${x + 7} ${y - 7}l-14 14" stroke="${C.red}" stroke-width="2.6" stroke-linecap="round"/>`;
  const label = (x, y, t, anchor, color) => `<text x="${x}" y="${y}" text-anchor="${anchor || "middle"}" font-size="10" font-weight="700" fill="${color || C.ink}">${t}</text>`;

  // page 1: terraces stepping down a hill, water cascading, a harvest and a dry house
  const purpose = svg(`
    <path d="M0 18h46v20h52v20h52v20h52v24h78v20H0z" fill="${C.soil}"/>
    <path d="M0 18h46M46 38h52M98 58h52M150 78h52" stroke="${C.grass}" stroke-width="3"/>
    <rect x="14" y="12" width="32" height="6" fill="${C.water}" opacity=".9"/>
    <rect x="60" y="32" width="38" height="6" fill="${C.water}" opacity=".9"/>
    <rect x="112" y="52" width="38" height="6" fill="${C.water}" opacity=".9"/>
    <rect x="164" y="72" width="38" height="6" fill="${C.water}" opacity=".9"/>
    <path d="M44 16q6 4 8 18M96 36q6 4 8 18M148 56q6 4 8 18" stroke="${C.water}" stroke-width="2.4" fill="none"/>
    ${[20, 30, 40].map(x => ear(x, 18)).join("")}${[66, 76, 86].map(x => ear(x, 38)).join("")}${[118, 128, 138].map(x => ear(x, 58)).join("")}${[170, 180, 190].map(x => ear(x, 78)).join("")}
    <circle cx="8" cy="10" r="4" fill="#dff1ff" stroke="${C.water}"/>${label(8, 6, "泉", "middle", C.mute)}
    ${house(244, 102)}${label(244, 116, "家を守る", "middle", C.red)}
    <g transform="translate(222 34)"><ellipse cx="18" cy="14" rx="18" ry="11" fill="#e7cf8f" stroke="#b18b3a"/><path d="M4 9h28M4 19h28" stroke="#b18b3a"/>${label(18, 17, "俵", "middle", "#6b4f1c")}</g>
    ${label(240, 28, "収穫", "middle", "#8a6a1c")}`, 122);

  // page 2: which water takes seedlings
  const water = svg(`
    <g>
      <rect x="6" y="70" width="80" height="30" fill="${C.soil}"/><rect x="6" y="64" width="80" height="6" fill="${C.water}"/>
      <rect x="2" y="56" width="6" height="44" fill="${C.soilDark}"/><rect x="84" y="56" width="6" height="44" fill="${C.soilDark}"/>
      ${[18, 30, 42, 54, 66, 78].map(x => sprout(x, 66)).join("")}
      ${mark(46, 30, true)}${label(46, 50, "平ら・浅い・静か", "middle", C.ok)}
    </g>
    <g transform="translate(96 0)">
      <path d="M0 64L84 92V100H0z" fill="${C.soil}"/><path d="M0 62L84 90" stroke="${C.water}" stroke-width="4"/>
      <path d="M30 66l14 5m-4-5l4 5-5 3" stroke="#3f74a0" stroke-width="1.6" fill="none"/>
      ${mark(42, 30, false)}${label(42, 50, "斜面・流れる", "middle", C.red)}
    </g>
    <g transform="translate(192 0)">
      <path d="M0 60h8v30h66V60h8v40H0z" fill="${C.soil}"/><rect x="8" y="58" width="66" height="32" fill="${C.waterDeep}" opacity=".85"/>
      ${sprout(28, 90, .8)}${sprout(54, 90, .8)}
      ${mark(41, 30, false)}${label(41, 50, "深すぎる", "middle", C.red)}
    </g>`, 104);

  // page 3: the tools as before (dashed) and after (solid) cross-sections
  const tool = (y, name, before, after, extra) => `
    <g transform="translate(0 ${y})">
      <rect x="0" y="4" width="34" height="30" rx="5" fill="#233552"/>${label(17, 24, name, "middle", "#f3ecdc")}
      <path d="${after} V40 H48 Z" fill="${C.soil}"/>
      <path d="${before}" stroke="${C.mute}" stroke-width="1.4" stroke-dasharray="3 3" fill="none"/>
      ${extra || ""}
    </g>`;
  const tools = svg(`
    ${tool(0, "盛", "M48 26 H250", "M48 26 H130 Q140 26 143 18 Q150 12 157 18 Q160 26 170 26 H250", `<rect x="48" y="20" width="80" height="6" fill="${C.water}"/>`)}
    ${tool(44, "掘", "M48 22 H250", "M48 22 H130 Q138 22 141 30 Q150 36 159 30 Q162 22 170 22 H250", `<path d="M136 31 Q150 37 164 31" stroke="${C.water}" stroke-width="3" fill="none"/>`)}
    ${tool(88, "均", "M48 8 L250 36", "M48 8 L110 17 L112 22 H200 L202 29 L250 36", `<path d="M110 22h90" stroke="${C.grass}" stroke-width="2"/>`)}`, 128);

  // page 4: the year as a ribbon
  const seg = (x, w, color, t, sub) => `<rect x="${x}" y="30" width="${w}" height="22" fill="${color}"/>${label(x + w / 2, 45, t, "middle", "#fffaf0")}${sub ? `<text x="${x + w / 2}" y="68" text-anchor="middle" font-size="8.5" fill="${C.mute}">${sub}</text>` : ""}`;
  const year = svg(`
    ${seg(4, 76, "#c58b9a", "春", "つくる")}
    ${seg(80, 46, "#8fbf5a", "初夏", "")}
    ${seg(126, 52, "#6f8fae", "梅雨", "雨が集まる")}
    ${seg(178, 52, "#4f9a4f", "盛夏", "日照り")}
    ${seg(230, 46, "#c99a3a", "秋", "収穫")}
    <path d="M80 18v40" stroke="${C.ink}" stroke-width="1.6"/><path d="M75 14h10l-5 7z" fill="${C.ink}"/>${label(80, 10, "田植えをする", "middle")}
    <text x="42" y="82" text-anchor="middle" font-size="8.5" fill="${C.red}" font-weight="700">時間は止まっている</text>
    <path d="M140 22l-3 6M150 22l-3 6M160 22l-3 6" stroke="#6f8fae" stroke-width="1.4"/>
    <circle cx="204" cy="20" r="5" fill="#f2c14e"/>`, 92);

  const PAGES = [
    { eyebrow: "1 / 5 · PURPOSE", title: "この谷でやること", art: purpose,
      text: "山の斜面に<b>棚田</b>をつくり、泉の水を田に巡らせて稲を育てます。<br>秋に<b>目標の俵</b>だけ収穫できて、<b>家が一軒も水に浸からなければ</b>、その谷はひらけます。<br><small>画面上部の「<b>見込み</b> / <b>目標</b>」を見れば、あとどれだけ田が要るか分かります。<b>俵</b>（たわら）はお米の量の単位です。</small>" },
    { eyebrow: "2 / 5 · WATER", title: "苗が植わる水", art: water,
      text: "苗は、<b>平らな地面</b>に<b>浅く</b>溜まった<b>静かな水</b>にだけ植わります。<br>斜面を流れる水や、深すぎる水には植わりません。<br><small>植えられる場所は、春のあいだ<b>淡い緑に光り</b>ます。</small>" },
    { eyebrow: "3 / 5 · TOOLS", title: "三つの道具", art: tools,
      text: "<b>盛る</b>　土を盛り上げる。田のふちに低い土手（<b>畦</b>）をつくって、水をせき止める。<br><b>掘る</b>　土を掘る。水の通り道や、水を逃がす出口をつくる。<br><b>均す</b>　なぞり始めた高さに土を揃える。斜面に平らな段ができる。<br><small><b>手持ちの土</b>（画面上部）：掘ると増え、盛ると減ります。手持ちが 0 のときは盛れないので、どこかを掘って土を手に入れます。</small>" },
    { eyebrow: "4 / 5 · THE YEAR", title: "一年の流れ", art: year,
      text: "春のあいだは<b>時間が止まっています</b>。水は流れ続けるので、ゆっくり田をつくれます。<br>準備ができたら<b>「田植えをする」</b>。そこから一年が流れます。<br>梅雨の雨は低い所へ集まって家を浸し、夏の日照りは田を乾かします。秋に実った稲が収穫です。" },
    { eyebrow: "5 / 5 · HANDS", title: "操作", art: "",
      list: [
        ["なぞる", "選んだ道具で土を動かす（押さえたままでも効く）"],
        ["眺", "「眺める」を選んでなぞると、景色が動く"],
        ["＋ －", "寄る・引く　　⟲ ⟳　まわる　　二本指でも動かせる"],
        ["▸", "早送り（×3・×8）　　↶　ひとつ戻す"],
        ["Ⅱ", "ひと休み。この説明もここから開ける"],
        ["表示", "画面上の「見込み」「手持ちの土」「家」「暦」は、タップすると意味が出る"]
      ],
      keys: "PC：左ドラッグで道具、右ドラッグでまわす、Shift＋ドラッグで動かす、ホイールで寄る<br>1 盛る · 2 掘る · 3 均す · 4 眺める · Z 戻す · Space 時を止める · F 早送り" }
  ];

  function page(i) {
    const p = PAGES[i];
    const dots = PAGES.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    const body = p.list
      ? `<ul class="how-list">${p.list.map(([k, v]) => `<li><i>${k}</i><span>${v}</span></li>`).join("")}</ul><p class="keys">${p.keys}</p>`
      : `${p.art}<p class="guide-text">${p.text}</p>`;
    return `
      <p class="eyebrow">${p.eyebrow}</p>
      <h2 id="dialogTitle">${p.title}</h2>
      ${body}
      <div class="guide-dots" aria-hidden="true">${dots}</div>
      <div class="dialog-actions">
        ${i > 0 ? "<button type=\"button\" data-dialog=\"prev\">戻る</button>" : "<button type=\"button\" data-dialog=\"skip\">閉じる</button>"}
        <button type="button" class="accent" data-dialog="${i < PAGES.length - 1 ? "next" : "done"}">${i < PAGES.length - 1 ? "次へ" : "はじめる"}</button>
      </div>`;
  }
  root.MizuhoGuide = { count: PAGES.length, page };
})(typeof self !== "undefined" ? self : this);
