import { useState, useEffect } from "react";
import { getCowrieTimeline, getCowrieStats, getCowrieSessions } from "../lib/api";

export default function CowrieView() {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [t, s, sess] = await Promise.all([
        getCowrieTimeline(24, "1h"),
        getCowrieStats(24),
        getCowrieSessions(50, 24)
      ]);
      setTimeline(t);
      setStats(s);
      setSessions(sess);
    } catch (err) {
      console.error("Error fetching Cowrie data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, []);

  const isDangerousCommand = (cmd: string) => {
    const dangerous = [/wget/, /curl/, /chmod/, /passwd/, /shadow/, /rm -rf/, /installer/, /\.sh/, /\.py/, /nohup/, /&/, /base64/];
    return dangerous.some(pattern => pattern.test(cmd.toLowerCase()));
  };

  const handleIpClick = (ip: string) => {
    // Dispatch a custom event to navigate or just use window.location if router is simple
    // In this app, we can use a custom event that AppCore listens to
    window.dispatchEvent(new CustomEvent('navigate-to-intel', { detail: { ip } }));
  };

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>CONECTANDO CON SEÑUELOS COWRIE...</div>;

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto 1fr', gap: '16px', height: '100%', overflow: 'hidden' }}>
      
      {/* Cowrie Stats KPIs */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="panel" style={{ padding: '16px', textAlign: 'center', borderLeft: '4px solid var(--signal)' }}>
          <div style={{ fontSize: '9px', color: 'var(--signal)', letterSpacing: '1px' }}>TOTAL EVENTOS (24H)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{stats?.total?.toLocaleString() || "0"}</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center', borderLeft: '4px solid var(--amber)' }}>
          <div style={{ fontSize: '9px', color: 'var(--amber)', letterSpacing: '1px' }}>IPS ÚNICAS ATACANTES</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{stats?.unique_ips?.toLocaleString() || "0"}</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center', borderLeft: '4px solid var(--cyan)' }}>
          <div style={{ fontSize: '9px', color: 'var(--cyan)', letterSpacing: '1px' }}>HITS POR HORA (AVG)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>{Math.round((stats?.total || 0) / 24)}</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: '9px', color: 'var(--danger)', letterSpacing: '1px' }}>DANGEROUS CMD RATIO</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>
            {sessions.length > 0 ? Math.round((sessions.filter(s => isDangerousCommand(s.command)).length / sessions.length) * 100) : 0}%
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', gridRow: '2', gridColumn: '1', overflow: 'hidden' }}>
         {/* Top Credentials */}
         <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="panel__head"><span className="panel__title">Top Credenciales (Brute Force)</span></div>
            <div className="panel__body" style={{ padding: 0, overflowY: 'auto' }}>
               <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                     <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 15px' }}>TÉCNICA / OBJETO</th>
                        <th style={{ padding: '10px 15px', textAlign: 'right' }}>HITS</th>
                     </tr>
                  </thead>
                  <tbody>
                     {stats?.event_types?.map((type: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--line-faint)' }}>
                           <td style={{ padding: '10px 15px', color: 'var(--text-bright)', fontWeight: 'bold' }}>{type.type}</td>
                           <td style={{ padding: '10px 15px', textAlign: 'right', color: 'var(--amber)' }}>{type.count.toLocaleString()}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>

         {/* Cyber Deception Intel */}
         <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '15px', background: 'rgba(74,227,255,0.03)' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--cyan)' }}>🛡️ ESTRATEGIA DE DECEPCIÓN</h4>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              El honeypot Cowrie está operando como un señuelo SSH/Telnet. Los datos mostrados son <strong>telemetría real</strong> de ataques en curso.
              Las IPs marcadas en el TTY feed pueden ser bloqueadas directamente desde el módulo de <em>Threat Intel</em>.
            </p>
            <div style={{ marginTop: 'auto', fontSize: '10px', color: 'var(--signal)', fontFamily: 'var(--mono)' }}>
              STATUS: CAPTURING LIVE EXPLOITS
            </div>
         </div>
      </div>

      {/* Main Terminal Feed */}
      <div className="panel" style={{ gridColumn: '2 / 4', gridRow: '2', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="panel__title">TTY INTERACTIVE FEED · COMANDOS REALES</span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>AUTO-REFRESH: 10S</span>
        </div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', background: '#000', flex: 1 }}>
           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--mono)' }}>
               <thead>
                  <tr style={{ background: 'rgba(60,255,158,0.1)', color: 'var(--signal)', textAlign: 'left', borderBottom: '1px solid var(--signal)', position: 'sticky', top: 0, zIndex: 10 }}>
                     <th style={{ padding: '10px 15px' }}>TIMESTAMP</th>
                     <th style={{ padding: '10px 15px' }}>SOURCE IP (GEO)</th>
                     <th style={{ padding: '10px 15px' }}>SESSION</th>
                     <th style={{ padding: '10px 15px' }}>COMANDO EJECUTADO</th>
                  </tr>
               </thead>
               <tbody>
                  {sessions.map((c, i) => {
                     const isDanger = isDangerousCommand(c.command);
                     return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isDanger ? 'rgba(255,50,50,0.05)' : 'transparent' }}>
                           <td style={{ padding: '10px 15px', color: 'var(--text-faint)' }}>{new Date(c.timestamp).toLocaleTimeString()}</td>
                           <td style={{ padding: '10px 15px' }}>
                              <span 
                                onClick={() => handleIpClick(c.ip)}
                                style={{ color: 'var(--cyan)', cursor: 'pointer', textDecoration: 'underline' }}
                                title="Analizar en Threat Intel"
                              >
                                {c.ip}
                              </span>
                              <span style={{ marginLeft: '6px', fontSize: '9px', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--line)' }}>{c.geo}</span>
                           </td>
                           <td style={{ padding: '10px 15px', color: 'var(--amber)' }}>{c.session.substring(0, 8)}</td>
                           <td style={{ padding: '10px 15px', color: isDanger ? 'var(--danger)' : '#fff', fontWeight: isDanger ? 'bold' : 'normal' }}>
                             {isDanger ? '⚠️ ' : '$ '}{c.command}
                           </td>
                        </tr>
                     );
                  })}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-faint)' }}>
                        NO SE DETECTAN SESIONES ACTIVAS EN ESTE MOMENTO
                      </td>
                    </tr>
                  )}
               </tbody>
           </table>
        </div>
      </div>

    </div>
  );
}
