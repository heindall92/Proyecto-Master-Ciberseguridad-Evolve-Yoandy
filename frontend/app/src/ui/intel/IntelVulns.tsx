import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bug, ExternalLink, FileWarning, Flame, GitFork, Megaphone, RefreshCw, Search, ShieldAlert, Skull, Star, X, Copy, CalendarClock, Info,
} from "lucide-react";
import { getLatestCves, getCveEnrichment, generateCveSocialPost, type CveItem, type CveEnrichment } from "../../lib/api";
import { KpiCard, toast } from "../premium/widgets";

/**
 * Vulnerabilidades explotadas (CISA KEV) priorizadas con datos reales:
 * CVSS del NVD, PoC públicos en GitHub (idea de cvemapping) y Exploit-DB.
 */

type Filter = "all" | "now" | "exploit" | "ransomware";
const SEV_TONE: Record<string, string> = { critical: "crit", high: "high", medium: "warn", low: "ok" };
const SEV_ES: Record<string, string> = { critical: "crítico", high: "alto", medium: "medio", low: "bajo" };
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

export default function IntelVulns({ es }: { es: boolean }) {
  const [cves, setCves] = useState<CveItem[] | null>(null);
  const [enr, setEnr] = useState<Record<string, CveEnrichment | "loading">>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [post, setPost] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const alive = useRef(true);

  const load = async () => {
    setCves(null);
    try { setCves(await getLatestCves(20)); } catch { setCves([]); toast(es ? "No se pudo leer el catálogo KEV de CISA." : "Could not load CISA KEV.", "err"); }
  };
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Enriquecimiento en serie: las APIs públicas (NVD, GitHub) limitan las peticiones; el backend cachea 24 h
  useEffect(() => {
    if (!cves) return;
    (async () => {
      for (const c of cves) {
        if (!alive.current) return;
        if (enr[c.id] && enr[c.id] !== "loading") continue;
        setEnr(p => ({ ...p, [c.id]: "loading" }));
        try {
          const r = await getCveEnrichment(c.id);
          if (alive.current) setEnr(p => ({ ...p, [c.id]: r }));
        } catch {
          if (alive.current) setEnr(p => { const n = { ...p }; delete n[c.id]; return n; });
        }
      }
    })();
  }, [cves]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = cves ? cves.filter(c => enr[c.id] && enr[c.id] !== "loading").length : 0;
  const e = (id: string) => (enr[id] && enr[id] !== "loading" ? (enr[id] as CveEnrichment) : null);
  const hasExploit = (id: string) => ((e(id)?.github?.count ?? 0) + (e(id)?.exploitdb?.count ?? 0)) > 0;

  const rows = useMemo(() => {
    let list = cves ?? [];
    if (q) { const s = q.toLowerCase(); list = list.filter(c => `${c.id} ${c.product} ${c.name}`.toLowerCase().includes(s)); }
    if (filter === "now") list = list.filter(c => e(c.id)?.priority.label === "Parchear ya");
    if (filter === "exploit") list = list.filter(c => hasExploit(c.id));
    if (filter === "ransomware") list = list.filter(c => c.ransomware);
    return [...list].sort((a, b) => (e(b.id)?.priority.score ?? 0) - (e(a.id)?.priority.score ?? 0));
  }, [cves, enr, q, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const kNow = (cves ?? []).filter(c => e(c.id)?.priority.label === "Parchear ya").length;
  const kExp = (cves ?? []).filter(c => hasExploit(c.id)).length;
  const kRan = (cves ?? []).filter(c => c.ransomware).length;
  const kOverdue = (cves ?? []).filter(c => c.due_date && c.due_date < today()).length;

  const genPost = async () => {
    setPosting(true);
    try { setPost((await generateCveSocialPost(Array.from(sel))).post); }
    catch { toast(es ? "La IA local no pudo redactar el aviso." : "Local AI could not draft the notice.", "err"); }
    finally { setPosting(false); }
  };

  const cur = open ? cves?.find(c => c.id === open) : null;
  const ce = open ? e(open) : null;

  return (
    <div className="in-vulns">
      <div className="in-kpis">
        <KpiCard icon={Bug} label={es ? "Explotadas (KEV)" : "Exploited (KEV)"} value={cves?.length ?? 0} sub={es ? "Más recientes del catálogo CISA" : "Latest in CISA catalog"} tone="info" />
        <KpiCard icon={Flame} label={es ? "Parchear ya" : "Patch now"} value={kNow} sub={es ? "Prioridad ≥ 85" : "Priority ≥ 85"} tone="danger" />
        <KpiCard icon={GitFork} label={es ? "Con exploit público" : "Public exploit"} value={kExp} sub="GitHub PoC · Exploit-DB" tone="warning" />
        <KpiCard icon={Skull} label="Ransomware" value={kRan} sub={`${kOverdue} ${es ? "con fecha CISA vencida" : "past CISA due date"}`} tone="accent" />
      </div>

      <div className="in-bar">
        <label className="wk-search">
          <Search size={15} />
          <input className="vp-bare-input" value={q} onChange={ev => setQ(ev.target.value)} placeholder={es ? "CVE, fabricante o producto…" : "CVE, vendor or product…"} />
          {q && <button className="wk-search__clear" onClick={() => setQ("")} aria-label={es ? "Borrar" : "Clear"}><X size={13} /></button>}
        </label>
        <div className="in-seg" role="group" aria-label={es ? "Filtro" : "Filter"}>
          {([["all", Bug, es ? "Todas" : "All"], ["now", Flame, es ? "Parchear ya" : "Patch now"], ["exploit", GitFork, es ? "Con exploit" : "Exploit"], ["ransomware", Skull, "Ransomware"]] as const).map(([k, I, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} title={l}><I size={14} /><span>{l}</span></button>
          ))}
        </div>
        <span className="in-progress" title={es ? "La API del NVD limita las consultas sin clave; los datos se guardan 24 h" : "NVD API rate limit; cached 24 h"}>
          {cves && done < cves.length ? <><RefreshCw size={12} className="ex-spin" />{es ? `Enriqueciendo ${done}/${cves.length}` : `Enriching ${done}/${cves.length}`}</> : cves ? (es ? "Datos NVD · GitHub · Exploit-DB" : "NVD · GitHub · Exploit-DB data") : ""}
        </span>
        <button type="button" className="wk-iconbtn" onClick={load} title={es ? "Recargar" : "Reload"} aria-label={es ? "Recargar" : "Reload"}><RefreshCw size={15} /></button>
        <button type="button" className="vp-btn vp-btn--primary" disabled={!sel.size || posting} onClick={genPost} title={es ? "Borrador de aviso para el equipo (IA local)" : "Draft team notice (local AI)"}>
          <Megaphone size={14} />{posting ? (es ? "Redactando…" : "Drafting…") : `${es ? "Aviso" : "Notice"}${sel.size ? ` (${sel.size})` : ""}`}
        </button>
      </div>

      <div className="in-list" role="table" aria-label={es ? "Vulnerabilidades explotadas" : "Exploited vulnerabilities"}>
        <div className="in-row in-row--head" role="row">
          <span /><span>CVE</span><span>{es ? "Producto" : "Product"}</span><span>CVSS</span><span>{es ? "Exploits" : "Exploits"}</span><span>{es ? "Límite CISA" : "CISA due"}</span><span>{es ? "Prioridad" : "Priority"}</span>
        </div>
        {!cves && <p className="in-empty">{es ? "Cargando catálogo KEV…" : "Loading KEV…"}</p>}
        {cves && !rows.length && <p className="in-empty">{es ? "Ninguna vulnerabilidad con este filtro." : "No vulnerabilities for this filter."}</p>}
        {rows.map(c => {
          const x = e(c.id); const loading = enr[c.id] === "loading" || !enr[c.id];
          const overdue = c.due_date && c.due_date < today();
          return (
            <div key={c.id} role="row" className={`in-row${sel.has(c.id) ? " is-sel" : ""}`} onClick={() => setOpen(c.id)} tabIndex={0} onKeyDown={ev => ev.key === "Enter" && setOpen(c.id)}>
              <span onClick={ev => ev.stopPropagation()}>
                <input type="checkbox" aria-label={`${es ? "Seleccionar" : "Select"} ${c.id}`} checked={sel.has(c.id)} onChange={() => setSel(p => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
              </span>
              <span className="in-cve">{c.id}{c.ransomware && <Skull size={12} aria-label="ransomware" />}</span>
              <span className="in-prod" title={c.name}><b>{c.product}</b><small>{c.name}</small></span>
              <span>{loading ? <i className="in-skel" /> : x?.cvss ? <span className={`in-cvss ex-tone-${SEV_TONE[x.cvss.severity] ?? "warn"}`}>{x.cvss.score.toFixed(1)}<small>{es ? SEV_ES[x.cvss.severity] ?? x.cvss.severity : x.cvss.severity}</small></span> : <span className="in-muted">—</span>}</span>
              <span className="in-exp">{loading ? <i className="in-skel" /> : <>
                <span className={`in-tag${x?.github?.count ? " is-on" : ""}`} title="GitHub PoC"><GitFork size={11} />{x?.github ? x.github.count : "?"}</span>
                <span className={`in-tag${x?.exploitdb?.count ? " is-on" : ""}`} title="Exploit-DB"><FileWarning size={11} />{x?.exploitdb ? x.exploitdb.count : "?"}</span>
              </>}</span>
              <span className={overdue ? "in-over" : "in-muted"}>{fmt(c.due_date)}</span>
              <span>{loading ? <i className="in-skel" /> : x && <span className={`in-prio in-prio--${x.priority.label === "Parchear ya" ? "now" : x.priority.label === "Alta" ? "high" : "mid"}`}>{x.priority.score}<small>{x.priority.label}</small></span>}</span>
            </div>
          );
        })}
      </div>
      <p className="in-foot"><Info size={12} />{es
        ? "Prioridad = explotada (40) + CVSS×4 (hasta 40) + exploit público (15) + ransomware (5). Fuentes: CISA KEV, NVD, GitHub y Exploit-DB."
        : "Priority = exploited (40) + CVSS×4 (up to 40) + public exploit (15) + ransomware (5). Sources: CISA KEV, NVD, GitHub, Exploit-DB."}</p>

      {cur && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => setOpen(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={cur.id}>
          <div className="wk-drawer__head">
            {ce && <span className={`in-prio in-prio--${ce.priority.label === "Parchear ya" ? "now" : ce.priority.label === "Alta" ? "high" : "mid"}`}>{ce.priority.score}<small>{ce.priority.label}</small></span>}
            <span className="wk-drawer__id">{cur.id}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen(null)} aria-label={es ? "Cerrar" : "Close"}><X size={16} /></button>
          </div>
          <div className="wk-drawer__scroll">
            <h2 className="wk-drawer__title">{cur.name || cur.product}</h2>
            <section className="wk-section">
              <div className="wk-section__head"><ShieldAlert size={14} />{es ? "Por qué esta prioridad" : "Why this priority"}</div>
              <div className="wk-section__body">
                {ce ? <ul className="in-reasons">{ce.priority.reasons.map(r => <li key={r}>{r}</li>)}</ul> : <p className="in-muted">{es ? "Consultando fuentes…" : "Querying sources…"}</p>}
              </div>
            </section>
            <section className="wk-section">
              <div className="wk-section__head"><Info size={14} />{es ? "Datos" : "Data"}</div>
              <div className="wk-section__body">
                <div className="wk-facts">
                  <div><div className="wk-fact__k">{es ? "Producto" : "Product"}</div><div className="wk-fact__v">{cur.product}</div></div>
                  <div><div className="wk-fact__k">{es ? "Añadida a KEV" : "Added to KEV"}</div><div className="wk-fact__v">{fmt(cur.published)}</div></div>
                  <div><div className="wk-fact__k"><CalendarClock size={10} /> {es ? "Límite CISA" : "CISA due"}</div><div className="wk-fact__v">{fmt(cur.due_date)}</div></div>
                  <div><div className="wk-fact__k">CVSS</div><div className="wk-fact__v">{ce?.cvss ? `${ce.cvss.score} · ${es ? SEV_ES[ce.cvss.severity] ?? ce.cvss.severity : ce.cvss.severity} · v${ce.cvss.version}` : "—"}</div></div>
                </div>
                {ce?.cvss?.vector && <p className="in-vector">{ce.cvss.vector}</p>}
                <p className="in-text">{cur.summary}</p>
                {cur.required_action && <p className="in-text"><b>{es ? "Acción requerida por CISA: " : "CISA required action: "}</b>{cur.required_action}</p>}
              </div>
            </section>
            <section className="wk-section">
              <div className="wk-section__head"><GitFork size={14} />{es ? "Exploits públicos" : "Public exploits"}</div>
              <div className="wk-section__body">
                {ce?.github?.top.length ? ce.github.top.map(g => (
                  <a key={g.repo} className="in-repo" href={g.url} target="_blank" rel="noopener noreferrer">
                    <GitFork size={13} /><span>{g.repo}<small>{es ? "actualizado" : "updated"} {fmt(g.updated)}</small></span><b><Star size={11} />{g.stars}</b><ExternalLink size={12} />
                  </a>
                )) : <p className="in-muted">{es ? "Sin PoC públicos en GitHub." : "No public PoC on GitHub."}</p>}
                {ce?.github && ce.github.count > 3 && <p className="in-muted">+{ce.github.count - 3} {es ? "repositorios más" : "more repositories"}</p>}
                {ce?.exploitdb?.items.map(x => <div key={x.path} className="in-repo"><FileWarning size={13} /><span>{x.title}<small>Exploit-DB · {x.path}</small></span></div>)}
                <p className="in-muted in-warn">{es ? "Referencia para priorizar el parche. No ejecutes exploits fuera de un entorno autorizado." : "Reference for patch prioritisation only."}</p>
              </div>
            </section>
          </div>
          <div className="wk-drawer__foot">
            <a className="vp-btn" href={`https://nvd.nist.gov/vuln/detail/${cur.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />NVD</a>
            <a className="vp-btn" href={`https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${cur.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />CISA KEV</a>
          </div>
        </aside>
      </>, document.body)}

      {post && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => setPost(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={es ? "Borrador de aviso" : "Draft notice"}>
          <div className="wk-drawer__head">
            <Megaphone size={16} /><span className="wk-drawer__id">{es ? "Borrador de aviso (IA local)" : "Draft notice (local AI)"}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setPost(null)} aria-label={es ? "Cerrar" : "Close"}><X size={16} /></button>
          </div>
          <div className="wk-drawer__scroll">
            <p className="in-muted">{es ? "Revísalo antes de difundirlo: lo redacta la IA y no se publica automáticamente." : "Review before sharing: AI-drafted, never auto-published."}</p>
            <pre className="in-post">{post}</pre>
          </div>
          <div className="wk-drawer__foot">
            <button className="vp-btn vp-btn--primary" onClick={() => { navigator.clipboard.writeText(post); toast(es ? "Copiado." : "Copied.", "ok"); }}><Copy size={13} />{es ? "Copiar" : "Copy"}</button>
          </div>
        </aside>
      </>, document.body)}
    </div>
  );
}
