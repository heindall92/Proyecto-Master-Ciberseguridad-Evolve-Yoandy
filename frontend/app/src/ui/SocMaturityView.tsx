import { useEffect, useState } from "react";
import {
  BarChart3, Clock, Crosshair, Download, Hourglass, Info, Play, RefreshCw, Search, ShieldCheck, Target, Users,
} from "lucide-react";
import { getSocMetrics, getNavigatorLayer, listHuntQueries, runHuntQuery, type SocMetrics } from "../lib/api";
import { KpiCard, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/** Bifröst: métricas del SOC y consola de threat hunting sobre los datos reales de Wazuh. */

const SEV_ES: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
// Valor + unidad para las tarjetas (antes se mostraban minutos sin unidad: «1997»)
const kpiTime = (m: number): [number, string] => (m >= 1440 ? [Math.round(m / 144) / 10, "d"] : m >= 60 ? [Math.round(m / 60), "h"] : [m, "min"]);
const fmtMin = (m: number) => (m >= 1440 ? `${(m / 1440).toFixed(1)} d` : m >= 60 ? `${(m / 60).toFixed(1)} h` : `${m} min`);
const isIp = (v: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v);

export default function SocMaturityView({ lang = "es" }: { lang?: string }) {
  const es = lang === "es";
  const [m, setM] = useState<SocMetrics | null>(null);
  const [queries, setQueries] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [active, setActive] = useState("");
  const [hours, setHours] = useState(168);
  const [res, setRes] = useState<{ name: string; type: string; count: number; results: any[] } | null>(null);
  const [running, setRunning] = useState(false);

  const load = () => {
    getSocMetrics().then(setM).catch(() => setM(null));
    listHuntQueries().then(q => { setQueries(q); if (q.length && !active) setActive(q[0].id); }).catch(() => setQueries([]));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (id = active, h = hours) => {
    if (!id) return;
    setRunning(true); setRes(null);
    try { setRes(await runHuntQuery(id, h)); }
    catch (e) { toast(`No se pudo ejecutar la consulta: ${e instanceof Error ? e.message : e}`, "err"); }
    finally { setRunning(false); }
  };
  useEffect(() => { if (active) run(active, hours); }, [active, hours]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportNavigator = async () => {
    try {
      const layer = await getNavigatorLayer(720);
      const url = URL.createObjectURL(new Blob([JSON.stringify(layer, null, 2)], { type: "application/json" }));
      Object.assign(document.createElement("a"), { href: url, download: "valhalla-attack-navigator.json" }).click(); URL.revokeObjectURL(url);
      toast(es ? "Capa descargada: ábrela en MITRE ATT&CK Navigator." : "Layer downloaded.", "ok");
    } catch { toast(es ? "No se pudo generar la capa." : "Could not build layer.", "err"); }
  };
  const exportCsv = () => {
    if (!res) return;
    const rows = res.type === "documents" ? res.results.map(r => [r.timestamp, r.src_ip, r.command]) : res.results.map(r => [r.value, r.count]);
    const head = res.type === "documents" ? "fecha,ip,comando" : "valor,eventos";
    const csv = [head, ...rows.map(r => r.map((v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `hunting-${active}.csv` }).click(); URL.revokeObjectURL(url);
  };

  const sevTotal = Object.values(m?.by_severity ?? {}).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...(res?.type === "aggregation" ? res.results.map(r => r.count) : [1]));
  const cur = queries.find(q => q.id === active);

  return (
    <div className="view in bf">
      <div className="wk-head">
        <div><h1>Bifröst</h1><p>{es ? "Métricas del SOC y caza de amenazas sobre los datos reales" : "SOC metrics and threat hunting"}</p></div>
        <div className="in-bar">
          <button type="button" className="vp-btn" onClick={exportNavigator} title={es ? "Técnicas observadas (30 días) para MITRE ATT&CK Navigator" : "ATT&CK Navigator layer"}><Download size={14} />ATT&CK Navigator</button>
          <button type="button" className="wk-iconbtn" onClick={load} title={es ? "Actualizar" : "Refresh"} aria-label={es ? "Actualizar" : "Refresh"}><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="in-body">
        <div className="in-vulns">
          <div className="in-kpis">
            <KpiCard icon={Clock} label="MTTR" value={kpiTime(m?.mttr_minutes ?? 0)[0]} unit={m?.tickets.closed ? kpiTime(m.mttr_minutes)[1] : undefined} sub={m?.tickets.closed ? `${fmtMin(m.mttr_minutes)} de media hasta resolver` : (es ? "Sin incidentes resueltos todavía" : "No resolved incidents yet")} tone="info" />
            <KpiCard icon={Hourglass} label={es ? "Antigüedad de abiertos" : "Open dwell"} value={kpiTime(m?.dwell_open_avg_minutes ?? 0)[0]} unit={kpiTime(m?.dwell_open_avg_minutes ?? 0)[1]} sub={m ? `${fmtMin(m.dwell_open_avg_minutes)} de media · ${m.tickets.open} abiertos` : ""} tone="warning" />
            <KpiCard icon={Target} label={es ? "Tasa de resolución" : "Resolution rate"} value={m?.tickets.resolution_rate_pct ?? 0} unit="%" sub={m ? `${m.tickets.closed} de ${m.tickets.total} incidentes` : ""} tone={(m?.tickets.resolution_rate_pct ?? 0) >= 80 ? "ok" : "danger"} />
            <KpiCard icon={ShieldCheck} label={es ? "Cobertura ATT&CK" : "ATT&CK coverage"} value={m?.attack_coverage_pct ?? 0} unit="%" sub={m?.techniques_total ? `${m.techniques_covered} de ${m.techniques_total} técnicas con regla` : "—"} tone="accent" />
          </div>

          <div className="bf-row">
            <section className="in-panel">
              <header className="in-watch__head"><BarChart3 size={15} /><h3>{es ? "Incidentes por severidad" : "Incidents by severity"}</h3><span className="in-count">{sevTotal}</span></header>
              <ul className="ex-bars bf-pad">
                {["critical", "high", "medium", "low"].map(s => (
                  <li key={s}><span className="ex-bars__label">{SEV_ES[s]}</span><span className="ex-bars__track"><i className={`bf-sev--${s}`} style={{ width: `${((m?.by_severity[s] ?? 0) * 100) / Math.max(1, sevTotal)}%` }} /></span><b>{m?.by_severity[s] ?? 0}</b></li>
                ))}
              </ul>
            </section>
            <section className="in-panel">
              <header className="in-watch__head"><Users size={15} /><h3>{es ? "Resueltos por analista" : "Resolved by analyst"}</h3></header>
              {m?.tickets_by_analyst.length ? (
                <ul className="ex-bars bf-pad">{m.tickets_by_analyst.map(a => <li key={a.analyst}><span className="ex-bars__label">{a.analyst}</span><span className="ex-bars__track"><i style={{ width: `${(a.closed * 100) / Math.max(1, m.tickets.closed)}%` }} /></span><b>{a.closed}</b></li>)}</ul>
              ) : <p className="in-empty">{es ? "Aún no hay incidentes resueltos." : "No resolved incidents yet."}</p>}
            </section>
            <section className="in-panel">
              <header className="in-watch__head"><Crosshair size={15} /><h3>{es ? "Técnicas observadas (7 d)" : "Techniques seen (7 d)"}</h3></header>
              <div className="in-tags bf-pad">{m?.techniques_seen.length ? m.techniques_seen.map(t => <span key={t}>{t}</span>) : <span className="in-muted">—</span>}</div>
              <p className="in-muted bf-pad">{(m?.alerts_24h ?? 0).toLocaleString("es-ES")} {es ? "alertas en 24 h" : "alerts in 24 h"}</p>
            </section>
          </div>

          <section className="in-panel bf-hunt">
            <header className="in-watch__head"><Search size={15} /><h3>Threat hunting</h3>
              <div className="in-seg bf-win" role="group" aria-label={es ? "Ventana" : "Window"}>{[24, 168, 720].map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>{h === 24 ? "24 h" : h === 168 ? "7 d" : "30 d"}</button>)}</div>
            </header>
            <div className="bf-hunt__body">
              <ul className="bf-queries" role="listbox" aria-label={es ? "Consultas" : "Queries"}>
                {queries.map(q => (
                  <li key={q.id}><button type="button" role="option" aria-selected={active === q.id} className={active === q.id ? "is-on" : ""} onClick={() => setActive(q.id)}><b>{q.name}</b><small>{q.description}</small></button></li>
                ))}
              </ul>
              <div className="bf-result">
                <div className="bf-result__head">
                  <b>{cur?.name}</b>
                  <span className="in-muted">{running ? (es ? "Ejecutando…" : "Running…") : res ? `${res.count} ${es ? "resultados" : "results"}` : ""}</span>
                  <button type="button" className="wk-iconbtn" onClick={() => run()} title={es ? "Volver a ejecutar" : "Run again"} aria-label={es ? "Ejecutar" : "Run"}><Play size={14} /></button>
                  <button type="button" className="wk-iconbtn" onClick={exportCsv} disabled={!res?.count} title={es ? "Exportar CSV" : "Export CSV"} aria-label="CSV"><Download size={14} /></button>
                </div>
                {!res ? <p className="in-empty">{running ? "…" : ""}</p> : !res.count ? (
                  <p className="in-empty">{es ? "Sin resultados en esta ventana: en el laboratorio no hubo esa actividad." : "No results."}</p>
                ) : res.type === "documents" ? (
                  <ul className="in-engines">{res.results.map((r, i) => <li key={i}><code>{r.command}</code><span className="in-muted">{r.src_ip} · {new Date(r.timestamp).toLocaleString("es-ES")}</span></li>)}</ul>
                ) : (
                  <ul className="ex-bars">
                    {res.results.map(r => (
                      <li key={r.value}>
                        <span className="ex-bars__label">{isIp(String(r.value))
                          ? <button type="button" className="wk-link" onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-intel", { detail: { ip: r.value } }))} title={es ? "Analizar en Inteligencia" : "Analyze"}>{r.value}</button>
                          : r.value}</span>
                        <span className="ex-bars__track"><i style={{ width: `${(r.count * 100) / max}%` }} /></span>
                        <b>{r.count.toLocaleString("es-ES")}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
          <p className="in-foot"><Info size={12} />{es
            ? "MTTR: media entre la creación y la resolución real de cada incidente. Cobertura ATT&CK: técnicas con al menos una regla en el ruleset de Wazuh (misma cifra que el Informe GRC). Las consultas excluyen las alertas generadas por la propia IA."
            : "MTTR uses real resolution time. ATT&CK coverage matches the GRC report."}</p>
        </div>
      </div>
    </div>
  );
}
