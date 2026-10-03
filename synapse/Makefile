# S.Y.N.A.P.S.E. — tareas habituales.  `make all` = lo que ejecuta la CI.
PY ?= python
.PHONY: install lint types test study figures site notebooks all clean

install:            ## Instala el paquete con herramientas de desarrollo y el panel
	$(PY) -m pip install -e ".[dev,dash]"
lint:               ## Estilo (ruff)
	$(PY) -m ruff check src tests scripts app
types:              ## Tipos (mypy)
	$(PY) -m mypy
test:               ## Pruebas con cobertura mínima del 90 %
	$(PY) -m pytest --cov --cov-fail-under=90
study:              ## Estudio piloto completo (10 semillas × 4 estudios × 8 generadores)
	synapse study --seeds 10 --workers 4
figures:            ## Figuras del paper
	synapse figures
site:               ## Explorador web autocontenido → site/index.html
	synapse site
notebooks:          ## Regenera y ejecuta los cuadernos
	$(PY) scripts/build_notebooks.py
all: lint types test
clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage results/reports
