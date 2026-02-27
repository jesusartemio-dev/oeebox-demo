# OEE Box — Guía de Instalación

## Requisitos Previos

| Requisito | Windows | Linux |
|-----------|---------|-------|
| **OS** | Windows 10/11 Pro o Server 2019+ | Ubuntu 20.04+, Debian 11+, RHEL/Rocky 8+ |
| **RAM** | 4 GB mínimo (8 GB recomendado) | 4 GB mínimo (8 GB recomendado) |
| **Disco** | 10 GB libres | 10 GB libres |
| **Docker** | Docker Desktop (se instala automáticamente) | Docker Engine + Compose plugin (se instala automáticamente) |
| **Red** | Acceso a la red de PLCs | Acceso a la red de PLCs |
| **Permisos** | Administrador | root (sudo) |

## Instalación Rápida

### Windows

```powershell
# Abrir PowerShell como Administrador
cd ruta\al\proyecto\install
.\install-windows.ps1
```

### Linux

```bash
sudo bash install/install-linux.sh
```

## ¿Qué hace el instalador?

Ambos scripts ejecutan los mismos 8 pasos:

| Paso | Descripción |
|------|-------------|
| 1 | Verificar e instalar Docker si no existe |
| 2 | Copiar el proyecto al directorio de instalación (`C:\oeebox` o `/opt/oeebox`) |
| 3 | Configurar variables de entorno (nombre de planta, empresa, passwords aleatorios) |
| 4 | Construir imágenes Docker y levantar servicios (PostgreSQL + Backend) |
| 5 | Ejecutar migración de base de datos |
| 6 | Obtener Machine ID e instalar licencia (opcional) |
| 7 | Configurar inicio automático (Task Scheduler en Windows, systemd en Linux) |
| 8 | Configurar Chrome en modo kiosko para pantalla Andon (opcional) |

## Después de la Instalación

### Acceso Web

| URL | Descripción |
|-----|-------------|
| `http://localhost:3000` | Dashboard principal |
| `http://localhost:3000/andon` | Pantalla Andon (todas las workcells) |
| `http://localhost:3000/andon/WC01` | Pantalla Andon (workcell específica) |

### Credenciales por Defecto

- **Usuario:** `admin`
- **Password:** `admin123`

> Cambia la contraseña del administrador después del primer inicio de sesión.

### Servicios

**Windows (PowerShell como Admin):**

```powershell
cd C:\oeebox
docker compose ps          # Ver estado
docker compose logs -f     # Ver logs en vivo
docker compose restart     # Reiniciar
docker compose down        # Detener
docker compose up -d       # Iniciar
```

**Linux:**

```bash
systemctl status oeebox      # Ver estado del servicio
systemctl restart oeebox     # Reiniciar
systemctl stop oeebox        # Detener
cd /opt/oeebox && docker compose logs -f  # Ver logs
```

## Licencia

OEE Box requiere una licencia válida para operaciones de escritura (registrar paros, clasificar eventos, cerrar paros). Sin licencia, el sistema funciona en **modo lectura**.

### Obtener Licencia

1. Ejecuta el instalador — el **Machine ID** se mostrará al final
2. Envía el Machine ID a GYS Automation:
   - **Email:** licencias@gysautomation.com
3. Recibirás un archivo `license.key`

### Instalar Licencia

Copia el archivo al directorio del backend y reinicia:

**Windows:**
```powershell
copy license.key C:\oeebox\backend\license.key
cd C:\oeebox
docker compose restart backend
```

**Linux:**
```bash
cp license.key /opt/oeebox/backend/license.key
cd /opt/oeebox && docker compose restart backend
```

### Obtener Machine ID Manualmente

```bash
cd /opt/oeebox  # o C:\oeebox en Windows
docker compose run --rm backend node src/license/get-machine-id.js
```

## Configuración de PLCs

Después de instalar, configura tus workcells desde el Dashboard:

1. Inicia sesión como `admin`
2. Ve a **Configuración**
3. Agrega una workcell con los datos de tu PLC:
   - **Protocolo:** Modbus TCP o EtherNet/IP
   - **IP del PLC**
   - **Dirección de registros** (según tu programa de PLC)

### Protocolos Soportados

| Protocolo | Puerto Default | PLCs Compatibles |
|-----------|---------------|------------------|
| Modbus TCP | 502 | Siemens, Schneider, ABB, genéricos |
| EtherNet/IP | 44818 | Allen-Bradley, Rockwell |

## Pantalla Andon (TV de Planta)

Para mostrar el Andon en una TV de planta:

1. Conecta una mini-PC (o Raspberry Pi) a la TV
2. Abre Chrome en modo kiosko: `http://<IP_SERVIDOR>:3000/andon`
3. El instalador crea un acceso directo y autostart automáticamente

### Modo Kiosko Manual

```bash
# Todas las workcells
google-chrome --kiosk --app=http://localhost:3000/andon

# Una workcell específica
google-chrome --kiosk --app=http://localhost:3000/andon/WC01
```

## Solución de Problemas

### Docker no inicia

```bash
# Linux
sudo systemctl start docker
sudo systemctl status docker

# Windows — reiniciar Docker Desktop desde la bandeja del sistema
```

### La base de datos no conecta

```bash
cd /opt/oeebox  # o C:\oeebox
docker compose logs db          # Ver logs de Postgres
docker compose restart db       # Reiniciar Postgres
docker compose restart backend  # Reiniciar backend después
```

### El backend no inicia

```bash
docker compose logs backend     # Revisar errores
```

Errores comunes:
- `ECONNREFUSED` → Postgres aún no está listo, espera unos segundos
- `License file not found` → Normal si no tienes licencia (modo lectura)
- `Invalid license` → Machine ID no coincide con la licencia

### Reinstalación

Ejecuta el instalador de nuevo. Te preguntará si deseas sobreescribir la instalación existente.

> **Nota:** Los datos de PostgreSQL se almacenan en `data/postgres/` dentro del directorio de instalación. Si sobreescribes, los datos se conservan porque el volumen Docker persiste.

## Estructura del Proyecto

```
oeebox/
├── backend/
│   ├── src/
│   │   ├── connectors/     # Modbus TCP, EtherNet/IP
│   │   ├── db/             # Pool, migración, schema
│   │   ├── license/        # Validador, generador
│   │   ├── routes/         # API REST
│   │   ├── simulator/      # Simulador de PLCs
│   │   ├── websocket/      # WebSocket server
│   │   └── index.js        # Entry point
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── src/
│   │   └── pages/          # Login, Dashboard, Config, Andon
│   ├── Dockerfile
│   └── vite.config.js
├── install/
│   ├── install-windows.ps1
│   ├── install-linux.sh
│   └── README.md
├── docker-compose.yml
└── .env                    # Variables de Postgres
```

---

**GYS Automation** — OEE Box v1.0
