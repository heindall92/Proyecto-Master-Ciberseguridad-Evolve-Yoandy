# ═══════════════════════════════════════════════════════════════════════
# Valhalla SOC — Makefile
# Single entry point for all dev/ops commands
# ═══════════════════════════════════════════════════════════════════════

.PHONY: help dev dev-front dev-back lint lint-back lint-front fmt test clean install

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Install ─────────────────────────────────────────────────────────────

install: ## Install all dependencies (backend + frontend)
	cd backend && pip install -r requirements.txt
	cd frontend/app && npm install

# ── Development ─────────────────────────────────────────────────────────

dev: ## Start both backend and frontend in dev mode
	@echo "Starting Valhalla SOC in development mode..."
	$(MAKE) dev-back &
	$(MAKE) dev-front

dev-back: ## Start backend (uvicorn)
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-front: ## Start frontend (Vite)
	cd frontend/app && npm run dev

# ── Lint & Format ───────────────────────────────────────────────────────

lint: lint-back lint-front ## Run all linters

lint-back: ## Lint backend with ruff
	cd backend && python -m ruff check app/ --fix

lint-front: ## Lint frontend with ESLint
	cd frontend/app && npx eslint src/ --ext .ts,.tsx

fmt: ## Format backend code with ruff
	cd backend && python -m ruff format app/

# ── Test ────────────────────────────────────────────────────────────────

test: ## Run backend tests
	cd backend && python -m pytest tests/ -v --tb=short

test-cov: ## Run tests with coverage report
	cd backend && python -m pytest tests/ -v --cov=app --cov-report=term-missing

# ── Clean ───────────────────────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -prune -exec echo "Skipping {}" \; || true
	rm -rf frontend/app/dist 2>/dev/null || true
	@echo "✓ Cleaned."

# ── Docker (placeholder) ────────────────────────────────────────────────

docker-build: ## Build production Docker images
	@echo "TODO: Add docker-compose build"

docker-up: ## Start all services via Docker
	@echo "TODO: Add docker-compose up -d"
