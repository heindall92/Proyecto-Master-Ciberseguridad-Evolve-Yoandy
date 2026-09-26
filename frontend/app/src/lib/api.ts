export type EventOut = {
  id: number;
  timestamp: string;
  source_ip: string | null;
  attack_type: string | null;
  payload: Record<string, unknown> | null;
  raw_log: Record<string, unknown>;
};

export type AlertOut = {
  id: number;
  event_id: number | null;
  severity: string;
  rule_id: string | null;
  description: string | null;
  timestamp: string;
  raw_alert: Record<string, unknown>;
};

export type AnalysisOut = {
  alert_id: number;
  attack_type: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  recommended_action: string;
  created_at?: string | null;
};

export type UserOut = {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  role: string;
  security_rank: string;
  avatar_url?: string | null;
  created_at?: string;
  tailscale_login?: string | null;
};

export type AgentOut = {
  id: string;
  name: string;
  ip: string | null;
  os: string | null;
  status: string;
  version?: string;
  last_keep_alive?: string;
  type: string;
  agent: string;
  group: any;
};

export type AgentEnrollOut = {
  ok: boolean;
  id?: string;
  key?: string;
  error?: string;
};

const envApiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
const fallbackApiBase =
  typeof window !== "undefined" && window.location.protocol !== "file:"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:8000";
/** Base URL vacía en build prod → mismo origen (nginx gateway HTTPS). */
export const API_BASE = envApiBase || fallbackApiBase;

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function http<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> || {}),
  };

  if (typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp("(^| )csrf_token=([^;]+)"));
    if (match) {
      headers["X-CSRF-Token"] = match[2];
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (
    res.status === 401 &&
    !retried &&
    !path.includes("/auth/login") &&
    !path.includes("/auth/refresh")
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return http<T>(path, init, true);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const fetchAuth = http;

// Events & Alerts
export function listEvents(limit = 50, offset = 0) {
  return http<EventOut[]>(`/events?limit=${limit}&offset=${offset}`);
}

export function listAlerts(limit = 50, offset = 0) {
  return http<AlertOut[]>(`/alerts?limit=${limit}&offset=${offset}`);
}

export function analyzeAlert(alertId: number) {
  return http<AnalysisOut>(`/api/analyze/${alertId}`, { method: "POST" });
}

// Dashboard
export function getDashboardSummary(hours = 24) {
  return http<any>(`/api/dashboard?hours=${hours}`);
}

export function getOpenTicketsCount() {
  return http<{open: number}>("/api/tickets/count/open");
}

export async function uploadEvidence(ticketId: number, file: File): Promise<EvidenceOut> {
  const formData = new FormData();
  formData.append("file", file);
  
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp('(^| )csrf_token=([^;]+)'));
    if (match) {
      headers["X-CSRF-Token"] = match[2];
    }
  }

  const resp = await fetch(`${API_BASE}/api/tickets/${ticketId}/evidence`, {
    method: "POST",
    credentials: "include",
    headers,
    body: formData
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try { detail = (await resp.json()).detail || detail; } catch { /* cuerpo no JSON */ }
    throw new Error(String(detail));
  }
  return resp.json();
}

export function getEvidenceDownloadUrl(evidenceId: number): string {
  return `${API_BASE}/api/evidence/${evidenceId}/download`;
}

export function syncWazuhAlerts(hours = 1) {
  return http<{created: number, linked: number, skipped: number, error: string | null}>(`/api/wazuh/sync-alerts?hours=${hours}`);
}

export function autoCreateTicket(alertData: {
  title: string;
  description?: string;
  severity?: string;
  source_ip?: string;
  affected_asset?: string;
  wazuh_alert_id?: string;
  category?: string;
}) {
  return http<any>("/api/wazuh/auto-create-ticket", { method: "POST", body: JSON.stringify(alertData) });
}

// Auth
export async function login(username: string, password: string) {
  const res = await http<{ access_token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  // Token is now set as an httpOnly cookie by the backend
  return res;
}

export function getCurrentUser() {
  return http<UserOut>("/api/auth/me");
}

export function refreshSession() {
  return http<{ access_token: string }>("/api/auth/refresh", { method: "POST" });
}

export async function uploadMyAvatar(file: File): Promise<{avatar_url: string}> {
  const formData = new FormData();
  formData.append("file", file);
  
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp('(^| )csrf_token=([^;]+)'));
    if (match) {
      headers["X-CSRF-Token"] = match[2];
    }
  }

  const resp = await fetch(`${API_BASE}/api/users/me/avatar`, {
    method: "POST",
    credentials: "include",
    headers,
    body: formData
  });
  if (!resp.ok) throw new Error("Failed to upload avatar");
  return resp.json();
}

// Users
export function listUsers() {
  return http<UserOut[]>("/api/users");
}

export function createUser(data: any) {
  return http<UserOut>("/api/users", { method: "POST", body: JSON.stringify(data) });
}

export function updateUser(userId: number, data: any) {
  return http<UserOut>(`/api/users/${userId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteUser(userId: number) {
  return http<any>(`/api/users/${userId}`, { method: "DELETE" });
}

export function resetPassword(userId: number, password: string) {
  return http<any>(`/api/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: password })
  });
}

// Invitaciones: enlace de activación de un solo uso + acceso compartido por Tailscale
export type Invite = {
  username: string; role: string; valhalla_url: string; activation_url: string; vpn: boolean;
  tailscale_url: string | null; tailscale_error: string | null; expires_at: string;
};
export type InviteState = {
  status: "pending" | "used" | "expired" | null; created_at?: string; expires_at?: string; used_at?: string | null;
  tailscale?: { accepted: boolean; login: string | null } | null; tailscale_login: string | null;
};
export const createInvite = (userId: number, tailscale = true) =>
  http<Invite>(`/api/users/${userId}/invite`, { method: "POST", body: JSON.stringify({ tailscale }) });
export const getInviteState = (userId: number) => http<InviteState>(`/api/users/${userId}/invite`);
export const revokeInvite = (userId: number) => http<{ ok: boolean }>(`/api/users/${userId}/invite`, { method: "DELETE" });
export const pendingInvites = () => http<Array<{ user_id: number; expires_at: string }>>("/api/invites/pending");
export const unlinkTailscale = (userId: number) => http<{ ok: boolean }>(`/api/users/${userId}/tailscale`, { method: "DELETE" });
export const inviteCheck = (token: string) =>
  http<{ username: string; role: string; expires_at: string }>("/api/auth/invite/check", { method: "POST", body: JSON.stringify({ token }) });
export const inviteActivate = (token: string, password: string) =>
  http<{ ok: boolean; username: string }>("/api/auth/invite/activate", { method: "POST", body: JSON.stringify({ token, password }) });

// Agents
export function listAgents() {
  return http<AgentOut[]>("/api/agents");
}

export function enrollAgent(name: string, os: string, group: string) {
  return http<AgentEnrollOut>("/api/agents/enroll", {
    method: "POST",
    body: JSON.stringify({ name, os, group }),
  });
}

export function getAgentPackages(agentId: string) {
  return http<any[]>(`/api/agents/${agentId}/packages`);
}


export function getAgentVulnerabilities(agentId: string) {
  return http<any[]>(`/api/agents/${agentId}/vulnerabilities`);
}

// Inventario real (syscollector) y vulnerabilidades del índice de estados de Wazuh 4.8+
export interface AgentInventory {
  os: { name?: string; version?: string; codename?: string; platform?: string };
  kernel: string; hostname: string; architecture: string;
  hardware: { cpu?: { name?: string; cores?: number; mhz?: number }; ram?: { total?: number; free?: number; usage?: number } };
  counts: { packages: number; processes: number };
  ports: Array<{ port: number; ip: string; protocol: string; process: string; pid: number }>;
  scan_time: string;
}
export interface AgentVuln {
  cve: string; severity: string; score: number | null; description: string; reference: string;
  detected_at: string; published_at: string; package: string; version: string; under_evaluation: boolean;
}
export function getAgentInventory(agentId: string) {
  return http<AgentInventory>(`/api/agents/${agentId}/inventory`);
}
export function getVulnSummary() {
  return http<Record<string, Record<string, number>>>("/api/agents/vulnerability-summary");
}
export function getLsaEndpoints() {
  return http<Array<{ hostname: string; runasppl_enabled: boolean; lsa_protected: boolean; risk_score: number; last_check?: string }>>("/api/lsa/endpoints");
}
export function getLsaAlerts(hours = 24) {
  return http<Array<{ id: number; timestamp: string; type: string; source_ip: string; hostname: string; severity: string; blocked: boolean; target_process: string; source_process: string }>>(`/api/lsa/alerts?hours=${hours}`);
}
// Tickets (Incident Management)
export type TicketOut = {
  id: number;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string | null;
  source_ip: string | null;
  affected_asset: string | null;
  affected_user: string | null;
  mitre_technique: string | null;
  wazuh_alert_id: string | null;
  assigned_to_id: number | null;
  reporter_id: number | null;
  assignee_username: string | null;
  reporter_username: string | null;
  ai_summary: string | null;
  ai_recommendation: string | null;
  analysis_notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  classification: TicketClassification | null;
  evidence: EvidenceOut[];
  alerts: TicketAlertOut[];
};

export type RunbookOut = Runbook;

export interface EvidenceOut {
  id: number;
  ticket_id: number;
  filename: string;
  file_size: number;
  content_type: string | null;
  sha256: string | null;
  uploaded_by_username: string | null;
  created_at: string;
}

export type TicketClassification = "true_positive" | "false_positive" | "benign";

export interface TicketAlertOut {
  id: number;
  alert_id: string;
  rule_id: string | null;
  rule_level: number | null;
  description: string | null;
  source_ip: string | null;
  agent_name: string | null;
  alert_timestamp: string | null;
  created_at: string;
}

export interface TicketEventOut {
  id: number;
  kind: string;
  message: string;
  username: string | null;
  created_at: string;
}

export function getTicketTimeline(ticketId: number) {
  return http<TicketEventOut[]>(`/api/tickets/${ticketId}/timeline`);
}

export function addTicketComment(ticketId: number, text: string) {
  return http<TicketEventOut>(`/api/tickets/${ticketId}/comments`, { method: "POST", body: JSON.stringify({ text }) });
}

export function verifyEvidence(evidenceId: number) {
  return http<{ ok: boolean; stored: string | null; current: string }>(`/api/evidence/${evidenceId}/verify`);
}

/** Escala una alerta a incidente; el backend la vincula a uno activo si hay correlación (misma IP / regla+agente). */
export function createTicketFromAlert(alert: {
  alert_id: string; rule_id?: string; rule_level?: number; description?: string; source_ip?: string | null;
  agent_name?: string; timestamp?: string; severity?: string;
}) {
  return http<{ outcome: "created" | "linked" | "duplicate"; ticket_id: number; title: string }>("/api/tickets/from-alert", {
    method: "POST",
    body: JSON.stringify(alert),
  });
}

export function listTickets(
  status?: string,
  severity?: string,
  limit = 50,
  offset = 0,
  activeOnly = false
) {
  let url = `/api/tickets?limit=${limit}&offset=${offset}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (severity) url += `&severity=${encodeURIComponent(severity)}`;
  if (activeOnly) url += `&active_only=true`;
  return http<TicketOut[]>(url);
}

export function createTicket(data: any) {
  return http<TicketOut>("/api/tickets", { method: "POST", body: JSON.stringify(data) });
}

export function updateTicket(ticketId: number, data: any) {
  return http<TicketOut>(`/api/tickets/${ticketId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function assignTicket(ticketId: number, userId: number) {
  return http<TicketOut>(`/api/tickets/${ticketId}/assign`, {
    method: "POST",
    body: JSON.stringify({ assigned_to_id: userId }),
  });
}

export function resolveTicket(ticketId: number, notes: string, classification?: TicketClassification) {
  return http<TicketOut>(`/api/tickets/${ticketId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution_notes: notes, ...(classification ? { classification } : {}) }),
  });
}

export function deleteTicket(ticketId: number) {
  return http<{ ok: boolean }>(`/api/tickets/${ticketId}`, { method: "DELETE" });
}


export function purgeResolvedTickets(days = 30) {
  return http<{ deleted: number; cutoff_days: number }>(`/api/tickets/purge/resolved?days=${days}`, { method: "DELETE" });
}

// Wazuh Telemetry & Analytics
export function getTopAttackers(limit = 20, hours = 168) {
  return http<any[]>(`/api/wazuh/top-attackers?limit=${limit}&hours=${hours}`);
}

export function getMitreCoverage(hours = 168) {
  return http<any[]>(`/api/wazuh/mitre?hours=${hours}`);
}

export function getCowrieTimeline(hours = 168, interval = "1h") {
  return http<any[]>(`/api/wazuh/cowrie-timeline?hours=${hours}&interval=${interval}`);
}

export function getCowrieStats(hours = 168) {
  return http<any>(`/api/wazuh/cowrie-stats?hours=${hours}`);
}

export function getCowrieSessions(limit = 100, hours = 168) {
  return http<any[]>(`/api/wazuh/cowrie-sessions?limit=${limit}&hours=${hours}`);
}

export function getAlertVolume(hours = 168, interval = "6h") {
  return http<any[]>(`/api/wazuh/alert-volume?hours=${hours}&interval=${interval}`);
}

export function getRecentAlerts(limit = 200, hours = 168) {
  return http<any[]>(`/api/wazuh/recent-alerts?limit=${limit}&hours=${hours}`);
}

export function getAlertLevels(hours = 168) {
  return http<any>(`/api/wazuh/alert-levels?hours=${hours}`);
}

export function getWazuhServices() {
  return http<any>("/api/wazuh/services");
}

// VirusTotal — clave almacenada cifrada en el servidor por operador
export function getVtKeyStatus() {
  return http<{ configured: boolean }>("/api/users/me/vt-api-key");
}

export function setMyVtApiKey(api_key: string) {
  return http<{ status: string; configured: boolean }>("/api/users/me/vt-api-key", {
    method: "PUT",
    body: JSON.stringify({ api_key }),
  });
}

export function deleteMyVtApiKey() {
  return http<{ ok: boolean }>("/api/users/me/vt-api-key", { method: "DELETE" });
}

export function vtCheckIp(ip: string) {
  return http<any>(`/api/virustotal/ip/${ip}`);
}

export function vtCheckHash(hash: string) {
  return http<any>(`/api/virustotal/hash/${hash}`);
}

export function vtCheckDomain(domain: string) {
  return http<any>(`/api/virustotal/domain/${domain}`);
}

// Ollama Status
export function getOllamaStatus() {
  return http<any>("/api/ollama/status");
}

// IOC Registry
export function listIOCs(status?: string, ioc_type?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (ioc_type) params.set("ioc_type", ioc_type);
  const qs = params.toString();
  return http<any[]>(`/api/ioc${qs ? "?" + qs : ""}`);
}

export function addIOC(payload: {
  value: string;
  ioc_type: string;
  malicious_score?: number;
  total_engines?: number;
  country?: string;
  asn?: string | number;
  as_owner?: string;
  tags?: string[];
  status?: string;
  analyst_notes?: string;
  related_ticket_id?: number;
  vt_report?: any;
}) {
  return http<any>("/api/ioc", { method: "POST", body: JSON.stringify(payload) });
}

export function updateIOC(id: number, payload: { status?: string; analyst_notes?: string; related_ticket_id?: number }) {
  return http<any>(`/api/ioc/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteIOC(id: number) {
  return http<void>(`/api/ioc/${id}`, { method: "DELETE" });
}

// Firewall / Active Response (Fase 1)
export interface FirewallBlockResult {
  ok: boolean;
  ip: string;
  cdb_applied: boolean;
  active_response: boolean;
  timeout?: number | null;
  detail?: any;
}

export function blockIp(ip: string, timeout?: number, reason?: string) {
  return http<FirewallBlockResult>("/api/firewall/block", {
    method: "POST",
    body: JSON.stringify({ ip, ...(timeout != null ? { timeout } : {}), ...(reason ? { reason } : {}) }),
  });
}

export function unblockIp(ip: string) {
  return http<{ ok: boolean; ip: string; cdb_applied: boolean }>("/api/firewall/unblock", {
    method: "POST",
    body: JSON.stringify({ ip }),
  });
}

export function getBlockedIps() {
  return http<Array<{ ip: string; country?: string; as_owner?: string; tags?: string[]; since?: string }>>(
    "/api/firewall/blocked"
  );
}

// Fase 4 — Madurez y Métricas SOC
export interface SocMetrics {
  tickets: { total: number; closed: number; open: number; resolution_rate_pct: number };
  mttr_minutes: number;
  dwell_open_avg_minutes: number;
  by_severity: Record<string, number>;
  tickets_by_analyst: Array<{ analyst: string; closed: number }>;
  attack_coverage_pct: number | null;
  techniques_seen: string[];
  techniques_covered: number | null;
  techniques_total: number | null;
  alerts_24h: number;
  generated_at: string;
}

export function getSocMetrics() {
  return http<SocMetrics>("/api/metrics/soc");
}

export function getNavigatorLayer(hours = 720) {
  return http<any>(`/api/mitre/navigator-layer?hours=${hours}`);
}

export function listHuntQueries() {
  return http<Array<{ id: string; name: string; description: string }>>("/api/hunting/queries");
}

export function runHuntQuery(id: string, hours = 720) {
  return http<{ query_id: string; name: string; type: string; count: number; results: any[] }>(
    `/api/hunting/run/${id}?hours=${hours}`
  );
}

// CVE Intel (Fase 5) — feed CISA KEV + post IA (borrador)
export interface CveItem {
  id: string;
  summary: string;
  product: string;
  name: string;
  published: string;
  due_date: string;
  required_action: string;
  ransomware: boolean;
  severity: string;
  source: string;
}

export function getLatestCves(limit = 15) {
  return http<CveItem[]>(`/api/cve/latest?limit=${limit}`);
}

export interface ExploitResult {
  cve: string;
  count: number;
  exploits: Array<{ title: string; edb_id: string; type: string; platform: string; url: string }>;
  error?: string;
}

export function getCveExploits(cveId: string) {
  return http<ExploitResult>(`/api/cve/${encodeURIComponent(cveId)}/exploits`);
}

export function generateCveSocialPost(cveIds: string[] = []) {
  return http<{ post: string; cves_used: Array<{ id: string; severity: string }>; auto_published: boolean }>(
    "/api/cve/social-post",
    { method: "POST", body: JSON.stringify({ cve_ids: cveIds }) }
  );
}


// RUNBOOKS - Procedimientos operativos estandar


/** Un paso de runbook: texto plano o {text, command}. */
export type RunbookStep = string | { text: string; command?: string };

export interface Runbook {
  id: number;
  name: string;
  category: string;
  description: string;
  identification_steps: RunbookStep[];
  containment_steps: RunbookStep[];
  eradication_steps: RunbookStep[];
  recovery_steps: RunbookStep[];
  post_mortem_steps: RunbookStep[];
  severity_applicable: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export function listRunbooks() {
  return http<Runbook[]>("/api/runbooks");
}

export function createRunbook(payload: Omit<Runbook, "id" | "created_at" | "updated_at">) {
  return http<Runbook>("/api/runbooks", { method: "POST", body: JSON.stringify(payload) });
}

export function updateRunbook(id: number, payload: Partial<Runbook>) {
  return http<Runbook>(`/api/runbooks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteRunbook(id: number) {
  return http<void>(`/api/runbooks/${id}`, { method: "DELETE" });
}


// GEOLOCATION - Datos geograficos para Threat Map


export interface GeoLocation {
  ip: string;
  country: string;
  country_code: string;
  city: string;
  isp: string;
  lat: number;
  lon: number;
  count: number;
}

export interface ThreatMapData {
  attacks: GeoLocation[];
  countries: { country: string; count: number }[];
  total_attacks: number;
}

export function getThreatMap(hours: number = 168) {
  return http<ThreatMapData>(`/api/threat-map?hours=${hours}`);
}

// CHAT PERSISTENCE & REAL-TIME
export function getChatHistory(chatId: string, limit = 100) {
  return http<any[]>(`/api/chat/${chatId}?limit=${limit}`);
}

export function postChatMessage(msg: any) {
  return http<any>("/api/chat", { method: "POST", body: JSON.stringify(msg) });
}

/** Vacía el chat para este usuario en el servidor (sincroniza móvil y ordenador). */
export function clearChatHistory(chatId: string) {
  return http<{ ok: boolean }>(`/api/chat/${encodeURIComponent(chatId)}/clear`, { method: "POST" });
}

export const getChatWsUrl = () => {
  if (typeof window === "undefined") return "ws://localhost:8000/ws/chat";
  const useSameOrigin = !envApiBase;
  if (useSameOrigin) {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${window.location.host}/ws/chat`;
  }
  const wsProto = API_BASE.startsWith("https") ? "wss:" : "ws:";
  const host = API_BASE.replace(/^https?:\/\//, "");
  return `${wsProto}//${host}/ws/chat`;
};

export function logout() {
  return http<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function getMySession() {
  return http<{ username: string; ip: string; user_agent: string; expires_minutes: number }>(
    "/api/auth/me/session"
  );
}

export interface MyActivityEntry {
  id: number;
  method: string;
  route: string;
  ip: string | null;
  timestamp: string;
}

export function getMyActivity(limit = 20) {
  return http<MyActivityEntry[]>(`/api/auth/me/activity?limit=${limit}`);
}

// ── Centro de informes ─────────────────────────────────────────────────────
export type ReportTLP = "CLEAR" | "GREEN" | "AMBER" | "RED";

export interface ReportSummary {
  report_id: string;
  kind: string;
  tlp: ReportTLP;
  period_start: string;
  period_end: string;
  created_by: string | null;
  created_at: string;
  sha256: string;
  risk_level: string | null;
  risk_score: number | null;
}

/** Contenido del informe tal y como lo construye backend/app/report_builder.py */
export type ReportData = Record<string, any>;

export function listReports() {
  return http<ReportSummary[]>("/api/reports");
}

export function generateReport(body: { start: string; end: string; tlp: ReportTLP; include_ai_summary: boolean }) {
  return http<ReportSummary & { data: ReportData }>("/api/reports/generate", { method: "POST", body: JSON.stringify({ ...body, kind: "soc" }) });
}

export function getReport(reportId: string) {
  return http<ReportSummary & { data: ReportData }>(`/api/reports/${encodeURIComponent(reportId)}`);
}

export function verifyReport(reportId: string) {
  return http<{ ok: boolean; stored: string; current: string }>(`/api/reports/${encodeURIComponent(reportId)}/verify`);
}

// ─── Inteligencia: enriquecimiento de CVE y AbuseIPDB ───────────────────────
export interface CveEnrichment {
  cve: string;
  cvss: { score: number; severity: string; vector: string; version: string } | null;
  github: { count: number; top: Array<{ repo: string; stars: number; url: string; updated: string }> } | null;
  exploitdb: { count: number; items: Array<{ title: string; path: string }> } | null;
  priority: { score: number; label: string; reasons: string[] };
  sources: { nvd: boolean; github: boolean; exploitdb: boolean };
  error?: string;
}

export function getCveEnrichment(id: string) {
  return http<CveEnrichment>(`/api/cve/${encodeURIComponent(id)}/enrich`);
}

export interface AbuseIpResult {
  found: boolean; ip: string; error?: string;
  abuse_confidence_score?: number; country?: string; country_name?: string; isp?: string; domain?: string;
  usage_type?: string; total_reports?: number; num_distinct_users?: number; last_reported_at?: string;
  is_whitelisted?: boolean; is_tor?: boolean;
}

export function abuseCheckIp(ip: string) {
  return http<AbuseIpResult>(`/api/abuseipdb/ip/${encodeURIComponent(ip)}`);
}

export function getAbuseKeyStatus() {
  return http<{ configured: boolean }>("/api/users/me/abuseipdb-api-key");
}

export function setMyAbuseKey(api_key: string) {
  return http<{ status: string; configured: boolean }>("/api/users/me/abuseipdb-api-key", {
    method: "PUT",
    body: JSON.stringify({ api_key }),
  });
}

// ─── Honeypot Cowrie (sin el ruido del bucle antiguo de la IA) ──────────────
export interface HoneypotOverview {
  hours: number; interval: string;
  summary: { available?: boolean; events: number; sessions: number; login_failed: number; login_success: number;
    bruteforce_detections: number; intrusions_after_bruteforce: number;
    top_usernames: Array<{ value: string; count: number }>; top_passwords: Array<{ value: string; count: number }>;
    top_commands: Array<{ value: string; count: number }>; downloads: Array<{ value: string; count: number }> };
  timeline: Array<{ t: string; events: number; failed: number; success: number }>;
  attackers: Array<{ ip: string; events: number; sessions: number; success: number; last: string | null }>;
  clients: Array<{ value: string; count: number }>;
}
export interface HoneypotSession { session: string; events: number; ip: string; start: string; end: string; duration_s: number; failed: number; success: number; commands: number; users: string[] }
export interface HoneypotEvent { t: string; event: string; detail: string; rule: string; level: number }
export const getHoneypotOverview = (hours = 24) => http<HoneypotOverview>(`/api/honeypot/overview?hours=${hours}`);
export const getHoneypotSessions = (hours = 24) => http<HoneypotSession[]>(`/api/honeypot/sessions?hours=${hours}`);
export const getHoneypotSessionEvents = (id: string) => http<HoneypotEvent[]>(`/api/honeypot/sessions/${encodeURIComponent(id)}`);
