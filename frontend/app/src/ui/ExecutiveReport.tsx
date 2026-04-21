import { useEffect, useMemo, useState } from "react";
import {
  Alert as MUIAlert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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

  const panelSx = {
    bgcolor: "#0f0f0f",
    border: "1px solid #00ff41",
    boxShadow: "0 0 14px rgba(0, 255, 65, 0.35)",
    color: "#00ff41",
    fontFamily: "monospace",
  } as const;

  return (
    <Box sx={{ minHeight: "100vh", p: 3, bgcolor: "#0a0a0a", color: "#00ff41", fontFamily: "monospace" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
          Executive Report Generator
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => void load()}
            disabled={loading}
            sx={{ color: "#00ff41", borderColor: "#00ff41", fontFamily: "monospace" }}
          >
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
          <Button
            variant="contained"
            onClick={exportPdf}
            sx={{ bgcolor: "#00ff41", color: "#0a0a0a", fontFamily: "monospace", fontWeight: 700 }}
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
          <CircularProgress sx={{ color: "#00ff41", mb: 2 }} />
          <Typography sx={{ fontFamily: "monospace" }}>Generando reporte ejecutivo...</Typography>
        </Stack>
      )}

      {data && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={panelSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontFamily: "monospace", mb: 2 }}>
                  Score de riesgo global
                </Typography>
                <Box sx={{ position: "relative", display: "inline-flex", mx: "auto", width: "100%", justifyContent: "center" }}>
                  <CircularProgress variant="determinate" value={100} size={160} thickness={4} sx={{ color: "rgba(0,255,65,0.2)", position: "absolute" }} />
                  <CircularProgress variant="determinate" value={data.riskScore} size={160} thickness={4} sx={{ color: riskColor }} />
                  <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: "absolute", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="h4" sx={{ fontFamily: "monospace", color: riskColor }}>
                      {data.riskScore}
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ mt: 2, opacity: 0.85, textAlign: "center" }}>
                  Fuente: {data.source === "api" ? "Backend en linea" : "Fallback simulado"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={panelSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontFamily: "monospace" }}>
                  Resumen ejecutivo (Ollama)
                </Typography>
                <Divider sx={{ my: 1.5, borderColor: "rgba(0,255,65,0.35)" }} />
                <Typography sx={{ lineHeight: 1.7 }}>{data.executiveSummary}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={panelSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontFamily: "monospace", mb: 1 }}>
                  Metricas clave
                </Typography>
                <Stack spacing={1}>
                  <Typography>Total alertas: {data.metrics.totalAlerts}</Typography>
                  <Typography>Criticas: {data.metrics.criticalAlerts}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`LOW ${data.metrics.bySeverity.low}`} color="success" size="small" />
                    <Chip label={`MEDIUM ${data.metrics.bySeverity.medium}`} color="warning" size="small" />
                    <Chip label={`HIGH ${data.metrics.bySeverity.high}`} color="error" size="small" />
                    <Chip label={`CRITICAL ${data.metrics.bySeverity.critical}`} color="error" variant="outlined" size="small" />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={panelSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontFamily: "monospace", mb: 1 }}>
                  Top amenazas
                </Typography>
                <Stack spacing={1}>
                  {data.topThreats.map((threat) => (
                    <Stack key={threat.attackType} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ maxWidth: "72%" }}>{threat.attackType}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={threat.severity.toUpperCase()} color={severityColor(threat.severity)} size="small" />
                        <Typography>x{threat.count}</Typography>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={panelSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontFamily: "monospace", mb: 1 }}>
                  Cumplimiento ISO/IEC 27001:2022
                </Typography>
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
                        />
                      </Stack>
                      <Typography sx={{ opacity: 0.8 }}>{control.note}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={panelSx}>
              <CardContent>
                <Typography variant="h6" sx={{ fontFamily: "monospace", mb: 1 }}>
                  Recomendaciones priorizadas
                </Typography>
                <Stack spacing={1}>
                  {data.recommendations.map((item) => (
                    <Typography key={item}>- {item}</Typography>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
