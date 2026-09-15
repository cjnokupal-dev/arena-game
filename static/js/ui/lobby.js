import { META } from '../data/upgrades.js';
import { STORE } from '../data/store.js';
import { ROLES, RARITY_COLOR, rollRole } from '../data/roles.js';

const ROLL_COST = 200;

export class Lobby {
  constructor(){
    this.el = document.getElementById('lobby');
    this.grid = document.getElementById('lobby-grid');
    this.coins = document.getElementById('lobby-coins');
    this.btnBack = document.getElementById('btn-lobby-back');
    this.btnPlay = document.getElementById('btn-lobby-play');
    this.tabs = document.getElementById('lobby-tabs');
    this.roleSlot = document.getElementById('lobby-role-slot');
    this.activeTab = 'meta';
    this._profile = null;
    this._onChange = null;
    if (this.tabs){
      this.tabs.querySelectorAll('.ltab').forEach(t => {
        t.addEventListener('click', () => {
          this.activeTab = t.dataset.tab;
          this.tabs.querySelectorAll('.ltab').forEach(x => x.classList.toggle('active', x === t));
          this._renderTab();
        });
      });
    }
  }
  render(profile, onChange){
    this._profile = profile;
    this._onChange = onChange;
    this.coins.textContent = profile.coins;
    this._renderRoleSlot(profile);
    this._renderTab();
  }
  _renderRoleSlot(profile){
    if (!this.roleSlot) return;
    const r = profile.currentRole ? ROLES.find(x => x.id === profile.currentRole) : null;
    if (!r){
      this.roleSlot.innerHTML = '<div class="role-slot empty">No role — roll one below</div>';
    } else {
      const c = RARITY_COLOR[r.rarity];
      this.roleSlot.innerHTML = `
        <div class="role-slot" style="border-color:${c}">
          <div class="role-rarity" style="color:${c}">${r.rarity.toUpperCase()}</div>
          <div class="role-name" style="color:${c}">${r.name}</div>
          <div class="role-desc">${r.desc}</div>
        </div>`;
    }
  }
  _renderTab(){
    const profile = this._profile;
    const onChange = this._onChange;
    this.grid.innerHTML = '';
    if (this.activeTab === 'meta') this._renderMeta(profile, onChange);
    else if (this.activeTab === 'store') this._renderStore(profile, onChange);
    else if (this.activeTab === 'roles') this._renderRoles(profile, onChange);
  }
  _renderMeta(profile, onChange){
    for (const u of META){
      const lvl = profile.meta[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : u.cost(lvl);
      const canBuy = !maxed && profile.coins >= cost;
      const card = document.createElement('div');
      card.className = 'lobby-card';
      card.innerHTML = `
        <span class="icon">${u.icon}</span>
        <div class="name">${u.name}</div>
        <div class="desc">${u.desc}</div>
        <div class="lvl">LV ${lvl} / ${u.max}</div>
        <button ${(!canBuy) ? 'disabled' : ''}>${maxed ? 'Maxed' : 'Buy · ' + cost + '⛁'}</button>`;
      if (canBuy){
        card.querySelector('button').addEventListener('click', () => {
          profile.coins -= cost;
          profile.meta[u.id] = lvl + 1;
          onChange(profile);
          this.render(profile, onChange);
        });
      }
      this.grid.appendChild(card);
    }
  }
  _renderStore(profile, onChange){
    for (const s of STORE){
      const lvl = (profile.store && profile.store[s.id]) || 0;
      const maxed = lvl >= s.max;
      const canBuy = !maxed && profile.coins >= s.price;
      const card = document.createElement('div');
      card.className = 'lobby-card store';
      card.innerHTML = `
        <span class="icon">${s.icon}</span>
        <div class="name">${s.name}</div>
        <div class="desc">${s.desc}</div>
        <div class="lvl">OWNED ${lvl} / ${s.max}</div>
        <button ${(!canBuy) ? 'disabled' : ''}>${maxed ? 'Owned' : 'Buy · ' + s.price + '⛁'}</button>`;
      if (canBuy){
        card.querySelector('button').addEventListener('click', () => {
          profile.coins -= s.price;
          profile.store[s.id] = lvl + 1;
          onChange(profile);
          this.render(profile, onChange);
        });
      }
      this.grid.appendChild(card);
    }
  }
  _renderRoles(profile, onChange){
    const rollCard = document.createElement('div');
    rollCard.className = 'lobby-card roll';
    rollCard.innerHTML = `
      <span class="icon">♛</span>
      <div class="name">Roll Role</div>
      <div class="desc">Random class. 1% mythic, 4% legendary, 15% epic, 40% rare, 100 common weights.</div>
      <div class="lvl">CURRENT: ${profile.currentRole || 'none'}</div>
      <button ${profile.coins < ROLL_COST ? 'disabled' : ''}>Roll · ${ROLL_COST}⛁</button>`;
    if (profile.coins >= ROLL_COST){
      rollCard.querySelector('button').addEventListener('click', () => {
        profile.coins -= ROLL_COST;
        const r = rollRole();
        profile.currentRole = r.id;
        onChange(profile);
        const c = RARITY_COLOR[r.rarity];
        this.grid.style.boxShadow = `0 0 60px ${c}`;
        setTimeout(() => { this.grid.style.boxShadow = ''; }, 800);
        this.render(profile, onChange);
      });
    }
    this.grid.appendChild(rollCard);
    for (const r of ROLES){
      const c = RARITY_COLOR[r.rarity];
      const card = document.createElement('div');
      card.className = 'lobby-card role-card';
      card.style.borderColor = c;
      card.innerHTML = `
        <div class="role-rarity" style="color:${c}">${r.rarity.toUpperCase()}</div>
        <div class="name" style="color:${c}">${r.name}</div>
        <div class="desc">${r.desc}</div>
        <div class="role-skill">
          <b>${r.skill.icon} ${r.skill.name}</b>
          <span>${r.skill.desc} · ${r.skill.cd}s CD</span>
        </div>`;
      this.grid.appendChild(card);
    }
  }
  show(profile, onChange){
    this.el.classList.remove('hidden');
    this.render(profile, onChange);
  }
  hide(){ this.el.classList.add('hidden'); }
  onBack(fn){ this.btnBack.addEventListener('click', fn); }
  onPlay(fn){ this.btnPlay.addEventListener('click', fn); }
}
