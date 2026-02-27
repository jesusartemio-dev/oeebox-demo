# ═══════════════════════════════════════════════════════════
# OEE Box — Instalador Windows v1.0
# GYS Automation
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# ── PASO 1: Verificar prerequisitos ───────────────────────

# Verificar que corre como Administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ""
    Write-Host "  ERROR: Ejecuta este script como Administrador." -ForegroundColor Red
    Write-Host "  Click derecho > 'Ejecutar como administrador'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}

Clear-Host
Write-Host ""
Write-Host "  +==============================================+" -ForegroundColor Cyan
Write-Host "  |       OEE Box  --  Instalador v1.0          |" -ForegroundColor Cyan
Write-Host "  |       GYS Automation                        |" -ForegroundColor Cyan
Write-Host "  +==============================================+" -ForegroundColor Cyan
Write-Host ""

# ── PASO 2: Verificar/Instalar Docker ────────────────────

Write-Host "[1/8] Verificando Docker..." -ForegroundColor Yellow

$dockerInstalled = $false
try {
    $null = Get-Command docker -ErrorAction Stop
    $dockerInstalled = $true
} catch {
    $dockerInstalled = $false
}

if (-not $dockerInstalled) {
    Write-Host "  Docker no encontrado. Descargando Docker Desktop..." -ForegroundColor Yellow

    $dockerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
    $dockerInstaller = "$env:TEMP\DockerDesktopInstaller.exe"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $dockerUrl -OutFile $dockerInstaller -UseBasicParsing
    } catch {
        Write-Host "  ERROR: No se pudo descargar Docker Desktop." -ForegroundColor Red
        Write-Host "  Descargalo manualmente desde: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir"
        exit 1
    }

    Write-Host "  Instalando Docker Desktop (esto puede tardar unos minutos)..." -ForegroundColor Yellow
    Start-Process -FilePath $dockerInstaller -ArgumentList "install", "--quiet", "--accept-license" -Wait

    Write-Host ""
    Write-Host "  Docker Desktop instalado." -ForegroundColor Green
    Write-Host "  IMPORTANTE: Reinicia tu computadora y ejecuta este script de nuevo." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 0
}

# Verificar si Docker daemon esta corriendo
$dockerRunning = $false
try {
    $null = docker info 2>$null
    $dockerRunning = $true
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-Host "  Docker no esta corriendo. Iniciando Docker Desktop..." -ForegroundColor Yellow

    $dockerDesktopPath = $null
    $possiblePaths = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    )
    foreach ($p in $possiblePaths) {
        if (Test-Path $p) { $dockerDesktopPath = $p; break }
    }

    if ($dockerDesktopPath) {
        Start-Process $dockerDesktopPath
    } else {
        Start-Process "Docker Desktop" -ErrorAction SilentlyContinue
    }

    Write-Host "  Esperando a que Docker inicie (30 segundos)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30

    # Verificar de nuevo
    try {
        $null = docker info 2>$null
    } catch {
        Write-Host "  ERROR: Docker no logro iniciar. Abre Docker Desktop manualmente y ejecuta este script de nuevo." -ForegroundColor Red
        Read-Host "Presiona Enter para salir"
        exit 1
    }
}

Write-Host "  Docker OK" -ForegroundColor Green

# ── PASO 3: Copiar proyecto ──────────────────────────────

Write-Host ""
Write-Host "[2/8] Configurando directorio de instalacion..." -ForegroundColor Yellow

$defaultPath = "C:\OEEBox"
$installPath = Read-Host "  Directorio de instalacion (default: $defaultPath)"
if ([string]::IsNullOrWhiteSpace($installPath)) {
    $installPath = $defaultPath
}

if (Test-Path $installPath) {
    $overwrite = Read-Host "  '$installPath' ya existe. Sobreescribir? (s/N)"
    if ($overwrite -ne "s" -and $overwrite -ne "S") {
        Write-Host "  Instalacion cancelada." -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir"
        exit 0
    }
    Write-Host "  Limpiando instalacion anterior..." -ForegroundColor Yellow
    # Detener contenedores existentes si hay
    Push-Location $installPath
    try { docker compose down 2>$null } catch {}
    Pop-Location
}

# El script esta en install/ — el proyecto esta un nivel arriba
$scriptDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$scriptDir\docker-compose.yml")) {
    # Si se ejecuto directamente desde install/
    $scriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
    if (-not (Test-Path "$scriptDir\docker-compose.yml")) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $scriptDir = Split-Path -Parent $scriptDir
    }
}

Write-Host "  Copiando archivos a '$installPath'..." -ForegroundColor Yellow
if (-not (Test-Path $installPath)) {
    New-Item -ItemType Directory -Path $installPath -Force | Out-Null
}

# Copiar excluyendo node_modules, data, .git
$excludeDirs = @("node_modules", ".git", "data", "dist")
$source = $scriptDir

function Copy-FilteredDirectory {
    param([string]$Source, [string]$Destination, [string[]]$ExcludeDirs)

    if (-not (Test-Path $Destination)) {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }

    Get-ChildItem -Path $Source -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            if ($ExcludeDirs -notcontains $_.Name) {
                Copy-FilteredDirectory -Source $_.FullName -Destination (Join-Path $Destination $_.Name) -ExcludeDirs $ExcludeDirs
            }
        } else {
            Copy-Item -Path $_.FullName -Destination $Destination -Force
        }
    }
}

Copy-FilteredDirectory -Source $source -Destination $installPath -ExcludeDirs $excludeDirs

Write-Host "  Archivos copiados OK" -ForegroundColor Green

# ── PASO 4: Configurar variables de entorno ──────────────

Write-Host ""
Write-Host "[3/8] Configurando variables de entorno..." -ForegroundColor Yellow

$plantName = Read-Host "  Nombre de la planta"
if ([string]::IsNullOrWhiteSpace($plantName)) { $plantName = "Planta Principal" }

$companyName = Read-Host "  Nombre de la empresa"
if ([string]::IsNullOrWhiteSpace($companyName)) { $companyName = "Mi Empresa" }

# Generar passwords aleatorios
Add-Type -AssemblyName System.Web
$dbPassword = [System.Web.Security.Membership]::GeneratePassword(16, 2)
$jwtSecret = [System.Web.Security.Membership]::GeneratePassword(32, 4)

# Archivo .env raiz (para Docker Compose / Postgres)
$rootEnv = @"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$dbPassword
POSTGRES_DB=oeebox
"@
Set-Content -Path "$installPath\.env" -Value $rootEnv -Encoding UTF8

# Archivo backend/.env
$backendEnv = @"
PORT=3000
DATABASE_URL=postgresql://postgres:${dbPassword}@db:5432/oeebox
JWT_SECRET=$jwtSecret
NODE_ENV=production
ENABLE_SIMULATOR=false
ENABLE_MODBUS=true
LICENSE_FILE=./license.key
PLANT_NAME=$plantName
COMPANY_NAME=$companyName
"@
Set-Content -Path "$installPath\backend\.env" -Value $backendEnv -Encoding UTF8

Write-Host "  Variables de entorno configuradas OK" -ForegroundColor Green

# ── PASO 5: Levantar servicios ───────────────────────────

Write-Host ""
Write-Host "[4/8] Levantando servicios Docker..." -ForegroundColor Yellow

Push-Location $installPath

Write-Host "  Construyendo imagenes (primera vez toma unos minutos)..." -ForegroundColor Yellow
docker compose build --quiet 2>$null

Write-Host "  Iniciando base de datos..." -ForegroundColor Yellow
docker compose up -d db
Write-Host "  Esperando a que Postgres inicie (10 segundos)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "  Ejecutando migracion de base de datos..." -ForegroundColor Yellow
docker compose run --rm backend node src/db/migrate.js

Write-Host "  Iniciando todos los servicios..." -ForegroundColor Yellow
docker compose up -d

Start-Sleep -Seconds 5

# Verificar contenedores
$containers = docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>$null
Write-Host ""
Write-Host "  Contenedores:" -ForegroundColor Cyan
Write-Host $containers
Write-Host ""

Pop-Location

Write-Host "  Servicios levantados OK" -ForegroundColor Green

# ── PASO 6: Machine ID y licencia ────────────────────────

Write-Host ""
Write-Host "[5/8] Obteniendo Machine ID..." -ForegroundColor Yellow

Push-Location $installPath

$machineIdOutput = docker compose run --rm backend node src/license/get-machine-id.js 2>$null
# Extraer el machine ID (linea que contiene el hash)
$machineId = ($machineIdOutput | Select-String -Pattern "^  [a-f0-9]{64}$").ToString().Trim()
if ([string]::IsNullOrWhiteSpace($machineId)) {
    # Fallback: buscar cualquier linea con 64 hex chars
    $machineId = ($machineIdOutput | Select-String -Pattern "[a-f0-9]{64}").Matches[0].Value
}

Pop-Location

Write-Host ""
Write-Host "  +=============================================+" -ForegroundColor Cyan
Write-Host "  |  MACHINE ID:                                |" -ForegroundColor Cyan
Write-Host "  |  $machineId  |" -ForegroundColor White
Write-Host "  |                                             |" -ForegroundColor Cyan
Write-Host "  |  Envia este ID a GYS Automation para        |" -ForegroundColor Cyan
Write-Host "  |  generar tu licencia.                       |" -ForegroundColor Cyan
Write-Host "  |                                             |" -ForegroundColor Cyan
Write-Host "  |  WhatsApp: +52 XXX XXX XXXX                 |" -ForegroundColor Yellow
Write-Host "  |  Email: licencias@gysautomation.com         |" -ForegroundColor Yellow
Write-Host "  +=============================================+" -ForegroundColor Cyan
Write-Host ""

$licenseFile = Read-Host "  Ruta del archivo license.key (Enter para omitir)"
if (-not [string]::IsNullOrWhiteSpace($licenseFile)) {
    if (Test-Path $licenseFile) {
        Copy-Item -Path $licenseFile -Destination "$installPath\backend\license.key" -Force
        Write-Host "  Licencia instalada. Reiniciando backend..." -ForegroundColor Yellow
        Push-Location $installPath
        docker compose restart backend
        Pop-Location
        Write-Host "  Backend reiniciado con licencia OK" -ForegroundColor Green
    } else {
        Write-Host "  Archivo no encontrado: $licenseFile" -ForegroundColor Red
        Write-Host "  Puedes copiar el archivo manualmente luego a: $installPath\backend\license.key" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Sin licencia por ahora. El sistema iniciara en modo lectura." -ForegroundColor Yellow
    Write-Host "  Copia el archivo license.key a: $installPath\backend\license.key" -ForegroundColor Yellow
}

# ── PASO 7: Configurar inicio automatico ─────────────────

Write-Host ""
Write-Host "[6/8] Configurando inicio automatico..." -ForegroundColor Yellow

# Tarea para levantar contenedores al iniciar Windows
$taskAction = New-ScheduledTaskAction `
    -Execute "docker" `
    -Argument "compose -f `"$installPath\docker-compose.yml`" up -d" `
    -WorkingDirectory $installPath

$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Eliminar tarea existente si hay
Unregister-ScheduledTask -TaskName "OEEBox Startup" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName "OEEBox Startup" `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -Principal $taskPrincipal `
    -Description "Inicia OEE Box al arrancar Windows" | Out-Null

Write-Host "  Tarea 'OEEBox Startup' creada OK" -ForegroundColor Green

# ── PASO 8: Configurar Chrome kiosko ─────────────────────

Write-Host ""
Write-Host "[7/8] Configurando Chrome en modo kiosko..." -ForegroundColor Yellow

$chromePath = $null
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
foreach ($p in $chromePaths) {
    if (Test-Path $p) { $chromePath = $p; break }
}

if ($chromePath) {
    # Acceso directo en escritorio
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = "$desktopPath\OEE Box Dashboard.lnk"

    $WshShell = New-Object -comObject WScript.Shell
    $shortcut = $WshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $chromePath
    $shortcut.Arguments = "--kiosk --app=http://localhost:3000"
    $shortcut.Description = "OEE Box Dashboard"
    $shortcut.Save()

    Write-Host "  Acceso directo creado en el escritorio" -ForegroundColor Green

    # Tarea programada para abrir Chrome kiosko al iniciar sesion
    $kioskAction = New-ScheduledTaskAction `
        -Execute $chromePath `
        -Argument "--kiosk --app=http://localhost:3000/andon"

    $kioskTrigger = New-ScheduledTaskTrigger -AtLogOn
    $kioskTrigger.Delay = "PT15S"

    $kioskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    Unregister-ScheduledTask -TaskName "OEEBox Chrome Kiosk" -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask `
        -TaskName "OEEBox Chrome Kiosk" `
        -Action $kioskAction `
        -Trigger $kioskTrigger `
        -Settings $kioskSettings `
        -Description "Abre el Andon Board de OEE Box al iniciar sesion" | Out-Null

    Write-Host "  Tarea 'OEEBox Chrome Kiosk' creada OK (Andon al iniciar sesion)" -ForegroundColor Green
} else {
    Write-Host "  Chrome no encontrado. Instala Google Chrome para el modo kiosko." -ForegroundColor Yellow
    Write-Host "  Puedes abrir manualmente: http://localhost:3000/andon" -ForegroundColor Yellow
}

# ── PASO 9: Resumen final ────────────────────────────────

Write-Host ""
Write-Host ""
Write-Host "  +==============================================+" -ForegroundColor Green
Write-Host "  |   OEE Box instalado exitosamente!            |" -ForegroundColor Green
Write-Host "  +==============================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  Empresa:     $companyName" -ForegroundColor White
Write-Host "  Planta:      $plantName" -ForegroundColor White
Write-Host "  Instalado:   $installPath" -ForegroundColor White
Write-Host "  Machine ID:  $machineId" -ForegroundColor White
Write-Host ""
Write-Host "  URLs:" -ForegroundColor Cyan
Write-Host "    Dashboard:  http://localhost:3000" -ForegroundColor White
Write-Host "    Andon:      http://localhost:3000/andon" -ForegroundColor White
Write-Host ""
Write-Host "  Credenciales por defecto:" -ForegroundColor Cyan
Write-Host "    Usuario:    admin" -ForegroundColor White
Write-Host "    Password:   admin123" -ForegroundColor White
Write-Host ""
Write-Host "  Inicio automatico:" -ForegroundColor Cyan
Write-Host "    Docker:     OEEBox Startup (Task Scheduler)" -ForegroundColor White
Write-Host "    Chrome:     OEEBox Chrome Kiosk (Task Scheduler)" -ForegroundColor White
Write-Host ""
Write-Host "  Licencia:" -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($licenseFile) -and (Test-Path "$installPath\backend\license.key")) {
    Write-Host "    Instalada correctamente" -ForegroundColor Green
} else {
    Write-Host "    Modo lectura - copia license.key a:" -ForegroundColor Yellow
    Write-Host "    $installPath\backend\license.key" -ForegroundColor White
}
Write-Host ""
Write-Host "  +=============================================+" -ForegroundColor Green
Write-Host "  |  Reinicia la computadora para completar     |" -ForegroundColor Yellow
Write-Host "  |  la configuracion de inicio automatico.     |" -ForegroundColor Yellow
Write-Host "  +=============================================+" -ForegroundColor Green
Write-Host ""

Read-Host "Presiona Enter para finalizar"
