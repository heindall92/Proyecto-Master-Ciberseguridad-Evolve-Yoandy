#!/usr/bin/env python3
"""Crea visualizaciones y dashboards de Cowrie en Wazuh Dashboard (OpenSearch Dashboards 2.x)."""
import json, requests, urllib3, os
urllib3.disable_warnings()

BASE  = os.getenv("WAZUH_DASHBOARD_URL", "https://localhost")
_user = os.getenv("DASHBOARD_USERNAME", "admin")
_pass = os.getenv("DASHBOARD_PASSWORD", "admin")
AUTH  = (_user, _pass)
H = {"Content-Type": "application/json", "osd-xsrf": "true"}
INDEX_PATTERN_ID = "wazuh-alerts-*"

def api(method, path, data=None):
    r = getattr(requests, method)(f"{BASE}{path}", json=data, headers=H, auth=AUTH, verify=False)
    return r.json()

def delete_if_exists(obj_type, obj_id):
    r = api("get", f"/api/saved_objects/{obj_type}/{obj_id}")
    if "id" in r and "error" not in r:
        api("delete", f"/api/saved_objects/{obj_type}/{obj_id}")

# ─── Verify index pattern exists ───────────────────────────────────────────
r = api("get", f"/api/saved_objects/index-pattern/{INDEX_PATTERN_ID}")
if "error" in r:
    print(f"Creating index pattern {INDEX_PATTERN_ID}...")
    api("post", f"/api/saved_objects/index-pattern/{INDEX_PATTERN_ID}", {
        "attributes": {"title": INDEX_PATTERN_ID, "timeFieldName": "timestamp"}
    })
print(f"Index pattern: {INDEX_PATTERN_ID}")

# ─── Search source builders ─────────────────────────────────────────────────
def search_src(query):
    return json.dumps({
        "index": INDEX_PATTERN_ID,
        "filter": [],
        "query": {"language": "lucene", "query": query}
    })

search_cowrie   = search_src("rule.groups:cowrie")
search_critical = search_src("rule.groups:cowrie AND rule.level:[10 TO *]")
search_cmds     = search_src("rule.id:100120 OR rule.id:100121 OR rule.id:100130")

# ─── Visualization definitions ─────────────────────────────────────────────
VIZS = [
    ("cowrie-alerts-by-level", "Cowrie - Alertas por Nivel",
     {"title": "Cowrie - Alertas por Nivel", "type": "pie",
      "params": {"addTooltip": True, "addLegend": True, "legendPosition": "right", "isDonut": True,
                 "labels": {"show": True, "values": True, "last_level": True, "truncate": 100}},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "segment",
           "params": {"field": "rule.level", "size": 10, "order": "desc", "orderBy": "1"}}
      ]},
     search_cowrie),

    ("cowrie-top-ips", "Cowrie - Top 10 IPs Atacantes",
     {"title": "Cowrie - Top 10 IPs Atacantes", "type": "histogram",
      "params": {"type": "histogram", "grid": {"categoryLines": False},
                 "categoryAxes": [{"id": "CategoryAxis-1", "type": "category", "position": "bottom",
                                   "show": True, "scale": {"type": "linear"},
                                   "labels": {"show": True, "rotate": 75, "truncate": 100}, "title": {}}],
                 "valueAxes": [{"id": "ValueAxis-1", "name": "LeftAxis-1", "type": "value",
                                "position": "left", "show": True,
                                "scale": {"type": "linear", "mode": "normal"},
                                "labels": {"show": True, "truncate": 100},
                                "title": {"text": "Alertas"}}],
                 "seriesParams": [{"show": True, "type": "histogram", "mode": "stacked",
                                   "data": {"label": "Count", "id": "1"},
                                   "valueAxis": "ValueAxis-1"}],
                 "addTooltip": True, "addLegend": True, "legendPosition": "right"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "segment",
           "params": {"field": "data.src_ip", "size": 10, "order": "desc", "orderBy": "1",
                      "customLabel": "IP Atacante"}}
      ]},
     search_cowrie),

    ("cowrie-events-timeline", "Cowrie - Eventos en el Tiempo",
     {"title": "Cowrie - Eventos en el Tiempo", "type": "area",
      "params": {"type": "area", "grid": {"categoryLines": False},
                 "categoryAxes": [{"id": "CategoryAxis-1", "type": "category", "position": "bottom",
                                   "show": True, "scale": {"type": "linear"},
                                   "labels": {"show": True, "truncate": 100}, "title": {}}],
                 "valueAxes": [{"id": "ValueAxis-1", "name": "LeftAxis-1", "type": "value",
                                "position": "left", "show": True,
                                "scale": {"type": "linear", "mode": "normal"},
                                "labels": {"show": True, "truncate": 100},
                                "title": {"text": "Eventos"}}],
                 "seriesParams": [{"show": True, "type": "area", "mode": "stacked",
                                   "data": {"label": "Count", "id": "1"},
                                   "valueAxis": "ValueAxis-1", "interpolate": "linear"}],
                 "addTooltip": True, "addLegend": True, "legendPosition": "right"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "date_histogram", "schema": "segment",
           "params": {"field": "timestamp", "interval": "auto", "min_doc_count": 1,
                      "extended_bounds": {}, "customLabel": "Tiempo"}},
          {"id": "3", "enabled": True, "type": "terms", "schema": "group",
           "params": {"field": "rule.description", "size": 5, "order": "desc",
                      "orderBy": "1", "customLabel": "Tipo de Evento"}}
      ]},
     search_cowrie),

    ("cowrie-critical-metric", "Cowrie - Alertas Criticas",
     {"title": "Cowrie - Alertas Criticas", "type": "metric",
      "params": {"addTooltip": True, "addLegend": False, "type": "metric",
                 "metric": {"percentageMode": False, "useRanges": True,
                            "colorSchema": "Green to Red",
                            "metricColorMode": "Background",
                            "colorsRange": [{"from": 0, "to": 1}, {"from": 1, "to": 10}, {"from": 10, "to": 10000}],
                            "invertColors": False,
                            "labels": {"show": True},
                            "style": {"bgFill": "#000", "bgColor": True,
                                      "labelColor": False, "subText": "alertas criticas", "fontSize": 48}}},
      "aggs": [{"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}}]},
     search_critical),

    ("cowrie-top-commands", "Cowrie - Top Comandos Ejecutados",
     {"title": "Cowrie - Top Comandos", "type": "table",
      "params": {"perPage": 15, "showPartialRows": False, "showMeticsAtAllLevels": False,
                 "sort": {"columnIndex": 0, "direction": "desc"},
                 "showTotal": False, "totalFunc": "sum"},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "bucket",
           "params": {"field": "data.input", "size": 15, "order": "desc",
                      "orderBy": "1", "customLabel": "Comando Ejecutado"}}
      ]},
     search_cmds),

    ("cowrie-alert-types", "Cowrie - Tipos de Alerta",
     {"title": "Cowrie - Tipos de Alerta", "type": "histogram",
      "params": {"type": "histogram", "grid": {"categoryLines": False},
                 "categoryAxes": [{"id": "CategoryAxis-1", "type": "category", "position": "bottom",
                                   "show": True, "scale": {"type": "linear"},
                                   "labels": {"show": True, "rotate": 75, "truncate": 100}, "title": {}}],
                 "valueAxes": [{"id": "ValueAxis-1", "name": "LeftAxis-1", "type": "value",
                                "position": "left", "show": True,
                                "scale": {"type": "linear", "mode": "normal"},
                                "labels": {"show": True, "truncate": 100},
                                "title": {"text": "Count"}}],
                 "seriesParams": [{"show": True, "type": "histogram", "mode": "normal",
                                   "data": {"label": "Count", "id": "1"},
                                   "valueAxis": "ValueAxis-1"}],
                 "addTooltip": True, "addLegend": False},
      "aggs": [
          {"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}},
          {"id": "2", "enabled": True, "type": "terms", "schema": "segment",
           "params": {"field": "rule.description", "size": 10, "order": "desc",
                      "orderBy": "1", "customLabel": "Tipo de Alerta"}}
      ]},
     search_cowrie),
]

# ─── Delete existing and recreate visualizations ────────────────────────────
print("Recreando visualizaciones...")
for vid, vtitle, vis_state, search in VIZS:
    delete_if_exists("visualization", vid)
    r = api("post", f"/api/saved_objects/visualization/{vid}", {
        "attributes": {
            "title": vtitle,
            "visState": json.dumps(vis_state),
            "uiStateJSON": "{}",
            "description": "",
            "kibanaSavedObjectMeta": {"searchSourceJSON": search}
        },
        "references": []
    })
    ok = "id" in r and "error" not in r
    print(f"  {'OK' if ok else 'ERR'} [{vid}]: {'' if ok else r}")

# ─── Build dashboard panels with panelRefName (OSD 2.x format) ──────────────
panel_defs = [
    {"id": "cowrie-critical-metric",  "w": 12, "h": 5,  "x": 0,  "y": 0},
    {"id": "cowrie-alerts-by-level",  "w": 12, "h": 5,  "x": 12, "y": 0},
    {"id": "cowrie-top-ips",          "w": 24, "h": 5,  "x": 24, "y": 0},
    {"id": "cowrie-events-timeline",  "w": 48, "h": 8,  "x": 0,  "y": 5},
    {"id": "cowrie-alert-types",      "w": 24, "h": 8,  "x": 0,  "y": 13},
    {"id": "cowrie-top-commands",     "w": 24, "h": 8,  "x": 24, "y": 13},
]

panels = []
references = []
for i, p in enumerate(panel_defs):
    ref_name = f"panel_{i}"
    panels.append({
        "version": "2.13.0",
        "gridData": {"x": p["x"], "y": p["y"], "w": p["w"], "h": p["h"], "i": str(i + 1)},
        "panelIndex": str(i + 1),
        "embeddableConfig": {"enhancements": {}},
        "panelRefName": ref_name
    })
    references.append({"name": ref_name, "type": "visualization", "id": p["id"]})

# Add index pattern reference for the dashboard search

# ─── Delete and recreate dashboard ──────────────────────────────────────────
delete_if_exists("dashboard", "valhalla-soc-cowrie")
d = api("post", "/api/saved_objects/dashboard/valhalla-soc-cowrie", {
    "attributes": {
        "title": "Valhalla SOC - Cowrie Honeypot",
        "description": "Monitoreo del honeypot SSH/Telnet. Detecta ataques, brute force, ejecucion de comandos y descarga de malware.",
        "hits": 0,
        "timeRestore": True,
        "timeFrom": "now-7d",
        "timeTo": "now",
        "refreshInterval": {"pause": False, "value": 30000},
        "panelsJSON": json.dumps(panels),
        "optionsJSON": json.dumps({"darkTheme": False, "hidePanelTitles": False, "useMargins": True}),
        "version": 1,
        "kibanaSavedObjectMeta": {
            "searchSourceJSON": json.dumps({
                "query": {"language": "lucene", "query": ""},
                "filter": [],
                "highlightAll": True,
                "version": True
            })
        }
    },
    "references": references
})
ok = "id" in d and "error" not in d
print(f"\nDashboard 'Valhalla SOC - Cowrie Honeypot': {'CREADO OK' if ok else d.get('message', d)}")
if ok:
    print(f"  URL: https://localhost/app/dashboards#/view/{d['id']}")
