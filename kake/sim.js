/* 屋根の駆け。固定の歩幅で、跳んで、駆けて、灯りまで届く。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Kake = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DT = 1 / 60;
  const GRAV = 1550;
  const RUN = 176;
  const JUMP_V = 472;
  const DASH_V = 540;
  const DASH_T = 0.13;
  const DASH_CD = 0.42;
  const COYOTE = 0.12;
  const BUFFER = 0.12;
  const HW = 8;
  const PH = 28;

  function create(level) {
    return {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      ground: true,
      coyote: 0,
      jumpBuf: 0,
      dash: 0,
      dashCd: 0,
      time: 0,
      won: false,
      dead: false,
      enemies: level.enemies.map(enemy => ({
        x: enemy.x, y: enemy.y, base: enemy.y, dir: 1, alive: true
      }))
    };
  }

  function bodyOf(state) {
    return { x: state.x - HW, y: state.y - PH, w: HW * 2, h: PH };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function hitsCircle(box, cx, cy, r) {
    const x = Math.max(box.x, Math.min(cx, box.x + box.w));
    const y = Math.max(box.y, Math.min(cy, box.y + box.h));
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  function gatePhase(gate, time) {
    return (time + (gate.offset || 0)) % gate.period;
  }
  function gateOpen(gate, time) {
    return gatePhase(gate, time) < gate.open;
  }

  function solidsAt(level, time) {
    const list = level.solids.slice();
    level.gates.forEach(gate => {
      if (!gateOpen(gate, time)) list.push(gate);
    });
    return list;
  }

  function step(state, level, input) {
    if (state.won || state.dead) return state;
    const s = {
      x: state.x, y: state.y, vx: state.vx, vy: state.vy,
      facing: state.facing, ground: state.ground,
      coyote: state.coyote, jumpBuf: state.jumpBuf,
      dash: state.dash, dashCd: state.dashCd, time: state.time,
      won: false, dead: false,
      enemies: state.enemies.map(enemy => ({
        x: enemy.x, y: enemy.y, base: enemy.base, dir: enemy.dir, alive: enemy.alive
      }))
    };
    s.time += DT;
    if (s.ground) s.coyote = COYOTE;
    else s.coyote = Math.max(0, s.coyote - DT);
    s.jumpBuf = Math.max(0, s.jumpBuf - DT);
    s.dash = Math.max(0, s.dash - DT);
    s.dashCd = Math.max(0, s.dashCd - DT);
    if (input.jump) s.jumpBuf = BUFFER;
    if (input.dash && s.dash <= 0 && s.dashCd <= 0) {
      if (input.left && !input.right) s.facing = -1;
      else if (input.right && !input.left) s.facing = 1;
      s.dash = DASH_T;
      s.dashCd = DASH_CD;
      s.vx = s.facing * DASH_V;
    }
    if (s.dash > 0) {
      s.vx = s.facing * DASH_V;
      s.vy += GRAV * DT * 0.28;
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir) {
        s.facing = dir;
        const target = dir * RUN;
        const rate = s.ground ? 2200 : 980;
        const delta = target - s.vx;
        const stepV = Math.max(-rate * DT, Math.min(rate * DT, delta));
        s.vx += stepV;
      } else if (s.ground) {
        s.vx *= 0.62;
        if (Math.abs(s.vx) < 6) s.vx = 0;
      }
      s.vy += GRAV * DT;
    }
    if (s.vy > 760) s.vy = 760;
    if (s.jumpBuf > 0 && (s.ground || s.coyote > 0)) {
      s.vy = -JUMP_V;
      s.ground = false;
      s.coyote = 0;
      s.jumpBuf = 0;
    }

    const beforeY = s.y;
    s.x += s.vx * DT;
    let box = bodyOf(s);
    const solids = solidsAt(level, s.time);
    solids.forEach(solid => {
      if (!overlap(box, solid)) return;
      if (s.vx > 0) s.x = solid.x - HW;
      else if (s.vx < 0) s.x = solid.x + solid.w + HW;
      else s.x = s.x < solid.x + solid.w / 2 ? solid.x - HW : solid.x + solid.w + HW;
      s.vx = 0;
      box = bodyOf(s);
    });
    s.y += s.vy * DT;
    box = bodyOf(s);
    s.ground = false;
    solids.forEach(solid => {
      if (!overlap(box, solid)) return;
      if (s.vy >= 0 && beforeY <= solid.y + 1) {
        s.y = solid.y;
        s.vy = 0;
        s.ground = true;
      } else if (s.vy < 0) {
        s.y = solid.y + solid.h + PH;
        s.vy = 0;
      } else {
        if (s.x < solid.x + solid.w / 2) s.x = solid.x - HW;
        else s.x = solid.x + solid.w + HW;
        s.vx = 0;
      }
      box = bodyOf(s);
    });

    s.enemies.forEach((enemy, index) => {
      if (!enemy.alive) return;
      const spec = level.enemies[index];
      enemy.x += enemy.dir * spec.speed * DT;
      if (enemy.x > spec.x1) { enemy.x = spec.x1; enemy.dir = -1; }
      if (enemy.x < spec.x0) { enemy.x = spec.x0; enemy.dir = 1; }
      const amp = spec.amp || 0;
      enemy.y = enemy.base + Math.sin(s.time * (spec.freq || 2) + (spec.phase || 0)) * amp;
    });

    box = bodyOf(s);
    if (s.y > level.kill) {
      s.dead = true;
      return s;
    }
    for (let i = 0; i < s.enemies.length; i++) {
      const enemy = s.enemies[i];
      if (!enemy.alive) continue;
      if (!hitsCircle(box, enemy.x, enemy.y, 13)) continue;
      if (s.dash > 0) enemy.alive = false;
      else {
        s.dead = true;
        return s;
      }
    }
    if (hitsCircle(box, level.goal.x, level.goal.y, level.goal.r)) s.won = true;
    return s;
  }

  function play(level, script) {
    let state = create(level);
    let prev = { jump: false, dash: false };
    let frame = 0;
    const chunks = script || [];
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      for (let i = 0; i < chunk.n; i++) {
        const input = {
          left: !!chunk.left,
          right: !!chunk.right,
          jump: !!chunk.jump && !prev.jump,
          dash: !!chunk.dash && !prev.dash
        };
        prev = { jump: !!chunk.jump, dash: !!chunk.dash };
        state = step(state, level, input);
        frame += 1;
        if (state.won || state.dead) {
          return { won: state.won, dead: state.dead, x: state.x, y: state.y, frame: frame, state: state };
        }
      }
    }
    return { won: false, dead: !!state.dead, x: state.x, y: state.y, frame: frame, state: state };
  }

  return {
    DT: DT, HW: HW, PH: PH,
    create: create, step: step, play: play, bodyOf: bodyOf, gateOpen: gateOpen, gatePhase: gatePhase
  };
});
