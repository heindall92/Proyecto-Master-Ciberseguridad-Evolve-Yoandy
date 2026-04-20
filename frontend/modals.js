/* ======================================================
   VALHALLA SOC — Modal builders (DOM-safe, no innerHTML for dynamic data)
   All modal chrome is static HTML; dynamic values use textContent only.
   ====================================================== */

// ── Generic modal shell ──────────────────────────────────────────────────────
function createModal(id) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Chip/badge helper ────────────────────────────────────────────────────────
function sevChip(sev) {
  const el = document.createElement('span');
  el.className = `alert__sev sev-${(sev||'low').toLowerCase()}`;
  el.textContent = sev;
  return el;
}

function btnStyle(color) {
  return `background:rgba(0,0,0,0.1);border:1px solid ${color};color:${color};font-family:var(--mono);font-size:10px;letter-spacing:2px;padding:8px 16px;cursor:pointer`;
}

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
window.__openIncident = function(idx) {
  const i = (window.DATA || {}).incidents?.[idx];
  if (!i) return;

  const sevColor = {CRIT:'var(--danger)',HIGH:'var(--amber)',MED:'var(--signal)',LOW:'var(--text-dim)'}[i.sev] || 'var(--signal)';
  const overlay = createModal('incidentModal');

  // Wrapper card
  const card = document.createElement('div');
  card.style.cssText = `background:var(--bg-panel-deep);border:1px solid ${sevColor};padding:0;max-width:860px;width:100%;border-radius:var(--r-lg);font-family:var(--mono)`;
  overlay.appendChild(card);

  // ── Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--line);flex-wrap:wrap';
  const chip = sevChip(i.sev);
  hdr.appendChild(chip);
  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:15px;font-weight:700;color:var(--text-bright);letter-spacing:1.5px';
  titleEl.textContent = `${i.id} — ${i.title}`;
  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'font-size:10px;color:var(--text-faint);margin-top:3px';
  metaEl.textContent = `MITRE ${i.mitre} · ${i.tactic} · Asignado: ${i.assignee} · Edad: ${i.age}`;
  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(metaEl);
  hdr.appendChild(titleWrap);
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:10px;padding:6px 14px;cursor:pointer';
  closeBtn.textContent = '✕ CERRAR';
  closeBtn.onclick = () => closeModal('incidentModal');
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);

  // ── Body
  const body = document.createElement('div');
  body.style.cssText = 'padding:20px 24px;display:grid;gap:18px';
  card.appendChild(body);

  // Description
  addSection(body, 'Descripción del incidente', [i.description], 'text');

  // Affected + IOC grid
  const twoCol = document.createElement('div');
  twoCol.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px';
  body.appendChild(twoCol);
  const affBox = addBox(twoCol, 'Sistemas afectados');
  (i.affected||[]).forEach(s => {
    const d = document.createElement('div');
    d.style.cssText = 'color:var(--amber);font-size:10.5px;padding:2px 0';
    d.textContent = `▶ ${s}`;
    affBox.appendChild(d);
  });
  const iocBox = addBox(twoCol, 'IOC principal / Playbook');
  const iocVal = document.createElement('div');
  iocVal.style.cssText = 'color:var(--danger);font-size:10.5px';
  iocVal.textContent = i.ioc;
  const pbVal = document.createElement('div');
  pbVal.style.cssText = 'font-size:9px;color:var(--text-faint);margin-top:6px';
  pbVal.textContent = `Playbook → ${i.playbook}`;
  iocBox.appendChild(iocVal);
  iocBox.appendChild(pbVal);

  // Timeline
  if (i.timeline?.length) {
    const tlLabel = addLabel(body, 'Línea de tiempo del incidente');
    const tlWrap = document.createElement('div');
    tlWrap.style.cssText = 'border-left:2px solid var(--signal);padding-left:14px;display:grid;gap:8px';
    body.appendChild(tlWrap);
    i.timeline.forEach(t => {
      const row = document.createElement('div');
      row.style.cssText = 'font-size:10.5px;color:var(--text);position:relative;padding-left:6px';
      const dot = document.createElement('span');
      dot.style.cssText = 'position:absolute;left:-19px;top:4px;width:8px;height:8px;background:var(--signal);border-radius:50%;display:block';
      row.appendChild(dot);
      row.appendChild(document.createTextNode(t));
      tlWrap.appendChild(row);
    });
  }

  // Mitigations
  if (i.mitigations?.length) {
    addLabel(body, 'Pasos de mitigación recomendados');
    const mitGrid = document.createElement('div');
    mitGrid.style.cssText = 'display:grid;gap:6px';
    body.appendChild(mitGrid);
    i.mitigations.forEach(m => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;background:rgba(60,255,158,0.04);border:1px solid var(--line);padding:9px 12px;border-radius:var(--r-sm)';
      const ico = document.createElement('span');
      ico.style.cssText = 'color:var(--signal);font-size:10px;white-space:nowrap;padding-top:1px';
      ico.textContent = '◎';
      const txt = document.createElement('span');
      txt.style.cssText = 'font-size:10.5px;color:var(--text);line-height:1.6';
      txt.textContent = m;
      row.appendChild(ico);
      row.appendChild(txt);
      mitGrid.appendChild(row);
    });
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)';
  [
    ['▶ TOMAR CASO',    'var(--signal)', () => alert(`Incidente ${i.id} asignado a tu usuario.`)],
    ['▶ ABRIR PLAYBOOK','var(--cyan)',   () => { closeModal('incidentModal'); openPlaybookByName(i.playbook); }],
    ['↑ ESCALAR L3',    'var(--amber)',  () => alert(`Escalando ${i.id} a L3…`)],
    ['✕ CERRAR',        'var(--text-dim)', () => closeModal('incidentModal')],
  ].forEach(([label, color, fn]) => {
    const btn = document.createElement('button');
    btn.style.cssText = btnStyle(color);
    btn.textContent = label;
    btn.onclick = fn;
    actions.appendChild(btn);
  });
  body.appendChild(actions);
};

// ─────────────────────────────────────────────────────────────────────────────
// PLAYBOOK DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
window.__openPlaybook = function(idx) {
  const p = (window.DATA || {}).playbooks?.[idx];
  if (!p) return;
  openPlaybookModal(p);
};

function openPlaybookByName(name) {
  const pb = (window.DATA || {}).playbooks?.find(x => x.name === name);
  if (pb) openPlaybookModal(pb);
}
window.__openPlaybookByName = openPlaybookByName;

function openPlaybookModal(p) {
  const overlay = createModal('playbookModal');
  const progPct = Math.round((p.done / p.steps) * 100);
  const statusColor = p.done === p.steps ? 'var(--signal)' : p.done > 0 ? 'var(--amber)' : 'var(--text-faint)';
  const statusLabel = p.done === p.steps ? 'COMPLETADO' : p.done > 0 ? 'EN CURSO' : 'LISTO';
  const sevColor = {CRIT:'var(--danger)',HIGH:'var(--amber)',MED:'var(--signal)',LOW:'var(--text-faint)'}[p.severity] || 'var(--signal)';

  const card = document.createElement('div');
  card.style.cssText = `background:var(--bg-panel-deep);border:1px solid ${sevColor};padding:0;max-width:900px;width:100%;border-radius:var(--r-lg);font-family:var(--mono)`;
  overlay.appendChild(card);

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--line);flex-wrap:wrap';
  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:15px;font-weight:700;color:var(--text-bright);letter-spacing:1.5px';
  titleEl.textContent = p.name;
  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'font-size:10px;color:var(--text-faint);margin-top:3px';
  metaEl.textContent = `${p.meta} · Categoría: ${p.category} · Progreso: ${p.done}/${p.steps} pasos (${progPct}%)`;
  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(metaEl);
  hdr.appendChild(titleWrap);
  const statusEl = document.createElement('span');
  statusEl.style.cssText = `font-size:10px;letter-spacing:2px;color:${statusColor};border:1px solid currentColor;padding:4px 10px`;
  statusEl.textContent = statusLabel;
  hdr.appendChild(statusEl);
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:10px;padding:6px 14px;cursor:pointer';
  closeBtn.textContent = '✕ CERRAR';
  closeBtn.onclick = () => closeModal('playbookModal');
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'padding:20px 24px;display:grid;gap:18px';
  card.appendChild(body);

  // Description
  addSection(body, 'Descripción y objetivo', [p.description], 'text');

  // Progress bar
  const progWrap = document.createElement('div');
  progWrap.style.cssText = 'background:var(--bg-panel);border:1px solid var(--line);padding:12px;border-radius:var(--r-sm)';
  const progLabel = document.createElement('div');
  progLabel.style.cssText = 'font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px';
  progLabel.textContent = `Progreso de ejecución — ${p.done} de ${p.steps} pasos completados`;
  const barTrack = document.createElement('div');
  barTrack.style.cssText = 'height:8px;background:var(--line);border-radius:4px;overflow:hidden';
  const barFill = document.createElement('div');
  barFill.style.cssText = `height:100%;width:${progPct}%;background:${statusColor};border-radius:4px;transition:width 0.5s`;
  barTrack.appendChild(barFill);
  progWrap.appendChild(progLabel);
  progWrap.appendChild(barTrack);
  body.appendChild(progWrap);

  // Step-by-step runbook
  if (p.runbook?.length) {
    addLabel(body, 'Runbook — instrucciones paso a paso');
    const stepsWrap = document.createElement('div');
    stepsWrap.style.cssText = 'display:grid;gap:8px';
    body.appendChild(stepsWrap);
    p.runbook.forEach(step => {
      const stepCard = document.createElement('div');
      const borderColor = step.done ? 'rgba(60,255,158,0.35)' : 'var(--line)';
      stepCard.style.cssText = `background:${step.done ? 'rgba(60,255,158,0.04)' : 'var(--bg-panel)'};border:1px solid ${borderColor};padding:12px 14px;border-radius:var(--r-sm)`;

      const stepHdr = document.createElement('div');
      stepHdr.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px';
      const numEl = document.createElement('span');
      numEl.style.cssText = `min-width:24px;height:24px;background:${step.done ? 'var(--signal)' : 'var(--line)'};color:${step.done ? 'var(--bg-void)' : 'var(--text-dim)'};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:50%`;
      numEl.textContent = step.done ? '✓' : step.step;
      const stepTitle = document.createElement('span');
      stepTitle.style.cssText = `font-size:11.5px;font-weight:600;color:${step.done ? 'var(--signal)' : 'var(--text-bright)'};letter-spacing:1px`;
      stepTitle.textContent = step.title;
      const statusBadge = document.createElement('span');
      statusBadge.style.cssText = `font-size:8.5px;letter-spacing:1.5px;color:${step.done ? 'var(--signal)' : 'var(--text-faint)'};margin-left:auto`;
      statusBadge.textContent = step.done ? 'COMPLETADO' : 'PENDIENTE';
      stepHdr.appendChild(numEl);
      stepHdr.appendChild(stepTitle);
      stepHdr.appendChild(statusBadge);
      stepCard.appendChild(stepHdr);

      const detailEl = document.createElement('div');
      detailEl.style.cssText = 'font-size:10.5px;color:var(--text-dim);line-height:1.7;margin-left:34px';
      detailEl.textContent = step.detail;
      stepCard.appendChild(detailEl);

      if (step.cmd) {
        const cmdWrap = document.createElement('div');
        cmdWrap.style.cssText = 'margin-left:34px;margin-top:8px;background:rgba(0,0,0,0.3);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 12px';
        const cmdLabel = document.createElement('div');
        cmdLabel.style.cssText = 'font-size:8.5px;color:var(--text-faint);letter-spacing:1.5px;margin-bottom:4px;text-transform:uppercase';
        cmdLabel.textContent = '// Comando de referencia';
        const cmdText = document.createElement('pre');
        cmdText.style.cssText = 'font-size:10px;color:var(--signal-dim);line-height:1.6;white-space:pre-wrap;word-break:break-all;margin:0';
        cmdText.textContent = step.cmd;
        cmdWrap.appendChild(cmdLabel);
        cmdWrap.appendChild(cmdText);
        stepCard.appendChild(cmdWrap);
      }
      stepsWrap.appendChild(stepCard);
    });
  }

  // Footer buttons
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)';
  [
    ['▶ EJECUTAR SIGUIENTE PASO', 'var(--signal)', () => alert('Marcando paso como ejecutado…')],
    ['↓ EXPORTAR RUNBOOK',        'var(--cyan)',   () => alert('Exportando playbook a PDF…')],
    ['✕ CERRAR',                  'var(--text-dim)', () => closeModal('playbookModal')],
  ].forEach(([label, color, fn]) => {
    const btn = document.createElement('button');
    btn.style.cssText = btnStyle(color);
    btn.textContent = label;
    btn.onclick = fn;
    footer.appendChild(btn);
  });
  body.appendChild(footer);
}

// ─────────────────────────────────────────────────────────────────────────────
// VULNERABILITY DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
window.__openVuln = function(idx) {
  const v = (window.DATA || {}).vulns?.[idx];
  if (!v) return;
  const overlay = createModal('vulnModal');

  const cvssColor = v.cvss >= 9 ? 'var(--danger)' : v.cvss >= 7 ? 'var(--amber)' : 'var(--cyan)';
  const card = document.createElement('div');
  card.style.cssText = `background:var(--bg-panel-deep);border:1px solid ${cvssColor};padding:0;max-width:760px;width:100%;border-radius:var(--r-lg);font-family:var(--mono)`;
  overlay.appendChild(card);

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--line);flex-wrap:wrap';
  const cveEl = document.createElement('div');
  cveEl.style.cssText = `font-size:13px;font-weight:700;color:${cvssColor};letter-spacing:2px`;
  cveEl.textContent = v.cve;
  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-bright)';
  titleEl.textContent = v.desc;
  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'font-size:10px;color:var(--text-faint);margin-top:3px';
  metaEl.textContent = `Componente: ${v.component} · Hosts afectados: ${v.affected} · CVSS: ${v.cvss.toFixed(1)}`;
  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(metaEl);
  hdr.appendChild(cveEl);
  hdr.appendChild(titleWrap);
  const cvssChip = document.createElement('span');
  cvssChip.style.cssText = `font-size:16px;font-weight:700;color:${cvssColor};border:2px solid currentColor;padding:4px 12px`;
  cvssChip.textContent = `CVSS ${v.cvss.toFixed(1)}`;
  hdr.appendChild(cvssChip);
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:10px;padding:6px 14px;cursor:pointer';
  closeBtn.textContent = '✕ CERRAR';
  closeBtn.onclick = () => closeModal('vulnModal');
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.style.cssText = 'padding:20px 24px;display:grid;gap:16px';
  card.appendChild(body);

  // CVE details
  const detailsGrid = document.createElement('div');
  detailsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';
  body.appendChild(detailsGrid);
  [
    ['Vector de ataque', v.cvss >= 9 ? 'Red / Remoto' : v.cvss >= 7 ? 'Red / Local' : 'Local'],
    ['Complejidad', v.cvss >= 9 ? 'Baja (sin autenticación)' : 'Media'],
    ['Impacto Confidencialidad', v.cvss >= 9 ? 'ALTO (datos expuestos)' : 'MEDIO'],
    ['Impacto Integridad', v.cvss >= 9 ? 'ALTO (escritura arbitraria)' : 'MEDIO'],
    ['Estado del parche', v.patch === 'pendiente' ? '⚠ SIN PARCHEAR' : '↻ EN PROCESO'],
    ['Hosts afectados', `${v.affected} sistemas expuestos`],
  ].forEach(([k, val]) => {
    const box = addBox(detailsGrid, k);
    const valEl = document.createElement('div');
    valEl.style.cssText = 'font-size:11px;color:var(--text)';
    valEl.textContent = val;
    box.appendChild(valEl);
  });

  // Remediation
  addLabel(body, 'Pasos de remediación recomendados');
  const remGrid = document.createElement('div');
  remGrid.style.cssText = 'display:grid;gap:6px';
  body.appendChild(remGrid);
  const remSteps = v.remediation || [
    `1. Actualizar ${v.component} a la versión más reciente con el parche aplicado`,
    `2. Aplicar workarounds del fabricante si el parche no está disponible`,
    `3. Verificar en NVD si existe PoC público: https://nvd.nist.gov/vuln/detail/${v.cve}`,
    `4. Buscar en VirusTotal exploits conocidos asociados a ${v.cve}`,
    `5. Parchear en orden: sistemas expuestos a internet primero, luego internos`,
    `6. Validar el parche con un test de regresión antes de despliegue en producción`,
    `7. Actualizar el registro de vulnerabilidades y cerrar el ticket cuando CVSS = 0`,
  ];
  remSteps.forEach(step => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;background:rgba(60,255,158,0.03);border:1px solid var(--line);padding:8px 12px;border-radius:var(--r-sm)';
    const ico = document.createElement('span');
    ico.style.cssText = 'color:var(--signal);font-size:10px;white-space:nowrap;padding-top:1px';
    ico.textContent = '◎';
    const txt = document.createElement('span');
    txt.style.cssText = 'font-size:10.5px;color:var(--text);line-height:1.6';
    txt.textContent = step;
    row.appendChild(ico);
    row.appendChild(txt);
    remGrid.appendChild(row);
  });

  // External links
  addLabel(body, 'Referencias externas');
  const linksRow = document.createElement('div');
  linksRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
  body.appendChild(linksRow);
  [
    [`NVD/NIST — ${v.cve}`, `https://nvd.nist.gov/vuln/detail/${v.cve}`],
    ['VirusTotal — CVE Search', `https://www.virustotal.com/gui/search/${v.cve}`],
    ['Exploit-DB — PoC', `https://www.exploit-db.com/search?cve=${v.cve.replace('CVE-','')}`],
    ['MITRE CVE', `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${v.cve}`],
  ].forEach(([label, url]) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.cssText = 'font-size:10px;letter-spacing:1px;color:var(--cyan);border:1px solid rgba(74,227,255,0.3);padding:6px 12px;text-decoration:none';
    a.textContent = `↗ ${label}`;
    linksRow.appendChild(a);
  });

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)';
  [
    ['▶ CREAR TICKET DE PARCHE', 'var(--signal)', async (btn) => {
      btn.disabled = true; btn.textContent = 'Creando…';
      try {
        const r = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:        'patch',
            title:       `[PARCHE] ${v.cve} — ${v.component}`,
            cve:         v.cve,
            component:   v.component,
            cvss:        v.cvss,
            priority:    v.cvss >= 9 ? 'CRIT' : v.cvss >= 7 ? 'HIGH' : 'MED',
            description: `Vulnerabilidad ${v.cve} detectada por Wazuh en ${v.component}. CVSS: ${v.cvss}. Hosts afectados: ${v.affected}. Acción requerida: aplicar parche.`,
          }),
        });
        const d = await r.json();
        if (d.ok) {
          btn.textContent = `✓ TICKET #${d.id} CREADO`;
          btn.style.color = 'var(--signal)';
          // Update tickets badge
          const badge = document.getElementById('ticketsBadge');
          if (badge) badge.textContent = String(parseInt(badge.textContent||'0',10)+1);
          if (typeof window.__loadTickets === 'function') window.__loadTickets();
        } else {
          btn.textContent = `ERROR: ${d.error||'Fallo'}`;
          btn.style.color = 'var(--danger)';
          btn.disabled = false;
        }
      } catch(e) {
        btn.textContent = 'SIN CONEXIÓN';
        btn.style.color = 'var(--danger)';
        btn.disabled = false;
      }
    }],
    ['↑ ESCALAR AL EQUIPO', 'var(--amber)', async (btn) => {
      const analyst = prompt('Asignar a (username):', 'T.STARK');
      if (!analyst) return;
      btn.disabled = true; btn.textContent = 'Escalando…';
      try {
        const r = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:        'escalation',
            title:       `[ESCALADO] ${v.cve} → ${analyst.toUpperCase()}`,
            cve:         v.cve,
            component:   v.component,
            cvss:        v.cvss,
            priority:    'HIGH',
            assignee:    analyst,
            description: `CVE ${v.cve} escalada al equipo. Responsable: ${analyst}. CVSS: ${v.cvss}. Requiere revisión y plan de mitigación urgente.`,
          }),
        });
        const d = await r.json();
        btn.textContent = d.ok ? `✓ ESCALADO #${d.id}` : `ERROR: ${d.error}`;
        btn.style.color  = d.ok ? 'var(--amber)' : 'var(--danger)';
        if (d.ok && typeof window.__loadTickets === 'function') window.__loadTickets();
      } catch(e) {
        btn.textContent = 'ERROR'; btn.disabled = false;
      }
    }],
    ['✕ CERRAR', 'var(--text-dim)', () => closeModal('vulnModal')],
  ].forEach(([label, color, fn]) => {
    const btn = document.createElement('button');
    btn.style.cssText = btnStyle(color);
    btn.textContent = label;
    btn.onclick = function() { fn(this); };
    footer.appendChild(btn);
  });
  body.appendChild(footer);
};

// ─────────────────────────────────────────────────────────────────────────────
// IOC / VIRUSTOTAL MODAL
// ─────────────────────────────────────────────────────────────────────────────
window.__openIOC = function(idx) {
  const ioc = (window.DATA || {}).iocs?.[idx];
  if (!ioc) return;
  const overlay = createModal('iocModal');
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--bg-panel-deep);border:1px solid var(--danger);padding:0;max-width:700px;width:100%;border-radius:var(--r-lg);font-family:var(--mono)';
  overlay.appendChild(card);

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--line);flex-wrap:wrap';
  const typeEl = document.createElement('span');
  typeEl.style.cssText = 'font-size:9px;letter-spacing:2px;color:var(--cyan);border:1px solid rgba(74,227,255,0.4);padding:3px 8px';
  typeEl.textContent = ioc.type;
  const valEl = document.createElement('div');
  valEl.style.flex = '1';
  const valTxt = document.createElement('div');
  valTxt.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-bright);word-break:break-all';
  valTxt.textContent = ioc.val;
  const srcTxt = document.createElement('div');
  srcTxt.style.cssText = 'font-size:10px;color:var(--text-faint);margin-top:3px';
  srcTxt.textContent = `Fuente: ${ioc.source} · Tags: ${ioc.tags} · Score: ${ioc.score}/100`;
  valEl.appendChild(valTxt);
  valEl.appendChild(srcTxt);
  const scoreEl = document.createElement('span');
  scoreEl.style.cssText = `font-size:20px;font-weight:700;color:${ioc.score >= 90 ? 'var(--danger)' : ioc.score >= 70 ? 'var(--amber)' : 'var(--signal)'};border:2px solid currentColor;padding:4px 12px`;
  scoreEl.textContent = ioc.score;
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:1px solid var(--line);color:var(--text-dim);font-family:var(--mono);font-size:10px;padding:6px 14px;cursor:pointer';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => closeModal('iocModal');
  hdr.appendChild(typeEl);
  hdr.appendChild(valEl);
  hdr.appendChild(scoreEl);
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.style.cssText = 'padding:20px 24px;display:grid;gap:16px';
  card.appendChild(body);

  // VT analysis section
  const vtBox = addBox(body, 'Análisis VirusTotal (en tiempo real)');
  const vtResult = document.createElement('div');
  vtResult.id = 'vtResult';
  vtResult.style.cssText = 'font-size:11px;color:var(--text-faint);padding:8px 0';
  vtResult.textContent = 'Pulsa "ANALIZAR EN VIRUSTOTAL" para consultar detecciones en tiempo real…';
  vtBox.appendChild(vtResult);
  const vtBtn = document.createElement('button');
  vtBtn.style.cssText = 'margin-top:8px;' + btnStyle('var(--signal)');
  vtBtn.textContent = '▶ ANALIZAR EN VIRUSTOTAL';
  vtBtn.onclick = async () => {
    vtResult.textContent = 'Consultando VirusTotal API…';
    try {
      const r = await fetch('/api/virustotal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: ioc.val, type: ioc.type }),
      });
      const d = await r.json();
      if (d.ok) {
        vtResult.style.color = 'var(--text)';
        vtResult.textContent = '';
        [
          [`Detecciones: ${d.malicious}/${d.total} motores`, d.malicious > 0 ? 'var(--danger)' : 'var(--signal)'],
          [`Reputación: ${d.reputation}`, d.reputation < 0 ? 'var(--danger)' : 'var(--text-dim)'],
          [`Categoría: ${d.category || 'N/A'}`, 'var(--text-dim)'],
          [`País: ${d.country || 'N/A'}`, 'var(--text-faint)'],
          [`Última análisis: ${d.lastAnalysis || 'N/A'}`, 'var(--text-faint)'],
        ].forEach(([text, color]) => {
          const line = document.createElement('div');
          line.style.cssText = `color:${color};font-size:11px;padding:2px 0`;
          line.textContent = text;
          vtResult.appendChild(line);
        });
      } else {
        vtResult.textContent = `Error VirusTotal: ${d.error}`;
      }
    } catch(e) {
      vtResult.textContent = `Error: ${e.message}. Verifica que VIRUSTOTAL_API_KEY esté configurada en el servidor.`;
    }
  };
  vtBox.appendChild(vtBtn);

  // OTX enrichment section
  const otxBox = addBox(body, 'AlienVault OTX (enriquecimiento)');
  const otxResult = document.createElement('div');
  otxResult.id = 'otxResult';
  otxResult.style.cssText = 'font-size:11px;color:var(--text-faint);padding:8px 0';
  otxResult.textContent = 'Pulsa "CONSULTAR OTX" para ver reputación y pulses de AlienVault OTX…';
  otxBox.appendChild(otxResult);
  const otxBtn = document.createElement('button');
  otxBtn.style.cssText = 'margin-top:8px;' + btnStyle('var(--cyan)');
  otxBtn.textContent = '▶ CONSULTAR OTX';
  otxBtn.onclick = async () => {
    otxResult.textContent = 'Consultando AlienVault OTX API…';
    try {
      const r = await fetch('/api/iocs/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: ioc.val, type: ioc.type }),
      });
      const d = await r.json();
      if (d.ok) {
        otxResult.style.color = 'var(--text)';
        otxResult.textContent = '';
        [
          [`Pulses: ${d.pulseCount}`, d.pulseCount > 0 ? 'var(--danger)' : 'var(--signal)'],
          [`Malicioso: ${d.malicious ? 'SÍ' : 'No detectado'}`, d.malicious ? 'var(--danger)' : 'var(--text-dim)'],
          [`País: ${d.country}`, 'var(--text-dim)'],
          [`ASN: ${d.asn}`, 'var(--text-faint)'],
          [`Tags: ${d.tags}`, 'var(--text-faint)'],
          [`Última actividad: ${d.lastSeen}`, 'var(--text-faint)'],
        ].forEach(([text, color]) => {
          const line = document.createElement('div');
          line.style.cssText = `color:${color};font-size:11px;padding:2px 0`;
          line.textContent = text;
          otxResult.appendChild(line);
        });
        if (d.permalink) {
          const link = document.createElement('a');
          link.href = d.permalink;
          link.target = '_blank';
          link.style.cssText = 'display:block;margin-top:6px;font-size:9px;color:var(--cyan);letter-spacing:1px';
          link.textContent = '→ Ver en OTX';
          otxResult.appendChild(link);
        }
      } else {
        otxResult.textContent = `Error OTX: ${d.error}`;
      }
    } catch(e) {
      otxResult.textContent = `Error: ${e.message}. Verifica que OTX_API_KEY esté configurada en el servidor.`;
    }
  };
  otxBox.appendChild(otxBtn);

  // Context
  addSection(body, 'Contexto y qué hacer', [
    `Este IOC de tipo ${ioc.type} fue reportado por ${ioc.source} con una puntuación de maliciosidad de ${ioc.score}/100.`,
    ioc.score >= 90
      ? 'NIVEL CRÍTICO: Bloquear INMEDIATAMENTE en firewall, DNS y proxy. Buscar en TODOS los logs si algún sistema interno ha contactado con este IOC. Si hay hits, activar el protocolo de respuesta a incidentes.'
      : ioc.score >= 70
      ? 'NIVEL ALTO: Añadir a lista de vigilancia activa. Configurar alerta en Wazuh para cualquier comunicación con este IOC. Revisar logs de los últimos 7 días.'
      : 'NIVEL MEDIO: Monitorizar. Añadir a la lista negra preventiva. Correlacionar con otros IOCs relacionados.',
  ], 'text');

  // Actions
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--line)';
  [
    ['🚫 BLOQUEAR EN FIREWALL', 'var(--danger)', () => alert(`Añadiendo ${ioc.val} a lista de bloqueo…`)],
    ['+ AÑADIR A WAZUH', 'var(--signal)', () => alert(`Añadiendo IOC a reglas Wazuh…`)],
    ['✕ CERRAR', 'var(--text-dim)', () => closeModal('iocModal')],
  ].forEach(([label, color, fn]) => {
    const btn = document.createElement('button');
    btn.style.cssText = btnStyle(color);
    btn.textContent = label;
    btn.onclick = fn;
    footer.appendChild(btn);
  });
  body.appendChild(footer);
};

// ── DOM helpers ──────────────────────────────────────────────────────────────
function addLabel(parent, text) {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:2px';
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function addBox(parent, title) {
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg-panel);border:1px solid var(--line);padding:12px;border-radius:var(--r-sm)';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:9px;color:var(--text-faint);letter-spacing:2px;text-transform:uppercase;margin-bottom:7px';
  lbl.textContent = title;
  box.appendChild(lbl);
  parent.appendChild(box);
  return box;
}

function addSection(parent, title, lines, type) {
  addLabel(parent, title);
  lines.forEach(line => {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:11.5px;color:var(--text);line-height:1.7;margin-bottom:4px';
    el.textContent = line;
    parent.appendChild(el);
  });
}
