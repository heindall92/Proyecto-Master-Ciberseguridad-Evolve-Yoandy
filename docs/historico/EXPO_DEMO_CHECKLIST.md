# Checklist exposición Valhalla SOC

## Antes del jurado

1. `cp .env.example .env` — `SECRET_KEY` único, `ENV=production` en VM.
2. Certificados Wazuh en `config/wazuh_indexer_ssl_certs/`.
3. `docker compose up -d --build`
4. `docker compose --profile prod up -d --build gateway` (HTTPS en puerto **8443**).
5. Tras 3–5 min: `python create_dashboards.py`, `python setup_monitors.py`.
6. `./scripts/healthcheck.sh`

## Demo en vivo (5–8 min)

| Paso | Acción | Resultado esperado |
|------|--------|-------------------|
| 1 | Abrir `https://<vm>:8443` | Login Valhalla (sin credenciales en pantalla) |
| 2 | Overview | Métricas Wazuh / tickets abiertos |
| 3 | `ssh -p 2222 test@<vm>` (password falso) | Cowrie captura intento |
| 4 | Vista Cowrie + SIEM (2–5 min) | Sesión / alerta visible |
| 5 | Incidentes / ticket auto | Ticket high/critical |
| 6 | Workspace | Asignar, notas, evidencia |
| 7 | Chat (2 navegadores) | Mensaje global + notificación alerta |

## Seguridad (capturas)

- Login sin credenciales expuestas.
- Cookie `httpOnly` + HTTPS.
- Health → integraciones en verde.
