from __future__ import annotations

import json
import logging
import re
import unicodedata

_EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000026FF\U00002700-\U000027BF\U00002B00-\U00002BFF\U0001F1E6-\U0001F1FF️‍]"
)


def _strip_emojis(text: str) -> str:
    return re.sub(r"  +", " ", _EMOJI_RE.sub("", text or "")).strip()
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.settings import settings

logger = logging.getLogger("valhalla.ollama")
_client_instance: httpx.AsyncClient | None = None

def get_ollama_client() -> httpx.AsyncClient:
    global _client_instance
    if _client_instance is None or _client_instance.is_closed:
        _client_instance = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.ollama_timeout_seconds),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5)
        )
    return _client_instance

Severity = Literal["low", "medium", "high", "critical"]


SYSTEM_PROMPT = (
    "Eres un Analista Senior de SOC con mas de 10 años de experiencia, experto en deteccion de amenazas y respuesta ante incidentes. "
    "Tu objetivo es analizar telemetria de Wazuh y Cowrie para proporcionar TRIAGE ACCIONABLE Y ESTRUCTURADO. "
    "Responde UNICAMENTE con un objeto JSON valido con EXACTAMENTE estas claves: "
    "attack_type (categoria/tipo de ataque), "
    "severity (uno de: low, medium, high, critical), "
    "risk_score (entero 0-100 que cuantifica el riesgo real del incidente), "
    "mitre_ttp (lista de IDs MITRE ATT&CK como [\"T1110\",\"T1059\"], vacia si no aplica), "
    "false_positive_likelihood (uno de: low, medium, high — probabilidad de que sea falso positivo), "
    "summary (resumen ejecutivo en español, ASCII), "
    "recommended_action (pasos de mitigacion especificos en español, ASCII), "
    "cited_runbooks (lista de nombres EXACTOS de los runbooks del bloque 'knowledge' que aplican, vacia si ninguno). "
    "Si el contexto incluye un bloque 'knowledge' con runbooks y tecnicas MITRE, BASA tu recommended_action en "
    "esos procedimientos reales y cita sus nombres en cited_runbooks. "
    "IMPORTANTE: respuestas tecnicas, precisas y directas. El risk_score debe ser coherente con la severity "
    "(low~0-30, medium~30-60, high~60-85, critical~85-100)."
)

SYSTEM_PROMPT_REPORT = (
    "Eres un CISO (Chief Information Security Officer) redactando un reporte ejecutivo mensual para la directiva. "
    "Tu objetivo es resumir el estado de seguridad de la infraestructura basandote en las metricas proporcionadas. "
    "Debes sonar profesional, directo y enfocado en el riesgo de negocio. "
    "Proporciona un resumen de 3-4 parrafos que cubra: 1. Estado general, 2. Amenazas principales detectadas, "
    "3. Eficacia de la monitorizacion y 4. Recomendacion estrategica. "
    "Responde UNICAMENTE con el texto del resumen en espanol, sin formato markdown complejo, solo texto plano ASCII."
)


def _fallback(alert_id: int) -> dict[str, Any]:
    return {
        "alert_id": alert_id,
        "attack_type": "unknown",
        "severity": "medium",
        "risk_score": 50,
        "mitre_ttp": [],
        "false_positive_likelihood": "medium",
        "summary": "No se pudo completar el analisis IA. Se devuelve un resultado por defecto para no interrumpir la demo.",
        "recommended_action": "Revisar la alerta en el SIEM, correlacionar con eventos cercanos y aplicar medidas de contencion basicas (bloqueo IP / rate limit) si procede.",
        "cited_runbooks": [],
        "raw_response": None,
    }


def _extract_first_json_object(text: str) -> dict[str, Any] | None:
    """
    Ollama/models sometimes return extra text. We try to extract the first {...} block.
    This is intentionally simple for demo robustness.
    """
    text = text.strip()
    if not text:
        return None

    # Fast path: whole text is JSON
    try:
        val = json.loads(text)
        return val if isinstance(val, dict) else None
    except Exception:
        pass

    # Extract first JSON object heuristically
    try:
        # Look for the first '{' and the last '}'
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = text[start:end+1]
            val = json.loads(json_str)
            return val if isinstance(val, dict) else None
    except Exception:
        pass
    
    return None


_SEVERITY_DEFAULT_RISK = {"low": 25, "medium": 50, "high": 75, "critical": 95}


def _normalize_analysis(obj: dict[str, Any], alert_id: int) -> dict[str, Any] | None:
    required = {"attack_type", "severity", "summary", "recommended_action"}
    if not required.issubset(obj.keys()):
        return None

    severity = str(obj.get("severity", "")).strip().lower()
    if severity not in {"low", "medium", "high", "critical"}:
        return None

    def _clean_text(value: Any) -> str:
        text = str(value).strip()
        # Remove markdown bold/italic if model included it in JSON values
        text = re.sub(r'[*_`]', '', text)
        return text

    # risk_score: entero 0-100; si falta o es inválido, derivar de la severity
    try:
        risk_score = int(float(obj.get("risk_score")))
        risk_score = max(0, min(100, risk_score))
    except (TypeError, ValueError):
        risk_score = _SEVERITY_DEFAULT_RISK[severity]

    # mitre_ttp: lista de IDs tipo T1110 (acepta string o lista); default []
    raw_ttp = obj.get("mitre_ttp", [])
    if isinstance(raw_ttp, str):
        raw_ttp = re.split(r"[,\s]+", raw_ttp)
    mitre_ttp = sorted({
        t.strip().upper() for t in (raw_ttp or [])
        if isinstance(t, str) and re.match(r"^T\d{4}(\.\d{3})?$", t.strip().upper())
    })

    fp = str(obj.get("false_positive_likelihood", "low")).strip().lower()
    if fp not in {"low", "medium", "high"}:
        fp = "low"

    raw_cited = obj.get("cited_runbooks", [])
    if isinstance(raw_cited, str):
        raw_cited = [raw_cited]
    cited_runbooks = [str(c).strip() for c in (raw_cited or []) if str(c).strip()][:5]

    return {
        "alert_id": alert_id,
        "attack_type": _clean_text(obj.get("attack_type", "unknown")),
        "severity": severity,
        "risk_score": risk_score,
        "mitre_ttp": mitre_ttp,
        "false_positive_likelihood": fp,
        "summary": _clean_text(obj.get("summary", "N/A")),
        "recommended_action": _clean_text(obj.get("recommended_action", "N/A")),
        "cited_runbooks": cited_runbooks,
        "raw_response": obj,
    }


@dataclass(frozen=True)
class OllamaResult:
    ok: bool
    data: dict[str, Any]


async def analyze_alert(alert_id: int, context: dict[str, Any]) -> OllamaResult:
    chat_payload = {
        "model": settings.ollama_model,
        "stream": False,
        "options": {"temperature": float(settings.ollama_temperature)},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Analyze this alert context and respond with the required JSON only. "
                    "Write summary and recommended_action in Spanish using plain ASCII only "
                    "(no accents or special characters).\n"
                    + json.dumps(context, ensure_ascii=False)
                ),
            },
        ],
    }

    timeout = httpx.Timeout(settings.ollama_timeout_seconds)
    base = settings.ollama_base_url.rstrip("/")
    chat_url = f"{base}/api/chat"
    gen_url = f"{base}/api/generate"

    client = get_ollama_client()
    try:
        r = await client.post(chat_url, json=chat_payload)
        if r.status_code == 404:
            # Some Ollama builds expose /api/generate but not /api/chat.
            gen_payload = {
                "model": settings.ollama_model,
                "stream": False,
                "options": {"temperature": float(settings.ollama_temperature)},
                "prompt": (
                    SYSTEM_PROMPT
                    + "\nReturn ONLY the required JSON. Write summary and recommended_action in Spanish.\n"
                    + json.dumps(context, ensure_ascii=False)
                ),
            }
            r = await client.post(gen_url, json=gen_payload)
        r.raise_for_status()
        body = r.json()

        # Ollama chat: { message: { content } } ; generate: { response }
        content: Any = None
        if isinstance(body, dict):
            if isinstance(body.get("message"), dict):
                content = (body.get("message") or {}).get("content")
            if content is None:
                content = body.get("response")
        if not isinstance(content, str):
            logger.warning("Ollama response missing message.content: %s", body)
            return OllamaResult(ok=False, data=_fallback(alert_id))

        extracted = _extract_first_json_object(content)
        if not extracted:
            logger.warning("Could not extract JSON from model output: %s", content)
            return OllamaResult(ok=False, data=_fallback(alert_id))

        normalized = _normalize_analysis(extracted, alert_id)
        if not normalized:
            logger.warning("Model JSON invalid shape: %s", extracted)
            return OllamaResult(ok=False, data=_fallback(alert_id))

        return OllamaResult(ok=True, data=normalized)

    except Exception as e:
        logger.warning("Ollama analyze failed: %s", e, exc_info=True)
        return OllamaResult(ok=False, data=_fallback(alert_id))


SYSTEM_PROMPT_CHAT = (
    "Eres VALHALLA-IA, un asistente integrado en el chat interno de un SOC (Security Operations Center). "
    "Respondes a los analistas de forma BREVE (máximo 4-5 frases), técnica y útil, en español. "
    "Ayudas con dudas de seguridad, interpretación de alertas, comandos, MITRE ATT&CK y procedimientos de respuesta. "
    "Si no estás seguro de algo, dilo claramente. No inventes datos."
)


async def chat_assistant(question: str, history: list[dict[str, str]] | None = None) -> str:
    """Asistente IA conversacional para el chat interno del SOC (texto plano)."""
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT_CHAT}]
    for h in (history or [])[-6:]:
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    messages.append({"role": "user", "content": question})

    base = settings.ollama_base_url.rstrip("/")
    client = get_ollama_client()
    try:
        r = await client.post(f"{base}/api/chat", json={
            "model": settings.ollama_model, "stream": False,
            "options": {"temperature": 0.4}, "messages": messages,
        })
        if r.status_code == 404:
            r = await client.post(f"{base}/api/generate", json={
                "model": settings.ollama_model, "stream": False,
                "options": {"temperature": 0.4},
                "prompt": SYSTEM_PROMPT_CHAT + "\n\nAnalista: " + question + "\nVALHALLA-IA:",
            })
        r.raise_for_status()
        body = r.json()
        content = (body.get("message") or {}).get("content") if isinstance(body.get("message"), dict) else None
        content = content or body.get("response") or ""
        return content.strip() or "No tengo una respuesta en este momento."
    except Exception as e:
        logger.warning("chat_assistant failed: %s", e)
        return "El asistente IA no está disponible ahora mismo (¿modelo Ollama cargado?)."


SYSTEM_PROMPT_SOCIAL = (
    "Eres el responsable de divulgación técnica de un SOC. Redacta un post profesional para LinkedIn "
    "en español que difunda las vulnerabilidades CVE más relevantes para una audiencia de ciberseguridad. "
    "Tono profesional y claro, 120-180 palabras. Incluye 3-5 hashtags al final (por ejemplo #Ciberseguridad #CVE). "
    "Usa SOLO los CVE proporcionados, no inventes datos. NO uses emojis."
)


async def draft_social_post(cves: list[dict[str, Any]]) -> str:
    """Redacta un borrador de post de redes (LinkedIn) sobre los CVE dados. NO publica."""
    lines = "\n".join(
        f"- {c.get('id')} [{c.get('severity','')}{', ransomware' if c.get('ransomware') else ''}]"
        f" {c.get('product','')}: {str(c.get('summary',''))[:200]}"
        for c in (cves or [])[:5]
    ) or "Sin CVEs recientes."
    base = settings.ollama_base_url.rstrip("/")
    client = get_ollama_client()
    payload = {
        "model": settings.ollama_model, "stream": False, "options": {"temperature": 0.6},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_SOCIAL},
            {"role": "user", "content": f"CVEs destacados de hoy:\n{lines}\n\nRedacta el post de LinkedIn."},
        ],
    }
    try:
        r = await client.post(f"{base}/api/chat", json=payload)
        if r.status_code == 404:
            r = await client.post(f"{base}/api/generate", json={
                "model": settings.ollama_model, "stream": False, "options": {"temperature": 0.6},
                "prompt": SYSTEM_PROMPT_SOCIAL + f"\n\nCVEs:\n{lines}\n\nPost:",
            })
        r.raise_for_status()
        body = r.json()
        content = (body.get("message") or {}).get("content") if isinstance(body.get("message"), dict) else None
        return _strip_emojis(content or body.get("response") or "") or "No se pudo redactar el post."
    except Exception as e:
        logger.warning("draft_social_post failed: %s", e)
        return "El generador de posts IA no está disponible ahora mismo (¿modelo Ollama cargado?)."


async def generate_executive_summary(metrics_context: dict[str, Any]) -> str:
    """Generates a high-level executive report summary using Ollama."""
    chat_payload = {
        "model": settings.ollama_model,
        "stream": False,
        "options": {"temperature": 0.5},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_REPORT},
            {
                "role": "user",
                "content": f"Basado en estas metricas de seguridad del SOC:\n{json.dumps(metrics_context, indent=2)}\nRedacta el resumen ejecutivo."
            },
        ],
    }

    client = get_ollama_client()
    try:
        r = await client.post(f"{settings.ollama_base_url.rstrip('/')}/api/chat", json=chat_payload, timeout=60.0)
        r.raise_for_status()
        body = r.json()
        return body.get("message", {}).get("content", "Error generando resumen ejecutivo.").strip()
    except Exception as e:
        logger.warning("Ollama report generation failed: %s", e)
        return "El sistema de IA no esta disponible para generar el resumen en este momento. Se recomienda revisar las metricas tecnicas adjuntas."

