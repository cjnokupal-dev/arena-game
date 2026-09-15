export class Coin {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.r = 9;
    this.value = value || 1;
    this.life = 25;
    this.dead = false;
    this.collected = false;
    this.t = Math.random() * Math.PI * 2;
  }

  update(dt, player) {
    this.t += dt * 4;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;

    if (d < 90) {
      const pull = 340 * (1 - d / 90);
      this.x += (dx / d) * pull * dt;
      this.y += (dy / d) * pull * dt;
    }
    if (d < player.r + 6) {
      this.dead = true;
      this.collected = true;
    }
  }

  render(ctx, cam, sprites) {
    const x = this.x - cam.x;
    const y = this.y - cam.y + Math.sin(this.t) * 2;
    const alpha = this.life < 3 ? Math.max(0, this.life / 3) : 1;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprites.coin, x - this.r, y - this.r, this.r * 2, this.r * 2);
    ctx.globalAlpha = 1;
  }
}
