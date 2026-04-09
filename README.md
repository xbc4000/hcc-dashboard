# HCC Dashboard — Homelab Command Center

Node.js + Express backend, vanilla HTML/CSS/JS frontend. Docker/Portainer ready.

5 panels: System Overview, Pi-hole DNS, Server Health, Netwatch, Quick Links.

## Quick Deploy (RPi)

```bash
# 1. Clone
git clone https://github.com/xbc4000/hcc-dashboard.git
cd hcc-dashboard

# 2. Create .env
cp .env.example .env

# 3. Generate password hash
docker run --rm node:20-alpine sh -c "cd /tmp && npm init -y && npm install bcryptjs && node -e \"var b=require('bcryptjs');b.hash('YOUR_PASSWORD',12).then(function(h){console.log(h)})\""
# Escape every $ as $$ in the hash, then paste into .env as HCC_PASSWORD_HASH

# 4. Edit .env — fill in all values
nano .env

# 5. Build and run
docker compose up --build -d

# 6. Open browser
# http://10.40.40.2:3080
```

Or deploy via Portainer: create a new stack, paste `docker-compose.yml`, add env vars.

## No Extra Firewall Rules Needed

RPi (VLAN40) already has forward rules to reach all services:
- Pi-hole (172.17.0.2) — rules 27-28
- RouterOS API (10.10.10.1:8728) — rule 15
- Prometheus/Grafana — localhost (same host)
- Server metrics — via Prometheus (same host)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SESSION_SECRET` | Random string for cookie signing |
| `HCC_PASSWORD_HASH` | bcrypt hash of login password (escape `$` as `$$`) |
| `PIHOLE_URL` | Pi-hole base URL (default: `http://172.17.0.2`) |
| `PIHOLE_PASSWORD` | Pi-hole admin password |
| `PROMETHEUS_URL` | Prometheus URL (`http://127.0.0.1:9090` on RPi) |
| `ROUTEROS_HOST` | Router IP (default: `10.10.10.1`) |
| `ROUTEROS_PORT` | RouterOS API port (default: `8728`) |
| `ROUTEROS_USER` | RouterOS API user (default: `mktxp_user`) |
| `ROUTEROS_PASSWORD` | RouterOS API password |
| `GRAFANA_URL` | Grafana URL (`http://127.0.0.1:3000` on RPi) |
| `SERVER1_INSTANCE` | Prometheus instance label for PER730XD |
| `SERVER2_INSTANCE` | Prometheus instance label for PER630 |

## Managing

```bash
# View logs
docker compose logs -f

# Restart
docker compose restart

# Rebuild after code changes
docker compose up --build -d

# Stop
docker compose down
```

## Portainer

Create a new stack in Portainer, paste `docker-compose.yml`, add the env vars from `.env.example`.
