export const GUNS = [
  { id:'pistol',  name:'Pistol',  damage:1,   fireInterval:0.22,  bulletSpeed:620,  pellets:1, spread:0.03,  magazine:12, reloadTime:1.2, range:520,  color:'#c8ddff', rarity:1.0,  size:0.9 },
  { id:'smg',     name:'SMG',     damage:0.7, fireInterval:0.075, bulletSpeed:660,  pellets:1, spread:0.11,  magazine:30, reloadTime:1.6, range:440,  color:'#7ee787', rarity:0.85, size:0.85 },
  { id:'shotgun', name:'Shotgun', damage:1.2, fireInterval:0.75,  bulletSpeed:520,  pellets:6, spread:0.28,  magazine:6,  reloadTime:2.0, range:300,  color:'#f2cc60', rarity:0.7,  size:1.1 },
  { id:'rifle',   name:'Rifle',   damage:1.6, fireInterval:0.14,  bulletSpeed:780,  pellets:1, spread:0.025, magazine:24, reloadTime:1.5, range:640,  color:'#ff9d3f', rarity:0.6,  size:1.0 },
  { id:'sniper',  name:'Sniper',  damage:4.5, fireInterval:1.15,  bulletSpeed:1100, pellets:1, spread:0.005, magazine:5,  reloadTime:2.2, range:1200, color:'#a78bfa', rarity:0.35, size:1.2 },
  { id:'minigun', name:'Minigun', damage:0.55,fireInterval:0.045, bulletSpeed:700,  pellets:1, spread:0.16,  magazine:80, reloadTime:3.0, range:560,  color:'#ff5c68', rarity:0.2,  size:0.9 },
  { id:'ruin',    name:'RUIN',    damage:3.0, fireInterval:0.45,  bulletSpeed:560,  pellets:3, spread:0.12,  magazine:18, reloadTime:2.0, range:700,  color:'#ff3040', rarity:0.05, size:1.4, op:true, explodeR:80, explodeDmg:3 },
  { id:'eclipse', name:'ECLIPSE', damage:2.2, fireInterval:0.10,  bulletSpeed:900,  pellets:1, spread:0.02,  magazine:36, reloadTime:1.4, range:900,  color:'#a78bfa', rarity:0.05, size:1.1, op:true, pierceInf:true, homing:0.4 },
  { id:'chaos',   name:'CHAOS',   damage:2.5, fireInterval:0.09,  bulletSpeed:800,  pellets:1, spread:0.10,  magazine:45, reloadTime:1.6, range:800,  color:'#ffd166', rarity:0.03, size:1.2, op:true, ricochet:3, explodeR:40, explodeDmg:1.5 },
  { id:'frostbite',name:'FROSTBITE',damage:1.8,fireInterval:0.14, bulletSpeed:700,  pellets:1, spread:0.05,  magazine:28, reloadTime:1.5, range:700,  color:'#58a6ff', rarity:0.05, size:1.1, op:true, slowOnHit:0.7, freezeOnKill:1.5 },
];
export function rollGun(rng = Math.random, wave = 1){
  const pool = wave >= 10 ? GUNS : GUNS.filter(g => !g.op);
  const total = pool.reduce((s,g) => s + g.rarity, 0);
  let r = rng() * total;
  for (const g of pool){ r -= g.rarity; if (r <= 0) return g; }
  return pool[0];
}
export function gunById(id){ return GUNS.find(g => g.id === id) || GUNS[0]; }
