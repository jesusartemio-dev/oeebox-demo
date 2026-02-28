# OEE Box

Sistema de monitoreo OEE (Overall Equipment Effectiveness) industrial en tiempo real.

**Stack:** Node.js + Express + PostgreSQL + React + Vite + Tailwind CSS + WebSocket

## Demo en la nube (Railway)

### Variables de entorno requeridas en Railway

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Railway la genera automaticamente al agregar PostgreSQL | `postgresql://...` |
| `JWT_SECRET` | Secret para tokens de autenticacion | `mi-secret-seguro-123` |
| `NODE_ENV` | Debe ser `production` | `production` |
| `PORT` | Railway la asigna automaticamente | `3000` |
| `ENABLE_SIMULATOR` | Activar simulador de datos demo | `true` |
| `ENABLE_MODBUS` | Activar conectores PLC (desactivar en demo) | `false` |
| `PLANT_NAME` | Nombre de la planta mostrado en UI | `Demo OEE Box` |
| `COMPANY_NAME` | Nombre de la empresa mostrado en UI | `artemiodev.com` |

### Pasos para deploy en Railway

1. Crear proyecto en [railway.app](https://railway.app)
2. Agregar servicio **PostgreSQL** (Railway genera `DATABASE_URL` automaticamente)
3. Agregar servicio desde **GitHub repo**
4. Configurar las variables de entorno listadas arriba
5. Railway detecta `railway.toml` y usa el Dockerfile del backend
6. La migracion de base de datos se ejecuta al iniciar el backend
7. Acceder a la URL publica que Railway asigna

### Estructura del deploy

```
railway.toml          -> Configuracion de Railway
backend/Dockerfile    -> Imagen Docker del backend
backend/src/index.js  -> Entry point (escucha en 0.0.0.0:PORT)
```

## Desarrollo local

### Requisitos

- Node.js 18+
- PostgreSQL 14+ (o Docker)
- npm

### Instalacion rapida

```bash
# Backend
cd backend
cp .env.example .env   # Editar con tus valores
npm install
npm run migrate
npm start

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

### Docker Compose (alternativa)

```bash
docker compose up -d
```

## Acceso

| URL | Descripcion |
|-----|-------------|
| `/` | Dashboard principal |
| `/login` | Inicio de sesion |
| `/config` | Configuracion (solo admin) |
| `/andon` | Pantalla Andon (sin auth, para TVs de planta) |
| `/andon/:code` | Andon de una workcell especifica |

### Credenciales por defecto

- **Usuario:** `admin`
- **Password:** `admin123`

## Conectores PLC soportados

| Protocolo | Puerto | PLCs |
|-----------|--------|------|
| Modbus TCP | 502 | Siemens, Schneider, ABB |
| EtherNet/IP | 44818 | Allen-Bradley, Rockwell |
| OPC-UA | 4840 | Siemens S7-1200/1500 |

## Licencia

Sistema propietario. Requiere licencia valida para operaciones de escritura.
Sin licencia funciona en modo lectura.
