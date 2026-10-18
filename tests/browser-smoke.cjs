"use strict";
const assert = require("node:assert/strict");
const { chromium, devices } = require("playwright");
const targets = [
  { name: "iPhone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "small-phone", viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "landscape", viewport: { width: 740, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_PRIM_CHROME || undefined, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
  try {
    for (const target of targets) {
      const context = await browser.newContext({
        viewport: target.viewport,
        deviceScaleFactor: target.deviceScaleFactor,
        isMobile: target.isMobile,
        hasTouch: target.hasTouch,
        reducedMotion: "reduce"
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.route("https://fonts.googleapis.com/**", route => route.abort());
      await page.route("https://fonts.gstatic.com/**", route => route.abort());
      await page.goto("http://127.0.0.1:8000/", { waitUntil: "domcontentloaded" });
      await page.locator("#launcher").waitFor({ state: "visible" });
// Grok の扉は作品一覧へ遷移する <a> なので、この Enter ループには入らない。
      // 下の専用検査（#grokShelf）が一覧側の 5 作品と戻り導線を確かめる。
      for (const [door, title, back] of [["openCodeBtn","codeHub","codeHubBack"],["openSyncBtn","syncTitle","syncReturnBtn"],["helixOpenBtn","helixTitle","helixReturnBtn"]]) {
        await page.locator("#" + door).press("Enter");
        await page.locator("#" + title).waitFor({state:"visible"});
        assert.ok(!(await page.locator("#home").isVisible()), "Enter opens only the selected game");
        await page.locator("#" + back).press("Enter");
        await page.locator("#launcher").waitFor({state:"visible"});
      }
      await page.locator("#openGameBtn").click();
      await page.locator(".gallery .work.lumina").waitFor({ state: "visible" });
      await page.locator(".gallery .work.kazane").click();
      await page.locator('#dialog [data-action="start"]').click();
      await page.locator("#overlay").waitFor({ state: "hidden" });
      await page.keyboard.press("ArrowRight");
      await page.locator("#pauseBtn").click();
      await page.locator('#dialog [data-action="resume"]').click();
      await page.locator("#overlay").waitFor({ state: "hidden" });
      assert.ok(await page.locator("#garden").evaluate(el => el.width > 0), "KAZANE canvas is ready");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "KAZANE fits the viewport");
      if (target.name === "small-phone" || target.name === "landscape") {
        const fit = await page.evaluate(() => {
          const canvas = document.getElementById("garden").getBoundingClientRect();
          const toolbar = document.querySelector(".toolbar").getBoundingClientRect();
          return canvas.top >= 0 && canvas.bottom <= innerHeight && toolbar.top >= 0 && toolbar.bottom <= innerHeight;
        });
        assert.ok(fit, "KAZANE canvas and controls fit together");
      }
      await page.locator(".back-link").click();
      await page.locator(".gallery .work.setsuna").click();
      await page.locator('#dialog [data-action="start"]').click();
      await page.locator("#overlay").waitFor({ state: "hidden" });
      if (target.hasTouch) {
        const cdp = await context.newCDPSession(page);
        const padBox = await page.locator("#pad").boundingBox();
        const attackBox = await page.locator("#attack").boundingBox();
        const left = { x: padBox.x + padBox.width / 2, y: padBox.y + padBox.height / 2, id: 21 };
        const right = { x: attackBox.x + attackBox.width / 2, y: attackBox.y + attackBox.height / 2, id: 22 };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left, right] });
        left.x += 25;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [left, right] });
        await page.waitForFunction(() => {
          const t = document.querySelector("#knob").style.transform;
          return t && !/^translate\(0px,\s*0px\)$/.test(t);
        });
        assert.ok(await page.locator("#attack").evaluate(el => el.classList.contains("pressed")),
          "SETSUNA は移動中に右指で斬れる");
        assert.notEqual(await page.locator("#knob").evaluate(el => el.style.transform), "translate(0px,0px)",
          "SETSUNA の左スティックが二本指で動く");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [right] });
        assert.notEqual(await page.locator("#knob").evaluate(el => el.style.transform), "translate(0px,0px)",
          "SETSUNA の攻撃指を離しても移動は続く");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [left] });
      }
      await page.keyboard.press("j");
      await page.locator("#pauseBtn").click();
      await page.locator('#dialog [data-action="resume"]').click();
      await page.locator("#overlay").waitFor({ state: "hidden" });
      assert.ok(await page.locator("#arena").evaluate(el => el.width > 0), "SETSUNA canvas is ready");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "SETSUNA fits the viewport");
      if (target.name === "small-phone" || target.name === "landscape") {
        const controls = await page.evaluate(() => ["arena", "attack", "parry", "dash", "skill", "pad"].map(id => {
          const box = document.getElementById(id).getBoundingClientRect();
          return { id, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        }));
        for (const box of controls) assert.ok(box.left >= 0 && box.right <= target.viewport.width && box.top >= 0 && box.bottom <= target.viewport.height, "SETSUNA control is visible: " + box.id);
      }
      await page.locator(".back").click();
      await page.locator(".gallery .work.lumina").waitFor({ state: "visible" });
      await page.locator(".gallery .work.lumina").click();
      await page.locator("#home").waitFor({ state: "visible" });
      assert.equal(await page.locator("#home h1").innerText(), "LUMINA");
      await page.locator("#returnPortalBtn").click();
      await page.locator(".gallery .work.lumina").waitFor({ state: "visible" });
      await page.locator(".back").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      await page.locator("#openGameBtn").click();
      await page.locator(".gallery .work.lumina").click();
      await page.locator("#startBtn").click();
      await page.locator("#mobileControls").waitFor({ state: "visible" });
      const joy = await page.locator("#joystick").boundingBox();
      assert.ok(joy, "joystick is on screen");
      await page.mouse.move(joy.x + joy.width / 2, joy.y + joy.height / 2);
      await page.mouse.down();
      await page.mouse.move(joy.x + joy.width / 2 + 28, joy.y + joy.height / 2 - 20, { steps: 3 });
      await page.waitForTimeout(45);
      const moved = await page.locator("#stickKnob").evaluate(el => el.style.transform);
      assert.notEqual(moved, "translate(0px, 0px)", "joystick knob follows pointer");
      await page.mouse.up();
      const centered = await page.locator("#stickKnob").evaluate(el => el.style.transform);
      assert.equal(centered, "translate(0px, 0px)", "joystick recenters after release");
      await page.locator("#pauseBtn").click();
      await page.locator("#overlay").waitFor({ state: "visible" });
      await page.locator("#resume").click();
      await page.locator("#mobileControls").waitFor({ state: "visible" });
      await page.locator("#dashBtn").dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch" });
      await page.waitForFunction(() => document.querySelector("#dashBtn").classList.contains("recharging"), null, { timeout: 2000 });
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth, htmlWidth: document.documentElement.scrollWidth,
        canvasWidth: document.querySelector("canvas").width,
        controlsVisible: getComputedStyle(document.querySelector("#mobileControls")).display !== "none"
      }));
      assert.ok(metrics.canvasWidth > 0, "canvas initialized");
      assert.ok(metrics.htmlWidth <= metrics.viewport + 1, "no horizontal overflow");
      assert.ok(metrics.controlsVisible, "mobile controls rendered");
      await page.locator("#pauseBtn").click();
      await page.locator("#quit").click();
      await page.locator("#home").waitFor({ state: "visible" });
      await page.locator("#returnPortalBtn").click();
      await page.locator(".gallery .work.lumina").waitFor({ state: "visible" });
      await page.locator(".back").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      const entryLabels = await page.locator("#launcher .launcher-entries .launcher-button-label strong").allInnerTexts();
      assert.deepEqual(
        entryLabels,
["GPT6 CHAT", "Grok 4.7 Cursor", "玄人コード", "Minimax M3.1", "Minimax M3.1", "GPT 6.1 sol", "GPT 6 Luna", "GPT 6 sol", "Opus 5.5"],
        "launcher lists the nine entries in order"
      );
      const launcherFit = await page.evaluate(() => ({
        viewport: window.innerWidth,
        htmlWidth: document.documentElement.scrollWidth,
        htmlHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      }));
      assert.ok(launcherFit.htmlWidth <= launcherFit.viewport + 1, "launcher has no horizontal overflow");
      await page.goto("http://127.0.0.1:8000/?work=kasane", { waitUntil: "domcontentloaded" });
      await page.locator("#sumifu-title").waitFor({ state: "visible" });
      assert.equal(await page.locator("#sumifu-title h1").innerText(), "KASANE");
      await page.locator("#sumifuTitleSound").press("Enter");
      assert.ok(await page.locator("#sumifu-title").isVisible(), "sound button does not start a run");
      await page.locator("#sumifuTitleSound").press("Enter");
      await page.locator("#sumifuStart").click();
      await page.locator("#sumifu-controls").waitFor({ state: "visible" });
      const joy2 = await page.locator("#sumifuJoy").boundingBox();
      assert.ok(joy2, "kasane joystick is on screen");
      await page.mouse.move(joy2.x + joy2.width / 2, joy2.y + joy2.height / 2);
      await page.mouse.down();
      await page.mouse.move(joy2.x + joy2.width / 2 + 24, joy2.y + joy2.height / 2 - 16, { steps: 3 });
      await page.waitForTimeout(40);
      const moved2 = await page.locator("#sumifuKnob").evaluate(el => el.style.transform);
      assert.notEqual(moved2, "translate(0px, 0px)", "kasane knob follows pointer");
      await page.mouse.up();
      const centered2 = await page.locator("#sumifuKnob").evaluate(el => el.style.transform);
      assert.equal(centered2, "translate(0px, 0px)", "kasane knob recenters");
      if (target.hasTouch) {
        const cdp = await context.newCDPSession(page);
        const slash = await page.locator("#sumifuSlash").boundingBox();
        const left = { x: joy2.x + joy2.width / 2, y: joy2.y + joy2.height / 2, id: 11 };
        const right = { x: slash.x + slash.width / 2, y: slash.y + slash.height / 2, id: 12 };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left, right] });
        left.x += 22;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [left, right] });
        await page.waitForFunction(() => {
          const t = document.querySelector("#sumifuKnob").style.transform;
          return t && !/^translate\(0px,\s*0px\)$/.test(t);
        });
        await page.waitForFunction(() => document.querySelector("#sumifuSlashFill").style.transform !== "scaleY(0)");
        assert.notEqual(await page.locator("#sumifuKnob").evaluate(el => el.style.transform), "translate(0px, 0px)",
          "左指で移動しながら右指で攻撃できる");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [right] });
        assert.notEqual(await page.locator("#sumifuKnob").evaluate(el => el.style.transform), "translate(0px, 0px)",
          "攻撃の指を離しても移動は続く");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [left] });
        assert.equal(await page.locator("#sumifuKnob").evaluate(el => el.style.transform), "translate(0px, 0px)",
          "移動の指を離すと止まる");
      }
      await page.locator("#sumifuPause").click();
      await page.locator("#sumifu-overlay").waitFor({ state: "visible" });
      await page.locator("#sumifuResume").press("Space");
      await page.locator("#sumifu-controls").waitFor({ state: "visible" });
      const kasane = await page.evaluate(() => ({
        viewport: window.innerWidth, htmlWidth: document.documentElement.scrollWidth,
        controlsVisible: getComputedStyle(document.querySelector("#sumifu-controls")).display !== "none"
      }));
      assert.ok(kasane.htmlWidth <= kasane.viewport + 1, "no horizontal overflow in kasane");
      assert.ok(kasane.controlsVisible, "kasane controls rendered");
      await page.locator("#sumifuPause").click();
      await page.locator("#sumifuQuit").click();
      await page.locator("#sumifuReturn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(!page.url().includes("work=kasane"), "leaving KASANE returns to the gallery address");

      // 入口が増えても、最後の入口と最下行の表示が重ならないこと
      //（入口の並び順そのものは、冒頭の検査で確かめている）
      const layout = await page.evaluate(() => {
        const sub = document.querySelector(".launcher-sub").getBoundingClientRect();
        const bottom = document.querySelector(".launcher-bottom").getBoundingClientRect();
        const last = document.getElementById("openOpusBtn").getBoundingClientRect();
        return { subBottom: sub.bottom, bottomTop: bottom.top, lastBeforeFooter: last.bottom <= bottom.top + 1 };
      });
      assert.ok(layout.subBottom <= layout.bottomTop + 1, "launcher footer does not overlap the last entry");
assert.ok(layout.lastBeforeFooter, "the last entry appears above the footer");
      await page.locator("#openOpusBtn").scrollIntoViewIfNeeded();
      assert.ok(await page.locator("#openOpusBtn").isVisible(), "the last entry is reachable by scrolling");
      // Grok の扉は作品一覧。KASANE と折光室が並び、折光室の最初の室は点灯する。
      await page.locator("#openSumifuBtn").click();
      await page.locator("#grokShelf").waitFor({ state: "visible" });
      assert.equal(await page.locator("#openKasane").count(), 1);
      assert.equal(await page.locator("#openOriko").count(), 1);
      assert.equal(await page.locator("#openMikan").count(), 1);
      assert.equal(await page.locator("#openHebi").count(), 1);
      assert.equal(await page.locator("#openKake").count(), 1);
      const shelfFit = await page.evaluate(() => ({
        width: innerWidth, html: document.documentElement.scrollWidth
      }));
      assert.ok(shelfFit.html <= shelfFit.width + 1, "grok shelf has no horizontal overflow");
      await page.locator("#openOriko").click();
      await page.locator("#title").waitFor({ state: "visible" });
      assert.equal((await page.locator("#title h1").innerText()).replace(/\s/g, ""), "ORIKO");
      // the title is in the HTML before the deferred script binds its buttons; on a slow runner wait for it
      await page.waitForLoadState("load");
      await page.locator("#howBtn").click();
      await page.locator("#dialogTitle").waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await page.locator("#modal").waitFor({ state: "hidden" });
      await page.locator("#startBtn").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.equal(await page.locator(".room").count(), 9, "nine rooms are listed");
      assert.equal(await page.locator(".room:disabled").count(), 8, "later rooms stay locked");
      await page.locator(".room").first().click();
      await page.locator("#glass").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.__oriko && window.__oriko.getRoom() === "first-fold");
      const tray = await page.locator(".piece-btn").first().boundingBox();
      const glassBox = await page.locator("#glass").boundingBox();
      assert.ok(tray && glassBox && glassBox.height > 80, "the glasshouse board has room to place a mirror");
      await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2);
      await page.mouse.down();
      await page.mouse.move(glassBox.x + glassBox.width / 2, glassBox.y + glassBox.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.__oriko.placedCount()), 1, "a dragged mirror lands on the board");
      await page.locator("#turnRight").click();
      await page.locator("#undoBtn").click();
      await page.locator("#undoBtn").click();
      assert.equal(await page.evaluate(() => window.__oriko.placedCount()), 0, "undo lifts the mirror back off the board");
      assert.equal(await page.evaluate(() => window.__oriko.placeSolution()), true, "the authored fold lights the flower");
      await page.locator("#dialogTitle").waitFor({ state: "visible", timeout: 4000 });
      assert.equal(await page.locator("#dialogTitle").innerText(), "最初の折り");
      const orikoFit = await page.evaluate(() => ({
        width: innerWidth,
        html: document.documentElement.scrollWidth,
        tools: document.querySelector(".tools").getBoundingClientRect().bottom,
        height: innerHeight,
        canvas: document.querySelector("#glass").width
      }));
      assert.ok(orikoFit.html <= orikoFit.width + 1, "oriko has no horizontal overflow");
      assert.ok(orikoFit.tools <= orikoFit.height + 1, "oriko controls fit on screen");
      assert.ok(orikoFit.canvas > 50, "oriko canvas is sized");
      await page.locator("#letterNext").click();
      await page.waitForFunction(() => window.__oriko.getRoom() === "past-the-wall");
      await page.locator("#playBack").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.match(await page.locator("#mapProgress").innerText(), /1 \/ 9/);
      await page.locator("#mapBack").click();
      await page.locator("#title .back").click();
      await page.locator("#grokShelf").waitFor({ state: "visible" });
      await page.locator("#openMikan").click();
      await page.locator("#title").waitFor({ state: "visible" });
      assert.equal((await page.locator("#title h1").innerText()).replace(/\s/g, ""), "MIKAN");
      await page.locator("#startBtn").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.equal(await page.locator(".night").count(), 6, "six evenings are listed");
      assert.equal(await page.locator(".night:disabled").count(), 5, "later evenings stay locked");
      await page.locator(".night").first().click();
      await page.locator("#kotatsu").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.__mikan && window.__mikan.getNight() === "first");
      const kotatsu = await page.locator("#kotatsu").boundingBox();
      assert.ok(kotatsu && kotatsu.height > 80, "the kotatsu has room for a mikan");
      await page.mouse.click(kotatsu.x + 5, kotatsu.y + kotatsu.height * 0.55);
      await page.locator("#dialogTitle").waitFor({ state: "visible", timeout: 5000 });
      assert.match(await page.locator("#dialog").innerText(), /真ん中に近いところへ置いてみよう/,
        "失敗した子にも、次に試す置き方が伝わる");
      await page.locator("#retryBtn").click();
      await page.mouse.click(kotatsu.x + kotatsu.width / 2, kotatsu.y + kotatsu.height * 0.55);
      await page.locator("#dialogTitle").waitFor({ state: "visible", timeout: 5000 });
      assert.equal(await page.locator("#dialogTitle").innerText(), "最初の晩", "the first mikan stays on the kotatsu");
      const mikanFit = await page.evaluate(() => ({
        width: innerWidth,
        html: document.documentElement.scrollWidth,
        tools: document.querySelector(".tools").getBoundingClientRect().bottom,
        height: innerHeight,
        canvas: document.querySelector("#kotatsu").width
      }));
      assert.ok(mikanFit.html <= mikanFit.width + 1, "mikan has no horizontal overflow");
      assert.ok(mikanFit.tools <= mikanFit.height + 1, "mikan controls fit on screen");
      assert.ok(mikanFit.canvas > 50, "mikan canvas is sized");
      await page.locator("#letterMap").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.match(await page.locator("#mapProgress").innerText(), /1 \/ 6/);
      await page.locator("#mapBack").click();
      await page.locator("#title .back").click();
      await page.locator("#grokShelf").waitFor({ state: "visible" });
      await page.locator("#openHebi").click();
      await page.locator("#title").waitFor({ state: "visible" });
      assert.equal((await page.locator("#title h1").innerText()).replace(/\s/g, ""), "HEBI");
      await page.locator("#startBtn").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.equal(await page.locator(".vault").count(), 7, "seven rooms are listed");
      assert.equal(await page.locator(".vault:disabled").count(), 6, "later rooms stay locked");
      await page.locator(".vault").first().click();
      await page.locator("#floor").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.__hebi && window.__hebi.getRoom() === "face");
      const floor = await page.locator("#floor").boundingBox();
      assert.ok(floor && floor.height > 80, "the storehouse floor has room for the snake");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowDown");
      await page.locator("#dialogTitle").waitFor({ state: "visible", timeout: 5000 });
      assert.equal(await page.locator("#dialogTitle").innerText(), "顔を出す", "the snake reaches the first door");
      const hebiFit = await page.evaluate(() => ({
        width: innerWidth,
        html: document.documentElement.scrollWidth,
        tools: document.querySelector(".tools").getBoundingClientRect().bottom,
        height: innerHeight,
        canvas: document.querySelector("#floor").width
      }));
      assert.ok(hebiFit.html <= hebiFit.width + 1, "hebi has no horizontal overflow");
      assert.ok(hebiFit.tools <= hebiFit.height + 1, "hebi controls fit on screen");
      assert.ok(hebiFit.canvas > 50, "hebi canvas is sized");
      await page.locator("#letterMap").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.match(await page.locator("#mapProgress").innerText(), /1 \/ 7/);
      await page.locator("#mapBack").click();
      await page.locator("#title .back").click();
      await page.locator("#grokShelf").waitFor({ state: "visible" });
      await page.locator("#openKake").click();
      await page.locator("#title").waitFor({ state: "visible" });
      assert.equal((await page.locator("#title h1").innerText()).replace(/\s/g, ""), "KAKE");
      await page.locator("#startBtn").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.equal(await page.locator(".roof").count(), 6, "six roofs are listed");
      assert.equal(await page.locator(".roof:disabled").count(), 5, "later roofs stay locked");
      await page.locator(".roof").first().click();
      await page.locator("#roof").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.__kake && window.__kake.getRoof() === "eave");
      const roof = await page.locator("#roof").boundingBox();
      assert.ok(roof && roof.height > 80, "the roof has room to run");
      await page.keyboard.down("ArrowRight");
      await page.waitForFunction(() => window.__kake.x() > 260, null, { timeout: 4000 });
      await page.keyboard.press("ArrowUp");
      await page.locator("#dialogTitle").waitFor({ state: "visible", timeout: 8000 });
      await page.keyboard.up("ArrowRight");
      assert.equal(await page.locator("#dialogTitle").innerText(), "軒", "the runner reaches the first lantern");
      const kakeFit = await page.evaluate(() => ({
        width: innerWidth,
        html: document.documentElement.scrollWidth,
        tools: document.querySelector(".tools").getBoundingClientRect().bottom,
        height: innerHeight,
        canvas: document.querySelector("#roof").width
      }));
      assert.ok(kakeFit.html <= kakeFit.width + 1, "kake has no horizontal overflow");
      assert.ok(kakeFit.tools <= kakeFit.height + 1, "kake controls fit on screen");
      assert.ok(kakeFit.canvas > 50, "kake canvas is sized");
      await page.locator("#letterMap").click();
      await page.locator("#map").waitFor({ state: "visible" });
      assert.match(await page.locator("#mapProgress").innerText(), /1 \/ 6/);
      await page.locator("#mapBack").click();
      await page.locator("#title .back").click();
      await page.locator("#grokShelf .back").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      await page.locator("#openCodeBtn").click();
      await page.locator("#codeHub").waitFor({ state: "visible" });
      await page.locator("#codeHubRelay").click();
      await page.locator("#codeTitle").waitFor({ state: "visible" });
      assert.equal(await page.locator("#codeTitle .code-logo").innerText(), "RELAY//");
      await page.locator("#codeStartBtn").click();
      await page.locator("#codeSelect").waitFor({ state: "visible" });
      assert.equal(await page.locator("#codeStageGrid .code-stage").count(), 15, "fifteen stages listed");
      await page.locator("#codeStageGrid .code-stage").first().click();
      await page.locator("#codePlay").waitFor({ state: "visible" });
      assert.equal(await page.locator("#codeStageNo").innerText(), "STAGE 01");
      if (target.name === "landscape") {
        const room = await page.evaluate(() => ({
          panel:document.querySelector('.code-panel').getBoundingClientRect().left,
          meters:document.querySelector('.code-meters').getBoundingClientRect().right,
          width:innerWidth
        }));
        assert.ok(room.panel >= room.width * .4 && room.meters <= room.panel + 1, "the board has its own space beside the editor");
      }
      const relayCanvas = await page.locator("#codeWorld").evaluate(el => ({
        width: el.width, height: el.height, hidden: el.classList.contains("hidden"),
        active: document.body.classList.contains("code-active")
      }));
      assert.ok(relayCanvas.width > 0 && relayCanvas.height > 0, "relay canvas sized");
      assert.ok(!relayCanvas.hidden && relayCanvas.active, "relay canvas is live over the launcher");
      await page.locator('.code-key[data-act="fwd"]').click();
      await page.locator('.code-key[data-act="fwd"]').click();
      assert.equal(await page.locator("#codeProgramCount").innerText(), "2 / 8");
      await page.locator("#codeRunBtn").click();
      await page.locator("#codeOverlay .code-card").waitFor({ state: "visible", timeout: 8000 });
      assert.match(await page.locator("#codeOverlay .code-card h2").innerText(), /STAGE 01/);
      const relayStars = await page.evaluate(() => JSON.parse(localStorage.getItem("relay-progress-v1") || "{}").stars || null);
      assert.equal(relayStars && relayStars["1"], 3, "clearing stage 01 stores three stars");
      // Escape closes the clear card and returns to stage select without leaving the card behind.
      await page.keyboard.press("Escape");
      await page.locator("#codeSelect").waitFor({ state: "visible" });
      await page.locator("#codeOverlay .code-card").waitFor({ state: "hidden" });
      assert.ok(await page.locator("#codeStageGrid .code-stage").first().innerText(), "first stage is listed again");
      // Clearing again and leaving through the card's own button still works.
      await page.locator("#codeStageGrid .code-stage").first().click();
      await page.locator('.code-key[data-act="fwd"]').click();
      await page.locator('.code-key[data-act="fwd"]').click();
      await page.locator("#codeRunBtn").click();
      await page.locator("#codeOverlay .code-card").waitFor({ state: "visible", timeout: 8000 });
      await page.locator("#codeOverlay .code-card .sub").last().click();
      await page.locator("#codeSelect").waitFor({ state: "visible" });
      // 長いプログラムを実行したとき、いま実行している行がリストの見える位置へ追従する。
      await page.locator("#codeStageGrid .code-stage").first().click();
      await page.locator("#codeRepBtn").press("Enter");
      await page.locator("#codeProgram li").first().press("Enter");
      await page.locator("#codeProgram li").first().press("Space");
      assert.match(await page.locator("#codeProgram li").first().innerText(), /×4/);
      await page.locator("#codeClearBtn").press("Enter");
      assert.equal(await page.locator("#codeProgramCount").innerText(), "0 / 8", "Enter clears rather than running the program");
      for (let i = 0; i < 8; i++) await page.locator('.code-key[data-act="wait"]').click();

      // 何行目まで実行すればスクロールが起きるかは、画面サイズで変わる。
      // 画面幅を固定した「4行目」で待つと、縦に広い画面ではその行が最初から
      // 見えているため、スクロールしないままになって検査が成立しない。
      // ここでは「中央に送ったときにスクロールが発生する最初の行」を選ぶ。
      const followTarget = await page.evaluate(() => {
        const wrap = document.querySelector(".code-program-wrap");
        const rows = Array.from(document.querySelectorAll("#codeProgram li"));
        const maxScroll = wrap.scrollHeight - wrap.clientHeight;
        const index = rows.findIndex(row => {
          const inner = row.offsetTop - wrap.offsetTop - wrap.clientTop;
          const target = inner - wrap.clientHeight / 2 + row.clientHeight / 2;
          return target > 0;
        });
        return { index, maxScroll };
      });
      assert.ok(followTarget.maxScroll > 0, "the command list is longer than its visible area");
      assert.ok(followTarget.index >= 0, "some command row needs the list to scroll");

      const follow = page.evaluate(target => new Promise(resolve => {
        const started = performance.now();
        const check = () => {
          const rows = Array.from(document.querySelectorAll("#codeProgram li"));
          const row = rows[target];
          if (row && row.classList.contains("now")) {
            const wrap = document.querySelector(".code-program-wrap");
            const wrapRect = wrap.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            resolve({ scrollTop: wrap.scrollTop, center: rowRect.top - wrapRect.top + rowRect.height / 2, height: wrapRect.height });
          } else if (performance.now() - started > 9000) {
            resolve({ timeout: true });
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      }), followTarget.index);
      await page.locator("#codeRunBtn").click();
      const followState = await follow;
      assert.ok(followState && !followState.timeout, "the scroll-triggering command ran while the list was scrollable");
      assert.ok(followState.scrollTop > 0, "a long program scrolls the command list");
      assert.ok(Math.abs(followState.center - followState.height / 2) <= 16, "the running row stays near the middle of the list");
      await page.keyboard.press("Escape");
      await page.locator("#codeSelect").waitFor({ state: "visible" });
      await page.locator("#codeSelectBack").click();
      await page.locator("#codeTitle").waitFor({ state: "visible" });
      await page.locator("#codeReturnBtn").click();
      await page.locator("#codeHub").waitFor({ state: "visible" });
      await page.locator("#codeHubBack").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(await page.locator("#openGameBtn").isVisible(), "launcher entries remain usable");
      assert.ok(!(await page.locator("#codeTitle").isVisible()), "relay title is hidden after leaving the game");

      // 玄人コードの2作目 ECHO。たなから塔へ入り、第1階の正解（→→→→↓↓）を実際のキー入力で通す。
      await page.locator("#openCodeBtn").click();
      await page.locator("#codeHub").waitFor({ state: "visible" });
      await page.locator("#codeHubEcho").click();
      await page.locator("#title").waitFor({ state: "visible" });
      assert.equal(await page.locator("#title h1").innerText(), "ECHO");
      await page.locator("#start").click();
      await page.locator("#play").waitFor({ state: "visible" });
      assert.equal(await page.locator("#floorName").innerText(), "第1階 · めざめ");
      assert.match(await page.locator("#floorNote").innerText(), /ゴール.*めざそう/,
        "ECHO は各階の目的をプレイ画面に残す");
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).color), "rgb(233, 237, 255)",
        "ECHO の明るい文字色が CSS で適用され、説明文を読める");
      for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
      for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
      await page.locator("#modal:not([hidden])").waitFor({ state: "visible", timeout: 8000 });
      assert.equal(await page.locator("#modalTitle").innerText(), "きろく された。");
      // つぎの階へ。クリア済みの盤面が残らず、第2階が最初から始まる。
      await page.locator('#modal [data-ui="next"]').click();
      await page.locator("#floorName").filter({ hasText: "第2階" }).waitFor({ state: "visible" });
      assert.equal(await page.locator("#floorName").innerText(), "第2階 · かど");
      assert.equal(await page.locator("#turnCount").innerText(), "0", "the next floor starts fresh");
      // 一覧へ戻り、10枚のカードと第1階の★を確認する。
      await page.locator("#playBack").click();
      await page.locator("#floors").waitFor({ state: "visible" });
      assert.equal(await page.locator("#floorGrid .floor-card").count(), 10, "ten floors listed");
      assert.match(await page.locator("#floorGrid .floor-card").first().innerText(), /★/);
      await page.locator("#floorsBack").click();
      await page.locator("#title").waitFor({ state: "visible" });
      await page.locator("#title .back-link").click();
      await page.locator("#codeHub").waitFor({ state: "visible" });
      await page.locator("#codeHubBack").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(!(await page.locator("#codeHub").isVisible()), "the shelf hides after leaving code");

      // RELAY を出たあとも LUMINA の操作（ポーズ）がつづけられる。
      await page.locator("#openGameBtn").click();
      await page.locator(".gallery .work.lumina").click();
      await page.locator("#startBtn").click();
      await page.locator("#mobileControls").waitFor({ state: "visible" });
      await page.locator("#pauseBtn").click();
      await page.locator("#overlay").waitFor({ state: "visible" });
      await page.locator("#resume").click();
      await page.locator("#mobileControls").waitFor({ state: "visible" });

      // SYNC// 共鳴（Minimax M3.1）。章を最後まで叩き、結果と共鳴選択まで通す。
      await page.goto("http://127.0.0.1:8000/", { waitUntil: "domcontentloaded" });
      await page.locator("#launcher").waitFor({ state: "visible" });
      await page.locator("#openSyncBtn").click();
      await page.locator("#syncTitle").waitFor({ state: "visible" });
      assert.match(await page.locator("#syncTitle .sync-logo").innerText(), /SYNC/);
      await page.locator("#syncTitleHowBtn").click();
      await page.locator("#syncOverlay .sync-card").waitFor({ state: "visible" });
      assert.match(await page.locator("#syncOverlay").innerText(), /長い光は/);
      await page.locator('#syncOverlay [data-action="close"]').click();
      await page.locator("#syncOverlay").waitFor({ state: "hidden" });
      await page.locator("#syncTitle").waitFor({ state: "visible" });
      await page.locator("#syncStartBtn").click();
      await page.locator("#syncPlay").waitFor({ state: "visible" });
      await page.locator("#syncHowBtn").click();
      const helpTop = await page.locator("#syncOverlay .sync-card").evaluate(el => el.getBoundingClientRect().top);
      assert.ok(helpTop >= 0, "the top of a long explanation remains scrollable into view");
      await page.locator("#syncOverlay .sync-primary").click();

      // 画面が実際に描かれていること。真っ白や単色で塗られていないか。
      const arena = await page.evaluate(() => {
        const canvas = document.getElementById("syncWorld");
        const ctx = canvas.getContext("2d");
        const at = (x, y) => {
          const d = ctx.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        // Spread the samples inside the top-left corner instead of taking four
        // points. On a wide canvas all four corner points land on the same
        // background tone, so the old check measured where the gradient
        // happened to fall rather than whether one exists; a corner that is
        // itself varied is a texture whatever the aspect ratio is, and it
        // stays clear of the rings and the hit effects in the middle.
        const points = [];
        for (let gy = 0; gy < 4; gy++) {
          for (let gx = 0; gx < 4; gx++) points.push(at(0.05 + gx * 0.05, 0.06 + gy * 0.05));
        }
        return { points, flash: window.__sync.getFlash() };
      });
      const unique = new Set(arena.points.map(p => p.join(",")));
      assert.ok(unique.size >= 2, "the arena background is textured rather than a flat fill: " + JSON.stringify(arena.points));
      assert.ok(arena.points.every(p => p[0] < 200 && p[1] < 220), "the arena background stays dark: " + JSON.stringify(arena.points));
      assert.ok(arena.flash < 0.5, "the hit flash decays instead of running away");
      assert.ok(!(await page.locator("#syncHint").evaluate(el => el.classList.contains("fade"))),
        "最初の章の操作説明は、最初の成功まで残る");

      // 譜面どおりに叩いて2章目まで進める（実際の play と同じ道を通す）
      const played = await page.evaluate(() => window.__sync.autoPlay());
      assert.ok(played.cleared, "a perfectly timed run clears the chapter");
      await page.locator("#syncOverlay .sync-card").waitFor({ state: "visible" });
      assert.match(await page.locator("#syncOverlay h2").innerText(), /越えた/);

      // 共鳴を選んで次の章へ
      await page.locator("#syncOverlay .sync-primary").click();
      await page.locator("#syncOverlay .sync-offer").first().waitFor({ state: "visible" });
      const offers = await page.locator("#syncOverlay .sync-offer").count();
      assert.ok(offers >= 2, "at least two resonances are offered");
      await page.locator("#syncOverlay .sync-offer").first().click();
      await page.waitForFunction(() => window.__sync.getChapter() === 1, null, { timeout: 5000 });
      assert.ok(!(await page.locator("#syncHint").evaluate(el => el.classList.contains("fade"))),
        "次の章では新しい説明が表示される");
      // どれが出たかは抽選なので、増えた数と既に持っているものでないことだけを見る。
      const chosen = await page.evaluate(() => window.__sync.getUpgrades());
      assert.equal(chosen.length, 1, "共鳴をちょうど一つ持ち歩く");
      const known = await page.evaluate(() => window.SyncSim.RESONANCES.map(r => r.id));
      assert.ok(known.includes(chosen[0]), "未知の共鳴 ID ではない: " + chosen[0]);
      assert.equal(await page.evaluate(() => window.__sync.getGame().chapterIndex), 1);

      // 一時停止 → 再開
      await page.locator("#syncPauseBtn").click();
      await page.locator("#syncOverlay").waitFor({ state: "visible" });
      await page.locator("#syncOverlay .sync-primary").click();
      await page.locator("#syncOverlay").waitFor({ state: "hidden" });
      if (target.name === "desktop") {
        for (let chapter = 1; chapter < 5; chapter++) {
          const result = await page.evaluate(() => window.__sync.autoPlay());
          assert.ok(result.cleared, "SYNC chapter " + (chapter + 1) + " clears through the controller");
          if (chapter < 4) {
            await page.locator("#syncOverlay .sync-primary").click();
            await page.locator("#syncOverlay .sync-offer").first().click();
          } else {
            await page.locator("#syncOverlay h2").filter({hasText:"共鳴 は、届いた"}).waitFor({state:"visible"});
            assert.equal(await page.evaluate(() => window.__sync.getRecord().clears), 1);
          }
        }
      }

      // タイトル → Test prim へ戻る
      await page.evaluate(() => window.__sync.goTitle());
      await page.locator("#syncTitle").waitFor({ state: "visible" });
      await page.locator("#syncReturnBtn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(!(await page.locator("#syncTitle").isVisible()), "sync title hides after leaving");

      // HELIX // 螺旋（Minimax M3.1 の二作目）。入口、描画、実入力でのクリアまで通す。
      await page.goto("http://127.0.0.1:8000/", { waitUntil: "domcontentloaded" });
      await page.locator("#launcher").waitFor({ state: "visible" });
      const helixLabels = await page.locator("#helixOpenBtn .launcher-button-label strong").innerText();
      assert.equal(helixLabels, "Minimax M3.1", "HELIX の入口は Minimax M3.1");
      await page.locator("#helixOpenBtn").click();
      await page.locator("#helixTitle").waitFor({ state: "visible" });
      assert.equal(await page.locator("#helixTitle h1").innerText(), "HELIX");
      assert.ok(!(await page.locator("#helixPlay").isVisible()), "タイトル中はプレイ画面が見えない");

      // The return button is the only way off the title screen, so check it here
      // rather than after five stages: a centred column that overflows above the
      // scroll origin left this unclickable on a landscape phone.
      await page.locator("#helixReturnBtn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(!(await page.locator("#helixTitle").isVisible()), "returns to the launcher from a fresh title");
      await page.locator("#helixOpenBtn").click();
      await page.locator("#helixTitle").waitFor({ state: "visible" });

      // Stage select is opened from the title, so its overlay cannot live inside
      // the hidden play screen: nested there it rendered at zero height.
      await page.locator("#helixStagesBtn").click();
      await page.locator("#helixOverlay").waitFor({ state: "visible" });
      assert.equal(await page.locator("#helixOverlay .helix-stage-btn").count(), 5, "五つの段が並ぶ");
      assert.ok(await page.locator("#helixOverlay .helix-card").isVisible(), "段選択のカードが見えている");
      assert.ok(!(await page.locator("#helixOverlay").innerText()).includes("undefined"),
        "段選択のカードに未定義の文字列が出ない");
      await page.locator("#helixOverlay .helix-ghost").click();
      await page.locator("#helixTitle").waitFor({ state: "visible" });

      await page.locator("#helixStartBtn").click();
      await page.locator("#helixPlay").waitFor({ state: "visible" });
      assert.ok(!(await page.locator("#helixTitle").isVisible()), "プレイ中はタイトルが見えない");
      assert.equal(await page.locator("#helixStageNo").innerText(), "STAGE 01");

      // 画面が実際に描かれていること。真っ白や単色で塗られていないか。
      await page.waitForTimeout(250);
      const painted = await page.evaluate(() => window.__helix.painted());
      assert.ok(painted.samples > 0, "キャンバスが実寸である");
      assert.ok(painted.lime > 50,
        "ステージの足場（ライム）が描かれている: " + JSON.stringify(painted));
      assert.equal(await page.locator("#helixZoomBtn").innerText(), target.hasTouch ? "全体" : "拡大");
      await page.locator("#helixZoomBtn").click();
      assert.equal(await page.locator("#helixZoomBtn").innerText(), target.hasTouch ? "拡大" : "全体");
      await page.locator("#helixZoomBtn").click();

      // タッチ端末では、右半分の一回のタップが跳躍、連打がダッシュになる。
      // これが崩れると序盤の梯子が一切登れなくなるので、実タッチで確認する。
      if (target.hasTouch) {
        const cdp = await context.newCDPSession(page);
        const box = await page.locator("#helixWorld").boundingBox();
        const tap = (type) => cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? []
            : [{ x: box.x + box.width * 0.78, y: box.y + box.height * 0.7, id: 1 }],
        });
        await page.evaluate(() => { for (let i = 0; i < 70; i++) window.__helix.tick(); });
        const ground = await page.evaluate(() => window.__helix.getState().player.y);
        await tap("touchStart");
        let peak = ground;
        for (let i = 0; i < 24; i++) {
          await page.evaluate(() => window.__helix.tick());
          peak = Math.min(peak, await page.evaluate(() => window.__helix.getState().player.y));
        }
        await tap("touchEnd");
        const afterTap = await page.evaluate(() => {
          const p = window.__helix.getState().player;
          return { jumps: p.jumps, dashes: p.dashes };
        });
        assert.ok(ground - peak > 8, "右半分のタップで跳ぶ: " + JSON.stringify({ rise: ground - peak }));
        assert.equal(afterTap.dashes, 0, "一回のタップでダッシュしない");

        // 連打がダッシュになる条件は、二打目が窓の中に入ること。
        // 先に、間隔を置いた二打ではダッシュにならないことを確かめる。
        await page.waitForTimeout(400);
        await tap("touchStart"); await tap("touchEnd");
        await page.waitForTimeout(400);
        await tap("touchStart"); await page.evaluate(() => window.__helix.tick()); await tap("touchEnd");
        const afterSlow = await page.evaluate(() => window.__helix.getState().player.dashes);
        assert.equal(afterSlow, afterTap.dashes, "間隔を置いた二打はダッシュしない");

        // 続いて窓の中に二打する。入力は一つずつ待たずにまとめて送る。
        // 待つと通信の往復だけで間隔が伸び、窓の中であればあるべき状態が外れる。
        await page.waitForTimeout(400);
        let peakVx = 0;
        await Promise.all([tap("touchStart"), tap("touchEnd"), tap("touchStart")]);
        for (let i = 0; i < 12; i++) {
          await page.evaluate(() => window.__helix.tick());
          peakVx = Math.max(peakVx, Math.abs(await page.evaluate(() => window.__helix.getState().player.vx)));
        }
        await tap("touchEnd");
        const afterDouble = await page.evaluate(() => window.__helix.getState().player.dashes);
        assert.equal(afterDouble, afterSlow + 1, "右半分の連打でダッシュする");
        assert.ok(peakVx > 300, "ダッシュ中は最高速度を超える: " + Math.round(peakVx));

        // A platformer must allow both thumbs at once: keep walking with the
        // left thumb while the right one jumps, then lift only the right.
        await page.evaluate(() => { window.__helix.start(0); for (let i = 0; i < 70; i++) window.__helix.tick(); });
        const left = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.7, id: 2 };
        const right = { x: box.x + box.width * 0.78, y: box.y + box.height * 0.7, id: 3 };
        const beforeBoth = await page.evaluate(() => ({ x: window.__helix.getState().player.x, y: window.__helix.getState().player.y }));
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left, right] });
        let highBoth = beforeBoth.y;
        for (let i = 0; i < 20; i++) {
          await page.evaluate(() => window.__helix.tick());
          highBoth = Math.min(highBoth, await page.evaluate(() => window.__helix.getState().player.y));
        }
        const movingX = await page.evaluate(() => window.__helix.getState().player.x);
        assert.ok(movingX > beforeBoth.x + 8, "左指で移動しながら右指を使える");
        assert.ok(highBoth < beforeBoth.y - 8, "二本指でも右指で跳べる");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [right] });
        assert.equal(await page.evaluate(() => window.__helix.getInput().right), true,
          "右指を離しても左指の移動入力は残る");
        for (let i = 0; i < 8; i++) await page.evaluate(() => window.__helix.tick());
        assert.ok(await page.evaluate(x => window.__helix.getState().player.x > x, movingX), "右指を離しても左指の移動は続く");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [left] });
        assert.equal(await page.evaluate(() => window.__helix.getInput().right), false,
          "左指を離すと移動入力が消える");
      }

      // 一時停止 → 再開
      await page.locator("#helixPauseBtn").click();
      await page.locator("#helixOverlay").waitFor({ state: "visible" });
      await page.locator("#helixOverlay .helix-primary").click();
      await page.locator("#helixOverlay").waitFor({ state: "hidden" });

      // 添えられたスクリプトを、プレイヤーと同じ入力経路で再生してクリアする。
      for (let stage = 0; stage < 5; stage++) {
        const result = await page.evaluate((i) => window.__helix.replayScript(i), stage);
        assert.ok(result.finished,
          "STAGE " + (stage + 1) + " をブラウザ側の入力でクリアできない");
        assert.equal(result.deaths, 0, "STAGE " + (stage + 1) + " で死んだ");
        await page.locator("#helixOverlay").waitFor({ state: "visible" });
        await page.waitForTimeout(500);
      }
      // the last stage ends on the epilogue, not on stage select
      assert.match(await page.locator("#helixOverlay h2").innerText(), /てっぺんに到着/);
      await page.locator("#helixOverlay .helix-ghost").click();
      await page.locator("#helixTitle").waitFor({ state: "visible" });
      assert.match(await page.locator("#helixRecord").innerText(), /全段クリア/);

      await page.locator("#helixReturnBtn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(!(await page.locator("#helixTitle").isVisible()), "helix title hides after leaving");

      // AFTERTIDE lives on a separate page so the other games' inputs and audio remain isolated.
      await page.locator("#openSolBtn").click();
      await page.locator("#author").waitFor({ state: "visible" });
      await page.getByRole("link", {name:"SKYWARD 蒼穹の帰路を開く"}).click();
      await page.locator("#loading").waitFor({state:"hidden"});
      await page.locator("#launchBtn").click();
      // #flightUI は絶対配置の子だけを持つ器なので、コンテナ自身は高さ 0 になる。
      // 見えるものを確かめるなら、器ではなく中の操作ボタンを見る。
      await page.locator("#gunBtn").waitFor({state:"visible"});
      assert.equal(await page.locator("#flightUI").getAttribute("hidden"), null, "flight UI is switched on");
      await page.keyboard.down("Space");
      await page.waitForFunction(() => Number(document.querySelector("#gunBtn small").textContent) < 650);
      await page.keyboard.up("Space");
      const flightFit = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight, html: document.documentElement.scrollWidth,
        canvas: document.querySelector("#world").width,
        controls: [...document.querySelectorAll("#flightUI button,#flightUI input")].map(el=>{
          const r=el.getBoundingClientRect();return {id:el.id,top:r.top,bottom:r.bottom,left:r.left,right:r.right};
        })
      }));
      assert.ok(flightFit.canvas>0, "3D renderer initializes");
      assert.ok(flightFit.html<=flightFit.width+1, "flight has no horizontal overflow");
      assert.ok(flightFit.controls.every(r=>r.left>=-1&&r.right<=flightFit.width+1&&r.top>=0&&r.bottom<=flightFit.height+1), "all flight controls fit: "+JSON.stringify(flightFit));
      await page.locator("#gearBtn").click();
      // updateUI は 0.1 秒周期で走るので、一度だけ読むのではなくクラスが付くまで待つ。
      await page.waitForFunction(() => document.querySelector("#gearBtn").classList.contains("active"), null, { timeout: 2000 });
      await page.locator("#pauseBtn").click();
      await page.locator("#continueFlight").click();
      assert.equal(await page.evaluate(()=>document.activeElement.id), "world", "pause resumes keyboard flight focus");
      await page.locator("#perfBtn").click();
      await page.locator("#setQuality").selectOption("low");
      await page.getByRole("button", {name:"設定を保存"}).click();
      assert.equal(await page.evaluate(()=>document.activeElement.id), "world", "settings resumes flight focus");
      await page.locator("#helpBtn").click();
      await page.getByRole("button", {name:"わかった、空へ"}).click();
      await page.locator("#pauseBtn").click();
      await page.reload();
      await page.locator("#resumeSortie").click();
      assert.ok(Number(await page.locator("#gunBtn small").innerText())<650, "reload restores ammunition and the same sortie");
      await page.locator("#flightBack").click();
      await page.locator("#author").waitFor({state:"visible"});
      await page.getByRole("link", {name:"AFTERTIDE 潮の郵便屋を開く"}).click();
      await page.locator("#title").waitFor({ state: "visible" });
      await page.locator("#start").click();
      await page.locator('[data-ui="embark"]').click();
      await page.keyboard.press("Space");
      await page.waitForFunction(() => document.querySelector("#play").dataset.busy === "false");
      assert.equal(await page.locator("#play").getAttribute("data-tide"), "1", "Space anchors from the initial keyboard focus");
      await page.locator("#undo").click();
      await page.waitForFunction(() => document.querySelector("#play").dataset.busy === "false");
      const seaFit = await page.evaluate(() => ({
        width: innerWidth, html: document.documentElement.scrollWidth,
        panelBottom: document.querySelector(".logbook").getBoundingClientRect().bottom,
        height: innerHeight, area: document.querySelector("#boardArea").getBoundingClientRect().height
      }));
      assert.ok(seaFit.html <= seaFit.width + 1, "aftertide has no horizontal overflow");
      assert.ok(seaFit.panelBottom <= seaFit.height + 1, "all sailing controls fit");
      assert.ok(seaFit.area > 120, "the sea retains a usable board area");
      await page.locator('[data-action="E"]').first().click();
      await page.waitForFunction(() => document.querySelector("#play").dataset.busy === "false");
      assert.equal(await page.locator("#turnCount").innerText(), "1");
      await page.reload();
      await page.locator("#start").click();
      assert.equal(await page.locator("#turnCount").innerText(), "1", "reload resumes the boat's position");
      await page.locator("#undo").click();
      await page.waitForFunction(() => document.querySelector("#play").dataset.busy === "false");
      assert.equal(await page.locator("#turnCount").innerText(), "0", "history survives reload");
      await page.locator("#hint").click();
      await page.locator('[data-ui="hint-all"]').click();
      assert.equal(await page.locator(".dpad .hinted").getAttribute("data-action"), "E");
      const tideRules = require("../sol/sim.js"), seaLevels = require("../sol/levels.js").map(tideRules.parse);
      const limit = target.name === "desktop" ? 18 : 1;
      for (let voyage = 0; voyage < limit; voyage++) {
        const route = tideRules.solve(seaLevels[voyage], undefined, true);
        for (const action of route) {
          await page.locator('.dpad [data-action="' + action + '"]').click();
          await page.waitForFunction(() => document.querySelector("#play").dataset.busy === "false");
        }
        await page.locator('.result-stamp.gold').waitFor({ state: "visible" });
        assert.equal(await page.locator(".result-stats b").first().innerText(), String(route.length));
        if (voyage + 1 < limit) {
          await page.locator('[data-ui="next"]').click();
          if ((voyage + 1) % 6 === 0) await page.locator('[data-ui="embark"]').click();
        }
      }
      if (limit === 18) {
        await page.locator('[data-ui="next"]').click();
        await page.locator('[data-ui="result-chart"]').click();
        assert.match(await page.locator("#chartProgress").innerText(), /54 \/ 54/);
      } else {
        await page.locator('[data-ui="result-chart"]').click();
      }
      await page.locator("#chartBack").click();
      await page.locator('.title-top a').click();
      await page.getByRole("link", {name:"‹ Test prim",exact:true}).click();
      await page.locator("#launcher").waitFor({state:"visible"});

      // Check LUNA's first authored route through a real drag
      // at every viewport size, including the smallest phone.
      await page.locator("#openLunaBtn").click();
      await page.locator("#title").waitFor({state:"visible"});
      await page.locator('#title [data-action="start"]').click();
      await page.locator("#routeList .route-card").first().click();
      await page.locator('#dialog [data-action="close"]').click();
      await page.waitForTimeout(600); // Let the play view's entrance transition finish before measuring the canvas.
      const ship = await page.locator("#field").evaluate(el => {
        const r = el.getBoundingClientRect(), s = Math.min(r.width / 1000, r.height / 620);
        const x = (r.width - 1000 * s) / 2, y = (r.height - 620 * s) / 2;
        return { x: r.x + x + 105 * s, y: r.y + y + 310 * s, scale: s };
      });
      await page.mouse.move(ship.x, ship.y);
      await page.mouse.down();
      await page.mouse.move(ship.x + 310 * ship.scale, ship.y, {steps: 8});
      await page.mouse.up();
      await page.locator('#modal:not([hidden])').waitFor({state:"visible",timeout:8000});
      assert.equal(await page.locator("#dialogTitle").innerText(), "灯りが、届いた。", `${target.name}: ${await page.locator("#dialogTitle").innerText()} (${await page.locator("#shardCount").innerText()})`);
      assert.equal(await page.locator(".dialog-stat b").first().innerText(), "3 / 3", "the first route collects every shard");
      await page.locator('#dialog [data-action="map"]').click();
      assert.match(await page.locator("#mapProgress").innerText(), /1 \/ 12/);
      await page.locator('#map [data-action="title"]').click();
      await page.locator('#title .back').click();
      await page.locator("#launcher").waitFor({state:"visible"});

      // REPRISE lives on its own page. Perform the first scene with its optional
      // fragment, then confirm that a partially recorded scene survives reload.
      await page.locator("#openGpt6SolBtn").click();
      await page.locator("#titleScreen").waitFor({state:"visible"});
      await page.locator("#startBtn").click();
      await page.locator('#dialog [data-dialog="close"]').waitFor({state:"visible"});
      await page.locator('#dialog [data-dialog="close"]').click();
      const repriseFit = await page.evaluate(() => ({
        width: innerWidth, html: document.documentElement.scrollWidth,
        board: document.querySelector("#board").getBoundingClientRect().width,
        controls: document.querySelector(".play-lower").getBoundingClientRect().bottom,
        height: innerHeight
      }));
      assert.ok(repriseFit.html <= repriseFit.width + 1, "reprise has no horizontal overflow");
      assert.ok(repriseFit.board >= 240, "reprise board remains legible");
      assert.ok(repriseFit.controls <= repriseFit.height + 1, "reprise controls fit on screen");
      for (const action of "DDD") await page.locator('[data-move="' + action + '"]').click();
      assert.ok(await page.locator("#recordBtn").isEnabled());
      await page.locator("#recordBtn").click();
      for (const action of "RRWRRRDDUUR") await page.locator('[data-move="' + action + '"]').click();
      await page.locator('#dialog [data-dialog="next"]').waitFor({state:"visible"});
      assert.match(await page.locator(".result-line").innerText(), /一歩は、消えない/);
      await page.locator('#dialog [data-dialog="next"]').click();
      await page.locator('[data-move="R"]').click();
      await page.reload();
      await page.locator("#startBtn").click();
      assert.equal(await page.locator("#beatLabel").innerText(), "1 / 18", "reprise resumes a saved take");
      await page.locator(".return-link").click();
      await page.locator("#launcher").waitFor({state:"visible"});

      // MIZUHO (Opus 5.5): mend the broken aze of the first valley with a real
      // drag, let the water stand, plant, and bring in the harvest.
      await page.locator("#openOpusBtn").click();
      await page.locator("#title").waitFor({state:"visible"});
      await page.waitForFunction(() => window.__mizuho && window.__mizuho.state.screen === "title");
      await page.locator("#startBtn").click();
      await page.locator("#valleyList .valley").first().click();
      // the first time, grandmother's letter and the five-page guide come before the valley
      await page.locator('#dialog [data-dialog="go"]').click();
      for (let k = 0; k < 4; k++) await page.locator('#dialog [data-dialog="next"]').click();
      await page.locator('#dialog [data-dialog="done"]').click();
      await page.locator('#dialog [data-dialog="begin"]').click();
      // the coach walks a new player through the first valley, one step at a time
      await page.locator("#coach").waitFor({ state: "visible" });
      assert.match(await page.locator("#coachStep").innerText(), /1 \/ 6/);
      await page.locator('#coach [data-coach="next"]').click();
      await page.locator('.tool[data-tool="heap"]').click();
      await page.waitForFunction(() => /3 \/ 6/.test(document.querySelector("#coachStep").textContent));
      await page.waitForFunction(() => window.__mizuho && window.__mizuho.state.screen === "play");
      await page.waitForTimeout(300);
      const aze = await page.evaluate(() => {
        const w = window.__mizuho.world, S = window.MizuhoSim;
        const a = window.__mizuho.project(18.4, S.sampleGround(w, 18.4, 27), 27), b = window.__mizuho.project(21.6, S.sampleGround(w, 21.6, 27), 27);
        return { a, b };
      });
      assert.ok(aze.a && aze.b, "the broken aze is on screen");
      await page.mouse.move(aze.a.x, aze.a.y);
      await page.mouse.down();
      for (let k = 1; k <= 24; k++) { await page.mouse.move(aze.a.x + (aze.b.x - aze.a.x) * k / 24, aze.a.y + (aze.b.y - aze.a.y) * k / 24); await page.waitForTimeout(25); }
      await page.mouse.up();
      assert.ok(await page.evaluate(() => window.__mizuho.world.undoStack.length === 1), "the drag became one stroke of 盛る");
      await page.locator('[data-action="speed"]').click();
      await page.waitForFunction(() => window.MizuhoSim.forecast(window.__mizuho.world) >= 6, null, { timeout: 40000 });
      const mizuhoFit = await page.evaluate(() => ({
        width: innerWidth, html: document.documentElement.scrollWidth,
        toolbar: document.querySelector(".toolbar").getBoundingClientRect(), height: innerHeight
      }));
      assert.ok(mizuhoFit.html <= mizuhoFit.width + 1, "MIZUHO has no horizontal overflow");
      assert.ok(mizuhoFit.toolbar.bottom <= mizuhoFit.height + 1 && mizuhoFit.toolbar.right <= mizuhoFit.width + 1, "the tools fit on screen");
      await page.locator('[data-action="plant"]').click();
      // if the forecast dipped while the water settled, the game asks before planting
      if (await page.locator('#dialog [data-dialog="go"]').count()) await page.locator('#dialog [data-dialog="go"]').click();
      assert.ok(await page.evaluate(() => window.__mizuho.world.started && window.__mizuho.world.counts.planted > 0), "planting starts the year");
      await page.waitForFunction(() => /6 \/ 6/.test(document.querySelector("#coachStep").textContent), null, { timeout: 5000 });
      await page.evaluate(() => { const w = window.__mizuho.world; while (!w.finished) window.MizuhoSim.step(w, 1); });
      await page.locator('#dialog [data-dialog="select"]').waitFor({ state: "visible", timeout: 20000 });
      assert.match(await page.locator("#dialogTitle, #dialog h2").first().innerText(), /実る/);
      await page.locator('#dialog [data-dialog="select"]').click();
      assert.ok(await page.locator("#valleyList .valley").nth(1).isEnabled(), "the second valley opens");
      await page.locator('#select [data-action="title"]').click();
      await page.locator("#title .back-link").click();
      await page.locator("#launcher").waitFor({state:"visible"});

      assert.deepEqual(errors, [], "no browser script errors");
      console.log("PASS", target.name, JSON.stringify(metrics));
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
