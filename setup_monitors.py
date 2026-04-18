#!/usr/bin/env python3
"""
Crea monitores y disparadores (triggers) en OpenSearch Alerting.
Detecta condiciones críticas en tiempo real y genera notificaciones.
"""
import json, requests, urllib3
urllib3.disable_warnings()

BASE  = "https://localhost:9200"
AUTH  = ("admin", "admin")
H     = {"Content-Type": "application/json"}

def api(method, path, data=None):
    r = getattr(requests, method)(
        f"{BASE}{path}", json=data, headers=H, auth=AUTH, verify=False
    )
    try:
        return r.json()
    except Exception:
        return {"status_code": r.status_code, "text": r.text}

# ─── Crear canal de notificaciones (log channel) ────────────────────────────
print("Configurando canal de notificaciones...")
channel_r = api("post", "/_plugins/_notifications/configs", {
    "config_id": "valhalla-soc-log-channel",
    "config": {
        "name": "Valhalla SOC - Log Channel",
        "description": "Canal de notificaciones para alertas SOC (log interno)",
        "config_type": "chime",
        "is_enabled": True,
        "chime": {
            "url": "http://localhost:9200/_plugins/_alerting/alerts"
        }
    }
})
# Nota: chime es un webhook genérico; si falla por URL inválida usamos custom_webhook
if "error" in str(channel_r) or channel_r.get("status", 200) >= 400:
    # Fallback: crear canal tipo custom_webhook apuntando a localhost (no-op)
    channel_r = api("post", "/_plugins/_notifications/configs", {
        "config_id": "valhalla-soc-log-channel",
        "config": {
            "name": "Valhalla SOC - Log Channel",
            "description": "Webhook de notificaciones SOC",
            "config_type": "custom_webhook",
            "is_enabled": True,
            "custom_webhook": {
                "url": "http://wazuh.manager:55000/",
                "header_params": {"Content-Type": "application/json"},
                "method": "POST"
            }
        }
    })
print(f"  Canal: {channel_r.get('config_id', channel_r.get('_id', channel_r))}")

# ─── Definición de monitores ─────────────────────────────────────────────────
MONITORS = [
    # ── 1. Brute Force SSH ──────────────────────────────────────────────────
    {
        "name": "Cowrie - Brute Force SSH Detectado",
        "monitor_id": "valhalla-brute-force-monitor",
        "description": "Alerta cuando se detectan 3+ eventos de brute force en 5 minutos",
        "query": {
            "query": {"bool": {"must": [
                {"match": {"rule.id": "100111"}},
                {"range": {"timestamp": {"gte": "now-5m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Brute Force Alto Volumen",
                "id": "bf-trigger-critical",
                "severity": "1",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 3"}},
                "actions": []
            },
            {
                "name": "Brute Force Detectado",
                "id": "bf-trigger-warning",
                "severity": "2",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 1"}},
                "actions": []
            }
        ]
    },

    # ── 2. Login exitoso en honeypot ────────────────────────────────────────
    {
        "name": "Cowrie - Login Exitoso en Honeypot",
        "monitor_id": "valhalla-login-success-monitor",
        "description": "CRITICO: Alguien logro autenticarse en el honeypot",
        "query": {
            "query": {"bool": {"must": [
                {"match": {"rule.id": "100112"}},
                {"range": {"timestamp": {"gte": "now-10m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Honeypot Comprometido - CRITICO",
                "id": "login-trigger-critical",
                "severity": "1",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 1"}},
                "actions": []
            }
        ]
    },

    # ── 3. Descarga de malware ───────────────────────────────────────────────
    {
        "name": "Cowrie - Descarga de Malware",
        "monitor_id": "valhalla-malware-download-monitor",
        "description": "Alerta cuando un atacante intenta descargar malware (wget/curl/tftp)",
        "query": {
            "query": {"bool": {"must": [
                {"terms": {"rule.id": ["100130", "100131"]}},
                {"range": {"timestamp": {"gte": "now-15m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Descarga Malware Detectada",
                "id": "malware-trigger-critical",
                "severity": "1",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 1"}},
                "actions": []
            }
        ]
    },

    # ── 4. Reverse shell ────────────────────────────────────────────────────
    {
        "name": "Cowrie - Reverse Shell / C2",
        "monitor_id": "valhalla-reverse-shell-monitor",
        "description": "Maximo nivel: intento de reverse shell o conexion C2",
        "query": {
            "query": {"bool": {"must": [
                {"match": {"rule.id": "100140"}},
                {"range": {"timestamp": {"gte": "now-10m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Reverse Shell - NIVEL MAXIMO",
                "id": "revshell-trigger",
                "severity": "1",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 1"}},
                "actions": []
            }
        ]
    },

    # ── 5. Evasión de defensa ────────────────────────────────────────────────
    {
        "name": "Cowrie - Evasion de Defensa",
        "monitor_id": "valhalla-defense-evasion-monitor",
        "description": "Intento de deshabilitar firewall, limpiar logs o escalar privilegios",
        "query": {
            "query": {"bool": {"must": [
                {"terms": {"rule.id": ["100150", "100170", "100180"]}},
                {"range": {"timestamp": {"gte": "now-15m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Evasion de Defensa Detectada",
                "id": "evasion-trigger",
                "severity": "1",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 1"}},
                "actions": []
            }
        ]
    },

    # ── 6. Volumen alto de alertas (anomalia) ────────────────────────────────
    {
        "name": "Cowrie - Volumen Anomalo de Alertas",
        "monitor_id": "valhalla-high-volume-monitor",
        "description": "Detecta campanas de ataque masivo: 50+ eventos Cowrie en 10 min",
        "query": {
            "query": {"bool": {"must": [
                {"match": {"rule.groups": "cowrie"}},
                {"range": {"timestamp": {"gte": "now-10m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Ataque Masivo - Critico",
                "id": "volume-trigger-critical",
                "severity": "1",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 50"}},
                "actions": []
            },
            {
                "name": "Actividad Elevada - Advertencia",
                "id": "volume-trigger-warning",
                "severity": "3",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 20"}},
                "actions": []
            }
        ]
    },

    # ── 7. Persistencia (cron/systemctl) ────────────────────────────────────
    {
        "name": "Cowrie - Mecanismo de Persistencia",
        "monitor_id": "valhalla-persistence-monitor",
        "description": "Alerta cuando un atacante intenta establecer persistencia",
        "query": {
            "query": {"bool": {"must": [
                {"match": {"rule.id": "100160"}},
                {"range": {"timestamp": {"gte": "now-15m", "lte": "now"}}}
            ]}}
        },
        "triggers": [
            {
                "name": "Persistencia Detectada",
                "id": "persistence-trigger",
                "severity": "2",
                "condition": {"script": {"lang": "painless",
                              "source": "ctx.results[0].hits.total.value >= 1"}},
                "actions": []
            }
        ]
    },
]

# ─── Crear monitores ─────────────────────────────────────────────────────────
print("\nCreando monitores y disparadores...")
created = 0
for mon in MONITORS:
    mid = mon["monitor_id"]

    # Buscar si ya existe
    search_r = api("post", "/_plugins/_alerting/monitors/_search", {
        "query": {"term": {"monitor.name.keyword": mon["name"]}}
    })
    existing_hits = search_r.get("hits", {}).get("hits", [])

    # Borrar si existe
    for hit in existing_hits:
        api("delete", f"/_plugins/_alerting/monitors/{hit['_id']}")

    # Construir el objeto monitor completo
    monitor_body = {
        "type": "monitor",
        "name": mon["name"],
        "monitor_type": "query_level_monitor",
        "enabled": True,
        "schedule": {
            "period": {"interval": 5, "unit": "MINUTES"}
        },
        "inputs": [{
            "search": {
                "indices": ["wazuh-alerts-*"],
                "query": mon["query"]
            }
        }],
        "triggers": [
            {
                "query_level_trigger": {
                    "id": t["id"],
                    "name": t["name"],
                    "severity": t["severity"],
                    "condition": t["condition"],
                    "actions": t["actions"]
                }
            }
            for t in mon["triggers"]
        ]
    }

    r = api("post", "/_plugins/_alerting/monitors", monitor_body)
    if "_id" in r:
        print(f"  OK [{mid}] id={r['_id']} - {len(mon['triggers'])} disparadores")
        created += 1
    else:
        print(f"  ERR [{mid}]: {r.get('error', r)}")

print(f"\n{created}/{len(MONITORS)} monitores creados")

# ─── Verificar estado del alerting ──────────────────────────────────────────
print("\nVerificando estado del sistema de alertas...")
status = api("get", "/_plugins/_alerting/monitors/_search?size=20")
total = status.get("hits", {}).get("total", {}).get("value", 0)
print(f"  Total monitores activos: {total}")

print("\n" + "="*60)
print("MONITORES CONFIGURADOS:")
print("="*60)
for mon in MONITORS:
    print(f"\n  {mon['name']}")
    print(f"    Descripcion: {mon['description']}")
    print(f"    Disparadores: {len(mon['triggers'])}")
    for t in mon["triggers"]:
        sev_map = {"1": "CRITICO", "2": "ALTO", "3": "MEDIO", "4": "BAJO"}
        print(f"      - [{sev_map.get(t['severity'],'?')}] {t['name']}")

print("\nVer alertas activas: https://localhost/app/alerting")
print("Ver historial:       https://localhost/app/alerting#/dashboard")
