#!/bin/bash
#
# DockPilot Auto-Update Script
#
# Checks for new versions and triggers an upgrade if auto-update is enabled.
# Designed to be run as a cron job at 00:00 UTC daily.
#
# The auto-update setting is stored in the api-gateway's SQLite database.
# This script queries the API to check if auto-update is enabled before proceeding.
#
# Usage:
#   ./auto-update.sh
#
# Cron entry (added by install.sh):
#   0 0 * * * /data/dockpilot/source/auto-update.sh >> /data/dockpilot/source/auto-update.log 2>&1
#

set -e

CDN="${CDN:-https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts}"
SOURCE_DIR="${SOURCE_DIR:-/data/dockpilot/source}"
LOG_FILE="${SOURCE_DIR}/auto-update.log"
LOCK_FILE="${SOURCE_DIR}/.auto-update.lock"
ENV_FILE="${SOURCE_DIR}/.env"
MAX_LOG_SIZE=1048576  # 1MB

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S UTC')] $1"
}

# Rotate log if too large
if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$MAX_LOG_SIZE" ]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
fi

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    log "Auto-update already running (PID: $LOCK_PID). Exiting."
    exit 0
  fi
  # Stale lock file, remove it
  rm -f "$LOCK_FILE"
fi

echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

log "=== DockPilot Auto-Update Check ==="

# Step 1: Check if auto-update is enabled via the API
API_PORT="${API_GATEWAY_PORT:-3000}"
AUTO_UPDATE_ENABLED=false

# Try to get the setting from the API
# We need a valid JWT token, but since this runs on the host, we'll check the database directly
DB_FILE=""
# Find the api-gateway data volume
VOLUME_PATH=$(docker volume inspect api-gateway-data --format '{{.Mountpoint}}' 2>/dev/null || \
              docker volume inspect dockpilot_api-gateway-data --format '{{.Mountpoint}}' 2>/dev/null || \
              docker volume inspect source_api-gateway-data --format '{{.Mountpoint}}' 2>/dev/null || \
              echo "")

if [ -n "$VOLUME_PATH" ] && [ -f "${VOLUME_PATH}/dockpilot.db" ]; then
  DB_FILE="${VOLUME_PATH}/dockpilot.db"
elif [ -f "/data/dockpilot/api-gateway-data/dockpilot.db" ]; then
  DB_FILE="/data/dockpilot/api-gateway-data/dockpilot.db"
fi

if [ -n "$DB_FILE" ] && command -v sqlite3 >/dev/null 2>&1; then
  SETTING=$(sqlite3 "$DB_FILE" "SELECT value FROM meta WHERE key='setting_auto_update'" 2>/dev/null || echo "")
  if [ "$SETTING" = "true" ]; then
    AUTO_UPDATE_ENABLED=true
  fi
elif [ -n "$DB_FILE" ]; then
  # No sqlite3 available, try using docker to query
  SETTING=$(docker run --rm -v "${DB_FILE}:/db/dockpilot.db:ro" alpine:latest sh -c \
    "apk add --no-cache sqlite >/dev/null 2>&1 && sqlite3 /db/dockpilot.db \"SELECT value FROM meta WHERE key='setting_auto_update'\"" 2>/dev/null || echo "")
  if [ "$SETTING" = "true" ]; then
    AUTO_UPDATE_ENABLED=true
  fi
else
  log "Cannot find database to check auto-update setting. Skipping."
  exit 0
fi

if [ "$AUTO_UPDATE_ENABLED" != "true" ]; then
  log "Auto-update is disabled. Skipping."
  exit 0
fi

log "Auto-update is enabled. Checking for updates..."

# Step 2: Get current version
CURRENT_VERSION="0.0.0"
if [ -f "$ENV_FILE" ] && grep -q "^DOCKPILOT_VERSION=" "$ENV_FILE" 2>/dev/null; then
  CURRENT_VERSION=$(grep "^DOCKPILOT_VERSION=" "$ENV_FILE" | cut -d'=' -f2)
fi

log "Current version: ${CURRENT_VERSION}"

# Step 3: Fetch latest version from CDN
LATEST_VERSION=""
if VERSIONS_JSON=$(curl -sSfL "${CDN}/versions.json" 2>/dev/null); then
  LATEST_VERSION=$(echo "$VERSIONS_JSON" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$LATEST_VERSION" ]; then
  log "Failed to fetch latest version. Skipping."
  exit 1
fi

log "Latest version: ${LATEST_VERSION}"

# Step 4: Compare versions
version_gt() {
  # Returns 0 (true) if $1 > $2
  local IFS=.
  local i ver1=($1) ver2=($2)
  for ((i=0; i<${#ver1[@]} || i<${#ver2[@]}; i++)); do
    local v1=${ver1[i]:-0}
    local v2=${ver2[i]:-0}
    if [ "$v1" -gt "$v2" ] 2>/dev/null; then
      return 0
    elif [ "$v1" -lt "$v2" ] 2>/dev/null; then
      return 1
    fi
  done
  return 1  # equal
}

if ! version_gt "$LATEST_VERSION" "$CURRENT_VERSION"; then
  log "Already running the latest version (${CURRENT_VERSION}). No update needed."
  exit 0
fi

log "Update available: ${CURRENT_VERSION} -> ${LATEST_VERSION}"

# Step 5: Run upgrade
log "Starting auto-upgrade to ${LATEST_VERSION}..."
cd "$SOURCE_DIR"

if [ -f "${SOURCE_DIR}/upgrade.sh" ]; then
  export CDN
  export SOURCE_DIR
  bash "${SOURCE_DIR}/upgrade.sh" "${LATEST_VERSION}" 2>&1
  UPGRADE_EXIT=$?

  if [ $UPGRADE_EXIT -eq 0 ]; then
    log "Auto-upgrade to ${LATEST_VERSION} completed successfully."
  else
    log "Auto-upgrade failed with exit code ${UPGRADE_EXIT}."
    exit $UPGRADE_EXIT
  fi
else
  # Download upgrade.sh first
  log "Downloading upgrade.sh..."
  curl -fsSL "${CDN}/upgrade.sh" -o "${SOURCE_DIR}/upgrade.sh"
  chmod +x "${SOURCE_DIR}/upgrade.sh"
  export CDN
  export SOURCE_DIR
  bash "${SOURCE_DIR}/upgrade.sh" "${LATEST_VERSION}" 2>&1
fi

log "=== Auto-Update Complete ==="
