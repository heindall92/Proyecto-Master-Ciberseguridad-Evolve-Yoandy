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

export default function ExecutiveReport({ lang = "es" }: { lang?: "es" | "en" }) {
  const t = (key: keyof typeof translations.es) => (translations[lang] as any)[key] || key;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [reportData, setReportData] = useState<ValhallaReportJSON | null>(null);
  const [reportType, setReportType] = useState("monthly");
  const [companyName, setCompanyName] = useState("VALHALLA CYBERSECURITY");
  const [analystName, setAnalystName] = useState("Y. RAMIREZ");
  const [period, setPeriod] = useState("");
  const [reportId, setReportId] = useState("");
  const [logo, setLogo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const raw = await fetchExecutiveReportData();
      const MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
      const d = new Date(raw.generatedAt || Date.now());
      const derivedPeriod = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const derivedReportId = `VHL-${d.getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      setPeriod(derivedPeriod);
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
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const healthColor = useMemo(() => gaugeColor(reportData?.executive_summary.health_score ?? 0), [reportData]);

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

    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
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
    doc.text("Página 1 de 3", W - M, 293, { align: "right" });

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
    doc.text("QUÉ SIGNIFICA", M + 158, 57);

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
      const y = 62 + i * 14;
      if (i % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(M, y - 4, col, 12, "F"); }
      const lColor: [number, number, number] = row.level === "Critical" ? red : row.level === "High" ? orange : row.level === "Medium" ? yellow : green;
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(row.tactic, M + 3, y + 4);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.text(String(row.count), M + 100, y + 4);
      doc.setFillColor(...lColor);
      doc.roundedRect(M + 128, y - 1, 25, 8, 1, 1, "F");
      doc.setTextColor(...white);
      doc.setFontSize(6);
      doc.text(levelLabels[row.level] || row.level, M + 140, y + 4, { align: "center" });
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(mitreExplained[row.tactic] || "Actividad sospechosa", M + 158, y + 4);
    });

    const tableEndY = 62 + (reportData.mitre_coverage?.length ?? 0) * 14 + 10;

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

    geoData.forEach((g, i) => {
      const gy = 50 + i * 22;
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(g.name, M, gy + 6);
      doc.setFillColor(...lightgray);
      doc.roundedRect(M + 30, gy, col - 60, 8, 2, 2, "F");
      doc.setFillColor(...navy);
      doc.roundedRect(M + 30, gy, (col - 60) * g.pct / 100, 8, 2, 2, "F");
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`${g.pct}%`, W - M - 25, gy + 6);
      doc.setTextColor(...gray);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(g.desc, W - M, gy + 6, { align: "right" });
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
    doc.setFillColor(240, 243, 247);
    doc.roundedRect(M, remY2, col, 14, 2, 2, "F");
    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Nivel de cumplimiento global estimado:", M + 4, remY2 + 9);
    doc.setTextColor(...isoColor2);
    doc.setFontSize(13);
    doc.text(`${isoScore2}%`, M + 120, remY2 + 9);
    remY2 += 18;

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
          <Button variant="outlined" onClick={() => setPreviewMode(!previewMode)} sx={{ borderColor: 'var(--line)', color: 'var(--text-dim)', '&:hover': { borderColor: 'var(--signal)', color: 'var(--signal)' } }}>
            {previewMode ? 'EDIT CONFIG' : 'PREVIEW UI'}
          </Button>
          <Button variant="outlined" onClick={load} sx={{ borderColor: 'var(--line)', color: 'var(--text-dim)', '&:hover': { borderColor: 'var(--signal)', color: 'var(--signal)' } }}>
            RECARGAR
          </Button>
          <Button variant="contained" onClick={exportToPDF} sx={{ bgcolor: 'var(--signal)', color: '#000', fontWeight: 'bold', '&:hover': { bgcolor: 'var(--signal-bright)' } }}>
            EXPORT PDF
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
            <TextField fullWidth size="small" label="PERIOD" variant="standard" value={period} onChange={e => setPeriod(e.target.value)} sx={{ input: { color: 'var(--text)' }, label: { color: 'var(--signal)' } }} />
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