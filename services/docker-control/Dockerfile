# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY services/docker-control/package.json ./services/docker-control/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY services/docker-control ./services/docker-control
COPY tsconfig.json ./

# Build types package first
RUN pnpm --filter @dockpilot/types build

# Build docker-control
RUN pnpm --filter @dockpilot/docker-control build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install docker CLI (for compose commands)
RUN apk add --no-cache docker-cli docker-cli-compose

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy built files
COPY --from=builder /app/services/docker-control/dist ./dist
COPY --from=builder /app/services/docker-control/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./node_modules/@dockpilot/types/dist
COPY --from=builder /app/packages/types/package.json ./node_modules/@dockpilot/types/

# Create data directory
RUN mkdir -p /data/compose

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/healthz || exit 1

# Start the service
CMD ["node", "dist/index.js"]
