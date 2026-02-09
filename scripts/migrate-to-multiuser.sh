#!/usr/bin/env bash
# migrate-to-multiuser.sh — one-time migration from single-user to multi-user Mission Control
# Run from the mission-control directory: bash scripts/migrate-to-multiuser.sh

set -euo pipefail

MC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$MC_DIR/data"

echo "=== Mission Control: Multi-User Migration ==="
echo "MC directory: $MC_DIR"
echo ""

# 1. Create directory structure
echo "[1/5] Creating data directory structure..."
mkdir -p "$DATA_DIR/users"

# 2. Generate JWT secret if not exists
JWT_SECRET_FILE="$DATA_DIR/.jwt-secret"
if [ ! -f "$JWT_SECRET_FILE" ]; then
  echo "[2/5] Generating JWT secret..."
  openssl rand -hex 64 > "$JWT_SECRET_FILE"
  chmod 600 "$JWT_SECRET_FILE"
else
  echo "[2/5] JWT secret already exists, skipping."
fi

# 3. Create admin user from existing mc-config.json
echo "[3/5] Creating admin user..."
node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const mcConfig = JSON.parse(fs.readFileSync(path.join('$MC_DIR', 'mc-config.json'), 'utf8'));
const usersFile = path.join('$DATA_DIR', 'users.json');

// Check if already migrated
if (fs.existsSync(usersFile)) {
  const existing = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  if (Object.keys(existing.users || {}).length > 0) {
    console.log('  Users file already has users, skipping admin creation.');
    process.exit(0);
  }
}

// Create admin user
const adminId = crypto.randomBytes(8).toString('hex');

// Read gateway token from openclaw config
let gwToken = mcConfig.gateway?.token || '';
try {
  const ocConfig = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.openclaw/openclaw.json'), 'utf8'));
  gwToken = ocConfig.gateway?.auth?.token || ocConfig.gateway?.http?.auth?.token || gwToken;
} catch {}

const defaultPassword = 'changeme';
bcrypt.hash(defaultPassword, 12, (err, hash) => {
  if (err) { console.error(err); process.exit(1); }

  const store = {
    users: {
      [adminId]: {
        id: adminId,
        username: 'jonathan',
        displayName: 'Jonathan Glass',
        passwordHash: hash,
        role: 'admin',
        gateway: {
          profile: 'default',
          port: mcConfig.gateway?.port || 18789,
          token: gwToken,
          configDir: path.join(process.env.HOME, '.openclaw'),
        },
        createdAt: new Date().toISOString(),
        disabled: false,
      }
    },
    inviteCodes: {}
  };

  fs.writeFileSync(usersFile, JSON.stringify(store, null, 2));
  console.log('  Admin user created: jonathan (password: changeme)');
  console.log('  IMPORTANT: Change this password after first login!');

  // Create admin data directory
  const adminDataDir = path.join('$DATA_DIR', 'users', adminId);
  fs.mkdirSync(adminDataDir, { recursive: true });

  // 4. Move per-user files to admin data directory
  const filesToMove = [
    { src: 'tasks.json', dest: 'tasks.json' },
    { src: 'scout-results.json', dest: 'scout-results.json' },
    { src: 'hidden-sessions.json', dest: 'hidden-sessions.json' },
    { src: 'agents-custom.json', dest: 'agents-custom.json' },
  ];

  let moved = 0;
  for (const f of filesToMove) {
    const srcPath = path.join('$MC_DIR', f.src);
    const destPath = path.join(adminDataDir, f.dest);
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      moved++;
      console.log('  Moved: ' + f.src + ' -> data/users/' + adminId + '/' + f.dest);
    }
  }

  // Move documents directory
  const srcDocs = path.join('$MC_DIR', 'documents');
  const destDocs = path.join(adminDataDir, 'documents');
  if (fs.existsSync(srcDocs) && !fs.existsSync(destDocs)) {
    fs.cpSync(srcDocs, destDocs, { recursive: true });
    console.log('  Moved: documents/ -> data/users/' + adminId + '/documents/');
    moved++;
  }

  console.log('  Migrated ' + moved + ' files to admin user directory.');
});
"

echo "[4/5] Setting file permissions..."
chmod 600 "$DATA_DIR/users.json" 2>/dev/null || true

echo "[5/5] Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Restart Mission Control: systemctl --user restart mission-control"
echo "  2. Log in as 'jonathan' with password 'changeme'"
echo "  3. Change your password immediately via the admin panel"
echo "  4. Create an invite code for additional users"
echo ""
