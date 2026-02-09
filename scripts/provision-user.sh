#!/bin/bash
# Provision a new OpenClaw user on this server
# Usage: ./provision-user.sh <username> <port>
# Called by the admin when setting up a new user's gateway

set -euo pipefail

USERNAME="${1:?Usage: $0 <username> <port>}"
PORT="${2:?Usage: $0 <username> <port>}"
ADMIN_CONFIG="$HOME/.openclaw/openclaw.json"
USER_CONFIG_DIR="$HOME/.openclaw-${USERNAME}"

echo "=== Provisioning OpenClaw user: $USERNAME on port $PORT ==="

# 1. Create config directory
if [ -d "$USER_CONFIG_DIR" ]; then
  echo "[!] Config directory already exists: $USER_CONFIG_DIR"
  echo "    To re-provision, remove it first: rm -rf $USER_CONFIG_DIR"
  exit 1
fi

mkdir -p "$USER_CONFIG_DIR"
echo "[+] Created config dir: $USER_CONFIG_DIR"

# 2. Copy admin config as base and modify
if [ ! -f "$ADMIN_CONFIG" ]; then
  echo "[!] Admin config not found: $ADMIN_CONFIG"
  exit 1
fi

cp "$ADMIN_CONFIG" "$USER_CONFIG_DIR/openclaw.json"
echo "[+] Copied admin config as base"

# 3. Generate a new gateway auth token
NEW_TOKEN=$(openssl rand -hex 24)

# 4. Update the config with new port and token using node (safer than sed for JSON)
node -e "
const fs = require('fs');
const configPath = '$USER_CONFIG_DIR/openclaw.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Update gateway port (at gateway.port, NOT gateway.http.port)
config.gateway = config.gateway || {};
config.gateway.port = $PORT;

// Update auth token
config.gateway.auth = config.gateway.auth || {};
config.gateway.auth.token = '$NEW_TOKEN';

// Update workspace path to this user's directory (not admin's)
if (config.agents && config.agents.defaults) {
  config.agents.defaults.workspace = '$USER_CONFIG_DIR/workspace';
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('[+] Updated config: port=$PORT, workspace, new token');
"

# 5. Create workspace and standard directories
mkdir -p "$USER_CONFIG_DIR/workspace/memory"
mkdir -p "$USER_CONFIG_DIR/agents/main/sessions"
mkdir -p "$USER_CONFIG_DIR/credentials"
echo "[+] Created workspace directories"

# 6. Create systemd user service for this gateway
# Uses the same format as the working main gateway service
SERVICE_NAME="openclaw-gateway-${USERNAME}"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

mkdir -p "$HOME/.config/systemd/user"

cat > "$SERVICE_FILE" << UNIT
[Unit]
Description=OpenClaw Gateway for ${USERNAME}
After=network-online.target
Wants=network-online.target

[Service]
ExecStart="/usr/bin/node" "$HOME/.npm-global/lib/node_modules/openclaw/dist/index.js" gateway --port ${PORT}
Restart=always
RestartSec=5
KillMode=process
Environment=HOME=$HOME
Environment="PATH=$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin"
Environment=OPENCLAW_GATEWAY_PORT=${PORT}
Environment=OPENCLAW_GATEWAY_TOKEN=${NEW_TOKEN}
Environment=OPENCLAW_STATE_DIR=${USER_CONFIG_DIR}
Environment="OPENCLAW_SYSTEMD_UNIT=${SERVICE_NAME}.service"
Environment=OPENCLAW_SERVICE_MARKER=openclaw
Environment=OPENCLAW_SERVICE_KIND=gateway

[Install]
WantedBy=default.target
UNIT

echo "[+] Created systemd service: $SERVICE_NAME"

# 7. Enable and start the service
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user start "$SERVICE_NAME"

# Wait for startup
sleep 8

# 8. Verify
if systemctl --user is-active --quiet "$SERVICE_NAME"; then
  echo "[+] Gateway started successfully on port $PORT"
else
  echo "[!] Gateway failed to start. Check: journalctl --user -u $SERVICE_NAME"
  exit 1
fi

# 9. Test health
if curl -sf "http://127.0.0.1:${PORT}/status" > /dev/null 2>&1; then
  echo "[+] Gateway health check passed"
else
  echo "[!] Gateway health check failed (may still be starting)"
fi

echo ""
echo "=== Provisioning Complete ==="
echo "  Username: $USERNAME"
echo "  Port:     $PORT"
echo "  Config:   $USER_CONFIG_DIR"
echo "  Token:    $NEW_TOKEN"
echo "  Service:  $SERVICE_NAME"
echo ""
echo "Next: Use the Admin panel to update this user's gateway config with:"
echo "  profile: $USERNAME, port: $PORT, token: $NEW_TOKEN, configDir: $USER_CONFIG_DIR"
