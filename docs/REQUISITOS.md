# Requisitos de Valhalla SOC

Requisitos funcionales (RF) y no funcionales (RNF) del producto de la Práctica 3. Cada uno
tiene un criterio de aceptación comprobable. La columna **Verificación** indica si lo cubre
la suite automática (`backend/tests`, marcador `@pytest.mark.req`) o una comprobación manual
documentada; la [matriz de trazabilidad](TRAZABILIDAD.md) se genera al ejecutar las pruebas
y enlaza cada requisito con sus pruebas y su resultado.

## Requisitos funcionales

| ID | Requisito | Criterio de aceptación | Verificación |
|---|---|---|---|
| RF-01 | Autenticación de usuarios | Con credenciales válidas se abre sesión (JWT en cookies); con inválidas, 401. El cierre de sesión revoca el token y el *refresh* exige su cookie. | Automática |
| RF-02 | Control de acceso por roles | Cada endpoint aplica el rol en el servidor: administrador, analista, reportero y lector; una acción no permitida devuelve 403. | Automática |
| RF-03 | Gestión de usuarios | El administrador crea, edita y elimina usuarios; el rol se valida; no se puede eliminar a uno mismo, al usuario de sistema de la IA ni dejar la plataforma sin administradores. | Automática |
| RF-04 | Invitaciones de un solo uso | El administrador genera un enlace de activación (24 h) con el que el invitado fija su contraseña; el enlace no sirve dos veces, caduca y solo se guarda su hash. | Automática |
| RF-05 | Ingesta de alertas de Wazuh | El webhook solo acepta peticiones con el secreto compartido o firma HMAC. | Automática |
| RF-06 | Gestión de incidentes | Se crean, cambian de fase y se resuelven con clasificación (verdadero/falso positivo, benigno); cada cambio queda en el historial. | Automática |
| RF-07 | Runbooks de respuesta | Se consultan, crean y editan procedimientos con las 5 fases NIST SP 800-61; los datos se validan y los nombres son únicos. La semilla añade los que faltan sin duplicar. | Automática |
| RF-08 | Chat de equipo | Canal global y mensajes directos que solo leen sus dos participantes; adjuntos con tipo y tamaño validados; «vaciar chat» es por usuario y persistente. | Automática |
| RF-09 | Presencia y sesiones | Se muestra quién está conectado, con dispositivo y tipo de red; la IP solo la ven el administrador y el propio usuario. | Automática |
| RF-10 | Informes con integridad | Los informes quedan guardados con identificador, clasificación TLP y huella SHA-256 verificable; cualquier cambio del contenido cambia la huella. | Automática |
| RF-11 | Threat hunting | Se ejecutan consultas predefinidas sobre el SIEM; identificadores y ventanas de tiempo fuera de rango se rechazan. | Automática |
| RF-12 | Inteligencia de vulnerabilidades | Las CVE explotadas se priorizan con una fórmula documentada (KEV 40 + CVSS×4 + exploit público 15 + ransomware 5, máx. 100). | Automática |
| RF-13 | Bloqueo de IPs | Una IP se bloquea en Wazuh (lista CDB + respuesta activa); si Wazuh no lo confirma, no se registra como bloqueada. | Automática |
| RF-14 | Métricas del SOC | MTTR, antigüedad de abiertos, tasa de resolución y cobertura ATT&CK se calculan a partir de los datos reales (MTTR desde la fecha de resolución). | Automática |
| RF-15 | Asistente de IA local | El asistente responde en el chat con el modelo local y un glosario del SOC; las cifras de informes y paneles nunca las genera la IA. | Manual: `@ia` en el chat y resumen del día (vídeo de la demo) |
| RF-16 | Acceso remoto por VPN | Con Tailscale, la consola se publica solo por HTTPS; cada sesión muestra la cuenta y el dispositivo de la VPN y se alerta si no coincide con la vinculada. | Automática (red e identidad) + Manual: acceso desde el móvil |

## Requisitos no funcionales

| ID | Requisito | Criterio de aceptación | Verificación |
|---|---|---|---|
| RNF-01 | Protección CSRF y de sesión | Toda petición que modifica datos exige el par cookie/cabecera CSRF; las cookies son `HttpOnly` y `Secure` cuando se entra por HTTPS. | Automática |
| RNF-02 | IP real no falsificable | La IP del cliente solo se toma de `X-Forwarded-For` si la petición llega de un proxy de confianza; lo que añada el cliente se ignora. | Automática |
| RNF-03 | Validación y saneamiento de entradas | Entradas con HTML o fuera de formato se rechazan o se neutralizan (XSS, identificadores, tamaños). | Automática |
| RNF-04 | Auditoría | Cada acción que modifica datos queda registrada con usuario, IP y código de resultado, sin guardar el cuerpo de la petición. | Automática |
| RNF-05 | Datos reales | Ninguna métrica se inventa: sin datos se muestra 0 o «sin datos», y las limitaciones se declaran. | Automática (métricas con BD vacía) + Manual: revisión de paneles |
| RNF-06 | Privacidad | Los mensajes directos no son legibles por terceros (tampoco por el administrador) y la IA corre en local. | Automática |
| RNF-07 | Instalación reproducible | `install.sh` / `install.ps1` instalan desde cero: secretos, certificados, stack, modelo y keystore de Wazuh. | Manual: instalación en máquina limpia |
| RNF-08 | Usabilidad y diseño adaptable | La consola funciona a 390 px (móvil), 1280 px y 1700 px sin desbordes; tema claro y oscuro; ES/EN. | Manual: capturas en `docs/img/readme` |
| RNF-09 | Rendimiento de la API | Las lecturas habituales del panel responden en menos de 1 s con el stack local. | Manual: medición con `curl -w %{time_total}` |
