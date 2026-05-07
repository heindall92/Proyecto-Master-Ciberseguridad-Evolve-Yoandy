import { useState, useEffect } from "react";
import { fetchAuth } from "../lib/api";

interface HealthStatus {
    status: "ok" | "warning" | "error";
    latency_ms: number;
    error: string | null;
}

interface IntegrationsHealth {
    wazuh: HealthStatus;
    indexer: HealthStatus;
    dashboard: HealthStatus;
    postgres: HealthStatus;
    ollama: HealthStatus;
    virustotal: HealthStatus;
}

export default function IntegrationsHealthView({ lang }: { lang: 'en' | 'es' }) {
    const [health, setHealth] = useState<IntegrationsHealth | null>(null);
    const [loading, setLoading] = useState(true);

    const checkHealth = async () => {
        try {
            const data = await fetchAuth<IntegrationsHealth>("/api/health/integrations");
            setHealth(data);
        } catch (err) {
            console.error("Health check failed", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = (status: string) => {
        if (status === "ok") return "var(--signal)";
        if (status === "warning") return "var(--amber)";
        return "var(--danger)";
    };

    if (loading) return <div style={{ padding: '20px', color: 'var(--signal)' }}>{lang === 'es' ? 'ANALIZANDO INTEGRACIONES...' : 'ANALYZING INTEGRATIONS...'}</div>;

    const items = [
        { id: 'wazuh', name: 'Wazuh Manager', data: health?.wazuh },
        { id: 'indexer', name: 'OpenSearch Indexer', data: health?.indexer },
        { id: 'dashboard', name: 'OpenSearch Dashboard', data: health?.dashboard },
        { id: 'postgres', name: 'PostgreSQL DB', data: health?.postgres },
        { id: 'ollama', name: 'Ollama AI', data: health?.ollama },
        { id: 'virustotal', name: 'VirusTotal API', data: health?.virustotal },
    ];

    return (
        <div className="view" style={{ padding: '0 8px 8px 0' }}>
            <div className="panel" style={{ padding: '24px' }}>
                <h2 style={{ color: 'var(--signal)', marginTop: 0, fontFamily: 'var(--mono)', fontSize: '18px', letterSpacing: '1px' }}>
                    {lang === 'es' ? 'ESTADO DE INTEGRACIONES' : 'INTEGRATIONS HEALTH'}
                </h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginBottom: '24px' }}>
                    {lang === 'es' ? 'Monitoreo en tiempo real de servicios core del SOC. Refresco: 30s.' : 'Real-time monitoring of SOC core services. Refresh: 30s.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {items.map(item => (
                        <div key={item.id} style={{ 
                            background: 'rgba(0,0,0,0.3)', 
                            border: `1px solid ${getStatusColor(item.data?.status || 'error')}`,
                            padding: '20px',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ 
                                position: 'absolute', top: 0, right: 0, 
                                width: '40px', height: '40px', 
                                background: getStatusColor(item.data?.status || 'error'), 
                                opacity: 0.1, clipPath: 'polygon(100% 0, 0 0, 100% 100%)' 
                            }}></div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)' }}>{item.name}</div>
                                <div style={{ 
                                    fontSize: '9px', padding: '2px 6px', borderRadius: '2px', 
                                    background: getStatusColor(item.data?.status || 'error'), color: '#000', fontWeight: 'bold' 
                                }}>
                                    {item.data?.status.toUpperCase() || 'OFFLINE'}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '20px' }}>
                                <div>
                                    <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>LATENCY</div>
                                    <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: item.data?.latency_ms && item.data.latency_ms > 500 ? 'var(--amber)' : 'var(--text)' }}>
                                        {item.data?.latency_ms || 0}ms
                                    </div>
                                </div>
                                {item.data?.error && (
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '9px', color: 'var(--danger)' }}>ERROR</div>
                                        <div style={{ fontSize: '10px', color: 'var(--danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.data.error}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div style={{ marginTop: '30px', textAlign: 'right' }}>
                    <button className="action-btn" onClick={checkHealth}>
                        {lang === 'es' ? 'FORZAR RE-CHECK' : 'FORCE RE-CHECK'}
                    </button>
                </div>
            </div>
        </div>
    );
}
