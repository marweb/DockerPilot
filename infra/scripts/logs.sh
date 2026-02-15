#!/bin/bash
#
# DockPilot Logs Script
#
# This script shows logs from DockPilot services.
#
# Usage:
#   ./logs.sh [service] [options]
#
# Services:
#   api-gateway    Show API Gateway logs
#   docker-control Show Docker Control logs
#   tunnel-control Show Tunnel Control logs
#   web            Show Web Frontend logs (production only)
#   all            Show logs from all services (default)
#
# Options:
#   -f, --follow    Follow log output (like tail -f)
#   -n, --tail N    Show last N lines (default: 100)
#   -t, --timestamp Show timestamps
#   --dev           Show development mode logs
#   -h, --help      Show this help message

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$INFRA_DIR")"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dockpilot}"

# Colors for output
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SERVICE="all"
FOLLOW=false
TAIL_LINES=100
SHOW_TIMESTAMPS=false
DEV_MODE=false

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show help
show_help() {
    cat << EOF
DockPilot Logs Script

Usage: $0 [service] [options]

Services:
  api-gateway    Show API Gateway logs
  docker-control Show Docker Control logs
  tunnel-control Show Tunnel Control logs
  web            Show Web Frontend logs (production only)
  all            Show logs from all services (default)

Options:
  -f, --follow    Follow log output (like tail -f)
  -n, --tail N    Show last N lines (default: 100)
  -t, --timestamp Show timestamps
  --dev           Show development mode logs
  -h, --help      Show this help message

Examples:
  $0                    # Show last 100 lines from all services
  $0 -f                 # Follow logs from all services
  $0 api-gateway -f     # Follow API Gateway logs
  $0 docker-control -n 50  # Show last 50 lines of Docker Control
  $0 --dev -f           # Follow development mode logs
EOF
}

# Check if Docker Compose is available
check_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD=(docker-compose)
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD=(docker compose)
    else
        log_error "Docker Compose is not installed"
        exit 1
    fi
}

# Get compose file based on mode
get_compose_file() {
    if [[ "$DEV_MODE" == true ]]; then
        echo "$INFRA_DIR/docker-compose.dev.yml"
    else
        echo "$INFRA_DIR/docker-compose.yml"
    fi
}

# Get service name mapping
get_service_name() {
    local service="$1"
    
    case "$service" in
        api-gateway|docker-control|tunnel-control|web)
            echo "$service"
            ;;
        api|gateway)
            echo "api-gateway"
            ;;
        docker|control)
            echo "docker-control"
            ;;
        tunnel)
            echo "tunnel-control"
            ;;
        frontend|ui)
            echo "web"
            ;;
        all)
            echo ""
            ;;
        *)
            log_error "Unknown service: $service"
            exit 1
            ;;
    esac
}

# Show logs
show_logs() {
    local compose_file
    compose_file=$(get_compose_file)
    
    if [[ ! -f "$compose_file" ]]; then
        log_error "Compose file not found: $compose_file"
        exit 1
    fi
    
    local -a log_args=()
    
    # Build log arguments
    if [[ "$FOLLOW" == true ]]; then
        log_args+=(--follow)
    fi
    
    if [[ "$TAIL_LINES" -gt 0 ]]; then
        log_args+=(--tail "$TAIL_LINES")
    fi
    
    if [[ "$SHOW_TIMESTAMPS" == true ]]; then
        log_args+=(--timestamps)
    fi
    
    cd "$PROJECT_ROOT"
    export COMPOSE_PROJECT_NAME
    
    local service_name
    service_name=$(get_service_name "$SERVICE")
    
    log_info "Showing logs for: ${service_name:-all services}"
    if [[ "$DEV_MODE" == true ]]; then
        log_info "Mode: Development"
    fi
    echo ""
    
    # Run docker compose logs
    if [[ -n "$service_name" ]]; then
        "${COMPOSE_CMD[@]}" -f "$compose_file" logs "${log_args[@]}" "$service_name"
    else
        "${COMPOSE_CMD[@]}" -f "$compose_file" logs "${log_args[@]}"
    fi
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--follow)
                FOLLOW=true
                shift
                ;;
            -n|--tail)
                if [[ -n "${2:-}" && "$2" =~ ^[0-9]+$ ]]; then
                    TAIL_LINES="$2"
                    shift 2
                else
                    log_error "Option --tail requires a number"
                    exit 1
                fi
                ;;
            -t|--timestamp)
                SHOW_TIMESTAMPS=true
                shift
                ;;
            --dev)
                DEV_MODE=true
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
                # First non-option argument is the service
                if [[ "$SERVICE" == "all" ]]; then
                    SERVICE="$1"
                fi
                shift
                ;;
        esac
    done
}

# Main execution
main() {
    parse_args "$@"
    
    check_compose
    show_logs
}

# Run main function
main "$@"
