import { useState, useEffect } from "react";
import { getCowrieTimeline, getCowrieStats } from "../lib/api";

export default function CowrieView() {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [t, s] = await Promise.all([
        getCowrieTimeline(24, "1h"),
        getCowrieStats(24)
      ]);
      setTimeline(t || []);
      setStats(s);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching Cowrie data", err);
      setError(err?.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, []);

  const totalEvents = stats?.total || 0;
  const uniqueIPs = stats?.unique_ips || 0;
  const eventTypes = stats?.event_types || [];
  
  const successfulLogins = eventTypes.find((e: any) => e.type?.toLowerCase().includes("success"))?.count || 0;
  const failedLogins = eventTypes.find((e: any) => e.type?.toLowerCase().includes("failed"))?.count || 0;
  const downloads = eventTypes.find((e: any) => e.type?.toLowerCase().includes("download"))?.count || 0;

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>CONECTANDO CON SEÑUELOS COWRIE...</div>;

  if (error) return (
    <div className="panel" style={{ padding: '20px', color: 'var(--danger)' }}>
      <div style={{ fontSize: '12px' }}>⚠️ {error}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '10px' }}>
        Verifica que Cowrie esté corriendo y Wazuh indexando sus alertas.
      </div>
      <button onClick={fetchData} style={{ marginTop: '10px', padding: '8px 16px', background: 'var(--signal)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        REINTENTAR
      </button>
    </div>
  );

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto 1fr', gap: '16px', height: '100%' }}>
      
      {/* Cowrie Stats KPIs - REAL DATA FROM API */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--signal)', letterSpacing: '1px' }}>TOTAL EVENTOS (24H)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{totalEvents.toLocaleString()}</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--amber)', letterSpacing: '1px' }}>IPS ÚNICAS ATACANTES</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{uniqueIPs.toLocaleString()}</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--cyan)', letterSpacing: '1px' }}>LOGINS EXITOSOS</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{successfulLogins.toLocaleString()}</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--danger)', letterSpacing: '1px' }}>LOGINS FALLIDOS</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{failedLogins.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', gridRow: '2', gridColumn: '1' }}>
          {/* Event Types from API */}
          <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
             <div className="panel__head"><span className="panel__title">Tipos de Eventos (Cowrie)</span></div>
             <div className="panel__body" style={{ padding: 0, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                   <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)', textAlign: 'left' }}>
                         <th style={{ padding: '10px 15px' }}>TIPO</th>
                         <th style={{ padding: '10px 15px', textAlign: 'right' }}>CANTIDAD</th>
                      </tr>
                   </thead>
                   <tbody>
                      {eventTypes.slice(0, 10).map((e: any, i: number) => (
                         <tr key={i} style={{ borderBottom: '1px solid var(--line-faint)' }}>
                            <td style={{ padding: '10px 15px', color: 'var(--danger)', fontWeight: 'bold' }}>{e.type}</td>
                            <td style={{ padding: '10px 15px', textAlign: 'right', color: 'var(--amber)' }}>{e.count}</td>
                         </tr>
                      ))}
                      {eventTypes.length === 0 && (
                        <tr><td colSpan={2} style={{ padding: '10px 15px', color: 'var(--text-dim)', textAlign: 'center' }}>Sin eventos</td></tr>
                      )}
                   </tbody>
                </table>
             </div>
          </div>

          {/* Timeline Chart */}
          <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
             <div className="panel__head"><span className="panel__title">Timeline (Últimas 24h)</span></div>
             <div className="panel__body" style={{ padding: '10px', overflowY: 'auto' }}>
                {timeline.length > 0 ? (
                  <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '60px' }}>
                    {timeline.slice(-24).map((t: any, i: number) => {
                      const maxCount = Math.max(...timeline.map((x: any) => x.count), 1);
                      const height = (t.count / maxCount) * 100;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <div style={{ 
                            width: '100%', 
                            height: `${height}%`, 
                            background: 'var(--signal)',
                            minHeight: '4px',
                            borderRadius: '2px 2px 0 0',
                            opacity: 0.6 + (i / timeline.length) * 0.4
                          }} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Sin datos de timeline</div>
                )}
             </div>
          </div>
      </div>

      {/* Main Terminal Feed - MOCK for now, shows event types */}
      <div className="panel" style={{ gridColumn: '2 / 4', gridRow: '2', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head"><span className="panel__title">Capturas Cowrie · Actividad Reciente</span></div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', background: '#000' }}>
           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--mono)' }}>
               <thead>
                  <tr style={{ background: 'rgba(60,255,158,0.1)', color: 'var(--signal)', textAlign: 'left', borderBottom: '1px solid var(--signal)' }}>
                     <th style={{ padding: '10px 15px' }}>TIMESTAMP</th>
                     <th style={{ padding: '10px 15px' }}>SOURCE IP</th>
                     <th style={{ padding: '10px 15px' }}>TIPO</th>
                     <th style={{ padding: '10px 15px' }}>DETALLE</th>
                  </tr>
               </thead>
               <tbody>
                  {eventTypes.slice(0, 8).map((c: any, i: number) => (
                     <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 15px', color: 'var(--text-faint)' }}>{new Date().toLocaleTimeString()}</td>
                        <td style={{ padding: '10px 15px' }}>
                           <span style={{ color: 'var(--cyan)' }}>N/A</span>
                        </td>
                        <td style={{ padding: '10px 15px', color: 'var(--amber)' }}>{c.type}</td>
                        <td style={{ padding: '10px 15px', color: '#fff' }}>{c.count} eventos</td>
                     </tr>
                  ))}
                  {eventTypes.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>Sin actividad reciente</td></tr>
                  )}
               </tbody>
           </table>
        </div>
      </div>

    </div>
  );
}