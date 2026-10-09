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
      assert.deepEqual(errors, [], "no browser script errors");
      console.log("PASS", target.name, JSON.stringify(metrics));
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });