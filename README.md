# DockPilot

<p align="center">
  <img src="assets/screenshots/dockpilot_logo.png" alt="DockPilot Logo" width="220"/>
</p>

<p align="center">
  <strong>Modern Docker container management with web UI, repository deployments, and secure operations.</strong>
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

## ✨ Features

- **Complete Docker Management**: Containers, images, networks, and volumes
- **Docker Compose Wizard**: Preflight checks and validation
- **Repository Deployments**: Manual + OAuth support
- **GitHub/GitLab Webhooks**: Signature/token validation with idempotency
- **Environment Variable Editor**: Safe service recreate with rollback
- **RBAC & Security**: Rate limiting and audit logging for production use
- **🔔 Smart Notifications** (v2.0): Automatic event alerts via email, Slack, Telegram, Discord

## 🔔 Notification System

DockPilot includes a powerful event notification system to alert you when important events occur:

### Supported Events (30+)

- **Containers**: Crashes, OOM kills, restarts, health check failures
- **Deployments**: Success, failure, rollback events
- **Security**: Brute force attacks, unauthorized access attempts
- **System**: Upgrades, backups, startup/shutdown
- **Authentication**: Login success/failure, password changes

### Notification Channels

- 📧 **Email** (SMTP / Resend)
- 💬 **Slack** (Webhooks)
- ✈️ **Telegram** (Bot API)
- 🎮 **Discord** (Webhooks)

### Quick Setup

1. Go to **Settings** → **Notifications** → Configure channels
2. Go to **Settings** → **Events** → Enable desired events
3. Receive automatic alerts when events occur

📖 See [Notification Documentation](./docs/guides/notifications/)

## 📸 Screenshots

### Login

![DockPilot Login](assets/screenshots/dockpilot-login.png)

### Dashboard

![DockPilot Dashboard](assets/screenshots/dockpilot-dashboard.png)

### Settings

![DockPilot Settings](assets/screenshots/dockpilot-settings.png)

## 🚀 Quick Start

### One-liner (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/marweb/DockPilot/master/scripts/install.sh | sudo bash
```

### Docker Compose

```bash
git clone https://github.com/marweb/DockPilot.git
cd DockPilot
cp infra/.env.example infra/.env
# Edit infra/.env with your settings
docker compose -f infra/docker-compose.yml up -d --build
```

### Local Development

```bash
git clone https://github.com/marweb/DockPilot.git
cd DockPilot
pnpm install
pnpm dev
```

## ⚙️ Important Environment Variables

```bash
# Required
JWT_SECRET=your-secure-jwt-secret-min-32-chars
MASTER_KEY=your-secure-master-key-min-32-chars

# Optional but recommended
PUBLIC_BASE_URL=https://dockpilot.example.com
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret
GITLAB_WEBHOOK_SECRET=your-gitlab-webhook-secret
```

See [Configuration Guide](./docs/guides/configuration.md) for complete documentation.

## 📚 Documentation

### User Guides

- [Installation](./docs/guides/installation.md)
- [Configuration](./docs/guides/configuration.md)
- [Operations Checklist](./docs/guides/operations-checklist.md)
- [Troubleshooting](./docs/guides/troubleshooting.md)
- [Notification Setup](./docs/guides/notifications/)

### Developer Documentation

- [Architecture](./docs/reference/architecture.md)
- [API Reference](./docs/reference/api.md)
- [Development Checklists](./docs/development/)
- [Architecture Decisions](./docs/architecture/)

### Deployment

- [Docker Compose](./infra/docker-compose.yml)
- [Environment Templates](./infra/.env.example)
- [Scripts](./scripts/)

## 🛠️ Useful Scripts

```bash
# Start services
infra/scripts/start.sh

# Stop services
infra/scripts/stop.sh

# View logs
infra/scripts/logs.sh

# Backup data
infra/scripts/backup.sh

# Restore data
infra/scripts/restore.sh
```

## 🔐 Security

DockPilot implements multiple security layers:

- **Encryption**: AES-256-GCM for sensitive data
- **Authentication**: JWT with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Configurable per endpoint
- **Audit Logging**: All actions tracked
- **Secret Management**: Encrypted credentials storage

## 🌍 Internationalization

DockPilot supports 7 languages:

- 🇺🇸 English
- 🇪🇸 Español
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇨🇳 中文
- 🇷🇺 Русский
- 🇯🇵 日本語

## 🏗️ Architecture

DockPilot uses a microservices architecture:

- **API Gateway** (Port 3000): Authentication, RBAC, routing
- **Docker Control** (Port 3001): Docker operations, webhooks
- **Tunnel Control** (Port 3002): Cloudflare tunnel management
- **Web UI** (Port 8000): React frontend

See [Architecture Documentation](./docs/reference/architecture.md) for details.

## 🤝 Contributing

We welcome contributions! Please see:

- [Contributing Guidelines](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Development Setup](./docs/development/)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Docker SDK for the amazing API
- Fastify for the high-performance backend
- React and Tailwind for the modern UI
- The open-source community

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/marweb/DockPilot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/marweb/DockPilot/discussions)
- **Security**: Please report security issues privately

---

<p align="center">
  Made with ❤️ by the DockPilot Team
</p>
