import { useEffect, useState } from "react";
import {
  PersonAdd as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { listUsers, deleteUser, createUser, updateUser, UserOut } from "../lib/api";
import { translations } from "./translations";

export default function UsersView({ lang = "es" }: { lang?: "es" | "en" }) {
  const t = (key: keyof typeof translations.es) => (translations[lang] as any)[key] || key;
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  // Form state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("analyst");
  const [rank, setRank] = useState("L1 Analyst");
  const [password, setPassword] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const onDelete = async (id: number) => {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await deleteUser(id);
      fetchUsers();
    } catch (e) {
      alert(String(e));
    }
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setUsername("");
    setEmail("");
    setRole("analyst");
    setRank("L1 Analyst");
    setPassword("");
    setModalOpen(true);
  };

  const openEditModal = (user: UserOut) => {
    setEditingUserId(user.id);
    setUsername(user.username);
    setEmail(user.email || "");
    setRole(user.role);
    setRank(user.rank || "L1 Analyst");
    setPassword(""); // Keep empty so user only types if they want to change
    setModalOpen(true);
  };

  const onSave = async () => {
    if (!username) {
      alert(t('username_required'));
      return;
    }
    if (!editingUserId && !password) {
      alert(t('password_required'));
      return;
    }

    try {
      const payload: any = { username, role, rank, email };
      if (password) {
        payload.password = password;
      }

      if (editingUserId) {
        await updateUser(editingUserId, payload);
        alert(t('user_updated'));
      } else {
        await createUser(payload);
        alert(t('user_created'));
      }
      setModalOpen(false);
      fetchUsers();
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--ff-mono)', color: 'var(--signal)', fontSize: '18px', letterSpacing: '2px' }}>{t('access_control')}</h2>
        <button 
          className="action-btn"
          onClick={openCreateModal}
          style={{ padding: '8px 15px', display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: '11px', fontWeight: 'bold' }}
        >
          <AddIcon sx={{ fontSize: 14, mr: 1 }} />
          {t('add_user')}
        </button>
      </div>

      <div className="panel">
        <div className="panel__head">
           <span className="panel__title">{t('authorized_personnel')}</span>
           <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{t('role_system_active')}</span>
        </div>
        <div className="panel__body" style={{ padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(60,255,158,0.05)', color: 'var(--signal)', textAlign: 'left' }}>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>ID_UID</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>OPERADOR</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>EMAIL</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>RANGO_OPERATIVO</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>NIVEL_ACCESO</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>ALTA_REGISTRO</th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="tr-hover" style={{ borderBottom: '1px solid var(--line-faint)' }}>
                  <td style={{ padding: '12px 20px', fontFamily: 'var(--ff-mono)', opacity: 0.6 }}>{u.id.toString().padStart(4, '0')}</td>
                  <td style={{ padding: '12px 20px', fontWeight: 800, color: 'var(--text-bright)' }}>{u.username.toUpperCase()}</td>
                  <td style={{ padding: '12px 20px', opacity: 0.8 }}>{u.email?.toLowerCase() || 'N/A'}</td>
                  <td style={{ padding: '12px 20px', fontWeight: 'bold', color: 'var(--cyan)' }}>{u.rank?.toUpperCase() || 'L1 ANALYST'}</td>
                  <td style={{ padding: '12px 20px' }}>
                     <span style={{ 
                        padding: '2px 8px', 
                        fontSize: '9px', 
                        background: u.role === 'admin' ? 'rgba(255,58,58,0.1)' : 'rgba(60,255,158,0.1)', 
                        border: '1px solid',
                        borderColor: u.role === 'admin' ? 'var(--danger)' : 'var(--signal)',
                        color: u.role === 'admin' ? 'var(--danger)' : 'var(--signal)',
                        fontFamily: 'var(--ff-mono)'
                     }}>
                       {u.role.toUpperCase()}
                     </span>
                  </td>
                  <td style={{ padding: '12px 20px', opacity: 0.6, fontSize: '11px' }}>{new Date(u.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 20px' }}>
                     <button onClick={() => openEditModal(u)} style={{ background: 'none', border: '1px solid var(--signal)', color: 'var(--signal)', padding: '4px 8px', marginRight: '5px', cursor: 'pointer', borderRadius: 'var(--r-sm)' }}><EditIcon sx={{ fontSize: 14 }} /></button>
                     <button onClick={() => onDelete(u.id)} style={{ background: 'none', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '4px 8px', cursor: 'pointer', borderRadius: 'var(--r-sm)' }}><DeleteIcon sx={{ fontSize: 14 }} /></button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '20px', opacity: 0.5 }}>NO HAY DATOS</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
           <div className="panel" style={{ width: '450px' }}>
              <div className="panel__head">
                 <span className="panel__title">{editingUserId ? 'EDITAR OPERADOR' : 'NUEVO OPERADOR'}</span>
                 <button onClick={() => setModalOpen(false)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>X</button>
              </div>
              <div className="panel__body">
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                       <label style={{ fontSize: '10px', color: 'var(--signal)' }}>OPERADOR_ID</label>
                       <input 
                        type="text" 
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)', outline: 'none' }} 
                        placeholder="Ej: admin_neo"
                       />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                       <label style={{ fontSize: '10px', color: 'var(--signal)' }}>COM_LINK (EMAIL)</label>
                       <input 
                        type="email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)', outline: 'none' }} 
                        placeholder="neo@valhalla.soc"
                       />
                    </div>

                     <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                       <label style={{ fontSize: '10px', color: 'var(--signal)' }}>RANGO_OPERATIVO (RANK)</label>
                       <select 
                        value={rank} 
                        onChange={e => setRank(e.target.value)} 
                        style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)', outline: 'none' }}
                       >
                         <option value="L1 Analyst">L1 ANALYST</option>
                         <option value="L2 Responder">L2 RESPONDER</option>
                         <option value="L3 Blue Team">L3 BLUE TEAM</option>
                         <option value="SOC Manager">SOC MANAGER</option>
                       </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                       <label style={{ fontSize: '10px', color: 'var(--signal)' }}>NIVEL_ACCESO (ROL)</label>
                       <select 
                        value={role} 
                        onChange={e => setRole(e.target.value)} 
                        style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)', outline: 'none' }}
                       >
                         <option value="analyst">ANALISTA</option>
                         <option value="admin">ADMINISTRADOR</option>
                         <option value="viewer">VISOR (SOLO LECTURA)</option>
                       </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                       <label style={{ fontSize: '10px', color: 'var(--signal)' }}>{editingUserId ? 'ACTUALIZAR LLAVE_ACCESO (OPCIONAL)' : 'LLAVE_ACCESO (PASSWORD)'}</label>
                       <input 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        style={{ background: '#000', border: '1px solid var(--line)', color: 'var(--signal)', padding: '10px', fontFamily: 'var(--ff-mono)', outline: 'none' }} 
                        placeholder={editingUserId ? "Dejar en blanco para mantener" : "********"}
                       />
                    </div>

                    <button onClick={onSave} className="action-btn" style={{ padding: '12px', marginTop: '10px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold' }}>
                       {editingUserId ? 'GUARDAR CAMBIOS' : 'REGISTRAR OPERADOR'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
