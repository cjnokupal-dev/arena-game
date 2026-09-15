import { RUN_UPGRADES, OP_UPGRADES, pickWeighted } from '../data/upgrades.js';
import { ABILITIES } from '../data/abilities.js';

export class WavePopup {
  constructor(){
    this.el = document.getElementById('wave-popup');
    this.title = document.getElementById('wave-popup-title');
    this.cards = document.getElementById('upgrade-cards');
    this.btnReroll = document.getElementById('btn-reroll');
    this.rerollCount = document.getElementById('reroll-count');
    this.rerolls = 0;
    this._onPick = null;
  }
  _rollThree(ctx){
    const pool = [];
    for (const u of RUN_UPGRADES) pool.push({ ...u, tab:'stat', weight: u.weight });
    if (ctx.gun){
      pool.push({
        id:'gunup', tab:'gun',
        name:'Upgrade ' + ctx.gun.name,
        desc:'+15% dmg · +8% rate · +5% size (Lv ' + (ctx.gunLevel+1) + ')',
        icon:'⬆', weight:1.2,
      });
    }
    const currentIds = ctx.abilities.map(a => a.id);
    const maxSlots = 3 + (ctx.extraSlot ? 1 : 0);
    if (currentIds.length < maxSlots){
      for (const ab of ABILITIES){
        if (currentIds.includes(ab.id)) continue;
        pool.push({ id:'ab_'+ab.id, tab:'ability', ability: ab,
          name: ab.name, desc: ab.desc, icon: ab.icon, weight: 0.7 });
      }
    }
    if (ctx.wave >= 10){
      for (const u of OP_UPGRADES) pool.push({ ...u, tab:'op', weight: u.weight * 1.5 });
    }
    const out = [];
    const pool2 = pool.slice();
    while (out.length < 3 && pool2.length){
      const u = pickWeighted(pool2);
      out.push(u);
      const idx = pool2.indexOf(u);
      pool2.splice(idx, 1);
    }
    return out;
  }
  _paint(ctx){
    this.cards.innerHTML = '';
    for (const u of this._rollThree(ctx)){
      const el = document.createElement('div');
      el.className = 'ucard tab-' + u.tab;
      el.innerHTML = `
        <span class="icon">${u.icon || '●'}</span>
        <div class="name">${u.name}</div>
        <div class="desc">${u.desc}</div>
        <div class="tab-tag">${u.tab.toUpperCase()}</div>`;
      el.addEventListener('click', () => {
        this.hide();
        if (this._onPick) this._onPick(u);
      });
      this.cards.appendChild(el);
    }
  }
  render(profile, wave, gun, gunLevel, abilities, extraSlot, onPick){
    this._onPick = onPick;
    this._ctx = { wave, gun, gunLevel, abilities, extraSlot };
    this.rerolls = (profile.meta.luck || 0) + (profile.store.reroll_plus || 0);
    this.rerollCount.textContent = this.rerolls;
    this.btnReroll.disabled = this.rerolls <= 0;
    this._paint(this._ctx);
  }
  reroll(){
    if (this.rerolls <= 0) return;
    this.rerolls--;
    this.rerollCount.textContent = this.rerolls;
    this.btnReroll.disabled = this.rerolls <= 0;
    this._paint(this._ctx);
  }
  show(profile, wave, gun, gunLevel, abilities, extraSlot, onPick){
    this.title.textContent = 'Wave ' + wave + ' Cleared';
    this.render(profile, wave, gun, gunLevel, abilities, extraSlot, onPick);
    this.el.classList.remove('hidden');
  }
  hide(){ this.el.classList.add('hidden'); }
}
