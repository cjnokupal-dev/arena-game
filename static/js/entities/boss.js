import { angle, rand, TAU } from '../utils/math.js';
import { resolveCircleVsObstacles } from '../engine/world.js';

export class Boss {
  constructor(x, y, wave, bulletPool){
    this.type = 'boss';
    this.name = 'THE WARDEN';
    this.x = x; this.y = y;
    this.r = 58;
    this.maxHp = 700 + wave * 80;
    this.hp = this.maxHp;
    this.dead = false;
    this.hitFlash = 0;
    this.phase = 1;
    this.rot = 0;
    this.speed = 55;
    this.damage = 25;
    this.score = 500;
    this.coins = 20;
    this.bulletPool = bulletPool;
    this._spawnMinion = null;
    this.eyeAngle = 0;
    this.slowTimer = 0;
    this.abilityTimer = 2.0;
    this.abilityIdx = 0;
    this.laserSweepAngle = 0;
    this.laserActive = 0;
  }
  hurt(n){
    this.hp -= n;
    this.hitFlash = 0.12;
    if (this.hp <= 0){ this.hp = 0; this.dead = true; return true; }
    return false;
  }
  _checkPhase(){
    const pct = this.hp / this.maxHp;
    if (pct < 0.33 && this.phase < 3) this.phase = 3;
    else if (pct < 0.66 && this.phase < 2) this.phase = 2;
  }
  get abilityList(){
    if (this.phase === 1) return ['radial','aimed','laser'];
    if (this.phase === 2) return ['radial','aimed','summon','shockwave','laser'];
    return ['radial','aimed','summon','shockwave','laser','triple','teleport','minion_ring'];
  }
  update(dt, target, world, obstacles){
    this._checkPhase();
    this.rot += dt * (this.phase === 3 ? 1.6 : 1.0);
    this.eyeAngle = angle(this.x, this.y, target.x, target.y);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.slowTimer > 0){ dt *= 0.4; this.slowTimer -= dt; }

    const sp = this.speed * (this.phase === 3 ? 1.6 : this.phase === 2 ? 1.2 : 1);
    const a = angle(this.x, this.y, target.x, target.y);
    const nx = this.x + Math.cos(a) * sp * dt;
    const ny = this.y + Math.sin(a) * sp * dt;
    const r = resolveCircleVsObstacles(nx, ny, this.r * 0.7, obstacles);
    this.x = r.x; this.y = r.y;

    this.abilityTimer -= dt;
    if (this.abilityTimer <= 0){
      const list = this.abilityList;
      const move = list[this.abilityIdx % list.length];
      this.abilityIdx++;
      this._use(move, target);
      this.abilityTimer = this.phase === 3 ? 0.55 : this.phase === 2 ? 0.85 : 1.6;
    }

    if (this.laserActive > 0){
      this.laserActive -= dt;
      this.laserSweepAngle += dt * 1.3;
      for (let i = 0; i < 3; i++){
        const a2 = this.laserSweepAngle + i * (TAU / 3);
        const b = this.bulletPool.alloc();
        b.reset(this.x + Math.cos(a2) * (this.r + 4), this.y + Math.sin(a2) * (this.r + 4),
          Math.cos(a2) * 320, Math.sin(a2) * 320,
          { damage: 10, size: 1.0, color: '#ff9d3f' });
        b.hostile = true;
      }
    }

    const pdx = this.x - target.x, pdy = this.y - target.y;
    if (pdx*pdx + pdy*pdy < (this.r + target.r) * (this.r + target.r)){
      target.damage(this.damage);
    }
  }
  _use(move, target){
    const bp = this.bulletPool;
    if (move === 'radial'){
      const n = this.phase >= 3 ? 22 : this.phase >= 2 ? 18 : 14;
      for (let i = 0; i < n; i++){
        const a = (i / n) * TAU + this.rot * 0.5;
        const b = bp.alloc();
        b.reset(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r,
          Math.cos(a) * 240, Math.sin(a) * 240, { damage: 12, size: 1.2, color: '#ff5c68' });
        b.hostile = true;
      }
    } else if (move === 'aimed'){
      const a = angle(this.x, this.y, target.x, target.y);
      for (let i = -1; i <= 1; i++){
        const aa = a + i * 0.12;
        const b = bp.alloc();
        b.reset(this.x + Math.cos(aa) * this.r, this.y + Math.sin(aa) * this.r,
          Math.cos(aa) * 420, Math.sin(aa) * 420, { damage: 14, size: 1.3, color: '#ff9d3f' });
        b.hostile = true;
      }
    } else if (move === 'triple'){
      const a = angle(this.x, this.y, target.x, target.y);
      for (let i = 0; i < 6; i++){
        const aa = a + rand(-0.08, 0.08);
        const b = bp.alloc();
        b.reset(this.x + Math.cos(aa) * this.r, this.y + Math.sin(aa) * this.r,
          Math.cos(aa) * 520, Math.sin(aa) * 520, { damage: 16, size: 1.4, color: '#ff5c68' });
        b.hostile = true;
      }
    } else if (move === 'laser'){
      this.laserActive = this.phase >= 3 ? 2.0 : this.phase >= 2 ? 1.5 : 1.0;
      this.laserSweepAngle = Math.random() * TAU;
    } else if (move === 'shockwave'){
      const n = 36;
      for (let i = 0; i < n; i++){
        const a = (i / n) * TAU;
        const b = bp.alloc();
        b.reset(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r,
          Math.cos(a) * 180, Math.sin(a) * 180, { damage: 18, size: 1.5, color: '#a78bfa' });
        b.hostile = true;
      }
    } else if (move === 'summon' && this._spawnMinion){
      const n = this.phase === 3 ? 5 : 3;
      for (let i = 0; i < n; i++){
        const a2 = Math.random() * TAU;
        const d = this.r + 40;
        this._spawnMinion(this.x + Math.cos(a2) * d, this.y + Math.sin(a2) * d);
      }
    } else if (move === 'minion_ring' && this._spawnMinion){
      const n = 8;
      for (let i = 0; i < n; i++){
        const a2 = (i / n) * TAU;
        this._spawnMinion(this.x + Math.cos(a2) * (this.r + 60), this.y + Math.sin(a2) * (this.r + 60));
      }
    } else if (move === 'teleport'){
      const a2 = Math.random() * TAU;
      const d = 200 + Math.random() * 100;
      this.x = target.x + Math.cos(a2) * d;
      this.y = target.y + Math.sin(a2) * d;
      this.rot += 3;
      for (let i = 0; i < 12; i++){
        const aa = (i / 12) * TAU;
        const b = bp.alloc();
        b.reset(this.x, this.y,
          Math.cos(aa) * 260, Math.sin(aa) * 260,
          { damage: 14, size: 1.2, color: '#ffd166' });
        b.hostile = true;
      }
    }
  }
  render(ctx, camX, camY, vw, vh){
    if (this.x < camX - 200 || this.x > camX + vw + 200) return;
    if (this.y < camY - 200 || this.y > camY + vh + 200) return;
    const hurt = this.hitFlash > 0;
    const baseColor = hurt ? '#fff' : (this.phase === 3 ? '#ff3040' : '#8b2a2a');
    const accentColor = hurt ? '#fff' : (this.phase === 3 ? '#ff9d3f' : '#c84a4a');
    const g = ctx.createRadialGradient(this.x, this.y, this.r*0.5, this.x, this.y, this.r * 3);
    g.addColorStop(0, `rgba(255,60,80,${this.phase === 3 ? 0.55 : 0.28})`);
    g.addColorStop(1, 'rgba(255,60,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 3, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    for (let i = 0; i < 6; i++){
      ctx.save();
      ctx.rotate(i * (TAU / 6));
      ctx.fillStyle = 'rgba(40,10,15,0.9)';
      ctx.fillRect(this.r * 0.85, -6, this.r * 0.85, 12);
      ctx.fillStyle = hurt ? '#fff' : (this.phase === 3 ? '#ff9d3f' : '#a03030');
      ctx.fillRect(this.r * 0.9, -3, this.r * 0.7, 6);
      ctx.restore();
    }
    ctx.restore();
    const bg = ctx.createRadialGradient(
      this.x - this.r*0.3, this.y - this.r*0.3, this.r*0.15,
      this.x, this.y, this.r);
    bg.addColorStop(0, accentColor);
    bg.addColorStop(0.65, baseColor);
    bg.addColorStop(1, '#2a0508');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.stroke();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.rot * 1.4);
    ctx.strokeStyle = this.phase === 3 ? 'rgba(255,157,63,0.75)' : 'rgba(255,92,104,0.55)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++){
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.72, i * (TAU / 3) + 0.2, i * (TAU / 3) + 0.2 + 1.6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.eyeAngle);
    const eyeR = this.r * 0.34;
    const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, eyeR);
    eg.addColorStop(0, '#fff');
    eg.addColorStop(0.45, this.phase === 3 ? '#ff9d3f' : '#ff5c68');
    eg.addColorStop(1, 'rgba(60,0,10,0.9)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(0, 0, eyeR, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(eyeR * 0.35, 0, eyeR * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(-eyeR * 0.3, -eyeR * 0.35, eyeR * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.laserActive > 0){
      ctx.strokeStyle = `rgba(255,157,63,${0.5 + 0.4 * Math.sin(performance.now() * 0.02)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++){
        const a2 = this.laserSweepAngle + i * (TAU / 3);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(a2) * 900, this.y + Math.sin(a2) * 900);
        ctx.stroke();
      }
    }
  }
}
