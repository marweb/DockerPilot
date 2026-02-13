# 📡 Documentación de la API

Documentación completa de la API REST de DockPilot.

## 📋 Índice

- [Base URL](#base-url)
- [Autenticación](#autenticación)
- [Auth](#auth)
- [Containers](#containers)
- [Images](#images)
- [Volumes](#volumes)
- [Networks](#networks)
- [Builds](#builds)
- [Compose](#compose)
- [Tunnels](#tunnels)
- [System](#system)

## 🌐 Base URL

```
http://localhost:3000/api
```

> Nota: la API actual del código usa prefijo `/api` (no `/api/v1`).

### Headers por defecto

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>
```

## 🔐 Autenticación

DockPilot usa JWT (JSON Web Tokens) para autenticación.

### Obtener Token

```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "tu-password"
}
```

**Respuesta exitosa (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Error (401 Unauthorized):**

```json
{
  "error": "Invalid credentials",
  "code": "AUTH_INVALID_CREDENTIALS"
}
```

### Usar Token

Incluye el token en el header de todas las peticiones:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## 🔑 Auth

Endpoints para autenticación y gestión de sesiones.

### POST /auth/login

Autentica un usuario y devuelve tokens JWT.

**Parámetros:**

| Nombre   | Tipo   | Requerido | Descripción       |
| -------- | ------ | --------- | ----------------- |
| username | string | Sí        | Nombre de usuario |
| password | string | Sí        | Contraseña        |

**Ejemplo Request:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "securepassword123"
  }'
```

**Respuesta exitosa (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### POST /auth/logout

Cierra la sesión actual.

**Headers:**

```http
Authorization: Bearer <token>
```

**Respuesta (200 OK):**

```json
{
  "message": "Logout successful"
}
```

### POST /auth/setup

Configuración inicial (primer uso).

**Ejemplo Request:**

```bash
curl -X POST http://localhost:3000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "securepassword123",
    "email": "admin@example.com"
  }'
```

---

## 🐳 Containers

Gestión completa de contenedores Docker.

### GET /containers

Lista todos los contenedores.

**Query Parameters:**

| Nombre | Tipo    | Default | Descripción                    |
| ------ | ------- | ------- | ------------------------------ |
| all    | boolean | false   | Incluir contenedores detenidos |
| status | string  | -       | Filtrar por estado             |
| label  | string  | -       | Filtrar por label              |
| limit  | integer | -       | Limitar resultados             |

**Ejemplo Request:**

```bash
curl -X GET "http://localhost:3000/api/containers?all=true" \
  -H "Authorization: Bearer <token>"
```

**Respuesta (200 OK):**

```json
[
  {
    "id": "abc123def456",
    "names": ["/nginx"],
    "image": "nginx:latest",
    "image_id": "sha256:abc...",
    "command": "nginx -g 'daemon off;'",
    "created": 1644501234,
    "state": "running",
    "status": "Up 2 hours",
    "ports": [
      {
        "private_port": 80,
        "public_port": 8080,
        "type": "tcp"
      }
    ],
    "labels": {
      "app": "web"
    },
    "size_rw": 12345,
    "size_root_fs": 987654321,
    "host_config": {
      "network_mode": "bridge"
    },
    "network_settings": {
      "networks": {
        "bridge": {
          "ip_address": "172.17.0.2"
        }
      }
    },
    "mounts": []
  }
]
```

### GET /containers/:id

Obtiene detalles de un contenedor específico.

**Ejemplo Request:**

```bash
curl -X GET http://localhost:3000/api/containers/abc123def456 \
  -H "Authorization: Bearer <token>"
```

**Respuesta (200 OK):**

```json
{
  "id": "abc123def456",
  "name": "nginx",
  "image": "nginx:latest",
  "state": {
    "status": "running",
    "running": true,
    "paused": false,
    "restarting": false,
    "oom_killed": false,
    "dead": false,
    "pid": 1234,
    "exit_code": 0,
    "error": "",
    "started_at": "2026-02-11T10:00:00Z",
    "finished_at": "0001-01-01T00:00:00Z"
  },
  "config": {
    "hostname": "abc123def456",
    "domainname": "",
    "user": "",
    "attach_stdin": false,
    "attach_stdout": true,
    "attach_stderr": true,
    "tty": false,
    "open_stdin": false,
    "stdin_once": false,
    "env": [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "NGINX_VERSION=1.21.0"
    ],
    "cmd": ["nginx", "-g", "daemon off;"],
    "image": "nginx:latest",
    "volumes": null,
    "working_dir": "",
    "entrypoint": null,
    "on_build": null,
    "labels": {}
  },
  "host_config": {
    "cpu_shares": 0,
    "memory": 0,
    "memory_swap": 0,
    "memory_reservation": 0,
    "kernel_memory": 0,
    "cpu_count": 0,
    "cpu_percent": 0,
    "io_maximum_iops": 0,
    "io_maximum_bandwidth": 0
  }
}
```

### POST /containers

Crea un nuevo contenedor.

**Body Parameters:**

| Nombre    | Tipo   | Requerido | Descripción               |
| --------- | ------ | --------- | ------------------------- |
| image     | string | Sí        | Nombre de la imagen       |
| name      | string | No        | Nombre del contenedor     |
| cmd       | array  | No        | Comando a ejecutar        |
| env       | array  | No        | Variables de entorno      |
| ports     | array  | No        | Mapeo de puertos          |
| volumes   | array  | No        | Volúmenes                 |
| network   | string | No        | Red a usar                |
| labels    | object | No        | Labels                    |
| restart   | string | No        | Política de reinicio      |
| memory    | int    | No        | Límite de memoria (bytes) |
| cpu_quota | int    | No        | Cuota de CPU              |

**Ejemplo Request:**

```bash
curl -X POST http://localhost:3000/api/containers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:latest",
    "name": "my-nginx",
    "ports": [
      {
        "host_port": 8080,
        "container_port": 80,
        "protocol": "tcp"
      }
    ],
    "env": [
      "NGINX_HOST=example.com"
    ],
    "volumes": [
      {
        "host_path": "/data/nginx",
        "container_path": "/usr/share/nginx/html",
        "mode": "rw"
      }
    ],
    "restart": "unless-stopped"
  }'
```

**Respuesta (201 Created):**

```json
{
  "id": "def789ghi012",
  "warnings": []
}
```

### POST /containers/:id/start

Inicia un contenedor.

```bash
curl -X POST http://localhost:3000/api/containers/abc123/start \
  -H "Authorization: Bearer <token>"
```

**Respuesta (204 No Content)**

### POST /containers/:id/stop

Detiene un contenedor.

**Query Parameters:**

| Nombre  | Tipo    | Default | Descripción              |
| ------- | ------- | ------- | ------------------------ |
| timeout | integer | 10      | Segundos antes de forzar |

```bash
curl -X POST "http://localhost:3000/api/containers/abc123/stop?timeout=30" \
  -H "Authorization: Bearer <token>"
```

### POST /containers/:id/restart

Reinicia un contenedor.

### POST /containers/:id/pause

Pausa un contenedor.

### POST /containers/:id/unpause

Reanuda un contenedor pausado.

### DELETE /containers/:id

Elimina un contenedor.

**Query Parameters:**

| Nombre  | Tipo    | Default | Descripción                  |
| ------- | ------- | ------- | ---------------------------- |
| force   | boolean | false   | Forzar eliminación           |
| volumes | boolean | false   | Eliminar volúmenes asociados |

```bash
curl -X DELETE "http://localhost:3000/api/containers/abc123?force=true" \
  -H "Authorization: Bearer <token>"
```

### GET /containers/:id/logs

Obtiene logs de un contenedor.

**Query Parameters:**

| Nombre     | Tipo    | Default | Descripción                |
| ---------- | ------- | ------- | -------------------------- |
| stdout     | boolean | true    | Incluir stdout             |
| stderr     | boolean | true    | Incluir stderr             |
| since      | integer | 0       | Timestamp UNIX desde       |
| until      | integer | 0       | Timestamp UNIX hasta       |
| tail       | integer | 100     | Número de líneas           |
| timestamps | boolean | false   | Incluir timestamps         |
| follow     | boolean | false   | Seguir en tiempo real (WS) |

```bash
curl -X GET "http://localhost:3000/api/containers/abc123/logs?tail=50&timestamps=true" \
  -H "Authorization: Bearer <token>"
```

**Respuesta (200 OK):**

```json
{
  "logs": "2026-02-11T10:00:00Z Starting nginx...\n2026-02-11T10:00:01Z Ready"
}
```

### GET /containers/:id/stats

Obtiene estadísticas de un contenedor.

```bash
curl -X GET http://localhost:3000/api/containers/abc123/stats \
  -H "Authorization: Bearer <token>"
```

**Respuesta (200 OK):**

```json
{
  "cpu_stats": {
    "cpu_usage": {
      "total_usage": 123456789,
      "usage_in_kernelmode": 12345678,
      "usage_in_usermode": 111111111
    },
    "system_cpu_usage": 9876543210,
    "online_cpus": 4,
    "throttling_data": {
      "periods": 0,
      "throttled_periods": 0,
      "throttled_time": 0
    }
  },
  "memory_stats": {
    "usage": 134217728,
    "max_usage": 167772160,
    "limit": 2147483648,
    "stats": {
      "active_anon": 134217728,
      "active_file": 0
    }
  },
  "pids_stats": {
    "current": 5
  },
  "networks": {
    "eth0": {
      "rx_bytes": 123456,
      "rx_packets": 1234,
      "rx_errors": 0,
      "rx_dropped": 0,
      "tx_bytes": 654321,
      "tx_packets": 4321,
      "tx_errors": 0,
      "tx_dropped": 0
    }
  }
}
```

### WebSocket /ws/containers/:id/logs

Streaming de logs en tiempo real.

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/containers/abc123/logs', [], {
  headers: {
    Authorization: 'Bearer ' + token,
  },
});

ws.onmessage = (event) => {
  console.log('Log:', event.data);
};
```

---

## 🖼️ Images

### GET /images

Lista todas las imágenes.

**Query Parameters:**

| Nombre   | Tipo    | Default | Descripción            |
| -------- | ------- | ------- | ---------------------- |
| all      | boolean | false   | Incluir intermedias    |
| dangling | boolean | false   | Solo imágenes dangling |
| label    | string  | -       | Filtrar por label      |

**Respuesta (200 OK):**

```json
[
  {
    "id": "sha256:abc123...",
    "repo_tags": ["nginx:latest"],
    "repo_digests": ["nginx@sha256:def456..."],
    "parent_id": "",
    "comment": "",
    "created": 1644501234,
    "container": "",
    "container_config": {},
    "docker_version": "20.10.12",
    "author": "",
    "config": {},
    "architecture": "amd64",
    "os": "linux",
    "size": 133456789,
    "virtual_size": 133456789,
    "graph_driver": {},
    "root_fs": {},
    "metadata": {}
  }
]
```

### POST /images/pull

Descarga una imagen desde un registro.

**Body Parameters:**

| Nombre   | Tipo   | Requerido | Descripción           |
| -------- | ------ | --------- | --------------------- |
| image    | string | Sí        | Nombre de la imagen   |
| tag      | string | No        | Tag (default: latest) |
| registry | string | No        | URL del registro      |
| username | string | No        | Usuario para auth     |
| password | string | No        | Password para auth    |

```bash
curl -X POST http://localhost:3000/api/images/pull \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx",
    "tag": "1.21-alpine"
  }'
```

### DELETE /images/:id

Elimina una imagen.

**Query Parameters:**

| Nombre  | Tipo    | Default | Descripción                |
| ------- | ------- | ------- | -------------------------- |
| force   | boolean | false   | Forzar eliminación         |
| noprune | boolean | false   | No eliminar padres sin tag |

### POST /images/prune

Elimina imágenes no utilizadas.

**Body Parameters:**

| Nombre   | Tipo    | Default | Descripción          |
| -------- | ------- | ------- | -------------------- |
| dangling | boolean | true    | Solo dangling        |
| until    | string  | -       | Eliminar hasta fecha |
| label    | object  | -       | Filtrar por label    |

**Respuesta (200 OK):**

```json
{
  "images_deleted": [{ "deleted": "sha256:abc123..." }, { "untagged": "nginx:old" }],
  "space_reclaimed": 133456789
}
```

### POST /images/build

Construye una imagen desde un Dockerfile.

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Nombre     | Tipo    | Requerido | Descripción                |
| ---------- | ------- | --------- | -------------------------- |
| dockerfile | file    | Sí        | Archivo Dockerfile         |
| context    | file    | No        | Contexto de build (tar.gz) |
| tag        | string  | No        | Tag para la imagen         |
| buildargs  | string  | No        | Argumentos de build (JSON) |
| nocache    | boolean | No        | No usar cache              |

```bash
curl -X POST http://localhost:3000/api/images/build \
  -H "Authorization: Bearer <token>" \
  -F "dockerfile=@./Dockerfile" \
  -F "context=@./context.tar.gz" \
  -F "tag=myapp:latest"
```

---

## 💾 Volumes

### GET /volumes

Lista todos los volúmenes.

**Query Parameters:**

| Nombre  | Tipo   | Descripción  |
| ------- | ------ | ------------ |
| filters | string | Filtros JSON |

**Respuesta (200 OK):**

```json
{
  "volumes": [
    {
      "name": "my-volume",
      "driver": "local",
      "mountpoint": "/var/lib/docker/volumes/my-volume/_data",
      "created_at": "2026-02-11T10:00:00Z",
      "labels": {},
      "scope": "local",
      "options": null,
      "usage_data": {
        "size": 123456,
        "ref_count": 1
      }
    }
  ],
  "warnings": []
}
```

### POST /volumes

Crea un nuevo volumen.

**Body Parameters:**

| Nombre      | Tipo   | Requerido | Descripción             |
| ----------- | ------ | --------- | ----------------------- |
| name        | string | Sí        | Nombre del volumen      |
| driver      | string | No        | Driver (default: local) |
| driver_opts | object | No        | Opciones del driver     |
| labels      | object | No        | Labels                  |

```bash
curl -X POST http://localhost:3000/api/volumes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app-data",
    "driver": "local",
    "labels": {
      "app": "myapp"
    }
  }'
```

### GET /volumes/:name

Obtiene detalles de un volumen.

### DELETE /volumes/:name

Elimina un volumen.

**Query Parameters:**

| Nombre | Tipo    | Default | Descripción        |
| ------ | ------- | ------- | ------------------ |
| force  | boolean | false   | Forzar eliminación |

### POST /volumes/prune

Elimina volúmenes no utilizados.

---

## 🌐 Networks

### GET /networks

Lista todas las redes.

**Respuesta (200 OK):**

```json
[
  {
    "name": "bridge",
    "id": "abc123...",
    "created": "2026-02-11T10:00:00Z",
    "scope": "local",
    "driver": "bridge",
    "enable_ipv6": false,
    "internal": false,
    "attachable": false,
    "ingress": false,
    "ipam": {
      "driver": "default",
      "config": [
        {
          "subnet": "172.17.0.0/16",
          "gateway": "172.17.0.1"
        }
      ]
    },
    "containers": {}
  }
]
```

### POST /networks

Crea una nueva red.

**Body Parameters:**

| Nombre      | Tipo    | Requerido | Descripción              |
| ----------- | ------- | --------- | ------------------------ |
| name        | string  | Sí        | Nombre de la red         |
| driver      | string  | No        | Driver (default: bridge) |
| internal    | boolean | No        | Red interna              |
| attachable  | boolean | No        | Permitir attach manual   |
| ingress     | boolean | No        | Red de ingress (swarm)   |
| ipam        | object  | No        | Configuración IPAM       |
| enable_ipv6 | boolean | No        | Habilitar IPv6           |
| labels      | object  | No        | Labels                   |

```bash
curl -X POST http://localhost:3000/api/networks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app-network",
    "driver": "bridge",
    "ipam": {
      "config": [{
        "subnet": "172.20.0.0/16",
        "gateway": "172.20.0.1"
      }]
    }
  }'
```

### DELETE /networks/:id

Elimina una red.

---

## 🔨 Builds

### POST /builds

Construye una imagen (alias de POST /images/build).

### GET /builds

Historial de builds.

**Respuesta (200 OK):**

```json
[
  {
    "id": "build-001",
    "image": "myapp:latest",
    "status": "success",
    "started_at": "2026-02-11T10:00:00Z",
    "completed_at": "2026-02-11T10:05:00Z",
    "duration": 300,
    "size": 123456789
  }
]
```

### GET /builds/:id/logs

Logs de un build.

```json
{
  "logs": [
    { "stream": "Step 1/5 : FROM node:16-alpine" },
    { "stream": " ---> abc123" },
    { "stream": "Step 2/5 : WORKDIR /app" },
    { "stream": " ---> Running in def456" },
    { "stream": " ---> 789ghi" },
    { "stream": "Successfully built 789ghi" }
  ]
}
```

---

## 📝 Compose

Gestión de proyectos Docker Compose.

### POST /compose/up

Inicia servicios definidos en un archivo compose.

**Body Parameters:**

| Nombre  | Tipo    | Requerido | Descripción                   |
| ------- | ------- | --------- | ----------------------------- |
| name    | string  | Sí        | Nombre del proyecto           |
| content | string  | Sí        | Contenido YAML del compose    |
| env     | object  | No        | Variables de entorno          |
| detach  | boolean | No        | Modo detached (default: true) |
| build   | boolean | No        | Build antes de iniciar        |

```bash
curl -X POST http://localhost:3000/api/compose/up \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "content": "version: \"3\"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - \"8080:80\"",
    "env": {
      "NGINX_VERSION": "latest"
    }
  }'
```

### POST /compose/down

Detiene y elimina servicios.

**Body Parameters:**

| Nombre        | Tipo    | Default | Descripción                   |
| ------------- | ------- | ------- | ----------------------------- |
| name          | string  | Sí      | Nombre del proyecto           |
| volumes       | boolean | false   | Eliminar volúmenes            |
| remove_images | string  | -       | Eliminar imágenes (all/local) |

### GET /compose/logs

Obtiene logs de servicios compose.

**Query Parameters:**

| Nombre  | Tipo   | Default | Descripción         |
| ------- | ------ | ------- | ------------------- |
| project | string | -       | Nombre del proyecto |
| service | string | -       | Nombre del servicio |
| tail    | int    | 100     | Número de líneas    |

### GET /compose/ps

Lista contenedores de un proyecto.

### POST /compose/validate

Valida un archivo compose.

**Body Parameters:**

| Nombre  | Tipo   | Requerido | Descripción              |
| ------- | ------ | --------- | ------------------------ |
| content | string | Sí        | Contenido YAML a validar |

**Respuesta (200 OK):**

```json
{
  "valid": true,
  "errors": [],
  "warnings": ["service 'db' has no resource limits"]
}
```

---

## 🌐 Tunnels

Gestión de túneles Cloudflare.

### GET /tunnels

Lista todos los túneles.

**Respuesta (200 OK):**

```json
[
  {
    "id": "tunnel-001",
    "name": "my-app-tunnel",
    "subdomain": "my-app",
    "hostname": "my-app.example.com",
    "status": "active",
    "created_at": "2026-02-11T10:00:00Z",
    "updated_at": "2026-02-11T10:00:00Z",
    "container_id": "abc123",
    "container_port": 3000,
    "metrics": {
      "connections": 42,
      "bytes_transferred": 1234567
    }
  }
]
```

### POST /tunnels

Crea un nuevo túnel.

**Body Parameters:**

| Nombre         | Tipo    | Requerido | Descripción                |
| -------------- | ------- | --------- | -------------------------- |
| name           | string  | Sí        | Nombre del túnel           |
| subdomain      | string  | No        | Subdominio (auto-generado) |
| container_id   | string  | Sí        | ID del contenedor          |
| container_port | int     | Sí        | Puerto del contenedor      |
| auto_start     | boolean | No        | Iniciar automáticamente    |

```bash
curl -X POST http://localhost:3000/api/tunnels \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-tunnel",
    "subdomain": "my-web-app",
    "container_id": "abc123",
    "container_port": 3000,
    "auto_start": true
  }'
```

### GET /tunnels/:id

Obtiene detalles de un túnel.

### POST /tunnels/:id/start

Inicia un túnel.

### POST /tunnels/:id/stop

Detiene un túnel.

### DELETE /tunnels/:id

Elimina un túnel.

---

## ⚙️ System

### GET /info

Información del sistema Docker.

**Respuesta (200 OK):**

```json
{
  "id": "ABC123:DEF456",
  "containers": 5,
  "containers_running": 3,
  "containers_paused": 0,
  "containers_stopped": 2,
  "images": 15,
  "driver": "overlay2",
  "driver_status": [
    ["Backing Filesystem", "extfs"],
    ["Supports d_type", "true"]
  ],
  "system_status": null,
  "plugins": {
    "volume": ["local"],
    "network": ["bridge", "host", "none"],
    "authorization": null,
    "log": ["json-file", "syslog", "journald"]
  },
  "memory_limit": true,
  "swap_limit": true,
  "kernel_memory": true,
  "cpu_cfs_period": true,
  "cpu_cfs_quota": true,
  "cpu_shares": true,
  "cpu_set": true,
  "ipv4_forwarding": true,
  "bridge_nf_iptables": true,
  "bridge_nf_ip6tables": true,
  "debug": false,
  "nfds": 25,
  "oom_kill_disable": true,
  "ngoroutines": 38,
  "system_time": "2026-02-11T10:00:00Z",
  "logging_driver": "json-file",
  "cgroup_driver": "cgroupfs",
  "nevents_listener": 0,
  "kernel_version": "5.15.0",
  "operating_system": "Ubuntu 22.04.1 LTS",
  "os_type": "linux",
  "architecture": "x86_64",
  "index_server_address": "https://index.docker.io/v1/",
  "registry_config": {},
  "ncpu": 4,
  "mem_total": 8342466560,
  "docker_root_dir": "/var/lib/docker",
  "http_proxy": "",
  "https_proxy": "",
  "no_proxy": "",
  "name": "dockpilot-server",
  "labels": [],
  "experimental_build": false,
  "server_version": "20.10.12",
  "cluster_store": "",
  "cluster_advertise": "",
  "runtimes": {
    "runc": {
      "path": "runc"
    }
  },
  "default_runtime": "runc",
  "swarm": {
    "node_id": "",
    "node_addr": "",
    "local_node_state": "inactive",
    "control_available": false,
    "error": "",
    "remote_managers": null
  },
  "live_restore_enabled": false,
  "isolation": "",
  "init_binary": "docker-init",
  "containerd_commit": {},
  "runc_commit": {},
  "init_commit": {}
}
```

### GET /df

Uso de disco.

**Respuesta (200 OK):**

```json
{
  "layers_size": 1234567890,
  "images": [
    {
      "id": "sha256:abc...",
      "size": 133456789,
      "shared_size": 0,
      "virtual_size": 133456789
    }
  ],
  "containers": [
    {
      "id": "abc123",
      "names": ["/nginx"],
      "image": "nginx",
      "size_root_fs": 133456789,
      "size_rw": 12345
    }
  ],
  "volumes": [
    {
      "name": "my-volume",
      "driver": "local",
      "size": 123456
    }
  ],
  "build_cache": []
}
```

### POST /containers/prune

Limpia contenedores detenidos. Para imágenes/volúmenes/redes se usan endpoints específicos:

- `POST /images/prune`
- `POST /volumes/prune`
- `POST /networks/prune`

**Respuesta (200 OK):**

```json
{
  "success": true,
  "data": {
    "containersDeleted": ["abc123", "def456"],
    "spaceReclaimed": 987654321
  }
}
```

### Eventos Docker

Actualmente no hay endpoint REST dedicado para eventos en `docker-control`; para diagnóstico usar `docker events` en el host.

### GET /healthz

Health check.

**Respuesta (200 OK):**

```json
{
  "status": "healthy",
  "version": "1.0.20"
}
```

---

## ❌ Códigos de Error

| Código | Nombre                | Descripción            |
| ------ | --------------------- | ---------------------- |
| 400    | Bad Request           | Petición mal formada   |
| 401    | Unauthorized          | No autenticado         |
| 403    | Forbidden             | Sin permisos           |
| 404    | Not Found             | Recurso no encontrado  |
| 409    | Conflict              | Conflicto de estado    |
| 422    | Unprocessable Entity  | Validación fallida     |
| 429    | Too Many Requests     | Rate limit excedido    |
| 500    | Internal Server Error | Error interno          |
| 503    | Service Unavailable   | Servicio no disponible |

### Respuesta de Error

```json
{
  "error": {
    "code": "CONTAINER_NOT_FOUND",
    "message": "Container with id 'abc123' not found",
    "details": {
      "container_id": "abc123"
    },
    "timestamp": "2026-02-11T10:00:00Z"
  }
}
```

### Códigos de Error Comunes

| Código                        | HTTP | Descripción                   |
| ----------------------------- | ---- | ----------------------------- |
| AUTH_INVALID_CREDENTIALS      | 401  | Credenciales inválidas        |
| AUTH_TOKEN_EXPIRED            | 401  | Token expirado                |
| AUTH_INSUFFICIENT_PERMISSIONS | 403  | Permisos insuficientes        |
| CONTAINER_NOT_FOUND           | 404  | Contenedor no encontrado      |
| CONTAINER_ALREADY_RUNNING     | 409  | Contenedor ya está corriendo  |
| CONTAINER_NOT_RUNNING         | 409  | Contenedor no está corriendo  |
| IMAGE_NOT_FOUND               | 404  | Imagen no encontrada          |
| IMAGE_PULL_FAILED             | 400  | Falló al descargar imagen     |
| VOLUME_IN_USE                 | 409  | Volumen en uso                |
| NETWORK_IN_USE                | 409  | Red en uso                    |
| DOCKER_CONNECTION_ERROR       | 503  | No se puede conectar a Docker |
| RATE_LIMIT_EXCEEDED           | 429  | Límite de peticiones excedido |

---

## 📚 Ejemplos Completos

### Crear y configurar un stack completo

```bash
#!/bin/bash

API="http://localhost:3000/api"
TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.tokens.accessToken')

# 1. Crear red
curl -X POST "$API/networks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-network",
    "driver": "bridge"
  }'

# 2. Crear volumen
curl -X POST "$API/volumes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-data",
    "driver": "local"
  }'

# 3. Descargar imagen
curl -X POST "$API/images/pull" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx",
    "tag": "alpine"
  }'

# 4. Crear contenedor
curl -X POST "$API/containers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "name": "my-app",
    "ports": [{"host_port": 8080, "container_port": 80}],
    "volumes": [{"name": "app-data", "container_path": "/usr/share/nginx/html"}],
    "network": "app-network"
  }'

# 5. Iniciar contenedor
curl -X POST "$API/containers/my-app/start" \
  -H "Authorization: Bearer $TOKEN"

# 6. Crear túnel
curl -X POST "$API/tunnels" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-tunnel",
    "subdomain": "my-app",
    "container_id": "my-app",
    "container_port": 80
  }'

echo "Stack creado exitosamente!"
```

### Monitoreo continuo con WebSocket

```javascript
const WebSocket = require('ws');

const token = 'your-jwt-token';
const ws = new WebSocket(`ws://localhost:3000/ws/containers/my-app/logs`, {
  headers: { Authorization: `Bearer ${token}` },
});

ws.on('open', () => {
  console.log('Connected to container logs');
});

ws.on('message', (data) => {
  console.log(`[LOG] ${data}`);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from logs');
});
```
