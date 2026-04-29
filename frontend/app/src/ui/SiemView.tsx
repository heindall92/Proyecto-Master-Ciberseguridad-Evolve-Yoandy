import { useState, useEffect, useRef } from "react";
import { getRecentAlerts, getMitreCoverage, getTopAttackers, createTicket } from "../lib/api";

// ── Severity helpers ──────────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  critical: "#ff3b3b",
  high:     "#ff8c00",
  medium:   "#f5c518",
  low:      "#3cf",
};
const SEV_BG: Record<string, string> = {
  critical: "rgba(255,59,59,0.12)",
  high:     "rgba(255,140,0,0.10)",
  medium:   "rgba(245,197,24,0.08)",
  low:      "rgba(51,204,255,0.08)",
};

const SYSTEM_PATTERNS = ["ollama ai insight", "error consultando ollama"];
const isSystem = (d: string) => SYSTEM_PATTERNS.some(p => d?.toLowerCase().includes(p));

const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString("es", { hour12: false });

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, ok, onDone }: { msg: string; ok: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 9999,
      background: ok ? "#0d2b1a" : "#2b0d0d",
      border: `1px solid ${ok ? "#3cf" : "#ff3b3b"}`,
      color: ok ? "#3cf" : "#ff3b3b",
      padding: "10px 18px", borderRadius: 6,
      fontSize: 12, fontWeight: 600, letterSpacing: "0.5px",
      boxShadow: `0 4px 24px ${ok ? "rgba(51,204,255,0.2)" : "rgba(255,59,59,0.2)"}`,
    }}>
      {ok ? "✓" : "✕"} {msg}
    </div>
  );
}

// ── Severity chip filter ──────────────────────────────────────────────────────
const CHIPS = [
  { id: "all",      label: "ALL" },
  { id: "critical", label: "CRIT" },
  { id: "high",     label: "HIGH" },
  { id: "medium",   label: "MED"  },
  { id: "low",      label: "LOW"  },
];

export default function SiemView() {
  const [alerts, setAlerts]           = useState<any[]>([]);
  const [mitre, setMitre]             = useState<any[]>([]);
  const [topAttackers, setTopAttackers] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<any>(null);
  const [filter, setFilter]           = useState("all");
  const [search, setSearch]           = useState("");
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [escalating, setEscalating]   = useState<string | null>(null);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [liveCount, setLiveCount]     = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [a, m, t] = await Promise.all([
        getRecentAlerts(200),
        getMitreCoverage(),
        getTopAttackers(10),
      ]);
      setAlerts(a || []);
      setMitre(m || []);
      setTopAttackers(t || []);
      setLiveCount((a || []).filter((x: any) => !isSystem(x.description)).length);
    } catch (err) {
      console.error("SIEM fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15_000);
    return () => clearInterval(iv);
  }, []);

  const handleEscalate = async (e: React.MouseEvent, wazuhAlert: any) => {
    e.stopPropagation();
    const key = wazuhAlert.rule_id + wazuhAlert.timestamp;
    setEscalating(key);
    try {
      await createTicket({
        title: `[SIEM] ${wazuhAlert.description}`,
        description: `Alerta escalada desde SIEM.\nRegla: ${wazuhAlert.rule_id} · Nivel: ${wazuhAlert.rule_level}\nAgente: ${wazuhAlert.agent_name}`,
        severity: wazuhAlert.severity === "critical" ? "critical" : wazuhAlert.severity === "high" ? "high" : "medium",
        category: "Intrusión",
        wazuh_alert_id: String(wazuhAlert.rule_id),
        affected_asset: wazuhAlert.agent_name,
        source_ip: wazuhAlert.source_ip || null,
      });
      setToast({ msg: "Incidente creado en Workspace", ok: true });
    } catch {
      setToast({ msg: "Error al crear incidente", ok: false });
    } finally {
      setEscalating(null);
    }
  };

  const systemCount = alerts.filter(a => isSystem(a.description)).length;

  const visible = alerts.filter(a => {
    if (isSystem(a.description)) return false;
    if (filter !== "all" && a.severity !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.description?.toLowerCase().includes(q) ||
        a.agent_name?.toLowerCase().includes(q) ||
        a.source_ip?.includes(q) ||
        a.rule_id?.includes(q)
      );
    }
    return true;
  });

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3cf", animation: "blink 1s infinite" }} />
      <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "2px" }}>CONECTANDO CON WAZUH INDEXER</span>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>
      {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, padding: "10px 20px",
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--line-faint)", flexShrink: 0,
      }}>
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3cf", display: "block", animation: "blink 2s infinite" }} />
          <span style={{ fontSize: 10, color: "#3cf", letterSpacing: "1.5px", fontWeight: 700 }}>LIVE</span>
        </div>

        {/* Severity filter chips */}
        <div style={{ display: "flex", gap: 4 }}>
          {CHIPS.map(c => {
            const active = filter === c.id;
            const col = c.id === "all" ? "#3cf" : SEV_COLOR[c.id];
            return (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                style={{
                  padding: "3px 10px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.5px", cursor: "pointer", transition: "all 0.15s",
                  border: `1px solid ${active ? col : "var(--line)"}`,
                  background: active ? `${col}18` : "transparent",
                  color: active ? col : "var(--text-dim)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 280, position: "relative" }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por IP, agente, regla..."
            style={{
              width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid var(--line)",
              color: "#fff", padding: "5px 8px 5px 28px", borderRadius: 4, fontSize: 11,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Stats */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 20, alignItems: "center" }}>
          {systemCount > 0 && (
            <span style={{ fontSize: 10, color: "var(--amber)", opacity: 0.7 }}>
              {systemCount} errores de sistema ocultos
            </span>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: visible.length > 0 ? "#ff3b3b" : "#3cf", lineHeight: 1, fontFamily: "var(--mono)" }}>
              {visible.length}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "1px" }}>EVENTOS</span>
          </div>
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr 320px", gap: 1, overflow: "hidden" }}>

        {/* Events table */}
        <div ref={tableRef} style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "56px 72px 130px 1fr 80px",
            padding: "6px 16px", gap: 8,
            borderBottom: "1px solid var(--line-faint)",
            background: "rgba(0,0,0,0.2)",
          }}>
            {["SEV", "HORA", "AGENTE", "DESCRIPCIÓN", ""].map(h => (
              <span key={h} style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: "1px", fontWeight: 700 }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, opacity: 0.4 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2 L3 7 L12 12 L21 7 Z"/><path d="M3 12 L12 17 L21 12"/><path d="M3 17 L12 22 L21 17"/>
                </svg>
                <span style={{ fontSize: 11, letterSpacing: "2px" }}>SIN EVENTOS</span>
              </div>
            ) : (
              visible.map((al, i) => {
                const key = al.rule_id + al.timestamp;
                const isHovered = hoveredId === key;
                const isSelected = selected === al;
                const sev = al.severity as string;
                const col = SEV_COLOR[sev] ?? "#888";
                return (
                  <div
                    key={`${key}-${i}`}
                    onClick={() => setSelected(isSelected ? null : al)}
                    onMouseEnter={() => setHoveredId(key)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "56px 72px 130px 1fr 80px",
                      padding: "8px 16px", gap: 8,
                      alignItems: "center",
                      borderBottom: "1px solid var(--line-faint)",
                      background: isSelected
                        ? SEV_BG[sev]
                        : isHovered
                        ? "rgba(255,255,255,0.03)"
                        : "transparent",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    {/* Severity badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
                      color: col, background: `${col}18`,
                      padding: "2px 6px", borderRadius: 2,
                      border: `1px solid ${col}40`,
                    }}>
                      {sev === "critical" ? "CRIT" : sev === "medium" ? "MED" : sev.toUpperCase()}
                    </span>

                    {/* Time */}
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                      {fmtTime(al.timestamp)}
                    </span>

                    {/* Agent */}
                    <span style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {al.agent_name}
                    </span>

                    {/* Description */}
                    <span style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {al.description}
                    </span>

                    {/* Escalate */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {(isHovered || isSelected) && (
                        <button
                          onClick={e => handleEscalate(e, al)}
                          disabled={escalating === key}
                          style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: "0.5px",
                            padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                            border: `1px solid ${col}60`,
                            background: `${col}15`, color: col,
                            opacity: escalating === key ? 0.5 : 1,
                            transition: "all 0.15s",
                          }}
                        >
                          {escalating === key ? "..." : "ESCALAR"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <div style={{ borderLeft: "1px solid var(--line-faint)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {selected ? (
            /* Detail panel */
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-faint)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: SEV_COLOR[selected.severity] }}>
                  DETALLE · {selected.severity?.toUpperCase()}
                </span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: "1px", marginBottom: 4 }}>DESCRIPCIÓN</div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{selected.description}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    ["REGLA", selected.rule_id],
                    ["NIVEL", selected.rule_level],
                    ["AGENTE", selected.agent_name],
                    ["IP ORIGEN", selected.source_ip || "—"],
                    ["HORA", fmtTime(selected.timestamp)],
                    ["SEVERIDAD", selected.severity?.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 4, padding: "8px 10px" }}>
                      <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: "1px", marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)", color: "var(--text-bright)" }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selected.mitre_technique?.length > 0 && (
                  <div style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.2)", borderRadius: 4, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#f5c518", letterSpacing: "1px", marginBottom: 6 }}>MITRE ATT&CK</div>
                    <div style={{ fontSize: 11, color: "var(--amber)" }}>{selected.mitre_tactic?.join(" · ")}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{selected.mitre_technique?.join(", ")}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: "1px", marginBottom: 6 }}>RAW LOG</div>
                  <pre style={{
                    fontSize: 10, color: "#3cf",
                    background: "rgba(0,0,0,0.4)", borderRadius: 4, padding: 10,
                    overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    maxHeight: 200, overflowY: "auto",
                  }}>
                    {JSON.stringify(selected.raw_alert ?? {}, null, 2)}
                  </pre>
                </div>
                <button
                  onClick={e => handleEscalate(e, selected)}
                  disabled={escalating !== null}
                  style={{
                    padding: "10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                    letterSpacing: "1px", cursor: "pointer",
                    background: `${SEV_COLOR[selected.severity]}20`,
                    border: `1px solid ${SEV_COLOR[selected.severity]}60`,
                    color: SEV_COLOR[selected.severity],
                    transition: "all 0.15s",
                  }}
                >
                  {escalating ? "CREANDO INCIDENTE..." : "ESCALAR → WORKSPACE"}
                </button>
              </div>
            </div>
          ) : (
            /* MITRE + Top Attackers */
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* MITRE */}
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", borderBottom: "1px solid var(--line-faint)" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-faint)", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, letterSpacing: "1.5px", color: "var(--text-dim)", fontWeight: 700 }}>COBERTURA MITRE ATT&CK</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                  {mitre.slice(0, 10).map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4, marginBottom: 2 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.technique}</div>
                        <div style={{ fontSize: 9, color: "var(--text-faint)", textTransform: "uppercase" }}>{m.tactic}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#f5c518", fontFamily: "var(--mono)", flexShrink: 0 }}>{m.count}</span>
                    </div>
                  ))}
                  {mitre.length === 0 && <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-faint)", fontSize: 11 }}>Sin datos MITRE</div>}
                </div>
              </div>

              {/* Top Attackers */}
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-faint)", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, letterSpacing: "1.5px", color: "var(--text-dim)", fontWeight: 700 }}>TOP ATACANTES</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {topAttackers.slice(0, 10).map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderBottom: "1px solid var(--line-faint)" }}>
                      <span style={{ fontSize: 10, color: i < 3 ? "#ff3b3b" : "var(--text-faint)", fontWeight: 700, width: 16, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{a.ip}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--signal)", fontFamily: "var(--mono)" }}>{a.count}</span>
                    </div>
                  ))}
                  {topAttackers.length === 0 && <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-faint)", fontSize: 11 }}>Sin atacantes detectados</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
