#!/bin/bash
#
# DockPilot Restore Script
#
# Restores DockPilot data volumes from a backup created by infra/scripts/backup.sh.
#
# Safety model:
# - Default mode is dry-run (no writes)
# - Real restore requires --apply

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dockpilot}"

APPLY=false
RESTORE_ENV=false
QUIET=false
BACKUP_SOURCE=""
TEMP_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    if [[ "$QUIET" == false ]]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [[ "$QUIET" == false ]]; then
        echo -e "${GREEN}[SUCCESS]${NC} $1"
    fi
}

log_warn() {
    if [[ "$QUIET" == false ]]; then
        echo -e "${YELLOW}[WARN]${NC} $1"
    fi
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

show_help() {
    cat << EOF
DockPilot Restore Script

Usage: $0 [options] <backup-file-or-directory>

Options:
  --apply         Apply restore changes (required for write operations)
  --restore-env   Restore infra/.env from backup if present
  -q, --quiet     Minimal output
  -h, --help      Show this help message

Examples:
  $0 /opt/dockpilot/backups/dockpilot-backup-20260214_110000.tar.gz
  $0 --apply /opt/dockpilot/backups/dockpilot-backup-20260214_110000.tar.gz
  $0 --apply --restore-env /opt/dockpilot/backups/dockpilot-backup-20260214_110000.tar.gz

Notes:
  - Without --apply, this script runs in dry-run mode.
  - Restore overwrites volume contents for DockPilot services.
EOF
}

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --apply)
                APPLY=true
                shift
                ;;
            --restore-env)
                RESTORE_ENV=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -* )
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
            * )
                if [[ -n "$BACKUP_SOURCE" ]]; then
                    log_error "Only one backup source is allowed"
                    exit 1
                fi
                BACKUP_SOURCE="$1"
                shift
                ;;
        esac
    done

    if [[ -z "$BACKUP_SOURCE" ]]; then
        log_error "Backup source is required"
        show_help
        exit 1
    fi
}

resolve_backup_root() {
    local source="$1"

    if [[ -d "$source" ]]; then
        echo "$source"
        return
    fi

    if [[ -f "$source" && "$source" == *.tar.gz ]]; then
        TEMP_DIR="$(mktemp -d)"
        log_info "Extracting backup archive to temporary directory"
        tar -xzf "$source" -C "$TEMP_DIR"

        local first_entry_path
        local first_entry
        first_entry_path="$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -print -quit)"
        if [[ -z "$first_entry_path" ]]; then
            log_error "Backup archive appears empty"
            exit 1
        fi
        first_entry="$(basename "$first_entry_path")"
        if [[ -z "$first_entry" ]]; then
            log_error "Backup archive appears empty"
            exit 1
        fi

        echo "$TEMP_DIR/$first_entry"
        return
    fi

    log_error "Backup source must be a directory or .tar.gz file"
    exit 1
}

restore_volume() {
    local volume_name="$1"
    local backup_root="$2"
    local archive_path="$backup_root/$volume_name.tar.gz"

    if [[ ! -f "$archive_path" ]]; then
        log_warn "Volume backup not found, skipping: $volume_name"
        return 0
    fi

    log_info "Validating archive: $archive_path"
    tar -tzf "$archive_path" > /dev/null

    if [[ "$APPLY" == false ]]; then
        log_info "Dry-run: would restore volume $volume_name"
        return 0
    fi

    if ! docker volume inspect "$volume_name" > /dev/null 2>&1; then
        log_info "Creating missing volume: $volume_name"
        docker volume create "$volume_name" > /dev/null
    fi

    log_info "Restoring volume: $volume_name"
    docker run --rm \
        -v "$volume_name:/data" \
        -v "$backup_root:/backup:ro" \
        alpine:latest \
        sh -c "rm -rf /data/* /data/.??* /data/.[!.]* 2>/dev/null || true; tar -xzf /backup/$volume_name.tar.gz -C /data"

    log_success "Volume restored: $volume_name"
}

restore_env_file() {
    local backup_root="$1"
    local backup_env="$backup_root/.env"

    if [[ ! -f "$backup_env" ]]; then
        log_warn "No .env file in backup"
        return 0
    fi

    if [[ "$APPLY" == false ]]; then
        log_info "Dry-run: would restore infra/.env from backup"
        return 0
    fi

    cp "$backup_env" "$INFRA_DIR/.env"
    chmod 600 "$INFRA_DIR/.env" || true
    log_success "Restored infra/.env"
}

main() {
    parse_args "$@"
    check_docker

    local backup_root
    backup_root="$(resolve_backup_root "$BACKUP_SOURCE")"

    if [[ ! -d "$backup_root" ]]; then
        log_error "Resolved backup root does not exist: $backup_root"
        exit 1
    fi

    if [[ "$APPLY" == false ]]; then
        log_warn "Running in dry-run mode. Use --apply to perform restore."
    fi

    local volumes=(
        "${COMPOSE_PROJECT_NAME}_api-gateway-data"
        "${COMPOSE_PROJECT_NAME}_docker-control-data"
        "${COMPOSE_PROJECT_NAME}_tunnel-control-data"
    )

    for volume in "${volumes[@]}"; do
        restore_volume "$volume" "$backup_root"
    done

    if [[ "$RESTORE_ENV" == true ]]; then
        restore_env_file "$backup_root"
    fi

    if [[ "$APPLY" == true ]]; then
        log_success "Restore completed. Restart DockPilot services to apply state."
    else
        log_success "Dry-run completed. No data was modified."
    fi
}

main "$@"
