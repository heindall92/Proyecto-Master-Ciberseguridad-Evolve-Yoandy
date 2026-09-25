import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban, Crosshair, DoorOpen, KeyRound, Radar, RefreshCw, ShieldAlert, Terminal, Timer, UserX, X, Info, Radio,
} from "lucide-react";
import { getHoneypotOverview, getHoneypotSessions, getHoneypotSessionEvents, blockIp, type HoneypotOverview, type HoneypotSession, type HoneypotEvent } from "../lib/api";
import { HoldButton, KpiCard, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/** Honeypot Cowrie: actividad real del señuelo SSH/Telnet, sesión a sesión. */

const DANGER = [/wget|curl|tftp/i, /chmod|chown/i, /passwd|shadow/i, /rm -rf/i, /base64/i, /nohup|crontab/i, /\.sh\b|\.py\b/i, /nc |ncat|socat/i];
const EV: Record<string, [string, string]> = {
  "cowrie.session.connect": ["Conexión", "info"], "cowrie.client.version": ["Cliente", "info"],
  "cowrie.login.failed": ["Login fallido", "warn"], "cowrie.login.success": ["Login aceptado", "crit"],
  "cowrie.command.input": ["Comando", "high"], "cowrie.session.closed": ["Cierre", "info"],
  "cowrie.session.file_download": ["Descarga", "crit"], "cowrie.client.kex": ["Negociación", "info"],
};
const fmtT = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-ES") : "—");
const intel = (ip: string) => window.dispatchEvent(new CustomEvent("navigate-to-intel", { detail: { ip } }));

function Timeline({ data }: { data: HoneypotOverview["timeline"] }) {
  const max = Math.max(1, ...data.map(d => d.events));
  return (
    <div className="hp-tl" role="img" aria-label="Actividad del honeypot por hora">
      {data.map(d => (
        <div key={d.t} className="hp-tl__col" title={`${new Date(d.t).toLocaleString("es-ES")}: ${d.events} eventos · ${d.failed} fallidos · ${d.success} aceptados`}>
          <i style={{ height: `${(d.events / max) * 100}%` }}>
            {d.success > 0 && <b style={{ height: `${(d.success / Math.max(d.events, 1)) * 100}%` }} />}
          </i>
        </div>
      ))}
    </div>
  );
}

export default function CowrieView() {
  const [hours, setHours] = useState(24);
  const [ov, setOv] = useState<HoneypotOverview | null>(null);
  const [sess, setSess] = useState<HoneypotSession[] | null>(null);
  const [onlyIn, setOnlyIn] = useState(false);
  const [open, setOpen] = useState<HoneypotSession | null>(null);
  const [events, setEvents] = useState<HoneypotEvent[] | null>(null);

  const load = () => {
    getHoneypotOverview(hours).then(setOv).catch(() => setOv(null));
    getHoneypotSessions(hours).then(setSess).catch(() => setSess([]));
  };
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [hours]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setEvents(null); getHoneypotSessionEvents(open.session).then(setEvents).catch(() => setEvents([])); } }, [open]);

  const s = ov?.summary;
  const rows = useMemo(() => (sess ?? []).filter(x => !onlyIn || x.success > 0), [sess, onlyIn]);
  const block = async (ip: string) => {
    try {
      const r = await blockIp(ip, undefined, "Atacante del honeypot Cowrie");
      toast(r.active_response || r.cdb_applied ? `IP ${ip} bloqueada en Wazuh.` : `Bloqueo de ${ip} registrado, pero Wazuh no lo confirmó.`, r.active_response || r.cdb_applied ? "ok" : "err");
    } catch (e) { toast(`No se pudo bloquear: ${e instanceof Error ? e.message : e}`, "err"); }
  };

  return (
    <div className="view in hp">
      <div className="wk-head">
        <div>
          <h1>Honeypot Cowrie</h1>
          <p>Señuelo SSH/Telnet: cada intento de acceso real registrado en Wazuh</p>
        </div>
        <div className="in-bar">
          <span className={`sy-overall sy-st--${s?.events ? "ok" : "warning"}`}><Radio size={14} />{s?.events ? "Recibiendo ataques" : "Sin actividad en la ventana"}</span>
          <div className="in-seg" role="group" aria-label="Ventana">{[1, 24, 168].map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>{h === 168 ? "7 d" : `${h} h`}</button>)}</div>
          <button type="button" className="wk-iconbtn" onClick={load} title="Actualizar" aria-label="Actualizar"><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="in-body">
        <div className="in-vulns">
          <div className="in-kpis hp-kpis">
            <KpiCard icon={Terminal} label="Sesiones" value={s?.sessions ?? 0} sub={`${(s?.events ?? 0).toLocaleString("es-ES")} eventos`} tone="info" />
            <KpiCard icon={UserX} label="Logins fallidos" value={s?.login_failed ?? 0} sub={`${s?.bruteforce_detections ?? 0} detecciones de fuerza bruta`} tone="warning" />
            <KpiCard icon={DoorOpen} label="Accesos logrados" value={s?.login_success ?? 0} sub={`${s?.intrusions_after_bruteforce ?? 0} tras fuerza bruta`} tone="danger" />
            <KpiCard icon={Crosshair} label="IPs atacantes" value={ov?.attackers.length ?? 0} sub={ov?.clients[0]?.value ?? "—"} tone="accent" />
          </div>

          <section className="in-panel hp-chart">
            <header className="in-watch__head"><Radar size={15} /><h3>Actividad por {ov?.interval === "6h" ? "6 horas" : "hora"}</h3>
              <span className="hp-legend"><i className="hp-l--ev" />eventos <i className="hp-l--ok" />logins aceptados</span></header>
            {ov ? <Timeline data={ov.timeline} /> : <p className="in-empty">Cargando…</p>}
          </section>

          <div className="hp-grid">
            <section className="in-panel hp-sessions">
              <header className="in-watch__head"><Terminal size={15} /><h3>Sesiones</h3>
                <button type="button" className={`vp-btn hp-filter${onlyIn ? " vp-btn--primary" : ""}`} onClick={() => setOnlyIn(v => !v)}><DoorOpen size={13} />Solo con acceso</button>
                <span className="in-count">{rows.length}</span></header>
              <div className="in-list hp-list" role="table">
                <div className="in-row hp-row in-row--head" role="row"><span>Hora</span><span>IP</span><span>Duración</span><span>Intentos</span><span>Acceso</span><span>Cmds</span></div>
                {!sess && <p className="in-empty">Cargando…</p>}
                {sess && !rows.length && <p className="in-empty">Sin sesiones en la ventana.</p>}
                {rows.map(x => (
                  <div key={x.session} role="row" className={`in-row hp-row${x.success ? " is-in" : ""}`} tabIndex={0} onClick={() => setOpen(x)} onKeyDown={e => e.key === "Enter" && setOpen(x)}>
                    <span className="in-muted">{fmtT(x.start)}</span>
                    <span className="in-cve">{x.ip}</span>
                    <span className="in-muted"><Timer size={11} /> {x.duration_s} s</span>
                    <span>{x.failed + x.success}</span>
                    <span>{x.success ? <span className="sy-pill sy-st--error">Sí{x.users[0] ? ` · ${x.users[0]}` : ""}</span> : <span className="in-muted">No</span>}</span>
                    <span>{x.commands || <span className="in-muted">0</span>}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="hp-side">
              <section className="in-panel">
                <header className="in-watch__head"><Crosshair size={15} /><h3>Atacantes</h3><span className="in-count">{ov?.attackers.length ?? ""}</span></header>
                <ul className="in-wlist">
                  {!ov?.attackers.length && <li className="in-empty">Sin atacantes en la ventana.</li>}
                  {ov?.attackers.map(a => (
                    <li key={a.ip} className="hp-att">
                      <ShieldAlert size={14} className="in-wlist__icon" />
                      <button type="button" className="in-wlist__val" onClick={() => intel(a.ip)} title="Analizar en Inteligencia">{a.ip}<small>{a.sessions} sesiones · {a.success} accesos · último {fmtT(a.last)}</small></button>
                      <HoldButton className="hp-block" onConfirm={() => block(a.ip)} title="Mantén pulsado para bloquear en Wazuh"><Ban size={13} /></HoldButton>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="in-panel">
                <header className="in-watch__head"><KeyRound size={15} /><h3>Credenciales más probadas</h3></header>
                <div className="hp-creds">
                  <div><span className="wk-fact__k">Usuarios</span><div className="ex-creds">{s?.top_usernames?.length ? s.top_usernames.map(c => <code key={c.value}>{c.value}<small>×{c.count}</small></code>) : <span className="in-muted">—</span>}</div></div>
                  <div><span className="wk-fact__k">Contraseñas</span><div className="ex-creds">{s?.top_passwords?.length ? s.top_passwords.map(c => <code key={c.value}>{c.value}<small>×{c.count}</small></code>) : <span className="in-muted">—</span>}</div></div>
                </div>
              </section>
              <section className="in-panel">
                <header className="in-watch__head"><Terminal size={15} /><h3>Comandos ejecutados</h3></header>
                {s?.top_commands?.length ? (
                  <ul className="in-engines hp-cmds">{s.top_commands.map(c => <li key={c.value}><code className={DANGER.some(r => r.test(c.value)) ? "is-danger" : ""}>{c.value}</code><span className="in-muted">×{c.count}</span></li>)}</ul>
                ) : <p className="in-empty">Ningún comando registrado: los atacantes del periodo no llegaron a ejecutar órdenes tras acceder.</p>}
              </section>
            </div>
          </div>
          <p className="in-foot"><Info size={12} />Cowrie simula un servidor SSH/Telnet: nada de lo que hacen los atacantes afecta a sistemas reales. Wazuh correlaciona los intentos (regla 100111: fuerza bruta; 100113: acceso tras fuerza bruta).</p>
        </div>
      </div>

      {open && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => setOpen(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={`Sesión ${open.session}`}>
          <div className="wk-drawer__head">
            <Terminal size={16} /><span className="wk-drawer__id">Sesión {open.session}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen(null)} aria-label="Cerrar"><X size={16} /></button>
          </div>
          <div className="wk-drawer__scroll">
            <div className="wk-facts">
              <div><div className="wk-fact__k">IP atacante</div><div className="wk-fact__v"><button type="button" className="wk-link" onClick={() => intel(open.ip)}>{open.ip}</button></div></div>
              <div><div className="wk-fact__k">Duración</div><div className="wk-fact__v">{open.duration_s} s · {fmtT(open.start)}</div></div>
              <div><div className="wk-fact__k">Intentos de login</div><div className="wk-fact__v">{open.failed} fallidos · {open.success} aceptados</div></div>
              <div><div className="wk-fact__k">Comandos</div><div className="wk-fact__v">{open.commands}</div></div>
            </div>
            <section className="wk-section">
              <div className="wk-section__head"><Terminal size={14} />Secuencia de la sesión</div>
              <div className="wk-section__body">
                {!events ? <p className="in-muted">Cargando…</p> : !events.length ? <p className="in-muted">Sin eventos.</p> : (
                  <ol className="hp-tty">
                    {events.map((e, i) => {
                      const [label, tone] = EV[e.event] ?? [e.event.replace("cowrie.", ""), "info"];
                      return (
                        <li key={i} className={`hp-ev hp-ev--${tone}`}>
                          <time>{fmtT(e.t)}</time>
                          <span className="hp-ev__k">{label}</span>
                          <code className={e.event === "cowrie.command.input" && DANGER.some(r => r.test(e.detail)) ? "is-danger" : ""}>{e.detail}</code>
                          {e.level >= 10 && <span className="sy-pill sy-st--error">regla {e.rule}</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </section>
          </div>
          <div className="wk-drawer__foot">
            <button className="vp-btn" onClick={() => intel(open.ip)}><Crosshair size={13} />Analizar IP</button>
            <HoldButton className="hp-block hp-block--wide" onConfirm={() => block(open.ip)} title="Mantén pulsado para bloquear"><Ban size={13} />Bloquear IP</HoldButton>
          </div>
        </aside>
      </>, document.body)}
    </div>
  );
}
