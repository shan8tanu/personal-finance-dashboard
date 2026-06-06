# Deployment — AWS EC2 + Docker + Cloudflare Tunnel

Runs Findash 24/7 on a small AWS EC2 instance, exposed at **`finance.YOURDOMAIN`**
through a Cloudflare Tunnel (no open inbound ports, automatic HTTPS), with an optional
**Cloudflare Access** layer gating the site before the app's own login.

> Replace `YOURDOMAIN` and `finance.YOURDOMAIN` throughout with your real domain/subdomain.

```
Phone / Browser
     │ HTTPS
     ▼
Cloudflare edge  ──(Access: email/Google OTP, optional)──┐
     │ Cloudflare Tunnel (outbound from VM, no open ports)│
     ▼                                                    │
AWS EC2 (Ubuntu)                                          │
  └── Docker container "findash"  (uvicorn :3001)         │
        ├── FastAPI  (API + serves built React client)    │
        └── SQLite   (server-py/dev.db, mounted volume)   │
```

---

## Prerequisites
- An AWS account (EC2 free tier is fine).
- Your domain's DNS managed in Cloudflare (you confirmed this — portfolio on Pages).
- Your local `server-py/.env` and `server-py/dev.db` (the live data, 2,820 txns).

---

## Part 1 — EC2 instance

1. **EC2 → Launch instance**
   - AMI: **Ubuntu Server 24.04 LTS**
   - Type: **t3.small** recommended (2 GB RAM — Docker build is comfortable), or t2.micro (free tier, 1 GB — add swap, see Troubleshooting)
   - Key pair: create/download `finance-key.pem`
   - Storage: 20 GB gp3
2. **Security group:** inbound **SSH (22) from My IP** only. **Do not open 3001** — the tunnel dials outbound.
3. **Elastic IP:** allocate one and associate it (so the IP is stable).
4. **Key + SSH:**
   ```bash
   chmod 400 ~/.ssh/finance-key.pem
   ssh -i ~/.ssh/finance-key.pem ubuntu@<elastic-ip>
   ```

---

## Part 2 — Install Docker + cloudflared (on the VM)

```bash
# Docker
sudo apt update && sudo apt install -y docker.io docker-compose-v2 sqlite3
sudo usermod -aG docker ubuntu && newgrp docker

# cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cf.deb
sudo dpkg -i cf.deb && rm cf.deb
cloudflared --version
```

---

## Part 3 — Deploy the app

```bash
# On the VM
git clone https://github.com/shan8tanu/personal-finance-dashboard.git ~/finance
cd ~/finance
```

From your **laptop**, copy your env + database up (they're gitignored):
```bash
scp -i ~/.ssh/finance-key.pem \
  "/c/Users/shant/Downloads/personal finance dashboard/server-py/.env" \
  "/c/Users/shant/Downloads/personal finance dashboard/server-py/dev.db" \
  ubuntu@<elastic-ip>:~/finance/server-py/
```

Edit `~/finance/server-py/.env` on the VM and set the public origin:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET=<your existing secret>
WEBHOOK_SECRET=<your existing secret>
AUTH_USERNAME=<you>
AUTH_PASSWORD_HASH=<your bcrypt hash>
ALLOWED_ORIGIN=https://finance.YOURDOMAIN
PORT=3001
```

Build + run:
```bash
cd ~/finance
docker compose up -d --build
curl -s localhost:3001/api/health      # -> {"status":"ok"}
```

---

## Part 4 — Cloudflare Tunnel → finance.YOURDOMAIN

```bash
cloudflared tunnel login                 # opens a URL; authorize your domain
cloudflared tunnel create findash        # note the Tunnel UUID it prints
cloudflared tunnel route dns findash finance.YOURDOMAIN

mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<'YML'
tunnel: findash
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: finance.YOURDOMAIN
    service: http://localhost:3001
  - service: http_status:404
YML

# run as a service so it survives reboots
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Visit `https://finance.YOURDOMAIN` → you should see the Findash login.

---

## Part 5 — Cloudflare Access (optional extra auth layer)

Cloudflare dashboard → **Zero Trust → Access → Applications → Add → Self-hosted**:
- Application domain: `finance.YOURDOMAIN`
- Policy: **Allow** where **Emails = your-email** (or Google login)
- Session duration: e.g. 1 week

Now Cloudflare requires email/Google OTP *before* the app loads — the app's own
username/password is the second factor.

> Note: with Access enabled, the **Tasker webhook** path must be excluded or it'll be
> blocked. Add a **Bypass** policy for path `/api/webhook/sms` (Access → the app →
> add policy → Bypass → everyone, scoped to that path), since the webhook authenticates
> with its own `X-Webhook-Secret` header.

---

## Part 6 — Point Tasker at the new URL

On your phone, update the Tasker HTTP Request URL to:
```
https://finance.YOURDOMAIN/api/webhook/sms
```
(Header `X-Webhook-Secret` stays the same — copy it from the Settings page.)

---

## Part 7 — Backups

```bash
mkdir -p ~/finance/logs
chmod +x ~/finance/scripts/backup-db.sh
crontab -e
# add:
30 2 * * * /home/ubuntu/finance/scripts/backup-db.sh >> /home/ubuntu/finance/logs/backup.log 2>&1
```
Keeps the last 14 daily snapshots in `~/finance-backups`. To pull one to your laptop:
```bash
scp -i ~/.ssh/finance-key.pem ubuntu@<elastic-ip>:'~/finance-backups/findash-*.db.gz' ./backups/
```

---

## Updating the app

```bash
ssh -i ~/.ssh/finance-key.pem ubuntu@<elastic-ip>
cd ~/finance && git pull && docker compose up -d --build
```
Your `.env` and `dev.db` are mounted (not in the image), so data + secrets survive rebuilds.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Build OOM on t2.micro (1 GB) | Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` (persist in `/etc/fstab`) |
| `https://finance...` not loading | `sudo systemctl status cloudflared`; `docker compose logs -f` |
| 502 from Cloudflare | Container down or wrong port — `docker compose ps`, confirm `localhost:3001/api/health` |
| Tasker webhook 403/blocked | Add the `/api/webhook/sms` **Bypass** policy in Cloudflare Access (Part 5) |
| Login fails | `ALLOWED_ORIGIN` mismatch or wrong `AUTH_PASSWORD_HASH` — fix `.env`, `docker compose up -d` |
