# POS SYSTEM — Production Deployment & Operations Runbook

This runbook outlines the deployment architecture, configuration steps, monitoring setup, backup automation, and disaster recovery procedures for the **POS SYSTEM** production environment.

---

## 1. Production Architecture Overview

The production system runs on Docker Compose behind a Caddy reverse proxy that provides automated Let's Encrypt TLS:

```
[ Internet Traffic ]
        │ (Ports 80 & 443)
        ▼
   ┌─────────┐
   │  Caddy  │  Automatic TLS, HSTS, Security Headers
   └────┬────┘
        │
   ┌────▼────────┐
   │  Nginx Web  │  React 19 SPA Static Assets, Gzip, Cache-Control
   └────┬────────┘
        │ Proxies /api/ and /uploads/
   ┌────▼────────┐
   │ Express API │  Node.js 24, Helmet, Prisma ORM, Session Store
   └────┬────────┘
        │
   ┌────▼────────┐
   │ Postgres 17 │  ACID Database, Persistent Volume, Partial Indexes
   └─────────────┘
        ▲
   ┌────┴────────┐
   │ Backup Cron │  Nightly pg_dump (-Fc), SHA-256 Checksum, S3 Sync
   └─────────────┘
```

---

## 2. Infrastructure Prerequisites

- **Compute**: Minimum 2 vCPU, 4 GB RAM, 50 GB SSD (Ubuntu 22.04 LTS / 24.04 LTS).
- **Network**:
  - Inbound Port 80 (HTTP) & Port 443 (HTTPS) open.
  - DNS A / AAAA records pointing your domain (e.g., `pos.yourdomain.bt`) to the server IP.
- **Installed Software**:
  - Docker Engine v25+ and Docker Compose v2.20+.
  - Git.
  - Optional: AWS CLI or Rclone for off-server backup replication.

---

## 3. First-Time Production Setup

### Step 1: Clone the Codebase
```bash
git clone <git-repo-url> /opt/pos-system
cd /opt/pos-system
```

### Step 2: Configure Production Environment Variables
Create the production environment file:
```bash
cp .env.production.example .env
chmod 600 .env
```

Generate high-entropy secrets for cryptographic keys:
```bash
# Generate random 64-character secrets
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('DEVICE_COOKIE_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('POSTGRES_PASSWORD=' + require('crypto').randomBytes(24).toString('hex'))"
```

Update `.env` with:
- `DOMAIN=pos.yourdomain.bt`
- `NODE_ENV=production`
- `SEED_DEMO_BUSINESSES=false` (**Mandatory: must be false in production**)
- Strong `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `DEVICE_COOKIE_SECRET`
- `PLATFORM_ADMIN_EMAIL=admin@yourdomain.bt`
- `PLATFORM_ADMIN_INITIAL_PASSWORD=<strong-random-password>`
- `OFFSERVER_BACKUP_S3=s3://your-company-pos-backups-prod` (if using AWS S3 or Cloudflare R2)

### Step 3: Launch Production Containers
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Container startup sequence:
1. `postgres` starts and initializes healthcheck.
2. `api` waits for database health, executes `prisma migrate deploy` automatically on boot, and starts Express on port 3001.
3. `web` compiles and launches Nginx on port 80.
4. `caddy` requests TLS certificates from Let's Encrypt and binds ports 80 & 443.
5. `backup` starts cron daemon for nightly execution.

### Step 4: Initialize the Platform Administrator
Execute the initialization script inside the running API container:
```bash
docker compose -f docker-compose.prod.yml exec api pnpm seed:platform-admin
```
This script confirms `SEED_DEMO_BUSINESSES=false`, hashes the password with Argon2id, and enforces `mustChangePassword: true` on first login.

### Step 5: Verify Deployment Health
```bash
# Check Caddy & Nginx response
curl -f -I https://pos.yourdomain.bt/

# Check API health endpoint (verifies active Postgres connectivity)
curl -f https://pos.yourdomain.bt/health
```
Expected output:
```json
{
  "status": "healthy",
  "database": "connected",
  "uptime": 12.45,
  "version": "1.0.0"
}
```

---

## 4. Monitoring, Health Checks & Error Alerting

### Health Check Endpoints
- **Root Health**: `GET /health`
  - Returns `200 OK` with JSON payload when application and database are operational.
  - Returns `503 Service Unavailable` if database connection query (`SELECT 1`) fails.
- **API Versioned Health**: `GET /api/v1/health`

### Recommended Monitoring Integrations
1. **Uptime Kuma / Better Stack / Pingdom**:
   - URL: `https://pos.yourdomain.bt/health`
   - Interval: Every 60 seconds.
   - Response validation: HTTP Status 200 and `"status": "healthy"`.
   - Alert Channels: Telegram, WhatsApp, Email, PagerDuty.
2. **Error Tracking (Sentry / Pino Transport)**:
   - All uncaught errors and 5xx responses are logged as structured JSON via Pino.
   - To monitor container logs in real time:
     ```bash
     docker compose -f docker-compose.prod.yml logs -f api --tail=100
     ```

---

## 5. Automated Backups & Disaster Recovery

### Nightly Backup Schedule
- The backup service executes `/app/scripts/backup.sh` every night at midnight (`0 0 * * *`).
- Backups are dumped using `pg_dump -Fc` (custom compressed format), verified with a SHA-256 checksum file, and pruned after 30 days.

### Manual Backup On-Demand
```bash
docker compose -f docker-compose.prod.yml exec db /app/scripts/backup.sh
```

### Disaster Recovery Restore Test
To verify backup integrity or perform disaster recovery rehearsal into a scratch database:
```bash
./scripts/restore.sh
```
What this test does:
1. Validates the SHA-256 checksum against the backup file.
2. Creates an isolated scratch database `pos_scratch`.
3. Restores schema, tables, and rows using `pg_restore`.
4. Executes verification queries to confirm table counts, business records, and sales.
5. Cleans up and drops the scratch database on completion.

---

## 6. Pilot Business Migration

When onboarding a pilot business migrating from the prototype:
1. Obtain the exported prototype JSON file from the pilot merchant (e.g. `pema-store-export.json`).
2. Run the migration script:
   ```bash
   pnpm migrate:pilot --file /path/to/pema-store-export.json --businessCode BIZ-PEMA1
   ```
3. Hand the generated `PILOT-HANDOFF-BIZ-PEMA1.md` sheet to the business owner containing:
   - Individual staff usernames.
   - Temporary one-time passwords.
   - Staff training guide (`docs/PILOT-TRAINING-GUIDE.md`).

---

## 7. Zero-Downtime Application Updates

To deploy an application update:
```bash
git pull origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --no-deps api web
```
The entrypoint will automatically apply any new Prisma migrations before the new API container accepts traffic.
