#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# OEE Box — Instalador Linux v1.0
# GYS Automation
# Compatible con: Ubuntu 20.04+, Debian 11+, RHEL/Rocky 8+
# ═══════════════════════════════════════════════════════════

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# ── PASO 1: Verificar prerequisitos ───────────────────────

if [ "$EUID" -ne 0 ]; then
    echo ""
    echo -e "${RED}  ERROR: Ejecuta este script como root.${NC}"
    echo -e "${YELLOW}  Usa: sudo bash install-linux.sh${NC}"
    echo ""
    exit 1
fi

clear
echo ""
echo -e "${CYAN}  +==============================================+${NC}"
echo -e "${CYAN}  |       OEE Box  --  Instalador v1.0          |${NC}"
echo -e "${CYAN}  |       GYS Automation                        |${NC}"
echo -e "${CYAN}  +==============================================+${NC}"
echo ""

# ── PASO 2: Verificar/Instalar Docker ────────────────────

echo -e "${YELLOW}[1/8] Verificando Docker...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "  ${YELLOW}Docker no encontrado. Instalando...${NC}"

    # Detectar distro
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
    else
        DISTRO="unknown"
    fi

    case "$DISTRO" in
        ubuntu|debian)
            apt-get update -qq
            apt-get install -y -qq ca-certificates curl gnupg lsb-release
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$DISTRO/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$DISTRO $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
            apt-get update -qq
            apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
        centos|rhel|rocky|almalinux|fedora)
            dnf install -y -q dnf-plugins-core
            dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || \
            dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
            ;;
        *)
            echo -e "  ${RED}Distro no soportada: $DISTRO${NC}"
            echo -e "  ${YELLOW}Instala Docker manualmente: https://docs.docker.com/engine/install/${NC}"
            exit 1
            ;;
    esac

    systemctl enable docker
    systemctl start docker
    echo -e "  ${GREEN}Docker instalado OK${NC}"
else
    # Verificar que el daemon esta corriendo
    if ! docker info &> /dev/null; then
        echo -e "  ${YELLOW}Iniciando Docker daemon...${NC}"
        systemctl start docker
        sleep 3
    fi
    echo -e "  ${GREEN}Docker OK${NC}"
fi

# Verificar docker compose
if ! docker compose version &> /dev/null; then
    echo -e "  ${RED}docker compose no disponible. Instalando plugin...${NC}"
    apt-get install -y -qq docker-compose-plugin 2>/dev/null || \
    dnf install -y -q docker-compose-plugin 2>/dev/null || {
        echo -e "  ${RED}No se pudo instalar docker compose. Instalalo manualmente.${NC}"
        exit 1
    }
fi

# ── PASO 3: Copiar proyecto ──────────────────────────────

echo ""
echo -e "${YELLOW}[2/8] Configurando directorio de instalacion...${NC}"

DEFAULT_PATH="/opt/oeebox"
read -p "  Directorio de instalacion (default: $DEFAULT_PATH): " INSTALL_PATH
INSTALL_PATH="${INSTALL_PATH:-$DEFAULT_PATH}"

if [ -d "$INSTALL_PATH" ]; then
    read -p "  '$INSTALL_PATH' ya existe. Sobreescribir? (s/N): " OVERWRITE
    if [ "$OVERWRITE" != "s" ] && [ "$OVERWRITE" != "S" ]; then
        echo -e "  ${YELLOW}Instalacion cancelada.${NC}"
        exit 0
    fi
    echo -e "  ${YELLOW}Deteniendo servicios existentes...${NC}"
    cd "$INSTALL_PATH" && docker compose down 2>/dev/null || true
fi

# El script esta en install/ — el proyecto esta un nivel arriba
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$SOURCE_DIR/docker-compose.yml" ]; then
    echo -e "  ${RED}No se encontro docker-compose.yml en $SOURCE_DIR${NC}"
    echo -e "  ${YELLOW}Asegurate de ejecutar este script desde la carpeta install/ del proyecto.${NC}"
    exit 1
fi

echo -e "  ${YELLOW}Copiando archivos a '$INSTALL_PATH'...${NC}"
mkdir -p "$INSTALL_PATH"

# Copiar excluyendo node_modules, .git, data
rsync -a --exclude='node_modules' --exclude='.git' --exclude='data' --exclude='dist' "$SOURCE_DIR/" "$INSTALL_PATH/" 2>/dev/null || {
    # Fallback si rsync no esta disponible
    cp -r "$SOURCE_DIR"/* "$INSTALL_PATH/" 2>/dev/null
    rm -rf "$INSTALL_PATH/node_modules" "$INSTALL_PATH/.git" "$INSTALL_PATH/data"
    rm -rf "$INSTALL_PATH/backend/node_modules" "$INSTALL_PATH/frontend/node_modules"
    rm -rf "$INSTALL_PATH/frontend/dist"
}

echo -e "  ${GREEN}Archivos copiados OK${NC}"

# ── PASO 4: Configurar variables de entorno ──────────────

echo ""
echo -e "${YELLOW}[3/8] Configurando variables de entorno...${NC}"

read -p "  Nombre de la planta: " PLANT_NAME
PLANT_NAME="${PLANT_NAME:-Planta Principal}"

read -p "  Nombre de la empresa: " COMPANY_NAME
COMPANY_NAME="${COMPANY_NAME:-Mi Empresa}"

# Generar passwords aleatorios
DB_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

# Archivo .env raiz (para Docker Compose / Postgres)
cat > "$INSTALL_PATH/.env" << EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=oeebox
EOF

# Archivo backend/.env
cat > "$INSTALL_PATH/backend/.env" << EOF
PORT=3000
DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@db:5432/oeebox
JWT_SECRET=$JWT_SECRET
NODE_ENV=production
ENABLE_SIMULATOR=false
ENABLE_MODBUS=true
LICENSE_FILE=./license.key
PLANT_NAME=$PLANT_NAME
COMPANY_NAME=$COMPANY_NAME
EOF

echo -e "  ${GREEN}Variables de entorno configuradas OK${NC}"

# ── PASO 5: Levantar servicios ───────────────────────────

echo ""
echo -e "${YELLOW}[4/8] Levantando servicios Docker...${NC}"

cd "$INSTALL_PATH"

echo -e "  ${YELLOW}Construyendo imagenes (primera vez toma unos minutos)...${NC}"
docker compose build --quiet 2>/dev/null || docker compose build

echo -e "  ${YELLOW}Iniciando base de datos...${NC}"
docker compose up -d db
echo -e "  ${YELLOW}Esperando a que Postgres inicie (10 segundos)...${NC}"
sleep 10

echo -e "  ${YELLOW}Ejecutando migracion de base de datos...${NC}"
docker compose run --rm backend node src/db/migrate.js

echo -e "  ${YELLOW}Iniciando todos los servicios...${NC}"
docker compose up -d

sleep 5

echo ""
echo -e "  ${CYAN}Contenedores:${NC}"
docker compose ps
echo ""

echo -e "  ${GREEN}Servicios levantados OK${NC}"

# ── PASO 6: Machine ID y licencia ────────────────────────

echo ""
echo -e "${YELLOW}[5/8] Obteniendo Machine ID...${NC}"

MACHINE_ID_OUTPUT=$(docker compose run --rm backend node src/license/get-machine-id.js 2>/dev/null)
MACHINE_ID=$(echo "$MACHINE_ID_OUTPUT" | grep -oE '[a-f0-9]{64}' | head -1)

if [ -z "$MACHINE_ID" ]; then
    MACHINE_ID="(no se pudo obtener - ejecuta manualmente: docker compose run --rm backend node src/license/get-machine-id.js)"
fi

echo ""
echo -e "${CYAN}  +=============================================+${NC}"
echo -e "${CYAN}  |  MACHINE ID:                                |${NC}"
echo -e "${WHITE}  |  $MACHINE_ID  |${NC}"
echo -e "${CYAN}  |                                             |${NC}"
echo -e "${CYAN}  |  Envia este ID a GYS Automation para        |${NC}"
echo -e "${CYAN}  |  generar tu licencia.                       |${NC}"
echo -e "${CYAN}  |                                             |${NC}"
echo -e "${YELLOW}  |  WhatsApp: +52 XXX XXX XXXX                 |${NC}"
echo -e "${YELLOW}  |  Email: licencias@gysautomation.com         |${NC}"
echo -e "${CYAN}  +=============================================+${NC}"
echo ""

read -p "  Ruta del archivo license.key (Enter para omitir): " LICENSE_FILE
if [ -n "$LICENSE_FILE" ] && [ -f "$LICENSE_FILE" ]; then
    cp "$LICENSE_FILE" "$INSTALL_PATH/backend/license.key"
    echo -e "  ${YELLOW}Licencia instalada. Reiniciando backend...${NC}"
    docker compose restart backend
    echo -e "  ${GREEN}Backend reiniciado con licencia OK${NC}"
elif [ -n "$LICENSE_FILE" ]; then
    echo -e "  ${RED}Archivo no encontrado: $LICENSE_FILE${NC}"
    echo -e "  ${YELLOW}Copia el archivo manualmente luego a: $INSTALL_PATH/backend/license.key${NC}"
else
    echo -e "  ${YELLOW}Sin licencia por ahora. El sistema iniciara en modo lectura.${NC}"
    echo -e "  ${YELLOW}Copia el archivo license.key a: $INSTALL_PATH/backend/license.key${NC}"
fi

# ── PASO 7: Configurar inicio automatico ─────────────────

echo ""
echo -e "${YELLOW}[6/8] Configurando inicio automatico...${NC}"

# Crear servicio systemd
cat > /etc/systemd/system/oeebox.service << EOF
[Unit]
Description=OEE Box - Industrial OEE Monitoring
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_PATH
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable oeebox.service
echo -e "  ${GREEN}Servicio systemd 'oeebox' creado y habilitado OK${NC}"

# ── PASO 8: Configurar Chrome kiosko (opcional) ──────────

echo ""
echo -e "${YELLOW}[7/8] Configurando navegador kiosko...${NC}"

CHROME_PATH=""
for p in /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium-browser /usr/bin/chromium; do
    if [ -x "$p" ]; then
        CHROME_PATH="$p"
        break
    fi
done

if [ -n "$CHROME_PATH" ]; then
    # Crear script de inicio para kiosko
    cat > "$INSTALL_PATH/start-kiosk.sh" << EOF
#!/usr/bin/env bash
# Esperar a que el servicio este listo
sleep 10
# Abrir Chrome en modo kiosko
$CHROME_PATH --kiosk --app=http://localhost:3000/andon --noerrdialogs --disable-translate --no-first-run --fast --fast-start --disable-infobars --disable-features=TranslateUI
EOF
    chmod +x "$INSTALL_PATH/start-kiosk.sh"

    # Crear .desktop para autostart (para sesiones de escritorio)
    AUTOSTART_DIR="/etc/xdg/autostart"
    if [ -d "$AUTOSTART_DIR" ] || mkdir -p "$AUTOSTART_DIR" 2>/dev/null; then
        cat > "$AUTOSTART_DIR/oeebox-kiosk.desktop" << EOF
[Desktop Entry]
Type=Application
Name=OEE Box Andon
Comment=Abre el Andon Board de OEE Box
Exec=$INSTALL_PATH/start-kiosk.sh
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=15
EOF
        echo -e "  ${GREEN}Kiosko configurado (autostart en sesion de escritorio)${NC}"
    else
        echo -e "  ${YELLOW}No se pudo crear autostart. Ejecuta manualmente: $INSTALL_PATH/start-kiosk.sh${NC}"
    fi

    # Crear acceso directo en escritorio del usuario que invoco sudo
    REAL_USER="${SUDO_USER:-$USER}"
    REAL_HOME=$(eval echo "~$REAL_USER")
    if [ -d "$REAL_HOME/Desktop" ] || [ -d "$REAL_HOME/Escritorio" ]; then
        DESKTOP_DIR="$REAL_HOME/Desktop"
        [ -d "$REAL_HOME/Escritorio" ] && DESKTOP_DIR="$REAL_HOME/Escritorio"
        cat > "$DESKTOP_DIR/OEE Box Dashboard.desktop" << EOF
[Desktop Entry]
Type=Application
Name=OEE Box Dashboard
Comment=Abrir OEE Box Dashboard
Exec=$CHROME_PATH --kiosk --app=http://localhost:3000
Icon=web-browser
Terminal=false
Categories=Utility;
EOF
        chmod +x "$DESKTOP_DIR/OEE Box Dashboard.desktop"
        chown "$REAL_USER:$REAL_USER" "$DESKTOP_DIR/OEE Box Dashboard.desktop"
        echo -e "  ${GREEN}Acceso directo creado en el escritorio${NC}"
    fi
else
    echo -e "  ${YELLOW}Chrome/Chromium no encontrado.${NC}"
    echo -e "  ${YELLOW}Para modo kiosko instala: sudo apt install chromium-browser${NC}"
    echo -e "  ${YELLOW}Puedes abrir manualmente: http://localhost:3000/andon${NC}"
fi

# ── PASO 9: Resumen final ────────────────────────────────

echo ""
echo ""
echo -e "${GREEN}  +==============================================+${NC}"
echo -e "${GREEN}  |   OEE Box instalado exitosamente!            |${NC}"
echo -e "${GREEN}  +==============================================+${NC}"
echo ""
echo -e "  ${WHITE}Empresa:     $COMPANY_NAME${NC}"
echo -e "  ${WHITE}Planta:      $PLANT_NAME${NC}"
echo -e "  ${WHITE}Instalado:   $INSTALL_PATH${NC}"
echo -e "  ${WHITE}Machine ID:  $MACHINE_ID${NC}"
echo ""
echo -e "  ${CYAN}URLs:${NC}"
echo -e "  ${WHITE}  Dashboard:  http://localhost:3000${NC}"
echo -e "  ${WHITE}  Andon:      http://localhost:3000/andon${NC}"
echo ""
echo -e "  ${CYAN}Credenciales por defecto:${NC}"
echo -e "  ${WHITE}  Usuario:    admin${NC}"
echo -e "  ${WHITE}  Password:   admin123${NC}"
echo ""
echo -e "  ${CYAN}Servicios:${NC}"
echo -e "  ${WHITE}  systemctl status oeebox     # Ver estado${NC}"
echo -e "  ${WHITE}  systemctl restart oeebox    # Reiniciar${NC}"
echo -e "  ${WHITE}  systemctl stop oeebox       # Detener${NC}"
echo -e "  ${WHITE}  cd $INSTALL_PATH && docker compose logs -f  # Ver logs${NC}"
echo ""
echo -e "  ${CYAN}Licencia:${NC}"
if [ -f "$INSTALL_PATH/backend/license.key" ]; then
    echo -e "  ${GREEN}  Instalada correctamente${NC}"
else
    echo -e "  ${YELLOW}  Modo lectura - copia license.key a:${NC}"
    echo -e "  ${WHITE}  $INSTALL_PATH/backend/license.key${NC}"
fi
echo ""
echo -e "${GREEN}  +==============================================+${NC}"
echo ""
