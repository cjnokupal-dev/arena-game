import { clamp } from '../utils/math.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  follow(target, world, dt, vw, vh) {
    const maxX = Math.max(0, world.w - vw);
    const maxY = Math.max(0, world.h - vh);
    const tx = clamp(target.x - vw / 2, 0, maxX);
    const ty = clamp(target.y - vh / 2, 0, maxY);
    const t = 1 - Math.pow(0.0001, dt);
    this.x += (tx - this.x) * t;
    this.y += (ty - this.y) * t;
  }

  snap(target, world, vw, vh) {
    const maxX = Math.max(0, world.w - vw);
    const maxY = Math.max(0, world.h - vh);
    this.x = clamp(target.x - vw / 2, 0, maxX);
    this.y = clamp(target.y - vh / 2, 0, maxY);
  }
}
