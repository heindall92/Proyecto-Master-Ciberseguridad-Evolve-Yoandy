import { useState, useEffect, useRef, useMemo } from "react";
import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import { getDashboardSummary, getRecentAlerts, getTopAttackers, getAlertVolume, listAgents, AlertOut, AgentOut } from "../lib/api";

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

function Kpi({ label, value, cls, trend, dir }: { label: string, value: number, cls: string, trend: string, dir: string }) {
  const colors: Record<string, string> = { danger: '#ef4444', cyan: '#06b6d4', amber: '#f59e0b', signal: '#00ff88' };
  const c = colors[cls] || colors.signal;
  return (
    <div className="kpi" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '8px 12px' }}>
      <span style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '1px' }}>{label}</span>
      <span style={{ fontSize: '28px', fontWeight: 800, color: c, textShadow: `0 0 10px ${c}40` }}>{value}</span>
      <span style={{ fontSize: '10px', color: c }}>{trend}</span>
    </div>
  );
}

function Spark({ points, color }: { points: number[], color: string }) {
  if (!points || points.length === 0) return <div />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const h = 100;
  const path = points.map((v, i) => {
    const x = (i / (points.length - 1)) * 100;
    const y = h - ((v - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const DEFAULT_ACTIVE = ["kpi-1", "kpi-2", "kpi-3", "kpi-4", "siem-flow", "chart-vol", "chart-levels", "top-attack"];

const initialLayouts: any = {
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

export default function DashboardFinal() {
  const { ref, width } = useContainerWidth();
  
  const [layouts, setLayouts] = useState(() => {
    const saved = localStorage.getItem("valhalla.dashboard.layout.v11");
    return saved ? JSON.parse(saved) : initialLayouts;
  });
  
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    const saved = localStorage.getItem("valhalla.dashboard.widgets.v11");
    return saved ? JSON.parse(saved) : DEFAULT_ACTIVE;
  });

  const [isLocked, setIsLocked] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [siemPage, setSiemPage] = useState(0);

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dash, alts, top, vol, ags] = await Promise.all([
          getDashboardSummary(),
          getRecentAlerts(100),
          getTopAttackers(10),
          getAlertVolume(24),
          listAgents()
        ]);
        setSummary(dash);
        setAlerts(alts || []);
        setTopAttackers(top || []);
        setVolumePoints(vol || []);
        setAgents(ags || []);
      } catch (e) {
        console.error("fetchData error:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const pageSize = 15;
  const totalPages = Math.ceil(alerts.length / pageSize) || 1;
  const currentAlerts = alerts.slice(siemPage * pageSize, (siemPage + 1) * pageSize);

  const WIDGET_REGISTRY = useMemo(() => ({
    "kpi-1": { name: "Alertas 24h", w: 2, h: 2, icon: "📊", render: () => <Kpi label="ALERTAS" value={summary.metrics.alerts} cls="cyan" trend="+12%" dir="up" /> },
    "kpi-2": { name: "Eventos", w: 2, h: 2, icon: "⚡", render: () => <Kpi label="EVENTOS" value={summary.metrics.events} cls="danger" trend="LIVE" dir="up" /> },
    "kpi-3": { name: "Agentes", w: 2, h: 2, icon: "🖥️", render: () => <Kpi label="AGENTES" value={summary.metrics.unique_agents || 0} cls="cyan" trend="LIVE" dir="up" /> },
    "kpi-4": { name: "Atacantes", w: 2, h: 2, icon: "🎯", render: () => <Kpi label="IPS" value={summary.metrics.unique_attackers || 0} cls="amber" trend="24h" dir="up" /> },
    "siem-flow": { name: "SIEM Flow", w: 8, h: 10, icon: "🌊", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move' }}>
          <span className="panel__title">SIEM · WAZUH</span>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => setSiemPage(p => Math.max(0, p - 1))} disabled={siemPage === 0} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--signal)', padding: '2px 6px', cursor: 'pointer' }}>◄</button>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{siemPage + 1}/{totalPages}</span>
            <button onClick={() => setSiemPage(p => Math.min(totalPages - 1, p + 1))} disabled={siemPage >= totalPages - 1} style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--signal)', padding: '2px 6px', cursor: 'pointer' }}>►</button>
          </div>
        </div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
          {currentAlerts.map((al, i) => (
            <div key={al.id || i} className="alert">
              <span className={`alert__sev sev-${al.severity}`}>{al.severity?.toUpperCase()}</span>
              <span className="alert__time">{new Date(al.timestamp).toLocaleTimeString()}</span>
              <span className="alert__msg">{al.description || `Rule: ${al.rule_id}`}</span>
              <span className="alert__src">wazuh</span>
            </div>
          ))}
          {currentAlerts.length === 0 && <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>NO DATA</div>}
        </div>
      </section>
    )},
    "chart-vol": { name: "Volume", w: 4, h: 4, icon: "📈", render: () => {
      const hasData = volumePoints && volumePoints.some((p: number) => p > 0);
      const lastVal = volumePoints?.slice(-1)?.[0] || 0;
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
            <span className="panel__title">VOLUMEN · LIVE</span>
            <div style={{ fontSize: '10px', color: 'var(--signal)' }}>{lastVal} EPS</div>
          </div>
          <div className="panel__body" style={{ padding: '12px', flex: 1 }}>
            {hasData ? <Spark points={volumePoints} color="var(--signal)" /> : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Sin datos</div>}
          </div>
        </section>
      );
    }},
    "chart-levels": { name: "Niveles", w: 4, h: 4, icon: "📊", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move' }}><span className="panel__title">DISTRIBUCION</span></div>
        <div className="panel__body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '30px', height: '12px', background: '#ef4444' }}></div>
            <span style={{ flex: 1, fontSize: '10px' }}>Critico</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '30px', height: '12px', background: '#f97316' }}></div>
            <span style={{ flex: 1, fontSize: '10px' }}>Alto</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '30px', height: '12px', background: '#eab308' }}></div>
            <span style={{ flex: 1, fontSize: '10px' }}>Medio</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '30px', height: '12px', background: 'var(--signal)' }}></div>
            <span style={{ flex: 1, fontSize: '10px' }}>Bajo</span>
          </div>
        </div>
      </section>
    )},
    "top-attack": { name: "Top Attackers", w: 4, h: 5, icon: "🎯", render: () => {
      const hasAttackers = topAttackers && topAttackers.length > 0;
      return (
        <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head" style={{ cursor: 'move' }}>
            <span className="panel__title">TOP ATACANTES</span>
            <span style={{ fontSize: '10px', color: 'var(--danger)' }}>{topAttackers?.length || 0}</span>
          </div>
          <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
            {hasAttackers ? topAttackers.slice(0, 8).map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid var(--line-faint)', fontSize: '10px' }}>
                <span style={{ width: '16px', color: i < 3 ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontFamily: 'var(--mono)', flex: 1 }}>{a.ip}</span>
                <span style={{ color: 'var(--signal)' }}>{a.count}</span>
              </div>
            )) : <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>Sin datos</div>}
          </div>
        </section>
      );
    }}
  }), [summary, alerts, topAttackers, volumePoints, agents, siemPage, setSiemPage]);

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
    setShowCatalog(false);
  };

  const removeWidget = (id: string) => {
    const newActive = activeWidgets.filter(w => w !== id);
    setActiveWidgets(newActive);
    localStorage.setItem("valhalla.dashboard.widgets.v3", JSON.stringify(newActive));
    const newLg = layouts.lg.filter((l: any) => l.i !== id);
    setLayouts({ ...layouts, lg: newLg });
  };

  return (
    <div className="view" ref={ref} style={{ flex: 1, padding: '8px', overflowX: 'hidden' }}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        width={width}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={30}
        draggableHandle=".panel__head"
        isDraggable={!isLocked}
        isResizable={!isLocked}
        onLayoutChange={onLayoutChange}
        margin={[12, 12]}
      >
        {activeWidgets.map(id => {
          const widget = WIDGET_REGISTRY[id];
          if (!widget) return null;
          return (
            <div key={id} style={{ position: 'relative' }}>
              {!isLocked && <button onClick={() => removeWidget(id)} style={{ position: 'absolute', top: 2, right: 2, zIndex: 10, background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer' }}>×</button>}
              {widget.render()}
            </div>
          );
        })}
      </ResponsiveGridLayout>
      {showCatalog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCatalog(false)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--line)', padding: '20px', maxWidth: '400px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--signal)' }}>AGREGAR WIDGET</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {Object.entries(WIDGET_REGISTRY).filter(([k]) => !activeWidgets.includes(k)).map(([k, w]: [string, any]) => (
                <button key={k} onClick={() => addWidget(k)} style={{ padding: '12px', background: 'var(--bg-void)', border: '1px solid var(--line)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: '16px' }}>{w.icon}</span>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>{w.name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}