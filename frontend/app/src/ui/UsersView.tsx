import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, KeyRound, Pencil, Plus, Save, Search, ShieldCheck, Trash2, UserCog, Users, Wifi, X, Info, Eye, Smartphone, Monitor, Globe, Send, Share2, Copy, Link2, ShieldAlert, Unlink, Clock, MessageCircle, Mail } from "lucide-react";
import { listUsers, createUser, updateUser, deleteUser, resetPassword, fetchAuth, createInvite, getInviteState, revokeInvite, pendingInvites, unlinkTailscale, type UserOut, type Invite, type InviteState } from "../lib/api";
import { useAppSelector } from "../store/hooks";
import { HoldButton, KpiCard, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/** Usuarios: equipo del SOC, roles, presencia en línea, invitaciones y gestión de accesos (solo admin). */

const ROLES: Record<string, [string, string]> = {
  admin: ["Administrador", "Gestiona usuarios, sistema y configuración"],
  analista: ["Analista", "Investiga, gestiona incidentes y genera informes"],
  reporter: ["Reportero", "Crea incidentes y ve los suyos"],
  viewer: ["Lector", "Solo ve los incidentes asignados o creados por él"],
};
const roleKey = (r: string) => (r === "analyst" ? "analista" : r);
const initials = (n: string) => n.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
type SessionDetail = {
  device: { type: string; os: string; browser: string }; network: string; since: string; ip?: string;
  ts?: { login: string | null; name?: string | null; device: string | null; os?: string | null } | null; mismatch?: boolean;
};
type Presence = Array<{ id: number; username: string; role: string; sessions: number; detail: SessionDetail[] }>;
const sinceTxt = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^HTTP \d+:\s*/, "").replace(/^\{"detail":"?|"?\}$/g, "");

function Sessions({ username, role, detail }: { username: string; role: string; detail: SessionDetail[] }) {
  return (
    <ul className="us-sessions" aria-label={`Sesiones de ${username}`}>
      {detail.map((d, i) => {
        const Dev = d.device.type === "móvil" ? Smartphone : Monitor;
        return (
          <li key={i}>
            <Dev size={14} />
            <b>{username}</b><span className={`us-role us-role--${roleKey(role)}`}>{ROLES[roleKey(role)]?.[0] ?? role}</span>
            <span>{d.device.type} · {d.device.os} · {d.device.browser}</span>
            <span className={`us-net${d.network.startsWith("VPN") ? " is-vpn" : d.network === "internet" ? " is-inet" : ""}`}><Globe size={11} />{d.network}</span>
            {d.ip && <code>{d.ip}</code>}
            {d.ts?.login && (
              <span className={`us-ts${d.mismatch ? " is-bad" : ""}`} title={d.mismatch ? "Esta cuenta de Tailscale no es la vinculada a este usuario" : "Cuenta de Tailscale del dispositivo"}>
                {d.mismatch && <ShieldAlert size={11} />}{d.ts.login}{d.ts.device ? ` · ${d.ts.device}` : ""}
              </span>
            )}
            <span className="in-muted">conectado {sinceTxt(d.since)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function inviteText(inv: Invite): string {
  const role = ROLES[roleKey(inv.role)]?.[0] ?? inv.role;
  const lines = [`Hola ${inv.username}, te invito a Valhalla SOC con el rol ${role}.`, ""];
  let n = 1;
  if (inv.vpn) {
    lines.push(inv.tailscale_url
      ? `${n++}. Instala Tailscale (https://tailscale.com/download), inicia sesión y acepta este acceso: ${inv.tailscale_url}`
      : `${n++}. Instala Tailscale (https://tailscale.com/download) e inicia sesión; te compartiré el acceso a la máquina valhalla-soc.`);
  }
  lines.push(`${n++}. ${inv.vpn ? "Con Tailscale activado, abre" : "Abre"} este enlace y elige tu contraseña: ${inv.activation_url}`);
  lines.push(`${n++}. Después entra siempre en ${inv.valhalla_url} con tu usuario ${inv.username}.`);
  lines.push("", `El enlace de activación es personal, de un solo uso y caduca el ${fmt(inv.expires_at)}. No lo reenvíes.`);
  return lines.join("\n");
}

function InvitePanel({ inv }: { inv: Invite }) {
  const text = inviteText(inv);
  const masked = inv.activation_url.replace(/#.+$/, "#••••••");
  // Por http (sin HTTPS, como en la VPN) el navegador bloquea clipboard y share: se usa execCommand
  const copy = async (t: string, what: string) => {
    try {
      if (window.isSecureContext && navigator.clipboard) await navigator.clipboard.writeText(t);
      else {
        const ta = document.createElement("textarea");
        ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy"); ta.remove();
        if (!ok) throw new Error("copy");
      }
      toast(`${what} copiado.`, "ok");
    } catch { toast("No se pudo copiar: selecciónalo y cópialo a mano.", "err"); }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async () => {
    try { await navigator.share({ title: "Invitación a Valhalla SOC", text }); }
    catch (e) { if ((e as Error)?.name !== "AbortError") copy(text, "Mensaje"); }
  };
  return (
    <div className="us-invite">
      <div className="us-invite__head"><Send size={14} /><b>Invitación para {inv.username}</b><span className="in-muted"><Clock size={11} /> caduca {fmt(inv.expires_at)}</span></div>
      <ul className="us-invite__links">
        {inv.vpn && (
          <li><span>1 · VPN (Tailscale)</span>
            {inv.tailscale_url
              ? <><code>{inv.tailscale_url}</code><button type="button" className="vx-iconbtn" onClick={() => copy(inv.tailscale_url!, "Enlace de Tailscale")} aria-label="Copiar enlace de Tailscale"><Copy size={13} /></button></>
              : <small className="us-invite__warn">{inv.tailscale_error ?? "Sin enlace automático."} Compártelo tú desde el panel de Tailscale: Machines → valhalla-soc → Share.</small>}
          </li>
        )}
        <li><span>{inv.vpn ? "2" : "1"} · Activar cuenta</span><code>{masked}</code>
          <button type="button" className="vx-iconbtn" onClick={() => copy(inv.activation_url, "Enlace de activación")} aria-label="Copiar enlace de activación"><Copy size={13} /></button></li>
        <li><span>{inv.vpn ? "3" : "2"} · Acceso diario</span><code>{inv.valhalla_url}</code></li>
      </ul>
      <pre className="us-invite__msg">{text.replace(inv.activation_url, masked)}</pre>
      <div className="us-invite__actions">
        {canShare && <button type="button" className="vp-btn vp-btn--primary" onClick={share}><Share2 size={13} />Compartir</button>}
        <button type="button" className={`vp-btn${canShare ? "" : " vp-btn--primary"}`} onClick={() => copy(text, "Mensaje")}><Copy size={13} />Copiar mensaje</button>
        <a className="vp-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} />WhatsApp</a>
        <a className="vp-btn" href={`mailto:?subject=${encodeURIComponent("Invitación a Valhalla SOC")}&body=${encodeURIComponent(text)}`}><Mail size={13} />Correo</a>
      </div>
      <p className="in-muted us-hint"><Info size={12} /> Es la única vez que se ve el enlace completo: Valhalla solo guarda su huella. Cuando active la cuenta y entre, te llegará un aviso con su dispositivo y su cuenta de Tailscale.</p>
    </div>
  );
}

type Form = { id?: number; username: string; email: string; role: string; security_rank: string; password: string; invite: boolean; tailscale_login?: string | null };

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
  const [pending, setPending] = useState<Record<number, string>>({});
  const [invite, setInvite] = useState<Invite | null>(null);
  const [invState, setInvState] = useState<InviteState | null>(null);

  const load = () => {
    listUsers().then(setUsers).catch(() => setUsers([]));
    pendingInvites().then(r => setPending(Object.fromEntries(r.map(p => [p.user_id, p.expires_at])))).catch(() => {});
  };
  const loadPresence = () => fetchAuth<Presence>("/api/presence").then(setOnline).catch(() => {});
  useEffect(() => {
    load(); loadPresence();
    const iv = setInterval(loadPresence, 15000);
    // Aviso en directo por WebSocket: alguien acaba de entrar o de activar su invitación
    const onEvt = () => { load(); setTimeout(loadPresence, 1500); };
    window.addEventListener("valhalla-session-event", onEvt);
    return () => { clearInterval(iv); window.removeEventListener("valhalla-session-event", onEvt); };
  }, []);

  const isOnline = (id: number) => online.find(o => o.id === id);
  const rows = useMemo(() => (users ?? []).filter(u => (role === "all" || roleKey(u.role) === role) && (!q || `${u.username} ${u.email ?? ""} ${u.security_rank}`.toLowerCase().includes(q.toLowerCase()))), [users, q, role]);
  const count = (r: string) => (users ?? []).filter(u => roleKey(u.role) === r).length;

  const openForm = (f: Form | null) => {
    setErr(null); setInvite(null); setInvState(null); setForm(f);
    if (f?.id && f.username.toLowerCase() !== "valhalla-ia") getInviteState(f.id).then(setInvState).catch(() => {});
  };
  const refreshInvState = (id: number) => getInviteState(id).then(setInvState).catch(() => {});
  const doInvite = async (id: number) => {
    setErr(null); setBusy(true);
    try { setInvite(await createInvite(id, true)); load(); refreshInvState(id); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!form) return;
    setErr(null); setBusy(true);
    try {
      if (form.id) {
        await updateUser(form.id, { username: form.username, email: form.email || undefined, role: form.role, security_rank: form.security_rank });
        if (form.password) await resetPassword(form.id, form.password);
        toast("Usuario actualizado.", "ok");
      } else {
        const u = await createUser({ username: form.username, email: form.email || null, role: form.role, security_rank: form.security_rank, password: form.invite ? null : form.password });
        toast(`Usuario ${form.username} creado.`, "ok");
        if (form.invite) {
          // El panel se queda abierto con la invitación lista para compartir
          setForm({ ...form, id: u.id, password: "", invite: false });
          load();
          setBusy(false);
          await doInvite(u.id);
          return;
        }
      }
      setForm(null); load();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };
  const remove = async (u: UserOut) => {
    try { await deleteUser(u.id); toast(`Usuario ${u.username} eliminado.`, "ok"); openForm(null); load(); }
    catch (e) { toast(errText(e), "err"); }
  };
  const vpnLogin = invState?.tailscale_login ?? form?.tailscale_login ?? null;

  return (
    <div className="view in us">
      <div className="wk-head">
        <div><h1>Usuarios</h1><p>Equipo del SOC, roles y accesos</p></div>
        <div className="in-bar">
          <label className="wk-search"><Search size={15} /><input className="vp-bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Usuario, email o rango…" />
            {q && <button className="wk-search__clear" onClick={() => setQ("")} aria-label="Borrar"><X size={13} /></button>}</label>
          <button type="button" className="vp-btn vp-btn--primary" onClick={() => openForm({ username: "", email: "", role: "analista", security_rank: "L1 Analyst", password: "", invite: true })}><Plus size={14} />Nuevo usuario</button>
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
                <div key={u.id} className="us-block">
                <div role="row" className="in-row us-row" tabIndex={0} onClick={() => openForm({ id: u.id, username: u.username, email: u.email ?? "", role: roleKey(u.role), security_rank: u.security_rank ?? "", password: "", invite: false, tailscale_login: u.tailscale_login })} onKeyDown={e => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}>
                  <span className="us-av">{sys ? <Bot size={15} /> : u.avatar_url ? <img src={u.avatar_url} alt="" /> : initials(u.username)}{on && <i />}</span>
                  <span className="in-prod"><b>{u.username}{u.id === me?.id ? " (tú)" : ""}</b><small>{sys ? "Usuario de sistema · asistente IA del chat" : u.email || "sin email"}</small></span>
                  <span><span className={`us-role us-role--${roleKey(u.role)}`}>{ROLES[roleKey(u.role)]?.[0] ?? u.role}</span></span>
                  <span className="in-muted">{u.security_rank || "—"}</span>
                  <span className="in-muted">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-ES") : "—"}</span>
                  <span>{on ? <span className="sy-pill sy-st--ok">En línea{on.sessions > 1 ? ` · ${on.sessions}` : ""}</span>
                    : pending[u.id] ? <span className="sy-pill us-pill--inv" title={`Caduca ${fmt(pending[u.id])}`}>Invitación pendiente</span>
                    : <span className="in-muted">Desconectado</span>}</span>
                </div>
                {on && on.detail?.length > 0 && <Sessions username={u.username} role={u.role} detail={on.detail} />}
                </div>
              );
            })}
          </div>
          <div className="us-roles">
            {Object.entries(ROLES).map(([k, [l, d]]) => <div key={k}><span className={`us-role us-role--${k}`}>{l}</span><small>{d}</small></div>)}
          </div>
          <p className="in-foot"><Info size={12} />Contraseñas: mínimo 8 caracteres con mayúsculas, minúsculas, números y símbolos. No se puede eliminar al último administrador, a uno mismo ni al usuario de sistema de la IA. Los invitados eligen su contraseña con un enlace de un solo uso (24 h).</p>
        </div>
      </div>

      {form && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => openForm(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={form.id ? "Editar usuario" : "Nuevo usuario"}>
          <div className="wk-drawer__head">{form.id ? <Pencil size={15} /> : <Plus size={15} />}<span className="wk-drawer__id">{form.id ? `Editar ${form.username}` : "Nuevo usuario"}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => openForm(null)} aria-label="Cerrar"><X size={16} /></button></div>
          <div className="wk-drawer__scroll">
            <div className="rb-form">
              <label>Usuario<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" maxLength={64} /></label>
              <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" /></label>
              <label>Rol<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} disabled={form.username.toLowerCase() === "valhalla-ia"}>{Object.entries(ROLES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label>Rango<input value={form.security_rank} onChange={e => setForm({ ...form, security_rank: e.target.value })} maxLength={64} placeholder="L1 Analyst, Commander…" /></label>
              {!form.id && (
                <label className="rb-full us-check"><input type="checkbox" checked={form.invite} onChange={e => setForm({ ...form, invite: e.target.checked })} />
                  <span>Enviar invitación: el usuario elige su contraseña con un enlace de un solo uso (recomendado)</span></label>
              )}
              {(form.id || !form.invite) && (
                <label className="rb-full">{form.id ? "Nueva contraseña (dejar vacío para no cambiarla)" : "Contraseña inicial"}
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></label>
              )}
            </div>
            <p className="in-muted us-hint"><KeyRound size={12} /> {ROLES[form.role]?.[1]}</p>
            {form.id && isOnline(form.id) && <><p className="in-muted us-hint"><Eye size={12} /> Conectado ahora ({isOnline(form.id)!.sessions} sesión/es):</p>
              <Sessions username={form.username} role={form.role} detail={isOnline(form.id)!.detail ?? []} /></>}
            {form.id && form.username.toLowerCase() !== "valhalla-ia" && (
              <div className="us-access">
                <div className="us-access__row"><Link2 size={13} /><span>Invitación</span>
                  <b>{invState?.status === "pending" ? `Pendiente · caduca ${fmt(invState.expires_at)}` : invState?.status === "used" ? `Activada ${fmt(invState.used_at)}` : invState?.status === "expired" ? "Caducada sin usar" : "Sin invitación"}</b>
                  {invState?.tailscale && <small className="in-muted">Tailscale: {invState.tailscale.accepted ? `aceptada por ${invState.tailscale.login}` : "pendiente de aceptar"}</small>}
                </div>
                <div className="us-access__row"><Globe size={13} /><span>Cuenta VPN vinculada</span>
                  <b>{vpnLogin ?? "Ninguna: se vincula en su primer acceso por VPN"}</b>
                  {vpnLogin && <button type="button" className="vp-btn" onClick={async () => {
                    try { await unlinkTailscale(form.id!); toast("Cuenta de Tailscale desvinculada.", "ok"); setForm({ ...form, tailscale_login: null }); setInvState(s => s && { ...s, tailscale_login: null }); load(); }
                    catch { toast("No se pudo desvincular.", "err"); }
                  }}><Unlink size={12} />Desvincular</button>}
                </div>
                <div className="us-access__actions">
                  <button type="button" className="vp-btn" disabled={busy} onClick={() => doInvite(form.id!)}><Send size={13} />{busy ? "Generando…" : invState?.status === "pending" ? "Generar nueva invitación" : "Invitar"}</button>
                  {invState?.status === "pending" && <button type="button" className="vp-btn" onClick={async () => {
                    try { await revokeInvite(form.id!); toast("Invitación anulada.", "ok"); setInvite(null); load(); refreshInvState(form.id!); }
                    catch { toast("No se pudo anular.", "err"); }
                  }}><X size={13} />Anular</button>}
                </div>
                {invState?.status === "pending" && !invite && <p className="in-muted us-hint"><Info size={12} /> El enlace completo solo se muestra al crearlo; generar uno nuevo anula el anterior.</p>}
              </div>
            )}
            {invite && <InvitePanel inv={invite} />}
            {err && <p className="wk-form__err">{err}</p>}
          </div>
          <div className="wk-drawer__foot">
            {form.id && form.id !== me?.id && form.username.toLowerCase() !== "valhalla-ia" && (
              <HoldButton className="hp-block hp-block--wide" onConfirm={() => remove(users?.find(u => u.id === form.id) ?? ({ id: form.id, username: form.username } as UserOut))} title="Mantén pulsado para eliminar"><Trash2 size={13} />Eliminar</HoldButton>
            )}
            <button className="vp-btn vp-btn--primary" onClick={save} disabled={busy || form.username.trim().length < 3 || (!form.id && !form.invite && !form.password)}><Save size={13} />{busy ? "Guardando…" : !form.id && form.invite ? "Crear e invitar" : "Guardar"}</button>
          </div>
        </aside>
      </>, document.body)}
    </div>
  );
}
