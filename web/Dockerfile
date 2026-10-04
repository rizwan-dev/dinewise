# syntax=docker/dockerfile:1

# --- Dependencies ----------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# --- Build -----------------------------------------------------------------------------------
FROM deps AS build
COPY . .
# The build renders nothing that needs the database or secrets (every page is dynamic), but the
# configuration module is imported, so it gets harmless placeholders.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN pnpm build

# --- Run -------------------------------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN addgroup -S tadka && adduser -S tadka -G tadka && mkdir -p /data/uploads && chown tadka:tadka /data/uploads

COPY --from=build --chown=tadka:tadka /app/.next/standalone ./
COPY --from=build --chown=tadka:tadka /app/.next/static ./.next/static
COPY --from=build --chown=tadka:tadka /app/public ./public
# Migrations run at start-up (see src/instrumentation.ts), so they ship with the server.
COPY --from=build --chown=tadka:tadka /app/drizzle ./drizzle

USER tadka
EXPOSE 3000
VOLUME /data/uploads

# 127.0.0.1, not localhost: on Alpine, localhost resolves to IPv6 first.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
