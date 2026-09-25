import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CircleHelp, X, Search, Rocket, ShieldAlert, Siren, Radar, Bot, Settings2,
  ChevronDown, ArrowRight, BookOpen, ExternalLink, Keyboard, MessageSquare, Activity, ScrollText,
} from "lucide-react";

type Lang = "es" | "en";
interface Faq { q: string; a: string }
interface Group { id: string; icon: LucideIcon; title: string; blurb: string; faqs: Faq[] }

// Contenido del centro de ayuda. Refleja el comportamiento real del producto
// (disparadores del chatbot, límites de login, duración de sesión, etc.).
// Formato mínimo en las respuestas: `código` y **negrita**.
const CONTENT: Record<Lang, Group[]> = {
  es: [
    {
      id: "start", icon: Rocket, title: "Primeros pasos",
      blurb: "Qué es Valhalla SOC, cómo se arranca y qué puede hacer cada rol.",
      faqs: [
        { q: "¿Qué es Valhalla SOC?", a: "Una consola de **Security Operations Center** que centraliza las alertas de **Wazuh**, la telemetría del honeypot **Cowrie** y la inteligencia de amenazas (VirusTotal, OTX, CISA KEV). Permite convertir alertas en incidentes, trabajarlos en el Workspace con runbooks y generar informes ejecutivos, con un asistente de IA local (Ollama) de apoyo." },
        { q: "¿Cómo se pone en marcha desde cero?", a: "Clona el repositorio, ejecuta `python scripts/setup_env.py` para generar `.env` con secretos aleatorios, genera los certificados de Wazuh y levanta el stack con `docker compose --profile labs up -d --build`. El panel queda en el puerto `3000`. El README detalla cada paso." },
        { q: "¿Qué diferencia hay entre administrador y analista?", a: "El **analista** ve alertas, incidentes, Threat Intel, runbooks y su Workspace. El **administrador** además gestiona usuarios, activos, monitores, integraciones, auditoría, ajustes globales y el informe ejecutivo. Los permisos se comprueban también en el backend: una llamada a la API sin el rol adecuado devuelve `403`." },
        { q: "¿Cómo cambio mi contraseña o mi foto?", a: "Menú de usuario (arriba a la derecha) → **Perfil**. Desde ahí puedes subir un avatar y cambiar la contraseña, que debe cumplir la política de complejidad del sistema." },
      ],
    },
    {
      id: "alerts", icon: ShieldAlert, title: "Alertas y Wazuh",
      blurb: "De dónde salen las alertas, severidades, agentes y respuesta activa.",
      faqs: [
        { q: "¿De dónde salen las alertas del SIEM?", a: "Del **Wazuh Indexer**: el backend consulta los índices `wazuh-alerts-*` y además recibe en tiempo real las alertas que el manager envía al webhook `/api/webhook/wazuh`. Cada envío va firmado con **HMAC-SHA256** usando `WEBHOOK_SECRET`; si la firma no coincide, se rechaza." },
        { q: "¿Qué significan las severidades?", a: "Se derivan del **nivel de la regla de Wazuh** (0–15). Los niveles altos se muestran como **crítico** o **alto** y cuentan en los contadores de la Vista general; los bajos se consideran informativos." },
        { q: "¿Qué es un agente y cómo sé si está activo?", a: "Un agente Wazuh es el software instalado en cada equipo monitorizado. En **Activos** ves su estado; la tarjeta **Agentes** de la Vista general indica cuántos están activos del total registrado." },
        { q: "¿Qué hace la respuesta activa (Active Response)?", a: "Ejecuta acciones automáticas en el agente ante reglas concretas, por ejemplo **bloquear una IP** atacante. Se configura en `wazuh_config/ossec.conf` y está documentada en `docs/WAZUH_ACTIVE_RESPONSE.md`." },
      ],
    },
    {
      id: "incidents", icon: Siren, title: "Incidentes y Workspace",
      blurb: "Crear, asignar y cerrar incidentes; runbooks e informes.",
      faqs: [
        { q: "¿Cómo convierto una alerta en incidente?", a: "En la tabla de alertas pulsa **+INC**. Se crea un ticket con la alerta asociada, que aparece en **Incidentes**, en las notificaciones y en el contador superior." },
        { q: "¿Cómo me asigno un incidente?", a: "Desde el panel de **notificaciones** (campana) → **Asignarme**, o desde el propio incidente en el **Workspace**, donde también puedes adjuntar evidencias (máx. 10 MB: imágenes, PDF, TXT/LOG, JSON, CSV, PCAP y ZIP)." },
        { q: "¿Qué son los runbooks?", a: "Procedimientos paso a paso para responder a cada tipo de amenaza (fuerza bruta SSH, malware, exfiltración…). Cada alerta del **LSA Monitor** sugiere el runbook más adecuado." },
        { q: "¿Cómo genero el informe ejecutivo?", a: "Menú lateral → **Informe ejecutivo** (solo administradores). Elige el rango de fechas y exporta el PDF ejecutivo o el técnico. Los datos salen de las alertas e incidentes reales del periodo." },
      ],
    },
    {
      id: "intel", icon: Radar, title: "Threat Intel y honeypot",
      blurb: "VirusTotal, OTX, CISA KEV, Cowrie y mapa de amenazas.",
      faqs: [
        { q: "¿Qué necesito para usar Threat Intel?", a: "Claves de **VirusTotal** y **AlienVault OTX** en **Ajustes globales**. Se guardan cifradas con **AES-256-GCM** y nunca se muestran completas. Las consultas a VirusTotal están limitadas a `10/minuto` para respetar la cuota gratuita." },
        { q: "¿Qué es el honeypot Cowrie?", a: "Un servidor SSH/Telnet **señuelo** (puertos `2222` y `2223`) que registra credenciales, comandos y descargas de los atacantes. Sus eventos alimentan la vista **Honeypots** y el **Threat Map**. Úsalo solo en tu laboratorio." },
        { q: "¿Qué muestra el Threat Map?", a: "La geolocalización de las IP atacantes reales registradas por el honeypot y Wazuh. Las ubicaciones se guardan en caché para no repetir consultas." },
        { q: "¿Qué es CVE Intel?", a: "Lista las vulnerabilidades del catálogo **CISA KEV** (explotadas activamente), busca exploits públicos por CVE en Exploit-DB y puede redactar con IA un borrador de aviso para difundir internamente." },
      ],
    },
    {
      id: "ai", icon: Bot, title: "Asistente de IA",
      blurb: "Chatbot VALHALLA-IA, modelos y privacidad.",
      faqs: [
        { q: "¿Cómo pregunto al chatbot?", a: "En el **chat interno** menciona al asistente con `@ia`, `@chatbot`, `@valhalla` o `@heimdall` seguido de tu pregunta. VALHALLA-IA responde en el mismo canal usando el contexto del SOC (alertas e incidentes recientes)." },
        { q: "¿Qué modelo usa y dónde se ejecuta?", a: "Por defecto un modelo ligero en **Ollama** dentro del propio stack, así que los datos no salen de tu infraestructura. El endpoint y el modelo se definen en `.env` (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`). Si configuras un endpoint remoto, el contenido de las preguntas se envía a ese servicio." },
        { q: "¿Puedo fiarme de lo que dice la IA?", a: "Es un **apoyo**, no un sustituto del analista. Contrasta siempre sus conclusiones con la evidencia (alerta, logs, IOC) antes de actuar o cerrar un incidente." },
      ],
    },
    {
      id: "settings", icon: Settings2, title: "Ajustes y problemas",
      blurb: "Tema, idioma, acentos, sesión y soluciones rápidas.",
      faqs: [
        { q: "¿Dónde cambio el tema, el idioma o el color de acento?", a: "En la barra superior: interruptor **ES/EN**, botón **claro/oscuro** y el botón de **paleta**, con los acentos Green, Cyan, Amber y Purple, scanlines y modo TV. Se guardan en este navegador." },
        { q: "Me ha sacado de la sesión", a: "La sesión usa cookies **httpOnly**: el token de acceso dura unas **2 horas** y se renueva solo durante **7 días**. Si caduca o cierras sesión, los tokens quedan revocados en el servidor y hay que volver a entrar." },
        { q: "No puedo iniciar sesión tras varios intentos", a: "El login admite **5 intentos por minuto** por origen, como protección frente a fuerza bruta. Espera un minuto y vuelve a intentarlo. Los intentos quedan registrados en **Auditoría**." },
        { q: "El panel no muestra alertas", a: "Revisa **Estado** (integraciones): comprueba que Wazuh Indexer y Manager aparecen conectados. En una instalación nueva es normal que tarde unos minutos en llegar la primera alerta." },
      ],
    },
  ],
  en: [
    {
      id: "start", icon: Rocket, title: "Getting started",
      blurb: "What Valhalla SOC is, how to launch it and what each role can do.",
      faqs: [
        { q: "What is Valhalla SOC?", a: "A **Security Operations Center** console that centralises **Wazuh** alerts, **Cowrie** honeypot telemetry and threat intelligence (VirusTotal, OTX, CISA KEV). Turn alerts into incidents, work them in the Workspace with runbooks and produce executive reports, supported by a local AI assistant (Ollama)." },
        { q: "How do I set it up from scratch?", a: "Clone the repository, run `python scripts/setup_env.py` to create `.env` with random secrets, generate the Wazuh certificates and start the stack with `docker compose --profile labs up -d --build`. The console runs on port `3000`. The README covers every step." },
        { q: "What is the difference between admin and analyst?", a: "**Analysts** see alerts, incidents, Threat Intel, runbooks and their Workspace. **Admins** also manage users, assets, monitors, integrations, audit, global settings and the executive report. Permissions are enforced in the backend too: an API call without the right role returns `403`." },
        { q: "How do I change my password or picture?", a: "User menu (top right) → **Profile**. Upload an avatar or change your password there; it must meet the system complexity policy." },
      ],
    },
    {
      id: "alerts", icon: ShieldAlert, title: "Alerts & Wazuh",
      blurb: "Where alerts come from, severities, agents and active response.",
      faqs: [
        { q: "Where do SIEM alerts come from?", a: "From the **Wazuh Indexer**: the backend queries the `wazuh-alerts-*` indices and also receives real-time alerts sent by the manager to `/api/webhook/wazuh`. Each delivery is signed with **HMAC-SHA256** using `WEBHOOK_SECRET`; mismatching signatures are rejected." },
        { q: "What do the severities mean?", a: "They derive from the **Wazuh rule level** (0–15). High levels are shown as **critical** or **high** and count in the Overview counters; low levels are informational." },
        { q: "What is an agent and how do I know it is active?", a: "A Wazuh agent is the software installed on each monitored host. **Assets** shows its status; the **Agents** card on the Overview shows how many are active out of those registered." },
        { q: "What does Active Response do?", a: "It runs automatic actions on the agent for specific rules, for example **blocking an attacking IP**. It is configured in `wazuh_config/ossec.conf` and documented in `docs/WAZUH_ACTIVE_RESPONSE.md`." },
      ],
    },
    {
      id: "incidents", icon: Siren, title: "Incidents & Workspace",
      blurb: "Create, assign and close incidents; runbooks and reports.",
      faqs: [
        { q: "How do I turn an alert into an incident?", a: "Press **+INC** in the alerts table. A ticket linked to the alert is created and appears in **Incidents**, in notifications and in the top counter." },
        { q: "How do I assign an incident to myself?", a: "From the **notifications** panel (bell) → **Assign to me**, or from the incident in the **Workspace**, where you can also attach evidence (max 10 MB: images, PDF, TXT/LOG, JSON, CSV, PCAP and ZIP)." },
        { q: "What are runbooks?", a: "Step-by-step procedures to respond to each threat type (SSH brute force, malware, exfiltration…). Every **LSA Monitor** alert suggests the most suitable runbook." },
        { q: "How do I produce the executive report?", a: "Sidebar → **Executive report** (admins only). Pick the date range and export the executive or technical PDF. Data comes from the real alerts and incidents of the period." },
      ],
    },
    {
      id: "intel", icon: Radar, title: "Threat Intel & honeypot",
      blurb: "VirusTotal, OTX, CISA KEV, Cowrie and threat map.",
      faqs: [
        { q: "What do I need for Threat Intel?", a: "**VirusTotal** and **AlienVault OTX** keys in **Global settings**. They are stored encrypted with **AES-256-GCM** and never shown in full. VirusTotal lookups are rate limited to `10/minute` to respect the free quota." },
        { q: "What is the Cowrie honeypot?", a: "A **decoy** SSH/Telnet server (ports `2222` and `2223`) that records attacker credentials, commands and downloads. Its events feed the **Honeypots** view and the **Threat Map**. Use it in your lab only." },
        { q: "What does the Threat Map show?", a: "The geolocation of real attacking IPs recorded by the honeypot and Wazuh. Locations are cached to avoid repeated lookups." },
        { q: "What is CVE Intel?", a: "It lists vulnerabilities from the **CISA KEV** catalogue (actively exploited), searches public exploits per CVE in Exploit-DB and can draft an internal advisory with AI." },
      ],
    },
    {
      id: "ai", icon: Bot, title: "AI assistant",
      blurb: "VALHALLA-IA chatbot, models and privacy.",
      faqs: [
        { q: "How do I ask the chatbot?", a: "In the **internal chat**, mention the assistant with `@ia`, `@chatbot`, `@valhalla` or `@heimdall` followed by your question. VALHALLA-IA answers in the same channel using SOC context (recent alerts and incidents)." },
        { q: "Which model does it use and where does it run?", a: "By default a lightweight model on **Ollama** inside the stack, so data stays in your infrastructure. Endpoint and model are set in `.env` (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`). If you configure a remote endpoint, question content is sent to that service." },
        { q: "Can I trust what the AI says?", a: "It is a **helper**, not a replacement for the analyst. Always check its conclusions against the evidence (alert, logs, IOC) before acting or closing an incident." },
      ],
    },
    {
      id: "settings", icon: Settings2, title: "Settings & troubleshooting",
      blurb: "Theme, language, accents, session and quick fixes.",
      faqs: [
        { q: "Where do I change theme, language or accent colour?", a: "In the top bar: **ES/EN** switch, **light/dark** button and the **palette** button with Green, Cyan, Amber and Purple accents, scanlines and TV mode. Saved in this browser." },
        { q: "I was logged out", a: "Sessions use **httpOnly** cookies: the access token lasts about **2 hours** and renews itself for **7 days**. When it expires or you log out, tokens are revoked server-side and you need to sign in again." },
        { q: "I cannot log in after several attempts", a: "Login allows **5 attempts per minute** per source as brute-force protection. Wait a minute and try again. Attempts are recorded in **Audit**." },
        { q: "The console shows no alerts", a: "Check **Health** (integrations): Wazuh Indexer and Manager must show as connected. On a fresh install the first alert may take a few minutes." },
      ],
    },
  ],
};

const REFS = [
  { href: "https://attack.mitre.org/", title: "MITRE ATT&CK", es: "Tácticas y técnicas adversarias", en: "Adversary tactics and techniques" },
  { href: "https://documentation.wazuh.com/current/index.html", title: "Wazuh", es: "Documentación oficial del SIEM", en: "Official SIEM documentation" },
  { href: "https://cowrie.readthedocs.io/", title: "Cowrie", es: "Honeypot SSH/Telnet", en: "SSH/Telnet honeypot" },
  { href: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", title: "CISA KEV", es: "Vulnerabilidades explotadas activamente", en: "Known exploited vulnerabilities" },
  { href: "https://www.nist.gov/cyberframework", title: "NIST CSF 2.0", es: "Marco de ciberseguridad", en: "Cybersecurity framework" },
  { href: "https://docs.virustotal.com/", title: "VirusTotal API", es: "Reputación de IP, dominios y ficheros", en: "IP, domain and file reputation" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Render mínimo: `code`, **bold** y resaltado de la búsqueda.
function RichText({ text, highlight }: { text: string; highlight: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  const mark = (s: string, key: string | number) => {
    if (!highlight) return <Fragment key={key}>{s}</Fragment>;
    const i = norm(s).indexOf(norm(highlight));
    if (i < 0) return <Fragment key={key}>{s}</Fragment>;
    return <Fragment key={key}>{s.slice(0, i)}<mark className="vp-mark">{s.slice(i, i + highlight.length)}</mark>{s.slice(i + highlight.length)}</Fragment>;
  };
  return <>{parts.map((p, i) =>
    p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code>
    : p.startsWith("**") ? <b key={i}>{mark(p.slice(2, -2), i)}</b>
    : mark(p, i))}</>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  isAdmin: boolean;
  onNavigate: (view: string) => void;
  onOpenChat: () => void;
}

export default function HelpCenter({ open, onClose, lang, isAdmin, onNavigate, onOpenChat }: Props) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const es = lang === "es";

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = CONTENT[lang];
  const q = query.trim();
  const filtered = useMemo(() => {
    if (!q) return groups;
    const nq = norm(q);
    return groups
      .map((g) => ({ ...g, faqs: g.faqs.filter((f) => norm(`${f.q} ${f.a}`).includes(nq)) }))
      .filter((g) => g.faqs.length > 0);
  }, [groups, q]);
  const matches = filtered.reduce((n, g) => n + g.faqs.length, 0);

  if (!open) return null;

  const goTo = (id: string) => {
    setQuery("");
    requestAnimationFrame(() => scrollRef.current?.querySelector(`#help-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const go = (view: string) => { onClose(); onNavigate(view); };

  return (
    <div className="vp-modal-backdrop vp-help-backdrop" onMouseDown={onClose}>
      <aside className="vp-help" role="dialog" aria-modal="true" aria-labelledby="vp-help-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="vp-help__bar">
          <CircleHelp size={18} color="var(--signal)" />
          <span className="vp-pop__title" id="vp-help-title">{es ? "Centro de ayuda" : "Help center"}</span>
          <span className="vp-chip">Valhalla SOC</span>
          <button className="vp-iconbtn" onClick={onClose} aria-label={es ? "Cerrar" : "Close"}><X size={18} /></button>
        </div>

        <div className="vp-help__scroll" ref={scrollRef}>
          <section className="vp-help__hero">
            <h2>{es ? "¿En qué podemos ayudarte?" : "How can we help?"}</h2>
            <p>{es
              ? "Guía de uso de Valhalla SOC: alertas de Wazuh, incidentes, Threat Intel, honeypot, asistente de IA y ajustes."
              : "Valhalla SOC user guide: Wazuh alerts, incidents, Threat Intel, honeypot, AI assistant and settings."}</p>
            <label className="vp-help__search">
              <Search size={18} />
              <input className="vp-bare-input" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={es ? "Busca: agente, contraseña, honeypot, @ia…" : "Search: agent, password, honeypot, @ia…"} />
              {q && <span className="vp-chip">{matches}</span>}
            </label>
          </section>

          {!q && (
            <>
              <div className="vp-section-title"><BookOpen size={16} />{es ? "Temas" : "Topics"}</div>
              <div className="vp-topics">
                {groups.map((g) => {
                  const Icon = g.icon;
                  return (
                    <button key={g.id} className="vp-topic" onClick={() => goTo(g.id)}>
                      <span className="vp-topic__icon"><Icon size={18} /></span>
                      <strong>{g.title}</strong>
                      <span>{g.blurb}</span>
                      <em>{es ? "Ver guía" : "Read guide"} <ArrowRight size={12} /></em>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {q && matches === 0 && (
            <div className="vp-empty">
              <Search size={24} />
              <strong>{es ? "Sin resultados" : "No results"}</strong>
              {es ? "Prueba con otras palabras o pregunta a VALHALLA-IA en el chat con @ia." : "Try other words or ask VALHALLA-IA in the chat with @ia."}
            </div>
          )}

          {filtered.map((g) => {
            const Icon = g.icon;
            return (
              <section key={g.id} id={`help-${g.id}`} className="vp-faq-group">
                <div className="vp-faq-group__head"><Icon size={16} />{g.title}</div>
                {g.faqs.map((f) => (
                  <details key={f.q} className="vp-faq" open={!!q}>
                    <summary><RichText text={f.q} highlight={q} /><ChevronDown size={16} /></summary>
                    <div className="vp-faq__a"><RichText text={f.a} highlight={q} /></div>
                  </details>
                ))}
              </section>
            );
          })}

          {!q && (
            <>
              <div className="vp-section-title"><Keyboard size={16} />{es ? "Atajos de teclado" : "Keyboard shortcuts"}</div>
              <div className="vp-shortcuts">
                <div className="vp-shortcut">{es ? "Buscar módulo o acción" : "Search module or action"} <span className="vp-kbd">Ctrl K</span></div>
                <div className="vp-shortcut">{es ? "Abrir este centro de ayuda" : "Open this help center"} <span className="vp-kbd">?</span></div>
                <div className="vp-shortcut">{es ? "Cerrar ventanas" : "Close dialogs"} <span className="vp-kbd">Esc</span></div>
              </div>

              <div className="vp-section-title"><ExternalLink size={16} />{es ? "Referencias técnicas" : "Technical references"}</div>
              <div className="vp-refs">
                {REFS.map((r) => (
                  <a key={r.href} className="vp-ref" href={r.href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} />
                    <div><strong>{r.title}</strong><span>{es ? r.es : r.en}</span></div>
                  </a>
                ))}
              </div>
            </>
          )}

          <section className="vp-help__cta">
            <h3><CircleHelp size={16} />{es ? "¿Sigues con dudas?" : "Still stuck?"}</h3>
            <p>{es ? "Valhalla SOC se ejecuta en tu infraestructura, sin soporte externo en vivo. Antes de escalar, revisa:" : "Valhalla SOC runs on your infrastructure with no live external support. Before escalating, check:"}</p>
            <ul>
              <li>{es ? "El estado de las integraciones (Wazuh, Ollama, base de datos)." : "Integration health (Wazuh, Ollama, database)."}</li>
              <li>{es ? "El log de auditoría, para ver quién hizo qué y cuándo." : "The audit log, to see who did what and when."}</li>
              <li>{es ? "El chat interno: tu equipo o VALHALLA-IA (@ia) pueden ayudarte." : "The internal chat: your team or VALHALLA-IA (@ia) can help."}</li>
            </ul>
            <div className="vp-help__cta-actions">
              <button className="vp-btn vp-btn--primary" onClick={() => { onClose(); onOpenChat(); }}><MessageSquare size={14} />{es ? "Abrir chat" : "Open chat"}</button>
              {isAdmin && <button className="vp-btn" onClick={() => go("health")}><Activity size={14} />{es ? "Estado" : "Health"}</button>}
              {isAdmin && <button className="vp-btn" onClick={() => go("audit")}><ScrollText size={14} />{es ? "Auditoría" : "Audit"}</button>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
