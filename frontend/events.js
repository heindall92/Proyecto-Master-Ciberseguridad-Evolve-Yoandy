/* =====================================================================
   VALHALLA — Centralized event delegation (SEC-002: removes unsafe-inline)
   All onclick / interactive handlers route through here via data-action.
   ===================================================================== */

document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action  = el.dataset.action;
  const fn      = window[action];
  if (typeof fn !== 'function') {
    console.warn('[events] unknown action:', action);
    return;
  }

  let args = [];
  if (el.dataset.args) {
    try { args = JSON.parse(el.dataset.args); }
    catch { console.warn('[events] bad args for', action); return; }
  }

  if (el.dataset.passelement === '1') fn(...args, el);
  else fn(...args);
});

// Helper used in modals (DOM actions that don't map to a window function)
window.__closeEnrollModal = function() {
  const m = document.getElementById('enrollModal');
  if (m) m.remove();
};

window.__toggleTweaks = function() {
  document.getElementById('tweaks').classList.toggle('on');
};
