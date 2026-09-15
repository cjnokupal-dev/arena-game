const KEY = 'arena.v6';
const DEF = {
  v: 2, coins: 0, bestWave: 0, bestScore: 0,
  meta: { damage:0, speed:0, maxHp:0, fireRate:0, regen:0, luck:0 },
  store: {},
  currentRole: null,
};
export function load(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEF);
    const p = JSON.parse(raw);
    return {
      ...DEF, ...p,
      meta: { ...DEF.meta, ...(p.meta || {}) },
      store: { ...(p.store || {}) },
    };
  } catch(e){ return structuredClone(DEF); }
}
export function save(p){ try { localStorage.setItem(KEY, JSON.stringify(p)); } catch(e){} }
export function reset(){ localStorage.removeItem(KEY); }
