export const META = [
  { id:'damage',   name:'Sharpened',  desc:'+5% damage per level',       icon:'⚔',  max:10, cost:(l)=>25+l*20 },
  { id:'speed',    name:'Swift',      desc:'+3% move speed per level',   icon:'💨', max:10, cost:(l)=>25+l*20 },
  { id:'maxHp',    name:'Vitality',   desc:'+10 max HP per level',       icon:'❤',  max:10, cost:(l)=>30+l*25 },
  { id:'fireRate', name:'Trigger',    desc:'+4% fire rate per level',    icon:'🔥', max:10, cost:(l)=>30+l*25 },
  { id:'regen',    name:'Regen',      desc:'+0.5 HP/s per level',        icon:'✚',  max:5,  cost:(l)=>50+l*40 },
  { id:'luck',     name:'Fortune',    desc:'+1 reroll on wave clear',    icon:'◆',  max:3,  cost:(l)=>80+l*60 },
];
export const RUN_UPGRADES = [
  { id:'dmg',    name:'Sharpened',   desc:'+25% damage',            icon:'⚔', weight:1.0, type:'stat' },
  { id:'rate',   name:'Rapid Fire',  desc:'+20% fire rate',         icon:'🔥', weight:1.0, type:'stat' },
  { id:'hp',     name:'Vitality',    desc:'+30 max HP · heal 30',   icon:'❤', weight:0.9, type:'stat' },
  { id:'spd',    name:'Swift',       desc:'+15% move speed',        icon:'💨', weight:0.9, type:'stat' },
  { id:'pierce', name:'Piercing',    desc:'bullets pierce +1 enemy',icon:'➤', weight:0.6, type:'stat' },
  { id:'multi',  name:'Multishot',   desc:'+1 projectile',          icon:'⋔', weight:0.55,type:'stat' },
  { id:'size',   name:'Heavy Rounds',desc:'+40% bullet size',       icon:'●', weight:0.7, type:'stat' },
  { id:'crit',   name:'Precision',   desc:'+12% crit chance',       icon:'✦', weight:0.7, type:'stat' },
  { id:'regen',  name:'Regen',       desc:'+1 HP/s',                icon:'✚', weight:0.6, type:'stat' },
  { id:'coin',   name:'Greed',       desc:'+30% coin gain',         icon:'◆', weight:0.6, type:'stat' },
  { id:'knock',  name:'Concussive',  desc:'+knockback on hit',      icon:'↯', weight:0.5, type:'stat' },
];
export const OP_UPGRADES = [
  { id:'explode', name:'Explosive',    desc:'Bullets explode for 50% dmg', icon:'☢', weight:1.0, type:'op' },
  { id:'homing',  name:'Homing',       desc:'Bullets track nearest enemy', icon:'◎', weight:1.0, type:'op' },
  { id:'chain',   name:'Chain Lightning',desc:'Bullets arc to +1 nearby', icon:'⚡', weight:1.0, type:'op' },
  { id:'vamp',    name:'Vampiric',     desc:'Heal 1 HP per hit',           icon:'✚', weight:0.9, type:'op' },
  { id:'freeze',  name:'Cryo',         desc:'Bullets freeze enemies',      icon:'❄', weight:0.9, type:'op' },
  { id:'storm',   name:'Storm Core',   desc:'+1 extra bullet per shot',    icon:'⋔', weight:0.8, type:'op' },
  { id:'inferno', name:'Inferno',      desc:'+100% fire rate',             icon:'🔥', weight:0.8, type:'op' },
  { id:'colossus',name:'Colossus',     desc:'+75 max HP, +30% dmg',        icon:'▣', weight:0.7, type:'op' },
  { id:'godspeed',name:'Godspeed',     desc:'+40% speed, +20% dodge',      icon:'💨', weight:0.7, type:'op' },
  { id:'ruin',    name:'Ruin Core',    desc:'Bullets phase through all',   icon:'◈', weight:0.6, type:'op' },
  { id:'ascend',  name:'Ascension',    desc:'+50% dmg, +50% fire rate, +50% HP', icon:'✦', weight:0.4, type:'op' },
];
export function pickWeighted(pool){
  const total = pool.reduce((s,u) => s + u.weight, 0);
  let r = Math.random() * total;
  for (const u of pool){ r -= u.weight; if (r <= 0) return u; }
  return pool[0];
}
