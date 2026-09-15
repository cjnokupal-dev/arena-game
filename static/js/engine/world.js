import { SpatialGrid } from './spatial.js';
import { rand, randInt } from '../utils/math.js';

export class World {
  constructor() {
    this.w = 6000;
    this.h = 4000;
    this.obstacles = [];
    this.grid = new SpatialGrid(this.w, this.h, 120);
    this.biomes = [];
    this._queryBuf = [];
    this.generate();
  }

  generate() {
    this.obstacles.length = 0;

    for (let i = 0; i < 22; i++) {
      const horiz = Math.random() < 0.5;
      const long = 120 + Math.random() * 240;
      const short = 40 + Math.random() * 60;
      const o = {
        type: 'wall',
        x: rand(200, this.w - 200 - long),
        y: rand(200, this.h - 200 - short),
        w: horiz ? long : short,
        h: horiz ? short : long,
      };
      this.obstacles.push(o);
    }

    for (let i = 0; i < 90; i++) {
      this.obstacles.push({
        type: 'tree',
        x: rand(80, this.w - 80),
        y: rand(80, this.h - 80),
        r: 20 + Math.random() * 10,
      });
    }

    for (let i = 0; i < 60; i++) {
      this.obstacles.push({
        type: 'rock',
        x: rand(80, this.w - 80),
        y: rand(80, this.h - 80),
        r: 16 + Math.random() * 12,
      });
    }

    this.grid.clear();
    for (const o of this.obstacles) this.grid.insert(o);

    this.biomes.length = 0;
    for (let i = 0; i < 16; i++) {
      this.biomes.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        r: rand(500, 1200),
        color: `hsla(${randInt(80, 200)}, 32%, 11%, 0.55)`,
      });
    }
  }

  resolveCircleVsObstacles(e) {
    const nearby = this.grid.query(e.x, e.y, e.r + 40, this._queryBuf);
    for (let i = 0; i < nearby.length; i++) {
      const o = nearby[i];
      if (o.type === 'wall') {
        const cx = Math.max(o.x, Math.min(e.x, o.x + o.w));
        const cy = Math.max(o.y, Math.min(e.y, o.y + o.h));
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < e.r * e.r) {
          const d = Math.sqrt(d2) || 0.001;
          const push = e.r - d;
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        }
      } else {
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const rr = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001;
          const push = rr - d;
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        }
      }
    }
  }

  hitObstacle(x, y, r) {
    const nearby = this.grid.query(x, y, r + 40, this._queryBuf);
    for (let i = 0; i < nearby.length; i++) {
      const o = nearby[i];
      if (o.type === 'wall') {
        const cx = Math.max(o.x, Math.min(x, o.x + o.w));
        const cy = Math.max(o.y, Math.min(y, o.y + o.h));
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < r * r) return true;
      } else {
        const dx = x - o.x;
        const dy = y - o.y;
        const rr = r + o.r;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
    }
    return false;
  }

  render(ctx, cam, vw, vh) {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, vw, vh);

    for (let i = 0; i < this.biomes.length; i++) {
      const b = this.biomes[i];
      const bx = b.x - cam.x;
      const by = b.y - cam.y;
      if (bx < -b.r || bx > vw + b.r || by < -b.r || by > vh + b.r) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.lineWidth = 1;
    const gx = 200;
    const startX = Math.floor(cam.x / gx) * gx;
    ctx.beginPath();
    for (let x = startX; x < cam.x + vw + gx; x += gx) {
      const sx = x - cam.x;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, vh);
    }
    const gy = 200;
    const startY = Math.floor(cam.y / gy) * gy;
    for (let y = startY; y < cam.y + vh + gy; y += gy) {
      const sy = y - cam.y;
      ctx.moveTo(0, sy);
      ctx.lineTo(vw, sy);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(126,231,135,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-cam.x, -cam.y, this.w, this.h);
  }

  renderObstacles(ctx, cam, vw, vh, sprites) {
    const cx = cam.x + vw / 2;
    const cy = cam.y + vh / 2;
    const qr = Math.hypot(vw, vh) / 2 + 260;
    const list = this.grid.query(cx, cy, qr, this._queryBuf);
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (seen.has(o)) continue;
      seen.add(o);
      const sx = o.x - cam.x;
      const sy = o.y - cam.y;
      if (o.type === 'wall') {
        ctx.drawImage(sprites.wall, sx, sy, o.w, o.h);
      } else if (o.type === 'tree') {
        const r = o.r * 1.15;
        ctx.drawImage(sprites.tree, sx - r, sy - r, r * 2, r * 2);
      } else {
        const r = o.r * 1.1;
        ctx.drawImage(sprites.rock, sx - r, sy - r, r * 2, r * 2);
      }
    }
  }
}
