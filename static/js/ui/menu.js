export function showMenu(root, profile, handlers) {
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="panel">
      <div class="logo">ARENA</div>
      <div class="subtitle">Survive \u00B7 Adapt \u00B7 Dominate</div>
      <div class="stats">
        <div><span>Best Wave</span><b>${profile.bestWave}</b></div>
        <div><span>Coins</span><b>${profile.coins}</b></div>
        <div><span>Best Rank</span><b>#${profile.bestPlacement}</b></div>
      </div>
      <div class="btns">
        <button class="btn primary" data-a="survival">Survival</button>
        <button class="btn" data-a="br">Battle Royale</button>
        <button class="btn ghost" data-a="lobby">Upgrades</button>
      </div>
    </div>
  `;
  root.appendChild(el);

  el.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const a = btn.dataset.a;
    if (a === 'survival') handlers.onSurvival();
    else if (a === 'br') handlers.onBR();
    else if (a === 'lobby') handlers.onLobby();
  });

  return el;
}
