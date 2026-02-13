# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY services/api-gateway/package.json ./services/api-gateway/

# Copy source code
COPY packages/types ./packages/types
COPY services/api-gateway ./services/api-gateway
COPY tsconfig.json ./

# Install only service + workspace dependencies
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted \
  --filter @dockpilot/api-gateway... \
  --filter @dockpilot/types...

# Build types package first
RUN pnpm --filter @dockpilot/types build

# Build api-gateway
RUN pnpm --filter @dockpilot/api-gateway build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy built files
COPY --from=builder /app/services/api-gateway/dist ./dist
COPY --from=builder /app/services/api-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./node_modules/@dockpilot/types/dist
COPY --from=builder /app/packages/types/package.json ./node_modules/@dockpilot/types/

# Create data directory and install sqlite3 for debugging/backup
RUN mkdir -p /data && apk add --no-cache sqlite

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/healthz || exit 1

# Start the service
CMD ["node", "dist/index.js"]
