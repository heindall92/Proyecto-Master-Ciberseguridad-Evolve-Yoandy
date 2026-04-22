import { useState, useEffect, useRef, useMemo } from "react";
import { Responsive as ResponsiveGridLayout } from "react-grid-layout";
import { getDashboardSummary, listAlerts, listEvents, AlertOut, EventOut } from "../lib/api";

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

// Helper for sparklines
function Spark({ points, color = 'var(--cyan)' }: { points: number[], color?: string }) {
  if (!points || points.length === 0) points = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...points) * 1.1 || 10;
  const min = Math.min(...points) * 0.9;
  const range = max - min;
  const step = 200 / (Math.max(points.length - 1, 1));
  
  const d = points.map((p, i) => {
    const x = i * step;
    const y = 60 - ((p - min) / range) * 60;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const area = `${d} L 200 60 L 0 60 Z`;

  return (
    <svg className="spark" viewBox="0 0 200 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%', minHeight: '60px', display: 'block' }}>
      <defs>
         <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
         </linearGradient>
      </defs>
      <g stroke="var(--line-strong)" strokeWidth="0.5" strokeDasharray="1 3" opacity="0.3">
         <line x1="0" y1="15" x2="200" y2="15" />
         <line x1="0" y1="30" x2="200" y2="30" />
         <line x1="0" y1="45" x2="200" y2="45" />
      </g>
      <path d={area} fill="url(#sparkGrad)" opacity="0.45" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" filter="drop-shadow(0 0 3px var(--signal-glow))" />
    </svg>
  );
}

function Kpi({ label, value, cls, trend, dir = 'up' }: any) {
  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '4px 10px' }}>
      <div className="kpi__label" style={{ color: 'var(--signal)', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>// {label}</div>
      <div className={`kpi__value ${cls || ''}`} style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-bright)', textShadow: '0 0 10px rgba(255,255,255,0.1)', lineHeight: 1.1 }}>{value}</div>
      <div className="kpi__trend" style={{ color: 'var(--text-dim)', fontSize: '9px', marginTop: '2px', letterSpacing: '1px' }}>
        <em className={dir === 'down' ? 'down' : ''} style={{ fontStyle: 'normal', color: dir === 'down' ? 'var(--danger)' : 'var(--signal)', marginRight: '6px', textShadow: `0 0 5px ${dir === 'down' ? 'var(--danger-glow)' : 'var(--signal-glow)'}` }}>{dir === 'up' ? '▲' : '▼'} {trend}</em>
        <span>últimas 24h</span>
      </div>
    </div>
  );
}

const DEFAULT_ACTIVE = ["kpi-1", "kpi-2", "kpi-3", "kpi-4", "siem-flow", "chart-vol", "chart-net", "top-attack"];

const initialLayouts: any = {
  lg: [
    { i: "kpi-1", x: 0, y: 0, w: 3, h: 2 },
    { i: "kpi-2", x: 3, y: 0, w: 3, h: 2 },
    { i: "kpi-3", x: 6, y: 0, w: 3, h: 2 },
    { i: "kpi-4", x: 9, y: 0, w: 3, h: 2 },
    { i: "siem-flow", x: 0, y: 2, w: 8, h: 22 },
    { i: "chart-vol", x: 8, y: 2, w: 4, h: 6 },
    { i: "chart-net", x: 8, y: 8, w: 4, h: 6 },
    { i: "top-attack", x: 8, y: 14, w: 4, h: 10 },
  ]
};

export default function DashboardView() {
  const { ref, width } = useContainerWidth();
  
  const [layouts, setLayouts] = useState(() => {
    const saved = localStorage.getItem("valhalla.dashboard.layout.v3");
    return saved ? JSON.parse(saved) : initialLayouts;
  });
  
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    const saved = localStorage.getItem("valhalla.dashboard.widgets.v3");
    return saved ? JSON.parse(saved) : DEFAULT_ACTIVE;
  });

  const [isLocked, setIsLocked] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);

  // Real Data States
  const [summary, setSummary] = useState<any>({ metrics: { alerts: 0, events: 0 } });
  const [alerts, setAlerts] = useState<AlertOut[]>([]);
  const [events, setEvents] = useState<EventOut[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dash, alts, evs] = await Promise.all([
          getDashboardSummary(),
          listAlerts(50, 0),
          listEvents(200, 0)
        ]);
        setSummary(dash);
        setAlerts(alts);
        setEvents(evs);
      } catch (e) {
        console.error("Error fetching dashboard data", e);
      }
    };
    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, []);

  // Compute metrics from data
  const topAttackers = useMemo(() => {
    const counts: Record<string, { ip: string, cc: string, type: string, count: number }> = {};
    events.forEach(ev => {
      const ip = ev.source_ip || "Desconocido";
      if (!counts[ip]) {
        counts[ip] = { ip, cc: "N/A", type: ev.attack_type || "Desconocido", count: 0 };
      }
      counts[ip].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [events]);

  const volumePoints = useMemo(() => {
    if (events.length === 0) return [0,0,0,0,0,0,0,0,0,0,0];
    // Simple mock grouping: just bucket the 200 events into 11 chunks
    const chunks = 11;
    const size = Math.ceil(events.length / chunks) || 1;
    const pts = Array(chunks).fill(0);
    events.forEach((_, i) => {
      const idx = chunks - 1 - Math.floor(i / size);
      if (idx >= 0 && idx < chunks) {
        pts[idx]++;
      }
    });
    return pts;
  }, [events]);

  const WIDGET_REGISTRY: Record<string, { name: string, w: number, h: number, icon: string, render: () => JSX.Element }> = useMemo(() => ({
    "kpi-1": { name: "Alertas / 24h", w: 3, h: 2, icon: "📊", render: () => <Kpi label="ALERTAS TOTALES" value={summary.metrics.alerts} cls="cyan" trend="+0%" /> },
    "kpi-2": { name: "Incidentes", w: 3, h: 2, icon: "⚠️", render: () => <Kpi label="EVENTOS TOTALES" value={summary.metrics.events} cls="danger" trend="LIVE" dir="up" /> },
    "kpi-3": { name: "MTTD Promedio", w: 3, h: 2, icon: "⏱️", render: () => <Kpi label="MTTD PROMEDIO" value="1m 02s" trend="SLA ok" /> },
    "kpi-4": { name: "MTTR Promedio", w: 3, h: 2, icon: "🔧", render: () => <Kpi label="MTTR PROMEDIO" value="15m 12s" cls="amber" trend="SLA ok" dir="down" /> },
    "siem-flow": { name: "Flujo SIEM · Wazuh", w: 8, h: 8, icon: "🌊", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move', flexShrink: 0 }}>
          <span className="panel__title">Flujo SIEM · Wazuh</span>
        </div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
          {alerts.map((al, i) => (
            <div key={al.id || i} className="alert">
              <span className={`alert__sev sev-${al.severity === 'critical' ? 'high' : al.severity === 'high' ? 'med' : 'low'}`}>
                {al.severity.toUpperCase()}
              </span>
              <span className="alert__time">{new Date(al.timestamp).toLocaleTimeString()}</span>
              <span className="alert__msg" style={{ fontWeight: 500 }}>{al.description || `Regla: ${al.rule_id}`}</span>
              <span className="alert__src">wazuh.manager</span>
              <span className="alert__status">TRIAGE</span>
            </div>
          ))}
          {alerts.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>NO HAY ALERTAS RECIENTES</div>
          )}
        </div>
      </section>
    )},
    "chart-vol": { name: "Volumen Eventos", w: 4, h: 4, icon: "📈", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move', flexShrink: 0 }}><span className="panel__title">Volumen eventos · LIVE</span></div>
        <div className="panel__body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Spark points={volumePoints} color="var(--signal)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-faint)', marginTop: '8px', fontFamily: 'var(--mono)' }}>
             <span>-60m</span><span>-30m</span><span>NOW</span>
          </div>
        </div>
      </section>
    )},
    "chart-net": { name: "Tráfico de Red", w: 4, h: 4, icon: "🌐", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move', flexShrink: 0 }}><span className="panel__title">Tráfico red · mbps</span></div>
        <div className="panel__body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Spark points={[30, 40, 35, 50, 45, 60, 55, 70, 65, 80, 75]} color="var(--cyan)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-faint)', marginTop: '8px', fontFamily: 'var(--mono)' }}>
             <span>T-60m</span><span>T-30m</span><span>LIVE</span>
          </div>
        </div>
      </section>
    )},
    "top-attack": { name: "Top Atacantes", w: 4, h: 5, icon: "🎯", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move', flexShrink: 0 }}><span className="panel__title">Top atacantes</span></div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
          {topAttackers.map((a, i) => (
            <div key={i} className="atklog">
              <span className="atklog__flag">{a.cc}</span>
              <span className="atklog__ip" style={{ fontWeight: 600 }}>{a.ip}</span>
              <span className="atklog__type" style={{ fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.type}</span>
              <span className="atklog__count" style={{ color: 'var(--text-dim)' }}>{a.count}</span>
            </div>
          ))}
          {topAttackers.length === 0 && (
             <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>SIN DATOS</div>
          )}
        </div>
      </section>
    )},
    "ollama-ai": { name: "Ollama AI Análisis", w: 6, h: 4, icon: "🧠", render: () => (
      <section className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head" style={{ cursor: 'move', flexShrink: 0 }}><span className="panel__title">OLLAMA AI ANÁLISIS</span></div>
        <div className="panel__body" style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6, flex: 1, overflowY: 'auto' }}>
          <strong>Correlación activa:</strong> Esperando nuevo análisis de inteligencia artificial sobre los últimos eventos detectados.
          <br/><br/>
          <strong>Estado:</strong> Monitoreo activo.
        </div>
      </section>
    )}
  }), [summary, alerts, events, topAttackers, volumePoints]);

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
    <div className="view" ref={ref} style={{ flex: 1, padding: '0 8px 8px 8px', overflowX: 'hidden' }}>
      
      {/* Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', paddingRight: '4px', gap: '12px' }}>
         <button 
            className="action-btn"
            onClick={() => setShowCatalog(true)}
         >
            ➕ NUEVA VISUALIZACIÓN
         </button>
         <button 
            className={`action-btn ${!isLocked ? 'active' : ''}`}
            onClick={() => setIsLocked(!isLocked)}
         >
            {isLocked ? "🔓 EDITAR LAYOUT" : "📌 FIJAR DASHBOARD"}
         </button>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        width={width}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={30}
        draggableHandle=".panel__head"
        isDraggable={!isLocked}
        isResizable={!isLocked}
        onLayoutChange={onLayoutChange}
        margin={[16, 16]}
      >
        {activeWidgets.map(id => {
          const widget = WIDGET_REGISTRY[id];
          if (!widget) return null;
          return (
            <div key={id} style={{ position: 'relative' }}>
              {widget.render()}
              {!isLocked && (
                <button 
                  onClick={() => removeWidget(id)}
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: '12px', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                >✕</button>
              )}
            </div>
          );
        })}
      </ResponsiveGridLayout>

      {/* Modal Catálogo */}
      {showCatalog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'grid', placeItems: 'center', zIndex: 99999 }}>
          <div className="panel" style={{ width: '800px', height: '500px', background: 'var(--bg-panel)', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
               <div>
                 <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--signal)', fontFamily: 'var(--mono)' }}>NUEVA VISUALIZACIÓN</h2>
                 <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>// SELECCIONA WIDGET DEL CATÁLOGO</p>
               </div>
               <button onClick={() => setShowCatalog(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px', overflowY: 'auto', paddingBottom: '20px' }}>
               {Object.entries(WIDGET_REGISTRY).map(([id, w]) => {
                 const isActive = activeWidgets.includes(id);
                 return (
                   <div 
                      key={id} 
                      onClick={() => addWidget(id)}
                      style={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', 
                        padding: '24px 16px', border: `1px solid ${isActive ? 'var(--signal)' : 'var(--line)'}`, 
                        borderRadius: 'var(--r-md)', cursor: isActive ? 'not-allowed' : 'pointer',
                        opacity: isActive ? 0.5 : 1, background: isActive ? 'var(--bg-glass)' : 'rgba(0,0,0,0.5)',
                        transition: 'all 0.2s ease'
                      }}
                   >
                      <div style={{ fontSize: '32px' }}>{w.icon}</div>
                      <div style={{ fontSize: '10px', fontWeight: 600, textAlign: 'center', color: 'var(--text)', fontFamily: 'var(--mono)' }}>{w.name.toUpperCase()}</div>
                   </div>
                 );
               })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
