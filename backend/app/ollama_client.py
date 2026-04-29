from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.settings import settings

logger = logging.getLogger("valhalla.ollama")

Severity = Literal["low", "medium", "high", "critical"]


SYSTEM_PROMPT = (
    "Eres un Analista Senior de SOC con mas de 10 anos de experiencia, experto en deteccion de amenazas y respuesta ante incidentes. "
    "Tu objetivo es analizar telemetria de Wazuh y Cowrie para proporcionar inteligencia accionable. "
    "Debes clasificar la alerta segun la categoria de evento, identificar tecnicas MITRE ATT&CK si es posible, "
    "y dar una recomendacion tactica clara para el operador de turno. "
    "Responde UNICAMENTE con un objeto JSON valido con estas claves: "
    "attack_type (categoria/tipo de ataque), severity (low, medium, high, critical), "
    "summary (resumen ejecutivo en espanol), recommended_action (pasos de mitigacion en espanol). "
    "IMPORTANTE: No uses acentos ni caracteres especiales, solo ASCII plano."
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
        "summary": "No se pudo completar el analisis IA. Se devuelve un resultado por defecto para no interrumpir la demo.",
        "recommended_action": "Revisar la alerta en el SIEM, correlacionar con eventos cercanos y aplicar medidas de contencion basicas (bloqueo IP / rate limit) si procede.",
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
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        val = json.loads(m.group(0))
        return val if isinstance(val, dict) else None
    except Exception:
        return None


def _normalize_analysis(obj: dict[str, Any], alert_id: int) -> dict[str, Any] | None:
    required = {"attack_type", "severity", "summary", "recommended_action"}
    if not required.issubset(obj.keys()):
        return None

    severity = str(obj.get("severity", "")).strip().lower()
    if severity not in {"low", "medium", "high", "critical"}:
        return None

    def _ascii_text(value: Any) -> str:
        text = str(value).strip()
        # Keep output console-friendly on Windows terminals with legacy code pages.
        return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")

    return {
        "alert_id": alert_id,
        "attack_type": _ascii_text(obj["attack_type"]) or "unknown",
        "severity": severity,
        "summary": _ascii_text(obj["summary"]),
        "recommended_action": _ascii_text(obj["recommended_action"]),
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

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(chat_url, json=chat_payload)
            if r.status_code == 404:
                # Some Ollama builds expose /api/generate but not /api/chat.
                gen_payload = {
                    "model": settings.ollama_model,
                    "stream": False,
                    "options": {"temperature": float(settings.ollama_temperature)},
                    "prompt": (
                        SYSTEM_PROMPT
                        + "\nReturn ONLY the required JSON. Write summary and recommended_action in Spanish "
                        + "using plain ASCII only (no accents or special characters).\n"
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

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(f"{settings.ollama_base_url.rstrip('/')}/api/chat", json=chat_payload)
            r.raise_for_status()
            body = r.json()
            return body.get("message", {}).get("content", "Error generando resumen ejecutivo.").strip()
    except Exception as e:
        logger.warning("Ollama report generation failed: %s", e)
        return "El sistema de IA no esta disponible para generar el resumen en este momento. Se recomienda revisar las metricas tecnicas adjuntas."

