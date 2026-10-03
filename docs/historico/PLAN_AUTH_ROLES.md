# Plan: Sistema de Autenticación, Roles y Exportación de Reportes

> **Estado**: En implementación  
> **Fecha**: 2026-04-18  
> **Proyecto**: Valhalla SOC

---

## Problema que resuelve

Actualmente el dashboard no tiene ningún control de acceso. Cualquiera con acceso a `:3000` ve todo. Se necesita un sistema de login con roles diferenciados para que cada miembro del equipo SOC tenga los permisos que corresponden a su función.

---

## Arquitectura

```
Browser
  ↓ login con user/pass
backend/server.js
  ↓ verifica con bcrypt
backend/db.js  (SQLite — valhalla.db)
  ↓ devuelve JWT (8h)
Browser guarda token en httpOnly cookie
  ↓ cada request lleva el token
Middleware auth → comprueba rol → permite o bloquea
```

---

## Roles y permisos

| Permiso                      | Admin | Analista | Reporter | Viewer |
|------------------------------|:-----:|:--------:|:--------:|:------:|
| Ver dashboard completo       |  ✓    |   ✓      |   ✓      |   ✓    |
| Ver alertas SIEM             |  ✓    |   ✓      |   ✓      |   ✓    |
| Ver detalle de agentes       |  ✓    |   ✓      |   ✓      |   ✓    |
| Crear / cerrar incidentes    |  ✓    |   ✓      |   ✗      |   ✗    |
| Consultar Threat Intel       |  ✓    |   ✓      |   ✗      |   ✓    |
| Análisis Ollama AI           |  ✓    |   ✓      |   ✗      |   ✗    |
| Exportar reportes PDF/DOC/MD |  ✓    |   ✓      |   ✓      |   ✗    |
| Gestionar usuarios y roles   |  ✓    |   ✗      |   ✗      |   ✗    |

---

## Archivos creados / modificados

```
backend/
  db.js                ← setup SQLite, tablas users + sessions
  auth.js              ← middleware JWT, bcrypt, verificación de roles
  routes/
    auth.js            ← POST /api/login, POST /api/logout, GET /api/me
    users.js           ← CRUD usuarios (solo admin)
    export.js          ← GET /api/export/:format (pdf | docx | md)

frontend/
  login.html           ← página de login con estilo HUD
  login.js             ← lógica del form, redirige al dashboard tras JWT
  components.js        ← + vista "Gestión de Usuarios" (admin panel)
  app.js               ← intercepta carga, si no hay token → redirige a login.html
```

---

## Base de datos

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  active        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  last_login    TEXT
);
```

Roles válidos: `admin`, `analyst`, `reporter`, `viewer`

Usuario por defecto al arrancar: `admin` / configurable via `.env` (`ADMIN_PASSWORD`)

---

## Exportación de reportes

| Formato | Librería       | Contenido                                    |
|---------|---------------|----------------------------------------------|
| PDF     | `puppeteer`   | Captura visual del dashboard                 |
| DOCX    | `docx`        | Tabla alertas + resumen agentes + KPIs       |
| MD      | nativo Node   | Texto estructurado, sin dependencias extra   |

---

## Dependencias añadidas

```json
"bcryptjs":       "^2.4.3",
"jsonwebtoken":   "^9.0.2",
"better-sqlite3": "^9.4.3",
"puppeteer":      "^22.0.0",
"docx":           "^8.5.0"
```
