/* MIZUHO — 瑞穂 / scripted play.
   Drives the real tools with the timing of a hand: the tests use it to prove
   every valley can be farmed, and the title screen uses it to grow its view. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.MizuhoSim || require("./sim.js"));
  else root.MizuhoScript = factory(root.MizuhoSim);
})(typeof self !== "undefined" ? self : this, function (Sim) {
  "use strict";
  const HAND = 1 / 30; // the controller applies the brush once per frame

  // Returns a stepper: call it with real seconds; it returns true when done.
  function player(w, script, opts) {
    opts = opts || {};
    let k = 0, task = null;
    function next() {
      const a = script[k++];
      if (!a) return null;
      if (a.op === "stroke") {
        const pts = a.path, seg = [];
        let total = 0;
        for (let j = 1; j < pts.length; j++) { const d = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); seg.push(d); total += d; }
        Sim.beginStroke(w, a.tool, pts[0][0], pts[0][1]);
        return { a, pts, seg, total, dist: 0, passes: a.passes || 1, pass: 0, hold: a.hold || 0 };
      }
      if (a.op === "tap") {
        Sim.beginStroke(w, a.tool, a.at[0], a.at[1]);
        return { a: Object.assign({}, a, { op: "stroke", path: [a.at, a.at], speed: 1 }), pts: [a.at, a.at], seg: [0], total: 0, dist: 0, passes: 1, pass: 0, hold: a.hold || 0.2 };
      }
      return { a, left: a.s || 0 };
    }
    function pointAt(t, dist) {
      let d = dist;
      for (let j = 0; j < t.seg.length; j++) {
        if (d <= t.seg[j] || j === t.seg.length - 1) {
          const f = t.seg[j] ? Math.min(1, d / t.seg[j]) : 1;
          const p = t.pts[j], q = t.pts[j + 1];
          return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
        }
        d -= t.seg[j];
      }
      return t.pts[t.pts.length - 1];
    }
    return function advance(seconds) {
      let left = seconds;
      while (left > 1e-9) {
        if (!task) { task = next(); if (!task) return true; }
        const a = task.a;
        if (a.op === "stroke") {
          const dt = Math.min(HAND, left);
          left -= dt;
          const p = pointAt(task, task.dist);
          Sim.brush(w, a.tool, p[0], p[1], a.r, dt);
          if (!a.paused) Sim.step(w, dt * (opts.speed || 1));
          if (task.dist < task.total) task.dist = Math.min(task.total, task.dist + a.speed * dt);
          else if (task.hold > 0) task.hold -= dt;
          else if (++task.pass < task.passes) { task.dist = 0; task.pts = task.pts.slice().reverse(); task.seg = task.seg.slice().reverse(); }
          else { Sim.endStroke(w); task = null; }
        } else if (a.op === "wait") {
          const dt = Math.min(task.left, left);
          Sim.step(w, dt); task.left -= dt; left -= dt;
          if (task.left <= 1e-9) task = null;
        } else if (a.op === "start") {
          Sim.start(w); task = null;
        } else if (a.op === "until") {
          const dt = Math.min(left, 1);
          Sim.step(w, dt); left -= dt;
          if (w.t >= a.t || w.finished) task = null;
        } else task = null;
      }
      return false;
    };
  }

  // Strokes a hand would make to cut one terrace into a slope that falls to the
  // south: level a band, extend it downhill, then swipe an aze around three
  // sides and (optionally) tap a water outlet into the lower edge.
  function terrace(x0, x1, yTop, rows, opt) {
    opt = opt || {};
    const yc = yTop + 1.5, yb = yTop + rows - 1, mid = opt.start !== undefined ? opt.start : (x0 + x1) / 2;
    const r = opt.r || 2.7, out = [];
    // build up from the uphill edge (all fill) where the rock will not be cut
    const from = opt.fill ? [mid, yTop] : [mid, yc];
    out.push({ op: "stroke", tool: "level", r, path: [from, [mid, yc], [x0 + 1, yc], [x1 - 1, yc]], speed: 6, paused: true, passes: 2 });
    if (rows > 4) out.push({ op: "stroke", tool: "level", r, path: [[mid, yc], [mid, yb - 1.5], [x0 + 1, yb - 1.5], [x1 - 1, yb - 1.5]], speed: 6, paused: true });
    out.push({ op: "stroke", tool: "heap", r: opt.lip || 1.6, path: [[x0 - 0.5, yTop - 1.5], [x0 - 0.5, yb + 0.5], [x1 + 0.5, yb + 0.5], [x1 + 0.5, yTop - 1.5]], speed: 6, paused: true });
    if (opt.outlet !== undefined) out.push({ op: "tap", tool: "dig", r: 1.0, at: [opt.outlet, yb + 0.6], hold: opt.hold || 0.14, paused: true });
    return out;
  }

  // Runs a whole script as fast as possible (tests and tools).
  function run(w, script, opts) {
    const adv = player(w, script, opts);
    let guard = 0;
    while (!adv(1) && guard++ < 4000) { /* advance one second at a time */ }
    if (opts && opts.log) console.log("script done at t=" + w.t.toFixed(3));
    return w;
  }
  return { player, run, terrace };
});
