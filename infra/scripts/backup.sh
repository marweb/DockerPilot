#!/bin/bash
#
# DockPilot Backup Script
#
# This script creates backups of DockPilot data volumes.
#
# Usage:
#   ./backup.sh [options] [output-directory]
#
# Options:
#   -c, --compress  Compress backup with gzip (default)
#   -n, --no-compress  Don't compress backup
#   -r, --retention N  Keep only N backups (default: 7)
#   -q, --quiet     Minimal output
#   -h, --help      Show this help message
#
# The backup includes:
#   - API Gateway data (user accounts, settings)
#   - Docker Control data (compose files, configurations)
#   - Tunnel Control data (tunnel credentials)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$INFRA_DIR")"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dockpilot}"

# Default values
COMPRESS=true
RETENTION=7
QUIET=false
OUTPUT_DIR=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="dockpilot-backup-${TIMESTAMP}"

# Colors for output (disabled in quiet mode)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Show help
show_help() {
    cat << EOF
DockPilot Backup Script

Usage: $0 [options] [output-directory]

Options:
  -c, --compress    Compress backup with gzip (default)
  -n, --no-compress Don't compress backup
  -r, --retention N Keep only N backups (default: 7)
  -q, --quiet       Minimal output
  -h, --help        Show this help message

Arguments:
  output-directory  Directory where backups will be stored
                    (default: /opt/dockpilot/backups)

Examples:
  $0                          # Create backup with default settings
  $0 /mnt/backups             # Backup to custom directory
  $0 -n /tmp/backup           # Create uncompressed backup
  $0 -r 30                    # Keep 30 days of backups

Backup includes:
  - API Gateway data (user accounts, settings)
  - Docker Control data (compose files, configurations)
  - Tunnel Control data (tunnel credentials)
EOF
}

# Check if Docker is available
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

# Create backup directory
create_backup_dir() {
    if [[ -z "$OUTPUT_DIR" ]]; then
        OUTPUT_DIR="/opt/dockpilot/backups"
    fi
    
    # Create directory if it doesn't exist
    if [[ ! -d "$OUTPUT_DIR" ]]; then
        log_info "Creating backup directory: $OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
    fi
    
    # Check if directory is writable
    if [[ ! -w "$OUTPUT_DIR" ]]; then
        log_error "Backup directory is not writable: $OUTPUT_DIR"
        exit 1
    fi
}

# Backup a single volume
backup_volume() {
    local volume_name="$1"
    local backup_file="$2"
    
    log_info "Backing up volume: $volume_name"
    
    # Create a temporary container to access the volume
    if docker run --rm \
        -v "${volume_name}:/data:ro" \
        -v "${OUTPUT_DIR}:/backup" \
        alpine:latest \
        tar -czf "/backup/${backup_file}.tar.gz" -C /data .; then
        log_success "Volume $volume_name backed up successfully"
    else
        log_error "Failed to backup volume: $volume_name"
        return 1
    fi
}

# Create full backup
create_backup() {
    local backup_path="${OUTPUT_DIR}/${BACKUP_NAME}"
    
    log_info "Creating backup: $BACKUP_NAME"
    
    # Create temporary directory for this backup
    mkdir -p "$backup_path"
    
    # Define volumes to backup
    local volumes=(
        "${COMPOSE_PROJECT_NAME}_api-gateway-data"
        "${COMPOSE_PROJECT_NAME}_docker-control-data"
        "${COMPOSE_PROJECT_NAME}_tunnel-control-data"
    )
    
    # Backup each volume
    local failed=0
    for volume in "${volumes[@]}"; do
        if docker volume inspect "$volume" &> /dev/null; then
            if ! backup_volume "$volume" "${BACKUP_NAME}/${volume}"; then
                ((failed++))
            fi
        else
            log_warn "Volume not found: $volume"
        fi
    done
    
    # Backup environment file
    if [[ -f "$INFRA_DIR/.env" ]]; then
        log_info "Backing up environment configuration"
        cp "$INFRA_DIR/.env" "$backup_path/.env"
    fi
    
    # Create metadata file
    cat > "$backup_path/metadata.txt" << EOF
DockPilot Backup
================
Created: $(date -Iseconds)
Hostname: $(hostname)
Version: $(cd "$PROJECT_ROOT" && git describe --tags 2>/dev/null || echo "unknown")
Volumes: ${volumes[*]}
EOF
    
    # Compress if requested
    if [[ "$COMPRESS" == true ]]; then
        log_info "Compressing backup..."
        cd "$OUTPUT_DIR"
        tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
        rm -rf "$backup_path"
        backup_path="${OUTPUT_DIR}/${BACKUP_NAME}.tar.gz"
    else
        backup_path="${backup_path}.tar"
    fi
    
    # Check if backup was successful
    if [[ $failed -eq 0 ]]; then
        log_success "Backup created successfully: $backup_path"
        
        # Show backup size
        local size
        size=$(du -h "$backup_path" | cut -f1)
        log_info "Backup size: $size"
    else
        log_warn "Backup completed with $failed errors"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups (keeping last $RETENTION)"
    
    # List and sort backup files by modification time
    local backups
    backups=$(find "$OUTPUT_DIR" -maxdepth 1 -name "dockpilot-backup-*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | cut -d' ' -f2-)
    
    local count
    count=$(echo "$backups" | wc -l)
    
    if [[ $count -gt $RETENTION ]]; then
        local to_delete=$((count - RETENTION))
        log_info "Removing $to_delete old backup(s)"
        
        echo "$backups" | head -n "$to_delete" | while read -r backup; do
            log_info "Removing: $(basename "$backup")"
            rm -f "$backup"
        done
    else
        log_info "No old backups to remove"
    fi
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--compress)
                COMPRESS=true
                shift
                ;;
            -n|--no-compress)
                COMPRESS=false
                shift
                ;;
            -r|--retention)
                if [[ -n "${2:-}" && "$2" =~ ^[0-9]+$ ]]; then
                    RETENTION="$2"
                    shift 2
                else
                    log_error "Option --retention requires a number"
                    exit 1
                fi
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
            *)
                # Non-option argument is the output directory
                OUTPUT_DIR="$1"
                shift
                ;;
        esac
    done
}

# Main execution
main() {
    parse_args "$@"
    
    if [[ "$QUIET" == false ]]; then
        echo "=================================="
        echo "   DockPilot Backup"
        echo "=================================="
        echo ""
    fi
    
    check_docker
    create_backup_dir
    
    if create_backup; then
        cleanup_old_backups
        
        if [[ "$QUIET" == false ]]; then
            echo ""
            log_success "Backup process completed successfully"
        fi
        exit 0
    else
        log_error "Backup process failed"
        exit 1
    fi
}

# Run main function
main "$@"
