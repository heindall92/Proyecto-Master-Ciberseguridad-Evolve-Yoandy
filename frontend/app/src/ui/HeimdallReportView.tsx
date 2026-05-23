import { useState, useEffect } from "react";
import logger from "../lib/logger";
import { getHeimdallReport, downloadHeimdallPdf } from "../lib/api";

const CARD: React.CSSProperties = {
  background: "var(--bg-panel)", border: "1px solid var(--line)",
  borderRadius: "8px", padding: "16px",
};

function fmtMin(m: number) {
  return m >= 1440 ? `${(m / 1440).toFixed(1)}d` : m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`;
}

function Kpi({ label, value, suffix }: { label: string; value: React.ReactNode; suffix?: string }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--cyan, #4ae3ff)", fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" }}>
        {value}<span style={{ fontSize: "13px", color: "var(--text-dim)", marginLeft: "4px" }}>{suffix}</span>
      </div>
    </div>
  );
}

export default function HeimdallReportView({ lang = "es" }: { lang?: string }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const t = (es: string, en: string) => (lang === "es" ? es : en);

  const load = async () => {
    setLoading(true);
    try {
      setReport(await getHeimdallReport());
    } catch (e) {
      logger.error("heimdall load error:", e);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const [pdfLoading, setPdfLoading] = useState(false);

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    if (!report) return;
    saveBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "heimdall-intel-report.json");
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      saveBlob(await downloadHeimdallPdf(), "heimdall-intel-report.pdf");
    } catch (e) {
      logger.error("heimdall pdf error:", e);
      alert(t("No se pudo generar el PDF.", "Could not generate PDF."));
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "20px", color: "var(--cyan, #4ae3ff)", fontFamily: "var(--mono)" }}>{t("INVOCANDO A HEIMDALL...", "SUMMONING HEIMDALL...")}</div>;
  }
  if (!report) {
    return <div style={{ padding: "20px", color: "var(--danger)", fontFamily: "var(--mono)" }}>{t("No se pudo cargar el informe.", "Could not load report.")}</div>;
  }

  const im = report.incident_management || {};
  const iso = report.iso27001 || {};

  return (
    <div style={{ flex: 1, padding: "15px", display: "flex", flexDirection: "column", gap: "15px", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px",
        borderBottom: "1px solid var(--cyan, #4ae3ff)", paddingBottom: "12px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "24px", color: "var(--cyan, #4ae3ff)", fontFamily: "var(--mono)", letterSpacing: "3px", textShadow: "0 0 12px rgba(74,227,255,0.4)" }}>
            🛡️ HEIMDALL
          </h2>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            {report.subtitle} · {t("Analista", "Analyst")}: {report.analyst} · {new Date(report.generated_at).toLocaleString()}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={downloadPdf} disabled={pdfLoading} style={{ padding: "8px 16px", background: "linear-gradient(135deg, rgba(74,227,255,0.2), rgba(60,255,158,0.12))", border: "1px solid var(--cyan, #4ae3ff)", color: "var(--cyan, #4ae3ff)", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: "1px", boxShadow: "0 0 12px rgba(74,227,255,0.25)" }}>
            {pdfLoading ? "..." : "📄 PDF"}
          </button>
          <button onClick={downloadJson} style={{ padding: "8px 14px", background: "rgba(74,227,255,0.1)", border: "1px solid var(--cyan, #4ae3ff)", color: "var(--cyan, #4ae3ff)", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 600, fontFamily: "var(--mono)" }}>⬇ JSON</button>
          <button onClick={load} style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--cyan, #4ae3ff)", color: "var(--cyan, #4ae3ff)", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}>🔄 SYNC</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: "12px" }}>
        <Kpi label={t("Cumplimiento ISO 27001", "ISO 27001 compliance")} value={iso.overall ?? 0} suffix="%" />
        <Kpi label={t("Resolución media", "Avg resolution")} value={fmtMin(im.avg_resolution_time_min ?? 0)} />
        <Kpi label={t("Cobertura ATT&CK", "ATT&CK coverage")} value={report.attack_coverage_pct ?? 0} suffix="%" />
        <Kpi label={t("Incidentes totales", "Total incidents")} value={im.total_tickets ?? 0} />
        <Kpi label={t("Alertas 24h", "Alerts 24h")} value={report.wazuh_metrics?.total_alerts_24h ?? 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
        <div style={CARD}>
          <h3 style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--cyan, #4ae3ff)", fontFamily: "var(--mono)" }}>ISO 27001 — {t("CONTROLES", "CONTROLS")}</h3>
          {(iso.controls || []).map((c: any) => (
            <div key={c.control} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "11px", padding: "6px 0", borderBottom: "1px solid var(--line-faint)" }}>
              <span>{c.control}</span>
              <span style={{ color: c.status === "covered" ? "var(--signal)" : "var(--amber)", whiteSpace: "nowrap" }}>{c.status} · {c.note}</span>
            </div>
          ))}
        </div>

        <div style={CARD}>
          <h3 style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--cyan, #4ae3ff)", fontFamily: "var(--mono)" }}>{t("ATACANTES / ACTIVOS (REAL)", "ATTACKERS / ASSETS (REAL)")}</h3>
          {(report.top_affected_assets || []).length ? (report.top_affected_assets).map((a: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "11px", padding: "6px 0", borderBottom: "1px solid var(--line-faint)" }}>
              <span style={{ color: "var(--text-dim)", fontFamily: "var(--mono)" }}>{a.ip}</span>
              <span style={{ flex: 1, textAlign: "center" }}>{a.name}</span>
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>{a.alerts}</span>
            </div>
          )) : <div style={{ fontSize: "10px", color: "var(--text-dim)", opacity: 0.6 }}>{t("Sin actividad de ataque en la ventana.", "No attack activity in window.")}</div>}
          <h4 style={{ margin: "14px 0 6px", fontSize: "11px", color: "var(--cyan, #4ae3ff)", fontFamily: "var(--mono)" }}>{t("Técnicas MITRE observadas", "Observed MITRE techniques")}</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(report.techniques_seen || []).length ? (report.techniques_seen).map((tt: string) => (
              <span key={tt} style={{ padding: "3px 7px", background: "rgba(74,227,255,0.1)", border: "1px solid var(--cyan, #4ae3ff)", borderRadius: "4px", fontSize: "10px", fontFamily: "var(--mono)", color: "var(--cyan, #4ae3ff)" }}>{tt}</span>
            )) : <span style={{ fontSize: "10px", color: "var(--text-dim)", opacity: 0.6 }}>—</span>}
          </div>
        </div>
      </div>

      <div style={{ fontSize: "9px", color: "var(--text-faint)", textAlign: "center", letterSpacing: "1px", marginTop: "auto", paddingTop: "10px" }}>
        {t("HEIMDALL — informe de inteligencia con datos en tiempo real · independiente del informe ejecutivo",
           "HEIMDALL — real-time intelligence report · independent from the executive report")}
      </div>
    </div>
  );
}
