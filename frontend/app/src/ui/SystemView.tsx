import { useEffect, useMemo, useState } from "react";
import {
  Activity, BrainCircuit, Database, Download, Gauge, HeartPulse, Info, LayoutDashboard, Minus, Plus, RefreshCw,
  ScrollText, Search, Server, ShieldAlert, SlidersHorizontal, X,
} from "lucide-react";
import { fetchAuth } from "../lib/api";
import { toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/**
 * Sistema (solo admin): une Estado de integraciones, Monitores y Auditoría.
 * Los monitores ahora se aplican de verdad al escalar alertas a incidentes.
 */

export type SystemTab = "health" | "monitors" | "audit";
type Health = Record<string, { status: "ok" | "warning" | "error" | "info"; latency_ms: number; error: string | null }>;
type Monitor = { id: number; name: string; description: string | null; enabled: boolean; threshold: number; severity_floor: string; rule_id_pattern: string | null; updated_at: string };
type Activity = { hours: number; sampled: number; monitors: Record<number, { matches: number; eligible: number; would_trigger: boolean; last: string | null }> };
type Audit = { id: number; username: string | null; action: string; route: string; ip_address: string | null; status_code: number | null; timestamp: string };

const SERVICES: Record<string, { name: string; desc: string; icon: typeof Server }> = {
  wazuh: { name: "Wazuh Manager", desc: "API del manager: agentes, reglas y respuesta activa", icon: Server },
  indexer: { name: "Wazuh Indexer", desc: "Almacén de alertas y vulnerabilidades (OpenSearch)", icon: Database },
  dashboard: { name: "Wazuh Dashboard", desc: "Consola nativa de Wazuh", icon: LayoutDashboard },
  postgres: { name: "PostgreSQL", desc: "Incidentes, usuarios, informes y auditoría de Valhalla", icon: Database },
  ollama: { name: "Ollama (IA local)", desc: "Análisis de alertas, resúmenes y asistente del chat", icon: BrainCircuit },
  virustotal: { name: "VirusTotal", desc: "Reputación de IOCs (clave por operador)", icon: ShieldAlert },
};
const ST_LABEL: Record<string, string> = { ok: "Operativo", warning: "Degradado", error: "Caído", info: "Opcional" };
const SEV = ["low", "medium", "high", "critical"];
const SEV_ES: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
};

function HealthTab() {
  const [h, setH] = useState<Health | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const load = () => fetchAuth<Health>("/api/health/integrations").then(d => { setH(d); setAt(new Date()); }).catch(() => setH({}));
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);
  const entries = Object.entries(h ?? {});
  const down = entries.filter(([, v]) => v.status === "error").length;
  return (
    <div className="in-vulns">
      <div className="in-bar">
        <span className={`sy-overall sy-st--${!h ? "info" : down ? "error" : "ok"}`}><HeartPulse size={15} />
          {!h ? "Comprobando…" : down ? `${down} servicio(s) caído(s)` : "Todos los servicios operativos"}</span>
        <span className="in-progress">{at ? `Comprobado ${at.toLocaleTimeString("es-ES")} · cada 30 s` : ""}</span>
        <button type="button" className="wk-iconbtn" onClick={load} title="Comprobar ahora" aria-label="Comprobar ahora"><RefreshCw size={15} /></button>
      </div>
      <div className="sy-grid">
        {entries.map(([k, v]) => {
          const meta = SERVICES[k] ?? { name: k, desc: "", icon: Server }; const I = meta.icon;
          return (
            <div key={k} className={`in-panel sy-card sy-st--${v.status}`}>
              <div className="sy-card__top"><span className="sy-icon"><I size={18} /></span><span className="sy-pill">{ST_LABEL[v.status] ?? v.status}</span></div>
              <b>{meta.name}</b>
              <p>{meta.desc}</p>
              <span className="sy-lat">{v.status === "info" ? "—" : `${v.latency_ms} ms`}</span>
              {v.error && <p className="sy-err" title={v.error}>{v.error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonitorsTab() {
  const [list, setList] = useState<Monitor[] | null>(null);
  const [act, setAct] = useState<Activity | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => {
    fetchAuth<Monitor[]>("/api/monitors").then(setList).catch(() => setList([]));
    fetchAuth<Activity>("/api/monitors/activity?hours=24").then(setAct).catch(() => setAct(null));
  };
  useEffect(() => { load(); }, []);
  const save = async (m: Monitor, patch: Partial<Monitor>) => {
    setBusy(m.id);
    try {
      const u = await fetchAuth<Monitor>(`/api/monitors/${m.id}`, { method: "PUT", body: JSON.stringify(patch) });
      setList(l => (l ?? []).map(x => (x.id === m.id ? u : x)));
      fetchAuth<Activity>("/api/monitors/activity?hours=24").then(setAct).catch(() => {});
    } catch (e) { toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, "err"); }
    finally { setBusy(null); }
  };
  return (
    <div className="in-vulns">
      <p className="in-foot"><Info size={12} />Al sincronizar alertas, una alerta que coincide con un monitor activo solo se escala a incidente si alcanza su severidad mínima y el monitor acumula su umbral de alertas en la ventana. Las alertas sin monitor se escalan si son altas o críticas.{act ? ` Actividad calculada sobre las últimas ${act.sampled} alertas (24 h).` : ""}</p>
      {!list ? <p className="in-empty">Cargando…</p> : (
        <div className="sy-mons">
          {list.map(m => {
            const a = act?.monitors[m.id];
            return (
              <div key={m.id} className={`in-panel sy-mon${m.enabled ? "" : " is-off"}`}>
                <div className="sy-mon__head">
                  <button type="button" role="switch" aria-checked={m.enabled} className="sy-switch" disabled={busy === m.id} onClick={() => save(m, { enabled: !m.enabled })} aria-label={`${m.enabled ? "Desactivar" : "Activar"} ${m.name}`}><i /></button>
                  <div><b>{m.name}</b><p>{m.description}</p></div>
                  <span className={`sy-pill sy-st--${!m.enabled ? "info" : a?.would_trigger ? "error" : a?.matches ? "warning" : "ok"}`}>
                    {!m.enabled ? "Desactivado" : a?.would_trigger ? "Se dispararía" : a?.matches ? "Por debajo del umbral" : "Sin coincidencias"}
                  </span>
                </div>
                <div className="sy-mon__body">
                  <div><span className="wk-fact__k">Reglas / grupos</span><div className="in-tags">{(m.rule_id_pattern || "").split(",").filter(Boolean).map(t => <span key={t}>{t.trim()}</span>)}</div></div>
                  <div><span className="wk-fact__k">Umbral (alertas)</span>
                    <div className="sy-step">
                      <button type="button" onClick={() => save(m, { threshold: Math.max(1, m.threshold - 1) })} disabled={busy === m.id || m.threshold <= 1} aria-label="Reducir umbral"><Minus size={12} /></button>
                      <b>{m.threshold}</b>
                      <button type="button" onClick={() => save(m, { threshold: m.threshold + 1 })} disabled={busy === m.id} aria-label="Aumentar umbral"><Plus size={12} /></button>
                    </div>
                  </div>
                  <div><span className="wk-fact__k">Severidad mínima</span>
                    <div className="in-seg sy-sev">{SEV.map(s => <button key={s} type="button" aria-pressed={m.severity_floor === s} disabled={busy === m.id} onClick={() => save(m, { severity_floor: s })}>{SEV_ES[s]}</button>)}</div>
                  </div>
                  <div><span className="wk-fact__k">Últimas 24 h</span><div className="sy-act"><b>{a?.matches ?? "…"}</b> coincidencias · <b>{a?.eligible ?? "…"}</b> con severidad suficiente<small>{a?.last ? `última ${ago(a.last)}` : ""}</small></div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState<Audit[] | null>(null);
  const [page, setPage] = useState(1);
  const [user, setUser] = useState("");
  const [method, setMethod] = useState("all");
  const [failedOnly, setFailedOnly] = useState(false);
  const load = (p = page) => {
    const qs = new URLSearchParams({ page: String(p), size: "100", ...(user ? { user } : {}), ...(method !== "all" ? { action: method } : {}) });
    fetchAuth<Audit[]>(`/api/audit?${qs}`).then(setRows).catch(() => setRows([]));
  };
  useEffect(() => { load(page); }, [page, method]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (rows ?? []).filter(r => !failedOnly || (r.status_code ?? 0) >= 400), [rows, failedOnly]);
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["fecha,usuario,metodo,ruta,ip,estado", ...shown.map(r => [r.timestamp, r.username, r.action, r.route, r.ip_address, r.status_code ?? ""].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `valhalla-auditoria-p${page}.csv` }).click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="in-vulns">
      <div className="in-bar">
        <form className="wk-search" onSubmit={e => { e.preventDefault(); setPage(1); load(1); }}>
          <Search size={15} />
          <input className="vp-bare-input" value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario…" aria-label="Filtrar por usuario" />
          {user && <button type="button" className="wk-search__clear" onClick={() => { setUser(""); setTimeout(() => load(1), 0); }} aria-label="Borrar"><X size={13} /></button>}
        </form>
        <div className="in-seg" role="group" aria-label="Método">
          {["all", "POST", "PUT", "PATCH", "DELETE"].map(m => <button key={m} type="button" aria-pressed={method === m} onClick={() => { setMethod(m); setPage(1); }}>{m === "all" ? "Todas" : m}</button>)}
        </div>
        <button type="button" className={`vp-btn${failedOnly ? " vp-btn--primary" : ""}`} onClick={() => setFailedOnly(v => !v)} title="Solo acciones rechazadas (4xx/5xx)"><ShieldAlert size={14} />Fallidas</button>
        <button type="button" className="wk-iconbtn" onClick={exportCsv} disabled={!shown.length} title="Exportar a CSV" aria-label="Exportar a CSV"><Download size={15} /></button>
        <span className="in-progress" />
        <div className="sy-pager">
          <button type="button" className="wk-iconbtn" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">‹</button>
          <span>Pág. {page}</span>
          <button type="button" className="wk-iconbtn" disabled={(rows?.length ?? 0) < 100} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente">›</button>
        </div>
      </div>
      <div className="in-list" role="table">
        <div className="in-row sy-arow in-row--head" role="row"><span>Fecha</span><span>Usuario</span><span>Acción</span><span>Ruta</span><span>IP</span><span>Resultado</span></div>
        {!rows && <p className="in-empty">Cargando…</p>}
        {rows && !shown.length && <p className="in-empty">Sin registros con este filtro.</p>}
        {shown.map(r => {
          const st = r.status_code;
          return (
            <div key={r.id} className="in-row sy-arow" role="row" style={{ cursor: "default" }}>
              <span className="in-muted">{new Date(r.timestamp).toLocaleString("es-ES")}</span>
              <span><b>{r.username || "—"}</b></span>
              <span><span className={`sy-method sy-method--${r.action.toLowerCase()}`}>{r.action}</span></span>
              <span className="sy-route" title={r.route}>{r.route}</span>
              <span className="in-muted">{r.ip_address || "—"}</span>
              <span>{st ? <span className={`sy-pill sy-st--${st >= 500 ? "error" : st >= 400 ? "warning" : "ok"}`}>{st}</span> : <span className="in-muted">—</span>}</span>
            </div>
          );
        })}
      </div>
      <p className="in-foot"><Info size={12} />Se registran todas las acciones que modifican datos (POST, PUT, PATCH, DELETE) con usuario, IP y resultado; nunca el contenido de la petición (contraseñas, claves).</p>
    </div>
  );
}

export default function SystemView({ initialTab = "health" }: { initialTab?: SystemTab }) {
  const [tab, setTab] = useState<SystemTab>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const tabs: [SystemTab, typeof Gauge, string, string][] = [
    ["health", Activity, "Estado", "Salud de las integraciones de la plataforma"],
    ["monitors", SlidersHorizontal, "Monitores", "Qué alertas se escalan a incidente y con qué umbral"],
    ["audit", ScrollText, "Auditoría", "Registro de acciones de los usuarios"],
  ];
  return (
    <div className="view in">
      <div className="wk-head">
        <div><h1>Sistema</h1><p>{tabs.find(t => t[0] === tab)?.[3]}</p></div>
        <div className="vx-seg in-hubtabs" role="tablist" aria-label="Sistema">
          {tabs.map(([id, I, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}><I size={14} /> {l}</button>)}
        </div>
      </div>
      <div className="in-body">
        {tab === "health" && <HealthTab />}
        {tab === "monitors" && <MonitorsTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

