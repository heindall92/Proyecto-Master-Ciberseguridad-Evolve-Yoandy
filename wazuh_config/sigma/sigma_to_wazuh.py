#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════
 Valhalla SOC — Conversor Sigma → reglas Wazuh (Fase 1, Hito 2)
═══════════════════════════════════════════════════════════

Convierte reglas Sigma (YAML, estándar de la industria) en reglas Wazuh XML
(<rule><field>...). Cubre el caso común de Sigma:

    detection:
      selection:
        Campo: valor            # igualdad
        Campo2: [v1, v2]        # OR de valores
        Campo3|contains: txt    # modificador contains/startswith/endswith
      condition: selection

Mapeo de severidad Sigma → nivel Wazuh:
    informational=3  low=5  medium=8  high=12  critical=14

Uso:
    python sigma_to_wazuh.py --in wazuh_config/sigma/rules \
                             --out wazuh_config/rules/sigma_rules.xml \
                             --base-id 100600

Limitaciones (iterativo): no cubre toda la taxonomía/condiciones Sigma
(condiciones complejas con and/or/not, near, count). Soporta selection simple
y modificadores contains/startswith/endswith — suficiente para la mayoría de
detecciones de host/aplicación.
"""
from __future__ import annotations

import argparse
import glob
import html
import os
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("Falta PyYAML: pip install pyyaml")

LEVEL_MAP = {
    "informational": 3,
    "info": 3,
    "low": 5,
    "medium": 8,
    "high": 12,
    "critical": 14,
}

# Mapeo logsource.product → regla base Wazuh a la que anclar (if_sid). Permite que
# las reglas Sigma encadenen sobre el árbol de decodificación correcto y se reporten
# correctamente (en vez de competir como reglas atómicas). Sin mapeo → decoded_as json.
PRODUCT_ANCHOR = {
    "cowrie": "100100",
}


def _to_regex(value: str, modifier: str | None) -> str:
    """Convierte un valor Sigma (con comodines * ?) y modificador a regex PCRE2."""
    v = str(value)
    # Escapar regex, luego restaurar comodines Sigma * ?
    escaped = re.escape(v).replace(r"\*", ".*").replace(r"\?", ".")
    if modifier == "contains":
        return f".*{escaped}.*"
    if modifier == "startswith":
        return f"^{escaped}.*"
    if modifier == "endswith":
        return f".*{escaped}$"
    return escaped


def _field_clauses(selection: dict) -> list[tuple[str, str]]:
    """Devuelve [(field_name, regex)] desde una 'selection' Sigma."""
    clauses: list[tuple[str, str]] = []
    for raw_key, val in selection.items():
        if "|" in raw_key:
            field, modifier = raw_key.split("|", 1)
            modifier = modifier.strip().lower()
        else:
            field, modifier = raw_key, None
        if isinstance(val, list):
            regex = "|".join(_to_regex(x, modifier) for x in val)
        else:
            regex = _to_regex(val, modifier)
        clauses.append((field.strip(), regex))
    return clauses


def convert_rule(doc: dict, rule_id: int) -> str | None:
    detection = doc.get("detection") or {}
    selection = detection.get("selection")
    condition = str(detection.get("condition", "")).strip()
    if not isinstance(selection, dict) or condition not in ("selection", "selection1"):
        return None  # solo soportamos condition: selection (caso común)

    level = LEVEL_MAP.get(str(doc.get("level", "medium")).lower(), 8)
    title = html.escape(str(doc.get("title", "Sigma rule")))
    sigma_id = html.escape(str(doc.get("id", "")))
    tags = doc.get("tags") or []
    mitre = [t.split(".")[-1].upper() for t in tags if str(t).lower().startswith("attack.t")]

    product = str((doc.get("logsource") or {}).get("product", "")).lower()
    anchor = PRODUCT_ANCHOR.get(product)

    lines = [f'  <rule id="{rule_id}" level="{level}">']
    if anchor:
        lines.append(f"    <if_sid>{anchor}</if_sid>")
    else:
        lines.append("    <decoded_as>json</decoded_as>")
    for field, regex in _field_clauses(selection):
        safe_field = html.escape(field)
        safe_regex = html.escape(regex)
        lines.append(f'    <field name="{safe_field}" type="pcre2">{safe_regex}</field>')
    lines.append(f"    <description>Sigma: {title}</description>")
    groups = "sigma,"
    if sigma_id:
        groups += f"sigma_{sigma_id.replace('-', '')[:16]},"
    lines.append(f"    <group>{groups}</group>")
    for tech in mitre:
        if re.match(r"^T\d{4}", tech):
            lines.append(f"    <mitre><id>{html.escape(tech)}</id></mitre>")
    lines.append("  </rule>")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Sigma → Wazuh rules converter")
    ap.add_argument("--in", dest="indir", required=True, help="Directorio con reglas Sigma (.yml)")
    ap.add_argument("--out", dest="outfile", required=True, help="Archivo Wazuh XML de salida")
    ap.add_argument("--base-id", type=int, default=100600, help="ID base para las reglas generadas")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.indir, "*.yml")) + glob.glob(os.path.join(args.indir, "*.yaml")))
    if not files:
        print(f"Sin reglas Sigma en {args.indir}", file=sys.stderr)
        return 1

    rules_xml: list[str] = []
    rule_id = args.base_id
    converted, skipped = 0, 0
    for path in files:
        with open(path, encoding="utf-8") as f:
            try:
                doc = yaml.safe_load(f)
            except yaml.YAMLError as e:
                print(f"  ! YAML inválido {path}: {e}", file=sys.stderr)
                skipped += 1
                continue
        xml = convert_rule(doc, rule_id)
        if xml is None:
            print(f"  - omitida (condición no soportada): {os.path.basename(path)}", file=sys.stderr)
            skipped += 1
            continue
        rules_xml.append(xml)
        print(f"  + {os.path.basename(path)} -> rule id {rule_id}")
        rule_id += 1
        converted += 1

    header = (
        "<!--\n"
        "  Valhalla SOC — Reglas generadas desde Sigma (NO editar a mano).\n"
        f"  Generado por sigma_to_wazuh.py · {converted} reglas · base id {args.base_id}\n"
        "-->\n"
        '<group name="sigma,valhalla,">\n'
    )
    out = header + "\n\n".join(rules_xml) + "\n\n</group>\n"
    os.makedirs(os.path.dirname(os.path.abspath(args.outfile)), exist_ok=True)
    with open(args.outfile, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"\nOK: {converted} reglas convertidas, {skipped} omitidas -> {args.outfile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
