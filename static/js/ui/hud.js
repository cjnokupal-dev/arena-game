export class Hud {
  constructor(){
    this.el = document.getElementById('hud');
    this.score = document.getElementById('hud-score');
    this.wave = document.getElementById('hud-wave');
    this.coins = document.getElementById('hud-coins');
    this.hpFill = document.getElementById('hp-fill');
    this.flash = document.getElementById('damage-flash');
    this.waveFill = document.getElementById('wave-fill');
    this.bossHud = document.getElementById('boss-hud');
    this.bossName = document.getElementById('boss-name');
    this.bossFill = document.getElementById('boss-fill');
    this.gunHud = document.getElementById('gun-hud');
    this.gunName = document.getElementById('gun-name');
    this.gunAmmo = document.getElementById('gun-ammo');
    this.gunMag = document.getElementById('gun-mag');
    this.gunReload = document.getElementById('gun-reload');
    this.gunLevel = document.getElementById('gun-level');
    this.abilityBar = document.getElementById('ability-bar');
    this._flashTimer = 0;
    this._lastHp = 100;
    this._onAbility = null;
  }
  show(){ this.el.classList.remove('hidden'); }
  hide(){ this.el.classList.add('hidden'); }
  showBoss(boss){ this.bossHud.classList.remove('hidden'); this.bossName.textContent = boss.name; }
  hideBoss(){ this.bossHud.classList.add('hidden'); }
  showGun(){ this.gunHud.classList.remove('hidden'); }
  hideGun(){ this.gunHud.classList.add('hidden'); }
  hit(){ this.flash.classList.add('hit'); this._flashTimer = 0.12; }
  setAbilityHandler(fn){ this._onAbility = fn; }
  renderAbilities(list){
    this.abilityBar.innerHTML = '';
    if (!list || !list.length){ this.abilityBar.classList.add('hidden'); return; }
    this.abilityBar.classList.remove('hidden');
    list.forEach((ab, idx) => {
      const btn = document.createElement('button');
      btn.className = 'ability-btn';
      btn.dataset.idx = idx;
      btn.innerHTML = `
        <div class="ab-icon">${ab.icon}</div>
        <div class="ab-cd-mask"></div>
        <div class="ab-cd-text"></div>`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this._onAbility) this._onAbility(idx);
      });
      this.abilityBar.appendChild(btn);
    });
  }
  tickAbilities(list){
    if (!list) return;
    for (let i = 0; i < this.abilityBar.children.length; i++){
      const ab = list[i];
      if (!ab) continue;
      const el = this.abilityBar.children[i];
      const mask = el.querySelector('.ab-cd-mask');
      const txt = el.querySelector('.ab-cd-text');
      const pct = ab.cdMax > 0 ? (ab.remaining / ab.cdMax) : 0;
      mask.style.height = (pct * 100) + '%';
      txt.textContent = ab.remaining > 0.1 ? Math.ceil(ab.remaining) : '';
      el.classList.toggle('ready', ab.remaining <= 0);
    }
  }
  update(dt, data){
    const { score, wave, coins, hp, maxHp, waveProgress, gun, gunLvl, ammo, reloading, boss, abilities } = data;
    this.score.textContent = score;
    this.wave.textContent = wave;
    if (coins !== undefined) this.coins.textContent = coins;
    const pct = Math.max(0, hp / maxHp) * 100;
    this.hpFill.style.width = pct + '%';
    this.hpFill.style.background =
      pct > 60 ? 'linear-gradient(90deg,#7ee787,#a5f3b1)' :
      pct > 30 ? 'linear-gradient(90deg,#f2cc60,#ffe28a)' :
                 'linear-gradient(90deg,#ff5c68,#ff8a95)';
    if (this.waveFill) this.waveFill.style.width = Math.min(100, (waveProgress||0) * 100) + '%';
    if (gun){
      this.gunName.textContent = gun.name;
      if (this.gunLevel) this.gunLevel.textContent = 'Lv ' + (gunLvl || 1);
      this.gunAmmo.textContent = ammo;
      this.gunMag.textContent = gun.magazine;
      this.gunReload.classList.toggle('hidden', !reloading);
    }
    if (boss) this.bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    if (this._flashTimer > 0){
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) this.flash.classList.remove('hit');
    }
    if (hp < this._lastHp - 0.5) this.hit();
    this._lastHp = hp;
    this.tickAbilities(abilities);
  }
}
