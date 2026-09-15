export class SafeCircle {
  constructor(world) {
    this.cx = world.w / 2;
    this.cy = world.h / 2;
    this.r = Math.hypot(world.w, world.h) / 2;
    this.targetR = this.r;
    this.startR = this.r;
    this.startCx = this.cx;
    this.startCy = this.cy;
    this.targetCx = this.cx;
    this.targetCy = this.cy;
    this.state = 'wait';
    this.timer = 12;
    this.shrinkDur = 40;
    this.phase = 0;
  }

  update(dt) {
    this.timer -= dt;
    if (this.state === 'wait') {
      if (this.timer <= 0) {
        this.state = 'shrink';
        this.timer = this.shrinkDur;
        this.startR = this.r;
        this.startCx = this.cx;
        this.startCy = this.cy;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.r * 0.45;
        this.targetCx = this.cx + Math.cos(a) * d;
        this.targetCy = this.cy + Math.sin(a) * d;
        this.targetR = Math.max(220, this.r * 0.6);
      }
    } else {
      const t = 1 - Math.max(0, this.timer) / this.shrinkDur;
      this.r = this.startR + (this.targetR - this.startR) * t;
      this.cx = this.startCx + (this.targetCx - this.startCx) * t;
      this.cy = this.startCy + (this.targetCy - this.startCy) * t;
      if (this.timer <= 0) {
        this.state = 'wait';
        this.timer = 12;
        this.phase++;
      }
    }
  }

  outside(x, y) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return dx * dx + dy * dy > this.r * this.r;
  }

  render(ctx, cam, vw, vh) {
    const x = this.cx - cam.x;
    const y = this.cy - cam.y;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vw, vh);
    ctx.arc(x, y, this.r, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(90,0,20,0.42)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#f2cc60';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(242,204,96,0.9)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(242,204,96,0.25)';
    ctx.lineWidth = 14;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
