export class Enemy {
  constructor(type, x, y, wave) {
    this.type = type;
    this.x = x; this.y = y;
    this.dead = false;
    this.hitFlash = 0;
    this.damaged = false;
    this.color = type === 'walker' ? '#ff5c68' : type === 'runner' ? '#f2cc60' : '#a06bff';

    const scale = 1 + wave * 0.06;
    if (type === 'walker') {
      this.r = 17; this.hp = 3 * scale; this.speed = 70; this.dmg = 8; this.coins = 1;
    } else if (type === 'runner') {
      this.r = 13; this.hp = 2 * scale; this.speed = 135; this.dmg = 6; this.coins = 1;
    } else {
      this.r = 27; this.hp = 10 * scale; this.speed = 46; this.dmg = 16; this.coins = 3;
    }
    this.maxHp = this.hp;
    this.wobble = Math.random() * Math.PI * 2;
  }

  update(dt, player, world) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.wobble += dt * 4;

    const nx = dx / d;
    const ny = dy / d;
    const px = -ny;
    const py = nx;
    const wob = Math.sin(this.wobble) * 0.32;

    let sx = nx + px * wob;
    let sy = ny + py * wob;
    const sp = Math.hypot(sx, sy) || 1;
    sx /= sp; sy /= sp;

    this.x += sx * this.speed * dt;
    this.y += sy * this.speed * dt;

    world.resolveCircleVsObstacles(this);
    this.x = Math.max(this.r, Math.min(world.w - this.r, this.x));
    this.y = Math.max(this.r, Math.min(world.h - this.r, this.y));

    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  damage(n) {
    this.hp -= n;
    this.damaged = true;
    this.hitFlash = 0.09;
    if (this.hp <= 0) this.dead = true;
  }

  render(ctx, cam, sprites) {
    const x = this.x - cam.x;
    const y = this.y - cam.y;
    const spr = sprites[this.type];
    ctx.drawImage(spr, x - this.r, y - this.r, this.r * 2, this.r * 2);
    if (this.hitFlash > 0) {
      ctx.globalAlpha = this.hitFlash / 0.09 * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (this.damaged && this.hp < this.maxHp) {
      const w = this.r * 2;
      const bx = x - this.r;
      const by = y - this.r - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx, by, w, 3);
      ctx.fillStyle = '#ff5c68';
      ctx.fillRect(bx, by, w * (this.hp / this.maxHp), 3);
    }
  }
}
