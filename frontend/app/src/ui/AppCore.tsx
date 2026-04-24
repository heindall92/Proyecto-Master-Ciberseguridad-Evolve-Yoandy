import { useEffect, useState } from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import "./HUD.css";
import { getAudioContext, playNotificationSound, playResolvedSound } from "./audio";

import {
  login,
  getCurrentUser,
  getDashboardSummary,
  getOpenTicketsCount,
  UserOut,
} from "../lib/api";

import AssetsView from "./AssetsView";
import UsersView from "./UsersView";
import DashboardSuperFinal from "./DashboardSuperFinal";
// import IncidentsView from "./IncidentsView";
import SiemView from "./SiemView";
import ThreatIntelView from "./ThreatIntelView";
import CowrieView from "./CowrieView";
import AnalystWorkspace from "./AnalystWorkspace";
import ThreatMapView from "./ThreatMapView";
import RunbooksView from "./RunbooksView";
import LSAMonitorView from "./LSAMonitorView";

const darkTheme = createTheme({ palette: { mode: "dark" } });

// --- Original SVG Symbols Definition ---
function SvgSymbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <symbol id="i-overview" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></symbol>
        <symbol id="i-siem" viewBox="0 0 24 24"><path d="M12 2 L3 7 L12 12 L21 7 Z"/><path d="M3 12 L12 17 L21 12"/><path d="M3 17 L12 22 L21 17"/></symbol>
        <symbol id="i-workspace" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 3v18"/><path d="M15 3v18"/></symbol>
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

const AlexanaLetter = ({ char, ...props }: any) => {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", ...props };
  const getLetter = () => {
    switch(char) {
      case 'V': return <><path d="M 4 4 L 12 20 L 16 12"/><circle cx="20" cy="4" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'A': return <><path d="M 12 2 L 20 20"/><path d="M 12 2 L 8 10"/><circle cx="4" cy="20" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'L': return <><path d="M 4 2 L 4 20"/><path d="M 12 20 L 20 20"/><circle cx="8" cy="20" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'H': return <><path d="M 4 2 L 4 22"/><path d="M 4 12 L 20 12 L 20 22"/><circle cx="20" cy="4" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'S': return <><path d="M 20 4 L 10 4 Q 4 4 4 10 Q 4 14 12 14 Q 20 14 20 18 Q 20 22 10 22 L 8 22"/><circle cx="4" cy="22" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'O': return <><path d="M 12 2 A 10 10 0 1 1 2 12"/><circle cx="5" cy="5" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'C': return <><path d="M 20 6 A 10 10 0 0 0 12 2 A 10 10 0 0 0 12 22 A 10 10 0 0 0 20 18"/><circle cx="20" cy="22" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'P': return <><path d="M 4 8 L 4 22"/><path d="M 8 2 L 14 2 A 6 6 0 0 1 14 14 L 4 14"/><circle cx="4" cy="2" r="1.5" stroke="none" fill="currentColor"/></>;
      case 'R': return <><path d="M 4 8 L 4 22"/><path d="M 8 2 L 14 2 A 6 6 0 0 1 14 14 L 4 14"/><path d="M 10 14 L 18 22"/><circle cx="4" cy="2" r="1.5" stroke="none" fill="currentColor"/></>;
      case ' ': return <div style={{ width: '15px' }} />;
      default: return <text x="4" y="18" fill="currentColor" stroke="none" fontSize="20" fontFamily="sans-serif">{char}</text>;
    }
  };
  if (char === ' ') return getLetter();
  return <svg {...common}>{getLetter()}</svg>;
};

const AlexanaWord = ({ word, color = "#fff", height = "40px" }: { word: string, color?: string, height?: string }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color }}>
      {word.split('').map((c, i) => (
         <AlexanaLetter key={i} char={c.toUpperCase()} style={{ height, width: height, dropShadow: '0 0 10px rgba(0,255,136,0.3)' }} />
      ))}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [scheme, setScheme] = useState("green");
  const [scanlines, setScanlines] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [notifSeen, setNotifSeen] = useState(false);
  const [isLocked, setIsLocked] = useState(true); // Start locked
  const [showWidgetCatalog, setShowWidgetCatalog] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const [prevTicketsOpen, setPrevTicketsOpen] = useState<number | null>(null);

  useEffect(() => {
    const ticketsNow = stats?.metrics?.tickets_open || 0;
    if (prevTicketsOpen !== null && ticketsNow > prevTicketsOpen && !notifSeen) {
      playNotificationSound();
    }
    if (prevTicketsOpen !== null && ticketsNow > 0 && prevTicketsOpen === 0 && !notifSeen) {
      playNotificationSound();
    }
    setPrevTicketsOpen(ticketsNow);
  }, [stats?.metrics?.tickets_open, notifSeen]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      const res = await login(fd.get("u") as string, fd.get("p") as string);
      localStorage.setItem("token", res.access_token);
      setToken(res.access_token);
    } catch (err: any) {
      if (err.message && (err.message.includes('fetch') || err.message.includes('Network'))) {
        setIsOffline(true);
        alert("ALERTA: Servidor SOC no alcanzable. Entrando al MODO OFFLINE.");
        setToken("offline-mode-token");
        setUser({ id: 1, username: "admin_offline", email: "admin@valhalla", full_name: "Admin Offline", is_active: true, is_superuser: true });
        setLoading(false);
      } else {
        alert("ERROR: Credenciales inválidas.");
      }
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    let isMounted = true;
    
    // First check: if no token, show login immediately
    if (!token) {
      setLoading(false);
      return;
    }
    
    // Token exists - validate it
    if (token === "offline-mode-token") {
        setIsOffline(true);
        setUser({ id: 1, username: "admin_offline", email: "admin@valhalla", full_name: "Admin Offline", is_active: true, is_superuser: true });
        setLoading(false);
        return;
    }
    getCurrentUser()
      .then(u => {
         if (isMounted) {
           setUser(u);
           setLoading(false);
         }
      })
      .catch((err: any) => {
         if (err.message && (err.message.includes('fetch') || err.message.includes('Network'))) {
           setIsOffline(true);
           setLoading(false);
           return;
         }
         console.error("Token invalid, showing login:", err);
         if (isMounted) {
           localStorage.removeItem("token");
           setToken(null);
           setUser(null);
           setLoading(false);
         }
      });
    return () => { isMounted = false; };
  }, [token]);

  useEffect(() => {
    document.body.setAttribute("data-scheme", scheme);
    document.body.setAttribute("data-scan", scanlines ? "on" : "off");
  }, [scheme, scanlines]);

  useEffect(() => {
    if (user) {
      // Usar endpoint optimizado para evitar dependencia de Wazuh
      getOpenTicketsCount()
        .then((r) => { setStats({metrics: {tickets_open: r.open}}); })
        .catch((e) => { console.error('[Dashboard] Error:', e); setStats({metrics: {tickets_open: 0}}); });
      const iv = setInterval(() => {
        getOpenTicketsCount()
          .then((r) => { setStats({metrics: {tickets_open: r.open}}); })
          .catch((e) => { console.error('[Dashboard] Error:', e); setStats({metrics: {tickets_open: 0}}); });
      }, 15000);
      return () => clearInterval(iv);
    }
  }, [user]);

  console.log("App render state:", { loading, hasUser: !!user, token });

  if (loading) {
    return <div style={{ color: 'var(--signal)', padding: '20px' }}>CARGANDO...</div>;
  }

  if (!user) {
    return (
      <div className={`theme-${scheme} ${scanlines ? 'scanlines' : ''}`} data-scheme={scheme} data-scan={scanlines ? 'on' : 'off'} style={{ 
          height: '100vh', 
          background: 'url("./bg-login.png") center/cover no-repeat, var(--bg-void)'
      }}>
        <SvgSymbols />

        <div style={{ display: 'flex', height: '100%' }}>
          {/* Left Column - Branding */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
              <div style={{ 
                width: '64px', height: '64px', background: 'var(--signal)', borderRadius: '12px',
                display: 'grid', placeItems: 'center', boxShadow: '0 0 20px var(--signal-glow)'
              }}>
                 <AlexanaLetter char="V" style={{ width: '40px', height: '40px', color: '#000' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                 <AlexanaWord word="VALHALLA" height="48px" />
                 <div style={{ display: 'flex', gap: '15px' }}>
                    <AlexanaWord word="SOC" height="24px" color="var(--signal)" />
                    <AlexanaWord word="PRO" height="24px" color="rgba(255,255,255,0.5)" />
                 </div>
              </div>
            </div>
            
            <p style={{ margin: '10px 0 0 5px', fontSize: '13px', color: 'var(--text-dim)', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
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
                    <img src="./icon.png" style={{ width: "46px", height: "46px", objectFit: "contain", filter: `drop-shadow(0 0 8px ${isOffline ? "var(--danger)" : "var(--signal)"}) grayscale(1) brightness(2)` }} alt="logo" />
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
        
        <header className="topbar" style={{ background: 'rgba(10, 25, 20, 0.95)', borderBottom: '1px solid var(--signal-dim)' }}>
          <div className="topbar__brand">
            <div className="topbar__logo" style={{ background: "transparent", border: "none" }}><img src="./icon.png" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 0 5px var(--signal))" }} alt="logo" /></div>
            <div>
               <div className="topbar__title">SOC <em>VALHALLA</em></div>
               <div className="topbar__sub">BLUE TEAM · WAZUH 4.9.5 · CLASSIFIED // EYES ONLY</div>
            </div>
          </div>

          <div className="status-chips">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', lineHeight: '1.2' }}>
                <span style={{ color: 'var(--text-faint)' }}>ESTADO</span>
                <span style={{ color: 'var(--signal)', fontWeight: 600 }}>OPERATIVO</span>
              </div>
              <div style={{ width: '1px', height: '20px', background: 'var(--line-faint)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', lineHeight: '1.2' }}>
                <span style={{ color: 'var(--text-faint)' }}>INCIDENTES</span>
                <span style={{ color: stats?.metrics?.tickets_open > 0 ? 'var(--danger)' : 'var(--signal)', fontWeight: 600 }}>{stats?.metrics?.tickets_open || 0}</span>
              </div>
              <div style={{ width: '1px', height: '20px', background: 'var(--line-faint)' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px', lineHeight: '1.2' }}>
                <span style={{ color: 'var(--text-faint)' }}>ALERTAS 24H</span>
                <span style={{ color: stats?.metrics?.total_alerts_24h > 0 ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 600 }}>{stats?.metrics?.total_alerts_24h || 0}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--signal)" strokeWidth="2" style={{ marginLeft: '8px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <button onClick={() => { setNotifMenuOpen(!notifMenuOpen); setNotifSeen(false); }} style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 8px', cursor: 'pointer', background: 'none', border: 'none', marginRight: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stats?.metrics?.tickets_open > 0 && !notifSeen ? "#FFD700" : "var(--signal)"} strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {stats?.metrics?.tickets_open > 0 && !notifSeen && <span style={{ position: 'absolute', top: '-2px', right: '2px', width: '6px', height: '6px', background: 'var(--danger)', borderRadius: '50%', animation: 'blink 1s infinite' }}></span>}
            </button>
            <div style={{ width: '1px', height: '32px', background: 'var(--signal-dim)', margin: '0 4px' }}></div>
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--signal)' }}>{user.username.toUpperCase()}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>ANALISTA</span>
              </div>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--signal), var(--signal-deep))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--signal-dim)' }}>
                <span style={{ fontSize: '14px' }}>👤</span>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </header>
{userMenuOpen && (
          <div style={{ position: 'fixed', top: 50, right: 10, zIndex: 2147483647 }} onClick={() => setUserMenuOpen(false)}>
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--signal)', width: '140px', zIndex: 2147483647, boxShadow: '0 4px 20px rgba(0,255,136,0.4)' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '4px 0' }}>
              <button onClick={() => window.location.reload()} style={{ width: '100%', padding: '6px 10px', cursor: 'pointer', background: 'none', border: 'none', display: 'block', textAlign: 'left', color: 'var(--amber)', fontSize: '11px' }}>🔄 SYNC</button>
              <button onClick={() => { setShowWidgetCatalog(true); setUserMenuOpen(false); }} style={{ width: '100%', padding: '6px 10px', cursor: 'pointer', background: 'none', border: 'none', display: 'block', textAlign: 'left', color: 'var(--text)', fontSize: '11px' }}>➕ ADD WIDGET</button>
              <button onClick={() => { setIsLocked(!isLocked); setUserMenuOpen(false); }} style={{ width: '100%', padding: '6px 10px', cursor: 'pointer', background: 'none', border: 'none', display: 'block', textAlign: 'left', color: 'var(--text)', fontSize: '11px' }}>{isLocked ? '🔓 UNLOCK' : '🔒 LOCK'}</button>
              <button onClick={() => setTweaksOpen(true)} style={{ width: '100%', padding: '6px 10px', cursor: 'pointer', background: 'none', border: 'none', display: 'block', textAlign: 'left', color: 'var(--text)', fontSize: '11px' }}>⚙️ TWEAKS</button>
              <div style={{ borderTop: '1px solid var(--line-faint)', margin: '2px 0' }}></div>
              <button onClick={logout} style={{ width: '100%', padding: '6px 10px', cursor: 'pointer', background: 'none', border: 'none', display: 'block', textAlign: 'left', color: 'var(--danger)', fontSize: '11px' }}>⏻ EXIT</button>
              </div>
            </div>
          </div>
        )}

        {notifMenuOpen && (
          <div style={{ position: 'fixed', top: 50, right: 60, zIndex: 2147483647 }} onClick={() => setNotifMenuOpen(false)}>
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--signal)', width: '280px', maxHeight: '300px', zIndex: 2147483647, boxShadow: '0 4px 20px rgba(0,255,136,0.4)', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line-faint)', fontSize: '11px', fontWeight: 600, color: 'var(--signal)' }}>NOTIFICACIONES</div>
              {stats?.metrics?.tickets_open > 0 ? (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ padding: '6px 10px', fontSize: '10px', color: 'var(--text-dim)' }}>{stats.metrics.tickets_open} ticket(s) abierto(s)</div>
                  <button onClick={() => { setView("workspace"); setNotifMenuOpen(false); setNotifSeen(true); }} style={{ width: '100%', padding: '8px 10px', cursor: 'pointer', background: 'none', border: 'none', display: 'block', textAlign: 'left', color: '#FFD700', fontSize: '11px' }}>{stats.metrics.tickets_open} incidente(s) abierto(s) — Ver en Workspace</button>
                  <button onClick={() => { setView("workspace"); setNotifMenuOpen(false); setNotifSeen(true); }} style={{ width: '100%', padding: '8px 10px', cursor: 'pointer', background: 'rgba(60,255,158,0.05)', border: 'none', display: 'block', textAlign: 'left', color: 'var(--signal)', fontSize: '10px', fontWeight: 600 }}>→ IR A WORKSPACE</button>
                </div>
              ) : (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px' }}>Sin notificaciones</div>
              )}
            </div>
          </div>
        )}

        <aside className="sidenav">
          <div className="sidenav__label">// MÓDULOS</div>
          <NavBtn id="overview" label="Overview" sub="panorama general" icon="i-overview" />
          <NavBtn id="siem" label="SIEM" sub="alertas wazuh" icon="i-siem" badge={stats?.metrics?.total_alerts_24h?.toLocaleString()} color="danger" />
          {/* <NavBtn id="incidents" label="Incidentes" sub="tickets abiertos" icon="i-incident" badge={stats?.metrics?.tickets_open} color="danger" /> */}
          <NavBtn id="assets" label="Activos" sub="endpoints · srv" icon="i-assets" badge={stats?.metrics?.unique_agents} />
          <NavBtn id="cowrie" label="Honeypots" sub="señuelos · cowrie" icon="i-threat" badge="Ssh/Tel" color="amber" />
          <NavBtn id="threat" label="Threat Intel" sub="misp · virustotal" icon="i-threat" badge="IOCs" />
          <NavBtn id="threatmap" label="Threat Map" sub="ataques geo" icon="i-map" />
          <NavBtn id="lsamonitor" label="LSA Monitor" sub="credential guard" icon="i-overview" />
          <NavBtn id="runbooks" label="Runbooks" sub="procedimientos" icon="i-playbook" />
          <NavBtn id="workspace" label="Workspace" sub="análisis · kanban" icon="i-workspace" />
          <NavBtn id="users" label="Usuarios" sub="gestion de personal" icon="i-overview" />
          
          <div className="sidenav__label" style={{ marginTop: 'auto' }}>// session</div>
          <div style={{ padding: '8px 14px', fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '1.2px', lineHeight: '1.6' }}>
            ROOT@VALHALLA:~#<br/>
            SID: 0x7A4F · L3<br/>
            OPERATOR: {user.username.toUpperCase()}
          </div>
        </aside>

        <main className="main" style={{ gridColumn: '2 / -1' }}>
          {view === 'overview' && <DashboardSuperFinal isLockedProp={isLocked} showWidgetCatalog={showWidgetCatalog} setShowWidgetCatalog={setShowWidgetCatalog} />}
          {view === 'assets' && <AssetsView />}
          {view === 'users' && <UsersView />}
          {/* {view === 'incidents' && <IncidentsView />} */}
          {view === 'siem' && <SiemView />}
          {view === 'threat' && <ThreatIntelView />}
          {view === 'cowrie' && <CowrieView />}
          {view === 'threatmap' && <ThreatMapView />}
          {view === 'runbooks' && <RunbooksView />}
          {view === 'lsamonitor' && <LSAMonitorView />}
          {view === 'workspace' && <AnalystWorkspace />}
          {!['overview', 'assets', 'users', 'incidents', 'siem', 'threat', 'cowrie', 'threatmap', 'lsamonitor', 'runbooks', 'workspace'].includes(view) && (
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
