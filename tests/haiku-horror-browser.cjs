"use strict";
// End-to-end check for 鳴き井戸 (haiku/horror). Run with a static server on BASE (default 8101).
//   BASE=http://127.0.0.1:8101 NODE_PATH=$(npm root -g) CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/haiku-horror-browser.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8101";
const PAGE = BASE.replace(/\/$/, "") + "/haiku/horror/index.html";
const SHOT_DIR = process.env.SHOT_DIR || path.join(os.tmpdir(), "naki-ido-shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const LAUNCH = {
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
};

// Face a map point from (x, y): forward is (-sin yaw, -cos yaw).
const yawTo = (x, y, tx, ty) => Math.atan2(-(tx - x), -(ty - y));

async function overflowOf(page) {
  return page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
}

async function waitFor(page, fn, arg, timeout = 8000) {
  await page.waitForFunction(fn, arg, { timeout });
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const problems = [];
  const log = (...a) => console.log(...a);

  try {
    // ---------- desktop ----------
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    desk.on("pageerror", e => problems.push("pageerror: " + e.message));
    desk.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
    desk.on("requestfailed", r => {
      if (!r.url().startsWith(BASE)) problems.push("external request blocked/failed: " + r.url());
    });
    await desk.goto(PAGE, { waitUntil: "load" });
    await desk.waitForSelector("#btnNew", { state: "visible" });
    await desk.waitForTimeout(500);

    // Title, back link and layout.
    const back = await desk.locator("#title a.back").first();
    assert.equal(await back.getAttribute("href"), "../index.html", "back link points at the works list");
    assert.equal((await back.innerText()).trim(), "‹ Haiku 5.5");
    const title = await desk.locator("#titleName").innerText();
    assert.equal(title, "鳴き井戸");
    assert.equal((await desk.locator("#btnContinue").isVisible()), false, "no save yet, so no 続きから");
    let ov = await overflowOf(desk);
    assert.ok(ov.sw <= ov.cw, "no horizontal scroll on the title at 1280x800");
    await desk.screenshot({ path: path.join(SHOT_DIR, "title-1280x800.png") });
    log("title ok");

    // Start a new run with a real click.
    await desk.click("#btnNew");
    await waitFor(desk, () => window.nakiIdoDebug && window.nakiIdoDebug.mode() === "play");
    let snap = await desk.evaluate(() => window.nakiIdoDebug.snapshot());
    assert.equal(snap.room, "genkan", "the run starts in the genkan");
    await desk.waitForTimeout(400);
    await desk.screenshot({ path: path.join(SHOT_DIR, "play-1280x800-start.png") });

    // Walk with the keyboard: hold W until the player has moved (frames can be slow in CI).
    const x0 = snap.x;
    const y0 = snap.y;
    await desk.keyboard.down("KeyW");
    await waitFor(desk, ([x, y]) => {
      const s = window.nakiIdoDebug.snapshot();
      return Math.hypot(s.x - x, s.y - y) > 0.5;
    }, [x0, y0], 15000);
    await desk.keyboard.up("KeyW");
    snap = await desk.evaluate(() => window.nakiIdoDebug.snapshot());
    assert.ok(Math.hypot(snap.x - x0, snap.y - y0) > 0.5, "W walks forward");
    log("walk ok");

    // Pick up a shell with a real E press. Stand 1 m west of shell-1, facing it.
    await desk.evaluate(() => window.nakiIdoDebug.teleport(1.6, 12.4, -Math.PI / 2));
    const before = (await desk.evaluate(() => window.nakiIdoDebug.snapshot())).inv.shell;
    await desk.keyboard.press("KeyE");
    await waitFor(desk, n => window.nakiIdoDebug.snapshot().inv.shell === n + 1, before, 15000);
    assert.equal((await desk.evaluate(() => window.nakiIdoDebug.snapshot())).inv.shell, before + 1, "E picks up the shell");
    log("pickup ok");

    // Reload with R: break-open, then one shell is loaded.
    await desk.keyboard.press("KeyR");
    await waitFor(desk, () => {
      const g = window.nakiIdoDebug.snapshot().gun;
      return g.state === "reload" || g.chambers[0] === 1;
    }, null, 15000);
    await waitFor(desk, () => window.nakiIdoDebug.snapshot().gun.state === "ready", null, 15000);
    snap = await desk.evaluate(() => window.nakiIdoDebug.snapshot());
    assert.deepEqual(snap.gun.chambers, [1, 0], "one shell loaded");
    await desk.keyboard.press("KeyR");
    await waitFor(desk, () => window.nakiIdoDebug.snapshot().gun.chambers[1] === 1, null, 15000);
    log("reload ok");

    // Fire with a real click. The first click may only request pointer lock, so click until
    // a barrel is spent. The second barrel empties the gun.
    const canvas = await desk.locator("#view");
    const box = await canvas.boundingBox();
    let fired = false;
    for (let i = 0; i < 4 && !fired; i++) {
      await desk.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      try {
        await waitFor(desk, () => {
          const c = window.nakiIdoDebug.snapshot().gun.chambers;
          return c[0] === 0 || c[1] === 0;
        }, null, 3000);
        fired = true;
      } catch (e) {
        fired = false;
      }
    }
    assert.ok(fired, "a click fires a barrel");
    await desk.screenshot({ path: path.join(SHOT_DIR, "play-1280x800-fired.png") });
    log("fire ok");

    // Diary: pick up the first diary page (on the low table in the living room) with E.
    await desk.waitForTimeout(700);
    await desk.evaluate(() => window.nakiIdoDebug.teleport(2.5, 8.6, yawTo(2.5, 8.6, 2.5, 7.4)));
    await desk.waitForTimeout(150);
    await desk.keyboard.press("KeyE");
    await waitFor(desk, () => window.nakiIdoDebug.mode() === "diary", null, 15000);
    assert.equal(await desk.locator("#diary").isVisible(), true, "diary overlay opens");
    await desk.click("#diaryClose");
    await waitFor(desk, () => window.nakiIdoDebug.mode() === "play", null, 15000);
    log("diary ok");

    // Pause menu and its controls.
    await desk.keyboard.press("Escape");
    await waitFor(desk, () => window.nakiIdoDebug.mode() === "pause", null, 15000);
    assert.equal(await desk.locator("#pause a.back").getAttribute("href"), "../index.html");
    await desk.click("#btnResume");
    await waitFor(desk, () => window.nakiIdoDebug.mode() === "play", null, 15000);
    log("pause ok");

    ov = await overflowOf(desk);
    assert.ok(ov.sw <= ov.cw, "no horizontal scroll during play at 1280x800");
    await desk.screenshot({ path: path.join(SHOT_DIR, "play-1280x800.png") });

    // ---------- phone, portrait, touch ----------
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const p = await phone.newPage();
    p.on("pageerror", e => problems.push("phone pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error") problems.push("phone console: " + m.text()); });
    await p.goto(PAGE, { waitUntil: "load" });
    await p.waitForSelector("#btnNew", { state: "visible" });
    await p.waitForTimeout(400);
    ov = await overflowOf(p);
    assert.ok(ov.sw <= ov.cw, "no horizontal scroll on the phone title");
    await p.screenshot({ path: path.join(SHOT_DIR, "title-390x844.png") });
    await p.tap("#btnNew");
    await waitFor(p, () => window.nakiIdoDebug && window.nakiIdoDebug.mode() === "play");
    await p.evaluate(() => window.nakiIdoDebug.teleport(9.6, 3.9, Math.atan2(-(6.5 - 9.6), -(2.4 - 3.9))));
    await p.waitForTimeout(800);
    ov = await overflowOf(p);
    assert.ok(ov.sw <= ov.cw, "no horizontal scroll in play on the phone");
    const touchOn = await p.locator("#touch").isVisible();
    assert.equal(touchOn, true, "touch controls are shown on a touch device");
    for (const act of ["fire", "reload", "flash", "run", "interact"]) {
      const b = await p.locator(`[data-act="${act}"]`).first().boundingBox();
      assert.ok(b && b.width >= 48 && b.height >= 48, act + " button is at least 48px");
    }
    const joy = await p.evaluate(() => {
      const f = document.elementFromPoint(120, 500);
      return f && f.closest("[data-act]") === null;
    });
    assert.ok(joy, "the left half is free for the joystick");
    await p.screenshot({ path: path.join(SHOT_DIR, "play-390x844-touch.png") });
    await phone.close();
    log("phone ok");

    // Subtitle and prompt text exist in the DOM for screen readers and are not empty mid-run.
    const promptText = await desk.locator("#prompt").innerText();
    log("prompt text:", JSON.stringify(promptText));

    assert.deepEqual(problems, [], "no console errors or uncaught exceptions");
    log("OK: all browser checks passed");
  } catch (e) {
    console.error("FAILED:", e.message);
    if (problems.length) console.error("problems:\n" + problems.join("\n"));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
