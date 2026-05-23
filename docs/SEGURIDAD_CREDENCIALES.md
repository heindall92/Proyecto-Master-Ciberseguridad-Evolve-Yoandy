# 🔐 Seguridad — Credenciales por defecto (LÉEME ANTES DE EXPONER)

> ⚠️ **AVISO / USO BAJO TU PROPIO RIESGO**
> Esta herramienta se entrega con **contraseñas por defecto** pensadas para un laboratorio
> local. **Si la despliegas en una red accesible o en producción, DEBES cambiarlas.**
> El equipo de Valhalla SOC no se responsabiliza de despliegues con credenciales por defecto.

---

## Credenciales por defecto y dónde cambiarlas

| Servicio | Usuario / contraseña por defecto | Dónde se define | Cómo cambiarla |
|---|---|---|---|
| **Dashboard Wazuh** (`https://localhost`) | `admin` / `admin` | Imagen `wazuh.indexer` (OpenSearch Security) + `INDEXER_PASSWORD` en `.env` | Ver *Procedimiento Wazuh* abajo (requiere `securityadmin`) |
| **Wazuh Indexer / OpenSearch** (`:9200`) | `admin` / `admin` | `.env` → `INDEXER_PASSWORD`, `OPENSEARCH_PASSWORD` | Cambiar en `.env` + reconfigurar seguridad del indexer |
| **Wazuh API** (`:55000`) | `wazuh-wui` / `wazuh-wui` | `.env` → `WAZUH_API_USER`, `WAZUH_API_PASSWORD` | Cambiar en `.env` y vía API de Wazuh (`PUT /security/users`) |
| **PostgreSQL** | `valhalla` / `valhalla` | `.env` → `POSTGRES_PASSWORD` | Cambiar en `.env` antes del primer `docker compose up` |
| **Valhalla SOC** (dashboard propio `:3000`) | `admin` / *(la que elegiste en el setup)* | `.env` → `ADMIN_PASSWORD` (via `scripts/setup_env.py`) | Ya es propia; cámbiala con `scripts/reset_admin.py` |
| **Clave de firma JWT** | `DEV-ONLY-...-replace-in-prod` | `.env` → `SECRET_KEY` | **Obligatorio** generar una nueva en prod (`python -c "import secrets;print(secrets.token_urlsafe(48))"`) |

---

## Dónde tocar cada cosa

- **`.env`** (raíz del proyecto): `INDEXER_PASSWORD`, `OPENSEARCH_PASSWORD`, `WAZUH_API_PASSWORD`,
  `POSTGRES_PASSWORD`, `SECRET_KEY`, `ADMIN_PASSWORD`. Cámbialas **antes** del primer arranque.
- **`docker-compose.yml`**: los servicios leen esos valores de `.env` mediante `${VAR:-default}`.
  El `:-default` es el fallback inseguro; al definir la variable en `.env` se sobreescribe.

### Procedimiento Wazuh (dashboard / indexer `admin`)
El `admin/admin` del dashboard vive en la configuración de seguridad de OpenSearch dentro del
contenedor `wazuh.indexer` (`internal_users.yml`). Para cambiarlo de verdad:

1. Generar el hash de la nueva contraseña:
   `docker compose exec wazuh.indexer bash /usr/share/wazuh-indexer/plugins/opensearch-security/tools/hash.sh`
2. Sustituir el hash de `admin` en `internal_users.yml`.
3. Aplicar la configuración de seguridad con `securityadmin.sh`.
4. Reiniciar `wazuh.indexer` y `wazuh.dashboard`.

> Referencia: https://documentation.wazuh.com/current/user-manual/user-administration/

---

## Estado actual del repositorio (transparencia)

- Las contraseñas por defecto (`admin/admin`, `wazuh-wui/wazuh-wui`) se mantienen **a propósito**
  para que la herramienta funcione "out of the box" en local. **Es responsabilidad de quien la
  descargue/despliegue cambiarlas** según esta guía.
- Pendiente de hardening (documentado, no resuelto): regenerar y sacar de git los certificados
  privados de `wazuh-certificates/` antes de cualquier exposición pública.
