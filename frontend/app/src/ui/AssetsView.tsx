import { useState, useEffect } from "react";
import { listAgents, getAgentPackages, getAgentPorts, getAgentVulnerabilities, AgentOut } from "../lib/api";

export default function AssetsView() {
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentOut | null>(null);
  const [details, setDetails] = useState<any>({ packages: [], ports: [], vulns: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    listAgents().then(setAgents).finally(() => setLoading(false));
  }, []);

  const handleSelectAgent = async (agent: AgentOut) => {
    setSelectedAgent(agent);
    setDetailsLoading(true);
    try {
      const [pkgs, ports, vulns] = await Promise.all([
        getAgentPackages(agent.id),
        getAgentPorts(agent.id),
        getAgentVulnerabilities(agent.id)
      ]);
      setDetails({ packages: pkgs, ports: ports, vulns: vulns });
    } catch (err) {
      console.error("Error loading agent details", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>CONECTANDO CON INVENTARIO DE ACTIVOS...</div>;

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: selectedAgent ? '1fr 1.5fr' : '1fr', gap: '16px', height: '100%' }}>
      
      {/* Agents List */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head">
          <span className="panel__title">Inventario de Endpoints · Wazuh</span>
        </div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Estado</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Nombre</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>IP</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>S.O.</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr 
                  key={a.id} 
                  onClick={() => handleSelectAgent(a)}
                  style={{ 
                    borderBottom: '1px solid var(--line-faint)', 
                    cursor: 'pointer',
                    background: selectedAgent?.id === a.id ? 'rgba(60,255,158,0.1)' : 'transparent'
                  }}
                  className="alert-row"
                >
                  <td style={{ padding: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.status === 'active' ? 'var(--signal)' : 'var(--danger)' }}></div>
                  </td>
                  <td style={{ padding: '10px', fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: '10px' }}>{a.ip}</td>
                  <td style={{ padding: '10px', color: 'var(--text-dim)' }}>{a.os}</td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '30px', textAlign: 'center', opacity: 0.5, color: 'var(--text-dim)', letterSpacing: '2px' }}>
                    0 AGENTES ENCONTRADOS · VERIFIQUE LA CONEXIÓN WAZUH
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* Detail View */}
      {selectedAgent && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel__head">
            <span className="panel__title">Detalle Técnico: {selectedAgent.name}</span>
            <button className="action-btn" onClick={() => setSelectedAgent(null)}>CERRAR</button>
          </div>
          
          <div className="panel__body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
             
             {/* Tabs Header */}
             <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderTop: '2px solid var(--signal)', fontSize: '10px', fontWeight: 600 }}>SISTEMA Y RED</div>
             </div>

             {detailsLoading ? (
               <div style={{ padding: '40px', textAlign: 'center', color: 'var(--signal)' }}>SINCRONIZANDO DATOS DE AGENTE...</div>
             ) : (
               <>
                 {/* Networking Section */}
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="panel" style={{ padding: '15px' }}>
                       <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>PUERTOS EN ESCUCHA</div>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {details.ports.slice(0, 15).map((p: any, i: number) => (
                            <span key={i} style={{ padding: '2px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '9px' }}>
                              {p.protocol.toUpperCase()} {p.local_port}
                            </span>
                          ))}
                       </div>
                    </div>
                    <div className="panel" style={{ padding: '15px' }}>
                       <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>ESTADO DE VULNERABILIDADES</div>
                       <div style={{ fontSize: '18px', fontWeight: 800, color: details.vulns.length > 0 ? 'var(--danger)' : 'var(--signal)' }}>
                          {details.vulns.length} DETECTADAS
                       </div>
                    </div>
                 </div>

                 {/* Packages List */}
                 <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>SOFTWARE INSTALADO (ÚLTIMOS 100)</div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
                       <table style={{ width: '100%', fontSize: '10px' }}>
                          <thead style={{ color: 'var(--text-faint)' }}>
                             <tr>
                                <th style={{ textAlign: 'left' }}>Nombre</th>
                                <th style={{ textAlign: 'left' }}>Versión</th>
                                <th style={{ textAlign: 'right' }}>Arquitectura</th>
                             </tr>
                          </thead>
                          <tbody>
                             {details.packages.slice(0, 100).map((pkg: any, i: number) => (
                               <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '4px 0' }}>{pkg.name}</td>
                                  <td>{pkg.version}</td>
                                  <td style={{ textAlign: 'right' }}>{pkg.architecture}</td>
                               </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>
               </>
             )}

          </div>
        </div>
      )}

    </div>
  );
}
