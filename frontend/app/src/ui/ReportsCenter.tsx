import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileBarChart, FileText, Radar, Plus, Clock, ShieldCheck, ShieldAlert, Fingerprint, Printer, FileJson, Table2,
  CalendarRange, Bot, Loader2, History, Gauge, Layers, Target, Bug, Siren, Ban, ClipboardCheck, Lightbulb, BookOpen, Info,
  ExternalLink, Copy,
} from "lucide-react";
import { listReports, generateReport, getReport, verifyReport, type ReportSummary, type ReportData, type ReportTLP } from "../lib/api";
import { toast } from "./premium/widgets";
import ExecutiveReport from "./ExecutiveReport";
import HeimdallReportView from "./HeimdallReportView";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/reports.css";

type Lang = "es" | "en";
type Tab = "soc" | "executive" | "intel";

const TLP: { id: ReportTLP; es: string; en: string }[] = [
  { id: "CLEAR", es: "Público", en: "Public" },
  { id: "GREEN", es: "Comunidad", en: "Community" },
  { id: "AMBER", es: "Organización", en: "Organisation" },
  { id: "RED", es: "Solo destinatarios", en: "Recipients only" },
];
const PRESETS = [{ d: 1, es: "24 h", en: "24 h" }, { d: 7, es: "7 días", en: "7 days" }, { d: 30, es: "30 días", en: "30 days" }];
const SEV_ES: Record<string, string> = { critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo" };
const STATUS_ES: Record<string, string> = { open: "Triaje", in_progress: "Investigación", escalated: "Contención", resolved: "Resuelto" };
const CLASS_ES: Record<string, string> = { true_positive: "Verdadero positivo", false_positive: "Falso positivo", benign: "Benigno" };
const CTRL_ES: Record<string, string> = { covered: "Cubierto", partial: "Parcial", missing: "No cubierto" };
const PRIO_ES: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fmtDate = (iso: string, lang: Lang, time = true) =>
  new Date(iso).toLocaleString(lang, time ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "long", year: "numeric" });
const mitreUrl = (id: string) => { const m = id.match(/^T(\d{4})(?:\.(\d{3}))?$/); return m ? `https://attack.mitre.org/techniques/T${m[1]}/${m[2] ? `${m[2]}/` : ""}` : null; };
const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : "—");

function Chapter({ num, icon: Icon, title, children }: { num: string; icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rc-ch">
      <h2 className="rc-ch__title"><span className="rc-ch__num">{num}</span><Icon size={16} />{title}</h2>
      {children}
    </section>
  );
}

function Bars({ rows, max, tone }: { rows: { label: string; value: number; sub?: string }[]; max?: number; tone?: string }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="rc-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="rc-bars__label" title={r.label}>{r.label}{r.sub && <small>{r.sub}</small>}</span>
          <span className="rc-bars__track"><span className="rc-bars__fill" style={{ width: `${(r.value / top) * 100}%`, background: tone }} /></span>
          <b>{r.value.toLocaleString()}</b>
        </li>
      ))}
    </ul>
  );
}

function SocDocument({ report, lang }: { report: ReportSummary & { data: ReportData }; lang: Lang }) {
  const d = report.data;
  const a = d.alerts || {};
  const h = d.honeypot || {};
  const inc = d.incidents || {};
  const es = lang === "es";
  const sev = a.by_severity || {};
  const maxDay = Math.max(...(a.per_day || []).map((x: any) => x.count), 1);

  return (
    <article className="rc-doc" id="rc-print">
      <header className="rc-cover">
        <div className="rc-cover__brand"><ShieldCheck size={22} />Valhalla SOC</div>
        <h1>{es ? "Informe de operaciones de seguridad" : "Security operations report"}</h1>
        <p className="rc-cover__period">{fmtDate(d.meta.period_start, lang, false)} — {fmtDate(d.meta.period_end, lang, false)}</p>
        <div className="rc-cover__meta">
          <span className={`rc-tlp rc-tlp--${report.tlp}`}>TLP:{report.tlp}</span>
          <span>{report.report_id}</span>
          <span>{es ? "Autor" : "Author"}: {report.created_by}</span>
        </div>
      </header>

      <Chapter num="00" icon={Fingerprint} title={es ? "Control documental" : "Document control"}>
        <table className="rc-kv"><tbody>
          <tr><th>{es ? "Identificador" : "Identifier"}</th><td>{report.report_id} · v{d.meta.version}</td></tr>
          <tr><th>{es ? "Periodo analizado" : "Period"}</th><td>{fmtDate(d.meta.period_start, lang)} — {fmtDate(d.meta.period_end, lang)}</td></tr>
          <tr><th>{es ? "Generado" : "Generated"}</th><td>{fmtDate(d.meta.generated_at, lang)} · {report.created_by}</td></tr>
          <tr><th>{es ? "Clasificación" : "Classification"}</th><td>TLP:{report.tlp} — {TLP.find((t) => t.id === report.tlp)?.[lang]}</td></tr>
          <tr><th>{es ? "Huella SHA-256" : "SHA-256 fingerprint"}</th><td className="rc-mono">{report.sha256}</td></tr>
          <tr><th>{es ? "Modelo de IA" : "AI model"}</th><td>{d.ai_summary ? `${d.meta.ai_model} (local, Ollama)` : (es ? "No utilizado" : "Not used")}</td></tr>
        </tbody></table>
      </Chapter>

      <Chapter num="01" icon={Gauge} title={es ? "Resumen ejecutivo" : "Executive summary"}>
        <div className="rc-kpis">
          <div className={`rc-kpi rc-risk--${d.risk?.level}`}><span>{es ? "Riesgo" : "Risk"}</span><b>{d.risk?.score}<small>/100</small></b><em>{d.risk?.level}</em></div>
          <div className="rc-kpi"><span>{es ? "Alertas" : "Alerts"}</span><b>{n(a.total)}</b><em>{n(sev.critical)} {es ? "críticas" : "critical"} · {n(sev.high)} {es ? "altas" : "high"}</em></div>
          <div className="rc-kpi"><span>{es ? "Incidentes" : "Incidents"}</span><b>{n(inc.total)}</b><em>{n(inc.resolved)} {es ? "resueltos" : "resolved"}</em></div>
          <div className="rc-kpi"><span>MTTR</span><b>{inc.mttr_minutes == null ? "—" : `${inc.mttr_minutes}′`}</b><em>{es ? "tiempo medio de resolución" : "mean time to resolve"}</em></div>
          <div className="rc-kpi"><span>SLA</span><b>{inc.sla_met_pct == null ? "—" : `${inc.sla_met_pct}%`}</b><em>{es ? "cumplido" : "met"}</em></div>
          <div className="rc-kpi"><span>{es ? "Falsos positivos" : "False positives"}</span><b>{inc.false_positive_pct == null ? "—" : `${inc.false_positive_pct}%`}</b><em>{es ? "de los clasificados" : "of classified"}</em></div>
        </div>
        {d.ai_summary
          ? <div className="rc-ai"><div className="rc-ai__head"><Bot size={14} />{es ? "Resumen redactado por la IA local" : "Summary drafted by local AI"}</div><p>{d.ai_summary}</p><small>{es ? "Texto generado por IA a partir de las métricas de este informe: debe revisarlo el analista antes de difundirlo." : "AI-generated from this report's metrics: the analyst must review it before distribution."}</small></div>
          : <p className="rc-muted">{es ? "Resumen cuantitativo: la IA local no se utilizó en este informe." : "Quantitative summary: local AI was not used."}</p>}
      </Chapter>

      <Chapter num="02" icon={Layers} title={es ? "Panorama de amenazas" : "Threat landscape"}>
        {!a.available ? <p className="rc-muted">{es ? "Sin datos del Wazuh Indexer." : "No Wazuh Indexer data."}</p> : <>
          <h3>{es ? "Alertas por día" : "Alerts per day"}</h3>
          <div className="rc-cols">{(a.per_day || []).map((x: any) => (
            <div key={x.day} className="rc-col" title={`${x.day}: ${x.count}`}><span style={{ height: `${Math.max(2, (x.count / maxDay) * 100)}%` }} /><small>{x.day.slice(5)}</small></div>
          ))}</div>
          <div className="rc-grid2">
            <div><h3>{es ? "Por severidad" : "By severity"}</h3>
              <Bars rows={["critical", "high", "medium", "low"].map((k) => ({ label: es ? SEV_ES[k] : k, value: sev[k] || 0 }))} />
            </div>
            <div><h3>{es ? "Principales IP atacantes" : "Top attacking IPs"}</h3>
              {(a.top_attackers || []).length ? <Bars rows={a.top_attackers.map((x: any) => ({ label: x.ip, value: x.count }))} tone="var(--danger)" /> : <p className="rc-muted">—</p>}
            </div>
          </div>
          <h3>{es ? "Reglas más frecuentes" : "Most frequent rules"}</h3>
          <table className="rc-table"><thead><tr><th>{es ? "Regla" : "Rule"}</th><th>{es ? "Nivel" : "Level"}</th><th>{es ? "Descripción" : "Description"}</th><th>{es ? "Alertas" : "Alerts"}</th></tr></thead>
            <tbody>{(a.top_rules || []).map((r: any) => <tr key={r.rule_id}><td className="rc-mono">{r.rule_id}</td><td>{r.level}</td><td>{r.description}</td><td>{r.count.toLocaleString()}</td></tr>)}</tbody></table>
          {(a.countries || []).length > 0 && <><h3>{es ? "Origen geográfico" : "Geographic origin"}</h3><Bars rows={a.countries.map((c: any) => ({ label: c.country, value: c.count }))} /></>}
        </>}
      </Chapter>

      <Chapter num="03" icon={Target} title={es ? "Detecciones y MITRE ATT&CK" : "Detections and MITRE ATT&CK"}>
        {(a.mitre_techniques || []).length === 0 ? <p className="rc-muted">{es ? "Ninguna técnica observada en el periodo." : "No techniques observed."}</p> : <>
          <Bars rows={(a.mitre_tactics || []).map((t: any) => ({ label: t.tactic, value: t.count }))} />
          <table className="rc-table"><thead><tr><th>ID</th><th>{es ? "Técnica" : "Technique"}</th><th>{es ? "Tácticas" : "Tactics"}</th><th>{es ? "Alertas" : "Alerts"}</th></tr></thead>
            <tbody>{a.mitre_techniques.map((t: any) => { const url = mitreUrl(t.id); return (
              <tr key={t.id}><td className="rc-mono">{url ? <a href={url} target="_blank" rel="noopener noreferrer">{t.id}</a> : t.id}</td><td>{t.name}</td><td>{(t.tactics || []).join(", ")}</td><td>{t.count.toLocaleString()}</td></tr>); })}</tbody></table>
        </>}
      </Chapter>

      <Chapter num="04" icon={Siren} title={es ? "Gestión de incidentes" : "Incident management"}>
        <div className="rc-grid2">
          <div><h3>{es ? "Por fase" : "By phase"}</h3><Bars rows={Object.entries(inc.by_status || {}).map(([k, v]) => ({ label: es ? STATUS_ES[k] || k : k, value: v as number }))} /></div>
          <div><h3>{es ? "Clasificación al cierre" : "Closure classification"}</h3><Bars rows={Object.entries(inc.by_classification || {}).map(([k, v]) => ({ label: es ? CLASS_ES[k] || k : k, value: v as number }))} /></div>
        </div>
        {(inc.items || []).length > 0 && <table className="rc-table"><thead><tr><th>#</th><th>{es ? "Incidente" : "Incident"}</th><th>{es ? "Sev." : "Sev."}</th><th>{es ? "Fase" : "Phase"}</th><th>{es ? "Asignado" : "Assignee"}</th><th>{es ? "Creado" : "Created"}</th></tr></thead>
          <tbody>{inc.items.map((i: any) => <tr key={i.id}><td>{i.id}</td><td>{i.title}</td><td>{es ? SEV_ES[i.severity] : i.severity}</td><td>{es ? STATUS_ES[i.status] || i.status : i.status}{i.classification ? ` · ${es ? CLASS_ES[i.classification] : i.classification}` : ""}</td><td>{i.assignee || "—"}</td><td>{fmtDate(i.created_at, lang)}</td></tr>)}</tbody></table>}
      </Chapter>

      <Chapter num="05" icon={Bug} title={es ? "Honeypot (Cowrie)" : "Honeypot (Cowrie)"}>
        {!h.available ? <p className="rc-muted">{es ? "Sin datos del honeypot." : "No honeypot data."}</p> : <>
          <div className="rc-kpis rc-kpis--small">
            <div className="rc-kpi"><span>{es ? "Sesiones" : "Sessions"}</span><b>{n(h.sessions)}</b></div>
            <div className="rc-kpi"><span>{es ? "Logins fallidos" : "Failed logins"}</span><b>{n(h.login_failed)}</b></div>
            <div className="rc-kpi"><span>{es ? "Fuerza bruta" : "Brute force"}</span><b>{n(h.bruteforce_detections)}</b></div>
            <div className="rc-kpi rc-risk--alto"><span>{es ? "Intrusiones" : "Intrusions"}</span><b>{n(h.intrusions_after_bruteforce)}</b></div>
          </div>
          <div className="rc-grid2">
            <div><h3>{es ? "Usuarios probados" : "Usernames tried"}</h3>{h.top_usernames?.length ? <Bars rows={h.top_usernames.map((x: any) => ({ label: x.value, value: x.count }))} /> : <p className="rc-muted">—</p>}</div>
            <div><h3>{es ? "Contraseñas probadas" : "Passwords tried"}</h3>{h.top_passwords?.length ? <Bars rows={h.top_passwords.map((x: any) => ({ label: x.value, value: x.count }))} /> : <p className="rc-muted">—</p>}</div>
          </div>
          {h.top_commands?.length > 0 && <><h3>{es ? "Comandos ejecutados" : "Commands executed"}</h3><Bars rows={h.top_commands.map((x: any) => ({ label: x.value, value: x.count }))} /></>}
          {h.downloads?.length > 0 && <><h3>{es ? "Descargas de los atacantes" : "Attacker downloads"}</h3><Bars rows={h.downloads.map((x: any) => ({ label: x.value, value: x.count }))} tone="var(--danger)" /></>}
        </>}
      </Chapter>

      <Chapter num="06" icon={Ban} title={es ? "Respuesta y contención" : "Response and containment"}>
        <p>{es ? "IP bloqueadas en total" : "Blocked IPs overall"}: <b>{n(d.response?.blocked_ips_total)}</b>. {es ? "Bloqueadas en el periodo" : "Blocked in period"}: <b>{d.response?.blocked_in_period?.length ?? 0}</b>.</p>
        {d.response?.blocked_in_period?.length > 0 && <table className="rc-table"><thead><tr><th>IP</th><th>{es ? "Desde" : "Since"}</th></tr></thead>
          <tbody>{d.response.blocked_in_period.map((b: any) => <tr key={b.ip}><td className="rc-mono">{b.ip}</td><td>{b.since ? fmtDate(b.since, lang) : "—"}</td></tr>)}</tbody></table>}
      </Chapter>

      <Chapter num="07" icon={ClipboardCheck} title={es ? "Controles y cumplimiento" : "Controls and compliance"}>
        <table className="rc-table"><thead><tr><th>ISO/IEC 27001:2022</th><th>ENS</th><th>{es ? "Control" : "Control"}</th><th>{es ? "Estado" : "Status"}</th><th>{es ? "Evidencia" : "Evidence"}</th></tr></thead>
          <tbody>{(d.controls || []).map((c: any) => <tr key={c.iso + c.control}><td className="rc-mono">{c.iso}</td><td className="rc-mono">{c.ens}</td><td>{c.control}</td><td><span className={`rc-status rc-status--${c.status}`}>{es ? CTRL_ES[c.status] : c.status}</span></td><td>{c.evidence}</td></tr>)}</tbody></table>
      </Chapter>

      <Chapter num="08" icon={Lightbulb} title={es ? "Recomendaciones" : "Recommendations"}>
        <ol className="rc-recs">{(d.recommendations || []).map((r: any, i: number) => (
          <li key={i}><span className={`rc-prio rc-prio--${r.priority}`}>{es ? PRIO_ES[r.priority] : r.priority}</span><div><b>{r.text}</b><small>{es ? "Motivo" : "Reason"}: {r.reason}</small></div></li>
        ))}</ol>
      </Chapter>

      <Chapter num="09" icon={BookOpen} title={es ? "Anexo técnico" : "Technical annex"}>
        <h3>{es ? "Fuentes y metodología" : "Sources and methodology"}</h3>
        <ul className="rc-list">
          <li>{es ? "Alertas: Wazuh Indexer (índices wazuh-alerts-*), excluidos los comentarios de la integración de IA (grupo ai_analysis)." : "Alerts: Wazuh Indexer (wazuh-alerts-*), excluding AI integration comments."}</li>
          <li>{es ? "Severidad por nivel de regla Wazuh: crítico ≥12, alto 9–11, medio 5–8, bajo <5." : "Severity by Wazuh rule level: critical ≥12, high 9–11, medium 5–8, low <5."}</li>
          <li>{es ? "Incidentes, línea de tiempo, evidencias e IP bloqueadas: base de datos de Valhalla SOC." : "Incidents, timeline, evidence and blocked IPs: Valhalla SOC database."}</li>
          <li>{es ? "SLA de resolución por severidad: crítico 1 h, alto 4 h, medio 24 h, bajo 72 h." : "Resolution SLA: critical 1 h, high 4 h, medium 24 h, low 72 h."}</li>
          <li>{es ? "Riesgo (0–100): alertas críticas×10 + altas×2 (máx. 40) + intrusiones×15 + fuerza bruta×5 (máx. 30) + incidentes críticos/altos activos×10 (máx. 30)." : "Risk (0–100): critical alerts×10 + high×2 (max 40) + intrusions×15 + brute force×5 (max 30) + active critical/high incidents×10 (max 30)."}</li>
          <li>{es ? "Integridad: la huella SHA-256 se calcula sobre el contenido JSON canónico y puede verificarse en el Centro de informes." : "Integrity: SHA-256 computed over canonical JSON content, verifiable in the Reports center."}</li>
        </ul>
        {(d.limitations || []).length > 0 && <><h3>{es ? "Limitaciones del informe" : "Report limitations"}</h3><ul className="rc-list rc-list--warn">{d.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></>}
      </Chapter>
    </article>
  );
}

export default function ReportsCenter({ lang = "es", initialTab = "soc" }: { lang?: Lang; initialTab?: Tab }) {
  const es = lang === "es";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [history, setHistory] = useState<ReportSummary[] | null>(null);
  const [current, setCurrent] = useState<(ReportSummary & { data: ReportData }) | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [generating, setGenerating] = useState(false);
  const now = useMemo(() => new Date(), []);
  const [start, setStart] = useState(toLocalInput(new Date(now.getTime() - 7 * 86400e3)));
  const [end, setEnd] = useState(toLocalInput(now));
  const [tlp, setTlp] = useState<ReportTLP>("AMBER");
  const [useAi, setUseAi] = useState(true);

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const loadHistory = async () => {
    try { setHistory(await listReports()); } catch { setHistory([]); }
  };
  useEffect(() => { loadHistory(); }, []);

  const preset = (days: number) => { const e = new Date(); setEnd(toLocalInput(e)); setStart(toLocalInput(new Date(e.getTime() - days * 86400e3))); };

  const open = async (id: string) => {
    setVerified(null);
    try { setCurrent(await getReport(id)); } catch (e) { toast(String(e).replace(/^Error:\s*/, ""), "err"); }
  };

  const generate = async () => {
    if (new Date(end) <= new Date(start)) { toast(es ? "El fin del periodo debe ser posterior al inicio." : "End must be after start.", "err"); return; }
    setGenerating(true);
    try {
      const r = await generateReport({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), tlp, include_ai_summary: useAi });
      setCurrent(r);
      setVerified(null);
      toast(es ? `Informe ${r.report_id} generado.` : `Report ${r.report_id} generated.`, "ok");
      loadHistory();
    } catch (e) {
      toast(String(e).replace(/^Error:\s*/, "").replace(/^HTTP \d+:\s*/, ""), "err");
    } finally {
      setGenerating(false);
    }
  };

  const doVerify = async () => {
    if (!current) return;
    try {
      const r = await verifyReport(current.report_id);
      setVerified(r.ok);
      toast(r.ok ? (es ? "Integridad verificada: el contenido coincide con la huella registrada." : "Integrity verified.") : (es ? "ALERTA: el contenido no coincide con la huella registrada." : "WARNING: content does not match the fingerprint."), r.ok ? "ok" : "err");
    } catch (e) { toast(String(e), "err"); }
  };

  const download = (name: string, content: string, type: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportJson = () => current && download(`${current.report_id}.json`, JSON.stringify({ ...current, data: current.data }, null, 2), "application/json");
  const exportCsv = () => {
    if (!current) return;
    const items = current.data.incidents?.items || [];
    const cols = ["id", "title", "severity", "status", "classification", "source_ip", "assignee", "created_at", "resolved_at"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    download(`${current.report_id}-incidentes.csv`, [cols.join(","), ...items.map((i: any) => cols.map((c) => esc(i[c])).join(","))].join("\n"), "text/csv;charset=utf-8");
  };
  // Imprimir: el documento vive en contenedores con scroll y altura fija que cortarían la
  // impresión en la primera página, así que se copia a un contenedor propio en <body>.
  const print = () => {
    const doc = document.getElementById("rc-print");
    if (!doc) return;
    const host = document.createElement("div");
    host.id = "rc-print-host";
    host.innerHTML = doc.outerHTML;
    document.body.appendChild(host);
    document.body.classList.add("rc-printing");
    const prevTitle = document.title;
    document.title = current ? `${current.report_id} - Valhalla SOC` : prevTitle;
    const done = () => {
      document.body.classList.remove("rc-printing");
      host.remove();
      document.title = prevTitle;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  const tabs: { id: Tab; icon: LucideIcon; es: string; en: string }[] = [
    { id: "soc", icon: FileBarChart, es: "Informe SOC", en: "SOC report" },
    { id: "executive", icon: FileText, es: "PDF ejecutivo", en: "Executive PDF" },
    { id: "intel", icon: Radar, es: "Heimdall", en: "Heimdall" },
  ];

  return (
    <div className="rc">
      <div className="rc-head">
        <div>
          <h1>{es ? "Centro de informes" : "Reports center"}</h1>
          <p>{es ? "Informes por periodo con datos reales, historial y huella de integridad." : "Period reports with real data, history and integrity fingerprint."}</p>
        </div>
        <div className="vx-seg" role="tablist" aria-label={es ? "Tipo de informe" : "Report type"}>
          {tabs.map((t) => { const I = t.icon; return <button key={t.id} role="tab" aria-pressed={tab === t.id} aria-selected={tab === t.id} onClick={() => setTab(t.id)}><I size={13} /> {es ? t.es : t.en}</button>; })}
        </div>
      </div>

      {tab === "executive" && <div className="rc-embed"><ExecutiveReport lang={lang} /></div>}
      {tab === "intel" && <div className="rc-embed"><HeimdallReportView lang={lang} /></div>}

      {tab === "soc" && (
        <div className="rc-body">
          <aside className="rc-side">
            <section className="vx-card rc-new">
              <div className="vx-card__head" style={{ cursor: "default" }}><span className="vx-card__icon"><Plus size={15} /></span><span className="vx-card__title">{es ? "Nuevo informe" : "New report"}</span></div>
              <div className="rc-new__body">
                <label className="rc-label"><CalendarRange size={12} />{es ? "Periodo" : "Period"}</label>
                <div className="wk-chipset rc-presets">{PRESETS.map((p) => <button key={p.d} type="button" onClick={() => preset(p.d)}>{es ? p.es : p.en}</button>)}</div>
                <div className="rc-dates">
                  <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label={es ? "Inicio" : "Start"} />
                  <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} aria-label={es ? "Fin" : "End"} />
                </div>
                <label className="rc-label"><ShieldAlert size={12} />{es ? "Clasificación TLP" : "TLP classification"}</label>
                <div className="rc-tlps">{TLP.map((t) => <button key={t.id} type="button" className={`rc-tlp rc-tlp--${t.id}`} aria-pressed={tlp === t.id} onClick={() => setTlp(t.id)} title={es ? t.es : t.en}>{t.id}</button>)}</div>
                <div className="vp-switch-row" role="switch" aria-checked={useAi} tabIndex={0} onClick={() => setUseAi(!useAi)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setUseAi(!useAi)}>
                  <Bot size={16} /><div>{es ? "Resumen con IA local" : "Local AI summary"}<small>{es ? "Añade ~40 s a la generación" : "Adds ~40 s"}</small></div><span className="vp-switch" data-on={useAi} />
                </div>
                <button className="vp-btn vp-btn--primary vp-btn--block" onClick={generate} disabled={generating}>
                  {generating ? <><Loader2 size={14} className="vx-spin" />{es ? "Generando…" : "Generating…"}</> : <><FileBarChart size={14} />{es ? "Generar informe" : "Generate report"}</>}
                </button>
              </div>
            </section>

            <section className="vx-card rc-history">
              <div className="vx-card__head" style={{ cursor: "default" }}><span className="vx-card__icon"><History size={15} /></span><span className="vx-card__title">{es ? "Historial" : "History"}</span><span className="vx-card__meta">{history?.length ?? ""}</span></div>
              <div className="vx-card__body">
                {history === null && <div className="vx-empty"><Clock size={20} />{es ? "Cargando…" : "Loading…"}</div>}
                {history?.length === 0 && <div className="vx-empty"><FileBarChart size={20} />{es ? "Aún no hay informes generados." : "No reports yet."}</div>}
                {history?.map((r) => (
                  <button key={r.report_id} className={`rc-item${current?.report_id === r.report_id ? " rc-item--active" : ""}`} onClick={() => open(r.report_id)}>
                    <span className="rc-item__top"><b>{r.report_id}</b><span className={`rc-tlp rc-tlp--${r.tlp} rc-tlp--sm`}>{r.tlp}</span></span>
                    <span className="rc-item__period">{fmtDate(r.period_start, lang, false)} — {fmtDate(r.period_end, lang, false)}</span>
                    <span className="rc-item__meta">{r.created_by} · {fmtDate(r.created_at, lang)}{r.risk_level ? <span className={`rc-riskchip rc-risk--${r.risk_level}`}>{r.risk_level}</span> : null}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="vx-card rc-viewer">
            {!current ? (
              <div className="vx-empty"><FileBarChart size={28} /><b>{es ? "Genera un informe o abre uno del historial" : "Generate a report or open one from history"}</b>{es ? "Los datos se toman del periodo elegido y quedan congelados con su huella SHA-256." : "Data is taken from the chosen period and frozen with its SHA-256 fingerprint."}</div>
            ) : (
              <>
                <div className="rc-toolbar">
                  <span className="rc-mono">{current.report_id}</span>
                  <button className="wk-hash" onClick={() => { navigator.clipboard.writeText(current.sha256); toast(es ? "Huella copiada." : "Fingerprint copied.", "ok"); }} title={current.sha256}>
                    <Fingerprint size={11} />SHA-256 {current.sha256.slice(0, 16)}…<Copy size={10} />
                    {verified === true && <span className="wk-hash__ok"><ShieldCheck size={11} />{es ? "íntegro" : "intact"}</span>}
                    {verified === false && <span className="wk-hash__bad"><ShieldAlert size={11} />{es ? "alterado" : "tampered"}</span>}
                  </button>
                  <span className="rc-toolbar__sp" />
                  <button className="wk-iconbtn" onClick={doVerify} title={es ? "Verificar integridad" : "Verify integrity"} aria-label={es ? "Verificar integridad" : "Verify integrity"}><ShieldCheck size={16} /></button>
                  <button className="wk-iconbtn" onClick={print} title={es ? "Exportar a PDF (imprimir)" : "Export PDF (print)"} aria-label="PDF"><Printer size={16} /></button>
                  <button className="wk-iconbtn" onClick={exportJson} title={es ? "Descargar JSON" : "Download JSON"} aria-label="JSON"><FileJson size={16} /></button>
                  <button className="wk-iconbtn" onClick={exportCsv} title={es ? "Incidentes a CSV" : "Incidents CSV"} aria-label="CSV"><Table2 size={16} /></button>
                </div>
                <div className="vx-card__body rc-scroll"><SocDocument report={current} lang={lang} /></div>
              </>
            )}
          </section>
        </div>
      )}
      {tab === "soc" && current && <p className="rc-foot"><Info size={11} />{es ? "El PDF se genera con el diálogo de impresión del navegador («Guardar como PDF»)." : "PDF is produced via the browser print dialog (\"Save as PDF\")."} <a href="https://www.first.org/tlp/" target="_blank" rel="noopener noreferrer">TLP 2.0 <ExternalLink size={9} /></a></p>}
    </div>
  );
}
