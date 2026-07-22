# Dockerfile for Hugging Face Spaces (or any Docker host)
# Kept intentionally simple: uses npm only (no corepack/yarn dance), and
# tolerates missing lockfiles. Works on any Node 20 image.

# ---- 1. deps ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* yarn.lock* ./
# Prefer clean install with lockfile, otherwise fall back to plain install.
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps || npm install --legacy-peer-deps; \
    else \
      npm install --legacy-peer-deps; \
    fi

# ---- 2. builder ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure public/ exists so the runner stage's COPY can't miss it.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1024
RUN npm run build

# ---- 3. runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# HF Spaces expects port 7860 by default.
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 7860
CMD ["node", "server.js"]
