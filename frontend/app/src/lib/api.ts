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
  rank: string;
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
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";
const API_BASE = envApiBase || fallbackApiBase;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> || {}),
  };

  // Add CSRF token if available
  if (typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp('(^| )csrf_token=([^;]+)'));
    if (match) {
      headers["X-CSRF-Token"] = match[2];
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !path.includes("/auth/login")) {
    localStorage.removeItem("token");
    // No reloading — let callers handle the 401 via .catch()
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
  if (!resp.ok) throw new Error("Failed to upload evidence");
  return resp.json();
}

export function getEvidenceDownloadUrl(evidenceId: number): string {
  return `${API_BASE}/api/evidence/${evidenceId}/download`;
}

export function syncWazuhAlerts(hours = 1) {
  return http<{created: number, skipped: number, error: string | null}>(`/api/wazuh/sync-alerts?hours=${hours}`);
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

export function getAgentPorts(agentId: string) {
  return http<any[]>(`/api/agents/${agentId}/ports`);
}

export function getAgentVulnerabilities(agentId: string) {
  return http<any[]>(`/api/agents/${agentId}/vulnerabilities`);
}

export function scanAgent(agentId: string) {
  return http<any>(`/api/agents/${agentId}/scan`, { method: "POST" });
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
  evidence: EvidenceOut[];
};

export interface EvidenceOut {
  id: number;
  ticket_id: number;
  filename: string;
  file_size: number;
  content_type: string | null;
  created_at: string;
}

export function listTickets(status?: string, severity?: string, limit = 50, offset = 0) {
  let url = `/api/tickets?limit=${limit}&offset=${offset}`;
  if (status) url += `&status=${status}`;
  if (severity) url += `&severity=${severity}`;
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

export function resolveTicket(ticketId: number, notes: string) {
  return http<TicketOut>(`/api/tickets/${ticketId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution_notes: notes }),
  });
}

export function deleteTicket(ticketId: number) {
  return http<{ ok: boolean }>(`/api/tickets/${ticketId}`, { method: "DELETE" });
}

export function purgeResolvedTickets(days = 30) {
  return http<{ deleted: number; cutoff_days: number }>(`/api/tickets/purge/resolved?days=${days}`, { method: "DELETE" });
}

// Wazuh Telemetry & Analytics
export function getTopAttackers(limit = 20, hours = 24) {
  return http<any[]>(`/api/wazuh/top-attackers?limit=${limit}&hours=${hours}`);
}

export function getMitreCoverage(hours = 168) {
  return http<any[]>(`/api/wazuh/mitre?hours=${hours}`);
}

export function getCowrieTimeline(hours = 24, interval = "1h") {
  return http<any[]>(`/api/wazuh/cowrie-timeline?hours=${hours}&interval=${interval}`);
}

export function getCowrieStats(hours = 24) {
  return http<any>(`/api/wazuh/cowrie-stats?hours=${hours}`);
}

export function getCowrieSessions(limit = 100, hours = 24) {
  return http<any[]>(`/api/wazuh/cowrie-sessions?limit=${limit}&hours=${hours}`);
}

export function getAlertVolume(hours = 24, interval = "1h") {
  return http<any[]>(`/api/wazuh/alert-volume?hours=${hours}&interval=${interval}`);
}

export function getRecentAlerts(limit = 100, hours = 24) {
  return http<any[]>(`/api/wazuh/recent-alerts?limit=${limit}&hours=${hours}`);
}

export function getAlertLevels(hours = 24) {
  return http<any>(`/api/wazuh/alert-levels?hours=${hours}`);
}

export function getWazuhServices() {
  return http<any>("/api/wazuh/services");
}

// VirusTotal
export function vtCheckIp(ip: string) {
  const key = localStorage.getItem("vt_api_key");
  const headers = key ? { "X-VT-API-Key": key } : undefined;
  return http<any>(`/api/virustotal/ip/${ip}`, { headers });
}

export function vtCheckHash(hash: string) {
  const key = localStorage.getItem("vt_api_key");
  const headers = key ? { "X-VT-API-Key": key } : undefined;
  return http<any>(`/api/virustotal/hash/${hash}`, { headers });
}

export function vtCheckDomain(domain: string) {
  const key = localStorage.getItem("vt_api_key");
  const headers = key ? { "X-VT-API-Key": key } : undefined;
  return http<any>(`/api/virustotal/domain/${domain}`, { headers });
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


// RUNBOOKS - Procedimientos operativos estandar


export interface Runbook {
  id: number;
  name: string;
  category: string;
  description: string;
  containment_steps: string[];
  eradication_steps: string[];
  recovery_steps: string[];
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

export function getThreatMap(hours: number = 24) {
  return http<ThreatMapData>(`/api/threat-map?hours=${hours}`);
}

// CHAT PERSISTENCE & REAL-TIME
export function getChatHistory(chatId: string, limit = 100) {
  return http<any[]>(`/api/chat/${chatId}?limit=${limit}`);
}

export function postChatMessage(msg: any) {
  return http<any>("/api/chat", { method: "POST", body: JSON.stringify(msg) });
}

export const getChatWsUrl = () => {
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = API_BASE.replace(/^https?:\/\//, "");
  return `${wsProto}//${host}/ws/chat`;
};
