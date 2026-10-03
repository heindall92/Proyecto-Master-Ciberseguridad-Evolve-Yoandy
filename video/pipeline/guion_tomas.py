"""Pasa las escenas de demostración del guion a grabaciones reales (visual «toma») y añade las
escenas nuevas (arranque, perfil, apariencia, búsqueda). Se ejecuta una vez; es idempotente."""
import json

from comun import GUION

g = json.loads(GUION.read_text(encoding="utf-8"))
E = {e["id"]: e for e in g["escenas"]}

TOMAS = {
    "s10_instalacion": ("term_instalacion", "Instalación desde el repositorio público"),
    "s11_login": ("login", "Acceso"),
    "s12_vista_general": ("vista_general", "Vista general"),
    "s13_siem": ("siem", "SIEM: alertas en directo"),
    "s14_ataque": ("term_ataque", "Ataque real al honeypot"),
    "s15_honeypots": ("honeypots", "Honeypots"),
    "s16_workspace": ("workspace", "Workspace: ciclo del incidente"),
    "s17_runbooks": ("runbooks", "Runbooks NIST 800-61"),
    "s18_bloqueo": ("bloqueo", "Contención: bloqueo de la IP"),
    "s19_inteligencia": ("inteligencia", "Inteligencia de amenazas"),
    "s20_activos": ("activos", "Activos"),
    "s21_bifrost": ("bifrost", "Bifröst: métricas y caza"),
    "s22_informes": ("informes", "Informe SOC con huella SHA-256"),
    "s23_grc": ("grc", "Informe GRC"),
    "s24_usuarios": ("usuarios", "Usuarios, roles e invitaciones"),
    "s25_chat": ("chat", "Chat de equipo y asistente IA"),
    "s26_sistema": ("sistema", "Sistema"),
    "s27_movil": ("movil", None),
    "s32_pruebas": ("term_pruebas", "Pruebas automáticas"),
}
for sid, (clip, rotulo) in TOMAS.items():
    vis = {"tipo": "toma", "clip": clip, "rotulo": rotulo}
    if sid == "s27_movil":
        vis["puntos"] = E[sid]["visual"].get("puntos", [])
    E[sid]["visual"] = vis

# Textos ajustados a lo que se ve en la grabación real
E["s13_siem"]["frases"] = [
    "En la sección SIEM vemos las alertas en directo, con filtros por periodo y agrupación de alertas similares.",
    "Las alertas llegan por un webhook que solo acepta peticiones con el secreto compartido, o con firma HMAC. Es el requisito funcional cinco.",
    "Abrimos una alerta crítica: acceso tras fuerza bruta. Vemos la regla, el nivel, el evento original de Cowrie y sus técnicas de MITRE ATT&CK: cuentas válidas y fuerza bruta.",
    "Con el botón «escalar», la alerta se convierte en un incidente. Lo seguiremos en el Workspace.",
]
E["s14_ataque"]["frases"] = [
    "Ahora, un ataque real, lanzado desde el contenedor atacante, que vive en su propia red aislada.",
    "Primero, un escaneo con nmap: los puertos 2222 y 2223 del honeypot responden como SSH y Telnet. Después, fuerza bruta con hydra contra el SSH, probando contraseñas típicas.",
    "Cada intento llega a Wazuh en segundos. Tras varios fallos salta nuestra regla de fuerza bruta, y si el atacante consigue entrar después, se dispara la regla crítica de acceso tras fuerza bruta.",
    "Es actividad registrada por el honeypot y detectada por Wazuh, no datos simulados en la consola.",
]
E["s16_workspace"]["frases"] = [
    "En el Workspace aparece el incidente que acabamos de escalar. Es un tablero kanban con las fases de respuesta: triaje, investigación, contención y resuelto.",
    "Arriba, los indicadores del equipo: activos, fuera de SLA, sin asignar, tiempo medio de resolución y falsos positivos.",
    "Abrimos el caso, lo pasamos a investigación y anotamos los hallazgos. El propio incidente sugiere el runbook adecuado: fuerza bruta SSH y Telnet.",
    "Cada cambio de fase queda en el historial del incidente. Al resolverlo, se clasifica como verdadero positivo, falso positivo o benigno, y esa clasificación alimenta las métricas.",
]
E["s18_bloqueo"]["frases"][0] = ("Contención: bloqueamos la IP atacante con el botón «block». Es una acción destructiva, "
                                 "así que exige mantener pulsado el botón.")

NUEVAS = {
    "s10_instalacion": {
        "id": "s10b_arranque", "bloque": "arquitectura", "titulo": "El stack en marcha", "req": ["RNF-07"],
        "visual": {"tipo": "toma", "clip": "term_stack", "rotulo": "Los servicios en marcha"},
        "frases": [
            "En el día a día no hace falta repetir la instalación: un lanzador para Windows enciende la máquina virtual y el stack con un doble clic.",
            "En la terminal, docker compose confirma los doce contenedores en marcha, y el backend responde a su comprobación de salud.",
        ],
    },
    "s24_usuarios": {
        "id": "s24b_perfil", "bloque": "demo", "titulo": "Perfil del analista", "req": ["RF-09", "RF-01"],
        "visual": {"tipo": "toma", "clip": "perfil", "rotulo": "Mi perfil"},
        "frases": [
            "Cada analista tiene su perfil: los incidentes que tiene asignados y los que ha resuelto, y sus acciones registradas en la auditoría.",
            "Ve su sesión actual, con el dispositivo, la IP y la duración del token, y todas las sesiones que tiene abiertas en otros dispositivos.",
            "Desde aquí cambia su contraseña, y consulta su rastro de actividad reciente.",
        ],
    },
    "s25_chat": [
        {
            "id": "s25b_apariencia", "bloque": "demo", "titulo": "Apariencia e idioma", "req": ["RNF-08"],
            "visual": {"tipo": "toma", "clip": "apariencia", "rotulo": "Tema, color e idioma"},
            "frases": [
                "La consola se adapta a cada analista: nueve colores de acento, tema claro u oscuro, y español o inglés.",
                "Las preferencias se guardan en el navegador de cada uno, y la interfaz cambia al instante, sin recargar.",
            ],
        },
        {
            "id": "s25c_busqueda", "bloque": "demo", "titulo": "Búsqueda y notificaciones", "req": [],
            "visual": {"tipo": "toma", "clip": "busqueda", "rotulo": "Búsqueda global y avisos"},
            "frases": [
                "Para moverse rápido, la búsqueda global se abre con control K: se escribe el nombre de una sección o de una acción, y se salta directamente.",
                "Y la campana de notificaciones avisa de los incidentes pendientes: desde ahí el analista puede asignárselos, o ir directamente al Workspace.",
            ],
        },
    ],
}
ids = [e["id"] for e in g["escenas"]]
for despues, nuevas in NUEVAS.items():
    for n in (nuevas if isinstance(nuevas, list) else [nuevas]):
        if n["id"] in ids:
            continue
        pos = ids.index(despues) + 1
        while pos < len(ids) and ids[pos].startswith(despues.split("_")[0]):
            pos += 1
        g["escenas"].insert(pos, n)
        ids.insert(pos, n["id"])

GUION.write_text(json.dumps(g, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(len(g["escenas"]), "escenas:", " ".join(ids))
