export class GunPickup {
  constructor(x, y, gun, noPickup = 0) {
    this.x = x;
    this.y = y;
    this.r = 14;
    this.gun = gun;
    this.t = Math.random() * Math.PI * 2;
    this.dead = false;
    this.swap = false;
    this.noPickupTimer = noPickup;
    this._glow = null;
  }

  _bakeGlow() {
    const size = 60;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, 30);
    grad.addColorStop(0, this.gun.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this._glow = c;
    return c;
  }

  update(dt, player) {
    this.t += dt * 3;
    if (this.noPickupTimer > 0) {
      this.noPickupTimer -= dt;
      return;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (dx * dx + dy * dy < 34 * 34) {
      this.dead = true;
      this.swap = true;
    }
  }

  render(ctx, cam) {
    const x = this.x - cam.x;
    const y = this.y - cam.y + Math.sin(this.t) * 3;

    const glow = this._glow || this._bakeGlow();
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glow, x - 30, y - 30);
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.gun.color;
    ctx.fillRect(x - 13, y - 3, 26, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 13, y - 3, 26, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x - 13, y - 3, 26, 2);
  }
}
