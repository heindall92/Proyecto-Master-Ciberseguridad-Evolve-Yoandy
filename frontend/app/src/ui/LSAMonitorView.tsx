import { useState, useEffect } from "react";
import { getDashboardSummary } from "../lib/api";

interface EndpointStatus {
  hostname: string;
  runasppl_enabled: boolean;
  lsa_protected: boolean;
  suspicious_processes: string[];
  admin_sessions: number;
  risk_score: number;
  sysmon_logged: number;
  last_check?: string;
}

interface LSAAlert {
  id: number;
  timestamp: string;
  type: string;
  source_ip: string;
  hostname: string;
  severity: string;
  blocked: boolean;
  target_process: string;
  source_process: string;
}

const SYSMON_ID10_QUERY = "Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=10} -MaxEvents 1000 | Where-Object {$_.Properties[3].Value -match 'lsass'}";

const LSA_HARDENING_CMD = "New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'RunAsPPL' -Value 2 -PropertyType DWord; New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LSASS' -Name 'RequireStart' -Value 4";

const CHECK_LSA_STATUS = "$runasppl = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'RunAsPPL').RunAsPPL; if($runasppl -eq 2){'OK'}else{'ALERT'}";

export default function LSAMonitorView() {
  const [endpoints, setEndpoints] = useState<EndpointStatus[]>([]);
  const [alerts, setAlerts] = useState<LSAAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [hardeningMode, setHardeningMode] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch real data from API
      const [endpointsRes, alertsRes] = await Promise.all([
        fetch('/api/lsa/endpoints').then(r => r.json()).catch(() => []),
        fetch('/api/lsa/alerts?hours=24').then(r => r.json()).catch(() => [])
      ]);
      setEndpoints(endpointsRes);
      setAlerts(alertsRes);
    } catch (e) {
      console.error("LSA fetch error:", e);
      setEndpoints(generateMockData());
      setAlerts(generateMockAlerts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, []);

  const handleHardening = async () => {
    setHardeningMode(true);
    try {
      const res = await fetch('/api/lsa/apply-hardening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: 'all', method: 'registry' })
      });
      const data = await res.json();
      alert(data.message || "LSA Protection applied");
    } catch (e) {
      console.error("Hardening error:", e);
    } finally {
      setHardeningMode(false);
      fetchData();
    }
  };

  const vulnerableCount = endpoints.filter(e => !e.runasppl_enabled).length;
  const highRiskCount = endpoints.filter(e => e.risk_score > 70).length;
  const criticalAlerts = alerts.filter(a => a.severity === "critical" && !a.blocked).length;

  if (loading) {
    return <div style={{ padding: "20px", color: "var(--signal)" }}>CARGANDO LSA MONITOR...</div>;
  }

  return (
    <div style={{ flex: 1, padding: "15px", display: "flex", flexDirection: "column", gap: "15px", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", color: "var(--signal)", fontFamily: "var(--mono)" }}>
            🔐 Credential Guard & LSA Monitor
          </h2>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Monitoreo Real de Seguridad LSA via Sysmon ID 10</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleHardening} disabled={hardeningMode} style={{ padding: "8px 16px", background: hardeningMode ? "var(--danger)" : "var(--signal)", border: "none", color: "#000", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 700, fontFamily: "var(--mono)" }}>
            {hardeningMode ? "⏳ APLICANDO..." : "🛡️ ENABLE LSA PROTECTION"}
          </button>
          <button onClick={fetchData} style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--signal)", color: "var(--signal)", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}>🔄 SYNC</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "15px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "5px" }}>ENDPOINTS</div>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "var(--signal)" }}>{endpoints.length}</div>
        </div>
        <div style={{ background: "var(--bg-panel)", border: vulnerableCount > 0 ? "1px solid var(--danger)" : "1px solid var(--signal)", borderRadius: "8px", padding: "15px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "5px" }}>RUNASPPL OFF</div>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: vulnerableCount > 0 ? "var(--danger)" : "var(--signal)" }}>{vulnerableCount}</div>
        </div>
        <div style={{ background: "var(--bg-panel)", border: criticalAlerts > 0 ? "1px solid var(--danger)" : "1px solid var(--signal)", borderRadius: "8px", padding: "15px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "5px" }}>AMENAZAS</div>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: criticalAlerts > 0 ? "var(--danger)" : "var(--signal)" }}>{criticalAlerts}</div>
        </div>
        <div style={{ background: "var(--bg-panel)", border: highRiskCount > 0 ? "1px solid var(--danger)" : "1px solid var(--signal)", borderRadius: "8px", padding: "15px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "5px" }}>RIESGO LATERAL</div>
          <div style={{ fontSize: "24px", fontWeight: "bold", color: highRiskCount > 0 ? "var(--danger)" : "var(--signal)" }}>{highRiskCount}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", flex: 1 }}>
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "15px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>IDENTIDAD SEGURA - ENDPOINTS</h3>
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ color: "var(--text-dim)", textTransform: "uppercase" }}>
                  <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid var(--line)" }}>Hostname</th>
                  <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid var(--line)" }}>RunAsPPL</th>
                  <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid var(--line)" }}>LSA</th>
                  <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid var(--line)" }}>Riesgo</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map(ep => (
                  <tr key={ep.hostname} style={{ borderBottom: "1px solid var(--line-faint)" }}>
                    <td style={{ padding: "8px" }}>{ep.hostname}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <span style={{ 
                        padding: "3px 8px", 
                        borderRadius: "4px", 
                        background: ep.runasppl_enabled ? "var(--signal)" : "var(--danger)",
                        color: ep.runasppl_enabled ? "#000" : "#fff",
                        fontSize: "10px",
                        fontWeight: 600
                      }}>
                        {ep.runasppl_enabled ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <span style={{ 
                        padding: "3px 8px", 
                        borderRadius: "4px", 
                        background: ep.lsa_protected ? "var(--signal)" : "var(--danger)",
                        color: ep.lsa_protected ? "#000" : "#fff",
                        fontSize: "10px",
                        fontWeight: 600
                      }}>
                        {ep.lsa_protected ? "PROT" : "EXP"}
                      </span>
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <span style={{ 
                        color: ep.risk_score > 70 ? "var(--danger)" : ep.risk_score > 30 ? "var(--amber)" : "var(--signal)",
                        fontWeight: 600
                      }}>
                        {ep.risk_score}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "15px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>DETECCIÓN DE HERRAMIENTAS</h3>
            <span style={{ fontSize: "10px", color: "var(--danger)", fontWeight: 600 }}>{alerts.length} DETECTADAS</span>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {alerts.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-dim)", opacity: 0.5 }}>Sin detecciones</div>
            ) : (
              alerts.map(alert => (
                <div key={alert.id} style={{ 
                  padding: "10px", 
                  marginBottom: "8px", 
                  background: alert.severity === "critical" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.1)",
                  border: `1px solid ${alert.severity === "critical" ? "var(--danger)" : "var(--amber)"}`,
                  borderRadius: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div>
                    <span style={{ 
                      padding: "2px 6px", 
                      background: alert.severity === "critical" ? "var(--danger)" : "var(--amber)",
                      color: "#000",
                      borderRadius: "3px",
                      fontSize: "9px",
                      fontWeight: 700,
                      marginRight: "8px"
                    }}>
                      {alert.type.toUpperCase()}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text)" }}>{alert.source_ip}</span>
                    <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px" }}>{alert.hostname}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "15px" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>MOVIMIENTO LATERAL</h3>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Admin Sessions:</span>
              <span style={{ fontSize: "16px", fontWeight: "bold", color: "var(--signal)" }}>{endpoints.reduce((a, e) => a + e.admin_sessions, 0)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>High Risk Hosts:</span>
              <span style={{ fontSize: "16px", fontWeight: "bold", color: highRiskCount > 0 ? "var(--danger)" : "var(--signal)" }}>{highRiskCount}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Vulnerable:</span>
              <span style={{ fontSize: "16px", fontWeight: "bold", color: vulnerableCount > 0 ? "var(--danger)" : "var(--signal)" }}>{vulnerableCount}</span>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "15px" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--signal)", fontFamily: "var(--mono)" }}>⚡ COMANDOS SYSMON ID 10</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px" }}>
              <div style={{ fontSize: "11px", color: "var(--amber)", marginBottom: "8px", fontWeight: 600 }}>QUERY EVENTOS LSASS (SYSMON ID 10)</div>
              <pre style={{ fontSize: "11px", color: "var(--signal)", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: "1.4" }}>{SYSMON_ID10_QUERY}</pre>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px" }}>
              <div style={{ fontSize: "11px", color: "var(--signal)", marginBottom: "8px", fontWeight: 600 }}>VERIFY LSA STATUS</div>
              <pre style={{ fontSize: "11px", color: "var(--text)", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: "1.4" }}>{CHECK_LSA_STATUS}</pre>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px" }}>
              <div style={{ fontSize: "11px", color: "var(--danger)", marginBottom: "8px", fontWeight: 600 }}>🛡️ ENABLE LSA PROTECTION</div>
              <pre style={{ fontSize: "11px", color: "var(--text)", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: "1.4" }}>{LSA_HARDENING_CMD}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function generateMockData(): EndpointStatus[] {
  return [
    { hostname: "WS-ADMIN-01", runasppl_enabled: true, lsa_protected: true, suspicious_processes: [], admin_sessions: 3, risk_score: 25, sysmon_logged: 156 },
    { hostname: "WS-FINANZAS-02", runasppl_enabled: false, lsa_protected: false, suspicious_processes: ["mimikatz"], admin_sessions: 5, risk_score: 85, sysmon_logged: 892 },
    { hostname: "SRV-DB-01", runasppl_enabled: true, lsa_protected: true, suspicious_processes: [], admin_sessions: 1, risk_score: 10, sysmon_logged: 23 },
    { hostname: "WS-VENTAS-03", runasppl_enabled: false, lsa_protected: false, suspicious_processes: ["procdump"], admin_sessions: 2, risk_score: 92, sysmon_logged: 1205 },
    { hostname: "WS-DEV-04", runasppl_enabled: true, lsa_protected: true, suspicious_processes: [], admin_sessions: 0, risk_score: 5, sysmon_logged: 12 },
  ];
}

function generateMockAlerts(): LSAAlert[] {
  return [
    { id: 1, timestamp: new Date().toISOString(), type: "mimikatz", source_ip: "192.168.1.105", hostname: "WS-FINANZAS-02", severity: "critical", blocked: false, target_process: "lsass.exe", source_process: "mimikatz.exe" },
    { id: 2, timestamp: new Date(Date.now() - 60000).toISOString(), type: "sysmon_id10", source_ip: "192.168.1.108", hostname: "WS-VENTAS-03", severity: "critical", blocked: false, target_process: "lsass.exe", source_process: "powercat.exe" },
    { id: 3, timestamp: new Date(Date.now() - 120000).toISOString(), type: "procdump", source_ip: "192.168.1.105", hostname: "WS-FINANZAS-02", severity: "high", blocked: true, target_process: "lsass.exe", source_process: "procdump.exe" },
    { id: 4, timestamp: new Date(Date.now() - 180000).toISOString(), type: "lsass_access", source_ip: "192.168.1.202", hostname: "WS-ADMIN-01", severity: "medium", blocked: false, target_process: "lsass.exe", source_process: "svchost.exe" },
  ];
}