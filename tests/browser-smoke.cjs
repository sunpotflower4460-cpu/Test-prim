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
      for (const [door, title, back] of [["openSumifuBtn","sumifu-title","sumifuReturn"],["openCodeBtn","codeTitle","codeReturnBtn"],["openSyncBtn","syncTitle","syncReturnBtn"]]) {
        await page.locator("#" + door).press("Enter");
        await page.locator("#" + title).waitFor({state:"visible"});
        assert.ok(!(await page.locator("#home").isVisible()), "Enter opens only the selected game");
        await page.locator("#" + back).press("Enter");
        await page.locator("#launcher").waitFor({state:"visible"});
      }
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
        ["GPT6 CHAT", "Grok 4.7 Cursor", "玄人コード", "Minimax M3.1", "GPT 6.1 sol", "GPT 6 Luna"],
        "launcher lists the six entries in order"
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


      // 入口が増えても、最後の入口と最下行の表示が重ならないこと
      //（入口の並び順そのものは、冒頭の検査で確かめている）
      const layout = await page.evaluate(() => {
        const sub = document.querySelector(".launcher-sub").getBoundingClientRect();
        const bottom = document.querySelector(".launcher-bottom").getBoundingClientRect();
        const last = document.getElementById("openSolBtn").getBoundingClientRect();
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
        // Sample the four outer corners, away from the gameplay rings and hit effects.
        const points = [[0.08, 0.12], [0.92, 0.12], [0.08, 0.88], [0.92, 0.88]].map(p => at(p[0], p[1]));
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

      // AFTERTIDE lives on a separate page so the other games' inputs and audio remain isolated.
      await page.locator("#openSolBtn").click();
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
      await page.locator("#launcher").waitFor({state:"visible"});

      // LUNA is the final door. Check its first authored route through a real drag
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

      assert.deepEqual(errors, [], "no browser script errors");
      console.log("PASS", target.name, JSON.stringify(metrics));
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
