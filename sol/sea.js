/* Original Canvas artwork: a sea of ink, carved islands, and a red-sailed letter boat. */
(function () {
  'use strict';
  const TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const hash = (x, y = 0) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const palettes = [
    { sea: '#173f4b', deep: '#0e2836', wave: '#92c8b6', land: '#849c79', top: '#c5c3a0', side: '#566d62', sky: '#edb786', sun: '#f5c991', glow: '#f5cf98' },
    { sea: '#214851', deep: '#122f3e', wave: '#b2d4c6', land: '#759b93', top: '#b6c8ae', side: '#426c6e', sky: '#b2ccbd', sun: '#d8d7b5', glow: '#c4ded5' },
    { sea: '#16334c', deep: '#0e2033', wave: '#8cb9c8', land: '#718f9c', top: '#a7b7b1', side: '#3c5970', sky: '#6f91a9', sun: '#e1d3b1', glow: '#e5c58c' }
  ];
  class Sea {
    constructor(canvas, onResize) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
      this.w = 1; this.h = 1; this.time = 0; this.last = 0; this.tide = 0; this.view = {};
      this.boat = null; this.move = null; this.particles = []; this.ripples = []; this.wakes = [];
      this.resize = () => {
        const r = canvas.getBoundingClientRect(); this.w = r.width; this.h = r.height;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(this.w * this.dpr); canvas.height = Math.round(this.h * this.dpr);
        this.geometry(); if (onResize) onResize();
      };
      this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
      this.boundFrame = n => this.frame(n); requestAnimationFrame(this.boundFrame);
    }
    set(view) {
      const changed = this.view.level !== view.level;
      this.view = view;
      if (changed) { this.boat = view.state ? { x: view.state.x, y: view.state.y, angle: -.25 } : null; this.move = null; this.particles.length = 0; this.ripples.length = 0; this.wakes.length = 0; }
      this.geometry();
    }
    geometry() {
      if (!this.view.level || !this.view.area) return;
      const r = this.view.area.getBoundingClientRect(), l = this.view.level;
      const positions = [];
      for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
        const near = Tide.tile(l,x,y) !== '#' || [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy]) => Tide.tile(l,x+dx,y+dy) !== '#');
        if (near) positions.push({ u: x-y, v: x+y });
      }
      const us = positions.map(p=>p.u), vs = positions.map(p=>p.v);
      const minU=Math.min(...us)-1, maxU=Math.max(...us)+1, minV=Math.min(...vs)-2.2, maxV=Math.max(...vs)+1;
      const sx = Math.max(9,Math.min(52,(r.width-22)/(maxU-minU),(r.height-58)/((maxV-minV)*.56)));
      this.g = { sx, sy:sx*.56, cx:r.left+r.width/2-((minU+maxU)/2)*sx, cy:r.top+r.height/2-((minV+maxV)/2)*sx*.56+8 };
    }
    point(x, y) {
      const l = this.view.level, g = this.g;
      return { x: g.cx + (x - y) * g.sx, y: g.cy + (x + y) * g.sy };
    }
    sail(result, before, done, undo = false) {
      this.boat = this.boat || { x: before.x, y: before.y, angle: -.25 };
      const path = [{ x: this.boat.x, y: this.boat.y }, ...result.path];
      this.move = { path, t: 0, duration: this.view.motion ? Math.min(1.25, .24 + result.path.length * .18) : .06, done, undo };
      if (result.path[0]?.anchor) this.ripples.push({ x: before.x, y: before.y, t: 0, color: '#d4c49e' });
    }
    burst(x, y, type) {
      this.ripples.push({ x, y, t: 0, color: type === 'mail' ? '#ffb17d' : '#f3db9e' });
      const n = this.view.motion ? 13 : 0;
      for (let i = 0; i < n; i++) this.particles.push({ x, y, dx: Math.cos(i / n * TAU) * (12 + hash(i, x) * 20), dy: Math.sin(i / n * TAU) * 15 - 18, t: 0, color: type === 'mail' ? '#ffd2ae' : '#f3d597' });
    }
    frame(now) {
      const dt = Math.min(.04, (now - (this.last || now)) / 1000); this.last = now;
      if (!document.hidden) {
        this.time += dt;
        const target = this.view.state?.tide || 0; this.tide = lerp(this.tide, target, Math.min(1, dt * 3));
        this.animate(dt);
        if (!this.drawAt || now - this.drawAt >= (this.view.motion || this.move ? 30 : 150)) { this.draw(); this.drawAt = now; }
      }
      requestAnimationFrame(this.boundFrame);
    }
    animate(dt) {
      if (this.move) {
        const m = this.move; m.t += dt;
        const fraction = Math.min(1, m.t / m.duration), at = fraction * (m.path.length - 1), i = Math.min(m.path.length - 2, Math.floor(at));
        if (i >= 0) {
          const a = m.path[i], b = m.path[i + 1], t = at - i, ease = t * t * (3 - 2 * t);
          this.boat.x = lerp(a.x, b.x, ease); this.boat.y = lerp(a.y, b.y, ease);
          this.boat.portal = b.portal ? Math.sin(t * Math.PI) : 0;
          if (b.portal) { this.boat.x = t < .5 ? a.x : b.x; this.boat.y = t < .5 ? a.y : b.y; }
          const dx = (b.x - a.x) - (b.y - a.y), dy = ((b.x - a.x) + (b.y - a.y)) * .56;
          if (dx || dy) this.boat.angle = Math.atan2(dy, dx);
          if (!b.portal && !b.anchor && this.view.motion && hash(this.time * 99) > .5) this.wakes.push({ x: this.boat.x, y: this.boat.y, t: 0 });
        }
        if (fraction === 1) { const done = m.done; this.move = null; this.boat.portal = 0; done?.(); }
      }
      for (const a of [this.particles, this.ripples, this.wakes]) {
        for (let i = a.length - 1; i >= 0; i--) { a[i].t += dt; if (a[i].t > (a === this.wakes ? 1.2 : 1.5)) a.splice(i, 1); }
      }
    }
    polygon(points, fill, stroke, width = 1) {
      const c = this.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    ellipse(x, y, rx, ry, fill, stroke, width = 1) {
      const c = this.ctx; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
      if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    line(points, color, width = 1) {
      const c = this.ctx; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
    }
    draw() {
      const c = this.ctx, v = this.view, p = palettes[v.chapter || 0];
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalAlpha = 1;
      const grad = c.createLinearGradient(0, 0, this.w, this.h); grad.addColorStop(0, p.deep); grad.addColorStop(.55, p.sea); grad.addColorStop(1, p.deep);
      c.fillStyle = grad; c.fillRect(0, 0, this.w, this.h);
      if (v.scene === 'title' || v.scene === 'ending') { this.drawTitle(p, v.scene === 'ending'); return; }
      this.drawOcean(p, 0, 0, this.w, this.h);
      if (v.scene === 'play' && v.level && this.g) this.drawBoard(p);
    }
    drawOcean(p, left, top, width, height) {
      const c = this.ctx, t = this.view.motion ? this.time : 0;
      c.save(); c.beginPath(); c.rect(left, top, width, height); c.clip();
      for (let y = top + 9, row = 0; y < top + height; y += 24, row++) {
        for (let x = left - 50, col = 0; x < left + width; x += 60, col++) {
          const n = hash(col, row), drift = Math.sin(t * .3 + row) * 9;
          c.globalAlpha = .05 + n * .065;
          const xx = x + n * 42 + drift, yy = y + Math.sin(t * .45 + col * 1.8 + row) * 3;
          c.beginPath(); c.moveTo(xx, yy); c.bezierCurveTo(xx + 7, yy - 2, xx + 12, yy + 3, xx + 22 + n * 13, yy);
          c.strokeStyle = p.wave; c.lineWidth = n > .8 ? 1.5 : .7; c.stroke();
        }
      }
      c.globalAlpha = 1; c.restore();
    }
    drawTitle(p, ending) {
      const c = this.ctx, portrait = this.w < 650 && this.h > this.w, t = this.view.motion ? this.time : 0;
      const cx = ending ? this.w * .5 : portrait ? this.w * .68 : this.w * .69;
      const cy = ending ? this.h * .48 : portrait ? this.h * (this.h < 680 ? .46 : .54) : this.h * .48;
      const size = Math.min(portrait ? this.w * .72 : this.w * .46, this.h * .67, 560);
      const sunR = size * .27, sy = cy - size * .15;
      const halo = c.createRadialGradient(cx, sy, sunR * .3, cx, sy, size * .85); halo.addColorStop(0, '#d6a77327'); halo.addColorStop(1, '#d6a77300'); c.fillStyle = halo; c.fillRect(0, 0, this.w, this.h);
      c.save(); c.globalAlpha = ending ? .8 : .74; this.ellipse(cx, sy, sunR, sunR, p.sun); c.restore();
      c.save(); c.globalAlpha = .14;
      for (let i = 1; i < 5; i++) this.ellipse(cx, sy, sunR + i * 17, sunR + i * 17, null, p.sun, .7);
      c.restore();
      this.drawOcean(p, 0, this.h * .3, this.w, this.h * .7);
      // Reflected sun breaks into horizontal fragments instead of a solid gradient.
      for (let i = 0; i < 28; i++) {
        const y = sy + sunR * .7 + i * size * .018, wide = (9 + i * 1.3) * (size / 400), shift = Math.sin(i * 1.8 + t * .5) * 10;
        c.globalAlpha = (.16 - i * .0035); this.line([[cx - wide + shift, y], [cx + wide + shift, y]], p.sun, 1.6);
      }
      c.globalAlpha = 1;
      const fog = c.createLinearGradient(0, cy - size * .05, 0, cy + size * .1); fog.addColorStop(0, '#17374600'); fog.addColorStop(.45, '#173746bb'); fog.addColorStop(1, '#17374600'); c.fillStyle = fog; c.fillRect(0, cy - size * .05, this.w, size * .15);
      c.save(); c.translate(cx, cy + size * .12); c.scale(size / 360, size / 360);
      // Lighthouse island: an irregular basalt shelf, warm stone and sea grass.
      this.ellipse(6, 43, 115, 38, '#091f2c55');
      this.polygon([[-102,0],[-67,-26],[-25,-18],[6,-44],[62,-18],[106,10],[75,50],[-21,61],[-88,29]], p.side);
      this.polygon([[-102,-14],[-67,-39],[-25,-31],[6,-57],[62,-31],[106,-4],[75,34],[-21,46],[-88,14]], p.top, '#d5d4b34a');
      this.polygon([[-82,-10],[-60,-29],[-25,-25],[5,-43],[58,-23],[80,-6],[58,19],[-16,30],[-74,9]], p.land);
      this.line([[-88,15],[-23,45],[75,33],[106,-4]], '#e5e0bd66', 2);
      for (let i = 0; i < 13; i++) {
        const x = -65 + hash(i, 1) * 131, y = -15 + hash(i, 2) * 32;
        this.line([[x, y + 3], [x + 1, y - 5], [x + 4, y - 2]], '#d0d2a887', 1.2);
      }
      // Winding footpath and a tiny keeper's house.
      this.line([[-72,20],[-44,10],[-20,17],[7,5],[6,-14]], '#d5d1b0', 8);
      this.polygon([[-68,-12],[-46,-24],[-21,-9],[-43,3]], '#c9d4bd');
      this.polygon([[-68,-12],[-43,3],[-43,24],[-68,9]], '#879e90');
      this.polygon([[-43,3],[-21,-9],[-21,12],[-43,24]], '#d5d7bb');
      this.polygon([[-72,-14],[-48,-39],[-18,-11],[-43,4]], '#c9745a');
      this.polygon([[-48,-39],[-42,-40],[-14,-12],[-18,-11]], '#e89170');
      this.polygon([[-58,0],[-50,5],[-50,13],[-58,8]], '#385c61');
      this.polygon([[-37,8],[-29,4],[-29,16],[-37,21]], '#3c6268');
      this.lighthouse(10, -13, 1.05, true, p);
      // A weathered jetty, rope, and the letter boat.
      for (let i = 0; i < 6; i++) this.polygon([[52 + i * 8,22 + i * 3],[61 + i * 8,17 + i * 3],[66 + i * 8,23 + i * 3],[57 + i * 8,28 + i * 3]], '#bfa382', '#6a6455', .5);
      this.line([[52,24],[96,40]], '#e5cfab', 1);
      this.line([[52,24],[52,34]], '#806f55', 2); this.line([[95,39],[95,51]], '#806f55', 2);
      this.drawBoat(-52, 91 + Math.sin(t * 1.3) * 2, 1.1, -.18, p, 0);
      this.ellipse(-51, 104, 47 + Math.sin(t) * 2, 11, null, '#a0cbb546', .8);
      this.ellipse(-51, 107, 68, 16, null, '#a0cbb51e', .8);
      // Foreground reef and the sea grass silhouette.
      this.rock(102, 120, 18, 11, p, 2, false);
      this.rock(128, 118, 10, 7, p, 3, false);
      c.restore();
      // Quiet gulls and, in the last sea, a constellation.
      for (let i = 0; i < 5; i++) {
        const x = cx + Math.sin(t * .08 + i * 1.9) * size * .5, y = cy - size * (.4 + hash(i) * .15), flap = Math.sin(t * 2 + i) * 2;
        this.line([[x - 5, y + flap], [x, y + 1], [x + 5, y + flap]], '#cfd8bc9c', 1);
      }
      if ((this.view.chapter || 0) === 2 || ending) {
        c.globalAlpha = .6;
        for (let i = 0; i < 35; i++) { const x = hash(i, 45) * this.w, y = hash(i, 25) * this.h * .35; this.ellipse(x, y, i % 5 ? .8 : 1.5, i % 5 ? .8 : 1.5, '#e5d5ae'); }
        c.globalAlpha = 1;
      }
    }
    lighthouse(x, y, s, lit, p) {
      const c = this.ctx; c.save(); c.translate(x, y); c.scale(s, s);
      this.ellipse(3, 8, 24, 10, '#152e3d36');
      this.polygon([[-20,5],[0,-5],[22,7],[1,19]], '#ede5c7', '#6e878333');
      this.polygon([[-11,5],[-8,-65],[9,-71],[13,4],[1,11]], '#e8dfc3');
      this.polygon([[1,11],[0,-68],[9,-71],[13,4]], '#b8c4b1');
      this.polygon([[-10,-12],[-9,-24],[1,-19],[1,-7]], '#be7158');
      this.polygon([[1,-7],[1,-19],[11,-24],[12,-12]], '#986254');
      this.polygon([[-9,-43],[-8,-55],[1,-50],[1,-38]], '#be7158');
      this.polygon([[1,-38],[1,-50],[10,-55],[11,-43]], '#986254');
      this.polygon([[-12,-65],[0,-72],[15,-66],[2,-58]], '#394f52');
      this.polygon([[-9,-69],[-9,-88],[2,-83],[2,-63]], lit ? '#edca82' : '#78908b');
      this.polygon([[2,-63],[2,-83],[12,-88],[12,-69]], lit ? '#f9dea2' : '#526f74');
      this.line([[-9,-88],[-9,-69],[2,-63],[12,-69],[12,-88]], '#344e51', 2);
      this.line([[2,-83],[2,-63]], '#344e51', 2);
      this.polygon([[-15,-88],[0,-104],[17,-89],[2,-81]], '#d77e60');
      this.polygon([[0,-104],[17,-89],[2,-81]], '#a95b4c');
      this.line([[0,-105],[0,-112]], '#e0d4b5', 1);
      this.polygon([[-3,5],[-3,-4],[3,-7],[7,-3],[7,8],[1,11]], '#38565c');
      if (lit) {
        c.save(); c.globalCompositeOperation = 'screen';
        const beam = c.createRadialGradient(2, -75, 1, 2, -75, 95); beam.addColorStop(0, '#f4cc9388'); beam.addColorStop(1, '#f4cc9300');
        c.fillStyle = beam; c.fillRect(-100, -172, 205, 195);
        const a = (this.view.motion ? this.time * .14 : .4), dx = Math.cos(a) * 160, dy = Math.sin(a) * 32;
        const bg = c.createLinearGradient(2, -75, 2 + dx, -75 + dy); bg.addColorStop(0, '#f9db9e66'); bg.addColorStop(1, '#f9db9e00');
        this.polygon([[2,-77],[2 + dx,-75 + dy - 22],[2 + dx,-75 + dy + 22]], bg);
        c.restore();
      }
      c.restore();
    }
    diamond(x, y, sx, sy, fill, stroke) { this.polygon([[x,y-sy],[x+sx,y],[x,y+sy],[x-sx,y]], fill, stroke); }
    rock(x, y, sx, sy, p, seed, grass = true) {
      const h = sx * (.4 + hash(seed) * .35);
      this.ellipse(x + 3, y + 6, sx * .95, sy * .88, '#081c2844');
      this.polygon([[x-sx*.79,y],[x,y+sy*.83],[x+sx*.8,y],[x+sx*.77,y-h],[x,y+sy*.64-h],[x-sx*.76,y-h]], p.side);
      this.polygon([[x-sx*.76,y-h],[x-sx*.12,y-sy*.87-h],[x+sx*.77,y-h],[x+sx*.12,y+sy*.64-h]], grass ? p.land : p.top, '#c5d0b436', .7);
      this.line([[x,y+sy*.69-h],[x+sx*.72,y-h]], '#c8d5b444', 1);
      if (hash(seed, 2) > .52 && grass) {
        this.line([[x-sx*.2,y-h],[x-sx*.2-2,y-h-sx*.24],[x-sx*.2+2,y-h-sx*.17]], '#c9d3a888', 1);
        if (hash(seed, 3) > .45) this.ellipse(x + sx * .15, y - h - sx * .08, 1.8, 1.8, '#f3ce9d');
      }
    }
    drawBoard(p) {
      const c = this.ctx, v = this.view, l = v.level, s = v.state, g = this.g, t = v.motion ? this.time : 0;
      const scale = g.sx / 35;
      // Visible sea cells are a chart, not an opaque slab. Depth lives between them.
      for (let sum = 0; sum < l.width + l.height - 1; sum++) for (let x = 0; x < l.width; x++) {
        const y = sum - x; if (y < 0 || y >= l.height) continue;
        const tile = l.map[y][x], pt = this.point(x, y);
        if (tile === '#') {
          // Empty outer corners remain open ocean; shoreline rocks are nearer the channel.
          const near = [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy]) => { const a = Tide.tile(l,x+dx,y+dy); return a !== '#'; });
          if (near) this.rock(pt.x, pt.y, g.sx * .88, g.sy * .9, p, x * 8 + y);
          continue;
        }
        this.diamond(pt.x, pt.y, g.sx * .97, g.sy * .97, (x+y)%2 ? '#8abfa50a' : '#d5e3b709', '#a0c9bf1e');
        if (tile === '~') {
          c.globalAlpha = 1 - this.tide * .74;
          this.diamond(pt.x, pt.y, g.sx * .86, g.sy * .86, '#c4b58a', '#e3cfa688');
          this.line([[pt.x-g.sx*.4,pt.y],[pt.x+g.sx*.27,pt.y-3]], '#8e9f863f', 1);
          this.line([[pt.x-g.sx*.17,pt.y+5],[pt.x+g.sx*.45,pt.y+2]], '#8e9f863f', 1);
          c.globalAlpha = 1;
          if (this.tide > .2) this.diamond(pt.x, pt.y, g.sx * .85, g.sy * .85, '#70c3bb25', '#acd3b533');
        }
        if (Tide.CURRENTS[tile]) this.drawCurrent(pt, g, tile, t);
        if (tile === 'O') this.drawGate(pt, g, t);
        if (tile === 'S') {
          this.ellipse(pt.x, pt.y, g.sx*.48, g.sy*.45, null, '#cdd3b94a');
          for (let j=0;j<3;j++) this.line([[pt.x-g.sx*.4+j*4*scale,pt.y+g.sy*.1],[pt.x-g.sx*.2+j*4*scale,pt.y+g.sy*.3]], '#bda57d', 3*scale);
        }
        const mi = l.mail.findIndex(a => a.x===x && a.y===y), si = l.shells.findIndex(a => a.x===x && a.y===y);
        if (mi !== -1) this.drawMail(pt, scale, !(s.mail & 1 << mi), t);
        if (si !== -1 && !(s.shells & 1 << si)) this.drawShell(pt, scale, t);
        if (tile === 'B') {
          this.diamond(pt.x, pt.y + 3*scale, g.sx*.9, g.sy*.9, p.side);
          this.diamond(pt.x, pt.y - 3*scale, g.sx*.9, g.sy*.9, p.top, '#e5dcc15c');
          this.lighthouse(pt.x, pt.y - 5*scale, scale*.52, s.mail === l.allMail, p);
          if (s.mail !== l.allMail) { c.fillStyle='#e6d6b3'; c.font = Math.max(8,10*scale)+'px Georgia'; c.textAlign='center'; c.fillText(Tide.count(s.mail)+'/'+l.mail.length,pt.x+g.sx*.52,pt.y-32*scale); }
        }
      }
      // Selectable neighbouring water cells and the planned drift path.
      if (!this.move && !v.finished) {
        for (const a of Tide.ACTIONS.filter(a=>a!=='A')) {
          const r = Tide.step(l,s,a); if (!r.ok) continue;
          const [dx,dy] = Tide.DIRS[a], pt=this.point(s.x+dx,s.y+dy);
          c.save(); c.setLineDash([3,5]); c.globalAlpha=v.hint===a ? .95 : .55;
          this.diamond(pt.x,pt.y,g.sx*.77,g.sy*.77,null,v.hint===a?'#f7dca0':'#c2dcc6'); c.restore();
          this.ellipse(pt.x,pt.y,2,1.2,'#cee1c588');
        }
        const action = v.preview || v.hint;
        if (action && action !== 'A') {
          const r=Tide.step(l,s,action);
          if(r.ok){const ps=[this.point(s.x,s.y),...r.path.map(q=>this.point(q.x,q.y))];c.save();c.setLineDash([4,5]);this.line(ps.map(q=>[q.x,q.y]),'#f3d19b',1.7);c.restore();const dest=ps[ps.length-1];this.ellipse(dest.x,dest.y,g.sx*.48,g.sy*.48,null,'#f0ca8f',1.5);}
        }
      }
      for (const w of this.wakes) { const pt=this.point(w.x,w.y);c.globalAlpha=Math.max(0,(1-w.t/1.2)*.25);this.ellipse(pt.x,pt.y+4*scale,8*scale+w.t*10,3*scale+w.t*3,null,p.wave,.8); }
      c.globalAlpha=1;
      if(this.boat){const pt=this.point(this.boat.x,this.boat.y);this.drawBoat(pt.x,pt.y+Math.sin(t*1.9)*1.1*scale,scale*.63,this.boat.angle,p,this.boat.portal||0);}
      for(const r of this.ripples){const pt=this.point(r.x,r.y);c.globalAlpha=Math.max(0,1-r.t/1.5);this.ellipse(pt.x,pt.y,g.sx*.3+r.t*g.sx,g.sy*.3+r.t*g.sy,null,r.color,1);}
      for(const a of this.particles){const pt=this.point(a.x,a.y);c.globalAlpha=Math.max(0,1-a.t/1.5);this.ellipse(pt.x+a.dx*a.t,pt.y+a.dy*a.t+15*a.t*a.t,2*scale,2*scale,a.color);}
      c.globalAlpha=1;
    }
    drawCurrent(pt,g,tile,t) {
      const d=Tide.DIRS[Tide.CURRENTS[tile]], angle=Math.atan2((d[0]+d[1])*g.sy,(d[0]-d[1])*g.sx), c=this.ctx;
      c.save();c.translate(pt.x,pt.y);c.rotate(angle);c.scale(1,.65);
      c.globalAlpha=.38+this.tide*.4;
      const color=this.tide>.5?'#bee4d0':'#8dadac';
      for(let i=-1;i<2;i++){const xx=i*g.sx*.36+(this.tide>.5?Math.sin(t*2)*g.sx*.06:0);this.line([[xx-g.sx*.12,-g.sx*.17],[xx+g.sx*.1,0],[xx-g.sx*.12,g.sx*.17]],color,1.4);}
      c.restore();
    }
    drawGate(pt,g,t) {
      const c=this.ctx;c.save();
      this.ellipse(pt.x,pt.y,g.sx*.54,g.sy*.54,'#273e6122','#adabd894',1.4);
      this.ellipse(pt.x,pt.y,g.sx*.38,g.sy*.38,null,'#d1c6ea88',.8);
      if(this.tide>.2){c.globalAlpha=this.tide*.55;const glow=c.createRadialGradient(pt.x,pt.y,1,pt.x,pt.y,g.sx*.8);glow.addColorStop(0,'#b7badb66');glow.addColorStop(1,'#b7badb00');c.fillStyle=glow;c.fillRect(pt.x-g.sx,pt.y-g.sx,g.sx*2,g.sx*2);}
      for(let i=0;i<5;i++){const a=i/5*TAU+t*.3;this.ellipse(pt.x+Math.cos(a)*g.sx*.54,pt.y+Math.sin(a)*g.sy*.54,1.5,1.5,'#e1cae6');}
      c.restore();
    }
    drawMail(pt,scale,active,t) {
      const c=this.ctx;c.save();c.translate(pt.x,pt.y+Math.sin(t*1.4+pt.x)*scale);c.scale(scale,scale);
      this.ellipse(0,3,13,5,'#142e393b');this.ellipse(0,0,9,4,active?'#b69360':'#6c918a','#d8c89666');
      this.line([[0,0],[0,-16]],'#b5ac89',2);
      if(active){this.polygon([[0,-17],[11,-19],[11,-12],[0,-10]],'#e88161');this.polygon([[-8,-13],[3,-17],[9,-10],[-3,-5]],'#f3e0b7','#765f493b');this.line([[-8,-13],[0,-10],[3,-17]],'#b79061',.8);}
      else {this.line([[-4,-13],[0,-9],[5,-16]],'#a9cfb5',1.5);}
      c.restore();
    }
    drawShell(pt,scale,t) {
      const c=this.ctx;c.save();c.translate(pt.x,pt.y+Math.sin(t*1.5)*scale);c.scale(scale,scale);
      this.ellipse(0,3,8,3,'#182b322e');
      c.beginPath();c.moveTo(0,4);c.bezierCurveTo(-14,-3,-10,-13,0,-12);c.bezierCurveTo(10,-13,14,-3,0,4);c.fillStyle='#e7c483';c.fill();
      for(let i=-2;i<3;i++)this.line([[0,3],[i*3,-9]],'#a685584d',.8);
      this.ellipse(0,3,2,1,'#f4d8a1');c.restore();
    }
    drawBoat(x,y,scale,angle,p,portal) {
      const c=this.ctx,t=this.view.motion?this.time:0;c.save();c.translate(x,y);c.scale(scale*(1-portal*.8),scale*(1-portal*.8));c.globalAlpha=1-portal*.9;
      this.ellipse(0,9,31,8,'#061e2e66');
      // Hull orientation follows the route; the mast stays upright in screen space.
      c.save();c.rotate(angle);
      this.polygon([[-26,-9],[10,-11],[31,0],[10,11],[-26,9],[-31,0]],'#ded7b1','#173844',1.2);
      this.polygon([[-26,5],[10,8],[29,0],[11,14],[-25,12],[-29,6]],'#b08760');
      this.polygon([[-23,-6],[8,-7],[23,0],[8,7],[-23,6]],'#795a43');
      this.line([[-22,0],[18,0]],'#c3a279',2);this.line([[-13,-6],[-13,6]],'#c5a37e',3);
      this.polygon([[-18,-4],[-8,-4],[-8,3],[-18,3]],'#ead8b1');
      this.line([[-18,-4],[-13,0],[-8,-4]],'#b28f64',.6);
      c.restore();
      this.line([[0,4],[0,-51]],'#e2d9b2',2.2);
      const sway=Math.sin(t*1.4)*2;
      this.polygon([[1,-48],[24+sway,-8],[1,-12]],'#ef8061','#f6ad8755',.7);
      this.polygon([[-2,-43],[-20+sway,-13],[-2,-14]],'#f1e3c4');
      this.polygon([[1,-48],[24+sway,-8],[16+sway,-13]],'#c46a57');
      this.line([[0,-50],[8,-48]],'#dfaa6c',1);
      this.polygon([[1,-51],[11,-50],[9,-45],[1,-47]],'#ef8061');
      c.restore();
    }
  }
  window.SeaArt=Sea;
})();
