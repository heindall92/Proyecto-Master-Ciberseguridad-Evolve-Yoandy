# 🐳 Guía Completa de Docker
> Manual paso a paso basado en el curso. Desde cero hasta Docker Compose con volúmenes y múltiples entornos.

---

## Índice

1. [Conceptos clave](#conceptos-clave)
2. [Instalación](#instalación)
3. [Comandos de imágenes](#comandos-de-imágenes)
4. [Comandos de contenedores](#comandos-de-contenedores)
5. [Conectar contenedores (Redes)](#conectar-contenedores-redes)
6. [Crear tu propia imagen (Dockerfile)](#crear-tu-propia-imagen-dockerfile)
7. [Docker Compose](#docker-compose)
8. [Volúmenes (Persistencia de datos)](#volúmenes-persistencia-de-datos)
9. [Múltiples entornos (Dev/Prod)](#múltiples-entornos-devprod)
10. [Resumen de comandos](#resumen-de-comandos)

---

## Conceptos clave

| Concepto | Qué es |
|---|---|
| **Imagen** | El empaquetado. Contiene el código, dependencias y configuración. Es lo que se comparte. |
| **Contenedor** | La imagen ejecutándose. Es una instancia viva de la imagen. |
| **Dockerfile** | Archivo con las instrucciones para construir tu propia imagen. |
| **Docker Hub** | Repositorio público de imágenes (como GitHub pero para contenedores). URL: `hub.docker.com` |
| **Docker Compose** | Herramienta para gestionar múltiples contenedores con un solo archivo `.yml`. |
| **Volumen** | Mecanismo para persistir datos fuera del contenedor, en tu máquina física. |
| **Red interna** | Red virtual que permite que los contenedores se comuniquen entre sí. |

**¿Por qué Docker?**
- Sin Docker: cada desarrollador instala dependencias manualmente → versiones distintas → errores.
- Con Docker: un comando levanta todo el entorno igual para todos.

---

## Instalación

### Windows y Mac
1. Ve a `https://www.docker.com/products/docker-desktop`
2. Descarga el instalador para tu sistema operativo
3. Instala siguiendo los pasos (siguiente, siguiente...)
4. En Mac: arrastra Docker a la carpeta de Aplicaciones

### Linux (Kali/Ubuntu/Debian)
```bash
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker   # Para que arranque automáticamente
```

### Verificar que funciona
```bash
docker --version
```

> ⚠️ **Importante:** Docker Desktop debe estar corriendo antes de usar cualquier comando. Si no está activo, todos los comandos fallarán.

---

## Comandos de imágenes

### Ver imágenes descargadas
```bash
docker images
```
Muestra: nombre, etiqueta (tag), ID, fecha de creación y tamaño.

### Descargar una imagen
```bash
# Descarga la última versión (tag: latest)
docker pull node

# Descargar una versión específica
docker pull node:18

# Descargar otra versión distinta
docker pull node:16
```

> 💡 Si tienes Node 18 y Node 16 descargadas y su ID es el mismo, significa que son la misma imagen con distinto tag.

### Descargar en Mac con chip M1/M2 (si da error de plataforma)
```bash
docker pull --platform linux/x86_64 mysql
```

### Buscar imágenes disponibles
Entra en `https://hub.docker.com` y busca la imagen que necesites (mysql, postgres, python, etc.)

### Eliminar una imagen
```bash
# Eliminar una imagen por nombre:tag
docker image rm node:18

# Eliminar varias a la vez
docker image rm node:18 node:16

# Eliminar por nombre (elimina todas sus versiones)
docker image rm mysql
```

---

## Comandos de contenedores

### Crear un contenedor (sin arrancarlo)
```bash
docker create mongo
```
Devuelve el **ID completo** del contenedor. Guárdalo para usarlo luego.

### Crear con nombre personalizado
```bash
docker create --name monguito mongo
```
> ✅ Recomendado: usar siempre nombre propio para no depender del ID.

### Crear con mapeo de puertos
```bash
# Formato: -p PUERTO_MAQUINA:PUERTO_CONTENEDOR
docker create -p 27017:27017 --name monguito mongo
```
Esto conecta el puerto 27017 de tu máquina con el 27017 del contenedor.

### Crear con variables de entorno
```bash
docker create \
  -p 27017:27017 \
  --name monguito \
  -e MONGO_INITDB_ROOT_USERNAME=nico \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo
```
> Las variables de entorno cambian según la imagen. Consúltalas en Docker Hub.

### Arrancar un contenedor
```bash
docker start monguito
```

### Crear y arrancar en un solo comando (docker run)
```bash
# Básico (se queda mostrando logs, Ctrl+C lo para)
docker run mongo

# En segundo plano (-d = detached)
docker run -d mongo

# Con todas las opciones
docker run -d \
  --name monguito \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=nico \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo
```

> ⚠️ `docker run` siempre **crea un contenedor nuevo**. Si lo ejecutas 3 veces, tendrás 3 contenedores.

### Ver contenedores en ejecución
```bash
docker ps
```

### Ver TODOS los contenedores (incluidos los parados)
```bash
docker ps -a
```

### Parar un contenedor
```bash
docker stop monguito
```

### Eliminar un contenedor
```bash
docker rm monguito
```

### Ver logs de un contenedor
```bash
# Ver todos los logs hasta ahora
docker logs monguito

# Quedarse escuchando logs en tiempo real
docker logs --follow monguito
```
Sal del modo follow con `Ctrl + C`.

---

## Conectar contenedores (Redes)

Por defecto, los contenedores están aislados entre sí. Para que se comuniquen, hay que meterlos en la misma **red interna**.

### Ver redes existentes
```bash
docker network ls
```

### Crear una red
```bash
docker network create mi-red
```

### Eliminar una red
```bash
docker network rm mi-red
```

### Crear contenedor asignándole una red
```bash
docker create \
  -p 27017:27017 \
  --name monguito \
  --network mi-red \
  -e MONGO_INITDB_ROOT_USERNAME=nico \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo
```

> 💡 Dentro de una red interna de Docker, los contenedores se comunican usando el **nombre del contenedor** como hostname. Por ejemplo, para conectar tu app a mongo, usas `mongodb://nico:password@monguito:27017/...` (en lugar de `localhost`).

---

## Crear tu propia imagen (Dockerfile)

Crea un archivo llamado exactamente `Dockerfile` (sin extensión) en la raíz de tu proyecto.

### Ejemplo para una app Node.js
```dockerfile
# Imagen base
FROM node:18

# Crear la carpeta de la app dentro del contenedor
RUN mkdir -p /home/app

# Copiar el código de tu máquina al contenedor
# Formato: COPY <origen_en_tu_maquina> <destino_en_el_contenedor>
COPY . /home/app

# Exponer el puerto que usa tu app
EXPOSE 3000

# Comando para arrancar la aplicación
CMD ["node", "/home/app/index.js"]
```

### Construir la imagen desde el Dockerfile
```bash
# Formato: docker build -t <nombre>:<tag> <ruta_del_dockerfile>
docker build -t mi-app:1 .
```
- `-t` = nombre y tag de la imagen
- `.` = la ruta es el directorio actual (donde está el Dockerfile)

### Verificar que se creó
```bash
docker images
```

---

## Docker Compose

En lugar de ejecutar comandos largos para cada contenedor, defines todo en un archivo `docker-compose.yml` y lo levantas con un solo comando.

### Ejemplo de `docker-compose.yml`
```yaml
version: "3.9"

services:
  chanchito:
    build: .                        # Construye la imagen desde el Dockerfile del directorio actual
    ports:
      - "3000:3000"
    links:
      - monguito                    # Este contenedor necesita comunicarse con monguito

  monguito:
    image: mongo                    # Usa la imagen oficial de mongo
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=nico
      - MONGO_INITDB_ROOT_PASSWORD=password
```

> ✅ Docker Compose **crea la red automáticamente**. No necesitas crearla a mano.

### Comandos de Docker Compose

```bash
# Levantar todos los contenedores (con logs en pantalla)
docker compose up

# Levantar en segundo plano
docker compose up -d

# Parar y eliminar los contenedores (y la red automática)
docker compose down

# Ver logs de todos los contenedores
docker compose logs

# Usar un archivo compose personalizado (no el por defecto)
docker compose -f docker-compose.dev.yml up
```

---

## Volúmenes (Persistencia de datos)

Sin volúmenes, cuando eliminas un contenedor **pierdes todos los datos** (base de datos incluida).

### Tipos de volúmenes

| Tipo | Cuándo usarlo |
|---|---|
| **Anónimo** | Rápido, Docker elige dónde guardarlo. No reusable. |
| **De anfitrión (host)** | Tú decides la ruta exacta en tu máquina. |
| **Nombrado** | Como el anónimo pero con nombre, reutilizable entre contenedores. |

### Añadir volumen nombrado en docker-compose.yml
```yaml
version: "3.9"

services:
  monguito:
    image: mongo
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=nico
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - mongo-data:/data/db        # nombre-volumen:ruta-dentro-del-contenedor

volumes:
  mongo-data:                      # Declaración del volumen nombrado
```

### Rutas donde cada base de datos guarda sus datos

| Base de datos | Ruta dentro del contenedor |
|---|---|
| MongoDB | `/data/db` |
| MySQL | `/var/lib/mysql` |
| PostgreSQL | `/var/lib/postgresql/data` |

---

## Múltiples entornos (Dev/Prod)

En desarrollo quieres **hot reload** (que el servidor se reinicie solo al cambiar código). En producción no.

### Paso 1 — Crear `Dockerfile.dev`
```dockerfile
FROM node:18

RUN mkdir -p /home/app

# Instalar nodemon globalmente para hot reload
RUN npm install -g nodemon

# Indicar el directorio de trabajo (ya no hace falta poner la ruta completa en CMD)
WORKDIR /home/app

EXPOSE 3000

# Usar nodemon en lugar de node
CMD ["nodemon", "index.js"]
```

> ⚠️ En este Dockerfile **no hay COPY** porque el código lo montamos con un volumen en tiempo real.

### Paso 2 — Crear `docker-compose.dev.yml`
```yaml
version: "3.9"

services:
  chanchito:
    build:
      context: .                        # Dónde está el proyecto
      dockerfile: Dockerfile.dev        # Qué Dockerfile usar
    ports:
      - "3000:3000"
    links:
      - monguito
    volumes:
      - .:/home/app                     # Monta tu código local en el contenedor (hot reload)

  monguito:
    image: mongo
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=nico
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

### Paso 3 — Arrancar el entorno de desarrollo
```bash
docker compose -f docker-compose.dev.yml up
```

Ahora al modificar cualquier archivo de tu proyecto, **nodemon lo detecta y reinicia automáticamente** sin necesidad de reconstruir la imagen.

---

## Resumen de comandos

### Imágenes
```bash
docker images                          # Listar imágenes
docker pull <imagen>:<tag>             # Descargar imagen
docker image rm <imagen>:<tag>         # Eliminar imagen
docker build -t <nombre>:<tag> .       # Construir imagen desde Dockerfile
```

### Contenedores
```bash
docker create --name <nombre> <imagen> # Crear contenedor
docker start <nombre>                  # Arrancar contenedor
docker stop <nombre>                   # Parar contenedor
docker rm <nombre>                     # Eliminar contenedor
docker ps                              # Ver contenedores activos
docker ps -a                           # Ver todos los contenedores
docker logs <nombre>                   # Ver logs
docker logs --follow <nombre>          # Ver logs en tiempo real
docker run -d --name <nombre> <imagen> # Crear + arrancar en segundo plano
```

### Redes
```bash
docker network ls                      # Listar redes
docker network create <nombre>         # Crear red
docker network rm <nombre>             # Eliminar red
```

### Docker Compose
```bash
docker compose up                      # Levantar servicios
docker compose up -d                   # Levantar en segundo plano
docker compose down                    # Parar y eliminar contenedores
docker compose -f <archivo>.yml up     # Usar un compose personalizado
```

---

> 💡 **Flujo recomendado para un proyecto nuevo:**
> 1. Escribe tu `Dockerfile` (para producción)
> 2. Escribe tu `Dockerfile.dev` (para desarrollo con hot reload)
> 3. Escribe tu `docker-compose.yml` (producción)
> 4. Escribe tu `docker-compose.dev.yml` (desarrollo)
> 5. En desarrollo: `docker compose -f docker-compose.dev.yml up`
> 6. Cuando llega un nuevo desarrollador al equipo: mismo comando, todo funciona igual.
