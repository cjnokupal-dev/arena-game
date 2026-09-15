const MAX_PARTICLES = 320;

export class FX {
  constructor() {
    this.shake = 0;
    this.hitStop = 0;
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = {
        alive: false,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, r: 3, color: '#fff', type: 0,
      };
    }
    this._vig = null;
    this._scan = null;
    this._vigW = 0;
    this._vigH = 0;
  }

  spawn(x, y, vx, vy, life, r, color, type = 0) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        p.alive = true;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.life = life; p.maxLife = life;
        p.r = r; p.color = color; p.type = type;
        return;
      }
    }
  }

  burst(x, y, n, color, opts = {}) {
    const spd = opts.spd || 220;
    const life = opts.life || 0.55;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), 2 + Math.random() * 2, color, 0);
    }
  }

  shockwave(x, y, r, color) {
    this.spawn(x, y, 0, 0, 0.38, r, color, 1);
  }

  addShake(n) { this.shake = Math.min(22, this.shake + n); }
  addHitStop(t) { this.hitStop = Math.max(this.hitStop, t); }

  update(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      if (p.type === 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.93;
        p.vy *= 0.93;
      }
    }
  }

  render(ctx, cam) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      const alpha = p.life / p.maxLife;
      if (p.type === 0) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const t = 1 - alpha;
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x - cam.x, p.y - cam.y, p.r * t + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  _bakeOverlays(w, h) {
    if (this._vigW === w && this._vigH === h && this._vig) return;
    this._vigW = w; this._vigH = h;

    const v = document.createElement('canvas');
    v.width = w; v.height = h;
    const vg = v.getContext('2d');
    const rad = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, 'rgba(0,0,0,0.72)');
    vg.fillStyle = rad;
    vg.fillRect(0, 0, w, h);
    this._vig = v;

    const s = document.createElement('canvas');
    s.width = w; s.height = h;
    const sg = s.getContext('2d');
    sg.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < h; y += 4) sg.fillRect(0, y, w, 1);
    this._scan = s;
  }

  renderOverlays(ctx, w, h) {
    this._bakeOverlays(w, h);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this._vig, 0, 0, w, h);
    ctx.globalAlpha = 0.06;
    ctx.drawImage(this._scan, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  renderDamageFlash(ctx, w, h, intensity) {
    if (intensity <= 0) return;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,40,60,${intensity * 0.55})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
