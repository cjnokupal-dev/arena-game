// language: JavaScript, file: static/js/main.js
// *Arena v6 — roles · abilities · OP guns · boss+ · coin store*

import { setupCanvas } from './engine/canvas.js';
import { setupInput }  from './engine/input.js';
import { createLoop }  from './engine/loop.js';
import { Joystick }    from './engine/joystick.js';
import { Camera }      from './engine/camera.js';
import { SpatialGrid } from './engine/spatial.js';
import { generateWorld, generateBiomes, resolveCircleVsObstacles, WORLD_W, WORLD_H } from './engine/world.js';
import { bakeEnemySprites, bakePlayerSprite, bakeCoinSprite, bakeGunSprite } from './engine/sprites.js';
import { shake, updateShake, getShake, resetShake, stopTime, consumeHitStop, ParticleSystem } from './engine/fx.js';

import { Player } from './entities/player.js';
import { Enemy, TYPES } from './entities/enemy.js';
import { Bullet } from './entities/bullet.js';
import { Coin } from './entities/coin.js';
import { Boss } from './entities/boss.js';
import { GunPickup } from './entities/gunPickup.js';

import { bindSafe } from './ui/_fix.js';
import { Hud }  from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Lobby } from './ui/lobby.js';
import { WavePopup } from './ui/wavePopup.js';

import { load, save } from './utils/storage.js';
import { GUNS, rollGun, gunById } from './data/guns.js';
import { ABILITIES, abilityById } from './data/abilities.js';
import { rollRole, roleById, RARITY_COLOR } from './data/roles.js';
import { rand, clamp, segCircleHit, angle, TAU } from './utils/math.js';

const canvasEl = document.getElementById('game');
const view = setupCanvas(canvasEl);
const input = setupInput(canvasEl);
const hud = new Hud();
const menu = new Menu();
const lobby = new Lobby();
const wavePopup = new WavePopup();

const enemySprites = bakeEnemySprites(TYPES);
const playerSprite = bakePlayerSprite(14);
const coinSprite = bakeCoinSprite(7);
const gunSprites = {};
for (const g of GUNS) gunSprites[g.id] = bakeGunSprite(g);

const obstacles = generateWorld();
const biomes = generateBiomes();
const world = { w: WORLD_W, h: WORLD_H };
const grid = new SpatialGrid(world, 120);
for (const o of obstacles) grid.insertObstacle(o);

const camera = new Camera(view);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let stickL = null, stickR = null;
if (isTouch){
  stickL = new Joystick(canvasEl, 'left',  { radius: 74, knobR: 32 });
  stickR = new Joystick(canvasEl, 'right', { radius: 74, knobR: 32, fireThreshold: 0.3 });
  window.addEventListener('resize', () => { stickL.layout(); stickR.layout(); });
}

const fx = new ParticleSystem();
let profile = load();

const state = {
  mode: 'menu',
  sessionCoins: 0,
  player: null,
  bullets: [],
  coins: [],
  gunDrops: [],
  turrets: [],
  ghosts: [],
  score: 0, wave: 1, waveTimer: 0, waveDuration: 25,
  spawnTimer: 0, spawnInterval: 0.9,
  enemiesToSpawn: 0,
  enemies: [],
  boss: null,
  run: {
    dmg:0, rate:0, hp:0, spd:0, pierce:0, multi:0, size:0, crit:0, regen:0, coin:0, knock:0,
    gunLevels: {}, extraPellets: 0,
    op: { explode:0, homing:0, chain:0, vamp:0, freeze:0, storm:0, inferno:0, colossus:0, godspeed:0, ruin:0, ascend:0 },
    coinMulBonus: 1,
  },
  reviveUsed: false,
};

const bulletPool = {
  items: [],
  alloc(){ for (const b of this.items) if (b.dead) return b; const b = new Bullet(); this.items.push(b); return b; },
};
function compactBullets(){ if (bulletPool.items.length > 600) bulletPool.items = bulletPool.items.filter(b => !b.dead); }
function killAllBullets(){ for (const b of bulletPool.items){ b.dead = true; b.hostile = false; b.hitObstacle = false; } }

function computeStats(){
  const m = profile.meta, s = profile.store, r = state.run, o = r.op;
  const role = profile.currentRole ? roleById(profile.currentRole) : null;
  const rp = role ? role.passive : {};
  return {
    damage: (1 + m.damage * 0.05) * (1 + r.dmg * 0.25)
      * (1 + (s.damage_boost || 0) * 0.05)
      * (rp.damage || 1)
      * (1 + o.ascend * 0.5)
      * (state.player && state.player.berserkTimer > 0 ? 1.3 : 1),
    fireRateMul: (1 + m.fireRate * 0.04) * (1 + r.rate * 0.2)
      * (rp.fireRateMul || 1)
      * (1 + o.inferno)
      * (1 + o.ascend * 0.5),
    maxHp: (100 + m.maxHp * 10 + r.hp * 30 + (s.hp_boost || 0) * 25 + o.colossus * 75 + o.ascend * 50)
      * (rp.maxHpMul || 1),
    speed: 260 * (1 + m.speed * 0.03) * (1 + r.spd * 0.15)
      * (1 + (s.speed_boost || 0) * 0.04)
      * (rp.speed || 1)
      * (1 + o.godspeed * 0.4),
    pierce: r.pierce + (s.pierce_boost || 0) + (o.ruin > 0 ? 999 : 0),
    bulletSize: 1 + r.size * 0.4 + o.ascend * 0.2,
    crit: r.crit * 0.12 + (s.crit_boost || 0) * 0.04 + (rp.crit || 0) + o.ascend * 0.1,
    regen: m.regen * 0.5 + r.regen * 1.0 + (rp.regen || 0),
    coinMul: (1 + r.coin * 0.3) * (rp.coinMul || 1) * r.coinMulBonus,
    knock: r.knock * 220,
    spreadBonus: 0,
    extraPellets: (rp.extraPellets || 0) + (o.storm || 0),
    dodge: rp.dodge || 0,
    damageReduction: rp.damageReduction || 0,
    gunLevel: 1,
    maxSlots: 3 + (s.extra_slot || 0),
  };
}
function gunLevelOf(gunId){ return state.run.gunLevels[gunId] || 1; }

function startRun(){
  if (state.mode === 'gameover'){ /* clean slate */ }
  state.mode = 'playing';
  state.score = 0;
  state.wave = 1;
  state.waveTimer = 0;
  state.spawnTimer = 0;
  state.spawnInterval = 0.9;
  state.sessionCoins = 0;
  state.reviveUsed = false;
  state.run = {
    dmg:0, rate:0, hp:0, spd:0, pierce:0, multi:0, size:0, crit:0, regen:0, coin:0, knock:0,
    gunLevels: {}, extraPellets: 0,
    op: { explode:0, homing:0, chain:0, vamp:0, freeze:0, storm:0, inferno:0, colossus:0, godspeed:0, ruin:0, ascend:0 },
    coinMulBonus: 1,
  };
  const role = profile.currentRole ? roleById(profile.currentRole) : null;
  let startGun = gunById('pistol');
  if (profile.store.start_rifle && !role) startGun = gunById('rifle');
  if (profile.store.start_shotgun && !role) startGun = gunById('shotgun');
  if (role && role.startGun) startGun = gunById(role.startGun);
  state.player = new Player(WORLD_W / 2, WORLD_H / 2, playerSprite, startGun);
  state.player.role = role;
  state.player.firstHitImmune = role && role.passive.firstHitImmune > 0;
  const startAbilities = [];
  const unlockPool = ['dash','shield','bomb','heal'];
  for (let i = 0; i < 2; i++){
    const id = unlockPool[Math.floor(Math.random() * unlockPool.length)];
    if (!startAbilities.find(a => a.id === id)) startAbilities.push(abilityById(id));
  }
  while (startAbilities.length < 2) startAbilities.push(abilityById('dash'));
  state.player.abilities = startAbilities.map(a => ({ id: a.id, icon: a.icon, cdMax: a.cd, remaining: 0 }));
  const stats = computeStats();
  state.player.hp = stats.maxHp; state.player.maxHp = stats.maxHp;
  state.enemies = []; state.coins = []; state.gunDrops = []; state.turrets = []; state.ghosts = [];
  state.boss = null;
  killAllBullets();
  fx.pool.forEach(p => p.alive = false);
  resetShake();
  camera.follow(state.player, world, 1, true);
  menu.hide(); lobby.hide(); wavePopup.hide();
  document.getElementById('gameover').classList.add('hidden');
  hud.show(); hud.showGun();
  hud.hideBoss();
  hud.renderAbilities(state.player.abilities);
  beginWave(1);
}

function beginWave(n){
  state.wave = n;
  state.waveTimer = 0;
  if (state.player && profile.currentRole){
    const role = roleById(profile.currentRole);
    state.player.firstHitImmune = role && role.passive.firstHitImmune > 0;
  }
  const isBoss = (n % 5 === 0);
  if (isBoss){
    state.enemiesToSpawn = Math.floor(4 + n * 0.8);
    const spawnR = 600;
    const a = Math.random() * Math.PI * 2;
    const bx = clamp(state.player.x + Math.cos(a) * spawnR, 100, WORLD_W - 100);
    const by = clamp(state.player.y + Math.sin(a) * spawnR, 100, WORLD_H - 100);
    state.boss = new Boss(bx, by, n, bulletPool);
    state.boss._spawnMinion = (mx, my) => {
      const typeIdx = Math.random();
      const key = (typeIdx > 0.9) ? 'tank' : (typeIdx > 0.6 ? 'runner' : 'walker');
      state.enemies.push(new Enemy(mx, my, n, enemySprites[key]));
    };
    hud.showBoss(state.boss);
    fx.burst(bx, by, '#ff5c68', 40, { speed: 320 });
    shake(10, 0.6);
  } else {
    state.enemiesToSpawn = Math.floor(4 + n * 1.8);
  }
  state.spawnInterval = Math.max(0.35, 0.9 - n * 0.03);
  const dropN = 2 + Math.floor(n / 3) + (n >= 10 ? 2 : 0);
  for (let i = 0; i < dropN; i++){
    const a = Math.random() * Math.PI * 2;
    const d = 200 + Math.random() * 400;
    const gx = clamp(state.player.x + Math.cos(a) * d, 100, WORLD_W - 100);
    const gy = clamp(state.player.y + Math.sin(a) * d, 100, WORLD_H - 100);
    state.gunDrops.push(new GunPickup(gx, gy, rollGun(Math.random, n)));
  }
}

function endWave(){
  state.mode = 'waveclear';
  shake(6, 0.4);
  wavePopup.show(
    profile, state.wave,
    state.player.gun, gunLevelOf(state.player.gun.id),
    state.player.abilities.map(a => ({ id: a.id, icon: a.icon })),
    !!profile.store.extra_slot,
    (upgrade) => {
      applyUpgrade(upgrade);
      state.mode = 'playing';
      beginWave(state.wave + 1);
    });
}

function applyUpgrade(u){
  const p = state.player;
  if (u.tab === 'stat'){
    state.run[u.id] = (state.run[u.id] || 0) + 1;
    if (u.id === 'hp'){
      const stats = computeStats();
      p.maxHp = stats.maxHp;
      p.hp = Math.min(stats.maxHp, p.hp + 30);
    }
  } else if (u.tab === 'gun'){
    const id = p.gun.id;
    state.run.gunLevels[id] = (state.run.gunLevels[id] || 1) + 1;
    fx.burst(p.x, p.y, p.gun.color, 30, { speed: 260 });
    shake(4, 0.2);
  } else if (u.tab === 'ability'){
    const stats = computeStats();
    if (p.abilities.length < stats.maxSlots && !p.abilities.find(a => a.id === u.ability.id)){
      p.abilities.push({ id: u.ability.id, icon: u.ability.icon, cdMax: u.ability.cd, remaining: 0 });
      hud.renderAbilities(p.abilities);
    }
  } else if (u.tab === 'op'){
    state.run.op[u.id] = (state.run.op[u.id] || 0) + 1;
    if (u.id === 'colossus'){
      const stats = computeStats();
      p.maxHp = stats.maxHp;
      p.hp = Math.min(stats.maxHp, p.hp + 75);
    }
    fx.burst(p.x, p.y, '#ff5c68', 60, { speed: 400 });
    shake(8, 0.4);
  }
}

function useAbility(idx){
  const p = state.player;
  const ab = p.abilities[idx];
  if (!ab || ab.remaining > 0) return;
  const data = abilityById(ab.id);
  if (!data) return;
  data.exec({ player: p, state, fx, world, shake });
  ab.remaining = ab.cdMax;
}
hud.setAbilityHandler(useAbility);

function gameOver(){
  if (!state.reviveUsed && (profile.store.revive_token || 0) > 0){
    state.reviveUsed = true;
    const stats = computeStats();
    state.player.hp = stats.maxHp;
    state.player.invuln = 3;
    fx.burst(state.player.x, state.player.y, '#ffd166', 80, { speed: 500 });
    shake(20, 0.7);
    return;
  }
  state.mode = 'gameover';
  hud.hide(); hud.hideBoss(); hud.hideGun();
  document.getElementById('ability-bar').classList.add('hidden');
  profile.coins += state.sessionCoins;
  if (state.wave > profile.bestWave) profile.bestWave = state.wave;
  if (state.score > profile.bestScore) profile.bestScore = state.score;
  save(profile);
  document.getElementById('go-wave').textContent = state.wave;
  document.getElementById('go-score').textContent = state.score;
  document.getElementById('go-coins').textContent = state.sessionCoins;
  document.getElementById('gameover').classList.remove('hidden');
  if (state.player){
    fx.burst(state.player.x, state.player.y, '#58a6ff', 40, { speed: 320 });
    shake(14, 0.5);
  }
}

menu.onPlay(() => startRun());

bindSafe('btn-retry', () => {
  document.getElementById('gameover').classList.add('hidden');
  startRun();
});
bindSafe('btn-go-lobby', () => {
  document.getElementById('gameover').classList.add('hidden');
  refreshMenu();
  menu.show();
});
bindSafe('btn-reroll', () => wavePopup.reroll());


bindSafe('btn-retry', () => {
  document.getElementById('gameover').classList.add('hidden');
  startRun();
});
bindSafe('btn-go-lobby', () => {
  document.getElementById('gameover').classList.add('hidden');
  refreshMenu();
  menu.show();
});
bindSafe('btn-reroll', () => wavePopup.reroll());

menu.onLobby(() => { menu.hide(); lobby.show(profile, (p) => save(p)); });
lobby.onBack(() => { lobby.hide(); refreshMenu(); menu.show(); });
lobby.onPlay(() => { lobby.hide(); startRun(); });




function refreshMenu(){
  menu.refresh(profile);
  const r = profile.currentRole ? roleById(profile.currentRole) : null;
  const el = document.getElementById('m-role');
  if (el){
    if (r){ el.textContent = r.rarity.toUpperCase() + ' · ' + r.name; el.style.color = RARITY_COLOR[r.rarity]; }
    else { el.textContent = 'No role'; el.style.color = ''; }
  }
}
refreshMenu();
menu.show();

function update(rawDt){
  updateShake(rawDt);
  fx.update(rawDt);
  if (stickL) stickL.update(rawDt);
  if (stickR) stickR.update(rawDt);

  if (state.mode !== 'playing' && state.mode !== 'waveclear'){
    if (stickL) stickL.render(view.ctx);
    if (stickR) stickR.render(view.ctx);
    return;
  }
  if (state.mode === 'waveclear'){
    if (stickL) stickL.render(view.ctx);
    if (stickR) stickR.render(view.ctx);
    return;
  }

  const dt = consumeHitStop(rawDt);
  if (dt <= 0){
    if (stickL) stickL.render(view.ctx);
    if (stickR) stickR.render(view.ctx);
    return;
  }

  if (stickL) input.setJoystickMove({ x: stickL.vx, y: stickL.vy, active: stickL.active });
  if (stickR) input.setJoystickAim({ x: stickR.vx, y: stickR.vy, active: stickR.active, fire: stickR.fire });
  input.update();

  const stats = computeStats();
  stats.gunLevel = gunLevelOf(state.player.gun.id);
  const p = state.player;

  let aimAt = null;
  if (!input.pointer.active && !(stickR && stickR.active)){
    let bd = Infinity, best = state.boss;
    if (best) bd = (best.x - p.x)**2 + (best.y - p.y)**2;
    for (const e of state.enemies){
      const d = (e.x - p.x)**2 + (e.y - p.y)**2;
      if (d < bd){ bd = d; best = e; }
    }
    if (best) aimAt = { x: best.x, y: best.y };
  }

  const pointerWasActive = input.pointer.active;
  if (pointerWasActive && !(stickR && stickR.active)){
    input.pointer.x += camera.x;
    input.pointer.y += camera.y;
  }
  p.update(dt, input, world, aimAt, obstacles, stats, bulletPool);
  if (pointerWasActive && !(stickR && stickR.active)){
    input.pointer.x -= camera.x;
    input.pointer.y -= camera.y;
  }

  camera.follow(p, world, dt);
  state.waveTimer += dt;

  const activeBullets = [];
  for (const b of bulletPool.items){
    if (b.dead) continue;
    const near = grid.query(b.x, b.y, 80);
    b.update(dt, world, near);
    activeBullets.push(b);
  }

  // turrets
  for (let i = state.turrets.length - 1; i >= 0; i--){
    const t = state.turrets[i];
    t.life -= dt;
    if (t.life <= 0){ state.turrets.splice(i, 1); continue; }
    t.fireTimer -= dt;
    if (t.fireTimer <= 0){
      let best = null, bd = t.range * t.range;
      for (const e of state.enemies){
        const d = (e.x - t.x)**2 + (e.y - t.y)**2;
        if (d < bd){ bd = d; best = e; }
      }
      if (best){
        const a = angle(t.x, t.y, best.x, best.y);
        const b = bulletPool.alloc();
        b.reset(t.x, t.y, Math.cos(a) * 700, Math.sin(a) * 700,
          { damage: 8 * stats.damage, size: 1.0, color: '#c8ddff' });
        t.fireTimer = 0.15;
      } else t.fireTimer = 0.3;
    }
  }

  // ghosts
  for (let i = state.ghosts.length - 1; i >= 0; i--){
    const g = state.ghosts[i];
    g.life -= dt;
    if (g.life <= 0){ state.ghosts.splice(i, 1); continue; }
    let best = null, bd = 400 * 400;
    for (const e of state.enemies){
      const d = (e.x - g.x)**2 + (e.y - g.y)**2;
      if (d < bd){ bd = d; best = e; }
    }
    if (best){
      const a = angle(g.x, g.y, best.x, best.y);
      g.x += Math.cos(a) * 200 * dt;
      g.y += Math.sin(a) * 200 * dt;
      if (Math.hypot(g.x - best.x, g.y - best.y) < 20){
        best.hurt(30);
        fx.burst(best.x, best.y, '#c8a2ff', 8, { speed: 200 });
        state.ghosts.splice(i, 1);
      }
    }
  }

  if (p.muzzleFlash > 0 && Math.random() < 0.4){
    const mx = p.x + Math.cos(p.aimAngle) * p.r;
    const my = p.y + Math.sin(p.aimAngle) * p.r;
    fx.spawn({ x: mx, y: my,
      vx: Math.cos(p.aimAngle) * rand(30,80) + rand(-20,20),
      vy: Math.sin(p.aimAngle) * rand(30,80) + rand(-20,20),
      life: 0.2, color: '#fff8c8', size: 2, drag: 6 });
  }

  for (const e of state.enemies){
    if (e.slowTimer > 0) e.slowTimer -= dt;
    const near = grid.query(e.x, e.y, e.r + 24);
    const origSpeed = e.speed;
    if (e.slowTimer > 0) e.speed = origSpeed * 0.3;
    e.update(dt, p, world, near);
    e.speed = origSpeed;
  }
  if (state.boss && !state.boss.dead){
    const near = grid.query(state.boss.x, state.boss.y, state.boss.r + 40);
    state.boss.update(dt, p, world, near);
  }

  for (const b of activeBullets){
    if (b.dead) continue;
    if (b.hostile){
      if (segCircleHit(b.prevX, b.prevY, b.x, b.y, p.x, p.y, b.r + p.r)){
        p.damage(b.damage);
        b.dead = true;
        fx.burst(b.x, b.y, '#ff5c68', 6, { speed: 220 });
      }
      continue;
    }
    let hitSomething = false;
    for (let i = state.enemies.length - 1; i >= 0; i--){
      const e = state.enemies[i];
      if (segCircleHit(b.prevX, b.prevY, b.x, b.y, e.x, e.y, b.r + e.r)){
        const killed = e.hurt(b.damage);
        if (b.slowOnHit) e.slowTimer = 2;
        if (state.run.op.vamp > 0) p.hp = Math.min(p.maxHp, p.hp + state.run.op.vamp);
        if (b.explodeR) explodeAt(b.x, b.y, b.explodeR, (b.explodeDmg||1.5) * b.damage, e);
        if (b.chainCount) chainLightning(b, e, b.chainCount);
        fx.burst(b.x, b.y, '#ffe28a', 4, { speed: 180 });
        if (killed){
          state.score += e.score;
          fx.burst(e.x, e.y, e.type.color, 12, { speed: 240 });
          shake(3.5, 0.12);
          stopTime(0.04);
          for (let k = 0; k < e.coins; k++){
            state.coins.push(new Coin(e.x + rand(-6,6), e.y + rand(-6,6),
              Math.max(1, Math.round((1 + state.wave * 0.15) * stats.coinMul))));
          }
          if (state.player.role && state.player.role.passive.necro && Math.random() < 0.5){
            state.ghosts.push({ x: e.x, y: e.y, life: 8 });
          }
          state.enemies.splice(i, 1);
        }
        if (b.pierce > 0) b.pierce--;
        else if (!b.pierceInf) b.dead = true;
        hitSomething = true;
        break;
      }
    }
    if (!b.dead && !hitSomething && state.boss && !state.boss.dead){
      const e = state.boss;
      if (segCircleHit(b.prevX, b.prevY, b.x, b.y, e.x, e.y, b.r + e.r)){
        e.hurt(b.damage);
        if (b.slowOnHit) e.slowTimer = 1;
        if (state.run.op.vamp > 0) p.hp = Math.min(p.maxHp, p.hp + state.run.op.vamp);
        if (b.explodeR) explodeAt(b.x, b.y, b.explodeR, (b.explodeDmg||1.5) * b.damage, null);
        fx.burst(b.x, b.y, '#ffe28a', 5, { speed: 220 });
        if (e.hp <= 0){
          state.score += e.score;
          for (let k = 0; k < e.coins; k++){
            state.coins.push(new Coin(e.x + rand(-30,30), e.y + rand(-30,30),
              Math.max(2, Math.round((3 + state.wave * 0.4) * stats.coinMul))));
          }
          fx.burst(e.x, e.y, '#ff5c68', 60, { speed: 420 });
          fx.burst(e.x, e.y, '#ff9d3f', 30, { speed: 300 });
          shake(18, 0.7);
          stopTime(0.15);
          hud.hideBoss();
          state.boss = null;
        }
        if (b.pierce > 0) b.pierce--;
        else if (!b.pierceInf) b.dead = true;
      }
    }
  }

  for (const b of bulletPool.items){
    if (b.dead && b.hitObstacle){
      b.hitObstacle = false;
      fx.burst(b.x, b.y, '#aebccf', 5, { speed: 140 });
    }
  }

  for (const c of state.coins) c.update(dt, p, 90);
  for (let i = state.coins.length - 1; i >= 0; i--){
    if (state.coins[i].dead){
      state.sessionCoins += state.coins[i].value;
      state.score += state.coins[i].value * 2;
      fx.burst(state.coins[i].x, state.coins[i].y, '#f2cc60', 3, { speed: 120 });
      state.coins.splice(i, 1);
    }
  }

  for (const gd of state.gunDrops) gd.update(dt);
  for (let i = state.gunDrops.length - 1; i >= 0; i--){
    const gd = state.gunDrops[i];
    const dx = gd.x - p.x, dy = gd.y - p.y;
    if (dx*dx + dy*dy < 34*34){
      if (p.gun.id !== gd.gun.id){
        state.gunDrops.push(new GunPickup(gd.x, gd.y, p.gun));
        p.equip(gd.gun);
        fx.burst(gd.x, gd.y, gd.gun.color, 8, { speed: 180 });
      }
      state.gunDrops.splice(i, 1);
    }
  }

  if (state.enemiesToSpawn > 0){
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0){
      const a = Math.random() * Math.PI * 2;
      const dist0 = 500 + rand(-80, 120);
      let sx = clamp(p.x + Math.cos(a) * dist0, 30, world.w - 30);
      let sy = clamp(p.y + Math.sin(a) * dist0, 30, world.h - 30);
      const near = grid.query(sx, sy, 40);
      const r = resolveCircleVsObstacles(sx, sy, 24, near);
      sx = r.x; sy = r.y;
      const typeIdx = Math.random();
      const spriteKey = (state.wave >= 5 && typeIdx > 0.85) ? 'tank'
                      : (state.wave >= 3 && typeIdx < 0.25) ? 'runner'
                      : 'walker';
      state.enemies.push(new Enemy(sx, sy, state.wave, enemySprites[spriteKey]));
      state.enemiesToSpawn--;
      state.spawnTimer = state.spawnInterval * rand(0.7, 1.3);
    }
  }

  const bossDead = !state.boss;
  if (state.waveTimer >= state.waveDuration && state.enemiesToSpawn === 0 &&
      state.enemies.length === 0 && bossDead){
    endWave();
  }
  if (p.dead) gameOver();

  hud.update(dt, {
    score: state.score, wave: state.wave,
    coins: profile.coins + state.sessionCoins,
    hp: p.hp, maxHp: p.maxHp,
    waveProgress: state.waveTimer / state.waveDuration,
    gun: p.gun, gunLvl: gunLevelOf(p.gun.id), ammo: p.ammo, reloading: p.reloading,
    boss: state.boss,
    abilities: p.abilities,
  });

  if (!input.pointer.active && (input.pointer.x || input.pointer.y)) input.pointer.active = true;
  compactBullets();
}

function explodeAt(x, y, r, dmg, exclude){
  for (const e of state.enemies){
    if (e === exclude) continue;
    if (Math.hypot(e.x - x, e.y - y) < r) e.hurt(dmg);
  }
  if (state.boss && Math.hypot(state.boss.x - x, state.boss.y - y) < r){
    state.boss.hurt(dmg);
  }
  fx.burst(x, y, '#ff9d3f', 20, { speed: 300 });
  fx.burst(x, y, '#ffd166', 10, { speed: 200 });
  shake(4, 0.15);
}

function chainLightning(bullet, origin, count){
  let cx = origin.x, cy = origin.y;
  const hitSet = new Set([origin]);
  for (let i = 0; i < count; i++){
    let nearest = null, nd = 200 * 200;
    for (const e of state.enemies){
      if (hitSet.has(e)) continue;
      const d = (e.x - cx)**2 + (e.y - cy)**2;
      if (d < nd){ nd = d; nearest = e; }
    }
    if (!nearest) break;
    nearest.hurt(bullet.damage * 0.6);
    hitSet.add(nearest);
    fx.burst(nearest.x, nearest.y, '#7ee787', 6, { speed: 180 });
    cx = nearest.x; cy = nearest.y;
  }
}

function render(){
  const { ctx, width: vw, height: vh } = view;
  const sh = getShake();
  const camX = camera.x - sh.x;
  const camY = camera.y - sh.y;

  ctx.save();
  ctx.translate(-camX, -camY);

  ctx.fillStyle = '#05070c';
  ctx.fillRect(camX, camY, vw, vh);

  for (const b of biomes){
    if (b.x + b.r < camX || b.x - b.r > camX + vw) continue;
    if (b.y + b.r < camY || b.y - b.r > camY + vh) continue;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, b.color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }

  ctx.strokeStyle = 'rgba(88,166,255,0.035)';
  ctx.lineWidth = 1;
  const g0 = 60;
  const gx0 = Math.floor(camX / g0) * g0;
  const gy0 = Math.floor(camY / g0) * g0;
  ctx.beginPath();
  for (let x = gx0; x < camX + vw + g0; x += g0){ ctx.moveTo(x, camY); ctx.lineTo(x, camY + vh); }
  for (let y = gy0; y < camY + vh + g0; y += g0){ ctx.moveTo(camX, y); ctx.lineTo(camX + vw, y); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(126,231,135,0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, world.w - 4, world.h - 4);
  ctx.strokeStyle = 'rgba(126,231,135,0.08)';
  ctx.lineWidth = 30;
  ctx.strokeRect(2, 2, world.w - 4, world.h - 4);

  if (state.mode !== 'menu' && state.mode !== 'lobby'){
    for (const o of obstacles){
      const s = o.sprite;
      const sx = o.x - s.ox;
      const sy = o.y - s.oy;
      if (sx + s.w < camX - 40 || sx > camX + vw + 40) continue;
      if (sy + s.h < camY - 40 || sy > camY + vh + 40) continue;
      ctx.drawImage(s.canvas, sx, sy);
    }
    if (state.player){
      for (const gd of state.gunDrops){
        if (gd.x < camX - 30 || gd.x > camX + vw + 30) continue;
        if (gd.y < camY - 30 || gd.y > camY + vh + 30) continue;
        gd.render(ctx, gunSprites[gd.gun.id]);
      }
      for (const b of bulletPool.items){
        if (b.dead) continue;
        b.render(ctx, camX, camY, vw, vh);
      }
      for (const c of state.coins){
        if (c.x < camX - 30 || c.x > camX + vw + 30) continue;
        if (c.y < camY - 30 || c.y > camY + vh + 30) continue;
        c.render(ctx, coinSprite);
      }
      for (const t of state.turrets){
        ctx.fillStyle = '#c8ddff';
        ctx.beginPath(); ctx.arc(t.x, t.y, 12, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, TAU); ctx.stroke();
      }
      for (const g of state.ghosts){
        ctx.globalAlpha = Math.min(1, g.life / 2);
        ctx.fillStyle = '#c8a2ff';
        ctx.beginPath(); ctx.arc(g.x, g.y, 10, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (const e of state.enemies) e.render(ctx, camX, camY, vw, vh);
      if (state.boss && !state.boss.dead) state.boss.render(ctx, camX, camY, vw, vh);
      if (state.mode === 'playing') state.player.render(ctx);
    }
    fx.render(ctx, camX, camY, vw, vh);
  }

  ctx.restore();
  if (stickL) stickL.render(ctx);
  if (stickR) stickR.render(ctx);
}

const loop = createLoop(update, render);
loop.start();
window.addEventListener('resize', () => {
  camera.follow(state.player || { x: WORLD_W/2, y: WORLD_H/2 }, world, 1, true);
});

// ============ v6.2 emergency globals ============
// *inline onclick handlers from index.html call these. safe if any throws.*
window.__arenaPlay = function(){
  try {
    document.querySelectorAll('.overlay').forEach(el => el.classList.remove('show'));
    startRun();
  } catch(e){ alert('play: ' + e.message); }
};
window.__arenaOpenLobby = function(){
  try {
    document.querySelectorAll('.overlay').forEach(el => el.classList.remove('show'));
    lobby.show(profile, (p) => save(p));
    document.getElementById('lobby').classList.add('show');
  } catch(e){ alert('lobby open: ' + e.message); }
};
window.__arenaBackFromLobby = function(){
  try {
    document.getElementById('lobby').classList.remove('show');
    refreshMenu();
    document.getElementById('menu').classList.add('show');
  } catch(e){ alert('back: ' + e.message); }
};
window.__arenaPlayFromLobby = function(){
  try {
    document.getElementById('lobby').classList.remove('show');
    startRun();
  } catch(e){ alert('play: ' + e.message); }
};
window.__arenaRetry = function(){
  try {
    document.getElementById('gameover').classList.remove('show');
    startRun();
  } catch(e){ alert('retry: ' + e.message); }
};
window.__arenaLobby = function(){
  try {
    document.getElementById('gameover').classList.remove('show');
    refreshMenu();
    document.getElementById('menu').classList.add('show');
  } catch(e){ alert('lobby: ' + e.message); }
};
window.__arenaReroll = function(){
  try { wavePopup.reroll(); } catch(e){ alert('reroll: ' + e.message); }
};
// safety: hide non-menu overlays on first paint
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('show'));
  document.getElementById('menu').classList.add('show');
});
