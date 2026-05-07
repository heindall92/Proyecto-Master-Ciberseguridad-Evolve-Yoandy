import { useState, useEffect } from "react";
import { fetchAuth } from "../lib/api";

export interface AuditLogOut {
    id: number;
    user_id: number | null;
    username: string | null;
    action: string;
    route: string;
    ip_address: string | null;
    payload: any | null;
    timestamp: string;
}

export default function AuditLogView({ lang }: { lang: 'en' | 'es' }) {
    const [logs, setLogs] = useState<AuditLogOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filterUser, setFilterUser] = useState("");
    const [filterAction, setFilterAction] = useState("");

    const loadLogs = async () => {
        setLoading(true);
        try {
            let url = `/api/audit?page=${page}&size=50`;
            if (filterUser) url += `&user=${encodeURIComponent(filterUser)}`;
            if (filterAction) url += `&action=${encodeURIComponent(filterAction)}`;
            
            const res = await fetchAuth(url);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setLogs(data);
        } catch (err) {
            console.error("Error loading audit logs:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, [page]);

    const handleExport = () => {
        const csvRows = [
            ["ID", "Date", "User", "Action", "Route", "IP"].join(",")
        ];
        logs.forEach(l => {
            csvRows.push([
                l.id,
                new Date(l.timestamp).toISOString(),
                l.username || "anonymous",
                l.action,
                l.route,
                l.ip_address || "N/A"
            ].join(","));
        });
        const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="view" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 8px 8px 0', gap: '16px' }}>
            <div className="panel" style={{ display: 'flex', gap: '15px', padding: '15px', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{lang === 'es' ? 'USUARIO' : 'USER'}</label>
                    <input 
                        type="text" 
                        value={filterUser} 
                        onChange={e => setFilterUser(e.target.value)} 
                        style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '8px', fontFamily: 'var(--mono)' }} 
                        placeholder="admin..."
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{lang === 'es' ? 'ACCIÓN' : 'ACTION'}</label>
                    <select 
                        value={filterAction} 
                        onChange={e => setFilterAction(e.target.value)}
                        style={{ background: '#000', border: '1px solid var(--line)', color: '#fff', padding: '8px', fontFamily: 'var(--mono)', minWidth: '120px' }}
                    >
                        <option value="">TODAS</option>
                        <option value="POST">POST (Crear)</option>
                        <option value="PUT">PUT (Actualizar)</option>
                        <option value="DELETE">DELETE (Borrar)</option>
                        <option value="PATCH">PATCH</option>
                    </select>
                </div>
                <button className="action-btn" onClick={() => { setPage(1); loadLogs(); }}>
                    {lang === 'es' ? 'FILTRAR' : 'FILTER'}
                </button>
                <div style={{ flex: 1 }}></div>
                <button className="action-btn" style={{ background: 'rgba(60,255,158,0.1)' }} onClick={handleExport}>
                    {lang === 'es' ? 'EXPORTAR CSV' : 'EXPORT CSV'}
                </button>
            </div>

            <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                {loading ? (
                    <div style={{ padding: '20px', color: 'var(--signal)', textAlign: 'center' }}>CARGANDO REGISTROS...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--signal)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <th style={{ padding: '12px', textAlign: 'left' }}>ID</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>FECHA</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>USUARIO</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>ACCIÓN</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>RUTA</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                        {lang === 'es' ? 'No se encontraron registros de auditoría' : 'No audit records found'}
                                    </td>
                                </tr>
                            ) : logs.map(l => (
                                <tr key={l.id} style={{ borderBottom: '1px solid var(--line-faint)' }}>
                                    <td style={{ padding: '10px 12px' }}>#{l.id}</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{new Date(l.timestamp).toLocaleString()}</td>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--cyan)' }}>{l.username || 'Sistema'}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ 
                                            padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)',
                                            color: l.action === 'DELETE' ? 'var(--danger)' : l.action === 'POST' ? 'var(--signal)' : 'var(--amber)'
                                        }}>
                                            {l.action}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: '10px' }}>{l.route}</td>
                                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>{l.ip_address || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button 
                    className="action-btn" 
                    disabled={page === 1} 
                    onClick={() => setPage(p => p - 1)}
                >
                    ← ANTERIOR
                </button>
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-dim)', fontSize: '11px' }}>
                    PÁGINA {page}
                </span>
                <button 
                    className="action-btn" 
                    disabled={logs.length < 50} 
                    onClick={() => setPage(p => p + 1)}
                >
                    SIGUIENTE →
                </button>
            </div>
        </div>
    );
}
