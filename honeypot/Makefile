# ═══════════════════════════════════════════════════════════
# Valhalla SOC — Honeypot — Makefile
# Envuelve los scripts para que sea cómodo desde cualquier shell.
# ═══════════════════════════════════════════════════════════

.PHONY: help up down restart logs status test clean rebuild

help:
	@echo "Valhalla Honeypot — comandos disponibles:"
	@echo "  make up        Arranca Cowrie en background"
	@echo "  make down      Detiene Cowrie (preserva volúmenes)"
	@echo "  make restart   Reinicia Cowrie"
	@echo "  make logs      Sigue los logs JSON en vivo (jq)"
	@echo "  make status    Muestra estado y número de eventos"
	@echo "  make test      Simula un ataque contra el honeypot"
	@echo "  make rebuild   Baja, borra volúmenes y rearranca"
	@echo "  make clean     Borra logs locales (./logs, ./downloads)"

up:
	@bash scripts/start.sh

down:
	@bash scripts/stop.sh

restart: down up

logs:
	@bash scripts/tail-logs.sh

status:
	@bash scripts/status.sh

test:
	@bash scripts/test-attack.sh

rebuild:
	docker compose down -v
	docker compose pull
	docker compose up -d
	@echo "[✔] Reconstruido desde cero."

clean:
	@echo "[!] Borrando logs locales…"
	@rm -f logs/*.json logs/*.log downloads/* tty/* 2>/dev/null || true
	@echo "[✔] Hecho."
