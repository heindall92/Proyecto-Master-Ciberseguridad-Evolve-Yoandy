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
  email?: string | null;
  role: string;
  created_at: string;
};

export type AgentOut = {
  id: string;
  name: string;
  ip: string | null;
  os: string | null;
  status: string;
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
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";
const API_BASE = envApiBase || fallbackApiBase;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
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
export function getDashboardSummary() {
  return http<any>("/api/dashboard");
}

// Auth
export async function login(username: string, password: string) {
  const res = await http<{ access_token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem("token", res.access_token);
  return res;
}

export function getCurrentUser() {
  return http<UserOut>("/api/auth/me");
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
