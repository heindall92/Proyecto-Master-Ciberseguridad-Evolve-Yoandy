# Hermes Agent + Valhalla SOC

Dos usos distintos de [Hermes Agent](https://github.com/NousResearch/hermes-agent):

| Modo | Para qué | Qué instalar |
|------|----------|----------------|
| **Desarrollo del repo** (recomendado para ti + Cursor) | Mejorar código, tests, Docker, parches de seguridad, depurar | Skill `valhalla-dev` + contexto `context/valhalla-repo.md` |
| **Operación SOC** (opcional) | Consultar alertas/Cowrie/tickets con la API levantada | MCP `mcp_valhalla_soc.py` + skill `valhalla-soc` |

Hermes **no sustituye** Cursor ni el dashboard: es un agente en terminal con memoria, shell, cron y (opcional) Telegram.

---

## Modo A — Mejorar el proyecto (tu caso)

Hermes trabaja **dentro del clone** del repo con herramientas de terminal (git, pytest, docker, ripgrep). Sirve para:

- Cerrar hallazgos de `docs/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md`
- Ejecutar tests y leer logs mientras tú usas Cursor en paralelo
- Dejar rutinas (“cada noche: pytest + resumen de diff”)

### Setup rápido

```bash
# 1. Instalar Hermes (WSL2 recomendado en Windows)
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
hermes setup

# 2. Modelo (Ollama local o OpenRouter)
hermes model

# 3. Copiar skill y contexto de desarrollo
mkdir -p ~/.hermes/skills
cp -r integrations/hermes/skills/valhalla-dev ~/.hermes/skills/

# 4. Arrancar Hermes con el repo como directorio de trabajo
cd /ruta/a/Valhalla-SOC
hermes
```

En el primer mensaje puedes pegar el contenido de `integrations/hermes/context/valhalla-repo.md` o configurarlo como [context file](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files) de Hermes apuntando a este repositorio.

### Cómo encaja con Cursor

| Tú / Cursor (yo) | Hermes en paralelo |
|------------------|-------------------|
| Edición multiarchivo, UI, revisión | `docker logs`, `pytest`, búsquedas en repo, borradores |
| Decisiones de diseño | Tareas repetitivas o largas en terminal |
| Commits cuando pidas | Cron de verificación (tests, lint) |

No compiten: Hermes **ejecuta**; Cursor **integra** cambios en el IDE.

---

## Modo B — Operación SOC (opcional)

Integración vía MCP para cuando el stack está arriba: alertas Wazuh, Cowrie, tickets.

## Requisitos

1. Stack Valhalla levantado (`docker compose up` o `Valhalla-Runner.bat`).
2. Backend en `http://localhost:8000` y credencial `admin` (variable `ADMIN_PASSWORD` en `.env`).
3. Hermes instalado (en Windows se recomienda **WSL2**):

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.bashrc
hermes setup
```

En PowerShell nativo (beta):

```powershell
irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex
```

## 1. Modelo: usar tu Ollama de Valhalla

```bash
hermes model
```

- Provider: **Custom (OpenAI-compatible)**
- Base URL: `http://127.0.0.1:11434/v1` (host) o `http://host.docker.internal:11434/v1` (desde WSL con Ollama en Docker)
- API key: vacío
- Modelo: el de tu `.env` (`qwen2.5-coder:7b`, etc.)

Alternativa: `ollama launch hermes` si tienes Ollama CLI reciente.

## 2. Servidor MCP Valhalla

```bash
pip install -r integrations/hermes/requirements-mcp.txt
export VALHALLA_API_URL=http://localhost:8000
export VALHALLA_USERNAME=admin
export VALHALLA_PASSWORD='tu-password'
python integrations/hermes/mcp_valhalla_soc.py
# (stdio — lo arranca Hermes, no hace falta dejarlo corriendo a mano)
```

Añade el bloque de `integrations/hermes/config.example.yaml` a `~/.hermes/config.yaml` (ruta `args` en absoluto).

## 3. Skill SOC

```bash
mkdir -p ~/.hermes/skills
cp -r integrations/hermes/skills/valhalla-soc ~/.hermes/skills/
```

## 4. Probar

```bash
hermes
```

Ejemplos:

- «¿Cuántos eventos Cowrie hubo en 24h y qué IPs atacaron?»
- «Lista las 10 alertas más graves y dime si hay ticket abierto»
- «¿Está activo el honeypot y el indexer?»

En Hermes: `/reload-mcp` si cambias la config.

## 5. Gateway (opcional)

Para consultar el SOC desde Telegram:

```bash
hermes gateway setup
hermes gateway start
```

Mismo MCP y skill; respuestas en el móvil.

## Seguridad

- `VALHALLA_PASSWORD` queda en `config.yaml` de Hermes: protege `~/.hermes` y no subas ese archivo a Git.
- El MCP usa las mismas cookies que un usuario web; usa cuenta **analista/admin** de laboratorio, no producción.
- Hermes puede ejecutar shell en tu máquina: revisa [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) y limita toolsets si expones el gateway.

## Cron de ejemplo (informe diario)

En Hermes (`hermes` → configurar cron o `~/.hermes/cron`):

> Cada día a las 08:00, usa valhalla_soc para resumir alertas críticas, top attackers y tickets abiertos; envíame el resumen por Telegram.

## Solución de problemas

| Problema | Acción |
|----------|--------|
| MCP no conecta | `pip install mcp httpx`; ruta absoluta en `args` |
| Login falla | Contraseña ≥8 caracteres; coincide con `ADMIN_PASSWORD` |
| Sin datos Cowrie | `docker compose --profile labs up -d attacker` |
| Hermes lento | Modelo más pequeño en Ollama o GPU |

## Referencias

- [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- [MCP en Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes + Ollama](https://docs.ollama.com/integrations/hermes)
