# syntax=docker/dockerfile:1
# ─── Builder: full deps + Prisma client generation ───────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# ─── Runtime: production deps only + generated client ─────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Carry the Prisma client generated in the builder (avoids re-running generate).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY src ./src
COPY prisma ./prisma
COPY scripts ./scripts

# Run as a non-root user.
RUN groupadd -r flow && useradd -r -g flow flow && chown -R flow:flow /app
USER flow

EXPOSE 5000

# Liveness healthcheck for orchestrators that read Docker HEALTHCHECK.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
