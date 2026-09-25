import { useState, useEffect } from "react";
import logger from "../lib/logger";
import {
  getSocMetrics, SocMetrics, getNavigatorLayer,
  listHuntQueries, runHuntQuery,
} from "../lib/api";

const CARD: React.CSSProperties = {
  background: "var(--bg-panel)", border: "1px solid var(--line)",
  borderRadius: "8px", padding: "15px",
};

function Kpi({ label, value, suffix, danger }: { label: string; value: React.ReactNode; suffix?: string; danger?: boolean }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: danger ? "var(--danger)" : "var(--signal)", fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" }}>
        {value}<span style={{ fontSize: "12px", color: "var(--text-dim)", marginLeft: "4px" }}>{suffix}</span>
      </div>
    </div>
  );
}

export default function SocMaturityView({ lang = "es" }: { lang?: string }) {
  const [metrics, setMetrics] = useState<SocMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [hunts, setHunts] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [activeHunt, setActiveHunt] = useState<string>("");
  const [huntResult, setHuntResult] = useState<any>(null);
  const [huntLoading, setHuntLoading] = useState(false);

  const t = (es: string, en: string) => (lang === "es" ? es : en);

  const load = async () => {
    setLoading(true);
    try {
      const [m, q] = await Promise.all([
        getSocMetrics().catch(() => null),
        listHuntQueries().catch(() => []),
      ]);
      setMetrics(m);
      setHunts(q);
      if (q.length && !activeHunt) setActiveHunt(q[0].id);
    } catch (e) {
      logger.error("SOC maturity load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runHunt = async () => {
    if (!activeHunt) return;
    setHuntLoading(true);
    setHuntResult(null);
    try {
      setHuntResult(await runHuntQuery(activeHunt, 720));
    } catch (e) {
      logger.error("hunt error:", e);
    } finally {
      setHuntLoading(false);
    }
  };

  const downloadNavigator = async () => {
    try {
      const layer = await getNavigatorLayer(720);
      const blob = new Blob([JSON.stringify(layer, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "valhalla-attack-navigator-layer.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error("navigator export error:", e);
      alert(t("No se pudo generar la capa Navigator.", "Could not generate Navigator layer."));
    }
  };

  if (loading) {
    return <div style={{ padding: "20px", color: "var(--signal)", fontFamily: "var(--mono)" }}>{t("CARGANDO MÉTRICAS...", "LOADING METRICS...")}</div>;
  }

  const fmtMin = (m: number) => (m >= 1440 ? `${(m / 1440).toFixed(1)}d` : m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);

  return (
    <div style={{ flex: 1, padding: "15px", display: "flex", flexDirection: "column", gap: "15px", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", color: "var(--signal)", fontFamily: "var(--mono)", letterSpacing: "2px" }}>
             BIFRÖST
          </h2>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            {t("Observabilidad SOC · KPIs · MITRE Navigator · Threat Hunting", "SOC observability · KPIs · MITRE Navigator · Threat Hunting")}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={downloadNavigator} style={{ padding: "8px 14px", background: "rgba(60,255,158,0.1)", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 600, fontFamily: "var(--mono)" }}>
             {t("CAPA MITRE NAVIGATOR", "MITRE NAVIGATOR LAYER")}
          </button>
          <button onClick={load} style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}> SYNC</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
        <Kpi label="MTTR" value={metrics ? fmtMin(metrics.mttr_minutes) : "—"} />
        <Kpi label={t("Dwell (abiertos)", "Dwell (open)")} value={metrics ? fmtMin(metrics.dwell_open_avg_minutes) : "—"} danger={!!metrics && metrics.dwell_open_avg_minutes > 1440} />
        <Kpi label={t("Tasa resolución", "Resolution rate")} value={metrics?.tickets.resolution_rate_pct ?? 0} suffix="%" />
        <Kpi label={t("Cobertura ATT&CK", "ATT&CK coverage")} value={metrics?.attack_coverage_pct ?? 0} suffix="%" />
        <Kpi label={t("Incidentes abiertos", "Open incidents")} value={metrics?.tickets.open ?? 0} danger={!!metrics && metrics.tickets.open > 0} />
        <Kpi label={t("Alertas 24h", "Alerts 24h")} value={metrics?.alerts_24h ?? 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
        {/* Por severidad + analista */}
        <div style={CARD}>
          <h3 style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>{t("DISTRIBUCIÓN", "DISTRIBUTION")}</h3>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px" }}>{t("Por severidad", "By severity")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
            {metrics && Object.entries(metrics.by_severity).map(([sev, n]) => (
              <span key={sev} style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "10px", fontFamily: "var(--mono)",
                background: sev === "critical" ? "rgba(255,58,58,0.15)" : sev === "high" ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${sev === "critical" ? "var(--danger)" : sev === "high" ? "var(--amber)" : "var(--line)"}` }}>
                {sev.toUpperCase()}: {n}
              </span>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px" }}>{t("Cerrados por analista", "Closed by analyst")}</div>
          {metrics && metrics.tickets_by_analyst.length ? metrics.tickets_by_analyst.map((a) => (
            <div key={a.analyst} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0", borderBottom: "1px solid var(--line-faint)" }}>
              <span>{a.analyst}</span><span style={{ color: "var(--signal)", fontWeight: 600 }}>{a.closed}</span>
            </div>
          )) : <div style={{ fontSize: "10px", color: "var(--text-faint)" }}>{t("Sin tickets cerrados aún", "No closed tickets yet")}</div>}
        </div>

        {/* ATT&CK técnicas vistas */}
        <div style={CARD}>
          <h3 style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>{t("TÉCNICAS MITRE OBSERVADAS", "OBSERVED MITRE TECHNIQUES")}</h3>
          {metrics && metrics.techniques_seen.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {metrics.techniques_seen.map((tt) => (
                <span key={tt} style={{ padding: "4px 8px", background: "rgba(74,227,255,0.1)", border: "1px solid var(--cyan, #4ae3ff)", borderRadius: "4px", fontSize: "10px", fontFamily: "var(--mono)", color: "var(--cyan, #4ae3ff)" }}>{tt}</span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "10px", color: "var(--text-dim)", opacity: 0.6 }}>
              {t("Sin técnicas con tag MITRE en la ventana. Genera tráfico de ataque para poblar la cobertura.", "No MITRE-tagged techniques in window. Generate attack traffic to populate coverage.")}
            </div>
          )}
        </div>
      </div>

      {/* Threat Hunting */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ margin: 0, fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}> THREAT HUNTING</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <select value={activeHunt} onChange={(e) => setActiveHunt(e.target.value)}
              style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "4px", padding: "6px 10px", fontSize: "11px", fontFamily: "var(--mono)" }}>
              {hunts.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
            <button onClick={runHunt} disabled={huntLoading} style={{ padding: "6px 14px", background: "rgba(60,255,158,0.1)", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}>
              {huntLoading ? "..." : t("EJECUTAR", "RUN")}
            </button>
          </div>
        </div>
        {hunts.find((q) => q.id === activeHunt) && (
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "10px" }}>{hunts.find((q) => q.id === activeHunt)!.description}</div>
        )}
        {huntResult && (
          <div style={{ maxHeight: "300px", overflow: "auto" }}>
            <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "8px" }}>{huntResult.count} {t("resultados", "results")}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--mono)" }}>
              <tbody>
                {(huntResult.results || []).map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line-faint)" }}>
                    {huntResult.type === "aggregation" ? (
                      <>
                        <td style={{ padding: "5px 8px" }}>{r.value}</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--signal)" }}>{r.count}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: "5px 8px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{r.src_ip}</td>
                        <td style={{ padding: "5px 8px", color: "var(--amber)" }}>{r.command}</td>
                      </>
                    )}
                  </tr>
                ))}
                {(!huntResult.results || huntResult.results.length === 0) && (
                  <tr><td style={{ padding: "12px", color: "var(--text-dim)", opacity: 0.6 }}>{t("Sin resultados en la ventana.", "No results in window.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
