export const STORE = [
  { id:'extra_slot',   name:'Ability Slot +1',     desc:'Unlock a 4th ability slot',          price:800, max:1, icon:'◈' },
  { id:'hp_boost',     name:'Vitality Core',       desc:'+25 starting HP',                    price:250, max:5, icon:'❤' },
  { id:'damage_boost', name:'Weapon Tuning',       desc:'+5% permanent damage',               price:300, max:5, icon:'⚔' },
  { id:'speed_boost',  name:'Kinetic Servo',       desc:'+4% permanent speed',                price:250, max:5, icon:'💨' },
  { id:'revive_token', name:'Revive Token',        desc:'Survive one death per run (full HP)',price:600, max:1, icon:'✦' },
  { id:'reroll_plus',  name:'Extra Reroll',        desc:'+1 reroll every wave clear',         price:400, max:3, icon:'◆' },
  { id:'crit_boost',   name:'Precision Module',    desc:'+4% base crit',                      price:350, max:5, icon:'◎' },
  { id:'pierce_boost', name:'Piercing Chamber',    desc:'+1 base bullet pierce',              price:500, max:3, icon:'➤' },
  { id:'start_rifle',  name:'Arsenal: Rifle',      desc:'Start every run with a Rifle',       price:1000,max:1, icon:'▣' },
  { id:'start_shotgun',name:'Arsenal: Shotgun',    desc:'Start every run with a Shotgun',     price:900, max:1, icon:'▣' },
  { id:'role_slot',    name:'Role Cache +1',       desc:'+1 stored role (swap between rolls)',price:1200,max:1, icon:'♛' },
];
export function storeById(id){ return STORE.find(s => s.id === id); }
