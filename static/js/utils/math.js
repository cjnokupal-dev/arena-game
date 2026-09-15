export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

export const lerp = (a, b, t) => a + (b - a) * t;

export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
};

export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

export const angle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

export const pick = arr => arr[(Math.random() * arr.length) | 0];

export function segCircleHit(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 0.0001) {
    return fx * fx + fy * fy <= r * r;
  }
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return true;
  if (t2 >= 0 && t2 <= 1) return true;
  return false;
}
