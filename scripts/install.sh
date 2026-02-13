#!/bin/bash
#
# DockPilot Installer - One-line installation
# ===========================================
# Installs DockPilot with a single command.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts/install.sh | sudo bash
#
# Source: https://github.com/marweb/DockerPilot

set -e
set -o pipefail

CDN="https://raw.githubusercontent.com/marweb/DockerPilot/main/scripts"
DATE=$(date +"%Y%m%d-%H%M%S")
DOCKER_VERSION="27.0"
DOCKPILOT_HOME="/data/dockpilot"
SOURCE_DIR="${DOCKPILOT_HOME}/source"
ENV_FILE="${SOURCE_DIR}/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_section() {
  echo ""
  echo "============================================================"
  log "$1"
  echo "============================================================"
}

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root or with sudo"
  exit 1
fi

# Banner
echo ""
echo "=========================================="
echo " DockPilot Installation - ${DATE}"
echo "=========================================="
echo ""
echo "Welcome to DockPilot Installer!"
echo "This script will install everything for you. Sit back and relax."
echo "Source: https://github.com/marweb/DockerPilot"
echo ""

# Detect OS
OS_TYPE=$(grep -w "ID" /etc/os-release 2>/dev/null | cut -d "=" -f 2 | tr -d '"' || echo "unknown")
if [ "$OS_TYPE" = "manjaro" ] || [ "$OS_TYPE" = "manjaro-arm" ]; then
  OS_TYPE="arch"
fi
if [ "$OS_TYPE" = "endeavouros" ] || [ "$OS_TYPE" = "cachyos" ]; then
  OS_TYPE="arch"
fi
if [ "$OS_TYPE" = "fedora-asahi-remix" ]; then
  OS_TYPE="fedora"
fi
if [ "$OS_TYPE" = "pop" ] || [ "$OS_TYPE" = "linuxmint" ] || [ "$OS_TYPE" = "zorin" ]; then
  OS_TYPE="ubuntu"
fi

OS_VERSION=""
if [ "$OS_TYPE" = "arch" ] || [ "$OS_TYPE" = "archarm" ]; then
  OS_VERSION="rolling"
else
  OS_VERSION=$(grep -w "VERSION_ID" /etc/os-release 2>/dev/null | cut -d "=" -f 2 | tr -d '"')
fi

# Fetch version from versions.json
LATEST_VERSION="latest"
if VERSIONS_JSON=$(curl -sSfL "${CDN}/versions.json" 2>/dev/null); then
  LATEST_VERSION=$(echo "$VERSIONS_JSON" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
fi

echo "---------------------------------------------"
echo "| Operating System | $OS_TYPE $OS_VERSION"
echo "| Docker          | $DOCKER_VERSION"
echo "| DockPilot       | $LATEST_VERSION"
echo "---------------------------------------------"
echo ""

# Step 1/9: Install required packages
log_section "Step 1/9: Installing required packages"
echo "1/9 Installing required packages (curl, wget, git, jq, openssl)..."

apt_updated=false
case "$OS_TYPE" in
  arch)
    pacman -Sy --noconfirm --needed curl wget git jq openssl 2>/dev/null || true
    ;;
  alpine|postmarketos)
    sed -i '/^#.*\/community/s/^#//' /etc/apk/repositories 2>/dev/null || true
    apk update 2>/dev/null || true
    apk add curl wget git jq openssl 2>/dev/null || true
    ;;
  ubuntu|debian|raspbian)
    apt-get update -y 2>/dev/null || true
    apt_updated=true
    apt-get install -y curl wget git jq openssl 2>/dev/null || true
    ;;
  centos|fedora|rhel|ol|rocky|almalinux|amzn)
    if [ "$OS_TYPE" = "amzn" ]; then
      dnf install -y wget git jq openssl 2>/dev/null || true
    else
      command -v dnf >/dev/null 2>&1 || yum install -y dnf 2>/dev/null || true
      command -v curl >/dev/null 2>&1 || dnf install -y curl 2>/dev/null || true
      dnf install -y wget git jq openssl 2>/dev/null || true
    fi
    ;;
  sles|opensuse-leap|opensuse-tumbleweed)
    zypper refresh 2>/dev/null || true
    zypper install -y curl wget git jq openssl 2>/dev/null || true
    ;;
  *)
    echo "Unsupported OS: $OS_TYPE. Trying to install packages..."
    apt-get update -y 2>/dev/null && apt-get install -y curl wget git jq openssl 2>/dev/null || \
    dnf install -y curl wget git jq openssl 2>/dev/null || true
    ;;
esac
echo " Done."

# Step 2/9: OpenSSH
log_section "Step 2/9: Checking OpenSSH server"
echo "2/9 Checking OpenSSH server..."
ssh_detected=false
if command -v systemctl >/dev/null 2>&1; then
  if systemctl status sshd >/dev/null 2>&1 || systemctl status ssh >/dev/null 2>&1; then
    echo " - OpenSSH server is installed."
    ssh_detected=true
  fi
elif command -v service >/dev/null 2>&1; then
  if service sshd status >/dev/null 2>&1 || service ssh status >/dev/null 2>&1; then
    echo " - OpenSSH server is installed."
    ssh_detected=true
  fi
fi

if [ "$ssh_detected" = false ]; then
  echo " - Installing OpenSSH server."
  case "$OS_TYPE" in
    arch)
      pacman -Sy --noconfirm openssh 2>/dev/null || true
      systemctl enable sshd 2>/dev/null || true
      systemctl start sshd 2>/dev/null || true
      ;;
    alpine|postmarketos)
      apk add openssh 2>/dev/null || true
      rc-update add sshd default 2>/dev/null || true
      service sshd start 2>/dev/null || true
      ;;
    ubuntu|debian|raspbian)
      [ "$apt_updated" = false ] && apt-get update -y 2>/dev/null || true
      apt-get install -y openssh-server 2>/dev/null || true
      systemctl enable ssh 2>/dev/null || true
      systemctl start ssh 2>/dev/null || true
      ;;
    centos|fedora|rhel|ol|rocky|almalinux|amzn)
      dnf install -y openssh-server 2>/dev/null || yum install -y openssh-server 2>/dev/null || true
      systemctl enable sshd 2>/dev/null || true
      systemctl start sshd 2>/dev/null || true
      ;;
    sles|opensuse*)
      zypper install -y openssh 2>/dev/null || true
      systemctl enable sshd 2>/dev/null || true
      systemctl start sshd 2>/dev/null || true
      ;;
    *)
      echo " - Could not install OpenSSH automatically. Please ensure it is installed."
      ;;
  esac
  echo " - OpenSSH server installed."
fi
echo " Done."

# Step 3/9: Docker
log_section "Step 3/9: Checking Docker installation"
echo "3/9 Checking Docker installation..."

if ! command -v docker >/dev/null 2>&1; then
  echo " - Docker not installed. Installing Docker..."
  if [ "$OS_TYPE" = "ubuntu" ] || [ "$OS_TYPE" = "debian" ] || [ "$OS_TYPE" = "raspbian" ]; then
    curl -sSf https://get.docker.com | sh -s -- --version ${DOCKER_VERSION} 2>/dev/null || true
  elif [ "$OS_TYPE" = "alpine" ] || [ "$OS_TYPE" = "postmarketos" ]; then
    apk add docker docker-cli-compose 2>/dev/null || true
    rc-update add docker default 2>/dev/null || true
    service docker start 2>/dev/null || true
  elif [ "$OS_TYPE" = "arch" ]; then
    pacman -Sy docker docker-compose --noconfirm 2>/dev/null || true
    systemctl enable docker 2>/dev/null || true
    systemctl start docker 2>/dev/null || true
  elif [ "$OS_TYPE" = "centos" ] || [ "$OS_TYPE" = "fedora" ] || [ "$OS_TYPE" = "rhel" ] || [ "$OS_TYPE" = "rocky" ] || [ "$OS_TYPE" = "almalinux" ]; then
    dnf config-manager --add-repo https://download.docker.com/linux/$OS_TYPE/docker-ce.repo 2>/dev/null || true
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
    systemctl start docker 2>/dev/null || true
    systemctl enable docker 2>/dev/null || true
  else
    curl -sSf https://get.docker.com | sh -s -- --version ${DOCKER_VERSION} 2>/dev/null || true
  fi
  echo " - Docker installed."
else
  echo " - Docker is installed."
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker installation failed. Please install Docker manually."
  exit 1
fi

# Start Docker if not running
if ! docker info >/dev/null 2>&1; then
  systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
  sleep 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running."
  exit 1
fi
echo " Done."

# Step 4/9: Docker daemon config
log_section "Step 4/9: Configuring Docker daemon"
echo "4/9 Configuring Docker daemon..."
mkdir -p /etc/docker
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json /etc/docker/daemon.json.bak-${DATE} 2>/dev/null || true
fi

# Merge or create daemon.json with log limits
if [ -f /etc/docker/daemon.json ] && command -v jq >/dev/null 2>&1; then
  if ! jq -e '.log-driver' /etc/docker/daemon.json >/dev/null 2>&1; then
    jq '. + {"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}' /etc/docker/daemon.json > /etc/docker/daemon.json.tmp
    mv /etc/docker/daemon.json.tmp /etc/docker/daemon.json
  fi
else
  cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
fi
systemctl restart docker 2>/dev/null || service docker restart 2>/dev/null || true
sleep 2
echo " Done."

# Step 5/9: Create directories
log_section "Step 5/9: Creating directories"
echo "5/9 Creating directories..."
mkdir -p /data/dockpilot/{source,ssh,backups}
mkdir -p /data/dockpilot/ssh/{keys,mux}
echo " Done."

# Step 6/9: Download config files
log_section "Step 6/9: Downloading configuration files"
echo "6/9 Downloading configuration files..."
curl -fsSL "${CDN}/docker-compose.yml" -o "${SOURCE_DIR}/docker-compose.yml"
curl -fsSL "${CDN}/docker-compose.prod.yml" -o "${SOURCE_DIR}/docker-compose.prod.yml"
curl -fsSL "${CDN}/.env.production" -o "${ENV_FILE}"
curl -fsSL "${CDN}/upgrade.sh" -o "${SOURCE_DIR}/upgrade.sh"
chmod +x "${SOURCE_DIR}/upgrade.sh"
echo " Done."

# Step 7/9: Environment variables
log_section "Step 7/9: Configuring environment"
echo "7/9 Configuring environment..."
if [ ! -f "$ENV_FILE" ]; then
  cp "${SOURCE_DIR}/.env.production" "$ENV_FILE" 2>/dev/null || true
fi

# Generate JWT_SECRET
JWT_SECRET=$(openssl rand -hex 32)
if grep -q "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
else
  echo "JWT_SECRET=${JWT_SECRET}" >> "$ENV_FILE"
fi

# Set version
if grep -q "^DOCKPILOT_VERSION=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^DOCKPILOT_VERSION=.*|DOCKPILOT_VERSION=${LATEST_VERSION}|" "$ENV_FILE"
else
  echo "DOCKPILOT_VERSION=${LATEST_VERSION}" >> "$ENV_FILE"
fi
echo " Done."

# Step 8/9: SSH keys
log_section "Step 8/9: Configuring SSH keys"
echo "8/9 Configuring SSH keys..."
if [ ! -f ~/.ssh/authorized_keys ]; then
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  touch ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
fi

CURRENT_USER="${SUDO_USER:-$USER}"
if [ -z "$CURRENT_USER" ]; then
  CURRENT_USER="root"
fi

# Generate SSH key for dockpilot localhost access
if [ ! -f /data/dockpilot/ssh/keys/id.dockpilot@localhost ]; then
  ssh-keygen -t ed25519 -f /data/dockpilot/ssh/keys/id.dockpilot@localhost -q -N "" -C "dockpilot" 2>/dev/null || true
  if [ -f /data/dockpilot/ssh/keys/id.dockpilot@localhost.pub ]; then
    grep -v "dockpilot" ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp 2>/dev/null || true
    cat /data/dockpilot/ssh/keys/id.dockpilot@localhost.pub >> ~/.ssh/authorized_keys
    mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys 2>/dev/null || true
  fi
fi

chown -R 9999:root /data/dockpilot 2>/dev/null || true
chmod -R 700 /data/dockpilot 2>/dev/null || true
echo " Done."

# Step 9/9: Install DockPilot
log_section "Step 9/9: Installing DockPilot"
echo "9/9 Installing DockPilot (${LATEST_VERSION})..."
echo " - This may take a few minutes based on your network speed."
echo ""

cd "$SOURCE_DIR"
export DOCKPILOT_VERSION="$LATEST_VERSION"
export CDN
export SOURCE_DIR
bash ./upgrade.sh "${LATEST_VERSION}" "ghcr.io" 2>&1 || {
  echo "ERROR: DockPilot installation failed."
  exit 1
}

echo ""
echo " - Waiting for DockPilot to be ready..."

# Wait for web container to be healthy
HEALTH_WAIT=120
HEALTH_WAITED=0
while [ $HEALTH_WAITED -lt $HEALTH_WAIT ]; do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' dockpilot-web 2>/dev/null || echo "unknown")
  if [ "$HEALTH" = "healthy" ]; then
    echo " - DockPilot is ready!"
    break
  fi
  sleep 2
  HEALTH_WAITED=$((HEALTH_WAITED + 2))
  if [ $((HEALTH_WAITED % 10)) -eq 0 ]; then
    echo " - Waiting... (${HEALTH_WAITED}s)"
  fi
done

if [ "$HEALTH" != "healthy" ]; then
  echo " - WARNING: Container may still be starting. Check with: docker ps"
fi

# Get IPs
PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
PUBLIC_IP=$(curl -sSf --max-time 5 https://ipinfo.io/ip 2>/dev/null || curl -sSf --max-time 5 https://api.ipify.org 2>/dev/null || echo "")

# Final banner
echo ""
echo -e "\033[0;35m"
echo "  ____             _    ____  _ _       _"
echo " |  _ \  ___   ___| | _|  _ \(_) | ___ | |_"
echo " | | | |/ _ \ / __| |/ / |_) | | |/ _ \| __|"
echo " | |_| | (_) | (__|   <|  __/| | | (_) | |_"
echo " |____/ \___/ \___|_|\_\_|   |_|_|\___/ \__|"
echo -e "\033[0m"
echo ""
echo "Congratulations! DockPilot is installed!"
echo ""
echo "Open http://${PRIVATE_IP:-localhost}:80 to create your admin account."
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "$PRIVATE_IP" ]; then
  echo "Or http://${PUBLIC_IP}:80 if accessing from the internet."
fi
echo ""
echo "IMPORTANT: Create your admin account immediately!"
echo ""
echo "=========================================="
echo ""
