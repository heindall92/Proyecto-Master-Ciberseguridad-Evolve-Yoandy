import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, KeyRound, Pencil, Plus, Save, Search, ShieldCheck, Trash2, UserCog, Users, Wifi, X, Info, Eye } from "lucide-react";
import { listUsers, createUser, updateUser, deleteUser, resetPassword, fetchAuth, type UserOut } from "../lib/api";
import { useAppSelector } from "../store/hooks";
import { HoldButton, KpiCard, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/** Usuarios: equipo del SOC, roles, presencia en línea y gestión de accesos (solo admin). */

const ROLES: Record<string, [string, string]> = {
  admin: ["Administrador", "Gestiona usuarios, sistema y configuración"],
  analista: ["Analista", "Investiga, gestiona incidentes y genera informes"],
  reporter: ["Reportero", "Crea incidentes y ve los suyos"],
  viewer: ["Lector", "Solo ve los incidentes asignados o creados por él"],
};
const roleKey = (r: string) => (r === "analyst" ? "analista" : r);
const initials = (n: string) => n.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
type Presence = Array<{ id: number; username: string; role: string; sessions: number }>;
type Form = { id?: number; username: string; email: string; role: string; security_rank: string; password: string };

export default function UsersView({ lang = "es" }: { lang?: string }) {
  void lang;
  const me = useAppSelector(s => s.auth.user);
  const [users, setUsers] = useState<UserOut[] | null>(null);
  const [online, setOnline] = useState<Presence>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listUsers().then(setUsers).catch(() => setUsers([]));
  const loadPresence = () => fetchAuth<Presence>("/api/presence").then(setOnline).catch(() => {});
  useEffect(() => { load(); loadPresence(); const iv = setInterval(loadPresence, 15000); return () => clearInterval(iv); }, []);

  const isOnline = (id: number) => online.find(o => o.id === id);
  const rows = useMemo(() => (users ?? []).filter(u => (role === "all" || roleKey(u.role) === role) && (!q || `${u.username} ${u.email ?? ""} ${u.security_rank}`.toLowerCase().includes(q.toLowerCase()))), [users, q, role]);
  const count = (r: string) => (users ?? []).filter(u => roleKey(u.role) === r).length;

  const save = async () => {
    if (!form) return;
    setErr(null); setBusy(true);
    try {
      if (form.id) {
        await updateUser(form.id, { username: form.username, email: form.email || undefined, role: form.role, security_rank: form.security_rank });
        if (form.password) await resetPassword(form.id, form.password);
        toast("Usuario actualizado.", "ok");
      } else {
        await createUser({ username: form.username, email: form.email || null, role: form.role, security_rank: form.security_rank, password: form.password });
        toast(`Usuario ${form.username} creado.`, "ok");
      }
      setForm(null); load();
    } catch (e) { setErr(e instanceof Error ? e.message.replace(/^HTTP \d+:\s*/, "").replace(/^\{"detail":"?|"?\}$/g, "") : String(e)); }
    finally { setBusy(false); }
  };
  const remove = async (u: UserOut) => {
    try { await deleteUser(u.id); toast(`Usuario ${u.username} eliminado.`, "ok"); setForm(null); load(); }
    catch (e) { toast(e instanceof Error ? e.message.replace(/^HTTP \d+:\s*/, "") : String(e), "err"); }
  };

  return (
    <div className="view in us">
      <div className="wk-head">
        <div><h1>Usuarios</h1><p>Equipo del SOC, roles y accesos</p></div>
        <div className="in-bar">
          <label className="wk-search"><Search size={15} /><input className="vp-bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Usuario, email o rango…" />
            {q && <button className="wk-search__clear" onClick={() => setQ("")} aria-label="Borrar"><X size={13} /></button>}</label>
          <button type="button" className="vp-btn vp-btn--primary" onClick={() => { setErr(null); setForm({ username: "", email: "", role: "analista", security_rank: "L1 Analyst", password: "" }); }}><Plus size={14} />Nuevo usuario</button>
        </div>
      </div>
      <div className="in-body">
        <div className="in-vulns">
          <div className="in-kpis">
            <KpiCard icon={Users} label="Usuarios" value={users?.length ?? 0} sub="Con acceso a Valhalla" tone="info" />
            <KpiCard icon={Wifi} label="Conectados ahora" value={online.length} sub={online.map(o => o.username).join(", ") || "—"} tone="ok" />
            <KpiCard icon={ShieldCheck} label="Administradores" value={count("admin")} sub="Mínimo 1 siempre" tone="danger" />
            <KpiCard icon={UserCog} label="Analistas" value={count("analista")} sub={`${count("viewer")} lectores · ${count("reporter")} reporteros`} tone="accent" />
          </div>
          <div className="wk-chipset rb-cats">
            <button type="button" aria-pressed={role === "all"} onClick={() => setRole("all")}>Todos <small>{users?.length ?? 0}</small></button>
            {Object.entries(ROLES).map(([k, [l]]) => <button key={k} type="button" aria-pressed={role === k} onClick={() => setRole(k)}>{l} <small>{count(k)}</small></button>)}
          </div>
          <div className="in-list" role="table">
            <div className="in-row us-row in-row--head" role="row"><span /><span>Usuario</span><span>Rol</span><span>Rango</span><span>Alta</span><span>Estado</span></div>
            {!users && <p className="in-empty">Cargando…</p>}
            {users && !rows.length && <p className="in-empty">Ningún usuario con este filtro.</p>}
            {rows.map(u => {
              const on = isOnline(u.id); const sys = u.username.toLowerCase() === "valhalla-ia";
              return (
                <div key={u.id} role="row" className="in-row us-row" tabIndex={0} onClick={() => { setErr(null); setForm({ id: u.id, username: u.username, email: u.email ?? "", role: roleKey(u.role), security_rank: u.security_rank ?? "", password: "" }); }} onKeyDown={e => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}>
                  <span className="us-av">{sys ? <Bot size={15} /> : u.avatar_url ? <img src={u.avatar_url} alt="" /> : initials(u.username)}{on && <i />}</span>
                  <span className="in-prod"><b>{u.username}{u.id === me?.id ? " (tú)" : ""}</b><small>{sys ? "Usuario de sistema · asistente IA del chat" : u.email || "sin email"}</small></span>
                  <span><span className={`us-role us-role--${roleKey(u.role)}`}>{ROLES[roleKey(u.role)]?.[0] ?? u.role}</span></span>
                  <span className="in-muted">{u.security_rank || "—"}</span>
                  <span className="in-muted">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-ES") : "—"}</span>
                  <span>{on ? <span className="sy-pill sy-st--ok">En línea{on.sessions > 1 ? ` · ${on.sessions}` : ""}</span> : <span className="in-muted">Desconectado</span>}</span>
                </div>
              );
            })}
          </div>
          <div className="us-roles">
            {Object.entries(ROLES).map(([k, [l, d]]) => <div key={k}><span className={`us-role us-role--${k}`}>{l}</span><small>{d}</small></div>)}
          </div>
          <p className="in-foot"><Info size={12} />Contraseñas: mínimo 8 caracteres con mayúsculas, minúsculas, números y símbolos. No se puede eliminar al último administrador, a uno mismo ni al usuario de sistema de la IA.</p>
        </div>
      </div>

      {form && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => setForm(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={form.id ? "Editar usuario" : "Nuevo usuario"}>
          <div className="wk-drawer__head">{form.id ? <Pencil size={15} /> : <Plus size={15} />}<span className="wk-drawer__id">{form.id ? `Editar ${form.username}` : "Nuevo usuario"}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setForm(null)} aria-label="Cerrar"><X size={16} /></button></div>
          <div className="wk-drawer__scroll">
            <div className="rb-form">
              <label>Usuario<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" maxLength={64} /></label>
              <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" /></label>
              <label>Rol<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} disabled={form.username.toLowerCase() === "valhalla-ia"}>{Object.entries(ROLES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label>Rango<input value={form.security_rank} onChange={e => setForm({ ...form, security_rank: e.target.value })} maxLength={64} placeholder="L1 Analyst, Commander…" /></label>
              <label className="rb-full">{form.id ? "Nueva contraseña (dejar vacío para no cambiarla)" : "Contraseña inicial"}
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></label>
            </div>
            <p className="in-muted us-hint"><KeyRound size={12} /> {ROLES[form.role]?.[1]}</p>
            {form.id && isOnline(form.id) && <p className="in-muted us-hint"><Eye size={12} /> Conectado ahora ({isOnline(form.id)!.sessions} sesión/es).</p>}
            {err && <p className="wk-form__err">{err}</p>}
          </div>
          <div className="wk-drawer__foot">
            {form.id && form.id !== me?.id && form.username.toLowerCase() !== "valhalla-ia" && (
              <HoldButton className="hp-block hp-block--wide" onConfirm={() => remove(users!.find(u => u.id === form.id)!)} title="Mantén pulsado para eliminar"><Trash2 size={13} />Eliminar</HoldButton>
            )}
            <button className="vp-btn vp-btn--primary" onClick={save} disabled={busy || form.username.trim().length < 3 || (!form.id && !form.password)}><Save size={13} />{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </aside>
      </>, document.body)}
    </div>
  );
}
