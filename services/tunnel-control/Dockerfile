# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY services/tunnel-control/package.json ./services/tunnel-control/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY services/tunnel-control ./services/tunnel-control
COPY tsconfig.json ./

# Build types package first
RUN pnpm --filter @dockpilot/types build

# Build tunnel-control
RUN pnpm --filter @dockpilot/tunnel-control build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install cloudflared (multi-arch: amd64, arm64)
ARG TARGETARCH
RUN apk add --no-cache curl && \
    CLOUDFLARED_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "amd64") && \
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}" -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy built files
COPY --from=builder /app/services/tunnel-control/dist ./dist
COPY --from=builder /app/services/tunnel-control/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./node_modules/@dockpilot/types/dist
COPY --from=builder /app/packages/types/package.json ./node_modules/@dockpilot/types/

# Create data directory
RUN mkdir -p /data/tunnels

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/healthz || exit 1

# Start the service
CMD ["node", "dist/index.js"]
