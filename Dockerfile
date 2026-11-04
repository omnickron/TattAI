# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# prisma.config.ts needs a DATABASE_URL to load; the real one only exists at runtime.
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN DATABASE_URL="$BUILD_DATABASE_URL" npm ci

# Full toolchain: builds the app and is reused for migrations and jobs.
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Shared user + private media dir, so worker (writes) and app (reads) agree on ownership
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN export DATABASE_URL="$BUILD_DATABASE_URL" && npx prisma generate && npm run build \
  && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
  && mkdir -p /data/media && chown app:app /data/media && chmod 700 /data/media

# Minimal runtime image with the standalone Next.js server.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
  && mkdir -p /data/media && chown app:app /data/media && chmod 700 /data/media
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
