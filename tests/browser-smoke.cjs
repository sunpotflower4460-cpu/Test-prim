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
      assert.deepEqual(
        entryLabels,
        ["GPT6 CHAT", "Grok 4.7 Cursor", "玄人コード", "Minimax M3.1"],
        "launcher lists the four entries in order"
      );
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


      // 入口が増えても、最後の入口と最下行の表示が重ならないこと
      //（入口の並び順そのものは、冒頭の検査で確かめている）
      const layout = await page.evaluate(() => {
        const sub = document.querySelector(".launcher-sub").getBoundingClientRect();
        const bottom = document.querySelector(".launcher-bottom").getBoundingClientRect();
        const last = document.getElementById("openSyncBtn").getBoundingClientRect();
        return { subBottom: sub.bottom, bottomTop: bottom.top, lastVisible: last.bottom <= window.innerHeight + 1 };
      });
      assert.ok(layout.subBottom <= layout.bottomTop + 1, "launcher footer does not overlap the last entry");
      assert.ok(layout.lastVisible, "the last launcher entry fits on screen");
      // 2本目の Grok 4.7 Cursor は KASANE が公開済みなので、「準備中」の案内は出ない。
      await page.locator("#openSumifuBtn").click();
      await page.locator("#sumifu-title").waitFor({ state: "visible" });
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

      // SYNC// 共鳴（Minimax M3.1）。章を最後まで叩き、結果と共鳴選択まで通す。
      await page.goto("http://127.0.0.1:8000/", { waitUntil: "domcontentloaded" });
      await page.locator("#launcher").waitFor({ state: "visible" });
      await page.locator("#openSyncBtn").click();
      await page.locator("#syncTitle").waitFor({ state: "visible" });
      assert.match(await page.locator("#syncTitle .sync-logo").innerText(), /SYNC/);
      await page.locator("#syncStartBtn").click();
      await page.locator("#syncPlay").waitFor({ state: "visible" });

      // 画面が実際に描かれていること。真っ白や単色で塗られていないか。
      const arena = await page.evaluate(() => {
        const canvas = document.getElementById("syncWorld");
        const ctx = canvas.getContext("2d");
        const at = (x, y) => {
          const d = ctx.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        const points = [[0.2, 0.25], [0.5, 0.45], [0.8, 0.65], [0.5, 0.8]].map(p => at(p[0], p[1]));
        return { points, flash: window.__sync.getFlash() };
      });
      const unique = new Set(arena.points.map(p => p.join(",")));
      assert.ok(unique.size >= 3, "the arena renders a scene rather than a flat fill: " + JSON.stringify(arena.points));
      assert.ok(arena.points.every(p => p[0] < 200 && p[1] < 220), "the arena background stays dark: " + JSON.stringify(arena.points));
      assert.ok(arena.flash < 0.5, "the hit flash decays instead of running away");

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
      // どれが出たかは抽選なので、増えた数と既	extbf{に持っているもの}でないことだけを見る。
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

      // タイトル → Test prim へ戻る
      await page.evaluate(() => window.__sync.goTitle());
      await page.locator("#syncTitle").waitFor({ state: "visible" });
      await page.locator("#syncReturnBtn").click();
      await page.locator("#launcher").waitFor({ state: "visible" });
      assert.ok(!(await page.locator("#syncTitle").isVisible()), "sync title hides after leaving");

      assert.deepEqual(errors, [], "no browser script errors");
      console.log("PASS", target.name, JSON.stringify(metrics));
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });