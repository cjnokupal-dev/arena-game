import { dist2 } from '../utils/math.js';

export class Bot {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = 14;
    this.hp = 100;
    this.maxHp = 100;
    this.speed = 130 + (Math.random() * 40 - 20);
    this.dead = false;
    this.state = 'wander';
    this.fireTimer = 1.2 + Math.random();
    this.aimAngle = Math.random() * Math.PI * 2;
    this.hitFlash = 0;
    this.strafeSign = Math.random() < 0.5 ? 1 : -1;
  }

  update(dt, player, world, circle, pool, fx) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const outside = circle.outside(this.x, this.y);

    if (outside) {
      const cx = circle.cx - this.x;
      const cy = circle.cy - this.y;
      const cd = Math.hypot(cx, cy) || 1;
      const sp = this.speed * 1.8;
      this.x += (cx / cd) * sp * dt;
      this.y += (cy / cd) * sp * dt;
      this.aimAngle = Math.atan2(cy, cx);
    } else if (d < 520 && !player.dead) {
      this.state = 'engage';
      const nx = dx / d;
      const ny = dy / d;
      const px = -ny;
      const py = nx;
      let mvx = px * this.strafeSign * 0.75 + nx * (d < 260 ? -0.5 : 0.32);
      let mvy = py * this.strafeSign * 0.75 + ny * (d < 260 ? -0.5 : 0.32);
      const m = Math.hypot(mvx, mvy) || 1;
      mvx /= m; mvy /= m;
      this.x += mvx * this.speed * dt;
      this.y += mvy * this.speed * dt;
      this.aimAngle = Math.atan2(dy, dx);

      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 0.55 + Math.random() * 0.45;
        const b = pool.spawn();
        if (b) {
          const a = this.aimAngle + (Math.random() - 0.5) * 0.14;
          const speed = 700;
          b.reset(
            this.x + Math.cos(a) * this.r,
            this.y + Math.sin(a) * this.r,
            Math.cos(a) * speed,
            Math.sin(a) * speed,
            { r: 3, life: 1.0, damage: 6, hostile: true, color: '#ff5c68' }
          );
        }
      }
    } else {
      this.state = 'wander';
      const cx = circle.cx - this.x;
      const cy = circle.cy - this.y;
      const cd = Math.hypot(cx, cy) || 1;
      const wx = (cx / cd) * 0.55 + (Math.random() - 0.5) * 0.6;
      const wy = (cy / cd) * 0.55 + (Math.random() - 0.5) * 0.6;
      this.x += wx * this.speed * 0.45 * dt;
      this.y += wy * this.speed * 0.45 * dt;
    }

    world.resolveCircleVsObstacles(this);
    this.x = Math.max(this.r, Math.min(world.w - this.r, this.x));
    this.y = Math.max(this.r, Math.min(world.h - this.r, this.y));

    if (outside) this.hp -= 2 * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.hp <= 0) this.dead = true;
  }

  damage(n) {
    this.hp -= n;
    this.hitFlash = 0.08;
    if (this.hp <= 0) this.dead = true;
  }

  render(ctx, cam, sprites) {
    const x = this.x - cam.x;
    const y = this.y - cam.y;
    ctx.drawImage(sprites.bot, x - this.r, y - this.r, this.r * 2, this.r * 2);
    if (this.hitFlash > 0) {
      ctx.globalAlpha = this.hitFlash / 0.08 * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.hp < this.maxHp) {
      const w = this.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x - this.r, y - this.r - 8, w, 3);
      ctx.fillStyle = '#58a6ff';
      ctx.fillRect(x - this.r, y - this.r - 8, w * (this.hp / this.maxHp), 3);
    }
  }
}
