# Build stage for the web application
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/

# Copy source code
COPY packages/types ./packages/types
COPY apps/web ./apps/web
COPY tsconfig.json ./
COPY turbo.json ./

# Install only app + workspace dependencies to speed up CI and avoid unrelated native builds
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted \
  --filter @dockpilot/web... \
  --filter @dockpilot/types...

# Build types package first
RUN pnpm --filter @dockpilot/types build

# Build web app
RUN pnpm --filter @dockpilot/web build

# Production stage with nginx
FROM nginx:1.25-alpine

# Copy built files to nginx html directory
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy custom nginx configuration for SPA + API proxy
COPY infra/nginx-spa.conf /etc/nginx/conf.d/default.conf

# Create a simple health check endpoint
RUN echo '<!DOCTYPE html><html><body>OK</body></html>' > /usr/share/nginx/html/healthz

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:80/healthz || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
