/* A procedural score in three seas. No audio files, libraries, or network calls. */
(function () {
  'use strict';
  const scales = [[0,2,4,7,9], [0,2,5,7,9], [0,3,5,7,10]];
  const roots = [48, 50, 45], chords = [[0, -5, -3, -7], [0, -3, -5, -7], [0, 3, -5, -2]];
  const melodies = [[0,2,4,2,1,0,-1,2,4,3,2,0,1,2,1,-1], [0,1,3,4,3,1,0,-1,2,3,4,2,1,0,2,-1], [0,2,3,1,0,-1,2,4,3,2,0,1,3,2,1,-1]];
  const freq = midi => 440 * Math.pow(2, (midi - 69) / 12);
  class Sound {
    constructor() { this.ctx = null; this.chapter = 0; this.music = true; this.effects = true; this.running = false; this.timer = null; this.beat = 0; this.nodes = new Set(); }
    async unlock() {
      try {
        if (!this.ctx) {
          const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
          this.ctx = new Audio();
          this.master = this.ctx.createGain(); this.master.gain.value = .38;
          const limiter = this.ctx.createDynamicsCompressor(); limiter.threshold.value = -18; limiter.knee.value = 20; limiter.ratio.value = 4;
          this.master.connect(limiter); limiter.connect(this.ctx.destination);
          this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.music ? .55 : 0; this.musicBus.connect(this.master);
          this.fxBus = this.ctx.createGain(); this.fxBus.gain.value = this.effects ? .65 : 0; this.fxBus.connect(this.master);
          // A short, quiet stereo tail makes the plucks feel like they live over water.
          const delay = this.ctx.createDelay(1); delay.delayTime.value = .29;
          const feedback = this.ctx.createGain(); feedback.gain.value = .22;
          const wet = this.ctx.createGain(); wet.gain.value = .15;
          this.musicBus.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(this.master);
        }
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        if (!this.timer) this.timer = setInterval(() => this.schedule(), 100);
      } catch (_) { /* Sound is optional; the sea remains playable. */ }
    }
    settings(music, effects) {
      this.music = music; this.effects = effects;
      if (this.ctx) { this.musicBus.gain.setTargetAtTime(music ? .55 : 0, this.ctx.currentTime, .08); this.fxBus.gain.setTargetAtTime(effects ? .65 : 0, this.ctx.currentTime, .04); }
    }
    scene(chapter, running) {
      if (this.chapter !== chapter || running && !this.running) { this.beat = 0; this.next = this.ctx ? this.ctx.currentTime + .1 : 0; }
      this.chapter = chapter; this.running = running;
      if (!running) this.stopNotes();
    }
    stopNotes() {
      if (!this.ctx) return;
      for (const node of this.nodes) { try { node.gain.gain.setTargetAtTime(0, this.ctx.currentTime, .04); node.osc.stop(this.ctx.currentTime + .2); } catch (_) {} }
    }
    note(midi, at, duration, gain, type = 'sine', bus = this.musicBus) {
      if (!this.ctx || !bus) return;
      const osc = this.ctx.createOscillator(), amp = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq(midi);
      amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(gain, at + .028);
      amp.gain.exponentialRampToValueAtTime(.001, at + duration);
      osc.connect(amp); amp.connect(bus); osc.start(at); osc.stop(at + duration + .05);
      const node = { osc, gain: amp }; this.nodes.add(node);
      osc.onended = () => { this.nodes.delete(node); osc.disconnect(); amp.disconnect(); };
    }
    schedule() {
      if (!this.ctx || !this.running || !this.music || document.hidden || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime; if (!this.next || this.next < now - .3) this.next = now + .05;
      const tempo = [76, 68, 72][this.chapter], step = 60 / tempo / 2;
      while (this.next < now + .3) {
        const b = this.beat, chapter = this.chapter, root = roots[chapter] + chords[chapter][Math.floor(b / 16) % 4];
        if (b % 8 === 0) {
          for (const offset of [0,7,12]) this.note(root + offset, this.next, step * 10, .032, 'sine');
          this.note(root - 12, this.next, step * 11, .045, 'sine');
        }
        if (b % 2 === 0) {
          const idx = melodies[chapter][Math.floor(b / 2) % 16];
          if (idx >= 0) this.note(root + 24 + scales[chapter][idx], this.next, step * 3.4, .052, 'sine');
        }
        if (b % 8 === 5) this.note(root + 19, this.next, step * 2.4, .023, 'triangle');
        this.beat++; this.next += step;
      }
    }
    fx(kind) {
      if (!this.ctx || !this.effects || document.hidden) return;
      const at = this.ctx.currentTime + .006, bus = this.fxBus;
      const score = {
        move: [[57,0,.12,.09], [64,.03,.15,.045]],
        anchor: [[45,0,.28,.09], [52,.07,.32,.06]],
        undo: [[67,0,.12,.07], [62,.05,.16,.08]],
        mail: [[72,0,.32,.1], [76,.09,.4,.08], [79,.18,.55,.06]],
        shell: [[81,0,.25,.075], [88,.08,.43,.04]],
        portal: [[64,0,.32,.05], [71,.07,.4,.07], [78,.14,.48,.08], [83,.22,.6,.035]],
        win: [[60,0,.6,.07], [67,.12,.7,.07], [72,.24,.8,.09], [76,.36,1,.06], [79,.48,1.2,.05]],
        tap: [[74,0,.09,.04]], blocked: [[43,0,.1,.035]]
      };
      for (const [n, delay, len, vol] of score[kind] || score.tap) this.note(n, at + delay, len, vol, 'sine', bus);
    }
    suspend() { this.stopNotes(); if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {}); }
  }
  window.TideSound = Sound;
})();
