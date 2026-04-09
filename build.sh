#!/bin/sh
# Build HCC Dashboard image on RPi for Portainer
# Usage: ./build.sh
# Then reference image "hcc-dashboard:latest" in your Portainer stack

set -e

cd "$(dirname "$0")"

echo "[HCC] Building Docker image..."
docker build -t hcc-dashboard:latest .
echo "[HCC] Done. Image: hcc-dashboard:latest"
echo "[HCC] Add to your Portainer stack with:"
echo ""
echo "  hcc-dashboard:"
echo "    image: hcc-dashboard:latest"
echo "    container_name: hcc-dashboard"
echo "    network_mode: host"
echo "    restart: unless-stopped"
echo "    env_file:"
echo "      - /path/to/.env"
echo ""
