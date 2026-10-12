/* MIZUHO — 瑞穂 / proofs.
   One way through each valley, written as the strokes of a hand. The tests
   replay them through the real tools to prove every goal can be reached; the
   title screen replays one to grow its view. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.MizuhoScript || require("./script.js"));
  else root.MizuhoSolutions = factory(root.MizuhoScript);
})(typeof self !== "undefined" ? self : this, function (Script) {
  "use strict";
  const T = Script.terrace;
  const year = [{ op: "start" }, { op: "until", t: 1 }];
  const S = {
    ichimai: [
      { op: "stroke", tool: "heap", r: 1.6, path: [[18.5, 27], [21.5, 27]], speed: 3, paused: true },
      { op: "wait", s: 45 }
    ].concat(year),
    dan: [
      { op: "stroke", tool: "level", r: 2.7, path: [[13, 22], [31, 22]], speed: 6, paused: true, passes: 2 },
      { op: "stroke", tool: "level", r: 2.7, path: [[22, 22], [22, 25], [13, 25], [31, 25]], speed: 6, paused: true },
      { op: "stroke", tool: "heap", r: 1.6, path: [[11.5, 19.5], [11.5, 26.5], [32.5, 26.5], [32.5, 19.5]], speed: 6, paused: true },
      { op: "wait", s: 50 }
    ].concat(year),
    tanada: [].concat(
      T(13, 35, 13, 7, { outlet: 24 }),
      T(13, 35, 22, 7, { outlet: 24 }),
      T(13, 35, 31, 7, { outlet: 24 }),
      T(13, 35, 40, 6),
      [{ op: "wait", s: 80 }], year),
    tsuyu: [].concat(
      [0, 1, 2, 3, 4].map(k => ({ op: "stroke", tool: "dig", r: 2.7, path: [[31, 41], [37, 43], [37, 51.5]], speed: 4, paused: true })),
      T(18, 38, 13, 6, { outlet: 29 }),
      T(18, 38, 21, 6),
      [{ op: "wait", s: 60 }], year),
    one: [].concat(
      [0, 1, 2].map(k => ({ op: "stroke", tool: "dig", r: 2.0, path: [[12.5, 11], [18, 12.5], [24, 13.5], [31, 15]], speed: 4, paused: true })),
      T(30, 52, 18, 6, { outlet: 31 }),
      T(30, 52, 26, 6, { outlet: 31 }),
      T(30, 52, 34, 6),
      [{ op: "wait", s: 70 }], year),
    hideriPlain: [].concat(
      T(16, 40, 24, 6, { outlet: 28 }),
      T(16, 40, 32, 6, { outlet: 28 }),
      T(16, 40, 40, 6),
      [{ op: "wait", s: 70 }], year),
    hideri: [].concat(
      [0, 1].map(() => ({ op: "stroke", tool: "heap", r: 1.4, path: [[26.5, 18.5], [29.5, 18.5]], speed: 2, paused: true })),
      T(18, 38, 24, 6, { outlet: 34 }),
      T(18, 38, 32, 6),
      [{ op: "wait", s: 70 }, { op: "start" }],
      [0.43, 0.5, 0.57, 0.64].reduce((a, t) => a.concat([{ op: "until", t }, { op: "stroke", tool: "dig", r: 1.4, path: [[28, 17], [28, 20]], speed: 2.5 }]), []),
      [{ op: "until", t: 1 }]),
    senmai: [].concat(
      [12, 20, 28].reduce((a, y, k) => a.concat(T(42, 60, y, 6, k < 2 ? { outlet: 51, lip: 1.3 } : { lip: 1.3 })), []),
      [10, 18, 26, 34, 42, 50, 58].reduce((a, y, k) => a.concat(T(8, 32, y, 6, k < 6 ? { outlet: 20, lip: 1.3 } : { lip: 1.3 })), []),
      [{ op: "wait", s: 200 }], year),
    ishigaki: (() => {
      const fan = k => [0, 1, 2].map(j => ({ op: "stroke", tool: "dig", r: 2.7, path: [[3, 39 + k + j], [13, 40 + k + j], [13, 45 + k], [3, 46 + k], [3, 51], [13, 53]], speed: 5, paused: true }));
      return [].concat(
        fan(0), T(17, 37, 12, 6, { outlet: 27, fill: true }),
        fan(1), T(17, 37, 20, 6, { outlet: 27, fill: true }),
        fan(2), fan(3), T(17, 37, 28, 6, { fill: true }),
        [{ op: "wait", s: 70 }], year);
    })()
  };
  return S;
});
