import { useEffect, useMemo, useState } from "react";
import {
  Alert as MUIAlert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import {
  AlertOut,
  AnalysisOut,
  EventOut,
  analyzeAlert,
  listAlerts,
  listEvents,
} from "../lib/api";

function severityColor(sev: string): "success" | "warning" | "error" | "default" {
  switch (sev.toLowerCase()) {
    case "low":
      return "success";
    case "medium":
      return "warning";
    case "high":
      return "error";
    case "critical":
      return "error";
    default:
      return "default";
  }
}

export default function App() {
  const [events, setEvents] = useState<EventOut[]>([]);
  const [alerts, setAlerts] = useState<AlertOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysisByAlertId, setAnalysisByAlertId] = useState<Record<number, AnalysisOut>>({});
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  const activeAlerts = useMemo(() => alerts.slice(0, 20), [alerts]);
  const recentEvents = useMemo(() => events.slice(0, 20), [events]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [ev, al] = await Promise.all([listEvents(50, 0), listAlerts(50, 0)]);
      setEvents(ev);
      setAlerts(al);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, []);

  async function onAnalyze(alertId: number) {
    setAnalyzingId(alertId);
    setError(null);
    try {
      const res = await analyzeAlert(alertId);
      setAnalysisByAlertId((prev) => ({ ...prev, [alertId]: res }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzingId(null);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Valhalla SOC
          </Typography>
          <Button color="inherit" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Actualizando..." : "Refrescar"}
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error && (
          <MUIAlert severity="error" sx={{ mb: 2 }}>
            {error}
          </MUIAlert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="h6">Eventos recientes</Typography>
                  {loading && <CircularProgress size={18} />}
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Stack spacing={1}>
                  {recentEvents.map((e) => (
                    <Box
                      key={e.id}
                      sx={{
                        display: "flex",
                        gap: 1,
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={e.source_ip ?? "n/a"} variant="outlined" />
                        <Typography variant="body2" sx={{ opacity: 0.9 }}>
                          {e.attack_type ?? "unknown"}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        {new Date(e.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                  {recentEvents.length === 0 && (
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      Sin eventos todavía.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6">Alertas</Typography>
                <Divider sx={{ my: 2 }} />
                <Stack spacing={1.5}>
                  {activeAlerts.map((a) => {
                    const analysis = analysisByAlertId[a.id];
                    return (
                      <Card key={a.id} variant="outlined">
                        <CardContent>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Chip
                              label={a.severity.toUpperCase()}
                              color={severityColor(a.severity)}
                              size="small"
                            />
                            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                              {a.description ?? "Sin descripción"}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>
                              {new Date(a.timestamp).toLocaleString()}
                            </Typography>
                          </Stack>

                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <Chip label={`ID ${a.id}`} size="small" variant="outlined" />
                            {a.rule_id && <Chip label={a.rule_id} size="small" variant="outlined" />}
                            {a.event_id && <Chip label={`event_id=${a.event_id}`} size="small" variant="outlined" />}
                          </Stack>

                          <Button
                            variant="contained"
                            onClick={() => void onAnalyze(a.id)}
                            disabled={analyzingId === a.id}
                            sx={{ mb: analysis ? 2 : 0 }}
                          >
                            {analyzingId === a.id ? "Analizando..." : "Analizar con IA"}
                          </Button>

                          {analysis && (
                            <Card variant="outlined">
                              <CardContent>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                  Resultado IA
                                </Typography>
                                <Stack spacing={0.75}>
                                  <Typography variant="body2">
                                    <b>attack_type</b>: {analysis.attack_type}
                                  </Typography>
                                  <Typography variant="body2">
                                    <b>severity</b>: {analysis.severity}
                                  </Typography>
                                  <Typography variant="body2">
                                    <b>summary</b>: {analysis.summary}
                                  </Typography>
                                  <Typography variant="body2">
                                    <b>recommended_action</b>: {analysis.recommended_action}
                                  </Typography>
                                </Stack>
                              </CardContent>
                            </Card>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                  {activeAlerts.length === 0 && (
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      Sin alertas todavía.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

