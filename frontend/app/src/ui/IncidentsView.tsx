import { useState, useEffect } from "react";
import { listTickets, createTicket, updateTicket, listUsers, TicketOut, UserOut, vtCheckIp } from "../lib/api";

const SLA_LIMITS: Record<string, number> = {
  critical: 1 * 60 * 60 * 1000, // 1h
  high: 4 * 60 * 60 * 1000, // 4h
  medium: 24 * 60 * 60 * 1000, // 24h
  low: 72 * 60 * 60 * 1000 // 72h
};

export default function IncidentsView() {
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketOut | null>(null);
  const [vtResults, setVtResults] = useState<any>(null);
  const [vtLoading, setVtLoading] = useState(false);

  useEffect(() => {
    Promise.all([listTickets(), listUsers()])
      .then(([t, u]) => {
        setTickets(t);
        setUsers(u);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    listTickets().then(setTickets).finally(() => setLoading(false));
  };

  const handleScanIOC = async (ip: string) => {
    setVtLoading(true);
    try {
      const res = await vtCheckIp(ip);
      setVtResults(res);
    } catch (err) {
      alert("Error al escanear IOC en VirusTotal");
    } finally {
      setVtLoading(false);
    }
  };

  const calculateSLA = (ticket: TicketOut) => {
    if (ticket.status === 'resolved' || ticket.status === 'closed') return "COMPLETADO";
    const start = new Date(ticket.created_at).getTime();
    const limit = SLA_LIMITS[ticket.severity] || SLA_LIMITS.medium;
    const now = Date.now();
    const remaining = start + limit - now;
    
    if (remaining < 0) return "SLA BREACHED";
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>CARGANDO INCIDENTES...</div>;

  return (
    <div className="view" style={{ display: 'flex', gap: '16px', height: '100%', padding: '0 8px 8px 0' }}>
      
      {/* Left Column: Ticket List */}
      <div style={{ flex: selectedTicket ? 1 : 2, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel__head">
            <span className="panel__title">Gestión de Incidentes</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={handleRefresh} style={{ padding: '6px 10px', background: 'transparent', border: '1px solid var(--signal)', color: 'var(--signal)', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--mono)' }}>🔄 SYNC</button>
              <button onClick={() => setShowCreate(true)} style={{ padding: '6px 10px', background: 'var(--signal)', border: '1px solid var(--signal)', color: '#000', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--mono)' }}>➕ NUEVO</button>
            </div>
          </div>
          <div className="panel__body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--signal)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Título</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Severidad</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Estado</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>SLA Restante</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => {
                  const sla = calculateSLA(t);
                  return (
                    <tr 
                      key={t.id} 
                      onClick={() => { setSelectedTicket(t); setVtResults(null); }}
                      style={{ 
                        borderBottom: '1px solid var(--line-faint)', 
                        cursor: 'pointer',
                        background: selectedTicket?.id === t.id ? 'rgba(60,255,158,0.1)' : 'transparent'
                      }}
                      className="alert-row"
                    >
                      <td style={{ padding: '12px' }}>#{t.id}</td>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{t.title}</td>
                      <td style={{ padding: '12px' }}>
                        <span className={`alert__sev sev-${t.severity === 'critical' ? 'high' : t.severity === 'high' ? 'med' : 'low'}`}>
                          {t.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)',
                          color: t.status === 'resolved' ? 'var(--signal)' : t.status === 'open' ? 'var(--danger)' : 'var(--amber)'
                        }}>
                          {t.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: sla === 'SLA BREACHED' ? 'var(--danger)' : 'var(--text-dim)' }}>{sla}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Column: Ticket Detail */}
      {selectedTicket && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel__head">
              <span className="panel__title">Detalle de Incidente #{selectedTicket.id}</span>
              <button className="action-btn" onClick={() => setSelectedTicket(null)}>✕ CERRAR</button>
            </div>
            <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
              
              <div>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--signal)', fontSize: '14px' }}>{selectedTicket.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.5 }}>{selectedTicket.description || 'Sin descripción adicional.'}</p>
              </div>

              {selectedTicket.source_ip && (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px' }}>IOC detectado: <strong>{selectedTicket.source_ip}</strong></div>
                      <button 
                        className="navbtn__badge" 
                        style={{ cursor: 'pointer', background: 'none', border: '1px solid var(--cyan)', color: 'var(--cyan)' }}
                        onClick={() => handleScanIOC(selectedTicket.source_ip!)}
                        disabled={vtLoading}
                      >
                        {vtLoading ? "ESCANEAR..." : "ANÁLISIS VT"}
                      </button>
                   </div>
                   {vtResults && (
                     <div style={{ marginTop: '10px', fontSize: '11px', color: vtResults.malicious > 0 ? 'var(--danger)' : 'var(--signal)' }}>
                        Virustotal: {vtResults.malicious} detecciones maliciosas encontradas.
                     </div>
                   )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-faint)', marginBottom: '4px' }}>CATEGORÍA</div>
                  <div style={{ fontSize: '11px' }}>{selectedTicket.category || 'GENERAL'}</div>
                </div>
                <div className="panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-faint)', marginBottom: '4px' }}>ASIGNADO A</div>
                  <div style={{ fontSize: '11px' }}>{selectedTicket.assignee_username || 'SIN ASIGNAR'}</div>
                </div>
              </div>

              {selectedTicket.ai_summary && (
                <div className="ai-panel">
                  <div className="ai-panel__head">
                    <div className="ai-panel__dot"></div>
                    <span className="ai-panel__title">RECOMENDACIÓN TÁCTICA IA</span>
                  </div>
                  <div className="ai-panel__body" style={{ fontSize: '12px' }}>
                    {selectedTicket.ai_recommendation}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Ticket */}
      {showCreate && (
         <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'grid', placeItems: 'center', zIndex: 9999 }}>
            <div className="panel" style={{ width: '500px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
               <h3 style={{ margin: 0, color: 'var(--signal)', fontFamily: 'var(--mono)' }}>ABRIR NUEVO INCIDENTE</h3>
               
               <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>TÍTULO DEL INCIDENTE</label>
                  <input type="text" id="new_title" style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '10px', fontFamily: 'var(--mono)' }} placeholder="Ej: Posible exfiltración en DMZ" />
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                     <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>SEVERIDAD</label>
                     <select id="new_sev" style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '10px', fontFamily: 'var(--mono)' }}>
                        <option value="critical">CRÍTICO (P1)</option>
                        <option value="high">ALTO (P2)</option>
                        <option value="medium">MEDIO (P3)</option>
                        <option value="low">BAJO (P4)</option>
                     </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                     <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>TIPO / CATEGORÍA</label>
                     <select id="new_cat" style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '10px', fontFamily: 'var(--mono)' }}>
                        <option value="Intrusión">Intrusión</option>
                        <option value="Malware">Malware</option>
                        <option value="DDoS">DDoS</option>
                        <option value="Phishing">Phishing</option>
                        <option value="Otro">Otro</option>
                     </select>
                  </div>
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                     <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>ACTIVO AFECTADO</label>
                     <input type="text" id="new_asset" style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '10px', fontFamily: 'var(--mono)' }} placeholder="SRV-WEB-01" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                     <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>IOC (IP/Hash/Dominio)</label>
                     <input type="text" id="new_ioc" style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '10px', fontFamily: 'var(--mono)' }} placeholder="192.168.x.x" />
                  </div>
               </div>

               <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>DESCRIPCIÓN Y EVIDENCIAS</label>
                  <textarea id="new_desc" rows={4} style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '10px', fontFamily: 'var(--mono)', resize: 'none' }} placeholder="Detalles del incidente..."></textarea>
               </div>

               <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button className="action-btn active" style={{ flex: 1, textAlign: 'center' }} onClick={async () => {
                     const title = (document.getElementById('new_title') as HTMLInputElement).value;
                     const sev = (document.getElementById('new_sev') as HTMLSelectElement).value;
                     const cat = (document.getElementById('new_cat') as HTMLSelectElement).value;
                     const asset = (document.getElementById('new_asset') as HTMLInputElement).value;
                     const ioc = (document.getElementById('new_ioc') as HTMLInputElement).value;
                     const desc = (document.getElementById('new_desc') as HTMLTextAreaElement).value;
                     if (!title) return alert("El título es obligatorio");
                     
                     try {
                        await createTicket({ title, severity: sev, category: cat, affected_asset: asset, source_ip: ioc, description: desc });
                        setShowCreate(false);
                        handleRefresh();
                     } catch (e) {
                        alert("Error al crear el incidente");
                     }
                  }}>CREAR INCIDENTE</button>
                  <button className="action-btn" style={{ flex: 1, textAlign: 'center', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => setShowCreate(false)}>CANCELAR</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
