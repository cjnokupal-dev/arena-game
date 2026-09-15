import os

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

    const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
    g.addColorStop(0, this.gun.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.fillRect(x - 30, y - 30, 60, 60);
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
print('wrote static/js/entities/gunPickup.js')

MAIN = 'static/js/main.js'
with open(MAIN, 'r') as f:
    src = f.read()

def swap(old, new, count=1, label=''):
    global src
    if old not in src:
        print(f'  X {label}: pattern not found')
        return
    src = src.replace(old, new, count)
    print(f'  ok {label}')

swap(
    "  if (input.mouse.moved && !joystick.enabled) {",
    "  if (input.mouse.moved) {",
    1, 'mouse-aim-gate'
)

swap(
    """    if (g.swap) {
      const old = p.gun;
      p.gun = g.gun;
      p.ammo = g.gun.mag;
      p.reloading = false;
      p.reloadTimer = 0;
      S.pickups.push(new GunPickup(g.x, g.y, old));
    }""",
    """    if (g.swap) {
      const old = p.gun;
      p.gun = g.gun;
      p.ammo = g.gun.mag;
      p.reloading = false;
      p.reloadTimer = 0;
      const dropA = Math.random() * Math.PI * 2;
      const dropX = p.x + Math.cos(dropA) * 55;
      const dropY = p.y + Math.sin(dropA) * 55;
      S.pickups.push(new GunPickup(dropX, dropY, old, 1.5));
    }""",
    2, 'gun-swap-offset'
)

swap(
    """    if (dist2(S.boss.x, S.boss.y, p.x, p.y) < rr * rr) {
      if (p.hurt(S.boss.dmg * dt * 2)) { fx.addShake(9); S.damageFlash = 1; }
    }
  }

  for (let i = 0; i < bullets.pool.length; i++) {""",
    """    if (dist2(S.boss.x, S.boss.y, p.x, p.y) < rr * rr) {
      if (p.hurt(12)) { fx.addShake(9); S.damageFlash = 1; }
    }
  }

  if (p.dead) { endSurvival(); return; }

  for (let i = 0; i < bullets.pool.length; i++) {""",
    1, 'boss-contact + death-guard'
)

swap(
    """      }
    }
  }

  S.bots = S.bots.filter(b => !b.dead);""",
    """      }
    }
  }

  if (p.dead) { endBR(false); return; }

  S.bots = S.bots.filter(b => !b.dead);""",
    1, 'br death-guard'
)

swap(
    """  if (S.mode === 'survival') updateSurvival(dt);
  else if (S.mode === 'br') updateBR(dt);
  else fx.update(dt);

  if (S.mode === 'wavepopup') fx.update(dt);""",
    """  if (S.mode === 'survival') updateSurvival(dt);
  else if (S.mode === 'br') updateBR(dt);
  else {
    fx.update(dt);
    S.damageFlash = Math.max(0, S.damageFlash - dt);
  }""",
    1, 'single-fx-update'
)

swap(
    """  bullets.clear();

  S.player = new Player(S.world.w / 2, S.world.h / 2, GUNS.pistol);
  const vitalLv = S.profile.meta.vital || 0;""",
    """  bullets.clear();
  S.damageFlash = 0;

  S.player = new Player(S.world.w / 2, S.world.h / 2, GUNS.pistol);
  const vitalLv = S.profile.meta.vital || 0;""",
    1, 'reset-flash-survival'
)

swap(
    """  S.message = '';
  S.messageT = 0;

  S.player = new Player(S.world.w / 2, S.world.h / 2, GUNS.pistol);
  S.player.maxHp = 100;""",
    """  S.message = '';
  S.messageT = 0;
  S.damageFlash = 0;

  S.player = new Player(S.world.w / 2, S.world.h / 2, GUNS.pistol);
  S.player.maxHp = 100;""",
    1, 'reset-flash-br'
)

with open(MAIN, 'w') as f:
    f.write(src)
print('wrote static/js/main.js')
