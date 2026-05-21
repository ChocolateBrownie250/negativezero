# syntax=docker/dockerfile:1.6
# Switched off node:20-alpine to node:20-bookworm-slim (Debian + glibc):
# sodium-native@4.3.3 ships prebuilds for linux-x64 (glibc) but not for
# linux-x64-musl, so on Alpine the addon couldn't be loaded and the
# container crash-looped on @fastify/secure-session import. Debian-slim
# matches the prebuild, no build-from-source needed. ~70 MB extra image
# size, well worth the simplicity for a single-tenant deploy.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app

# Server runtime
COPY --from=build /app/server/dist ./server/dist
# npm workspaces hoist deps to the workspace root, not per-package, so
# /app/server/node_modules doesn't exist. Copy the root and let node's
# module resolution walk up from /app/server.
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server/package.json ./server/

# Built client served by fastify-static at /
COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /app/server/data && chown -R app:app /app
USER app
EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/index.js"]
