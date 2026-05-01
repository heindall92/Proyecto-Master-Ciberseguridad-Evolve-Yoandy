import { useState } from "react";
import { UserOut, updateUser, uploadMyAvatar } from "../lib/api";
import { translations } from "./translations";

export default function ProfileView({ 
  user, 
  lang = "es", 
  onUpdate, 
  profilePic, 
  setProfilePic 
}: { 
  user: UserOut, 
  lang?: "es" | "en", 
  onUpdate: (u: UserOut) => void,
  profilePic: string | null,
  setProfilePic: (pic: string | null) => void
}) {
  const t = (key: keyof typeof translations.es) => (translations[lang] as any)[key] || key;
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Security Notifications state
  const [notifs, setNotifs] = useState({
    critical: true,
    login: true,
    reports: false
  });

  const passwordsMatch = password && password === confirmPassword;
  const passwordError = password && confirmPassword && password !== confirmPassword;

  const handleSave = async () => {
    if (password && !passwordsMatch) return;
    setLoading(true);
    try {
      const payload: any = { email };
      if (password) payload.password = password;
      const updated = await updateUser(user.id, payload);
      onUpdate(updated);
      alert(lang === 'es' ? "Perfil actualizado correctamente" : "Profile updated successfully");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert(lang === 'es' ? "La imagen es demasiado grande (Máx 2MB)" : "Image is too large (Max 2MB)");
        return;
      }
      setLoading(true);
      try {
        const res = await uploadMyAvatar(file);
        setProfilePic(res.avatar_url);
        // Also update local user object to sync with HUD
        onUpdate({ ...user, avatar_url: res.avatar_url });
      } catch (err) {
        alert(lang === 'es' ? "Error al subir avatar" : "Error uploading avatar");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoveAvatar = async () => {
      setLoading(true);
      try {
          await updateUser(user.id, { avatar_url: "" });
          setProfilePic(null);
          onUpdate({ ...user, avatar_url: null });
      } catch (err) {
          alert(String(err));
      } finally {
          setLoading(false);
      }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      
      {/* Left Column: Main Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ fontFamily: 'var(--ff-mono)', color: 'var(--signal)', fontSize: '18px', letterSpacing: '2px', margin: 0 }}>
          // {t('profile_settings')}
        </h2>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{lang === 'es' ? 'GESTIÓN DE IDENTIDAD' : 'IDENTITY MANAGEMENT'}</span>
          </div>
          <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            {/* Header with Circular Profile Pic */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ 
                  width: '100px', height: '100px', borderRadius: '50%', 
                  background: 'linear-gradient(135deg, var(--signal), var(--signal-deep))', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  border: '2px solid var(--signal-dim)', overflow: 'hidden',
                  boxShadow: '0 0 25px rgba(0,255,136,0.3)',
                  transition: 'all 0.3s ease'
                }}>
                  {profilePic ? (
                    <img src={`${profilePic}${profilePic.includes('?') ? '&' : '?'}t=${Date.now()}`} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '50px' }}>👤</span>
                  )}
                </div>
                <label style={{ 
                  position: 'absolute', bottom: '0px', right: '0px', 
                  width: '32px', height: '32px', borderRadius: '50%', 
                  background: 'var(--bg-panel-deep)', border: '1px solid var(--signal)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  cursor: 'pointer', fontSize: '14px',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                }}>
                  📷
                  <input type="file" hidden accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-bright)', fontFamily: 'var(--ff-mono)' }}>{user.username.toUpperCase()}</div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                  <span style={{ padding: '2px 8px', background: 'rgba(60,255,158,0.1)', color: 'var(--signal)', fontSize: '10px', border: '1px solid var(--signal-dim)', fontFamily: 'var(--ff-mono)' }}>
                    {user.rank?.toUpperCase() || 'L1 ANALYST'}
                  </span>
                  <span style={{ padding: '2px 8px', background: 'rgba(0,255,255,0.1)', color: 'var(--cyan)', fontSize: '10px', border: '1px solid rgba(0,255,255,0.3)', fontFamily: 'var(--ff-mono)' }}>
                    ID: {user.id.toString().padStart(5, '0')}
                  </span>
                </div>
                <button onClick={handleRemoveAvatar} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '9px', cursor: 'pointer', marginTop: '10px', textDecoration: 'underline', padding: 0 }}>
                   {lang === 'es' ? 'ELIMINAR AVATAR' : 'REMOVE AVATAR'}
                </button>
              </div>
            </div>

            {/* Basic Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '10px', color: 'var(--signal)', letterSpacing: '1px' }}>COM_LINK (EMAIL)</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: 'var(--signal)', padding: '12px', fontFamily: 'var(--ff-mono)', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '1px' }}>{lang === 'es' ? 'NIVEL DE ACCESO (BLOQUEADO)' : 'ACCESS LEVEL (LOCKED)'}</label>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-dim)', border: '1px solid var(--line-faint)', fontSize: '13px' }}>
                  {user.role.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Password Section */}
            <div style={{ borderTop: '1px solid var(--line-faint)', paddingTop: '20px' }}>
              <h3 style={{ fontSize: '11px', color: 'var(--amber)', margin: '0 0 15px 0', letterSpacing: '2px' }}>{lang === 'es' ? 'SEGURIDAD: CAMBIAR LLAVE' : 'SECURITY: CHANGE KEY'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-bright)' }}>{lang === 'es' ? 'NUEVA CONTRASEÑA' : 'NEW PASSWORD'}</label>
                  <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    style={{ 
                      background: 'rgba(0,0,0,0.4)', 
                      border: `1px solid ${password ? (passwordsMatch ? 'var(--signal)' : 'var(--danger)') : 'var(--line)'}`, 
                      color: 'var(--text)', padding: '12px', outline: 'none' 
                    }}
                    placeholder="********"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-bright)' }}>{lang === 'es' ? 'CONFIRMAR CONTRASEÑA' : 'CONFIRM PASSWORD'}</label>
                  <input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    style={{ 
                      background: 'rgba(0,0,0,0.4)', 
                      border: `1px solid ${confirmPassword ? (passwordsMatch ? 'var(--signal)' : 'var(--danger)') : 'var(--line)'}`, 
                      color: 'var(--text)', padding: '12px', outline: 'none' 
                    }}
                    placeholder="********"
                  />
                </div>
              </div>
              {passwordError && <div style={{ color: 'var(--danger)', fontSize: '10px', marginTop: '5px' }}>{lang === 'es' ? 'Las llaves no coinciden' : 'Keys do not match'}</div>}
              {passwordsMatch && <div style={{ color: 'var(--signal)', fontSize: '10px', marginTop: '5px' }}>✓ {lang === 'es' ? 'Llaves sincronizadas' : 'Keys synchronized'}</div>}
            </div>

            <button 
              onClick={handleSave} 
              disabled={loading || (password && !passwordsMatch)}
              className="action-btn" 
              style={{ padding: '14px', marginTop: '10px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}
            >
              {loading ? 'SYNCING...' : (lang === 'es' ? 'ACTUALIZAR PERFIL OPERATIVO' : 'UPDATE OPERATIONAL PROFILE')}
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Activity & Sessions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Active Session Info */}
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">{lang === 'es' ? 'SESIÓN ACTUAL' : 'CURRENT SESSION'}</span>
          </div>
          <div className="panel__body" style={{ fontSize: '11px', lineHeight: '1.6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>IP_SOURCE:</span>
              <span style={{ color: 'var(--cyan)' }}>192.168.1.52</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>OS_AGENT:</span>
              <span style={{ color: 'var(--text-bright)' }}>Windows 11 / Chrome 124</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>LOC_GEO:</span>
              <span style={{ color: 'var(--text-bright)' }}>Madrid, ES</span>
            </div>
            <button style={{ width: '100%', marginTop: '15px', padding: '8px', background: 'rgba(255,77,77,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: '10px', cursor: 'pointer' }}>
               {lang === 'es' ? 'CERRAR OTRAS SESIONES' : 'TERMINATE OTHER SESSIONS'}
            </button>
          </div>
        </div>

        {/* Activity Log */}
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel__head">
            <span className="panel__title">{lang === 'es' ? 'LOG DE ACTIVIDAD' : 'ACTIVITY LOG'}</span>
          </div>
          <div className="panel__body" style={{ padding: '0' }}>
             {[
               { time: '10:45', action: 'LOGIN_SUCCESS', ip: '192.168.1.52' },
               { time: 'Yesterday', action: 'PASSWORD_CHANGED', ip: '192.168.1.52' },
               { time: 'Yesterday', action: 'INCIDENT_ESCALATED', id: '#241' },
               { time: '2 days ago', action: 'API_KEY_REVOKED', ip: '192.168.1.52' },
               { time: '2 days ago', action: 'LOGIN_SUCCESS', ip: '192.168.1.52' },
             ].map((log, i) => (
               <div key={i} style={{ padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '10px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                   <span style={{ color: 'var(--signal)', fontWeight: 'bold' }}>{log.action}</span>
                   <span style={{ color: 'var(--text-faint)' }}>{log.time}</span>
                 </div>
                 <div style={{ color: 'var(--text-dim)', fontSize: '9px' }}>{log.ip || log.id}</div>
               </div>
             ))}
          </div>
        </div>

        {/* Security Notifications */}
        <div className="panel">
           <div className="panel__head">
              <span className="panel__title">{lang === 'es' ? 'NOTIFICACIONES DE SEGURIDAD' : 'SECURITY ALERTS'}</span>
           </div>
           <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '11px' }}>
                 <input type="checkbox" checked={notifs.critical} onChange={() => setNotifs({...notifs, critical: !notifs.critical})} />
                 {lang === 'es' ? 'Alertas Críticas (Email)' : 'Critical Alerts (Email)'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '11px' }}>
                 <input type="checkbox" checked={notifs.login} onChange={() => setNotifs({...notifs, login: !notifs.login})} />
                 {lang === 'es' ? 'Nuevo inicio de sesión' : 'New login attempt'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '11px' }}>
                 <input type="checkbox" checked={notifs.reports} onChange={() => setNotifs({...notifs, reports: !notifs.reports})} />
                 {lang === 'es' ? 'Reportes semanales' : 'Weekly summaries'}
              </label>
           </div>
        </div>
      </div>
    </div>
  );
}
