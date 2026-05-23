import { useState, useEffect } from "react";
import logger from "../lib/logger";
import { getLatestCves, generateCveSocialPost, getCveExploits, CveItem, ExploitResult } from "../lib/api";

const CARD: React.CSSProperties = {
  background: "var(--bg-panel)", border: "1px solid var(--line)",
  borderRadius: "8px", padding: "15px",
};

export default function CveIntelView({ lang = "es" }: { lang?: string }) {
  const [cves, setCves] = useState<CveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<string>("");
  const [postLoading, setPostLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const t = (es: string, en: string) => (lang === "es" ? es : en);

  const [exploits, setExploits] = useState<Record<string, ExploitResult | "loading">>({});

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const fetchExploits = async (id: string) => {
    setExploits((p) => ({ ...p, [id]: "loading" }));
    try {
      const res = await getCveExploits(id);
      setExploits((p) => ({ ...p, [id]: res }));
    } catch (e) {
      logger.error("exploits error:", e);
      setExploits((p) => ({ ...p, [id]: { cve: id, count: 0, exploits: [], error: "error" } }));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setCves(await getLatestCves(20));
    } catch (e) {
      logger.error("CVE load error:", e);
      setCves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const genPost = async () => {
    setPostLoading(true);
    setCopied(false);
    try {
      const r = await generateCveSocialPost(Array.from(selected));
      setPost(r.post);
    } catch (e) {
      logger.error("post error:", e);
      alert(t("No se pudo generar el post.", "Could not generate post."));
    } finally {
      setPostLoading(false);
    }
  };

  const copyPost = () => {
    navigator.clipboard.writeText(post).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sevColor = (s: string) => (s === "critical" ? "var(--danger)" : s === "high" ? "var(--amber)" : "var(--signal)");

  return (
    <div style={{ flex: 1, padding: "15px", display: "flex", flexDirection: "column", gap: "15px", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", color: "var(--signal)", fontFamily: "var(--mono)", letterSpacing: "2px" }}>
            CVE INTEL
          </h2>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
            {t("Vulnerabilidades explotadas activamente (CISA KEV) + difusión IA", "Actively exploited vulnerabilities (CISA KEV) + AI outreach")}
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={genPost} disabled={postLoading} title={selected.size ? t("Post sobre las CVE seleccionadas", "Post about selected CVEs") : t("Sin selección: usa las más recientes", "No selection: uses most recent")} style={{ padding: "8px 16px", background: "rgba(60,255,158,0.12)", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: "1px" }}>
            {postLoading ? "..." : selected.size ? t(`GENERAR POST IA (${selected.size})`, `GENERATE AI POST (${selected.size})`) : t("GENERAR POST IA", "GENERATE AI POST")}
          </button>
          <button onClick={load} style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}>SYNC</button>
        </div>
      </div>

      {/* Borrador del post IA */}
      {post && (
        <div style={{ ...CARD, border: "1px solid var(--signal)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>{t("BORRADOR DE POST (LinkedIn) — revísalo antes de publicar", "DRAFT POST (LinkedIn) — review before publishing")}</h3>
            <button onClick={copyPost} style={{ padding: "4px 12px", background: "transparent", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "10px" }}>
              {copied ? t("COPIADO", "COPIED") : t("COPIAR", "COPY")}
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px", color: "var(--text)", margin: 0, lineHeight: 1.5 }}>{post}</pre>
        </div>
      )}

      {/* Feed de CVEs */}
      <div style={CARD}>
        <h3 style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>
          {t("CVEs EXPLOTADAS ACTIVAMENTE", "ACTIVELY EXPLOITED CVEs")} {loading ? "..." : `(${cves.length})`}
        </h3>
        {loading ? (
          <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>{t("Cargando...", "Loading...")}</div>
        ) : cves.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: "11px", opacity: 0.6 }}>{t("Sin datos del feed CISA KEV.", "No data from CISA KEV feed.")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {cves.map((c) => (
              <div key={c.id} style={{ padding: "10px", background: selected.has(c.id) ? "rgba(60,255,158,0.08)" : "rgba(0,0,0,0.25)", borderRadius: "6px", borderLeft: `3px solid ${sevColor(c.severity)}`, border: selected.has(c.id) ? "1px solid var(--signal)" : "1px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} title={t("Seleccionar para el post", "Select for post")} style={{ cursor: "pointer", accentColor: "var(--signal)" }} />
                    <a href={`https://nvd.nist.gov/vuln/detail/${c.id}`} target="_blank" rel="noopener noreferrer" style={{ color: sevColor(c.severity), fontWeight: 700, fontFamily: "var(--mono)", fontSize: "12px", textDecoration: "none" }}>{c.id}</a>
                    <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{c.product}</span>
                    {c.ransomware && <span style={{ fontSize: "9px", padding: "2px 6px", background: "rgba(255,58,58,0.15)", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: "3px", fontWeight: 700 }}>RANSOMWARE</span>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {exploits[c.id] && exploits[c.id] !== "loading" && (exploits[c.id] as ExploitResult).count > 0 && (
                      <span style={{ fontSize: "9px", padding: "2px 6px", background: "rgba(255,58,58,0.18)", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: "3px", fontWeight: 700 }}>
                        {(exploits[c.id] as ExploitResult).count} EXPLOIT{(exploits[c.id] as ExploitResult).count > 1 ? "S" : ""}
                      </span>
                    )}
                    <button onClick={() => fetchExploits(c.id)} disabled={exploits[c.id] === "loading"} style={{ fontSize: "9px", padding: "3px 8px", background: "transparent", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "3px", cursor: "pointer", fontFamily: "var(--mono)" }}>
                      {exploits[c.id] === "loading" ? "..." : t("EXPLOITS", "EXPLOITS")}
                    </button>
                    <span style={{ fontSize: "9px", color: "var(--text-faint)" }}>{c.published}</span>
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text)", marginTop: "6px", lineHeight: 1.4 }}>{c.summary}</div>
                {exploits[c.id] && exploits[c.id] !== "loading" && (
                  <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--line-faint)" }}>
                    {(exploits[c.id] as ExploitResult).count === 0 ? (
                      <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{(exploits[c.id] as ExploitResult).error ? t("Servicio de exploits no disponible", "Exploit service unavailable") : t("Sin exploits públicos en Exploit-DB", "No public exploits in Exploit-DB")}</span>
                    ) : (
                      (exploits[c.id] as ExploitResult).exploits.map((e) => (
                        <div key={e.edb_id} style={{ fontSize: "10px", marginBottom: "3px" }}>
                          <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--danger)", textDecoration: "none" }}>EDB-{e.edb_id}</a>
                          <span style={{ color: "var(--text)", marginLeft: "6px" }}>{e.title}</span>
                          <span style={{ color: "var(--text-faint)", marginLeft: "6px" }}>[{e.platform}/{e.type}]</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
