"use strict";
// End-to-end check for 句ゆき: start, walk, collect, compose with real clicks,
// judge, close, save and resume, plus layout and console checks.
// Run: BASE=http://127.0.0.1:8103 NODE_PATH=$(npm root -g) CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/haiku-ku-browser.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8103";
const URL = BASE.replace(/\/$/, "") + "/haiku/ku/index.html";
const SHOTS = process.env.SHOTS || path.join(require("node:os").tmpdir(), "haiku-ku-shots");
fs.mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  { name: "desktop", viewport: { width: 1280, height: 800 }, mobile: false, touch: false },
  { name: "phone", viewport: { width: 390, height: 844 }, mobile: true, touch: true }
];

async function overflowOf(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Polls a page-side condition, so the checks hold on slow or shared machines.
async function pollUntil(page, fn, arg, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(150);
  }
  return page.evaluate(fn, arg);
}

async function waitUntilHidden(page, selector, steps) {
  for (let i = 0; i < steps; i++) {
    if (await page.locator(selector).isHidden()) return true;
    await page.locator("#dlgNext").click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(120);
  }
  return page.locator(selector).isHidden();
}

// Chips are matched by their exact word, not by substring (や must not match やま).
function chipByWord(page, word) {
  return page.evaluate(w => [...document.querySelectorAll("#hand .chip")].findIndex(c => c.firstChild.textContent === w), word)
    .then(index => {
      assert.ok(index >= 0, "the word is in hand: " + word);
      return page.locator("#hand .chip").nth(index);
    });
}

async function runSize(browser, size) {
  const context = await browser.newContext({
    viewport: size.viewport,
    isMobile: size.mobile,
    hasTouch: size.touch,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push("pageerror: " + error.message));
  page.on("console", msg => {
    if (msg.type() === "error" || msg.type() === "warning") errors.push(msg.type() + ": " + msg.text());
  });

  await page.goto(URL, { waitUntil: "load" });
  await page.locator("#btnNew").waitFor({ state: "visible" });
  assert.equal(await page.locator("html").getAttribute("lang"), "ja");
  assert.equal(await overflowOf(page), 0, size.name + ": no horizontal overflow on the title");
  await page.screenshot({ path: path.join(SHOTS, size.name + "-title.png") });

  // Start the journey and let the opening dialogue finish.
  await page.click("#btnNew");
  await page.locator("#journey").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  for (let i = 0; i < 16 && !(await page.locator("#dialog").isHidden()); i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(120);
  }
  assert.equal(await page.locator("#dialog").isHidden(), true, size.name + ": opening dialogue closes");

  // Walk with the keyboard: hold the key until the traveler has moved a little.
  const x0 = (await page.evaluate(() => window.kuDebug.state())).x;
  await page.keyboard.down("ArrowRight");
  const moved = await pollUntil(page, x => window.kuDebug.state().x > x + 25, x0, 20000);
  await page.keyboard.up("ArrowRight");
  const x1 = (await page.evaluate(() => window.kuDebug.state())).x;
  assert.ok(moved && x1 > x0, size.name + ": keyboard walk moves the traveler (" + x0 + " -> " + x1 + ")");

  // Collect a word by walking onto it.
  const lantern = await page.evaluate(() => {
    const list = window.kuDebug.lanterns().filter(l => l.station === 0);
    return list[2];
  });
  const before = (await page.evaluate(() => window.kuDebug.state())).hand.length;
  await page.evaluate(x => window.kuDebug.setX(x), lantern.x);
  const collected = await pollUntil(page, n => window.kuDebug.state().hand.length > n, before, 20000);
  assert.ok(collected, size.name + ": walking into a lantern collects its word");

  // Collect the answer words for the first 宿 through the debug hook.
  const answer = await page.evaluate(() => KuSim.segmentFor(0).answer);
  const ids = await page.evaluate(words => {
    const flat = words.flat();
    return flat.map(w => {
      const found = window.kuDebug.lanterns().find(l => l.station === 0 && l.word === w);
      return found ? found.id : null;
    });
  }, answer);
  for (const id of ids) if (id !== null) await page.evaluate(v => window.kuDebug.collect(v), id);

  // Walk to the 宿 gate and enter.
  const gate = await page.evaluate(() => KuSim.innX(0) - 200);
  await page.evaluate(x => window.kuDebug.setX(x), gate);
  await page.locator("#doorBtn").waitFor({ state: "visible", timeout: 8000 });
  await page.click("#doorBtn");
  await waitUntilHidden(page, "#dialog", 12);
  // The 宿 dialogue ends by opening the 句帳.
  await page.locator("#journal").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await page.locator("#journal").isHidden()) {
    await page.evaluate(() => window.kuDebug.openJournal());
  }
  await page.locator("#journal").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  assert.match(await page.locator("#jTheme").innerText(), /花/);

  // Compose the 名句 with real clicks, line by line.
  for (const line of answer) {
    for (const word of line) {
      await (await chipByWord(page, word)).click();
      await page.waitForTimeout(40);
    }
  }
  assert.equal(await page.locator("#count0").innerText(), "5/5");
  assert.equal(await page.locator("#count1").innerText(), "7/7");
  assert.equal(await page.locator("#count2").innerText(), "5/5");
  assert.equal(await page.locator("#jSubmit").isEnabled(), true, "the form is exact, so 句をよむ is enabled");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, size.name + "-journal.png") });
  assert.equal(await overflowOf(page), 0, size.name + ": no horizontal overflow in 句帳");

  // A tile can be taken back out of a line, and put back by its chip.
  const countBefore = await page.locator("#count2").innerText();
  const removedWord = await page.locator("#slots2 .slot.filled").first().getAttribute("title");
  await page.locator("#slots2 .slot.filled").first().click();
  await page.waitForTimeout(80);
  assert.notEqual(await page.locator("#count2").innerText(), countBefore, "a removed tile frees its mora");
  await (await chipByWord(page, removedWord)).click();
  await page.waitForTimeout(80);
  assert.equal(await page.locator("#count2").innerText(), countBefore);

  // Submit and see the rank card.
  await page.click("#jSubmit");
  await page.locator("#verdict").waitFor({ state: "visible" });
  assert.match(await page.locator("#vRank").innerText(), /名句|佳句|よい句じゃ/);
  assert.ok((await page.locator("#vPoem p").allInnerTexts()).length === 3, "the poem shows three lines");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, size.name + "-verdict.png") });
  await page.click("#vProceed");
  await page.locator("#verdict").waitFor({ state: "hidden" });
  const cleared = (await page.evaluate(() => window.kuDebug.state())).cleared;
  assert.equal(cleared, 1, size.name + ": one 宿 is cleared");

  // The farewell dialogue, then the road opens on.
  await waitUntilHidden(page, "#dialog", 10);
  await page.evaluate(() => window.kuDebug.setX(KuSim.innX(0) + 200));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, size.name + "-journey.png") });
  assert.equal(await overflowOf(page), 0, size.name + ": no horizontal overflow on the journey");

  // Escape closes the 句帳 and the 句集 opens.
  await page.click("#hudJournal");
  await page.locator("#journal").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#journal").isHidden(), true, size.name + ": Escape closes 句帳");
  await page.click("#hudAnthology");
  await page.locator("#anthology").waitFor({ state: "visible" });
  assert.equal(await page.locator("#anthList .anth-item:not(.empty)").count(), 1, "句集 lists the one poem");
  await page.click("#anthBack");

  // The saved journey resumes from the title.
  const stored = await page.evaluate(() => window.localStorage.getItem("ku-journey-v1"));
  assert.ok(stored && JSON.parse(stored).v === 1, "progress is saved under ku-journey-v1");
  await page.reload({ waitUntil: "load" });
  await page.locator("#btnContinue").waitFor({ state: "visible" });
  await page.click("#btnContinue");
  await page.locator("#journey").waitFor({ state: "visible" });
  assert.equal((await page.evaluate(() => window.kuDebug.state())).cleared, 1, "continue restores the cleared count");

  assert.deepEqual(errors, [], size.name + ": no console errors or exceptions");
  await context.close();
  return { name: size.name, cleared: cleared };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
  });
  try {
    const results = [];
    for (const size of SIZES) results.push(await runSize(browser, size));
    console.log("haiku-ku browser checks passed:", JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("haiku-ku browser checks failed:", error && error.stack ? error.stack : error);
  process.exit(1);
});
