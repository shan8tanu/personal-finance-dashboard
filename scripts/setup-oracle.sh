#!/bin/bash
# setup-oracle.sh — One-time setup for Oracle Cloud Always Free ARM VM (Ubuntu 22.04)
# Run as: bash setup-oracle.sh
set -e

echo "=== Personal Finance Dashboard — Oracle VM Setup ==="

# ── 1. System packages ──────────────────────────────────────────────────────
echo "[1/7] Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y curl git unzip python3 python3-pip

# pdfplumber dependencies
pip3 install --user pdfplumber

# ── 2. Node.js 20 LTS ────────────────────────────────────────────────────────
echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
echo "[3/7] Installing PM2..."
sudo npm install -g pm2
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash || true

# ── 4. Clone / copy repo ─────────────────────────────────────────────────────
echo "[4/7] Setting up app directory..."
APP_DIR="$HOME/finance"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"

echo ""
echo "  → Copy your project files to $APP_DIR"
echo "    Options:"
echo "    a) git clone your repo:   git clone <repo-url> $APP_DIR"
echo "    b) scp from laptop:       scp -r /path/to/project ubuntu@<vm-ip>:$APP_DIR"
echo ""
read -p "  Press Enter once files are in $APP_DIR..."

# ── 5. Install dependencies ───────────────────────────────────────────────────
echo "[5/7] Installing Node dependencies..."
cd "$APP_DIR/client" && npm install
cd "$APP_DIR/server" && npm install

# Build frontend (static files)
cd "$APP_DIR/client" && npm run build
echo "  Frontend built → $APP_DIR/client/dist"

# Prisma setup
cd "$APP_DIR/server"
npx prisma generate
npx prisma migrate deploy 2>/dev/null || npx prisma db push  # db push for SQLite dev

# ── 6. Environment file ────────────────────────────────────────────────────────
echo "[6/7] Creating .env file..."
ENV_FILE="$APP_DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
# Set this to your Cloudflare Tunnel public URL after step 7
ALLOWED_ORIGIN=https://YOUR_TUNNEL.trycloudflare.com
# Generate a strong secret: openssl rand -base64 48
JWT_SECRET=CHANGE_ME_STRONG_SECRET
DATABASE_URL="file:./prisma/finance.db"
EOF
  echo "  Created $ENV_FILE — edit ALLOWED_ORIGIN and JWT_SECRET before starting!"
else
  echo "  .env already exists, skipping."
fi

# ── 7. Cloudflare Tunnel (cloudflared) ────────────────────────────────────────
echo "[7/7] Installing cloudflared..."
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo ""
echo "1. Edit $ENV_FILE — set JWT_SECRET and ALLOWED_ORIGIN"
echo ""
echo "2. Start a quick tunnel to get your public URL:"
echo "   cloudflared tunnel --url http://localhost:3001"
echo "   Copy the *.trycloudflare.com URL → paste into ALLOWED_ORIGIN in .env"
echo ""
echo "3. For a permanent named tunnel (recommended):"
echo "   cloudflared tunnel login"
echo "   cloudflared tunnel create finance"
echo "   cloudflared tunnel route dns finance <your-domain-or-subdomain>"
echo "   See DEPLOY.md for the full config file."
echo ""
echo "4. Start the app with PM2:"
echo "   cd $APP_DIR && pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "5. Start cloudflared as a service (after named tunnel is set up):"
echo "   sudo cloudflared service install"
echo "   sudo systemctl start cloudflared"
