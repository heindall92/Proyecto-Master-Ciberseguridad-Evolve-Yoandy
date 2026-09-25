import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange, ClipboardList, Crosshair, FileJson, Gauge, Grid3x3, Info, Landmark, ListChecks,
  Printer, RefreshCw, Search, ShieldCheck, Radar,
} from "lucide-react";
import { fetchGrcReport, type GrcReport as GrcData, type GrcTechnique } from "../lib/reportApi";
import { AnimatedNumber } from "./premium/widgets";
import "./premium/executive.css";
import "./premium/grc.css";

/**
 * Informe GRC (gobierno, riesgo y cumplimiento). Sustituye a Heimdall en el Centro de informes.
 * Todo sale de /api/reports/grc: escenarios con su justificación, fórmulas en "Metodología".
 */

const LEVEL_TONE: Record<string, string> = { bajo: "ok", medio: "warn", alto: "high", "crítico": "crit" };
const CTRL_LABEL: Record<string, string> = { covered: "Cubierto", partial: "Parcial", missing: "Carencia" };
const PRIO_LABEL: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
const IMPACT_LABEL = ["", "Mínimo", "Menor", "Moderado", "Mayor", "Grave"];
const PROB_LABEL = ["", "Rara", "Improbable", "Posible", "Probable", "Casi segura"];
type MitreView = "observed" | "coverage" | "intel";

const isoDay = (offset: number) => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
const fmtDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const cellLevel = (p: number, i: number) => { const s = p * i; return s >= 15 ? "crit" : s >= 10 ? "high" : s >= 5 ? "warn" : "ok"; };

function RiskMatrix({ data }: { data: GrcData }) {
  return (
    <div className="grc-matrix" role="table" aria-label="Matriz de riesgo probabilidad por impacto">
      <span className="grc-matrix__axis grc-matrix__axis--y">Impacto</span>
      <div className="grc-matrix__grid">
        {[5, 4, 3, 2, 1].map(imp => (
          <div className="grc-matrix__row" role="row" key={imp}>
            <span className="grc-matrix__lbl" role="rowheader">{imp}<small>{IMPACT_LABEL[imp]}</small></span>
            {[1, 2, 3, 4, 5].map(prob => {
              const here = data.scenarios.filter(s => s.impact === imp && s.probability === prob);
              return (
                <div key={prob} role="cell" className={`grc-cell grc-lv-${cellLevel(prob, imp)}`} title={`P${prob} × I${imp} = ${prob * imp}`}>
                  {here.map(s => <span key={s.id} className="grc-chip" title={s.title}>{s.id}</span>)}
                </div>
              );
            })}
          </div>
        ))}
        <div className="grc-matrix__row grc-matrix__row--foot">
          <span />
          {[1, 2, 3, 4, 5].map(p => <span key={p} className="grc-matrix__lbl">{p}<small>{PROB_LABEL[p]}</small></span>)}
        </div>
      </div>
      <span className="grc-matrix__axis grc-matrix__axis--x">Probabilidad</span>
    </div>
  );
}

function RadarChart({ items }: { items: GrcData["nist_csf"] }) {
  const size = 260, c = size / 2, r = 92, n = items.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
  };
  const poly = (v: (i: number) => number) => items.map((_, i) => pt(i, v(i)).join(",")).join(" ");
  return (
    <svg className="grc-radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Madurez por función NIST CSF 2.0">
      {[0.25, 0.5, 0.75, 1].map(k => <polygon key={k} className="grc-radar__ring" points={poly(() => k)} />)}
      {items.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} className="grc-radar__axis" x1={c} y1={c} x2={x} y2={y} />; })}
      <polygon className="grc-radar__area" points={poly(i => Math.max(0.02, items[i].score / 100))} />
      {items.map((it, i) => { const [x, y] = pt(i, it.score / 100); return <circle key={it.code} className="grc-radar__dot" cx={x} cy={y} r={3.2} />; })}
      {items.map((it, i) => {
        const [x, y] = pt(i, 1.2);
        return (
          <text key={it.code} x={x} y={y} className="grc-radar__label" textAnchor={Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end"} dominantBaseline="middle">
            {it.function} <tspan className="grc-radar__val">{it.score}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

function MitreMatrix({ data }: { data: GrcData }) {
  const [view, setView] = useState<MitreView>("intel");
  const [q, setQ] = useState("");
  const cov = data.attack.coverage;
  const observed = useMemo(() => {
    const m = new Map<string, number>();
    data.attack.observed.forEach(o => { const p = o.id.split(".")[0]; m.set(p, (m.get(p) ?? 0) + o.count); });
    return m;
  }, [data]);
  if (!cov) return <p className="ex-empty">La API de Wazuh no respondió: no se puede mostrar la cobertura del ruleset.</p>;

  const cls = (t: GrcTechnique) => {
    const obs = observed.has(t.id);
    if (view === "observed") return obs ? "grc-t--obs" : "grc-t--none";
    if (view === "coverage") return `grc-t--${t.coverage}`;
    return obs && t.coverage === "none" ? "grc-t--gap" : obs ? "grc-t--obs" : `grc-t--${t.coverage}`;
  };
  const visible = (t: GrcTechnique) => {
    if (q && !`${t.id} ${t.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (view === "observed") return observed.has(t.id);
    return true;
  };
  const legend: Record<MitreView, [string, string][]> = {
    observed: [["grc-t--obs", "Observada en el periodo"]],
    coverage: [["grc-t--high", "Alta (≥3 reglas)"], ["grc-t--partial", "Parcial (1-2)"], ["grc-t--none", "Sin regla"]],
    intel: [["grc-t--obs", "Observada"], ["grc-t--gap", "Observada sin regla"], ["grc-t--high", "Cubierta"], ["grc-t--partial", "Parcial"], ["grc-t--none", "Sin regla"]],
  };

  return (
    <>
      <div className="grc-mitre__bar">
        <div className="ex-period" role="tablist" aria-label="Vista de la matriz">
          {([["observed", "Observadas"], ["coverage", "Cobertura"], ["intel", "Inteligencia"]] as [MitreView, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "is-on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <label className="grc-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="T1110, Brute Force…" aria-label="Buscar técnica" /></label>
        <div className="grc-legend">{legend[view].map(([c, l]) => <span key={c}><i className={`grc-sw ${c}`} />{l}</span>)}</div>
      </div>
      <div className="grc-mitre" role="region" aria-label="Matriz MITRE ATT&CK">
        {cov.tactics.map(col => {
          const shown = col.techniques.filter(visible);
          const covered = col.techniques.filter(t => t.coverage !== "none").length;
          const seen = col.techniques.filter(t => observed.has(t.id)).length;
          return (
            <div className="grc-col" key={col.id}>
              <header><strong>{col.name}</strong><small>{view === "observed" ? `${seen} observadas` : `${covered}/${col.techniques.length} cubiertas`}</small></header>
              {shown.map(t => (
                <div key={t.id} className={`grc-t ${cls(t)}`} title={`${t.id} ${t.name}\n${t.rules} regla(s)${t.rule_ids.length ? `: ${t.rule_ids.join(", ")}` : ""}${observed.has(t.id) ? `\n${observed.get(t.id)} alertas en el periodo` : ""}`}>
                  <span className="grc-t__id">{t.id}{observed.has(t.id) && <b>×{observed.get(t.id)}</b>}</span>
                  <span className="grc-t__name">{t.name}</span>
                </div>
              ))}
              {!shown.length && <p className="grc-col__empty">{view === "observed" ? "Ninguna" : "Sin resultados"}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function GrcReport() {
  const [start, setStart] = useState(isoDay(29));
  const [end, setEnd] = useState(isoDay(0));
  const [data, setData] = useState<GrcData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (s = start, e = end) => {
    setLoading(true); setError(null);
    fetchGrcReport(`${s}T00:00:00`, `${e}T23:59:59`)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setPeriod = (s: string, e: string) => { setStart(s); setEnd(e); if (s && e && s <= e) load(s, e); };

  const exportJson = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `valhalla-grc-${start}_${end}.json` });
    a.click(); URL.revokeObjectURL(url);
  };

  if (!data) return (
    <div className="ex-state">
      {error ? <><strong>No se pudo cargar el informe GRC</strong><p>{error}</p><button type="button" className="ex-btn" onClick={() => load()}>Reintentar</button></>
        : <span className="ex-state__spin" aria-label="Cargando" />}
    </div>
  );

  const k = data.kpis;
  const tone = LEVEL_TONE[k.residual_risk.level] ?? "warn";
  const presets: [string, number][] = [["7 días", 6], ["30 días", 29], ["90 días", 89]];
  const deadline = (days: number) => { const d = new Date(data.meta.generated_at); d.setDate(d.getDate() + days); return d.toLocaleDateString("es-ES"); };

  return (
    <div className="ex grc">
      {error && <div className="ex-error">{error}</div>}
      <header className="ex-hero">
        <div className="ex-hero__brand">
          <div className="ex-mark"><Landmark size={26} /></div>
          <div>
            <span className="ex-kicker">Informe GRC · Gobierno, riesgo y cumplimiento</span>
            <h1>Valhalla SOC</h1>
            <div className="ex-meta">
              <span><CalendarRange size={12} />{fmtDay(data.meta.period_start)} – {fmtDay(data.meta.period_end)}</span>
              <span>ISO/IEC 27001:2022 · ENS · NIST CSF 2.0 · MITRE ATT&CK</span>
              <span className={`ex-live${loading ? " is-loading" : ""}`}><i />{loading ? "Actualizando" : "Datos reales"}</span>
            </div>
          </div>
        </div>
        <div className="ex-hero__actions">
          <div className="ex-period">
            {presets.map(([label, days]) => (
              <button key={label} type="button" className={start === isoDay(days) && end === isoDay(0) ? "is-on" : ""} onClick={() => setPeriod(isoDay(days), isoDay(0))}>{label}</button>
            ))}
            <input type="date" value={start} max={end} aria-label="Inicio" onChange={e => e.target.value && setPeriod(e.target.value, end)} />
            <input type="date" value={end} min={start} aria-label="Fin" onChange={e => e.target.value && setPeriod(start, e.target.value)} />
          </div>
          <div className="ex-btns">
            <button type="button" className="ex-icon" title="Actualizar" aria-label="Actualizar" onClick={() => load()}><RefreshCw size={15} className={loading ? "ex-spin" : ""} /></button>
            <button type="button" className="ex-icon" title="Descargar JSON" aria-label="Descargar JSON" onClick={exportJson}><FileJson size={15} /></button>
            <button type="button" className="ex-btn ex-btn--primary" onClick={() => window.print()}><Printer size={14} />Imprimir / PDF</button>
          </div>
        </div>
      </header>

      <div className="ex-kpis">
        <div className={`ex-kpi ex-tone-${tone}`}>
          <span className="ex-kpi__label"><Gauge size={12} />Riesgo residual</span>
          <b><AnimatedNumber value={k.residual_risk.score} /><small>/100</small></b>
          <em style={{ color: "var(--tone)", textTransform: "capitalize", fontWeight: 700 }}>{k.residual_risk.level}</em>
        </div>
        <div className="ex-kpi">
          <span className="ex-kpi__label"><ListChecks size={12} />Cumplimiento ISO/ENS</span>
          <b><AnimatedNumber value={k.compliance_pct} /><small>%</small></b>
          <span className="ex-meter"><i style={{ width: `${k.compliance_pct}%` }} /></span>
        </div>
        <div className="ex-kpi">
          <span className="ex-kpi__label"><Crosshair size={12} />Cobertura ATT&CK</span>
          <b>{k.attack_coverage_pct != null ? <><AnimatedNumber value={Math.round(k.attack_coverage_pct)} /><small>%</small></> : "—"}</b>
          <em>{data.attack.coverage ? `${data.attack.coverage.techniques_covered} de ${data.attack.coverage.techniques_total} técnicas con regla` : "Wazuh no disponible"}</em>
        </div>
        <div className="ex-kpi">
          <span className="ex-kpi__label"><ClipboardList size={12} />Plan de tratamiento</span>
          <b><AnimatedNumber value={k.open_actions} /></b>
          <em>acciones abiertas · {k.scenarios_high} riesgos altos/críticos</em>
        </div>
      </div>

      <div className="ex-row ex-row--2 grc-row">
        <section className="ex-panel">
          <header className="ex-panel__head"><Grid3x3 size={15} /><h3>Matriz de riesgo 5×5</h3><span className="ex-panel__aside">{data.scenarios.length} escenarios</span></header>
          <RiskMatrix data={data} />
        </section>
        <section className="ex-panel">
          <header className="ex-panel__head"><Radar size={15} /><h3>Madurez NIST CSF 2.0</h3><span className="ex-panel__aside">0-100 por función</span></header>
          <RadarChart items={data.nist_csf} />
        </section>
      </div>

      <section className="ex-panel">
        <header className="ex-panel__head"><ShieldCheck size={15} /><h3>Escenarios de riesgo</h3><span className="ex-panel__aside">Ordenados por nivel</span></header>
        <div className="grc-table-wrap">
          <table className="grc-table">
            <thead><tr><th>ID</th><th>Riesgo</th><th>P</th><th>I</th><th>Nivel</th><th>Tratamiento</th><th>Responsable</th></tr></thead>
            <tbody>
              {data.scenarios.map(s => (
                <tr key={s.id}>
                  <td className="ex-mono">{s.id}</td>
                  <td><strong>{s.title}</strong><p>{s.justification}</p></td>
                  <td className="ex-mono">{s.probability}</td>
                  <td className="ex-mono">{s.impact}</td>
                  <td><span className={`ex-pill ex-tone-${LEVEL_TONE[s.level]}`}>{s.level} · {s.score}</span></td>
                  <td>{s.treatment}</td>
                  <td>{s.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ex-panel">
        <header className="ex-panel__head">
          <Crosshair size={15} /><h3>Matriz MITRE ATT&CK</h3>
          <span className="ex-panel__aside">
            {data.attack.coverage ? `${data.attack.coverage.rules_with_mitre} de ${data.attack.coverage.rules_total} reglas con técnica` : ""}
            {data.attack.observed_gap.length > 0 && ` · ${data.attack.observed_gap.length} observadas sin regla`}
          </span>
        </header>
        <MitreMatrix data={data} />
      </section>

      <section className="ex-panel">
        <header className="ex-panel__head"><ListChecks size={15} /><h3>Cumplimiento ISO/IEC 27001 · ENS</h3><span className="ex-panel__aside">{data.controls.length} controles evaluados con evidencias</span></header>
        <ul className="ex-controls">
          {data.controls.map(c => (
            <li key={c.iso}>
              <span className="ex-mono ex-controls__code">{c.iso}<small>{c.ens}</small></span>
              <div><strong>{c.control}</strong><p>{c.evidence}</p></div>
              <span className={`ex-pill ex-ctl-${c.status}`}>{CTRL_LABEL[c.status] ?? c.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ex-panel">
        <header className="ex-panel__head"><ClipboardList size={15} /><h3>Plan de tratamiento del riesgo</h3><span className="ex-panel__aside">Plazo según prioridad</span></header>
        {data.plan.length ? (
          <div className="grc-table-wrap">
            <table className="grc-table">
              <thead><tr><th>Prioridad</th><th>Acción</th><th>Responsable</th><th>Plazo</th><th>Estado</th></tr></thead>
              <tbody>
                {data.plan.map((p, i) => (
                  <tr key={i}>
                    <td><span className={`ex-pill ex-prio-${p.priority}`}>{PRIO_LABEL[p.priority] ?? p.priority}</span></td>
                    <td><strong>{p.action}</strong><p>{p.reason}</p></td>
                    <td>{p.owner}</td>
                    <td className="ex-mono">{deadline(p.deadline_days)}<small className="grc-sub"> ({p.deadline_days} d)</small></td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ex-empty">Sin acciones: ningún indicador supera los umbrales.</p>}
      </section>

      <footer className="ex-limits">
        <Info size={14} />
        <div>
          <strong>Metodología</strong>
          {Object.entries(data.method).map(([key, v]) => <p key={key}>{v}</p>)}
          {data.limitations.length > 0 && <><strong style={{ marginTop: 8 }}>Limitaciones</strong>{data.limitations.map((l, i) => <p key={i}>{l}</p>)}</>}
        </div>
      </footer>
    </div>
  );
}
