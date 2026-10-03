"""Generadores de aprendizaje profundo y con privacidad diferencial de ``synthcity`` (extra opcional).

Instalación: ``pip install -e .[deep]`` (probado con Python 3.11; ``opacus<1.5.4`` evita una
incompatibilidad con versiones antiguas de torch). Si ``synthcity`` no está instalado, el
registro de generadores simplemente no ofrece estas opciones.

Plugins usados (van Breugel et al., *Synthcity: a benchmark framework for diverse use cases of
tabular synthetic data*, NeurIPS Datasets & Benchmarks 2023):

* ``ctgan``, ``tvae`` — Xu et al., *Modeling Tabular Data using Conditional GAN*, NeurIPS 2019.
* ``privbayes``      — Zhang et al., ACM TODS 2017 (red bayesiana con privacidad diferencial).
* ``aim``            — McKenna et al., VLDB 2022 (mecanismo adaptativo e iterativo, DP).
"""
from __future__ import annotations

import pandas as pd

from synapse.generators.base import Generator

DEEP_PLUGINS = {"ctgan": "aprendizaje profundo", "tvae": "aprendizaje profundo",
                "privbayes": "privacidad diferencial", "aim": "privacidad diferencial"}


def available() -> bool:
    try:
        import synthcity  # noqa: F401
    except Exception:  # pragma: no cover - depende del entorno
        return False
    return True


class SynthcityGenerator(Generator):
    family = "aprendizaje profundo"

    def __init__(self, seed: int = 0, plugin: str = "ctgan", epsilon: float | None = None,
                 n_iter: int | None = None) -> None:
        super().__init__(seed)
        if plugin not in DEEP_PLUGINS:
            raise ValueError(f"plugin no soportado: {plugin}")
        self.plugin, self.epsilon, self.n_iter = plugin, epsilon, n_iter
        self.family = DEEP_PLUGINS[plugin]
        self.private = plugin in ("privbayes", "aim")

    @property  # type: ignore[override]
    def name(self) -> str:  # type: ignore[override]
        return self.plugin

    @property
    def label(self) -> str:
        return f"{self.plugin}(ε={self.epsilon:g})" if self.epsilon is not None else self.plugin

    def _fit(self, df: pd.DataFrame) -> None:
        from synthcity.plugins import Plugins
        from synthcity.utils.reproducibility import enable_reproducible_results

        assert self.schema is not None
        enable_reproducible_results(self.seed)
        params: dict[str, object] = {"random_state": self.seed}
        if self.epsilon is not None:
            params["epsilon"] = self.epsilon
        if self.n_iter is not None and self.plugin in ("ctgan", "tvae"):
            params["n_iter"] = self.n_iter
        self._model = Plugins().get(self.plugin, **params)
        frame = df.copy()
        for c in self.schema.categorical:
            frame[c] = frame[c].astype(str)
        self._model.fit(frame)

    def _sample(self, n: int) -> pd.DataFrame:
        return self._model.generate(count=n, random_state=int(self.rng.integers(1 << 31))).dataframe()
