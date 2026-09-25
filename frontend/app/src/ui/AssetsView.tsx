import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bug, Copy, Cpu, KeyRound, MemoryStick, Monitor, Network, Package, RefreshCw, Search, ServerCog, ShieldCheck, ShieldAlert, Wifi, WifiOff, X, Info,
} from "lucide-react";
import {
  listAgents, getAgentInventory, getAgentVulnerabilities, getVulnSummary, getLsaEndpoints, getLsaAlerts,
  type AgentInventory, type AgentVuln,
} from "../lib/api";
import { KpiCard, toast } from "./premium/widgets";
import "./premium/dashboard.css";
import "./premium/workspace.css";
import "./premium/executive.css";
import "./intel/intel.css";

/**
 * Activos: equipos con agente Wazuh (inventario real y vulnerabilidades) y pestaña de hardening
 * Windows (LSA), que antes era la sección aparte "LSA Monitor".
 */

type Tab = "hosts" | "lsa";
const SEV = ["critical", "high", "medium", "low"] as const;
const SEV_ES: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };
const SEV_TONE: Record<string, string> = { critical: "crit", high: "high", medium: "warn", low: "ok" };
const osText = (a: any) => (typeof a.os === "object" && a.os ? `${a.os.name ?? ""} ${a.os.version ?? ""}`.trim() : a.os) || "—";
const ago = (iso?: string) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
};

// Comandos reales de protección LSA (RunAsPPL). El comando anterior escribía una clave inexistente (Services\LSASS\RequireStart).
const LSA_CMDS = [
  { t: "Comprobar si LSA corre como proceso protegido", c: "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name RunAsPPL -ErrorAction SilentlyContinue).RunAsPPL   # 1 o 2 = activado" },
  { t: "Activar la protección LSA (requiere reinicio)", c: "New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name RunAsPPL -Value 1 -PropertyType DWord -Force   # 1 = con bloqueo UEFI; 2 = sin bloqueo (Win11 22H2+)" },
  { t: "Verificar tras reiniciar (evento 12 de Wininit)", c: "Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Wininit'; Id=12} -MaxEvents 1 | Format-List Message" },
  { t: "Detectar accesos a lsass.exe (Sysmon, evento 10)", c: "Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=10} -MaxEvents 200 | Where-Object { $_.Message -match 'TargetImage:.*lsass.exe' }" },
];

export default function AssetsView({ lang = "es", initialTab = "hosts" }: { lang?: "es" | "en"; initialTab?: Tab }) {
  const es = lang === "es";
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const [agents, setAgents] = useState<any[] | null>(null);
  const [vsum, setVsum] = useState<Record<string, Record<string, number>>>({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "down">("all");
  const [sel, setSel] = useState<any | null>(null);
  const [inv, setInv] = useState<AgentInventory | null>(null);
  const [vulns, setVulns] = useState<AgentVuln[] | null>(null);
  const [vfilter, setVfilter] = useState<string>("all");
  const [lsa, setLsa] = useState<{ endpoints: any[]; alerts: any[] } | null>(null);

  const load = async () => {
    try { setAgents(await listAgents()); } catch { setAgents([]); toast(es ? "No se pudo consultar la API de Wazuh." : "Wazuh API unavailable.", "err"); }
    getVulnSummary().then(setVsum).catch(() => setVsum({}));
  };
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== "lsa" || lsa) return;
    Promise.all([getLsaEndpoints().catch(() => []), getLsaAlerts(24).catch(() => [])]).then(([endpoints, alerts]) => setLsa({ endpoints, alerts }));
  }, [tab, lsa]);

  const open = async (a: any) => {
    setSel(a); setInv(null); setVulns(null); setVfilter("all");
    const [i, v] = await Promise.all([getAgentInventory(a.id).catch(() => null), getAgentVulnerabilities(a.id).catch(() => [])]);
    setInv(i); setVulns(v as AgentVuln[]);
  };

  const rows = useMemo(() => (agents ?? []).filter(a => {
    if (status === "active" && a.status !== "active") return false;
    if (status === "down" && a.status === "active") return false;
    if (!q) return true;
    return `${a.id} ${a.name} ${a.ip ?? ""} ${osText(a)}`.toLowerCase().includes(q.toLowerCase());
  }), [agents, q, status]);

  const total = agents?.length ?? 0;
  const active = (agents ?? []).filter(a => a.status === "active").length;
  const vTotal = Object.values(vsum).reduce((s, v) => s + (v.total ?? 0), 0);
  const vCrit = Object.values(vsum).reduce((s, v) => s + (v.critical ?? 0) + (v.high ?? 0), 0);
  const shownVulns = (vulns ?? []).filter(v => vfilter === "all" || v.severity === vfilter);
  const copy = (c: string) => { navigator.clipboard.writeText(c); toast(es ? "Comando copiado." : "Copied.", "ok"); };

  return (
    <div className="view in as">
      <div className="wk-head">
        <div>
          <h1>{es ? "Activos" : "Assets"}</h1>
          <p>{tab === "hosts" ? (es ? "Equipos con agente Wazuh: inventario y vulnerabilidades reales" : "Wazuh agents: inventory and vulnerabilities") : (es ? "Protección de credenciales en equipos Windows" : "Windows credential protection")}</p>
        </div>
        <div className="vx-seg in-hubtabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "hosts"} aria-pressed={tab === "hosts"} onClick={() => setTab("hosts")}><Monitor size={14} /> {es ? "Equipos" : "Hosts"}</button>
          <button type="button" role="tab" aria-selected={tab === "lsa"} aria-pressed={tab === "lsa"} onClick={() => setTab("lsa")}><KeyRound size={14} /> {es ? "Hardening Windows (LSA)" : "Windows hardening (LSA)"}</button>
        </div>
      </div>

      <div className="in-body">
        {tab === "hosts" && (
          <div className="in-vulns">
            <div className="in-kpis">
              <KpiCard icon={ServerCog} label={es ? "Agentes" : "Agents"} value={total} sub={es ? "Registrados en Wazuh" : "Registered"} tone="info" />
              <KpiCard icon={Wifi} label={es ? "Conectados" : "Active"} value={active} sub={`${total - active} ${es ? "desconectados" : "disconnected"}`} tone="ok" />
              <KpiCard icon={Bug} label={es ? "Vulnerabilidades" : "Vulnerabilities"} value={vTotal} sub={es ? "En paquetes instalados" : "In installed packages"} tone="warning" />
              <KpiCard icon={ShieldAlert} label={es ? "Críticas + altas" : "Critical + high"} value={vCrit} sub={es ? "A priorizar" : "Prioritise"} tone="danger" />
            </div>
            <div className="in-bar">
              <label className="wk-search">
                <Search size={15} />
                <input className="vp-bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder={es ? "Nombre, IP o sistema…" : "Name, IP or OS…"} />
                {q && <button className="wk-search__clear" onClick={() => setQ("")} aria-label={es ? "Borrar" : "Clear"}><X size={13} /></button>}
              </label>
              <div className="in-seg" role="group" aria-label={es ? "Estado" : "Status"}>
                {([["all", Monitor, es ? "Todos" : "All"], ["active", Wifi, es ? "Conectados" : "Active"], ["down", WifiOff, es ? "Desconectados" : "Down"]] as const).map(([k, I, l]) => (
                  <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} title={l}><I size={14} /><span>{l}</span></button>
                ))}
              </div>
              <button type="button" className="wk-iconbtn" onClick={load} title={es ? "Actualizar" : "Refresh"} aria-label={es ? "Actualizar" : "Refresh"}><RefreshCw size={15} /></button>
            </div>

            <div className="in-list as-list" role="table">
              <div className="in-row as-row in-row--head" role="row"><span /><span>{es ? "Equipo" : "Host"}</span><span>IP</span><span>{es ? "Sistema" : "OS"}</span><span>{es ? "Agente" : "Agent"}</span><span>{es ? "Último contacto" : "Last seen"}</span><span>{es ? "Vulnerabilidades" : "Vulns"}</span></div>
              {!agents && <p className="in-empty">{es ? "Consultando Wazuh…" : "Loading…"}</p>}
              {agents && !rows.length && <p className="in-empty">{es ? "Ningún equipo con este filtro." : "No hosts."}</p>}
              {rows.map(a => {
                const vs = vsum[a.id];
                return (
                  <div key={a.id} role="row" className="in-row as-row" tabIndex={0} onClick={() => open(a)} onKeyDown={e => e.key === "Enter" && open(a)}>
                    <span><i className={`as-dot${a.status === "active" ? " is-on" : ""}`} title={a.status} /></span>
                    <span className="in-prod"><b>{a.name}</b><small>ID {a.id}{a.id === "000" ? (es ? " · manager" : " · manager") : ""}</small></span>
                    <span>{a.ip || "—"}</span>
                    <span className="in-prod"><b>{osText(a)}</b></span>
                    <span className="in-muted">{(a.version || "").replace("Wazuh ", "")}</span>
                    <span className="in-muted">{ago(a.lastKeepAlive || a.last_keep_alive)}</span>
                    <span className="as-vulns">{vs?.total ? SEV.filter(s => vs[s]).map(s => <span key={s} className={`in-cvss ex-tone-${SEV_TONE[s]}`} title={SEV_ES[s]}>{vs[s]}</span>) : <span className="in-muted">{es ? "0 / pendiente" : "0"}</span>}</span>
                  </div>
                );
              })}
            </div>
            <p className="in-foot"><Info size={12} />{es
              ? "Wazuh 4.9 analiza los paquetes de cada equipo automáticamente tras cada inventario (cada hora); no hace falta lanzar escaneos a mano."
              : "Wazuh 4.9 scans packages automatically after each inventory."}</p>
          </div>
        )}

        {tab === "lsa" && (
          <div className="in-vulns">
            <section className="in-panel as-lsa-intro">
              <KeyRound size={18} />
              <div>
                <b>{es ? "Robo de credenciales de LSASS (MITRE T1003.001)" : "LSASS credential dumping (T1003.001)"}</b>
                <p>{es
                  ? "Herramientas como Mimikatz leen la memoria de lsass.exe para obtener contraseñas y hashes. La protección LSA (RunAsPPL) lo impide y Sysmon (evento 10) registra cada acceso a lsass.exe para que Wazuh lo detecte."
                  : "Tools like Mimikatz read lsass.exe memory. LSA protection (RunAsPPL) prevents it and Sysmon event 10 logs access."}</p>
              </div>
            </section>

            <section className="in-panel">
              <header className="in-watch__head"><Monitor size={15} /><h3>{es ? "Equipos Windows" : "Windows hosts"}</h3><span className="in-count">{lsa?.endpoints.length ?? "…"}</span></header>
              {!lsa ? <p className="in-empty">{es ? "Consultando…" : "Loading…"}</p> : lsa.endpoints.length ? (
                <ul className="in-wlist">
                  {lsa.endpoints.map(e => (
                    <li key={e.hostname} className="as-lsa-row">
                      <Monitor size={14} className="in-wlist__icon" />
                      <b className="in-wlist__val">{e.hostname}</b>
                      <span className={`in-st in-st--${e.runasppl_enabled ? "whitelist" : "blocked"}`}>{e.runasppl_enabled ? "RunAsPPL ✓" : "RunAsPPL ✗"}</span>
                      <span className="in-det">{es ? "riesgo" : "risk"} {e.risk_score}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="in-empty">{es
                  ? "No hay equipos Windows con agente Wazuh. En el laboratorio solo hay Linux, así que esta protección no aplica todavía. Para cubrirla: instala el agente Wazuh y Sysmon en los equipos Windows."
                  : "No Windows hosts enrolled."}</p>
              )}
            </section>

            <section className="in-panel">
              <header className="in-watch__head"><ShieldAlert size={15} /><h3>{es ? "Accesos a credenciales (24 h)" : "Credential access (24 h)"}</h3><span className="in-count">{lsa?.alerts.length ?? "…"}</span></header>
              {lsa?.alerts.length ? (
                <ul className="in-engines as-alerts">
                  {lsa.alerts.map(a => <li key={a.id}><b>{a.hostname}</b><span className="in-muted">{a.source_process} → {a.target_process} · {new Date(a.timestamp).toLocaleString("es-ES")}</span></li>)}
                </ul>
              ) : <p className="in-empty">{es ? "Sin accesos a lsass.exe registrados." : "No lsass.exe access recorded."}</p>}
            </section>

            <section className="in-panel">
              <header className="in-watch__head"><ShieldCheck size={15} /><h3>{es ? "Comandos de hardening (PowerShell como administrador)" : "Hardening commands"}</h3></header>
              <div className="as-cmds">
                {LSA_CMDS.map(c => (
                  <div key={c.t} className="as-cmd">
                    <span>{c.t}</span>
                    <pre className="in-pre">{c.c}</pre>
                    <button type="button" className="wk-iconbtn" onClick={() => copy(c.c)} title={es ? "Copiar" : "Copy"} aria-label={es ? "Copiar" : "Copy"}><Copy size={14} /></button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {sel && createPortal(<>
        <div className="wk-drawer-backdrop" onClick={() => setSel(null)} aria-hidden="true" />
        <aside className="wk-drawer" role="dialog" aria-modal="true" aria-label={sel.name}>
          <div className="wk-drawer__head">
            <i className={`as-dot${sel.status === "active" ? " is-on" : ""}`} />
            <span className="wk-drawer__id">{sel.name} · ID {sel.id}</span>
            <button className="vx-iconbtn" style={{ marginLeft: "auto" }} onClick={() => setSel(null)} aria-label={es ? "Cerrar" : "Close"}><X size={16} /></button>
          </div>
          <div className="wk-drawer__scroll">
            <section className="wk-section">
              <div className="wk-section__head"><ServerCog size={14} />{es ? "Inventario" : "Inventory"}{inv?.scan_time && <span className="wk-sec-tools in-muted">{ago(inv.scan_time)}</span>}</div>
              <div className="wk-section__body">
                {!inv ? <p className="in-muted">{es ? "Consultando…" : "Loading…"}</p> : !inv.os?.name ? (
                  <p className="in-muted">{es ? "Este equipo no envía inventario (syscollector)." : "No inventory."}</p>
                ) : (
                  <div className="wk-facts">
                    <div><div className="wk-fact__k">{es ? "Sistema" : "OS"}</div><div className="wk-fact__v">{inv.os.name} {inv.os.version}</div></div>
                    <div><div className="wk-fact__k">Kernel</div><div className="wk-fact__v">{inv.kernel || "—"} {inv.architecture}</div></div>
                    <div><div className="wk-fact__k"><Cpu size={10} /> CPU</div><div className="wk-fact__v" title={inv.hardware.cpu?.name}>{inv.hardware.cpu?.cores} {es ? "núcleos" : "cores"} · {inv.hardware.cpu?.name}</div></div>
                    <div><div className="wk-fact__k"><MemoryStick size={10} /> RAM</div><div className="wk-fact__v">{inv.hardware.ram?.total ? `${(inv.hardware.ram.total / 1048576).toFixed(1)} GB · ${inv.hardware.ram.usage}% ${es ? "en uso" : "used"}` : "—"}</div></div>
                    <div><div className="wk-fact__k"><Package size={10} /> {es ? "Paquetes" : "Packages"}</div><div className="wk-fact__v">{inv.counts.packages}</div></div>
                    <div><div className="wk-fact__k">{es ? "Procesos" : "Processes"}</div><div className="wk-fact__v">{inv.counts.processes}</div></div>
                  </div>
                )}
              </div>
            </section>
            <section className="wk-section">
              <div className="wk-section__head"><Network size={14} />{es ? "Puertos a la escucha" : "Listening ports"}<span className="wk-sec-tools in-muted">{inv?.ports.length ?? ""}</span></div>
              <div className="wk-section__body">
                {inv?.ports.length ? <ul className="in-engines">{inv.ports.map((p, i) => <li key={i}><b>{p.protocol.toUpperCase()} {p.port}</b><span className="in-muted">{p.ip}{p.process?.trim() ? ` · ${p.process}` : ""}</span></li>)}</ul>
                  : <p className="in-muted">{es ? "Sin puertos a la escucha registrados." : "No listening ports."}</p>}
              </div>
            </section>
            <section className="wk-section">
              <div className="wk-section__head"><Bug size={14} />{es ? "Vulnerabilidades" : "Vulnerabilities"}<span className="wk-sec-tools in-muted">{vulns?.length ?? ""}</span></div>
              <div className="wk-section__body">
                {vulns && vulns.length > 0 && (
                  <div className="wk-chipset" style={{ padding: "0 0 8px" }}>
                    {["all", ...SEV].map(s => <button key={s} type="button" aria-pressed={vfilter === s} onClick={() => setVfilter(s)}>{s === "all" ? (es ? "Todas" : "All") : SEV_ES[s]} <small>{s === "all" ? vulns.length : vulns.filter(v => v.severity === s).length}</small></button>)}
                  </div>
                )}
                {!vulns ? <p className="in-muted">{es ? "Consultando…" : "Loading…"}</p> : !vulns.length ? (
                  <p className="in-muted">{es ? "Sin vulnerabilidades registradas (o el primer análisis de Wazuh aún no ha terminado)." : "No vulnerabilities recorded yet."}</p>
                ) : (
                  <ul className="in-engines as-vlist">
                    {shownVulns.slice(0, 100).map(v => (
                      <li key={v.cve + v.package}>
                        <span className="in-prod"><b>{v.cve}</b><small>{v.package} {v.version}</small></span>
                        <span className={`in-cvss ex-tone-${SEV_TONE[v.severity] ?? "warn"}`}>{v.score ?? "—"}<small>{SEV_ES[v.severity] ?? v.severity}</small></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </aside>
      </>, document.body)}
    </div>
  );
}
