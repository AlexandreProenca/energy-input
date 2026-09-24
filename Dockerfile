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
# Rotas permitidas do proxy de simulação, geradas de scripts/simulationRoutes.ts. O nome
# começa por 00- para o mapa existir antes de default.conf, que o usa.
COPY docker/simulation-routes.conf /etc/nginx/conf.d/00-simulation-routes.conf
# Sem credencial na imagem nem no ambiente: cada pessoa entra com e-mail e senha (T032,
# ADR-0004), e o proxy repassa o token dela.
RUN nginx -t
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

# nginx:alpine's own image already runs `nginx -g "daemon off;"` as the
# entrypoint's default command.
