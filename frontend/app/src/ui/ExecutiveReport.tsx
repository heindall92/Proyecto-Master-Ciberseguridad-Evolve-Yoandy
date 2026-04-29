import { useEffect, useMemo, useState } from "react";
import {
  Alert as MUIAlert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import { fetchExecutiveReportData, type ExecutiveReportData } from "../lib/reportApi";

function severityColor(value: string): "success" | "warning" | "error" | "default" {
  const sev = value.toLowerCase();
  if (sev === "critical" || sev === "high") return "error";
  if (sev === "medium") return "warning";
  if (sev === "low") return "success";
  return "default";
}

function gaugeColor(score: number): string {
  if (score >= 80) return "#ff3b3b";
  if (score >= 60) return "#ff9f1a";
  return "#00ff41";
}

export default function ExecutiveReport() {
  const [data, setData] = useState<ExecutiveReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const report = await fetchExecutiveReportData();
      setData(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const riskColor = useMemo(() => gaugeColor(data?.riskScore ?? 0), [data?.riskScore]);

  function exportPdf() {
    window.print();
  }

  return (
    <Box
      sx={{
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        p: 2,
        bgcolor: "var(--bg-void)",
        color: "var(--text)",
        fontFamily: "var(--mono)",
        background:
          "radial-gradient(ellipse at 20% 0%, rgba(60,255,158,0.04), transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(74,227,255,0.03), transparent 55%), var(--bg-void)",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography
          variant="h5"
          sx={{
            fontFamily: "var(--sans)",
            fontWeight: 700,
            color: "var(--text-bright)",
            letterSpacing: "2px",
            textTransform: "uppercase",
            textShadow: "0 0 10px var(--signal-glow)",
          }}
        >
          Executive Report Generator
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => void load()}
            disabled={loading}
            sx={{
              color: "var(--signal)",
              borderColor: "var(--line-strong)",
              fontFamily: "var(--sans)",
              fontWeight: 700,
              letterSpacing: "1px",
              "&:hover": { borderColor: "var(--signal)", backgroundColor: "rgba(60,255,158,0.1)" },
            }}
          >
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
          <Button
            variant="outlined"
            onClick={exportPdf}
            sx={{
              color: "var(--signal)",
              borderColor: "var(--line-strong)",
              fontFamily: "var(--sans)",
              fontWeight: 700,
              letterSpacing: "1px",
              "&:hover": { borderColor: "var(--signal)", backgroundColor: "rgba(60,255,158,0.1)" },
            }}
          >
            Exportar PDF
          </Button>
        </Stack>
      </Stack>

      {error && (
        <MUIAlert severity="error" sx={{ mb: 2 }}>
          {error}
        </MUIAlert>
      )}

      {!data && loading && (
        <Stack alignItems="center" sx={{ py: 10 }}>
          <CircularProgress sx={{ color: "var(--signal)", mb: 2 }} />
          <Typography sx={{ fontFamily: "var(--mono)", letterSpacing: "1px" }}>Generando reporte ejecutivo...</Typography>
        </Stack>
      )}

      {data && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Box className="panel" sx={{ position: "relative" }}>
              <Box className="panel__head">
                <Typography className="panel__title">Riesgo Global</Typography>
              </Box>
              <Box className="panel__body">
                <Typography variant="body2" sx={{ mb: 2, color: "var(--text-dim)", letterSpacing: "1px", textTransform: "uppercase" }}>
                  Score de riesgo global
                </Typography>
                <Box sx={{ position: "relative", display: "inline-flex", mx: "auto", width: "100%", justifyContent: "center" }}>
                  <CircularProgress variant="determinate" value={100} size={160} thickness={4} sx={{ color: "var(--line)", position: "absolute" }} />
                  <CircularProgress variant="determinate" value={data.riskScore} size={160} thickness={4} sx={{ color: riskColor }} />
                  <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: "absolute", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="h4" sx={{ fontFamily: "var(--mono)", color: riskColor, textShadow: "0 0 10px rgba(60,255,158,0.2)" }}>
                      {data.riskScore}
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ mt: 2, color: "var(--text-dim)", textAlign: "center", letterSpacing: "0.6px" }}>
                  Fuente: {data.source === "api" ? "Backend en linea" : "Fallback simulado"}
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Box className="panel" sx={{ position: "relative" }}>
              <Box className="panel__head">
                <Typography className="panel__title">Resumen Ejecutivo (Ollama)</Typography>
              </Box>
              <Box className="panel__body">
                <Typography sx={{ lineHeight: 1.7, color: "var(--text)" }}>{data.executiveSummary}</Typography>
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="panel" sx={{ position: "relative" }}>
              <Box className="panel__head">
                <Typography className="panel__title">Metricas Clave</Typography>
              </Box>
              <Box className="panel__body">
                <Stack spacing={1}>
                  <Typography>Total alertas: {data.metrics.totalAlerts}</Typography>
                  <Typography>Criticas: {data.metrics.criticalAlerts}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`LOW ${data.metrics.bySeverity.low}`} size="small" sx={{ borderColor: "var(--signal-dim)", color: "var(--signal-dim)" }} variant="outlined" />
                    <Chip label={`MEDIUM ${data.metrics.bySeverity.medium}`} size="small" sx={{ borderColor: "var(--amber)", color: "var(--amber)" }} variant="outlined" />
                    <Chip label={`HIGH ${data.metrics.bySeverity.high}`} size="small" sx={{ borderColor: "var(--danger)", color: "var(--danger)" }} variant="outlined" />
                    <Chip label={`CRITICAL ${data.metrics.bySeverity.critical}`} size="small" sx={{ borderColor: "var(--danger)", color: "var(--danger)" }} variant="outlined" />
                  </Stack>
                </Stack>
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="panel" sx={{ position: "relative" }}>
              <Box className="panel__head">
                <Typography className="panel__title">Top Amenazas</Typography>
              </Box>
              <Box className="panel__body">
                <Stack spacing={1}>
                  {data.topThreats.map((threat) => (
                    <Stack key={threat.attackType} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ maxWidth: "72%" }}>{threat.attackType}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={threat.severity.toUpperCase()} color={severityColor(threat.severity)} size="small" variant="outlined" />
                        <Typography>x{threat.count}</Typography>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="panel" sx={{ position: "relative" }}>
              <Box className="panel__head">
                <Typography className="panel__title">Cumplimiento ISO/IEC 27001:2022</Typography>
              </Box>
              <Box className="panel__body">
                <Typography sx={{ mb: 1.5 }}>Nivel estimado: {data.iso27001.overall}%</Typography>
                <Stack spacing={1}>
                  {data.iso27001.controls.map((control) => (
                    <Box key={control.control}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography>{control.control}</Typography>
                        <Chip
                          size="small"
                          label={control.status.toUpperCase()}
                          color={control.status === "covered" ? "success" : control.status === "partial" ? "warning" : "error"}
                          variant="outlined"
                        />
                      </Stack>
                      <Typography sx={{ color: "var(--text-dim)" }}>{control.note}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="panel" sx={{ position: "relative" }}>
              <Box className="panel__head">
                <Typography className="panel__title">Recomendaciones Priorizadas</Typography>
              </Box>
              <Box className="panel__body">
                <Stack spacing={1}>
                  {data.recommendations.map((item) => (
                    <Typography key={item} sx={{ color: "var(--text)" }}>
                      - {item}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            </Box>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
