/* ======================================================
   VALHALLA — app bootstrap
   ====================================================== */

// ── Auth guard: redirect to login if no session ───────────────────────────────
(async function checkAuth() {
  try {
    const res  = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    window.__valhallaUser  = data.user;
    window.__valhallaPerms = data.permissions;

    // Update topbar analyst chip
    const analystEl = document.getElementById('kpi-analyst');
    if (analystEl) analystEl.textContent = data.user.username.toUpperCase();

    // Show logout button
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.style.display = 'flex';

    // Show Users nav only for admin
    if (data.user.role === 'admin') {
      const navUsers = document.getElementById('navUsers');
      if (navUsers) navUsers.style.display = 'flex';
    }
  } catch {
    window.location.href = '/login.html';
  }
})();

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
    // Load real data from /api/overview (KPIs, histogram, Cowrie, critical alerts)
    if (typeof window.__loadOverviewData === 'function') {
      window.__loadOverviewData();
    }
  }
  if (v === 'map') {
    // Destroy old map instance if exists
    if (window.__valhallaMap) {
      window.__valhallaMap.remove();
      window.__valhallaMap = null;
    }
    setTimeout(() => window.mountLeafletMap(), 50);
  }

  // view-specific async loads
  if (v === 'tickets') {
    window.__ticketsData = window.__ticketsData || [];
    window.__loadTickets();
  }
  if (v === 'ollama') {
    setTimeout(() => window.__ollamaLoadConfig && window.__ollamaLoadConfig(), 50);
  }
  if (v === 'assets') {
    window.__assetsLoaded = false;
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
  b.addEventListener('click', () => {
    if (b.dataset.view === 'users') {
      window.__loadUsersIfNeeded();
    } else {
      setView(b.dataset.view);
    }
  });
});

// init
applyTweaks();
setView(state.view);
setInterval(tickClock, 1000);
setInterval(tickKPIs, 2500);

// Auto-refresh Overview data every 30s (solo cuando la vista overview está activa)
setInterval(() => {
  if (state.view === 'overview' && typeof window.__loadOverviewData === 'function') {
    window.__loadOverviewData();
  }
}, 30000);


// Exposed so data.js can trigger a view re-render after loading real data
// Skip refresh if Ollama is currently processing (would wipe the result box)
window.__refreshView = () => {
  if (window.__ollamaInFlight) return;
  setView(state.view);
};

// Load ticket count for badge on startup
(async () => {
  try {
    const r = await fetch('/api/tickets');
    if (!r.ok) return;
    const data = await r.json();
    window.__ticketsData = data;
    const open = data.filter(t => t.status === 'open' || t.status === 'in_progress').length;
    const badge = document.getElementById('ticketsBadge');
    if (badge) badge.textContent = String(open);
  } catch { /* ignore */ }
})();

// Open agent detail view — fetch data then re-render
window.openAgent = async function(id) {
  window.__agentDetail = null;
  setView('agent-detail');
  try {
    const res = await fetch(`/api/agent/${encodeURIComponent(id)}`);
    window.__agentDetail = await res.json();
  } catch (_) {}
  setView('agent-detail');
};

// Back to assets list
window.__backToAssets = function() { setView('assets'); };

// Load users when entering Users view
const _origSetView = setView;
window.__loadUsersIfNeeded = async function() {
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      window.__usersData = await res.json();
      setView('users');
    }
  } catch (_) {}
};

// Create user modal (simple prompt approach)
window.__showCreateUser = function() {
  const username = prompt('Nombre de usuario:');
  if (!username) return;
  const password = prompt('Contraseña (mínimo 8 caracteres):');
  if (!password) return;
  const role = prompt('Rol (admin / analyst / reporter / viewer):', 'analyst');
  if (!role) return;
  const email = prompt('Email (opcional):') || '';

  fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role, email }),
  }).then(r => r.json()).then(d => {
    if (d.ok) { alert('Usuario creado: ' + username); window.__loadUsersIfNeeded(); }
    else alert('Error: ' + d.error);
  });
};

window.__editUserRole = function(id, username, currentRole) {
  const role = prompt(`Nuevo rol para ${username} (admin/analyst/reporter/viewer):`, currentRole);
  if (!role) return;
  fetch(`/api/users/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  }).then(r => r.json()).then(d => {
    if (d.ok) window.__loadUsersIfNeeded();
    else alert('Error: ' + d.error);
  });
};

window.__toggleUser = function(id, active) {
  fetch(`/api/users/${id}/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }).then(r => r.json()).then(d => {
    if (d.ok) window.__loadUsersIfNeeded();
    else alert('Error: ' + d.error);
  });
};

// Agent enrollment modal
window.__showEnrollAgent = function() {
  const existing = document.getElementById('enrollModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'enrollModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--bg-panel-deep);border:1px solid var(--signal);padding:28px 32px;max-width:540px;width:95%;border-radius:var(--r-lg);font-family:var(--mono)">
      <div style="font-size:13px;font-weight:700;color:var(--signal);letter-spacing:3px;margin-bottom:20px">// ENROLAR NUEVO AGENTE</div>
      <div style="display:grid;gap:14px">
        <div>
          <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Nombre del agente</label>
          <input id="enrollName" type="text" placeholder="srv-web-01" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;padding:9px 12px;outline:none;border-radius:var(--r-sm)" onfocus="this.style.borderColor='var(--signal)'" onblur="this.style.borderColor='var(--line)'">
        </div>
        <div>
          <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Sistema operativo</label>
          <select id="enrollOS" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;padding:9px 12px;outline:none;border-radius:var(--r-sm)">
            <option value="linux">Linux</option>
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Grupo Wazuh (opcional)</label>
          <input id="enrollGroup" type="text" placeholder="default" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:12px;padding:9px 12px;outline:none;border-radius:var(--r-sm)" onfocus="this.style.borderColor='var(--signal)'" onblur="this.style.borderColor='var(--line)'">
        </div>
      </div>
      <div id="enrollResult" style="margin-top:14px;font-size:10px;color:var(--text-faint);line-height:1.7"></div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button data-action="__doEnrollAgent" style="flex:1;background:rgba(60,255,158,0.12);border:1px solid var(--signal);color:var(--signal);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:10px;cursor:pointer">▶ GENERAR CLAVE</button>
        <button data-action="__closeEnrollModal" style="background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:10px 18px;cursor:pointer">CERRAR</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
};

window.__doEnrollAgent = async function() {
  const name  = document.getElementById('enrollName')?.value?.trim();
  const os    = document.getElementById('enrollOS')?.value;
  const group = document.getElementById('enrollGroup')?.value?.trim() || 'default';
  const result = document.getElementById('enrollResult');
  if (!name) { if (result) result.textContent = '✗ Introduce un nombre para el agente'; return; }
  if (result) result.textContent = 'Solicitando clave de registro a Wazuh…';
  try {
    const res = await fetch('/api/agents/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, os, group }),
    });
    const d = await res.json();
    if (d.ok) {
      const cmd = os === 'windows'
        ? `Invoke-WebRequest -Uri https://packages.wazuh.com/4.x/windows/wazuh-agent-4.9.2-1.msi -OutFile wazuh-agent.msi; .\\wazuh-agent.msi WAZUH_MANAGER="WAZUH_IP" WAZUH_REGISTRATION_KEY="${d.key}" /quiet`
        : `curl -so wazuh-agent.deb https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.9.2-1_amd64.deb && WAZUH_MANAGER="WAZUH_IP" WAZUH_REGISTRATION_KEY="${d.key}" dpkg -i wazuh-agent.deb && systemctl start wazuh-agent`;
      if (result) result.innerHTML = `<span style="color:var(--signal)">✓ Agente registrado en Wazuh · ID ${d.id}</span><br><br><span style="color:var(--text-faint)">Clave:</span> <span style="color:var(--amber)">${d.key}</span><br><br><span style="color:var(--text-faint)">Comando de instalación:</span><br><code style="display:block;margin-top:6px;font-size:9px;word-break:break-all;color:var(--text-dim);line-height:1.6">${cmd}</code>`;
    } else {
      if (result) result.innerHTML = `<span style="color:var(--danger)">✗ Error: ${d.error}</span>`;
    }
  } catch (e) {
    if (result) result.innerHTML = `<span style="color:var(--danger)">✗ Error de red: ${e.message}</span>`;
  }
};

// Logout
window.__logout = async function() {
  await fetch('/api/logout', { method: 'POST' });
  sessionStorage.clear();
  window.location.href = '/login.html';
};
