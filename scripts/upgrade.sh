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
set -o pipefail

CDN="${CDN:-https://raw.githubusercontent.com/marweb/DockPilot/master/scripts}"
SOURCE_DIR="${SOURCE_DIR:-/data/dockpilot/source}"
VERSION="${1:-latest}"
REGISTRY_URL="${2:-ghcr.io}"
STATUS_FILE="${SOURCE_DIR}/.upgrade-status"
COMPOSE_FILE="${SOURCE_DIR}/docker-compose.yml"
COMPOSE_PROD="${SOURCE_DIR}/docker-compose.prod.yml"
ENV_FILE="${SOURCE_DIR}/.env"
BACKUP_DIR="${SOURCE_DIR}/.upgrade-backup"
KEEP_DOCKPILOT_IMAGES="${KEEP_DOCKPILOT_IMAGES:-2}"

write_status() {
  local step="$1"
  local message="$2"
  echo "${step}|${message}|$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$STATUS_FILE"
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

prune_old_dockpilot_images() {
  local keep_count="$KEEP_DOCKPILOT_IMAGES"

  if ! [[ "$keep_count" =~ ^[0-9]+$ ]] || [ "$keep_count" -lt 1 ]; then
    keep_count=2
  fi

  local prefix="${REGISTRY_URL}/marweb/dockpilot-"
  local repos

  repos=$(docker image ls --format '{{.Repository}}' | awk -v prefix="$prefix" 'index($0, prefix) == 1 { print $0 }' | sort -u)

  if [ -z "$repos" ]; then
    log "No DockPilot images found for cleanup with prefix ${prefix}"
    return 0
  fi

  while IFS= read -r repo; do
    [ -z "$repo" ] && continue

    docker image ls "$repo" --format '{{.ID}}' \
      | awk '!seen[$0]++' \
      | awk -v keep_count="$keep_count" 'NR > keep_count { print $0 }' \
      | while IFS= read -r image_id; do
          [ -z "$image_id" ] && continue
          if docker image rm "$image_id" >/dev/null 2>&1; then
            log "Removed old image ${repo} (${image_id})"
          fi
        done
  done <<< "$repos"
}

# Wait for a container to become healthy (used for recovery when compose up fails)
wait_for_healthy() {
  local container="$1"
  local max_wait="${2:-90}"
  local waited=0
  while [ "$waited" -lt "$max_wait" ]; do
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

wait_for_required_containers() {
  local max_wait="${1:-150}"
  local waited=0
  local containers="dockpilot-docker-control dockpilot-tunnel-control dockpilot-api-gateway dockpilot-web"

  while [ "$waited" -lt "$max_wait" ]; do
    local all_healthy=true

    for c in $containers; do
      local state_status
      local health_status
      state_status=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null || echo "unknown")
      health_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo "unknown")

      if [ "$state_status" = "exited" ] || [ "$state_status" = "dead" ]; then
        log "Container ${c} failed (state=${state_status})"
        return 1
      fi

      if [ "$health_status" = "unhealthy" ]; then
        log "Container ${c} failed (health=unhealthy)"
        return 1
      fi

      if [ "$health_status" != "healthy" ]; then
        all_healthy=false
      fi
    done

    if [ "$all_healthy" = true ]; then
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
if [ -f "$COMPOSE_FILE" ]; then
  cp "$COMPOSE_FILE" "${BACKUP_DIR}/docker-compose.yml" 2>/dev/null || true
fi
if [ -f "$COMPOSE_PROD" ]; then
  cp "$COMPOSE_PROD" "${BACKUP_DIR}/docker-compose.prod.yml" 2>/dev/null || true
fi
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${BACKUP_DIR}/.env" 2>/dev/null || true
fi

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

  # Generate MASTER_KEY if not set (required for webhook secret encryption)
  if ! grep -q "^MASTER_KEY=..*" "$ENV_FILE" 2>/dev/null || [ -z "$(grep "^MASTER_KEY=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2)" ]; then
    log "Generating MASTER_KEY for webhook secret encryption..."
    NEW_MASTER_KEY=$(openssl rand -base64 32)
    if grep -q "^MASTER_KEY=" "$ENV_FILE" 2>/dev/null; then
      # Replace existing empty or unset MASTER_KEY
      if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s|^MASTER_KEY=.*|MASTER_KEY=${NEW_MASTER_KEY}|" "$ENV_FILE"
      else
        sed -i "s|^MASTER_KEY=.*|MASTER_KEY=${NEW_MASTER_KEY}|" "$ENV_FILE"
      fi
    else
      # Add MASTER_KEY if it doesn't exist
      echo "MASTER_KEY=${NEW_MASTER_KEY}" >> "$ENV_FILE"
    fi
    log "MASTER_KEY generated successfully"
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

log "Waiting for containers to become healthy..."
if ! wait_for_required_containers 150; then
  log "Container health check failed after compose up."
  docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" ps || true
  docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_PROD" logs --tail=120 \
    docker-control tunnel-control api-gateway web || true
  write_status "5" "Containers failed health check"
  exit 1
fi

# Step 7: Cleanup old images
log "Cleaning up old images..."
prune_old_dockpilot_images || true
docker image prune -f 2>/dev/null || true
write_status "6" "Upgrade complete"

log "DockPilot upgraded to ${VERSION} successfully."

# Remove status file after a delay (for install.sh polling)
(sleep 10 && rm -f "$STATUS_FILE") &
