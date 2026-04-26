# Deployment Guide — AWS EC2 + Cloudflare Tunnel

Runs the finance dashboard 24/7 on a free AWS EC2 t2.micro (free for 12 months, then ~$8-10/month).
Cloudflare Tunnel provides HTTPS with no open inbound ports required.

> **Note:** If you want a permanently free VM after the 12-month trial ends, migrate to GCP e2-micro
> (us-central1) or Oracle Cloud Always Free ARM — the app code needs zero changes, just a new VM.

## Architecture

```
Phone / Browser
     │ HTTPS
     ▼
Cloudflare Tunnel  (free, no inbound ports needed)
     │ HTTP localhost
     ▼
AWS EC2 t2.micro  (1 vCPU / 1 GB RAM)
  ├── PM2 → tsx server/src/index.ts  (port 3001)
  │         serves React frontend (client/dist)
  │         + all /api/* routes
  └── SQLite  (prisma/finance.db)

Your Laptop  (PDF parsing stays local)
  └── parse PDF → output.json → curl POST to VM
```

---

## Part 1 — AWS EC2 Instance

### 1.1 Create the instance

Go to **EC2 → Instances → Launch Instances**

| Setting | Value |
|---|---|
| Name | `finance-dashboard` |
| AMI | Ubuntu Server 22.04 LTS (search "ubuntu 22.04", pick the free tier eligible one) |
| Architecture | 64-bit (x86) |
| Instance type | **t2.micro** (Free tier eligible) |
| Key pair | Create new → name it `finance-key` → download `finance-key.pem` |
| Storage | 30 GB gp2 (default) |

### 1.2 Security Group (firewall)

Under **Network settings → Edit**, configure:

| Type | Protocol | Port | Source |
|---|---|---|---|
| SSH | TCP | 22 | My IP (select from dropdown — restricts SSH to your home IP) |

**Do not open port 3001** — Cloudflare Tunnel connects outbound from the VM, so no inbound rule needed for the app.

Click **Launch Instance**.

### 1.3 Allocate a static IP (Elastic IP)

By default EC2 public IPs change on reboot. Fix this:

1. EC2 → **Elastic IPs → Allocate Elastic IP address** → Allocate
2. Select the new IP → **Actions → Associate Elastic IP**
3. Associate it with your `finance-dashboard` instance

> Elastic IPs are free while attached to a running instance. They cost ~$0.005/hr if the instance is stopped.

### 1.4 Move your key file to the right place

```bash
# Git Bash on Windows
mkdir -p ~/.ssh
mv /c/Users/shant/Downloads/finance-key.pem ~/.ssh/finance-key.pem
chmod 400 ~/.ssh/finance-key.pem
```

### 1.5 SSH into the instance

```bash
ssh -i ~/.ssh/finance-key.pem ubuntu@<elastic-ip>
```

---

## Part 2 — Run Setup Script

### 2.1 Copy project files to VM

From your laptop (Git Bash):
```bash
rsync -av \
  -e "ssh -i ~/.ssh/finance-key.pem" \
  --exclude node_modules --exclude .git \
  "/c/Users/shant/Downloads/personal finance dashboard/" \
  ubuntu@<elastic-ip>:~/finance/
```

### 2.2 Run setup

```bash
ssh -i ~/.ssh/finance-key.pem ubuntu@<elastic-ip>
bash ~/finance/scripts/setup-aws.sh
```

This installs Node.js 20, PM2, pdfplumber, cloudflared, builds the frontend, runs Prisma migrations.

---

## Part 3 — Cloudflare Tunnel

### 3.1 Quick tunnel (test, no Cloudflare account needed)

```bash
cloudflared tunnel --url http://localhost:3001
```

Gives a random `*.trycloudflare.com` URL. Open on your phone — you should see the login page.

### 3.2 Named tunnel (permanent, requires domain on Cloudflare)

```bash
cloudflared tunnel login        # opens browser
cloudflared tunnel create finance
cloudflared tunnel route dns finance finance.yourdomain.com
```

Create config file:
```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: finance
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: finance.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

Test: `cloudflared tunnel run finance`

Install as system service (auto-starts on reboot):
```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 3.3 Update .env

```bash
nano ~/finance/server/.env
```

```env
NODE_ENV=production
PORT=3001
ALLOWED_ORIGIN=https://finance.yourdomain.com
JWT_SECRET=<run: openssl rand -base64 48>
WEBHOOK_SECRET=<run: openssl rand -base64 32>
DATABASE_URL="file:./prisma/finance.db"
```

---

## Part 4 — Start the App

```bash
cd ~/finance
pm2 start ecosystem.config.js
pm2 save     # persist across reboots
```

Verify:
```bash
curl http://localhost:3001/api/health
# → {"status":"ok"}
```

---

## Part 5 — Uploading PDF Statements (from Laptop)

### Get your JWT token
1. Open `https://finance.yourdomain.com` → log in
2. DevTools → Application → Local Storage → copy `token`

### Parse locally and upload

```bash
# Parse + interactive review
npx ts-node server/src/scripts/reviewParse.ts --file "Jan2026.pdf"
# → creates output.json

# Upload
TOKEN="your-jwt-token"
URL="https://finance.yourdomain.com"

curl -X POST "$URL/api/upload/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"transactions\": $(python3 -c \"import json; d=json.load(open('output.json')); print(json.dumps(d['transactions']))\"), \"type\": \"bank\"}"
```

---

## Part 6 — SMS Webhook (HDFC Alerts)

Every HDFC transaction SMS is automatically forwarded to the webhook and appears in Findash
within seconds. The endpoint accepts both UPI, NEFT, and ATM withdrawal alerts.

Your `WEBHOOK_SECRET` is shown (and copyable) from the **Settings** page after you log in.

### Part 6a — MacroDroid (Android)

```
Trigger:  SMS Received — body contains "debited from A/c" OR "credited to A/c"
Action:   HTTP Request
  URL:    https://finance.yourdomain.com/api/webhook/sms
  Method: POST
  Headers:
    Content-Type: application/json
    X-Webhook-Secret: <your WEBHOOK_SECRET from Settings>
  Body:   {"message": "[sms_body]", "sender": "[sms_sender]"}
```

> **Note:** Use `"message"` (not `"body"`) as the JSON field name.

### Part 6b — Tasker (Android)

Install **Tasker** from the Play Store.

#### Profile
New Profile → **Event → Phone → Received SMS**
- Sender filter: `HDFCBK` (or leave blank to catch all senders)
- Content filter: `*from A/c*` (matches both debit and credit alerts)

#### Task — "Findash Webhook"
1. **Net → HTTP Request**
   - Method: `POST`
   - URL: `https://finance.yourdomain.com/api/webhook/sms`
   - Headers:
     ```
     Content-Type: application/json
     X-Webhook-Secret: <your WEBHOOK_SECRET from Settings>
     ```
   - Body:
     ```json
     {"message":"%SMSRB","sender":"%SMSFN"}
     ```
   (`%SMSRB` = SMS body, `%SMSFN` = sender name — Tasker built-in variables)

2. **Flash → %HTTPR** *(optional — shows HTTP response code on screen for debugging)*

#### Testing
Use the **Test with curl** command on the Settings page to send a mock transaction.
- `201` → transaction created ✓
- `422` → SMS format not recognized (check the message field)
- `401` → wrong secret

---

## Part 7 — Updating the App

```bash
# From laptop — sync changes
rsync -av \
  -e "ssh -i ~/.ssh/finance-key.pem" \
  --exclude node_modules --exclude .git \
  "/c/Users/shant/Downloads/personal finance dashboard/" \
  ubuntu@<elastic-ip>:~/finance/

# On VM — rebuild and restart
ssh -i ~/.ssh/finance-key.pem ubuntu@<elastic-ip> \
  "cd ~/finance/client && npm run build && pm2 restart finance-dashboard"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| SSH: Permission denied | `chmod 400 ~/.ssh/finance-key.pem` |
| SSH: Connection refused | Check Security Group has port 22 open for your IP; your IP may have changed |
| App not reachable | `pm2 status` + `pm2 logs finance-dashboard` |
| Cloudflare tunnel down | `sudo systemctl status cloudflared` |
| CORS errors | Check `ALLOWED_ORIGIN` in `.env` matches tunnel URL exactly, restart PM2 |
| Out of memory (1 GB is tight) | Add swap: `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| DB errors on first run | `cd ~/finance/server && npx prisma db push` |

---

## Backup

```bash
scp -i ~/.ssh/finance-key.pem \
  ubuntu@<elastic-ip>:~/finance/server/prisma/finance.db \
  "./backups/finance-$(date +%Y%m%d).db"
```

---

## After 12 Months (Free Tier Expiry)

Options when AWS free tier ends:
1. **Pay** — t2.micro is ~$8-10/month, or switch to t4g.micro (ARM, ~$6/month)
2. **Migrate to GCP** — e2-micro in us-central1 is free forever; `rsync` the files + `scp` the SQLite DB
3. **Migrate to Oracle** — ARM VM, free forever; keep retrying for capacity
