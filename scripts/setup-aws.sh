#!/bin/bash
# setup-aws.sh — One-time setup for AWS EC2 t2.micro (Ubuntu 22.04, x86_64)
# Run as: bash setup-aws.sh
set -e

echo "=== Personal Finance Dashboard — AWS EC2 Setup ==="

# ── 1. System packages ──────────────────────────────────────────────────────
echo "[1/7] Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y curl git unzip python3 python3-pip

pip3 install --user pdfplumber

# ── 2. Node.js 20 LTS ────────────────────────────────────────────────────────
echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
echo "[3/7] Installing PM2..."
sudo npm install -g pm2
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash || true

# ── 4. Copy project files ─────────────────────────────────────────────────────
echo "[4/7] Setting up app directory..."
APP_DIR="$HOME/finance"
mkdir -p "$APP_DIR/logs"

echo ""
echo "  → Copy your project files to $APP_DIR"
echo "    From your laptop (Git Bash / WSL):"
echo "    rsync -av -e 'ssh -i ~/.ssh/your-key.pem' \\"
echo "      --exclude node_modules --exclude .git \\"
echo "      '/c/Users/shant/Downloads/personal finance dashboard/' \\"
echo "      ubuntu@<ec2-public-ip>:~/finance/"
echo ""
read -p "  Press Enter once files are in $APP_DIR..."

# ── 5. Install dependencies ───────────────────────────────────────────────────
echo "[5/7] Installing Node dependencies..."
cd "$APP_DIR/client" && npm install
cd "$APP_DIR/server" && npm install

# Build frontend
cd "$APP_DIR/client" && npm run build
echo "  Frontend built → $APP_DIR/client/dist"

# Prisma
cd "$APP_DIR/server"
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts 2>/dev/null || true

# ── 6. Environment file ────────────────────────────────────────────────────────
echo "[6/7] Creating .env file..."
ENV_FILE="$APP_DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
# Set this after getting your Cloudflare Tunnel URL
ALLOWED_ORIGIN=https://YOUR_TUNNEL.trycloudflare.com
# Generate: openssl rand -base64 48
JWT_SECRET=CHANGE_ME_STRONG_SECRET
DATABASE_URL="file:./prisma/finance.db"
EOF
  echo "  Created $ENV_FILE — edit ALLOWED_ORIGIN and JWT_SECRET!"
else
  echo "  .env already exists, skipping."
fi

# ── 7. Cloudflare Tunnel (cloudflared) — x86_64 ────────────────────────────
echo "[7/7] Installing cloudflared..."
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Edit $ENV_FILE — set JWT_SECRET and ALLOWED_ORIGIN"
echo "2. Quick tunnel test: cloudflared tunnel --url http://localhost:3001"
echo "3. Start app: cd $APP_DIR && pm2 start ecosystem.config.js && pm2 save"
echo "4. See DEPLOY.md for permanent named tunnel setup."
