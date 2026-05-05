FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY assets ./assets
COPY *.html ./

RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/app.db \
    PUBLIC_DIR=/app \
    SEED_TREE_PATH=/app/assets/data/tree.json

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
