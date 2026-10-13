// Synthesized sound for 句ゆき. Nothing is loaded from files; the context is
// created on the first user gesture (start), and every call is a safe no-op
// when Web Audio is missing or muted.
(function () {
  "use strict";

  // Pentatonic (陰音階) ratios from D, used for the koto and the drone.
  const SCALE = [146.83, 164.81, 196.0, 220.0, 246.94];

  let ctx = null;
  let master = null;
  let noise = null;
  let rainGain = null;
  let started = false;
  let muted = false;
  let bendTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (error) {
      ctx = null;
      return false;
    }
  }

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    return src;
  }

  function env(gainNode, peak, attack, release, at) {
    const t = at === undefined ? ctx.currentTime : at;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  // Shakuhachi-like bed: a breathy sine with slow vibrato and occasional pitch bends.
  function startDrone() {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 5);
    out.connect(master);
    const tone = ctx.createOscillator();
    tone.type = "sine";
    tone.frequency.value = SCALE[0];
    const overtone = ctx.createOscillator();
    overtone.type = "triangle";
    overtone.frequency.value = SCALE[0] * 2;
    const overGain = ctx.createGain();
    overGain.gain.value = 0.12;
    overtone.connect(overGain);
    overGain.connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.value = 3.2;
    lfo.connect(depth);
    depth.connect(tone.frequency);
    tone.connect(out);
    const breath = noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 2.4;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.035;
    breath.connect(band);
    band.connect(breathGain);
    breathGain.connect(out);
    tone.start();
    overtone.start();
    lfo.start();
    breath.start();
    bendTimer = setInterval(() => {
      if (!ctx || muted) return;
      const target = SCALE[Math.floor(Math.random() * 3)];
      const at = ctx.currentTime;
      tone.frequency.cancelScheduledValues(at);
      tone.frequency.setValueAtTime(tone.frequency.value, at);
      tone.frequency.linearRampToValueAtTime(target, at + 1.6);
      overtone.frequency.linearRampToValueAtTime(target * 2, at + 1.6);
    }, 9000);
  }

  function startWind() {
    const src = noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.025;
    lfo.connect(depth);
    depth.connect(gain.gain);
    src.connect(low);
    low.connect(gain);
    gain.connect(master);
    src.start();
    lfo.start();
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 2400;
    const rainSrc = noiseSource();
    rainSrc.connect(high);
    high.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();
  }

  function start() {
    if (!ensure()) return false;
    if (ctx.state === "suspended") ctx.resume();
    if (!started) {
      started = true;
      startDrone();
      startWind();
    }
    return true;
  }

  // Koto: a triangle with a quick decay and a quiet ringing partial.
  function pluck(index, octave) {
    if (!ensure() || muted) return;
    const base = SCALE[((index % 5) + 5) % 5] * Math.pow(2, octave || 0);
    const t = ctx.currentTime;
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = base;
    const ring = ctx.createOscillator();
    ring.type = "sine";
    ring.frequency.value = base * 2.005;
    const bodyGain = ctx.createGain();
    const ringGain = ctx.createGain();
    env(bodyGain, 0.22, 0.004, 1.4, t);
    env(ringGain, 0.05, 0.004, 2.6, t);
    body.connect(bodyGain);
    ring.connect(ringGain);
    bodyGain.connect(master);
    ringGain.connect(master);
    body.start(t);
    ring.start(t);
    body.stop(t + 1.8);
    ring.stop(t + 2.8);
  }

  // The 印 stamp: a low sweep and a short grit of noise.
  function thunk() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = ctx.createGain();
    env(g, 0.5, 0.005, 0.5, t);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.9);
    const src = noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 600;
    const ng = ctx.createGain();
    env(ng, 0.25, 0.002, 0.12, t);
    src.connect(low);
    low.connect(ng);
    ng.connect(master);
    src.start(t);
    src.stop(t + 0.3);
  }

  // Paper rustle when the 句帳 opens.
  function rustle() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 3200;
    band.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(band);
    band.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.45);
  }

  function tap() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1700, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    const g = ctx.createGain();
    env(g, 0.08, 0.002, 0.05, t);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // A short chirp pair, used now and then while birds cross the sky.
  function bird() {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(2600 + Math.random() * 500, t);
      osc.frequency.exponentialRampToValueAtTime(3400 + Math.random() * 400, t + 0.07);
      const g = ctx.createGain();
      env(g, 0.025, 0.01, 0.09, t);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  function rain(on) {
    if (!ctx || !rainGain) return;
    rainGain.gain.setTargetAtTime(on && !muted ? 0.05 : 0, ctx.currentTime, 0.6);
  }

  function setMuted(value) {
    muted = !!value;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    if (muted && rainGain) rain(false);
  }

  function isMuted() {
    return muted;
  }

  window.KuAudio = {
    start: start,
    pluck: pluck,
    thunk: thunk,
    rustle: rustle,
    tap: tap,
    bird: bird,
    rain: rain,
    setMuted: setMuted,
    isMuted: isMuted,
    scale: SCALE
  };
})();
