import { useState, useEffect, useRef, useMemo } from "react";
import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import { getDashboardSummary, getRecentAlerts, getTopAttackers, getAlertVolume, listAgents, syncWazuhAlerts, AlertOut, AgentOut } from "../lib/api";

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

function AreaChart({ points, color, gradientId }: { points: number[], color: string, gradientId: string }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
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

const DEFAULT_ACTIVE = ["kpi-1", "kpi-2", "kpi-3", "kpi-4", "siem-flow", "chart-vol", "chart-levels", "top-attack"];

const DEFAULT_LAYOUT: any = {
  lg: [
    { i: "kpi-1", x: 0, y: 0, w: 2, h: 2 },
    { i: "kpi-2", x: 2, y: 0, w: 2, h: 2 },
    { i: "kpi-3", x: 4, y: 0, w: 2, h: 2 },
    { i: "kpi-4", x: 6, y: 0, w: 2, h: 2 },
    { i: "siem-flow", x: 0, y: 2, w: 8, h: 26 },
    { i: "chart-vol", x: 8, y: 2, w: 4, h: 8 },
    { i: "chart-levels", x: 8, y: 10, w: 4, h: 8 },
    { i: "top-attack", x: 8, y: 18, w: 4, h: 10 },
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
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{created: number, skipped: number} | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Usar solo dashboard que no depende de Wazuh
        const dash = await getDashboardSummary();
        setSummary(dash);
        
        // Intentar obtener alertas de Wazuh (puede fallar si no está disponible)
        try {
          const alts = await getRecentAlerts(100);
          setAlerts(alts || []);
        } catch(e) {
          console.warn("Wazuh alerts unavailable:", e);
          setAlerts([]);
        }
        
        try {
          const top = await getTopAttackers(10);
          setTopAttackers(top || []);
        } catch(e) {
          setTopAttackers([]);
        }
        
        try {
          const vol = await getAlertVolume(24);
          setVolumePoints((vol || []).map((p: any) => typeof p === 'object' ? (p.count ?? 0) : p));
        } catch(e) {
          setVolumePoints([]);
        }
        
        try {
          const ags = await listAgents();
          setAgents(ags || []);
        } catch(e) {
          setAgents([]);
        }
      } catch (e) {
        console.error("fetchData error:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncWazuh = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncWazuhAlerts(1);
      setSyncResult(result);
      fetchData(); // Refresh after sync
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const pageSize = 15;
  const totalPages = Math.ceil(alerts.length / pageSize) || 1;
  const currentAlerts = alerts.slice(siemPageState * pageSize, (siemPageState + 1) * pageSize);

  const WIDGET_REGISTRY = useMemo(() => ({
    "kpi-1": { name: "Alertas 24h", w: 2, h: 2, icon: "📊", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#06b6d4', textShadow: '0 0 10px rgba(6,182,212,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.alerts}</span>
        <span style={{ fontSize: '9px', color: 'rgba(6,182,212,0.8)', letterSpacing: '1px' }}>ALERTAS</span>
      </button>
    )},
    "kpi-2": { name: "Eventos", w: 2, h: 2, icon: "⚡", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444', textShadow: '0 0 10px rgba(239,68,68,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.events}</span>
        <span style={{ fontSize: '9px', color: 'rgba(239,68,68,0.8)', letterSpacing: '1px' }}>EVENTOS</span>
      </button>
    )},
    "kpi-3": { name: "Agentes", w: 2, h: 2, icon: "🖥️", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#06b6d4', textShadow: '0 0 10px rgba(6,182,212,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.unique_agents || 0}</span>
        <span style={{ fontSize: '9px', color: 'rgba(6,182,212,0.8)', letterSpacing: '1px' }}>AGENTES</span>
      </button>
    )},
    "kpi-4": { name: "Atacantes", w: 2, h: 2, icon: "🎯", render: () => (
      <button className="navbtn" style={{ background: 'transparent', padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto auto', alignItems: 'center', gap: '2px', minHeight: '50px' }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#f59e0b', textShadow: '0 0 10px rgba(245,158,11,0.5)', fontFamily: 'var(--mono)' }}>{summary.metrics.unique_attackers || 0}</span>
        <span style={{ fontSize: '9px', color: 'rgba(245,158,11,0.8)', letterSpacing: '1px' }}>IPS</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: '65px 85px 110px 1fr', gap: '0 8px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['SEV','HORA','AGENTE','DESCRIPCIÓN'].map(h => (
              <span key={h} style={{ fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.3)', fontWeight: 'bold' }}>{h}</span>
            ))}
          </div>
          <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
            {currentAlerts.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px', letterSpacing: '2px' }}>SIN ALERTAS</div>
            )}
            {currentAlerts.map((al, i) => {
              const sev = (al.severity || 'info').toLowerCase();
              const color = SEV_COLOR[sev] || '#38bdf8';
              return (
                <div key={al.id || i} style={{
                  display: 'grid', gridTemplateColumns: '65px 85px 110px 1fr',
                  gap: '0 8px', padding: '10px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  alignItems: 'center', fontSize: '12px',
                  transition: 'background 0.15s'
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
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--mono)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {al.agent_name || al.agent_id || '—'}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', fontWeight: 500 }}>
                    {al.description || `Rule ${al.rule_id}`}
                  </span>
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
              <span className="panel__title">VOLUMEN · 24H</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--signal)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{lastVal}</span>
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px' }}>EPS</span>
              {trend !== 0 && <span style={{ fontSize: '9px', color: trend > 0 ? '#ef4444' : '#22c55e' }}>{trend > 0 ? '▲' : '▼'}</span>}
            </div>
          </div>
          <div style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>-24h</span>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>MÁXIMO: {maxVal}</span>
            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--mono)' }}>AHORA</span>
          </div>
          <div style={{ flex: 1, padding: '0 12px 12px', minHeight: 0 }}>
            <AreaChart points={volumePoints} color="#00ff88" gradientId="vol-grad" />
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
            <span className="panel__title">DISTRIBUCIÓN · SEV</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--mono)' }}>{total === 1 ? 0 : total} alertas</span>
          </div>
          <div className="panel__body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', flex: 1 }}>
            <SevBar label="CRÍTICO" count={counts.critical} total={total === 1 ? 0 : total} color="#ef4444" />
            <SevBar label="ALTO" count={counts.high} total={total === 1 ? 0 : total} color="#f97316" />
            <SevBar label="MEDIO" count={counts.medium} total={total === 1 ? 0 : total} color="#eab308" />
            <SevBar label="BAJO" count={counts.low} total={total === 1 ? 0 : total} color="#22c55e" />
          </div>
        </section>
      );
    }},
    "top-attack": { name: "Top Attackers", w: 4, h: 5, icon: "🎯", render: () => {
      const maxCount = Math.max(...(topAttackers.map((a: any) => a.count || 0)), 1);
      const RANK_COLOR = ['#ef4444', '#f97316', '#eab308'];
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
            <span className="panel__title">TOP ATACANTES</span>
            <span style={{ fontSize: '9px', color: 'var(--danger)', fontFamily: 'var(--mono)', padding: '1px 6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {topAttackers?.length || 0} IPs
            </span>
          </div>
          <div className="panel__body" style={{ padding: '4px 0', overflowY: 'auto', flex: 1 }}>
            {topAttackers.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '11px', letterSpacing: '2px' }}>SIN DATOS</div>
            )}
            {topAttackers.slice(0, 8).map((a: any, i: number) => {
              const barPct = (a.count / maxCount) * 100;
              const rankColor = RANK_COLOR[i] || 'rgba(255,255,255,0.25)';
              return (
                <div key={i} style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: rankColor, fontFamily: 'var(--mono)', width: '14px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'rgba(255,255,255,0.8)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ip}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: rankColor }}>{a.count}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '22px' }}>
                    <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '1px', overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: rankColor, opacity: 0.6, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                </div>
              );
            })}
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
    <div className="view" ref={ref} style={{ flex: 1, padding: '8px', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
        margin={[12, 12]}
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
            <h3 style={{ margin: '0 0 16px', color: 'var(--signal)', fontFamily: 'var(--mono)', letterSpacing: '2px', borderBottom: '1px solid var(--line)', paddingBottom: '8px', textAlign: 'center' }}>⬡ AGREGAR WIDGET ⬡</h3>
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
            ✕ CANCELAR
          </button>
          </div>
        </div>
      )}
    </div>
  );
}