#!/usr/bin/env python3
"""
Configura definiciones de reportes SOC en Wazuh via API REST.
Crea scheduled reports para Cowrie Honeypot, Security Events y MITRE ATT&CK.
"""
import json, requests, urllib3, sys
urllib3.disable_warnings()

WAZUH_API = "https://localhost:55000"
DASHBOARD  = "https://localhost"
API_AUTH   = ("wazuh-wui", "wazuh-wui")
DASH_AUTH  = ("admin", "admin")
H_API      = {"Content-Type": "application/json"}
H_DASH     = {"Content-Type": "application/json", "osd-xsrf": "true"}

def wazuh_token():
    r = requests.get(f"{WAZUH_API}/security/user/authenticate",
                     auth=API_AUTH, verify=False)
    return r.json()["data"]["token"]

def wapi(method, path, data=None, token=None):
    hdrs = {**H_API, "Authorization": f"Bearer {token}"}
    r = getattr(requests, method)(f"{WAZUH_API}{path}", json=data,
                                  headers=hdrs, verify=False)
    try:
        return r.json()
    except Exception:
        return {"status": r.status_code, "text": r.text}

def dash(method, path, data=None):
    r = getattr(requests, method)(f"{DASHBOARD}{path}", json=data,
                                  headers=H_DASH, auth=DASH_AUTH, verify=False)
    try:
        return r.json()
    except Exception:
        return {"status": r.status_code}

# ─── 1. Autenticar con Wazuh API ────────────────────────────────────────────
print("Autenticando con Wazuh API...")
try:
    token = wazuh_token()
    print("  Token obtenido OK")
except Exception as e:
    print(f"  Error auth: {e}")
    token = None

# ─── 2. Verificar estado del manager ────────────────────────────────────────
if token:
    info = wapi("get", "/", token=token)
    print(f"  Wazuh version: {info.get('data',{}).get('api_version','?')}")

# ─── 3. Crear index pattern para reportes si no existe ──────────────────────
print("\nVerificando index patterns...")
for ip_id, ip_title, time_field in [
    ("wazuh-alerts-*",     "wazuh-alerts-*",     "timestamp"),
    ("wazuh-monitoring-*", "wazuh-monitoring-*",  "timestamp"),
    ("wazuh-statistics-*", "wazuh-statistics-*",  "timestamp"),
]:
    r = dash("get", f"/api/saved_objects/index-pattern/{ip_id}")
    if "error" in r:
        dash("post", f"/api/saved_objects/index-pattern/{ip_id}", {
            "attributes": {"title": ip_title, "timeFieldName": time_field}
        })
        print(f"  Creado: {ip_id}")
    else:
        print(f"  OK: {ip_id}")

# ─── 4. Crear saved searches reutilizables ──────────────────────────────────
print("\nCreando saved searches...")
SEARCHES = [
    ("cowrie-all-events", "Cowrie - Todos los Eventos",
     "rule.groups:cowrie"),
    ("cowrie-brute-force", "Cowrie - Brute Force",
     "rule.id:100111"),
    ("cowrie-malware-download", "Cowrie - Descarga de Malware",
     "rule.id:100130 OR rule.id:100131"),
    ("cowrie-command-exec", "Cowrie - Ejecucion de Comandos",
     "rule.id:100120 OR rule.id:100121"),
    ("cowrie-critical", "Cowrie - Alertas Criticas (nivel 10+)",
     "rule.groups:cowrie AND rule.level:[10 TO *]"),
    ("cowrie-logins", "Cowrie - Intentos de Login",
     "rule.id:100110 OR rule.id:100112 OR rule.id:100113"),
]

for sid, stitle, query in SEARCHES:
    r = dash("get", f"/api/saved_objects/search/{sid}")
    if "id" in r and "error" not in r:
        dash("delete", f"/api/saved_objects/search/{sid}")

    r = dash("post", f"/api/saved_objects/search/{sid}", {
        "attributes": {
            "title": stitle,
            "description": f"Búsqueda: {query}",
            "hits": 0,
            "columns": ["timestamp", "rule.level", "rule.description",
                        "data.src_ip", "data.username", "agent.name"],
            "sort": [["timestamp", "desc"]],
            "version": 1,
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": "wazuh-alerts-*",
                    "filter": [],
                    "query": {"language": "lucene", "query": query},
                    "highlightAll": True,
                    "version": True
                })
            }
        },
        "references": [{
            "name": "kibanaSavedObjectMeta.searchSourceJSON.index",
            "type": "index-pattern",
            "id": "wazuh-alerts-*"
        }]
    })
    ok = "id" in r and "error" not in r
    print(f"  {'OK' if ok else 'ERR'} [{sid}]")

# ─── 5. Crear visualizaciones de resumen para reportes ──────────────────────
print("\nCreando visualizaciones de resumen...")

REPORT_VIZS = [
    ("report-cowrie-summary-table", "Reporte - Resumen Cowrie por Regla",
     {"title": "Reporte - Resumen Cowrie por Regla", "type": "table",
      "params": {"perPage": 20, "showPartialRows": False, "showMeticsAtAllLevels": False,
                 "sort": {"columnIndex": 0, "direction": "desc"},
                 "showTotal": True, "totalFunc": "sum"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "rule.description", "size": 20, "order": "desc",
                      "orderBy": "1", "customLabel": "Tipo de Evento"}},
          {"id": "3", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "rule.level", "size": 5, "order": "desc",
                      "orderBy": "1", "customLabel": "Nivel"}}
      ]},
     "rule.groups:cowrie"),

    ("report-cowrie-top-attackers", "Reporte - Top 20 IPs Atacantes",
     {"title": "Reporte - Top 20 IPs Atacantes", "type": "table",
      "params": {"perPage": 20, "showPartialRows": False, "showMeticsAtAllLevels": False,
                 "sort": {"columnIndex": 0, "direction": "desc"},
                 "showTotal": False, "totalFunc": "sum"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "data.src_ip", "size": 20, "order": "desc",
                      "orderBy": "1", "customLabel": "IP Atacante"}},
          {"id": "3", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "rule.description", "size": 3, "order": "desc",
                      "orderBy": "1", "customLabel": "Actividad Principal"}}
      ]},
     "rule.groups:cowrie AND data.src_ip:*"),

    ("report-alert-level-daily", "Reporte - Alertas por Nivel Diario",
     {"title": "Reporte - Alertas por Nivel (7 dias)", "type": "histogram",
      "params": {"type": "histogram", "grid": {"categoryLines": False},
                 "categoryAxes": [{"id": "CategoryAxis-1", "type": "category", "position": "bottom",
                                   "show": True, "scale": {"type": "linear"},
                                   "labels": {"show": True, "rotate": 0, "truncate": 100}, "title": {}}],
                 "valueAxes": [{"id": "ValueAxis-1", "name": "LeftAxis-1", "type": "value",
                                "position": "left", "show": True,
                                "scale": {"type": "linear", "mode": "normal"},
                                "labels": {"show": True, "truncate": 100},
                                "title": {"text": "Alertas"}}],
                 "seriesParams": [{"show": True, "type": "histogram", "mode": "stacked",
                                   "data": {"label": "Count", "id": "1"}, "valueAxis": "ValueAxis-1"}],
                 "addTooltip": True, "addLegend": True, "legendPosition": "right"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "date_histogram", "schema": "segment",
           "params": {"field": "timestamp", "interval": "1d", "min_doc_count": 1,
                      "extended_bounds": {}, "customLabel": "Dia"}},
          {"id": "3", "enabled": True, "type": "range", "schema": "group",
           "params": {"field": "rule.level", "ranges": [
               {"from": 0, "to": 4, "label": "Bajo (0-4)"},
               {"from": 5, "to": 9, "label": "Medio (5-9)"},
               {"from": 10, "to": 15, "label": "Alto (10-15)"}
           ]}}
      ]},
     "rule.groups:cowrie"),

    ("report-mitre-coverage", "Reporte - Cobertura MITRE ATT&CK",
     {"title": "Reporte - Tecnicas MITRE Detectadas", "type": "table",
      "params": {"perPage": 20, "showPartialRows": False, "showMeticsAtAllLevels": False,
                 "sort": {"columnIndex": 0, "direction": "desc"},
                 "showTotal": True, "totalFunc": "sum"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "rule.mitre.id", "size": 20, "order": "desc",
                      "orderBy": "1", "customLabel": "Tecnica MITRE"}},
          {"id": "3", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "rule.description", "size": 3, "order": "desc",
                      "orderBy": "1", "customLabel": "Descripcion"}}
      ]},
     "rule.groups:cowrie AND rule.mitre.id:*"),
]

for vid, vtitle, vis_state, query in REPORT_VIZS:
    r = dash("get", f"/api/saved_objects/visualization/{vid}")
    if "id" in r and "error" not in r:
        dash("delete", f"/api/saved_objects/visualization/{vid}")
    r = dash("post", f"/api/saved_objects/visualization/{vid}", {
        "attributes": {
            "title": vtitle,
            "visState": json.dumps(vis_state),
            "uiStateJSON": "{}",
            "description": "",
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({
                    "index": "wazuh-alerts-*",
                    "filter": [],
                    "query": {"language": "lucene", "query": query},
                    
                })
            }
        },
        "references": [{
            "name": "kibanaSavedObjectMeta.searchSourceJSON.index",
            "type": "index-pattern", "id": "wazuh-alerts-*"
        }]
    })
    ok = "id" in r and "error" not in r
    print(f"  {'OK' if ok else 'ERR'} [{vid}]")

# ─── 6. Crear dashboard de reportes ─────────────────────────────────────────
print("\nCreando dashboard de reportes...")
report_panels_def = [
    {"id": "report-alert-level-daily",   "w": 48, "h": 8,  "x": 0,  "y": 0},
    {"id": "report-cowrie-summary-table","w": 24, "h": 10, "x": 0,  "y": 8},
    {"id": "report-cowrie-top-attackers","w": 24, "h": 10, "x": 24, "y": 8},
    {"id": "report-mitre-coverage",      "w": 48, "h": 10, "x": 0,  "y": 18},
]

panels = []
references = []
for i, p in enumerate(report_panels_def):
    ref_name = f"panel_{i}"
    panels.append({
        "version": "2.13.0",
        "gridData": {"x": p["x"], "y": p["y"], "w": p["w"], "h": p["h"], "i": str(i + 1)},
        "panelIndex": str(i + 1),
        "embeddableConfig": {"enhancements": {}},
        "panelRefName": ref_name
    })
    references.append({"name": ref_name, "type": "visualization", "id": p["id"]})

references.append({
    "name": "kibanaSavedObjectMeta.searchSourceJSON.index",
    "type": "index-pattern", "id": "wazuh-alerts-*"
})

r = dash("get", "/api/saved_objects/dashboard/valhalla-soc-reports")
if "id" in r and "error" not in r:
    dash("delete", "/api/saved_objects/dashboard/valhalla-soc-reports")

d = dash("post", "/api/saved_objects/dashboard/valhalla-soc-reports", {
    "attributes": {
        "title": "Valhalla SOC - Reportes de Seguridad",
        "description": "Reportes ejecutivos: resumen de ataques, top atacantes, cobertura MITRE ATT&CK y tendencias diarias.",
        "hits": 0,
        "timeRestore": True,
        "timeFrom": "now-7d",
        "timeTo": "now",
        "refreshInterval": {"pause": True, "value": 0},
        "panelsJSON": json.dumps(panels),
        "optionsJSON": json.dumps({"darkTheme": False, "hidePanelTitles": False, "useMargins": True}),
        "version": 1,
        "kibanaSavedObjectMeta": {
            "searchSourceJSON": json.dumps({
                "query": {"language": "lucene", "query": ""},
                "filter": [], 
            })
        }
    },
    "references": references
})
ok = "id" in d and "error" not in d
print(f"Dashboard Reportes: {'CREADO OK' if ok else d.get('message', d)}")
if ok:
    print(f"  URL: https://localhost/app/dashboards#/view/{d['id']}")

# ─── 7. Resumen final ────────────────────────────────────────────────────────
print("\n" + "="*60)
print("CONFIGURACION COMPLETADA")
print("="*60)
print("\nDASHBOARDS DISPONIBLES:")
print("  1. Cowrie Honeypot (tiempo real, refresh 30s):")
print("     https://localhost/app/dashboards#/view/valhalla-soc-cowrie")
print("  2. Reportes de Seguridad (resumen semanal):")
print("     https://localhost/app/dashboards#/view/valhalla-soc-reports")
print("\nBUSQUEDAS GUARDADAS (en Discover):")
for sid, stitle, _ in SEARCHES:
    print(f"  - {stitle}")
print("\nREPORTES PDF/CSV: Dashboard > Share > PDF Reports")
print("  (Requiere plugin reporting, incluido en Wazuh Dashboard)")
