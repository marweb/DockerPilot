# Build stage
# Build on BUILDPLATFORM to avoid QEMU crashes while installing dependencies
# during multi-arch builds (linux/arm64 under emulation).
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY services/tunnel-control/package.json ./services/tunnel-control/

# Copy source code
COPY packages/types ./packages/types
COPY services/tunnel-control ./services/tunnel-control
COPY tsconfig.json ./

# Install only service + workspace dependencies; --ignore-scripts prevents
# native module compilation (argon2, better-sqlite3, ssh2) that crashes under
# QEMU ARM64 emulation. tunnel-control has no native dependencies at runtime.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted --ignore-scripts \
  --filter @dockpilot/tunnel-control... \
  --filter @dockpilot/types...

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

# Health check (curl -sf fails on HTTP errors; 127.0.0.1 avoids IPv6 resolution issues)
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -sf http://127.0.0.1:3002/healthz || exit 1

# Start the service
CMD ["node", "dist/index.js"]
