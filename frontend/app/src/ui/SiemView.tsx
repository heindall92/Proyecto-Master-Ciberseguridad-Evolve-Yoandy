import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import logger from "../lib/logger";
import { getRecentAlerts, getMitreCoverage, getTopAttackers, getAlertVolume, createTicketFromAlert, blockIp, getBlockedIps } from "../lib/api";
import { translateAlertDescription } from "../lib/alertTranslations";
import { useAppDispatch } from "../store/hooks";
import { navigateToIntel } from "../store/uiSlice";
import {
  Search, ListFilter, Layers, Download, X, Check, RotateCcw, Siren, Ban, Crosshair, Target, Inbox,
  Maximize2, Copy, Server, Globe, Hash, Clock, Gauge, FileJson, ExternalLink, Activity, Radio,
} from "lucide-react";
import { HoldButton, Sparkline, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/siem.css";

type Lang = "es" | "en";
const SEVS = ["critical", "high", "medium", "low"] as const;
const SEV_LABEL: Record<string, { es: string; en: string }> = {
  critical: { es: "Crítico", en: "Critical" }, high: { es: "Alto", en: "High" },
  medium: { es: "Medio", en: "Medium" }, low: { es: "Bajo", en: "Low" },
};
const RANGES = [{ h: 1, l: "1 h" }, { h: 24, l: "24 h" }, { h: 168, l: "7 d" }];

const fmtTime = (ts: string, lang: Lang, withDate: boolean) =>
  new Date(ts).toLocaleString(lang, withDate
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
    : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const mitreUrl = (id: string) => {
  const m = id.match(/^T(\d{4})(?:\.(\d{3}))?$/);
  return m ? `https://attack.mitre.org/techniques/T${m[1]}/${m[2] ? `${m[2]}/` : ""}` : null;
};

function toCsv(rows: any[]) {
  const cols = ["timestamp", "severity", "rule_id", "rule_level", "agent_name", "source_ip", "description", "count"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(c === "count" ? r.count ?? 1 : r[c])).join(","))].join("\n");
}

export default function SiemView({ lang = "es" }: { lang?: Lang }) {
  const es = lang === "es";
  const dispatch = useAppDispatch();
  const alertLabel = (d: string) => translateAlertDescription(d, lang);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [mitre, setMitre] = useState<any[]>([]);
  const [attackers, setAttackers] = useState<any[]>([]);
  const [volume, setVolume] = useState<number[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState("");
  const [sev, setSev] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");
  const [group, setGroup] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchData = async () => {
    const [a, m, t, v, b] = await Promise.allSettled([
      getRecentAlerts(500, hours), getMitreCoverage(hours), getTopAttackers(10, hours),
      getAlertVolume(hours, hours <= 1 ? "5m" : "1h"), getBlockedIps(),
    ]);
    if (a.status === "fulfilled") { setAlerts(a.value || []); setError(false); } else { logger.error("SIEM alerts", a.reason); setError(true); }
    if (m.status === "fulfilled") setMitre(m.value || []);
    if (t.status === "fulfilled") setAttackers(t.value || []);
    if (v.status === "fulfilled") setVolume((v.value || []).map((p: any) => (typeof p === "object" ? p.count ?? 0 : p)));
    if (b.status === "fulfilled") setBlocked(new Set((b.value || []).map((x) => x.ip)));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (showLog) setShowLog(false); else setSelected(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLog]);

  const agents = useMemo(() => Array.from(new Set(alerts.map((a) => a.agent_name).filter(Boolean))).sort(), [alerts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (sev !== "all" && a.severity !== sev) return false;
      if (agent !== "all" && a.agent_name !== agent) return false;
      if (q && !`${a.description} ${a.agent_name} ${a.source_ip} ${a.rule_id} ${(a.mitre_id || []).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [alerts, search, sev, agent]);

  const rows = useMemo(() => {
    if (!group) return filtered;
    const g: Record<string, any> = {};
    filtered.forEach((a) => {
      const k = `${a.rule_id}|${a.agent_name}|${a.source_ip}`;
      if (!g[k]) g[k] = { ...a, count: 1, first: a.timestamp };
      else {
        g[k].count += 1;
        if (a.timestamp > g[k].timestamp) Object.assign(g[k], { ...a, count: g[k].count, first: g[k].first });
        if (a.timestamp < g[k].first) g[k].first = a.timestamp;
      }
    });
    return Object.values(g).sort((x, y) => (y.timestamp > x.timestamp ? 1 : -1));
  }, [filtered, group]);

  const activeFilters = (sev !== "all" ? 1 : 0) + (agent !== "all" ? 1 : 0);
  const sevCount = (s: string) => filtered.filter((a) => a.severity === s).length;

  const escalate = async (al: any) => {
    if (!al.id) { toast(es ? "La alerta no tiene identificador de Wazuh." : "Alert has no Wazuh id.", "err"); return; }
    setBusy(true);
    try {
      const r = await createTicketFromAlert({
        alert_id: String(al.id), rule_id: al.rule_id ? String(al.rule_id) : undefined, rule_level: al.rule_level,
        description: al.description, source_ip: al.source_ip || null, agent_name: al.agent_name, timestamp: al.timestamp, severity: al.severity,
      });
      toast({
        created: es ? `Incidente #${r.ticket_id} creado.` : `Incident #${r.ticket_id} created.`,
        linked: es ? `Alerta vinculada al incidente abierto #${r.ticket_id}.` : `Alert linked to open incident #${r.ticket_id}.`,
        duplicate: es ? `Ya pertenece al incidente #${r.ticket_id}.` : `Already in incident #${r.ticket_id}.`,
      }[r.outcome], r.outcome === "duplicate" ? "info" : "ok");
    } catch (e) { toast(String(e).replace(/^Error:\s*/, ""), "err"); } finally { setBusy(false); }
  };

  const block = async (ip: string) => {
    try {
      const r = await blockIp(ip, undefined, "Bloqueo manual desde el SIEM");
      setBlocked((p) => new Set(p).add(ip));
      toast(es ? `IP ${ip} bloqueada${r.active_response ? " (firewall-drop aplicado)" : " (lista CDB de Wazuh)"}.` : `IP ${ip} blocked.`, "ok");
    } catch (e) { toast(String(e).replace(/^Error:\s*/, ""), "err"); }
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `valhalla-siem-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(es ? `${rows.length} filas exportadas.` : `${rows.length} rows exported.`, "ok");
  };

  const raw = selected ? { full_log: selected.full_log, data: selected.data, location: selected.location, decoder: selected.decoder, rule: { id: selected.rule_id, level: selected.rule_level, groups: selected.groups, mitre: selected.mitre_id } } : null;
  const maxAtt = Math.max(...attackers.map((a) => a.count || 0), 1);
  const maxMitre = Math.max(...mitre.map((m) => m.count || 0), 1);

  return (
    <div className="sv">
      {/* ── Cabecera ── */}
      <div className="sv-head">
        <div className="sv-title">
          <span className="sv-live"><Radio size={13} />LIVE</span>
          <h1>SIEM</h1>
          <span className="vx-card__meta">{rows.length} {group ? (es ? "grupos" : "groups") : (es ? "eventos" : "events")} · {filtered.length} {es ? "alertas" : "alerts"}</span>
        </div>
        <div className="sv-tools">
          <label className="wk-search">
            <Search size={15} />
            <input className="vp-bare-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={es ? "Buscar alerta…" : "Search alert…"} title={es ? "Descripción, agente, IP, regla o técnica MITRE" : "Description, agent, IP, rule or MITRE technique"} />
            {search && <button className="wk-search__clear" onClick={() => setSearch("")} aria-label={es ? "Borrar" : "Clear"}><X size={13} /></button>}
          </label>
          <div className="vx-seg" role="group" aria-label={es ? "Periodo" : "Range"}>
            {RANGES.map((r) => <button key={r.h} aria-pressed={hours === r.h} onClick={() => setHours(r.h)}>{r.l}</button>)}
          </div>
          <div className="wk-filter">
            <button className="wk-iconbtn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} title={es ? "Filtros" : "Filters"} aria-label={es ? "Filtros" : "Filters"}>
              <ListFilter size={17} />{activeFilters > 0 && <span className="vp-badge">{activeFilters}</span>}
            </button>
            {filtersOpen && (
              <>
                <div className="wk-filter__backdrop" onClick={() => setFiltersOpen(false)} />
                <div className="vp-pop wk-filter__pop" role="dialog" aria-label={es ? "Filtros" : "Filters"}>
                  <div className="vp-pop__head"><ListFilter size={15} color="var(--signal)" /><div className="vp-pop__title">{es ? "Filtros" : "Filters"}</div></div>
                  <div className="vp-pop__body">
                    <div className="vp-menu-label">{es ? "Severidad" : "Severity"}</div>
                    <div className="wk-chipset">
                      <button aria-pressed={sev === "all"} onClick={() => setSev("all")}>{es ? "Todas" : "All"}</button>
                      {SEVS.map((s) => <button key={s} aria-pressed={sev === s} onClick={() => setSev(s)} className={`wk-chipset__sev vx-sev--${s}`}>{SEV_LABEL[s][lang]} · {sevCount(s)}</button>)}
                    </div>
                    <div className="vp-menu-label">{es ? "Agente" : "Agent"}</div>
                    <div className="wk-filter__list">
                      {["all", ...agents].map((a) => (
                        <button key={a} className="vp-menu-item" aria-pressed={agent === a} onClick={() => setAgent(a)}>
                          <Server size={15} />{a === "all" ? (es ? "Todos" : "All") : a}
                          {agent === a && <Check size={14} style={{ marginLeft: "auto", color: "var(--signal)" }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="vp-pop__foot"><button className="vp-menu-item" disabled={activeFilters === 0} onClick={() => { setSev("all"); setAgent("all"); }}><RotateCcw size={15} />{es ? "Limpiar filtros" : "Clear filters"}</button></div>
                </div>
              </>
            )}
          </div>
          <button className="wk-iconbtn" aria-pressed={group} onClick={() => setGroup(!group)} title={group ? (es ? "Agrupando alertas similares (misma regla, agente e IP)" : "Grouping similar alerts") : (es ? "Agrupar alertas similares" : "Group similar alerts")} aria-label={es ? "Agrupar similares" : "Group similar"} data-active={group}>
            <Layers size={17} />
          </button>
          <button className="wk-iconbtn" onClick={exportCsv} disabled={rows.length === 0} title={es ? "Exportar a CSV lo filtrado" : "Export filtered to CSV"} aria-label={es ? "Exportar CSV" : "Export CSV"}><Download size={17} /></button>
        </div>
      </div>

      <div className={`sv-body${selected ? " sv-body--detail" : ""}`}>
        {/* ── Tabla ── */}
        <section className="vx-card sv-table">
          {volume.length > 1 && (
            <div className="sv-activity vx-tone-accent" title={es ? "Actividad en el periodo" : "Activity in range"}>
              <Activity size={13} /><span>{es ? "Actividad" : "Activity"}</span>
              <div className="sv-activity__chart"><Sparkline points={volume} height={26} /></div>
            </div>
          )}
          <div className="vx-card__body">
            <div className="vx-table sv-grid">
              <div className="vx-table__head"><span>{es ? "Sev." : "Sev."}</span><span>{es ? "Hora" : "Time"}</span><span>IP</span><span>{es ? "Agente" : "Agent"}</span><span>{es ? "Descripción" : "Description"}</span><span /></div>
              {loading && <div className="vx-empty" style={{ height: 200 }}><Clock size={22} />{es ? "Consultando el Wazuh Indexer…" : "Querying Wazuh Indexer…"}</div>}
              {!loading && error && <div className="vx-empty" style={{ height: 200 }}><Inbox size={22} />{es ? "No se pudo consultar el Wazuh Indexer. Revisa Estado de integraciones." : "Could not query Wazuh Indexer. Check integrations health."}</div>}
              {!loading && !error && rows.length === 0 && <div className="vx-empty" style={{ height: 200 }}><Inbox size={22} />{es ? "Sin alertas con estos filtros" : "No alerts match these filters"}</div>}
              {!loading && rows.map((al, i) => {
                const isSel = selected && selected.id === al.id;
                return (
                  <div key={`${al.id || al.timestamp}-${i}`} className={`vx-table__row sv-row${isSel ? " sv-row--sel" : ""}`} onClick={() => setSelected(isSel ? null : al)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelected(isSel ? null : al); }}>
                    <span><span className={`vx-sev vx-sev--${al.severity}`}>{SEV_LABEL[al.severity]?.[lang] || al.severity}</span></span>
                    <span className="vx-muted">{fmtTime(al.timestamp, lang, hours > 24)}</span>
                    <span>{al.source_ip ? <button className="vx-ip" onClick={(e) => { e.stopPropagation(); dispatch(navigateToIntel(al.source_ip)); }}>{al.source_ip}</button> : <span className="vx-muted">—</span>}</span>
                    <span className="vx-muted">{al.agent_name || "—"}</span>
                    <span className="sv-desc" title={al.description}>{alertLabel(al.description)}{al.count > 1 && <span className="sv-count">×{al.count}</span>}</span>
                    <span className="sv-row__actions">
                      <button className="vx-iconbtn" onClick={(e) => { e.stopPropagation(); escalate(al); }} disabled={busy} title={es ? "Escalar a incidente" : "Escalate to incident"} aria-label={es ? "Escalar" : "Escalate"}><Siren size={14} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Lateral: detalle o contexto ── */}
        {selected ? (
          <aside className="vx-card sv-side">
            <div className="vx-card__head" style={{ cursor: "default" }}>
              <span className={`vx-sev vx-sev--${selected.severity}`}>{SEV_LABEL[selected.severity]?.[lang]}</span>
              <span className="vx-card__title">{es ? "Detalle de la alerta" : "Alert detail"}</span>
              <div className="vx-card__tools"><button className="vx-iconbtn" onClick={() => setSelected(null)} aria-label={es ? "Cerrar" : "Close"}><X size={15} /></button></div>
            </div>
            <div className="vx-card__body sv-detail">
              <p className="sv-detail__desc">{alertLabel(selected.description)}</p>
              <div className="wk-facts">
                <div><div className="wk-fact__k">{es ? "Regla" : "Rule"}</div><div className="wk-fact__v"><Hash size={12} />{selected.rule_id}</div></div>
                <div><div className="wk-fact__k">{es ? "Nivel" : "Level"}</div><div className="wk-fact__v"><Gauge size={12} />{selected.rule_level}</div></div>
                <div><div className="wk-fact__k">{es ? "Agente" : "Agent"}</div><div className="wk-fact__v"><Server size={12} />{selected.agent_name || "—"}</div></div>
                <div><div className="wk-fact__k">{es ? "IP origen" : "Source IP"}</div><div className="wk-fact__v">{selected.source_ip ? <button className="wk-link" onClick={() => dispatch(navigateToIntel(selected.source_ip))}><Globe size={12} />{selected.source_ip}</button> : "—"}</div></div>
                <div><div className="wk-fact__k">{es ? "Última" : "Last seen"}</div><div className="wk-fact__v"><Clock size={12} />{fmtTime(selected.timestamp, lang, true)}</div></div>
                <div><div className="wk-fact__k">{es ? "Repeticiones" : "Occurrences"}</div><div className="wk-fact__v">{selected.count || 1}{selected.first && selected.count > 1 ? ` · ${es ? "desde" : "since"} ${fmtTime(selected.first, lang, true)}` : ""}</div></div>
              </div>

              {(selected.mitre_id?.length > 0) && (
                <div className="sv-mitre">
                  <div className="wk-fact__k">MITRE ATT&CK</div>
                  <div className="sv-mitre__chips">
                    {selected.mitre_id.map((id: string, i: number) => {
                      const url = mitreUrl(id);
                      return url
                        ? <a key={id} className="wk-chip" href={url} target="_blank" rel="noopener noreferrer"><Target size={10} />{id} · {selected.mitre_technique?.[i] || ""}<ExternalLink size={9} /></a>
                        : <span key={id} className="wk-chip"><Target size={10} />{id}</span>;
                    })}
                  </div>
                </div>
              )}

              <div className="sv-log">
                <div className="sv-log__head">
                  <FileJson size={13} /><span>{es ? "Evento original" : "Raw event"}</span>
                  <button className="vx-iconbtn" onClick={() => { navigator.clipboard.writeText(JSON.stringify(raw, null, 2)); toast(es ? "JSON copiado." : "JSON copied.", "ok"); }} title={es ? "Copiar JSON" : "Copy JSON"} aria-label={es ? "Copiar JSON" : "Copy JSON"}><Copy size={13} /></button>
                  <button className="vx-iconbtn" onClick={() => setShowLog(true)} title={es ? "Ampliar" : "Expand"} aria-label={es ? "Ampliar" : "Expand"}><Maximize2 size={13} /></button>
                </div>
                {selected.full_log && <pre className="sv-pre sv-pre--log">{selected.full_log}</pre>}
                <pre className="sv-pre">{JSON.stringify(selected.data ?? {}, null, 2)}</pre>
              </div>

              <div className="sv-actions">
                <button className="vp-btn vp-btn--primary" onClick={() => escalate(selected)} disabled={busy}><Siren size={13} />{es ? "Escalar" : "Escalate"}</button>
                <button className="vp-btn" onClick={() => selected.source_ip && dispatch(navigateToIntel(selected.source_ip))} disabled={!selected.source_ip}><Crosshair size={13} />{es ? "Investigar IP" : "Investigate IP"}</button>
                <HoldButton onConfirm={() => block(selected.source_ip)} disabled={!selected.source_ip || blocked.has(selected.source_ip)}
                  title={!selected.source_ip ? (es ? "Alerta sin IP de origen" : "No source IP") : blocked.has(selected.source_ip) ? (es ? "IP ya bloqueada" : "Already blocked") : (es ? `Mantén pulsado para bloquear ${selected.source_ip}` : `Hold to block ${selected.source_ip}`)}
                  className="sv-hold"><Ban size={13} />{blocked.has(selected.source_ip) ? (es ? "Bloqueada" : "Blocked") : (es ? "Bloquear IP" : "Block IP")}</HoldButton>
              </div>
            </div>
          </aside>
        ) : (
          <div className="sv-side sv-side--stack">
            <section className="vx-card">
              <div className="vx-card__head" style={{ cursor: "default" }}><span className="vx-card__icon"><Target size={15} /></span><span className="vx-card__title">MITRE ATT&CK</span><span className="vx-card__meta">{mitre.length}</span></div>
              <div className="vx-card__body">
                {mitre.length === 0 ? <div className="vx-empty"><Target size={22} />{es ? "Sin técnicas observadas" : "No techniques observed"}</div> : (
                  <ul className="vx-list">
                    {mitre.slice(0, 12).map((m, i) => (
                      <li key={i}>
                        <div className="vx-list__row"><span className="vx-code">{m.technique_id}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.technique}</span><b>{m.count}</b></div>
                        <div className="vx-bar__track" style={{ ["--sev" as string]: "var(--signal)" }}><div className="vx-bar__fill" style={{ width: `${(m.count / maxMitre) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
            <section className="vx-card">
              <div className="vx-card__head" style={{ cursor: "default" }}><span className="vx-card__icon" style={{ ["--tone" as string]: "var(--danger)" }}><Crosshair size={15} /></span><span className="vx-card__title">{es ? "Atacantes" : "Attackers"}</span><span className="vx-card__meta">{attackers.length}</span></div>
              <div className="vx-card__body">
                {attackers.length === 0 ? <div className="vx-empty"><Crosshair size={22} />{es ? "Sin IP atacantes" : "No attacking IPs"}</div> : (
                  <ul className="vx-list">
                    {attackers.map((a) => (
                      <li key={a.ip}>
                        <div className="vx-list__row"><button className="vx-ip" onClick={() => dispatch(navigateToIntel(a.ip))}>{a.ip}</button>{blocked.has(a.ip) && <span className="vx-sev vx-sev--low">{es ? "bloqueada" : "blocked"}</span>}<b>{a.count.toLocaleString()}</b></div>
                        <div className="vx-bar__track vx-sev--critical"><div className="vx-bar__fill" style={{ width: `${(a.count / maxAtt) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {showLog && raw && createPortal(
        <div className="vp-modal-backdrop" onMouseDown={() => setShowLog(false)}>
          <div className="vp-pop" style={{ position: "static", width: "min(960px, 100%)", maxHeight: "86vh" }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={es ? "Evento original" : "Raw event"}>
            <div className="vp-pop__head"><FileJson size={16} color="var(--signal)" /><div className="vp-pop__title">{es ? "Evento original" : "Raw event"} · {selected?.id}</div>
              <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setShowLog(false)} aria-label={es ? "Cerrar" : "Close"}><X size={15} /></button>
            </div>
            <div className="vp-pop__body" style={{ padding: 14 }}><pre className="sv-pre" style={{ maxHeight: "none" }}>{JSON.stringify(raw, null, 2)}</pre></div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
