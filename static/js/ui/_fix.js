// *v6.1 fix — bind retry/lobby via both click and touchend, wrap startRun.*
// *loaded by main.js; defines window.__ARENA_FIX__ hook.*
export function bindSafe(id, fn){
  const el = document.getElementById(id);
  if (!el) return;
  let fired = false;
  const run = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (fired) return;
    fired = true;
    setTimeout(() => { fired = false; }, 400);
    try { fn(); }
    catch(err){
      console.error('handler error:', err);
      alert('Error: ' + err.message + '\n' + (err.stack||'').split('\n')[0]);
    }
  };
  el.addEventListener('click', run, {passive:false});
  el.addEventListener('touchend', run, {passive:false});
}
