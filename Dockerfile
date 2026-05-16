# Dockerfile v2 — multi-stage : (1) install des deps workspaces, (2) build
# (shared + server + web), (3) runtime minimaliste (uniquement le bundle
# compilé + node_modules prod, sans les sources TS ni les tests).

# -------- Stage 1 : deps (full, build et runtime confondus) -------------
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Lockfile racine + manifestes de chaque workspace : permet à npm de
# résoudre les workspaces sans avoir besoin du code source.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci --no-audit --no-fund

# -------- Stage 2 : build (shared → server → web) -----------------------
FROM deps AS build

WORKDIR /app

COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web

RUN npm run build -w @latelier/shared \
 && npm run build -w @latelier/server \
 && npm run build -w @latelier/web

# -------- Stage 3 : runtime (slim) --------------------------------------
FROM node:20-alpine AS runtime

RUN apk add --no-cache tini && \
    addgroup -g 1001 app && adduser -u 1001 -G app -D app

WORKDIR /app

# Production deps uniquement (omit=dev).
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/shared/package.json ./shared/
COPY --from=deps /app/server/package.json ./server/
RUN npm ci --omit=dev --no-audit --no-fund

# Bundles compilés
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./public

# Migrations SQL embarquées (lues à runtime par le migrator)
COPY --from=build /app/server/src/db/migrations ./server/dist/db/migrations

# Volume DB
RUN mkdir -p /data && chown -R app:app /data /app

USER app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/app.db \
    PUBLIC_DIR=/app/public \
    LOG_LEVEL=info

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/index.js"]
