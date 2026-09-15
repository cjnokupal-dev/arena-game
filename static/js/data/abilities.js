export const ABILITIES = [
  { id:'dash', name:'Dash', icon:'⚡', cd:8, rarity:'common',
    desc:'Teleport 180px toward aim. 0.5s invuln.',
    exec:(ctx) => {
      const p = ctx.player;
      const a = p.aimAngle;
      p.x += Math.cos(a) * 180;
      p.y += Math.sin(a) * 180;
      p.x = Math.max(p.r, Math.min(ctx.world.w - p.r, p.x));
      p.y = Math.max(p.r, Math.min(ctx.world.h - p.r, p.y));
      p.invuln = Math.max(p.invuln, 0.5);
      ctx.fx.burst(p.x, p.y, '#58a6ff', 20, { speed: 260 });
      ctx.shake(5, 0.2);
    } },
  { id:'shield', name:'Shield', icon:'▣', cd:14, rarity:'common',
    desc:'Absorb next 3 hits over 6s.',
    exec:(ctx) => { ctx.player.shield = 3; ctx.player.shieldTimer = 6; } },
  { id:'heal', name:'Patch', icon:'✚', cd:20, rarity:'rare',
    desc:'Instant +40 HP.',
    exec:(ctx) => {
      const p = ctx.player;
      p.hp = Math.min(p.maxHp, p.hp + 40);
      ctx.fx.burst(p.x, p.y, '#7ee787', 20, { speed: 200 });
    } },
  { id:'bomb', name:'Bomb', icon:'◉', cd:22, rarity:'rare',
    desc:'Detonate AOE — 80 dmg, 220px radius.',
    exec:(ctx) => {
      const p = ctx.player;
      const cx = p.x, cy = p.y;
      for (const e of ctx.state.enemies){
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d < 220){ e.hurt(80); }
      }
      if (ctx.state.boss){
        const d = Math.hypot(ctx.state.boss.x - cx, ctx.state.boss.y - cy);
        if (d < 220) ctx.state.boss.hurt(80);
      }
      ctx.fx.burst(cx, cy, '#ff5c68', 60, { speed: 500 });
      ctx.shake(16, 0.5);
    } },
  { id:'timeslow', name:'Slow', icon:'⏱', cd:24, rarity:'rare',
    desc:'Enemies slow 70% for 3s.',
    exec:(ctx) => {
      for (const e of ctx.state.enemies) e.slowTimer = 3;
      if (ctx.state.boss) ctx.state.boss.slowTimer = 1.5;
    } },
  { id:'turret', name:'Turret', icon:'⚙', cd:30, rarity:'epic',
    desc:'Deploy auto-turret 12s.',
    exec:(ctx) => {
      ctx.state.turrets.push({
        x: ctx.player.x, y: ctx.player.y,
        life: 12, fireTimer: 0, range: 400,
      });
      ctx.fx.burst(ctx.player.x, ctx.player.y, '#c8ddff', 20, { speed: 200 });
    } },
  { id:'berserk', name:'Berserk', icon:'🔥', cd:28, rarity:'epic',
    desc:'+150% fire rate, +30% speed for 5s.',
    exec:(ctx) => { ctx.state.player.berserkTimer = 5; } },
  { id:'ghost', name:'Ghost', icon:'◈', cd:35, rarity:'legendary',
    desc:'Invuln + invisible 4s.',
    exec:(ctx) => { ctx.player.ghostTimer = 4; ctx.player.invuln = Math.max(ctx.player.invuln, 4); } },
  { id:'overload', name:'Overload', icon:'☢', cd:40, rarity:'legendary',
    desc:'Next 4s: all shots 3× dmg + explode.',
    exec:(ctx) => { ctx.state.player.overloadTimer = 4; } },
  { id:'nuke', name:'Nuke', icon:'☀', cd:70, rarity:'mythic',
    desc:'Screen clear. Boss loses 20% HP.',
    exec:(ctx) => {
      for (const e of ctx.state.enemies){
        e.hurt(99999);
        ctx.state.score += e.score;
      }
      if (ctx.state.boss){
        ctx.state.boss.hurt(ctx.state.boss.maxHp * 0.20);
      }
      ctx.fx.burst(ctx.player.x, ctx.player.y, '#ffd166', 100, { speed: 700 });
      ctx.shake(24, 1.0);
    } },
];
export function abilityById(id){ return ABILITIES.find(a => a.id === id); }
