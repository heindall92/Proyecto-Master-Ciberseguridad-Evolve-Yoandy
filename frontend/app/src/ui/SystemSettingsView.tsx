import { useState, useEffect, useMemo } from "react";
import { fetchAuth } from "../lib/api";
import type { LucideIcon } from "lucide-react";
import { Bot, KeyRound, Paperclip, Archive, Save, RotateCcw, Eye, EyeOff, CheckCircle2, CircleDashed, ShieldCheck, Server, Cpu, Thermometer, Gauge } from "lucide-react";
import { toast } from "./premium/widgets";
import "./premium/profile.css";
import "./premium/settings.css";

export interface SystemSettingOut {
  key: string;
  value: string;
  is_sensitive: boolean;
  updated_at: string | null;
  source?: "db" | "env";
}

interface SystemSettingIn {
  key: string;
  value: string;
  is_sensitive: boolean;
}

type Lang = "en" | "es";
const KEYS = ["ollama_url", "ollama_model", "ollama_temperature", "ollama_min_alert_level", "vt_api_key", "otx_api_key", "max_upload_mb", "retention_days"] as const;
type Key = (typeof KEYS)[number];
const SENSITIVE: Key[] = ["vt_api_key", "otx_api_key"];
const LEVELS = [
  { v: "low", es: "Bajo", en: "Low", n: 3 },
  { v: "medium", es: "Medio", en: "Medium", n: 5 },
  { v: "high", es: "Alto", en: "High", n: 7 },
  { v: "critical", es: "Crítico", en: "Critical", n: 12 },
];

// Misma validación que el backend (_validate_setting)
function validate(key: Key, v: string, es: boolean): string | null {
  const t = v.trim();
  switch (key) {
    case "ollama_url": return /^https?:\/\/[\w.-]+(:\d{1,5})?\/?$/.test(t) ? null : (es ? "Formato http(s)://host:puerto" : "Format http(s)://host:port");
    case "ollama_model": return /^[\w.\-/]+(:[\w.-]+)?$/.test(t) ? null : (es ? "Nombre de modelo no válido" : "Invalid model name");
    case "ollama_temperature": { const f = Number(t); return t !== "" && f >= 0 && f <= 1 ? null : (es ? "Entre 0 y 1" : "Between 0 and 1"); }
    case "max_upload_mb": return /^\d+$/.test(t) && +t >= 1 && +t <= 50 ? null : (es ? "Entre 1 y 50 MB" : "Between 1 and 50 MB");
    case "retention_days": return t === "" || (/^\d+$/.test(t) && +t >= 7 && +t <= 365) ? null : (es ? "Entre 7 y 365 días" : "Between 7 and 365 days");
    default: return null;
  }
}

function Card({ icon: Icon, title, sub, children }: { icon: LucideIcon; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="pf-card">
      <div className="pf-card__head">
        <span className="pf-card__icon"><Icon size={16} /></span>
        <div><div className="pf-card__title">{title}</div><div className="pf-card__sub">{sub}</div></div>
      </div>
      <div className="pf-card__body st-body">{children}</div>
    </section>
  );
}

function Field({ label, icon: Icon, badge, dirty, error, hint, children }: {
  label: string; icon: LucideIcon; badge: React.ReactNode; dirty: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className={`pf-field st-field${dirty ? " st-field--dirty" : ""}`}>
      <div className="st-field__label"><span className="pf-label"><Icon size={12} />{label}</span>{badge}</div>
      {children}
      {error ? <span className="st-err">{error}</span> : hint ? <span className="pf-help">{hint}</span> : null}
    </div>
  );
}

export default function SystemSettingsView({ lang = "es" }: { lang?: Lang }) {
  const es = lang === "es";
  const [remote, setRemote] = useState<Record<string, SystemSettingOut>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const load = async () => {
    try {
      const data = await fetchAuth<SystemSettingOut[]>("/api/settings");
      const byKey: Record<string, SystemSettingOut> = {};
      data.forEach((d) => { byKey[d.key] = d; });
      setRemote(byKey);
      const v: Record<string, string> = {};
      KEYS.forEach((k) => { v[k] = SENSITIVE.includes(k) ? "" : byKey[k]?.value ?? ""; });
      setValues(v);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const original = (k: Key) => (SENSITIVE.includes(k) ? "" : remote[k]?.value ?? "");
  const dirty = useMemo(() => KEYS.filter((k) => (values[k] ?? "") !== original(k)), [values, remote]);
  const errors = useMemo(() => {
    const e: Partial<Record<Key, string>> = {};
    dirty.forEach((k) => { const m = validate(k, values[k] ?? "", es); if (m) e[k] = m; });
    return e;
  }, [dirty, values, es]);
  const canSave = dirty.length > 0 && Object.keys(errors).length === 0 && !saving;

  const set = (k: Key, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const discard = () => setValues(() => { const v: Record<string, string> = {}; KEYS.forEach((k) => { v[k] = original(k); }); return v; });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: SystemSettingIn[] = dirty.map((k) => ({ key: k, value: values[k].trim(), is_sensitive: SENSITIVE.includes(k) }));
      const r = await fetchAuth<{ changed: string[]; retention?: { days: number; updated_indices: number } | null }>("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
      let msg = es ? `Guardado: ${r.changed.length} ajuste(s), aplicados al momento.` : `Saved: ${r.changed.length} setting(s), applied immediately.`;
      if (r.retention) msg += es ? ` Retención de ${r.retention.days} días activa.` : ` ${r.retention.days}-day retention active.`;
      toast(msg, "ok");
      await load();
    } catch (e) {
      toast(String(e).replace(/^Error:\s*/, "").replace(/^HTTP \d+:\s*/, "").replace(/^\{"detail":"(.*)"\}$/, "$1"), "err");
    } finally {
      setSaving(false);
    }
  };

  const sourceBadge = (k: Key) => {
    const r = remote[k];
    if (SENSITIVE.includes(k)) {
      return r?.value === "********"
        ? <span className="st-badge st-badge--ok"><CheckCircle2 size={11} />{es ? "Configurada" : "Configured"}</span>
        : <span className="st-badge"><CircleDashed size={11} />{es ? "Sin configurar" : "Not set"}</span>;
    }
    if (!r) return null;
    return r.source === "env"
      ? <span className="st-badge" title={es ? "Valor por defecto del fichero .env" : "Default from .env"}>.env</span>
      : <span className="st-badge st-badge--ok" title={r.updated_at ? new Date(r.updated_at).toLocaleString(lang) : ""}>{es ? "Personalizado" : "Custom"}</span>;
  };
  const fieldProps = (k: Key) => ({ badge: sourceBadge(k), dirty: dirty.includes(k), error: errors[k] });

  const secretInput = (k: Key, placeholder: string) => (
    <div className="pf-input-wrap">
      <KeyRound size={15} />
      <input type={reveal[k] ? "text" : "password"} autoComplete="off" maxLength={256} value={values[k] ?? ""} onChange={(e) => set(k, e.target.value)}
        placeholder={remote[k]?.value === "********" ? (es ? "•••••••• (escribe para sustituirla)" : "•••••••• (type to replace)") : placeholder} />
      <button type="button" className="pf-eye" onClick={() => setReveal((r) => ({ ...r, [k]: !r[k] }))} aria-label={reveal[k] ? (es ? "Ocultar" : "Hide") : (es ? "Mostrar" : "Show")}>{reveal[k] ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
  );

  if (loading) return <div className="st"><div className="vx-empty"><CircleDashed size={22} />{es ? "Cargando ajustes…" : "Loading settings…"}</div></div>;
  if (loadError) return <div className="st"><div className="vx-empty"><CircleDashed size={22} />{es ? "No se pudieron cargar los ajustes (solo administradores)." : "Could not load settings (admins only)."}</div></div>;

  const temp = Number(values.ollama_temperature || 0);

  return (
    <div className="st">
      <div className="st-head">
        <div>
          <h1>{es ? "Ajustes globales" : "Global settings"}</h1>
          <p><ShieldCheck size={12} />{es ? "Se aplican al momento. Las claves se guardan cifradas (AES-256-GCM) y nunca se muestran." : "Applied immediately. Keys are stored encrypted (AES-256-GCM) and never shown."}</p>
        </div>
      </div>

      <div className="st-grid">
        <Card icon={Bot} title={es ? "Inteligencia artificial" : "Artificial intelligence"} sub={es ? "Ollama local: chatbot, triaje y análisis de alertas" : "Local Ollama: chatbot, triage and alert analysis"}>
          <Field {...fieldProps("ollama_url")} label={es ? "URL de Ollama" : "Ollama URL"} icon={Server}>
            <div className="pf-input-wrap"><Server size={15} /><input value={values.ollama_url ?? ""} onChange={(e) => set("ollama_url", e.target.value)} placeholder="http://ollama:11434" /></div>
          </Field>
          <Field {...fieldProps("ollama_model")} label={es ? "Modelo" : "Model"} icon={Cpu} hint={es ? "Debe estar descargado en Ollama (ollama pull)." : "Must be pulled in Ollama (ollama pull)."}>
            <div className="pf-input-wrap"><Cpu size={15} /><input value={values.ollama_model ?? ""} onChange={(e) => set("ollama_model", e.target.value)} placeholder="qwen2.5:3b-instruct" /></div>
          </Field>
          <Field {...fieldProps("ollama_temperature")} label={es ? "Temperatura" : "Temperature"} icon={Thermometer} hint={es ? "0 = respuestas deterministas (recomendado en un SOC)." : "0 = deterministic answers (recommended for a SOC)."}>
            <div className="st-range">
              <input type="range" min={0} max={1} step={0.1} value={temp} onChange={(e) => set("ollama_temperature", String(Number(e.target.value)))} aria-label={es ? "Temperatura" : "Temperature"} />
              <span className="vx-code">{temp.toFixed(1)}</span>
            </div>
          </Field>
          <Field {...fieldProps("ollama_min_alert_level")} label={es ? "Analizar alertas desde" : "Analyse alerts from"} icon={Gauge} hint={es ? "Nivel de Wazuh a partir del cual la IA triaja cada alerta que llega." : "Wazuh level from which the AI triages incoming alerts."}>
            <div className="wk-chipset st-chips">
              {LEVELS.map((l) => (
                <button key={l.v} type="button" aria-pressed={values.ollama_min_alert_level === l.v} onClick={() => set("ollama_min_alert_level", l.v)}>
                  {es ? l.es : l.en} · ≥{l.n}
                </button>
              ))}
            </div>
          </Field>
        </Card>

        <Card icon={KeyRound} title="Threat Intelligence" sub={es ? "Claves de API globales para enriquecer IOCs" : "Global API keys to enrich IOCs"}>
          <Field {...fieldProps("vt_api_key")} label="VirusTotal" icon={KeyRound} hint={es ? "Límite de consultas: 10/min (cuota gratuita)." : "Rate limit: 10/min (free quota)."}>
            {secretInput("vt_api_key", es ? "Pega tu API key de VirusTotal" : "Paste your VirusTotal API key")}
          </Field>
          <Field {...fieldProps("otx_api_key")} label="AlienVault OTX" icon={KeyRound}>
            {secretInput("otx_api_key", es ? "Pega tu API key de OTX" : "Paste your OTX API key")}
          </Field>
        </Card>

        <Card icon={Paperclip} title={es ? "Evidencias" : "Evidence"} sub={es ? "Ficheros adjuntos a los incidentes" : "Files attached to incidents"}>
          <Field {...fieldProps("max_upload_mb")} label={es ? "Tamaño máximo por fichero" : "Max file size"} icon={Paperclip} hint={es ? "Entre 1 y 50 MB. Cada fichero se registra con su SHA-256." : "1 to 50 MB. Every file is registered with its SHA-256."}>
            <div className="pf-input-wrap st-unit"><Paperclip size={15} /><input type="number" min={1} max={50} value={values.max_upload_mb ?? ""} onChange={(e) => set("max_upload_mb", e.target.value)} /><span>MB</span></div>
          </Field>
        </Card>

        <Card icon={Archive} title={es ? "Retención de alertas" : "Alert retention"} sub={es ? "Minimización de datos (RGPD art. 5.1.e)" : "Data minimisation (GDPR art. 5.1.e)"}>
          <Field {...fieldProps("retention_days")} label={es ? "Conservar alertas durante" : "Keep alerts for"} icon={Archive}
            hint={values.retention_days ? (es ? "Los índices de alertas más antiguos se borran automáticamente en el Wazuh Indexer (política ISM)." : "Older alert indices are deleted automatically in the Wazuh Indexer (ISM policy).") : (es ? "Sin política: las alertas (con IP de terceros) se conservan indefinidamente." : "No policy: alerts (with third-party IPs) are kept indefinitely.")}>
            <div className="pf-input-wrap st-unit"><Archive size={15} /><input type="number" min={7} max={365} value={values.retention_days ?? ""} onChange={(e) => set("retention_days", e.target.value)} placeholder={es ? "Sin límite" : "No limit"} /><span>{es ? "días" : "days"}</span></div>
          </Field>
        </Card>
      </div>

      <div className={`st-bar${dirty.length ? " st-bar--show" : ""}`} role="region" aria-label={es ? "Cambios pendientes" : "Pending changes"}>
        <span>{dirty.length ? (es ? `${dirty.length} cambio(s) sin guardar` : `${dirty.length} unsaved change(s)`) : (es ? "Sin cambios" : "No changes")}</span>
        <button className="vp-btn" onClick={discard} disabled={!dirty.length || saving}><RotateCcw size={13} />{es ? "Descartar" : "Discard"}</button>
        <button className="vp-btn vp-btn--primary" onClick={save} disabled={!canSave}><Save size={13} />{saving ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar" : "Save")}</button>
      </div>
    </div>
  );
}
