import { useEffect, useMemo, useState } from "react";
import {
  Ban, CheckCircle2, Eye, FileCode2, Globe, KeyRound, Network, Search, ShieldAlert, ShieldCheck, ShieldQuestion, Trash2, X, Crosshair, Radio,
} from "lucide-react";
import {
  vtCheckIp, vtCheckHash, vtCheckDomain, listIOCs, addIOC, updateIOC, deleteIOC, setMyVtApiKey, getVtKeyStatus,
  blockIp, unblockIp, abuseCheckIp, getAbuseKeyStatus, setMyAbuseKey, type AbuseIpResult,
} from "../../lib/api";
import { HoldButton, toast } from "../premium/widgets";

/** IOCs: análisis (VirusTotal + AbuseIPDB) a la izquierda y lista de vigilancia a la derecha. */

type IocType = "ip" | "hash" | "domain";
type Tab = "engines" | "details" | "whois" | "dns" | "community";
const STATUS_LABEL: Record<string, [string, string]> = {
  watchlist: ["Vigilancia", "Watchlist"], blocked: ["Bloqueado", "Blocked"], whitelist: ["Lista blanca", "Whitelist"], cleared: ["Resuelto", "Cleared"],
};
const TYPE_ICON = { ip: Network, hash: FileCode2, domain: Globe } as const;
const detectType = (v: string): IocType =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? "ip" : /^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(v) ? "hash" : "domain";

export default function IntelIocs({ es, initialIp }: { es: boolean; initialIp?: string }) {
  const [query, setQuery] = useState(initialIp ?? "");
  const [result, setResult] = useState<any>(null);
  const [abuse, setAbuse] = useState<AbuseIpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("engines");
  const [list, setList] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [keys, setKeys] = useState({ vt: false, abuse: false });
  const [keyForm, setKeyForm] = useState<null | { vt: string; abuse: string }>(null);
  const type = detectType(query.trim());

  const loadList = async () => { try { setList(await listIOCs()); } catch { setList([]); } };
  useEffect(() => {
    loadList();
    Promise.all([getVtKeyStatus().catch(() => ({ configured: false })), getAbuseKeyStatus().catch(() => ({ configured: false }))])
      .then(([v, a]) => setKeys({ vt: v.configured, abuse: a.configured }));
    if (initialIp) analyze(initialIp);
  }, [initialIp]); // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze(value = query) {
    const v = value.trim();
    if (!v) return;
    const t = detectType(v);
    setLoading(true); setResult(null); setAbuse(null); setTab("engines");
    try {
      const [vt, ab] = await Promise.all([
        t === "ip" ? vtCheckIp(v) : t === "hash" ? vtCheckHash(v) : vtCheckDomain(v),
        t === "ip" ? abuseCheckIp(v).catch(() => null) : Promise.resolve(null),
      ]);
      setResult(vt); setAbuse(ab);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/API Key/i.test(msg)) {
        setKeyForm({ vt: "", abuse: "" });
        toast(es ? "Falta tu clave de VirusTotal: añádela abajo (es gratuita en virustotal.com)." : "VirusTotal API key missing.", "err");
      } else {
        toast(`${es ? "Error en la consulta" : "Query failed"}: ${msg.replace(/^HTTP \d+:\s*/, "")}`, "err");
      }
    } finally { setLoading(false); }
  }

  const iocPayload = (statusVal: string, tag: string) => ({
    value: query.trim(), ioc_type: type, malicious_score: result?.malicious || 0, total_engines: result?.total || 0,
    country: result?.country, asn: result?.asn, as_owner: result?.as_owner, tags: [...(result?.tags || []), tag], status: statusVal, vt_report: result,
  });

  const watch = async () => {
    try { await addIOC(iocPayload("watchlist", "watchlist-manual")); toast(es ? "Añadido a vigilancia." : "Added to watchlist.", "ok"); loadList(); }
    catch { toast(es ? "No se pudo añadir (¿ya existe?)." : "Could not add (exists?).", "err"); }
  };
  const whitelist = async () => {
    try { await addIOC(iocPayload("whitelist", "whitelist-manual")); toast(es ? "En lista blanca (excluido de bloqueos automáticos)." : "Whitelisted.", "ok"); loadList(); }
    catch { toast(es ? "No se pudo añadir a lista blanca." : "Could not whitelist.", "err"); }
  };
  const block = async () => {
    const v = query.trim();
    if (type !== "ip") {
      try { await addIOC(iocPayload("blocked", "blocked-manually")); toast(es ? "Marcado como bloqueado en el registro (los dominios y hashes no van al firewall)." : "Marked blocked in registry.", "ok"); loadList(); }
      catch { toast(es ? "No se pudo registrar el bloqueo." : "Could not record block.", "err"); }
      return;
    }
    await addIOC(iocPayload("blocked", "blocked-firewall")).catch(() => {});
    try {
      const r = await blockIp(v);
      // Aviso honesto de lo que Wazuh confirmó realmente
      const msg = r.active_response && r.cdb_applied ? (es ? "firewall-drop aplicado y añadida a la lista CDB." : "firewall-drop applied and added to CDB.")
        : r.active_response ? (es ? "firewall-drop activo; la lista CDB no se actualizó." : "firewall-drop active; CDB not updated.")
        : r.cdb_applied ? (es ? "añadida a la lista CDB; el firewall-drop no se confirmó." : "added to CDB; firewall-drop not confirmed.")
        : (es ? "registrado, pero Wazuh no confirmó la acción." : "recorded but Wazuh did not confirm.");
      toast(`IP ${v}: ${msg}`, r.active_response || r.cdb_applied ? "ok" : "err");
    } catch (e) { toast(`${es ? "No se pudo bloquear en Wazuh" : "Could not block in Wazuh"}: ${e instanceof Error ? e.message : e}`, "err"); }
    finally { loadList(); }
  };

  const cycle = async (ioc: any) => {
    const next = ioc.status === "watchlist" ? "blocked" : ioc.status === "blocked" ? "cleared" : "watchlist";
    try {
      if (ioc.status === "blocked" && ioc.ioc_type === "ip") await unblockIp(ioc.value).catch(() => {});
      await updateIOC(ioc.id, { status: next }); loadList();
    } catch { toast(es ? "No se pudo cambiar el estado." : "Could not change status.", "err"); }
  };
  const remove = async (ioc: any) => {
    if (!confirm(es ? `¿Eliminar ${ioc.value} del registro?` : `Delete ${ioc.value}?`)) return;
    try { await deleteIOC(ioc.id); loadList(); } catch { toast(es ? "No se pudo eliminar." : "Could not delete.", "err"); }
  };

  const saveKeys = async () => {
    if (!keyForm) return;
    try {
      if (keyForm.vt) await setMyVtApiKey(keyForm.vt);
      if (keyForm.abuse) await setMyAbuseKey(keyForm.abuse);
      setKeys(k => ({ vt: k.vt || !!keyForm.vt, abuse: k.abuse || !!keyForm.abuse }));
      setKeyForm(null); toast(es ? "Claves guardadas cifradas en tu perfil." : "Keys saved (encrypted).", "ok");
    } catch (e) { toast(`${es ? "Clave rechazada" : "Key rejected"}: ${e instanceof Error ? e.message : e}`, "err"); }
  };

  const shown = useMemo(() => list.filter(i => status === "all" || i.status === status), [list, status]);
  const ratio = result?.total ? result.malicious / result.total : 0;
  const verdict = !result?.found ? null : result.malicious >= 3 ? "bad" : result.malicious > 0 || result.suspicious > 0 ? "sus" : "ok";
  const VerdictIcon = verdict === "bad" ? ShieldAlert : verdict === "sus" ? ShieldQuestion : ShieldCheck;
  const TypeIcon = TYPE_ICON[type];

  return (
    <div className="in-iocs">
      <section className="in-panel in-analyze">
        <form className="in-query" onSubmit={e => { e.preventDefault(); analyze(); }}>
          <label className="wk-search">
            <TypeIcon size={15} />
            <input className="vp-bare-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={es ? "IP, dominio o hash (MD5/SHA1/SHA256)…" : "IP, domain or hash…"} aria-label={es ? "Indicador a analizar" : "Indicator"} />
            {query && <button type="button" className="wk-search__clear" onClick={() => setQuery("")} aria-label={es ? "Borrar" : "Clear"}><X size={13} /></button>}
          </label>
          <button type="submit" className="vp-btn vp-btn--primary" disabled={!query.trim() || loading}><Search size={14} />{loading ? (es ? "Analizando…" : "Analyzing…") : (es ? "Analizar" : "Analyze")}</button>
          <button type="button" className={`wk-iconbtn${keys.vt ? "" : " in-attn"}`} onClick={() => setKeyForm({ vt: "", abuse: "" })} title={es ? "Claves de VirusTotal y AbuseIPDB" : "API keys"} aria-label={es ? "Claves de API" : "API keys"}><KeyRound size={15} /></button>
        </form>
        <p className="in-hint">{query.trim() && <>{es ? "Tipo detectado" : "Detected type"}: <b>{type === "ip" ? "IP" : type === "hash" ? "Hash" : es ? "Dominio" : "Domain"}</b> · </>}VirusTotal {keys.vt ? "✓" : "✗"} · AbuseIPDB {keys.abuse ? "✓" : "✗"}</p>

        {keyForm && (
          <div className="in-keys">
            <label>VirusTotal<input type="password" autoComplete="off" value={keyForm.vt} onChange={e => setKeyForm({ ...keyForm, vt: e.target.value })} placeholder={keys.vt ? (es ? "Configurada · dejar vacío para mantener" : "Configured") : "API key"} /></label>
            <label>AbuseIPDB<input type="password" autoComplete="off" value={keyForm.abuse} onChange={e => setKeyForm({ ...keyForm, abuse: e.target.value })} placeholder={keys.abuse ? (es ? "Configurada · dejar vacío para mantener" : "Configured") : "API key"} /></label>
            <div className="in-keys__btns">
              <button type="button" className="vp-btn" onClick={() => setKeyForm(null)}>{es ? "Cancelar" : "Cancel"}</button>
              <button type="button" className="vp-btn vp-btn--primary" onClick={saveKeys} disabled={!keyForm.vt && !keyForm.abuse}>{es ? "Guardar cifradas" : "Save encrypted"}</button>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="in-placeholder"><Crosshair size={28} /><p>{es ? "Analiza una IP, dominio o hash para ver su reputación y decidir: vigilar, lista blanca o bloquear." : "Analyze an indicator to see its reputation."}</p>
            {!keys.vt && !keyForm && <button type="button" className="vp-btn" onClick={() => setKeyForm({ vt: "", abuse: "" })}><KeyRound size={14} />{es ? "Configurar clave de VirusTotal" : "Set VirusTotal key"}</button>}
          </div>
        )}
        {loading && <div className="in-placeholder"><span className="ex-state__spin" /></div>}

        {result && !loading && (result.found === false ? (
          <div className="in-placeholder"><ShieldQuestion size={28} /><p>{result.error ? `${es ? "VirusTotal no respondió" : "VirusTotal error"}: ${result.error}` : (es ? "VirusTotal no tiene datos de este indicador." : "No VirusTotal data.")}</p></div>
        ) : (
          <>
            <div className={`in-verdict in-verdict--${verdict}`}>
              <div className="in-ring" style={{ ["--p" as string]: `${Math.round(ratio * 100)}` }}><b>{result.malicious}</b><small>/{result.total}</small></div>
              <div className="in-verdict__body">
                <span className="in-verdict__label"><VerdictIcon size={14} />{verdict === "bad" ? (es ? "Malicioso" : "Malicious") : verdict === "sus" ? (es ? "Sospechoso" : "Suspicious") : (es ? "Sin detecciones" : "Clean")}</span>
                <b className="in-verdict__value">{query.trim()}</b>
                <span className="in-muted">{[result.country, result.asn && `AS${result.asn}`, result.as_owner].filter(Boolean).join(" · ") || (type === "hash" ? `${result.type ?? ""} ${result.size ? `· ${(result.size / 1024).toFixed(0)} KB` : ""}` : "")}</span>
                {!!result.tags?.length && <div className="in-tags">{result.tags.slice(0, 6).map((t: string) => <span key={t}>{t}</span>)}</div>}
              </div>
            </div>
            {abuse && (abuse.found ? (
              <div className="in-abuse">
                <span className="in-abuse__k">AbuseIPDB</span>
                <span className="ex-meter" style={{ flex: 1 }}><i style={{ width: `${abuse.abuse_confidence_score}%`, background: (abuse.abuse_confidence_score ?? 0) >= 50 ? "#ef4f5f" : "var(--signal)" }} /></span>
                <b>{abuse.abuse_confidence_score}%</b>
                <span className="in-muted">{abuse.total_reports} {es ? "informes" : "reports"}{abuse.is_tor ? " · Tor" : ""}{abuse.isp ? ` · ${abuse.isp}` : ""}</span>
              </div>
            ) : <p className="in-hint">AbuseIPDB: {abuse.error?.includes("401") ? (es ? "configura tu clave para ver la reputación comunitaria." : "set your API key.") : abuse.error}</p>)}

            <div className="in-actions">
              <button type="button" className="vp-btn" onClick={watch}><Eye size={14} />{es ? "Vigilar" : "Watch"}</button>
              <button type="button" className="vp-btn" onClick={whitelist}><CheckCircle2 size={14} />{es ? "Lista blanca" : "Whitelist"}</button>
              <HoldButton className="in-block" onConfirm={block} title={es ? "Mantén pulsado para bloquear" : "Hold to block"}>
                <Ban size={14} />{type === "ip" ? (es ? "Bloquear en firewall" : "Block in firewall") : (es ? "Marcar bloqueado" : "Mark blocked")}
              </HoldButton>
            </div>

            <div className="in-seg in-tabs" role="tablist">
              {([["engines", es ? "Motores" : "Engines"], ["details", es ? "Detalles" : "Details"], ...(result.whois ? [["whois", "WHOIS"]] : []), ...(result.resolutions ? [["dns", "DNS"]] : []), ["community", es ? "Comunidad" : "Community"]] as [Tab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div className="in-tabbody">
              {tab === "engines" && ((result.vendor_results ?? []).filter((v: any) => ["malicious", "suspicious"].includes(v.category)).length
                ? <ul className="in-engines">{result.vendor_results.filter((v: any) => ["malicious", "suspicious"].includes(v.category)).map((v: any) => (
                    <li key={v.vendor}><b>{v.vendor}</b><span className={`in-cat in-cat--${v.category}`}>{v.result || v.category}</span></li>))}</ul>
                : <p className="in-muted">{es ? "Ningún motor lo marca como malicioso o sospechoso." : "No engine flags it."}</p>)}
              {tab === "details" && (
                <div className="wk-facts">
                  {[[es ? "Reputación" : "Reputation", result.reputation], [es ? "Red" : "Network", result.network], ["RIR", result.regional_internet_registry],
                    [es ? "Último análisis" : "Last analysis", result.last_analysis_date], [es ? "Primer envío" : "First seen", result.first_submission_date],
                    [es ? "Último envío" : "Last seen", result.last_submission_date], ["SHA-256", result.sha256 || result.sha], ["MD5", result.md5]]
                    .filter(([, v]) => v !== undefined && v !== null && v !== "")
                    .map(([k, v]) => <div key={String(k)}><div className="wk-fact__k">{k}</div><div className="wk-fact__v" title={String(v)}>{String(v)}</div></div>)}
                </div>
              )}
              {tab === "whois" && <pre className="in-pre">{result.whois}</pre>}
              {tab === "dns" && ((result.resolutions ?? []).length
                ? <ul className="in-engines">{result.resolutions.map((r: any, i: number) => <li key={i}><b>{r.host || r.ip}</b><span className="in-muted">{r.date}</span></li>)}</ul>
                : <p className="in-muted">{es ? "Sin resoluciones DNS." : "No DNS resolutions."}</p>)}
              {tab === "community" && ((result.comments ?? []).length
                ? <ul className="in-comments">{result.comments.map((c: any, i: number) => <li key={i}><small>{c.user} · {c.date}</small><p>{c.text}</p></li>)}</ul>
                : <p className="in-muted">{es ? "Sin comentarios de la comunidad." : "No community comments."}</p>)}
            </div>
          </>
        ))}
      </section>

      <section className="in-panel in-watch">
        <header className="in-watch__head">
          <Radio size={15} /><h3>{es ? "Indicadores en seguimiento" : "Tracked indicators"}</h3><span className="in-count">{list.length}</span>
        </header>
        <div className="wk-chipset">
          {["all", "watchlist", "blocked", "whitelist", "cleared"].map(s => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === "all" ? (es ? "Todos" : "All") : STATUS_LABEL[s][es ? 0 : 1]} <small>{s === "all" ? list.length : list.filter(i => i.status === s).length}</small>
            </button>
          ))}
        </div>
        <ul className="in-wlist">
          {!shown.length && <li className="in-empty">{es ? "No hay indicadores en esta lista." : "No indicators."}</li>}
          {shown.map(i => { const I = TYPE_ICON[i.ioc_type as IocType] ?? Globe; return (
            <li key={i.id}>
              <I size={14} className="in-wlist__icon" />
              <button type="button" className="in-wlist__val" onClick={() => { setQuery(i.value); analyze(i.value); }} title={es ? "Volver a analizar" : "Re-analyze"}>{i.value}</button>
              <span className={`in-det${i.malicious_score >= 3 ? " is-bad" : ""}`}>{i.malicious_score}/{i.total_engines}</span>
              <button type="button" className={`in-st in-st--${i.status}`} onClick={() => cycle(i)} title={es ? "Cambiar estado (vigilancia → bloqueado → resuelto)" : "Cycle status"}>{STATUS_LABEL[i.status]?.[es ? 0 : 1] ?? i.status}</button>
              <button type="button" className="vx-iconbtn" onClick={() => remove(i)} aria-label={es ? "Eliminar" : "Delete"}><Trash2 size={13} /></button>
            </li>
          ); })}
        </ul>
      </section>
    </div>
  );
}
