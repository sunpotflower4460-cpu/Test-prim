/* MIZUHO — 瑞穂 / sound.
   Everything is synthesized: running water, rain, the creatures of each
   season (uguisu in spring, tree frogs over the paddies, higurashi in late
   summer, suzumushi in autumn), and a sparse koto-like music in a
   pentatonic mode. The frogs grow louder as more of the valley is planted. */
(function (root) {
  "use strict";
  const YO = [0, 2, 5, 7, 9];          // bright mode for spring and summer
  const IN = [0, 1, 5, 7, 8];          // miyako-bushi for rain and autumn
  const BASE = 293.66;                 // D4

  function create() {
    const A = { ctx: null, enabled: true, ready: false, nodes: {}, clock: 0, next: {}, state: {}, last: {} };
    const Ctx = root.AudioContext || root.webkitAudioContext;

    function noiseBuffer(ctx, seconds, color) {
      const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (color === "pink") { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
        else d[i] = w;
      }
      return buf;
    }
    function impulse(ctx, seconds, decay) {
      const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }
    function loopNoise(color, seconds) {
      const s = A.ctx.createBufferSource();
      s.buffer = noiseBuffer(A.ctx, seconds || 4, color); s.loop = true; s.start();
      return s;
    }

    function init() {
      if (A.ctx || !Ctx) return;
      const ctx = A.ctx = new Ctx();
      const master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      master.connect(comp); comp.connect(ctx.destination);
      const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 3.2, 2.6);
      const verbGain = ctx.createGain(); verbGain.gain.value = 0.38;
      verb.connect(verbGain); verbGain.connect(master);
      const music = ctx.createGain(); music.gain.value = 0.55; music.connect(master); music.connect(verb);
      const nature = ctx.createGain(); nature.gain.value = 0.9; nature.connect(master);
      const fxBus = ctx.createGain(); fxBus.gain.value = 0.8; fxBus.connect(master);
      const natureVerb = ctx.createGain(); natureVerb.gain.value = 0.35; natureVerb.connect(verb);
      // running water: brown noise, bandpassed and gurgling
      const water = loopNoise("brown", 5);
      const wBand = ctx.createBiquadFilter(); wBand.type = "bandpass"; wBand.frequency.value = 900; wBand.Q.value = 0.9;
      const wGain = ctx.createGain(); wGain.gain.value = 0;
      water.connect(wBand); wBand.connect(wGain); wGain.connect(nature);
      const gurgle = ctx.createOscillator(); gurgle.frequency.value = 5.3;
      const gurgleAmt = ctx.createGain(); gurgleAmt.gain.value = 380;
      gurgle.connect(gurgleAmt); gurgleAmt.connect(wBand.frequency); gurgle.start();
      // falls: white noise, darker
      const falls = loopNoise("white", 3);
      const fLow = ctx.createBiquadFilter(); fLow.type = "lowpass"; fLow.frequency.value = 1400;
      const fHigh = ctx.createBiquadFilter(); fHigh.type = "highpass"; fHigh.frequency.value = 180;
      const fGain = ctx.createGain(); fGain.gain.value = 0;
      falls.connect(fLow); fLow.connect(fHigh); fHigh.connect(fGain); fGain.connect(nature);
      // rain
      const rain = loopNoise("pink", 4);
      const rHigh = ctx.createBiquadFilter(); rHigh.type = "highpass"; rHigh.frequency.value = 500;
      const rLow = ctx.createBiquadFilter(); rLow.type = "lowpass"; rLow.frequency.value = 7000;
      const rGain = ctx.createGain(); rGain.gain.value = 0;
      rain.connect(rHigh); rHigh.connect(rLow); rLow.connect(rGain); rGain.connect(nature);
      // wind
      const wind = loopNoise("pink", 6);
      const windBand = ctx.createBiquadFilter(); windBand.type = "bandpass"; windBand.frequency.value = 420; windBand.Q.value = 0.6;
      const windGain = ctx.createGain(); windGain.gain.value = 0.03;
      const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.07;
      const windLfoAmt = ctx.createGain(); windLfoAmt.gain.value = 220;
      windLfo.connect(windLfoAmt); windLfoAmt.connect(windBand.frequency); windLfo.start();
      wind.connect(windBand); windBand.connect(windGain); windGain.connect(nature);
      A.nodes = { master, verb, music, nature, fxBus, natureVerb, wGain, wBand, fGain, rGain, windGain };
      A.noise = noiseBuffer(ctx, 1, "white");
    }

    function now() { return A.ctx.currentTime; }
    function env(g, t, a, peak, d, sustain) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
    }
    function osc(type, freq, t, dur, dest) {
      const o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      const g = A.ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
      return { o, g };
    }
    function noiseHit(t, dur, freq, q, peak, dest, type) {
      const s = A.ctx.createBufferSource(); s.buffer = A.noise;
      const f = A.ctx.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = A.ctx.createGain();
      s.connect(f); f.connect(g); g.connect(dest);
      env(g, t, 0.004, peak, dur);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
      return f;
    }

    // a plucked string: FM with a falling index and a small press-bend at the start
    function koto(freq, t, vel, dest) {
      const c = osc("sine", freq, t, 3.2, dest || A.nodes.music);
      const m = A.ctx.createOscillator(); m.frequency.value = freq * 3.003;
      const mg = A.ctx.createGain();
      mg.gain.setValueAtTime(freq * 2.6 * vel, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.9);
      m.connect(mg); mg.connect(c.o.frequency); m.start(t); m.stop(t + 3.3);
      c.o.frequency.setValueAtTime(freq * 1.012, t); c.o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      env(c.g, t, 0.004, 0.16 * vel, 2.8);
      const h = osc("triangle", freq * 2, t, 0.6, dest || A.nodes.music);
      env(h.g, t, 0.002, 0.035 * vel, 0.4);
    }
    // a temple-bell partial stack for the turn of a season
    function bell(t, base, peak) {
      for (const [r, a, d] of [[0.5, 0.5, 6], [1, 1, 5], [1.19, 0.5, 4], [1.56, 0.35, 3.2], [2.0, 0.3, 2.6], [2.74, 0.18, 1.8], [3.76, 0.1, 1.2]]) {
        const o = osc("sine", base * r, t, d, A.nodes.music);
        env(o.g, t, 0.01, (peak || 0.12) * a, d);
      }
    }
    function scaleNote(mode, degree, octave) {
      const n = mode.length, o = Math.floor(degree / n), k = ((degree % n) + n) % n;
      return BASE * Math.pow(2, (mode[k] + 12 * (o + (octave || 0))) / 12);
    }

    // ---- creatures ----
    function uguisu(t) {
      // a long rising "hoo", then "ho-ke-kyo"
      const dest = A.nodes.nature, v = 0.05;
      const a = osc("sine", 1250, t, 1.1, dest); a.o.frequency.linearRampToValueAtTime(1500, t + 0.9);
      env(a.g, t, 0.15, v, 0.95);
      const notes = [[1.25, 2000, 2350, 0.12], [1.42, 2900, 2600, 0.1], [1.56, 2200, 1900, 0.32]];
      for (const [dt, f0, f1, d] of notes) {
        const o = osc("sine", f0, t + dt, d, dest); o.o.frequency.exponentialRampToValueAtTime(f1, t + dt + d);
        env(o.g, t + dt, 0.015, v * 1.1, d);
        const o2 = osc("sine", f0, t + dt, d, A.nodes.natureVerb); o2.o.frequency.exponentialRampToValueAtTime(f1, t + dt + d);
        env(o2.g, t + dt, 0.015, v * 0.5, d);
      }
    }
    function frog(t, pan, loud) {
      // a tree-frog "kero-kero": a short train of buzzy croaks
      const n = 2 + Math.floor(Math.random() * 4), f = 520 + Math.random() * 260;
      const p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
      const dest = A.ctx.createGain(); dest.gain.value = loud;
      if (p) { p.pan.value = pan; dest.connect(p); p.connect(A.nodes.nature); } else dest.connect(A.nodes.nature);
      for (let k = 0; k < n; k++) {
        const tt = t + k * (0.13 + Math.random() * 0.03);
        const o = osc("square", f, tt, 0.08, dest);
        const bp = A.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 2.1; bp.Q.value = 3;
        o.g.disconnect(); o.g.connect(bp); bp.connect(dest);
        o.o.frequency.setValueAtTime(f * 0.92, tt); o.o.frequency.linearRampToValueAtTime(f * 1.06, tt + 0.07);
        env(o.g, tt, 0.006, 0.05, 0.07);
      }
      setTimeout(() => { try { dest.disconnect(); if (p) p.disconnect(); } catch (e) { /* already gone */ } }, (n * 0.2 + 1) * 1000);
    }
    function higurashi(t) {
      // "kana-kana-kana": a descending, pulsing trill
      const o = osc("sine", 4600, t, 3.6, A.nodes.natureVerb);
      o.o.frequency.setValueAtTime(4800, t); o.o.frequency.exponentialRampToValueAtTime(3900, t + 3.5);
      const am = A.ctx.createOscillator(); am.frequency.setValueAtTime(11, t); am.frequency.linearRampToValueAtTime(7, t + 3.5);
      const amG = A.ctx.createGain(); amG.gain.value = 0.5;
      const base = A.ctx.createGain(); base.gain.value = 0;
      o.g.disconnect(); o.g.connect(base); base.connect(A.nodes.nature); base.connect(A.nodes.natureVerb);
      am.connect(amG); amG.connect(base.gain); am.start(t); am.stop(t + 3.7);
      env(o.g, t, 0.4, 0.035, 3.2);
      base.gain.setValueAtTime(0.5, t);
    }
    function suzumushi(t) {
      // "riiin": a bright tone with a fast flutter, in a few bursts
      const bursts = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < bursts; k++) {
        const tt = t + k * 0.55;
        const o = osc("sine", 4300 + Math.random() * 120, tt, 0.45, A.nodes.nature);
        const am = A.ctx.createOscillator(); am.frequency.value = 38;
        const amG = A.ctx.createGain(); amG.gain.value = 0.018;
        am.connect(amG); amG.connect(o.g.gain); am.start(tt); am.stop(tt + 0.5);
        env(o.g, tt, 0.03, 0.022, 0.4);
      }
    }

    // ---- music ----
    function phrase(t, mode, mood) {
      const len = 3 + Math.floor(Math.random() * 4);
      let deg = 2 + Math.floor(Math.random() * 5);
      let tt = t;
      for (let k = 0; k < len; k++) {
        const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
        deg = Math.max(0, Math.min(10, deg + step));
        koto(scaleNote(mode, deg, 0), tt, 0.55 + Math.random() * 0.4);
        if (Math.random() < 0.25) koto(scaleNote(mode, deg - 5, 0), tt, 0.35);
        tt += [0.42, 0.42, 0.63, 0.84, 1.26][Math.floor(Math.random() * 5)] * (mood === "rainy" ? 1.3 : 1);
      }
      return tt - t;
    }
    function drone(t, mode, dur) {
      // a soft shō-like cluster
      for (const d of [0, 3, 5, 8]) {
        const f = scaleNote(mode, d, -1);
        const o = osc("sine", f, t, dur, A.nodes.music);
        o.g.gain.setValueAtTime(0.0001, t);
        o.g.gain.linearRampToValueAtTime(0.018, t + dur * 0.4);
        o.g.gain.linearRampToValueAtTime(0.0001, t + dur);
      }
    }

    // ---- public ----
    A.unlock = function () {
      if (!A.enabled) return;
      init();
      if (!A.ctx) return;
      if (A.ctx.state === "suspended") A.ctx.resume();
      if (!A.ready) {
        A.ready = true;
        A.nodes.master.gain.setTargetAtTime(1.7, now(), 0.6);
      }
    };
    A.setEnabled = function (on) {
      A.enabled = on;
      if (!A.ctx) { if (on) A.unlock(); return; }
      A.nodes.master.gain.setTargetAtTime(on ? 1.7 : 0, now(), 0.15);
      if (on && A.ctx.state === "suspended") A.ctx.resume();
    };
    A.suspend = function () { if (A.ctx && A.ctx.state === "running") A.ctx.suspend(); };
    A.resume = function () { if (A.ctx && A.enabled && A.ctx.state === "suspended") A.ctx.resume(); };

    // Called every frame with what the valley sounds like now.
    A.update = function (s, dt) {
      if (!A.ctx || !A.ready || !A.enabled || A.ctx.state !== "running") return;
      const t = now(), n = A.nodes;
      n.wGain.gain.setTargetAtTime(Math.min(0.16, s.flow * 0.2), t, 0.3);
      n.wBand.frequency.setTargetAtTime(700 + s.flow * 700, t, 0.5);
      n.fGain.gain.setTargetAtTime(Math.min(0.14, s.falls * 0.22), t, 0.3);
      n.rGain.gain.setTargetAtTime(Math.min(0.5, s.rain * 0.6), t, 0.8);
      n.windGain.gain.setTargetAtTime(s.season === "autumn" ? 0.06 : s.season === "rainy" ? 0.05 : 0.025, t, 1.5);
      const nx = A.next;
      const later = (key, a, b) => { nx[key] = t + a + Math.random() * (b - a); };
      for (const k of ["music", "bird", "frog", "cicada", "cricket", "drone"]) if (nx[k] === undefined) later(k, 1, 4);
      const mode = s.season === "rainy" || s.season === "autumn" || s.season === "night" ? IN : YO;
      if (t > nx.music) {
        const len = phrase(t + 0.05, mode, s.season);
        later("music", len + (s.quiet ? 14 : 6), len + (s.quiet ? 26 : 14));
      }
      if (t > nx.drone) { drone(t, mode, 9); later("drone", 18, 34); }
      if (t > nx.bird) {
        if (s.season === "spring" || s.season === "early") uguisu(t + 0.1);
        later("bird", 9, 22);
      }
      if (t > nx.frog) {
        // frogs gather where the paddies are; their chorus thickens with the planted area
        const area = Math.min(1, s.paddy);
        const active = s.season !== "autumn" && s.season !== "night" && area > 0.02;
        if (active) {
          const voices = 1 + Math.floor(area * 4 + (s.season === "rainy" ? 2 : 0));
          for (let v = 0; v < voices; v++) frog(t + Math.random() * 1.2, Math.random() * 1.6 - 0.8, 0.5 + area * 0.6);
        }
        later("frog", active ? 1.2 - area * 0.6 : 3, active ? 3.5 - area * 1.5 : 6);
      }
      if (t > nx.cicada) {
        if (s.season === "summer") higurashi(t);
        later("cicada", 8, 18);
      }
      if (t > nx.cricket) {
        if (s.season === "autumn" || s.season === "night") suzumushi(t);
        later("cricket", 1.5, 4.5);
      }
    };

    A.event = function (type, info) {
      if (!A.ctx || !A.ready || !A.enabled || A.ctx.state !== "running") return;
      const t = now(), fx = A.nodes.fxBus;
      const last = A.last;
      if (type === "heap" || type === "dig" || type === "level") {
        if (last[type] && t - last[type] < 0.11) return;
        last[type] = t;
        const amt = Math.min(1, (info && info.amount) || 0.5);
        if (type === "heap") {
          const o = osc("sine", 95 + Math.random() * 20, t, 0.18, fx); o.o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
          env(o.g, t, 0.005, 0.12 * (0.4 + amt), 0.16);
          noiseHit(t, 0.09, 600, 0.8, 0.05 * (0.4 + amt), fx, "lowpass");
        } else if (type === "dig") {
          noiseHit(t, 0.07, 1500 + Math.random() * 600, 1.4, 0.08 * (0.4 + amt), fx);
          noiseHit(t + 0.02, 0.05, 3200, 2, 0.035 * (0.4 + amt), fx);
        } else {
          const f = noiseHit(t, 0.14, 900, 1.2, 0.05 * (0.4 + amt), fx);
          f.frequency.linearRampToValueAtTime(1500, t + 0.13);
        }
      } else if (type === "click") {
        const o = osc("sine", 820, t, 0.08, fx); o.o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
        env(o.g, t, 0.002, 0.06, 0.07);
      } else if (type === "select") {
        const o = osc("triangle", 660, t, 0.1, fx); env(o.g, t, 0.002, 0.05, 0.09);
      } else if (type === "plant") {
        // seedlings going in: a rising arpeggio and soft splashes
        const m = YO;
        for (let k = 0; k < 6; k++) koto(scaleNote(m, 3 + k, 0), t + k * 0.11, 0.7);
        for (let k = 0; k < 10; k++) noiseHit(t + Math.random() * 1.2, 0.05, 2400, 3, 0.03, fx);
      } else if (type === "season") {
        bell(t + 0.05, info && info.id === "autumn" ? 196 : info && info.id === "rainy" ? 174.6 : 220, 0.09);
      } else if (type === "warn") {
        const o = osc("triangle", 240, t, 0.5, fx); o.o.frequency.exponentialRampToValueAtTime(180, t + 0.4); env(o.g, t, 0.01, 0.1, 0.45);
        const o2 = osc("sine", 960, t + 0.18, 0.4, fx); env(o2.g, t + 0.18, 0.005, 0.05, 0.35);
      } else if (type === "flood") {
        for (let k = 0; k < 3; k++) { const o = osc("sine", 110, t + k * 0.22, 0.4, fx); o.o.frequency.exponentialRampToValueAtTime(70, t + k * 0.22 + 0.3); env(o.g, t + k * 0.22, 0.004, 0.2, 0.35); }
      } else if (type === "wilt") {
        const o = osc("sine", 520, t, 0.5, fx); o.o.frequency.exponentialRampToValueAtTime(300, t + 0.45); env(o.g, t, 0.01, 0.03, 0.45);
      } else if (type === "harvest") {
        // festival: taiko pattern and a fue line over it
        const beat = 0.32;
        const pattern = [1, 0, 0.5, 0, 1, 0.5, 1, 0, 1, 0, 0.5, 0.5, 1, 0, 1, 1];
        pattern.forEach((v, k) => {
          if (!v) return;
          const tt = t + k * beat;
          const o = osc("sine", 82, tt, 0.4, fx); o.o.frequency.exponentialRampToValueAtTime(52, tt + 0.3); env(o.g, tt, 0.003, 0.28 * v, 0.38);
          noiseHit(tt, 0.05, 300, 0.6, 0.06 * v, fx, "lowpass");
        });
        const line = [4, 5, 7, 6, 5, 4, 2, 4, 5, 7, 9, 7];
        line.forEach((d, k) => {
          const tt = t + 0.6 + k * beat * 1.5, f = scaleNote(YO, d, 1);
          const o = osc("sine", f, tt, beat * 1.6, A.nodes.music);
          const vib = A.ctx.createOscillator(); vib.frequency.value = 5.5; const vg = A.ctx.createGain(); vg.gain.value = f * 0.012;
          vib.connect(vg); vg.connect(o.o.frequency); vib.start(tt); vib.stop(tt + beat * 1.7);
          env(o.g, tt, 0.06, 0.05, beat * 1.4, 0.03);
          noiseHit(tt, 0.12, f * 2, 4, 0.012, A.nodes.music);
        });
      } else if (type === "stars") {
        for (let k = 0; k < (info && info.n || 1); k++) koto(scaleNote(YO, 7 + k * 2, 0), t + 0.25 + k * 0.32, 0.9);
      } else if (type === "fail") {
        for (let k = 0; k < 3; k++) koto(scaleNote(IN, 6 - k * 2, 0), t + k * 0.4, 0.7);
      }
    };
    return A;
  }
  root.MizuhoAudio = { create };
})(typeof self !== "undefined" ? self : this);
