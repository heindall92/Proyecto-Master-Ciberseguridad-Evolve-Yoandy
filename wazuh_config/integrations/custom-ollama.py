#!/var/ossec/framework/python/bin/python3
# ═══════════════════════════════════════════════════════════
# Valhalla SOC — Official Wazuh Custom Integration for Ollama
# ═══════════════════════════════════════════════════════════

import sys
import json
import requests
from datetime import datetime
import os

# Archivo donde guardaremos el análisis de la IA para que Wazuh lo lea
OLLAMA_LOG_PATH = "/var/ossec/logs/ollama-analysis.json"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")

# Logs internos de debug de la integración
DEBUG_LOG = "/var/ossec/logs/integrations.log"

def log_debug(message):
    try:
        with open(DEBUG_LOG, "a") as f:
            f.write(f"{datetime.now().isoformat()} | custom-ollama | {message}\n")
    except:
        pass


def source_ip(alert):
    """IP origen: Wazuh usa data.srcip y Cowrie data.src_ip. Devuelve None si no hay."""
    data = alert.get("data", {}) or {}
    return data.get("srcip") or data.get("src_ip") or alert.get("srcip") or None


def send_to_wazuh(ai_analysis, original_alert):
    """
    Escribe el análisis como un log JSON que Wazuh leerá automáticamente
    a través de su configuración de <localfile>.
    """
    wazuh_event = {
        "integration": "ollama_ai",
        "timestamp": datetime.now().isoformat(),
        "original_rule_id": original_alert.get("rule", {}).get("id", "0"),
        "original_description": original_alert.get("rule", {}).get("description", "N/A"),
        "ai_verdict": ai_analysis
    }
    ip = source_ip(original_alert)
    if ip:
        wazuh_event["srcip"] = ip
    
    try:
        with open(OLLAMA_LOG_PATH, "a") as f:
            f.write(json.dumps(wazuh_event) + "\n")
        log_debug(f"Análisis guardado exitosamente para alerta {wazuh_event['original_rule_id']}")
    except Exception as e:
        log_debug(f"Error escribiendo log local: {e}")


def query_ollama(alert):
    """Consulta a la IA de Ollama local con contexto expandido"""
    desc = alert.get("rule", {}).get("description", "Unknown")
    ip = source_ip(alert) or "desconocida"
    full_log = alert.get("full_log", "")
    data = alert.get("data", {})
    
    prompt = (
        f"Eres un analista SOC Senior. Alerta detectada: '{desc}'\n"
        f"IP Origen: {ip}\n"
        f"Datos adicionales: {json.dumps(data)}\n"
        f"Log completo: {full_log}\n\n"
        "Analiza esta alerta y describe en 2 oraciones:\n"
        "1. El objetivo probable del atacante.\n"
        "2. El nivel de amenaza (Bajo/Medio/Alto/Critico).\n"
        "Se directo y tecnico."
    )
    
    payload = {
        "model": os.getenv("OLLAMA_MODEL", "qwen2.5:3b-instruct"),
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_predict": 200
        }
    }
    
    log_debug(f"Consultando Ollama en {OLLAMA_HOST}...")
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json=payload,
            timeout=15
        )
        if response.status_code == 200:
            return (response.json().get("response") or "").strip() or None
        log_debug(f"Error HTTP Ollama {response.status_code}: {response.text[:300]}")
    except requests.exceptions.ConnectionError:
        log_debug(f"No se pudo conectar a Ollama en {OLLAMA_HOST}")
    except Exception as e:
        log_debug(f"Excepcion en Ollama: {e}")
    # Los fallos NO se convierten en eventos de Wazuh (antes generaban miles de alertas de error)
    return None


def main():
    if len(sys.argv) < 2:
        log_debug("Falta el argumento del archivo de alerta de Wazuh.")
        sys.exit(1)

    alert_file = sys.argv[1]

    try:
        with open(alert_file, "r") as f:
            alert = json.load(f)
    except Exception as e:
        log_debug(f"Error leyendo el archivo de alerta {alert_file}: {e}")
        sys.exit(1)

    rule_level = alert.get("rule", {}).get("level", 0)
    groups = alert.get("rule", {}).get("groups", []) or []

    # Nunca analizar las alertas que genera la propia IA: evitaba un bucle de retroalimentación
    if "ai_analysis" in groups or alert.get("data", {}).get("integration") == "ollama_ai":
        log_debug("Ignorando alerta generada por la integración de IA.")
        return

    # Solo analizar alertas medias/altas para no saturar la IA
    if rule_level >= 5:
        desc = alert.get("rule", {}).get("description", "Unknown")
        log_debug(f"Analizando alerta nivel {rule_level}: {desc} (IP: {source_ip(alert) or '-'})")
        analysis = query_ollama(alert)
        if analysis:
            send_to_wazuh(analysis, alert)
    else:
        log_debug(f"Ignorando alerta nivel {rule_level} (por debajo del umbral de IA).")

if __name__ == "__main__":
    main()
