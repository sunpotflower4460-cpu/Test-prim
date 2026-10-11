"use strict";
/* ECHO — きろくの協力者 / 塔の描画
   Canvas 2D だけで描く。背景（塔の灯りと星）、盤面、エコー、演出。
   DOM には触れない。game.js が窓口。 */
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const ECHO_TINTS = ["#9cc4ff", "#c9a6ff", "#8fe3c9", "#ffd28a"];
  const TAU = Math.PI * 2;

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function withAlpha(hex, alpha) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  class TowerArt {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext("2d") : null;
      this.W = 360; this.H = 640; this.DPR = 1;
      this.time = 0;
      this.motion = true;
      this.level = null;
      this.bounds = { left: 0, top: 0, width: 360, height: 560 };
      this.cell = 48; this.ox = 0; this.oy = 0;
      this.stars = [];
      this.player = null;
      this.echoes = [];
      this.plates = [];
      this.doors = [];
      this.sparks = [];
      this.rewindT = -1;
      this.winT = -1;
      this.layoutPending = false;
    }

    /* ---------- サイズと配置 ---------- */
    resize(bounds) {
      if (bounds) this.bounds = bounds;
      const DPR = Math.min(2, window.devicePixelRatio || 1);
      this.DPR = DPR;
      this.W = Math.max(240, window.innerWidth);
      this.H = Math.max(320, window.innerHeight);
      if (this.canvas) {
        this.canvas.width = Math.round(this.W * DPR);
        this.canvas.height = Math.round(this.H * DPR);
      }
      if (this.ctx) this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      this.buildStars();
      if (this.level) this.layout();
    }

    buildStars() {
      const stars = [];
      const count = Math.round(clamp((this.W * this.H) / 14000, 26, 90));
      for (let i = 0; i < count; i++) {
        const rx = ((i * 137.5) % 100) / 100;
        const ry = ((i * 311.7) % 100) / 100;
        stars.push({
          x: rx * this.W, y: ry * this.H * .9,
          r: .6 + ((i * 53) % 11) / 10,
          phase: (i % 9) * .7, speed: .5 + (i % 5) * .22
        });
      }
      this.stars = stars;
    }

    layout(bounds) {
      if (bounds) this.bounds = bounds;
      if (!this.level) return;
      const { left, top, width, height } = this.bounds;
      const lv = this.level;
      const pad = 24;
      const cell = Math.max(22, Math.min((width - pad) / lv.w, (height - pad) / lv.h, 78));
      this.cell = cell;
      this.ox = left + (width - cell * lv.w) / 2;
      this.oy = top + (height - cell * lv.h) / 2;
    }

    pointOf(x, y) {
      return { x: this.ox + (x + .5) * this.cell, y: this.oy + (y + .5) * this.cell };
    }

    /* ---------- レベルとアクター ---------- */
    setLevel(level) {
      this.level = level;
      this.plates = level.plates.map(p => ({ id: p.id, x: p.x, y: p.y, lit: false, glow: 0 }));
      this.doors = level.doors.map(d => ({ x: d.x, y: d.y, needs: d.needs.slice(), open: false, glow: 0 }));
      this.player = this.makeActor(level.start.x, level.start.y);
      this.echoes = [];
      this.sparks = [];
      this.rewindT = -1;
      this.winT = -1;
      this.layout();
    }

    makeActor(x, y) {
      return { x, y, px: x, py: y, t: 1, dur: 0, bob: Math.random() * TAU };
    }

    setWorld(world, snap) {
      if (!this.level) return;
      const targets = [world.player, ...world.echoes];
      const actors = [this.player, ...this.echoes];
      while (actors.length < targets.length) actors.push(this.makeActor(this.level.start.x, this.level.start.y));
      actors.length = targets.length;
      const instant = !!snap;
      targets.forEach((t, i) => this.moveActor(actors[i], t.x, t.y, instant));
      this.player = actors[0];
      this.echoes = actors.slice(1);
    }

    moveActor(actor, x, y, snap) {
      if (snap || (actor.x === x && actor.y === y)) {
        const p = this.pos(actor);
        actor.px = p.x; actor.py = p.y;
        actor.x = x; actor.y = y;
        actor.t = 1; actor.dur = 0;
        return;
      }
      const p = this.pos(actor);
      actor.px = p.x; actor.py = p.y;
      actor.x = x; actor.y = y;
      actor.t = 0;
      actor.dur = this.motion ? .16 : 0;
      actor.bob = Math.random() * TAU;
    }

    pos(actor) {
      const k = actor.dur ? easeOut(clamp(actor.t, 0, 1)) : 1;
      return { x: actor.px + (actor.x - actor.px) * k, y: actor.py + (actor.y - actor.py) * k };
    }

    /* ---------- 演出 ---------- */
    handle(events) {
      if (!events) return { rewind: false, win: false };
      let rewind = false, win = false;
      for (const event of events) {
        if (event.type === "plate") {
          const plate = this.plates.find(p => p.id === event.id);
          if (plate) {
            plate.lit = event.on;
            plate.glow = 1;
            const p = this.pointOf(plate.x, plate.y);
            this.spark(p.x, p.y, event.on ? "#f2c879" : "#8ea0c8", this.cell * (event.on ? .9 : .55), .5, 2);
          }
        } else if (event.type === "door") {
          const door = this.doors[event.index];
          if (door) {
            door.open = event.open;
            door.glow = 1;
            const p = this.pointOf(door.x, door.y);
            this.spark(p.x, p.y, "#9cc4ff", this.cell * (event.open ? 1.1 : .6), .6, 2);
          }
        } else if (event.type === "rewind") {
          rewind = true;
          this.rewindT = 0;
        } else if (event.type === "win") {
          win = true;
          this.winT = 0;
        } else if (event.type === "stay" && event.blocked) {
          const actor = event.actor === 0 ? this.player : this.echoes[event.actor - 1];
          if (actor) {
            const p = this.pos(actor);
            this.spark(p.x, p.y, "#61729e", this.cell * .5, .3, 3);
          }
        }
      }
      return { rewind, win };
    }

    spark(x, y, color, radius, life, width) {
      this.sparks.push({ x, y, color, r0: this.cell * .12, r1: radius, t: 0, life: life || .5, width: width || 2 });
      if (this.sparks.length > 40) this.sparks.shift();
    }

    celebrate() { this.winT = Math.max(this.winT, 0); }
    resetFx() { this.rewindT = -1; this.winT = -1; this.sparks = []; }

    update(dt) {
      this.time += dt;
      const actors = [this.player, ...this.echoes];
      for (const a of actors) {
        if (a && a.t < 1) a.t = Math.min(1, a.t + dt / Math.max(.001, a.dur));
      }
      for (const plate of this.plates) if (plate.glow > 0) plate.glow = Math.max(0, plate.glow - dt * 2.4);
      for (const door of this.doors) if (door.glow > 0) door.glow = Math.max(0, door.glow - dt * 2);
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.t += dt;
        if (s.t >= s.life) this.sparks.splice(i, 1);
      }
      if (this.rewindT >= 0) this.rewindT = Math.min(1, this.rewindT + dt / .8);
      if (this.winT >= 0) this.winT = Math.min(1, this.winT + dt / 1.4);
    }

    /* ---------- 描画 ---------- */
    draw() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.W, this.H);
      this.drawBackdrop(ctx);
      if (this.level) {
        this.drawBoard(ctx);
        this.drawSparks(ctx);
        this.drawActors(ctx);
        this.drawRewind(ctx);
        this.drawWin(ctx);
      }
      this.drawVignette(ctx);
    }

    drawBackdrop(ctx) {
      const { W, H } = this;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#060a1a");
      g.addColorStop(.5, "#0a1129");
      g.addColorStop(1, "#04060e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(W * .5, -H * .18, 30, W * .5, -H * .18, H * .8);
      halo.addColorStop(0, "rgba(99, 132, 224, .30)");
      halo.addColorStop(.55, "rgba(99, 132, 224, .10)");
      halo.addColorStop(1, "rgba(99, 132, 224, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H * .95);
      for (const s of this.stars) {
        const a = .18 + .5 * (.5 + .5 * Math.sin(this.time * s.speed + s.phase));
        ctx.globalAlpha = a;
        ctx.fillStyle = "#cfe0ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawVignette(ctx) {
      const g = ctx.createRadialGradient(this.W * .5, this.H * .45, Math.min(this.W, this.H) * .35, this.W * .5, this.H * .5, Math.max(this.W, this.H) * .75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,.42)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    drawBoard(ctx) {
      const lv = this.level, c = this.cell;
      const w = lv.w * c, h = lv.h * c;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = "rgba(7,10,24,.92)";
      roundRect(ctx, this.ox - 9, this.oy - 9, w + 18, h + 18, 18);
      ctx.fill();
      ctx.restore();
      for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) this.drawTile(ctx, x, y);
    }

    drawTile(ctx, x, y) {
      const lv = this.level, c = this.cell;
      const px = this.ox + x * c, py = this.oy + y * c;
      const ch = lv.tiles[y][x];
      if (ch === "#") {
        const g = ctx.createLinearGradient(px, py, px, py + c);
        g.addColorStop(0, "#232c56");
        g.addColorStop(.18, "#1a2246");
        g.addColorStop(1, "#0d1230");
        ctx.fillStyle = g;
        roundRect(ctx, px + 1.5, py + 1.5, c - 3, c - 3, 7);
        ctx.fill();
        ctx.strokeStyle = "rgba(156,196,255,.14)";
        ctx.lineWidth = 1;
        roundRect(ctx, px + 1.5, py + 1.5, c - 3, c - 3, 7);
        ctx.stroke();
        ctx.fillStyle = "rgba(156,196,255,.07)";
        roundRect(ctx, px + 3.5, py + 3.5, c - 7, Math.min(8, c * .18), 4);
        ctx.fill();
        return;
      }
      ctx.fillStyle = (x + y) % 2 ? "#131a38" : "#101632";
      roundRect(ctx, px + 1, py + 1, c - 2, c - 2, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(156,196,255,.07)";
      ctx.lineWidth = 1;
      roundRect(ctx, px + 1, py + 1, c - 2, c - 2, 6);
      ctx.stroke();

      const plate = this.plates.find(p => p.x === x && p.y === y);
      if (plate) this.drawPlate(ctx, plate, px, py, c);
      const door = this.doors.find(d => d.x === x && d.y === y);
      if (door) this.drawDoor(ctx, door, px, py, c);
      if (lv.goal.x === x && lv.goal.y === y) this.drawGoal(ctx, px, py, c);
      if (lv.start.x === x && lv.start.y === y) {
        ctx.strokeStyle = "rgba(233,237,255,.16)";
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(px + c / 2, py + c / 2, c * .18, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    drawPlate(ctx, plate, px, py, c) {
      const cx = px + c / 2, cy = py + c / 2, r = c * .28;
      const glow = plate.glow;
      if (plate.lit || glow > 0) {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * (1.7 + glow * .9));
        g.addColorStop(0, withAlpha("#f2c879", .32 + .3 * (plate.lit ? 1 : glow)));
        g.addColorStop(1, withAlpha("#f2c879", 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r * (1.7 + glow * .9), 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = plate.lit ? "rgba(242,200,121,.85)" : "rgba(242,200,121,.09)";
      ctx.fill();
      ctx.strokeStyle = plate.lit ? "#ffe3a3" : "rgba(242,200,121,.5)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = plate.lit ? "#241a06" : "rgba(242,200,121,.75)";
      ctx.font = "600 " + Math.max(9, c * .22) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(plate.id), cx, cy + 1);
    }

    drawDoor(ctx, door, px, py, c) {
      const inset = 2.5;
      if (door.open) {
        const g = ctx.createLinearGradient(px, py, px, py + c);
        g.addColorStop(0, "rgba(156,196,255,.22)");
        g.addColorStop(1, "rgba(156,196,255,.05)");
        ctx.fillStyle = g;
        roundRect(ctx, px + inset, py + inset, c - inset * 2, c - inset * 2, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(156,196,255,.5)";
        ctx.lineWidth = 1.3;
        roundRect(ctx, px + inset, py + inset, c - inset * 2, c - inset * 2, 6);
        ctx.stroke();
        ctx.strokeStyle = "rgba(210,228,255,.5)";
        ctx.setLineDash([2, 6]);
        ctx.beginPath();
        ctx.moveTo(px + c / 2, py + 5);
        ctx.lineTo(px + c / 2, py + c - 5);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const g = ctx.createLinearGradient(px, py, px, py + c);
        g.addColorStop(0, "#39436e");
        g.addColorStop(1, "#20294e");
        ctx.fillStyle = g;
        roundRect(ctx, px + inset, py + inset, c - inset * 2, c - inset * 2, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(233,237,255,.2)";
        ctx.lineWidth = 1.2;
        roundRect(ctx, px + inset, py + inset, c - inset * 2, c - inset * 2, 6);
        ctx.stroke();
        ctx.strokeStyle = "rgba(10,13,30,.85)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(px + inset + (c - inset * 2) * i / 4, py + 4);
          ctx.lineTo(px + inset + (c - inset * 2) * i / 4, py + c - 4);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(156,196,255,.65)";
        door.needs.forEach((id, i) => {
          ctx.beginPath();
          ctx.arc(px + c / 2 + (i - (door.needs.length - 1) / 2) * c * .18, py + c - 6.5, Math.max(1.6, c * .035), 0, TAU);
          ctx.fill();
        });
      }
      if (door.glow > 0) {
        ctx.globalAlpha = door.glow * .5;
        ctx.strokeStyle = "#bcd6ff";
        ctx.lineWidth = 1.5;
        roundRect(ctx, px + inset - door.glow * 4, py + inset - door.glow * 4, c - inset * 2 + door.glow * 8, c - inset * 2 + door.glow * 8, 8);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    drawGoal(ctx, px, py, c) {
      const cx = px + c / 2, cy = py + c / 2;
      const pulse = .5 + .5 * Math.sin(this.time * 2.2);
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, c * .85);
      g.addColorStop(0, "rgba(255,250,228,.5)");
      g.addColorStop(.5, "rgba(255,246,214,.14)");
      g.addColorStop(1, "rgba(255,246,214,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, c * .85, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, c * (.24 + pulse * .03), 0, TAU);
      ctx.strokeStyle = "rgba(255,250,228,.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, c * .12, 0, TAU);
      ctx.fillStyle = "rgba(255,250,228,.9)";
      ctx.fill();
    }

    drawSparks(ctx) {
      for (const s of this.sparks) {
        const k = clamp(s.t / s.life, 0, 1);
        const alpha = (1 - k) * .85;
        const r = s.r0 + (s.r1 - s.r0) * easeOut(k);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.strokeStyle = withAlpha(s.color, alpha);
        ctx.lineWidth = s.width * (1 - k * .6);
        ctx.stroke();
      }
    }

    drawActors(ctx) {
      const c = this.cell;
      for (let i = this.echoes.length - 1; i >= 0; i--) this.drawEcho(ctx, this.echoes[i], i, c);
      if (this.player) this.drawPlayer(ctx, this.player, c);
    }

    drawEcho(ctx, actor, index, c) {
      const p = this.pos(actor);
      const bob = this.motion ? Math.sin(this.time * 2.1 + actor.bob) * c * .045 : 0;
      const color = ECHO_TINTS[index % ECHO_TINTS.length];
      const r = c * .27;
      const g = ctx.createRadialGradient(p.x, p.y + bob, 1, p.x, p.y + bob, r * 1.6);
      g.addColorStop(0, withAlpha(color, .3));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, r * 1.6, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, r, 0, TAU);
      ctx.strokeStyle = withAlpha(color, .85);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, r * .42, 0, TAU);
      ctx.fillStyle = withAlpha(color, .8);
      ctx.fill();
      if (actor.t < 1) {
        const from = this.pointOf(actor.px, actor.py);
        const k = easeOut(clamp(actor.t, 0, 1));
        const tx = from.x + (p.x - from.x) * k * .55;
        const ty = from.y + (p.y - from.y) * k * .55 + bob;
        ctx.beginPath();
        ctx.arc(tx, ty, r * .55, 0, TAU);
        ctx.strokeStyle = withAlpha(color, .35 * (1 - k));
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    drawPlayer(ctx, actor, c) {
      const p = this.pos(actor);
      const bob = this.motion ? Math.sin(this.time * 3.1) * c * .035 : 0;
      const x = p.x, y = p.y + bob;
      const g = ctx.createRadialGradient(x, y, 1, x, y, c * .6);
      g.addColorStop(0, "rgba(255,249,226,.95)");
      g.addColorStop(.35, "rgba(255,240,190,.4)");
      g.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, c * .6, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - c * .19);
      ctx.lineTo(x + c * .16, y);
      ctx.lineTo(x, y + c * .19);
      ctx.lineTo(x - c * .16, y);
      ctx.closePath();
      ctx.fillStyle = "#fff6d8";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, c * .3, 0, TAU);
      ctx.strokeStyle = "rgba(255,246,214,.4)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    drawRewind(ctx) {
      if (this.rewindT < 0) return;
      const t = this.rewindT;
      ctx.fillStyle = withAlpha("#7d9ce8", .16 * (1 - t));
      ctx.fillRect(0, 0, this.W, this.H);
      const bandY = easeOut(t) * (this.H + 240) - 120;
      const g = ctx.createLinearGradient(0, bandY - 80, 0, bandY + 80);
      g.addColorStop(0, withAlpha("#9cc4ff", 0));
      g.addColorStop(.5, withAlpha("#cfe0ff", .26));
      g.addColorStop(1, withAlpha("#9cc4ff", 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, bandY - 80, this.W, 160);
      ctx.strokeStyle = withAlpha("#dfeaff", .4 * (1 - t));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, bandY);
      ctx.lineTo(this.W, bandY);
      ctx.stroke();
    }

    drawWin(ctx) {
      if (this.winT < 0 || !this.level) return;
      const t = this.winT;
      const g0 = this.pointOf(this.level.goal.x, this.level.goal.y);
      const g = ctx.createRadialGradient(g0.x, g0.y, 4, g0.x, g0.y, this.cell * (1.5 + 9 * easeOut(t)));
      g.addColorStop(0, "rgba(255,250,228," + (.5 * (1 - t * .7)) + ")");
      g.addColorStop(.6, "rgba(255,246,214," + (.16 * (1 - t)) + ")");
      g.addColorStop(1, "rgba(255,246,214,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  window.TowerArt = TowerArt;
})();
