/* ======================================================
   VALHALLA — app bootstrap
   ====================================================== */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scheme": "green",
  "scanlines": "on",
  "density": "normal",
  "logs": "on"
}/*EDITMODE-END*/;

let state = {
  view: localStorage.getItem('valhalla.view') || 'overview',
  logsOn: TWEAK_DEFAULTS.logs === 'on',
  ...TWEAK_DEFAULTS,
};

// Apply scheme
function applyTweaks() {
  document.body.setAttribute('data-scheme', state.scheme);
  document.body.classList.toggle('no-scanlines', state.scanlines !== 'on');
  document.getElementById('app').classList.toggle('compact', state.density === 'compact');
}

// Switch view
function setView(v) {
  state.view = v;
  localStorage.setItem('valhalla.view', v);

  document.querySelectorAll('.navbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === v);
  });

  const main = document.getElementById('main');
  main.innerHTML = `<div class="view">${window.VIEWS[v]()}</div>`;

  const rail = document.getElementById('rail');
  rail.innerHTML = window.renderRail(v);

  // view-specific mounts
  if (v === 'overview') {
    window.mountAlerts(10);
  }
  if (v === 'map') {
    // Destroy old map instance if exists
    if (window.__valhallaMap) {
      window.__valhallaMap.remove();
      window.__valhallaMap = null;
    }
    setTimeout(() => window.mountLeafletMap(), 50);
  }

  // start live terminal
  startTerminal();
}

// Live terminal
let termTimer = null;
function startTerminal() {
  clearInterval(termTimer);
  const feed = document.getElementById('termFeed') || document.getElementById('railTerm');
  if (!feed) return;
  feed.innerHTML = '<span class="cursor">boot // valhalla soc v3.41.2 · session opened</span>';

  const pushLine = () => {
    if (!state.logsOn) return;
    const tpl = window.DATA.logTemplates[Math.floor(Math.random() * window.DATA.logTemplates.length)];
    const ip = `${Math.floor(Math.random()*223)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
    const agent = ['srv-db-03', 'wks-fin-07', 'srv-ad-01', 'wks-dev-22', 'fw-perim-01'][Math.floor(Math.random()*5)];
    const hash = Math.random().toString(16).slice(2, 10) + '...' + Math.random().toString(16).slice(2, 6);
    const ts = new Date().toTimeString().slice(0,8);
    const msg = tpl.m
      .replace('{ip}', ip)
      .replace('{agent}', agent)
      .replace('{hash}', hash)
      .replace('{port}', Math.floor(Math.random()*60000))
      .replace('{n}', Math.floor(Math.random()*50+10));

    const line = document.createElement('div');
    line.innerHTML = `<span class="t-dim">${ts}</span> <span class="t-${tpl.t}">${msg}</span>`;
    feed.insertBefore(line, feed.firstChild);
    while (feed.children.length > 14) feed.lastChild.remove();
  };

  for (let i = 0; i < 6; i++) pushLine();
  termTimer = setInterval(pushLine, 1400);
}

// Clock
function tickClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const d = new Date();
  const pad = n => n.toString().padStart(2, '0');
  el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} UTC+02`;
}

// KPI simulation (ticker)
function tickKPIs() {
  const alertsEl = document.getElementById('kpi-alerts');
  if (alertsEl) {
    const cur = parseInt(alertsEl.textContent.replace(/,/g, ''));
    const next = cur + Math.floor(Math.random() * 4);
    alertsEl.textContent = next.toLocaleString();
  }
}

// Edit mode / tweaks wiring
(function setupEditMode() {
  const panel = document.getElementById('tweaks');

  window.addEventListener('message', (e) => {
    if (e.data?.type === '__activate_edit_mode') {
      panel.classList.add('on');
    } else if (e.data?.type === '__deactivate_edit_mode') {
      panel.classList.remove('on');
    }
  });

  window.parent.postMessage({ type: '__edit_mode_available' }, '*');

  panel.querySelectorAll('.chips').forEach(group => {
    const name = group.dataset.group;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        const val = btn.dataset.val;
        if (name === 'scheme') state.scheme = val;
        if (name === 'scan') state.scanlines = val;
        if (name === 'density') state.density = val;
        if (name === 'logs') { state.logs = val; state.logsOn = val === 'on'; }
        applyTweaks();
        window.parent.postMessage({
          type: '__edit_mode_set_keys',
          edits: { scheme: state.scheme, scanlines: state.scanlines, density: state.density, logs: state.logs }
        }, '*');
      });
    });
  });
})();

// wire nav
document.querySelectorAll('.navbtn').forEach(b => {
  b.addEventListener('click', () => setView(b.dataset.view));
});

// init
applyTweaks();
setView(state.view);
setInterval(tickClock, 1000);
setInterval(tickKPIs, 2500);
