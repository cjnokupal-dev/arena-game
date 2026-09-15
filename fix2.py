import os

# ─────────────────────────────────────────────
# 1. canvas.js — resize guard + desync off
# ─────────────────────────────────────────────
with open('static/js/engine/canvas.js', 'r') as f:
    c = f.read()

c = c.replace(
    "const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });",
    "const ctx = canvas.getContext('2d', { alpha: false });"
)

c = c.replace(
    """  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.floor(view.w * dpr);""",
    """  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === view.w && h === view.h) return;
    view.w = w;
    view.h = h;
    canvas.width = Math.floor(view.w * dpr);"""
)

with open('static/js/engine/canvas.js', 'w') as f:
    f.write(c)
print('ok canvas.js')

# ─────────────────────────────────────────────
# 2. gunPickup.js — cache the glow gradient
# ─────────────────────────────────────────────
GUN_PICKUP = '''export class GunPickup {
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
'''

with open('static/js/entities/gunPickup.js', 'w') as f:
    f.write(GUN_PICKUP)
print('ok gunPickup.js')

# ─────────────────────────────────────────────
# 3. hud.js — round positions + readable HP text
# ─────────────────────────────────────────────
with open('static/js/ui/hud.js', 'r') as f:
    h = f.read()

# HP text — make it always readable regardless of bar
h = h.replace(
    """  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillStyle = '#041a0c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.ceil(s.hp)} / ${Math.ceil(s.maxHp)}`, hpX + hpW / 2, hpY + 9);""",
    """  const hpText = `${Math.round(s.hp)} / ${Math.round(s.maxHp)}`;
  const hpTX = Math.round(hpX + hpW / 2);
  const hpTY = Math.round(hpY + 9);
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(hpText, hpTX, hpTY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(hpText, hpTX, hpTY);"""
)

# Ammo number — integer position + outline for reliability
h = h.replace(
    """    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.fillStyle = '#d0d8e8';
    ctx.textAlign = 'right';
    ctx.fillText(`${s.ammo} / ${s.gun.mag}`, gx + gw - 12, gy + 30);""",
    """    const ammoText = `${s.ammo} / ${s.gun.mag}`;
    const ammoX = Math.round(gx + gw - 12);
    const ammoY = Math.round(gy + 30);
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#d0d8e8';
    ctx.fillText(ammoText, ammoX, ammoY);"""
)

with open('static/js/ui/hud.js', 'w') as f:
    f.write(h)
print('ok hud.js')

# ─────────────────────────────────────────────
# 4. main.js — player invuln flicker gentler
# ─────────────────────────────────────────────
with open('static/js/entities/player.js', 'r') as f:
    p = f.read()

p = p.replace(
    "if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) {",
    "if (this.invuln > 0 && Math.floor(this.invuln * 10) % 2 === 0) {"
)

with open('static/js/entities/player.js', 'w') as f:
    f.write(p)
print('ok player.js')
