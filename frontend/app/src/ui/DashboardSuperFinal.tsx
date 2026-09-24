import { useState, useEffect, useRef, useMemo } from "react";
import logger from "../lib/logger";
import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import {
  getDashboardSummary, getRecentAlerts, getTopAttackers, getAlertVolume, listAgents, syncWazuhAlerts,
  getMitreCoverage, getWazuhServices, createTicket, blockIp, getBlockedIps, AgentOut,
} from "../lib/api";
import { translations } from "./translations";
import { useAppDispatch } from "../store/hooks";
import { setView, navigateToIntel } from "../store/uiSlice";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ShieldAlert, Server, Siren, Layers, RefreshCw, ChevronLeft, ChevronRight, Plus, Ban,
  BarChart3, Crosshair, Target, HeartPulse, Database, Bug, Radar, Swords, Plug, X, LayoutGrid, Inbox,
} from "lucide-react";
import { KpiCard, StatusDot, HoldButton, toast } from "./premium/widgets";
import "./premium/dashboard.css";

// Claves de persistencia del layout (antes se guardaba en v3 y se leía de v6: nunca persistía).
const LAYOUT_KEY = "valhalla.dashboard.layout.v8";
const WIDGETS_KEY = "valhalla.dashboard.widgets.v8";

function useContainerWidth() {
  const [width, setWidth] = useState(1200);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function buildVolumeFallback(alerts: { timestamp?: string }[], hours: number): { points: number[]; labels: string[] } {
  const slots = hours <= 1 ? 12 : hours <= 24 ? 24 : 7;
  const spanMs = hours * 3600000;
  const now = Date.now();
  const buckets = Array(slots).fill(0);
  alerts.forEach((a) => {
    if (!a.timestamp) return;
    const age = now - new Date(a.timestamp).getTime();
    if (age < 0 || age > spanMs) return;
    buckets[Math.min(slots - 1, Math.floor((1 - age / spanMs) * slots))]++;
  });
  const labels = buckets.map((_, i) => {
    if (i !== 0 && i !== slots - 1 && i !== Math.floor(slots / 2)) return "";
    return new Date(now - (slots - 1 - i) * (spanMs / slots)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }).filter(Boolean) as string[];
  return { points: buckets, labels };
}

function VolumeChart({ points, labels, emptyText }: { points: number[]; labels: string[]; emptyText: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <div className="vx-empty"><BarChart3 size={22} />{emptyText}</div>;
  const data = points.length === 1 ? [points[0], points[0]] : points;
  const W = 400, H = 120;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * W, y: H - (v / max) * (H - 14) - 2 }));
  // Curva suavizada (Catmull-Rom a Bézier)
  const line = pts.reduce((d, p, i, a) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const p0 = a[i - 2] || a[i - 1], p1 = a[i - 1], p3 = a[i + 1] || p;
    const c1x = p1.x + (p.x - p0.x) / 6, c1y = p1.y + (p.y - p0.y) / 6;
    const c2x = p.x - (p3.x - p1.x) / 6, c2y = p.y - (p3.y - p1.y) / 6;
    return `${d} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }, "");
  return (
    <div className="vx-chart">
      {hover !== null && <span className="vx-chart__tip">{data[hover]} alertas</span>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))); }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="vx-vol-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#vx-vol-grad)" />
        <path d={line} fill="none" stroke="var(--signal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hover !== null && pts[hover] && (
          <g>
            <line x1={pts[hover].x} x2={pts[hover].x} y1="0" y2={H} stroke="var(--line-strong)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r="3.5" fill="var(--signal)" />
          </g>
        )}
      </svg>
      {labels.length > 0 && <div className="vx-chart__axis">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>}
    </div>
  );
}

function CardHead({ icon: Icon, title, meta, tone, children }: { icon: LucideIcon; title: string; meta?: React.ReactNode; tone?: string; children?: React.ReactNode }) {
  return (
    <div className="vx-card__head">
      <span className="vx-card__icon" style={tone ? { ["--tone" as string]: tone } : undefined}><Icon size={15} /></span>
      <span className="vx-card__title">{title}</span>
      {meta && <span className="vx-card__meta">{meta}</span>}
      {children && <div className="vx-card__tools" onMouseDown={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}

const SEV_ORDER = ["critical", "high", "medium", "low"] as const;

const DEFAULT_ACTIVE = ["kpi-1", "kpi-2", "kpi-3", "kpi-4", "siem-flow", "chart-vol", "chart-levels", "top-attack", "mitre-tech", "stack-health"];
const DEFAULT_LAYOUT: any = {
  lg: [
    { i: "kpi-1", x: 0, y: 0, w: 3, h: 3 },
    { i: "kpi-2", x: 3, y: 0, w: 3, h: 3 },
    { i: "kpi-3", x: 6, y: 0, w: 3, h: 3 },
    { i: "kpi-4", x: 9, y: 0, w: 3, h: 3 },
    { i: "siem-flow", x: 0, y: 3, w: 8, h: 17 },
    { i: "chart-vol", x: 8, y: 3, w: 4, h: 6 },
    { i: "chart-levels", x: 8, y: 9, w: 4, h: 5 },
    { i: "top-attack", x: 8, y: 14, w: 4, h: 6 },
    { i: "mitre-tech", x: 0, y: 20, w: 6, h: 9 },
    { i: "stack-health", x: 6, y: 20, w: 6, h: 9 },
  ],
  // Pantallas estrechas (< 1000 px de contenido): 6 columnas, apilado
  md: [
    { i: "kpi-1", x: 0, y: 0, w: 3, h: 3 },
    { i: "kpi-2", x: 3, y: 0, w: 3, h: 3 },
    { i: "kpi-3", x: 0, y: 3, w: 3, h: 3 },
    { i: "kpi-4", x: 3, y: 3, w: 3, h: 3 },
    { i: "siem-flow", x: 0, y: 6, w: 6, h: 16 },
    { i: "chart-vol", x: 0, y: 22, w: 3, h: 6 },
    { i: "chart-levels", x: 3, y: 22, w: 3, h: 6 },
    { i: "top-attack", x: 0, y: 28, w: 6, h: 6 },
    { i: "mitre-tech", x: 0, y: 34, w: 6, h: 9 },
    { i: "stack-health", x: 0, y: 43, w: 6, h: 9 },
  ],
};

const readJson = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

export default function DashboardFinal({ isLockedProp = false, showWidgetCatalog = false, setShowWidgetCatalog, lang = "es" }: { isLockedProp?: boolean; showWidgetCatalog?: boolean; setShowWidgetCatalog?: (v: boolean) => void; lang?: "es" | "en" }) {
  const { ref, width } = useContainerWidth();
  const dispatch = useAppDispatch();
  const es = lang === "es";
  const t = (key: keyof typeof translations.es) => translations[lang][key] || key;

  const [layouts, setLayouts] = useState(() => ({ ...DEFAULT_LAYOUT, ...readJson(LAYOUT_KEY, {}) }));
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => readJson(WIDGETS_KEY, DEFAULT_ACTIVE));
  const [catalogInternal, setCatalogInternal] = useState(false);
  const catalogOpen = showWidgetCatalog !== undefined ? showWidgetCatalog : catalogInternal;
  const setCatalogOpen = setShowWidgetCatalog || setCatalogInternal;

  const [summary, setSummary] = useState<any>({ metrics: { tickets_open: 0, total_alerts_24h: 0, critical_alerts: 0, unique_agents: 0 } });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [topAttackers, setTopAttackers] = useState<any[]>([]);
  const [volumePoints, setVolumePoints] = useState<number[]>([]);
  const [volumeLabels, setVolumeLabels] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [mitreData, setMitreData] = useState<any[]>([]);
  const [services, setServices] = useState<any>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [timeRange, setTimeRange] = useState<number>(24);
  const [page, setPage] = useState(0);

  const rangeLabel = timeRange === 1 ? "1 h" : timeRange === 24 ? "24 h" : "7 d";

  const fetchData = async () => {
    try {
      const [dash, recent, top, vol, ags, mitre, svc, blk] = await Promise.all([
        getDashboardSummary(timeRange),
        getRecentAlerts(100, timeRange).catch(() => []),
        getTopAttackers(8, timeRange).catch(() => []),
        getAlertVolume(timeRange, timeRange <= 1 ? "5m" : "1h").catch(() => []),
        listAgents().catch(() => []),
        getMitreCoverage(timeRange).catch(() => []),
        getWazuhServices().catch(() => null),
        getBlockedIps().catch(() => []),
      ]);
      setSummary(dash);
      setAlerts(recent || []);
      setTopAttackers(top || []);
      setAgents(ags || []);
      setMitreData(mitre || []);
      setServices(svc);
      setBlocked(new Set((blk || []).map((b) => b.ip)));

      let pts: number[] = [];
      let lbls: string[] = [];
      if (vol && vol.length > 0) {
        pts = vol.map((p: any) => (typeof p === "object" ? p.count ?? 0 : p));
        lbls = vol.map((p: any, i: number) => (i === 0 || i === vol.length - 1 || i === Math.floor(vol.length / 2))
          ? new Date(p.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "").filter(Boolean);
      } else if ((recent || []).length > 0) {
        ({ points: pts, labels: lbls } = buildVolumeFallback(recent, timeRange));
      }
      setVolumePoints(pts);
      setVolumeLabels(lbls);
    } catch (e) {
      logger.error("fetchData error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    setPage(0);
    const interval = setInterval(fetchData, 30000);
    const onNewAlert = (e: any) => {
      setAlerts((prev) => prev.some((a) => a.description === e.detail.description && a.timestamp === e.detail.timestamp) ? prev : [e.detail, ...prev].slice(0, 100));
      getDashboardSummary(timeRange).then(setSummary).catch(() => {});
    };
    window.addEventListener("valhalla-new-alert", onNewAlert);
    return () => { clearInterval(interval); window.removeEventListener("valhalla-new-alert", onNewAlert); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const handleSync = async () => {
    setBusy(true);
    try {
      const r = await syncWazuhAlerts(1);
      toast(es ? `Sincronizado: ${r.created} incidentes nuevos, ${r.skipped} ya existían.` : `Synced: ${r.created} new incidents, ${r.skipped} already existed.`, "ok");
      fetchData();
    } catch (e) {
      toast(es ? "No se pudo sincronizar con Wazuh." : "Could not sync with Wazuh.", "err");
      logger.error("Sync error:", e);
    } finally { setBusy(false); }
  };

  const handleCreateTicket = async (al: any) => {
    setBusy(true);
    try {
      await createTicket({
        title: `Wazuh Alert: ${al.description || al.rule_id}`.slice(0, 200),
        description: `Source: ${al.source_ip || "N/A"}\nAgent: ${al.agent_name || "N/A"}\nRule: ${al.rule_id} (level ${al.rule_level ?? "?"})\n\n${al.description || ""}`,
        severity: al.severity || "medium",
        category: "wazuh-alert",
        source_ip: al.source_ip || null,
        affected_asset: al.agent_name || al.agent_id || "Manager",
        wazuh_alert_id: al.id ? String(al.id) : null,
      });
      toast(es ? "Incidente creado a partir de la alerta." : "Incident created from alert.", "ok");
      fetchData();
    } catch (e) {
      toast(es ? "Error al crear el incidente." : "Failed to create incident.", "err");
      logger.error("Error creating ticket:", e);
    } finally { setBusy(false); }
  };

  const handleBlock = async (ip: string) => {
    try {
      const r = await blockIp(ip, undefined, "Bloqueo manual desde la Vista general");
      setBlocked((prev) => new Set(prev).add(ip));
      toast(es
        ? `IP ${ip} bloqueada${r.active_response ? " (firewall-drop aplicado)" : " (añadida a la lista CDB de Wazuh)"}.`
        : `IP ${ip} blocked${r.active_response ? " (firewall-drop applied)" : " (added to Wazuh CDB list)"}.`, "ok");
    } catch (e) {
      toast(String(e).replace(/^Error:\s*/, ""), "err");
    }
  };

  const goIntel = (ip: string) => dispatch(navigateToIntel(ip));

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(alerts.length / pageSize));
  const pageAlerts = alerts.slice(page * pageSize, (page + 1) * pageSize);

  const sevCounts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach((a) => { const s = (a.severity || "").toLowerCase(); if (s in c) c[s]++; });
    return c;
  }, [alerts]);
  const sevTotal = Object.values(sevCounts).reduce((a, b) => a + b, 0);
  const sevLabel: Record<string, string> = { critical: t("critical"), high: t("high"), medium: t("medium"), low: t("low") };

  const activeAgents = agents.filter((a) => a.status === "active").length;

  const svcState = (s?: string): "ok" | "warn" | "down" | "idle" =>
    s === "active" || s === "running" ? "ok" : s === "warning" ? "warn" : s ? "down" : "idle";

  const WIDGETS: Record<string, { name: string; w: number; h: number; render: () => React.ReactNode }> = {
    "kpi-1": { name: es ? "Alertas" : "Alerts", w: 3, h: 3, render: () => (
      <KpiCard icon={Activity} tone="accent" label={`${es ? "Alertas" : "Alerts"} · ${rangeLabel}`} value={summary.metrics.total_alerts_24h || 0}
        sub={es ? "Eventos del SIEM en el periodo" : "SIEM events in range"} spark={volumePoints} onClick={() => dispatch(setView("siem"))} />
    )},
    "kpi-2": { name: t("critical"), w: 3, h: 3, render: () => (
      <KpiCard icon={ShieldAlert} tone="danger" label={es ? "Críticas" : "Critical"} value={summary.metrics.critical_alerts || 0}
        sub={es ? "Nivel de regla ≥ 12" : "Rule level ≥ 12"} />
    )},
    "kpi-3": { name: t("agents"), w: 3, h: 3, render: () => (
      <KpiCard icon={Server} tone="info" label={es ? "Agentes activos" : "Active agents"} value={activeAgents}
        sub={es ? `de ${agents.length} registrados` : `of ${agents.length} registered`} onClick={() => dispatch(setView("assets"))} />
    )},
    "kpi-4": { name: es ? "Incidentes abiertos" : "Open incidents", w: 3, h: 3, render: () => (
      <KpiCard icon={Siren} tone="warning" label={es ? "Incidentes abiertos" : "Open incidents"} value={summary.metrics.tickets_open || 0}
        sub={es ? "Abiertos, en curso o escalados" : "Open, in progress or escalated"} onClick={() => dispatch(setView("workspace"))} />
    )},
    "siem-flow": { name: "SIEM", w: 8, h: 17, render: () => (
      <section className="vx-card">
        <CardHead icon={Layers} title={es ? "Alertas Wazuh" : "Wazuh alerts"} meta={`${alerts.length} ${es ? "eventos" : "events"}`}>
          <button className="vx-mini-btn" onClick={handleSync} disabled={busy} title={es ? "Crear incidentes a partir de alertas altas y críticas de la última hora" : "Create incidents from high/critical alerts of the last hour"}>
            <RefreshCw size={12} className={busy ? "vx-spin" : ""} />{es ? "Sincronizar" : "Sync"}
          </button>
          <button className="vx-iconbtn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label={es ? "Anterior" : "Previous"}><ChevronLeft size={15} /></button>
          <span className="vx-pager">{page + 1}/{totalPages}</span>
          <button className="vx-iconbtn" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label={es ? "Siguiente" : "Next"}><ChevronRight size={15} /></button>
        </CardHead>
        <div className="vx-card__body">
          <div className="vx-table">
            <div className="vx-table__head">
              <span>{es ? "Sev." : "Sev."}</span><span>{t("time")}</span><span>IP</span><span>{es ? "Agente" : "Agent"}</span><span>{t("description")}</span><span>{t("actions")}</span>
            </div>
            {pageAlerts.length === 0 && <div className="vx-empty" style={{ height: 180 }}><Inbox size={22} />{es ? "Sin alertas en este periodo" : "No alerts in this range"}</div>}
            {pageAlerts.map((al, i) => {
              const sev = (al.severity || "info").toLowerCase();
              const ip: string = al.source_ip || "";
              const isBlocked = !!ip && blocked.has(ip);
              return (
                <div key={al.id || `${al.timestamp}-${i}`} className="vx-table__row">
                  <span><span className={`vx-sev vx-sev--${sev}`}>{sevLabel[sev] || sev}</span></span>
                  <span className="vx-muted">{new Date(al.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span>{ip ? <button className="vx-ip" onClick={() => goIntel(ip)} title={es ? "Investigar en Threat Intel" : "Investigate in Threat Intel"}>{ip}</button> : <span className="vx-muted">—</span>}</span>
                  <span className="vx-muted">{al.agent_name || al.agent_id || "—"}</span>
                  <span title={al.description}>{al.description || `Rule ${al.rule_id}`}</span>
                  <span className="vx-actions">
                    <button className="vx-mini-btn" onClick={() => handleCreateTicket(al)} disabled={busy} title={es ? "Crear incidente" : "Create incident"}><Plus size={12} />INC</button>
                    <HoldButton
                      onConfirm={() => handleBlock(ip)}
                      disabled={!ip || isBlocked}
                      title={!ip ? (es ? "Alerta sin IP de origen" : "No source IP") : isBlocked ? (es ? "IP ya bloqueada" : "IP already blocked") : (es ? `Mantén pulsado para bloquear ${ip}` : `Hold to block ${ip}`)}
                    >
                      <Ban size={12} />{isBlocked ? (es ? "Bloqueada" : "Blocked") : "Block"}
                    </HoldButton>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    )},
    "chart-vol": { name: es ? "Volumen" : "Volume", w: 4, h: 6, render: () => (
      <section className="vx-card">
        <CardHead icon={BarChart3} title={es ? "Volumen" : "Volume"} meta={rangeLabel}>
          <span className="vx-big">{volumePoints.reduce((a, b) => a + b, 0).toLocaleString()}</span>
        </CardHead>
        <div className="vx-card__body"><VolumeChart points={volumePoints} labels={volumeLabels} emptyText={es ? "Sin datos" : "No data"} /></div>
      </section>
    )},
    "chart-levels": { name: es ? "Severidad" : "Severity", w: 4, h: 5, render: () => (
      <section className="vx-card">
        <CardHead icon={ShieldAlert} title={es ? "Severidad" : "Severity"} meta={`${sevTotal} ${es ? "alertas" : "alerts"}`} />
        <div className="vx-card__body vx-bars">
          {SEV_ORDER.map((s) => (
            <div key={s} className={`vx-sev--${s}`}>
              <div className="vx-bar__top"><span>{sevLabel[s]}</span><span><b>{sevCounts[s]}</b><small>{sevTotal ? Math.round((sevCounts[s] / sevTotal) * 100) : 0}%</small></span></div>
              <div className="vx-bar__track"><div className="vx-bar__fill" style={{ width: `${sevTotal ? (sevCounts[s] / sevTotal) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    )},
    "top-attack": { name: es ? "Principales atacantes" : "Top attackers", w: 4, h: 6, render: () => {
      const max = Math.max(...topAttackers.map((a) => a.count || 0), 1);
      return (
        <section className="vx-card">
          <CardHead icon={Crosshair} title={es ? "Atacantes" : "Attackers"} meta={`${topAttackers.length} IP`} tone="var(--danger)" />
          <div className="vx-card__body">
            {topAttackers.length === 0 ? <div className="vx-empty"><Crosshair size={22} />{es ? "Sin IP atacantes en el periodo" : "No attacking IPs in range"}</div> : (
              <ul className="vx-list">
                {topAttackers.map((a) => (
                  <li key={a.ip}>
                    <div className="vx-list__row">
                      <button className="vx-ip" onClick={() => goIntel(a.ip)}>{a.ip}</button>
                      {blocked.has(a.ip) && <span className="vx-sev vx-sev--low">{es ? "bloqueada" : "blocked"}</span>}
                      <b>{a.count.toLocaleString()}</b>
                    </div>
                    <div className="vx-list__sub" title={a.attack_type}>{a.attack_type}</div>
                    <div className="vx-bar__track vx-sev--critical"><div className="vx-bar__fill" style={{ width: `${(a.count / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      );
    }},
    "mitre-tech": { name: "MITRE ATT&CK", w: 6, h: 9, render: () => {
      const max = Math.max(...mitreData.map((m: any) => m.count || 0), 1);
      return (
        <section className="vx-card">
          <CardHead icon={Target} title="MITRE ATT&CK" meta={`${mitreData.length} ${es ? "técnicas" : "techniques"}`} />
          <div className="vx-card__body">
            {mitreData.length === 0 ? <div className="vx-empty"><Target size={22} />{es ? "Ninguna técnica observada en el periodo" : "No techniques observed in range"}</div> : (
              <ul className="vx-list">
                {mitreData.slice(0, 10).map((m: any, i: number) => (
                  <li key={i}>
                    <div className="vx-list__row"><span className="vx-code">{m.technique_id}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.technique}</span><b>{m.count}</b></div>
                    <div className="vx-bar__track" style={{ ["--sev" as string]: "var(--signal)" }}><div className="vx-bar__fill" style={{ width: `${(m.count / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      );
    }},
    "stack-health": { name: es ? "Salud del stack" : "Stack health", w: 6, h: 9, render: () => {
      const items: { name: string; icon: LucideIcon; status?: string; hint?: string }[] = [
        { name: "Wazuh Manager", icon: Server, status: services?.manager || services?.status },
        { name: "Wazuh Indexer", icon: Database, status: services?.indexer || (summary.status === "operational" ? "active" : undefined) },
        { name: "Cowrie SSH/Telnet", icon: Bug, status: services?.cowrie, hint: services?.cowrie_events_24h != null ? `${services.cowrie_events_24h} evt/24h` : undefined },
        { name: es ? "Honeypot (señuelo)" : "Honeypot (decoy)", icon: Radar, status: services?.honeypot || services?.cowrie },
        { name: es ? "Simulador atacante" : "Attack simulator", icon: Swords, status: services?.attacker },
        { name: "API Valhalla", icon: Plug, status: services?.api || "active" },
      ];
      const stateText = { ok: es ? "Operativo" : "Operational", warn: es ? "Activo · sin eventos" : "Up · no events", down: es ? "Caído" : "Down", idle: es ? "Sin datos" : "No data" };
      return (
        <section className="vx-card">
          <CardHead icon={HeartPulse} title={es ? "Salud del stack" : "Stack health"} tone="#2fbf71" />
          <div className="vx-card__body">
            <div className="vx-health">
              {items.map((s) => {
                const st = svcState(s.status);
                const Icon = s.icon;
                return (
                  <div key={s.name} className="vx-health__item">
                    <Icon size={18} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="vx-health__name">{s.name}</div>
                      <div className="vx-health__state">{stateText[st]}{s.hint ? ` · ${s.hint}` : ""}</div>
                    </div>
                    <StatusDot state={st} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }},
  };

  const saveLayout = (all: any, widgets = activeWidgets) => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
      localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets));
    } catch { /* almacenamiento no disponible */ }
  };
  const onLayoutChange = (_: any, all: any) => { setLayouts(all); saveLayout(all); };
  const addWidget = (id: string) => {
    if (activeWidgets.includes(id)) return;
    const w = WIDGETS[id];
    const next = { ...layouts, lg: [...(layouts.lg || []), { i: id, x: 0, y: Infinity, w: w.w, h: w.h }] };
    const ids = [...activeWidgets, id];
    setLayouts(next); setActiveWidgets(ids); saveLayout(next, ids);
    setCatalogOpen(false);
  };
  const removeWidget = (id: string) => {
    const ids = activeWidgets.filter((w) => w !== id);
    const next = { ...layouts, lg: (layouts.lg || []).filter((l: any) => l.i !== id) };
    setLayouts(next); setActiveWidgets(ids); saveLayout(next, ids);
  };
  const available = Object.entries(WIDGETS).filter(([k]) => !activeWidgets.includes(k));

  return (
    <div className="view vx-overview" ref={ref}>
      <div className="vx-overview__bar">
        <div className="vx-overview__title">
          <h1>{es ? "Vista general" : "Overview"}</h1>
          <span>{es ? "Actualización automática cada 30 s" : "Auto-refresh every 30 s"}</span>
        </div>
        <div className="vx-seg" role="group" aria-label={es ? "Periodo" : "Range"}>
          {[{ l: t("last_hour"), v: 1 }, { l: t("last_24h"), v: 24 }, { l: t("last_7d"), v: 168 }].map((r) => (
            <button key={r.v} aria-pressed={timeRange === r.v} onClick={() => setTimeRange(r.v)}>{r.l}</button>
          ))}
        </div>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        width={width}
        breakpoints={{ lg: 1000, md: 0 }}
        cols={{ lg: 12, md: 6 }}
        rowHeight={30}
        // API de react-grid-layout v2: el bloqueo del panel se aplica aquí
        dragConfig={{ enabled: !isLockedProp, handle: ".vx-card__head" }}
        resizeConfig={{ enabled: !isLockedProp }}
        onLayoutChange={onLayoutChange}
        margin={[12, 12]}
      >
        {activeWidgets.filter((id) => WIDGETS[id]).map((id) => (
          <div key={id} style={{ position: "relative" }}>
            {!isLockedProp && <button className="vx-remove" onClick={() => removeWidget(id)} aria-label={es ? "Quitar widget" : "Remove widget"}><X size={12} /></button>}
            {WIDGETS[id].render()}
          </div>
        ))}
      </ResponsiveGridLayout>

      {catalogOpen && (
        <div className="vp-modal-backdrop" onMouseDown={() => setCatalogOpen(false)}>
          <div className="vp-pop" style={{ position: "static", width: "min(520px, 100%)" }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t("add_widget_title")}>
            <div className="vp-pop__head">
              <LayoutGrid size={16} color="var(--signal)" />
              <div className="vp-pop__title">{t("add_widget_title")}</div>
            </div>
            <div className="vp-pop__body">
              {available.length === 0 ? (
                <div className="vp-empty"><LayoutGrid size={22} />{es ? "Todos los widgets están activos." : "All widgets are active."}</div>
              ) : available.map(([k, w]) => (
                <button key={k} className="vp-menu-item" onClick={() => addWidget(k)}><Plus size={16} />{w.name}</button>
              ))}
            </div>
            <div className="vp-pop__foot"><button className="vp-btn vp-btn--block" onClick={() => setCatalogOpen(false)}>{t("close")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
