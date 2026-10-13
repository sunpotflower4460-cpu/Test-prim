"use strict";
// Browser check for おばちゃんの台所 (haiku/kitchen). Run it against a static server:
//   BASE=http://127.0.0.1:8102 NODE_PATH=$(npm root -g) CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/haiku-kitchen-browser.cjs
// Set SHOT_DIR to save screenshots. They are not written unless SHOT_DIR is set.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8102";
const PAGE = BASE + "/haiku/kitchen/index.html";
const SHOT_DIR = process.env.SHOT_DIR || "";
if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page, name) {
  if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, name) });
}

async function state(page) {
  return page.evaluate(() => window.obachanKitchenDebug.state());
}

async function waitFor(page, fn, arg, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const ok = await page.evaluate(fn, arg);
    if (ok) return true;
    if (Date.now() > end) throw new Error("timed out waiting for " + fn.toString().slice(0, 80));
    await page.waitForTimeout(120);
  }
}

// Stations a player stands next to. The test walks there with teleport; movement itself is checked with keys.
async function nearStation(page, id) {
  await page.evaluate((s) => window.obachanKitchenDebug.teleport(s), id);
  await page.waitForTimeout(250);
  const near = await waitFor(page, (s) => window.obachanKitchenDebug.state().nearest === s, id, 4000).catch(() => false);
  return near;
}

async function press(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(160);
}

async function overflowOK(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
}

async function rectsOverlap(page, selA, selB) {
  return page.evaluate(([a, b]) => {
    const A = document.querySelector(a), B = document.querySelector(b);
    if (!A || !B || A.hidden || B.hidden) return false;
    const r1 = A.getBoundingClientRect(), r2 = B.getBoundingClientRect();
    if (r1.width === 0 || r2.width === 0) return false;
    return !(r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top);
  }, [selA, selB]);
}

async function playDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(PAGE, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.obachanKitchenDebug, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, "title-1280.png");
  assert.equal((await state(page)).phase, "title", "starts on the title screen");
  assert.ok(await page.locator("#btnStart").isVisible(), "start button visible");

  // Start, then the dish menu opens by itself.
  await page.click("#btnStart");
  await waitFor(page, () => !document.getElementById("dlgMenu").hidden, null, 8000);
  assert.equal((await state(page)).phase, "play");
  await shot(page, "menu-1280.png");
  await page.click(".menu-item:has-text('お味噌汁')");
  await waitFor(page, () => window.obachanKitchenDebug.state().recipe === "miso", null, 5000);

  // Walk with real keys. Headless frames are slow, so hold the key until the player has moved.
  const p0 = (await state(page)).player;
  await page.keyboard.down("ArrowLeft");
  await waitFor(page, (p) => {
    const q = window.obachanKitchenDebug.state().player;
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.2;
  }, p0, 20000).finally(() => page.keyboard.up("ArrowLeft"));
  const p1 = (await state(page)).player;
  assert.ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.2, "ArrowLeft moves the player: " + p0 + " -> " + p1);
  assert.equal(await overflowOK(page), true, "no horizontal scroll at 1280");

  // Vegetable: harvest a tomato with E at the garden plant.
  assert.ok(await nearStation(page, "plant0"), "walk up to the tomato plant");
  await press(page, "KeyE");
  await waitFor(page, () => /トマト/.test(document.getElementById("basket").textContent), null, 4000);

  // Pot from the shelf with E, then fill it at the sink by holding E.
  assert.ok(await nearStation(page, "shelf_pot"), "walk up to the pot shelf");
  await press(page, "KeyE");
  assert.equal((await state(page)).hand, "pot", "E takes the pot from the shelf");
  assert.ok(await nearStation(page, "sink"), "walk up to the sink");
  await page.keyboard.down("KeyE");
  await waitFor(page, () => window.obachanKitchenDebug.state().session === "hold", null, 4000);
  await waitFor(page, () => window.obachanKitchenDebug.world().hand && window.obachanKitchenDebug.world().hand.water === true, null, 30000)
    .finally(() => page.keyboard.up("KeyE"));
  assert.ok(await nearStation(page, "burnerL"), "walk up to the burner");
  await press(page, "KeyE");
  await press(page, "KeyE"); // turn the burner on
  await shot(page, "pot-1280.png");

  // Chop tofu on the board with timed presses: wait for the indicator to be in the green zone.
  assert.ok(await nearStation(page, "fridge"), "walk to the fridge");
  await press(page, "KeyE");
  assert.ok(await nearStation(page, "board"), "walk to the board");
  await press(page, "KeyE");
  let hits = 0;
  for (let i = 0; i < 400 && hits < 4; i++) {
    const s = await state(page);
    if (s.session === "chop" && s.indicator) {
      if (Math.abs(s.indicator.pos - s.indicator.center) <= s.indicator.half * 0.8) {
        await page.keyboard.press("KeyE");
        hits += 1;
        await page.waitForTimeout(120);
        continue;
      }
    }
    if (s.session !== "chop" && hits > 0) break;
    await page.waitForTimeout(30);
  }
  assert.ok(hits >= 1, "timed presses land in the green zone");
  await waitFor(page, () => window.obachanKitchenDebug.state().hand === "tofu", null, 30000);

  // Let auntie do the rest of the steps. This is the accessibility path and must always finish.
  let guard = 0;
  while (guard++ < 80) {
    const s = await state(page);
    if (s.done || s.served >= 2) break;
    await page.evaluate(() => window.obachanKitchenDebug.assist());
    await page.waitForTimeout(40);
  }
  await waitFor(page, () => window.obachanKitchenDebug.state().served >= 2, null, 30000);
  // The family reacts to a served dish (talk lines and the dish on the table).
  await waitFor(page, () => window.obachanKitchenDebug.state().familyLines >= 1, null, 4000);
  const fin = await state(page);
  assert.ok(fin.familyLines >= 1, "family speaks after serving");
  assert.ok(fin.servedDishes >= 2, "two bowls served");
  await shot(page, "served-1280.png");

  // The finished dish unlocks its recipe card.
  await waitFor(page, () => !document.getElementById("finish").hidden, null, 8000);
  assert.match(await page.textContent("#finishTitle"), /レシピカード|できあがり/);
  await page.click("#finishOk");
  const cooked = (await state(page)).save.cooked.miso || 0;
  assert.ok(cooked >= 1, "miso recorded as cooked");

  // Notebook (N) shows the unlocked card.
  await page.keyboard.press("KeyN");
  await waitFor(page, () => !document.getElementById("dlgNote").hidden, null, 3000);
  assert.match(await page.textContent("#noteCard"), /材料/);
  await shot(page, "notebook-1280.png");
  await page.keyboard.press("Escape");

  // Pause (Escape) shows the sliders and the way back.
  await page.keyboard.press("Escape");
  await waitFor(page, () => !document.getElementById("dlgPause").hidden, null, 3000);
  assert.ok(await page.locator("#musicVol").isVisible(), "music slider visible in pause");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Reloading shows 「つづきから」 because a save exists.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => !!window.obachanKitchenDebug, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#btnContinue").isVisible(), true, "continue button after a saved cook");

  assert.deepEqual(errors, [], "no console errors on the desktop run");
  await context.close();
}

async function layoutCheck(browser, label, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.obachanKitchenDebug, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot(page, `title-${label}.png`);
  assert.equal(await overflowOK(page), true, label + ": no horizontal scroll on the title");
  await page.click("#btnStart");
  await waitFor(page, () => !document.getElementById("dlgMenu").hidden, null, 8000);
  await shot(page, `menu-${label}.png`);
  await page.click(".menu-item:has-text('おにぎり')");
  await waitFor(page, () => window.obachanKitchenDebug.state().recipe === "onigiri", null, 5000);
  await page.waitForTimeout(900);
  await shot(page, `kitchen-${label}.png`);
  assert.equal(await overflowOK(page), true, label + ": no horizontal scroll in play");
  assert.equal(await page.locator("#btnAct").isVisible(), true, label + ": する button visible");
  assert.equal(await rectsOverlap(page, "#actions", "#talk"), false, label + ": action buttons do not overlap dialogue");
  assert.equal(await rectsOverlap(page, "#prompt", "#btnHelp"), false, label + ": prompt does not overlap the help button");
  assert.deepEqual(errors, [], label + ": no errors");
  await context.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
  });
  const started = Date.now();
  try {
    await playDesktop(browser);
    await layoutCheck(browser, "phone-390", { width: 390, height: 844 }, true);
    await layoutCheck(browser, "small-320", { width: 320, height: 568 }, true);
    await layoutCheck(browser, "landscape-740", { width: 740, height: 375 }, true);
    console.log("haiku-kitchen browser checks passed in " + ((Date.now() - started) / 1000).toFixed(1) + "s");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("haiku-kitchen browser checks FAILED:", e && e.stack ? e.stack : e);
  process.exit(1);
});
