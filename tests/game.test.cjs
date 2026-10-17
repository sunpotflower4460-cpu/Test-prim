const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup(hash = "", initialStorage = {}) {
  const elements = new Map();
  const events = {};
  let nextId = 0;
  const element = id => {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {
        id, style: {}, textContent: "", innerHTML: "", children: [],
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(type, handler) { listeners[type] = handler; },
        appendChild(item) { this.children.push(item); },
        replaceChildren(...items) { this.children = items; },
        querySelector() { return null; },
        querySelectorAll() { return this.children; },
        setAttribute() {}, setPointerCapture() {},
        getBoundingClientRect() { return { left: 0, top: 620, width: 150, height: 150 }; },
        click() { if (listeners.click) listeners.click({ preventDefault() {} }); },
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
  element("world").getContext = () => ctx;
  const document = {
    getElementById: element,
    createElement() { return element("dynamic-" + ++nextId); },
    addEventListener(type, callback) { events["document:" + type] = callback; }
  };
  const window = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    location: { href: "http://localhost/index.html", hash },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, callback) { events[type] = callback; }
  };
  const localData = { ...initialStorage };
  const localStorage = {
    getItem(key) { return localData[key] || null; },
    setItem(key, value) { localData[key] = String(value); }
  };
  const queue = [];
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /requestAnimationFrame\(frame\);\s*\}\)\(\);/);
  const instrumented = source.replace(
    "requestAnimationFrame(frame);\n})();",
    "window.__test = { getGame: () => game, getScene: () => scene, addExp, spawnBoss, hurtEnemy, hurtPlayer }; requestAnimationFrame(frame);\n})();"
  );
  vm.runInNewContext(instrumented, {
    document, window, localStorage,
    navigator: { vibrate() {} },
    location: { protocol: "http:", hostname: "localhost" },
    requestAnimationFrame(callback) { queue.push(callback); },
    setTimeout() { return 1; }, clearTimeout() {}
  }, { timeout: 4000 });
  const state = window.__test;
  assert.ok(state, "test hooks loaded");
  let now = 0;
  function tick(frames = 1) {
    for (let i = 0; i < frames; i++) {
      now += 16.6667;
      const callbacks = queue.splice(0);
      assert.ok(callbacks.length > 0, "animation loop should remain active");
      callbacks.forEach(callback => callback(now));
    }
  }
  return { element, events, state, tick, localData, location: window.location };
}

test("menu, keyboard, dash, pause and upgrading are interactive", () => {
  const { element: el, events, state, tick } = setup("#lumina");
  assert.equal(state.getScene(), "home");
  el("startBtn").click();
  assert.equal(state.getScene(), "playing");
  tick(12);
  const before = state.getGame().player.x;
  events.keydown({ key: "ArrowRight", repeat: false, preventDefault() {} });
  tick(20);
  assert.ok(state.getGame().player.x > before, "right arrow moves hero");
  events.keyup({ key: "ArrowRight" });
  events.keydown({ key: " ", repeat: false, preventDefault() {} });
  assert.ok(state.getGame().player.dashCd > 0, "space starts a dash");
  el("pauseBtn").click();
  assert.equal(state.getScene(), "paused");
  el("resume").click();
  assert.equal(state.getScene(), "playing");
  state.addExp(33);
  assert.equal(state.getScene(), "upgrade");
  const options = el("upgradeList").children;
  assert.ok(options.length >= 3, "choose from three blessings");
  options[options.length - 1].click();
  assert.equal(state.getScene(), "playing");
});

test("all three bosses can be defeated and the ending is reachable", () => {
  const { element: el, state, tick, localData } = setup("#lumina");
  el("startBtn").click();
  const player = state.getGame().player;
  player.maxHp = 999999; player.hp = 999999;
  for (let stage = 0; stage < 3; stage++) {
    let turns = 0;
    while (!state.getGame().bossSpawned && turns < 4500) {
      if (state.getScene() === "upgrade") {
        const choices = el("upgradeList").children;
        choices[choices.length - 1].click();
      }
      tick();
      turns++;
    }
    assert.ok(state.getGame().bossSpawned, "stage " + stage + " boss spawned");
    const boss = state.getGame().enemies.find(enemy => enemy.type === "boss");
    assert.ok(boss, "boss exists");
    state.hurtEnemy(boss, boss.hp + 1);
    assert.equal(state.getScene(), stage === 2 ? "won" : "chapter");
    if (stage !== 2) {
      el("nextChapter").click();
      while (state.getScene() === "upgrade") {
        const choices = el("upgradeList").children;
        choices[choices.length - 1].click();
      }
      assert.equal(state.getScene(), "playing");
      assert.equal(state.getGame().stage, stage + 1);
    }
  }
  assert.equal(JSON.parse(localData["lumina-garden-v1"]).wins, 1);
  el("retry").click();
  assert.equal(state.getScene(), "playing");
  state.getGame().player.hp = 1;
  state.getGame().player.invuln = 0;
  state.hurtPlayer(100, 0, 0);
  assert.equal(state.getScene(), "over");
});

test("the GPT6 CHAT door opens the shelf and LUMINA returns there", () => {
  const { element: el, state, location } = setup();
  assert.equal(state.getScene(), "launcher");
  el("openGameBtn").click();
  assert.equal(location.href, "gpt6-chat/index.html");
  const lumina = setup("#lumina");
  lumina.element("returnPortalBtn").click();
  assert.equal(lumina.location.href, "gpt6-chat/index.html");
  assert.equal(lumina.state.getScene(), "home");
});

test("focused gallery and title buttons own Enter and key repeats cannot restart", () => {
  const {element:el,events,state}=setup();
  const press=(target,repeat=false)=>events.keydown({key:'Enter',target:{tagName:'BUTTON',id:target},repeat,preventDefault(){}});
  for(const id of ['openSumifuBtn','openCodeBtn','openSyncBtn','openSolBtn']){
    press(id);assert.equal(state.getScene(),'launcher');
  }
  press('openGameBtn');assert.equal(state.getScene(),'launcher');
  events.keydown({key:'Enter',repeat:true,preventDefault(){}});assert.equal(state.getScene(),'launcher');
});

test("a keyboard-activated dash button works without a pointer event",()=>{
  const {element:el,state}=setup('#lumina');el('startBtn').click();
  el('dashBtn').trigger('click',{detail:0});assert.ok(state.getGame().player.dashCd>0);
});

test("pausing clears movement even if keyup is lost while the menu is open",()=>{
  const {element:el,events,state,tick}=setup('#lumina');el('startBtn').click();
  events.keydown({key:'ArrowRight',repeat:false,preventDefault(){}});tick(3);
  el('pauseBtn').click();el('resume').click();const x=state.getGame().player.x;tick(3);
  assert.equal(state.getGame().player.x,x);
});

test("invalid saved records cannot corrupt the LUMINA menu or future saves", () => {
  const bad = JSON.stringify({ best: "3", wins: "many", bestKills: -1, bestLevel: 0, music: "false" });
  const { element: el, localData, state } = setup("#lumina", { "lumina-garden-v1": bad });
  assert.equal(state.getScene(), "home");
  assert.equal(el("bestRecord").textContent, "あなたの物語は、ここから。");
  el("soundBtn").click();
  assert.deepEqual(JSON.parse(localData["lumina-garden-v1"]), {
    best: 0, wins: 0, music: false, bestKills: 0, bestLevel: 1
  });
});
