"use strict";
/* ECHO — きろくの協力者
   塔のための手続き音響。音声ファイルも外部ライブラリも使わない。
   エコーが増えるほど、静かな音の層が少しずつ重なっていく。 */
(function () {
  const freq = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const SCALES = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 5, 7, 9], [0, 2, 3, 7, 8]];
  const ROOTS = [45, 43, 48, 41];
  const TEMPOS = [72, 66, 60, 76];
  const MELODIES = [
    [0, 2, 4, 2, 1, 0, 2, 1, 4, 3, 2, 0, 1, 2, 0, -1],
    [0, 1, 3, 4, 3, 1, 0, 2, 4, 2, 1, 3, 0, -1, 2, 1],
    [0, 2, 3, 1, 0, 4, 3, 2, 0, 1, 2, 3, 1, 0, -1, 2],
    [0, 3, 4, 2, 0, 1, 3, 4, 2, 0, 3, 1, 4, 2, 1, -1]
  ];
  class Sound {
    constructor() {
      this.ctx = null; this.chapter = 0; this.echoes = 0; this.on = true;
      this.running = false; this.timer = null; this.beat = 0; this.nodes = new Set();
    }
    async unlock() {
      try {
        if (!this.ctx) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          this.ctx = new Audio();
          this.master = this.ctx.createGain(); this.master.gain.value = .34;
          const limiter = this.ctx.createDynamicsCompressor();
          limiter.threshold.value = -18; limiter.knee.value = 20; limiter.ratio.value = 4;
          this.master.connect(limiter); limiter.connect(this.ctx.destination);
          this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.on ? .5 : 0; this.musicBus.connect(this.master);
          this.fxBus = this.ctx.createGain(); this.fxBus.gain.value = this.on ? .62 : 0; this.fxBus.connect(this.master);
          // 塔の残響。短い繰り返しが、記録の重なりを聴かせる。
          const delay = this.ctx.createDelay(1); delay.delayTime.value = .34;
          const feedback = this.ctx.createGain(); feedback.gain.value = .3;
          const wet = this.ctx.createGain(); wet.gain.value = .2;
          this.musicBus.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(this.master);
        }
        if (this.ctx.state === "suspended") await this.ctx.resume();
        if (!this.timer) this.timer = setInterval(() => this.schedule(), 100);
      } catch (_) { /* 音はなくても遊べる。 */ }
    }
    settings(on) {
      this.on = on;
      if (this.ctx) {
        this.musicBus.gain.setTargetAtTime(on ? .5 : 0, this.ctx.currentTime, .08);
        this.fxBus.gain.setTargetAtTime(on ? .62 : 0, this.ctx.currentTime, .04);
      }
    }
    scene(chapter, running, echoes) {
      if (this.chapter !== chapter || (running && !this.running)) {
        this.beat = 0;
        this.next = this.ctx ? this.ctx.currentTime + .1 : 0;
      }
      this.chapter = chapter;
      this.running = running;
      this.echoes = echoes || 0;
      if (!running) this.stopNotes();
    }
    stopNotes() {
      if (!this.ctx) return;
      for (const node of this.nodes) {
        try {
          node.gain.gain.setTargetAtTime(0, this.ctx.currentTime, .04);
          node.osc.stop(this.ctx.currentTime + .2);
        } catch (_) {}
      }
    }
    note(midi, at, duration, gain, type = "sine", bus = this.musicBus) {
      if (!this.ctx || !bus) return;
      const osc = this.ctx.createOscillator(), amp = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq(midi);
      amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(gain, at + .028);
      amp.gain.exponentialRampToValueAtTime(.001, at + duration);
      osc.connect(amp); amp.connect(bus); osc.start(at); osc.stop(at + duration + .05);
      const node = { osc, gain: amp };
      this.nodes.add(node);
      osc.onended = () => { this.nodes.delete(node); osc.disconnect(); amp.disconnect(); };
    }
    schedule() {
      if (!this.ctx || !this.running || !this.on || document.hidden || this.ctx.state !== "running") return;
      const now = this.ctx.currentTime;
      if (!this.next || this.next < now - .3) this.next = now + .05;
      const step = 60 / TEMPOS[this.chapter] / 2;
      const scale = SCALES[this.chapter], melody = MELODIES[this.chapter];
      while (this.next < now + .3) {
        const b = this.beat, root = ROOTS[this.chapter];
        if (b % 16 === 0) {
          this.note(root - 12, this.next, step * 15, .05, "sine");
          for (const offset of [0, 7, 12]) this.note(root + offset, this.next, step * 10, .026, "sine");
        }
        if (b % 8 === 0) this.note(root - 5, this.next + step * 4, step * 6, .024, "triangle");
        const idx = melody[Math.floor(b / 2) % melody.length];
        if (b % 2 === 1 && idx >= 0) this.note(root + 24 + scale[idx], this.next, step * 2.2, .04, "sine");
        // エコーの層。周回が増えるほど、高い音がひとつずつ増える。
        if (this.echoes > 0 && b % 8 === 3) this.note(root + 31 + Math.min(this.echoes, 4) * 2, this.next, step * 3, .02, "triangle");
        this.beat++;
        this.next += step;
      }
    }
    fx(kind, opt = {}) {
      if (!this.ctx || !this.on || document.hidden || !this.fxBus) return;
      const at = this.ctx.currentTime + .006, bus = this.fxBus;
      const base = 57 + Math.min(opt.actor || 0, 4) * 3;
      const score = {
        tap: [[74, 0, .09, .035]],
        move: [[base, 0, .09, .055], [base + 7, .035, .12, .03]],
        echo: [[base + 12, 0, .12, .028]],
        blocked: [[40, 0, .12, .04], [44, .02, .1, .03]],
        "plate-on": [[72, 0, .3, .06], [79, .06, .4, .045]],
        "plate-off": [[67, 0, .22, .045], [60, .05, .25, .04]],
        "door-open": [[52, 0, .4, .05], [59, .06, .5, .05], [64, .12, .6, .045]],
        "door-close": [[59, 0, .3, .04], [52, .06, .4, .045]],
        rewind: [[76, 0, .5, .05], [71, .08, .5, .05], [64, .16, .6, .05], [57, .24, .7, .05], [52, .34, .9, .05]],
        win: [[60, 0, .6, .06], [67, .12, .7, .06], [72, .24, .8, .07], [76, .36, 1, .06], [84, .5, 1.2, .05]],
        lose: [[57, 0, .5, .05], [52, .12, .6, .05], [45, .26, .9, .06]],
        undo: [[67, 0, .14, .05], [62, .05, .18, .05]],
        skip: [[62, 0, .12, .04], [62, .12, .12, .035], [62, .24, .12, .03]]
      };
      for (const [n, delay, len, vol] of score[kind] || score.tap) this.note(n, at + delay, len, vol, "sine", bus);
    }
    suspend() {
      this.stopNotes();
      if (this.ctx?.state === "running") this.ctx.suspend().catch(() => {});
    }
  }
  window.EchoSound = Sound;
})();
