import { useState } from "react";
import {
  Activity, CalendarRange, FileDown, FileText, Gauge, Globe, Info, Lightbulb, ListChecks, Radar,
  RefreshCw, Server, ShieldCheck, Siren, SlidersHorizontal, Sparkles, Crosshair, Upload,
} from "lucide-react";
import type { ExecutiveDetail } from "../lib/reportApi";
import { AnimatedNumber, Sparkline } from "./premium/widgets";
import "./premium/executive.css";

/**
 * Vista en pantalla del informe ejecutivo (dirección).
 * Todo sale de `detail`, el mismo generador que el Informe SOC: no hay cifras ni frases fijas.
 */

type Props = {
  detail: ExecutiveDetail;
  summary: string;
  reportId: string;
  company: string;
  analyst: string;
  logo: string | null;
  dateStart: string;
  dateEnd: string;
  loading: boolean;
  onPeriod: (start: string, end: string) => void;
  onReload: () => void;
  onExport: () => void;
  onExportTech: () => void;
  onCompany: (v: string) => void;
  onAnalyst: (v: string) => void;
  onLogo: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const RISK_TONE: Record<string, string> = { bajo: "ok", medio: "warn", alto: "high", "crítico": "crit" };
const CTRL_LABEL: Record<string, string> = { covered: "Cubierto", partial: "Parcial", missing: "Carencia" };
const PRIO_LABEL: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString("es-ES");
const fmtDay = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };

function isoDay(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

function RiskRing({ score, tone }: { score: number; tone: string }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg className={`ex-ring ex-tone-${tone}`} viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r={r} className="ex-ring__track" />
      <circle cx="42" cy="42" r={r} className="ex-ring__fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, score) / 100)} />
    </svg>
  );
}

function Bars({ rows, empty }: { rows: { label: string; sub?: string; value: number }[]; empty: string }) {
  if (!rows.length) return <p className="ex-empty">{empty}</p>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <ul className="ex-bars">
      {rows.map(r => (
        <li key={r.label + (r.sub ?? "")}>
          <span className="ex-bars__label" title={r.label}>{r.label}{r.sub && <small>{r.sub}</small>}</span>
          <span className="ex-bars__track"><i style={{ width: `${(r.value * 100) / max}%` }} /></span>
          <b>{nf(r.value)}</b>
        </li>
      ))}
    </ul>
  );
}

function Panel({ icon: Icon, title, aside, children, className = "" }: {
  icon: typeof Activity; title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`ex-panel ${className}`}>
      <header className="ex-panel__head"><Icon size={15} /><h3>{title}</h3>{aside && <span className="ex-panel__aside">{aside}</span>}</header>
      {children}
    </section>
  );
}

export default function ExecutiveView(p: Props) {
  const [custom, setCustom] = useState(false);
  const { risk, alerts: a, honeypot: h, incidents: inc, controls, recommendations, limitations } = p.detail;
  const tone = RISK_TONE[risk.level] ?? "warn";
  const sev = a.by_severity ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const active = (inc.by_status?.open ?? 0) + (inc.by_status?.in_progress ?? 0) + (inc.by_status?.escalated ?? 0);
  const covered = controls.filter(c => c.status === "covered").length;
  const partial = controls.filter(c => c.status === "partial").length;
  const compliance = controls.length ? Math.round(((covered + partial * 0.5) * 100) / controls.length) : 0;
  const topRec = recommendations[0];

  // Veredicto construido solo con datos del periodo
  const verdict = [
    `Riesgo ${risk.level} (${risk.score}/100).`,
    sev.critical ? `${nf(sev.critical)} alertas críticas y ${nf(sev.high)} altas.` : "Sin alertas críticas.",
    h.available && h.intrusions_after_bruteforce ? `${nf(h.intrusions_after_bruteforce)} accesos al honeypot tras fuerza bruta.` : "",
    active ? `${active} incidente(s) siguen abiertos.` : inc.total ? "Todos los incidentes del periodo están cerrados." : "",
  ].filter(Boolean).join(" ");

  const presets: [string, number][] = [["7 días", 6], ["30 días", 29], ["90 días", 89]];

  return (
    <div className="ex">
      <header className="ex-hero">
        <div className="ex-hero__brand">
          <div className="ex-mark">{p.logo ? <img src={p.logo} alt="" /> : <ShieldCheck size={26} />}</div>
          <div>
            <span className="ex-kicker">Informe ejecutivo · Dirección</span>
            <h1>{p.company}</h1>
            <div className="ex-meta">
              <span><CalendarRange size={12} />{p.dateStart && p.dateEnd ? `${fmtDay(p.dateStart)} – ${fmtDay(p.dateEnd)}` : "—"}</span>
              <span className="ex-mono">{p.reportId}</span>
              <span>{p.analyst}</span>
              <span className={`ex-live${p.loading ? " is-loading" : ""}`}><i />{p.loading ? "Actualizando" : "Datos reales"}</span>
            </div>
          </div>
        </div>
        <div className="ex-hero__actions">
          <div className="ex-period">
            {presets.map(([label, days]) => (
              <button key={label} type="button" className={p.dateStart === isoDay(days) && p.dateEnd === isoDay(0) ? "is-on" : ""}
                onClick={() => p.onPeriod(isoDay(days), isoDay(0))}>{label}</button>
            ))}
            <input type="date" value={p.dateStart} max={p.dateEnd} aria-label="Inicio" onChange={e => e.target.value && p.onPeriod(e.target.value, p.dateEnd)} />
            <input type="date" value={p.dateEnd} min={p.dateStart} aria-label="Fin" onChange={e => e.target.value && p.onPeriod(p.dateStart, e.target.value)} />
          </div>
          <div className="ex-btns">
            <button type="button" className="ex-icon" title="Actualizar" onClick={p.onReload}><RefreshCw size={15} className={p.loading ? "ex-spin" : ""} /></button>
            <button type="button" className={`ex-icon${custom ? " is-on" : ""}`} title="Personalizar portada" onClick={() => setCustom(v => !v)}><SlidersHorizontal size={15} /></button>
            <button type="button" className="ex-btn" onClick={p.onExportTech}><FileText size={14} />PDF técnico</button>
            <button type="button" className="ex-btn ex-btn--primary" onClick={p.onExport}><FileDown size={14} />PDF ejecutivo</button>
          </div>
        </div>
        {custom && (
          <div className="ex-custom">
            <label>Organización<input value={p.company} onChange={e => p.onCompany(e.target.value)} /></label>
            <label>Analista<input value={p.analyst} onChange={e => p.onAnalyst(e.target.value)} /></label>
            <label className="ex-upload"><Upload size={14} />Logo para el PDF<input type="file" hidden accept="image/png,image/jpeg" onChange={p.onLogo} /></label>
          </div>
        )}
      </header>

      <div className="ex-kpis">
        <div className={`ex-kpi ex-kpi--risk ex-tone-${tone}`}>
          <RiskRing score={risk.score} tone={tone} />
          <div>
            <span className="ex-kpi__label"><Gauge size={12} />Riesgo</span>
            <b><AnimatedNumber value={risk.score} /><small>/100</small></b>
            <em>{risk.level}</em>
          </div>
        </div>
        <div className="ex-kpi">
          <span className="ex-kpi__label"><Activity size={12} />Alertas</span>
          <b><AnimatedNumber value={a.total ?? 0} /></b>
          <div className="ex-chips">
            <span className="ex-chip ex-tone-crit">{nf(sev.critical)} críticas</span>
            <span className="ex-chip ex-tone-high">{nf(sev.high)} altas</span>
          </div>
          <Sparkline points={(a.per_day ?? []).map(d => d.count)} />
        </div>
        <div className="ex-kpi">
          <span className="ex-kpi__label"><Siren size={12} />Incidentes</span>
          <b><AnimatedNumber value={inc.total ?? 0} /></b>
          <em>{inc.resolved ?? 0} resueltos · {active} abiertos</em>
          <em>MTTR {inc.mttr_minutes != null ? `${nf(inc.mttr_minutes)} min` : "sin cierres"}{inc.sla_met_pct != null ? ` · SLA ${inc.sla_met_pct}%` : ""}</em>
        </div>
        <div className="ex-kpi">
          <span className="ex-kpi__label"><ListChecks size={12} />Cumplimiento ISO/ENS</span>
          <b><AnimatedNumber value={compliance} /><small>%</small></b>
          <span className="ex-meter"><i style={{ width: `${compliance}%` }} /></span>
          <em>{covered} cubiertos · {partial} parciales · {controls.length - covered - partial} carencias</em>
        </div>
      </div>

      <div className="ex-row ex-row--2">
        <Panel icon={Sparkles} title="Resumen" aside={p.detail.ai_summary ? "Redactado con IA local · revisar" : "Resumen cuantitativo"}>
          <p className="ex-summary">{p.summary}</p>
          <div className={`ex-verdict ex-tone-${tone}`}>
            <strong>Valoración</strong>
            <p>{verdict}</p>
            {topRec && <p className="ex-verdict__next"><Lightbulb size={13} />Prioridad: {topRec.text}</p>}
          </div>
        </Panel>
        <Panel icon={Radar} title="Honeypot" aside={h.available ? `${nf(h.sessions)} sesiones` : "sin datos"}>
          {h.available ? (
            <>
              <dl className="ex-stats">
                <div><dt>Logins fallidos</dt><dd>{nf(h.login_failed)}</dd></div>
                <div><dt>Logins aceptados</dt><dd>{nf(h.login_success)}</dd></div>
                <div><dt>Fuerza bruta</dt><dd>{nf(h.bruteforce_detections)}</dd></div>
                <div><dt>Intrusiones</dt><dd className={h.intrusions_after_bruteforce ? "is-bad" : ""}>{nf(h.intrusions_after_bruteforce)}</dd></div>
              </dl>
              <span className="ex-sub">Credenciales más probadas</span>
              <div className="ex-creds">
                {(h.top_passwords ?? []).length
                  ? h.top_passwords.map(c => <code key={c.value}>{c.value}<small>×{c.count}</small></code>)
                  : <p className="ex-empty">Sin intentos de login en el periodo.</p>}
              </div>
            </>
          ) : <p className="ex-empty">El indexador no respondió para este periodo.</p>}
        </Panel>
      </div>

      <div className="ex-row ex-row--3">
        <Panel icon={Server} title="Activos más afectados">
          <Bars rows={(a.top_agents ?? []).map(g => ({ label: g.name, sub: g.ip || undefined, value: g.count }))} empty="Ningún agente generó alertas." />
        </Panel>
        <Panel icon={Crosshair} title="Tácticas MITRE ATT&CK">
          <Bars rows={(a.mitre_tactics ?? []).slice(0, 6).map(t => ({ label: t.tactic, value: t.count }))} empty="Sin técnicas MITRE asociadas." />
        </Panel>
        <Panel icon={Globe} title="Origen de los ataques">
          {(a.countries ?? []).length
            ? <Bars rows={a.countries.slice(0, 6).map(c => ({ label: c.country, value: c.count }))} empty="" />
            : (
              <>
                <p className="ex-empty">Sin geolocalización: las IP del periodo son privadas (laboratorio). Principales orígenes:</p>
                <Bars rows={(a.top_attackers ?? []).slice(0, 4).map(x => ({ label: x.ip, value: x.count }))} empty="Sin IP atacantes." />
              </>
            )}
        </Panel>
      </div>

      <Panel icon={ListChecks} title="Controles ISO/IEC 27001 · ENS" aside={`${controls.length} evaluados con evidencias del sistema`}>
        <ul className="ex-controls">
          {controls.map(c => (
            <li key={c.iso}>
              <span className="ex-mono ex-controls__code">{c.iso}<small>{c.ens}</small></span>
              <div><strong>{c.control}</strong><p>{c.evidence}</p></div>
              <span className={`ex-pill ex-ctl-${c.status}`}>{CTRL_LABEL[c.status] ?? c.status}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel icon={Lightbulb} title="Recomendaciones" aside="Derivadas de los datos del periodo">
        {recommendations.length ? (
          <ol className="ex-recs">
            {recommendations.map((r, i) => (
              <li key={i}>
                <span className={`ex-pill ex-prio-${r.priority}`}>{PRIO_LABEL[r.priority] ?? r.priority}</span>
                <div><strong>{r.text}</strong><p>{r.reason}</p></div>
              </li>
            ))}
          </ol>
        ) : <p className="ex-empty">Sin recomendaciones: ningún indicador supera los umbrales.</p>}
      </Panel>

      {limitations.length > 0 && (
        <footer className="ex-limits">
          <Info size={14} />
          <div><strong>Limitaciones del informe</strong>{limitations.map((l, i) => <p key={i}>{l}</p>)}</div>
        </footer>
      )}
    </div>
  );
}
