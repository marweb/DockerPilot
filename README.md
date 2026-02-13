# 🐳 DockPilot

<p align="center">
  <img src="https://via.placeholder.com/200x200/2563eb/ffffff?text=DockPilot" alt="DockPilot Logo" width="200"/>
</p>

<p align="center">
  <strong>Gestión de contenedores Docker simplificada con una interfaz web intuitiva</strong>
</p>

<p align="center">
  <a href="https://github.com/dockpilot/dockpilot/actions"><img src="https://img.shields.io/github/workflow/status/dockpilot/dockpilot/CI/main?style=flat-square" alt="Build Status"/></a>
  <a href="https://github.com/dockpilot/dockpilot/actions"><img src="https://img.shields.io/github/workflow/status/dockpilot/dockpilot/Tests/main?label=tests&style=flat-square" alt="Tests"/></a>
  <a href="https://codecov.io/gh/dockpilot/dockpilot"><img src="https://img.shields.io/codecov/c/github/dockpilot/dockpilot?style=flat-square" alt="Coverage"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/dockpilot/dockpilot?style=flat-square" alt="License"/></a>
  <a href="https://hub.docker.com/r/dockpilot/dockpilot"><img src="https://img.shields.io/docker/pulls/dockpilot/dockpilot?style=flat-square" alt="Docker Pulls"/></a>
</p>

<p align="center">
  <a href="#características">Características</a> •
  <a href="#estructura-del-proyecto">Estructura</a> •
  <a href="#instalación">Instalación</a> •
  <a href="#documentación">Documentación</a> •
  <a href="#contribuir">Contribuir</a>
</p>

---

## 📋 Características

- 🎨 **Interfaz Web Moderna**: Dashboard intuitivo y responsive
- 🐳 **Gestión Completa**: Contenedores, imágenes, volúmenes y redes
- 🔒 **Autenticación Segura**: JWT con políticas de contraseñas
- 🌐 **Túneles Cloudflare**: Exposición segura de servicios
- 📊 **Monitoreo en Tiempo Real**: Stats, logs y métricas
- 📝 **Docker Compose**: Soporte nativo para archivos YAML
- 🔄 **WebSockets**: Actualizaciones en tiempo real
- 🧪 **Testing Completo**: Tests E2E con Playwright + Unitarios con Vitest
- 👥 **RBAC**: Roles granulares (admin/operator/viewer)
- 🛡️ **Rate Limiting**: Protección contra abuso
- 📋 **Audit Logging**: Registro completo de acciones
- 🌍 **Multilenguaje**: 7 idiomas soportados (EN, ES, FR, DE, ZH, RU, JA)
- 📊 **Visualización**: Gráficos y métricas con Recharts
- 🚀 **Fácil Instalación**: One-liner con curl

## 📸 Screenshots

<p align="center">
  <img src="https://via.placeholder.com/800x400/1e293b/ffffff?text=Dashboard+Screenshot" alt="Dashboard" width="800"/>
  <br/>
  <em>Dashboard principal con visión general del sistema</em>
</p>

<p align="center">
  <img src="https://via.placeholder.com/800x400/1e293b/ffffff?text=Container+Management" alt="Containers" width="800"/>
  <br/>
  <em>Gestión de contenedores con logs en tiempo real</em>
</p>

## 🏗️ Arquitectura

```
┌─────────────────┐
│   Web Client    │
│  (React/Vite)   │
└────────┬────────┘
         │ HTTP/WebSocket
         ▼
┌─────────────────┐
│  API Gateway    │
│   (Fastify)     │
│   (Port 3000)   │
└────────┬────────┘
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
┌───────┐ ┌────────┐ ┌──────────┐
│Docker │ │Tunnel  │ │  Auth    │
│Control│ │Control │ │ Service  │
│(Fastify)│ (Fastify)│  (Fastify) │
└───┬───┘ └────────┘ └──────────┘
    │
┌───▼───┐
│Docker │
│Socket │
└───────┘
```

Para más detalles, ver [docs/architecture.md](docs/architecture.md).

## 📁 Estructura del Proyecto

```
dockpilot/
├── apps/web/          # Frontend React + Vite + Tailwind
├── services/          # Microservicios Fastify
│   ├── api-gateway/   # Auth, RBAC, Rate Limit
│   ├── docker-control/# Gestión Docker
│   └── tunnel-control/# Túneles Cloudflare
├── packages/types/    # Tipos TypeScript
├── infra/             # Docker Compose + scripts (desarrollo)
├── scripts/           # Instalador curl | bash + upgrade
├── tests/             # E2E + Unit tests
└── docs/              # Documentación
```

## 💻 Requisitos del Sistema

### Mínimos

- **SO**: Linux (Ubuntu 20.04+, Debian 10+, CentOS 8+)
- **RAM**: 512 MB
- **CPU**: 1 core
- **Docker**: 20.10.0+
- **Docker Compose**: 2.0.0+

### Recomendados

- **RAM**: 2 GB+
- **CPU**: 2 cores+
- **Almacenamiento**: 20 GB SSD

## 🚀 Instalación Rápida

### Método 1: One-liner (Recomendado)

Instala DockPilot con un solo comando. Soporta AMD64 y ARM64 (64-bit).

```bash
curl -fsSL https://raw.githubusercontent.com/marweb/DockerPilot/master/scripts/install.sh | sudo bash
```

El script instala Docker (si no está presente), descarga las imágenes y arranca los servicios. Al finalizar, abre `http://TU_IP:80` para crear tu cuenta de administrador.

### Método 2: Docker Compose (desarrollo)

```bash
git clone https://github.com/marweb/DockerPilot.git
cd DockerPilot
cp infra/.env.example infra/.env
# Editar infra/.env y configurar JWT_SECRET
docker compose -f infra/docker-compose.yml up -d --build
```

### Método 3: Desarrollo local

```bash
git clone https://github.com/marweb/DockerPilot.git
cd DockerPilot
pnpm install        # Requiere pnpm >= 8.0.0
pnpm dev            # Inicia en modo desarrollo
```

Para una guía de instalación detallada, ver [docs/installation.md](docs/installation.md).

## 📖 Uso Básico

### Primer Acceso

1. Accede a `http://TU_IP:80` (o `http://localhost:80` si es local)
2. Completa el setup creando tu usuario administrador (username + contraseña)
3. ¡Empieza a gestionar tus contenedores!

### Comandos Rápidos

```bash
# Ver logs
docker-compose logs -f

# Reiniciar servicios
docker-compose restart

# Actualizar
./scripts/update.sh
```

### Scripts Disponibles

**Desarrollo:**

- `pnpm dev` - Inicia en modo desarrollo
- `pnpm build` - Compila para producción

**Testing:**

- `pnpm test` - Ejecuta todos los tests
- `pnpm test:unit` - Tests unitarios con Vitest
- `pnpm test:e2e` - Tests E2E con Playwright
- `pnpm test:coverage` - Reporte de cobertura

**Docker:**

- `pnpm docker:dev` - Inicia en modo desarrollo con Docker
- `pnpm docker:prod` - Inicia en modo producción con Docker

**Infra:**

- `./infra/scripts/start.sh` - Inicia servicios
- `./infra/scripts/stop.sh` - Detiene servicios
- `./infra/scripts/logs.sh` - Muestra logs
- `./infra/scripts/backup.sh` - Crea backup
- `./infra/scripts/update.sh` - Actualiza DockPilot

**Calidad:**

- `pnpm lint` - Ejecuta el linter
- `pnpm format` - Formatea el código
- `pnpm clean` - Limpia archivos generados

## ⚙️ Configuración

DockPilot se configura mediante variables de entorno:

```bash
# Configuración básica
API_PORT=3000
JWT_SECRET=tu-secret-key
ENABLE_SWAGGER=true

# Configuración de logs
LOG_LEVEL=info
LOG_FORMAT=json

# Base de datos (SQLite en /data/dockpilot.db)
DATA_DIR=/data
```

Ver [docs/configuration.md](docs/configuration.md) para todas las opciones.

## 🔄 Actualización

```bash
# Instalación con curl (producción)
cd /data/dockpilot/source
./upgrade.sh latest

# O con Docker Compose manual
cd /data/dockpilot/source
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## ❌ Desinstalación

```bash
# Desinstalador para instalaciones con curl
curl -fsSL https://raw.githubusercontent.com/marweb/DockerPilot/main/scripts/uninstall.sh | sudo bash

# O manualmente
cd /data/dockpilot/source
docker compose -f docker-compose.yml down
rm -rf /data/dockpilot
```

## 🤝 Contribuir

¡Las contribuciones son bienvenidas!

1. Fork el repositorio
2. Crea tu feature branch (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

Ver [docs/development.md](docs/development.md) para más detalles.

## 🐛 Problemas Comunes

- **No puede conectar a Docker**: Verifica que el socket Docker esté accesible
- **Error de autenticación**: Revisa el JWT_SECRET
- **WebSockets no funcionan**: Configura tu proxy/reverse proxy

Ver [docs/troubleshooting.md](docs/troubleshooting.md) para soluciones detalladas.

## 📄 Licencia

Este proyecto está licenciado bajo la [MIT License](LICENSE).

## 🙏 Créditos

- [Docker](https://www.docker.com/) - Por la plataforma de contenedores
- [Cloudflare](https://www.cloudflare.com/) - Por el servicio de túneles
- [Fastify](https://www.fastify.io/) - Framework del API Gateway
- [React](https://reactjs.org/) - Biblioteca del frontend
- [Vitest](https://vitest.dev/) - Framework de testing unitario
- [Playwright](https://playwright.dev/) - Testing E2E
- [Turbo](https://turbo.build/) - Monorepo build system
- [pnpm](https://pnpm.io/) - Package manager
- [Recharts](https://recharts.org/) - Visualización de datos

## 🔗 Links

- 📖 [Documentación Completa](docs/)
- 🐛 [Reportar Issues](https://github.com/dockpilot/dockpilot/issues)
- 💬 [Discussions](https://github.com/dockpilot/dockpilot/discussions)
- 🌐 [Sitio Web](https://dockpilot.io)

---

<p align="center">
  Hecho con ❤️ por el equipo de DockPilot
</p>
