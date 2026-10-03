"""Registro de generadores: ``make("cart", seed=1)`` o ``make("dpcopula", seed=1, epsilon=1)``."""
from __future__ import annotations

from typing import Any

from synapse.generators.base import Generator
from synapse.generators.classic import (
    BootstrapGenerator,
    CartGenerator,
    GaussianCopulaGenerator,
    MarginalGenerator,
)
from synapse.generators.dp import DPCopulaGenerator

CLASSIC: dict[str, type[Generator]] = {
    "bootstrap": BootstrapGenerator,
    "marginal": MarginalGenerator,
    "copula": GaussianCopulaGenerator,
    "cart": CartGenerator,
    "dpcopula": DPCopulaGenerator,
}


def available() -> list[str]:
    from synapse.generators import deep

    names = list(CLASSIC)
    if deep.available():
        names += list(deep.DEEP_PLUGINS)
    return names


def make(name: str, seed: int = 0, **params: Any) -> Generator:
    if name in CLASSIC:
        return CLASSIC[name](seed=seed, **params)
    from synapse.generators import deep

    if name in deep.DEEP_PLUGINS:
        if not deep.available():
            raise RuntimeError(f"'{name}' requiere el extra opcional: pip install -e .[deep]")
        return deep.SynthcityGenerator(seed=seed, plugin=name, **params)
    raise KeyError(f"generador desconocido '{name}'. Disponibles: {available()}")


__all__ = ["Generator", "available", "make", *[c.__name__ for c in CLASSIC.values()]]
