import jsPDF from "jspdf";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Divider,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import { fetchExecutiveReportData } from "../lib/reportApi";
import { translations } from "./translations";

interface ValhallaReportJSON {
  report_metadata: {
    report_id: string;
    generation_date: string;
    analyst_name: string;
    company_name: string;
    period: string;
  };
  executive_summary: {
    status: string;
    health_score: number;
    key_finding: string;
  };
  wazuh_metrics: {
    total_alerts: number;
    critical_alerts: number;
    top_affected_assets: Array<{ name: string; ip: string; alerts: number }>;
  };
  mitre_coverage: Array<{ tactic: string; count: number; level: string; icon: string }>;
  honeypot_intel: {
    unique_attackers: number;
    top_passwords_captured: string[];
    malware_samples_collected: number;
  };
  incident_management: {
    total_tickets: number;
    closed_tickets: number;
    avg_resolution_time_min: number;
  };
  remediation_steps: Array<{ task: string; action_cmd?: string }>;
  iso27001?: {
    overall: number;
    controls: Array<{ control: string; status: string; note: string }>;
  };
  recommendations?: string[];
  geo_intel?: Array<{ country: string; pct: number; desc: string }>;
}

const GlassCard = ({ children, sx = {}, title }: any) => (
  <Box sx={{
    background: 'rgba(10, 20, 15, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(60,255,158,0.1)',
    borderRadius: '8px',
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    '&:hover': { borderColor: 'rgba(60,255,158,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
    '&::before': { content: '""', position: 'absolute', top: 0, left: 0, width: '10px', height: '10px', borderTop: '2px solid var(--signal)', borderLeft: '2px solid var(--signal)' },
    ...sx
  }}>
    {title && (
      <Box sx={{ p: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Box sx={{ width: '4px', height: '14px', background: 'var(--signal)' }} />
        <Typography sx={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'var(--signal)', textTransform: 'uppercase' }}>{title}</Typography>
      </Box>
    )}
    <Box sx={{ p: 2 }}>{children}</Box>
  </Box>
);

const NeonText = ({ children, color = 'var(--signal)', size = '2rem' }: any) => (
  <Typography sx={{ fontSize: size, fontWeight: 900, color: color, fontFamily: 'var(--ff-mono)', textShadow: `0 0 15px ${color}66`, lineHeight: 1 }}>
    {children}
  </Typography>
);

function gaugeColor(score: number): string {
  if (score >= 80) return "#00ff41";
  if (score >= 60) return "#ff9f1a";
  return "#ff3b3b";
}

const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_ABBR = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];

function DateRangePicker({ dateStart, dateEnd, onChange }: {
  dateStart: string;
  dateEnd: string;
  onChange: (start: string, end: string) => void;
}) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [viewYear, setViewYear] = useState(() =>
    dateStart ? parseInt(dateStart.split('-')[0]) : new Date().getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    dateStart ? parseInt(dateStart.split('-')[1]) - 1 : new Date().getMonth()
  );
  const [hoverDate, setHoverDate] = useState('');
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<'start' | 'end'>(
    dateStart && !dateEnd ? 'end' : 'start'
  );

  useEffect(() => {
    if (dateStart) {
      setViewYear(parseInt(dateStart.split('-')[0]));
      setViewMonth(parseInt(dateStart.split('-')[1]) - 1);
    }
  }, [dateStart]);

  useEffect(() => {
    setPicking(dateStart && !dateEnd ? 'end' : 'start');
  }, [dateStart, dateEnd]);

  const prevMonth = () =>
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
  const nextMonth = () =>
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });

  function handleClick(ds: string) {
    if (picking === 'start' || (dateStart && dateEnd)) {
      onChange(ds, '');
    } else {
      const [s, e] = ds >= dateStart ? [dateStart, ds] : [ds, dateStart];
      onChange(s, e);
      setOpen(false);
      setHoverDate('');
    }
  }

  function buildWeeks(): (string | null)[][] {
    const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
    const off = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const pad = (n: number) => String(n).padStart(2, '0');
    const prefix = `${viewYear}-${pad(viewMonth + 1)}-`;
    const cells: (string | null)[] = [
      ...Array(off).fill(null),
      ...Array.from({ length: dim }, (_, i) => `${prefix}${pad(i + 1)}`),
    ];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }

  function getRange() {
    const eff = dateEnd || (picking === 'end' && hoverDate ? hoverDate : '');
    if (!dateStart || !eff) return { rs: dateStart, re: '' };
    return dateStart <= eff ? { rs: dateStart, re: eff } : { rs: eff, re: dateStart };
  }

  const { rs, re } = getRange();
  const weeks = buildWeeks();
  const fmt = (s: string) => {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };

  const navSx: any = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--signal)', fontSize: '20px', width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '4px', '&:hover': { bgcolor: 'rgba(60,255,158,0.1)' },
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
          pb: '4px', borderBottom: `1px solid ${open ? 'var(--signal)' : 'rgba(60,255,158,0.3)'}`,
          transition: 'border-color 0.2s', userSelect: 'none',
          '&:hover': { borderBottomColor: 'var(--signal)' },
        }}
      >
        <Typography sx={{ fontSize: '9px', color: 'var(--signal)', letterSpacing: '1.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>
          PERIOD
        </Typography>
        <Typography sx={{ fontSize: '11px', color: dateStart ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--ff-mono)', flex: 1 }}>
          {fmt(dateStart)} → {fmt(dateEnd)}
        </Typography>
        <Typography sx={{ fontSize: '9px', color: 'var(--text-dim)', ml: 0.5 }}>
          {open ? '▲' : '▼'}
        </Typography>
      </Box>

      {open && (
        <Box
          onClick={() => { setOpen(false); setHoverDate(''); }}
          sx={{ position: 'fixed', inset: 0, zIndex: 999 }}
        />
      )}

      {open && (
        <Box sx={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 1000,
          bgcolor: 'rgba(5, 14, 10, 0.98)', border: '1px solid rgba(60,255,158,0.25)',
          borderRadius: '10px', p: 2, width: 272,
          boxShadow: '0 16px 48px rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box component="button" onClick={prevMonth} sx={navSx}>‹</Box>
            <Typography sx={{ color: 'var(--signal)', fontSize: '11px', fontWeight: 900, letterSpacing: '2px', fontFamily: 'var(--ff-mono)' }}>
              {MONTH_NAMES_ES[viewMonth].toUpperCase()} {viewYear}
            </Typography>
            <Box component="button" onClick={nextMonth} sx={navSx}>›</Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
            {DAY_ABBR.map(d => (
              <Typography key={d} sx={{ textAlign: 'center', fontSize: '9px', color: 'var(--text-dim)', fontWeight: 700, py: '3px' }}>
                {d}
              </Typography>
            ))}
          </Box>

          {weeks.map((week, wi) => (
            <Box key={wi} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {week.map((ds, di) => {
                if (!ds) return <Box key={`_${wi}${di}`} sx={{ height: 36 }} />;
                const isSel = ds === dateStart || ds === dateEnd;
                const hasRange = !!(rs && re && rs !== re);
                const inRange = hasRange && ds > rs && ds < re;
                const isRs = hasRange && ds === rs;
                const isRe = hasRange && ds === re;
                const isToday = ds === todayStr;
                const day = parseInt(ds.split('-')[2]);
                let bg = 'transparent';
                if (inRange) bg = 'rgba(60,255,158,0.13)';
                else if (isRs) bg = 'linear-gradient(to right, transparent 50%, rgba(60,255,158,0.13) 50%)';
                else if (isRe) bg = 'linear-gradient(to left, transparent 50%, rgba(60,255,158,0.13) 50%)';
                return (
                  <Box
                    key={ds}
                    onClick={() => handleClick(ds)}
                    onMouseEnter={() => { if (picking === 'end') setHoverDate(ds); }}
                    onMouseLeave={() => setHoverDate('')}
                    sx={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: bg }}
                  >
                    <Box sx={{
                      width: 30, height: 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      bgcolor: isSel ? 'var(--signal)' : 'transparent',
                      color: isSel ? '#000' : isToday ? 'var(--signal)' : 'var(--text)',
                      fontSize: '12px', fontFamily: 'var(--ff-mono)',
                      fontWeight: isSel || isToday ? 700 : 400,
                      border: isToday && !isSel ? '1px solid rgba(60,255,158,0.4)' : 'none',
                      transition: 'background-color 0.1s',
                      '&:hover': { bgcolor: isSel ? 'var(--signal)' : 'rgba(60,255,158,0.2)' },
                    }}>
                      {day}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ))}

          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '9px', color: 'var(--signal)', fontWeight: 700, letterSpacing: '1px' }}>
              {picking === 'start' ? '► INICIO' : '► FIN'}
            </Typography>
            <Typography sx={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--ff-mono)' }}>
              {dateStart ? (dateEnd ? `${fmt(dateStart)} → ${fmt(dateEnd)}` : `${fmt(dateStart)} → ?`) : '—'}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function ExecutiveReport({ lang = "es" }: { lang?: "es" | "en" }) {
  const t = (key: keyof typeof translations.es) => (translations[lang] as any)[key] || key;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [reportData, setReportData] = useState<ValhallaReportJSON | null>(null);
  const [reportType, setReportType] = useState("monthly");
  const [companyName, setCompanyName] = useState("VALHALLA CYBERSECURITY");
  const [analystName, setAnalystName] = useState("Y. RAMIREZ");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [reportId, setReportId] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"api" | "fallback">("fallback");

  async function load() {
    setLoading(true);
    try {
      const raw = await fetchExecutiveReportData();
      const d = new Date(raw.generatedAt || Date.now());
      const year = d.getFullYear();
      const month = d.getMonth();
      const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(year, month + 1, 0).getDate();
      const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      const fmtDate = (s: string) => { const [y, m, da] = s.split("-"); return `${da}/${m}/${y}`; };
      const derivedPeriod = `${fmtDate(firstDay)} – ${fmtDate(lastDay)}`;
      const derivedReportId = `VHL-${year}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      setDateStart(firstDay);
      setDateEnd(lastDay);
      setReportId(derivedReportId);
      if (raw.analystNameFromBackend) setAnalystName(raw.analystNameFromBackend);
      const structured: ValhallaReportJSON = {
        report_metadata: {
          report_id: derivedReportId,
          generation_date: new Date().toISOString().split('T')[0],
          analyst_name: raw.analystNameFromBackend ?? analystName,
          company_name: companyName,
          period: derivedPeriod,
        },
        executive_summary: {
          status: raw.riskScore < 40 ? "Operativo" : "Alerta",
          health_score: 100 - raw.riskScore,
          key_finding: raw.backendKeyFinding ?? "Incremento crítico en ataques de denegación de servicio (DDoS) y fuerza bruta mitigados por el motor de IA."
        },
        wazuh_metrics: raw.wazuhMetrics ?? {
          total_alerts: 42890,
          critical_alerts: 145,
          top_affected_assets: [
            { name: "SRV-SAP-PROD", ip: "10.0.1.5", alerts: 1245 },
            { name: "GW-FIREWALL-01", ip: "10.0.1.1", alerts: 840 },
            { name: "WS-ADMIN-01", ip: "10.0.2.15", alerts: 620 }
          ]
        },
        mitre_coverage: raw.mitreCoverage ?? [
          { tactic: "Initial Access", count: 120, level: "High", icon: "📥" },
          { tactic: "Execution", count: 15, level: "Critical", icon: "⚡" },
          { tactic: "Persistence", count: 12, level: "Medium", icon: "🛡️" },
          { tactic: "Credential Access", count: 85, level: "Critical", icon: "🔑" },
          { tactic: "Lateral Movement", count: 4, level: "High", icon: "↗️" }
        ],
        honeypot_intel: raw.honeypotIntel ?? {
          unique_attackers: 1438,
          top_passwords_captured: ["admin123", "root", "Valhalla@123"],
          malware_samples_collected: 12
        },
        incident_management: raw.incidentManagement ?? {
          total_tickets: 45,
          closed_tickets: 42,
          avg_resolution_time_min: 18
        },
        remediation_steps: raw.remediationSteps ?? [
          { task: "Bloqueo de IPs persistentes en el firewall core.", action_cmd: "iptables -A INPUT -s 185.x.x.x -j DROP" },
          { task: "Actualización de parches en activos críticos.", action_cmd: "apt update && apt upgrade -y" },
          { task: "Refuerzo de política MFA para el grupo de Administradores." }
        ],
        iso27001: {
          overall: raw.iso27001?.overall ?? 73,
          controls: raw.iso27001?.controls ?? []
        },
        recommendations: raw.recommendations ?? [],
        geo_intel: raw.geoIntel ?? []
      };
      setReportData(structured);
      setDataSource(raw.source);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const healthColor = useMemo(() => gaugeColor(reportData?.executive_summary.health_score ?? 0), [reportData]);

  const period = useMemo(() => {
    if (!dateStart || !dateEnd) return "";
    const fmt = (s: string) => { const [y, m, da] = s.split("-"); return `${da}/${m}/${y}`; };
    return `${fmt(dateStart)} – ${fmt(dateEnd)}`;
  }, [dateStart, dateEnd]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  async function exportToPDF() {
    if (!reportData) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;
    const M = 20;
    const col = W - M * 2;

    const navy: [number, number, number] = [26, 58, 92];
    const black: [number, number, number] = [17, 17, 17];
    const gray: [number, number, number] = [100, 100, 100];
    const lightgray: [number, number, number] = [220, 220, 220];
    const white: [number, number, number] = [255, 255, 255];
    const red: [number, number, number] = [192, 57, 43];
    const orange: [number, number, number] = [211, 84, 0];
    const green: [number, number, number] = [39, 174, 96];
    const yellow: [number, number, number] = [243, 156, 18];

    const health = reportData.executive_summary.health_score;
    const statusColor: [number, number, number] = health >= 80 ? green : health >= 60 ? yellow : red;

    // ════════════════════════════
    // PÁGINA 1
    // ════════════════════════════
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");

    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 45, "F");

    if (logo) {
      try {
        const imgFormat = logo.startsWith('data:image/png')
          ? 'PNG' : 'JPEG';
        doc.addImage(logo, imgFormat, W - M - 22, 4, 20, 14);
      } catch (e) {
        console.warn('Logo no pudo agregarse al PDF:', e);
      }
    }

    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("INFORME EJECUTIVO DE SEGURIDAD", M, 20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Security Operations Center — Valhalla SOC", M, 30);

    doc.setFontSize(8);
    doc.text(`Ref: ${reportId}`, W - M, 18, { align: "right" });
    doc.text(`Fecha: ${reportData.report_metadata.generation_date}`, W - M, 25, { align: "right" });
    doc.text(`Período: ${period}`, W - M, 32, { align: "right" });
    doc.text(`Analista: ${analystName}`, W - M, 39, { align: "right" });

    doc.setFillColor(240, 243, 247);
    doc.rect(M, 52, col, 18, "F");
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(companyName, M + 5, 63);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Preparado para: Dirección General / Consejo de Administración", M + 5, 70);

    doc.setDrawColor(...lightgray);
    doc.setLineWidth(0.5);
    doc.line(M, 77, W - M, 77);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("1. ESTADO GENERAL DE SEGURIDAD", M, 88);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Este indicador resume la salud general de los sistemas de seguridad durante el período analizado.", M, 95);
    doc.text("Un valor superior al 80% indica que la infraestructura opera dentro de parámetros seguros.", M, 101);

    const kpis = [
      { label: "Salud del Sistema", value: `${health}%`, sub: "Estado general", color: statusColor },
      { label: "Pérdida Prevenida", value: `$${(reportData.wazuh_metrics.critical_alerts * 10000).toLocaleString()}`, sub: "Impacto evitado (est.)", color: navy },
      { label: "Incidentes Resueltos", value: `${reportData.incident_management.closed_tickets}/${reportData.incident_management.total_tickets}`, sub: "Tasa de resolución", color: green },
      { label: "Tiempo Respuesta", value: `${reportData.incident_management.avg_resolution_time_min} min`, sub: "Tiempo medio (MTTR)", color: navy },
    ];

    kpis.forEach((kpi, i) => {
      const x = M + i * (col / 4);
      const w = col / 4 - 3;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(x, 108, w, 30, 2, 2, "F");
      doc.setDrawColor(...lightgray);
      doc.roundedRect(x, 108, w, 30, 2, 2, "S");
      doc.setTextColor(...kpi.color);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(kpi.value, x + w / 2, 121, { align: "center" });
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(kpi.label, x + w / 2, 128, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(kpi.sub, x + w / 2, 133, { align: "center" });
    });

    doc.setDrawColor(...lightgray);
    doc.line(M, 146, W - M, 146);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("2. RESUMEN EJECUTIVO", M, 155);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Análisis automatizado generado por inteligencia artificial a partir de los datos del sistema de monitoreo.", M, 162);

    doc.setFillColor(248, 249, 250);
    doc.roundedRect(M, 166, col, 35, 2, 2, "F");
    doc.setDrawColor(...navy);
    doc.setLineWidth(2);
    doc.line(M, 166, M, 201);
    doc.setLineWidth(0.3);
    doc.setTextColor(...black);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const summaryText = reportData.executive_summary.key_finding + " Durante este período, el equipo de seguridad ha mantenido una postura defensiva activa, neutralizando intentos de acceso no autorizado y protegiendo los activos críticos de la organización.";
    const summaryLines = doc.splitTextToSize(summaryText, col - 10);
    doc.text(summaryLines, M + 5, 175);

    doc.setFillColor(232, 244, 253);
    doc.roundedRect(M, 207, col, 18, 2, 2, "F");
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("CONCLUSIÓN:", M + 4, 215);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...black);
    doc.text("La infraestructura permanece segura bajo monitoreo continuo con inteligencia artificial. No se han registrado brechas.", M + 4, 221);

    doc.setDrawColor(...lightgray);
    doc.setLineWidth(0.5);
    doc.line(M, 232, W - M, 232);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("3. ACTIVIDAD DE AMENAZAS", M, 241);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Las alertas son notificaciones automáticas generadas cuando el sistema detecta comportamiento sospechoso.", M, 248);

    const sevData = [
      { label: "CRÍTICO", value: reportData.wazuh_metrics.critical_alerts, color: red, desc: "Requiere acción inmediata" },
      { label: "TOTAL ALERTAS", value: reportData.wazuh_metrics.total_alerts, color: navy, desc: "Período analizado" },
      { label: "ATACANTES ÚNICOS", value: reportData.honeypot_intel.unique_attackers, color: orange, desc: "IPs distintas detectadas" },
    ];

    sevData.forEach((s, i) => {
      const x = M + i * (col / 3);
      const w = col / 3 - 3;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(x, 253, w, 22, 2, 2, "F");
      doc.setDrawColor(...s.color);
      doc.setLineWidth(1.5);
      doc.line(x, 253, x, 275);
      doc.setLineWidth(0.3);
      doc.setTextColor(...s.color);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(String(s.value), x + w / 2, 264, { align: "center" });
      doc.setTextColor(...black);
      doc.setFontSize(7);
      doc.text(s.label, x + w / 2, 270, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFontSize(6);
      doc.text(s.desc, x + w / 2, 274, { align: "center" });
    });

    doc.setFillColor(...navy);
    doc.rect(0, 285, W, 12, "F");
    doc.setTextColor(...white);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("CONFIDENCIAL — Uso exclusivo de la Dirección. No distribuir sin autorización.", M, 293);
    doc.text("Página 1 de 4", W - M, 293, { align: "right" });

    // ════════════════════════════
    // PÁGINA 2
    // ════════════════════════════
    doc.addPage();
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");

    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("ANÁLISIS DE AMENAZAS Y ACTIVIDAD DEL SISTEMA DE DETECCIÓN", M, 12);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("4. TIPOS DE ATAQUE DETECTADOS", M, 30);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    const mitreDesc = "A continuación se detallan las categorías de ataques identificados. Cada categoría representa una forma en que actores maliciosos intentaron comprometer los sistemas de la organización.";
    doc.text(doc.splitTextToSize(mitreDesc, col), M, 37);

    doc.setFillColor(...navy);
    doc.rect(M, 50, col, 10, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TIPO DE ATAQUE", M + 3, 57);
    doc.text("DETECCIONES", M + 95, 57);
    doc.text("NIVEL DE RIESGO", M + 130, 57);

    const mitreExplained: Record<string, string> = {
      "Initial Access": "Intento de entrada al sistema",
      "Execution": "Ejecución de código malicioso",
      "Persistence": "El atacante intenta quedarse",
      "Credential Access": "Robo de contraseñas",
      "Lateral Movement": "Movimiento dentro de la red",
    };

    const levelLabels: Record<string, string> = {
      "Critical": "MUY ALTO", "High": "ALTO", "Medium": "MEDIO", "Low": "BAJO",
    };

    (reportData.mitre_coverage ?? []).forEach((row, i) => {
      const y = 62 + i * 16;
      if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(M, y - 4, col, 14, "F"); }
      const lColor: [number, number, number] = row.level === "Critical" ? red : row.level === "High" ? orange : row.level === "Medium" ? yellow : green;
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(row.tactic, M + 3, y + 2);
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(mitreExplained[row.tactic] || "Actividad sospechosa", M + 3, y + 8);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(String(row.count), M + 100, y + 4);
      doc.setFillColor(...lColor);
      doc.roundedRect(M + 128, y - 1, 25, 8, 1, 1, "F");
      doc.setTextColor(...white);
      doc.setFontSize(6);
      doc.text(levelLabels[row.level] || row.level, M + 140, y + 4, { align: "center" });
    });

    const tableEndY = 62 + (reportData.mitre_coverage?.length ?? 0) * 16 + 10;

    doc.setDrawColor(...lightgray);
    doc.line(M, tableEndY, W - M, tableEndY);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("5. SISTEMA DE SEÑUELO (HONEYPOT)", M, tableEndY + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    const hpDesc = "Un honeypot es un sistema trampa diseñado para atraer atacantes. Cuando acceden, registramos sus técnicas sin que lleguen a los sistemas reales. Es como una puerta falsa para estudiar al intruso.";
    doc.text(doc.splitTextToSize(hpDesc, col), M, tableEndY + 19);

    const hpStartY = tableEndY + 38;
    const hpItems = [
      { label: "Atacantes únicos", value: String(reportData.honeypot_intel.unique_attackers), desc: "IPs distintas que intentaron acceder", color: orange },
      { label: "Muestras de malware", value: String(reportData.honeypot_intel.malware_samples_collected), desc: "Archivos maliciosos analizados", color: red },
      { label: "Contraseñas probadas", value: String(reportData.honeypot_intel.top_passwords_captured.length), desc: "Contraseñas usadas por atacantes", color: navy },
    ];

    hpItems.forEach((item, i) => {
      const x = M + i * (col / 3);
      const w = col / 3 - 3;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(x, hpStartY, w, 32, 2, 2, "F");
      doc.setDrawColor(...item.color);
      doc.setLineWidth(1);
      doc.roundedRect(x, hpStartY, w, 32, 2, 2, "S");
      doc.setLineWidth(0.3);
      doc.setTextColor(...item.color);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(item.value, x + w / 2, hpStartY + 14, { align: "center" });
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(item.label, x + w / 2, hpStartY + 21, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(doc.splitTextToSize(item.desc, w - 4), x + w / 2, hpStartY + 27, { align: "center" });
    });

    const pwY = hpStartY + 42;
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Contraseñas más utilizadas por los atacantes:", M, pwY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text("Asegúrese de que su organización NO utiliza ninguna de estas contraseñas.", M, pwY + 6);

    (reportData.honeypot_intel.top_passwords_captured ?? []).forEach((pw, i) => {
      const pwX = M + i * 55;
      doc.setFillColor(253, 237, 236);
      doc.setDrawColor(...red);
      doc.roundedRect(pwX, pwY + 10, 50, 10, 2, 2, "FD");
      doc.setTextColor(...red);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(pw, pwX + 25, pwY + 17, { align: "center" });
    });

    doc.setFillColor(...navy);
    doc.rect(0, 285, W, 12, "F");
    doc.setTextColor(...white);
    doc.setFontSize(7);
    doc.text("CONFIDENCIAL — Uso exclusivo de la Dirección. No distribuir sin autorización.", M, 293);
    doc.text("Página 2 de 4", W - M, 293, { align: "right" });

    // ════════════════════════════
    // PÁGINA 3 — GEO INTEL
    // ════════════════════════════
    doc.addPage();
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");

    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("INTELIGENCIA GEOGRÁFICA DE AMENAZAS", M, 12);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("6. ORIGEN GEOGRÁFICO DE LOS ATAQUES", M, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Países desde donde se originó la mayor parte del tráfico malicioso detectado durante el período.", M, 37);

    const geoData = (reportData.geo_intel ?? []).map(e => ({ name: e.country, pct: e.pct, desc: e.desc }));

    const barStartX = M + 28;
    const barMaxW = 55;
    geoData.forEach((g, i) => {
      const gy = 50 + i * 22;
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(g.name, M, gy + 6);
      doc.setFillColor(...lightgray);
      doc.roundedRect(barStartX, gy, barMaxW, 8, 2, 2, "F");
      doc.setFillColor(...navy);
      doc.roundedRect(barStartX, gy, barMaxW * g.pct / 100, 8, 2, 2, "F");
      const pctX = barStartX + barMaxW + 3;
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`${g.pct}%`, pctX, gy + 6);
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const descMaxW = W - M - pctX - 8;
      doc.text(doc.splitTextToSize(g.desc, descMaxW), W - M, gy + 6, { align: "right" });
    });

    doc.setFillColor(...navy);
    doc.rect(0, 285, W, 12, "F");
    doc.setTextColor(...white);
    doc.setFontSize(7);
    doc.text("CONFIDENCIAL — Uso exclusivo de la Dirección. No distribuir sin autorización.", M, 293);
    doc.text("Página 3 de 4", W - M, 293, { align: "right" });

    // ════════════════════════════
    // PÁGINA 3
    // ════════════════════════════
    doc.addPage();
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");

    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PLAN DE ACCIÓN Y CUMPLIMIENTO NORMATIVO", M, 12);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("7. ACCIONES CORRECTIVAS RECOMENDADAS", M, 30);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Medidas concretas que el equipo de seguridad debe ejecutar para reducir el riesgo identificado.", M, 37);

    let remY2 = 44;
    (reportData.remediation_steps ?? []).forEach((step, i) => {
      const stepH = step.action_cmd ? 30 : 20;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(M, remY2, col, stepH, 2, 2, "F");
      doc.setDrawColor(...navy);
      doc.setLineWidth(1.5);
      doc.line(M, remY2, M, remY2 + stepH);
      doc.setLineWidth(0.3);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`Acción ${i + 1}`, M + 4, remY2 + 8);
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(step.task, col - 20), M + 4, remY2 + 15);
      if (step.action_cmd) {
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(M + 4, remY2 + 18, col - 8, 9, 1, 1, "F");
        doc.setTextColor(...gray);
        doc.setFont("courier", "normal");
        doc.setFontSize(7);
        doc.text(step.action_cmd, M + 7, remY2 + 24);
      }
      remY2 += stepH + 5;
    });

    remY2 += 5;
    doc.setDrawColor(...lightgray);
    doc.line(M, remY2, W - M, remY2);
    remY2 += 10;

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("8. RECOMENDACIONES PRIORIZADAS PARA DIRECCIÓN", M, remY2);
    remY2 += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("Acciones ordenadas por urgencia e impacto en la seguridad de la organización.", M, remY2);
    remY2 += 8;

    const recPriority = [
      { label: "INMEDIATO", color: red, days: "Hoy mismo" },
      { label: "ESTA SEMANA", color: orange, days: "3-5 días" },
      { label: "ESTE MES", color: yellow, days: "2-4 semanas" },
      { label: "PLANIFICAR", color: green, days: "Próx. trimestre" },
    ];

    (reportData.recommendations ?? []).forEach((rec, i) => {
      const p = recPriority[i] || recPriority[3];
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(M, remY2, col, 22, 2, 2, "F");
      doc.setFillColor(...p.color);
      doc.roundedRect(M, remY2, 28, 22, 2, 2, "F");
      doc.setTextColor(...white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.text(p.label, M + 14, remY2 + 9, { align: "center" });
      doc.text(p.days, M + 14, remY2 + 15, { align: "center" });
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(rec.replace(/^P\d+ - /i, ""), col - 35), M + 32, remY2 + 10);
      remY2 += 26;
    });

    remY2 += 5;
    doc.setDrawColor(...lightgray);
    doc.line(M, remY2, W - M, remY2);
    remY2 += 10;

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("9. CUMPLIMIENTO NORMATIVO — ISO/IEC 27001:2022", M, remY2);
    remY2 += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text("La ISO 27001 es la norma internacional de seguridad. Evalúa si la organización gestiona adecuadamente los riesgos de información.", M, remY2);
    remY2 += 6;

    const isoScore2 = reportData.iso27001?.overall ?? 73;
    const isoColor2: [number, number, number] = isoScore2 >= 80 ? green : isoScore2 >= 60 ? yellow : red;
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Nivel de cumplimiento global estimado:", M + 4, remY2 + 5);
    doc.setTextColor(...isoColor2);
    doc.setFontSize(13);
    doc.text(`${isoScore2}%`, M + 120, remY2 + 5);
    remY2 += 12;

    const ctrlExplained: Record<string, string> = {
      "A.5.7 Threat Intelligence": "Uso de información sobre amenazas externas para anticipar ataques",
      "A.5.24 Incident Management Planning": "Procedimiento documentado para responder a incidentes de seguridad",
      "A.8.16 Monitoring Activities": "Vigilancia continua de sistemas para detectar actividad anómala",
    };

    const statusLabels: Record<string, string> = { covered: "CUMPLE", partial: "PARCIAL", gap: "INCUMPLE" };

    (reportData.iso27001?.controls ?? []).forEach((ctrl) => {
      const sColor: [number, number, number] = ctrl.status === "covered" ? green : ctrl.status === "partial" ? yellow : red;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(M, remY2, col, 20, 2, 2, "F");
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(ctrl.control, M + 4, remY2 + 7);
      doc.setFillColor(...sColor);
      doc.roundedRect(W - M - 22, remY2 + 3, 20, 8, 2, 2, "F");
      doc.setTextColor(...white);
      doc.setFontSize(6);
      doc.text(statusLabels[ctrl.status] || ctrl.status.toUpperCase(), W - M - 12, remY2 + 8, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(ctrlExplained[ctrl.control] || ctrl.note, M + 4, remY2 + 14);
      remY2 += 24;
    });

    doc.setFillColor(...navy);
    doc.rect(0, 285, W, 12, "F");
    doc.setTextColor(...white);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("CONFIDENCIAL — Uso exclusivo de la Dirección. No distribuir sin autorización.", M, 293);
    doc.text("Página 4 de 4", W - M, 293, { align: "right" });

    doc.save(`valhalla-informe-ejecutivo-${reportData.report_metadata.generation_date}.pdf`);
  }

  async function exportTechnicalPDF() {
    if (!reportData) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210, M = 20, col = W - M * 2;
    const TOTAL_PAGES = 4;

    const navy: [number, number, number] = [26, 58, 92];
    const black: [number, number, number] = [17, 17, 17];
    const gray: [number, number, number] = [100, 100, 100];
    const lightgray: [number, number, number] = [220, 220, 220];
    const white: [number, number, number] = [255, 255, 255];
    const red: [number, number, number] = [192, 57, 43];
    const orange: [number, number, number] = [211, 84, 0];
    const green: [number, number, number] = [39, 174, 96];
    const yellow: [number, number, number] = [243, 156, 18];

    const health = reportData.executive_summary.health_score;
    const statusColor: [number, number, number] = health >= 80 ? green : health >= 60 ? yellow : red;
    const closureRate = reportData.incident_management.total_tickets > 0
      ? Math.round(reportData.incident_management.closed_tickets / reportData.incident_management.total_tickets * 100)
      : 0;
    const mttr = reportData.incident_management.avg_resolution_time_min;
    const pendingTickets = reportData.incident_management.total_tickets - reportData.incident_management.closed_tickets;

    const pageHeader = (subtitle: string) => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, W, 18, "F");
      doc.setTextColor(...white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(subtitle, M, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`${reportId} · ${analystName} · ${period}`, W - M, 12, { align: "right" });
    };

    const pageFooter = (page: number) => {
      doc.setFillColor(...navy);
      doc.rect(0, 285, W, 12, "F");
      doc.setTextColor(...white);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("CONFIDENCIAL — INFORME TÉCNICO. Uso exclusivo del equipo de seguridad.", M, 293);
      doc.text(`Página ${page} de ${TOTAL_PAGES}`, W - M, 293, { align: "right" });
    };

    const sectionTitle = (title: string, y: number): number => {
      doc.setDrawColor(...lightgray);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, M, y + 8);
      return y + 14;
    };

    const bodyText = (text: string, y: number, maxW = col): number => {
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(text, maxW);
      doc.text(lines, M, y);
      return y + lines.length * 4.5 + 2;
    };

    const analysisBox = (text: string, y: number, maxW = 130, ref = ""): number => {
      doc.setFillColor(232, 239, 248);
      const lines = doc.splitTextToSize(text, maxW);
      const refLines = ref ? doc.splitTextToSize(ref, maxW) : [];
      const boxH = Math.max(16, (lines.length + (refLines.length > 0 ? refLines.length + 0.5 : 0)) * 4.5 + 8);
      doc.roundedRect(M, y, col, boxH, 2, 2, "F");
      doc.setDrawColor(...navy);
      doc.setLineWidth(1.5);
      doc.line(M, y, M, y + boxH);
      doc.setLineWidth(0.3);
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.saveGraphicsState();
      doc.rect(M + 2, y, col - 4, boxH);
      doc.clip();
      doc.text(lines, M + 8, y + 6);
      if (refLines.length > 0) {
        const refY = y + 6 + lines.length * 4.5 + 2;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.text(refLines, M + 8, refY);
      }
      doc.restoreGraphicsState();
      return y + boxH + 4;
    };

    // ── PÁGINA 1: Portada y Resumen Ejecutivo ──────────────────────────────
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");
    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 52, "F");

    if (logo) {
      try {
        const imgFormat = logo.startsWith('data:image/png')
          ? 'PNG' : 'JPEG';
        doc.addImage(logo, imgFormat, W - M - 22, 4, 20, 14);
      } catch (e) {
        console.warn('Logo no pudo agregarse al PDF:', e);
      }
    }

    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("INFORME TÉCNICO DE SEGURIDAD", M, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Security Operations Center — Valhalla SOC", M, 27);
    doc.setFontSize(8);
    doc.text("Orientado a CISO y Responsables de Seguridad", M, 35);
    doc.text(`Ref: ${reportId}`, W - M, 18, { align: "right" });
    doc.text(`Fecha: ${reportData.report_metadata.generation_date}`, W - M, 26, { align: "right" });
    doc.text(`Período: ${period}`, W - M, 34, { align: "right" });
    doc.text(`Analista: ${analystName}`, W - M, 42, { align: "right" });
    doc.text(`Cliente: ${companyName}`, W - M, 50, { align: "right" });

    doc.setFillColor(...statusColor);
    doc.rect(M, 60, col, 14, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`ESTADO: ${reportData.executive_summary.status.toUpperCase()} — Salud del sistema: ${health}%`, M + 4, 65);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Alertas críticas: ${reportData.wazuh_metrics.critical_alerts}  ·  MTTR: ${mttr} min  ·  Tasa de cierre: ${closureRate}%`, M + 4, 71);

    let y1 = 82;
    y1 = sectionTitle("1. ESTADO GENERAL DEL SISTEMA", y1);
    const stateNarrative = health >= 80
      ? `El sistema de seguridad de ${companyName} opera en condiciones óptimas durante ${period}. El índice de salud del ${health}% refleja una postura defensiva consolidada con todos los controles activos. No se han registrado brechas de datos confirmadas. El equipo SOC mantuvo vigilancia continua con respuesta efectiva a las ${reportData.wazuh_metrics.total_alerts.toLocaleString()} alertas procesadas.`
      : health >= 60
      ? `El sistema presenta estado de alerta moderada durante ${period}. El índice de salud del ${health}% indica que algunos controles requieren refuerzo. Se detectaron ${reportData.wazuh_metrics.critical_alerts} alertas críticas que requirieron intervención manual. No se registraron brechas confirmadas, pero la actividad maliciosa exige revisión de los procedimientos de respuesta.`
      : `El sistema se encuentra en estado crítico durante ${period}. El índice de salud del ${health}% está por debajo del umbral mínimo aceptable. Se registraron ${reportData.wazuh_metrics.critical_alerts} alertas críticas. Se requiere intervención inmediata y revisión urgente de los controles comprometidos.`;
    y1 = bodyText(stateNarrative, y1);
    y1 += 4;

    y1 = sectionTitle("2. RESUMEN EJECUTIVO TÉCNICO", y1);
    y1 = bodyText(reportData.executive_summary.key_finding, y1);
    y1 += 3;

    const execAnalysis = [
      `• ${reportData.wazuh_metrics.total_alerts.toLocaleString()} alertas procesadas en ${period}`,
      `• ${reportData.wazuh_metrics.critical_alerts} críticas con intervención manual`,
      `• Tasa de resolución: ${closureRate}%`,
      `• MTTR: ${mttr} min`,
      `• IA redujo tiempo de detección y respuesta`,
    ].join("\n");
    y1 = analysisBox(execAnalysis, y1);
    y1 += 3;

    if ((reportData.wazuh_metrics.top_affected_assets ?? []).length > 0) {
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("ACTIVOS MÁS AFECTADOS:", M, y1);
      y1 += 5;
      (reportData.wazuh_metrics.top_affected_assets ?? []).forEach((asset, i) => {
        if (i % 2 === 0) doc.setFillColor(248, 249, 250); else doc.setFillColor(255, 255, 255);
        doc.rect(M, y1, col, 9, "F");
        doc.setTextColor(...black);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(asset.name, M + 3, y1 + 6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...gray);
        doc.text(`IP: ${asset.ip}`, M + 65, y1 + 6);
        doc.setTextColor(...red);
        doc.setFont("helvetica", "bold");
        doc.text(`${asset.alerts} alertas`, W - M - 3, y1 + 6, { align: "right" });
        y1 += 9;
      });
    }
    pageFooter(1);

    // ── PÁGINA 2: MITRE ATT&CK + Honeypot ─────────────────────────────────
    doc.addPage();
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");
    pageHeader("ANÁLISIS MITRE ATT&CK E INTELIGENCIA DE HONEYPOT");

    let y2 = 26;
    y2 = sectionTitle("3. ANÁLISIS DE TÁCTICAS MITRE ATT&CK", y2);

    const sortedMitre = [...(reportData.mitre_coverage ?? [])].sort((a, b) => b.count - a.count);
    const topTactic = sortedMitre[0];
    const criticalTactics = (reportData.mitre_coverage ?? []).filter(m => m.level === "Critical");
    const totalMitreEvents = (reportData.mitre_coverage ?? []).reduce((s, m) => s + m.count, 0);
    const mitreNarrative = `Se registraron ${totalMitreEvents} eventos en ${(reportData.mitre_coverage ?? []).length} tácticas MITRE ATT&CK. La táctica dominante fue "${topTactic?.tactic ?? "N/A"}" con ${topTactic?.count ?? 0} detecciones (${totalMitreEvents > 0 ? Math.round(((topTactic?.count ?? 0) / totalMitreEvents) * 100) : 0}% del total). ${criticalTactics.length > 0 ? `Se identificaron ${criticalTactics.length} táctica(s) en nivel CRÍTICO: ${criticalTactics.map(m => m.tactic).join(" y ")}. Estas requieren revisión forense inmediata y escalado al equipo IRT.` : "No se registraron tácticas en nivel crítico, indicando buen nivel de contención."}`;
    y2 = bodyText(mitreNarrative, y2);
    y2 += 3;

    const mitreExplainedT: Record<string, string> = {
      "Initial Access": "Entrada al sistema", "Execution": "Código malicioso",
      "Persistence": "El atacante persiste", "Credential Access": "Robo contraseñas",
      "Lateral Movement": "Mov. en red",
    };
    const levelLabelsT: Record<string, string> = {
      "Critical": "MUY ALTO", "High": "ALTO", "Medium": "MEDIO", "Low": "BAJO",
    };

    doc.setFillColor(...navy);
    doc.rect(M, y2, col, 9, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("TÁCTICA", M + 3, y2 + 6);
    doc.text("EVENTOS", M + 78, y2 + 6);
    doc.text("NIVEL", M + 108, y2 + 6);
    doc.text("DESCRIPCIÓN", M + 132, y2 + 6);
    y2 += 9;
    (reportData.mitre_coverage ?? []).forEach((row, i) => {
      if (i % 2 === 0) doc.setFillColor(248, 249, 250); else doc.setFillColor(255, 255, 255);
      doc.rect(M, y2, col, 10, "F");
      const lc: [number, number, number] = row.level === "Critical" ? red : row.level === "High" ? orange : row.level === "Medium" ? yellow : green;
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(row.tactic, M + 3, y2 + 7);
      doc.setTextColor(...navy);
      doc.text(String(row.count), M + 80, y2 + 7);
      doc.setFillColor(...lc);
      doc.roundedRect(M + 104, y2 + 1, 22, 7, 1, 1, "F");
      doc.setTextColor(...white);
      doc.setFontSize(6);
      doc.text(levelLabelsT[row.level] || row.level, M + 115, y2 + 6, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(mitreExplainedT[row.tactic] || "Actividad sospechosa", W - M - (M + 132))[0], M + 132, y2 + 7);
      y2 += 10;
    });
    y2 += 5;

    const mitrePct = totalMitreEvents > 0 ? Math.round(((topTactic?.count ?? 0) / totalMitreEvents) * 100) : 0;
    const mitreConclusion = [
      `• Táctica dominante: "${topTactic?.tactic ?? "N/A"}"`,
      `• ${topTactic?.count ?? 0} eventos (${mitrePct}% del total)`,
      criticalTactics.length > 0
        ? `• ${criticalTactics.length} táctica(s) en nivel CRÍTICO`
        : `• Sin tácticas en nivel CRÍTICO`,
      `• Revisar firewall y aplicar threat hunting`,
    ].join("\n");
    y2 = analysisBox(mitreConclusion, y2, col - 18, "Ref: MITRE D3FEND, ISO 27001 A.13.1.");
    y2 += 4;

    y2 = sectionTitle("4. INTELIGENCIA DE HONEYPOT COWRIE", y2);
    const passwords = reportData.honeypot_intel.top_passwords_captured ?? [];
    const honeypotNarrative = `El sistema honeypot registró ${reportData.honeypot_intel.unique_attackers.toLocaleString()} atacantes únicos con ${reportData.honeypot_intel.malware_samples_collected} muestras de malware capturadas. Las contraseñas más usadas por los atacantes fueron: ${passwords.join(", ") || "no registradas"}. Este patrón es característico de ataques automatizados con credential stuffing y diccionarios genéricos, indicando campañas masivas no dirigidas específicamente a esta organización.`;
    y2 = bodyText(honeypotNarrative, y2);
    y2 += 3;
    const honeypotConclusion = [
      `• Contraseña top: "${passwords[0] ?? "admin"}"`,
      `• Confirma uso de diccionarios básicos`,
      `• Verificar credenciales en sistemas activos`,
      `• Compartir IOCs con MISP/ISAC`,
    ].join("\n");
    y2 = analysisBox(honeypotConclusion, y2, col - 18, "Ref: ISO 27001 A.12.4, NIST SP 800-150.");
    pageFooter(2);

    // ── PÁGINA 3: Geo Intel + Gestión de Incidentes ────────────────────────
    doc.addPage();
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");
    pageHeader("INTELIGENCIA GEOGRÁFICA Y GESTIÓN DE INCIDENTES");

    let y3 = 26;
    y3 = sectionTitle("5. ORIGEN GEOGRÁFICO DE LOS ATAQUES", y3);
    const geoData3 = reportData.geo_intel ?? [];
    const topGeo = geoData3[0];
    const geoNarrative = topGeo
      ? `El ${topGeo.pct}% del tráfico malicioso se originó desde ${topGeo.country} (${topGeo.desc}). Esta distribución es consistente con la actividad de grupos APT documentados en estas regiones. Los ataques desde jurisdicciones con limitada cooperación judicial dificultan la atribución legal; la estrategia recomendada es contención técnica mediante geofencing y bloqueo proactivo de rangos IP conocidos como maliciosos en feeds de CTI.`
      : "No se dispone de datos geográficos para este período.";
    y3 = bodyText(geoNarrative, y3);
    y3 += 4;

    if (geoData3.length > 0) {
      const bStart = M + 28, bMax = 55;
      geoData3.forEach(g => {
        doc.setTextColor(...black);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(doc.splitTextToSize(g.country, bStart - M - 2)[0], M, y3 + 6);
        doc.setFillColor(...lightgray);
        doc.roundedRect(bStart, y3, bMax, 7, 2, 2, "F");
        doc.setFillColor(...navy);
        doc.roundedRect(bStart, y3, bMax * g.pct / 100, 7, 2, 2, "F");
        const pX = bStart + bMax + 3;
        doc.setTextColor(...navy);
        doc.setFontSize(8);
        doc.text(`${g.pct}%`, pX, y3 + 6);
        doc.setTextColor(...gray);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        const descLines = doc.splitTextToSize(g.desc, W - M - pX - 8);
        doc.text(descLines, W - M, y3 + 6, { align: "right" });
        y3 += 18;
      });
    }
    y3 += 4;

    y3 = sectionTitle("6. GESTIÓN DE INCIDENTES Y MÉTRICAS OPERATIVAS", y3);
    const incKpis = [
      { label: "TOTAL TICKETS", value: String(reportData.incident_management.total_tickets), sub: "Período analizado", color: navy },
      { label: "RESUELTOS", value: String(reportData.incident_management.closed_tickets), sub: `Tasa: ${closureRate}%`, color: green },
      { label: "PENDIENTES", value: String(pendingTickets), sub: "Requieren seguimiento", color: pendingTickets === 0 ? green : red },
      { label: "MTTR", value: `${mttr}m`, sub: "Tiempo medio resolución", color: mttr <= 30 ? green : mttr <= 60 ? orange : red },
    ];
    incKpis.forEach((kpi, i) => {
      const kx = M + i * (col / 4);
      const kw = col / 4 - 2;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(kx, y3, kw, 26, 2, 2, "F");
      doc.setDrawColor(...kpi.color);
      doc.setLineWidth(1.5);
      doc.line(kx, y3, kx, y3 + 26);
      doc.setLineWidth(0.3);
      doc.setTextColor(...kpi.color);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(kpi.value, kx + kw / 2, y3 + 14, { align: "center" });
      doc.setTextColor(...black);
      doc.setFontSize(6.5);
      doc.text(kpi.label, kx + kw / 2, y3 + 20, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(kpi.sub, kx + kw / 2, y3 + 24, { align: "center" });
    });
    y3 += 32;

    const closureVerdict = closureRate >= 90
      ? "supera el objetivo del 90% recomendado por ITIL"
      : `está por debajo del objetivo del 90% — los ${pendingTickets} tickets abiertos deben priorizarse`;
    const mttrVerdict = mttr <= 30
      ? "se sitúa dentro del umbral de excelencia (< 30 min) del NIST SP 800-61"
      : mttr <= 60
      ? "es aceptable según NIST SP 800-61, aunque supera el objetivo óptimo de 30 min"
      : "supera el umbral recomendado por NIST SP 800-61 — revisar urgentemente los procedimientos de escalado";
    const mttrStatus = mttr <= 30 ? "óptimo (<30 min)" : mttr <= 60 ? "aceptable (30–60 min)" : "crítico (>60 min)";
    const closureStatus = closureRate >= 90 ? "cumple objetivo ITIL" : "bajo objetivo ITIL";
    const incidentAnalysis = [
      `• MTTR: ${mttr} min — ${mttrStatus}`,
      `• Tasa de cierre: ${closureRate}% — ${closureStatus}`,
      `• Tickets pendientes: ${pendingTickets}`,
      `• Establecer SLAs formales por severidad`,
    ].join("\n");
    y3 = analysisBox(incidentAnalysis, y3, col - 18, "Ref: ISO 27001 A.16.1.");
    pageFooter(3);

    // ── PÁGINA 4: Remediación detallada + ISO 27001 ────────────────────────
    doc.addPage();
    doc.setFillColor(...white);
    doc.rect(0, 0, W, 297, "F");
    pageHeader("PLAN DE REMEDIACIÓN Y CUMPLIMIENTO ISO 27001");

    let y4 = 26;
    y4 = sectionTitle("7. PLAN DE REMEDIACIÓN TÉCNICA DETALLADO", y4);
    y4 = bodyText("Cada acción incluye estimación de esfuerzo, referencia normativa y responsable operativo sugerido.", y4);
    y4 += 3;

    const remMeta = [
      { time: "2–4 h", ref: "ISO 27001 A.13.1 / NIST SP 800-41", owner: "Equipo de Red" },
      { time: "4–8 h", ref: "ISO 27001 A.12.6 / NIST SP 800-40", owner: "Equipo de Sistemas" },
      { time: "1–2 días", ref: "ISO 27001 A.9.4 / NIST SP 800-63B", owner: "IT Admin + CISO" },
      { time: "2–4 h", ref: "ISO 27001 A.12.1 / NIST SP 800-53", owner: "DevSecOps" },
    ];
    (reportData.remediation_steps ?? []).slice(0, 3).forEach((step, i) => {
      const meta = remMeta[i] ?? remMeta[0];
      const hasCmd = !!step.action_cmd;
      const boxH = hasCmd ? 32 : 22;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(M, y4, col, boxH, 2, 2, "F");
      doc.setDrawColor(...navy);
      doc.setLineWidth(2);
      doc.line(M, y4, M, y4 + boxH);
      doc.setLineWidth(0.3);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`ACCIÓN ${i + 1}`, M + 4, y4 + 7);
      doc.setFillColor(...navy);
      doc.roundedRect(W - M - 36, y4 + 2, 34, 6, 1, 1, "F");
      doc.setTextColor(...white);
      doc.setFontSize(6);
      doc.text(`⏱ ${meta.time}`, W - M - 19, y4 + 6, { align: "center" });
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(step.task, col - 16)[0], M + 4, y4 + 14);
      if (hasCmd) {
        doc.setFillColor(230, 230, 230);
        doc.roundedRect(M + 4, y4 + 17, col - 8, 9, 1, 1, "F");
        doc.setTextColor(...gray);
        doc.setFont("courier", "normal");
        doc.setFontSize(7);
        doc.text(doc.splitTextToSize(step.action_cmd!, col - 16)[0], M + 7, y4 + 23);
      }
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.text(doc.splitTextToSize(`Ref: ${meta.ref}  —  Responsable: ${meta.owner}`, col - 10)[0], M + 4, y4 + boxH - 2);
      y4 += boxH + 4;
    });
    y4 += 3;

    y4 = sectionTitle("8. CUMPLIMIENTO NORMATIVO — ISO/IEC 27001:2022", y4);
    const isoScore = reportData.iso27001?.overall ?? 73;
    const isoColor: [number, number, number] = isoScore >= 80 ? green : isoScore >= 60 ? yellow : red;
    doc.setFillColor(240, 243, 247);
    doc.roundedRect(M, y4, col, 14, 2, 2, "F");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Nivel de cumplimiento global estimado:", M + 4, y4 + 9);
    doc.setTextColor(...isoColor);
    doc.setFontSize(13);
    doc.text(`${isoScore}%`, M + 118, y4 + 9);
    doc.setTextColor(...gray);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(isoScore >= 80 ? "Cumplimiento satisfactorio" : isoScore >= 60 ? "Cumplimiento parcial" : "Incumplimiento significativo", W - M - (M + 132))[0], M + 132, y4 + 9);
    y4 += 16;

    const isoNarrative = isoScore >= 80
      ? `La organización mantiene cumplimiento satisfactorio con ISO/IEC 27001:2022. Los controles cubren las áreas críticas de gestión de activos, control de accesos y respuesta a incidentes. Se recomienda continuar el programa de mejora continua y preparar la siguiente auditoría interna.`
      : isoScore >= 60
      ? `El ${isoScore}% de cumplimiento indica gaps en algunas áreas de control. Priorizar la implementación de controles pendientes antes de la próxima auditoría. Focalizar esfuerzos en las áreas con mayor exposición al riesgo identificado en este informe.`
      : `El ${isoScore}% está por debajo del umbral mínimo recomendado. Se requiere un plan de remediación urgente y revisión completa del SGSI. Considerar apoyo de consultor externo especializado en ISO 27001.`;
    y4 = bodyText(isoNarrative, y4);
    y4 += 4;

    const ctrlNarrative: Record<string, string> = {
      "A.5.7 Threat Intelligence": "Inteligencia activa vía Cowrie + SIEM. Gap potencial: integración con feeds externos de CTI.",
      "A.5.24 Incident Management Planning": "Procedimiento operativo activo. Verificar que el runbook esté actualizado y probado con simulacros.",
      "A.8.16 Monitoring Activities": "Monitoreo continuo vía Wazuh + OpenSearch. Revisar retención de logs (mínimo 12 meses según ISO 27001).",
    };
    const statusLabelsT: Record<string, string> = { covered: "CUMPLE", partial: "PARCIAL", gap: "INCUMPLE" };
    (reportData.iso27001?.controls ?? []).forEach((ctrl) => {
      const sColor: [number, number, number] = ctrl.status === "covered" ? green : ctrl.status === "partial" ? yellow : red;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(M, y4, col, 18, 2, 2, "F");
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(ctrl.control, M + 4, y4 + 7);
      doc.setFillColor(...sColor);
      doc.roundedRect(W - M - 22, y4 + 3, 20, 7, 2, 2, "F");
      doc.setTextColor(...white);
      doc.setFontSize(6);
      doc.text(statusLabelsT[ctrl.status] || ctrl.status.toUpperCase(), W - M - 12, y4 + 8, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(ctrlNarrative[ctrl.control] || ctrl.note, col - 30)[0], M + 4, y4 + 14);
      y4 += 22;
    });

    pageFooter(4);
    doc.save(`valhalla-informe-tecnico-${reportData.report_metadata.generation_date}.pdf`);
  }

  if (loading) return (
    <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-void)' }}>
      <CircularProgress sx={{ color: 'var(--signal)' }} />
    </Box>
  );

  if (error) return (
    <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-void)', p: 4 }}>
      <GlassCard title="ERROR DE CARGA" sx={{ maxWidth: 500, textAlign: 'center' }}>
        <Typography sx={{ color: 'var(--danger)', fontSize: '13px', mb: 3, fontFamily: 'var(--ff-mono)', wordBreak: 'break-word' }}>
          {error}
        </Typography>
        <Button variant="outlined" onClick={load} sx={{ borderColor: 'var(--signal)', color: 'var(--signal)', '&:hover': { borderColor: 'var(--signal-bright)', color: 'var(--signal-bright)' } }}>
          REINTENTAR
        </Button>
      </GlassCard>
    </Box>
  );

  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: 4, bgcolor: "var(--bg-void)", color: "var(--text)" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 6 }}>
        <Stack direction="row" spacing={3} alignItems="center">
          <Box sx={{ width: 80, height: 80, borderRadius: '16px', background: logo ? `url(${logo}) center/contain no-repeat` : 'var(--signal)', border: '2px solid var(--signal-dim)', display: 'grid', placeItems: 'center', boxShadow: '0 0 30px rgba(60,255,158,0.2)' }}>
            {!logo && <Typography variant="h3" sx={{ color: '#000', fontWeight: 900 }}>V</Typography>}
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '4px', textShadow: '0 0 15px var(--signal-glow)' }}>
              EXECUTIVE <span style={{ color: 'var(--signal)' }}>REPORT</span>
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase' }}>
              {companyName} // SESSION: {reportId}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={2}>
          <Chip
            label={dataSource === "api" ? "● DATOS REALES" : "○ SIMULACIÓN"}
            size="small"
            variant="outlined"
            sx={{
              color: dataSource === "api" ? 'var(--signal)' : 'var(--amber)',
              borderColor: dataSource === "api" ? 'rgba(60,255,158,0.4)' : 'rgba(255,159,26,0.4)',
              fontSize: '9px',
              fontWeight: 'bold',
              letterSpacing: '1px',
            }}
          />
          <Button variant="outlined" onClick={() => setPreviewMode(!previewMode)} sx={{ borderColor: 'var(--line)', color: 'var(--text-dim)', '&:hover': { borderColor: 'var(--signal)', color: 'var(--signal)' } }}>
            {previewMode ? 'EDIT CONFIG' : 'PREVIEW UI'}
          </Button>
          <Button variant="outlined" onClick={load} sx={{ borderColor: 'var(--line)', color: 'var(--text-dim)', '&:hover': { borderColor: 'var(--signal)', color: 'var(--signal)' } }}>
            RECARGAR
          </Button>
          <Button variant="contained" onClick={exportToPDF} sx={{ bgcolor: 'var(--signal)', color: '#000', fontWeight: 'bold', '&:hover': { bgcolor: 'var(--signal-bright)' } }}>
            EXPORT PDF
          </Button>
          <Button variant="outlined" onClick={exportTechnicalPDF} sx={{ borderColor: 'var(--cyan)', color: 'var(--cyan)', fontWeight: 'bold', '&:hover': { borderColor: 'var(--cyan)', bgcolor: 'rgba(0,200,255,0.08)' } }}>
            EXPORT PDF TÉCNICO
          </Button>
        </Stack>
      </Stack>

      {!previewMode && (
        <Grid container spacing={2} sx={{ mb: 4, p: 3, background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth size="small" label="CLIENT NAME" variant="standard" value={companyName} onChange={e => setCompanyName(e.target.value)} sx={{ input: { color: 'var(--text)' }, label: { color: 'var(--signal)' } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth size="small" label="ANALYST" variant="standard" value={analystName} onChange={e => setAnalystName(e.target.value)} sx={{ input: { color: 'var(--text)' }, label: { color: 'var(--signal)' } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <DateRangePicker
              dateStart={dateStart}
              dateEnd={dateEnd}
              onChange={(s, e) => { setDateStart(s); setDateEnd(e); }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small" variant="standard">
              <InputLabel sx={{ color: 'var(--signal)' }}>REPORT TYPE</InputLabel>
              <Select value={reportType} onChange={e => setReportType(e.target.value)} sx={{ color: 'var(--text)' }}>
                <MenuItem value="monthly">MONTHLY SUMMARY</MenuItem>
                <MenuItem value="weekly">WEEKLY AUDIT</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Button component="label" fullWidth sx={{ color: 'var(--cyan)', border: '1px dashed var(--cyan)' }}>
              UPLOAD COMPANY LOGO
              <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
            </Button>
          </Grid>
        </Grid>
      )}

      {reportData && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <GlassCard sx={{ height: '100%', textAlign: 'center', py: 4 }}>
              <Typography variant="caption" sx={{ color: 'var(--text-dim)', letterSpacing: '2px' }}>INFRASTRUCTURE HEALTH</Typography>
              <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', my: 2 }}>
                <CircularProgress variant="determinate" value={100} size={120} thickness={2} sx={{ color: 'var(--line)', position: 'absolute' }} />
                <CircularProgress variant="determinate" value={reportData.executive_summary.health_score} size={120} thickness={4} sx={{ color: healthColor }} />
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <NeonText size="2.5rem" color={healthColor}>{reportData.executive_summary.health_score}%</NeonText>
                </Box>
              </Box>
              <Typography variant="body2" sx={{ color: healthColor, fontWeight: 'bold' }}>{reportData.executive_summary.status.toUpperCase()}</Typography>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <GlassCard sx={{ height: '100%', textAlign: 'center', py: 4, borderBottom: '4px solid var(--cyan)' }}>
              <Typography variant="caption" sx={{ color: 'var(--text-dim)', letterSpacing: '2px' }}>MITIGATED IMPACT (EST.)</Typography>
              <Box sx={{ my: 3 }}>
                <NeonText size="3.5rem" color="var(--cyan)">${(reportData.wazuh_metrics.critical_alerts * 10000).toLocaleString()}</NeonText>
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>PREVENTED LOSS VALUE (USD)</Typography>
              </Box>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <GlassCard sx={{ height: '100%', textAlign: 'center', py: 4 }}>
              <Typography variant="caption" sx={{ color: 'var(--text-dim)', letterSpacing: '2px' }}>RESPONSE EFFICIENCY</Typography>
              <Box sx={{ my: 3, display: 'flex', justifyContent: 'center', gap: 4 }}>
                <Box>
                  <NeonText size="2rem" color="var(--signal)">{reportData.incident_management.closed_tickets}</NeonText>
                  <Typography variant="caption">SOLVED</Typography>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                <Box>
                  <NeonText size="2rem" color="var(--amber)">{reportData.incident_management.avg_resolution_time_min}m</NeonText>
                  <Typography variant="caption">MTTR</Typography>
                </Box>
              </Box>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <GlassCard title="EXECUTIVE SUMMARY" sx={{ height: '100%' }}>
              <Typography sx={{ fontSize: '14px', lineHeight: 2, color: 'var(--text-bright)', textAlign: 'justify' }}>
                {reportData.executive_summary.key_finding} Durante este periodo, el SOC Valhalla ha mantenido una postura defensiva activa, neutralizando intentos de acceso no autorizado en el perímetro y asegurando la integridad de los activos críticos.
              </Typography>
              <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(60,255,158,0.05)', borderLeft: '4px solid var(--signal)' }}>
                <Typography sx={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--signal)' }}>STRATEGIC VERDICT:</Typography>
                <Typography sx={{ fontSize: '13px', fontStyle: 'italic' }}>"Infrastructure remains secure under AI-driven monitoring. No breaches recorded."</Typography>
              </Box>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <GlassCard title="ATTACK ORIGIN (GEO-INTEL)" sx={{ height: '100%' }}>
              <Stack spacing={2} sx={{ mt: 1 }}>
                {(reportData.geo_intel ?? []).map((entry, i) => (
                  <Box key={entry.country}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{entry.country.toUpperCase()}</Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-dim)' }}>{entry.pct}% THREAT LOAD</Typography>
                    </Stack>
                    <Box sx={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                      <Box sx={{ width: `${entry.pct}%`, height: '100%', background: i === 0 ? 'var(--danger)' : 'var(--amber)', borderRadius: 2 }} />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <GlassCard title="MITRE ATT&CK COVERAGE MATRIX" sx={{ borderTop: '4px solid var(--signal)' }}>
              <Grid container spacing={4} alignItems="center">
                <Grid size={{ xs: 12, md: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '15px 10px', fontSize: '10px', color: 'var(--text-dim)' }}>TACTIC</th>
                        <th style={{ padding: '15px 10px', fontSize: '10px', color: 'var(--text-dim)' }}>DETECTIONS</th>
                        <th style={{ padding: '15px 10px', fontSize: '10px', color: 'var(--text-dim)' }}>RISK LEVEL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.mitre_coverage.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '15px 10px', fontSize: '13px', fontWeight: 'bold' }}>{row.icon} {row.tactic}</td>
                          <td style={{ padding: '15px 10px', fontSize: '14px', fontFamily: 'var(--ff-mono)', color: 'var(--signal)' }}>{row.count}</td>
                          <td style={{ padding: '15px 10px' }}>
                            <Chip label={row.level} size="small" sx={{ fontSize: '9px', fontWeight: 'bold', bgcolor: row.level === 'Critical' ? 'rgba(255,77,77,0.1)' : 'rgba(255,159,26,0.1)', color: row.level === 'Critical' ? 'var(--danger)' : 'var(--amber)', border: '1px solid' }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box sx={{ p: 3, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(60,255,158,0.2)', borderRadius: '8px' }}>
                    <Typography variant="caption" sx={{ color: 'var(--signal)', fontWeight: 'bold', mb: 1, display: 'block' }}>ANÁLISIS DE TÁCTICAS:</Typography>
                    <Typography sx={{ fontSize: '12px', lineHeight: 1.8, color: 'var(--text-dim)' }}>
                      La fase de Credential Access presenta la mayor criticidad. El sistema ha respondido bloqueando automáticamente {reportData.honeypot_intel.unique_attackers} vectores de ataque externos.
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <GlassCard title="INSTRUCTIONAL REMEDIATION" sx={{ height: '100%' }}>
              <Stack spacing={2}>
                {reportData.remediation_steps.map((step, i) => (
                  <Box key={i} sx={{ p: 2, background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <Typography sx={{ fontSize: '13px', fontWeight: 'bold', mb: 1 }}>{i + 1}. {step.task}</Typography>
                    {step.action_cmd && (
                      <Box sx={{ p: '10px', background: '#000', borderRadius: '4px', border: '1px dashed var(--amber)', color: 'var(--amber)', fontSize: '11px', fontFamily: 'var(--ff-mono)' }}>
                        {step.action_cmd}
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            </GlassCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <GlassCard title="HONEYPOT INTEL & MALWARE" sx={{ height: '100%' }}>
              <Typography variant="caption" sx={{ color: 'var(--text-dim)', mb: 2, display: 'block' }}>TOP PASSWORDS CAPTURED:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 4 }}>
                {reportData.honeypot_intel.top_passwords_captured.map(p => (
                  <Chip key={p} label={p} size="small" variant="outlined" sx={{ color: 'var(--cyan)', borderColor: 'var(--cyan)' }} />
                ))}
              </Box>
              <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h4" sx={{ color: 'var(--danger)', fontWeight: 900 }}>{reportData.honeypot_intel.malware_samples_collected}</Typography>
                  <Typography variant="caption">MALWARE SAMPLES</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h4" sx={{ color: 'var(--cyan)', fontWeight: 900 }}>{reportData.honeypot_intel.unique_attackers}</Typography>
                  <Typography variant="caption">UNIQUE ATTACKERS</Typography>
                </Box>
              </Stack>
            </GlassCard>
          </Grid>
        </Grid>
      )}

      <Box sx={{ mt: 8, pt: 4, borderTop: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
        <Typography sx={{ fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '4px' }}>
          CONFIDENCIAL // VALHALLA SOC INFORME EJECUTIVO // {reportData?.report_metadata.generation_date}
        </Typography>
      </Box>
    </Box>
  );
}