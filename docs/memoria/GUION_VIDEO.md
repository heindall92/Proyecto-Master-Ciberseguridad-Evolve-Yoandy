# Guion del vídeo — Valhalla SOC (Práctica 3)

Duración objetivo: **12 minutos** (mínimo exigido: 10). Grabación de pantalla con voz.
Cada escena indica qué se ve, qué se dice y cuánto dura. Los tiempos son orientativos.

## Antes de grabar

- Arrancar todo con **`Arrancar Valhalla.bat`** al menos 10 minutos antes, para que Wazuh tenga datos recientes.
- Iniciar sesión en Valhalla como `admin` (fuera de cámara) y dejar abiertas dos pestañas:
  - la consola de Valhalla: `http://192.168.235.130:3000`;
  - la consola de Wazuh: `https://192.168.235.130:5601`.
- Abrir un terminal con el repositorio, para la escena de pruebas.
- Tener el móvil con Tailscale activado, para la escena del acceso remoto.
- **No mostrar nunca el `.env`** ni ninguna contraseña. Si hay que teclear una, hacerlo con la grabación en pausa.
- Navegador a pantalla completa, zoom al 100 %, notificaciones del sistema silenciadas.

---

## 1. Presentación — 0:00 a 0:45

**En pantalla:** portada del README en GitHub (cabecera de ondas) y, después, la pantalla de login de Valhalla.

**Voz:**
> Somos el grupo de Valhalla SOC. En las prácticas anteriores construimos un prototipo de centro de operaciones de seguridad. En esta práctica el reto era convertirlo en un producto: que cualquiera pueda instalarlo desde cero, que no muestre datos inventados, que su seguridad esté analizada y que cada requisito tenga una prueba. Os enseñamos el resultado.

## 2. Arquitectura — 0:45 a 1:45

**En pantalla:** README → sección *Arquitectura* (diagrama y tabla de contenedores).

**Voz:**
> Todo corre en local con Docker. Un honeypot, Cowrie, recibe ataques reales. Wazuh los detecta con reglas propias mapeadas a MITRE ATT&CK y los guarda en su indexador. Nuestro backend en FastAPI lee el SIEM, abre incidentes y calcula métricas, y la consola en React lo presenta a los analistas. La IA también es local, con Ollama: ningún dato del SOC sale de la máquina. El atacante del laboratorio está aislado en su propia red y solo ve el honeypot.

## 3. Instalación y arranque — 1:45 a 2:45

**En pantalla:** README → *Arranque rápido*. Después, el doble clic en `Arrancar Valhalla.bat` y su ventana con los cinco pasos en verde.

**Voz:**
> La instalación es un solo comando: `./install.sh`. Genera secretos únicos y certificados propios, levanta el stack, descarga el modelo de IA y configura Wazuh. Lo probamos desde un clon limpio del repositorio público y tardó cinco minutos. En el día a día usamos este lanzador: enciende la máquina virtual, comprueba que todo responde y abre la consola.

## 4. Vista general y SIEM — 2:45 a 3:45

**En pantalla:** *Vista general* (tarjetas, volumen, severidad, atacantes) → *SIEM* (alertas en vivo, panel ATT&CK).

**Voz:**
> La vista general resume el periodo: alertas, críticas, agentes e incidentes abiertos. Todo sale del SIEM; si falta un dato, la consola lo dice en vez de inventarlo. En el SIEM vemos las alertas en directo y las técnicas ATT&CK observadas: fuerza bruta y acceso con credenciales válidas.

## 5. Ataque en directo — 3:45 a 5:00

**En pantalla:** terminal a un lado y consola al otro. Lanzar un ataque contra el honeypot:

```bash
ssh root@192.168.235.130 -p 2222
```

Probar cuatro o cinco contraseñas incorrectas (`123456`, `admin`, `password`…). Después, en Valhalla: *SIEM* (aparecen los intentos fallidos y salta la regla de fuerza bruta) → *Honeypots* → abrir la sesión para ver la reconstrucción paso a paso.

**Voz:**
> Vamos a atacar el honeypot en directo. Cada contraseña llega a Wazuh en segundos; tras varios fallos salta nuestra regla de fuerza bruta. En Honeypots vemos la sesión reconstruida: qué usuario y qué contraseñas probó el atacante, y qué reglas saltaron.

## 6. Respuesta a incidentes — 5:00 a 6:30

**En pantalla:** desde la alerta, botón **+ INC** → *Workspace* (kanban) → abrir el incidente → *Runbooks* (Brute Force SSH/Telnet) → volver a la alerta y pulsar **BLOCK** → resolver con clasificación.

**Voz:**
> Desde la alerta abrimos un incidente. En el Workspace se sigue su ciclo: triaje, investigación, contención y resolución, con SLA y un historial de cada cambio. El runbook nos guía con las cinco fases de NIST 800-61 y comandos reales. Bloqueamos la IP: Valhalla lo aplica en Wazuh, y si Wazuh no lo confirma no lo da por bloqueado. Al cerrar, clasificamos el incidente; los falsos positivos cuentan en las métricas.

## 7. Inteligencia y activos — 6:30 a 7:15

**En pantalla:** *Inteligencia* → pestaña *Vulnerabilidades* (CVE de CISA KEV priorizadas) → *Activos* (equipo con sus vulnerabilidades reales).

**Voz:**
> En Inteligencia priorizamos las vulnerabilidades explotadas del catálogo de CISA con una fórmula documentada: si está explotada, su CVSS, si hay exploit público y si la usa el ransomware. En Activos vemos las vulnerabilidades reales de cada equipo, detectadas por el escáner de Wazuh.

## 8. Métricas y caza de amenazas — 7:15 a 8:00

**En pantalla:** *Bifröst* (MTTR, antigüedad, resolución, cobertura ATT&CK) → ejecutar la consulta *Credenciales que funcionaron*.

**Voz:**
> Bifröst calcula las métricas del SOC con datos reales: el MTTR usa la fecha de resolución, no la de la última modificación. Y tiene consultas de caza de amenazas, como las credenciales con las que el atacante consiguió entrar.

## 9. Informes y cumplimiento — 8:00 a 9:00

**En pantalla:** *Informes* → generar un *Informe SOC* (TLP AMBER, sin IA) → mostrar la huella SHA-256 y pulsar el icono de verificación (escudo) → pestaña *Informe GRC* (matriz de riesgo, radar NIST CSF, multinorma).

**Voz:**
> Los informes se generan con datos del periodo y quedan congelados con una huella SHA-256: si alguien los altera, la verificación lo detecta. El Informe GRC traduce lo técnico a gobierno: matriz de riesgo, madurez NIST CSF 2.0, plan de tratamiento y correspondencia con ENS, ISO 27001, NIS2 e ISO 42001.

## 10. Trabajo en equipo y acceso remoto — 9:00 a 10:15

**En pantalla:** *Usuarios* (roles, sesiones por dispositivo y red) → *Nuevo usuario* → *Crear e invitar* (mostrar el panel de invitación, con el enlace enmascarado) → chat: escribir `@ia resumen del día` → coger el móvil con Tailscale, abrir `https://valhalla-soc.taila31e7d.ts.net` y enseñar el aviso en directo que aparece en el PC.

**Voz:**
> Valhalla está pensado para varios analistas a la vez, con roles comprobados en el servidor. Para dar de alta a alguien generamos una invitación de un solo uso: el invitado elige su contraseña y solo guardamos la huella del enlace. El chat tiene canal de equipo, mensajes privados y un asistente de IA local. Y desde el móvil se entra solo por HTTPS a través de la VPN: en cuanto alguien inicia sesión, los administradores ven quién es, desde qué dispositivo y con qué cuenta de VPN.

## 11. Seguridad y calidad — 10:15 a 11:15

**En pantalla:** `docs/STRIDE.md` (tabla de hallazgos corregidos) → terminal ejecutando:

```bash
bash scripts/run_tests.sh
```

Mostrar `57 passed` → abrir `docs/TRAZABILIDAD.md`.

**Voz:**
> Revisamos el propio SOC con mentalidad de atacante, con un análisis STRIDE. Encontramos credenciales de fábrica en Wazuh, certificados publicados en el repositorio y el laboratorio de ataque con acceso a la base de datos. Todo está corregido, y el historial de Git limpio. Las dependencias pasaron de decenas de vulnerabilidades a cero. Y cada requisito tiene pruebas: 57 automáticas que generan la matriz de trazabilidad.

## 12. Cierre — 11:15 a 12:00

**En pantalla:** README → *Limitaciones conocidas* → vuelta a la Vista general.

**Voz:**
> Valhalla SOC termina esta práctica como un producto instalable, auditado y verificable, con sus limitaciones documentadas, como la IA en CPU o el catálogo de vulnerabilidades fijado a una instantánea. La lección que nos llevamos es que las herramientas de seguridad también tienen superficie de ataque, y que un SOC debe pasar el mismo análisis que exige a lo que vigila. Gracias.

---

## Comprobación antes de entregar

- [ ] Dura 10 minutos o más.
- [ ] No aparece ninguna contraseña, ni el `.env`, ni datos personales (correos reales, IPs públicas propias).
- [ ] Se ve un ataque real detectado de principio a fin.
- [ ] Se muestran las pruebas (`57 passed`) y la matriz de trazabilidad.
- [ ] El audio se entiende y el texto de la pantalla es legible: grabar a 1080p.
