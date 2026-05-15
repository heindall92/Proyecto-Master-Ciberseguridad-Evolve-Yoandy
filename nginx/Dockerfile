# Stage 1 — Build React dashboard
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts ./
RUN npm install
COPY frontend/app ./app
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Stage 2 — Nginx gateway (HTTPS + API + WebSocket)
FROM nginx:alpine
RUN apk add --no-cache openssl
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=frontend-builder /app/app/dist /usr/share/nginx/html
EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
