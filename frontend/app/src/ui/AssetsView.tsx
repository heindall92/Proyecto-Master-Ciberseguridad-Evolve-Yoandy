import { useEffect, useState } from "react";
import {
  Sync as SyncIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { listAgents, enrollAgent, AgentOut } from "../lib/api";

export default function AssetsView() {
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOs, setNewOs] = useState("linux");
  const [result, setResult] = useState<any>(null);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const data = await listAgents();
      setAgents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const onEnroll = async () => {
    setLoading(true);
    try {
      const res = await enrollAgent(newName, newOs, "default");
      setResult(res);
      if (res.ok) fetchAgents();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--ff-mono)', color: 'var(--signal)', fontSize: '18px', letterSpacing: '2px' }}>INVENTARIO DE ACTIVOS</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
           <button 
            className="hud-btn" 
            onClick={fetchAgents} 
            disabled={loading}
            style={{ padding: '8px 15px', background: 'none', border: '1px solid var(--line)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: '11px' }}
           >
              <SyncIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 1 }} />
              SINCRONIZAR
           </button>
           <button 
            className="hud-btn" 
            onClick={() => setEnrollOpen(true)}
            style={{ padding: '8px 15px', background: 'var(--signal)', border: 'none', color: '#000', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: '11px', fontWeight: 'bold' }}
           >
              <AddIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 1 }} />
              ENROLAR AGENTE
           </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
           <span className="panel__title">AGENTES WAZUH REGISTRADOS</span>
           <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>TOTAL: {agents.length}</span>
        </div>
        <div className="panel__body" style={{ padding: '0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(60,255,158,0.05)', color: 'var(--signal)', textAlign: 'left' }}>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>ID_HEX</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>HOSTNAME</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>DIRECT_IP</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>OS_PLATFORM</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="tr-hover" style={{ borderBottom: '1px solid var(--line-faint)' }}>
                  <td style={{ padding: '12px 20px', fontFamily: 'var(--ff-mono)', opacity: 0.6 }}>0x{a.id}</td>
                  <td style={{ padding: '12px 20px', fontWeight: 800, color: 'var(--text-bright)' }}>{a.name.toUpperCase()}</td>
                  <td style={{ padding: '12px 20px', fontFamily: 'var(--ff-mono)' }}>{a.ip}</td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-dim)', fontSize: '11px' }}>{a.os}</td>
                  <td style={{ padding: '12px 20px' }}>
                     <span style={{ 
                        display: 'inline-block',
                        padding: '2px 8px',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        border: '1px solid',
                        borderColor: a.status === 'active' ? 'var(--signal)' : 'var(--text-dim)',
                        color: a.status === 'active' ? 'var(--signal)' : 'var(--text-dim)',
                        background: a.status === 'active' ? 'rgba(60,255,158,0.1)' : 'transparent'
                     }}>
                        {a.status.toUpperCase()}
                     </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Enroll (Simple HUD version) */}
      {enrollOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <div className="panel" style={{ width: '450px' }}>
              <div className="panel__head">
                 <span className="panel__title">ENROLAR NUEVO ACTIVO</span>
                 <button onClick={() => { setEnrollOpen(false); setResult(null); }} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>
              </div>
              <div className="panel__body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--signal)' }}>HOSTNAME_TARGET</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--signal)' }}>OS_FAMILY</label>
                    <select value={newOs} onChange={e => setNewOs(e.target.value)} style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)' }}>
                        <option value="linux">LINUX_X64</option>
                        <option value="windows">WINDOWS_X64</option>
                    </select>
                  </div>
                  <button onClick={onEnroll} disabled={loading} style={{ background: 'var(--signal)', color: '#000', border: 'none', padding: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
                     GENERAR CLAVE DE ALTA
                  </button>

                  {result && (
                    <div style={{ marginTop: '15px', padding: '15px', border: '1px solid', borderColor: result.ok ? 'var(--signal)' : 'var(--danger)', background: 'rgba(0,0,0,0.5)' }}>
                       {result.ok ? (
                         <>
                           <div style={{ color: 'var(--signal)', fontWeight: 'bold', fontSize: '11px' }}>✓ AGENTE REGISTRADO</div>
                           <div style={{ fontSize: '10px', marginTop: '10px', opacity: 0.7 }}>CERT_KEY:</div>
                           <div style={{ background: '#000', padding: '8px', fontSize: '10px', fontFamily: 'var(--ff-mono)', wordBreak: 'break-all', marginTop: '5px', border: '1px solid var(--line-faint)' }}>{result.key}</div>
                         </>
                       ) : (
                         <div style={{ color: 'var(--danger)' }}>ERROR: {result.error}</div>
                       )}
                    </div>
                  )}
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
