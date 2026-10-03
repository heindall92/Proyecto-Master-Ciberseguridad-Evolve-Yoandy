"""Versión de ≤ 15 minutos del guion: mismas escenas y mismas tomas, texto condensado.

Se quita «Cambios respecto a la Práctica 1» (lo cubre «Del prototipo al producto»). El número de
frases de cada escena se mantiene donde las animaciones dependen de él (equipo, arquitectura…).
"""
import json

from comun import GUION

g = json.loads(GUION.read_text(encoding="utf-8"))
F = {
    "s01_portada": [
        "Hola. Soy Yoandy Ramírez y os presento Valhalla SOC, el proyecto del grupo Proyecto Valhalla para la Práctica 3 del máster en Ciberseguridad de Evolve.",
        "Es un centro de operaciones de seguridad completo que cabe en un portátil: detecta ataques reales, los investiga con inteligencia artificial local y los convierte en informes que se pueden defender.",
    ],
    "s02_equipo": [
        "Somos cinco. Santiago Visso, jefe de proyecto, coordinó el grupo y montó el laboratorio de ataque.",
        "Julieta Tenti creó el generador de informes ejecutivos.",
        "Rosalino Martínez hizo las integraciones de inteligencia artificial.",
        "Santiago de Prada, el honeypot Cowrie y la simulación de ataques.",
        "Y yo me he ocupado de la arquitectura, el desarrollo y la integración. Hoy lo presento en nombre de todo el equipo.",
    ],
    "s03_problema": [
        "Un equipo pequeño no puede permitirse un SOC comercial, pero los ataques le llegan igual.",
        "Las herramientas abiertas, como Wazuh, existen, pero están sueltas: alguien tiene que unirlas y convertir las alertas en una respuesta.",
        "Valhalla las une en un producto que se instala con un comando, y donde todo corre en local, incluida la inteligencia artificial.",
    ],
    "s04_reto": [
        "En las prácticas anteriores construimos un prototipo.",
        "Tenía datos de ejemplo, solo se instalaba en nuestra máquina, había secretos en el historial y ninguna prueba.",
        "El reto era convertirlo en un producto: instalable desde cero, sin datos inventados, con la seguridad analizada y cada requisito probado.",
        "Y una regla para todo: si falta un dato, la interfaz lo dice.",
    ],
    "s05_cifras": [
        "En números: veinticinco requisitos.",
        "Ciento dieciocho pruebas automáticas superadas.",
        "Cero vulnerabilidades conocidas en las dependencias, y once secciones rediseñadas.",
    ],
    "s06_requisitos": [
        "Cada requisito tiene un criterio de aceptación comprobable.",
        "Dieciséis funcionales cubren el ciclo completo de un SOC: autenticación y roles, incidentes, informes, caza de amenazas, bloqueo de IPs, asistente de IA y acceso por VPN.",
        "Nueve no funcionales fijan cómo debe comportarse: seguridad de sesión, validación, auditoría, privacidad, instalación reproducible, diseño adaptable y rendimiento.",
        "Durante la demo, arriba a la derecha, veréis qué requisito se está demostrando.",
    ],
    "s08_arquitectura": [
        "Todo corre en local con Docker Compose.",
        "El atacante llega a Cowrie, un honeypot SSH y Telnet que registra cada contraseña y cada comando.",
        "Wazuh aplica nuestras reglas, mapeadas a MITRE ATT&CK, y guarda las alertas en el indexador.",
        "El backend en FastAPI lee el SIEM, abre incidentes y calcula las métricas, con PostgreSQL.",
        "La consola, en React, lo presenta por REST y WebSocket.",
        "La inteligencia artificial es un modelo Qwen de tres mil millones de parámetros, servido por Ollama.",
        "Y Tailscale publica la consola solo por HTTPS, a través de una VPN.",
    ],
    "s09_contenedores": [
        "Cada pieza expone lo mínimo.",
        "La base de datos y el indexador solo están en la red interna; la API de Wazuh y Ollama, en localhost.",
        "El atacante del laboratorio vive en su propia red aislada.",
        "La inteligencia artificial redacta, pero nunca aporta cifras.",
        "Y la autorización se decide siempre en el servidor.",
    ],
    "s10_instalacion": [
        "Todo se instala con un solo comando: install punto sh, o install punto ps1 en Windows.",
        "Genera secretos y certificados propios, levanta el stack, descarga el modelo y configura Wazuh.",
        "Desde un clon limpio, el primer intento falló por los permisos de ejecución en Git. Lo corregimos, y la instalación terminó en cinco minutos.",
    ],
    "s10b_arranque": [
        "En el día a día, un lanzador lo arranca todo con un doble clic.",
        "Docker compose confirma los doce contenedores en marcha, y el backend responde.",
    ],
    "s11_login": [
        "Empezamos la demostración por el acceso.",
        "La sesión viaja en cookies HttpOnly, con un token JWT y protección CSRF.",
        "Con una contraseña incorrecta la consola lo indica, y los intentos se limitan por IP.",
    ],
    "s12_vista_general": [
        "La vista general resume el periodo: alertas, críticas, agentes e incidentes abiertos.",
        "Debajo, las alertas de Wazuh, el volumen, la severidad y los atacantes.",
        "Todo sale del SIEM. Esa regla destapó un fallo: el backend generaba unas dos mil cuatrocientas sesiones falsas al día al comprobar el honeypot. Lo corregimos, y limpiamos el SIEM.",
    ],
    "s13_siem": [
        "En el SIEM, las alertas llegan en directo por un webhook con secreto o firma HMAC.",
        "Podemos filtrarlas y agrupar las similares.",
        "Abrimos una crítica: acceso tras fuerza bruta, con su evento original y sus técnicas de ATT&CK.",
        "Con «escalar», se convierte en un incidente.",
    ],
    "s14_ataque": [
        "Ahora, un ataque real desde el contenedor atacante.",
        "Nmap encuentra el SSH y el Telnet del honeypot, e hydra prueba contraseñas típicas.",
        "Cada intento llega a Wazuh en segundos, y salta nuestra regla de fuerza bruta. Es actividad real, no datos simulados.",
    ],
    "s15_honeypots": [
        "En Honeypots vemos ese ataque desde el señuelo.",
        "Sesiones, intentos fallidos, accesos logrados y actividad por hora.",
        "Y las credenciales más probadas por los atacantes.",
    ],
    "s16_workspace": [
        "En el Workspace aparece el incidente escalado, en un tablero con las fases de respuesta.",
        "Arriba, los indicadores del equipo: fuera de SLA, sin asignar y tiempo de resolución.",
        "Lo pasamos a investigación, anotamos los hallazgos, y el caso nos sugiere el runbook adecuado.",
        "Cada cambio queda en el historial. Al resolverlo lo clasificamos como verdadero positivo, y eso alimenta las métricas.",
    ],
    "s17_runbooks": [
        "Hay veinte runbooks, con las cinco fases de NIST 800-61 y comandos reales.",
        "El de fuerza bruta SSH tiene doce pasos. Se pueden crear y editar, con validación.",
    ],
    "s18_bloqueo": [
        "Contención: bloqueamos la IP atacante. Como es destructivo, hay que mantener pulsado.",
        "Valhalla lo aplica en Wazuh, y si Wazuh no lo confirma, no lo da por bloqueado: preferimos avisar de un fallo a mostrar una protección que no existe.",
    ],
    "s19_inteligencia": [
        "En Inteligencia están las CVE explotadas del catálogo KEV de CISA.",
        "Se priorizan con una fórmula documentada: explotación, CVSS, exploit público y uso en ransomware.",
        "Y desde indicadores se consulta la reputación de una IP, un dominio o un hash, y el mapa sitúa a los atacantes.",
    ],
    "s20_activos": [
        "En Activos, los equipos con agente de Wazuh y sus vulnerabilidades reales.",
        "El escáner no analizaba nada por un catálogo desfasado; cargamos una instantánea reciente, y aparecieron las doce vulnerabilidades reales del equipo.",
    ],
    "s21_bifrost": [
        "Bifröst calcula las métricas: MTTR, antigüedad, tasa de resolución y cobertura de ATT&CK.",
        "El MTTR usa la fecha real de resolución, y la cobertura, un treinta por ciento, se muestra tal cual.",
        "Y tiene siete consultas de caza: aquí, las credenciales con las que el atacante consiguió entrar.",
    ],
    "s22_informes": [
        "En Informes generamos un informe SOC del periodo, con su clasificación TLP.",
        "Queda congelado con una huella SHA-256, y el escudo verifica que nadie lo ha alterado.",
        "La IA puede añadir un resumen, pero las cifras las calcula siempre el backend.",
    ],
    "s23_grc": [
        "El informe GRC lo traduce a gobierno y riesgo: matriz de riesgo, madurez NIST CSF 2.0 y plan de tratamiento.",
        "Con correspondencia con el ENS, ISO 27001, NIS2 e ISO 42001.",
    ],
    "s24_usuarios": [
        "En Usuarios hay cuatro roles, comprobados en cada endpoint del servidor.",
        "Vemos quién está conectado, desde qué dispositivo y por qué red.",
        "Damos de alta a un analista con una invitación de un solo uso, que caduca en veinticuatro horas; solo guardamos la huella del enlace.",
        "Después la anulamos, y eliminamos al usuario manteniendo pulsado.",
    ],
    "s24b_perfil": [
        "Cada analista tiene su perfil: sus incidentes, su actividad en la auditoría y su sesión actual, con dispositivo e IP.",
        "También ve sus otras sesiones abiertas, y puede cambiar su contraseña.",
    ],
    "s25_chat": [
        "El chat tiene canal de equipo y mensajes directos que ni el administrador puede leer.",
        "Si escribimos arroba IA, responde el asistente local, con un glosario del SOC para no inventar términos.",
        "Este requisito se verifica a mano, porque la respuesta de un modelo no es determinista.",
    ],
    "s25b_apariencia": [
        "Cada analista elige su color de acento, tema claro u oscuro, e idioma.",
        "La interfaz cambia al instante, sin recargar.",
    ],
    "s25c_busqueda": [
        "Con control K se salta a cualquier sección.",
        "Y la campana avisa de los incidentes pendientes, para asignárselos o ir al Workspace.",
    ],
    "s26_sistema": [
        "En Sistema, la salud y la latencia de cada integración.",
        "Y los monitores de detección y el registro de auditoría.",
    ],
    "s27_movil": [
        "En el móvil, la consola se adapta a trescientos noventa píxeles.",
        "Desde fuera se entra por Tailscale, solo por HTTPS, con un cortafuegos que cierra a la VPN los puertos de Docker.",
        "Cada sesión muestra la cuenta de VPN, y si no coincide con la vinculada, los administradores reciben un aviso.",
    ],
    "s28_errores": [
        "¿Y cuando algo va mal?",
        "Sin token CSRF, la petición se rechaza; sin permisos, un 403; con HTML, se neutraliza.",
        "Una IP falsificada en la cabecera X-Forwarded-For se ignora si no viene de un proxy de confianza.",
        "Si un servicio cae, Sistema lo indica, y cada escritura queda auditada, sin guardar el cuerpo de la petición.",
    ],
    "s29_stride": [
        "Analizamos el propio SOC con un modelo STRIDE.",
        "Para cada categoría documentamos las amenazas, la mitigación, la prueba y el riesgo residual.",
    ],
    "s30_hallazgos": [
        "Y encontramos fallos reales.",
        "La API de Wazuh tenía la credencial de fábrica, y los usuarios de demostración del indexador, contraseñas públicas.",
        "Había claves privadas en el repositorio: reescribimos el historial, y cada instalación genera las suyas.",
        "Y el atacante compartía red con la base de datos; ahora está aislado. Todo está corregido.",
    ],
    "s31_dependencias": [
        "En las dependencias, pip-audit encontró once paquetes vulnerables.",
        "Npm audit, veintiséis avisos, y Trivy, cuarenta y nueve en la imagen. Hoy, cero.",
        "Y la integración continua lo repite en cada cambio y cada lunes.",
    ],
    "s32_pruebas": [
        "Las pruebas: al empezar había diecisiete, y once no arrancaban.",
        "Hoy el backend tiene sesenta y dos, etiquetadas por requisito y sin tocar datos reales: sesenta y dos de sesenta y dos, superadas.",
        "Más cincuenta y seis en la consola, y GitHub Actions lo ejecuta todo en cada cambio.",
    ],
    "s33_trazabilidad": [
        "La matriz de trazabilidad cubre los veinticinco requisitos.",
        "Veintidós con pruebas automáticas, y tres con verificación manual documentada.",
    ],
    "s34_limitaciones": [
        "Las limitaciones también forman parte del producto.",
        "El catálogo de vulnerabilidades es una instantánea, la red local va por HTTP, la IA es lenta en CPU y la auditoría vive en la misma base de datos.",
        "Como trabajo futuro: actualización automática, TLS en la red local, GPU, auditoría exportada y pruebas de extremo a extremo.",
    ],
    "s35_cierre": [
        "Valhalla SOC termina como un producto instalable, auditado y verificable.",
        "Un producto no es añadir funciones, sino demostrar que funcionan, son seguras y dicen la verdad.",
        "Un SOC debe pasar el mismo análisis que exige a lo que vigila.",
        "Gracias. El código está en el repositorio, con la etiqueta v1.0-practica3.",
    ],
}
g["escenas"] = [e for e in g["escenas"] if e["id"] != "s07_cambios"]
for e in g["escenas"]:
    e["frases"] = F[e["id"]]
    if e["id"] == "s02_equipo":
        for m in e["visual"]["miembros"]:
            if m["nombre"].startswith("Yoandy"):
                m["foto"] = "marca/yoandy.png"   # solo la propia: no usamos la imagen de nadie sin su permiso
    if e["id"] == "s30_hallazgos":
        for it, en in zip(e["visual"]["items"], (1, 1.5, 2, 3)):
            it["en"] = en
GUION.write_text(json.dumps(g, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(len(g["escenas"]), "escenas ·", sum(len(" ".join(e["frases"]).split()) for e in g["escenas"]), "palabras")
