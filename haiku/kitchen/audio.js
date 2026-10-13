// All sound is synthesized with Web Audio: a lo-fi loop, kitchen effects, and blips for auntie's voice.
// Nothing is loaded from files. The context is created on the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuf = null;
  let musicTimer = null;
  let nextBar = 0;
  let barIndex = 0;
  let musicOn = false;
  let settings = { music: 0.35, sfx: 0.7, muted: false };
  const loops = {};

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return null;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    // Gentle echo for the music, so the pads sit in a room.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.37;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    musicBus.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    applyVolumes();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : 0.9, t, 0.05);
    musicBus.gain.setTargetAtTime(settings.music * 0.9, t, 0.05);
    sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
  }

  function setSettings(next) {
    settings = Object.assign({}, settings, next);
    applyVolumes();
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
    return !!c;
  }

  function suspend() {
    if (ctx && ctx.state === "running") ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state === "suspended" && !document.hidden) ctx.resume();
  }

  // ---- Primitives --------------------------------------------------------
  function env(g, t, attack, peak, decay, dest = sfxBus) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function osc(type, freq, t, dur, peak, dest = sfxBus, detune = 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(g);
    g.connect(dest);
    env(g, t, 0.005, peak, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function noise(t, dur, peak, type, freq, q = 0.7, dest = sfxBus) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    env(g, t, 0.003, peak, dur);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    src.stop(t + dur + 0.06);
    return g;
  }

  // A loop that stays on until stop() is called. Returns a handle.
  function startLoop(key, build) {
    if (!ctx || loops[key]) return;
    loops[key] = build(ctx.currentTime);
  }

  function stopLoop(key) {
    const h = loops[key];
    if (!h) return;
    const t = ctx.currentTime;
    try {
      h.gain.gain.cancelScheduledValues(t);
      h.gain.gain.setTargetAtTime(0, t, 0.05);
      h.stopAt = t + 0.3;
      h.nodes.forEach((n) => { try { n.stop(t + 0.35); } catch (e) { /* already ended */ } });
    } catch (e) {
      /* ignore */
    }
    delete loops[key];
  }

  // ---- Kitchen effects --------------------------------------------------
  const sfx = {
    water(t = 0) {
      if (!ctx) return;
      startLoop("water", (t0) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 2300;
        f.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.2);
        src.connect(f);
        f.connect(g);
        g.connect(sfxBus);
        src.start(t0, 0.5);
        return { nodes: [src], gain: g };
      });
    },
    waterStop() {
      stopLoop("water");
    },
    sizzle(strength = 1) {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) noise(t + i * 0.035 + Math.random() * 0.02, 0.03, 0.12 * strength, "highpass", 3800 + Math.random() * 2000, 1.2);
    },
    sizzleLoop(on) {
      if (!ctx) return;
      if (on) {
        startLoop("sizzle", (t0) => {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          src.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 4200;
          f.Q.value = 0.9;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.4);
          src.connect(f);
          f.connect(g);
          g.connect(sfxBus);
          src.start(t0, 0.2);
          return { nodes: [src], gain: g };
        });
      } else {
        stopLoop("sizzle");
      }
    },
    // Gentle bubbling: small blips for ぽこぽこ, a denser low pattern for ぐつぐつ.
    bubbling(level) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const n = level === "boil" ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const start = t + i * (level === "boil" ? 0.07 : 0.21) + Math.random() * 0.03;
        const f = level === "boil" ? 260 + Math.random() * 120 : 420 + Math.random() * 300;
        osc("sine", f, start, 0.07, 0.07, sfxBus);
      }
    },
    chop() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.05, 0.25, "highpass", 1400, 0.8);
      osc("sine", 190 + Math.random() * 40, t, 0.12, 0.22);
    },
    crack(clean = true) {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.04, 0.35, "bandpass", 2600, 1.4);
      osc("triangle", clean ? 1100 : 740, t + 0.02, 0.09, 0.08);
      if (!clean) noise(t + 0.06, 0.12, 0.18, "highpass", 3200, 1.5);
    },
    beat() {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) noise(t + i * 0.08, 0.06, 0.1, "highpass", 2400, 0.7);
    },
    spoon() {
      if (!ctx) return;
      const t = ctx.currentTime;
      osc("sine", 2300, t, 0.18, 0.09);
      osc("sine", 3400, t, 0.1, 0.04);
    },
    stir(speed = 1) {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.12, 0.05 * speed, "lowpass", 620, 0.5);
    },
    stirLoop(on) {
      if (!ctx) return;
      if (on) {
        startLoop("stir", (t0) => {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          src.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = 520;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.2);
          const lfo = ctx.createOscillator();
          const lg = ctx.createGain();
          lfo.frequency.value = 2.4;
          lg.gain.value = 0.03;
          lfo.connect(lg);
          lg.connect(g.gain);
          lfo.start(t0);
          src.connect(f);
          f.connect(g);
          g.connect(sfxBus);
          src.start(t0, 0.1);
          return { nodes: [src, lfo], gain: g };
        });
      } else {
        stopLoop("stir");
      }
    },
    cupboard() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.18, 0.2, "lowpass", 520, 0.6);
      osc("sine", 110, t, 0.09, 0.14);
    },
    chime() {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const [f, d] of [[1046, 0], [1318, 0.2], [1568, 0.42], [2093, 0.6]]) osc("sine", f * (1 + (Math.random() - 0.5) * 0.01), t + d, 1.4, 0.05);
    },
    tick() {
      if (!ctx) return;
      const t = ctx.currentTime;
      osc("sine", 1800, t, 0.012, 0.02);
    },
    bird() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(2400, t);
      o.frequency.exponentialRampToValueAtTime(3300, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g);
      g.connect(sfxBus);
      o.start(t);
      o.stop(t + 0.25);
    },
    meow() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(520, t);
      o.frequency.linearRampToValueAtTime(860, t + 0.25);
      o.frequency.linearRampToValueAtTime(620, t + 0.6);
      f.type = "bandpass";
      f.frequency.value = 1100;
      f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(f);
      f.connect(g);
      g.connect(sfxBus);
      o.start(t);
      o.stop(t + 0.75);
    },
    hum() {
      if (!ctx) return;
      const t = ctx.currentTime;
      osc("sine", 196, t, 1.6, 0.03);
      osc("sine", 294, t + 0.05, 1.5, 0.02);
      osc("sine", 247, t + 0.4, 1.4, 0.015);
    },
    cheer() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => osc("triangle", f, t + i * 0.09, 0.5, 0.07));
    },
    unlock() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [880, 1318, 1760].forEach((f, i) => osc("sine", f, t + i * 0.12, 1.2, 0.05));
    },
    nice() {
      if (!ctx) return;
      osc("sine", 1400, ctx.currentTime, 0.12, 0.05);
    },
    miss() {
      if (!ctx) return;
      osc("sine", 240, ctx.currentTime, 0.1, 0.05);
    },
    click() {
      if (!ctx) return;
      osc("sine", 900, ctx.currentTime, 0.04, 0.05);
    },
    step() {
      if (!ctx) return;
      noise(ctx.currentTime, 0.04, 0.03, "lowpass", 700, 0.6);
    },
    // Typewriter blip, pitched in auntie's register.
    blip() {
      if (!ctx) return;
      osc("sine", 640 + Math.random() * 120, ctx.currentTime, 0.035, 0.035);
    }
  };

  // ---- Lo-fi music loop ---------------------------------------------------
  // Chords in C: Cmaj7, Am7, Fmaj7, G6. Notes are MIDI numbers.
  const CHORDS = [
    { root: 48, notes: [60, 64, 67, 71] },
    { root: 45, notes: [57, 60, 64, 67] },
    { root: 41, notes: [57, 60, 64, 69] },
    { root: 43, notes: [55, 59, 62, 64] }
  ];
  const MELODY = [72, 0, 76, 74, 0, 71, 69, 0, 67, 0, 69, 71, 0, 72, 0, 0, 76, 0, 74, 71, 0, 69, 67, 0, 64, 0, 67, 69, 0, 71, 0, 0];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BAR = 60 / 84 * 4;

  function scheduleBar(t, bar) {
    const chord = CHORDS[bar % CHORDS.length];
    for (const n of chord.notes) {
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      o.type = "triangle";
      o2.type = "sine";
      o.frequency.value = mtof(n);
      o2.frequency.value = mtof(n) * 1.003;
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g);
      g.connect(musicBus);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.9);
      g.gain.setValueAtTime(0.03, t + BAR - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 0.8);
      o.start(t);
      o2.start(t);
      o.stop(t + BAR + 1);
      o2.stop(t + BAR + 1);
    }
    // Soft bass on the root
    const b = ctx.createOscillator();
    const bg = ctx.createGain();
    b.type = "sine";
    b.frequency.value = mtof(chord.root);
    b.connect(bg);
    bg.connect(musicBus);
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + BAR * 0.9);
    b.start(t);
    b.stop(t + BAR);
    // Melody: a few notes per bar, low in the mix
    for (let i = 0; i < 8; i++) {
      const m = MELODY[(bar * 8 + i) % MELODY.length];
      if (!m) continue;
      const st = t + (i * BAR) / 8;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = mtof(m);
      o.connect(g);
      g.connect(musicBus);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.025, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      o.start(st);
      o.stop(st + 0.55);
    }
    // Soft kick on 1 and 3, hat on the off-beats
    for (const beat of [0, 2]) {
      const st = t + beat * (BAR / 4);
      const k = ctx.createOscillator();
      const kg = ctx.createGain();
      k.frequency.setValueAtTime(120, st);
      k.frequency.exponentialRampToValueAtTime(40, st + 0.18);
      kg.gain.setValueAtTime(0.16, st);
      kg.gain.exponentialRampToValueAtTime(0.0001, st + 0.25);
      k.connect(kg);
      kg.connect(musicBus);
      k.start(st);
      k.stop(st + 0.3);
    }
    for (let i = 0; i < 8; i++) {
      const st = t + i * (BAR / 8) + BAR / 16;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02, st);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.03);
      src.connect(f);
      f.connect(g);
      g.connect(musicBus);
      src.start(st, Math.random());
      src.stop(st + 0.05);
    }
  }

  function pumpMusic() {
    if (!ctx || !musicOn) return;
    while (nextBar < ctx.currentTime + 0.8) {
      scheduleBar(nextBar, barIndex);
      nextBar += BAR;
      barIndex++;
    }
  }

  function startMusic() {
    if (!ensure() || musicOn) return;
    musicOn = true;
    nextBar = ctx.currentTime + 0.1;
    pumpMusic();
    musicTimer = setInterval(pumpMusic, 200);
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  function dispose() {
    stopMusic();
    if (ctx) {
      try { ctx.close(); } catch (e) { /* closed */ }
    }
    ctx = null;
  }

  return {
    unlock,
    suspend,
    resume,
    setSettings,
    getSettings: () => Object.assign({}, settings),
    startMusic,
    stopMusic,
    sfx,
    get ready() { return !!ctx; },
    dispose
  };
}
