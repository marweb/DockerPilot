# DockPilot

<p align="center">
  <img src="assets/screenshots/dockpilot_logo.png" alt="DockPilot Logo" width="220"/>
</p>

<p align="center">
  <strong>Gestión moderna de contenedores Docker con UI web, despliegues desde repositorios y operaciones seguras.</strong>
</p>

<p align="center">
  <a href="https://github.com/marweb/DockPilot/actions"><img src="https://img.shields.io/github/actions/workflow/status/marweb/DockPilot/release.yml?style=flat-square" alt="Release"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/marweb/DockPilot?style=flat-square" alt="License"/></a>
  <a href="https://github.com/marweb/DockPilot/issues"><img src="https://img.shields.io/github/issues/marweb/DockPilot?style=flat-square" alt="Issues"/></a>
  <a href="https://github.com/marweb/DockPilot/releases"><img src="https://img.shields.io/github/v/release/marweb/DockPilot?style=flat-square" alt="Version"/></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README-es.md">Español</a>
</p>

---

## ✨ Características

- **Gestión Completa de Docker**: Contenedores, imágenes, redes y volúmenes
- **Asistente Docker Compose**: Validaciones y comprobaciones pre-despliegue
- **Despliegues desde Repositorios**: Soporte manual + OAuth
- **Webhooks GitHub/GitLab**: Validación de firmas/tokens con idempotencia
- **Editor de Variables de Entorno**: Recreación segura de servicios con rollback
- **RBAC y Seguridad**: Rate limiting y auditoría para uso en producción
- **🔔 Notificaciones Inteligentes** (v2.0): Alertas automáticas por eventos vía email, Slack, Telegram, Discord

## 🔔 Sistema de Notificaciones

DockPilot incluye un poderoso sistema de notificaciones para alertarte cuando ocurren eventos importantes:

### Eventos Soportados (30+)

- **Contenedores**: Crashes, OOM kills, reinicios, fallos de health check
- **Despliegues**: Éxito, fallo, eventos de rollback
- **Seguridad**: Ataques de fuerza bruta, intentos de acceso no autorizado
- **Sistema**: Actualizaciones, backups, inicio/apagado
- **Autenticación**: Login exitoso/fallido, cambios de contraseña

### Canales de Notificación

- 📧 **Email** (SMTP / Resend)
- 💬 **Slack** (Webhooks)
- ✈️ **Telegram** (Bot API)
- 🎮 **Discord** (Webhooks)

### Configuración Rápida

1. Ve a **Configuración** → **Notificaciones** → Configura canales
2. Ve a **Configuración** → **Eventos** → Habilita eventos deseados
3. Recibe alertas automáticas cuando ocurran eventos

📖 Ver [Documentación de Notificaciones](./docs/guides/notifications/)

## 📸 Capturas de Pantalla

### Login

![DockPilot Login](assets/screenshots/dockpilot-login.png)

### Dashboard

![DockPilot Dashboard](assets/screenshots/dockpilot-dashboard.png)

### Configuración

![DockPilot Settings](assets/screenshots/dockpilot-settings.png)

## 🚀 Inicio Rápido

### One-liner (Recomendado)

```bash
curl -fsSL https://raw.githubusercontent.com/marweb/DockPilot/master/scripts/install.sh | sudo bash
```

### Docker Compose

```bash
git clone https://github.com/marweb/DockPilot.git
cd DockPilot
cp infra/.env.example infra/.env
# Edita infra/.env con tus configuraciones
docker compose -f infra/docker-compose.yml up -d --build
```

### Desarrollo Local

```bash
git clone https://github.com/marweb/DockPilot.git
cd DockPilot
pnpm install
pnpm dev
```

## ⚙️ Variables de Entorno Importantes

```bash
# Requeridas
JWT_SECRET=tu-secreto-jwt-seguro-min-32-caracteres
MASTER_KEY=tu-clave-maestra-segura-min-32-caracteres

# Opcionales pero recomendadas
PUBLIC_BASE_URL=https://dockpilot.example.com
GITHUB_WEBHOOK_SECRET=tu-secreto-webhook-github
GITLAB_WEBHOOK_SECRET=tu-secreto-webhook-gitlab
```

Ver [Guía de Configuración](./docs/guides/configuration.md) para documentación completa.

## 📚 Documentación

### Guías de Usuario

- [Instalación](./docs/guides/installation.md)
- [Configuración](./docs/guides/configuration.md)
- [Checklist de Operaciones](./docs/guides/operations-checklist.md)
- [Solución de Problemas](./docs/guides/troubleshooting.md)
- [Configuración de Notificaciones](./docs/guides/notifications/)

### Documentación para Desarrolladores

- [Arquitectura](./docs/reference/architecture.md)
- [Referencia de API](./docs/reference/api.md)
- [Checklists de Desarrollo](./docs/development/)
- [Decisiones de Arquitectura](./docs/architecture/)

### Despliegue

- [Docker Compose](./infra/docker-compose.yml)
- [Plantillas de Entorno](./infra/.env.example)
- [Scripts](./scripts/)

## 🛠️ Scripts Útiles

```bash
# Iniciar servicios
infra/scripts/start.sh

# Detener servicios
infra/scripts/stop.sh

# Ver logs
infra/scripts/logs.sh

# Backup de datos
infra/scripts/backup.sh

# Restaurar datos
infra/scripts/restore.sh
```

## 🔐 Seguridad

DockPilot implementa múltiples capas de seguridad:

- **Encriptación**: AES-256-GCM para datos sensibles
- **Autenticación**: JWT con tokens de refresco
- **Autorización**: Control de acceso basado en roles (RBAC)
- **Rate Limiting**: Configurable por endpoint
- **Auditoría**: Todas las acciones son rastreadas
- **Gestión de Secretos**: Almacenamiento encriptado de credenciales

## 🌍 Internacionalización

DockPilot soporta 7 idiomas:

- 🇺🇸 English
- 🇪🇸 Español
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇨🇳 中文
- 🇷🇺 Русский
- 🇯🇵 日本語

## 🏗️ Arquitectura

DockPilot utiliza una arquitectura de microservicios:

- **API Gateway** (Puerto 3000): Autenticación, RBAC, enrutamiento
- **Docker Control** (Puerto 3001): Operaciones Docker, webhooks
- **Tunnel Control** (Puerto 3002): Gestión de túneles Cloudflare
- **Web UI** (Puerto 8000): Frontend React

Ver [Documentación de Arquitectura](./docs/reference/architecture.md) para más detalles.

## 🤝 Contribuir

¡Bienvenidas las contribuciones! Por favor consulta:

- [Guía de Contribución](./CONTRIBUTING.md)
- [Código de Conducta](./CODE_OF_CONDUCT.md)
- [Configuración de Desarrollo](./docs/development/)

## 📝 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](./LICENSE) para más detalles.

## 🙏 Agradecimientos

- Docker SDK por su increíble API
- Fastify por el backend de alto rendimiento
- React y Tailwind por la UI moderna
- La comunidad open-source

## 📞 Soporte

- **Issues**: [GitHub Issues](https://github.com/marweb/DockPilot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/marweb/DockPilot/discussions)
- **Seguridad**: Por favor reporta issues de seguridad de forma privada

---

<p align="center">
  Hecho con ❤️ por el Equipo DockPilot
</p>
