import { useState, useEffect } from "react";
import { fetchAuth } from "../lib/api";

interface MonitorOut {
    id: number;
    name: string;
    description: string | null;
    enabled: bool;
    threshold: number;
    severity_floor: string;
    rule_id_pattern: string | null;
    updated_at: string;
}

export default function MonitorsView({ lang }: { lang: 'en' | 'es' }) {
    const [monitors, setMonitors] = useState<MonitorOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<number | null>(null);

    const loadMonitors = async () => {
        try {
            const res = await fetchAuth("/api/monitors");
            if (res.ok) setMonitors(await res.json());
        } catch (err) {
            console.error("Failed to load monitors", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadMonitors(); }, []);

    const toggleMonitor = async (m: MonitorOut) => {
        setUpdating(m.id);
        try {
            const res = await fetchAuth(`/api/monitors/${m.id}`, {
                method: "PUT",
                body: JSON.stringify({ enabled: !m.enabled })
            });
            if (res.ok) {
                const updated = await res.json();
                setMonitors(prev => prev.map(item => item.id === m.id ? updated : item));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(null);
        }
    };

    const updateThreshold = async (m: MonitorOut, val: number) => {
        setUpdating(m.id);
        try {
            const res = await fetchAuth(`/api/monitors/${m.id}`, {
                method: "PUT",
                body: JSON.stringify({ threshold: val })
            });
            if (res.ok) {
                const updated = await res.json();
                setMonitors(prev => prev.map(item => item.id === m.id ? updated : item));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUpdating(null);
        }
    };

    if (loading) return <div style={{ padding: '20px', color: 'var(--signal)' }}>{lang === 'es' ? 'CARGANDO MONITORES...' : 'LOADING MONITORS...'}</div>;

    return (
        <div className="view" style={{ padding: '0 8px 8px 0' }}>
            <div className="panel" style={{ padding: '24px' }}>
                <h2 style={{ color: 'var(--signal)', marginTop: 0, fontFamily: 'var(--mono)', fontSize: '18px' }}>
                    {lang === 'es' ? 'MONITORES DE DETECCIÓN SIEM' : 'SIEM DETECTION MONITORS'}
                </h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginBottom: '24px' }}>
                    {lang === 'es' ? 'Gestión de disparadores y umbrales para la generación automática de alertas.' : 'Manage triggers and thresholds for automated alert generation.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: '20px' }}>
                    {monitors.map(m => (
                        <div key={m.id} style={{ 
                            background: 'rgba(0,0,0,0.3)', 
                            border: `1px solid ${m.enabled ? 'var(--line)' : 'rgba(255,255,255,0.1)'}`,
                            padding: '20px',
                            opacity: m.enabled ? 1 : 0.6,
                            transition: 'all 0.3s'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: m.enabled ? 'var(--signal)' : 'var(--text-dim)' }}>{m.name}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>{m.description}</div>
                                </div>
                                <div 
                                    onClick={() => !updating && toggleMonitor(m)}
                                    style={{ 
                                        width: '44px', height: '22px', background: m.enabled ? 'var(--signal)' : '#333', 
                                        borderRadius: '11px', cursor: 'pointer', position: 'relative', transition: '0.3s'
                                    }}
                                >
                                    <div style={{ 
                                        position: 'absolute', top: '2px', left: m.enabled ? '24px' : '2px', 
                                        width: '18px', height: '18px', background: '#fff', borderRadius: '50%', transition: '0.3s' 
                                    }}></div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '20px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                                        <span>{lang === 'es' ? 'UMBRAL' : 'THRESHOLD'}</span>
                                        <span style={{ color: 'var(--signal)', fontFamily: 'var(--mono)' }}>{m.threshold}</span>
                                    </div>
                                    <input 
                                        type="range" min="1" max="1000" step="1"
                                        value={m.threshold}
                                        disabled={!m.enabled || updating === m.id}
                                        onChange={(e) => updateThreshold(m, parseInt(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--signal)' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '8px' }}>{lang === 'es' ? 'SEVERIDAD' : 'SEVERITY'}</div>
                                    <div style={{ 
                                        fontSize: '11px', padding: '4px 10px', background: 'rgba(255,255,255,0.05)', 
                                        color: m.severity_floor === 'critical' ? 'var(--danger)' : 'var(--amber)', border: '1px solid var(--line)'
                                    }}>
                                        {m.severity_floor.toUpperCase()}
                                    </div>
                                </div>
                            </div>
                            
                            {m.rule_id_pattern && (
                                <div style={{ marginTop: '15px', padding: '8px', background: 'rgba(0,0,0,0.5)', fontSize: '9px', fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>
                                    MATCH PATTERN: {m.rule_id_pattern}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
