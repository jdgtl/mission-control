# Multi-Tenant Mission Control Setup

Internal documentation for the J/DGTL Mission Control deployment on `openclaw-jdgtl`.

## Architecture

```
mc.jdgtl.com (Nginx + HTTPS — pending DNS)
  |
  v
Mission Control (port 3333, single Express app)
  |-- Login -> JWT -> UserContext on every request
  |-- /api/* routes -> requireAuth middleware -> per-user gateway routing
  |     |-- Jonathan (admin) -> gateway :18789 (~/.openclaw/)
  |     |-- Aabo (user)      -> gateway :18790 (~/.openclaw-taabo/)
  |
  Shared: skills catalog, enhancements.md, frontend code, mc-config.json
  Per-user: sessions, memory, tasks, scout results, agents, documents
```

**Server**: 2 cores, 3.8GB RAM, 62GB disk (DigitalOcean)
- Tailscale IP: 100.89.158.4
- Public IP: 174.138.93.111

## Services (systemd user units)

| Service | Port | Config Dir | Description |
|---------|------|------------|-------------|
| `mission-control.service` | 3333 | N/A | Dashboard (Express + static frontend) |
| `openclaw-gateway.service` | 18789 | `~/.openclaw/` | Jonathan's gateway |
| `openclaw-gateway-taabo.service` | 18790 | `~/.openclaw-taabo/` | Aabo's gateway |

### Common commands

```bash
# Mission Control
systemctl --user restart mission-control
systemctl --user status mission-control
journalctl --user -u mission-control -f

# Gateways
systemctl --user restart openclaw-gateway
systemctl --user restart openclaw-gateway-taabo
journalctl --user -u openclaw-gateway-taabo -f
```

## Authentication

- **JWT tokens**: 24h access tokens + 30d refresh tokens (httpOnly cookie)
- **Passwords**: bcrypt, 12 rounds
- **Rate limiting**: 20 requests/min on `/api/auth/*` endpoints
- **JWT secret**: auto-generated, stored in `data/.jwt-secret`
- **Refresh tokens**: rejected by `requireAuth` if used as access tokens (`decoded.type` check)

### Auth flow

1. User POSTs `/api/auth/login` with username + password
2. Server returns access token (in body + `mc_token` httpOnly cookie) + refresh token (`mc_refresh` httpOnly cookie)
3. Frontend stores access token in `localStorage` and sends it via `Authorization: Bearer` header on all API calls (via `apiFetch()` wrapper)
4. On 401, frontend clears token and redirects to `/login`

### Admin-only endpoints

These modify server-wide `mc-config.json` and are protected by `requireAdmin`:

- `POST /api/setup` — initial setup wizard
- `POST /api/settings/budget` — budget configuration
- `POST /api/settings/heartbeat` — heartbeat interval
- `POST /api/settings/import` — import config file
- `GET /api/settings/export` — export config (contains secrets)
- `GET /api/admin/users` — list all users
- `POST /api/admin/invite` — create invite code
- `DELETE /api/admin/users/:id` — disable user
- `PATCH /api/admin/users/:id` — re-enable user
- `GET /api/admin/health` — all gateways health
- `POST /api/admin/users/:id/gateway` — update user gateway config

## Per-User Data Isolation

| Data | Storage | Mechanism |
|------|---------|-----------|
| Sessions | `~/.openclaw-<profile>/agents/main/sessions/` | `req.ctx.sessionsDir` |
| Workspace/memory | `~/.openclaw-<profile>/workspace/` | `req.ctx.workspacePath` |
| Tasks | `data/users/<userId>/tasks.json` | `req.ctx.tasksFile` |
| Scout results | `data/users/<userId>/scout-results.json` | `req.ctx.scoutResultsFile` |
| Hidden sessions | `data/users/<userId>/hidden-sessions.json` | `req.ctx.hiddenSessionsFile` |
| Custom agents | `data/users/<userId>/agents-custom.json` | `req.ctx.agentsCustomFile` |
| Documents | `data/users/<userId>/documents/` | `req.ctx.documentsDir` |
| API caches | In-memory `userCaches` Map keyed by userId | `getUserCache(userId)` |

Shared across all users: `mc-config.json`, `enhancements.md`, skills catalog, update status.

## Users

| Username | Role | Port | Config Dir | Created |
|----------|------|------|------------|---------|
| jonathan | admin | 18789 | `~/.openclaw/` | 2026-02-09 |
| aabo | user | 18790 | `~/.openclaw-taabo/` | 2026-02-09 |

User data stored in `data/users.json` (gitignored).

## Adding a New User

### 1. Provision the gateway

```bash
cd /home/openclaw/mission-control
./scripts/provision-user.sh <username> <port>
```

This will:
- Create `~/.openclaw-<username>/` with config copied from admin
- Update `gateway.port`, `gateway.auth.token`, and `agents.defaults.workspace`
- Create and start a systemd service: `openclaw-gateway-<username>.service`

### 2. Create an invite code

Log in as admin, go to `/admin`, click "Generate Invite Code". Give the code to the new user.

### 3. User registers

User visits the MC URL, clicks "Create account", enters the invite code + username + password.

### 4. Update gateway config in users.json

After registration, use the admin panel or manually update the user's gateway config in `data/users.json` with the correct `profile`, `port`, `token`, and `configDir` from the provisioning output.

## Frontend

- **Stack**: Vite + React + TypeScript
- **Build**: `cd frontend && npm run build`
- **Output**: `frontend/dist/` (served by Express as static files)
- **Auth**: `AuthProvider` context + `ProtectedRoute` wrapper (supports `adminOnly` prop)
- **API calls**: All go through `apiFetch()` from `lib/api.ts` (auto-attaches Bearer token, redirects to /login on 401)
- **Sidebar**: Admin nav item only visible to `user.role === 'admin'`

## Nginx (pending DNS)

Config file: `nginx/mc.jdgtl.com`

```bash
# Install
sudo cp nginx/mc.jdgtl.com /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/mc.jdgtl.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# After DNS propagates
sudo certbot --nginx -d mc.jdgtl.com
```

Features:
- Rate limiting on `/api/auth/` (20/min, burst 5)
- SSE support for `/api/chat` (proxy_buffering off, Connection header cleared, HTTP/1.1)
- Security headers (X-Frame-Options, X-Content-Type-Options, XSS-Protection, Referrer-Policy)
- 10MB max upload size

## Key Technical Notes

- **Gateway port**: Set at `gateway.port` in openclaw.json (NOT `gateway.http.port`)
- **State directory**: Use `OPENCLAW_STATE_DIR` env var (NOT `OPENCLAW_CONFIG_DIR`)
- **Gateway lock files**: `/tmp/openclaw-<uid>/gateway.<hash>.lock` — hash is derived from config dir, so each gateway gets its own lock
- **Gateway binary**: Use node directly (`/usr/bin/node ~/.npm-global/lib/node_modules/openclaw/dist/index.js gateway --port N`) because `openclaw gateway` doesn't support `--foreground`
- **Caches**: All per-user, populated lazily on first request. No startup pre-warm.
- **Model provider**: Kimi K2.5 via Synthetic AI (`api.synthetic.new/anthropic`), shared across all users (zero-cost)

---

## TODO: Remaining Items

### High Priority

- [ ] **DNS setup**: Create A record `mc.jdgtl.com -> 174.138.93.111` (Jonathan to configure at registrar)
- [ ] **HTTPS**: Run `sudo certbot --nginx -d mc.jdgtl.com` after DNS propagates
- [ ] **Cookie hardening**: Set `secure: true` on `mc_token` and `mc_refresh` cookies after HTTPS is live (in `server.js` cookie options)
- [ ] **Change default passwords**: Both jonathan and aabo accounts still use `changeme`

### Medium Priority

- [ ] **Frontend refresh token flow**: Currently users must re-login every 24h when access token expires. Add automatic token refresh using the `POST /api/auth/refresh` endpoint (server-side endpoint exists, frontend doesn't call it)
- [ ] **Per-user gateway restart button**: Admin panel shows gateway health but has no restart button. Add `POST /api/admin/users/:id/gateway/restart` endpoint + UI button
- [ ] **User lastActive tracking**: Admin panel shows "Joined" date but not last activity. Add `lastActive` field to users.json, update it on each authenticated request
- [ ] **Scout engine per-user**: `scout-engine.js` runs as a global process writing to `__dirname/scout-results.json`. Should accept a user context / output path for multi-tenant isolation

### Low Priority

- [ ] **Refresh token rotation**: Currently the same 30-day refresh token is reused on each refresh. Best practice is to issue a new refresh token and invalidate the old one
- [ ] **Provision script: sanitize copied config**: Currently copies entire admin config including WhatsApp allowlist, OpenAI API keys, and browser config. Should strip user-specific fields (channels, credentials) when creating new user configs
- [ ] **Skills catalog per-user**: `SKILLS_PATH` is global. If different users need different skill sets, make it per-user via `req.ctx`
- [ ] **Enhancements.md per-user or admin-only write**: Currently any authenticated user can edit the shared roadmap document. Consider restricting writes to admin
- [ ] **Shutdown old taabo server**: After confirming everything works on shared server for 2-4 weeks, stop the gateway on `openclaw-taabo` (100.74.72.51) and shut down the droplet

### Deferred (Not Needed Yet)

- [ ] **Per-user API keys**: All users currently share Jonathan's Synthetic AI provider. Only needed if users want different billing or providers
- [ ] **Container isolation**: Each gateway runs as a systemd service under the same user. If scaling beyond 5-10 users, consider Docker containers per gateway
- [ ] **Droplet upgrade**: Current 2-core/4GB handles 2-3 users fine. Upgrade to 4-core/8GB ($48/mo) if adding more users

---

## Security Review Summary (Feb 2026)

Completed a full 3-agent review across server, frontend, and infrastructure. All HIGH and MEDIUM issues fixed:

- `requireAuth` rejects refresh tokens as access tokens
- All config-modifying endpoints require `requireAdmin`
- Settings export (contains secrets) requires admin
- Frontend admin route has `adminOnly` guard
- All API calls use `apiFetch()` with auth headers (including Docs upload)
- Logout sends Authorization header for session identification
- Dead startup pre-warm code removed (was writing to unreachable caches / failing with 401)
- Nginx SSE config includes proper Connection header + HTTP/1.1
- Aabo's workspace path corrected to `~/.openclaw-taabo/workspace`
- Provision script updates `agents.defaults.workspace` for new users
- User re-enable endpoint added (`PATCH /api/admin/users/:id`)
