"""Glosario SOC revisado para anclar las respuestas del asistente IA.

El modelo local (qwen2.5 3B) no es fiable con conceptos básicos: llegó a definir
"blue teamer" como quien simula ataques (eso es red team). Las preguntas de
definición se responden desde aquí sin pasar por el modelo, y en el resto se
le entregan estas definiciones como referencia obligatoria.

Cada entrada: alias (en minúsculas, sin tildes), definición y cómo aparece en Valhalla.
"""
from __future__ import annotations

import re
import unicodedata

GLOSSARY: list[dict[str, object]] = [
    {"term": "Blue team", "aliases": ["blue team", "blue teamer", "blue teamers", "equipo azul"],
     "definition": "Equipo defensivo: protege la organización monitorizando, detectando y respondiendo a incidentes. "
                   "Opera el SOC, gestiona el SIEM, investiga alertas, contiene amenazas y endurece sistemas.",
     "valhalla": "Valhalla SOC es una plataforma de blue team: Wazuh detecta, el Workspace gestiona los incidentes y los informes miden la respuesta."},
    {"term": "Red team", "aliases": ["red team", "red teamer", "red teamers", "equipo rojo"],
     "definition": "Equipo ofensivo autorizado: simula ataques reales (como un adversario) para poner a prueba las defensas, "
                   "las personas y los procesos de la organización.",
     "valhalla": "En el laboratorio el contenedor atacante hace de red team contra el honeypot Cowrie."},
    {"term": "Purple team", "aliases": ["purple team", "purple teaming", "equipo morado"],
     "definition": "Colaboración entre red team y blue team: los ataques simulados se usan en tiempo real para mejorar "
                   "detecciones y respuestas.",
     "valhalla": "Cada ataque del laboratorio se contrasta con las reglas Wazuh y la cobertura MITRE para cerrar huecos de detección."},
    {"term": "SOC", "aliases": ["soc", "security operations center", "centro de operaciones de seguridad"],
     "definition": "Centro de operaciones de seguridad: equipo, procesos y herramientas que vigilan la organización 24/7 "
                   "para detectar, analizar y responder a incidentes.",
     "valhalla": "Valhalla es el panel del SOC: alertas, incidentes, inteligencia e informes en un solo lugar."},
    {"term": "SIEM", "aliases": ["siem", "security information and event management"],
     "definition": "Sistema que centraliza y correlaciona logs y eventos de seguridad de muchas fuentes para generar alertas "
                   "y permitir investigarlas.",
     "valhalla": "El SIEM de Valhalla es Wazuh (manager + indexer); la sección SIEM muestra sus alertas."},
    {"term": "EDR", "aliases": ["edr", "endpoint detection and response"],
     "definition": "Herramienta en los equipos (endpoints) que detecta comportamiento malicioso y permite responder: aislar, "
                   "matar procesos, recoger evidencias.",
     "valhalla": "Los agentes Wazuh cubren parte de esta función (FIM, detección de rootkits, active response)."},
    {"term": "XDR", "aliases": ["xdr", "extended detection and response"],
     "definition": "Evolución del EDR que correlaciona detecciones de endpoints, red, correo, nube e identidad en una sola consola.",
     "valhalla": ""},
    {"term": "IOC", "aliases": ["ioc", "iocs", "indicador de compromiso", "indicadores de compromiso", "indicator of compromise"],
     "definition": "Indicador de compromiso: dato observable que indica una intrusión o actividad maliciosa, como una IP, "
                   "un dominio, un hash de archivo o una URL.",
     "valhalla": "Se gestionan en Threat Intel y se pueden consultar en VirusTotal."},
    {"term": "IOA", "aliases": ["ioa", "indicador de ataque", "indicadores de ataque"],
     "definition": "Indicador de ataque: comportamiento que revela la intención del atacante mientras actúa (p. ej. muchos "
                   "logins fallidos seguidos de uno correcto), independiente de la herramienta usada.",
     "valhalla": "La regla 100113 (login tras fuerza bruta) es un IOA."},
    {"term": "TTP", "aliases": ["ttp", "ttps", "tacticas tecnicas y procedimientos"],
     "definition": "Tácticas, técnicas y procedimientos: la forma de operar de un adversario (qué busca, cómo lo consigue y "
                   "con qué pasos concretos).",
     "valhalla": "Las alertas llevan la técnica MITRE asociada, p. ej. T1110.001 para fuerza bruta."},
    {"term": "MITRE ATT&CK", "aliases": ["mitre", "mitre att&ck", "att&ck", "mitre attack"],
     "definition": "Marco público que clasifica las tácticas y técnicas reales de los atacantes. Sirve para describir ataques "
                   "y medir qué puede detectar una organización (cobertura).",
     "valhalla": "Las reglas Wazuh etiquetan técnicas ATT&CK y los informes muestran las observadas en el periodo."},
    {"term": "CVE", "aliases": ["cve", "cves", "common vulnerabilities and exposures"],
     "definition": "Identificador público y único de una vulnerabilidad conocida (formato CVE-AAAA-NNNNN).",
     "valhalla": "La sección CVE Intel sigue las vulnerabilidades explotadas conocidas (KEV)."},
    {"term": "CVSS", "aliases": ["cvss", "common vulnerability scoring system"],
     "definition": "Sistema estándar que puntúa la gravedad de una vulnerabilidad de 0 a 10 (baja, media, alta, crítica) según "
                   "cómo se explota y su impacto.",
     "valhalla": ""},
    {"term": "KEV", "aliases": ["kev", "known exploited vulnerabilities"],
     "definition": "Catálogo de CISA con las vulnerabilidades que se están explotando activamente; deben priorizarse al parchear.",
     "valhalla": "Es la fuente de CVE Intel."},
    {"term": "Honeypot", "aliases": ["honeypot", "honeypots", "senuelo", "senuelos"],
     "definition": "Sistema señuelo que imita un servicio real para atraer atacantes y registrar lo que hacen, sin exponer "
                   "activos de verdad.",
     "valhalla": "Cowrie simula SSH/Telnet; sus eventos llegan a Wazuh y se ven en Honeypots."},
    {"term": "Threat hunting", "aliases": ["threat hunting", "hunting", "caza de amenazas"],
     "definition": "Búsqueda proactiva de amenazas que no han disparado alertas, partiendo de hipótesis sobre cómo actuaría "
                   "un atacante.",
     "valhalla": "Bifröst ofrece consultas de hunting sobre las alertas."},
    {"term": "Threat intelligence", "aliases": ["threat intelligence", "threat intel", "cti", "inteligencia de amenazas"],
     "definition": "Información analizada sobre amenazas (actores, campañas, IOCs, TTPs) que ayuda a anticipar y priorizar la defensa.",
     "valhalla": "Threat Intel integra MISP, VirusTotal y AbuseIPDB."},
    {"term": "Triaje", "aliases": ["triaje", "triage"],
     "definition": "Primera revisión de una alerta para decidir si es real, su gravedad y su prioridad antes de investigarla a fondo.",
     "valhalla": "Se hace desde SIEM, escalando a incidente con el botón INC."},
    {"term": "Falso positivo", "aliases": ["falso positivo", "falsos positivos", "false positive"],
     "definition": "Alerta que se dispara sin que exista una amenaza real. Un falso negativo es lo contrario: un ataque que no genera alerta.",
     "valhalla": "Al cerrar un incidente se clasifica como verdadero positivo, falso positivo o benigno."},
    {"term": "MTTD / MTTR", "aliases": ["mttr", "mttd", "tiempo medio de resolucion", "tiempo medio de deteccion"],
     "definition": "MTTD: tiempo medio hasta detectar un incidente. MTTR: tiempo medio hasta resolverlo. Miden la eficacia del SOC.",
     "valhalla": "El MTTR real se calcula con la fecha de resolución de cada incidente y aparece en los informes."},
    {"term": "Playbook / runbook", "aliases": ["playbook", "playbooks", "runbook", "runbooks"],
     "definition": "Procedimiento documentado paso a paso para responder a un tipo de incidente de forma consistente.",
     "valhalla": "La sección Runbooks los guarda y el Workspace los sugiere por incidente."},
    {"term": "DFIR", "aliases": ["dfir", "forense", "analisis forense", "respuesta a incidentes"],
     "definition": "Análisis forense digital y respuesta a incidentes: investigar qué pasó, recoger evidencias y recuperar la normalidad.",
     "valhalla": "Las evidencias llevan huella SHA-256 y autor para la cadena de custodia."},
    {"term": "Cadena de custodia", "aliases": ["cadena de custodia", "chain of custody"],
     "definition": "Registro que prueba quién recogió, manejó y guardó cada evidencia y que no se ha alterado.",
     "valhalla": "Cada evidencia guarda su SHA-256, quién la subió y cuándo, y se puede verificar."},
    {"term": "TLP", "aliases": ["tlp", "traffic light protocol"],
     "definition": "Protocolo del semáforo (FIRST TLP 2.0) que marca con qué libertad se puede compartir una información: "
                   "CLEAR (pública), GREEN (comunidad), AMBER (organización) y RED (solo destinatarios).",
     "valhalla": "Cada informe lleva su clasificación TLP."},
    {"term": "Fuerza bruta", "aliases": ["fuerza bruta", "brute force", "bruteforce"],
     "definition": "Ataque que prueba muchas contraseñas o combinaciones hasta acertar (MITRE T1110).",
     "valhalla": "Las reglas 100111 y 100113 detectan fuerza bruta contra el honeypot y el acceso posterior."},
    {"term": "Movimiento lateral", "aliases": ["movimiento lateral", "lateral movement"],
     "definition": "Técnicas con las que un atacante que ya está dentro salta a otros equipos de la red (táctica TA0008 de MITRE).",
     "valhalla": ""},
    {"term": "Ransomware", "aliases": ["ransomware"],
     "definition": "Malware que cifra o roba datos y exige un rescate para recuperarlos o no publicarlos.",
     "valhalla": ""},
    {"term": "Phishing", "aliases": ["phishing"],
     "definition": "Engaño (normalmente por correo) para que la víctima entregue credenciales, abra un adjunto malicioso o haga un pago.",
     "valhalla": ""},
    {"term": "Zero trust", "aliases": ["zero trust", "confianza cero"],
     "definition": "Modelo de seguridad que no confía por defecto en nada ni nadie, dentro o fuera de la red: verifica siempre "
                   "identidad, dispositivo y permisos.",
     "valhalla": ""},
    {"term": "Mínimo privilegio", "aliases": ["minimo privilegio", "least privilege", "principio de minimo privilegio"],
     "definition": "Cada usuario o proceso tiene solo los permisos imprescindibles para su tarea.",
     "valhalla": "Los roles admin, analista y lector limitan qué puede ver y hacer cada usuario."},
    {"term": "ENS", "aliases": ["ens", "esquema nacional de seguridad"],
     "definition": "Esquema Nacional de Seguridad (RD 311/2022): marco obligatorio en España para el sector público y sus "
                   "proveedores, con medidas según la categoría del sistema (básica, media, alta).",
     "valhalla": "Los informes evalúan medidas ENS (op.mon, op.exp…) con evidencias del sistema."},
    {"term": "ISO/IEC 27001", "aliases": ["iso 27001", "iso27001", "27001"],
     "definition": "Norma internacional para gestionar la seguridad de la información (SGSI); su Anexo A (2022) recoge 93 controles.",
     "valhalla": "Los informes evalúan controles del Anexo A, p. ej. A.8.16 monitorización."},
    {"term": "NIS2", "aliases": ["nis2", "nis 2"],
     "definition": "Directiva europea (UE) 2022/2555 que obliga a entidades esenciales e importantes a gestionar riesgos de "
                   "ciberseguridad y notificar incidentes graves (aviso inicial en 24 h).",
     "valhalla": ""},
    {"term": "RGPD", "aliases": ["rgpd", "gdpr"],
     "definition": "Reglamento General de Protección de Datos (UE) 2016/679; exige proteger los datos personales y notificar "
                   "brechas a la autoridad en 72 horas.",
     "valhalla": "La retención de alertas se limita en el tiempo (art. 5.1.e) y los mensajes privados solo los ven sus participantes."},
]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", text)


def find_terms(question: str, limit: int = 3) -> list[dict[str, object]]:
    """Entradas del glosario mencionadas en la pregunta (alias como palabra completa)."""
    q = f" {_norm(question)} "
    hits = []
    for entry in GLOSSARY:
        for alias in entry["aliases"]:  # type: ignore[union-attr]
            if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", q):
                hits.append(entry)
                break
    return hits[:limit]


_DEFINITION_Q = re.compile(r"\b(que|quien|quienes)\s+(es|son|significa|hace|hacen)\b|\bdefin|\bexplica\w*\s+(que|el|la|los|las)\b|\bdiferencia")


def is_definition_question(question: str) -> bool:
    return bool(_DEFINITION_Q.search(_norm(question)))


def format_entry(entry: dict[str, object]) -> str:
    text = f"{entry['term']}: {entry['definition']}"
    if entry.get("valhalla"):
        text += f" En Valhalla: {entry['valhalla']}"
    return text


def definition_answer(question: str) -> str | None:
    """Respuesta directa y verificada para preguntas de definición ("¿qué es un blue teamer?")."""
    if not is_definition_question(question):
        return None
    hits = find_terms(question)
    if not hits:
        return None
    return "\n\n".join(format_entry(h) for h in hits) + "\n\n(Fuente: glosario SOC de Valhalla.)"


def reference_block(question: str) -> str:
    """Definiciones relevantes para inyectar como contexto obligatorio en el prompt."""
    hits = find_terms(question)
    return "\n".join(f"- {format_entry(h)}" for h in hits)
