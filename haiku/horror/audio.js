// Everything is synthesized with Web Audio. No audio files.
// The context is created on the first user gesture (unlock), so browsers accept it.

// Kagome melody in beats: [frequency Hz, length in beats]. Pentatonic.
const KAGOME = [
  [392, 0.5], [392, 0.5], [440, 0.5], [392, 0.5], [330, 1],
  [392, 0.5], [392, 0.5], [440, 0.5], [392, 0.5], [330, 1],
  [294, 0.5], [330, 0.5], [392, 0.5], [440, 0.5], [523, 1],
  [392, 0.5], [440, 0.5], [523, 0.5], [587, 0.5], [523, 1],
  [0, 1]
];
const PING_NOTES = [1046.5, 1174.7, 1318.5, 1568, 1760];

export function createAudio() {
  let ctx = null;
  let master = null;
  let reverb = null;
  let noise = null;
  let enabled = true;
  let nodes = null;
  let heartT = 0;
  let dripT = 2;
  let clockSec = -1;
  let melodyIdx = 0;
  let melodyT = 0;
  let breathT = 1;
  let rnd = 0.37;

  function rand() {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (e) {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    master.connect(ctx.destination);
    reverb = makeReverb(2.4, 2.6);
    noise = makeNoise(2.0);
    buildBeds();
    return true;
  }

  function makeNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // Pinkish noise: smoothed white noise keeps the rain bed soft.
      b0 = b0 * 0.96 + w * 0.04;
      d[i] = w * 0.6 + b0 * 0.9;
    }
    return buf;
  }

  // Generated impulse response: a decaying noise tail feeding the master.
  function makeReverb(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    conv.connect(wet);
    wet.connect(master);
    return conv;
  }

  function sendReverb(from, amount = 0.35) {
    const g = ctx.createGain();
    g.gain.value = amount;
    from.connect(g);
    g.connect(reverb);
  }

  function src(loop, buffer = noise) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    return s;
  }

  // Envelope helper: quick attack, exponential decay.
  function env(g, t, peak, attack, decay) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function burst(t, { filter = "bandpass", freq = 1000, q = 1, peak = 0.3, attack = 0.003, decay = 0.1, rev = 0, dest = null }) {
    const s = src(false);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, peak, attack, decay);
    s.connect(f);
    f.connect(g);
    g.connect(dest || master);
    if (rev > 0) sendReverb(g, rev);
    s.start(t, rand() * 0.8);
    s.stop(t + attack + decay + 0.05);
  }

  function tone(t, { type = "sine", f0, f1 = f0, peak = 0.2, attack = 0.005, decay = 0.2, rev = 0, dest = null }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = ctx.createGain();
    env(g, t, peak, attack, decay);
    o.connect(g);
    g.connect(dest || master);
    if (rev > 0) sendReverb(g, rev);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  function buildBeds() {
    const t = ctx.currentTime;
    // Rain bed.
    const rainSrc = src(true);
    const rainLP = ctx.createBiquadFilter();
    rainLP.type = "lowpass";
    rainLP.frequency.value = 1600;
    const rainHP = ctx.createBiquadFilter();
    rainHP.type = "highpass";
    rainHP.frequency.value = 180;
    const rainG = ctx.createGain();
    rainG.gain.value = 0.0;
    rainSrc.connect(rainHP);
    rainHP.connect(rainLP);
    rainLP.connect(rainG);
    rainG.connect(master);
    rainSrc.start(t);
    // Wind: noise through a slowly sweeping bandpass.
    const windSrc = src(true);
    const windBP = ctx.createBiquadFilter();
    windBP.type = "bandpass";
    windBP.frequency.value = 380;
    windBP.Q.value = 0.7;
    const windG = ctx.createGain();
    windG.gain.value = 0.03;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG);
    lfoG.connect(windBP.frequency);
    windSrc.connect(windBP);
    windBP.connect(windG);
    windG.connect(master);
    windSrc.start(t);
    lfo.start(t);
    // The hum: a triangle with vibrato, panned by direction.
    const hum = ctx.createOscillator();
    hum.type = "triangle";
    hum.frequency.value = 392;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibG = ctx.createGain();
    vibG.gain.value = 3.5;
    vib.connect(vibG);
    vibG.connect(hum.frequency);
    const humLP = ctx.createBiquadFilter();
    humLP.type = "lowpass";
    humLP.frequency.value = 1300;
    const humG = ctx.createGain();
    humG.gain.value = 0;
    const pan = ctx.createStereoPanner();
    hum.connect(humLP);
    humLP.connect(humG);
    humG.connect(pan);
    pan.connect(master);
    hum.start(t);
    vib.start(t);
    // Well drip: a delay line with feedback.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dLP = ctx.createBiquadFilter();
    dLP.type = "lowpass";
    dLP.frequency.value = 2400;
    delay.connect(fb);
    fb.connect(dLP);
    dLP.connect(delay);
    const dripOut = ctx.createGain();
    dripOut.gain.value = 0.25;
    dLP.connect(dripOut);
    dripOut.connect(master);
    nodes = {
      rainG, rainLP, windG, hum, humG, pan, vib, delay,
      humVol: 0,
      humFreq: 392
    };
  }

  // ---- public ----

  function unlock() {
    if (!ensure()) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.05);
  }

  // Continuous beds and timers. info: { outdoors, humVol, humPan, fear, dt, clockSec }.
  function update(dt, info) {
    if (!ctx || !nodes || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const n = nodes;
    const rainLevel = info.outdoors ? 0.2 : 0.07;
    n.rainG.gain.setTargetAtTime(rainLevel, t, 0.4);
    n.rainLP.frequency.setTargetAtTime(info.outdoors ? 3200 : 900, t, 0.5);
    // Hum: pitch follows the melody; volume follows proximity.
    melodyT -= dt;
    if (melodyT <= 0) {
      const [f, beats] = KAGOME[melodyIdx % KAGOME.length];
      melodyIdx += 1;
      melodyT = beats * 0.52;
      if (f > 0) {
        n.hum.frequency.setTargetAtTime(f, t, 0.03);
        n.humFreq = f;
      }
    }
    n.humG.gain.setTargetAtTime(info.humVol || 0, t, 0.15);
    n.pan.pan.setTargetAtTime(info.humPan || 0, t, 0.1);
    // Breathing: heavier and quicker as breath runs short.
    const br = info.breath || 0;
    if (br > 0.02) {
      breathT -= dt;
      if (breathT <= 0 && enabled) {
        breathT = 2.6 - 1.7 * br;
        burst(t, { filter: "bandpass", freq: 1000 + 300 * br, q: 0.7, peak: 0.03 + 0.1 * br, attack: 0.16, decay: 0.45 });
        burst(t + 0.55, { filter: "bandpass", freq: 760, q: 0.8, peak: 0.02 + 0.05 * br, attack: 0.12, decay: 0.4 });
      }
    } else {
      breathT = 1;
    }
    // Heartbeat: rate and loudness follow fear.
    heartT -= dt;
    if (heartT <= 0) {
      const f = info.fear || 0;
      const bpm = 62 + 90 * f;
      heartT = 60 / bpm;
      if (enabled) {
        const peak = 0.12 + 0.3 * f;
        tone(t, { f0: 56, f1: 40, peak, attack: 0.01, decay: 0.16 });
        tone(t + 0.27, { f0: 62, f1: 44, peak: peak * 0.7, attack: 0.01, decay: 0.12 });
      }
    }
    // Well drip, now and then.
    dripT -= dt;
    if (dripT <= 0) {
      dripT = 2.2 + rand() * 4;
      if (ctx) {
        const d = ctx.createOscillator();
        d.type = "sine";
        const g = ctx.createGain();
        const f0 = 1400 + rand() * 700;
        d.frequency.setValueAtTime(f0, t);
        d.frequency.exponentialRampToValueAtTime(f0 * 1.4, t + 0.04);
        env(g, t, 0.14, 0.003, 0.09);
        d.connect(g);
        g.connect(n.delay);
        g.connect(master);
        d.start(t);
        d.stop(t + 0.2);
      }
    }
    // Tick of the wall clock, once a second.
    if (info.clockSec !== undefined && info.clockSec !== clockSec) {
      clockSec = info.clockSec;
      if (info.clockOn) tone(t, { f0: clockSec % 2 ? 1900 : 1500, peak: 0.02, attack: 0.002, decay: 0.03 });
    }
  }

  function footstep(surface, running) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const k = running ? 1.25 : 1;
    if (surface === "tatami") {
      burst(t, { filter: "lowpass", freq: 340, q: 0.7, peak: 0.16 * k, attack: 0.004, decay: 0.12 });
    } else if (surface === "wood") {
      burst(t, { filter: "bandpass", freq: 620, q: 1.2, peak: 0.12 * k, attack: 0.003, decay: 0.09 });
      if (rand() < 0.35) burst(t + 0.05, { filter: "bandpass", freq: 1500, q: 2.5, peak: 0.05, attack: 0.002, decay: 0.05 });
    } else if (surface === "earth" || surface === "mud") {
      burst(t, { filter: "lowpass", freq: 520 + rand() * 200, q: 1.5, peak: 0.2 * k, attack: 0.004, decay: 0.16 });
    } else if (surface === "stone" || surface === "tile") {
      burst(t, { filter: "highpass", freq: 1800, q: 1, peak: 0.07 * k, attack: 0.002, decay: 0.05 });
      burst(t, { filter: "bandpass", freq: 900, q: 1.5, peak: 0.1 * k, attack: 0.003, decay: 0.08 });
    } else {
      burst(t, { filter: "bandpass", freq: 700, q: 1, peak: 0.12 * k, attack: 0.003, decay: 0.1 });
    }
  }

  function entStep(surface) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    burst(t, { filter: "lowpass", freq: 260 + rand() * 120, q: 2, peak: 0.12, attack: 0.006, decay: 0.22 });
    burst(t + 0.03, { filter: "bandpass", freq: 900, q: 3, peak: 0.02, attack: 0.002, decay: 0.08 });
  }

  function shot() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    burst(t, { filter: "lowpass", freq: 2800, q: 0.6, peak: 0.9, attack: 0.002, decay: 0.55, rev: 0.4 });
    tone(t, { type: "sine", f0: 110, f1: 38, peak: 0.7, attack: 0.002, decay: 0.32, rev: 0.25 });
    burst(t, { filter: "highpass", freq: 2400, q: 0.7, peak: 0.5, attack: 0.001, decay: 0.06 });
  }

  function click(kind) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    if (kind === "break") {
      burst(t, { filter: "bandpass", freq: 3200, q: 2.5, peak: 0.2, attack: 0.002, decay: 0.09 });
      burst(t + 0.25, { filter: "bandpass", freq: 2200, q: 2, peak: 0.12, attack: 0.002, decay: 0.12 });
    } else if (kind === "load") {
      burst(t, { filter: "bandpass", freq: 3600, q: 3, peak: 0.25, attack: 0.001, decay: 0.05 });
      tone(t, { f0: 1800, peak: 0.05, attack: 0.001, decay: 0.03 });
    } else if (kind === "dry") {
      burst(t, { filter: "bandpass", freq: 4200, q: 4, peak: 0.25, attack: 0.001, decay: 0.03 });
    } else if (kind === "battery") {
      burst(t, { filter: "bandpass", freq: 1800, q: 2, peak: 0.2, attack: 0.002, decay: 0.05 });
      burst(t + 0.12, { filter: "bandpass", freq: 2600, q: 2, peak: 0.18, attack: 0.002, decay: 0.05 });
    } else {
      burst(t, { filter: "bandpass", freq: 3500, q: 3, peak: 0.12, attack: 0.001, decay: 0.02 });
    }
  }

  function door(open) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    burst(t, { filter: "bandpass", freq: 500, q: 2, peak: 0.12, attack: 0.1, decay: 0.45 });
    if (!open) burst(t + 0.2, { filter: "lowpass", freq: 700, q: 0.8, peak: 0.25, attack: 0.002, decay: 0.12 });
  }

  function slam() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    burst(t, { filter: "lowpass", freq: 520, q: 0.8, peak: 0.8, attack: 0.002, decay: 0.45, rev: 0.5 });
    tone(t, { f0: 72, f1: 40, peak: 0.6, attack: 0.002, decay: 0.4, rev: 0.4 });
  }

  function thunder(strength = 0.8) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const s = src(false);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * strength, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    s.connect(lp);
    lp.connect(g);
    g.connect(master);
    sendReverb(g, 0.5);
    s.start(t, rand() * 1.5);
    s.stop(t + 3.4);
  }

  function chimePing() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const f = PING_NOTES[Math.floor(rand() * PING_NOTES.length)];
      tone(t + i * (0.12 + rand() * 0.25), { f0: f, peak: 0.07, attack: 0.002, decay: 2.2, rev: 0.6 });
    }
  }

  function pickup() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    tone(t, { f0: 880, peak: 0.14, attack: 0.002, decay: 0.6, rev: 0.3 });
    tone(t + 0.09, { f0: 1320, peak: 0.1, attack: 0.002, decay: 0.8, rev: 0.3 });
  }

  function paper() {
    if (!ensure() || !enabled) return;
    burst(ctx.currentTime, { filter: "highpass", freq: 2200, q: 0.6, peak: 0.12, attack: 0.05, decay: 0.3 });
  }

  function seal() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    tone(t, { f0: 523, peak: 0.16, attack: 0.003, decay: 2.6, rev: 0.5 });
    tone(t, { f0: 1046, peak: 0.05, attack: 0.003, decay: 1.8, rev: 0.5 });
  }

  function lid() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    burst(t, { filter: "bandpass", freq: 240, q: 2, peak: 0.25, attack: 0.25, decay: 0.8 });
    tone(t + 0.9, { f0: 62, f1: 38, peak: 0.5, attack: 0.003, decay: 0.35, rev: 0.2 });
  }

  function scream() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 127.5) - 1;
      curve[i] = Math.tanh(x * 3.5);
    }
    shaper.curve = curve;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.42, t + 0.08);
    out.gain.setValueAtTime(0.42, t + 0.9);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    shaper.connect(out);
    out.connect(master);
    sendReverb(out, 0.3);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.setValueAtTime(640, t);
    saw.frequency.exponentialRampToValueAtTime(1250, t + 0.7);
    saw.frequency.exponentialRampToValueAtTime(900, t + 1.45);
    const sq = ctx.createOscillator();
    sq.type = "square";
    sq.frequency.setValueAtTime(960, t);
    sq.frequency.exponentialRampToValueAtTime(1500, t + 0.7);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vibG = ctx.createGain();
    vibG.gain.value = 36;
    vib.connect(vibG);
    vibG.connect(saw.frequency);
    vibG.connect(sq.frequency);
    const sg = ctx.createGain();
    sg.gain.value = 0.5;
    const qg = ctx.createGain();
    qg.gain.value = 0.22;
    saw.connect(sg);
    sq.connect(qg);
    sg.connect(shaper);
    qg.connect(shaper);
    const bt = src(false);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200;
    bp.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.value = 0.18;
    bt.connect(bp);
    bp.connect(bg);
    bg.connect(out);
    saw.start(t);
    sq.start(t);
    vib.start(t);
    bt.start(t, 0.2);
    saw.stop(t + 1.5);
    sq.stop(t + 1.5);
    vib.stop(t + 1.5);
    bt.stop(t + 1.5);
  }

  function grab() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    tone(t, { f0: 48, f1: 36, peak: 0.6, attack: 0.02, decay: 1.6 });
    scream();
  }

  function freeze() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    tone(t, { type: "sine", f0: 260, f1: 120, peak: 0.12, attack: 0.02, decay: 0.5 });
  }

  function burn() {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      burst(t + i * 0.05, { filter: "highpass", freq: 3000, q: 0.8, peak: 0.06, attack: 0.001, decay: 0.03 });
    }
    tone(t + 0.2, { f0: 1318, peak: 0.08, attack: 0.003, decay: 2, rev: 0.5 });
  }

  function msg() {
    if (!ensure() || !enabled) return;
    tone(ctx.currentTime, { f0: 1400, peak: 0.03, attack: 0.002, decay: 0.03 });
  }

  function flash() {
    if (!ensure() || !enabled) return;
    burst(ctx.currentTime, { filter: "bandpass", freq: 3500, q: 3, peak: 0.12, attack: 0.001, decay: 0.03 });
  }

  // The voice from the well: 「わたし」, three soft syllables with formant-like filters.
  function voice() {
    if (!ensure() || !enabled) return;
    const t0 = ctx.currentTime + 0.05;
    const syll = [
      { f: [330, 300], d: 0.34 },
      { f: [300, 280], d: 0.24 },
      { f: [300, 240], d: 0.44 }
    ];
    let t = t0;
    for (const s of syll) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(s.f[0], t);
      o.frequency.linearRampToValueAtTime(s.f[1], t + s.d);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vg = ctx.createGain();
      vg.gain.value = 5;
      vib.connect(vg);
      vg.connect(o.frequency);
      const f1 = ctx.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.value = 760;
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.value = 2300;
      f2.Q.value = 7;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      const breath = src(false);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 1;
      const bg = ctx.createGain();
      bg.gain.value = 0.05;
      breath.connect(bp);
      bp.connect(bg);
      bg.connect(master);
      const g = ctx.createGain();
      env(g, t, 0.22, 0.04, s.d);
      o.connect(f1);
      o.connect(f2);
      f1.connect(mix);
      f2.connect(mix);
      mix.connect(g);
      g.connect(master);
      sendReverb(g, 0.4);
      o.start(t);
      vib.start(t);
      breath.start(t, 0.1);
      o.stop(t + s.d + 0.1);
      vib.stop(t + s.d + 0.1);
      breath.stop(t + s.d + 0.1);
      t += s.d + 0.06;
    }
  }

  return {
    unlock,
    setEnabled,
    update,
    footstep,
    entStep,
    shot,
    click,
    door,
    slam,
    thunder,
    chimePing,
    pickup,
    paper,
    seal,
    lid,
    scream,
    grab,
    freeze,
    burn,
    msg,
    flash,
    voice,
  };
}
