export function setupCanvas(id) {
  const canvas = document.getElementById(id);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d', { alpha: false });

  const view = { w: 0, h: 0 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === view.w && h === view.h) return;
    view.w = w;
    view.h = h;
    canvas.width = Math.floor(view.w * dpr);
    canvas.height = Math.floor(view.h * dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  return { canvas, ctx, dpr, view, resize };
}
