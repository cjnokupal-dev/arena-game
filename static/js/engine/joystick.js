export class Joystick {
  constructor(canvas) {
    this.move = { id: -1, active: false, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 };
    this.aim  = { id: -1, active: false, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 };
    this.deadzone = 0.18;
    this.radius = 70;
    this.firing = false;
    this.enabled = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    const opts = { passive: false };
    canvas.addEventListener('touchstart', e => this._down(e), opts);
    canvas.addEventListener('touchmove', e => this._move(e), opts);
    canvas.addEventListener('touchend', e => this._up(e), opts);
    canvas.addEventListener('touchcancel', e => this._up(e), opts);
  }

  _down(e) {
    e.preventDefault();
    const W = window.innerWidth;
    for (const t of e.changedTouches) {
      const stick = t.clientX < W / 2 ? this.move : this.aim;
      if (stick.id !== -1) continue;
      stick.id = t.identifier;
      stick.active = true;
      stick.ox = t.clientX;
      stick.oy = t.clientY;
      stick.x = t.clientX;
      stick.y = t.clientY;
      stick.dx = 0;
      stick.dy = 0;
      stick.mag = 0;
    }
    this._refreshFire();
  }

  _move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const stick of [this.move, this.aim]) {
        if (stick.id !== t.identifier) continue;
        stick.x = t.clientX;
        stick.y = t.clientY;
        const dx = stick.x - stick.ox;
        const dy = stick.y - stick.oy;
        const m = Math.hypot(dx, dy);
        const clamped = Math.min(m, this.radius);
        if (m > 0.001) {
          stick.dx = (dx / m) * (clamped / this.radius);
          stick.dy = (dy / m) * (clamped / this.radius);
        } else {
          stick.dx = 0; stick.dy = 0;
        }
        stick.mag = clamped / this.radius;
      }
    }
    this._refreshFire();
  }

  _up(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const stick of [this.move, this.aim]) {
        if (stick.id !== t.identifier) continue;
        stick.id = -1;
        stick.active = false;
        stick.dx = 0; stick.dy = 0;
        stick.mag = 0;
      }
    }
    this._refreshFire();
  }

  _refreshFire() {
    this.firing = this.aim.active && this.aim.mag > 0.30;
  }

  render(ctx) {
    if (!this.enabled) return;
    for (const s of [this.move, this.aim]) {
      if (!s.active) continue;
      const isMove = s === this.move;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = isMove ? '#7ee787' : '#ff5c68';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.ox, s.oy, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = isMove ? '#7ee787' : '#ff5c68';
      ctx.beginPath();
      ctx.arc(s.ox + s.dx * this.radius, s.oy + s.dy * this.radius, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
