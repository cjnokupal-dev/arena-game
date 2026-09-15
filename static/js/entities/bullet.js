export class Bullet {
  constructor() {
    this.dead = true;
    this.x = 0; this.y = 0;
    this.prevX = 0; this.prevY = 0;
    this.vx = 0; this.vy = 0;
    this.r = 3;
    this.life = 0;
    this.hostile = false;
    this.hitObstacle = false;
    this.damage = 0;
    this.pierce = 0;
    this.crit = false;
    this.knock = 0;
    this.color = '#7ee787';
  }

  reset(x, y, vx, vy, opts) {
    opts = opts || {};
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = vx;
    this.vy = vy;
    this.r = opts.r || 3;
    this.life = opts.life || 1.2;
    this.hostile = !!opts.hostile;
    this.hitObstacle = false;
    this.damage = opts.damage || 1;
    this.pierce = opts.pierce || 0;
    this.crit = !!opts.crit;
    this.knock = opts.knock || 0;
    this.color = opts.color || '#7ee787';
    this.dead = false;
  }

  update(dt, world) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = this.prevX + (this.x - this.prevX) * t;
      const sy = this.prevY + (this.y - this.prevY) * t;
      if (world.hitObstacle(sx, sy, this.r)) {
        this.hitObstacle = true;
        this.x = sx; this.y = sy;
        this.dead = true;
        return;
      }
    }

    if (this.x < -40 || this.y < -40 || this.x > world.w + 40 || this.y > world.h + 40) {
      this.dead = true;
    }
  }

  render(ctx, cam) {
    const x = this.x - cam.x;
    const y = this.y - cam.y;
    const px = this.prevX - cam.x;
    const py = this.prevY - cam.y;
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = this.r * 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x, y, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, this.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
