#!/bin/bash
#
# DockPilot Upgrade Script
#
# Downloads latest compose files, merges .env, pulls images, and restarts services.
# Called by install.sh, auto-update.sh, and can be run manually for updates.
#
# Usage:
#   ./upgrade.sh [VERSION] [REGISTRY_URL]
#
# Example:
#   ./upgrade.sh 1.0.0
#   ./upgrade.sh latest ghcr.io

set -e

CDN="${CDN:-https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts}"
SOURCE_DIR="${SOURCE_DIR:-/data/dockpilot/source}"
VERSION="${1:-latest}"
REGISTRY_URL="${2:-ghcr.io}"
STATUS_FILE="${SOURCE_DIR}/.upgrade-status"
COMPOSE_FILE="${SOURCE_DIR}/docker-compose.yml"
COMPOSE_PROD="${SOURCE_DIR}/docker-compose.prod.yml"
ENV_FILE="${SOURCE_DIR}/.env"
BACKUP_DIR="${SOURCE_DIR}/.upgrade-backup"

write_status() {
  local step="$1"
  local message="$2"
  echo "${step}|${message}|$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$STATUS_FILE"
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Wait for a container to become healthy (used for recovery when compose up fails)
wait_for_healthy() {
  local container="$1"
  local max_wait="${2:-90}"
  local waited=0
  while [ $waited -lt $max_wait ]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

# Ensure source dir exists
mkdir -p "$SOURCE_DIR"
cd "$SOURCE_DIR"

write_status "1" "Starting upgrade to ${VERSION}"

# Step 1: Backup current state
log "Backing up current configuration..."
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
[ -f "$COMPOSE_FILE" ] && cp "$COMPOSE_FILE" "${BACKUP_DIR}/docker-compose.yml" 2>/dev/null || true
[ -f "$COMPOSE_PROD" ] && cp "$COMPOSE_PROD" "${BACKUP_DIR}/docker-compose.prod.yml" 2>/dev/null || true
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "${BACKUP_DIR}/.env" 2>/dev/null || true

# Step 2: Download docker-compose files
log "Downloading docker-compose.yml..."
curl -fsSL "${CDN}/docker-compose.yml" -o "${COMPOSE_FILE}"
log "Downloading docker-compose.prod.yml..."
curl -fsSL "${CDN}/docker-compose.prod.yml" -o "${COMPOSE_PROD}"
write_status "2" "Compose files downloaded"

# Step 3: Merge .env (preserve ALL existing custom values)
log "Updating .env..."

if [ -f "${BACKUP_DIR}/.env" ]; then
  # Read all existing values from the old .env
  declare -A OLD_VALUES
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.* ]] && continue
    [[ -z "$key" ]] && continue
    # Trim whitespace
    key=$(echo "$key" | xargs)
    [ -z "$key" ] && continue
    OLD_VALUES["$key"]="$value"
  done < "${BACKUP_DIR}/.env"

  # Download new template
  curl -fsSL "${CDN}/.env.production" -o "$ENV_FILE"

  # Restore ALL previously set values (preserves user customizations)
  for key in "${!OLD_VALUES[@]}"; do
    value="${OLD_VALUES[$key]}"
    # Only restore if the value was actually set (not empty)
    if [ -n "$value" ]; then
      if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        # Replace existing key
        if [[ "$(uname)" == "Darwin" ]]; then
          sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        else
          sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        fi
      else
        # Add key that exists in old config but not in new template
        echo "${key}=${value}" >> "$ENV_FILE"
      fi
    fi
  done
else
  # No existing .env - fresh install
  curl -fsSL "${CDN}/.env.production" -o "$ENV_FILE"

  # Generate JWT_SECRET if not set
  if ! grep -q "^JWT_SECRET=..*" "$ENV_FILE" 2>/dev/null; then
    NEW_JWT=$(openssl rand -hex 32)
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|" "$ENV_FILE"
    else
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|" "$ENV_FILE"
    fi
  fi
fi

# Always update version to the target
if grep -q "^DOCKPILOT_VERSION=" "$ENV_FILE"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^DOCKPILOT_VERSION=.*|DOCKPILOT_VERSION=${VERSION}|" "$ENV_FILE"
  else
    sed -i "s|^DOCKPILOT_VERSION=.*|DOCKPILOT_VERSION=${VERSION}|" "$ENV_FILE"
  fi
else
  echo "DOCKPILOT_VERSION=${VERSION}" >> "$ENV_FILE"
fi

write_status "3" "Environment updated"

# Step 4: Download auto-update script
log "Downloading auto-update.sh..."
curl -fsSL "${CDN}/auto-update.sh" -o "${SOURCE_DIR}/auto-update.sh" 2>/dev/null || true
chmod +x "${SOURCE_DIR}/auto-update.sh" 2>/dev/null || true

# Step 5: Pull images
log "Pulling Docker images..."
export DOCKPILOT_VERSION="$VERSION"
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" pull
write_status "4" "Images pulled"

# Step 6: Recreate containers
log "Recreating containers..."
COMPOSE_OUTPUT=$(mktemp)
cleanup() {
  rm -f "$COMPOSE_OUTPUT"
}
trap cleanup EXIT

if ! docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" up -d --remove-orphans --force-recreate 2>&1 | tee "$COMPOSE_OUTPUT"; then
  log "Initial container startup failed. Attempting recovery..."
  # Base services (docker-control, tunnel-control) may be running but marked unhealthy
  # Wait for them to become healthy, then retry starting dependent containers
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'dockpilot-docker-control' && \
     docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'dockpilot-tunnel-control'; then
    log "Base containers are running. Waiting for them to become healthy (up to 90s)..."
    if wait_for_healthy "dockpilot-docker-control" 90 && wait_for_healthy "dockpilot-tunnel-control" 90; then
      log "Base containers are healthy. Starting dependent containers..."
      if docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" up -d --no-recreate; then
        write_status "5" "Containers recreated"
      else
        log "Recovery failed: could not start dependent containers."
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" ps || true
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" logs --tail=120 \
          docker-control tunnel-control api-gateway web || true
        if grep -q "address already in use" "$COMPOSE_OUTPUT" 2>/dev/null; then
          log "Hint: dockpilot-web could not bind. Check: ss -tulpn | grep :8000"
        fi
        write_status "5" "Containers failed to start"
        exit 1
      fi
    else
      log "Recovery failed: base containers did not become healthy in time."
      docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" ps || true
      docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" logs --tail=120 \
        docker-control tunnel-control api-gateway web || true
      write_status "5" "Containers failed to start"
      exit 1
    fi
  else
    log "Container startup failed. Collecting diagnostics..."
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" ps || true
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" logs --tail=120 \
      docker-control tunnel-control api-gateway web || true
    if grep -q "address already in use" "$COMPOSE_OUTPUT" 2>/dev/null; then
      log "Hint: dockpilot-web could not bind. Check: ss -tulpn | grep :8000"
    fi
    write_status "5" "Containers failed to start"
    exit 1
  fi
else
  write_status "5" "Containers recreated"
fi

# Step 7: Cleanup old images
log "Cleaning up old images..."
docker image prune -f 2>/dev/null || true
write_status "6" "Upgrade complete"

log "DockPilot upgraded to ${VERSION} successfully."

# Remove status file after a delay (for install.sh polling)
(sleep 10 && rm -f "$STATUS_FILE") &
