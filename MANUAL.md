# 📖 Manual de Usuario — Valhalla SOC

---

## Introducción

Este manual explica paso a paso cómo instalar, configurar y usar **Valhalla SOC**, un Centro de Operaciones de Seguridad basado en software libre.

**¿A quién va dirigido?**  
A cualquier persona con conocimientos básicos de informática. No se necesita experiencia en ciberseguridad ni en programación. Se explica todo desde cero.

---

## Parte 1: Instalación

### 1.1 Instalar Docker Desktop

Docker es el programa que ejecuta todos los servicios de Valhalla SOC dentro de "contenedores" (cajas aisladas).

**Windows:**
1. Ve a https://www.docker.com/products/docker-desktop
2. Haz clic en "Download for Windows"
3. Ejecuta el instalador (siguiente, siguiente, finalizar)
4. Reinicia el ordenador si te lo pide
5. Abre Docker Desktop — debe mostrar "Docker is running" (Docker está corriendo)

**Linux (Ubuntu/Debian/Kali):**
```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin -y
sudo systemctl start docker
sudo systemctl enable docker
# Añadir tu usuario al grupo docker (para no usar sudo)
sudo usermod -aG docker $USER
# Cierra sesión y vuelve a entrar para que tome efecto
```

**Verificar que funciona:**
```bash
docker --version
# Debe mostrar algo como: Docker version 24.x.x
```

---

### 1.2 Instalar Ollama (la IA local)

Ollama es el programa que ejecuta la inteligencia artificial en tu ordenador.

**Windows/Mac:**
1. Ve a https://ollama.ai/download
2. Descarga e instala
3. Ollama se inicia automáticamente y aparece un icono en la barra del sistema

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Descargar el modelo de IA** (solo la primera vez, ~4.5 GB):
```bash
ollama pull qwen2.5-coder:7b
```

**Verificar que funciona:**
```bash
# En una terminal:
ollama list
# Debe mostrar: qwen2.5-coder:7b

# Probar la IA:
ollama run qwen2.5-coder:7b "Di hola en español"
# Debe responder en español
```

---

### 1.3 Instalar Git y Python

**Git** (para descargar el proyecto):
- Windows: https://git-scm.com/downloads
- Linux: `sudo apt install git -y`

**Python 3** (para los scripts de configuración):
- Windows: https://www.python.org/downloads/ (marcar "Add to PATH")
- Linux: Ya viene instalado (`python3 --version`)

---

### 1.4 Descargar el proyecto

```bash
git clone https://github.com/saantiidp/Valhalla-SOC.git
cd Valhalla-SOC
```

---

## Parte 2: Configuración

### 2.1 Variables de entorno

```bash
# Copiar el archivo de ejemplo
# Windows (PowerShell):
Copy-Item .env.example .env

# Linux/Mac:
cp .env.example .env
```

El archivo `.env` contiene las contraseñas. **Para pruebas locales**, los valores por defecto (`admin/admin`) funcionan perfectamente. Para producción, cámbialos.

### 2.2 Certificados SSL

Los certificados cifran la comunicación entre servicios. Ya vienen incluidos para pruebas. Para generarlos de nuevo:

```bash
docker run --rm \
  -v ./config/wazuh_indexer_ssl_certs:/certificates \
  -v ./config/certs.yml:/config/certs.yml \
  wazuh/wazuh-certs-generator:0.0.2 \
  -A /config/certs.yml
```

---

## Parte 3: Puesta en Marcha

### 3.1 Levantar los servicios

```bash
# Asegúrate de que Docker Desktop está abierto y corriendo
# Asegúrate de que Ollama está corriendo (ollama serve)

# Levantar todo (primera vez tarda 5-10 minutos descargando imágenes)
docker compose up -d
```

**¿Qué acaba de pasar?** Docker ha creado 4 "máquinas virtuales ligeras":

| Contenedor | Qué hace | RAM máx. |
|---|---|---|
| `wazuh.indexer` | Almacena todas las alertas (base de datos) | 2 GB |
| `wazuh.manager` | Lee logs, aplica reglas, genera alertas | 2.5 GB |
| `wazuh.dashboard` | Interfaz web con gráficas y tablas | 1.5 GB |
| `valhalla-cowrie` | Honeypot SSH/Telnet (la trampa) | 512 MB |

### 3.2 Verificar que todo está corriendo

```bash
docker compose ps
```

Debes ver los 4 servicios en estado **Running**:
```
NAME                 STATUS    PORTS
wazuh-indexer        Running   9200/tcp
wazuh-manager        Running   1514/tcp, 1515/tcp, 514/udp, 55000/tcp
wazuh-dashboard      Running   443/tcp
valhalla-cowrie      Running   2222/tcp, 2223/tcp
```

**Si alguno NO está Running:**
```bash
# Ver qué pasó con un servicio específico
docker compose logs wazuh.indexer
docker compose logs wazuh.manager
docker compose logs wazuh.dashboard
docker compose logs cowrie
```

### 3.3 Esperar inicialización (3-5 minutos)

Wazuh necesita unos minutos para:
1. Generar sus certificados internos
2. Crear los índices en OpenSearch
3. Registrar el agente local

**Cómo saber si ya está listo:**
```bash
# Ver logs en tiempo real (Ctrl+C para salir)
docker compose logs -f

# Cuando veas mensajes como "started" o "ready to receive requests", está listo
```

### 3.4 Crear dashboards y monitores

```bash
# Instalar la librería de Python necesaria
pip install requests

# Crear los dashboards de Cowrie
python create_dashboards.py
# Debe mostrar: Dashboard 'Valhalla SOC - Cowrie Honeypot': CREADO OK

# Crear los monitores de alertas
python setup_monitors.py
# Debe mostrar: 7/7 monitores creados

# Crear los reportes de seguridad
python setup_reports.py
# Debe mostrar: Dashboard Reportes: CREADO OK
```

### 3.5 Acceder al Dashboard

1. **Abre tu navegador** y ve a: `https://localhost`
2. **El navegador mostrará una advertencia** de certificado — es normal:
   - Chrome: "Tu conexión no es privada" → Haz clic en "Configuración avanzada" → "Continuar a localhost"
   - Firefox: "Advertencia: riesgo potencial de seguridad" → "Aceptar el riesgo y continuar"
3. **Introduce las credenciales:**
   - Usuario: `admin`
   - Contraseña: `admin`

---

## Parte 4: Uso Diario

### 4.1 Navegar por el Dashboard

**Menú principal** (barra lateral izquierda):
- **Resumen** — Vista general con agentes, alertas por severidad
- **Puntos finales** — Detalle de cada agente registrado
- **Caza de amenazas** — Búsqueda avanzada de eventos
- **MITRE ATT&CK** — Mapeo de técnicas detectadas
- **Dashboards** — Dashboards personalizados (Cowrie, Reportes)

### 4.2 Ver el Dashboard de Cowrie

1. Menú lateral → **Dashboards**
2. Seleccionar **"Valhalla SOC - Cowrie Honeypot"**

Aquí verás:
- 🔴 **Alertas Críticas** — Número total de alertas graves
- 🥧 **Alertas por Nivel** — Distribución por severidad
- 📊 **Top IPs Atacantes** — Quién ataca más
- 📈 **Timeline** — Evolución de ataques en el tiempo
- 📋 **Comandos Ejecutados** — Qué comandos escribieron los atacantes

### 4.3 Ver análisis de la IA

Los análisis de Ollama aparecen en:
- **Timeline de eventos** → Busca eventos etiquetados como "Ollama AI Insight"
- **Tabla de reglas** → Regla 100200: "Ollama AI Insight para Alerta XXX"
- **Discover** → Filtra por `rule.groups:ollama`

### 4.4 Generar reportes

1. Abre cualquier dashboard
2. Haz clic en **"Reportar"** (esquina superior derecha)
3. Selecciona **PDF** o **CSV**
4. El informe se descarga automáticamente

### 4.5 Ver alertas en tiempo real

1. Menú lateral → **Alerta** (o busca "Alerting")
2. Pestaña **Alertas** — Ver alertas activas
3. Pestaña **Monitores** — Configurar/modificar monitores

### 4.6 Buscar eventos específicos

1. Menú lateral → **Discover**
2. Seleccionar index pattern: `wazuh-alerts-*`
3. Usar la barra de búsqueda con sintaxis Lucene:

**Búsquedas útiles:**
```
rule.groups:cowrie                           → Todos los eventos Cowrie
rule.id:100111                               → Solo fuerza bruta
rule.level:[10 TO 15]                        → Solo alertas altas/críticas
data.src_ip:185.220.101.1                    → Eventos de una IP específica
rule.id:100120 AND data.input:*wget*         → Comandos con wget
rule.mitre.id:T1110                          → Técnica MITRE específica
```

---

## Parte 5: Probar el sistema

### 5.1 Simulación manual de ataques

Para ver el sistema en acción, puedes atacar el honeypot tú mismo:

**Login fallido (un intento):**
```bash
ssh root@localhost -p 2222
# Cuando pida contraseña, escribe cualquier cosa y pulsa Enter
# Verás que la conexión se cierra (en Cowrie, TODAS las contraseñas son "correctas"
# con las que están en userdb.txt)
```

**Login "exitoso" (con credenciales trampa):**
```bash
ssh root@localhost -p 2222
# Contraseña: admin (o root, o password)
# ¡Estás dentro del honeypot! Todo lo que hagas se graba.
# Prueba: ls, whoami, cat /etc/passwd, wget http://ejemplo.com
# Escribe "exit" para salir
```

**Fuerza bruta simulada (con herramienta):**
```bash
# Si tienes hydra instalado:
hydra -l root -P /ruta/a/lista_passwords.txt ssh://localhost:2222 -t 4
```

### 5.2 Verificar que las alertas llegan

1. Espera 1-2 minutos después de atacar
2. Ve al Dashboard de Cowrie → Debe mostrar nuevos eventos
3. Recarga la página si no aparecen inmediatamente

---

## Parte 6: Administración

### 6.1 Parar los servicios (sin perder datos)

```bash
docker compose down
# Los datos se mantienen en los volúmenes de Docker
```

### 6.2 Reiniciar los servicios

```bash
docker compose up -d
```

### 6.3 Ver logs de un servicio específico

```bash
docker compose logs wazuh.manager    # Logs del SIEM
docker compose logs cowrie            # Logs del honeypot
docker compose logs wazuh.dashboard   # Logs del dashboard
docker compose logs wazuh.indexer     # Logs de la base de datos
```

### 6.4 Borrar todo y empezar de cero

```bash
docker compose down -v
# ⚠️ CUIDADO: Este comando elimina todos los datos (alertas, configuraciones)
```

### 6.5 Actualizar el proyecto

```bash
git pull origin main
docker compose down
docker compose up -d --build
```

---

## Parte 7: Glosario de términos

| Término | Explicación sencilla |
|---|---|
| **SOC** | Centro de Operaciones de Seguridad. Es el "cuartel general" de la ciberseguridad |
| **SIEM** | Sistema que recoge, analiza y correlaciona logs de seguridad. Wazuh es un SIEM |
| **Honeypot** | Trampa que simula un servidor real para atraer atacantes |
| **Docker** | Programa que ejecuta aplicaciones en cajas aisladas (contenedores) |
| **Contenedor** | Una "mini máquina virtual" que ejecuta un servicio |
| **Volumen** | Espacio de almacenamiento permanente para un contenedor |
| **Ollama** | Programa para ejecutar IA localmente sin internet |
| **Modelo de IA** | El "cerebro" de la IA (en este caso, qwen2.5-coder:7b) |
| **OpenSearch** | Base de datos de búsqueda rápida (almacena las alertas) |
| **Decoder** | Regla que enseña a Wazuh cómo leer un tipo de log |
| **Regla** | Condición que genera una alerta cuando se cumple |
| **MITRE ATT&CK** | Catálogo universal de técnicas de ataque |
| **Fuerza bruta** | Probar miles de contraseñas hasta acertar |
| **Reverse shell** | Técnica para que un servidor hackeado se conecte de vuelta al atacante |
| **Malware** | Software malicioso (virus, troyanos, ransomware) |
| **TLS/SSL** | Cifrado de comunicaciones (el candado de HTTPS) |
| **Certificado** | Archivo digital que prueba la identidad de un servidor |
| **API** | Interfaz para que programas se comuniquen entre sí |
| **Dashboard** | Panel visual con gráficas, tablas y métricas |
| **FIM** | File Integrity Monitoring — detecta cambios en archivos del sistema |
| **GeoIP** | Tecnología para averiguar la ubicación geográfica de una IP |

---

## Parte 8: Contacto y soporte

Si tienes problemas con la instalación o el uso:

1. Revisa la **sección de Preguntas Frecuentes** en el README.md
2. Consulta los **logs** del contenedor problemático (`docker compose logs <servicio>`)
3. Abre un **issue** en GitHub: https://github.com/saantiidp/Valhalla-SOC/issues

---

> **Versión del manual:** 1.0  
> **Última actualización:** Abril 2026  
> **Autor:** Equipo Valhalla SOC
