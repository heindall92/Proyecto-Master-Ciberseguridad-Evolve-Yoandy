# Contexto: repositorio Valhalla-SOC (desarrollo)

Proyecto SOC académico (Máster Ciberseguridad Evolve): honeypot Cowrie + Wazuh/OpenSearch + backend FastAPI + frontend React.

## Objetivo de este agente aquí

Ayudar al mantenedor a **mejorar el código, tests, Docker y seguridad** del repositorio. No confundir con operación SOC del analista final (eso es el producto en `http://localhost:3000`).

## Estructura rápida

- `backend/app/main.py` — API principal
- `backend/app/opensearch_client.py` — consultas Wazuh Indexer
- `frontend/app/src/ui/` — vistas (Cowrie, Workspace, Dashboard)
- `docker-compose.yml` — servicios; perfil `labs` para attacker
- `docs/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md` — vulnerabilidades; muchas aún abiertas

## Convenciones

- Idioma usuario: español.
- Sin commits salvo que el usuario lo pida.
- Windows: backend local necesita `uvicorn --loop app.uvicorn_loop:selector_loop_factory`.
- Variables críticas: `ADMIN_PASSWORD`, `WEBHOOK_SECRET`, `DATABASE_URL`, `SECRET_KEY`.

## Calidad antes de dar por cerrado

- `cd backend && python -m pytest tests/ -q`
- Revisar que cambios de seguridad no rompan login (cookie `access_token`, CSRF en mutaciones).
