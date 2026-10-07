# syntax=docker/dockerfile:1.7
#
# Frontend image (M9): static build served by unprivileged nginx.
# Only PUBLIC build-time configuration is accepted (VITE_* values end up in the
# JavaScript bundle, readable by anyone). No secret may be passed here; the
# build fails if the bundle secret scan finds one (scripts/check-bundle-secrets.mjs;
# pass exact secret values to scan for via the FORBIDDEN_SECRETS build secret).
# .dockerignore keeps local .env files out of the build context.

FROM node:24.16.0-alpine3.22 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
ARG VITE_MARINE_API_BASE=/api/v1
ARG VITE_SERVER_CALCULATION=false
ARG VITE_CALC_SHADOW=false
# Publishable/public tokens only (never service keys).
ARG VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN=""
ENV VITE_MARINE_API_BASE=$VITE_MARINE_API_BASE VITE_SERVER_CALCULATION=$VITE_SERVER_CALCULATION \
    VITE_CALC_SHADOW=$VITE_CALC_SHADOW \
    VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN=$VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN
RUN --mount=type=secret,id=forbidden_secrets,required=false \
    npm run build && \
    FORBIDDEN_SECRETS="$(cat /run/secrets/forbidden_secrets 2>/dev/null || true)" npm run check:bundle

FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
