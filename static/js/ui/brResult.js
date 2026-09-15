export function showBRResult(root, result, handlers) {
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'overlay';
  const win = result.placement === 1;
  el.innerHTML = `
    <div class="panel">
      <div class="logo small ${win ? 'win' : 'lose'}">${win ? 'Victory' : 'Defeat'}</div>
      <div class="stats">
        <div><span>Placement</span><b>#${result.placement}</b></div>
        <div><span>Kills</span><b>${result.kills}</b></div>
        <div><span>Time</span><b>${result.time}s</b></div>
      </div>
      <div class="btns">
        <button class="btn primary" data-a="again">Play Again</button>
        <button class="btn ghost" data-a="menu">Menu</button>
      </div>
    </div>
  `;
  root.appendChild(el);

  el.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.a === 'again') handlers.onAgain();
    else if (btn.dataset.a === 'menu') handlers.onMenu();
  });
}
