import { useEffect, useState } from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import "./HUD.css";

import {
  login,
  getCurrentUser,
  getDashboardSummary,
  UserOut,
} from "../lib/api";

import AssetsView from "./AssetsView";
import UsersView from "./UsersView";
import DashboardView from "./DashboardView";

const darkTheme = createTheme({ palette: { mode: "dark" } });

// --- Original SVG Symbols Definition ---
function SvgSymbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <symbol id="i-overview" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></symbol>
        <symbol id="i-siem" viewBox="0 0 24 24"><path d="M12 2 L3 7 L12 12 L21 7 Z"/><path d="M3 12 L12 17 L21 12"/><path d="M3 17 L12 22 L21 17"/></symbol>
        <symbol id="i-map" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12 H21 M12 3 A15 15 0 0 1 12 21 M12 3 A15 15 0 0 0 12 21"/></symbol>
        <symbol id="i-incident" viewBox="0 0 24 24"><path d="M12 2 L22 20 H2 Z"/><path d="M12 9 V14 M12 17 V17.5"/></symbol>
        <symbol id="i-assets" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20 H16 M12 16 V20"/></symbol>
        <symbol id="i-vuln" viewBox="0 0 24 24"><path d="M12 3 L21 8 V16 L12 21 L3 16 V8 Z"/><path d="M12 8 V13 M12 15.5 V16"/></symbol>
        <symbol id="i-threat" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/><path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21"/></symbol>
        <symbol id="i-playbook" viewBox="0 0 24 24"><path d="M4 4 H20 V20 H4 Z"/><path d="M8 9 H16 M8 13 H16 M8 17 H12"/></symbol>
        <symbol id="i-net" viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6 H17 M6 8 L11 16 M18 8 L13 16"/></symbol>
        <symbol id="i-metrics" viewBox="0 0 24 24"><path d="M3 20 L3 4 M3 20 L21 20"/><rect x="6" y="12" width="3" height="6"/><rect x="11" y="8" width="3" height="10"/><rect x="16" y="5" width="3" height="13"/></symbol>
      </defs>
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [scheme, setScheme] = useState("green");
  const [scanlines, setScanlines] = useState(true);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      const res = await login(fd.get("u") as string, fd.get("p") as string);
      localStorage.setItem("token", res.access_token);
      setToken(res.access_token);
    } catch (err) {
      alert("ERROR: Credenciales inválidas.");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    console.log("useEffect triggered. token:", token);
    let isMounted = true;
    if (token) {
      getCurrentUser()
        .then(u => {
           if (isMounted) setUser(u);
        })
        .catch((err) => {
           console.error("getCurrentUser error:", err);
           if (isMounted) logout();
        })
        .finally(() => {
           if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, [token]);

  useEffect(() => {
    document.body.setAttribute("data-scheme", scheme);
    document.body.setAttribute("data-scan", scanlines ? "on" : "off");
  }, [scheme, scanlines]);

  console.log("App render state:", { loading, hasUser: !!user, token });

  if (loading) {
    return <div style={{ color: 'var(--signal)', padding: '20px' }}>CARGANDO...</div>;
  }

  if (!user) {
    return (
      <div className={`theme-${scheme} ${scanlines ? 'scanlines' : ''}`} data-scheme={scheme} data-scan={scanlines ? 'on' : 'off'} style={{ 
          height: '100vh', 
          background: 'url("/bg-login.png") center/cover no-repeat, var(--bg-void)'
      }}>
        <SvgSymbols />

        <div style={{ display: 'flex', height: '100%' }}>
          {/* Left Column - Branding */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
              <div style={{ 
                width: '54px', height: '54px', background: 'var(--signal)', borderRadius: '12px',
                display: 'grid', placeItems: 'center', boxShadow: '0 0 15px var(--signal-glow)'
              }}>
                 <span style={{ fontFamily: 'var(--sans)', fontWeight: 800, fontSize: '28px', color: '#000' }}>V</span>
              </div>
              <h1 style={{ margin: 0, fontSize: '42px', fontFamily: 'var(--sans)', fontWeight: 800, color: '#fff', letterSpacing: '1px' }}>
                Valhalla SOC Pro
              </h1>
            </div>
            
            <p style={{ margin: '0 0 0 4px', fontSize: '13px', color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Plataforma de Monitorización y<br/>Respuesta Táctica con IA
            </p>
          </div>

          {/* Right Column - Login Panel */}
          <div style={{ width: '450px', display: 'flex', alignItems: 'center', marginRight: '200px' }}>
            <div className="cyber-panel-wrap">
              <div className="cyber-panel">
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
                 <div style={{ 
                   width: '72px', height: '72px', borderRadius: '18px', 
                   border: '1px solid rgba(60,255,158,0.4)', 
                   display: 'grid', placeItems: 'center', 
                   background: 'linear-gradient(145deg, rgba(60,255,158,0.15), rgba(0,0,0,0.4))', 
                   boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 0 12px rgba(60,255,158,0.1)' 
                 }}>
                    <span style={{ 
                      color: 'var(--signal)', fontFamily: 'system-ui, sans-serif', fontWeight: '400', 
                      fontSize: '46px', textShadow: '0 0 12px var(--signal-glow), 0 0 24px var(--signal)',
                      lineHeight: 1
                    }}>ᛉ</span>
                 </div>
                 <h2 style={{ margin: 0, fontSize: '22px', fontFamily: 'var(--sans)', fontWeight: 500, color: '#fff', letterSpacing: '0.5px' }}>
                    Welcome Back, Operador
                 </h2>
              </div>

              <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--sans)' }}>Usuario / ID</label>
                   <input name="u" placeholder="admin" style={{ 
                     background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', 
                     padding: '14px 16px', borderRadius: '12px', fontFamily: 'var(--sans)', fontSize: '14px',
                     outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                   }} onFocus={e => { e.target.style.borderColor = 'var(--signal)'; e.target.style.background = 'rgba(0,0,0,0.5)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.15)'; e.target.style.background = 'rgba(0,0,0,0.3)'; }} autoFocus />
                 </div>

                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--sans)' }}>Contraseña</label>
                   <input name="p" type="password" placeholder="••••••••" style={{ 
                     background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', 
                     padding: '14px 16px', borderRadius: '12px', fontFamily: 'var(--sans)', fontSize: '14px',
                     outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                   }} onFocus={e => { e.target.style.borderColor = 'var(--signal)'; e.target.style.background = 'rgba(0,0,0,0.5)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.15)'; e.target.style.background = 'rgba(0,0,0,0.3)'; }} />
                 </div>

                 <div style={{ textAlign: 'right', marginTop: '-8px' }}>
                   <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>¿Olvidó su contraseña?</span>
                 </div>

                 <button type="submit" className="login-btn">
                    INICIAR SESIÓN
                 </button>

                 <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--sans)' }}>
                    Credenciales por defecto: <span style={{ color: 'var(--signal)', fontWeight: 'bold' }}>admin</span> / <span style={{ color: 'var(--signal)', fontWeight: 'bold' }}>Valhalla2026!</span>
                 </div>
              </form>
            </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const NavBtn = ({ id, label, sub, icon, badge, color }: any) => (
    <button className={`navbtn ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
      <span className="navbtn__icon-wrap">
        <svg className="navbtn__icon"><use href={`#${icon}`}/></svg>
      </span>
      <span className="navbtn__main">{label}</span>
      <span className="navbtn__sub">{sub}</span>
      {badge && <span className={`navbtn__badge ${color || ''}`}>{badge}</span>}
    </button>
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <SvgSymbols />
      <div className="app">
        
        <header className="topbar">
          <div className="topbar__brand">
            <div className="topbar__logo"><span>V</span></div>
            <div>
               <div className="topbar__title">SOC <em>VALHALLA</em></div>
               <div className="topbar__sub">BLUE TEAM · WAZUH 4.8.1 · CLASSIFIED // EYES ONLY</div>
            </div>
          </div>

          <div className="status-chips">
             <div className="chip"><span className="dot"></span><span>ESTADO</span><b>OPERATIVO</b></div>
             <div className="chip danger"><span className="dot"></span><span>INCIDENTES</span><b>07</b></div>
             <div className="chip amber"><span className="dot"></span><span>ALERTAS 24H</span><b>2,481</b></div>
             <div className="chip"><span>ANALISTA</span><b>{user.username.toUpperCase()}</b></div>
             <button onClick={() => setTweaksOpen(true)} className="navbtn__badge" style={{ position: 'relative', border: '1px solid var(--line)', padding: '4px 8px', cursor: 'pointer', background: 'none' }}>TWEAKS</button>
             <button onClick={logout} className="navbtn__badge" style={{ position: 'relative', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '4px 8px', cursor: 'pointer', background: 'none' }}>EXIT</button>
          </div>
        </header>

        <aside className="sidenav">
          <div className="sidenav__label">// MÓDULOS</div>
          <NavBtn id="overview" label="Overview" sub="panorama general" icon="i-overview" />
          <NavBtn id="siem" label="SIEM" sub="alertas wazuh" icon="i-siem" badge="2,481" color="danger" />
          <NavBtn id="map" label="Threat Map" sub="ataques geoloc." icon="i-map" badge="LIVE" color="amber" />
          <NavBtn id="incidents" label="Incidentes" sub="tickets abiertos" icon="i-incident" badge="07" color="danger" />
          <NavBtn id="assets" label="Activos" sub="endpoints · srv" icon="i-assets" badge="348" />
          <NavBtn id="vulns" label="Vulns" sub="cve · parches" icon="i-vuln" badge="41" color="amber" />
          <NavBtn id="threat" label="Threat Intel" sub="misp · otx feed" icon="i-threat" badge="IOCs" />
          <NavBtn id="network" label="Network" sub="tráfico · flujos" icon="i-net" badge="847mb/s" />
          <NavBtn id="playbooks" label="Playbooks" sub="runbooks · SOAR" icon="i-playbook" />
          <NavBtn id="metrics" label="Métricas" sub="kpis equipo" icon="i-metrics" />
          <NavBtn id="users" label="Usuarios" sub="gestion de personal" icon="i-overview" />
          
          <div className="sidenav__label" style={{ marginTop: 'auto' }}>// session</div>
          <div style={{ padding: '8px 14px', fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '1.2px', lineHeight: '1.6' }}>
            ROOT@VALHALLA:~#<br/>
            SID: 0x7A4F · L3<br/>
            OPERATOR: {user.username.toUpperCase()}
          </div>
        </aside>

        <main className="main" style={{ gridColumn: '2 / -1' }}>
          {view === 'overview' && <DashboardView />}
          {view === 'assets' && <AssetsView />}
          {view === 'users' && <UsersView />}
          {!['overview', 'assets', 'users'].includes(view) && (
            <div className="panel" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div style={{ color: 'var(--signal)', letterSpacing: '2px' }}>CONSTRUCCIÓN EN PROCESO // MODULE: {view.toUpperCase()}</div>
            </div>
          )}
        </main>

        {/* Tweaks Panel */}
        <div className={`tweaks ${tweaksOpen ? 'open' : ''}`} style={{ 
          position: 'fixed', bottom: '40px', right: '40px', width: '270px', 
          background: 'var(--bg-panel-deep)', border: '1px solid var(--signal)', padding: '20px',
          display: tweaksOpen ? 'block' : 'none', zIndex: 1000, borderRadius: '12px'
        }}>
           <h4 style={{ color: 'var(--signal)', margin: '0 0 15px 0' }}>// AJUSTES</h4>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-dim)' }}>ESQUEMA CROMÁTICO</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                 {['green', 'cyan', 'amber', 'purple'].map(s => (
                   <button key={s} onClick={() => setScheme(s)} style={{ padding: '6px', background: scheme === s ? 'var(--signal)' : 'none', color: scheme === s ? '#000' : 'var(--text)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: '10px' }}>{s.toUpperCase()}</button>
                 ))}
              </div>
              <button onClick={() => setScanlines(!scanlines)} style={{ padding: '8px', background: 'none', border: '1px solid var(--line)', color: 'var(--text)', cursor: 'pointer', fontSize: '10px' }}>SCANLINES: {scanlines ? 'ON' : 'OFF'}</button>
              <button onClick={() => setTweaksOpen(false)} style={{ color: 'var(--danger)', padding: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>CERRAR</button>
           </div>
        </div>

      </div>
    </ThemeProvider>
  );
}
