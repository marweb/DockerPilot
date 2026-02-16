# ⚙️ Configuración

Guía completa de configuración de DockPilot mediante variables de entorno.

## 📋 Índice

- [Variables Globales](#variables-globales)
- [API Gateway](#api-gateway)
- [Docker Control](#docker-control)
- [Repos/OAuth/Webhooks](#reposoauthwebhooks)
- [Tunnel Control](#tunnel-control)
- [Web](#web)
- [Autenticación](#configuración-de-autenticación)
- [Rate Limiting](#rate-limiting)
- [Logging](#logging)
- [WebSockets](#websockets)
- [Cloudflare Tunnels](#cloudflare-tunnels)

---

## 🌍 Variables Globales

| Variable     | Descripción          | Default    | Ejemplo          |
| ------------ | -------------------- | ---------- | ---------------- |
| `NODE_ENV`   | Entorno de ejecución | production | development      |
| `LOG_LEVEL`  | Nivel de logging     | info       | debug            |
| `LOG_FORMAT` | Formato de logs      | json       | pretty           |
| `TZ`         | Zona horaria         | UTC        | America/New_York |

---

## 🚪 API Gateway

Variables para el servicio de API Gateway.

### Básicas

| Variable           | Descripción                   | Default       | Ejemplo       |
| ------------------ | ----------------------------- | ------------- | ------------- |
| `API_PORT`         | Puerto HTTP                   | 3000          | 8080          |
| `API_HOST`         | Host para binding             | 0.0.0.0       | 127.0.0.1     |
| `JWT_SECRET`       | Clave secreta para JWT        | **REQUERIDO** | base64-string |
| `JWT_EXPIRES_IN`   | Expiración del token (seg)    | 3600          | 86400         |
| `JWT_REFRESH_DAYS` | Días de validez refresh token | 7             | 30            |

### URLs de Servicios

| Variable             | Descripción              | Default                    | Ejemplo               |
| -------------------- | ------------------------ | -------------------------- | --------------------- |
| `DOCKER_CONTROL_URL` | URL del servicio Docker  | http://docker-control:3001 | http://localhost:3001 |
| `TUNNEL_CONTROL_URL` | URL del servicio Tunnels | http://tunnel-control:3002 | http://localhost:3002 |
| `WEB_URL`            | URL del frontend         | http://web:80              | http://localhost:3000 |

### Base de Datos (SQLite)

El API Gateway usa SQLite (`better-sqlite3`) para usuarios y logs de auditoría. El archivo se almacena en el volumen montado.

| Variable   | Descripción                           | Default | Ejemplo            |
| ---------- | ------------------------------------- | ------- | ------------------ |
| `DATA_DIR` | Directorio para datos (incluye la DB) | /data   | /var/lib/dockpilot |

El archivo SQLite se crea en `{DATA_DIR}/dockpilot.db`. Si existe `db.json` en el mismo directorio, se migra automáticamente a SQLite al arrancar.

### CORS

| Variable           | Descripción             | Default             | Ejemplo               |
| ------------------ | ----------------------- | ------------------- | --------------------- |
| `CORS_ORIGIN`      | Origen permitido        | \*                  | https://tudominio.com |
| `CORS_METHODS`     | Métodos HTTP permitidos | GET,POST,PUT,DELETE | GET,POST              |
| `CORS_HEADERS`     | Headers permitidos      | Content-Type,Auth   | \*                    |
| `CORS_CREDENTIALS` | Permitir credenciales   | true                | false                 |

### Seguridad

| Variable           | Descripción                  | Default | Ejemplo |
| ------------------ | ---------------------------- | ------- | ------- |
| `ENABLE_HELMET`    | Activar headers de seguridad | true    | false   |
| `TRUST_PROXY`      | Confiar en proxies           | true    | false   |
| `MAX_REQUEST_SIZE` | Tamaño máximo de request     | 10mb    | 50mb    |
| `REQUEST_TIMEOUT`  | Timeout de requests (ms)     | 30000   | 60000   |

### Swagger/OpenAPI

| Variable         | Descripción                     | Default   | Ejemplo |
| ---------------- | ------------------------------- | --------- | ------- |
| `ENABLE_SWAGGER` | Habilitar documentación Swagger | false     | true    |
| `SWAGGER_PATH`   | Ruta de Swagger UI              | /api-docs | /docs   |

---

## 🐳 Docker Control

Variables para el servicio de control Docker.

### Básicas

| Variable              | Descripción       | Default | Ejemplo   |
| --------------------- | ----------------- | ------- | --------- |
| `DOCKER_CONTROL_PORT` | Puerto HTTP       | 3001    | 3002      |
| `DOCKER_CONTROL_HOST` | Host para binding | 0.0.0.0 | 127.0.0.1 |

### Docker

| Variable             | Descripción               | Default              | Ejemplo                  |
| -------------------- | ------------------------- | -------------------- | ------------------------ |
| `DOCKER_SOCKET`      | Ruta al socket Docker     | /var/run/docker.sock | tcp://localhost:2375     |
| `DOCKER_HOST`        | Host Docker (alternativo) | -                    | tcp://192.168.1.100:2376 |
| `DOCKER_TLS_VERIFY`  | Verificar TLS             | 0                    | 1                        |
| `DOCKER_CERT_PATH`   | Ruta a certificados TLS   | -                    | /certs                   |
| `DOCKER_API_VERSION` | Versión de API Docker     | 1.41                 | 1.40                     |

### Límites de Recursos

| Variable                    | Descripción                   | Default | Ejemplo |
| --------------------------- | ----------------------------- | ------- | ------- |
| `MAX_CONCURRENT_OPERATIONS` | Operaciones simultáneas max   | 10      | 20      |
| `STREAM_CHUNK_SIZE`         | Tamaño de chunks para streams | 1024    | 4096    |
| `LOGS_MAX_LINES`            | Máx líneas de logs a retornar | 10000   | 50000   |
| `STATS_REFRESH_INTERVAL`    | Intervalo de stats (ms)       | 1000    | 500     |

### Docker Compose

| Variable              | Descripción                    | Default                 | Ejemplo                       |
| --------------------- | ------------------------------ | ----------------------- | ----------------------------- |
| `COMPOSE_PATH`        | Ruta al binario docker-compose | /usr/bin/docker-compose | /usr/local/bin/docker-compose |
| `COMPOSE_PROJECT_DIR` | Directorio por defecto         | /data/compose           | /opt/compose                  |

---

## 🔁 Repos/OAuth/Webhooks

Variables para despliegues desde repositorio, OAuth opcional y webhooks de autodeploy.

| Variable                     | Descripción                                                             | Default     | Ejemplo                       |
| ---------------------------- | ----------------------------------------------------------------------- | ----------- | ----------------------------- |
| `REPOS_DIR`                  | Directorio de metadatos/clones/repos keys                               | /data/repos | /var/lib/dockpilot/repos      |
| `PUBLIC_BASE_URL`            | URL publica usada para validar endpoint webhook y callbacks OAuth       | -           | https://dockpilot.example.com |
| `MASTER_KEY`                 | Clave maestra para cifrar secretos en repos/OAuth (obligatoria en prod) | -           | base64-random-48              |
| `GITHUB_WEBHOOK_SECRET`      | Secreto de validación de firma HMAC SHA-256 de GitHub                   | -           | gh-webhook-secret             |
| `GITLAB_WEBHOOK_SECRET`      | Token secreto de validación webhook GitLab                              | -           | gl-webhook-secret             |
| `GITHUB_APP_ID`              | App ID de GitHub App (opcional)                                         | -           | 1234567                       |
| `GITHUB_APP_CLIENT_ID`       | Client ID del OAuth App/GitHub Device Flow                              | -           | Iv1.xxxxxxxxx                 |
| `GITHUB_APP_CLIENT_SECRET`   | Client secret del OAuth App/GitHub Device Flow                          | -           | ghp_xxxxxxxxx                 |
| `GITLAB_BASE_URL`            | URL base de GitLab para OAuth/device flow                               | -           | https://gitlab.com            |
| `GITLAB_OAUTH_CLIENT_ID`     | Client ID de OAuth App GitLab                                           | -           | xxxxxxxx                      |
| `GITLAB_OAUTH_CLIENT_SECRET` | Client secret de OAuth App GitLab                                       | -           | xxxxxxxx                      |

Notas:

- El flujo manual (SSH/PAT) sigue funcionando sin OAuth.
- Autodeploy por webhook requiere `PUBLIC_BASE_URL` valido.
- En `NODE_ENV=production`, `MASTER_KEY` es requerido para iniciar docker-control.

---

## 🌐 Tunnel Control

Variables para el servicio de túneles.

### Básicas

| Variable              | Descripción       | Default | Ejemplo   |
| --------------------- | ----------------- | ------- | --------- |
| `TUNNEL_CONTROL_PORT` | Puerto HTTP       | 3002    | 3003      |
| `TUNNEL_CONTROL_HOST` | Host para binding | 0.0.0.0 | 127.0.0.1 |

### Cloudflared

| Variable                  | Descripción                 | Default                 | Ejemplo                    |
| ------------------------- | --------------------------- | ----------------------- | -------------------------- |
| `CLOUDFLARED_PATH`        | Ruta al binario cloudflared | /usr/bin/cloudflared    | /usr/local/bin/cloudflared |
| `CLOUDFLARED_CONFIG_DIR`  | Directorio de configuración | /etc/cloudflared        | /data/tunnels              |
| `CLOUDFLARED_TOKEN`       | Token de cuenta Cloudflare  | -                       | token-string               |
| `CLOUDFLARED_CREDENTIALS` | Ruta a credenciales         | ~/.cloudflared/cert.pem | /certs/cloudflare.pem      |

### Túneles

| Variable                       | Descripción                  | Default | Ejemplo   |
| ------------------------------ | ---------------------------- | ------- | --------- |
| `TUNNEL_MAX_PER_USER`          | Máx túneles por usuario      | 5       | 10        |
| `TUNNEL_IDLE_TIMEOUT`          | Timeout de inactividad (min) | 30      | 60        |
| `TUNNEL_HEALTH_CHECK_INTERVAL` | Intervalo health check (s)   | 30      | 60        |
| `TUNNEL_DEFAULT_REGION`        | Región por defecto           | -       | us-east-1 |

---

## 🎨 Web

Variables para el frontend.

| Variable     | Descripción                  | Default                 | Ejemplo               |
| ------------ | ---------------------------- | ----------------------- | --------------------- |
| `WEB_PORT`   | Puerto HTTP                  | 8000                    | 3000                  |
| `API_URL`    | URL de la API                | http://api-gateway:3000 | http://localhost:3000 |
| `WS_URL`     | URL de WebSocket             | ws://api-gateway:3000   | wss://api.example.com |
| `ENABLE_HMR` | Hot Module Replacement (dev) | false                   | true                  |

---

## 🔐 Configuración de Autenticación

### JWT (JSON Web Tokens)

```bash
# .env
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=3600
JWT_REFRESH_DAYS=7
JWT_ALGORITHM=HS256
JWT_ISSUER=dockpilot
JWT_AUDIENCE=dockpilot-api
```

### Generar JWT Secret Seguro

```bash
# Opción 1: OpenSSL
openssl rand -base64 32

# Opción 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Opción 3: Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Opción 4: /dev/urandom
cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1
```

### Políticas de Contraseñas

| Variable                     | Descripción              | Default | Ejemplo |
| ---------------------------- | ------------------------ | ------- | ------- |
| `PASSWORD_MIN_LENGTH`        | Longitud mínima          | 8       | 12      |
| `PASSWORD_REQUIRE_UPPERCASE` | Requerir mayúsculas      | true    | true    |
| `PASSWORD_REQUIRE_LOWERCASE` | Requerir minúsculas      | true    | true    |
| `PASSWORD_REQUIRE_NUMBERS`   | Requerir números         | true    | true    |
| `PASSWORD_REQUIRE_SYMBOLS`   | Requerir símbolos        | false   | true    |
| `PASSWORD_MAX_AGE_DAYS`      | Expiración de contraseña | 0 (off) | 90      |
| `PASSWORD_HISTORY_COUNT`     | Historial de contraseñas | 0       | 5       |

**Ejemplo de configuración estricta:**

```bash
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SYMBOLS=true
PASSWORD_MAX_AGE_DAYS=90
PASSWORD_HISTORY_COUNT=5
```

### Roles y Permisos (RBAC)

```bash
# Habilitar RBAC
ENABLE_RBAC=true

# Roles por defecto
DEFAULT_USER_ROLE=user
DEFAULT_ADMIN_ROLE=admin

# Permisos granulares
PERMISSION_CONTAINER_CREATE=user,admin
PERMISSION_CONTAINER_DELETE=admin
PERMISSION_IMAGE_DELETE=admin
PERMISSION_TUNNEL_CREATE=user,admin
PERMISSION_SYSTEM_MANAGE=admin
```

---

## ⏱️ Rate Limiting

Configuración de límites de peticiones.

| Variable                  | Descripción                    | Default | Ejemplo |
| ------------------------- | ------------------------------ | ------- | ------- |
| `RATE_LIMIT_ENABLED`      | Habilitar rate limiting        | true    | true    |
| `RATE_LIMIT_WINDOW`       | Ventana de tiempo (ms)         | 900000  | 3600000 |
| `RATE_LIMIT_MAX`          | Peticiones máximas por ventana | 100     | 1000    |
| `RATE_LIMIT_SKIP_TRUSTED` | Saltar para IPs confiables     | false   | true    |

### Configuración por Endpoint

```bash
# Límites específicos
RATE_LIMIT_AUTH_LOGIN_WINDOW=900000      # 15 min
RATE_LIMIT_AUTH_LOGIN_MAX=5              # 5 intentos
RATE_LIMIT_AUTH_LOGIN_BLOCK=3600000      # Bloqueo 1 hora

RATE_LIMIT_API_WINDOW=60000              # 1 min
RATE_LIMIT_API_MAX=100                   # 100 req/min

RATE_LIMIT_WS_CONNECTIONS=10             # 10 conexiones WS por IP
```

### IPs de Confianza

```bash
RATE_LIMIT_TRUSTED_IPS=127.0.0.1,10.0.0.0/8,172.16.0.0/12
```

---

## 📝 Logging

Configuración del sistema de logs.

### Niveles

```
error: Solo errores críticos
warn:  Errores y advertencias
info:  Información general (default)
debug: Información detallada
silly: Todo incluyendo dumps
```

### Variables

| Variable               | Descripción               | Default       | Ejemplo                |
| ---------------------- | ------------------------- | ------------- | ---------------------- |
| `LOG_LEVEL`            | Nivel mínimo de log       | info          | debug                  |
| `LOG_FORMAT`           | Formato de salida         | json          | pretty                 |
| `LOG_OUTPUT`           | Destino de logs           | stdout        | file                   |
| `LOG_FILE_PATH`        | Ruta del archivo de log   | /logs/app.log | /var/log/dockpilot.log |
| `LOG_FILE_MAX_SIZE`    | Tamaño máximo de archivo  | 10m           | 100m                   |
| `LOG_FILE_MAX_FILES`   | Número máximo de archivos | 5             | 10                     |
| `LOG_TIMESTAMP_FORMAT` | Formato de timestamp      | ISO8601       | YYYY-MM-DD HH:mm:ss    |

### Ejemplos

**Modo desarrollo (legible):**

```bash
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

**Modo producción (JSON para parseo):**

```bash
LOG_LEVEL=info
LOG_FORMAT=json
LOG_OUTPUT=file
LOG_FILE_PATH=/data/logs/dockpilot.log
LOG_FILE_MAX_SIZE=50m
LOG_FILE_MAX_FILES=10
```

**Logs estructurados:**

```json
{
  "timestamp": "2026-02-11T10:00:00.123Z",
  "level": "info",
  "service": "api-gateway",
  "requestId": "req-abc123",
  "method": "GET",
  "path": "/api/containers",
  "status": 200,
  "duration": 45,
  "userId": 1
}
```

---

## 🔌 WebSockets

Configuración de WebSockets para logs en tiempo real.

| Variable                    | Descripción                   | Default | Ejemplo |
| --------------------------- | ----------------------------- | ------- | ------- |
| `WS_ENABLED`                | Habilitar WebSockets          | true    | true    |
| `WS_PATH`                   | Ruta base para WS             | /ws     | /socket |
| `WS_HEARTBEAT_INTERVAL`     | Intervalo heartbeat (ms)      | 30000   | 60000   |
| `WS_HEARTBEAT_TIMEOUT`      | Timeout de heartbeat (ms)     | 60000   | 120000  |
| `WS_MAX_CONNECTIONS`        | Máximo de conexiones globales | 1000    | 5000    |
| `WS_MAX_CONNECTIONS_PER_IP` | Máximo por IP                 | 10      | 20      |
| `WS_COMPRESSION`            | Habilitar compresión          | true    | true    |

### Configuración de Proxy

Si usas un proxy reverso (Nginx), configura:

```nginx
# WebSocket proxy
location /ws {
    proxy_pass http://api-gateway:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts largos para conexiones persistentes
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

---

## 🌩️ Cloudflare Tunnels

Configuración para túneles Cloudflare.

### Autenticación

```bash
# Credenciales de cuenta
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

# O email + API key
CLOUDFLARE_EMAIL=admin@example.com
CLOUDFLARE_API_KEY=your-global-api-key
```

### Configuración de Túneles

```bash
# Configuración general
TUNNEL_DEFAULT_REGION=us-east-1
TUNNEL_MAX_PER_USER=5
TUNNEL_IDLE_TIMEOUT=30

# TLS
TUNNEL_FORCE_HTTPS=true
TUNNEL_NO_TLS_VERIFY=false

# Rendimiento
TUNNEL_RETRIES=5
TUNNEL_HEARTBEAT_INTERVAL=30s
TUNNEL_MAX_CONNECTIONS=4
```

### Configuración por Túnel

```yaml
# /etc/cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: app1.example.com
    service: http://localhost:3000

  - hostname: app2.example.com
    service: http://localhost:8080
    originRequest:
      noTLSVerify: true

  - service: http_status:404
```

### Docker Compose con Cloudflared

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    networks:
      - dockpilot-backend
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
```

---

## 📄 Ejemplo Completo de .env

```bash
# ==============================================
# DockPilot Configuration
# ==============================================

# Global
NODE_ENV=production
TZ=America/New_York
LOG_LEVEL=info
LOG_FORMAT=json
LOG_OUTPUT=file
LOG_FILE_PATH=/data/logs/dockpilot.log

# API Gateway
API_PORT=3000
API_HOST=0.0.0.0
JWT_SECRET=CHANGE_THIS_TO_A_RANDOM_32_CHAR_STRING
JWT_EXPIRES_IN=3600
JWT_REFRESH_DAYS=7
DATA_DIR=/data

# URLs de servicios
DOCKER_CONTROL_URL=http://docker-control:3001
TUNNEL_CONTROL_URL=http://tunnel-control:3002

# CORS
CORS_ORIGIN=https://dockpilot.tudominio.com
CORS_CREDENTIALS=true

# Seguridad
ENABLE_HELMET=true
TRUST_PROXY=true
MAX_REQUEST_SIZE=10mb

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
RATE_LIMIT_AUTH_LOGIN_MAX=5
RATE_LIMIT_AUTH_LOGIN_BLOCK=3600000

# Password Policy
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SYMBOLS=true

# Docker Control
DOCKER_CONTROL_PORT=3001
DOCKER_SOCKET=/var/run/docker.sock
MAX_CONCURRENT_OPERATIONS=10
LOGS_MAX_LINES=10000

# Tunnel Control
TUNNEL_CONTROL_PORT=3002
CLOUDFLARED_PATH=/usr/bin/cloudflared
TUNNEL_MAX_PER_USER=5

# Web
WEB_PORT=8000
API_URL=http://api-gateway:3000
```

---

## 🔄 Recargar Configuración

### Aplicar cambios de configuración

Actualmente DockPilot aplica configuración por reinicio de servicios. Para cambios en `.env` usa:

```bash
# Reiniciar servicios para aplicar cambios
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Variables comunes

- `LOG_LEVEL`
- `RATE_LIMIT_MAX`
- `CORS_ORIGIN`

### Requiere Reinicio

- `API_PORT`
- `JWT_SECRET`
- `DATA_DIR`
- `DOCKER_SOCKET`

---

## Notification Configuration

DockPilot supports multiple notification channels for alerts and system events.

### Quick Start

1. Go to Settings → Notifications
2. Enable and configure your preferred channels
3. Send test notifications to verify

### Supported Channels

- **SMTP**: For email notifications
- **Resend**: Cloud email service
- **Slack**: Team messaging
- **Telegram**: Mobile push notifications
- **Discord**: Community/team chat

See detailed guides in `docs/notifications/`.

### Security Notes

- All credentials are encrypted with AES-256-GCM
- Secrets are never exposed in UI or logs
- Use app-specific passwords when available
- Rotate credentials periodically

---

## 📚 Referencias

- [Architecture](architecture.md) - Entender la arquitectura
- [Installation](installation.md) - Guía de instalación
- [API](api.md) - Documentación de API
- [Operations Checklist](operations-checklist.md) - Operacion productiva
- [SMTP](notifications/smtp.md) - Configuración SMTP
- [Resend](notifications/resend.md) - Configuración Resend
- [Slack](notifications/slack.md) - Configuración Slack
- [Telegram](notifications/telegram.md) - Configuración Telegram
- [Discord](notifications/discord.md) - Configuración Discord
