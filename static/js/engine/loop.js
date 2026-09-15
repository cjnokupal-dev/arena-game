export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.last = 0;
    this.running = false;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() { this.running = false; }

  _frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    this.update(dt);
    this.render(dt);
    requestAnimationFrame(this._frame);
  }
}
