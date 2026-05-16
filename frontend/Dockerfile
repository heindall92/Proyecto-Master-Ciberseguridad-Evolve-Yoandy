FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
COPY tsconfig.json /app/tsconfig.json
COPY vite.config.ts /app/vite.config.ts

RUN npm install

COPY app /app/app

ARG VITE_API_BASE_URL
ARG VITE_ALLOW_OFFLINE_DEMO=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ALLOW_OFFLINE_DEMO=$VITE_ALLOW_OFFLINE_DEMO

EXPOSE 3000

CMD ["npm", "run", "dev"]

