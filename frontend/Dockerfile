# Node 22 LTS: Node 20 dejó de tener soporte el 30/04/2026
FROM node:22-alpine

# Parches de seguridad del sistema base (OpenSSL) y del npm que trae la imagen (Trivy)
RUN apk upgrade --no-cache && npm install -g npm@latest --no-audit --no-fund

WORKDIR /app

COPY package.json package-lock.json /app/
COPY tsconfig.json /app/tsconfig.json
COPY vite.config.ts /app/vite.config.ts

# npm ci instala exactamente las versiones auditadas del lockfile (antes npm install sin
# lockfile: cada build resolvía versiones distintas, no reproducible ni auditable)
RUN npm ci --no-audit --no-fund

COPY app /app/app

ARG VITE_API_BASE_URL
ARG VITE_ALLOW_OFFLINE_DEMO=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ALLOW_OFFLINE_DEMO=$VITE_ALLOW_OFFLINE_DEMO

EXPOSE 3000

CMD ["npm", "run", "dev"]

