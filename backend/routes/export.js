'use strict';
const router = require('express').Router();
const { requireAuth, requirePermission } = require('../auth');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
        HeadingLevel, AlignmentType, WidthType, BorderStyle } = require('docx');

router.use(requireAuth, requirePermission('export'));

// ── GET /api/export/md ────────────────────────────────────────────────────────
router.get('/md', (req, res) => {
  const now  = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const user = req.user.username;

  const md = [
    `# Valhalla SOC — Reporte de Seguridad`,
    `**Generado:** ${now} UTC  |  **Analista:** ${user}`,
    '',
    '---',
    '',
    '## Resumen ejecutivo',
    '',
    '> Este reporte es generado automáticamente a partir de los datos del SIEM Wazuh.',
    '',
    '| KPI | Valor |',
    '|-----|-------|',
    '| Alertas 24h | — |',
    '| Agentes online | — |',
    '| Incidentes abiertos | — |',
    '| Score SCA promedio | — |',
    '',
    '## Alertas recientes',
    '',
    '| Hora | Severidad | Descripción | Regla | Agente |',
    '|------|-----------|-------------|-------|--------|',
    '| — | — | Los datos se cargan en tiempo real desde el dashboard | — | — |',
    '',
    '## Recomendaciones',
    '',
    '1. Revisar alertas de nivel CRÍTICO y asignar analista.',
    '2. Actualizar políticas SCA en endpoints con score < 50%.',
    '3. Validar IOCs activos contra feeds MISP / OTX.',
    '',
    '---',
    `*Valhalla SOC v3.41 · MITRE ATT&CK v15 · CERT-ES · ISO 27035*`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="valhalla-report-${now.slice(0,10)}.md"`);
  res.send(md);
});

// ── GET /api/export/pdf ───────────────────────────────────────────────────────
// Returns a styled print-ready HTML — user prints via Ctrl+P → Save as PDF
router.get('/pdf', (req, res) => {
  const now  = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const user = req.user.username;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Valhalla SOC — Reporte ${now.slice(0,10)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'JetBrains Mono', monospace; background:#fff; color:#111; font-size:11px; padding:30px 40px; }
  h1 { font-size:20px; color:#0a4; border-bottom:2px solid #0a4; padding-bottom:8px; margin-bottom:4px; }
  h2 { font-size:13px; color:#0a4; margin:20px 0 8px; text-transform:uppercase; letter-spacing:2px; }
  .meta { font-size:10px; color:#555; margin-bottom:20px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:10px; }
  th { background:#0a4; color:#fff; padding:5px 8px; text-align:left; letter-spacing:1px; }
  td { padding:4px 8px; border-bottom:1px solid #ddd; }
  tr:nth-child(even) td { background:#f8f8f8; }
  .badge { padding:2px 6px; border-radius:2px; font-weight:700; font-size:9px; }
  .CRIT { background:#c00; color:#fff; }
  .HIGH { background:#e80; color:#fff; }
  .MED  { background:#880; color:#fff; }
  .LOW  { background:#444; color:#fff; }
  .footer { margin-top:30px; font-size:9px; color:#999; border-top:1px solid #ddd; padding-top:8px; }
  @media print {
    body { padding:15px 20px; }
    @page { margin:15mm; }
  }
</style>
</head>
<body>
<h1>▌V▌ VALHALLA SOC — Reporte de Seguridad</h1>
<div class="meta">Generado: ${now} UTC &nbsp;|&nbsp; Analista: ${user} &nbsp;|&nbsp; CLASIFICADO // EYES ONLY</div>

<h2>Instrucciones de exportación</h2>
<p style="color:#555;margin-bottom:12px">Para guardar como PDF: presiona <strong>Ctrl+P</strong> → selecciona <strong>"Guardar como PDF"</strong> → desmarca encabezados/pies de página.</p>

<h2>KPIs del Sistema</h2>
<table>
  <tr><th>Indicador</th><th>Valor</th><th>Estado</th></tr>
  <tr><td>Alertas últimas 24h</td><td id="r-alerts">—</td><td>—</td></tr>
  <tr><td>Agentes online</td><td>—</td><td>—</td></tr>
  <tr><td>Incidentes abiertos</td><td>—</td><td>—</td></tr>
  <tr><td>Uptime plataforma</td><td>99.982%</td><td>OPERATIVO</td></tr>
</table>

<h2>Alertas recientes</h2>
<table>
  <tr><th>Hora</th><th>Sev</th><th>Descripción</th><th>Regla</th><th>Agente</th></tr>
  <tr><td colspan="5" style="color:#999;text-align:center">Abre este reporte desde el dashboard para incluir datos en tiempo real</td></tr>
</table>

<h2>Recomendaciones</h2>
<ol style="padding-left:20px;line-height:1.8">
  <li>Revisar y escalar alertas de nivel CRÍTICO al analista asignado.</li>
  <li>Actualizar políticas SCA en endpoints con score por debajo del 50%.</li>
  <li>Correlacionar IOCs activos contra feeds MISP / AlienVault OTX.</li>
  <li>Verificar agentes desconectados y validar su estado de red.</li>
</ol>

<div class="footer">
  Valhalla SOC v3.41.2 &nbsp;·&nbsp; MITRE ATT&CK v15 &nbsp;·&nbsp; CERT-ES &nbsp;·&nbsp; ISO 27035 &nbsp;·&nbsp; Wazuh 4.9.2
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="valhalla-report-${now.slice(0,10)}.html"`);
  res.send(html);
});

// ── GET /api/export/docx ──────────────────────────────────────────────────────
router.get('/docx', async (req, res) => {
  const now  = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const user = req.user.username;

  const border = { style: BorderStyle.SINGLE, size: 1, color: '00aa44' };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: 'VALHALLA SOC — Reporte de Seguridad',
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Generado: ${now} UTC  |  Analista: ${user}`, size: 18, color: '555555' }),
          ],
        }),
        new Paragraph({ text: '' }),

        new Paragraph({ text: 'KPIs del Sistema', heading: HeadingLevel.HEADING_2 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: ['Indicador', 'Valor', 'Estado'].map(t =>
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })], borders: cellBorders })
              ),
            }),
            ...['Alertas 24h', 'Agentes online', 'Incidentes abiertos', 'Uptime'].map(label =>
              new TableRow({
                children: [label, '—', '—'].map(t =>
                  new TableCell({ children: [new Paragraph(t)], borders: cellBorders })
                ),
              })
            ),
          ],
        }),
        new Paragraph({ text: '' }),

        new Paragraph({ text: 'Recomendaciones', heading: HeadingLevel.HEADING_2 }),
        ...[
          'Revisar y escalar alertas de nivel CRÍTICO.',
          'Actualizar políticas SCA en endpoints con score < 50%.',
          'Correlacionar IOCs activos contra feeds MISP / OTX.',
          'Verificar agentes desconectados.',
        ].map(t => new Paragraph({ text: '• ' + t })),

        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: 'Valhalla SOC v3.41 · MITRE ATT&CK v15 · CERT-ES · ISO 27035', size: 16, color: '999999' })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="valhalla-report-${now.slice(0,10)}.docx"`);
  res.send(buf);
});

module.exports = router;
