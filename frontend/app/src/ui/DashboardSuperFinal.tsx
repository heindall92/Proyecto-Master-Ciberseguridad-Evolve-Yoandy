import { useState, useEffect, useRef, useMemo } from "react";
import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import { getDashboardSummary, getRecentAlerts, getTopAttackers, getAlertVolume, listAgents, syncWazuhAlerts, getMitreCoverage, getWazuhServices, AlertOut, AgentOut } from "../lib/api";
import { translations } from "./translations";

function useContainerWidth() {
  const [width, setWidth] = useState(1200);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function AreaChart({ points, color, gradientId, labels }: { points: number[], color: string, gradientId: string, labels?: string[] }) {
  if (!points || points.length < 2) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px', letterSpacing: '2px' }}>SIN DATOS</div>
  );
  const W = 400; const H = 120;
  const max = Math.max(...points, 1);
  const pts = points.map((v, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - (v / max) * (H - 12)
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', flex: 1, display: 'block' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {pts.slice(-1).map(p => (
          <circle key="last" cx={p.x} cy={p.y} r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        ))}
      </svg>
      {labels && labels.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 2px 0' }}>
          {labels.map((l, i) => (
            <span key={i} style={{ fontSize: '7px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SevBar({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color, fontWeight: 700 }}>{count}</span>
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color, borderRadius: '2px',
          boxShadow: `0 0 6px ${color}60`,
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        }} />
      </div>
    </div>
  );
}

const DEFAULT_ACTIVE = ["kpi-1", "kpi-2", "kpi-3", "kpi-4", "siem-flow", "chart-vol", "chart-levels", "top-attack", "mitre-tech", "stack-health"];

const DEFAULT_LAYOUT: any = {
  lg: [
    { i: "kpi-1", x: 0, y: 0, w: 2, h: 2 },
    { i: "kpi-2", x: 2, y: 0, w: 2, h: 2 },
    { i: "kpi-3", x: 4, y: 0, w: 2, h: 2 },
    { i: "kpi-4", x: 6, y: 0, w: 2, h: 2 },
    { i: "siem-flow", x: 0, y: 2, w: 9, h: 26 },
    { i: "chart-vol", x: 9, y: 2, w: 3, h: 8 },
    { i: "chart-levels", x: 9, y: 10, w: 3, h: 8 },
    { i: "top-attack", x: 9, y: 18, w: 3, h: 10 },
    { i: "mitre-tech", x: 0, y: 28, w: 6, h: 10 },
    { i: "stack-health", x: 6, y: 28, w: 6, h: 10 },
  ]
};

export default function DashboardFinal({ isLockedProp = false, showWidgetCatalog = false, setShowWidgetCatalog, lang = "es" }: { isLockedProp?: boolean; showWidgetCatalog?: boolean; setShowWidgetCatalog?: (v: boolean) => void; lang?: "es" | "en" }) {
  const { ref, width } = useContainerWidth();
  const t = (key: keyof typeof translations.es) => translations[lang][key] || key;
  
  const [layouts, setLayouts] = useState(() => {
    const saved = localStorage.getItem("valhalla.dashboard.layout.v6");
    return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
  });
  
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    const saved = localStorage.getItem("valhalla.dashboard.widgets.v11");
    return saved ? JSON.parse(saved) : DEFAULT_ACTIVE;
  });

  const [internalIsLocked, setInternalIsLocked] = useState(true);
  const [showCatalogInternal, setShowCatalogInternal] = useState(false);
  const [siemPageInternal, setSiemPageInternal] = useState(0);

  const lockState = isLockedProp !== undefined ? isLockedProp : internalIsLocked;
  const catalogState = showWidgetCatalog !== undefined ? showWidgetCatalog : showCatalogInternal;
  const setCatalogState = setShowWidgetCatalog || setShowCatalogInternal;
  const siemPageState = siemPageInternal;
  const setSiemPageState = setSiemPageInternal;

  const handleHardReset = () => {
    localStorage.removeItem("valhalla.dashboard.layout.v6");
    localStorage.removeItem("valhalla.dashboard.widgets.v6");
    window.location.reload();
  };

  const [summary, setSummary] = useState<any>({ metrics: { alerts: 0, events: 0, tickets_open: 0, total_alerts_24h: 0, critical_alerts: 0, unique_agents: 0 } });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [topAttackers, setTopAttackers] = useState<any[]>([]);
  const [volumePoints, setVolumePoints] = useState<number[]>([]);
  const [volumeLabels, setVolumeLabels] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [mitreData, setMitreData] = useState<any[]>([]);
  const [wazuhServices, setWazuhServices] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{created: number, skipped: number} | null>(null);
  const [timeRange, setTimeRange] = useState<number>(24); // 1, 24, 168

  const fetchData = async () => {
    try {
      const dash = await getDashboardSummary(timeRange);
      setSummary(dash);
      
      try {
        const alts = await getRecentAlerts(100, timeRange);
        setAlerts(alts || []);
      } catch(e) { setAlerts([]); }
      
      try {
        const top = await getTopAttackers(10, timeRange);
        setTopAttackers(top || []);
      } catch(e) { setTopAttackers([]); }
      
      try {
        const vol = await getAlertVolume(timeRange, timeRange <= 1 ? "5m" : "1h");
        setVolumePoints((vol || []).map((p: any) => typeof p === 'object' ? (p.count ?? 0) : p));
        setVolumeLabels((vol || []).map((p: any, i: number) => {
          if (i === 0 || i === vol.length - 1 || i === Math.floor(vol.length / 2)) {
            const date = new Date(p.time);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          return "";
        }).filter(l => l !== ""));
      } catch(e) { setVolumePoints([]); setVolumeLabels([]); }
      
      try {
        const ags = await listAgents();
        setAgents(ags || []);
      } catch(e) { setAgents([]); }

      try {
        const mitre = await getMitreCoverage(timeRange);
        setMitreData(mitre || []);
      } catch(e) { setMitreData([]); }

      try {
        const services = await getWazuhServices();
        setWazuhServices(services);
      } catch(e) { setWazuhServices(null); }

    } catch (e) {
      console.error("fetchData error:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const handleSyncWazuh = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncWazuhAlerts(1);
      setSyncResult(result);
      fetchData(); 
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateTicketFromAlert = async (alertData: any) => {
    try {
      setSyncing(true);
      const title = `Wazuh Alert: ${alertData.description || alertData.rule_id}`;
      const { createTicket } = await import("../lib/api");
      await createTicket({
        title: title.slice(0, 200),
        description: `Source: ${alertData.source_ip || 'N/A'}\nAgent: ${alertData.agent_name || 'N/A'}\nRule: ${alertData.rule_id}\n\n${alertData.description || ''}`,
        severity: alertData.severity || "medium",
        category: "wazuh-alert",
        source_ip: alertData.source_ip || null,
        affected_asset: alertData.agent_name || alertData.agent_id || "Manager",
        wazuh_alert_id: String(alertData.id),
      });
      window.alert("Ticket de incidencia creado correctamente");
      fetchData();
    } catch (e) {
      console.error("Error creating ticket:", e);
      window.alert("Error al crear el ticket");
    } finally {
      setSyncing(false);
    }
  };

  const pageSize = 15;
  const totalPages = Math.ceil(alerts.length / pageSize) || 1;
  const currentAlerts = alerts.slice(siemPageState * pageSize, (siemPageState + 1) * pageSize);

  const WIDGET_REGISTRY = useMemo(() => ({
    "kpi-1": { name: t('alerts_24h'), w: 2, h: 2, icon: "📊", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '4px 10px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#06b6d4', textShadow: '0 0 10px rgba(6,182,212,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.total_alerts_24h || 0}</span>
        <span style={{ fontSize: '9px', color: 'rgba(6,182,212,0.8)', letterSpacing: '1px' }}>{t('siem').toUpperCase()}</span>
      </button>
    )},
    "kpi-2": { name: t('critical'), w: 2, h: 2, icon: "🔥", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '4px 10px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444', textShadow: '0 0 10px rgba(239,68,68,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.critical_alerts || 0}</span>
        <span style={{ fontSize: '9px', color: 'rgba(239,68,68,0.8)', letterSpacing: '1px' }}>{t('critical').toUpperCase()}</span>
      </button>
    )},
    "kpi-3": { name: t('agents'), w: 2, h: 2, icon: "🖥️", render: () => {
      const active = agents.filter(a => a.status === 'active').length;
      const total = agents.length;
      return (
        <button className="navbtn" style={{ background: 'transparent', padding: '4px 10px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '24px', fontWeight: 900, color: '#06b6d4', textShadow: '0 0 10px rgba(6,182,212,0.5)', fontFamily: 'var(--mono)' }}>{active}</span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--mono)' }}>/ {total}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontSize: '9px', color: '#06b6d4', letterSpacing: '1px' }}>{t('active').toUpperCase()}</span>
            {total > active && <span style={{ fontSize: '9px', color: '#ef4444', letterSpacing: '1px' }}>{t('disconnected').toUpperCase()}</span>}
          </div>
        </button>
      )
    }},
    "kpi-4": { name: t('top_attackers'), w: 2, h: 2, icon: "🎯", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '4px 10px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#f59e0b', textShadow: '0 0 10px rgba(245,158,11,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.unique_attackers || 0}</span>
        <span style={{ fontSize: '9px', color: 'rgba(245,158,11,0.8)', letterSpacing: '1px' }}>{t('ips').toUpperCase()}</span>
      </button>
    )},
    "siem-flow": { name: "SIEM Flow", w: 8, h: 10, icon: "🌊", render: () => {
      const SEV_COLOR: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#38bdf8' };
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 6px var(--signal)', animation: 'pulse 2s infinite', display: 'inline-block' }} />
              <span className="panel__title">SIEM · {t('siem_sub').toUpperCase()}</span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--mono)' }}>{alerts.length} eventos</span>
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button
                onClick={handleSyncWazuh}
                disabled={syncing}
                style={{
                  background: syncing ? 'rgba(0,255,136,0.1)' : 'rgba(0,255,136,0.15)',
                  color: 'var(--signal)', border: '1px solid rgba(0,255,136,0.3)',
                  padding: '2px 8px', cursor: syncing ? 'not-allowed' : 'pointer',
                  fontSize: '11px', letterSpacing: '1px', fontFamily: 'var(--mono)', fontWeight: 'bold'
                }}
              >{syncing ? '···' : '+INC'}</button>
              <button onClick={() => setSiemPageState(p => Math.max(0, p - 1))} disabled={siemPageState === 0} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--signal)', padding: '1px 5px', cursor: 'pointer', fontSize: '12px' }}>◄</button>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{siemPageState + 1}/{totalPages}</span>
              <button onClick={() => setSiemPageState(p => Math.min(totalPages - 1, p + 1))} disabled={siemPageState >= totalPages - 1} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--signal)', padding: '1px 5px', cursor: 'pointer', fontSize: '12px' }}>►</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '65px 85px 110px 110px 1fr 140px', gap: '0 8px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['SEV',t('time'),t('ip'),t('agents'),t('description'), t('actions')].map((h, idx) => (
              <span key={idx} style={{ fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.3)', fontWeight: 'bold' }}>{h.toUpperCase()}</span>
            ))}
          </div>
          <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
            {currentAlerts.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px', letterSpacing: '2px' }}>{t('no_alerts').toUpperCase()}</div>
            )}
            {currentAlerts.map((al, i) => {
              const sev = (al.severity || 'info').toLowerCase();
              const color = SEV_COLOR[sev] || '#38bdf8';
              const isSshBrute = al.description?.toLowerCase().includes("ssh") && al.description?.toLowerCase().includes("brute force");
              return (
                <div key={al.id || i} style={{
                  display: 'grid', gridTemplateColumns: '65px 85px 110px 110px 1fr 140px',
                  gap: '0 8px', padding: '10px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  alignItems: 'center', fontSize: '12px',
                  transition: 'background 0.15s',
                  position: 'relative'
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px', fontFamily: 'var(--mono)',
                    color, padding: '2px 6px', background: `${color}15`,
                    textAlign: 'center', display: 'inline-block', border: `1px solid ${color}30`
                  }}>{sev.toUpperCase().slice(0, 4)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                    {new Date(al.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ color: 'var(--signal)', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600 }}>
                    {al.source_ip || '—'}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--mono)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {al.agent_name || al.agent_id || '—'}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{ color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', fontWeight: 500 }}>
                      {al.description || `Rule ${al.rule_id}`}
                    </span>
                    {isSshBrute && (
                      <span style={{ fontSize: '9px', color: '#f59e0b', fontStyle: 'italic' }}>⚠️ Check for "Accepted Password" follow-up</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => handleCreateTicketFromAlert(al)}
                      disabled={syncing}
                      style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--signal)', fontSize: '9px', padding: '2px 4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      +INC
                    </button>
                    <button style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '9px', padding: '2px 4px', cursor: 'pointer' }}>BLOCK</button>
                    <button style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4', fontSize: '9px', padding: '2px 4px', cursor: 'pointer' }}>WAZUH</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }},
    "chart-vol": { name: "Volume", w: 4, h: 4, icon: "📈", render: () => {
      const lastVal = volumePoints?.slice(-1)?.[0] || 0;
      const maxVal = Math.max(...(volumePoints || [1]), 1);
      const trend = volumePoints.length >= 2 ? volumePoints[volumePoints.length - 1] - volumePoints[volumePoints.length - 2] : 0;
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 5px var(--signal)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <span className="panel__title">{t('volume')} · {timeRange}H</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--signal)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{lastVal}</span>
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>{t('eps')}</span>
              {trend !== 0 && <span style={{ fontSize: '9px', color: trend > 0 ? '#ef4444' : '#22c55e' }}>{trend > 0 ? '▲' : '▼'}</span>}
            </div>
          </div>
          <div style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>-{timeRange}h</span>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>{t('max')}: {maxVal}</span>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>{t('now')}</span>
          </div>
          <div style={{ flex: 1, padding: '0 12px 12px', minHeight: 0 }}>
            <AreaChart points={volumePoints} labels={volumeLabels} color="#00ff88" gradientId="vol-grad" />
          </div>
        </section>
      );
    }},
    "chart-levels": { name: "Niveles", w: 4, h: 4, icon: "📊", render: () => {
      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      alerts.forEach(al => {
        const s = (al.severity || '').toLowerCase();
        if (s in counts) counts[s as keyof typeof counts]++;
      });
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
            <span className="panel__title">{t('distribution')} · SEV</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--mono)' }}>{total === 1 ? 0 : total} {t('siem').toLowerCase()}</span>
          </div>
          <div className="panel__body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', flex: 1 }}>
            <SevBar label={t('critical').toUpperCase()} count={counts.critical} total={total === 1 ? 0 : total} color="#ef4444" />
            <SevBar label={t('high').toUpperCase()} count={counts.high} total={total === 1 ? 0 : total} color="#f97316" />
            <SevBar label={t('medium').toUpperCase()} count={counts.medium} total={total === 1 ? 0 : total} color="#eab308" />
            <SevBar label={t('low').toUpperCase()} count={counts.low} total={total === 1 ? 0 : total} color="#22c55e" />
          </div>
        </section>
      );
    }},
    "mitre-tech": { name: "MITRE Tech", w: 6, h: 5, icon: "🛡️", render: () => {
      const maxCount = Math.max(...(mitreData.map((m: any) => m.count || 0)), 1);
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
             <span className="panel__title">{t('mitre_tech').toUpperCase()}</span>
             <span style={{ fontSize: '9px', color: 'var(--signal)', fontFamily: 'var(--mono)' }}>{mitreData.length} técnicas</span>
          </div>
          <div className="panel__body" style={{ padding: '8px 0', overflowY: 'auto', flex: 1 }}>
            {mitreData.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px' }}>{t('no_data').toUpperCase()}</div>
            )}
            {mitreData.slice(0, 10).map((m: any, i: number) => {
              const barPct = (m.count / maxCount) * 100;
              return (
                <div key={i} style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--mono)' }}>{m.technique_id} - {m.technique}</span>
                    <span style={{ fontSize: '10px', color: 'var(--signal)', fontWeight: 'bold' }}>{m.count}</span>
                  </div>
                  <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '1px' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--signal)', opacity: 0.6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }},
    "stack-health": { name: "Health", w: 6, h: 5, icon: "💓", render: () => {
      const services = [
        { name: t('manager'), status: wazuhServices?.status || 'disconnected', icon: '🛡️' },
        { name: t('indexer'), status: summary.status === 'operational' ? 'active' : 'disconnected', icon: '📊' },
        { name: t('api'), status: 'active', icon: '🔌' }
      ];
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
             <span className="panel__title">{t('stack_health').toUpperCase()}</span>
          </div>
          <div className="panel__body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {services.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '18px' }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'rgba(255,255,255,0.7)' }}>{s.name}</div>
                  <div style={{ fontSize: '9px', color: s.status === 'active' || s.status === 'running' ? 'var(--signal)' : 'var(--danger)', textTransform: 'uppercase' }}>
                    ● {s.status}
                  </div>
                </div>
                {s.status === 'active' && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{t('latency')}: 24ms</div>}
              </div>
            ))}
          </div>
        </section>
      );
    }}
  }), [summary, alerts, topAttackers, volumePoints, agents, siemPageState, setSiemPageState]);

  const onLayoutChange = (layout: any, allLayouts: any) => {
    setLayouts(allLayouts);
    localStorage.setItem("valhalla.dashboard.layout.v3", JSON.stringify(allLayouts));
    localStorage.setItem("valhalla.dashboard.widgets.v3", JSON.stringify(activeWidgets));
  };

  const addWidget = (id: string) => {
    if (activeWidgets.includes(id)) return;
    const widget = WIDGET_REGISTRY[id];
    const newLg = [...layouts.lg, { i: id, x: 0, y: Infinity, w: widget.w, h: widget.h }];
    setLayouts({ ...layouts, lg: newLg });
    const newActive = [...activeWidgets, id];
    setActiveWidgets(newActive);
    localStorage.setItem("valhalla.dashboard.widgets.v3", JSON.stringify(newActive));
    setCatalogState(false);
  };

  const removeWidget = (id: string) => {
    const newActive = activeWidgets.filter(w => w !== id);
    setActiveWidgets(newActive);
    localStorage.setItem("valhalla.dashboard.widgets.v3", JSON.stringify(newActive));
    const newLg = layouts.lg.filter((l: any) => l.i !== id);
    setLayouts({ ...layouts, lg: newLg });
  };

  return (
    <div className="view" ref={ref} style={{ flex: 1, padding: '4px 8px', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '4px 12px 8px' }}>
        {[
          { label: t('last_hour'), val: 1 },
          { label: t('last_24h'), val: 24 },
          { label: t('last_7d'), val: 168 }
        ].map(r => (
          <button 
            key={r.val}
            onClick={() => setTimeRange(r.val)}
            style={{
              background: timeRange === r.val ? 'var(--signal)' : 'rgba(0,0,0,0.3)',
              color: timeRange === r.val ? '#000' : 'var(--text-dim)',
              border: '1px solid var(--line)',
              padding: '4px 12px',
              fontSize: '10px',
              fontFamily: 'var(--mono)',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              clipPath: 'polygon(5px 0%, 100% 0%, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0% 100%, 0% 5px)'
            }}
          >
            {r.label.toUpperCase()}
          </button>
        ))}
      </div>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        width={width}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={30}
        draggableHandle=".panel__head"
        isDraggable={!lockState}
        isResizable={!lockState}
        onLayoutChange={onLayoutChange}
        margin={[12, 8]}
      >
        {activeWidgets.map(id => {
          const widget = WIDGET_REGISTRY[id];
          if (!widget) return null;
          return (
            <div key={id} style={{ position: 'relative' }}>
              {!lockState && <button onClick={() => removeWidget(id)} style={{ position: 'absolute', top: 2, right: 2, zIndex: 10, background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer' }}>×</button>}
              {widget.render()}
            </div>
          );
        })}
      </ResponsiveGridLayout>
      {catalogState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCatalogState(false)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--signal)', padding: '24px', maxWidth: '500px', width: '90%', boxShadow: '0 0 30px rgba(0,255,136,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--signal)', fontFamily: 'var(--mono)', letterSpacing: '2px', borderBottom: '1px solid var(--line)', paddingBottom: '8px', textAlign: 'center' }}>⬡ {t('add_widget_title')} ⬡</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {Object.entries(WIDGET_REGISTRY).filter(([k]) => !activeWidgets.includes(k)).map(([k, w]: [string, any]) => (
                <button key={k} onClick={() => addWidget(k)} style={{ padding: '14px', background: 'rgba(0,255,136,0.05)', border: '1px solid var(--line-strong)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: '18px', marginRight: '8px' }}>{w.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1px' }}>{w.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setCatalogState(false)} style={{ 
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '16px',
              width: '100%',
              padding: '16px',
              background: '#ff0000',
              border: '2px solid #ff3333',
              color: '#ffffff',
              fontFamily: 'var(--sans)',
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              marginBottom: '10px',
              clipPath: 'polygon(10px 0%, 65% 0%, 72% 25%, 100% 25%, 100% calc(100% - 10px), calc(100% - 15px) 100%, 15px 100%, 0% calc(100% - 15px), 0% 10px)'
            }}>
             ✕ {t('close')}
          </button>
          </div>
        </div>
      )}
    </div>
  );
}