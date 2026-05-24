---
title: "Monté un mini-SOC en mi portátil con honeypot, Wazuh e IA local — proyecto del Máster en Evolve"
published: false
tags: cybersecurity, python, infosec, networking, linux
cover_image: docs/img/10-dashboard-presentacion.png
organization: Evolve
---

# Monté un mini-SOC en mi portátil con honeypot, Wazuh e IA local — proyecto del Máster en Evolve

Cuando empecé el proyecto final del Máster en Ciberseguridad en [Evolve](https://evolve.es), tenía claro qué *no* quería: otro informe PDF que nadie vuelva a abrir. Quería algo que se viera en una entrevista en treinta segundos — logs reales, alertas que suben solas y una interfaz donde un analista pueda trabajar sin pelearse con veinte pestañas.

Eso acabó siendo **Valhalla SOC**: un centro de operaciones pequeño pero completo, montado con Docker en local, sin mandar datos a la nube.

## El problema que quería resolver

En muchos laboratorios de seguridad practicas con PCAPs viejos o ejercicios ya masticados. Yo quería el ruido de fondo de internet: bots que prueban `root`/`admin`, descargas con `wget`, intentos de persistencia… pero en un entorno controlado, en mi máquina.

La idea era encadenar tres piezas:

1. **Una trampa** que parezca un servidor SSH de verdad.
2. **Un SIEM** que clasifique lo que pasa ahí.
3. **Una capa de análisis** que no dependa de APIs de pago ni de subir alertas a terceros.

## El entorno: de dónde salen los datos

No hay un CSV de Kaggle detrás. El “dataset” son los propios atacantes (y el contenedor de laboratorio que lanza ataques automáticos).

- **Cowrie** escucha en el puerto **2222** y finge ser OpenSSH. Todo queda en JSON: logins, comandos, descargas.
- **Wazuh** lee esos logs, aplica decoders y reglas propias (fuerza bruta, malware, reverse shell, etc.) y los mapea a **MITRE ATT&CK**.
- **OpenSearch** (indexer de Wazuh) guarda el histórico para consultas y dashboards.
- **Ollama** en el host, con **qwen2.5-coder:7b**, recibe las alertas más graves y devuelve un resumen corto — dos frases, sin novela.

Encima monté un **frontend + API** (React y FastAPI) para tickets, workspace tipo kanban, mapa de amenazas, integración con VirusTotal y chat entre operadores. No sustituye a Wazuh Dashboard; lo complementa para el día a día del analista.

El reto técnico no fue solo “que funcione”, sino **que aguante en Windows** (sí, con Docker Desktop, Ollama fuera del compose y el clásico lío del event loop de Python con PostgreSQL async). La primera vez que levanté todo, el backend moría al arrancar y el frontend devolvía 500. Horas perdidas hasta entender que uvicorn en Windows necesita un bucle distinto. Cosas que no salen en los diagramas de arquitectura.

## Cómo lo monté (sin saltarme pasos)

1. **Infra con Docker Compose**: Wazuh manager + indexer + dashboard, Cowrie, Postgres para la app, nginx como puerta de entrada, y un contenedor “attacker” para generar ruido en el laboratorio.
2. **Reglas a medida** en `wazuh_config/rules/` — por ejemplo detección de fuerza bruta (varios fallos en ventana corta), login exitoso en honeypot, descargas con `wget`/`curl`, o intentos de desactivar el firewall.
3. **Integración Ollama** vía script en `wazuh_config/integrations/custom-ollama.py`: solo alertas de nivel ≥ 5, prompt acotado, respuesta indexada como insight adicional.
4. **Backend** con autenticación por cookie httpOnly, CSRF en mutaciones, auditoría de acciones y sincronización de alertas Wazuh → tickets.
5. **UI** con tema oscuro/claro, workspace de incidentes, SIEM propio consultando OpenSearch, y runbooks enlazados a tickets.

Para levantarlo en limpio: clonar repo, copiar `.env.example` a `.env`, `ollama pull qwen2.5-coder:7b`, `docker compose up -d --build`, y los scripts de dashboards/monitores. En el README dejo el detalle; no voy a repetir aquí quince comandos.

## Resultados que sí se pueden enseñar

En una sesión de laboratorio típica (con el honeypot expuesto y el atacante automático corriendo) el sistema se comporta como un SOC en miniatura:

- Miles de eventos en el dashboard de Cowrie — en mis pruebas llegué a ver **más de 12.000 alertas críticas** en la vista dedicada, con timeline y top de IPs.
- Reglas disparando técnicas MITRE concretas (T1110 fuerza bruta, T1105 transferencia de herramientas, T1059 ejecución, etc.).
- **Monitores** en Wazuh cada pocos minutos para brute force, malware, reverse shell, persistencia en crontab…
- Tickets creados desde alertas Wazuh, asignables y movibles por estados en el workspace.
- Respuestas de Ollama del estilo: “están bajando un script desde una IP externa; tratar como intento de implant” — útil como primera lectura, no como veredicto legal.

Capturas que recomiendo subir en el artículo (están en el repo bajo `docs/img/`):

- Dashboard Cowrie en tiempo real (`04-cowrie-honeypot.png`)
- Cobertura MITRE en agente (`02-agente-mitre.png`)
- Pantalla de login de Valhalla (`11-login-valhalla.png`)

## Lo que me llevé (y lo que cambiaría)

**Aprendizajes:**

- Un honeypot enseña más en una tarde que una semana leyendo solo teoría de SIEM.
- La IA local tiene sentido en SOC **si acotas el prompt y el modelo**; no hace falta un LLM gigante para resumir una alerta.
- La parte dura es la **integración** (certificados Wazuh, rutas de logs, webhooks, CORS, CSRF), no el CSS del login.

**Si lo retomara mañana:**

- Endurecería producción (webhooks firmados, websockets autenticados, cero contraseñas por defecto).
- Documentaría un “modo demo” de un solo comando para corrección en clase.
- Separaría más el módulo honeypot del repo principal — ahora todo vive junto y pesa, pero para el máster tenía sentido mostrar el stack entero.

Hice además una auditoría de seguridad sobre el propio código (auth, API, Docker) y salieron hallazgos serios — buena lección: **montar un SOC no te convierte automáticamente en secure by default**.

## Código y cómo reproducirlo

Todo el proyecto está en GitHub, público, con README paso a paso, manual de usuario y capturas:

**Repositorio:** [github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy](https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy)

```bash
git clone https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git
```

Stack principal: **Python · FastAPI · React · Docker · Wazuh · Cowrie · Ollama · PostgreSQL · OpenSearch** (TypeScript ~60 % del código según GitHub).

---

Proyecto académico desarrollado durante el **Máster en Ciberseguridad de [Evolve](https://evolve.es)**. Si estás montando tu primer laboratorio SOC en casa, espero que te ahorre algún tropezón con Docker — o al menos que sepas que no eres el único al que el backend le devuelve 500 un domingo a las once de la noche.

¿Has montado honeypots en clase o en casa? Me interesa saber qué regla fue la primera que te hizo decir “vale, esto ya parece un SOC de verdad”.
