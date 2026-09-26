import { useEffect, useState } from "react";
import { Check, KeyRound, X } from "lucide-react";
import { inviteActivate, inviteCheck } from "../../lib/api";

/** Enlace de invitación (/activar#token): el nuevo usuario elige su contraseña.
 *  El token se guarda en sessionStorage para sobrevivir a una recarga del móvil y se borra al usarlo. */

export const INVITE_KEY = "valhalla.invite";

export function readInviteToken(): string | null {
  try {
    if (window.location.pathname === "/activar" && window.location.hash.length > 21) {
      sessionStorage.setItem(INVITE_KEY, window.location.hash.slice(1));
      window.history.replaceState(null, "", "/activar"); // el token no queda en el historial
    }
    return window.location.pathname === "/activar" ? sessionStorage.getItem(INVITE_KEY) : null;
  } catch { return null; }
}

const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^HTTP \d+:\s*/, "").replace(/^\{"detail":"?|"?\}$/g, "");

export default function InviteActivation({ token, onDone }: { token: string; onDone: (username: string | null) => void }) {
  const [info, setInfo] = useState<{ username: string; expires_at: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { inviteCheck(token).then(setInfo).catch(e => setErr(clean(e))); }, [token]);

  const rules: Array<[string, boolean]> = [
    ["8 caracteres o más", pw.length >= 8],
    ["Mayúscula y minúscula", /[A-Z]/.test(pw) && /[a-z]/.test(pw)],
    ["Un número", /\d/.test(pw)],
    ["Un símbolo (!@#$%…)", /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pw)],
    ["No contiene tu usuario", !!info && !!pw && !pw.toLowerCase().includes(info.username.toLowerCase())],
    ["Las dos coinciden", !!pw && pw === pw2],
  ];
  const ok = rules.every(([, v]) => v);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || !info) return;
    setBusy(true); setErr(null);
    try {
      const r = await inviteActivate(token, pw);
      try { sessionStorage.removeItem(INVITE_KEY); } catch { /* sin almacenamiento */ }
      onDone(r.username);
    } catch (e2) { setErr(clean(e2)); }
    finally { setBusy(false); }
  };

  const leave = () => { try { sessionStorage.removeItem(INVITE_KEY); } catch { /* sin almacenamiento */ } onDone(null); };

  if (err && !info) {
    return (
      <div className="login-form invite-form">
        <p className="invite-msg invite-msg--err"><X size={14} />{err}</p>
        <button type="button" className="login-btn" onClick={leave}>Ir al inicio de sesión</button>
      </div>
    );
  }
  if (!info) return <div className="login-form invite-form"><p className="invite-msg">Comprobando invitación…</p></div>;

  return (
    <form className="login-form invite-form" onSubmit={submit}>
      <p className="invite-msg"><KeyRound size={14} />Te han invitado a Valhalla SOC. Elige tu contraseña para activar la cuenta.</p>
      <div className="login-field">
        <label className="login-label" htmlFor="inv-user">Usuario</label>
        <input id="inv-user" className="login-input" value={info.username} readOnly autoComplete="username" />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="inv-pass">Nueva contraseña</label>
        <input id="inv-pass" className="login-input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" autoFocus maxLength={128} />
      </div>
      <div className="login-field">
        <label className="login-label" htmlFor="inv-pass2">Repítela</label>
        <input id="inv-pass2" className="login-input" type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" maxLength={128} />
      </div>
      <ul className="invite-rules">
        {rules.map(([l, v]) => <li key={l} className={v ? "is-ok" : ""}>{v ? <Check size={12} /> : <X size={12} />}{l}</li>)}
      </ul>
      {err && <p className="invite-msg invite-msg--err"><X size={14} />{err}</p>}
      <button type="submit" className="login-btn" disabled={!ok || busy}>{busy ? "ACTIVANDO…" : "ACTIVAR CUENTA"}</button>
      <p className="invite-foot">El enlace es de un solo uso y caduca el {new Date(info.expires_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}.</p>
    </form>
  );
}
