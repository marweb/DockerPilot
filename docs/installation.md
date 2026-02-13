# 📥 Guía de Instalación

Guía completa para instalar DockPilot en diferentes entornos.

## 📋 Índice

- [Requisitos](#requisitos)
- [Método 1: Instalador Automático](#método-1-instalador-automático-recomendado)
- [Método 2: Docker Compose Manual](#método-2-docker-compose-manual)
- [Método 3: Desarrollo Local](#método-3-desarrollo-local)
- [Configuración Post-Instalación](#configuración-post-instalación)
- [Instalación de Cloudflared](#instalación-de-cloudflared-opcional)
- [Verificación](#verificación-de-la-instalación)

---

## ✅ Requisitos

### Sistema Operativo

- **Linux** (recomendado)
  - Ubuntu 20.04 LTS o superior
  - Debian 10 o superior
  - CentOS 8 / Rocky Linux 8 / AlmaLinux 8
  - Fedora 34 o superior

### Hardware Mínimo

| Recurso | Mínimo | Recomendado |
| ------- | ------ | ----------- |
| RAM     | 512 MB | 2 GB        |
| CPU     | 1 core | 2 cores     |
| Disco   | 5 GB   | 20 GB SSD   |

### Software Requerido

| Software       | Versión Mínima | Verificar                |
| -------------- | -------------- | ------------------------ |
| Docker         | 20.10.0        | `docker --version`       |
| Docker Compose | 2.0.0          | `docker compose version` |
| curl           | Cualquiera     | `curl --version`         |
| jq (opcional)  | 1.6            | `jq --version`           |

### Instalar Dependencias

**Ubuntu/Debian:**

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Agregar usuario al grupo docker
sudo usermod -aG docker $USER
newgrp docker

# Verificar instalación
docker --version
docker compose version
```

**CentOS/Rocky/AlmaLinux:**

```bash
# Instalar Docker
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Iniciar y habilitar Docker
sudo systemctl start docker
sudo systemctl enable docker

# Agregar usuario al grupo docker
sudo usermod -aG docker $USER
newgrp docker
```

---

## 🚀 Método 1: Instalador Automático (Recomendado)

El método más rápido y fácil. Instala DockPilot con un solo comando. Soporta **AMD64** y **ARM64** (sistemas 64-bit).

### Instalación con One-Liner

```bash
curl -fsSL https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts/install.sh | sudo bash
```

### Qué hace el instalador

1. ✅ Instala paquetes requeridos (curl, wget, git, jq, openssl)
2. ✅ Verifica/instala OpenSSH server
3. ✅ Verifica/instala Docker Engine
4. ✅ Configura Docker daemon (logs, etc.)
5. ✅ Crea directorio `/data/dockpilot/`
6. ✅ Descarga docker-compose y configuración desde GitHub
7. ✅ Genera JWT_SECRET automáticamente
8. ✅ Descarga imágenes Docker de ghcr.io y arranca servicios
9. ✅ Muestra URL de acceso

### Después de la instalación

1. Abre `http://TU_IP:80` en el navegador
2. Crea tu cuenta de administrador (username + contraseña)
3. ¡Listo! Ya puedes gestionar Docker

### Estructura de Instalación

```
/data/dockpilot/
├── source/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── .env
│   ├── upgrade.sh
│   └── .upgrade-status
├── ssh/
│   └── keys/
└── backups/
```

### Actualizar DockPilot

```bash
cd /data/dockpilot/source
./upgrade.sh latest
```

---

## 🐳 Método 2: Docker Compose Manual

Para usuarios que quieren más control sobre la configuración.

### 1. Crear Directorio

```bash
mkdir -p ~/dockpilot
cd ~/dockpilot
```

### 2. Crear docker-compose.yml

```yaml
version: '3.8'

services:
  api-gateway:
    image: dockpilot/api-gateway:latest
    container_name: dockpilot-api
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - DOCKER_CONTROL_URL=http://docker-control:3001
      - TUNNEL_CONTROL_URL=http://tunnel-control:3002
      - DATA_DIR=/data
      - LOG_LEVEL=info
    volumes:
      - ./data:/data
      - ./logs:/logs
    networks:
      - dockpilot-backend
    depends_on:
      - docker-control
      - tunnel-control
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

  docker-control:
    image: dockpilot/docker-control:latest
    container_name: dockpilot-docker
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DOCKER_SOCKET=/var/run/docker.sock
      - LOG_LEVEL=info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./logs:/logs
    networks:
      - dockpilot-backend
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3001/health']
      interval: 30s
      timeout: 10s
      retries: 3

  tunnel-control:
    image: dockpilot/tunnel-control:latest
    container_name: dockpilot-tunnel
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3002
      - CLOUDFLARED_PATH=/usr/bin/cloudflared
      - LOG_LEVEL=info
    volumes:
      - ./data/tunnels:/etc/cloudflared
      - ./logs:/logs
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - dockpilot-backend
    depends_on:
      - docker-control

  web:
    image: dockpilot/web:latest
    container_name: dockpilot-web
    restart: unless-stopped
    ports:
      - '80:80'
    environment:
      - API_URL=http://api-gateway:3000
    networks:
      - dockpilot-backend
    depends_on:
      - api-gateway

networks:
  dockpilot-backend:
    internal: true

volumes:
  dockpilot_data:
```

### 3. Crear Archivo .env

```bash
cat > .env << 'EOF'
# JWT Secret (generar uno seguro)
JWT_SECRET=$(openssl rand -base64 32)

# Base de datos (SQLite en /data/dockpilot.db)
DATA_DIR=/data

# Configuración de logs
LOG_LEVEL=info
LOG_FORMAT=json

# Rate limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
EOF
```

### 4. Generar JWT Secret

```bash
# Generar secret seguro
export JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET" >> .env
```

### 5. Iniciar Servicios

```bash
# Descargar imágenes
docker-compose pull

# Iniciar en segundo plano
docker-compose up -d

# Verificar estado
docker-compose ps

# Ver logs
docker-compose logs -f
```

---

## 💻 Método 3: Desarrollo Local

Para contribuidores y desarrolladores.

### Requisitos Adicionales

| Software | Versión | Verificar        |
| -------- | ------- | ---------------- |
| Node.js  | 18.x    | `node --version` |
| npm      | 9.x     | `npm --version`  |
| Git      | 2.x     | `git --version`  |

### Instalar Node.js

```bash
# Usando NVM (recomendado)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
node --version
```

### Clonar Repositorio

```bash
# Clonar monorepo
git clone https://github.com/dockpilot/dockpilot.git
cd dockpilot

# Instalar dependencias raíz
npm install
```

### Estructura del Proyecto

```
dockpilot/
├── package.json
├── docker-compose.yml
├── docker-compose.dev.yml
├── services/
│   ├── api-gateway/
│   │   ├── package.json
│   │   ├── src/
│   │   └── Dockerfile
│   ├── docker-control/
│   │   ├── package.json
│   │   ├── src/
│   │   └── Dockerfile
│   ├── tunnel-control/
│   │   ├── package.json
│   │   ├── src/
│   │   └── Dockerfile
│   └── web/
│       ├── package.json
│       ├── src/
│       └── Dockerfile
├── shared/
│   └── utils/
└── scripts/
    ├── dev-start.sh
    └── dev-stop.sh
```

### Iniciar en Modo Desarrollo

```bash
# Opción 1: Script automático
npm run dev

# Opción 2: Manual con docker-compose
docker-compose -f docker-compose.dev.yml up

# Opción 3: Servicios individuales
# Terminal 1: API Gateway
cd services/api-gateway
npm install
npm run dev

# Terminal 2: Docker Control
cd services/docker-control
npm install
npm run dev

# Terminal 3: Tunnel Control
cd services/tunnel-control
npm install
npm run dev

# Terminal 4: Web
cd services/web
npm install
npm run dev
```

### Variables de Entorno para Desarrollo

```bash
# .env en raíz
NODE_ENV=development

# API Gateway
API_PORT=3000
JWT_SECRET=dev-secret-key
DOCKER_CONTROL_URL=http://localhost:3001
TUNNEL_CONTROL_URL=http://localhost:3002
DATA_DIR=./data

# Docker Control
DOCKER_CONTROL_PORT=3001
DOCKER_SOCKET=/var/run/docker.sock

# Tunnel Control
TUNNEL_CONTROL_PORT=3002
CLOUDFLARED_PATH=/usr/bin/cloudflared
```

### Acceso en Desarrollo

| Servicio    | URL                   | Descripción    |
| ----------- | --------------------- | -------------- |
| Web UI      | http://localhost:3000 | Interfaz web   |
| API Gateway | http://localhost:3001 | API REST       |
| Docker Ctrl | http://localhost:3002 | Docker service |
| Tunnel Ctrl | http://localhost:3003 | Tunnel service |

---

## ⚙️ Configuración Post-Instalación

### Primer Acceso (Setup)

1. **Abrir DockPilot**

   ```
   http://localhost:80
   # o
   http://<tu-ip>:80
   ```

2. **Configuración Inicial**
   - Crear usuario administrador (username + contraseña)
   - La primera vez que accedas, serás redirigido automáticamente a `/setup`

### Crear Usuario Administrador

**Vía Web UI:**

- Ir a Settings → Users
- Click "Add User"
- Completar formulario
- Seleccionar rol "admin"

**Vía API:**

```bash
curl -X POST http://localhost:3000/api/v1/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "SecurePassword123!",
    "email": "admin@example.com"
  }'
```

### Configurar SSL/TLS

**Opción 1: Let's Encrypt (Recomendado)**

```bash
# Instalar certbot
sudo apt install -y certbot

# Obtener certificado
sudo certbot certonly --standalone -d dockpilot.tudominio.com

# Configurar en docker-compose.yml
cat >> docker-compose.yml << 'EOF'
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api-gateway
EOF
```

**Opción 2: Reverse Proxy (Nginx/Apache)**

```nginx
# /etc/nginx/sites-available/dockpilot
server {
    listen 80;
    server_name dockpilot.tudominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dockpilot.tudominio.com;

    ssl_certificate /etc/letsencrypt/live/dockpilot.tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dockpilot.tudominio.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

### Configurar Backups Automáticos

**Script de backup (instalación con curl):**

```bash
#!/bin/bash
# Backup para instalaciones en /data/dockpilot

BACKUP_DIR="/data/dockpilot/backups"
SOURCE_DIR="/data/dockpilot/source"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="dockpilot_backup_$DATE.tar.gz"

mkdir -p $BACKUP_DIR
cd $SOURCE_DIR

# Backup de configuración (datos en volúmenes Docker requieren backup adicional)
tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
  $SOURCE_DIR/.env \
  $SOURCE_DIR/docker-compose.yml \
  $SOURCE_DIR/docker-compose.prod.yml

find $BACKUP_DIR -name "dockpilot_backup_*.tar.gz" -mtime +7 -delete
echo "Backup completado: $BACKUP_FILE"
```

**Cron job para backups diarios:** (guarda el script como `/usr/local/bin/dockpilot-backup.sh` y hazlo ejecutable)

```bash
sudo crontab -e
# Backup diario a las 2 AM
0 2 * * * /usr/local/bin/dockpilot-backup.sh >> /var/log/dockpilot-backup.log 2>&1
```

---

## 🌐 Instalación de Cloudflared (Opcional)

Para usar túneles Cloudflare.

### Instalación

**Ubuntu/Debian:**

```bash
# Descargar
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Instalar
sudo dpkg -i cloudflared.deb

# Verificar
cloudflared --version
```

**CentOS/RHEL:**

```bash
curl -L --output cloudflared.rpm https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
sudo rpm -i cloudflared.rpm
```

**Docker:**

```bash
docker pull cloudflare/cloudflared:latest
```

### Autenticación

```bash
# Login con Cloudflare
cloudflared tunnel login

# Copiar certificado a DockPilot
mkdir -p ~/.cloudflared
cp cert.pem ~/.cloudflared/
```

---

## ✔️ Verificación de la Instalación

### Comandos de Verificación

```bash
# 1. Verificar servicios en ejecución
docker-compose ps

# 2. Verificar logs
docker-compose logs --tail=100

# 3. Health check
curl http://localhost:3000/health

# 4. Verificar conexión a Docker
curl http://localhost:3000/api/v1/system/info \
  -H "Authorization: Bearer <token>"

# 5. Probar autenticación
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"tu-password"}'
```

### Diagnosticar Problemas

```bash
# Verificar puertos en uso
sudo netstat -tulpn | grep :3000

# Verificar Docker
docker info
docker ps

# Ver logs detallados
docker-compose logs -f api-gateway
docker-compose logs -f docker-control

# Reiniciar servicios
docker-compose restart

# Reconstruir
docker-compose down
docker-compose up -d --build
```

### Acceso Exitoso

Si todo está correcto, verás:

```
✅ API Gateway: Running on port 3000
✅ Docker Control: Connected to Docker socket
✅ Tunnel Control: Ready
✅ Web UI: Serving on port 80

DockPilot está listo!
Accede a: http://localhost:3000
```

---

## 🔄 Siguientes Pasos

- [Configuración](configuration.md) - Configurar todas las opciones
- [Uso Básico](../README.md#-uso-básico) - Empezar a usar DockPilot
- [API](api.md) - Integrar con la API
- [Troubleshooting](troubleshooting.md) - Resolver problemas
