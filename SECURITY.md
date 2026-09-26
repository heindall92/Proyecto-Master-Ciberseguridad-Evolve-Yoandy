# Política de seguridad

## Reportar una vulnerabilidad

Si encuentras un fallo de seguridad en Valhalla SOC, **no abras una *issue* pública**. Escribe a
[yoandyramirezdelgado@gmail.com](mailto:yoandyramirezdelgado@gmail.com) con:

- descripción del fallo y componente afectado (consola, API, integración con Wazuh, instalador…);
- pasos para reproducirlo y su impacto;
- si es posible, una propuesta de corrección.

Recibirás acuse en un máximo de 72 horas. Una vez corregido, el fallo se documenta en el
historial de commits con su causa y su corrección.

**Versión soportada:** la rama principal y la última etiqueta publicada (`v1.0-practica3`).
Es un proyecto académico de laboratorio: no está pensado para exponerse directamente a Internet.

## Modelo de amenazas

El análisis STRIDE completo, con fronteras de confianza, mitigaciones, su comprobación y los
riesgos residuales, está en [docs/STRIDE.md](docs/STRIDE.md). Los requisitos de seguridad
(RNF-01 a RNF-06) se verifican en la suite automática: ver la
[matriz de trazabilidad](docs/TRAZABILIDAD.md).

## Gestión de secretos

| Secreto | Dónde vive | Cómo se genera |
|---|---|---|
| `SECRET_KEY`, `WEBHOOK_SECRET`, `ADMIN_PASSWORD`, `INDEXER_PASSWORD`, `POSTGRES_PASSWORD` | `.env` (fuera de Git) | `scripts/setup_env.py`: aleatorios y únicos por instalación |
| Certificados TLS de Wazuh | `config/wazuh_indexer_ssl_certs/` (fuera de Git) | `scripts/gen_certs.sh` con el generador oficial de Wazuh |
| Credenciales del indexador para el manager | Keystore de Wazuh | `scripts/wazuh_post_install.sh` (por stdin, sin pasar por la línea de comandos) |
| `TAILSCALE_API_KEY` (opcional) | `.env` | La crea el administrador en el panel de Tailscale; caduca en 90 días o menos |
| Contraseñas de usuarios | PostgreSQL | Hash bcrypt; nunca se guardan ni se registran en claro |
| Enlaces de invitación | PostgreSQL | Solo el SHA-256 del token; el enlace completo se muestra una vez |

> **Aviso:** commits antiguos del repositorio contienen certificados de Wazuh de desarrollo y
> copias de la base de datos. Se retirarán reescribiendo el historial antes de la entrega; hasta
> entonces, cualquier instalación debe generar **sus propios** certificados (el instalador ya lo
> hace) y no reutilizar nada del historial.

## Hallazgos abiertos

Detectados en la revisión del 26/09/2026 y pendientes de corrección (detalle en [STRIDE](docs/STRIDE.md), S7 y S8):

| Hallazgo | Riesgo | Corrección prevista |
|---|---|---|
| La API de Wazuh (puerto 55000) usa la credencial de fábrica `wazuh-wui` y es alcanzable desde la red local y desde el contenedor atacante | **Alto** | Rotar la contraseña con el script `create_user.py` del manager, pasarla al backend y a la consola de Wazuh, y publicar el puerto solo en `127.0.0.1` |
| Los usuarios de demostración del indexador (`kibanaserver`, `readall`…) conservan su contraseña pública | **Alto** | Cambiar sus hashes (o eliminarlos) en `config/wazuh_indexer/init-security.sh`, como ya se hace con `admin` |
| El contenedor atacante del laboratorio comparte red con la base de datos, el manager y el indexador | Medio | Red propia `lab-net` solo con el honeypot |

## Auditoría de dependencias e imágenes

Se repite con `bash scripts/security_audit.sh`. Última ejecución: **26/09/2026**.

| Herramienta | Alcance | Hallazgos iniciales | Tras la corrección |
|---|---|---|---|
| `pip-audit` | 84 dependencias Python del backend | 11 paquetes vulnerables (Starlette, PyJWT, cryptography, Pillow, python-multipart, urllib3, idna, anyio, click, msgpack, pydantic-settings) | **0** · actualizados a versiones corregidas; 56/56 pruebas en verde |
| `npm audit` | 535 paquetes de la consola (incl. desarrollo) | 26 (1 crítico, 21 altos): DOMPurify, react-router, Vite, tar, Electron… | **0** · `npm audit fix` sin saltos de versión mayor |
| Trivy | Imagen del backend (Debian 13) | 44 altos en paquetes del sistema base | 44 · **sin parche publicado por Debian**; el Dockerfile aplica `apt-get upgrade` para recogerlos al reconstruir |
| Trivy | Imagen de la consola | 47 altos y 2 críticos (Node 20 sin soporte, OpenSSL, npm interno, paquetes antiguos) | 21 altos y 1 crítico, **todos en el binario de `esbuild`** (compilado con Go 1.23) · base Node 22 LTS, `npm ci` con lockfile |

**Riesgo aceptado — `esbuild`:** la corrección exige pasar de Vite 6 a Vite 7 (salto de versión
mayor). `esbuild` solo transforma el código de la consola dentro del contenedor y no escucha en la
red, por lo que las vulnerabilidades de la biblioteca estándar de Go (en su mayoría de red y
análisis de certificados) no son alcanzables desde fuera. Se revisará al migrar a Vite 7.

### Cambios de cadena de suministro aplicados

- **PyMuPDF eliminado**: no se usaba y su licencia AGPL-3.0 es incompatible con la GPLv2 del proyecto.
- **react-leaflet sustituido por Leaflet**: su licencia Hippocratic-2.1 añade restricciones de uso; de paso, las ventanas del mapa se construyen con nodos DOM y no con HTML.
- **Versiones fijadas**: `npm ci` con `package-lock.json` (antes `npm install` sin lockfile, no reproducible), Ollama `0.34.4` y Cowrie por digest (antes `latest`).
- **Node 22 LTS** en la consola: Node 20 dejó de tener soporte el 30/04/2026.

Inventario de licencias de terceros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Controles principales

- Autenticación JWT en cookies `HttpOnly`/`SameSite` (y `Secure` por HTTPS), revocación y rotación de *refresh*.
- Autorización por rol en el servidor; mensajes directos solo para sus participantes.
- CSRF de doble cookie; verificación de origen en el WebSocket.
- IP real solo desde proxies de confianza; límites de peticiones por IP.
- Validación de entradas con Pydantic y neutralización de HTML.
- Auditoría de escrituras sin cuerpos; historial por incidente.
- Informes con huella SHA-256 verificable.
- IA local: ningún dato del SOC sale de la máquina.
- Acceso remoto solo por HTTPS a través de la VPN, con los puertos de Docker cerrados a la VPN.
