import { useState, useEffect } from "react";
import { vtCheckIp, vtCheckHash, vtCheckDomain, listIOCs, addIOC, updateIOC, deleteIOC } from "../lib/api";

export default function ThreatIntelView({ initialIp }: { initialIp?: string }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"ip" | "hash" | "domain">("ip");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"DETALLES" | "VENDORS" | "WHOIS" | "DNS" | "COMUNIDAD">("DETALLES");
  const [apiKey, setApiKey] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  const loadWatchlist = async () => {
    try {
      const data = await listIOCs();
      setWatchlist(data);
    } catch (e) {
      console.error("Error loading watchlist:", e);
    }
  };

  useEffect(() => {
    loadWatchlist();
    const savedKey = localStorage.getItem("vt_api_key");
    if (savedKey) setApiKey(savedKey);
    
    if (initialIp) {
      setQuery(initialIp);
      setType("ip");
      // Trigger search after state updates
      setTimeout(() => {
        const btn = document.getElementById("threat-search-btn");
        if (btn) btn.click();
      }, 100);
    }
  }, [initialIp]);

  const handleSaveApiKey = () => {
    localStorage.setItem("vt_api_key", apiKey);
    alert("API Key de VirusTotal guardada en la sesión actual.");
    setShowConfig(false);
  };

  const testApiKey = async () => {
    if (!apiKey) return alert("Ingrese una API Key primero");
    
    // Guardar temporalmente para que api.ts la lea
    const previousKey = localStorage.getItem("vt_api_key");
    localStorage.setItem("vt_api_key", apiKey);
    
    try {
      // Hacemos una llamada real al backend, que a su vez llama a VT con la nueva key.
      const testRes = await vtCheckIp("8.8.8.8");
      if (testRes && !testRes.error) {
        alert("¡Ping exitoso! La API Key de VirusTotal está funcionando correctamente y ha sido guardada.");
        setShowConfig(false);
      } else {
        throw new Error(testRes?.error || "Respuesta inválida de VirusTotal");
      }
    } catch (e: any) {
      // Revertimos si falla
      if (previousKey) {
        localStorage.setItem("vt_api_key", previousKey);
      } else {
        localStorage.removeItem("vt_api_key");
      }
      alert(`Error verificando API Key: ${e.message || "Credenciales inválidas o sin cuota"}`);
    }
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setResult(null);
    try {
      let res;
      if (type === "ip") res = await vtCheckIp(query);
      else if (type === "hash") res = await vtCheckHash(query);
      else res = await vtCheckDomain(query);
      setResult(res);
      setActiveTab("DETALLES");
    } catch (e) {
      alert("Error en la consulta. Verifique la conexión con el backend o la API Key.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!result) return;
    try {
      await addIOC({
        value: query,
        ioc_type: type,
        malicious_score: result.malicious || 0,
        total_engines: result.total || 0,
        country: result.country,
        asn: result.asn,
        as_owner: result.as_owner,
        tags: result.tags || [],
        status: "watchlist",
        vt_report: result
      });
      alert("Añadido a Watchlist correctamente.");
      loadWatchlist();
    } catch (e) {
      alert("Error al añadir (quizás ya existe).");
    }
  };

  const handleUpdateStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "watchlist" ? "blocked" : currentStatus === "blocked" ? "resolved" : "watchlist";
    try {
      await updateIOC(id, { status: newStatus });
      loadWatchlist();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteIOC = async (id: number) => {
    if (!confirm("¿Eliminar este indicador?")) return;
    try {
      await deleteIOC(id);
      loadWatchlist();
    } catch (e) {
      console.error(e);
    }
  };

  const DetailRow = ({ label, value, color, mono }: { label: string; value: React.ReactNode; color?: string; mono?: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '15px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px' }}>
      <div style={{ color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ color: color || 'var(--text-bright)', wordBreak: 'break-all', fontFamily: mono ? 'var(--mono)' : 'inherit' }}>{value || "-"}</div>
    </div>
  );

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', height: '100%', overflow: 'hidden' }}>

      {/* Main Analysis Panel */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="panel__title">Motor de Inteligencia de Amenazas · VT REPORT ENGINE</span>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            style={{ background: 'var(--signal)', border: 'none', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
          >
            ⚙️ CONFIG API
          </button>
        </div>
        <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden', padding: '15px', flex: 1, minHeight: 0 }}>
          
          {/* API Config Panel */}
          {showConfig && (
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', border: '1px solid var(--signal)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-bright)', marginBottom: '8px' }}>Configuración de VirusTotal API Key</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)} 
                  placeholder="Ingrese su VirusTotal API Key..."
                  style={{ flex: 1, background: '#000', border: '1px solid var(--line)', color: 'var(--text-bright)', padding: '6px' }}
                />
                <button onClick={handleSaveApiKey} style={{ padding: '6px 12px', background: 'var(--signal)', color: '#000', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>GUARDAR</button>
                <button onClick={testApiKey} style={{ padding: '6px 12px', background: 'var(--cyan)', color: '#000', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>COMPROBAR (PING)</button>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <select
              value={type}
              onChange={e => setType(e.target.value as any)}
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--line)', color: '#fff', padding: '10px', borderRadius: '4px' }}
            >
              <option value="ip">DIRECCIÓN IP</option>
              <option value="hash">HASH</option>
              <option value="domain">DOMINIO</option>
            </select>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={type === 'ip' ? "Ej: 8.8.8.8" : type === 'hash' ? "SHA256..." : "Ej: example.com"}
              style={{ flex: 1, background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', outline: 'none' }}
            />
            <button id="threat-search-btn" onClick={handleSearch} disabled={loading} style={{ padding: '8px 14px', background: loading ? 'var(--line)' : 'var(--signal)', border: 'none', color: loading ? 'var(--text)' : '#000', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--mono)' }}>
              {loading ? "ESCANEANDO..." : "ANALIZAR IOC"}
            </button>
          </div>

          {/* Empty State */}
          {!result && !loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎯</div>
                <div style={{ fontSize: '12px', letterSpacing: '2px', fontFamily: 'var(--mono)' }}>ESPERANDO ENTRADA DE IOC PARA ANÁLISIS GLOBAL</div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
             <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div className="cyber-loader"></div>
             </div>
          )}

          {/* Result Area */}
          {result && result.found && !loading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

              {/* Banner */}
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: '20px', alignItems: 'center', background: result.malicious > 0 ? 'rgba(255,50,50,0.04)' : 'rgba(0,255,136,0.04)', border: `1px solid ${result.malicious > 0 ? 'rgba(255,71,87,0.25)' : 'rgba(0,255,136,0.25)'}`, borderRadius: '4px', padding: '15px', marginBottom: '15px', flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <svg width="70" height="70" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={result.malicious > 0 ? 'var(--danger)' : 'var(--signal)'}
                      strokeWidth="10"
                      strokeDasharray="264"
                      strokeDashoffset={264 - (264 * ((result.malicious || 0) / (result.total || 94)))}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                    <text x="50" y="47" textAnchor="middle" fill="var(--text-bright)" fontSize="18" fontWeight="900">{result.malicious || 0}</text>
                    <text x="50" y="63" textAnchor="middle" fill="var(--text-dim)" fontSize="10">/ {result.total || 94}</text>
                  </svg>
                  <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '4px', letterSpacing: '1px' }}>COMUNIDAD</div>
                </div>
                <div>
                  <div style={{ color: result.malicious > 0 ? 'var(--danger)' : 'var(--signal)', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                    {result.malicious > 0 
                      ? `⚠️ ${result.malicious} motores de seguridad marcaron este indicador como malicioso.` 
                      : `✅ Ningún motor detectó amenazas en este indicador.`}
                  </div>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                    <div><span style={{ color: 'var(--text-faint)' }}>Target: </span><span style={{ color: 'var(--text-bright)' }}>{query}</span></div>
                    <div><span style={{ color: 'var(--text-faint)' }}>Reputación: </span><span style={{ color: result.reputation < 0 ? 'var(--danger)' : 'var(--signal)' }}>{result.reputation}</span></div>
                    <div><span style={{ color: 'var(--text-faint)' }}>Último Análisis: </span><span>{result.last_analysis_date || "N/A"}</span></div>
                  </div>
                  {result.tags && result.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                      {result.tags.map((tag: string) => (
                        <span key={tag} style={{ fontSize: '9px', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--line)', borderRadius: '10px', color: 'var(--text-dim)' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button onClick={handleAddToWatchlist} className="action-btn" style={{ padding: '8px 15px', fontSize: '10px', width: '100%' }}>➕ AÑADIR A WATCHLIST</button>
                    {result.malicious > 0 && (
                        <button className="action-btn" style={{ padding: '8px 15px', fontSize: '10px', background: 'var(--danger)', color: '#fff', border: 'none', width: '100%' }}>🚨 BLOQUEAR EN FIREWALL</button>
                    )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '15px', flexShrink: 0, overflowX: 'auto' }}>
                {(["DETALLES", "VENDORS", "WHOIS", "DNS", "COMUNIDAD"] as const).map(tab => (
                  <button 
                    key={tab} 
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '10px 20px',
                      color: activeTab === tab ? 'var(--signal)' : 'var(--text-dim)',
                      borderBottom: activeTab === tab ? '2px solid var(--signal)' : '2px solid transparent',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '1px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {tab === "DNS" ? "DNS HISTORY" : tab}
                  </button>
                ))}
              </div>

              {/* Scrollable Content */}
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {activeTab === "DETALLES" && (
                  <>
                    {result.ioc_type === "ip" && (
                      <>
                        {result.categories && Object.keys(result.categories).length > 0 && (
                          <section>
                            <h4 style={{ color: 'var(--danger)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,71,87,0.2)', paddingBottom: '6px' }}>CATEGORÍAS DE AMENAZA</h4>
                            {Object.entries(result.categories as Record<string, string>).map(([vendor, label]) => (
                              <DetailRow key={vendor} label={vendor} value={label} color="var(--amber)" />
                            ))}
                          </section>
                        )}
                        <section>
                          <h4 style={{ color: 'var(--cyan)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 10px 0', borderBottom: '1px solid rgba(74,227,255,0.2)', paddingBottom: '6px' }}>INFORMACIÓN DE RED Y GEOLOCALIZACIÓN</h4>
                          <DetailRow label="País" value={result.country} />
                          <DetailRow label="Continente" value={result.continent} />
                          <DetailRow label="Propietario del AS" value={result.as_owner} />
                          <DetailRow label="Número de AS (ASN)" value={result.asn} />
                          <DetailRow label="Red (Subnet)" value={result.network} mono />
                          <DetailRow label="Registro Regional" value={result.regional_internet_registry} />
                          <DetailRow label="Primera Sumisión" value={result.first_submission_date} />
                          <DetailRow label="Última Sumisión" value={result.last_submission_date} />
                          <DetailRow label="Último Análisis" value={result.last_analysis_date} />
                          <DetailRow label="Última Modificación" value={result.last_modification_date} />
                        </section>
                      </>
                    )}
                    {result.ioc_type === "hash" && (
                        <section>
                            <h4 style={{ color: 'var(--cyan)', borderLeft: '3px solid var(--cyan)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 10px 0' }}>PROPIEDADES DEL ARCHIVO</h4>
                            <DetailRow label="Nombres Sugeridos" value={result.name} />
                            <DetailRow label="Tipo de Archivo" value={result.type} />
                            <DetailRow label="Tamaño (Bytes)" value={result.size?.toLocaleString()} />
                            <DetailRow label="MD5" value={result.md5} mono />
                            <DetailRow label="SHA-1" value={result.sha1} mono />
                            <DetailRow label="SHA-256" value={result.sha256} mono />
                            <DetailRow label="Primera Sumisión" value={result.first_submission_date} />
                            <DetailRow label="Última Sumisión" value={result.last_submission_date} />
                        </section>
                    )}
                    <section>
                        <h4 style={{ color: 'var(--amber)', borderLeft: '3px solid var(--amber)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 10px 0' }}>ESTADÍSTICAS DE ANÁLISIS</h4>
                        <div style={{ display: 'flex', gap: '30px', fontFamily: 'var(--mono)' }}>
                            <div style={{ color: 'var(--danger)' }}>Malicioso: {result.malicious}</div>
                            <div style={{ color: 'var(--amber)' }}>Sospechoso: {result.suspicious}</div>
                            <div style={{ color: 'var(--signal)' }}>Inofensivo: {result.harmless}</div>
                            <div style={{ color: 'var(--text-dim)' }}>No Detectado: {result.undetected}</div>
                        </div>
                    </section>
                  </>
                )}

                {activeTab === "VENDORS" && (
                   <section>
                       <h4 style={{ color: 'var(--danger)', borderLeft: '3px solid var(--danger)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 15px 0' }}>RESULTADOS POR MOTOR DE SEGURIDAD</h4>
                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' }}>
                           {result.vendor_results && result.vendor_results.map((v: any, idx: number) => {
                               const isMalicious = v.category === "malicious";
                               const isSuspicious = v.category === "suspicious";
                               const color = isMalicious ? "var(--danger)" : isSuspicious ? "var(--amber)" : "var(--signal)";
                               return (
                                   <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: `1px solid ${isMalicious || isSuspicious ? color : 'var(--line)'}`, padding: '8px 12px', borderRadius: '4px' }}>
                                       <div style={{ color: 'var(--text-bright)', fontSize: '12px', fontWeight: 600 }}>{v.vendor}</div>
                                       <div style={{ color: color, fontSize: '11px', fontFamily: 'var(--mono)', textAlign: 'right' }}>
                                           <div>{v.result || v.category}</div>
                                           {v.method && <div style={{ fontSize: '9px', opacity: 0.6 }}>({v.method})</div>}
                                       </div>
                                   </div>
                               )
                           })}
                       </div>
                   </section>
                )}

                {activeTab === "WHOIS" && (
                    <section>
                        <h4 style={{ color: 'var(--signal)', borderLeft: '3px solid var(--signal)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 10px 0' }}>REGISTRO WHOIS</h4>
                        {result.whois_date && <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>Actualizado: {result.whois_date}</div>}
                        <pre style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', padding: '15px', borderRadius: '4px', overflowX: 'auto', fontSize: '11px', color: 'var(--text-faint)', whiteSpace: 'pre-wrap' }}>
                            {result.whois || "No hay registro WHOIS disponible."}
                        </pre>
                    </section>
                )}

                {activeTab === "DNS" && (
                    <section>
                        <h4 style={{ color: 'var(--cyan)', borderLeft: '3px solid var(--cyan)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 15px 0' }}>HISTÓRICO DE RESOLUCIONES DNS</h4>
                        {!result.resolutions || result.resolutions.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>No hay registros históricos disponibles.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-dim)', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                                        <th style={{ padding: '8px' }}>HOST / DOMINIO</th>
                                        <th style={{ padding: '8px' }}>DIRECCIÓN IP</th>
                                        <th style={{ padding: '8px' }}>FECHA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.resolutions.map((r: any, i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '8px', color: 'var(--signal)' }}>{r.host || "-"}</td>
                                            <td style={{ padding: '8px', color: 'var(--cyan)' }}>{r.ip || "-"}</td>
                                            <td style={{ padding: '8px', color: 'var(--text-dim)' }}>{r.date}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>
                )}

                {activeTab === "COMUNIDAD" && (
                    <section>
                        <h4 style={{ color: 'var(--amber)', borderLeft: '3px solid var(--amber)', paddingLeft: '8px', fontSize: '12px', margin: '0 0 15px 0' }}>COMENTARIOS DE LA COMUNIDAD (CROWD INTEL)</h4>
                        {!result.comments || result.comments.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>Sin comentarios de la comunidad.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {result.comments.map((c: any, i: number) => (
                                    <div key={i} style={{ padding: '15px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                            <span style={{ fontSize: '10px', color: 'var(--cyan)', fontWeight: 'bold' }}>👤 {c.user}</span>
                                            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{c.date}</span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#fff', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{c.text}</div>
                                        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', fontSize: '9px', color: 'var(--text-dim)' }}>
                                            <span>👍 {c.votes?.positive || 0}</span>
                                            <span>👎 {c.votes?.negative || 0}</span>
                                            <span>🚩 {c.votes?.abuse || 0}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

              </div>
            </div>
          )}

          {result && !result.found && !loading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', color: 'var(--amber)' }}>
                      <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
                      <div>INDICADOR NO ENCONTRADO EN VIRUSTOTAL</div>
                  </div>
              </div>
          )}

        </div>
      </div>

      {/* Sidebar: Watchlist */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="panel__title">IOC WATCHLIST</span>
            <span style={{ fontSize: '10px', background: 'var(--danger)', color: '#fff', padding: '2px 6px', borderRadius: '10px' }}>{watchlist.length} ACTIVOS</span>
        </div>
        <div className="panel__body" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {watchlist.map(ioc => {
                const isBlocked = ioc.status === "blocked";
                const isResolved = ioc.status === "resolved";
                return (
                    <div key={ioc.id} style={{ border: `1px solid ${isBlocked ? 'var(--danger)' : isResolved ? 'var(--signal)' : 'var(--amber)'}`, background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--text-bright)', wordBreak: 'break-all' }}>{ioc.value}</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => handleUpdateStatus(ioc.id, ioc.status)} title="Cambiar Estado" style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--text-bright)', cursor: 'pointer', padding: '2px 5px', fontSize: '10px' }}>
                                    {isBlocked ? '🛡️' : isResolved ? '✅' : '👀'}
                                </button>
                                <button onClick={() => handleDeleteIOC(ioc.id)} title="Eliminar" style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--danger)', cursor: 'pointer', padding: '2px 5px', fontSize: '10px' }}>✖</button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                            <span>Tipo: {ioc.ioc_type.toUpperCase()}</span>
                            <span>Score: <span style={{ color: ioc.malicious_score > 0 ? 'var(--danger)' : 'var(--signal)' }}>{ioc.malicious_score}/{ioc.total_engines}</span></span>
                        </div>
                        <div style={{ fontSize: '9px', background: isBlocked ? 'rgba(255,0,0,0.1)' : 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '2px', textAlign: 'center', color: isBlocked ? 'var(--danger)' : 'var(--text-dim)', textTransform: 'uppercase' }}>
                            Estado: {ioc.status}
                        </div>
                        {ioc.related_ticket_id && (
                             <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--cyan)' }}>
                                 Vinculado al Ticket #{ioc.related_ticket_id}
                             </div>
                        )}
                    </div>
                )
            })}
            {watchlist.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '11px', marginTop: '40px' }}>
                    <div style={{ fontSize: '24px', opacity: 0.3, marginBottom: '10px' }}>📋</div>
                    No hay indicadores en seguimiento.
                </div>
            )}
        </div>
      </div>

    </div>
  );
}
