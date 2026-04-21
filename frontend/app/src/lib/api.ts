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

const envApiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
const fallbackApiBase =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";
const API_BASE = envApiBase || fallbackApiBase;

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export function listEvents(limit = 50, offset = 0) {
  return http<EventOut[]>(`/events?limit=${limit}&offset=${offset}`);
}

export function listAlerts(limit = 50, offset = 0) {
  return http<AlertOut[]>(`/alerts?limit=${limit}&offset=${offset}`);
}

export function analyzeAlert(alertId: number) {
  return http<AnalysisOut>(`/api/analyze/${alertId}`, { method: "POST" });
}

