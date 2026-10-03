# Manual de usuario — Valhalla SOC

> **Versión 2.0 · octubre de 2026** · Grupo Proyecto Valhalla
>
> Sustituye a la versión 1.0 (abril de 2026), que describía el prototipo: cuatro contenedores, acceso
> `admin/admin` y Ollama instalado aparte. Hoy todo el stack (incluida la IA) corre en Docker, cada
> instalación genera sus propios secretos y el trabajo se hace desde la consola de Valhalla.

Este manual explica cómo **instalar, usar y administrar** Valhalla SOC. Está escrito para cualquier
persona con conocimientos básicos de informática; los términos técnicos están en el
[glosario](#9-glosario).

| Si quieres… | Ve a |
|---|---|
| Instalarlo por primera vez | [1. Instalación](#1-instalación) · guía detallada en [`docs/INSTALACION_PRIMERA_VEZ.md`](docs/INSTALACION_PRIMERA_VEZ.md) |
| Entrar y saber qué puedes hacer | [2. Acceso y roles](#2-acceso-y-roles) |
| Trabajar como analista | [3. La consola](#3-la-consola-sección-a-sección) y [4. Flujo de trabajo](#4-flujo-de-trabajo-de-un-incidente) |
| Administrar la plataforma | [6. Administración](#6-administración) |
| Resolver un problema | [8. Problemas frecuentes](#8-problemas-frecuentes) |

---

## 1. Instalación

### 1.1 Requisitos

| | Mínimo | Recomendado |
|---|---|---|
| Memoria RAM | 8 GB | 16 GB |
| Disco libre | 25 GB | 40 GB |
| Software | Docker (Desktop, o Engine con Compose v2), Git y Python 3 | — |
| Linux | `vm.max_map_count=262144` (lo necesita el indexador de Wazuh) | — |

**No hace falta instalar Ollama, Node.js ni PostgreSQL**: van dentro de Docker.

En Linux, el ajuste del indexador se aplica así (y se hace permanente con la segunda línea):

```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-valhalla.conf
```

### 1.2 Instalación automática (recomendada)

```bash
# Linux / macOS / WSL
git clone https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git valhalla-soc
cd valhalla-soc
./install.sh
```

```powershell
# Windows (PowerShell)
git clone https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git valhalla-soc
cd valhalla-soc
.\install.ps1
```

El instalador:

1. comprueba Git, Docker y Python;
2. genera `.env` con **secretos únicos** para esta instalación (no se sube nunca a Git);
3. genera los **certificados TLS de Wazuh** (tampoco se versionan);
4. levanta el stack con `docker compose --profile labs up -d --build`;
5. espera a que el servicio `ollama-init` descargue el modelo de IA (~2 GB la primera vez);
6. guarda las credenciales del indexador en el keystore del manager (inventario de vulnerabilidades).

Opciones: `NO_LABS=1 ./install.sh` (o `-NoLabs`) instala sin el atacante ni el agente del
laboratorio; `SKIP_OLLAMA=1` (o `-SkipOllama`) no espera al modelo.

La primera instalación tarda entre **10 y 20 minutos**, sobre todo por la descarga de imágenes.

### 1.3 Dónde están las contraseñas

Todas se generan en el fichero **`.env`** de la carpeta del proyecto:

| Variable | Para qué sirve |
|---|---|
| `ADMIN_PASSWORD` | Usuario `admin` de la consola de Valhalla |
| `INDEXER_PASSWORD` | Usuario `admin` de la consola nativa de Wazuh |
| `SECRET_KEY`, `WEBHOOK_SECRET` | Firma de sesiones y de las alertas que envía Wazuh (no se usan para entrar) |

Si ejecutas el asistente a mano (`python3 scripts/setup_env.py`) te pedirá la contraseña de `admin`.
Pulsar Enter deja `Valhalla2026!`, **pensada solo para un laboratorio**: cámbiala si la consola va a
estar accesible para más personas. El asistente guarda además una copia en `.env.setup-backup`;
pásala a un gestor de contraseñas y bórrala del disco.

---

## 2. Acceso y roles

### 2.1 Direcciones

| Servicio | Dirección | Usuario |
|---|---|---|
| **Consola Valhalla SOC** | `http://localhost:3000` | `admin` · `ADMIN_PASSWORD` |
| API y su documentación | `http://localhost:8000/docs` | sesión de la consola |
| Consola nativa de Wazuh | `https://localhost:5601` | `admin` · `INDEXER_PASSWORD` |
| Honeypot (¡es la trampa!) | `ssh root@localhost -p 2222` | cualquiera |

La consola de Wazuh usa un certificado autofirmado: el navegador avisará la primera vez
(«Configuración avanzada» → «Continuar»). Es esperado en un laboratorio.

Para entrar **desde el móvil o desde fuera de casa** se usa Tailscale con HTTPS; está en
[6.6 Acceso remoto por VPN](#66-acceso-remoto-por-vpn-opcional).

### 2.2 Roles

Cada permiso se comprueba **en el servidor**: si un rol intenta algo que no le corresponde, la API
responde `403` aunque se salte la interfaz.

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Todo: usuarios e invitaciones, activos, sistema (salud, monitores, auditoría), honeypots, Bifröst, ajustes globales e informes. |
| **Analista** | Investiga alertas, gestiona incidentes, edita runbooks, ejecuta *threat hunting* y genera informes. |
| **Reportero** | Crea incidentes y ve los suyos. |
| **Lector** | Solo ve los incidentes que tiene asignados o que creó. |

Salvaguardas: no se puede borrar a uno mismo, al usuario de sistema de la IA (`valhalla-ia`) ni
dejar la plataforma sin ningún administrador.

### 2.3 Sesión

- La sesión vive en cookies `HttpOnly` (el navegador no deja que ningún script las lea): el acceso dura
  **2 horas** y se renueva solo durante **7 días**. Al cerrar sesión se revoca en el servidor.
- El login admite **5 intentos por minuto** por dirección IP; después hay que esperar un minuto.
- Contraseñas: al menos **8 caracteres** con mayúsculas, minúsculas y números (la de `admin`, al menos
  12). Se cambian en **Mi perfil**.

---

## 3. La consola, sección a sección

El menú lateral solo muestra lo que tu rol puede usar. Con **`Ctrl + K`** (o `Cmd + K`) se abre el
buscador de comandos para saltar a cualquier sección; con **`?`** se abre el centro de ayuda.

| Sección | Para qué sirve |
|---|---|
| **Vista general** | Alertas, críticas, agentes e incidentes del periodo; volumen, severidad y atacantes principales. Los widgets se pueden reordenar. |
| **SIEM** | Alertas de Wazuh en vivo con filtros y técnicas MITRE ATT&CK. Desde cada alerta: crear incidente (**+INC**), investigar la IP o bloquearla. |
| **Workspace** | Los incidentes en un *kanban* (triaje → investigación → contención → resuelto) o en tabla, con SLA, asignación, comentarios, historial y evidencias con huella SHA-256. |
| **Informes** | Informe SOC, resumen ejecutivo e informe GRC (matriz de riesgo 5×5, NIST CSF 2.0, ATT&CK y correspondencia ENS · ISO 27001 · NIS2 · ISO 42001). Exportación a PDF, JSON y CSV. |
| **Activos** | Equipos con agente Wazuh: estado, sistema, último contacto, inventario de paquetes y guía de protección de LSA en Windows. |
| **Sistema** | Salud de cada integración, monitores de detección con umbrales editables y registro de auditoría. |
| **Honeypots** | Sesiones de Cowrie reconstruidas paso a paso: contraseñas probadas, comandos, reglas que saltan y accesos tras fuerza bruta. |
| **Inteligencia** | Reputación de IOCs (VirusTotal, AbuseIPDB) con lista de vigilancia, CVE explotadas (CISA KEV) priorizadas y mapa de origen de los ataques. |
| **Bifröst** | Métricas del SOC (MTTR, antigüedad, tasa de resolución, cobertura ATT&CK) y consultas de *threat hunting* exportables. |
| **Runbooks** | 20 procedimientos de respuesta con las 5 fases de NIST SP 800-61 y comandos reales; los analistas los editan. |
| **Usuarios** | Alta de usuarios, roles, invitaciones de un solo uso y sesiones en línea por dispositivo y red. |

**Siempre visibles:** campana de notificaciones, **chat de equipo** (canal global y mensajes directos),
selector de idioma **ES/EN**, tema claro/oscuro y color de acento, y el menú de usuario con **Mi perfil**.

**Regla de oro de los datos:** ninguna cifra se inventa. Si una fuente no responde o no hay datos, la
consola lo dice («sin datos») en lugar de rellenar el hueco.

---

## 4. Flujo de trabajo de un incidente

1. **Detectar.** Llega una alerta al **SIEM** (o salta un monitor de **Sistema**). La campana avisa.
2. **Abrir el incidente.** Pulsa **+INC** en la alerta: el incidente queda enlazado a ella.
3. **Asignar.** Desde la campana (**Asignarme**) o desde el incidente en el **Workspace**.
4. **Investigar.** Consulta la IP en **Inteligencia**, revisa la sesión en **Honeypots** si viene del
   señuelo y añade evidencias (máx. 10 MB: imágenes, PDF, TXT/LOG, JSON, CSV, PCAP y ZIP). Cada
   evidencia guarda su SHA-256 para demostrar que no se ha modificado.
5. **Contener.** Sigue el **runbook** del tipo de ataque. Para bloquear una IP, **mantén pulsado** el
   botón de bloqueo: la acción se aplica en Wazuh y solo se registra como bloqueada si Wazuh lo confirma.
6. **Resolver.** Cierra el incidente con su clasificación (verdadero positivo, falso positivo o
   benigno). Todo el recorrido queda en el historial y cuenta para el MTTR de Bifröst.
7. **Informar.** En **Informes**, elige el periodo y genera el informe. Queda guardado con su
   identificador, clasificación TLP y huella SHA-256: si alguien cambia el contenido, la huella deja
   de coincidir.

> Las acciones destructivas (borrar, bloquear, regenerar una invitación) exigen **mantener pulsado** el
> botón, también con el teclado (Enter mantenido): un clic accidental no hace nada.

---

## 5. Asistente de IA

La IA corre **en local** con Ollama (modelo `qwen2.5:3b-instruct`): ningún dato del SOC sale de la
máquina y no hace falta ninguna clave.

- **En el chat:** escribe `@ia` (o `@chatbot`, `@valhalla`, `@heimdall`) seguido de la pregunta. Con
  «resumen del día» adjunta el informe del día.
- **Triaje de alertas:** propone riesgo, técnica ATT&CK, acción y probabilidad de falso positivo,
  apoyándose en los runbooks.
- **Resumen ejecutivo** opcional en los informes.

La IA **redacta, no aporta datos**: las cifras de paneles e informes las calcula el backend. En CPU
genera unas 3 palabras por segundo; por eso el resumen de los informes es opcional. Contrasta siempre
sus conclusiones con la evidencia antes de cerrar un incidente.

---

## 6. Administración

### 6.1 Arrancar, parar y ver el estado

```bash
docker compose --profile labs up -d     # arrancar (sin "--profile labs": sin atacante ni agente)
docker compose ps                       # estado de cada contenedor
docker compose logs -f backend          # registros de un servicio (Ctrl+C para salir)
docker compose --profile labs down      # parar sin perder datos
```

En Windows, `.\install.ps1` instala y arranca el stack; para parar: `docker compose --profile labs down`.

| Contenedor | Qué hace |
|---|---|
| `dashboard` | Consola web (puerto 3000) |
| `backend` | API, WebSocket del chat y lógica del SOC (puerto 8000) |
| `postgres` | Usuarios, incidentes, runbooks, informes, auditoría y chat |
| `wazuh.manager` · `wazuh.indexer` · `wazuh.dashboard` | El SIEM: reglas, almacén de alertas y su consola nativa |
| `cowrie` | Honeypot SSH/Telnet (puertos 2222 y 2223) |
| `ollama` · `ollama-init` | IA local y la descarga inicial del modelo |
| `attacker` · `wazuh.agent` | Solo con `--profile labs`: atacante automático aislado y agente |
| `ts-whois` | Solo con `--profile tailscale`: identidad VPN de cada sesión |

### 6.2 Usuarios e invitaciones

En **Usuarios → Nuevo usuario**, elige el rol y deja marcada la **invitación**: Valhalla genera un
**enlace de activación de un solo uso que caduca en 24 horas** para que la persona elija su contraseña.
Se comparte por WhatsApp, correo o copiando el mensaje; en la base de datos solo se guarda su huella.
Regenerar una invitación (mantener pulsado) anula la anterior.

### 6.3 Ajustes globales

En **Ajustes globales** (solo administradores):

- **IA:** URL de Ollama, modelo, temperatura y nivel mínimo de alerta que se analiza.
- **Claves de inteligencia:** VirusTotal, AlienVault OTX y AbuseIPDB. Se guardan **cifradas
  (AES-256-GCM)** y nunca se vuelven a mostrar completas.
- **Límites:** tamaño máximo de evidencias (1–50 MB) y retención de datos (7–365 días; vacío = sin
  política).

### 6.4 Contraseña de `admin` olvidada

```bash
docker compose exec backend python /opt/valhalla-scripts/reset_admin.py
```

Te la pedirá dos veces sin mostrarla en pantalla.

### 6.5 Volver a una instalación limpia

```bash
make factory-reset            # borra incidentes, chat y usuarios extra; conserva admin, runbooks y ajustes
docker compose --profile labs down -v   # ⚠️ borra TODOS los datos (volúmenes) para empezar de cero
```

Actualizar a la última versión:

```bash
git pull origin main
docker compose --profile labs up -d --build
```

### 6.6 Acceso remoto por VPN (opcional)

Con [Tailscale](https://tailscale.com) la consola se publica **solo por HTTPS** en
`https://<máquina>.<tailnet>.ts.net`, y un cortafuegos cierra a la VPN todos los puertos de Docker.
Los comandos exactos están en el [README](README.md#arranque-rápido) («Acceso remoto por VPN con
HTTPS»). Cada sesión muestra la cuenta y el dispositivo de Tailscale; si alguien entra con una cuenta
distinta de la vinculada, salta una alerta y queda en la auditoría.

### 6.7 Despliegue con gateway HTTPS (perfil `prod`)

Para exponer la consola fuera del laboratorio, el perfil `prod` añade un gateway nginx con TLS en el
puerto **8443**:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --build
```

Antes, en `.env`: `ENV=production`, `SESSION_COOKIE_SECURE=true`, `TLS_VERIFY_SSL=true` y secretos
nuevos. Con `ENV=production` la API **no arranca** si no existe el usuario `admin` y falta
`ADMIN_PASSWORD`.

---

## 7. Probar que todo funciona

Con el perfil `labs`, el contenedor atacante lanza ataques periódicos, así que en pocos minutos verás
actividad. Para hacerlo a mano:

```bash
ssh root@localhost -p 2222   # prueba varias contraseñas: todo lo que hagas queda grabado
```

En segundos aparece en **SIEM** y en **Honeypots**; tras varios intentos salta la regla de **fuerza
bruta**. Las contraseñas más típicas (`root`, `admin`, `123456`…) se **rechazan a propósito** para que
los bots insistan; cualquier otra entra en la shell simulada, y los comandos que escribas (`whoami`,
`cat /etc/passwd`, `wget …`) se ven en la sesión reconstruida.

Para los desarrolladores, la calidad se comprueba con las pruebas automáticas (también se ejecutan en
GitHub en cada cambio):

```bash
bash scripts/run_tests.sh              # backend: pytest + matriz de trazabilidad (docs/TRAZABILIDAD.md)
cd frontend && npm ci && npm test      # consola: pruebas unitarias con Vitest
cd frontend && npm run typecheck       # consola: comprobación de tipos
```

---

## 8. Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| `wazuh.indexer` se reinicia en bucle (Linux) | Falta `vm.max_map_count=262144`: ver [1.1](#11-requisitos). |
| La consola no carga en `localhost:3000` | Aún está compilando: `docker compose logs -f dashboard`. Comprueba que el puerto 3000 no lo usa otro programa. |
| No puedo entrar con `admin` | La contraseña es la de `ADMIN_PASSWORD` en `.env` **del momento de la primera instalación**. Si la cambiaste después en `.env`, no se aplica sola: usa [6.4](#64-contraseña-de-admin-olvidada). |
| «Demasiados intentos» al iniciar sesión | Límite de 5 por minuto: espera un minuto. Queda registrado en Auditoría. |
| Me saca de la sesión | Han pasado 7 días o se cerró la sesión en el servidor: vuelve a entrar. |
| El panel no muestra alertas | **Sistema → Salud**: el indexador y el manager deben aparecer conectados. En una instalación nueva la primera alerta tarda unos minutos. |
| La IA no responde | `docker compose exec ollama ollama list` debe mostrar `qwen2.5:3b-instruct`. Si no: `docker compose exec ollama ollama pull qwen2.5:3b-instruct`. |
| Inteligencia sin reputación de IPs | Faltan las claves de VirusTotal / AbuseIPDB en **Ajustes globales**. |
| El mapa no sitúa las IPs del laboratorio | Son IPs privadas y no se pueden geolocalizar: el mapa lo indica. |
| Aviso de certificado en `https://localhost:5601` | Certificado autofirmado de Wazuh: esperado en el laboratorio. |

Si el problema sigue, revisa los registros del servicio (`docker compose logs <servicio>`) y abre una
*issue* en [GitHub](https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/issues).
Las vulnerabilidades se notifican en privado según [`SECURITY.md`](SECURITY.md).

---

## 9. Glosario

| Término | Explicación sencilla |
|---|---|
| **SOC** | Centro de Operaciones de Seguridad: el equipo y las herramientas que vigilan y responden a ataques. |
| **SIEM** | Sistema que recoge y correlaciona registros de seguridad. Aquí, **Wazuh**. |
| **Honeypot** | Trampa que simula un servidor real para atraer y estudiar atacantes. Aquí, **Cowrie**. |
| **Agente** | Programa de Wazuh instalado en cada equipo vigilado que envía sus registros. |
| **Regla / monitor** | Condición que genera una alerta (regla de Wazuh) o abre un incidente (monitor de Valhalla). |
| **Incidente** | Alerta (o conjunto de alertas) que un analista investiga hasta resolverla. |
| **Runbook** | Procedimiento paso a paso para responder a un tipo de ataque. |
| **MTTR** | Tiempo medio de resolución de los incidentes. |
| **SLA** | Plazo máximo acordado para atender un incidente según su severidad. |
| **IOC** | Indicador de compromiso: IP, dominio o hash asociado a un ataque. |
| **CVE / KEV** | Identificador público de una vulnerabilidad / catálogo de CISA con las que se explotan activamente. |
| **MITRE ATT&CK** | Catálogo universal de técnicas de ataque. |
| **Threat hunting** | Búsqueda proactiva de amenazas que no han generado alerta. |
| **TLP** | Etiqueta que indica con quién se puede compartir un informe (CLEAR, GREEN, AMBER, RED). |
| **SHA-256** | Huella digital de un fichero: si cambia un solo bit, la huella cambia. |
| **Docker / contenedor** | Programa que ejecuta cada servicio en una «caja» aislada. |
| **Ollama** | Programa que ejecuta modelos de IA en local, sin Internet. |
| **Tailscale / VPN** | Red privada cifrada para entrar a la consola desde otros dispositivos. |
| **CSRF / XSS** | Ataques web que la consola bloquea: peticiones falsificadas desde otra web / inyección de código en la página. |

---

Más documentación: [`README.md`](README.md) (visión general) ·
[`docs/INSTALACION_PRIMERA_VEZ.md`](docs/INSTALACION_PRIMERA_VEZ.md) (instalación detallada) ·
[`docs/REQUISITOS.md`](docs/REQUISITOS.md) y [`docs/TRAZABILIDAD.md`](docs/TRAZABILIDAD.md) (requisitos y pruebas) ·
[`SECURITY.md`](SECURITY.md) (seguridad).
