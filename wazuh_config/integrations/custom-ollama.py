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
        "srcip": original_alert.get("data", {}).get("srcip") or original_alert.get("srcip", "N/A"),
        "ai_verdict": ai_analysis
    }
    
    try:
        with open(OLLAMA_LOG_PATH, "a") as f:
            f.write(json.dumps(wazuh_event) + "\n")
        log_debug(f"Análisis guardado exitosamente para alerta {wazuh_event['original_rule_id']}")
    except Exception as e:
        log_debug(f"Error escribiendo log local: {e}")


def query_ollama(description, ip):
    """Consulta a la IA de Ollama local"""
    prompt = f"Eres un analista SOC. Alerta detectada: '{description}' desde IP {ip}. En 2 oraciones: describe el objetivo del ataque y el nivel de amenaza (Bajo/Medio/Alto/Critico). Solo el analisis, sin introducciones."
    
    payload = {
        "model": os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b"),
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 150
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
            return response.json().get('response', 'Análisis no disponible.')
        else:
            log_debug(f"Error HTTP Ollama: {response.status_code}")
            return f"Error consultando Ollama: {response.text}"
    except requests.exceptions.ConnectionError:
        log_debug(f"No se pudo conectar a Ollama en {OLLAMA_HOST}")
        return "El servidor local de IA (Ollama) no responde. Asegúrese de que está corriendo."
    except Exception as e:
        log_debug(f"Excepcion en Ollama: {e}")
        return str(e)


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
    
    # Solo analizar alertas medias/altas para no saturar la IA
    if rule_level >= 5:
        desc = alert.get("rule", {}).get("description", "Unknown")
        ip = alert.get("data", {}).get("srcip") or alert.get("srcip", "Unknown")
        
        log_debug(f"Analizando alerta nivel {rule_level}: {desc} (IP: {ip})")
        
        analysis = query_ollama(desc, ip)
        send_to_wazuh(analysis, alert)
    else:
        log_debug(f"Ignorando alerta nivel {rule_level} (por debajo del umbral de IA).")

if __name__ == "__main__":
    main()
