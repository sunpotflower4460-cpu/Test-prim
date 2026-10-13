// Particle effects: steam, bubbles, sizzle, splashes, shell bits and sparkles.
// A fixed pool of sprites is reused, so nothing is allocated per frame.
import * as THREE from "../vendor/three.module.js";
import * as T from "./textures.js";

// tex: "dot" (soft round), "ring" (bubble rim) or "spark" (a small bright dot for sizzle).
const KINDS = {
  steam: { tex: "dot", color: 0xfff8f0, life: [1.6, 2.4], size: [0.26, 0.42], up: 0.35, grow: 0.5, opacity: 0.6, gravity: 0 },
  bubble: { tex: "ring", color: 0xf2fbff, life: [0.45, 0.75], size: [0.07, 0.12], up: 0.6, grow: 0.1, opacity: 0.95, gravity: 0 },
  sizzle: { tex: "spark", color: 0xfff0b8, life: [0.3, 0.45], size: [0.05, 0.075], up: 0.8, grow: 0, opacity: 1, gravity: 4 },
  splash: { tex: "dot", color: 0xcfeeff, life: [0.4, 0.6], size: [0.06, 0.1], up: 1.6, grow: 0, opacity: 0.85, gravity: 6 },
  shell: { tex: "dot", color: 0xfff6e8, life: [0.8, 1.2], size: [0.03, 0.05], up: 0.8, grow: 0, opacity: 1, gravity: 7 },
  sparkle: { tex: "dot", color: 0xffe27a, life: [0.6, 0.9], size: [0.07, 0.12], up: 0.9, grow: -0.5, opacity: 1, gravity: 0 },
  puff: { tex: "dot", color: 0xffffff, life: [0.4, 0.6], size: [0.1, 0.18], up: 0.2, grow: 0.6, opacity: 0.35, gravity: 0 }
};

export function createFx(scene, count = 160) {
  const textures = {
    dot: T.softDot("rgba(255,255,255,1)", "rgba(255,255,255,0)"),
    ring: T.bubbleRing(),
    spark: T.softDot("rgba(255,255,255,1)", "rgba(255,255,255,0)")
  };
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: textures.dot, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.visible = false;
    scene.add(s);
    pool.push({ sprite: s, alive: false, life: 0, max: 1, vx: 0, vy: 0, vz: 0, kind: null, baseSize: 0.1, tex: "dot" });
  }
  let cursor = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function spawn(kind, x, y, z, opts = {}) {
    const k = KINDS[kind];
    if (!k) return;
    const p = pool[cursor];
    cursor = (cursor + 1) % pool.length;
    p.alive = true;
    p.kind = kind;
    p.max = rnd(k.life[0], k.life[1]);
    p.life = p.max;
    const size = rnd(k.size[0], k.size[1]) * (opts.scale || 1);
    p.baseSize = size;
    if (p.tex !== k.tex) {
      p.tex = k.tex;
      p.sprite.material.map = textures[k.tex];
      p.sprite.material.needsUpdate = true;
    }
    p.sprite.position.set(x + rnd(-0.03, 0.03), y, z + rnd(-0.03, 0.03));
    p.sprite.scale.set(size, size, 1);
    p.sprite.material.color.setHex(opts.color || k.color);
    p.sprite.material.opacity = k.opacity;
    p.sprite.visible = true;
    p.vx = opts.vx !== undefined ? opts.vx : rnd(-0.15, 0.15);
    p.vz = opts.vz !== undefined ? opts.vz : rnd(-0.15, 0.15);
    p.vy = opts.vy !== undefined ? opts.vy : k.up * rnd(0.7, 1.2);
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.sprite.visible = false;
        continue;
      }
      const k = KINDS[p.kind];
      const t = 1 - p.life / p.max;
      p.vy -= k.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const s = p.baseSize * (1 + k.grow * t);
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = k.opacity * (1 - t * t);
    }
  }

  return {
    spawn,
    update,
    steam(x, y, z, n = 1) {
      for (let i = 0; i < n; i++) spawn("steam", x + Math.random() * 0.1 - 0.05, y, z + Math.random() * 0.1 - 0.05);
    },
    bubbles(x, y, z, n = 1) {
      for (let i = 0; i < n; i++) spawn("bubble", x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25);
    },
    sizzle(x, y, z, n = 3) {
      for (let i = 0; i < n; i++) spawn("sizzle", x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
    },
    splash(x, y, z, n = 6) {
      for (let i = 0; i < n; i++) spawn("splash", x, y, z, { vy: rnd(0.6, 1.4), vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3) });
    },
    shell(x, y, z, n = 5) {
      for (let i = 0; i < n; i++) spawn("shell", x, y, z, { vy: rnd(0.3, 0.9), vx: rnd(-0.4, 0.4), vz: rnd(-0.4, 0.4), color: 0xfff6e8 });
    },
    sparkle(x, y, z, n = 8, color) {
      for (let i = 0; i < n; i++) spawn("sparkle", x + rnd(-0.3, 0.3), y + rnd(0, 0.3), z + rnd(-0.3, 0.3), { color: color, vx: rnd(-0.4, 0.4), vz: rnd(-0.4, 0.4), vy: rnd(0.8, 1.4) });
    },
    puff(x, y, z, n = 3) {
      for (let i = 0; i < n; i++) spawn("puff", x + rnd(-0.1, 0.1), y, z + rnd(-0.1, 0.1));
    },
    clear() {
      for (const p of pool) {
        p.alive = false;
        p.sprite.visible = false;
      }
    }
  };
}
