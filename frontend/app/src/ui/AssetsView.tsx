import { useState, useEffect } from "react";
import { listAgents, getAgentPackages, getAgentPorts, getAgentVulnerabilities, scanAgent, AgentOut } from "../lib/api";
import { translations } from "./translations";

export default function AssetsView({ lang = "es" }: { lang?: "es" | "en" }) {
  const t = (key: keyof typeof translations.es) => (translations[lang] as any)[key] || key;
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentOut | null>(null);
  const [details, setDetails] = useState<any>({ packages: [], ports: [], vulns: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const fetchAgents = () => {
    listAgents().then(setAgents).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAgents();
    const iv = setInterval(fetchAgents, 30000);
    return () => clearInterval(iv);
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

  const handleScan = async () => {
    if (!selectedAgent) return;
    setScanning(true);
    try {
      await scanAgent(selectedAgent.id);
      alert("Solicitud de escaneo enviada correctamente al agente.");
    } catch (err) {
      alert("Error al solicitar escaneo. Verifique la conexión del agente.");
    } finally {
      setScanning(false);
    }
  };

  const getVulnSummary = (vulns: any[]) => {
    const critical = vulns.filter(v => v.severity === "Critical").length;
    const high = vulns.filter(v => v.severity === "High").length;
    return { critical, high };
  };

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>{t('connecting_to_inventory').toUpperCase()}</div>;

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: selectedAgent ? '1.2fr 1.5fr' : '1fr', gap: '16px', height: '100%', overflow: 'hidden' }}>
      
      {/* Agents List */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="panel__title">{t('inventory')} · EDR ENDPOINTS</span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>ACTIVOS: {agents.length}</span>
        </div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-dim)', textTransform: 'uppercase', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-panel)' }}>
                <th style={{ padding: '12px 10px', textAlign: 'left' }}>{t('state')}</th>
                <th style={{ padding: '12px 10px', textAlign: 'left' }}>{t('name')}</th>
                <th style={{ padding: '12px 10px', textAlign: 'left' }}>{t('ip')}</th>
                <th style={{ padding: '12px 10px', textAlign: 'left' }}>OS / VER</th>
                <th style={{ padding: '12px 10px', textAlign: 'left' }}>KEEP-ALIVE</th>
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
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.status === 'active' ? 'var(--signal)' : 'var(--danger)', boxShadow: a.status === 'active' ? '0 0 5px var(--signal)' : 'none' }}></div>
                      <span style={{ fontSize: '9px', color: a.status === 'active' ? 'var(--signal)' : 'var(--danger)' }}>{a.status.toUpperCase()}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{a.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>ID: {a.id}</div>
                  </td>
                  <td style={{ padding: '12px 10px', fontFamily: 'var(--mono)' }}>{a.ip}</td>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ fontSize: '10px' }}>{a.os}</div>
                    <div style={{ fontSize: '9px', color: 'var(--cyan)' }}>v{a.version}</div>
                  </td>
                  <td style={{ padding: '12px 10px', color: 'var(--text-faint)', fontSize: '10px' }}>
                    {a.last_keep_alive ? new Date(a.last_keep_alive).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', letterSpacing: '2px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>📡</div>
                    {t('no_agents_found')} · {t('check_wazuh_connection')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail View */}
      {selectedAgent && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="panel__title">{t('technical_detail')}: {selectedAgent.name}</span>
            <div style={{ display: 'flex', gap: '10px' }}>
               <button 
                onClick={handleScan} 
                disabled={scanning || selectedAgent.status !== 'active'}
                style={{ padding: '4px 12px', background: 'var(--cyan)', border: 'none', color: '#000', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}
               >
                 {scanning ? 'SOLICITANDO...' : 'FORZAR ESCANEO'}
               </button>
               <button className="action-btn" onClick={() => setSelectedAgent(null)}>{t('close').toUpperCase()}</button>
            </div>
          </div>
          
          <div className="panel__body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
             
             {detailsLoading ? (
               <div style={{ padding: '40px', textAlign: 'center', color: 'var(--signal)' }}>{t('sync').replace('🔄', '').trim().toUpperCase()}...</div>
             ) : (
               <>
                 {/* Summary KPIs */}
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div className="panel" style={{ padding: '15px', textAlign: 'center', borderTop: '2px solid var(--danger)' }}>
                       <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '5px' }}>VULNS CRÍTICAS</div>
                       <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--danger)' }}>{getVulnSummary(details.vulns).critical}</div>
                    </div>
                    <div className="panel" style={{ padding: '15px', textAlign: 'center', borderTop: '2px solid var(--amber)' }}>
                       <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '5px' }}>VULNS ALTAS</div>
                       <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--amber)' }}>{getVulnSummary(details.vulns).high}</div>
                    </div>
                    <div className="panel" style={{ padding: '15px', textAlign: 'center', borderTop: '2px solid var(--signal)' }}>
                       <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '5px' }}>PUERTOS ABIERTOS</div>
                       <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--signal)' }}>{details.ports.length}</div>
                    </div>
                 </div>

                 {/* Networking & Vulns Section */}
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
                       <div style={{ padding: '10px', fontSize: '10px', color: 'var(--cyan)', borderBottom: '1px solid var(--line-faint)', fontWeight: 600 }}>PUERTOS EN ESCUCHA</div>
                       <div style={{ padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                          {details.ports.length > 0 ? details.ports.map((p: any, i: number) => (
                            <span key={i} style={{ padding: '2px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)', borderRadius: '4px', fontSize: '9px', fontFamily: 'var(--mono)' }}>
                              {p.protocol.toUpperCase()}/{p.local_port}
                            </span>
                          )) : <span style={{ color: 'var(--text-faint)', fontSize: '10px' }}>No se detectan puertos</span>}
                       </div>
                    </div>
                    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
                       <div style={{ padding: '10px', fontSize: '10px', color: 'var(--danger)', borderBottom: '1px solid var(--line-faint)', fontWeight: 600 }}>VULNERABILIDADES RECIENTES</div>
                       <div style={{ padding: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                          {details.vulns.slice(0, 10).map((v: any, i: number) => (
                            <div key={i} style={{ marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                                  <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{v.cve}</span>
                                  <span style={{ color: 'var(--text-dim)' }}>{v.severity}</span>
                                </div>
                                <div style={{ fontSize: '8px', color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                   {v.condition}
                                </div>
                            </div>
                          ))}
                          {details.vulns.length === 0 && <div style={{ color: 'var(--signal)', fontSize: '10px', textAlign: 'center', padding: '20px' }}>SISTEMA LIMPIO</div>}
                       </div>
                    </div>
                 </div>

                 {/* Packages List */}
                 <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '10px', fontSize: '10px', color: 'var(--text-bright)', borderBottom: '1px solid var(--line-faint)', fontWeight: 600 }}>INVENTARIO DE SOFTWARE (Wazuh Syscollector)</div>
                    <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.1)' }}>
                       <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.8)', color: 'var(--text-faint)', zIndex: 5 }}>
                             <tr>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Nombre</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>Versión</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Arq</th>
                             </tr>
                          </thead>
                          <tbody>
                             {details.packages.map((pkg: any, i: number) => (
                               <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '6px 8px', color: 'var(--text-bright)' }}>{pkg.name}</td>
                                  <td style={{ padding: '6px 8px', color: 'var(--text-dim)' }}>{pkg.version}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-faint)' }}>{pkg.architecture}</td>
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
