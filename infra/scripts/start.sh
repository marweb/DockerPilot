#!/bin/bash
#
# DockPilot Stack Startup Script
#
# This script starts the DockPilot services using Docker Compose.
# It checks for prerequisites and handles graceful startup.
#
# Usage:
#   ./start.sh [dev|prod]
#
# Arguments:
#   dev   - Start in development mode (hot reload, debug logging)
#   prod  - Start in production mode (default)
#
# Environment:
#   COMPOSE_PROJECT_NAME - Docker project name (default: dockpilot)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$INFRA_DIR")"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dockpilot}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    log_success "Docker is installed and running"
}

# Check if Docker Compose is available
check_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    log_success "Docker Compose is available ($COMPOSE_CMD)"
}

# Check if environment file exists
check_env() {
    if [[ ! -f "$INFRA_DIR/.env" ]]; then
        log_warn "Environment file not found at $INFRA_DIR/.env"
        log_info "Creating from template..."
        
        if [[ -f "$INFRA_DIR/.env.example" ]]; then
            cp "$INFRA_DIR/.env.example" "$INFRA_DIR/.env"
            log_warn "Please edit $INFRA_DIR/.env and set your configuration before continuing"
            log_warn "At minimum, you should set JWT_SECRET to a secure random string"
            exit 1
        else
            log_error "Template file .env.example not found"
            exit 1
        fi
    fi
    
    # Source the environment file to check required variables
    set -a
    # shellcheck disable=SC1091
    source "$INFRA_DIR/.env"
    set +a
    
    # Check JWT_SECRET
    if [[ -z "${JWT_SECRET:-}" ]] || [[ "$JWT_SECRET" == "change-this-to-a-secure-random-string-minimum-32-chars" ]]; then
        log_error "JWT_SECRET is not set or is using the default value"
        log_error "Please edit $INFRA_DIR/.env and set a secure JWT_SECRET"
        exit 1
    fi
    
    log_success "Environment file validated"
}

# Pull latest images if in production mode
pull_images() {
    local mode=$1
    
    if [[ "$mode" == "prod" ]]; then
        log_info "Pulling latest images..."
        cd "$PROJECT_ROOT"
        $COMPOSE_CMD -f "$INFRA_DIR/docker-compose.yml" pull
    fi
}

# Start the services
start_services() {
    local mode=$1
    local compose_file
    
    if [[ "$mode" == "dev" ]]; then
        compose_file="$INFRA_DIR/docker-compose.dev.yml"
        log_info "Starting DockPilot in DEVELOPMENT mode..."
    else
        compose_file="$INFRA_DIR/docker-compose.yml"
        log_info "Starting DockPilot in PRODUCTION mode..."
    fi
    
    cd "$PROJECT_ROOT"
    
    # Export project name
    export COMPOSE_PROJECT_NAME
    
    # Build and start services
    if [[ "$mode" == "dev" ]]; then
        $COMPOSE_CMD -f "$compose_file" up --build -d
    else
        $COMPOSE_CMD -f "$compose_file" up --build -d
    fi
    
    log_success "Services started successfully"
}

# Wait for services to be healthy
wait_for_healthy() {
    local mode=$1
    local timeout=120
    local interval=5
    local elapsed=0
    
    log_info "Waiting for services to become healthy..."
    
    while [[ $elapsed -lt $timeout ]]; do
        local all_healthy=true
        
        # Check each service
        local services="api-gateway docker-control tunnel-control"
        if [[ "$mode" == "prod" ]]; then
            services="$services web"
        fi
        
        for service in $services; do
            local container_name="${COMPOSE_PROJECT_NAME}-${service}"
            if [[ "$mode" == "dev" ]]; then
                container_name="${container_name}-dev"
            fi
            
            local health_status
            health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")
            
            if [[ "$health_status" != "healthy" ]]; then
                all_healthy=false
                break
            fi
        done
        
        if [[ "$all_healthy" == true ]]; then
            log_success "All services are healthy"
            return 0
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        echo -n "."
    done
    
    echo ""
    log_warn "Timeout waiting for services to become healthy"
    log_info "Check logs with: $0 logs"
    return 1
}

# Print access information
print_access_info() {
    local mode=$1
    
    echo ""
    log_success "DockPilot is now running!"
    echo ""
    
    if [[ "$mode" == "dev" ]]; then
        echo -e "${GREEN}Web Interface:${NC}     http://localhost:5173"
        echo -e "${GREEN}API Gateway:${NC}       http://localhost:3000"
        echo -e "${GREEN}Docker Control:${NC}    http://localhost:3001"
        echo -e "${GREEN}Tunnel Control:${NC}   http://localhost:3002"
    else
        echo -e "${GREEN}Web Interface:${NC}     http://localhost:8000"
        echo -e "${GREEN}API Gateway:${NC}       http://localhost:3000"
        echo -e "${GREEN}Docker Control:${NC}    http://localhost:3001 (internal)"
        echo -e "${GREEN}Tunnel Control:${NC}   http://localhost:3002 (internal)"
    fi
    
    echo ""
    echo "Useful commands:"
    echo "  View logs:      $0 logs"
    echo "  Stop services:  $0 stop"
    echo "  Update stack:   $0 update"
    echo ""
}

# Main execution
main() {
    local mode="${1:-prod}"
    
    if [[ "$mode" != "dev" && "$mode" != "prod" ]]; then
        log_error "Invalid mode: $mode"
        echo "Usage: $0 [dev|prod]"
        exit 1
    fi
    
    echo "=================================="
    echo "   DockPilot Stack Startup"
    echo "=================================="
    echo ""
    
    check_docker
    check_compose
    check_env
    pull_images "$mode"
    start_services "$mode"
    wait_for_healthy "$mode"
    print_access_info "$mode"
}

# Run main function
main "$@"
