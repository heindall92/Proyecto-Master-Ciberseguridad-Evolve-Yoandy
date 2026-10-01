# Valhalla SOC — Acceso, roles y operaciones

> **Actualizado en octubre de 2026.** La versión anterior indicaba un acceso `admin`/`admin` por
> defecto y el modelo `llama3`; ninguno de los dos existe ya. Cada instalación genera su propia
> contraseña y la IA usa `qwen2.5:3b-instruct`. El manual completo está en [`MANUAL.md`](../MANUAL.md).

## 1. Acceso inicial

- **Usuario:** `admin`
- **Contraseña:** la de `ADMIN_PASSWORD` en el fichero `.env`, generado al instalar
  (`install.sh` / `install.ps1` o `scripts/setup_env.py`). **No hay contraseña por defecto común a
  todas las instalaciones.**

Cámbiala desde **Mi perfil** si se la vas a compartir a alguien, y da de alta al resto del equipo con
su propio usuario (sección 3). Si se pierde:

```bash
docker compose exec backend python /opt/valhalla-scripts/reset_admin.py   # la pide sin mostrarla
```

| Servicio | Dirección |
|---|---|
| Consola Valhalla SOC | `http://localhost:3000` (o `https://<máquina>.<tailnet>.ts.net` por VPN) |
| API | `http://localhost:8000/docs` |
| Consola nativa de Wazuh | `https://localhost:5601` (`admin` · `INDEXER_PASSWORD`) |

## 2. Roles y permisos

Los permisos se comprueban **en el servidor** (una llamada sin el rol adecuado devuelve `403`).

| Rol | Permisos |
|---|---|
| **Administrador** | Todo: usuarios e invitaciones, activos, sistema (salud, monitores, auditoría), honeypots, Bifröst, ajustes globales e informes. |
| **Analista** | Alertas, incidentes, runbooks (con edición), inteligencia, *threat hunting* e informes. |
| **Reportero** | Crea incidentes y ve los suyos. |
| **Lector** | Ve solo los incidentes asignados a él o creados por él. |

No se puede eliminar al último administrador, a uno mismo ni al usuario de sistema de la IA
(`valhalla-ia`).

## 3. Alta de usuarios: invitaciones de un solo uso

**Usuarios → Nuevo usuario**, con la invitación marcada. Valhalla genera un enlace de activación
**válido 24 horas y de un solo uso** con el que el invitado elige su contraseña; en la base de datos
solo se guarda su huella SHA-256. Regenerar la invitación (mantener pulsado) anula la anterior.

Con acceso por VPN y `TAILSCALE_API_KEY` configurada, el botón **Invitar** genera además el enlace de
Tailscale que comparte **solo la máquina del SOC**, no toda la red.

## 4. Sesión y protección de la cuenta

- Cookies `HttpOnly` y `SameSite` (y `Secure` cuando se entra por HTTPS); acceso de **2 horas**
  renovable durante **7 días**; el cierre de sesión revoca los tokens en el servidor.
- **5 intentos de login por minuto** por IP real (la IP no se puede falsificar con cabeceras).
- Contraseñas: mínimo 8 caracteres con mayúsculas, minúsculas y números.
- Cada sesión muestra el dispositivo y la red (local, VPN o internet). La IP solo la ven el
  administrador y el propio usuario. Con Tailscale, si alguien entra con una cuenta de VPN distinta de
  la vinculada, salta una alerta.

## 5. Ajustes globales (solo administradores)

- **IA:** URL de Ollama (por defecto `http://ollama:11434`), modelo (`qwen2.5:3b-instruct`),
  temperatura y nivel mínimo de alerta que se analiza.
- **Inteligencia de amenazas:** claves de VirusTotal, AlienVault OTX y AbuseIPDB, guardadas
  **cifradas con AES-256-GCM** y nunca mostradas completas.
- **Límites:** tamaño máximo de evidencias (1–50 MB) y retención de datos (7–365 días).

## 6. Monitor de seguridad LSA (Windows)

Desde **Activos → Hardening Windows (LSA)** se consulta, vía las comprobaciones SCA de Wazuh, si cada equipo Windows tiene
activadas `RunAsPPL` y la protección de LSA, con los comandos de PowerShell para endurecerlo frente al volcado de
credenciales de `lsass.exe`.

## 7. Auditoría

Toda acción que modifica datos (POST, PUT, PATCH, DELETE en la API) queda en **Sistema → Auditoría** con
usuario, ruta, **IP real**, código de resultado y fecha. **Nunca se guarda el cuerpo de la petición**
(contraseñas, claves). Los inicios de sesión y las activaciones de invitaciones se notifican en
directo a los administradores.
