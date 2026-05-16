---
name: valhalla-dev
description: Desarrollar y mejorar el repositorio Valhalla-SOC (FastAPI, React, Docker, Wazuh, seguridad). Usar cuando el usuario pide arreglar bugs, parchear vulnerabilidades, refactors, tests, docker-compose o documentación del código fuente — NO cuando solo pide operar alertas en el SOC en producción.
---

# Valhalla SOC — desarrollo del proyecto

Copiloto para **mejorar el código y la infra**, no para sustituir el dashboard ni a Cursor.

## Stack del repo

| Capa | Ruta | Notas |
|------|------|--------|
| Backend | `backend/app/` | FastAPI, auth cookie+CSRF, OpenSearch, Ollama |
| Frontend | `frontend/app/src/` | React, Redux, Vite :3000 |
| Docker | `docker-compose.yml` | Wazuh, Cowrie, Postgres, Ollama |
| Reglas Wazuh | `wazuh_config/` | Cowrie decoders/rules |
| Auditoría | `docs/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md` | Hallazgos pendientes |
| Tests backend | `backend/tests/` | `pytest tests/` desde `backend/` |

## Comandos habituales

```bash
# Stack
docker compose --profile labs up -d
docker compose restart backend

# Backend (Windows host: usar --loop si uvicorn local)
cd backend && python -m pytest tests/ -q

# Frontend
cd frontend && npm run dev
```

## Prioridades al tocar código

1. Cambios mínimos; no refactors masivos no pedidos.
2. Seguridad: revisar auditoría antes de cerrar un tema (webhook, IDOR, TLS, secrets).
3. No commitear `.env` ni secretos.
4. Responder y comentar en **español** si el usuario lo usa.

## Trabajo con Cursor / otro asistente

- Hermes puede **ejecutar** tests, leer logs Docker, proponer diffs en terminal.
- Para ediciones grandes en muchos archivos, coordinar: una tarea por sesión, luego `pytest` y `git diff`.
- Si existe integración MCP `valhalla_soc`, usarla solo para **probar** la API en marcha, no para editar el repo.

## Archivos sensibles recientes

- Rate limit: `backend/app/security.py` (JSONResponse 429, GET exento).
- Cowrie OpenSearch: `backend/app/opensearch_client.py` (`data.src_ip`).
- Tickets: `backend/app/main.py` (`_tickets_assignee_filter`, delete con `db.delete`).
