# Multi-stage production Dockerfile for EasyLedger Fastify API
# Node.js 22 LTS on Alpine Linux for ultra-minimal attack surface and fast startup
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package manifest and workspace dependencies
COPY package*.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY db ./db
COPY scripts ./scripts

# Install production dependencies
RUN npm ci --omit=dev

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Non-root security user
USER node

# Copy application assets from builder
COPY --chown=node:node --from=builder /app /app

EXPOSE 3000

# Healthcheck probe using built-in Node.js fetch (FR-01, NFR-02)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "apps/api/server.ts"]
