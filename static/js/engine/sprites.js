function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(h, t) {
  const [r, g, b] = hexToRgb(h);
  return `rgb(${(r + (255 - r) * t) | 0},${(g + (255 - g) * t) | 0},${(b + (255 - b) * t) | 0})`;
}

function darken(h, t) {
  const [r, g, b] = hexToRgb(h);
  return `rgb(${(r * (1 - t)) | 0},${(g * (1 - t)) | 0},${(b * (1 - t)) | 0})`;
}

function bakeBall(size, color, outline = 'rgba(0,0,0,0.75)') {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.62, r * 0.62, 1, r, r, r * 0.98);
  grad.addColorStop(0, lighten(color, 0.55));
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, darken(color, 0.55));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = outline;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath();
  g.arc(r * 0.68, r * 0.62, Math.max(1.5, r * 0.13), 0, Math.PI * 2);
  g.fill();
  return c;
}

function bakeCoin(size = 22) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.7, r * 0.7, 1, r, r, r);
  grad.addColorStop(0, '#fff2b8');
  grad.addColorStop(0.5, '#f2cc60');
  grad.addColorStop(1, '#8a6d1e');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(r, r, r * 0.55, 0, Math.PI * 2);
  g.stroke();
  return c;
}

function bakeWall(size = 64) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#2a3142');
  grad.addColorStop(1, '#141a26');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, size - 3, size - 3);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, size * 0.5);
  g.lineTo(size, size * 0.5);
  g.moveTo(size * 0.5, 0);
  g.lineTo(size * 0.5, size);
  g.stroke();
  return c;
}

function bakeTree(size = 56) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.6, r * 0.6, 1, r, r, r);
  grad.addColorStop(0, '#5fd66f');
  grad.addColorStop(0.5, '#2f8c44');
  grad.addColorStop(1, '#0e2814');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.arc(r * 0.65, r * 0.6, r * 0.18, 0, Math.PI * 2);
  g.fill();
  return c;
}

function bakeRock(size = 48) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.6, r * 0.6, 1, r, r, r);
  grad.addColorStop(0, '#9aa3b8');
  grad.addColorStop(0.5, '#5b6478');
  grad.addColorStop(1, '#1b2130');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.lineWidth = 2;
  g.stroke();
  return c;
}

export function bakeSprites() {
  const s = {};
  s.player = bakeBall(40, '#7ee787');
  s.walker = bakeBall(34, '#ff5c68');
  s.runner = bakeBall(26, '#f2cc60');
  s.tank   = bakeBall(54, '#a06bff');
  s.bot    = bakeBall(36, '#58a6ff');
  s.boss   = bakeBall(120, '#ff5c68');
  s.coin   = bakeCoin(22);
  s.wall   = bakeWall(64);
  s.tree   = bakeTree(56);
  s.rock   = bakeRock(48);
  return s;
}
