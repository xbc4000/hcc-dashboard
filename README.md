# HCC Dashboard — Homelab Command Center

Node.js + Express backend, vanilla HTML/CSS/JS frontend. Docker/Portainer ready.

5 panels: System Overview, Pi-hole DNS, Server Health, Netwatch, Quick Links.

## Quick Deploy (PER630)

```bash
# 1. Clone
git clone git@github.com:xbc4000/hcc-dashboard.git
cd hcc-dashboard

# 2. Create .env
cp .env.example .env

# 3. Generate password hash
docker run --rm node:20-alpine node -e "require('bcrypt').hash('YOUR_PASSWORD_HERE', 12).then(console.log)"
# Copy the output into .env as HCC_PASSWORD_HASH

# 4. Edit .env — fill in all values
nano .env

# 5. Build and run
docker compose up --build -d

# 6. Open browser
# http://10.20.20.2:3080
```

## RouterOS Firewall Rules (Required)

Run these on the router before deploying:

```routeros
# Allow Server2 to use RouterOS API
/ip service set api address=10.10.10.0/24,10.20.20.0/24,10.30.30.0/24,10.40.40.0/24,10.60.60.0/24

# Forward: Server2 → RPi (Prometheus/Grafana)
/ip firewall filter add chain=forward comment="[FWD] Server2 to RPi services" dst-address=10.40.40.2 dst-port=3000,9090 protocol=tcp src-address=10.20.20.0/24

# Forward: Server2 → Pi-hole API
/ip firewall filter add chain=forward comment="[FWD] Server2 HCC to Pi-hole API" dst-address=172.17.0.2 dst-port=80 protocol=tcp src-address=10.20.20.2

# Input: Server2 → RouterOS API
/ip firewall filter add chain=input comment="[IN] Server2 HCC RouterOS API" dst-port=8728 protocol=tcp src-address=10.20.20.2
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SESSION_SECRET` | Random string for cookie signing |
| `HCC_PASSWORD_HASH` | bcrypt hash of your login password |
| `PIHOLE_URL` | Pi-hole base URL (default: `http://172.17.0.2`) |
| `PIHOLE_PASSWORD` | Pi-hole admin password |
| `PROMETHEUS_URL` | Prometheus URL (default: `http://10.40.40.2:9090`) |
| `ROUTEROS_HOST` | Router IP (default: `10.10.10.1`) |
| `ROUTEROS_PORT` | RouterOS API port (default: `8728`) |
| `ROUTEROS_USER` | RouterOS API user (default: `mktxp_user`) |
| `ROUTEROS_PASSWORD` | RouterOS API password |
| `GRAFANA_URL` | Grafana URL (default: `http://10.40.40.2:3000`) |
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

Paste `docker-compose.yml` into Portainer's stack editor. Add the `.env` variables via Portainer's environment section.
