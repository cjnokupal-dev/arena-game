export class Input {
  constructor(canvas, joystick) {
    this.keys = Object.create(null);
    this.joystick = joystick;
    this.mouse = { x: 0, y: 0, down: false, moved: false };

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.down = false; });

    canvas.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = true;
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  moveVector() {
    let mx = 0, my = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) my -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) my += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;

    const j = this.joystick.move;
    if (j.active && j.mag > this.joystick.deadzone) {
      mx = j.dx;
      my = j.dy;
    }

    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    return { x: mx, y: my, mag: Math.min(1, m) };
  }

  isFiring() {
    return !!(this.keys['Space'] || this.mouse.down || this.joystick.firing);
  }
}
