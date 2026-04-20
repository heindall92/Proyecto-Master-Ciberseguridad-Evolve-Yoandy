# Orientaciones para Asistentes IA - Valhalla SOC

**Fecha de actualización:** 2026-04-20  
**Versión:** 1.0  
**Proyecto:** Valhalla SOC - Centro de Operaciones de Seguridad  
**Repositorio:** https://github.com/saantiidp/Valhalla-SOC  
**Desarrollador Principal:** Yoandy  
**Equipo:** Proyecto de Máster en Ciberseguridad

---

## 📋 Resumen Ejecutivo

**Valhalla SOC** es un sistema completo de detección de amenazas que combina:
- **Wazuh SIEM** (Security Information and Event Management) para análisis de logs
- **Cowrie Honeypot** para capturar ataques reales
- **Dashboard propio** (HTML/CSS/JS + Node.js) para visualización
- **Ollama en la nube** para análisis IA (configurado externamente)

### Áreas de Trabajo del Desarrollador
- ✅ **Wazuh:** Configuración, reglas, decoders, integraciones
- ✅ **Dashboard:** Frontend (UI) y Backend (API)
- ❌ **Ollama:** NO modificar (usa cloud externo)

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CAPA DE PRESENTACIÓN                         │
├─────────────────────────────────────────────────────────────────────┤
│  Dashboard Valhalla (3000)  │  Wazuh Dashboard (443)                │
│  - HTML/CSS/JS Vanilla      │  - Interfaz nativa OpenSearch        │
│  - Autenticación JWT         │  - Análisis de alertas               │
│  - Gestión de tickets        │                                      │
└──────────┬──────────────────────────────┬───────────────────────────┘
           │                              │
┌──────────▼──────────────┐  ┌───────────▼────────────────────┐
│   Backend API (3001)     │  │       Wazuh Manager            │
│   - Node.js/Express      │  │       Puerto 55000             │
│   - SQLite (better-sqlite3)│  │  - Reglas de detección         │
│   - bcryptjs + JWT       │  │  - Integraciones               │
└──────────┬──────────────┘  │  - Active Response             │
           │                 └───────────┬────────────────────┘
           │                             │
┌──────────▼─────────────────────────────▼─────────────────────┐
│                 Wazuh Indexer (Puerto 9200)                     │
│                  Base de datos OpenSearch                       │
│                  Almacena alertas y logs                        │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    Cowrie Honeypot                               │
│            Puertos 2222 (SSH) / 2223 (Telnet)                   │
│       Captura ataques y genera logs JSON                        │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Ollama IA (EXTERNO - Cloud)                                     │
│  - Análisis de amenazas nivel ≥5 (configurado en integraciones)  │
│  - NO se instala localmente                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Directorios

### Directorios Principales

```
E:/000Yoandy/Proyecto SOC/
│
├── 📂 backend/                  ← API REST (MODIFICAR con cuidado)
│   ├── server.js               Entry point Express
│   ├── auth.js                 Middleware JWT
│   ├── db.js                   Conexión SQLite
│   └── routes/                 Endpoints API
│       ├── auth.js             Login/registro
│       ├── tickets.js          Gestión de tickets
│       ├── users.js            Gestión de usuarios
│       └── export.js           Exportación de reportes
│
├── 📂 frontend/                 ← Dashboard UI (LIBRE de modificar)
│   ├── index.html              Dashboard principal
│   ├── login.html              Página de login
│   ├── app.js                  Lógica principal
│   ├── components.js           Componentes UI
│   ├── data.js                 Gestión de datos
│   ├── modals.js               Ventanas modales
│   └── styles.css              Estilos CSS
│
├── 📂 wazuh_config/            ← Configuración Wazuh (MODIFICAR)
│   ├── ossec.conf              Configuración principal
│   ├── 📂 rules/               Reglas de detección personalizadas
│   │   └── cowrie_rules.xml    Reglas específicas Cowrie
│   ├── 📂 decoders/            Decodificadores de logs
│   │   └── cowrie_decoders.xml
│   └── 📂 integrations/         Scripts de integración
│       └── custom-ollama.py    Integración con Ollama
│
├── 📂 config/                  ← Certificados SSL
│   └── wazuh_indexer_ssl_certs/
│
├── 📂 docs/                    ← Documentación
│   ├── INFORME_INTEGRACION_2026-04-20_Yoandy.md
│   └── *.md                    Otros documentos
│
├── 📂 honeypot/                ← Stack Cowrie standalone (NO MODIFICAR)
│   ├── docker-compose.yml
│   ├── cowrie/
│   └── scripts/
│
├── 📄 docker-compose.yml       Stack principal Wazuh + Cowrie
├── 📄 create_dashboards.py     Script creación dashboards Wazuh
├── 📄 setup_monitors.py        Script configuración monitores
├── 📄 setup_reports.py         Script configuración reportes
│
├── 📄 ORIENTACIONES.md         ← ESTE ARCHIVO
├── 📄 instalar-y-ejecutar.bat  ← Script maestro
├── 📄 verificar-requisitos.bat ← Script de diagnóstico
├── 📄 detener-todo.bat         ← Script de parada
└── 📄 LIMPIEZA_SEGURA.bat      ← Script de limpieza
```

---

## ⚠️ REGLAS CRÍTICAS DE MODIFICACIÓN

### 🔴 ANTES de hacer cualquier cambio:

1. **Leer este archivo completo**
2. **Verificar `git status`**: Asegurar que no hay cambios sin commitear
3. **Hacer backup**: Si es modificación grande, crear ZIP con fecha
4. **Crear rama**: `git checkout -b feature/nombre-descriptivo`

### 🔴 Archivos que REQUIEREN CONSENSO del equipo:

NO modificar estos archivos sin consultar:

| Archivo | Razón |
|---------|-------|
| `docker-compose.yml` | Afecta stack completo |
| `honeypot/docker-compose.yml` | Afecta honeypot standalone (de otros compañeros) |
| `backend/package.json` | Cambia dependencias del API |
| `wazuh_config/ossec.conf` | Configuración core Wazuh |
| `.env.example` | Variables de entorno estándar |

### 🟢 Áreas LIBRES para modificar:

Puedes modificar sin problema (siempre creando rama):

| Directorio/Archivo | Qué puedes hacer |
|-------------------|------------------|
| `frontend/*` | Todo: UI, estilos, lógica, nuevas páginas |
| `backend/routes/*` | Nuevos endpoints, lógica de negocio |
| `wazuh_config/rules/*.xml` | Nueva reglas de detección |
| `wazuh_config/decoders/*.xml` | Nuevos decodificadores |
| `create_dashboards.py` | Nuevos dashboards Wazuh |
| `setup_monitors.py` | Nuevos monitores |
| `setup_reports.py` | Nuevos reportes |
| `docs/*.md` | Documentación |

### 🟡 Áreas CONSULTAR antes:

| Directorio | Qué consultar |
|-------------|---------------|
| `wazuh_config/integrations/*` | Si cambia lógica de Ollama |
| `backend/auth.js` | Si cambia autenticación |
| `backend/db.js` | Si cambia esquema de BD |

---

## 🔄 Flujo de Trabajo Git (OBLIGATORIO)

### Paso a paso:

```bash
# 1. SIEMPRE empezar desde main actualizado
git checkout main
git pull origin main

# 2. Crear rama para tu trabajo
git checkout -b feature/nombre-descriptivo
# Ejemplos:
# git checkout -b feature/nuevas-reglas-wazuh
# git checkout -b feature/mejora-dashboard-ui
# git checkout -b fix/correccion-login

# 3. Hacer tus cambios...

# 4. Verificar qué se modificó
git status
git diff

# 5. Commitear con mensaje descriptivo
git add .
git commit -m "feat: descripción clara del cambio

- Detalle 1
- Detalle 2

Relacionado con: #issue-si-aplica"

# 6. ANTES de push, verificar que no hay conflictos
git fetch origin
git log --oneline main..HEAD        # Ver tus commits
git log --oneline HEAD..origin/main # Ver commits nuevos en remoto

# 7. Si hay commits nuevos en remoto, INTEGRAR primero
git rebase origin/main
# o si prefieres: git merge origin/main

# 8. Resolver conflictos si los hay, luego:
git push origin feature/nombre-descriptivo

# 9. Crear Pull Request en GitHub
# Ir a: https://github.com/saantiidp/Valhalla-SOC/pulls
```

---

## ✅ Checklist de Verificación Pre-Push

ANTES de subir cualquier cambio:

- [ ] **Estoy en una rama feature/**, NO en main directamente
- [ ] **No he modificado archivos sensibles** sin consultar (ver sección ⚠️)
- [ ] **He probado los cambios localmente**: Dashboard carga en localhost:3000
- [ ] **Docker compose up -d funciona** sin errores
- [ ] **No hay credenciales hardcodeadas** en el código
- [ ] **No he subido archivos sensibles** (.env, keys, DB con datos reales)
- [ ] **He revisado el diff** con `git diff origin/main`
- [ ] **Los commits tienen mensajes descriptivos**

---

## 🛠️ Scripts Disponibles

### Scripts Maestros (en raíz del proyecto):

| Script | Uso |
|--------|-----|
| `verificar-requisitos.bat` | Diagnóstico de herramientas instaladas |
| `instalar-y-ejecutar.bat` | Instala todo y levanta el stack completo |
| `detener-todo.bat` | Para todos los servicios ordenadamente |
| `LIMPIEZA_SEGURA.bat` | Borra todo excepto backups y orientaciones |

### Uso típido de flujo:

```bash
# 1. Verificar que todo está instalado
verificar-requisitos.bat

# 2. Si es primera vez o se borró todo, ejecutar:
instalar-y-ejecutar.bat

# 3. Trabajar en código...

# 4. Al terminar la sesión:
detener-todo.bat
```

---

## 🌐 URLs de Acceso

| Servicio | URL | Credenciales | Uso |
|----------|-----|--------------|-----|
| **Valhalla Dashboard** | http://localhost:3000 | Según backend/.env | Dashboard principal (tu trabajo) |
| **Wazuh Dashboard** | https://localhost | admin / admin | SIEM nativo Wazuh |
| **Wazuh API** | https://localhost:55000 | wazuh-wui / wazuh-wui | API Wazuh |
| **OpenSearch** | https://localhost:9200 | admin / admin | Base de datos |
| **Backend API** | http://localhost:3001 | JWT token | API REST (tu trabajo) |
| **Cowrie SSH** | ssh localhost -p 2222 | Cualquier userdb.txt | Honeypot para testing |
| **Cowrie Telnet** | telnet localhost -p 2223 | - | Honeypot Telnet |

---

## 🎯 Contexto de Negocio

### ¿Qué hace Valhalla SOC?

1. **Despliega un honeypot** (Cowrie) que simula ser servidor SSH real
2. **Atrae ataques** de bots y atacantes reales en internet
3. **Registra toda la actividad** en logs JSON detallados:
   - Intentos de login
   - Comandos ejecutados
   - Archivos descargados
   - Sesiones completas
4. **Wazuh SIEM analiza** los logs en tiempo real:
   - Aplica decoders para parsear JSON
   - Aplica reglas para detectar patrones
   - Genera alertas clasificadas por severidad (1-15)
   - Mapea a tácticas MITRE ATT&CK
5. **Ollama (cloud) analiza** alertas críticas (nivel ≥5):
   - Explica qué está haciendo el atacante
   - Genera recomendaciones
   - Todo sin enviar datos fuera (Ollama local en cloud)
6. **Dashboard presenta** todo visualmente:
   - Alertas en tiempo real
   - Estadísticas de ataques
   - Gestión de tickets SOC
   - Reportes exportables

### Casos de Uso Principales:

- **Detección temprana:** Identificar bots escaneando internet
- **Análisis forense:** Ver exactamente qué comandos ejecutan los atacantes
- **Inteligencia de amenazas:** Mapear tácticas a MITRE ATT&CK framework
- **Formación:** Entender comportamiento real de atacantes
- **Investigación:** Analizar malware descargado por atacantes

---

## 📝 Notas Específicas para IA (Claude/Ollama)

### Cuando trabajes en este proyecto:

1. **SIEMPRE leer ORIENTACIONES.md primero**
   - Este archivo es el "source of truth"
   - Fecha de actualización: 2026-04-20

2. **Verificar estado actual antes de proponer cambios**
   ```bash
   git status
   git log --oneline -5
   ```

3. **Priorizar no romper lo que funciona**
   - Si algo está funcionando, documentar antes de cambiar
   - Crear backup si el cambio es grande

4. **Sugerir pruebas antes de cualquier push**
   - "Antes de subir esto, deberías probar..."
   - Verificar que docker compose up -d funciona

5. **Áreas de enfoque del desarrollador (Yoandy):**
   - Wazuh: Nuevas reglas de detección, mejores decoders
   - Dashboard: Nuevas visualizaciones, mejores flujos UI
   - Backend: Nuevos endpoints, mejoras en API

6. **NO sugerir:**
   - Instalar Ollama localmente (usa cloud)
   - Modificar docker-compose.yml sin consenso
   - Cambiar autenticación sin plan de migración

---

## 🚀 Comandos Rápidos de Referencia

### Docker:
```bash
# Ver todos los logs
docker compose logs -f

# Ver logs específicos
docker compose logs -f wazuh.manager
docker compose logs -f cowrie

# Reiniciar un servicio
docker compose restart wazuh.manager

# Shell dentro del manager
docker exec -it wazuh.manager /bin/bash
```

### Git:
```bash
# Ver estado actual
git status

# Ver cambios no commiteados
git diff

# Ver historial reciente
git log --oneline -10

# Ver ramas existentes
git branch -a
```

### Dashboard (desde raíz):
```bash
# Backend
cd backend && npm start

# Frontend (en otra terminal)
cd frontend && npm start
# o si es vanilla:
cd frontend && npx serve -s . -l 3000
```

### Wazuh (desde dentro del contenedor):
```bash
# Ver registro de alertas
docker exec wazuh.manager cat /var/ossec/logs/alerts/alerts.json

# Ver estado de agentes
docker exec wazuh.manager /var/ossec/bin/agent_control -l

# Reiniciar servicio Wazuh
docker exec wazuh.manager /var/ossec/bin/ossec-control restart
```

---

## 📚 Recursos y Referencias

- **Repositorio GitHub:** https://github.com/saantiidp/Valhalla-SOC
- **Manual de Usuario:** `MANUAL.md` en raíz
- **Informe de Integración:** `docs/INFORME_INTEGRACION_2026-04-20_Yoandy.md`
- **Issues/Problemas:** https://github.com/saantiidp/Valhalla-SOC/issues

---

## 🐛 Troubleshooting Común

### Problema: Docker no inicia
**Solución:** Verificar que Docker Desktop esté corriendo. Requiere Hyper-V o WSL2.

### Problema: Puerto 3000 ocupado
**Solución:** `netstat -ano | findstr :3000` luego `taskkill /PID <PID> /F`

### Problema: Backend no conecta a SQLite
**Solución:** Verificar que exista `backend/valhalla.db` o ejecutar init de BD.

### Problema: Wazuh Dashboard no carga
**Solución:** Esperar 2-3 min tras `docker compose up`. Requiere inicialización.

### Problema: Cowrie no registra ataques
**Solución:** Verificar puertos 2222/2223 no estén ocupados. `netstat -ano | findstr 2222`

---

**Nota final para IA:** Este documento es un contrato de trabajo. Síguelo para mantener la calidad y consistencia del proyecto. Cuando tengas dudas, consulta este archivo antes de actuar.
