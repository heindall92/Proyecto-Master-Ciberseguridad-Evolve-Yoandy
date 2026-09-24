import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Camera, Trash2, Mail, CalendarDays, Hash, ShieldCheck, KeyRound, Eye, EyeOff, Check, X,
  Save, Siren, CircleCheckBig, ScrollText, Timer, MonitorSmartphone, Globe, Clock, Activity,
  LogIn, LogOut, UserPen, UserCheck, Paperclip, MessageSquare, SlidersHorizontal, Plus,
  Bell, Volume2, AtSign, ShieldAlert, Briefcase, BookOpen, Bug, ChevronRight, AlertCircle,
} from "lucide-react";
import {
  UserOut, updateUser, uploadMyAvatar, getMySession, getMyActivity, listTickets, MyActivityEntry,
} from "../lib/api";
import { getSoundPrefs, setSoundPrefs, SoundCategory } from "./audio";
import "./premium/profile.css";

type Lang = "es" | "en";

// Reglas idénticas a InputValidator.validate_password (backend/app/security.py).
function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    mixed: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pw),
  };
}

// Traduce una entrada del log de auditoría (método + ruta) a algo legible.
function describeActivity(e: MyActivityEntry, es: boolean): { label: string; icon: LucideIcon } {
  const r = e.route;
  const m = e.method.toUpperCase();
  if (r === "/api/auth/login") return { label: es ? "Inicio de sesión" : "Signed in", icon: LogIn };
  if (r === "/api/auth/logout") return { label: es ? "Cierre de sesión" : "Signed out", icon: LogOut };
  if (r === "/api/users/me/avatar") return { label: es ? "Foto de perfil actualizada" : "Profile picture updated", icon: Camera };
  if (/^\/api\/users\/\d+$/.test(r) && m === "PUT") return { label: es ? "Perfil actualizado" : "Profile updated", icon: UserPen };
  if (/^\/api\/tickets\/\d+\/assign/.test(r)) return { label: es ? "Incidente asignado" : "Incident assigned", icon: UserCheck };
  if (/^\/api\/tickets\/\d+\/evidence/.test(r)) return { label: es ? "Evidencia adjuntada" : "Evidence attached", icon: Paperclip };
  if (r === "/api/tickets" && m === "POST") return { label: es ? "Incidente creado" : "Incident created", icon: Plus };
  if (/^\/api\/tickets/.test(r)) return { label: es ? "Incidente actualizado" : "Incident updated", icon: Siren };
  if (/^\/api\/chat/.test(r)) return { label: es ? "Mensaje en el chat" : "Chat message", icon: MessageSquare };
  if (/^\/api\/settings/.test(r)) return { label: es ? "Ajustes del sistema" : "System settings", icon: SlidersHorizontal };
  if (m === "DELETE") return { label: es ? "Elemento eliminado" : "Item deleted", icon: Trash2 };
  return { label: `${m} ${r}`, icon: Activity };
}

function relativeTime(iso: string, lang: Lang) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  let value = diff;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), "year");
}

function parseAgent(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "—";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /(iPhone|iPad)/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "—";
  return { browser, os };
}

interface Props {
  user: UserOut;
  lang?: Lang;
  onUpdate: (u: UserOut) => void;
  profilePic: string | null;
  setProfilePic: (pic: string | null) => void;
}

type Notice = { kind: "ok" | "err"; text: string } | null;

export default function ProfileView({ user, lang = "es", onUpdate, profilePic, setProfilePic }: Props) {
  const es = lang === "es";

  const [email, setEmail] = useState(user.email || "");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountNotice, setAccountNotice] = useState<Notice>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [session, setSession] = useState<{ ip: string; user_agent: string; expires_minutes: number } | null>(null);
  const [activity, setActivity] = useState<MyActivityEntry[] | null>(null);
  const [kpis, setKpis] = useState<{ open: number; resolved: number } | null>(null);
  const [sounds, setSounds] = useState(getSoundPrefs);

  useEffect(() => {
    getMySession().then(setSession).catch(() => setSession(null));
    getMyActivity(40)
      .then((rows) => setActivity(rows.filter((r) => r.route !== "/api/auth/refresh")))
      .catch(() => setActivity([]));
    listTickets(undefined, undefined, 200)
      .then((tickets) => {
        const mine = tickets.filter((tk) => tk.assigned_to_id === user.id);
        setKpis({
          open: mine.filter((tk) => ["open", "in_progress", "escalated"].includes(tk.status)).length,
          resolved: mine.filter((tk) => ["resolved", "closed"].includes(tk.status)).length,
        });
      })
      .catch(() => setKpis(null));
  }, [user.id]);

  const checks = useMemo(() => passwordChecks(newPw), [newPw]);
  const score = newPw ? Object.values(checks).filter(Boolean).length : 0;
  const pwValid = checks.length && checks.mixed && checks.digit;
  const pwMatch = newPw.length > 0 && newPw === confirmPw;
  const canSavePw = !!currentPw && pwValid && pwMatch && !savingPw;

  const initials = user.username.slice(0, 2).toUpperCase();
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }) : null;
  const agent = session ? parseAgent(session.user_agent) : null;
  const errText = (err: unknown) => String(err).replace(/^Error:\s*/, "").replace(/^HTTP \d+:\s*/, "").replace(/^\{"detail":"(.*)"\}$/, "$1");

  const saveAccount = async () => {
    setSavingAccount(true);
    setAccountNotice(null);
    try {
      const updated = await updateUser(user.id, { email });
      onUpdate(updated);
      setAccountNotice({ kind: "ok", text: es ? "Datos de la cuenta guardados." : "Account details saved." });
    } catch (err) {
      setAccountNotice({ kind: "err", text: errText(err) });
    } finally {
      setSavingAccount(false);
    }
  };

  const savePassword = async () => {
    if (!canSavePw) return;
    setSavingPw(true);
    setPwNotice(null);
    try {
      await updateUser(user.id, { password: newPw, current_password: currentPw });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwNotice({ kind: "ok", text: es ? "Contraseña actualizada." : "Password updated." });
    } catch (err) {
      setPwNotice({ kind: "err", text: errText(err) });
    } finally {
      setSavingPw(false);
    }
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setAccountNotice({ kind: "err", text: es ? "La imagen supera 2 MB." : "Image is larger than 2 MB." });
      return;
    }
    setAvatarBusy(true);
    try {
      const res = await uploadMyAvatar(file);
      setProfilePic(res.avatar_url);
      onUpdate({ ...user, avatar_url: res.avatar_url });
    } catch (err) {
      setAccountNotice({ kind: "err", text: errText(err) });
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await updateUser(user.id, { avatar_url: "" });
      setProfilePic(null);
      onUpdate({ ...user, avatar_url: null });
    } catch (err) {
      setAccountNotice({ kind: "err", text: errText(err) });
    } finally {
      setAvatarBusy(false);
    }
  };

  const toggleSound = (cat: SoundCategory) => {
    const next = { ...sounds, [cat]: !sounds[cat] };
    setSounds(next);
    setSoundPrefs(next);
  };

  const go = (view: string) => window.dispatchEvent(new CustomEvent("navigate-to-view", { detail: { view } }));

  const quickLinks: { view: string; icon: LucideIcon; es: string; en: string }[] = [
    { view: "workspace", icon: Briefcase, es: "Mis incidentes", en: "My incidents" },
    { view: "threat", icon: ShieldAlert, es: "Threat Intel", en: "Threat Intel" },
    { view: "runbooks", icon: BookOpen, es: "Runbooks", en: "Runbooks" },
    { view: "cowrie", icon: Bug, es: "Honeypot", en: "Honeypot" },
  ];

  const Toast = ({ n }: { n: Notice }) => n && (
    <div className={`pf-toast pf-toast--${n.kind}`} role={n.kind === "err" ? "alert" : "status"}>
      {n.kind === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}{n.text}
    </div>
  );

  const rule = (ok: boolean, text: string, optional = false) => (
    <li data-ok={ok}>{ok ? <Check size={12} /> : <X size={12} />}{text}{optional && <em style={{ fontStyle: "normal", opacity: 0.7 }}> · {es ? "recomendado" : "recommended"}</em>}</li>
  );

  return (
    <div className="pf">
      {/* ---------- Identidad ---------- */}
      <section className="pf-card pf-hero">
        <div className="pf-hero__banner" />
        <div className="pf-hero__row">
          <div className="pf-avatar">
            <div className="pf-avatar__img">
              {profilePic ? <img src={profilePic} alt="" /> : initials}
            </div>
            <label className="pf-avatar__upload" aria-label={es ? "Cambiar foto" : "Change picture"}>
              <Camera size={20} />
              {avatarBusy ? "…" : es ? "Cambiar" : "Change"}
              <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={onAvatarFile} disabled={avatarBusy} />
            </label>
            <span className="pf-avatar__status" title={es ? "Conectado" : "Online"} />
          </div>

          <div className="pf-hero__id">
            <h1 className="pf-hero__name">{user.username.toUpperCase()}</h1>
            <div className="pf-hero__chips">
              <span className="vp-chip"><ShieldCheck size={11} />{user.security_rank || "L1 Analyst"}</span>
              <span className="vp-chip vp-chip--cyan"><KeyRound size={11} />{user.role.toUpperCase()}</span>
            </div>
            <div className="pf-hero__meta">
              <span><Mail size={13} />{user.email || (es ? "Sin correo" : "No email")}</span>
              {memberSince && <span><CalendarDays size={13} />{es ? "Miembro desde" : "Member since"} {memberSince}</span>}
              <span><Hash size={13} />ID {user.id.toString().padStart(5, "0")}</span>
            </div>
          </div>

          {profilePic && (
            <div className="pf-hero__actions">
              <button className="vp-btn" onClick={removeAvatar} disabled={avatarBusy}><Trash2 size={13} />{es ? "Quitar foto" : "Remove photo"}</button>
            </div>
          )}
        </div>

        <div className="pf-kpis">
          <div className="pf-kpi">
            <span className="pf-kpi__label"><Siren size={12} />{es ? "Asignados abiertos" : "Assigned open"}</span>
            <span className="pf-kpi__value">{kpis ? kpis.open : "—"}</span>
            <span className="pf-kpi__hint">{es ? "Incidentes en curso" : "Incidents in progress"}</span>
          </div>
          <div className="pf-kpi">
            <span className="pf-kpi__label"><CircleCheckBig size={12} />{es ? "Resueltos" : "Resolved"}</span>
            <span className="pf-kpi__value">{kpis ? kpis.resolved : "—"}</span>
            <span className="pf-kpi__hint">{es ? "Cerrados por ti" : "Closed by you"}</span>
          </div>
          <div className="pf-kpi">
            <span className="pf-kpi__label"><ScrollText size={12} />{es ? "Acciones" : "Actions"}</span>
            <span className="pf-kpi__value">{activity ? activity.length : "—"}</span>
            <span className="pf-kpi__hint">{es ? "Registradas en auditoría" : "Recorded in audit log"}</span>
          </div>
          <div className="pf-kpi">
            <span className="pf-kpi__label"><Timer size={12} />{es ? "Sesión" : "Session"}</span>
            <span className="pf-kpi__value">{session ? `${session.expires_minutes}′` : "—"}</span>
            <span className="pf-kpi__hint">{es ? "Duración del token de acceso" : "Access token lifetime"}</span>
          </div>
        </div>
      </section>

      <div className="pf-grid">
        <div className="pf-col">
          {/* ---------- Cuenta ---------- */}
          <section className="pf-card">
            <div className="pf-card__head">
              <span className="pf-card__icon"><UserPen size={16} /></span>
              <div>
                <div className="pf-card__title">{es ? "Cuenta" : "Account"}</div>
                <div className="pf-card__sub">{es ? "Datos de contacto e identidad" : "Contact and identity details"}</div>
              </div>
            </div>
            <div className="pf-card__body">
              <div className="pf-fields">
                <div className="pf-field pf-field--full">
                  <label className="pf-label" htmlFor="pf-email">{es ? "Correo electrónico" : "Email"}</label>
                  <div className="pf-input-wrap">
                    <Mail size={15} />
                    <input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analista@empresa.com" autoComplete="email" />
                  </div>
                </div>
                <div className="pf-field">
                  <span className="pf-label">{es ? "Usuario" : "Username"}</span>
                  <div className="pf-readonly"><KeyRound size={14} />{user.username}</div>
                </div>
                <div className="pf-field">
                  <span className="pf-label">{es ? "Rol y rango" : "Role & rank"}</span>
                  <div className="pf-readonly"><ShieldCheck size={14} />{user.role} · {user.security_rank}</div>
                </div>
                <p className="pf-help pf-field--full" style={{ margin: 0 }}>
                  {es ? "El usuario, el rol y el rango solo los puede cambiar un administrador." : "Username, role and rank can only be changed by an administrator."}
                </p>
              </div>
              <Toast n={accountNotice} />
              <div className="pf-actions">
                <button className="vp-btn vp-btn--primary" onClick={saveAccount} disabled={savingAccount || email === (user.email || "")}>
                  <Save size={13} />{savingAccount ? (es ? "Guardando…" : "Saving…") : es ? "Guardar cambios" : "Save changes"}
                </button>
              </div>
            </div>
          </section>

          {/* ---------- Seguridad ---------- */}
          <section className="pf-card">
            <div className="pf-card__head">
              <span className="pf-card__icon"><KeyRound size={16} /></span>
              <div>
                <div className="pf-card__title">{es ? "Seguridad" : "Security"}</div>
                <div className="pf-card__sub">{es ? "Cambia tu contraseña de acceso" : "Change your sign-in password"}</div>
              </div>
            </div>
            <div className="pf-card__body">
              <div className="pf-fields">
                <div className="pf-field pf-field--full">
                  <label className="pf-label" htmlFor="pf-current">{es ? "Contraseña actual" : "Current password"}</label>
                  <div className="pf-input-wrap">
                    <KeyRound size={15} />
                    <input id="pf-current" type={showPw ? "text" : "password"} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
                  </div>
                </div>
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-new">{es ? "Nueva contraseña" : "New password"}</label>
                  <div className="pf-input-wrap">
                    <KeyRound size={15} />
                    <input id="pf-new" type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                    <button type="button" className="pf-eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? (es ? "Ocultar" : "Hide") : (es ? "Mostrar" : "Show")}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-confirm">{es ? "Repetir contraseña" : "Repeat password"}</label>
                  <div className="pf-input-wrap">
                    <KeyRound size={15} />
                    <input id="pf-confirm" type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
                  </div>
                </div>
              </div>
              <div className="pf-meter" data-score={score} aria-hidden="true"><span /><span /><span /><span /></div>
              <ul className="pf-rules">
                {rule(checks.length, es ? "Mínimo 8 caracteres" : "At least 8 characters")}
                {rule(checks.mixed, es ? "Mayúsculas y minúsculas" : "Upper and lower case")}
                {rule(checks.digit, es ? "Al menos un número" : "At least one number")}
                {rule(checks.symbol, es ? "Un símbolo" : "A symbol", true)}
                {rule(pwMatch, es ? "Ambas coinciden" : "Both match")}
              </ul>
              <Toast n={pwNotice} />
              <div className="pf-actions">
                <button className="vp-btn vp-btn--primary" onClick={savePassword} disabled={!canSavePw}>
                  <ShieldCheck size={13} />{savingPw ? (es ? "Actualizando…" : "Updating…") : es ? "Actualizar contraseña" : "Update password"}
                </button>
              </div>
            </div>
          </section>

          {/* ---------- Sonidos ---------- */}
          <section className="pf-card">
            <div className="pf-card__head">
              <span className="pf-card__icon"><Volume2 size={16} /></span>
              <div>
                <div className="pf-card__title">{es ? "Sonidos" : "Sounds"}</div>
                <div className="pf-card__sub">{es ? "Avisos sonoros en este navegador" : "Audio cues in this browser"}</div>
              </div>
            </div>
            <div className="pf-card__body" style={{ paddingTop: 8 }}>
              {([
                ["incidents", Bell, es ? "Incidentes nuevos y resueltos" : "New and resolved incidents"],
                ["chat", MessageSquare, es ? "Mensajes del chat" : "Chat messages"],
                ["mentions", AtSign, es ? "Menciones directas" : "Direct mentions"],
              ] as [SoundCategory, LucideIcon, string][]).map(([cat, Icon, label]) => (
                <div key={cat} className="vp-switch-row" role="switch" aria-checked={sounds[cat]} tabIndex={0}
                  onClick={() => toggleSound(cat)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleSound(cat))}>
                  <Icon size={16} />
                  <div>{label}</div>
                  <span className="vp-switch" data-on={sounds[cat]} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pf-col">
          {/* ---------- Sesión actual ---------- */}
          <section className="pf-card">
            <div className="pf-card__head">
              <span className="pf-card__icon"><MonitorSmartphone size={16} /></span>
              <div>
                <div className="pf-card__title">{es ? "Sesión actual" : "Current session"}</div>
                <div className="pf-card__sub">{es ? "Este dispositivo" : "This device"}</div>
              </div>
            </div>
            <div className="pf-card__body">
              {session && agent ? (
                <dl className="pf-kv">
                  <dt><MonitorSmartphone size={13} />{es ? "Dispositivo" : "Device"}</dt><dd>{agent.browser} · {agent.os}</dd>
                  <dt><Globe size={13} />IP</dt><dd>{session.ip}</dd>
                  <dt><Clock size={13} />{es ? "Token de acceso" : "Access token"}</dt><dd>{session.expires_minutes} min</dd>
                </dl>
              ) : (
                <div style={{ display: "grid", gap: 10 }}><div className="pf-skel" /><div className="pf-skel" style={{ width: "70%" }} /></div>
              )}
              <p className="pf-note">
                {es
                  ? "Cookies httpOnly con token de acceso y renovación automática. Al cerrar sesión, los tokens se revocan en el servidor."
                  : "httpOnly cookies with access token and automatic refresh. Signing out revokes the tokens server-side."}
              </p>
            </div>
          </section>

          {/* ---------- Actividad ---------- */}
          <section className="pf-card">
            <div className="pf-card__head">
              <span className="pf-card__icon"><Activity size={16} /></span>
              <div>
                <div className="pf-card__title">{es ? "Actividad reciente" : "Recent activity"}</div>
                <div className="pf-card__sub">{es ? "Tu rastro en el log de auditoría" : "Your trail in the audit log"}</div>
              </div>
            </div>
            <div className="pf-card__body">
              {activity === null && <div style={{ display: "grid", gap: 10 }}><div className="pf-skel" /><div className="pf-skel" /><div className="pf-skel" style={{ width: "60%" }} /></div>}
              {activity && activity.length === 0 && (
                <div className="vp-empty" style={{ padding: "18px 8px" }}>
                  <ScrollText size={22} />
                  {es ? "Aún no hay acciones registradas." : "No actions recorded yet."}
                </div>
              )}
              {activity && activity.length > 0 && (
                <div className="pf-scroll">
                  <ul className="pf-timeline">
                    {activity.map((e) => {
                      const { label, icon: Icon } = describeActivity(e, es);
                      return (
                        <li key={e.id} className="pf-tl">
                          <span className="pf-tl__dot"><Icon size={14} /></span>
                          <div className="pf-tl__main">
                            <div className="pf-tl__title">{label}</div>
                            <div className="pf-tl__meta">
                              <span title={new Date(e.timestamp).toLocaleString(lang)}>{relativeTime(e.timestamp, lang)}</span>
                              {e.ip && <span>{e.ip}</span>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* ---------- Accesos rápidos ---------- */}
          <section className="pf-card">
            <div className="pf-card__head">
              <span className="pf-card__icon"><ChevronRight size={16} /></span>
              <div className="pf-card__title">{es ? "Accesos rápidos" : "Quick access"}</div>
            </div>
            <div className="pf-card__body">
              <div className="pf-quick">
                {quickLinks.map((q) => {
                  const Icon = q.icon;
                  return (
                    <button key={q.view} onClick={() => go(q.view)}>
                      <Icon size={16} />{es ? q.es : q.en}<ChevronRight size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
