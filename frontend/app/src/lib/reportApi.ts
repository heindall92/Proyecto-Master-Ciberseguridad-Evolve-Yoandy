import { fetchAuth } from "./api";

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

type Bucket<K extends string> = { [key in K]: string } & { count: number };

/** Detalle del generador de informes (mismas cifras que el Informe SOC). */
export type ExecutiveDetail = {
  risk: { score: number; level: string };
  alerts: {
    available?: boolean;
    total: number;
    by_severity: Record<SeverityKey, number>;
    per_day: Bucket<"day">[];
    agents_reporting: number;
    top_agents: Array<{ name: string; ip: string; count: number }>;
    top_rules: Array<{ rule_id: string; description: string; level: number; count: number }>;
    top_attackers: Bucket<"ip">[];
    countries: Bucket<"country">[];
    mitre_tactics: Bucket<"tactic">[];
  };
  honeypot: {
    available?: boolean;
    events: number; sessions: number; login_failed: number; login_success: number;
    bruteforce_detections: number; intrusions_after_bruteforce: number;
    top_usernames: Array<{ value: string; count: number }>;
    top_passwords: Array<{ value: string; count: number }>;
    top_commands: Array<{ value: string; count: number }>;
  };
  incidents: {
    total: number; resolved: number; mttr_minutes: number | null; sla_met_pct: number | null;
    false_positive_pct: number | null; unassigned_active: number;
    by_status: Record<string, number>; by_severity: Record<string, number>;
  };
  blocked_ips_total: number;
  controls: Array<{ iso: string; ens: string; control: string; status: "covered" | "partial" | "missing"; evidence: string }>;
  recommendations: Array<{ priority: string; text: string; reason: string }>;
  limitations: string[];
  ai_summary: boolean;
};

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
  geo_intel?: GeoEntry[];
  report_metadata?: { report_id: string; generation_date: string; analyst_name: string; company_name: string; period: string };
  detail: ExecutiveDetail;
};

export type ExecutiveReportData = {
  source: "api";
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
  detail: ExecutiveDetail;
};

/**
 * Datos del informe ejecutivo para el periodo indicado.
 *
 * Antes: si el backend fallaba se generaba una "simulación local" con eventos
 * inventados y una geolocalización ficticia, y además la petición iba directa a
 * host:8000 (bloqueada por CORS desde el panel), así que casi siempre se veía la
 * simulación. Ahora se usa el cliente común (proxy del panel) y un fallo se
 * propaga para mostrar el error: nunca datos inventados.
 */
export async function fetchExecutiveReportData(start?: string, end?: string): Promise<ExecutiveReportData> {
  const qs = start && end ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : "";
  const data = await fetchAuth<BackendReportResponse>(`/api/reports/executive${qs}`);
  const criticalAlerts = data.wazuh_metrics?.critical_alerts ?? 0;
  const totalAlerts = data.wazuh_metrics?.total_alerts ?? 0;
  const bySeverity = (data.metrics?.by_severity as Record<SeverityKey, number> | undefined) ?? { low: 0, medium: 0, high: 0, critical: criticalAlerts };
  return {
    source: "api",
    generatedAt: data.generatedAt,
    riskScore: data.riskScore,
    executiveSummary: data.executiveSummary,
    metrics: { totalAlerts, criticalAlerts, bySeverity },
    topThreats: data.topThreats ?? [],
    iso27001: data.iso27001,
    recommendations: data.recommendations ?? [],
    geoIntel: data.geo_intel ?? [],
    wazuhMetrics: data.wazuh_metrics,
    mitreCoverage: data.mitre_coverage,
    honeypotIntel: data.honeypot_intel,
    incidentManagement: data.incident_management,
    remediationSteps: data.remediation_steps,
    backendKeyFinding: data.executive_summary?.key_finding ?? data.executiveSummary,
    analystNameFromBackend: data.report_metadata?.analyst_name,
    detail: data.detail,
  };
}

// ─── Informe GRC ────────────────────────────────────────────────────────────
export type GrcCoverage = "high" | "partial" | "none";
export type GrcTechnique = { id: string; name: string; rules: number; rule_ids: number[]; coverage: GrcCoverage };
export type GrcScenario = {
  id: string; title: string; probability: number; impact: number; score: number;
  level: "bajo" | "medio" | "alto" | "crítico"; justification: string; treatment: string; owner: string;
};
export type GrcReport = {
  meta: { period_start: string; period_end: string; generated_at: string; author: string };
  risk: { score: number; level: string };
  kpis: { residual_risk: { score: number; level: string }; compliance_pct: number; attack_coverage_pct: number | null; open_actions: number; scenarios_high: number };
  scenarios: GrcScenario[];
  nist_csf: Array<{ function: string; code: string; score: number; basis: string }>;
  attack: {
    coverage: null | {
      tactics: Array<{ id: string; name: string; techniques: GrcTechnique[] }>;
      techniques_total: number; techniques_covered: number; techniques_high: number; coverage_pct: number;
      rules_total: number; rules_with_mitre: number;
    };
    observed: Array<{ id: string; name: string; count: number; tactics: string[] }>;
    observed_gap: Array<{ id: string; name: string; count: number }>;
  };
  controls: ExecutiveDetail["controls"];
  plan: Array<{ action: string; reason: string; priority: string; deadline_days: number; owner: string; status: string }>;
  limitations: string[];
  method: Record<string, string>;
};

export function fetchGrcReport(start: string, end: string): Promise<GrcReport> {
  return fetchAuth<GrcReport>(`/api/reports/grc?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
}
