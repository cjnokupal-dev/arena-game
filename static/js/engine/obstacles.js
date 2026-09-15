// language: JavaScript, file: static/js/engine/obstacles.js
// *static map — walls (rect), trees (trunk collider, canopy visual), rocks (polygon)*
import { rand, randInt, TAU } from '../utils/math.js';

export class Obstacle {
  constructor(type, x, y, opts){
    this.type = type;
    this.x = x; this.y = y;
    this.dead = false;
    Object.assign(this, opts);
    // rock polygon — precomputed for stable shape
    if (type === 'rock'){
      this.verts = [];
      const n = randInt(6, 9);
      for (let i = 0; i < n; i++){
        const a = (i / n) * TAU;
        const r = this.r * rand(0.72, 1.1);
        this.verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
    }
    // tree canopy offsets — precomputed clusters
    if (type === 'tree'){
      this.canopy = [];
      const n = randInt(5, 8);
      for (let i = 0; i < n; i++){
        const a = Math.random() * TAU;
        const d = Math.random() * this.canopyR * 0.55;
        this.canopy.push({
          x: Math.cos(a) * d,
          y: Math.sin(a) * d * 0.7,
          r: this.canopyR * rand(0.45, 0.72),
          shade: rand(-30, 30),
        });
      }
      // trunk lean
      this.lean = rand(-0.15, 0.15);
    }
    // wall texture seed
    if (type === 'wall'){
      this.seed = Math.random() * 1000;
    }
  }

  // collider shape for physics
  get collider(){
    if (this.type === 'wall') return { kind:'rect', x:this.x, y:this.y, w:this.w, h:this.h };
    return { kind:'circle', x:this.x, y:this.y, r:this.cr };
  }

  render(ctx, t = 0){
    if (this.type === 'wall')  this.renderWall(ctx);
    if (this.type === 'tree')  this.renderTree(ctx, t);
    if (this.type === 'rock')  this.renderRock(ctx);
  }

  renderWall(ctx){
    const { x, y, w, h, seed } = this;
    const left = x - w/2, top = y - h/2;

    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(left + 5, top + 6, w, h);

    // base fill — vertical gradient
    const g = ctx.createLinearGradient(left, top, left, top + h);
    g.addColorStop(0, '#3a4252');
    g.addColorStop(0.5, '#2a3140');
    g.addColorStop(1, '#1e2532');
    ctx.fillStyle = g;
    ctx.fillRect(left, top, w, h);

    // brick pattern
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, w, h);
    ctx.clip();
    const bw = 26, bh = 13;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let yy = top, row = 0; yy < top + h; yy += bh, row++){
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(left + w, yy);
      ctx.stroke();
      const offset = (row % 2) * (bw / 2);
      for (let xx = left + offset; xx < left + w; xx += bw){
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + bh);
        ctx.stroke();
      }
    }
    // subtle highlight stripe
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#aebccf';
    for (let xx = left + 4; xx < left + w; xx += 12){
      ctx.fillRect(xx, top, 1, h);
    }
    ctx.restore();

    // edge highlight / dark edge for depth
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left + 1, top + 1);
    ctx.lineTo(left + w - 1, top + 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(left + 1, top + h - 1);
    ctx.lineTo(left + w - 1, top + h - 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  }

  renderTree(ctx, t){
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x + 6, this.y + this.canopyR * 0.65 + 8, this.canopyR * 1.05, this.canopyR * 0.4, 0, 0, TAU);
    ctx.fill();

    // trunk
    const tw = this.cr * 0.55;
    const th = this.canopyR * 1.15;
    const tx = this.x + this.lean * th;
    const ty = this.y + this.canopyR * 0.35;
    const tg = ctx.createLinearGradient(tx - tw, ty, tx + tw, ty + th);
    tg.addColorStop(0, '#4a3826');
    tg.addColorStop(0.5, '#6b5138');
    tg.addColorStop(1, '#2e2215');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(tx - tw * 0.55, ty);
    ctx.lineTo(tx + tw * 0.55, ty);
    ctx.lineTo(tx + tw * 0.4, ty + th);
    ctx.lineTo(tx - tw * 0.4, ty + th);
    ctx.closePath();
    ctx.fill();
    // bark lines
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++){
      ctx.beginPath();
      ctx.moveTo(tx + i * tw * 0.28, ty + 3);
      ctx.lineTo(tx + i * tw * 0.22, ty + th - 2);
      ctx.stroke();
    }

    // canopy — layered blobs
    const baseR = this.canopyR;
    // dark under-layer
    for (const c of this.canopy){
      ctx.fillStyle = `rgba(15,40,20,0.9)`;
      ctx.beginPath();
      ctx.arc(this.x + c.x + 3, this.y + c.y + 5, c.r * 0.95, 0, TAU);
      ctx.fill();
    }
    // mid-layer
    for (const c of this.canopy){
      const shade = c.shade;
      const green = Math.max(60, Math.min(150, 90 + shade));
      const g = ctx.createRadialGradient(
        this.x + c.x - c.r * 0.35, this.y + c.y - c.r * 0.35, c.r * 0.1,
        this.x + c.x, this.y + c.y, c.r
      );
      g.addColorStop(0, `rgb(${Math.round(green * 0.9)},${green + 50},${Math.round(green * 0.4)})`);
      g.addColorStop(0.7, `rgb(${Math.round(green * 0.5)},${green + 15},${Math.round(green * 0.25)})`);
      g.addColorStop(1, `rgb(${Math.round(green * 0.25)},${Math.round(green * 0.6)},${Math.round(green * 0.15)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x + c.x, this.y + c.y, c.r, 0, TAU);
      ctx.fill();
    }
    // highlight specks
    ctx.fillStyle = 'rgba(180,255,150,0.35)';
    for (const c of this.canopy){
      ctx.beginPath();
      ctx.arc(this.x + c.x - c.r * 0.4, this.y + c.y - c.r * 0.45, c.r * 0.18, 0, TAU);
      ctx.fill();
    }
    // rim outline
    ctx.strokeStyle = 'rgba(10,30,15,0.6)';
    ctx.lineWidth = 1.5;
    for (const c of this.canopy){
      ctx.beginPath();
      ctx.arc(this.x + c.x, this.y + c.y, c.r, 0, TAU);
      ctx.stroke();
    }
  }

  renderRock(ctx){
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(this.x + 4, this.y + this.r * 0.85, this.r * 1.15, this.r * 0.35, 0, 0, TAU);
    ctx.fill();

    // poly body
    const g = ctx.createRadialGradient(
      this.x - this.r * 0.4, this.y - this.r * 0.4, this.r * 0.1,
      this.x, this.y, this.r * 1.1
    );
    g.addColorStop(0, '#8a95a8');
    g.addColorStop(0.55, '#5a6478');
    g.addColorStop(1, '#2a2f3c');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < this.verts.length; i++){
      const v = this.verts[i];
      if (i === 0) ctx.moveTo(this.x + v.x, this.y + v.y);
      else ctx.lineTo(this.x + v.x, this.y + v.y);
    }
    ctx.closePath();
    ctx.fill();

    // facet lines
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.verts.length; i += 2){
      const a = this.verts[i];
      const b = this.verts[(i + 2) % this.verts.length];
      ctx.beginPath();
      ctx.moveTo(this.x + a.x, this.y + a.y);
      ctx.lineTo(this.x + b.x * 0.4, this.y + b.y * 0.4);
      ctx.stroke();
    }

    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(this.x - this.r * 0.35, this.y - this.r * 0.45, this.r * 0.35, 0, TAU);
    ctx.fill();

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.verts.length; i++){
      const v = this.verts[i];
      if (i === 0) ctx.moveTo(this.x + v.x, this.y + v.y);
      else ctx.lineTo(this.x + v.x, this.y + v.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

// ---------- map generation ----------
export function generateObstacles(w, h){
  const list = [];
  const cx = w / 2, cy = h / 2;
  const safeR = 140; // keep player spawn area clear

  function tooClose(x, y, pad){
    if (Math.hypot(x - cx, y - cy) < safeR + pad) return true;
    for (const o of list){
      const ox = o.x, oy = o.y;
      const or = o.type === 'wall' ? Math.max(o.w, o.h) * 0.6 : o.cr;
      const minD = or + pad;
      if (Math.hypot(x - ox, y - oy) < minD) return true;
    }
    return false;
  }

  // walls — a few barriers
  const wallCount = Math.max(3, Math.floor((w * h) / 260000));
  for (let i = 0; i < wallCount; i++){
    let tries = 30, x, y, placed = false;
    while (tries-- > 0){
      const ww = rand(60, 130);
      const wh = rand(22, 34);
      x = rand(ww, w - ww);
      y = rand(wh, h - wh);
      if (!tooClose(x, y, Math.max(ww, wh) * 0.6)){ placed = true; break; }
    }
    if (!placed) continue;
    list.push(new Obstacle('wall', x, y, { w: rand(60, 130), h: rand(22, 34) }));
  }

  // trees — main scenery
  const treeCount = Math.max(6, Math.floor((w * h) / 130000));
  for (let i = 0; i < treeCount; i++){
    let tries = 30, x, y, placed = false;
    while (tries-- > 0){
      x = rand(60, w - 60);
      y = rand(60, h - 60);
      if (!tooClose(x, y, 60)){ placed = true; break; }
    }
    if (!placed) continue;
    const canopyR = rand(26, 42);
    list.push(new Obstacle('tree', x, y, {
      cr: 10,               // trunk collider radius
      canopyR,
    }));
  }

  // rocks — scattered
  const rockCount = Math.max(4, Math.floor((w * h) / 220000));
  for (let i = 0; i < rockCount; i++){
    let tries = 30, x, y, placed = false;
    while (tries-- > 0){
      x = rand(40, w - 40);
      y = rand(40, h - 40);
      if (!tooClose(x, y, 40)){ placed = true; break; }
    }
    if (!placed) continue;
    const r = rand(14, 24);
    list.push(new Obstacle('rock', x, y, { r, cr: r * 0.85 }));
  }

  return list;
}

// ---------- collision resolution ----------
export function resolveCircleVsObstacles(cx, cy, cr, obstacles){
  let x = cx, y = cy;
  for (const o of obstacles){
    if (o.type === 'wall'){
      const left = o.x - o.w/2, right = o.x + o.w/2;
      const top  = o.y - o.h/2, bot   = o.y + o.h/2;
      // find closest point on rect to circle center
      const nx = Math.max(left, Math.min(x, right));
      const ny = Math.max(top,  Math.min(y, bot));
      const dx = x - nx, dy = y - ny;
      const d2 = dx*dx + dy*dy;
      if (d2 < cr * cr){
        const d = Math.sqrt(d2) || 0.0001;
        const push = cr - d;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    } else {
      const dx = x - o.x, dy = y - o.y;
      const d2 = dx*dx + dy*dy;
      const minD = cr + o.cr;
      if (d2 < minD * minD){
        const d = Math.sqrt(d2) || 0.0001;
        const push = minD - d;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
  }
  return { x, y };
}

export function pointInObstacle(x, y, obstacles){
  for (const o of obstacles){
    if (o.type === 'wall'){
      const left = o.x - o.w/2, right = o.x + o.w/2;
      const top  = o.y - o.h/2, bot   = o.y + o.h/2;
      if (x >= left && x <= right && y >= top && y <= bot) return o;
    } else {
      if (Math.hypot(x - o.x, y - o.y) < o.cr) return o;
    }
  }
  return null;
}

export function chooseSpawnEdge(bounds, obstacles, minDistFromPlayer = 220, px = 0, py = 0){
  for (let tries = 0; tries < 30; tries++){
    const edge = randInt(0, 3);
    let x, y;
    if (edge === 0){ x = rand(0, bounds.w); y = -30; }
    else if (edge === 1){ x = bounds.w + 30; y = rand(0, bounds.h); }
    else if (edge === 2){ x = rand(0, bounds.w); y = bounds.h + 30; }
    else { x = -30; y = rand(0, bounds.h); }
    // check player distance
    if (Math.hypot(x - px, y - py) < minDistFromPlayer) continue;
    return { x, y };
  }
  return { x: -30, y: -30 };
}
