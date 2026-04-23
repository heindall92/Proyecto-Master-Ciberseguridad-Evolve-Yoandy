import { useState, useEffect } from "react";
import { getRecentAlerts, getMitreCoverage, getTopAttackers, createTicket } from "../lib/api";

export default function SiemView() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [mitre, setMitre] = useState<any[]>([]);
  const [topAttackers, setTopAttackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [filterLevel, setFilterLevel] = useState(0);

  const fetchData = async () => {
    try {
      const [a, m, t] = await Promise.all([
        getRecentAlerts(100),
        getMitreCoverage(),
        getTopAttackers(10)
      ]);
      setAlerts(a);
      setMitre(m);
      setTopAttackers(t);
    } catch (err) {
      console.error("Error fetching SIEM data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, []);

  const handleEscalate = async (alert: any) => {
    try {
      await createTicket({
        title: `INCIDENTE: ${alert.description}`,
        description: `Alerta escalada desde SIEM.\nID Regla: ${alert.rule_id}\nAgente: ${alert.agent_name}\nFull Log: ${JSON.stringify(alert.raw_alert)}`,
        severity: alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'high' : 'medium',
        category: 'Intrusión',
        wazuh_alert_id: alert.id,
        affected_asset: alert.agent_name,
        source_ip: alert.source_ip
      });
      alert("Ticket creado correctamente");
    } catch (err) {
      alert("Error al escalar incidente");
    }
  };

  const filteredAlerts = alerts.filter(al => {
    const lvl = parseInt(al.rule_id.split('.')[0]) || 0; // Simplified level extraction if possible, or use a proper level field if available
    // Note: Wazuh alerts from OpenSearch have a 'level' field usually.
    return (al.rule_level || 0) >= filterLevel;
  });

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>CONECTANDO CON WAZUH INDEXER...</div>;

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: selectedAlert ? '1fr 1fr' : '2fr 1fr', gridTemplateRows: 'auto 1fr', gap: '16px', height: '100%' }}>
      
      {/* Filters Bar */}
      <div className="panel" style={{ gridColumn: '1 / -1', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>FILTRAR POR NIVEL MÍNIMO:</span>
          <select 
            value={filterLevel} 
            onChange={(e) => setFilterLevel(parseInt(e.target.value))}
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', color: '#fff', padding: '4px 8px', borderRadius: '4px' }}
          >
            {[0, 3, 5, 7, 10, 12, 15].map(l => <option key={l} value={l}>Nivel {l}+</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--signal)' }}>
          {filteredAlerts.length} ALERTAS FILTRADAS EN TIEMPO REAL
        </div>
      </div>

      {/* Main Alerts Table */}
      <div className="panel" style={{ gridRow: '2 / 3', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head">
          <span className="panel__title">Monitor de Eventos · Wazuh SIEM</span>
        </div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Nivel</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Time</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Agente</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Descripción</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((al, i) => (
                <tr 
                  key={i} 
                  onClick={() => setSelectedAlert(al)}
                  style={{ 
                    borderBottom: '1px solid var(--line-faint)', 
                    cursor: 'pointer',
                    background: selectedAlert === al ? 'rgba(60,255,158,0.05)' : 'transparent'
                  }}
                  className="alert-row"
                >
                  <td style={{ padding: '10px' }}>
                    <span className={`alert__sev sev-${al.severity === 'critical' ? 'high' : al.severity === 'high' ? 'med' : 'low'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                      {al.rule_level || '---'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: 'var(--text-dim)' }}>{new Date(al.timestamp).toLocaleTimeString()}</td>
                  <td style={{ padding: '10px', fontWeight: 600 }}>{al.agent_name}</td>
                  <td style={{ padding: '10px' }}>{al.description}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <button 
                      className="navbtn__badge danger" 
                      style={{ cursor: 'pointer', border: '1px solid var(--danger)', background: 'none' }}
                      onClick={(e) => { e.stopPropagation(); handleEscalate(al); }}
                    >
                      ESCALAR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedAlert ? (
        <div className="panel" style={{ gridRow: '2 / 3', display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head">
            <span className="panel__title">Detalle de Alerta</span>
            <button className="action-btn" onClick={() => setSelectedAlert(null)}>CERRAR</button>
          </div>
          <div className="panel__body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>REGLA WAZUH</div>
              <div style={{ fontSize: '14px', color: 'var(--signal)', fontWeight: 600 }}>{selectedAlert.description}</div>
              <div style={{ fontSize: '11px', marginTop: '5px' }}>ID: {selectedAlert.rule_id} · Nivel: {selectedAlert.rule_level}</div>
            </div>

            {selectedAlert.mitre_technique && (
              <div style={{ padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>MITRE ATT&CK</div>
                <div style={{ fontSize: '12px', color: 'var(--amber)' }}>{selectedAlert.mitre_tactic.join(', ')}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-bright)' }}>{selectedAlert.mitre_technique.join(', ')}</div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: '200px' }}>
               <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '5px' }}>RAW LOG (JSON)</div>
               <pre style={{ 
                 fontSize: '10px', 
                 color: 'var(--cyan)', 
                 background: 'rgba(0,0,0,0.4)', 
                 padding: '10px', 
                 borderRadius: '4px',
                 whiteSpace: 'pre-wrap',
                 maxHeight: '400px',
                 overflowY: 'auto'
               }}>
                 {JSON.stringify(selectedAlert.raw_alert, null, 2)}
               </pre>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* MITRE ATT&CK Coverage */}
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel__head"><span className="panel__title">Cobertura MITRE ATT&CK</span></div>
            <div className="panel__body" style={{ padding: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mitre.slice(0, 5).map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>{m.technique}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>{m.tactic.toUpperCase()}</span>
                    </div>
                    <span className="navbtn__badge" style={{ fontSize: '9px' }}>{m.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Attackers */}
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel__head"><span className="panel__title">Top Atacantes</span></div>
            <div className="panel__body" style={{ padding: 0 }}>
              {topAttackers.slice(0, 5).map((atk, i) => (
                <div key={i} className="alert" style={{ gridTemplateColumns: '1fr 60px', padding: '10px 20px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{atk.ip}</span>
                  <span style={{ textAlign: 'right' }}>{atk.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
