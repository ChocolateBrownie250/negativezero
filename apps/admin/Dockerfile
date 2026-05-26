# syntax=docker/dockerfile:1.6
# node:22-bookworm-slim (Debian + glibc) — sodium-native ships glibc prebuilds
# but not musl prebuilds, so Alpine would force a slow build-from-source on
# @fastify/secure-session's transitive dep. Same trade-off the bookmark-manager
# Dockerfile already makes; ~70 MB extra image size is fine for a single-tenant
# personal platform.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install --include=dev

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app

COPY --from=build /app/server/dist ./server/dist
# npm workspaces hoist deps to the workspace root, not per-package, so
# /app/server/node_modules doesn't exist. Copy the root and let node's
# module resolution walk up from /app/server.
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server/package.json ./server/

COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /app/server/data && chown -R app:app /app
USER app
EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/index.js"]
