"""Semáforo de liberación: de las métricas a una decisión defendible ante un DPO o un comité.

El veredicto combina dos niveles independientes:

* **Privacidad** (la condición necesaria): si un adversario razonable puede individualizar,
  vincular o inferir datos de pacientes reales, la información **no es anónima** en el sentido
  del considerando 26 del RGPD y sigue siendo un dato de salud (art. 9).
* **Utilidad** (la condición de valor): si los datos no reproducen las conclusiones clínicas,
  liberarlos no aporta y puede inducir a error.

Las referencias normativas se citan de forma literal y conservadora. Los umbrales son propuestas
del equipo investigador (``src/synapse/config/study.yaml``), no estándares legales: el veredicto apoya, pero
no sustituye, la evaluación de impacto (EIPD, art. 35 RGPD) y el criterio del DPO.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

LEVELS = ("verde", "ámbar", "rojo")
DEFAULT_CONFIG = Path(__file__).resolve().parent / "config" / "study.yaml"

LEGAL_BASIS: dict[str, str] = {
    "RGPD cdo. 26": ("Los principios de protección de datos no se aplican a la información anónima; para "
                     "determinar si una persona es identificable deben tenerse en cuenta todos los medios "
                     "que razonablemente pueda utilizar el responsable o cualquier otra persona."),
    "RGPD art. 9": "Los datos relativos a la salud son una categoría especial de datos personales.",
    "RGPD art. 89": ("Tratamiento con fines de investigación científica: garantías adecuadas, incluida la "
                     "seudonimización o anonimización cuando permita alcanzar los fines."),
    "WP29 Dictamen 05/2014 (WP216)": ("Una técnica de anonimización robusta debe impedir la individualización "
                                      "(singling out), la vinculabilidad (linkability) y la inferencia."),
    "Reglamento (UE) 2025/327 (EHDS)": ("Uso secundario de datos de salud: se facilitan anonimizados cuando "
                                       "el fin lo permita; si no, seudonimizados y solo dentro de un entorno "
                                       "de tratamiento seguro."),
    "ISO/IEC 27559:2022": "Marco de desidentificación que mejora la privacidad: evaluación del riesgo de reidentificación según el contexto.",
    "AEPD-EDPS (2021)": "«10 malentendidos sobre la anonimización»: la anonimización es un proceso con riesgo residual que debe evaluarse.",
}

VERDICTS: dict[tuple[str, str], tuple[str, str]] = {
    # (privacidad, utilidad) → (color global, recomendación)
    ("verde", "verde"): ("verde", "Candidato a liberación como datos anonimizados (validar con EIPD y DPO). "
                                  "Conserva las conclusiones clínicas y resiste los ataques evaluados."),
    ("verde", "ámbar"): ("ámbar", "Privado, pero con pérdida parcial de validez inferencial: apto para docencia, "
                                  "pruebas de software o exploración; no para inferencia clínica."),
    ("verde", "rojo"): ("ámbar", "Privado pero inútil para inferencia: solo pruebas de software o docencia."),
    ("ámbar", "verde"): ("ámbar", "Útil pero con riesgo residual: compartir solo en un entorno de tratamiento "
                                  "seguro, bajo acuerdo de uso, como dato seudonimizado."),
    ("ámbar", "ámbar"): ("ámbar", "Riesgo residual y utilidad parcial: solo en entorno de tratamiento seguro."),
    ("ámbar", "rojo"): ("rojo", "No compensa: riesgo residual sin utilidad suficiente."),
    ("rojo", "verde"): ("rojo", "NO LIBERAR: los ataques reidentifican pacientes. Debe tratarse como dato personal de salud."),
    ("rojo", "ámbar"): ("rojo", "NO LIBERAR: los ataques reidentifican pacientes. Debe tratarse como dato personal de salud."),
    ("rojo", "rojo"): ("rojo", "NO LIBERAR: los ataques reidentifican pacientes. Debe tratarse como dato personal de salud."),
}


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    with open(path or DEFAULT_CONFIG, encoding="utf-8") as fh:
        return dict(yaml.safe_load(fh))


@dataclass
class Criterion:
    metric: str
    value: float
    level: str
    green: float
    amber: float
    higher_is_better: bool


@dataclass
class Verdict:
    color: str
    recommendation: str
    privacy_level: str
    utility_level: str
    criteria: dict[str, list[Criterion]] = field(default_factory=dict)

    def failing(self) -> list[Criterion]:
        return [c for group in self.criteria.values() for c in group if c.level != "verde"]


def grade(value: float, green: float, amber: float, higher_is_better: bool = False) -> str:
    """Un valor no medible (NaN) se califica en ámbar: la ausencia de evidencia no es evidencia de seguridad."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "ámbar"
    if higher_is_better:
        return "verde" if value >= green else "ámbar" if value >= amber else "rojo"
    return "verde" if value <= green else "ámbar" if value <= amber else "rojo"


def _worst(levels: list[str]) -> str:
    return max(levels, key=LEVELS.index) if levels else "ámbar"


def verdict(metrics: dict[str, float], thresholds: dict[str, Any] | None = None) -> Verdict:
    thresholds = thresholds or load_config()["thresholds"]
    criteria: dict[str, list[Criterion]] = {}
    for group in ("privacy", "utility"):
        items = []
        for metric, t in thresholds[group].items():
            if metric not in metrics:
                continue
            hib = bool(t.get("higher_is_better", False))
            value = float(metrics[metric])
            items.append(Criterion(metric, value, grade(value, t["green"], t["amber"], hib),
                                   float(t["green"]), float(t["amber"]), hib))
        criteria[group] = items
    p = _worst([c.level for c in criteria["privacy"]])
    u = _worst([c.level for c in criteria["utility"]])
    color, rec = VERDICTS[(p, u)]
    return Verdict(color=color, recommendation=rec, privacy_level=p, utility_level=u, criteria=criteria)
