/* ======================================================
   VALHALLA — view components (vanilla JS templating)
   ====================================================== */

const D = window.DATA;

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
  return `
  <div class="grid grid--4">
    ${Kpi('ALERTAS / 24H',   '2,481', 'cyan',   '+12.4%', 'up')}
    ${Kpi('INCIDENTES',      '07',    'danger', '3 críticos', 'down')}
    ${Kpi('MTTD PROMEDIO',   '4m 22s', '',      'SLA 5m ok', 'up')}
    ${Kpi('MTTR PROMEDIO',   '18m 47s', 'amber','SLA 15m', 'down')}
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
    ${MiniPanel('MITRE ATT&CK · Top técnicas', `
      ${[
        ['T1486', 'Data Encrypted · Ransomware', 87, 'danger'],
        ['T1078', 'Valid Accounts', 64, 'amber'],
        ['T1566', 'Phishing', 51, 'amber'],
        ['T1059', 'Command Interpreter', 42, ''],
        ['T1021', 'Remote Services', 28, ''],
      ].map(([id, name, v, cls]) => `
        <div style="padding: 8px 14px; border-bottom: 1px dashed var(--line-faint); font-size: 11px">
          <div style="display:flex; justify-content:space-between; margin-bottom: 4px">
            <span style="color: var(--cyan); letter-spacing: 1px; font-weight: 500">${id} · ${name}</span>
            <span style="color: var(--text-dim); font-variant-numeric: tabular-nums">${v}</span>
          </div>
          <div class="bar"><div class="bar__fill ${cls}" style="width:${v}%"></div></div>
        </div>`).join('')}
    `)}
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
      <span class="alert__sev sev-${a.sev.toLowerCase()}">${a.sev}</span>
      <span class="alert__time">${a.time}</span>
      <span class="alert__msg">${a.msg}</span>
      <span class="alert__src">→ ${a.src}</span>
      <span class="alert__status">${a.status}</span>
    </div>
  `).join('');
}

// =========================================================
// SIEM view (full alert list with filters)
// =========================================================
function renderSIEM() {
  return `
  <div class="grid grid--4">
    ${Kpi('NUEVAS',   '184', 'danger')}
    ${Kpi('TRIAGE',   '57',  'amber')}
    ${Kpi('CONTENIDAS', '23',  'cyan')}
    ${Kpi('CERRADAS 24H', '2,217', '')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Wazuh · Alertas detalladas</div>
      <div class="panel__meta">rule filter · severity ≥ MED · 50 / 2,481</div>
    </div>
    <div class="panel__body" style="padding: 0">
      <div class="alert" style="color: var(--text-dim); font-size: 9.5px; letter-spacing:2px; text-transform:uppercase; border-bottom: 1px solid var(--line)">
        <span>Severidad</span><span>Hora</span><span>Evento</span><span>Origen</span><span>Estado</span>
      </div>
      ${[...D.alerts, ...D.alerts, ...D.alerts].map(a => `
        <div class="alert">
          <span class="alert__sev sev-${a.sev.toLowerCase()}">${a.sev}</span>
          <span class="alert__time">${a.time}</span>
          <span class="alert__msg">${a.msg} <em style="color:var(--text-faint)">· rule ${a.rule}</em></span>
          <span class="alert__src">→ ${a.src}</span>
          <span class="alert__status">${a.status}</span>
        </div>`).join('')}
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
    </div>
    <div class="panel__body">
      <div class="grid grid--4">
        ${D.assets.map(a => `
          <div class="asset">
            <div class="asset__name">${a.name}</div>
            <div class="asset__ip">${a.ip} · ${a.os}</div>
            <div style="font-size:10px; color:var(--text-faint); letter-spacing:1px; margin-top:4px; text-transform:uppercase">${a.type} · ${a.agent}</div>
            <div class="asset__status ${a.status}">
              <span class="dot" style="background:currentColor; box-shadow:0 0 6px currentColor"></span>
              ${a.status === 'up' ? 'ONLINE' : a.status === 'warn' ? 'ALERTA' : 'OFFLINE · AISLADO'}
            </div>
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
  return `
  <div class="grid grid--4">
    ${Kpi('CRÍTICAS', '08', 'danger')}
    ${Kpi('ALTAS', '33', 'amber')}
    ${Kpi('PARCHEADAS 7D', '127', 'cyan')}
    ${Kpi('COBERTURA', '96.8%', '')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Vulnerabilidades · módulo Wazuh Vulnerability Detection</div>
      <div class="panel__meta">CVE · CVSS ≥ 7.0 · NIST NVD sync</div>
    </div>
    <div class="panel__body" style="padding: 0">
      <div class="vuln-row" style="color: var(--text-dim); font-size: 9.5px; letter-spacing:2px; text-transform:uppercase; border-bottom: 1px solid var(--line)">
        <span>CVE</span><span>Descripción</span><span>CVSS</span><span>Estado</span>
      </div>
      ${D.vulns.map(v => `
        <div class="vuln-row">
          <span class="vuln-cve">${v.cve}</span>
          <span class="vuln-desc">${v.desc}<em>${v.component} · ${v.affected} hosts afectados</em></span>
          <span style="font-variant-numeric:tabular-nums; font-weight:500; color:${v.cvss >= 9 ? 'var(--danger)' : v.cvss >= 7 ? 'var(--amber)' : 'var(--cyan)'}; text-shadow: 0 0 8px currentColor">${v.cvss.toFixed(1)}</span>
          <span class="tag ${v.patch === 'pendiente' ? 'open' : 'progress'}">${v.patch}</span>
        </div>
      `).join('')}
    </div>
  </section>
  `;
}

// =========================================================
// THREAT INTEL view
// =========================================================
function renderThreat() {
  return `
  <div class="grid grid--4">
    ${Kpi('IOCs ACTIVOS', '18,471', 'cyan')}
    ${Kpi('FEEDS', '12', '')}
    ${Kpi('MATCH 24H', '84', 'amber')}
    ${Kpi('APT TRACKING', '07', 'danger')}
  </div>

  <div class="grid grid--main" style="flex:1">
    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">IOCs · indicators of compromise</div>
        <div class="panel__meta">score ≥ 70 · feed MISP + OTX + VT</div>
      </div>
      <div class="panel__body" style="padding: 0">
        ${D.iocs.map(i => `
          <div class="ioc">
            <span class="ioc__type">${i.type}</span>
            <div>
              <div class="ioc__val">${i.val}</div>
              <div style="font-size:10px; color:var(--text-faint); letter-spacing:1px; margin-top:2px">${i.source} · ${i.tags}</div>
            </div>
            <span class="ioc__score">${i.score}</span>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <div class="panel__title">APT Tracking</div>
      </div>
      <div class="panel__body" style="padding: 0">
        ${[
          ['APT29', 'Cozy Bear · RU', 92, 'danger'],
          ['APT28', 'Fancy Bear · RU', 78, 'amber'],
          ['Lazarus', 'NK · financial', 61, 'amber'],
          ['APT41', 'CN · dual-use', 54, ''],
          ['FIN7', 'financial crime', 41, ''],
          ['Conti', 'ransomware', 38, ''],
          ['LockBit', 'RaaS', 84, 'danger'],
        ].map(([n, meta, v, cls]) => `
          <div style="padding: 10px 14px; border-bottom: 1px dashed var(--line-faint)">
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom: 4px">
              <span style="font-family:var(--sans); font-weight:600; letter-spacing:1.5px; color:var(--text-bright)">${n}</span>
              <span style="color:var(--text-dim); font-size:10px; letter-spacing:1px">${meta}</span>
            </div>
            <div class="bar"><div class="bar__fill ${cls}" style="width:${v}%"></div></div>
          </div>
        `).join('')}
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
    ${Kpi('TRÁFICO IN', '847 mb/s', 'cyan')}
    ${Kpi('TRÁFICO OUT', '312 mb/s', '')}
    ${Kpi('SESIONES', '14,208', '')}
    ${Kpi('DROP RATIO', '2.11%', 'amber')}
  </div>

  <div class="grid grid--2" style="flex:1">
    <section class="panel">
      <div class="panel__head"><div class="panel__title">Inbound · últimos 60min</div></div>
      <div class="panel__body" style="padding:14px">${Spark('var(--cyan)', randomWalk(60, 65, 25))}</div>
    </section>
    <section class="panel">
      <div class="panel__head"><div class="panel__title">Outbound · últimos 60min</div></div>
      <div class="panel__body" style="padding:14px">${Spark('var(--signal)', randomWalk(60, 35, 15))}</div>
    </section>
  </div>

  <section class="panel">
    <div class="panel__head">
      <div class="panel__title">Top flows · Zeek + Suricata</div>
      <div class="panel__meta">ordenado por bytes</div>
    </div>
    <div class="panel__body" style="padding: 0">
      <table class="table">
        <thead><tr><th>Flow</th><th>Protocolo</th><th>Origen</th><th>Destino</th><th>Bytes</th><th>Estado</th></tr></thead>
        <tbody>
          ${[
            ['0xA4F1', 'HTTPS', '10.0.2.5:443',  '172.31.4.88',   '412 MB',  'active'],
            ['0xA4F2', 'DNS',   '10.12.3.17',    '8.8.8.8',       '2.1 MB',  'suspicious'],
            ['0xA4F3', 'SSH',   '10.0.1.23:22',  '185.220.101.47','88 KB',   'blocked'],
            ['0xA4F4', 'SMB',   '10.0.0.12:445', '10.12.3.22',    '1.4 GB',  'flagged'],
            ['0xA4F5', 'HTTP',  '10.12.4.14',    '41.58.12.8',    '12 MB',   'suspicious'],
            ['0xA4F6', 'HTTPS', '10.12.8.44',    'github.com',    '88 MB',   'active'],
          ].map(([fl, p, s, d, b, st]) => `
            <tr>
              <td style="color:var(--cyan); letter-spacing:1px">${fl}</td>
              <td>${p}</td>
              <td style="color:var(--text-dim)">${s}</td>
              <td style="color:var(--text-dim)">${d}</td>
              <td style="font-variant-numeric:tabular-nums">${b}</td>
              <td><span class="tag ${st === 'blocked' || st === 'suspicious' ? 'open' : st === 'flagged' ? 'progress' : 'resolved'}">${st}</span></td>
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
  return `
  <div class="grid grid--4">
    ${Kpi('PLAYBOOKS', '12', 'cyan')}
    ${Kpi('AUTOMATIZADOS', '08', '')}
    ${Kpi('EJECUCIONES 7D', '41', 'amber')}
    ${Kpi('TASA ÉXITO', '87%', '')}
  </div>

  <section class="panel" style="flex:1">
    <div class="panel__head">
      <div class="panel__title">Runbooks · SOAR integrados</div>
      <div class="panel__meta">click para ver detalle</div>
    </div>
    <div class="panel__body">
      <div class="grid grid--3">
        ${D.playbooks.map(p => `
          <div class="playbook">
            <div class="playbook__name">${p.name}</div>
            <div class="playbook__meta">${p.meta}</div>
            <div class="playbook__steps">
              ${Array.from({length: p.steps}, (_, i) => `<div class="playbook__step ${i < p.done ? 'done' : ''}"></div>`).join('')}
            </div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:8px; letter-spacing:1px; display:flex; justify-content:space-between">
              <span>PASO ${p.done} / ${p.steps}</span>
              <span>${p.done === p.steps ? 'COMPLETO' : p.done === 0 ? 'LISTO' : 'EN CURSO'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>
  `;
}

// =========================================================
// METRICS view
// =========================================================
function renderMetrics() {
  return `
  <div class="grid grid--4">
    ${Kpi('MTTD', '4m 22s', '')}
    ${Kpi('MTTR', '18m 47s', 'amber')}
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

// expose
window.VIEWS = {
  overview: renderOverview,
  siem: renderSIEM,
  map: renderMap,
  incidents: renderIncidents,
  assets: renderAssets,
  vulns: renderVulns,
  threat: renderThreat,
  network: renderNetwork,
  playbooks: renderPlaybooks,
  metrics: renderMetrics,
};
window.mountAlerts = mountAlerts;
window.renderRail = renderRail;
window.mountLeafletMap = mountLeafletMap;
