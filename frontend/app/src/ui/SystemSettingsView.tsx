import { useState, useEffect } from "react";
import { fetchAuth } from "../lib/api";

export interface SystemSettingOut {
    key: string;
    value: string;
    is_sensitive: boolean;
    updated_at: string;
}

export interface SystemSettingIn {
    key: string;
    value: string;
    is_sensitive: boolean;
}

const DEFAULT_SETTINGS: SystemSettingIn[] = [
    { key: "ollama_url", value: "http://localhost:11434", is_sensitive: false },
    { key: "ollama_model", value: "llama3", is_sensitive: false },
    { key: "ollama_min_alert_level", value: "high", is_sensitive: false },
    { key: "vt_api_key", value: "", is_sensitive: true },
    { key: "otx_api_key", value: "", is_sensitive: true },
    { key: "max_upload_mb", value: "10", is_sensitive: false },
    { key: "retention_days_cowrie", value: "30", is_sensitive: false },
    { key: "default_theme", value: "dark", is_sensitive: false },
];

export default function SystemSettingsView({ lang }: { lang: 'en' | 'es' }) {
    const [settings, setSettings] = useState<SystemSettingIn[]>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const res = await fetchAuth("/api/settings");
                if (res.ok) {
                    const data: SystemSettingOut[] = await res.json();
                    
                    // Merge remote data with defaults
                    setSettings(prev => prev.map(s => {
                        const remote = data.find(d => d.key === s.key);
                        if (remote) {
                            return { ...s, value: remote.value, is_sensitive: remote.is_sensitive };
                        }
                        return s;
                    }));
                }
            } catch (err) {
                console.error(err);
                setError("Error al cargar la configuración");
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleChange = (key: string, value: string) => {
        setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetchAuth("/api/settings", {
                method: "PUT",
                body: JSON.stringify(settings)
            });
            if (!res.ok) throw new Error("Error al guardar");
            alert(lang === 'es' ? "Configuración guardada correctamente." : "Settings saved successfully.");
        } catch (err) {
            setError(lang === 'es' ? "Error al guardar la configuración." : "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '20px', color: 'var(--signal)' }}>CARGANDO...</div>;

    return (
        <div className="view" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 8px 8px 0', gap: '16px' }}>
            <div className="panel" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <h2 style={{ color: 'var(--signal)', marginTop: 0, fontFamily: 'var(--mono)', fontSize: '18px' }}>
                    {lang === 'es' ? 'CONFIGURACIÓN GLOBAL DEL SISTEMA' : 'GLOBAL SYSTEM SETTINGS'}
                </h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '11px', marginBottom: '24px' }}>
                    {lang === 'es' 
                        ? 'Los cambios se aplican en tiempo real. Las credenciales se almacenan cifradas (AES-256-GCM).' 
                        : 'Changes apply in real-time. Credentials are encrypted (AES-256-GCM).'}
                </p>

                {error && <div style={{ color: 'var(--danger)', marginBottom: '15px', fontSize: '12px' }}>{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                    
                    {/* IA / LLM Config */}
                    <div style={{ border: '1px solid var(--line-faint)', padding: '16px', background: 'rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text)', fontSize: '12px', borderBottom: '1px solid var(--line-faint)', paddingBottom: '8px' }}>IA & OLLAMA</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>OLLAMA URL</label>
                                <input 
                                    type="text" 
                                    placeholder="http://localhost:11434"
                                    value={settings.find(s => s.key === 'ollama_url')?.value || ''} 
                                    onChange={(e) => handleChange('ollama_url', e.target.value)}
                                />
                                {settings.find(s => s.key === 'ollama_url')?.value && !/^https?:\/\/.+/.test(settings.find(s => s.key === 'ollama_url')?.value || '') && (
                                    <span style={{ fontSize: '9px', color: 'var(--danger)' }}>URL inválida</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>MODELO OLLAMA</label>
                                <input 
                                    type="text" 
                                    value={settings.find(s => s.key === 'ollama_model')?.value || ''} 
                                    onChange={(e) => handleChange('ollama_model', e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>NIVEL MÍNIMO DE ALERTA PARA ANÁLISIS</label>
                                <select 
                                    value={settings.find(s => s.key === 'ollama_min_alert_level')?.value || 'high'}
                                    onChange={(e) => handleChange('ollama_min_alert_level', e.target.value)}
                                >
                                    <option value="critical">Critical</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Threat Intel API Keys */}
                    <div style={{ border: '1px solid var(--line-faint)', padding: '16px', background: 'rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text)', fontSize: '12px', borderBottom: '1px solid var(--line-faint)', paddingBottom: '8px' }}>THREAT INTEL API KEYS</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>VIRUSTOTAL API KEY</label>
                                <input 
                                    type="password" 
                                    placeholder="********"
                                    maxLength={256}
                                    value={settings.find(s => s.key === 'vt_api_key')?.value === '********' ? '' : settings.find(s => s.key === 'vt_api_key')?.value} 
                                    onChange={(e) => handleChange('vt_api_key', e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>ALIENVAULT OTX API KEY</label>
                                <input 
                                    type="password" 
                                    placeholder="********"
                                    maxLength={256}
                                    value={settings.find(s => s.key === 'otx_api_key')?.value === '********' ? '' : settings.find(s => s.key === 'otx_api_key')?.value} 
                                    onChange={(e) => handleChange('otx_api_key', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* System Params */}
                    <div style={{ border: '1px solid var(--line-faint)', padding: '16px', background: 'rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text)', fontSize: '12px', borderBottom: '1px solid var(--line-faint)', paddingBottom: '8px' }}>SISTEMA Y SEGURIDAD</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>LÍMITE SUBIDA EVIDENCIA (MB)</label>
                                <input 
                                    type="number" 
                                    min="1" max="100"
                                    value={settings.find(s => s.key === 'max_upload_mb')?.value || '10'} 
                                    onChange={(e) => handleChange('max_upload_mb', e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>RETENCIÓN COWRIE (DÍAS)</label>
                                <input 
                                    type="number" 
                                    min="1" max="365"
                                    value={settings.find(s => s.key === 'retention_days_cowrie')?.value || '30'} 
                                    onChange={(e) => handleChange('retention_days_cowrie', e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>TEMA POR DEFECTO</label>
                                <select 
                                    value={settings.find(s => s.key === 'default_theme')?.value || 'dark'}
                                    onChange={(e) => handleChange('default_theme', e.target.value)}
                                >
                                    <option value="dark">Dark (Tactical)</option>
                                    <option value="light">Light</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        className="action-btn active" 
                        onClick={handleSave} 
                        disabled={saving}
                        style={{ padding: '12px 30px' }}
                    >
                        {saving ? (lang === 'es' ? 'GUARDANDO...' : 'SAVING...') : (lang === 'es' ? 'GUARDAR CONFIGURACIÓN' : 'SAVE SETTINGS')}
                    </button>
                </div>
            </div>
        </div>
    );
}
