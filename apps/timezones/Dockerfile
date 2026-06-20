# syntax=docker/dockerfile:1.6
# node:22-bookworm-slim (Debian + glibc) — better-sqlite3 ships glibc prebuilds,
# matching the other TS services' Dockerfiles. Builds the Fastify server (tsc)
# and ships the static client shell from ./public (served by @fastify/static).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
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

# Static client shell (index.html, app.js, styles.css, fonts) — served publicly
# by Fastify; the client gates itself on /api/v1/me. Lives at /app/public,
# resolved as ../public from the /app/server workdir.
COPY public ./public

RUN mkdir -p /app/server/data && chown -R app:app /app
USER app
EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/index.js"]
