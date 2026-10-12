(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RepriseSound = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  let ctx = null, enabled = true, ambientTimer = null, phrase = 0;
  function ready() {
    if (!enabled) return null;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    } catch { ctx = null; }
    return ctx;
  }
  function tone(freq, time, duration, volume = 0.05, type = "sine", endFreq = freq) {
    const audio = ready(); if (!audio) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, time);
    if (endFreq !== freq) oscillator.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + Math.min(0.045, duration * .22));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(time); oscillator.stop(time + duration + .02);
  }
  function effect(name) {
    const audio = ready(); if (!audio) return;
    const t = audio.currentTime;
    if (name === "step") { tone(420, t, .09, .022, "triangle", 310); tone(840, t + .026, .16, .012); }
    if (name === "wait") tone(300, t, .25, .024, "sine", 260);
    if (name === "wrong") tone(180, t, .12, .019, "triangle", 120);
    if (name === "undo") tone(470, t, .18, .024, "sine", 350);
    if (name === "fragment") [0, .08, .17].forEach((d, i) => tone([740, 932, 1175][i], t + d, .4, .034));
    if (name === "record") {
      [220, 277, 330, 440].forEach((f, i) => tone(f, t + i * .13, 1.3, .028, "sine"));
      tone(660, t + .45, 1.2, .018);
    }
    if (name === "gate") { tone(165, t, .7, .037, "sine", 220); tone(440, t + .08, .68, .025); }
    if (name === "clear") [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => tone(f, t + i * .16, 1.35, .045, "sine"));
  }
  function ambient() {
    const audio = ready(); if (!audio || document.hidden) return;
    const chords = [[196, 246.94, 293.66], [174.61, 220, 261.63], [164.81, 196, 246.94], [174.61, 220, 293.66]];
    const t = audio.currentTime;
    chords[phrase++ % chords.length].forEach((f, i) => tone(f, t + i * .16, 3.9, .008, "sine"));
  }
  function setEnabled(value) {
    enabled = !!value;
    if (!enabled && ctx) { ctx.close().catch(() => {}); ctx = null; }
  }
  function startAmbient() { if (ambientTimer) return; ambient(); ambientTimer = setInterval(ambient, 5100); }
  function stopAmbient() { clearInterval(ambientTimer); ambientTimer = null; }
  return { effect, setEnabled, startAmbient, stopAmbient };
});
