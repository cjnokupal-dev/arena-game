import { clamp, angle, TAU } from '../utils/math.js';
import { resolveCircleVsObstacles } from '../engine/world.js';

export class Player {
  constructor(x, y, sprite, startGun){
    this.sprite = sprite;
    this.x = x; this.y = y;
    this.r = 14;
    this.hp = 100; this.maxHp = 100;
    this.invuln = 0;
    this.dead = false;
    this.trail = [];
    this.trailMax = 10;
    this.ringRot = 0;
    this.muzzleFlash = 0;
    this.aimAngle = 0;
    this.fireTimer = 0;
    this.gun = startGun;
    this.ammo = startGun.magazine;
    this.reloading = false;
    this.reloadTimer = 0;
    this.abilities = [];
    this.shield = 0;
    this.shieldTimer = 0;
    this.ghostTimer = 0;
    this.berserkTimer = 0;
    this.overloadTimer = 0;
    this.role = null;
    this.firstHitImmune = false;
  }
  damage(n){
    if (this.invuln > 0) return false;
    if (this.role && this.role.passive.firstHitImmune && this.firstHitImmune){
      this.firstHitImmune = false;
      this.invuln = 0.6;
      return false;
    }
    if (this.shield > 0){ this.shield--; this.invuln = 0.4; return false; }
    if (this.role && this.role.passive.dodge && Math.random() < this.role.passive.dodge) return false;
    const reduce = this.role && this.role.passive.damageReduction || 0;
    n *= (1 - reduce);
    this.hp -= n;
    this.invuln = 0.5;
    if (this.hp <= 0){ this.hp = 0; this.dead = true; return true; }
    return false;
  }
  equip(gun){
    this.gun = gun;
    this.ammo = gun.magazine;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireTimer = Math.min(this.fireTimer, 0.1);
  }
  _startReload(){
    if (this.reloading) return;
    this.reloading = true;
    this.reloadTimer = this.gun.reloadTime;
  }
  update(dt, input, world, aimAt, obstacles, stats, bullets){
    const m = input.move;
    const nx = this.x + m.x * stats.speed * dt;
    const ny = this.y + m.y * stats.speed * dt;
    const r = resolveCircleVsObstacles(nx, ny, this.r, obstacles);
    this.trail.push(this.x, this.y);
    if (this.trail.length > this.trailMax * 2) this.trail.splice(0, 2);
    this.x = clamp(r.x, this.r, world.w - this.r);
    this.y = clamp(r.y, this.r, world.h - this.r);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.muzzleFlash > 0) this.muzzleFlash -= dt;
    if (this.shieldTimer > 0){ this.shieldTimer -= dt; if (this.shieldTimer <= 0) this.shield = 0; }
    if (this.ghostTimer > 0) this.ghostTimer -= dt;
    if (this.berserkTimer > 0) this.berserkTimer -= dt;
    if (this.overloadTimer > 0) this.overloadTimer -= dt;
    this.ringRot += dt * 1.8;
    if (stats.regen > 0 && this.hp < stats.maxHp){
      this.hp = Math.min(stats.maxHp, this.hp + stats.regen * dt);
    }
    for (const ab of this.abilities){
      if (ab.remaining > 0) ab.remaining = Math.max(0, ab.remaining - dt);
    }
    const jaim = input.joystickAim;
    if (jaim && jaim.active && (jaim.x || jaim.y)){
      this.aimAngle = Math.atan2(jaim.y, jaim.x);
    } else if (input.pointer.active){
      this.aimAngle = angle(this.x, this.y, input.pointer.x, input.pointer.y);
    } else if (aimAt){
      this.aimAngle = angle(this.x, this.y, aimAt.x, aimAt.y);
    }
    if (this.reloading){
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0){
        this.reloading = false;
        this.ammo = this.gun.magazine;
      }
      return;
    }
    this.fireTimer -= dt;
    const wantsFire = input.shooting || (jaim && jaim.fire);
    if (wantsFire && this.fireTimer <= 0 && this.ammo > 0){
      const g = this.gun;
      const level = stats.gunLevel || 1;
      const levelMul = {
        dmg: 1 + 0.15 * (level - 1),
        rate: 1 + 0.08 * (level - 1),
        pelletsBonus: Math.floor((level - 1) / 3),
        sizeMul: 1 + 0.05 * (level - 1),
        pierceBonus: Math.floor((level - 1) / 5),
      };
      const basePellets = g.pellets + (stats.extraPellets || 0) + levelMul.pelletsBonus;
      const baseSpread = g.spread + stats.spreadBonus;
      const fireRateMul = stats.fireRateMul
        * (this.berserkTimer > 0 ? 2.5 : 1)
        * levelMul.rate;
      for (let i = 0; i < basePellets; i++){
        const a = this.aimAngle + (Math.random() - 0.5) * baseSpread;
        const speed = g.bulletSpeed;
        const b = bullets.alloc();
        let dmg = g.damage * stats.damage * levelMul.dmg;
        if (this.overloadTimer > 0) dmg *= 3;
        if (Math.random() < stats.crit) dmg *= 2;
        b.reset(
          this.x + Math.cos(this.aimAngle) * this.r,
          this.y + Math.sin(this.aimAngle) * this.r,
          Math.cos(a) * speed, Math.sin(a) * speed,
          { damage: dmg, pierce: stats.pierce + levelMul.pierceBonus, size: g.size * stats.bulletSize * levelMul.sizeMul, color: g.color });
        if (g.explodeR) { b.explodeR = g.explodeR; b.explodeDmg = g.explodeDmg || 1.5; }
        if (g.homing) b.homing = g.homing;
        if (g.pierceInf) b.pierceInf = true;
        if (g.ricochet) b.ricochet = g.ricochet;
        if (g.slowOnHit) b.slowOnHit = g.slowOnHit;
        if (this.role){
          if (this.role.passive.chainLightning) b.chainCount = (b.chainCount||0) + this.role.passive.chainLightning;
          if (this.role.passive.slowOnHit) b.slowOnHit = Math.max(b.slowOnHit||0, this.role.passive.slowOnHit);
          if (this.role.passive.bulletPhase) b.pierceInf = true;
        }
        if (this.overloadTimer > 0){ b.explodeR = Math.max(b.explodeR||0, 60); b.explodeDmg = Math.max(b.explodeDmg||0, 1.5); }
      }
      this.fireTimer = g.fireInterval / fireRateMul;
      this.muzzleFlash = 0.05;
      this.ammo--;
      if (this.ammo <= 0) this._startReload();
    }
    if (!wantsFire && this.ammo === 0 && !this.reloading) this._startReload();
  }
  render(ctx){
    const blink = this.invuln > 0 && Math.floor(this.invuln * 25) % 2 === 0;
    if (this.trail.length >= 4){
      const col = this.role ? this.role.color : '#58a6ff';
      ctx.fillStyle = col + '22';
      for (let i = 0; i < this.trail.length; i += 2){
        const t = i / this.trail.length;
        const s = this.r * t * 0.8;
        ctx.fillRect(this.trail[i] - s, this.trail[i+1] - s, s * 2, s * 2);
      }
    }
    if (blink && !this.ghostTimer) return;
    if (this.ghostTimer > 0) ctx.globalAlpha = 0.35;
    const s = this.sprite;
    ctx.drawImage(s.canvas, this.x - s.cx, this.y - s.cy);
    if (this.role){
      ctx.strokeStyle = this.role.color + '88';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 9, 0, TAU); ctx.stroke();
    }
    if (this.shield > 0){
      ctx.strokeStyle = `rgba(88,166,255,${0.6 + 0.3 * Math.sin(performance.now() * 0.015)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 14, 0, TAU); ctx.stroke();
    }
    if (this.berserkTimer > 0){
      ctx.strokeStyle = `rgba(255,92,104,${0.5 + 0.4 * Math.sin(performance.now() * 0.025)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 6, 0, TAU); ctx.stroke();
    }
    if (this.overloadTimer > 0){
      ctx.fillStyle = 'rgba(255,209,102,0.15)';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 2.5, 0, TAU); ctx.fill();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + this.ringRot * 0.3);
    ctx.strokeStyle = 'rgba(126,231,135,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, this.r + 5, 0.3, 0.3 + Math.PI * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, this.r + 5, Math.PI + 0.3, Math.PI + 0.3 + Math.PI * 0.7); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle);
    ctx.fillStyle = this.gun.color;
    ctx.fillRect(this.r * 0.6, -2.5, this.r * (0.9 + this.gun.size * 0.3), 5);
    ctx.restore();
    if (this.muzzleFlash > 0){
      const mfx = this.x + Math.cos(this.aimAngle) * (this.r + 6);
      const mfy = this.y + Math.sin(this.aimAngle) * (this.r + 6);
      ctx.fillStyle = 'rgba(255,255,200,0.7)';
      ctx.beginPath(); ctx.arc(mfx, mfy, 14, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
