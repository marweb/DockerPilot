# 🔧 Troubleshooting

Guía de resolución de problemas comunes en DockPilot.

## 📋 Índice

- [Problemas Comunes](#problemas-comunes-y-soluciones)
- [Debuggear](#cómo-debuggear)
- [FAQ](#faq)

---

## 🛠️ Problemas Comunes y Soluciones

### ❌ No puede conectar a Docker

**Síntomas:**

- Error: `Cannot connect to Docker daemon`
- API retorna 503 Service Unavailable
- Dashboard muestra "Docker disconnected"

**Causas y Soluciones:**

#### 1. Docker no está corriendo

```bash
# Verificar estado
docker info

# Iniciar Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verificar que el usuario está en el grupo docker
groups $USER
# Debe mostrar: ... docker ...

# Si no está, agregar y reiniciar sesión
sudo usermod -aG docker $USER
# Cerrar y volver a abrir terminal
```

#### 2. Permisos del socket

```bash
# Verificar permisos
ls -la /var/run/docker.sock

# Debe mostrar: srw-rw---- 1 root docker
# Si no, corregir:
sudo chmod 666 /var/run/docker.sock
# O mejor:
sudo chown root:docker /var/run/docker.sock
sudo chmod 660 /var/run/docker.sock
```

#### 3. Socket no montado en el contenedor

```yaml
# Verificar docker-compose.yml
services:
  docker-control:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

#### 4. Docker remoto no responde

```bash
# Si usas Docker remoto, verificar conectividad
telnet docker-host 2375

# Verificar TLS si está habilitado
curl --cacert ca.pem --cert cert.pem --key key.pem \
  https://docker-host:2376/info
```

---

### 🔐 Error de Autenticación

**Síntomas:**

- Error 401 Unauthorized
- "Invalid credentials" al hacer login
- Token rechazado en peticiones

**Causas y Soluciones:**

#### 1. JWT Secret no configurado

```bash
# Verificar que JWT_SECRET está configurado
cat .env | grep JWT_SECRET

# Si no está, generar uno
export JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET" >> .env

# Reiniciar servicios
docker-compose restart
```

#### 2. Token expirado

```bash
# El token por defecto expira en 1 hora
# Usar el refresh token o hacer login nuevamente

# Para extender la duración:
JWT_EXPIRES_IN=86400  # 24 horas en segundos
```

#### 3. Contraseña incorrecta

```bash
# Resetear contraseña de admin (requiere acceso a contenedor)
# Generar hash con: node -e "const argon2=require('argon2');argon2.hash('nueva-password').then(console.log)"
docker exec -it dockpilot-api-gateway sqlite3 /data/dockpilot.db \
  "UPDATE users SET password_hash = '\$argon2id\$v=19\$...' WHERE username = 'admin';"

# O borrar DB y reconfigurar:
docker-compose down
docker volume rm dockpilot_api-gateway-data 2>/dev/null || true
docker-compose up -d
# Volver a hacer setup inicial
```

#### 4. Problemas de timezone

```bash
# Verificar que el reloj está sincronizado
date

# Sincronizar
sudo ntpdate -s time.nist.gov
```

---

### 📡 WebSockets no funcionan

**Síntomas:**

- Logs en tiempo real no se muestran
- Error en consola del navegador: `WebSocket connection failed`
- Desconexión inmediata al conectar

**Causas y Soluciones:**

#### 1. Proxy no configurado para WebSockets

```nginx
# nginx.conf - Agregar upgrade headers
location /ws {
    proxy_pass http://api-gateway:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # Timeouts
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

#### 2. Firewall bloqueando WebSockets

```bash
# Verificar puertos abiertos
sudo ufw status
sudo iptables -L | grep 3000

# Abrir puertos si es necesario
sudo ufw allow 3000/tcp
```

#### 3. Navegador bloqueando conexiones inseguras

```bash
# Si usas HTTPS en el proxy pero WS sin TLS,
# el navegador puede bloquear mixed content

# Solución: Usar WSS
WS_URL=wss://api.tudominio.com
```

#### 4. Rate limiting

```bash
# Verificar logs
docker-compose logs api-gateway | grep "rate limit"

# Aumentar límites si es necesario
WS_MAX_CONNECTIONS_PER_IP=20
```

---

### 🌐 Túneles no inician

**Síntomas:**

- Error al crear túnel
- Túnel creado pero no conecta
- Status "error" en dashboard

**Causas y Soluciones:**

#### 1. Cloudflared no instalado

```bash
# Verificar instalación
which cloudflared
cloudflared --version

# Instalar si falta
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

#### 2. Credenciales de Cloudflare inválidas

```bash
# Verificar login
cloudflared tunnel list

# Si falla, hacer login nuevamente
cloudflared tunnel login

# Copiar certificado al contenedor
docker cp ~/.cloudflared/cert.pem dockpilot-tunnel:/etc/cloudflared/
docker restart dockpilot-tunnel
```

#### 3. Subdominio ya en uso

```bash
# Verificar túneles existentes
cloudflared tunnel list

# Verificar DNS records
cloudflared tunnel route dns <tunnel-id> <subdomain>
```

#### 4. Container objetivo no existe

```bash
# Verificar que el contenedor existe
docker ps | grep <container-name>

# Verificar logs del tunnel
docker-compose logs tunnel-control
```

---

### 📁 Permisos de Archivos

**Síntomas:**

- Error EACCES al leer/escribir archivos
- Base de datos bloqueada
- Logs no se escriben

**Causas y Soluciones:**

#### 1. Propietario incorrecto

```bash
# Verificar propietarios
ls -la data/
ls -la logs/

# Corregir (ejecutar desde directorio dockpilot)
sudo chown -R $USER:$USER data/
sudo chown -R $USER:$USER logs/

# O usar IDs de usuario/grupo de Docker
# Obtener UID dentro del contenedor
docker exec dockpilot-api id

# Aplicar al host
sudo chown -R 1000:1000 data/
```

#### 2. Permisos de base de datos

```bash
# Verificar
docker exec dockpilot-api-gateway ls -la /data/

# Si está bloqueada, puede haber otra instancia corriendo
fuser /data/dockpilot.db

# Corregir permisos
docker exec dockpilot-api-gateway chmod 644 /data/dockpilot.db
```

#### 3. Directorios no montados

```yaml
# Verificar volumes en docker-compose.yml
volumes:
  - ./data:/data
  - ./logs:/logs

# Crear directorios si no existen
mkdir -p data logs
```

---

### 🌐 Problemas de Red

**Síntomas:**

- Timeouts en peticiones
- DNS no resuelve
- Contenedores no se comunican

**Causas y Soluciones:**

#### 1. Firewall

```bash
# Verificar reglas
sudo iptables -L -n | grep DROP
sudo ufw status

# Permitir tráfico entre contenedores
# (por defecto Docker maneja esto)

# Permitir puertos externos
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 443/tcp
```

#### 2. DNS no resuelve

```bash
# Verificar resolución DNS
cat /etc/resolv.conf

# En docker-compose.yml, agregar DNS
services:
  api-gateway:
    dns:
      - 8.8.8.8
      - 8.8.4.4
```

#### 3. Red Docker corrupta

```bash
# Recrear red
docker network rm dockpilot_backend
docker-compose up -d

# O más drástico
docker network prune  # ¡Cuidado! Elimina redes no usadas
```

#### 4. MTU incorrecto

```bash
# Verificar MTU
ip addr show docker0

# Si hay problemas de fragmentación
# docker-compose.yml
services:
  api-gateway:
    network_mode: bridge
    sysctls:
      - net.ipv4.ipfrag_time=30
```

---

### 💾 Alta Memoria/CPU

**Síntomas:**

- Sistema lento
- Contenedores OOMKilled
- Load average alto

**Causas y Soluciones:**

#### 1. Límites de recursos

```yaml
# Agregar límites en docker-compose.yml
services:
  api-gateway:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

#### 2. Memory leaks

```bash
# Monitorear uso de memoria
docker stats

# Verificar si hay leaks
# Reiniciar periódicamente si es necesario
0 3 * * * docker-compose restart api-gateway
```

#### 3. Muchos contenedores/logs

```bash
# Limpiar contenedores detenidos
docker container prune

# Limpiar imágenes no usadas
docker image prune -a

# Limpiar logs
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log

# O rotar logs
docker run --rm -v /var/lib/docker/containers:/containers alpine sh -c \
  'find /containers -name "*.log" -size +100M -exec truncate -s 0 {} \;'
```

#### 4. Bases de datos grandes

```bash
# Verificar tamaño de SQLite
docker exec dockpilot-api-gateway du -sh /data/dockpilot.db

# Limpiar logs antiguos (máx 10000 se mantienen automáticamente, pero si necesitas más)
docker exec dockpilot-api-gateway sqlite3 /data/dockpilot.db \
  "DELETE FROM audit_logs WHERE timestamp < datetime('now', '-30 days');"

# Vaciar espacio
docker exec dockpilot-api-gateway sqlite3 /data/dockpilot.db "VACUUM;"
```

---

## 🔍 Cómo Debuggear

### Ver Logs

```bash
# Ver todos los logs
docker-compose logs

# Ver últimas 100 líneas
docker-compose logs --tail=100

# Seguir logs en tiempo real
docker-compose logs -f

# Logs de un servicio específico
docker-compose logs -f api-gateway
docker-compose logs -f docker-control
docker-compose logs -f tunnel-control

# Logs con timestamps
docker-compose logs -f -t

# Logs desde una fecha específica
docker-compose logs --since 2026-02-11
```

### Enable Debug Mode

```bash
# Temporalmente (solo para esta sesión)
docker-compose exec api-gateway NODE_ENV=development npm start

# Permanentemente (.env)
LOG_LEVEL=debug
DEBUG=dockpilot:*

# Reiniciar
docker-compose restart
```

### Comandos Útiles de Docker

```bash
# Inspeccionar contenedor
docker inspect dockpilot-api

# Ver procesos dentro del contenedor
docker top dockpilot-api

# Ejecutar shell dentro del contenedor
docker exec -it dockpilot-api /bin/sh

# Ver estadísticas
docker stats dockpilot-api

# Ver redes
docker network ls
docker network inspect dockpilot_backend

# Ver volúmenes
docker volume ls
docker volume inspect dockpilot_data

# Ver eventos de Docker en tiempo real
docker events
```

### Debug de API

```bash
# Probar endpoint con curl
curl -v http://localhost:3000/healthz

# Probar con autenticación
curl -v http://localhost:3000/api/containers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"

# Ver headers de respuesta
curl -I http://localhost:3000/healthz

# Debug de WebSocket
wscat -c ws://localhost:3000/ws/containers/abc123/logs \
  -H "Authorization: Bearer $TOKEN"
```

### Inspeccionar Base de Datos

```bash
# Conectar a SQLite (el contenedor incluye sqlite3)
docker exec -it dockpilot-api-gateway sqlite3 /data/dockpilot.db

# Comandos SQLite
.tables                    # Listar tablas (meta, users, audit_logs)
.schema users             # Ver esquema
SELECT id, username, role FROM users;      # Ver usuarios
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;  # Ver logs
.exit                     # Salir
```

---

## ❓ FAQ

### ¿Puedo cambiar el puerto después de instalar?

```bash
# Sí, editar .env
API_PORT=8080

# O docker-compose.yml
ports:
  - "8080:3000"

# Reiniciar
docker-compose up -d
```

### ¿Cómo actualizo DockPilot?

```bash
# Método automático
./scripts/update.sh

# Manual
docker-compose down
docker-compose pull
docker-compose up -d
```

### ¿Puedo usar DockPilot con Docker Swarm?

```bash
# Sí, pero con algunas limitaciones
docker stack deploy -c docker-compose.yml dockpilot

# Nota: Algunas funciones como WebSockets requieren configuración adicional
```

### ¿Cómo hago backup?

```bash
# Script incluido
./scripts/backup.sh

# Manual
tar -czf backup-$(date +%Y%m%d).tar.gz data/ config/ docker-compose.yml .env
```

### ¿Cómo migro de db.json a SQLite?

Si tienes una instalación anterior que usaba `db.json`, la migración es automática. Al arrancar, si existe `db.json` en `{DATA_DIR}` y no hay datos en SQLite, se importan usuarios y logs de auditoría. No hace falta hacer nada manualmente.

### ¿Puedo usar PostgreSQL en lugar de SQLite?

Actualmente DockPilot usa SQLite (`better-sqlite3`) para el API Gateway. No hay soporte para PostgreSQL en esta versión. Para volúmenes grandes o múltiples instancias, considera ejecutar una sola instancia del API Gateway.

### ¿Cómo desinstalo completamente?

```bash
# Usar script
./scripts/uninstall.sh

# O manual
docker-compose down -v  # -v elimina volúmenes
rm -rf /data/dockpilot
```

### ¿DockPilot es seguro para producción?

- Usa HTTPS/TLS
- Configura JWT_SECRET seguro
- Habilita rate limiting
- Usa contraseñas fuertes
- Mantén actualizado
- Configura backups
- Lee [security.md](security.md)

### ¿Puedo contribuir al proyecto?

¡Sí! Ver [development.md](development.md) para guías de contribución.

### ¿Dónde reporto bugs?

- GitHub Issues: https://github.com/dockpilot/dockpilot/issues
- Incluye logs y pasos para reproducir

---

## 📞 Soporte

Si el problema persiste:

1. Recolectar información:
   - Versión de DockPilot
   - Versión de Docker
   - Logs de error
   - Configuración (sin secrets)

2. Crear issue en GitHub con:
   - Descripción del problema
   - Pasos para reproducir
   - Logs relevantes
   - Sistema operativo

3. Únete a nuestra comunidad:
   - Discord: https://discord.gg/dockpilot
   - Discussions: https://github.com/dockpilot/dockpilot/discussions
