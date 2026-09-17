# syntax=docker/dockerfile:1

# --- Build stage --------------------------------------------------------
# Frontend-only SPA: builds the EnergyPlus schema bundle, typechecks and
# produces a static dist/ that the runtime stage just serves.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

# nginx:alpine's own image already runs `nginx -g "daemon off;"` as the
# entrypoint's default command.
