"use strict";
/* Minimax M3.1 — SYNC// 共鳴（きょうめい）
 *
 * 描画・音・入力・画面の切り替えを担当する。
  * 譜面と判定そのものは sync-sim.js（window.SyncSim）にあり、ここは見た目と鳴り。
 *
 * 造型の考え方:
 *   ・同心円が拍で脈打ち、噪音は外側から中心の核へ向かう。
 *   ・音と絵は同じ時計を sharing する。音の時計は AudioContext.currentTime。
  *   ・判定の良さは「音量和」ではなく「光」で伝える（perfect は白く弾け、good は鈍く沈む）。
 */

(() => {
  const sim = window.SyncSim;
  const $ = id => document.getElementById(id);
  const canvas = $("syncWorld");
  if (!sim || !canvas) return;
  const ctx = canvas.getContext("2d", { alpha: false });

  const SAVE_KEY = "sync-record-v1";
  const SOUND_KEY = "sync-sound-v1";
  const TAU = Math.PI * 2;
  const LANES = sim.LANES;
  const LANE_ARC = TAU / LANES;
  const MAX_PARTICLES = 320;
  const CHAPTER_NUMERAL = ["一", "二", "三", "四", "五"];

  /* ------------------------------------------------------------ 設定 ---- */

  let record = loadRecord();
  let soundOn = loadSound();

  function loadRecord() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === "object") {
        return {
          bestScore: Number(data.bestScore) || 0,
          bestChapter: Number(data.bestChapter) || 0,
          clears: Number(data.clears) || 0,
          perfects: Number(data.perfects) || 0,
          bestGrade: typeof data.bestGrade === "string" ? data.bestGrade : ""
        };
      }
    } catch (_) {}
    return { bestScore: 0, bestChapter: 0, clears: 0, perfects: 0, bestGrade: "" };
  }
  function saveRecord() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(record)); } catch (_) {}
  }
  function loadSound() {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (_) { return true; }
  }
  function saveSound() {
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (_) {}
  }

  /* --------------------------------------------------------- 音（合成） ---- */

  const audio = (() => {
    let ac = null;
    let master = null;
    let musicBus = null;
    let sfxBus = null;
    let noiseBuffer = null;
    const musicSources = new Set();
    function trackMusic(source) {
      musicSources.add(source);
      source.onended = () => musicSources.delete(source);
    }
    function stopMusic() {
      for (const source of musicSources) { try { source.stop(); } catch (_) {} }
      musicSources.clear();
    }

    function context() {
      if (!soundOn) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ac) {
        try { ac = new AC(); } catch (_) { return null; }
        master = ac.createGain();
        master.gain.value = 0.9;
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 22;
        comp.ratio.value = 5;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(ac.destination);
        musicBus = ac.createGain();
        musicBus.gain.value = 0.5;
        musicBus.connect(master);
        sfxBus = ac.createGain();
        sfxBus.gain.value = 0.85;
        sfxBus.connect(master);
        const len = Math.floor(ac.sampleRate * 1.2);
        noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ac.state === "suspended") ac.resume().catch(() => {});
      return ac;
    }

    /** 音の時計。Core が鳴っているときは現在時刻、止まっているときは前のまま。 */
    function rawNow() {
      return ac ? ac.currentTime : performance.now() / 1000;
    }

    /** 音を切りたい場合は master を黙らせる。時計は止めない。 */
    function applyMute() {
      if (!master) return;
      const target = soundOn ? 0.9 : 0;
      try {
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setTargetAtTime(target, ac.currentTime, 0.02);
      } catch (_) { master.gain.value = target; }
    }

    function isRunning() {
      return !!ac && ac.state === "running";
    }

    /** Existing Core only, or null. Never creates one. */
    function rawContext() {
      return ac;
    }

    function tone(freq, dur, type, gain, at, bus, detune) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at === undefined ? c.currentTime : at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (detune) osc.detune.setValueAtTime(detune, t0);
      const g = gain === undefined ? 0.05 : gain;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(g, t0 + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env);
      env.connect(bus || sfxBus);
      if (bus === musicBus) trackMusic(osc);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, gain, at, filterHz, type) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at === undefined ? c.currentTime : at);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = type || "bandpass";
      filter.frequency.setValueAtTime(filterHz || 1400, t0);
      filter.Q.value = 0.9;
      const env = c.createGain();
      env.gain.setValueAtTime(gain === undefined ? 0.05 : gain, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(env);
      env.connect(sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    /* ---- 楽器 ---- */
    function kick(at, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(146, t0);
      osc.frequency.exponentialRampToValueAtTime(44, t0 + 0.11);
      env.gain.setValueAtTime(gain || 0.42, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(env);
      env.connect(musicBus);
      trackMusic(osc);
      osc.start(t0);
      osc.stop(t0 + 0.34);
    }

    function hat(at, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7200;
      const env = c.createGain();
      env.gain.setValueAtTime(gain === undefined ? 0.05 : gain, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      src.connect(hp);
      hp.connect(env);
      env.connect(musicBus);
      trackMusic(src);
      src.start(t0);
      src.stop(t0 + 0.06);
    }

    function snare(at, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2100;
      bp.Q.value = 0.7;
      const env = c.createGain();
      env.gain.setValueAtTime(gain === undefined ? 0.14 : gain, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
      src.connect(bp);
      bp.connect(env);
      env.connect(musicBus);
      trackMusic(src);
      src.start(t0);
      src.stop(t0 + 0.2);
      tone(186, 0.09, "triangle", 0.05, t0, musicBus);
    }

    function bass(freq, at, dur, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const sub = c.createOscillator();
      const env = c.createGain();
      osc.type = "sawtooth";
      sub.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      sub.frequency.setValueAtTime(freq / 2, t0);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(520, t0);
      lp.frequency.exponentialRampToValueAtTime(180, t0 + dur);
      const g = gain === undefined ? 0.2 : gain;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(g, t0 + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(lp);
      sub.connect(lp);
      lp.connect(env);
      env.connect(musicBus);
      trackMusic(osc); trackMusic(sub);
      osc.start(t0);
      sub.start(t0);
      osc.stop(t0 + dur + 0.03);
      sub.stop(t0 + dur + 0.03);
    }

    function pluck(freq, at, dur, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      const g = gain === undefined ? 0.1 : gain;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env);
      env.connect(musicBus);
      trackMusic(osc);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function pad(freqs, at, dur, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const g = gain === undefined ? 0.055 : gain;
      freqs.forEach((f, i) => {
        const osc = c.createOscillator();
        const env = c.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, t0);
        osc.detune.setValueAtTime((i - 1) * 6, t0);
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.linearRampToValueAtTime(g, t0 + dur * 0.35);
        env.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(env);
        env.connect(musicBus);
        trackMusic(osc);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      });
    }

    /** 效果音用。先に Core を取りに行ってから時計を読む。 */
    function now() {
      const c = context();
      return c ? c.currentTime : performance.now() / 1000;
    }

    /** ボスの低音を music バスに流す。 */
    function sub(freq, at, dur, gain) {
      const c = context();
      if (!c) return;
      const t0 = Math.max(c.currentTime, at);
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain || 0.16, t0 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env);
      env.connect(musicBus);
      trackMusic(osc);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    return { context, rawNow, isRunning, applyMute, stopMusic, now, rawContext, tone, noise, kick, hat, snare, bass, pluck, pad, sub };
  })();

  /* ---- 効果音 ---- */
  const SFX = {
    perfect(lane) {
      audio.tone(1760 + lane * 40, 0.16, "triangle", 0.075);
      audio.tone(2640, 0.1, "sine", 0.04);
      audio.noise(0.05, 0.035);
    },
    great(lane) {
      audio.tone(1320 + lane * 34, 0.13, "triangle", 0.06);
      audio.noise(0.04, 0.022);
    },
    good(lane) {
      audio.tone(880 + lane * 28, 0.11, "square", 0.042);
    },
    whiff() { audio.noise(0.07, 0.03, undefined, 500, "lowpass"); },
    miss() {
      audio.tone(110, 0.34, "sawtooth", 0.075);
      audio.noise(0.26, 0.05, undefined, 320, "lowpass");
    },
    violation() {
      audio.tone(78, 0.42, "square", 0.1);
      audio.tone(116, 0.36, "sawtooth", 0.06);
    },
    heal() {
      [880, 1174, 1568].forEach((f, i) => audio.tone(f, 0.16, "triangle", 0.05, audio.now() + i * 0.05));
    },
    pulse() {
      audio.tone(320, 0.5, "sine", 0.09);
      audio.tone(640, 0.4, "triangle", 0.05, audio.now() + 0.02);
    },
    bossHit() {
      audio.tone(150, 0.3, "square", 0.08);
      audio.noise(0.2, 0.06, undefined, 900);
    },
    bossDown() {
      [523, 659, 784, 1046, 1318].forEach((f, i) =>
        audio.tone(f, 0.4, "triangle", 0.07, audio.now() + i * 0.09));
    },
    clear() {
      [659, 880, 1046, 1318].forEach((f, i) =>
        audio.tone(f, 0.34, "sine", 0.07, audio.now() + i * 0.1));
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) =>
        audio.tone(f, 0.5, "triangle", 0.07, audio.now() + i * 0.16));
    },
    ui() { audio.tone(760, 0.05, "square", 0.035); }
  };

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
  }

  /* --------------------------------------------------------- 画面の状態 ---- */

  let mode = "off";          // off / title / play / paused / result / upgrade / over / ending
  let game = null;           // sim の状態
  let chapterIndex = 0;
  let upgrades = [];         // 選んだ共鳴の ID
  let songStart = 0;         // 拍0の時刻（音の時計）
  let pausedAt = 0;
  let scheduledBeat = 0;
  let musicFrom = -Infinity;
  let schedulerId = null;

  // How far ahead the music gets queued, in seconds.
  const SCHEDULE_AHEAD = 0.25;
  let mood = sim.CHAPTERS[0].mood;

  const view = { w: 0, h: 0, cx: 0, cy: 0, outer: 0, strike: 0, core: 0, dpr: 1 };
  let particles = [];
  let ripples = [];
  let sparks = [];
  let laneFlash = [0, 0, 0, 0, 0, 0];
  let laneHeld = [false, false, false, false, false, false];
  let shake = 0;
  let flashAmount = 0;
  let lastBeatDrawn = -1;
  let bossEntry = 0;

  const stars = [];
  for (let i = 0; i < 130; i++) {
    const a = (i * 2.399963) % TAU;
    const r = Math.sqrt((i + 1) / 130);
    stars.push({ a, r, s: 0.4 + ((i * 37) % 11) / 8, p: (i % 9) * 0.7 });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    view.dpr = dpr;
    view.w = w;
    view.h = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let size = Math.min(w, h * 0.78);
    let outer = size * 0.47;
    let cy = h * 0.52;
    const play = $("syncPlay");
    const hud = document.querySelector(".sync-hud");
    // 縦に足りない画面では、既定の円が上部の計器に隠れる。見えている範囲へ寄せる。
    if (play && hud && !play.classList.contains("hidden")) {
      const hudBottom = hud.getBoundingClientRect().bottom;
      // 外側の飾り円ではなく、実際に叩く輪が計器に隠れるときだけ寄せる。
      if (hudBottom > 40 && cy - outer * 0.56 < hudBottom + 8) {
        const top = hudBottom + 8;
        const room = Math.max(72, h - top - 10);
        size = Math.min(w * 0.92, room / 0.94);
        outer = size * 0.47;
        cy = top + room * 0.5;
      }
    }
    view.outer = outer;
    view.strike = outer * 0.56;
    view.core = Math.max(26, size * 0.075);
    view.cx = w / 2;
    view.cy = cy;
  }

  /* -------------------------------------------------------------- 音楽 ---- */

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scheduleBeat(beat, at) {
    // `at` lives in clockNow()'s domain. The Web Audio API only understands
    // AudioContext.currentTime, so convert before reserving anything --
    // otherwise notes get queued for the gap between the two clocks.
    const t = audioAt(at);
    const chapter = sim.CHAPTERS[chapterIndex];
    const spb = 60 / chapter.bpm;
    const half = spb / 2;
    const main = at >= musicFrom, offbeat = at + half >= musicFrom;
    const inBar = ((beat % 4) + 4) % 4;
    const chordIndex = Math.floor(beat / 4) % chapter.chords.length;
    const root = chapter.root + chapter.chords[chordIndex];
    const scale = chapter.scale;
    const energy = game ? Math.min(1, game.combo / 60) : 0;

    if (main && inBar === 0) audio.kick(t, 0.4 + energy * 0.12);
    if (main && inBar === 2) audio.kick(t, 0.3 + energy * 0.1);
    if (main && (inBar === 1 || inBar === 3)) audio.snare(t, 0.1 + energy * 0.05);
    if (main) audio.hat(t, inBar === 0 ? 0.055 : 0.03);
    if (offbeat) audio.hat(t + half, 0.022);

    if (main && (inBar === 0 || inBar === 2)) {
      audio.bass(midiToFreq(root - 12), t, spb * 0.9, 0.16 + energy * 0.05);
    }
    // 拍ごとに一音。コードの音を音階へ登らせて、拍そのものを音にする。
    const step = ((beat % 7) + 7) % scale.length;
    const degree = scale[(step + (energy > 0.5 ? 2 : 0)) % scale.length];
    if (main) audio.pluck(midiToFreq(root + 12 + degree), t, 0.22, 0.05 + energy * 0.035);
    if (offbeat) audio.pluck(midiToFreq(root + 24 + degree), t + half, 0.16, 0.028 + energy * 0.02);

    if (main && beat % 8 === 0) {
      audio.pad([midiToFreq(root), midiToFreq(root + scale[2]), midiToFreq(root + scale[4])],
        t, spb * 7.4, 0.05 + energy * 0.02);
    }
    if (main && game && game.boss && game.boss.active && !game.boss.dead && inBar === 0 && beat % 4 === 0) {
      audio.sub(58, t, 0.5, 0.16);
    }
  }

  function pumpScheduler() {
    if (!game || !game.running) return;
    const spb = game.chart.spb;
    const horizon = clockNow() + SCHEDULE_AHEAD;
    let guard = 0;
    while (songStart + scheduledBeat * spb < horizon && guard++ < 64) {
      scheduleBeat(scheduledBeat, songStart + scheduledBeat * spb);
      scheduledBeat++;
    }
  }

  function startScheduler() {
    stopScheduler();
    audio.context();
    pumpScheduler();
    schedulerId = setInterval(pumpScheduler, 25);
  }

  function stopScheduler() {
    if (schedulerId !== null) { clearInterval(schedulerId); schedulerId = null; }
    audio.stopMusic();
  }

  /* ---------------------------------------------------------------- 入力 ---- */

  const pointers = new Map();   // pointerId -> lane
  let heldKeys = null;          // 押しているキー側のレーン

  /** Drop held-key/pointer bookkeeping. Called whenever the sim state is
   *  replaced or the play session ends, so a finger still down from the
   *  previous chapter cannot swallow the first input of the next one. */
  function forgetInput() {
    pointers.clear();
    heldKeys = null;
  }

  function laneAt(clientX, clientY) {
    const x = clientX - view.cx;
    const y = clientY - view.cy;
    let a = Math.atan2(y, x) + Math.PI / 2;   // 0 を真上にして時計回り
    while (a < 0) a += TAU;
    return Math.min(LANES - 1, Math.floor(a / LANE_ARC));
  }

  function pressLane(lane) {
    if (!game || mode !== "play" || lane < 0 || lane >= LANES) return;
    const t = songTime();
    const result = sim.press(game, lane, t);
    consume(result);
  }

  function releaseLane(lane) {
    if (!game || (mode !== "play" && mode !== "paused")) return;
    const result = sim.release(game, lane, mode === "paused" ? pausedAt : songTime());
    consume(result);
  }

  function onPointerDown(event) {
    if (mode !== "play") return;
    event.preventDefault();
    if (event.pointerId !== undefined && canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    }
    const lane = laneAt(event.clientX, event.clientY);
    pointers.set(event.pointerId, lane);
    pressLane(lane);
  }

  function onPointerMove(event) {
    if (mode !== "play" || !pointers.has(event.pointerId)) return;
    event.preventDefault();
    const lane = laneAt(event.clientX, event.clientY);
    const before = pointers.get(event.pointerId);
    if (lane === before) return;
    // レーンをなぞって移れる。指を離さずに済むので手机上も快適。
    releaseLane(before);
    pointers.set(event.pointerId, lane);
    pressLane(lane);
  }

  function onPointerUp(event) {
    if (!pointers.has(event.pointerId)) return;
    const lane = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    releaseLane(lane);
  }

  function onKeyDown(event) {
    if (!document.body.classList.contains("sync-active")) return;
    if (event.repeat) return;
    const keyLane = sim.LANE_KEYS.indexOf(event.code);
    const numberLane = /^Digit([1-6])$/.exec(event.code);
    let lane = -1;
    if (keyLane >= 0) lane = keyLane;
    else if (numberLane) lane = Number(numberLane[1]) - 1;
    if (lane < 0) {
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        if (mode === "play") { pause(); event.preventDefault(); }
        else if (mode === "paused") { resume(); event.preventDefault(); }
      }
      return;
    }
    if (mode !== "play") return;
    event.preventDefault();
    if (!heldKeys) heldKeys = [];
    if (heldKeys.indexOf(lane) >= 0) return;
    heldKeys.push(lane);
    pressLane(lane);
  }

  function onKeyUp(event) {
    if (!document.body.classList.contains("sync-active")) return;
    const keyLane = sim.LANE_KEYS.indexOf(event.code);
    const numberLane = /^Digit([1-6])$/.exec(event.code);
    let lane = -1;
    if (keyLane >= 0) lane = keyLane;
    else if (numberLane) lane = Number(numberLane[1]) - 1;
    if (lane < 0 || !heldKeys) return;
    const at = heldKeys.indexOf(lane);
    if (at < 0) return;
    heldKeys.splice(at, 1);
    releaseLane(lane);
  }

  /* -------------------------------------------------------------- 時間 ---- */

  // 音の時計と performance の時計は別物。途中で切り替えると曲が一瞬飛ぶので、
  // 章を始める那一刻でどちらを使うかを決めて固定する。
  let clockKind = "perf";

  function clockNow() {
    return clockKind === "audio" ? audio.rawNow() : performance.now() / 1000;
  }

  function chooseClock() {
    audio.context();
    clockKind = audio.isRunning() ? "audio" : "perf";
  }

  /** Map a clockNow() reading onto the AudioContext timeline.
   *  This is the only place the two clocks meet, so the conversion is exact
   *  for whichever clock is running and cannot drift. */
  function audioAt(at) {
    const c = audio.rawContext();
    return c ? c.currentTime + (at - clockNow()) : at;
  }

  function songTime() {
    if (!game) return 0;
    return clockNow() - songStart;
  }

  /* -------------------------------------------------------- 効果の出力 ---- */

  function burst(lane, count, color, speed, size) {
    const a = laneAngle(lane);
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const spread = (Math.random() - 0.5) * 1.5;
      const dir = a + spread;
      const sp = speed * (0.35 + Math.random());
      particles.push({
        x: view.cx + Math.cos(dir) * view.strike,
        y: view.cy + Math.sin(dir) * view.strike,
        vx: Math.cos(dir) * sp,
        vy: Math.sin(dir) * sp,
        life: 1,
        decay: 1.1 + Math.random() * 1.4,
        size: size * (0.5 + Math.random()),
        color
      });
    }
  }

  function ring(lane, color, strength) {
    ripples.push({ lane, color, life: 1, strength: strength || 1 });
  }

  function sparksOut(count, color) {
    const a = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      if (sparks.length >= MAX_PARTICLES) sparks.shift();
      const dir = Math.random() * TAU;
      const sp = 60 + Math.random() * 240;
      sparks.push({
        x: view.cx, y: view.cy,
        vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
        life: 1, decay: 0.7 + Math.random(), size: 1 + Math.random() * 2, color
      });
    }
  }

  function laneAngle(lane) {
    return lane * LANE_ARC - Math.PI / 2;
  }

  /* -------------------------------------------------- sim の結果を演出へ ---- */

  function consume(result) {
    if (!result) return;
    const events = game ? game.events : [];
    for (const ev of events) handleEvent(ev);
    game.events.length = 0;
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case "judge": {
        const color = ev.grade === "perfect" ? "#ffffff"
          : ev.grade === "great" ? mood.glow : mood.warm;
        laneFlash[ev.lane] = 1;
        ring(ev.lane, color, ev.grade === "perfect" ? 1.3 : 1);
        if (ev.grade === "perfect") {
          SFX.perfect(ev.lane);
          burst(ev.lane, 16, "#ffffff", 260, 2.4);
          haptic(12);
          shake = Math.max(shake, 3.5);
        } else if (ev.grade === "great") {
          SFX.great(ev.lane);
          burst(ev.lane, 11, mood.glow, 200, 2);
          haptic(8);
          shake = Math.max(shake, 2);
        } else {
          SFX.good(ev.lane);
          burst(ev.lane, 6, mood.warm, 130, 1.6);
        }
        if (ev.healed > 0) SFX.heal();
        break;
      }
      case "whiff":
        SFX.whiff();
        laneFlash[ev.lane] = 0.35;
        break;
      case "miss":
        SFX.miss();
        ring(ev.lane, "#ff6b8a", 1.5);
        shake = Math.max(shake, 8);
        flashAmount = Math.max(flashAmount, 0.4);
        haptic(40);
        burst(ev.lane, 10, "#ff6b8a", 150, 2);
        break;
      case "violation":
        SFX.violation();
        shake = Math.max(shake, 12);
        flashAmount = Math.max(flashAmount, 0.6);
        haptic(70);
        break;
      case "damage":
        flashAmount = Math.max(flashAmount, Math.min(0.5, ev.amount / 24));
        break;
      case "holdStart":
        ring(ev.lane, mood.glow, 1.1);
        break;
      case "holdEnd":
        if (ev.completed) {
          SFX.perfect(ev.lane);
          ring(ev.lane, mood.glow, 1.4);
          burst(ev.lane, 14, mood.glow, 230, 2.2);
          if (ev.healed > 0) SFX.heal();
        } else {
          SFX.miss();
          shake = Math.max(shake, 5);
        }
        break;
      case "pulse":
        SFX.pulse();
        ring(-1, "#ffffff", 2.4);
        sparksOut(46, "#ffffff");
        shake = Math.max(shake, 9);
        break;
      case "chain":
        SFX.heal();
        ring(-1, "#9effd8", 2);
        sparksOut(24, "#9effd8");
        break;
      case "autoClear":
        burst(ev.note.lane, 8, "#ffffff", 180, 1.8);
        break;
      case "bossHit":
        SFX.bossHit();
        shake = Math.max(shake, 4);
        sparksOut(10, mood.warm);
        break;
      case "bossStart":
        bossEntry = 1;
        shake = Math.max(shake, 14);
        break;
      case "bossDown":
        SFX.bossDown();
        shake = Math.max(shake, 20);
        flashAmount = 1;
        sparksOut(120, "#ffffff");
        ring(-1, "#ffffff", 3.4);
        break;
      case "silence":
        if (ev.active) shake = Math.max(shake, 5);
        break;
      case "dead":
        SFX.over();
        shake = Math.max(shake, 18);
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- 描画 ---- */

  function drawBackground(t) {
    const g = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, Math.max(view.w, view.h) * 0.78);
    g.addColorStop(0, mood.deep);
    g.addColorStop(0.55, mood.bg);
    g.addColorStop(1, "#010206");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = s.a + t * 0.008 * (i % 3 + 1);
      const r = s.r * view.outer * 1.9;
      const tw = 0.25 + 0.35 * Math.sin(t * 0.9 + s.p);
      ctx.fillStyle = "rgba(190,225,255," + (tw * 0.5).toFixed(3) + ")";
      ctx.fillRect(view.cx + Math.cos(a) * r, view.cy + Math.sin(a) * r, s.s, s.s);
    }
    ctx.restore();
  }

  function drawLanes(t, pulse) {
    const inner = view.core * 1.16;
    for (let lane = 0; lane < LANES; lane++) {
      const a0 = laneAngle(lane) - LANE_ARC / 2;
      const a1 = a0 + LANE_ARC;
      const flash = laneFlash[lane];
      const held = laneHeld[lane];
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, view.outer, a0, a1);
      ctx.arc(view.cx, view.cy, inner, a1, a0, true);
      ctx.closePath();
      const g = ctx.createRadialGradient(view.cx, view.cy, inner, view.cx, view.cy, view.outer);
      const silence = game && game.silence;
      const base = silence ? "#ff5f7d" : mood.glow;
      // 隣り合うレーンを交互に明暗で分ける。境目がないと扇形が読めない。
      const shade = lane % 2 ? 1 : 0.66;
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.62, hexA(base, (0.06 + flash * 0.24 + (held ? 0.14 : 0)) * shade));
      g.addColorStop(0.9, hexA(base, (0.12 + flash * 0.42 + (held ? 0.2 : 0) + pulse * 0.04) * shade));
      g.addColorStop(1, hexA(base, (0.05 + flash * 0.18) * shade));
      ctx.fillStyle = g;
      ctx.fill();
      // 塗るだけでは扇形の形が読めにくいので、両端に輪を引く。
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexA(base, 0.16 + flash * 0.5 + (held ? 0.24 : 0));
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, view.outer, a0, a1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, inner, a0, a1);
      ctx.stroke();
    }
  }

  function drawRings(pulse) {
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const r = view.core + (view.outer - view.core) * (i / 4);
      ctx.strokeStyle = "rgba(150,200,225," + (0.05 + (i === 2 ? 0.05 : 0)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, r, 0, TAU);
      ctx.stroke();
    }
    // レーン目の線
    ctx.strokeStyle = "rgba(150,200,225,.09)";
    for (let lane = 0; lane < LANES; lane++) {
      const a = laneAngle(lane) - LANE_ARC / 2;
      ctx.beginPath();
      ctx.moveTo(view.cx + Math.cos(a) * view.core * 1.16, view.cy + Math.sin(a) * view.core * 1.16);
      ctx.lineTo(view.cx + Math.cos(a) * view.outer, view.cy + Math.sin(a) * view.outer);
      ctx.stroke();
    }
    ctx.restore();

    // 判定の輪。拍で脈打つ。
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2 + pulse * 4;
    ctx.strokeStyle = hexA(game && game.silence ? "#ff5f7d" : mood.glow, 0.3 + pulse * 0.5);
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.strike, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawRipples(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life -= dt * 2.1;
      if (rp.life <= 0) { ripples.splice(i, 1); continue; }
      const grow = 1 - rp.life;
      const r = view.strike + grow * view.outer * 0.5 * rp.strength;
      const width = 1 + rp.life * 5 * rp.strength;
      ctx.lineWidth = width;
      ctx.strokeStyle = hexA(rp.color, rp.life * 0.65);
      ctx.beginPath();
      if (rp.lane < 0) ctx.arc(view.cx, view.cy, r, 0, TAU);
      else {
        const a0 = laneAngle(rp.lane) - LANE_ARC / 2;
        ctx.arc(view.cx, view.cy, r, a0, a0 + LANE_ARC);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNotes(t) {
    if (!game) return;
    const approach = game.chart.spb * sim.APPROACH_BEATS;
    const now = songTime();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = game.missCursor; i < game.chart.notes.length; i++) {
      const note = game.chart.notes[i];
      const remain = note.time - now;
      if (remain > approach) break;
      if (note.judged) continue;
      const p = Math.max(0, Math.min(1, 1 - remain / approach));
      const r = view.outer + (view.strike - view.outer) * p;
      const a = laneAngle(note.lane);
      const x = view.cx + Math.cos(a) * r;
      const y = view.cy + Math.sin(a) * r;
      const near = p * p;
      const size = (note.kind === "accent" ? 15 : 11) * (0.6 + near * 0.75);
      const color = note.kind === "accent" ? "#ffd76e"
        : note.kind === "hold" ? mood.warm : mood.glow;

      if (note.kind === "hold" && !note.holdBroken) {
        // 尾の長さは「残りの拍数」で決める。
        // 頭がまだなら外側へ伸ばし、頭を越えたあとは判定の輪の外に留める。
        const headDone = remain <= 0;
        const holdLeft = Math.max(0, note.time + note.lenTime - now);
        const reach = headDone
          ? view.strike + (holdLeft / approach) * (view.outer - view.strike) * 0.85
          : view.outer;
        ctx.lineWidth = 6 + near * 5;
        ctx.strokeStyle = hexA(color, 0.22 + near * 0.35);
        ctx.beginPath();
        ctx.moveTo(view.cx + Math.cos(a) * r, view.cy + Math.sin(a) * r);
        ctx.lineTo(view.cx + Math.cos(a) * reach, view.cy + Math.sin(a) * reach);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.shadowBlur = 22;
      ctx.shadowColor = color;
      ctx.fillStyle = note.kind === "accent" ? "#fff3c9" : "#ffffff";
      drawShard(ctx, size, note.kind === "accent" ? 1.35 : 1);
      ctx.fillStyle = hexA(color, 0.85);
      drawShard(ctx, size * 1.7, note.kind === "accent" ? 1.35 : 1);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawShard(c, size, widen) {
    const w = size * widen;
    c.beginPath();
    c.moveTo(0, -size * 1.35);
    c.lineTo(w, 0);
    c.lineTo(0, size * 1.35);
    c.lineTo(-w, 0);
    c.closePath();
    c.fill();
  }

  function drawCore(t, pulse) {
    if (!game) return;
    const ratio = game.maxIntegrity ? Math.max(0, game.integrity / game.maxIntegrity) : 0;
    const hue = ratio > 0.55 ? mood.glow : ratio > 0.28 ? mood.warm : "#ff5f7d";
    const r = view.core * (1 + pulse * 0.07);
    const spin = t * 0.5;

    // 外側の残量リング
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.core * 1.75, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = hue;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.core * 1.75, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.stroke();
    ctx.restore();

    // 核
    ctx.save();
    ctx.translate(view.cx, view.cy);
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowBlur = 34;
    ctx.shadowColor = hue;
    ctx.rotate(spin);
    ctx.fillStyle = hexA(hue, 0.9);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const rr = r * (i % 2 ? 0.78 : 1);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-spin * 1.6);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.32, 0, TAU);
    ctx.stroke();
    ctx.restore();

    if (game.boss && game.boss.active && !game.boss.dead) {
      drawBoss(pulse);
    }
  }

  function drawBoss(pulse) {
    const b = game.boss;
    const entry = bossEntry;
    const ratio = Math.max(0, b.hp / b.maxHp);
    const r = view.core * 2.5 * (1 + (1 - entry) * 1.6);
    const spin = songTime() * 0.8;
    ctx.save();
    ctx.translate(view.cx, view.cy);
    ctx.globalCompositeOperation = "lighter";
    ctx.rotate(spin);
    ctx.strokeStyle = hexA(b.hitFlash > 0.4 ? "#ffffff" : "#ff9a6e", 0.55);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r, (i / 3) * TAU + pulse * 0.15, (i / 3) * TAU + TAU * 0.72 + pulse * 0.15);
      ctx.stroke();
    }
    ctx.rotate(-spin * 1.4);
    ctx.strokeStyle = hexA("#ffd0a0", 0.85);
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.22, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const arr of [particles, sparks]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 2.4;
        p.vy *= 1 - dt * 2.4;
        p.life -= p.decay * dt;
        if (p.life <= 0) { arr.splice(i, 1); continue; }
        ctx.fillStyle = hexA(p.color, Math.max(0, p.life) * 0.9);
        const s = p.size * (0.4 + p.life * 0.8);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  function drawPreview(t) {
    if (!game || !game.mods.preview) return;
    const spb = game.chart.spb;
    const now = songTime();
    const horizon = game.mods.preview * spb;
    const r = view.core * 1.34;
    ctx.save();
    ctx.translate(view.cx, view.cy);
    for (let lane = 0; lane < LANES; lane++) {
      const a0 = laneAngle(lane) - LANE_ARC / 2;
      const a1 = a0 + LANE_ARC;
      for (let i = game.missCursor; i < game.chart.notes.length; i++) {
        const note = game.chart.notes[i];
        const dt = note.time - now;
        if (dt > horizon) break;
        if (note.lane !== lane || note.judged || dt < -0.2) continue;
        const p = Math.max(0, Math.min(1, 1 - dt / horizon));
        const rr = r + (1 - p) * view.core * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a1);
        ctx.strokeStyle = hexA(mood.glow, 0.08 + p * 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSilence(t) {
    if (!game || !game.silence) return;
    const now = songTime();
    const pulse = 0.5 + 0.5 * Math.sin(now * 11);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 3 + pulse * 5;
    ctx.strokeStyle = hexA("#ff5f7d", 0.3 + pulse * 0.4);
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, view.core * 2.1 + pulse * 12, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = hexA("#ff2b4d", 0.05 + pulse * 0.05);
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawCountIn(t) {
    if (!game || mode !== "play") return;
    const now = songTime();
    const lead = sim.LEAD_BEATS * game.chart.spb;
    if (now > lead) return;
    const p = 1 - now / lead;
    const idx = Math.floor((1 - p) * sim.LEAD_BEATS);
    ctx.save();
    // HUD と重ならないよう、核の下にある余白へ置く。
    ctx.translate(view.cx, view.cy + view.outer * 0.66);
    for (let i = 0; i < sim.LEAD_BEATS; i++) {
      const on = i <= idx;
      ctx.beginPath();
      ctx.arc((i - (sim.LEAD_BEATS - 1) / 2) * 22, 0, on ? 7 : 4, 0, TAU);
      ctx.fillStyle = on ? hexA(mood.glow, 0.95) : "rgba(255,255,255,.2)";
      ctx.fill();
    }
    ctx.restore();
  }

  function hexA(hex, alpha) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const num = parseInt(full, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return "rgba(" + r + "," + g + "," + b + "," + Math.max(0, Math.min(1, alpha)).toFixed(3) + ")";
  }

  /* ------------------------------------------------------------------ UI ---- */

  const screens = {
    title: $("syncTitle"),
    play: $("syncPlay"),
    overlay: $("syncOverlay")
  };

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      if (screens[key]) screens[key].classList.toggle("hidden", key !== name);
    }
  }

  function toast(text) {
    const el = $("syncToast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }
  let toastTimer = null;

  function card(kicker, title, body, actions) {
    const el = $("syncOverlay");
    el.innerHTML = '<div class="sync-card"><div class="sync-kicker">' + kicker + "</div><h2>" +
      title + "</h2><div class=\"sync-body\">" + body + "</div>" +
      '<div class="sync-actions">' + (actions || "") + "</div></div>";
    el.classList.remove("hidden");
    const nodes = el.querySelectorAll("[data-action]");
    nodes.forEach(node => {
      node.addEventListener("click", () => {
        SFX.ui();
        const fn = node.getAttribute("data-action");
        if (fn === "resonance") showUpgrade();
        else if (fn === "retry") startChapter(chapterIndex, upgrades);
        else if (fn === "title") goTitle();
        else if (fn === "resume") resume();
      });
    });
  }

  function hideCard() {
    const el = $("syncOverlay");
    if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
  }

  function enterSync() {
    document.body.classList.add("sync-active");
    canvas.classList.remove("hidden");
    canvas.setAttribute("aria-hidden", "false");
    mood = sim.CHAPTERS[chapterIndex].mood;
    showScreen("title");
    resize();
    refreshTitle();
  }

  function exitSync() {
    stopScheduler();
    forgetInput();
    mode = "off";
    hideCard();
    for (const key of Object.keys(screens)) if (screens[key]) screens[key].classList.add("hidden");
    document.body.classList.remove("sync-active");
    canvas.classList.add("hidden");
    canvas.setAttribute("aria-hidden", "true");
    game = null;
    particles = [];
    ripples = [];
    sparks = [];
  }

  function refreshTitle() {
    const el = $("syncRecord");
    if (!el) return;
    const el2 = $("syncProgress");
    if (el2) {
      el2.textContent = record.clears > 0
        ? "CLEAR " + record.clears + "  /  CH " + Math.max(1, record.bestChapter) + "  /  " + (record.bestGrade || "—")
        : "まだ ひとの音も鳴っていない。";
    }
    el.textContent = record.bestScore > 0
      ? "BEST " + record.bestScore.toLocaleString("en-US") + "  ·  PERFECT " + record.perfects
      : "SCORE 0  ·  PERFECT 0";
  }

  function goTitle() {
    stopScheduler();
    mode = "title";
    hideCard();
    game = null;
    showScreen("title");
    refreshTitle();
  }

  function startChapter(index, withUpgrades) {
    forgetInput();
    chapterIndex = Math.max(0, Math.min(sim.CHAPTERS.length - 1, index));
    upgrades = (withUpgrades || []).slice();
    const chapter = sim.CHAPTERS[chapterIndex];
    mood = chapter.mood;
    game = sim.createState({
      chapterIndex,
      upgrades,
      seed: 0x5eed1 + chapterIndex * 977
    });
    // 拍0は「これから鳴る」ので、音が鳴る少し前に合わせて走らせる。
    chooseClock();
    songStart = clockNow() + 0.28;
    scheduledBeat = 0;
    musicFrom = -Infinity;
    sim.start(game, -0.28);
    lastBeatDrawn = -1;
    bossEntry = 0;
    particles = [];
    ripples = [];
    sparks = [];
    laneFlash = [0, 0, 0, 0, 0, 0];
    laneHeld = [false, false, false, false, false, false];
    hideCard();
    showScreen("play");
    startScheduler();
    mode = "play";
    updateHud();
    resize();
    $("syncChapter").textContent = "第" + CHAPTER_NUMERAL[chapterIndex] + "章 · " + chapter.jp;
    $("syncHint").textContent = chapter.lead;
    setTimeout(() => {
      if (mode === "play") $("syncHint").classList.add("fade");
    }, 4200);
  }

  function pause() {
    if (mode !== "play") return;
    mode = "paused";
    pausedAt = songTime();
    stopScheduler();
    card("PAUSED", "一拍、止める",
      "<p>音が止まった。拍は止まっていない。</p>",
      '<button class="sync-primary" data-action="resume">つづける</button>' +
      '<button class="sync-ghost" data-action="title">タイトルへ</button>');
  }

  function resume() {
    if (mode !== "paused") return;
    // 止めた時間だけ時計をずらす。音を鳴らし始める位置を音の時計に合わせる。
    const gap = clockNow() - (songStart + pausedAt);
    songStart += gap;
    // Requeue the remaining half-beat too, without replaying elapsed notes.
    musicFrom = clockNow();
    scheduledBeat = Math.max(0, Math.floor(pausedAt / game.chart.spb));
    hideCard();
    showScreen("play");
    startScheduler();
    mode = "play";
  }

  function updateHud() {
    if (!game) return;
    const ratio = game.maxIntegrity ? game.integrity / game.maxIntegrity : 0;
    $("syncHpFill").style.width = (Math.max(0, ratio) * 100).toFixed(1) + "%";
    $("syncHpLabel").textContent = Math.ceil(game.integrity) + " / " + game.maxIntegrity;
    $("syncScore").textContent = game.stats.score.toLocaleString("en-US");
    const mult = sim.multiplier(game);
    $("syncCombo").textContent = game.combo > 0
      ? game.combo + " 連 ×" + mult.toFixed(2)
      : "×" + mult.toFixed(2);
    $("syncAcc").textContent = game.stats.judged
      ? Math.round(sim.accuracyOf(game) * 100) + "%"
      : "\u2014";
    const boss = $("syncBoss");
    if (game.boss && game.boss.active) {
      boss.classList.remove("hidden");
      $("syncBossName").textContent = sim.BOSS.jp;
      $("syncBossFill").style.width = (Math.max(0, game.boss.hp / game.boss.maxHp) * 100).toFixed(1) + "%";
    } else {
      boss.classList.add("hidden");
    }
    // ボスの欄が出ると計器が伸びる。円が隠れたときだけ配置を取り直す。
    const hudBottom = boss.parentElement ? boss.parentElement.getBoundingClientRect().bottom : 0;
    if (Math.abs(hudBottom - (view.hudBottom || 0)) > 2) {
      view.hudBottom = hudBottom;
      resize();
    }
  }

  function statsBlock(state) {
    const acc = Math.round(sim.accuracyOf(state) * 100);
    return '<div class="sync-stats">' +
      "<div><strong>" + acc + "%</strong>正確さ</div>" +
      "<div><strong>" + state.stats.maxCombo + "</strong>最大コンボ</div>" +
      "<div><strong>" + state.stats.perfect + "</strong>PERFECT</div>" +
      "</div>" +
      '<p class="sync-sub"> GREAT ' + state.stats.great + " · GOOD " + state.stats.good +
      " · 逃し " + state.stats.miss + " · 空振り " + state.stats.whiff +
      (state.stats.breaks ? " · 断拍 " + state.stats.breaks : "") + "</p>";
  }

  function commitRecord() {
    if (game.stats.score > record.bestScore) record.bestScore = game.stats.score;
    if (chapterIndex + 1 > record.bestChapter) record.bestChapter = chapterIndex + 1;
    const grade = sim.gradeOf(game);
    const order = ["C", "B", "A", "S", "SS", "SSS"];
    if (order.indexOf(grade) > order.indexOf(record.bestGrade)) record.bestGrade = grade;
    record.perfects += game.stats.perfect;
    if (game.cleared && chapterIndex + 1 >= sim.CHAPTERS.length) record.clears += 1;
    saveRecord();
  }

  function chapterCleared() {
    commitRecord();
    stopScheduler();
    forgetInput();
    mode = "result";
    SFX.clear();
    const grade = sim.gradeOf(game);
    const chapter = sim.CHAPTERS[chapterIndex];
    const last = chapterIndex >= sim.CHAPTERS.length - 1;
    const body = '<p class="sync-grade">' + grade + "</p>" +
      '<p class="sync-sub">SCORE ' + game.stats.score.toLocaleString("en-US") + "</p>" +
      statsBlock(game);
    if (last) {
      setTimeout(showEnding, 1500);
      return;
    }
    const offers = sim.rollResonances(game, 3);
    if (!offers.length) {
      startChapter(chapterIndex + 1, upgrades);
      return;
    }
    pendingOffers = offers;
    card("CHAPTER " + (chapterIndex + 1) + " CLEAR", chapter.jp + " を越えた",
      body + "<p class=\"sync-sub\">次の章で持ち歩く共鳴を、ひとつ選んでください。</p>",
      '<button class="sync-primary" data-action="resonance">共鳴をえらぶ</button>');
  }

  let pendingOffers = [];

  function showUpgrade() {
    mode = "upgrade";
    const el = $("syncOverlay");
    const items = pendingOffers.map((offer, i) =>
      '<button class="sync-offer" data-offer="' + offer.id + '">' +
      '<span class="sync-offer-icon">' + offer.icon + "</span>" +
      '<span class="sync-offer-body"><b>' + offer.jp + "</b>" +
      '<i>' + offer.en + "</i><em>" + offer.desc + "</em></span></button>"
    ).join("");
    el.innerHTML = '<div class="sync-card wide"><div class="sync-kicker">RESONANCE</div>' +
      "<h2>共鳴をえらぶ</h2>" +
      '<div class="sync-offers">' + items + "</div></div>";
    el.classList.remove("hidden");
    el.querySelectorAll("[data-offer]").forEach(node => {
      node.addEventListener("click", () => {
        SFX.ui();
        upgrades.push(node.getAttribute("data-offer"));
        nextChapter();
      });
    });
  }

  function nextChapter() {
    hideCard();
    startChapter(chapterIndex + 1, upgrades);
  }

  function showEnding() {
    // 記録は chapterCleared() で すでに 積み上げてある。ここでは足さない。
    mode = "ending";
    card("ALL CLEAR", "共鳴 は、届いた",
      '<p class="sync-grade">' + sim.gradeOf(game) + "</p>" +
      '<p class="sync-sub">最終スコア ' + game.stats.score.toLocaleString("en-US") + "</p>" +
      statsBlock(game) +
      "<p>拍は、だれかが刻んでいる。あなたの役目は、その音を聞き分けること。</p>",
      '<button class="sync-primary" data-action="retry">もういちど</button>' +
      '<button class="sync-ghost" data-action="title">タイトルへ</button>');
  }

  function gameOver() {
    stopScheduler();
    forgetInput();
    mode = "over";
    commitRecord();
    saveRecord();
    card("RESONANCE LOST", "核が、静まった",
      '<p class="sync-sub">到達 SCORE ' + game.stats.score.toLocaleString("en-US") +
      " · 第" + CHAPTER_NUMERAL[chapterIndex] + "章</p>" +
      statsBlock(game) +
      "<p>" + sim.CHAPTERS[chapterIndex].tip + "</p>",
      '<button class="sync-primary" data-action="retry">もう一度</button>' +
      '<button class="sync-ghost" data-action="title">タイトルへ</button>');
  }

  /* ---------------------------------------------------------------- 配線 ---- */

  function bind(id, handler) {
    const el = $(id);
    if (el) el.addEventListener("click", handler);
  }

  bind("openSyncBtn", () => { SFX.ui(); audio.context(); enterSync(); });
  bind("syncReturnBtn", () => { SFX.ui(); exitSync(); });
  bind("syncStartBtn", () => { SFX.ui(); audio.context(); startChapter(0, []); });
  bind("syncPauseBtn", () => { SFX.ui(); pause(); });
  bind("syncSoundBtn", () => {
    soundOn = !soundOn;
    saveSound();
    // 音を切るのは master を黙らせるだけ。時計を止めたり変えたりはしない。
    audio.context();
    audio.applyMute();
    const btn = $("syncSoundBtn");
    if (btn) {
      btn.textContent = soundOn ? "\u266B" : "\u266A\u0338";
      btn.setAttribute("aria-label", soundOn ? "\u97F3\u3092\u6D88\u3059" : "\u97F3\u3092\u51FA\u3059");
    }
    if (soundOn) SFX.ui();
  });
  bind("syncHowBtn", () => {
    SFX.ui();
    if (mode !== "play") return;
    pause();
    card("HOW TO PLAY", "あそびかた",
      "<p>ノイズは拍に合わせて迫ってくる。<b>拍の、その一瞬</b>にレーンを叩けば砕ける。</p>" +
      "<p>Determination: PERFECT ±48ms / GREAT ±92ms / GOOD ±136ms。</p>" +
      "<p>長音符は<b>押しっぱなし</b>。赤い輪が縮む静寂の区間は、叩いてはならない。</p>" +
      '<p class="sync-sub">タップ / クリック — 画面上の扇形 / キー — ' +
      sim.LANE_KEYS.map(k => k.replace("Key", "")).join(" ") + "</p>",
      '<button class="sync-primary" data-action="resume">つづける</button>');
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, onPointerUp);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", resize);
  function loseFocus() {
    if (mode === "play") pause();
    if (mode === "paused") {
      for (const lane of new Set([...(heldKeys || []), ...pointers.values()])) releaseLane(lane);
      forgetInput();
    }
  }
  window.addEventListener("blur", loseFocus);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) loseFocus();
  });

  /* ------------------------------------------------------------- 描画ループ ---- */

  let lastFrame = 0;   // 秒で持つ。ミリ秒のままにすると dt が負に振り、全演出が暴走する。

  function frame(nowMs) {
    requestAnimationFrame(frame);
    const t = nowMs / 1000;
    if (mode === "off") { lastFrame = t; return; }
    const dt = Math.max(0, Math.min(0.05, lastFrame ? t - lastFrame : 0.016));
    lastFrame = t;

    const playing = mode === "play" && game && game.running;
    if (playing) {
      const now = songTime();
      const events = sim.update(game, now);
      for (const ev of events) handleEvent(ev);
      for (let lane = 0; lane < LANES; lane++) laneHeld[lane] = !!game.held[lane];
      // 拍の脈動
      const beat = Math.floor(now / game.chart.spb);
      if (beat !== lastBeatDrawn && beat >= 0) {
        lastBeatDrawn = beat;
        ring(((beat % LANES) + LANES) % LANES, mood.glow, 0.5);
      }
      updateHud();
    } else if (game) {
      for (let lane = 0; lane < LANES; lane++) laneHeld[lane] = !!game.held[lane];
    }

    // 終端は game.running ではなく mode で判定する。
    // sim はクリアした瞬間に running を false にするので、
    // ここで見ていないと結果画面が開かず、譜面が止まったままになる。
    if (mode === "play" && game) {
      if (game.over) gameOver();
      else if (game.cleared) chapterCleared();
    }

    const beatPhase = playing ? (songTime() / game.chart.spb) % 1 : (t * 1.1) % 1;
    const pulse = Math.pow(1 - beatPhase, 3);

    shake = Math.max(0, shake - dt * 26);
    flashAmount = Math.max(0, flashAmount - dt * 2.6);
    bossEntry = Math.max(0, bossEntry - dt * 0.8);
    for (let lane = 0; lane < LANES; lane++) laneFlash[lane] = Math.max(0, laneFlash[lane] - dt * 3.6);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.save();
    drawBackground(t);
    // Shake only what sits on top of the background. Translating first would
    // leave the uncovered border showing the previous frame.
    ctx.save();
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawLanes(t, pulse);
    drawRings(pulse);
    drawRipples(dt);
    drawNotes(t);
    drawPreview(t);
    drawCore(t, pulse);
    drawSilence(t);
    drawParticles(dt);
    ctx.restore();
    ctx.restore();

    if (flashAmount > 0.01) {
      ctx.fillStyle = "rgba(255,240,220," + (flashAmount * 0.5).toFixed(3) + ")";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (playing) drawCountIn(t);
  }

  refreshTitle();
  resize();
  requestAnimationFrame(frame);

  // テストから状態を覗けるようにしておく（tests/sync.test.cjs が使う）。
  window.__sync = {
    enter: enterSync,
    exit: exitSync,
    goTitle,
    start: startChapter,
    getMode: () => mode,
    getFlash: () => flashAmount,
    /** 検証用。譜面どおりに叩き切って章を終える。実際の play と同じ道を通す。 */
    autoPlay(maxSeconds) {
      if (!game) return null;
      const holding = {};
      const step = 1 / 120;
      let t = songTime();
      // ボスのいる章は、開幕から bossStartTime + 30サイクル ぶんまで回す。
      // 譜面本体の長さで打ち切ると、ボス戦が終わる前に止まってしまう。
      const bossTail = game.boss
        ? game.chart.bossStartTime + sim.BOSS.cycle * sim.BOSS.maxCycles * 0.62 * game.chart.spb
        : 0;
      const natural = Math.max(game.chart.duration + 6, bossTail);
      const limit = (maxSeconds || 0) || natural;
      while (t - songStart < limit) {
        t += step;
        const now = t - songStart;
        for (const ev of sim.update(game, now)) handleEvent(ev);
        if (game.over || game.cleared) break;
        if (game.silence) continue;
        for (const note of game.chart.notes) {
          if (note.judged || note.holdBroken || note.holdDone) continue;
          const delta = note.time - now;
          if (note.kind === "hold") {
            if (delta <= 0.02 && holding[note.lane] !== note.id) {
              sim.press(game, note.lane, now);
              for (const ev of game.events) handleEvent(ev);
              game.events.length = 0;
              holding[note.lane] = note.id;
            }
          } else if (delta <= 0 && delta > -0.1) {
            sim.press(game, note.lane, now);
            for (const ev of game.events) handleEvent(ev);
            game.events.length = 0;
          }
        }
        for (const key of Object.keys(holding)) {
          const lane = Number(key);
          const note = game.chart.notes.find(n => n.id === holding[key]);
          if (!note) { holding[key] = null; continue; }
          if (now >= note.time + note.lenTime) {
            sim.release(game, lane, now);
            for (const ev of game.events) handleEvent(ev);
            game.events.length = 0;
            holding[key] = null;
          }
        }
      }
      return { cleared: game.cleared, over: game.over };
    },
    getGame: () => game,
    getUpgrades: () => upgrades.slice(),
    getChapter: () => chapterIndex,
    getRecord: () => Object.assign({}, record),
    pressLane: (lane) => pressLane(lane),
    releaseLane: (lane) => releaseLane(lane)
  };
})();
