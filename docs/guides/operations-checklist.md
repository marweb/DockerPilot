# Operative Checklist (Production)

Checklist operativo para cerrar hardening de producción en DockPilot.

## 1) Rotación de secretos (OAuth/Webhooks)

- Frecuencia recomendada:
  - `MASTER_KEY`: cada 90 días (planificada, con ventana de mantenimiento)
  - `GITHUB_WEBHOOK_SECRET`, `GITLAB_WEBHOOK_SECRET`: cada 60-90 días
  - `GITHUB_APP_CLIENT_SECRET`, `GITLAB_OAUTH_CLIENT_SECRET`: cada 90 días
- Pre-check:
  - Validar backup reciente (`infra/scripts/backup.sh`) y guardarlo fuera del host.
  - Confirmar `PUBLIC_BASE_URL` y webhooks activos en proveedores.
- Procedimiento:
  1. Generar nuevos secretos fuertes (`openssl rand -base64 48`).
  2. Actualizar `infra/.env` con los nuevos valores.
  3. Reiniciar servicios:
     ```bash
     docker compose -f infra/docker-compose.yml up -d
     ```
  4. Reconfigurar webhook secret en GitHub/GitLab para cada repo.
  5. Validar con un push de prueba:
     - firma/token OK,
     - `deliveryId` nuevo,
     - despliegue autodeploy (si `autoDeploy=true`).
- Criterio de cierre:
  - eventos webhook válidos responden `200`, inválidos `401`, duplicados `duplicate=true`.

## 2) Runbook de incidentes

- Severidad:
  - `SEV-1`: caída total (UI/API no disponible o deploy bloqueado global)
  - `SEV-2`: degradación parcial (webhooks caídos, una feature crítica rota)
  - `SEV-3`: impacto menor/aislado
- Triage inicial (primeros 10 minutos):
  ```bash
  docker compose -f infra/docker-compose.yml ps
  docker compose -f infra/docker-compose.yml logs --tail=200 api-gateway
  docker compose -f infra/docker-compose.yml logs --tail=200 docker-control
  docker compose -f infra/docker-compose.yml logs --tail=200 tunnel-control
  ```
- Contención:
  - Desactivar `autoDeploy` en repos afectados.
  - Rotar secreto webhook si hay sospecha de exposición.
  - Bloquear endpoint público temporalmente en reverse proxy si hay abuso.
- Recuperación:
  - Aplicar fix/config.
  - Ejecutar smoke test: login, listado de containers, compose deploy manual, webhook push test.
- Postmortem (24h):
  - causa raíz, detección, impacto, acciones preventivas y owner/fecha.

## 3) Monitoreo y alertas mínimas

- Health checks obligatorios:
  - `GET /healthz` (api-gateway)
  - `GET /healthz` (docker-control)
  - `GET /healthz` (tunnel-control)
- Alertas recomendadas:
  - disponibilidad < 99.9% mensual
  - 5xx > 2% por 5 min
  - p95 latencia API > 1200 ms por 5 min
  - fallos de login continuos (posible brute force)
  - webhook `401` o `400` sostenidos
  - uso disco > 80% en host y volumen `/data`
- Operación diaria:
  ```bash
  docker compose -f infra/docker-compose.yml ps
  docker stats --no-stream
  docker volume ls
  ```

## 4) Backup/Restore probado

- Backup operativo:
  ```bash
  infra/scripts/backup.sh /opt/dockpilot/backups
  ```
- Prueba de restore (dry-run, obligatoria semanal):
  ```bash
  infra/scripts/restore.sh /opt/dockpilot/backups/dockpilot-backup-YYYYmmdd_HHMMSS.tar.gz
  ```
- Restore real (solo en ventana controlada):
  ```bash
  infra/scripts/restore.sh --apply --restore-env /opt/dockpilot/backups/dockpilot-backup-YYYYmmdd_HHMMSS.tar.gz
  docker compose -f infra/docker-compose.yml up -d
  ```
- Validación post-restore:
  - login admin OK,
  - repos configurados visibles,
  - stacks/containers visibles,
  - webhook de prueba responde como esperado.

## 5) Checklist de cierre (Go/No-Go)

- [ ] Secretos rotados y documentados (fecha + owner)
- [ ] Runbook ensayado por el equipo on-call
- [ ] Alertas configuradas y disparo de prueba validado
- [ ] Backup diario funcionando y retención aplicada
- [ ] Restore dry-run semanal sin errores
- [ ] Restore real validado en staging durante el último ciclo

Si todos los checks anteriores estan en verde, el estado operativo se considera listo para produccion.
