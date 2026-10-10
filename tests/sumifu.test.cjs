const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("portal places Grok 4.7 Cursor under GPT6 CHAT", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const gpt = html.indexOf(">GPT6 CHAT<");
  const grok = html.indexOf(">Grok 4.7 Cursor<");
  assert.ok(gpt > 0 && grok > gpt, "Grok entry follows the GPT6 CHAT door");
  assert.match(html, /id="openSumifuBtn"/);
  assert.match(html, /KASANE/);
  assert.match(html, /sumifu\.js/);
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  assert.match(readme, /Grok 4\.7 Cursor/);
  assert.match(readme, /KASANE/);
});

function setup() {
  const elements = new Map();
  let nextId = 0;
  const element = id => {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {
        id, style: {}, textContent: "", innerHTML: "", children: [], dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener(type, handler) { listeners[type] = handler; },
        appendChild(item) { this.children.push(item); },
        setAttribute() {}, setPointerCapture() {},
        getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 400 }; },
        click() { if (listeners.click) listeners.click({ preventDefault() {}, stopPropagation() {} }); },
        trigger(type, data) { if (listeners[type]) listeners[type](data); }
      });
    }
    return elements.get(id);
  };
  const ctx = new Proxy({}, {
    get(target, name) {
      if (name === "createLinearGradient" || name === "createRadialGradient") return () => ({ addColorStop() {} });
      return target[name] || (() => {});
    },
    set(target, name, value) { target[name] = value; return true; }
  });
  element("sumifu-world").getContext = () => ctx;
  const events = {};
  const document = {
    getElementById: element,
    createElement() { return element("dynamic-" + ++nextId); },
    addEventListener(type, callback) { events["document:" + type] = callback; },
    body: { classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} } },
    hidden: false
  };
  const window = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    addEventListener(type, callback) { events[type] = callback; }
  };
  const localData = {};
  const localStorage = {
    getItem(key) { return localData[key] || null; },
    setItem(key, value) { localData[key] = String(value); }
  };
  const queue = [];
  const source = fs.readFileSync(path.join(__dirname, "..", "sumifu.js"), "utf8");
  assert.match(source, /requestAnimationFrame\(frame\);\s*\}\)\(\);/);
  const instrumented = source.replace(
    "requestAnimationFrame(frame);\n})();",
    "window.__sumifu = { getGame: () => game, getScene: () => scene, hurtEnemy, hurtPlayer, spawnBoss, spawnEnemy, slash, grantKills, face }; requestAnimationFrame(frame);\n})();"
  );
  vm.runInNewContext(instrumented, {
    document, window, localStorage,
    navigator: { vibrate() {} },
    requestAnimationFrame(callback) { queue.push(callback); },
    setTimeout(fn) { return 1; }, clearTimeout() {}
  }, { timeout: 4000 });
  const state = window.__sumifu;
  assert.ok(state, "sumifu hooks loaded");
  let now = 0;
  function tick(frames = 1) {
    for (let i = 0; i < frames; i++) {
      now += 16.6667;
      const callbacks = queue.splice(0);
      assert.ok(callbacks.length > 0, "animation loop should remain active");
      callbacks.forEach(callback => callback(now));
    }
  }
  return { element, events, state, tick, localData };
}

test("kasane title, movement, slash, parry, dash and upgrade", () => {
  const { element: el, events, state, tick } = setup();
  assert.equal(state.getScene(), "closed");
  el("openSumifuBtn").click();
  assert.equal(state.getScene(), "title");
  el("sumifuReturn").click();
  assert.equal(state.getScene(), "closed");
  el("openSumifuBtn").click();
  el("sumifuStart").click();
  assert.equal(state.getScene(), "playing");
  state.getGame().enemies.length = 0;
  tick(8);
  const before = state.getGame().player.x;
  events.keydown({ key: "ArrowRight", repeat: false, preventDefault() {} });
  tick(24);
  assert.ok(state.getGame().player.x > before + 8, "right arrow moves the brush");
  events.keyup({ key: "ArrowRight" });
  events.keydown({ key: " ", repeat: false, preventDefault() {} });
  assert.ok(state.getGame().player.dashCd > 0, "space dashes");
  const player = state.getGame().player;
  player.slashCd = 0;
  state.face(0);
  const foe = state.spawnEnemy("press", player.x + 28, player.y);
  foe.state = "lunge";
  foe.lungeAge = 0.02;
  foe.parried = false;
  const hp = foe.hp;
  state.slash();
  assert.ok(foe.hp < hp, "slash connects");
  assert.ok(foe.stun > 0, "a gold-window lunge is parried");
  state.getGame().enemies.length = 0;
  state.getGame().bossSpawned = false;
  state.getGame().chapterKills = 0;
  state.grantKills(4);
  assert.equal(state.getScene(), "upgrade");
  const options = el("sumifuUpgrade").children;
  assert.ok(options.length >= 3, "three brushes");
  options[options.length - 1].click();
  assert.equal(state.getScene(), "playing");
  el("sumifuPause").click();
  assert.equal(state.getScene(), "paused");
  el("sumifuResume").click();
  assert.equal(state.getScene(), "playing");
});

test("a parried boss keeps attacking", () => {
  const { element: el, state, tick } = setup();
  el("openSumifuBtn").click();
  el("sumifuStart").click();
  const game = state.getGame();
  game.enemies.length = 0;
  game.bossSpawned = false;
  const boss = state.spawnBoss();
  assert.ok(boss, "the boss appears");
  state.face(0);
  boss.x = game.player.x + 26;
  boss.y = game.player.y;
  boss.state = "lunge";
  boss.lungeAge = 0.02;
  boss.parried = false;
  state.slash();
  assert.ok(boss.parried, "the lunge was parried");

  // updateBoss has no "move" branch, so an unhandled state would freeze the boss
  const seen = new Set();
  for (let i = 0; i < 900; i++) { tick(1); seen.add(boss.state); }
  const attacking = ["aim", "windup", "lunge", "slam"].some(s => seen.has(s));
  assert.ok(attacking, "the boss resumes attacking; saw only " + [...seen].join(","));
});

test("three nights can be bound and a fatal blot ends the run", () => {
  const { element: el, state, localData } = setup();
  el("openSumifuBtn").click();
  el("sumifuStart").click();
  for (let stage = 0; stage < 3; stage++) {
    assert.equal(state.getGame().stage, stage);
    const boss = state.spawnBoss();
    assert.ok(boss && state.getGame().bossSpawned, "night " + stage + " boss");
    state.hurtEnemy(boss, boss.hp + 50);
    assert.equal(state.getScene(), stage === 2 ? "won" : "chapter");
    if (stage !== 2) {
      el("sumifuNext").click();
      assert.equal(state.getScene(), "playing");
    }
  }
  assert.equal(JSON.parse(localData["kasane-ink-v1"]).wins, 1);
  el("sumifuRetry").click();
  assert.equal(state.getScene(), "playing");
  const player = state.getGame().player;
  player.hp = 20;
  player.invuln = 0;
  player.dashTime = 0;
  state.hurtPlayer(100);
  assert.equal(state.getScene(), "over");
});
