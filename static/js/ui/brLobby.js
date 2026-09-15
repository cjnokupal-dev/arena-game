export function showBRLobby(root, onStart) {
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'overlay brlobby';
  el.innerHTML = `
    <div class="panel">
      <div class="logo small">Battle Royale</div>
      <div class="count" id="cnt">0</div>
      <div class="sub">Combatants Ready</div>
      <div class="progress"><div class="bar" id="bar"></div></div>
      <div class="countdown" id="cd"></div>
    </div>
  `;
  root.appendChild(el);

  const cnt = el.querySelector('#cnt');
  const bar = el.querySelector('#bar');
  const cd = el.querySelector('#cd');

  const dur = 5000;
  const t0 = performance.now();
  let started = false;

  function fill() {
    if (started) return;
    const t = Math.min(1, (performance.now() - t0) / dur);
    const v = Math.floor(t * 100);
    cnt.textContent = String(v);
    bar.style.width = (t * 100) + '%';
    if (t < 1) requestAnimationFrame(fill);
    else countdown();
  }

  function countdown() {
    started = true;
    let n = 3;
    cd.textContent = String(n);
    const iv = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(iv);
        cd.textContent = 'GO';
        setTimeout(() => onStart(), 450);
      } else {
        cd.textContent = String(n);
      }
    }, 800);
  }

  requestAnimationFrame(fill);
}
