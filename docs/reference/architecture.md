# 🏗️ Arquitectura de DockPilot

Esta documentación describe la arquitectura del sistema, componentes y flujos de datos de DockPilot.

## 📐 Visión General

DockPilot sigue una arquitectura de microservicios con los siguientes principios:

- **Separación de responsabilidades**: Cada servicio tiene una función específica
- **Comunicación por APIs**: Servicios independientes que se comunican vía HTTP/WebSocket
- **Escalabilidad**: Servicios pueden escalarse independientemente
- **Resiliencia**: Fallbacks y manejo de errores en cada capa

## 📊 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Web App    │  │  CLI Client  │  │ Mobile App   │       │
│  │   (React)    │  │  (Optional)  │  │  (Future)    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ HTTPS/WSS
┌───────────────────────────▼───────────────────────────────┐
│                    API Gateway Layer                       │
│  ┌──────────────────────────────────────────────────┐    │
│  │              API Gateway (Port 3000)              │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  │    │
│  │  │   Router   │  │   Auth     │  │   Rate     │  │    │
│  │  │            │  │ Middleware │  │  Limiter   │  │    │
│  │  └────────────┘  └────────────┘  └────────────┘  │    │
│  └──────────────────────────────────────────────────┘    │
└───────────────────────────┬───────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Docker       │   │   Tunnel      │   │   Web         │
│  Control      │   │   Control     │   │   Server      │
│  (Port 3001)  │   │  (Port 3002)  │   │  (Port 8000)  │
└───────┬───────┘   └───────┬───────┘   └───────────────┘
        │                   │
        │            ┌──────┴──────┐
        │            ▼             ▼
        │    ┌──────────┐   ┌──────────┐
        │    │Cloudflare│   │  Custom  │
        │    │ Tunnel   │   │  Tunnel  │
        │    └──────────┘   └──────────┘
        │
┌───────▼─────────────────────────────────────┐
│              Docker Daemon                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │Containers│ │ Images   │ │   Volumes    │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Networks │ │  Build   │ │   Compose    │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└─────────────────────────────────────────────┘
```

## 🔄 Flujo de Datos

### Flujo de Autenticación

```
┌─────────┐              ┌─────────────┐              ┌──────────────┐
│ Cliente │──────────────▶│ API Gateway │──────────────▶│   Auth       │
│         │  POST /login  │             │  Validar cred ││   Service    │
└─────────┘              └─────────────┘              └──────┬───────┘
     ▲                                                       │
     │              ┌──────────────┐                        │ Verificar
     │              │  Devolver    │◀───────────────────────┘ en DB
     └──────────────│  JWT Token   │
                    └──────────────┘
```

### Flujo de Comandos Docker

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ Cliente │────▶│ API Gateway │────▶│ Docker      │────▶│ Docker       │
│         │     │             │     │ Control     │     │ Daemon       │
└─────────┘     └─────────────┘     └─────────────┘     └──────────────┘
     ▲                                              │          │
     │                                              │ Ejecuta  │
     │              ┌──────────────┐               │ comando  │
     └──────────────│  Respuesta   │◀──────────────┘◀─────────┘
                    │  JSON        │
                    └──────────────┘
```

### Flujo de WebSockets (Logs en tiempo real)

```
┌─────────┐              ┌─────────────┐              ┌──────────────┐
│ Cliente │──WebSocket──▶│ API Gateway │──WebSocket──▶│ Docker       │
│         │  /ws/logs    │             │   proxy      │ Control      │
└─────────┘              └─────────────┘              └──────┬───────┘
     ▲                                                       │
     │              ┌──────────────────┐                    │
     └──────────────│  Stream de logs  │◀───────────────────┘
                    │  (chunked)       │
                    └──────────────────┘
```

## 🔧 Microservicios

### API Gateway (Puerto 3000)

El punto de entrada único para todas las peticiones.

**Responsabilidades:**

- Enrutamiento de peticiones
- Autenticación JWT
- Rate limiting
- Validación de entrada
- Manejo de CORS
- Proxy de WebSockets

**Tecnologías:**

- Fastify
- JWT (jsonwebtoken)
- Helmet (seguridad)
- better-sqlite3 (SQLite)

**Endpoints expuestos:**

```javascript
// Auth
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh

// Docker (proxied)
GET    /api/containers/*
GET    /api/images/*
GET    /api/volumes/*
GET    /api/networks/*

// Tunnels (proxied)
GET    /api/tunnels/*

// WebSocket
WS     /ws/*
```

### Docker Control (Puerto 3001)

Servicio especializado en la gestión de Docker.

**Responsabilidades:**

- Comunicación con Docker Daemon
- Gestión de contenedores (CRUD)
- Gestión de imágenes (pull, build, prune)
- Gestión de volúmenes
- Gestión de redes
- Docker Compose (up, down, logs)
- Streaming de logs
- Métricas de recursos

**Tecnologías:**

- Docker SDK (dockerode)
- Docker Compose CLI
- WebSocket (ws)

**Endpoints:**

```javascript
// Containers
GET    /containers
GET    /containers/:id
POST   /containers
DELETE /containers/:id
POST   /containers/:id/start
POST   /containers/:id/stop
POST   /containers/:id/restart
GET    /containers/:id/logs
GET    /containers/:id/stats

// Images
GET    /images
DELETE /images/:id
POST   /images/pull
POST   /images/build
POST   /images/prune

// Volumes
GET    /volumes
POST   /volumes
DELETE /volumes/:name

// Networks
GET    /networks
POST   /networks
DELETE /networks/:id

// Compose
POST   /compose/up
POST   /compose/down
GET    /compose/logs
POST   /compose/validate
```

### Tunnel Control (Puerto 3002)

Gestión de túneles para exposición segura de servicios.

**Responsabilidades:**

- Integración con cloudflared
- Crear/eliminar túneles
- Gestión de configuración
- Monitoreo de estado de túneles

**Tecnologías:**

- cloudflared CLI
- Node.js child_process

**Endpoints:**

```javascript
GET    /tunnels
POST   /tunnels
GET    /tunnels/:id
DELETE /tunnels/:id
POST   /tunnels/:id/start
POST   /tunnels/:id/stop
GET    /tunnels/:id/status
```

### Web Server (Puerto 8000)

Servidor de archivos estáticos para el frontend.

**Responsabilidades:**

- Servir assets estáticos (HTML, CSS, JS)
- SPA routing (redirigir todo a index.html)
- Compresión gzip/brotli
- Caching

**Tecnologías:**

- Nginx (producción)
- Express.static (desarrollo)

## 💬 Comunicación entre Servicios

### HTTP REST

```javascript
// Ejemplo: API Gateway → Docker Control
const response = await fetch('http://docker-control:3001/containers', {
  method: 'GET',
  headers: {
    Authorization: 'Bearer ' + internalToken,
    'X-Request-ID': req.id,
  },
});
```

### WebSocket

```javascript
// Streaming de logs
const ws = new WebSocket('ws://docker-control:3001/containers/:id/logs/stream');

ws.on('message', (data) => {
  // Enviar al cliente
  clientSocket.send(data);
});
```

### Health Checks

```javascript
// Health checks principales
GET /healthz
GET /api/health

// Respuesta
{
  "status": "healthy",
  "service": "docker-control",
  "timestamp": "2026-02-11T10:00:00Z",
  "checks": {
    "docker": "connected",
    "disk": "ok"
  }
}
```

## 🗄️ Base de Datos y Almacenamiento

### SQLite (API Gateway)

El API Gateway usa SQLite (`better-sqlite3`) para usuarios, metadatos de setup y logs de auditoría. El archivo se guarda en el volumen montado.

**Ubicación:** `{DATA_DIR}/dockpilot.db` (por defecto `/data/dockpilot.db`)

**Migración automática:** Si existe `db.json` en el mismo directorio, los datos se migran a SQLite al arrancar.

**Tablas:**

```sql
-- Metadatos (setup completado, etc.)
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

-- Usuarios
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  refresh_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Logs de auditoría
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL
);
```

**Nota:** Las configuraciones de túneles y proyectos Compose se gestionan en el servicio tunnel-control y docker-control respectivamente, no en esta base de datos.

### Volúmenes Docker

```yaml
volumes:
  dockpilot_data:
    driver: local
  dockpilot_logs:
    driver: local
  dockpilot_certs:
    driver: local
```

### Backup de Datos

```bash
# Backup de SQLite (API Gateway)
docker exec dockpilot-api-gateway sqlite3 /data/dockpilot.db ".backup /backup/dockpilot_$(date +%Y%m%d).db"
```

## 🔒 Seguridad

### Capas de Seguridad

1. **Transporte**: HTTPS/TLS
2. **Autenticación**: JWT
3. **Autorización**: RBAC
4. **Red**: Firewall, no exposición de Docker socket
5. **Aplicación**: Input validation, sanitization

### Seguridad del Socket Docker

```yaml
# docker-compose.yml
services:
  docker-control:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    user: '1000:999' # docker group
```

### Network Isolation

```yaml
networks:
  frontend:
    # Solo API Gateway expuesto
  backend:
    internal: true
    # Servicios internos no accesibles externamente
  docker:
    # Acceso a Docker socket
```

## 📈 Escalabilidad

### Horizontal Scaling

```yaml
# docker-compose.override.yml
services:
  api-gateway:
    deploy:
      replicas: 3

  docker-control:
    deploy:
      replicas: 2
```

### Load Balancing

```nginx
upstream api_gateway {
    server dockpilot-api-1:3000;
    server dockpilot-api-2:3000;
    server dockpilot-api-3:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://api_gateway;
    }
}
```

## 🚀 Deployment Patterns

### Single Node

```
┌─────────────────────────────────────┐
│              VPS                    │
│  ┌─────────────────────────────┐    │
│  │     Docker + DockPilot      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Multi-Node (Docker Swarm)

```
┌────────────────┐    ┌────────────────┐
│   Manager 1    │◄──►│   Manager 2    │
│ (DockPilot UI) │    │ (DockPilot UI) │
└────────┬───────┘    └───────┬────────┘
         │                    │
    ┌────┴────────────────────┴────┐
    ▼                              ▼
┌───────────┐                ┌───────────┐
│  Worker 1 │                │  Worker 2 │
└───────────┘                └───────────┘
```

Para más información sobre despliegue, ver [deployment.md](deployment.md).
