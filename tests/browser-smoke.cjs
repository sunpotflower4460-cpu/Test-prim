"use strict";
const assert = require("node:assert/strict");
const { chromium, devices } = require("playwright");
const targets = [
  { name: "iPhone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "small-phone", viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
];
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
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
      await page.locator("#openGameBtn").click();
      await page.locator("#home").waitFor({ state: "visible" });
      assert.equal(await page.locator("#home h1").innerText(), "LUMINA");
      await page.locator("#returnPortalBtn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      await page.locator("#openGameBtn").click();
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
      await page.locator("#launcher").waitFor({ state: "visible" });
      const entryLabels = await page.locator("#launcher .launcher-entries .launcher-button-label strong").allInnerTexts();
      assert.deepEqual(entryLabels, ["GPT6 CHAT", "Grok 4.7 Cursor", "玄人コード"], "launcher lists the three entries in order");
      const launcherFit = await page.evaluate(() => ({
        viewport: window.innerWidth,
        htmlWidth: document.documentElement.scrollWidth,
        htmlHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      }));
      assert.ok(launcherFit.htmlWidth <= launcherFit.viewport + 1, "launcher has no horizontal overflow");
      await page.locator("#openSumifuBtn").click();
      await page.locator("#sumifu-title").waitFor({ state: "visible" });
      assert.equal(await page.locator("#sumifu-title h1").innerText(), "KASANE");
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
      await page.locator("#sumifuPause").click();
      await page.locator("#sumifu-overlay").waitFor({ state: "visible" });
      await page.locator("#sumifuResume").click();
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
      await page.locator("#openCodeBtn").click();
      await page.locator("#codeTitle").waitFor({ state: "visible" });
      assert.equal(await page.locator(".code-logo").innerText(), "RELAY//");
      await page.locator("#codeStartBtn").click();
      await page.locator("#codeSelect").waitFor({ state: "visible" });
      assert.equal(await page.locator("#codeStageGrid .code-stage").count(), 15, "fifteen stages listed");
      await page.locator("#codeStageGrid .code-stage").first().click();
      await page.locator("#codePlay").waitFor({ state: "visible" });
      assert.equal(await page.locator("#codeStageNo").innerText(), "STAGE 01");
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
      await page.locator("#codeOverlay .code-card .sub").last().click();
      await page.locator("#codeSelect").waitFor({ state: "visible" });
      assert.ok(await page.locator("#codeStageGrid .code-stage").first().innerText(), "first stage is listed again");
      await page.locator("#codeSelectBack").click();
      await page.locator("#codeTitle").waitFor({ state: "visible" });
      await page.locator("#codeReturnBtn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(await page.locator("#openGameBtn").isVisible(), "launcher entries remain usable");
      assert.ok(!(await page.locator("#codeTitle").isVisible()), "relay title is hidden after leaving the game");

      // RELAY を出たあとも LUMINA の操作（ポーズ）がつづけられる。
      await page.locator("#openGameBtn").click();
      await page.locator("#startBtn").click();
      await page.locator("#mobileControls").waitFor({ state: "visible" });
      await page.locator("#pauseBtn").click();
      await page.locator("#overlay").waitFor({ state: "visible" });
      await page.locator("#resume").click();
      await page.locator("#mobileControls").waitFor({ state: "visible" });

      assert.deepEqual(errors, [], "no browser script errors");
      console.log("PASS", target.name, JSON.stringify(metrics));
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });