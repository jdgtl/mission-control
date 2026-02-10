const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, exec } = require('child_process');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { verifyToken, authenticateUser, createInviteCode, redeemInviteCode, createUser, loadUsers, saveUsers, getUserById, generateAccessToken, hashPassword, verifyPassword } = require('./lib/auth');
const { UserContext } = require('./lib/user-context');

// ========== CONFIG: Load mc-config.json (or create from defaults) ==========
const MC_CONFIG_PATH = path.join(__dirname, 'mc-config.json');
const MC_DEFAULT_CONFIG_PATH = path.join(__dirname, 'mc-config.default.json');
let mcConfig;
try {
  mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
} catch {
  // First run — copy default
  if (fs.existsSync(MC_DEFAULT_CONFIG_PATH)) {
    fs.copyFileSync(MC_DEFAULT_CONFIG_PATH, MC_CONFIG_PATH);
    mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
  } else {
    mcConfig = {
      name: 'Mission Control',
      subtitle: 'Mission Control',
      modules: { dashboard: true, chat: true, workshop: true, costs: true, cron: true, agents: true, settings: true, skills: true },
      gateway: { port: 18789, token: '' },
      aws: { enabled: false, bucket: '', region: 'us-east-1' },
      notion: { enabled: false, dbId: '', token: '' },
      scout: { enabled: false, braveApiKey: '' },
      workspace: '',
      skillsPath: '',
      memoryPath: ''
    };
  }
}

// Config-derived constants (backward compat)
const GATEWAY_PORT = mcConfig.gateway?.port || 18789;
const GATEWAY_TOKEN = mcConfig.gateway?.token || '';
const NOTION_DB_ID = mcConfig.notion?.dbId || '';
const NOTION_TOKEN = mcConfig.notion?.token || '';
// Auto-detect workspace from OpenClaw config if not set
let detectedWorkspace = mcConfig.workspace || '';
if (!detectedWorkspace) {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(path.join(process.env.HOME || '/home/ubuntu', '.openclaw/openclaw.json'), 'utf8'));
    detectedWorkspace = ocConfig.agents?.defaults?.workspace || '';
  } catch {}
}
const WORKSPACE_PATH = detectedWorkspace || path.join(process.env.HOME || '/home/ubuntu', 'clawd');
const SKILLS_PATH = mcConfig.skillsPath || path.join(WORKSPACE_PATH, 'skills');
const MEMORY_PATH = mcConfig.memoryPath || path.join(WORKSPACE_PATH, 'memory');
const S3_BUCKET = mcConfig.aws?.bucket || '';
const S3_REGION = mcConfig.aws?.region || 'us-east-1';

const app = express();
const PORT = 3333;

app.use(express.json());
app.use(cookieParser());

// ========== AUTH: Rate limiter on auth endpoints ==========
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========== AUTH: Middleware ==========
function requireAuth(req, res, next) {
  // Extract token from Authorization header or cookie
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies?.mc_token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = verifyToken(token);
    // Reject refresh tokens used as access tokens (H3 fix)
    if (decoded.type === 'refresh') return res.status(401).json({ error: 'Invalid token type' });
    const user = getUserById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.disabled) return res.status(403).json({ error: 'Account disabled' });

    req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
    req.ctx = new UserContext(user);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ========== AUTH: API Endpoints ==========
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const result = await authenticateUser(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid credentials' });

    // Set httpOnly cookie
    res.cookie('mc_token', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
    });
    res.cookie('mc_refresh', result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30d
      path: '/api/auth/refresh',
    });

    res.json({ ok: true, token: result.accessToken, user: result.user });
  } catch (err) {
    console.error('[Auth login]', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { inviteCode, username, password, displayName } = req.body;
    if (!inviteCode || !username || !password) {
      return res.status(400).json({ error: 'Invite code, username, and password required' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9@._-]+$/.test(username)) return res.status(400).json({ error: 'Username contains invalid characters' });

    // Validate invite code
    const invite = redeemInviteCode(inviteCode);
    if (!invite.valid) return res.status(400).json({ error: invite.error });

    // Create user (no gateway yet — admin will provision)
    const user = await createUser({
      username,
      password,
      displayName: displayName || username,
      role: 'user',
      gateway: { profile: username, port: 0, token: '', configDir: '' },
    });

    const result = await authenticateUser(username, password);
    res.cookie('mc_token', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ ok: true, token: result.accessToken, user: result.user, needsProvisioning: true });
  } catch (err) {
    console.error('[Auth register]', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.mc_refresh;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const user = getUserById(decoded.userId);
    if (!user || user.disabled) return res.status(401).json({ error: 'User not found' });

    const accessToken = generateAccessToken(user);
    res.cookie('mc_token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ ok: true, token: accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.get('/api/auth/check', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const store = loadUsers();
    const user = store.users[req.user.id];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    user.passwordHash = await hashPassword(newPassword);
    saveUsers(store);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Auth change-password]', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('mc_token', { path: '/' });
  res.clearCookie('mc_refresh', { path: '/api/auth/refresh' });
  res.json({ ok: true });
});

// ========== AUTH: Apply to all /api/* routes except auth ==========
app.use('/api', (req, res, next) => {
  // Skip auth for auth endpoints and static files
  if (req.path.startsWith('/auth/')) return next();
  requireAuth(req, res, next);
});

// Serve React frontend (static assets)
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Serve public files (concepts, etc)
app.use('/public', express.static(path.join(__dirname, 'public')));

// ========== HELPER: Fetch sessions from gateway ==========
// ctx-aware version: pass a UserContext, or falls back to global config for startup tasks
async function fetchSessions(limit = 50, ctx = null) {
  try {
    const port = ctx ? ctx.gatewayPort : GATEWAY_PORT;
    const token = ctx ? ctx.gatewayToken : GATEWAY_TOKEN;
    const gwRes = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        args: { limit, messageLimit: 1 },
      }),
    });
    const data = await gwRes.json();
    // Gateway returns both result.content[0].text (JSON string) and result.details (parsed object)
    // Use details for parsed data, fallback to parsing content text
    if (data?.result?.details) {
      return data.result.details; // Returns {count, sessions: [...]}
    }
    // Fallback: parse from text content
    const textResult = data?.result?.content?.[0]?.text;
    if (textResult) {
      const parsed = JSON.parse(textResult);
      return parsed; // Should be {count, sessions: [...]}
    }
    return { count: 0, sessions: [] };
  } catch (e) {
    console.error('[fetchSessions]', e.message);
    return { count: 0, sessions: [] };
  }
}

// ========== HELPER: Fetch Notion activity ==========
async function fetchNotionActivity(pageSize = 5) {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: pageSize,
        sorts: [{ property: 'Date', direction: 'descending' }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || !data.results.length) return null;

    return data.results.map(page => {
      const props = page.properties || {};
      // Name is a title field
      const name = (props.Name?.title || []).map(t => t.plain_text).join('') || 'Activity';
      // Date
      const dateStr = props.Date?.date?.start || page.created_time || new Date().toISOString();
      // Category
      const category = props.Category?.select?.name || 'general';
      // Status
      const status = props.Status?.select?.name || props.Status?.status?.name || 'done';
      // Details
      const details = (props.Details?.rich_text || []).map(t => t.plain_text).join('') || '';

      // Map category to type
      const typeMap = {
        'Development': 'development',
        'Business': 'business',
        'Meeting': 'meeting',
        'Planning': 'planning',
        'Bug Fix': 'development',
        'Personal': 'personal',
      };

      return {
        time: dateStr,
        action: name,
        detail: details || `${category} — ${status}`,
        type: typeMap[category] || 'general',
      };
    });
  } catch (e) {
    console.error('[Notion API]', e.message);
    return null;
  }
}

// ========== HELPER: Parse CSV (handles quoted fields) ==========
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim().replace(/^"(.*)"$/, '$1')] = (values[i] || '').trim().replace(/^"(.*)"$/, '$1'); });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ========== CHAT PROXY ==========
// Proxies to OpenClaw Gateway chat completions API (streaming SSE)
app.post('/api/chat', async (req, res) => {
  const { messages, stream } = req.body;

  const payload = JSON.stringify({
    model: 'openclaw',
    messages: messages || [],
    stream: !!stream,
    user: 'mission-control',
  });

  console.log(`[Chat proxy] Sending to gateway (user: ${req.user.username}), payload length:`, Buffer.byteLength(payload));

  try {
    const gwRes = await req.ctx.gatewayFetch('/v1/chat/completions', {
      method: 'POST',
      body: payload,
      signal: AbortSignal.timeout(120000),
    });

    if (stream) {
      // SSE streaming — pipe through
      res.writeHead(gwRes.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const reader = gwRes.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(value);
        }
      };
      pump().catch(err => {
        console.error('[Chat proxy] Stream error:', err.message);
        res.end();
      });

      req.on('close', () => { reader.cancel(); });
    } else {
      // Non-streaming JSON
      const data = await gwRes.text();
      console.log('[Chat proxy] Gateway responded:', gwRes.status, data.substring(0, 100));
      res.status(gwRes.status).send(data);
    }
  } catch (err) {
    console.error('[Chat proxy] Fetch error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: `Gateway error: ${err.message}` });
    }
  }
});

// ========== API: Agent status + heartbeat ==========
// ========== STATUS CACHE (per-user, via userCaches Map) ==========
const STATUS_CACHE_TTL = 60000; // 60 seconds

// ========== PER-USER CACHES ==========
// Map<userId, { status, statusTime, sessions, sessionsTime, activity, activityTime, costs, costsTime, cron, cronTime, hiddenSessions }>
const userCaches = new Map();
function getUserCache(userId) {
  if (!userCaches.has(userId)) {
    userCaches.set(userId, {
      status: null, statusTime: 0,
      sessions: null, sessionsTime: 0,
      activity: null, activityTime: 0,
      costs: null, costsTime: 0,
      cron: null, cronTime: 0,
    });
  }
  return userCaches.get(userId);
}

// Background status updater — refreshes cache without blocking requests
// ctx parameter: UserContext (for per-user operation) or null (for admin/startup)
async function refreshStatusCache(ctx = null) {
  const userId = ctx ? ctx.userId : '_admin';
  const cache = getUserCache(userId);
  try {
    const memoryPath = ctx ? ctx.memoryPath : MEMORY_PATH;
    // Run all slow operations in parallel
    const [openclawStatus, notionActivity, sessionData, heartbeatLast] = await Promise.allSettled([
      new Promise((resolve) => {
        try {
          if (ctx) {
            resolve(ctx.execCli('status 2>&1', { timeout: 8000 }));
          } else {
            resolve(execSync('openclaw status 2>&1', { timeout: 8000, encoding: 'utf8' }));
          }
        } catch (e) {
          resolve(e.stdout || '');
        }
      }),
      fetchNotionActivity(8).catch(() => null),
      fetchSessions(50, ctx).catch(() => ({ count: 0, sessions: [] })),
      new Promise((resolve) => {
        try {
          if (ctx) {
            resolve(JSON.parse(ctx.execCli('system heartbeat last 2>/dev/null', { timeout: 15000 })));
          } else {
            resolve(JSON.parse(execSync('openclaw system heartbeat last 2>/dev/null', { timeout: 15000, encoding: 'utf8' })));
          }
        } catch (e) {
          resolve(null);
        }
      }),
    ]);

    const ocStatus = openclawStatus.status === 'fulfilled' ? openclawStatus.value : '';
    const activity = notionActivity.status === 'fulfilled' ? notionActivity.value : null;
    const sessions = sessionData.status === 'fulfilled' ? sessionData.value : { count: 0, sessions: [] };
    const hbLast = heartbeatLast.status === 'fulfilled' ? heartbeatLast.value : null;

    // Parse openclaw status
    const sessionsMatch = ocStatus.match(/(\d+) active/);
    const modelMatch = ocStatus.match(/default\s+([\w.:/-]+)\s*\(/);
    const memoryMatch = ocStatus.match(/(\d+)\s*files.*?(\d+)\s*chunks/);
    const heartbeatInterval = ocStatus.match(/Heartbeat\s*│\s*(\w+)/);
    const agentsMatch = ocStatus.match(/Agents\s*│\s*(\d+)/);

    const channels = [];
    const channelRegex = /│\s*(Discord|WhatsApp|Telegram|Slack)\s*│\s*(ON|OFF)\s*│\s*(OK|OFF|ERROR)\s*│\s*(.+?)\s*│/g;
    let m;
    while ((m = channelRegex.exec(ocStatus)) !== null) {
      channels.push({ name: m[1], enabled: m[2], state: m[3], detail: m[4].trim() });
    }
    // Fallback: check openclaw.json for enabled channels if regex found nothing
    if (channels.length === 0) {
      try {
        const configDir = ctx ? ctx.configDir : path.join(process.env.HOME, '.openclaw');
        const ocConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'openclaw.json'), 'utf8'));
        if (ocConfig.channels) {
          for (const [name, cfg] of Object.entries(ocConfig.channels)) {
            if (cfg.enabled) {
              channels.push({ name: name.charAt(0).toUpperCase() + name.slice(1), enabled: 'ON', state: 'OK', detail: cfg.mode || 'connected' });
            }
          }
        }
      } catch (e) { console.error('[Status] Channel config parse error:', e.message); }
    }

    // Token usage
    const sessionList = sessions.sessions || [];
    const totalTokens = sessionList.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
    const tokenUsage = {
      used: totalTokens,
      limit: 0,
      percentage: 0
    };

    // Activity fallback
    let recentActivity = activity;
    if (!recentActivity || !recentActivity.length) {
      recentActivity = buildActivityFromMemory(memoryPath);
    }

    // Heartbeat state (filesystem + native openclaw data)
    let heartbeat = {};
    try {
      heartbeat = JSON.parse(fs.readFileSync(path.join(memoryPath, 'heartbeat-state.json'), 'utf8'));
    } catch { heartbeat = { lastHeartbeat: null, lastChecks: {} }; }
    // Merge native heartbeat data from openclaw CLI
    if (hbLast && hbLast.ts) {
      const hbTime = new Date(hbLast.ts).toISOString();
      if (!heartbeat.lastHeartbeat || hbTime > heartbeat.lastHeartbeat) {
        heartbeat.lastHeartbeat = hbTime;
      }
      heartbeat.lastChecks = heartbeat.lastChecks || {};
      heartbeat.lastChecks.system = { time: hbTime, status: hbLast.status || 'ok', reason: hbLast.reason, channel: hbLast.channel };
    }

    cache.status = { sessionsMatch, modelMatch, memoryMatch, heartbeatInterval, agentsMatch, channels, tokenUsage, recentActivity, heartbeat };
    cache.statusTime = Date.now();
  } catch (e) {
    console.error('[StatusCache] refresh failed:', e.message);
  }
}

function buildActivityFromMemory(memoryPath) {
  const mp = memoryPath || MEMORY_PATH;
  const recentActivity = [];
  for (const dayOffset of [0, 1]) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().split('T')[0];
    try {
      const memFile = path.join(mp, `${dateStr}.md`);
      if (fs.existsSync(memFile)) {
        const memContent = fs.readFileSync(memFile, 'utf8');
        const sections = memContent.split(/\n## /).slice(1);
        sections.slice(0, 6).forEach(section => {
          const firstLine = section.split('\n')[0].trim();
          const timeMatch = firstLine.match(/(\d{2}:\d{2})\s*UTC/);
          const time = timeMatch ? `${dateStr}T${timeMatch[1]}:00Z` : `${dateStr}T12:00:00Z`;
          const title = firstLine.replace(/\d{2}:\d{2}\s*UTC\s*[-—]\s*/, '').replace(/\*\*/g, '').substring(0, 80);
          const bullets = section.split('\n').filter(l => /^[-*]\s/.test(l.trim()));
          const detail = (bullets[0] || '').replace(/^[-*]\s*/, '').replace(/\*\*/g, '').substring(0, 120);
          let type = 'general';
          const lower = (title + ' ' + detail).toLowerCase();
          if (lower.includes('bug') || lower.includes('security')) type = 'security';
          else if (lower.includes('build') || lower.includes('deploy') || lower.includes('dashboard')) type = 'development';
          else if (lower.includes('email') || lower.includes('lead')) type = 'business';
          else if (lower.includes('heartbeat')) type = 'heartbeat';
          else if (lower.includes('meeting')) type = 'meeting';
          if (title) recentActivity.push({ time, action: title, detail: detail || 'Activity logged', type });
        });
        if (recentActivity.length > 2) break;
      }
    } catch { /* ignore */ }
  }
  return recentActivity.length ? recentActivity : [{ time: new Date().toISOString(), action: 'System running', detail: 'Dashboard active', type: 'general' }];
}

// Note: Startup pre-warm removed — caches are now per-user and populated lazily
// on first request via getUserCache(). The old approach wrote to global caches
// (statusCache, cronCache) that no request handler reads, and self-fetches to
// /api/activity and /api/costs would fail with 401 due to auth middleware.

app.get('/api/status', async (req, res) => {
  try {
    const cache = getUserCache(req.ctx.userId);
    // If cache is stale, refresh in background but serve cached data immediately
    if (Date.now() - cache.statusTime > STATUS_CACHE_TTL) {
      refreshStatusCache(req.ctx); // don't await — fire and forget
    }

    // If no cache yet (first request), kick off refresh but don't block
    if (!cache.status) {
      refreshStatusCache(req.ctx); // will populate on next request
    }

    const { sessionsMatch, modelMatch, memoryMatch, heartbeatInterval, agentsMatch, channels, tokenUsage, recentActivity, heartbeat } = cache.status || {};

    // Read heartbeat state
    let hb = heartbeat || {};
    try {
      hb = JSON.parse(fs.readFileSync(path.join(req.ctx.memoryPath, 'heartbeat-state.json'), 'utf8'));
    } catch { /* use cached */ }

    res.json({
      agent: {
        name: (() => { try { const id = fs.readFileSync(path.join(req.ctx.workspacePath, 'IDENTITY.md'), 'utf8'); const m = id.match(/\*\*Name:\*\*\s*(.+)/); return m ? m[1].trim() : mcConfig.name || 'Mission Control'; } catch { return mcConfig.name || 'Mission Control'; } })(),
        status: 'active',
        model: modelMatch ? modelMatch[1].replace('us.anthropic.','').replace(/^hf:[^/]+\//, '').replace(/claude-opus-(\d+)-(\d+).*/, 'Claude Opus $1.$2').replace(/claude-sonnet-(\d+).*/, 'Claude Sonnet $1').replace(/-/g,' ') : req.ctx.defaultModelName,
        activeSessions: sessionsMatch ? parseInt(sessionsMatch[1]) : 0,
        totalAgents: agentsMatch ? parseInt(agentsMatch[1]) : 1,
        memoryFiles: memoryMatch ? parseInt(memoryMatch[1]) : 0,
        memoryChunks: memoryMatch ? parseInt(memoryMatch[2]) : 0,
        heartbeatInterval: heartbeatInterval ? heartbeatInterval[1] : '1h',
        channels: channels || []
      },
      heartbeat: hb,
      recentActivity: recentActivity || [],
      tokenUsage: tokenUsage || { used: 0, limit: 0, percentage: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== API: Live sessions (from OpenClaw gateway) ==========
const SESSIONS_CACHE_TTL = 60000;
const ACTIVITY_CACHE_TTL = 30000;
const COSTS_CACHE_TTL = 60000;

app.get('/api/sessions', async (req, res) => {
  try {
    const cache = getUserCache(req.ctx.userId);
    // Return cache if fresh
    if (cache.sessions && Date.now() - cache.sessionsTime < SESSIONS_CACHE_TTL) {
      return res.json(cache.sessions);
    }

    const sessionData = await fetchSessions(25, req.ctx);
    const sessions = sessionData.sessions || [];
    const hiddenSessions = req.ctx.loadHiddenSessions();

    const result = {
      count: sessionData.count || sessions.length,
      sessions: sessions.map(s => {
        const key = s.key || '';
        const type = key.includes(':subagent:') ? 'sub-agent'
          : key.includes(':discord:') ? 'discord'
          : key.includes(':openai') ? 'web'
          : key.includes(':main:main') ? 'main'
          : 'other';

        return {
          key: s.key,
          kind: s.kind,
          channel: s.channel || 'unknown',
          displayName: s.displayName || s.key.split(':').slice(-1)[0],
          model: (s.model || '').replace('us.anthropic.', ''),
          totalTokens: s.totalTokens || 0,
          contextTokens: s.contextTokens || 0,
          updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
          label: s.label || null,
          type,
          isActive: (s.totalTokens || 0) > 0,
        };
      }),
    };
    // Filter out hidden/closed sessions
    result.sessions = result.sessions.filter(s => !hiddenSessions.includes(s.key));
    result.count = result.sessions.length;
    cache.sessions = result;
    cache.sessionsTime = Date.now();
    res.json(result);
  } catch (e) {
    console.error('[Sessions API]', e.message);
    res.json({ count: 0, sessions: [], error: e.message });
  }
});

// ========== API: Cron jobs (LIVE from OpenClaw, cached per-user) ==========
const CRON_CACHE_TTL = 30000;

app.get('/api/cron', (req, res) => {
  try {
    const cache = getUserCache(req.ctx.userId);
    // Return cache if fresh
    if (cache.cron && Date.now() - cache.cronTime < CRON_CACHE_TTL) {
      return res.json(cache.cron);
    }

    const cronRaw = req.ctx.execCli('cron list --json 2>&1', { timeout: 10000 });
    const parsed = JSON.parse(cronRaw);

    const jobs = (parsed.jobs || []).map(j => ({
      id: j.id,
      name: j.name || j.id.substring(0, 8),
      schedule: j.schedule?.expr || j.schedule?.kind || '?',
      status: !j.enabled ? 'disabled' : (j.state?.lastStatus === 'ok' ? 'active' : j.state?.lastStatus || 'idle'),
      lastRun: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
      nextRun: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
      duration: j.state?.lastDurationMs ? `${j.state.lastDurationMs}ms` : null,
      target: j.sessionTarget || 'main',
      payload: j.payload?.kind || '?',
      description: j.payload?.text?.substring(0, 120) || '',
      history: [],
      enabled: j.enabled !== false, // Add enabled flag for toggle
    }));

    const result = { jobs };
    cache.cron = result;
    cache.cronTime = Date.now();
    res.json(result);
  } catch (e) {
    console.error('[Cron API]', e.message);
    res.json({ jobs: [], error: e.message });
  }
});

// POST: Toggle cron job enabled/disabled
app.post('/api/cron/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const response = await req.ctx.gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({
        tool: 'cron',
        args: { action: 'update', jobId: id, patch: { enabled: enabled } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error: ${response.status} ${errorText}`);
    }

    // Clear cache so next GET refreshes
    const cache = getUserCache(req.ctx.userId);
    cache.cron = null; cache.cronTime = 0;

    res.json({ ok: true, message: `Job ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('[Cron toggle]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST: Run cron job immediately
app.post('/api/cron/:id/run', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await req.ctx.gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ tool: 'cron', args: { action: 'run', jobId: id } })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error: ${response.status} ${errorText}`);
    }

    const cache = getUserCache(req.ctx.userId);
    cache.cron = null; cache.cronTime = 0;

    res.json({ ok: true, message: 'Job triggered successfully' });
  } catch (error) {
    console.error('[Cron run]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST: Create new cron job
app.post('/api/cron/create', async (req, res) => {
  try {
    const { job } = req.body;

    if (!job || !job.name || !job.schedule) {
      return res.status(400).json({ error: 'Invalid job format - name and schedule required' });
    }

    const response = await req.ctx.gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ tool: 'cron', args: { action: 'add', job: job } })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error: ${response.status} ${errorText}`);
    }

    const cache = getUserCache(req.ctx.userId);
    cache.cron = null; cache.cronTime = 0;

    res.json({ ok: true, message: 'Job created successfully' });
  } catch (error) {
    console.error('[Cron create]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Remove cron job
app.delete('/api/cron/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await req.ctx.gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ tool: 'cron', args: { action: 'remove', jobId: id } })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway error: ${response.status} ${errorText}`);
    }

    const cache = getUserCache(req.ctx.userId);
    cache.cron = null; cache.cronTime = 0;

    res.json({ ok: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('[Cron delete]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========== API: Activity Feed — aggregated activity from all sources ==========
app.get('/api/activity', async (req, res) => {
  try {
    const cache = getUserCache(req.ctx.userId);
    // Serve from cache if fresh
    if (cache.activity && Date.now() - cache.activityTime < ACTIVITY_CACHE_TTL) {
      return res.json(cache.activity);
    }
    const feed = [];

    // 1. Completed tasks (with results)
    try {
      const tasks = req.ctx.loadTasks();
      for (const task of (tasks.columns.done || []).slice(0, 15)) {
        feed.push({
          id: `task-${task.id}`,
          type: 'task_completed',
          icon: 'check',
          title: task.title,
          detail: task.result ? task.result.substring(0, 200) : 'Completed',
          time: task.completed || task.created,
          priority: task.priority,
          source: task.source || 'manual',
          taskId: task.id,
          actionable: !!task.childSessionKey,
          actionLabel: task.childSessionKey ? 'Continue Chat' : 'View',
          actionUrl: `/workshop?task=${task.id}`,
        });
      }
      // In-progress tasks
      for (const task of (tasks.columns.inProgress || [])) {
        feed.push({
          id: `task-prog-${task.id}`,
          type: 'task_running',
          icon: 'loader',
          title: `Working: ${task.title}`,
          detail: 'Sub-agent executing...',
          time: task.startedAt || task.created,
          priority: task.priority,
          source: task.source || 'manual',
          taskId: task.id,
          actionable: true,
          actionLabel: 'View',
          actionUrl: `/workshop?task=${task.id}`,
        });
      }
    } catch(e) {}
    
    // 2. Scout opportunities (recent, undeployed)
    try {
      const scout = req.ctx.loadScoutResults();
      if (scout.opportunities) {
        for (const opp of (scout.opportunities || []).filter(o => o.status !== 'dismissed').slice(0, 10)) {
          feed.push({
            id: `scout-${opp.id}`,
            type: opp.status === 'deployed' ? 'scout_deployed' : 'scout_found',
            icon: 'search',
            title: opp.title,
            detail: opp.summary ? opp.summary.substring(0, 150) : '',
            time: opp.found,
            score: opp.score,
            source: opp.source,
            category: opp.category,
            actionable: opp.status !== 'deployed',
            actionLabel: 'Deploy',
            actionUrl: '/scout',
          });
        }
      }
    } catch(e) {}
    
    // 3. Cron job last runs
    try {
      const cronOutput = req.ctx.execCli('cron list --json 2>/dev/null', { timeout: 5000 }).toString();
      const crons = JSON.parse(cronOutput);
      for (const job of (Array.isArray(crons) ? crons : crons.jobs || [])) {
        if (job.lastRun || job.lastRunAt) {
          feed.push({
            id: `cron-${job.id || job.jobId}`,
            type: 'cron_run',
            icon: 'clock',
            title: `Cron: ${job.name || job.id || 'unnamed'}`,
            detail: job.lastRunStatus === 'ok' ? 'Completed successfully' : `Status: ${job.lastRunStatus || 'unknown'}`,
            time: job.lastRun || job.lastRunAt,
            actionable: false,
          });
        }
      }
    } catch(e) {}
    
    // 4. Gateway session activity (only sessions with real message content)
    try {
      const sessions = await fetchSessions(20, req.ctx);
      const sessionList = sessions.sessions || [];
      for (const s of sessionList.slice(0, 15)) {
        const lastMsg = s.lastMessage || s.preview || '';
        // Skip sessions with no actual message content — updatedAt can be misleading
        // (gateway touches sessions internally for heartbeats, etc.)
        if (!lastMsg) continue;
        const key = s.key || s.id || '';
        let channel = s.channel || 'system';
        if (key.includes('slack')) channel = 'slack';
        else if (key.includes('openai')) channel = 'mission-control';
        else if (key.includes('main:main')) channel = 'slack';
        const channelLabel = { slack: 'Slack', 'mission-control': 'Mission Control Chat', system: 'System' }[channel] || channel;
        const rawTime = s.updatedAt || s.createdAt;
        if (rawTime) {
          const timeISO = typeof rawTime === 'number' ? new Date(rawTime).toISOString() : rawTime;
          feed.push({
            id: `session-${key}`,
            type: 'session',
            icon: channel === 'slack' ? 'message-circle' : channel === 'mission-control' ? 'monitor' : 'zap',
            title: `${channelLabel} conversation`,
            detail: lastMsg.substring(0, 150),
            time: timeISO,
            actionable: false,
          });
        }
      }
    } catch(e) {}

    // 5. Daily memory entries
    try {
      for (const dayOffset of [0, 1, 2]) {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        const dateStr = d.toISOString().split('T')[0];
        const memPath = path.join(req.ctx.memoryPath, `${dateStr}.md`);
        if (fs.existsSync(memPath)) {
          const memContent = fs.readFileSync(memPath, 'utf8');
          const memMtime = fs.statSync(memPath).mtime.toISOString();
          const sections = memContent.split(/\n## /).slice(1);
          sections.slice(0, 6).forEach((section, idx) => {
            const firstLine = section.split('\n')[0].trim();
            const title = firstLine.replace(/\*\*/g, '').substring(0, 80);
            const bullets = section.split('\n').filter(l => /^[-*]\s/.test(l.trim()));
            const detail = (bullets[0] || '').replace(/^[-*]\s*/, '').replace(/\*\*/g, '').substring(0, 120);
            let type = 'general';
            const lower = (title + ' ' + detail).toLowerCase();
            if (lower.includes('fix') || lower.includes('bug') || lower.includes('crash')) type = 'security';
            else if (lower.includes('build') || lower.includes('deploy') || lower.includes('dashboard') || lower.includes('setup')) type = 'development';
            else if (lower.includes('email') || lower.includes('lead')) type = 'business';
            else if (lower.includes('heartbeat')) type = 'heartbeat';
            // Use file mtime for first section, offset earlier sections by index to keep order
            const timeMs = new Date(memMtime).getTime() - idx * 60000;
            if (title) feed.push({ id: `mem-${dateStr}-${feed.length}`, type: 'memory', icon: 'file-text', title, detail: detail || 'Activity logged', time: new Date(timeMs).toISOString() });
          });
        }
      }
    } catch(e) {}

    // 6. Update available notification
    if (updateCache.updateAvailable && updateCache.updateDetail) {
      feed.push({
        id: 'update-available',
        type: 'update_available',
        icon: 'arrow-up-circle',
        title: 'OpenClaw update available',
        detail: updateCache.updateDetail,
        time: updateCache.lastChecked || new Date().toISOString(),
        actionable: true,
        actionLabel: 'Update Now',
        actionUrl: '/settings',
        pinned: true,
      });
    }

    // Sort by time (newest first), but pinned items float to top
    feed.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    });

    const result = { feed: feed.slice(0, 30), generated: new Date().toISOString() };
    const actCache = getUserCache(req.ctx.userId);
    actCache.activity = result;
    actCache.activityTime = Date.now();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== API: Tasks (Kanban) — per-user tasks ==========
// Legacy global TASKS_FILE kept for startup recovery only
const TASKS_FILE = path.join(__dirname, 'tasks.json');

app.get('/api/tasks', (req, res) => {
  try {
    res.json(req.ctx.loadTasks());
  } catch (e) {
    console.error('[Tasks API] Failed to read tasks:', e.message);
    res.json({ columns: { queue: [], inProgress: [], blocked: [], done: [] } });
  }
});

// POST: Update tasks
app.post('/api/tasks', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.columns) {
      return res.status(400).json({ error: 'Invalid format. Expected { columns: { queue, inProgress, done, ... } }' });
    }
    req.ctx.saveTasks(data);
    res.json({ ok: true, message: 'Tasks updated' });
  } catch (e) {
    console.error('[Tasks POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST: Add a single task to queue
app.post('/api/tasks/add', (req, res) => {
  try {
    const { title, description, priority, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const tasks = req.ctx.loadTasks();
    const task = {
      id: `task-${Date.now()}`,
      title,
      description: description || '',
      priority: priority || 'medium',
      created: new Date().toISOString(),
      tags: tags || [],
      source: 'manual',
    };
    tasks.columns.queue.unshift(task);
    req.ctx.saveTasks(tasks);
    res.json({ ok: true, task });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE: Remove a task from any column
app.delete('/api/tasks/:taskId', (req, res) => {
  try {
    const tasks = req.ctx.loadTasks();
    const { taskId } = req.params;
    let found = false;
    for (const col of Object.keys(tasks.columns)) {
      const idx = tasks.columns[col].findIndex(t => t.id === taskId);
      if (idx !== -1) {
        tasks.columns[col].splice(idx, 1);
        found = true;
        break;
      }
    }
    if (!found) return res.status(404).json({ error: 'Task not found' });
    req.ctx.saveTasks(tasks);
    // Clear activity cache
    const cache = getUserCache(req.ctx.userId);
    cache.activity = null; cache.activityTime = 0;
    res.json({ ok: true, deleted: taskId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Execute a task — spawns sub-agent
app.post('/api/tasks/:taskId/execute', async (req, res) => {
  try {
    const { taskId } = req.params;
    const tasks = req.ctx.loadTasks();

    // Find task in any column
    let task = null;
    let fromCol = null;
    for (const [col, items] of Object.entries(tasks.columns)) {
      const idx = items.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        task = items[idx];
        fromCol = col;
        items.splice(idx, 1);
        break;
      }
    }

    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Move to inProgress
    task.startedAt = new Date().toISOString();
    task.status = 'executing';
    tasks.columns.inProgress.unshift(task);
    req.ctx.saveTasks(tasks);

    // Use per-user gateway connection
    const gwToken = req.ctx.gatewayToken;
    const gwPort = req.ctx.gatewayPort;
    
    // Build smart prompt based on task source/content
    const title = task.title || '';
    const desc = task.description || '';
    const fullText = `${title} ${desc}`.toLowerCase();
    
    let taskPrompt;
    
    if (task.source === 'scout' && (fullText.includes('skill') || fullText.includes('plugin'))) {
      // Scout found a new skill/plugin → research & recommend
      taskPrompt = `RESEARCH TASK: A new OpenClaw skill/plugin was found by the Scout engine.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Visit the URL mentioned and read about this skill
2. Summarize what it does, who made it, and key features
3. Check if it's compatible with our setup (OpenClaw on AWS EC2, Ubuntu)
4. Give a clear recommendation: INSTALL (with instructions) or SKIP (with reason)
5. Rate usefulness 1-10 for our use case

Be thorough but concise. This report will be shown to the user.`;
    } else if (task.source === 'scout' && (fullText.includes('bounty') || fullText.includes('hackerone') || fullText.includes('bugcrowd'))) {
      // Bug bounty opportunity
      taskPrompt = `BUG BOUNTY RESEARCH: The Scout engine found a potential bounty opportunity.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Research this program/target — what's the scope, payout range, platform
2. Check if it's a new program or new scope addition
3. Identify the most promising attack surfaces
4. Estimate difficulty and potential payout
5. Give a GO/SKIP recommendation with reasoning

Be specific and actionable.`;
    } else if (task.source === 'scout' && (fullText.includes('freelance') || fullText.includes('job') || fullText.includes('hiring') || fullText.includes('looking for'))) {
      // Freelance/job opportunity
      taskPrompt = `JOB/FREELANCE RESEARCH: The Scout engine found a potential opportunity.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Research this opportunity — who's hiring, what they need, compensation
2. Check if it matches our skills (React, Next.js, Supabase, AI/ML, Python)
3. Draft a brief pitch/response if it's a good fit
4. Give an APPLY/SKIP recommendation

Be practical — focus on fit and potential earnings.`;
    } else if (task.source === 'scout' && (fullText.includes('grant') || fullText.includes('funding') || fullText.includes('competition'))) {
      // Grant/funding
      taskPrompt = `FUNDING RESEARCH: The Scout engine found a potential grant/funding opportunity.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Research eligibility, deadlines, and requirements
2. Check if Tale Forge / Kevin El-Zarka qualifies
3. Summarize the application process
4. Give an APPLY/SKIP recommendation with deadline

Be specific about requirements and timeline.`;
    } else {
      // Generic task — give it a thorough prompt
      taskPrompt = `TASK EXECUTION:

Title: ${task.title}
Description: ${task.description}

Your job:
1. Analyze what needs to be done
2. Do the work — research, write, code, whatever is needed
3. If the task requires external actions (sending emails, deploying code), describe exactly what should be done but don't do it without explicit permission
4. Provide a clear, detailed summary of results and any next steps

Be thorough. Your output will be shown directly to the user as the task result.`;
    }
    
    // Fire and forget — sub-agent runs in background
    const spawnRes = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
      body: JSON.stringify({
        tool: 'sessions_spawn',
        args: {
          task: taskPrompt,
          model: 'sonnet',
          runTimeoutSeconds: 300,
          label: `workshop-${taskId}`
        }
      })
    });
    
    const spawnData = await spawnRes.json();
    const childKey = spawnData?.result?.details?.childSessionKey || spawnData?.result?.content?.[0]?.text?.match(/"childSessionKey":\s*"([^"]+)"/)?.[1] || '';
    
    if (!childKey) {
      console.error('[Task Execute] No child session key:', JSON.stringify(spawnData));
    }
    
    // Save child session key for polling
    task.childSessionKey = childKey;
    req.ctx.saveTasks(tasks);
    
    // Poll for completion in background (capture ctx for closure)
    const ctx = req.ctx;
    if (childKey) {
      const pollInterval = setInterval(async () => {
        try {
          const listRes = await ctx.gatewayFetch('/tools/invoke', {
            method: 'POST',
            body: JSON.stringify({ tool: 'sessions_list', args: { limit: 100, messageLimit: 1 } })
          });
          const listData = await listRes.json();
          const listParsed = JSON.parse(listData?.result?.content?.[0]?.text || '{}');
          const sessions = listParsed.sessions || listParsed || [];
          const child = sessions.find(s => s.key === childKey);
          
          // Check if session is done (not found = ended, or aborted, or idle)
          const isEnded = !child || child.abortedLastRun || (child.idle && child.idle > 60);
          if (!isEnded) return; // Still running, wait for next poll
          
          clearInterval(pollInterval);
            
          // Get last message from the child session
          let resultText = '';
          try {
            const histRes = await ctx.gatewayFetch('/tools/invoke', {
              method: 'POST',
              body: JSON.stringify({ tool: 'sessions_history', args: { sessionKey: childKey, limit: 5 } })
            });
            const histData = await histRes.json();
            const histText = histData?.result?.content?.[0]?.text || '';
            // Parse messages and get last assistant message
            try {
              const msgs = JSON.parse(histText);
              const assistantMsgs = (Array.isArray(msgs) ? msgs : []).filter(m => m.role === 'assistant');
              if (assistantMsgs.length > 0) {
                const last = assistantMsgs[assistantMsgs.length - 1];
                resultText = typeof last.content === 'string' ? last.content : last.content?.[0]?.text || '';
              }
            } catch(e) {
              // Maybe it's raw text
              resultText = histText.substring(0, 2000);
            }
          } catch(e) {
            console.error('[Task Poll] History fetch failed:', e.message);
          }
          
          // If sessions_history didn't work, try reading transcript file directly
          if (!resultText) {
            try {
              const uuid = childKey.split(':').pop();
              const sessionsJson = JSON.parse(fs.readFileSync(ctx.sessionsFile, 'utf8'));
              const sessionInfo = sessionsJson[childKey];
              const sessionId = sessionInfo?.sessionId || uuid;
              const transcriptPath = path.join(ctx.sessionsDir, `${sessionId}.jsonl`);
              if (fs.existsSync(transcriptPath)) {
                const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
                // Find last assistant message
                for (let i = lines.length - 1; i >= 0; i--) {
                  try {
                    const evt = JSON.parse(lines[i]);
                    if (evt.type === 'message' && evt.message?.role === 'assistant') {
                      const content = evt.message.content;
                      resultText = Array.isArray(content) 
                        ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
                        : typeof content === 'string' ? content : '';
                      if (resultText) break;
                    }
                  } catch(e) {}
                }
              }
            } catch(e) {
              console.error('[Task Poll] Transcript read failed:', e.message);
            }
          }
          
          // Move task to done
          const tasksNow = ctx.loadTasks();
          const idx = tasksNow.columns.inProgress.findIndex(t => t.id === taskId);
          if (idx >= 0) {
            const doneTask = tasksNow.columns.inProgress.splice(idx, 1)[0];
            doneTask.status = 'done';
            doneTask.completed = new Date().toISOString();
            doneTask.result = resultText.substring(0, 3000) || 'Task completed (no output captured)';
            // Keep childSessionKey for continued chat
            tasksNow.columns.done.unshift(doneTask);
            ctx.saveTasks(tasksNow);
            console.log(`[Task Execute] ✅ ${taskId} done, result: ${resultText.substring(0, 80)}...`);
          }
        } catch(e) {
          console.error('[Task Poll] Error:', e.message);
        }
      }, 10000); // Poll every 10 seconds
      
      // Safety: stop polling after 6 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        // Check if task is still in progress
        try {
          const tasksNow = ctx.loadTasks();
          const idx = tasksNow.columns.inProgress.findIndex(t => t.id === taskId);
          if (idx >= 0) {
            const timedOut = tasksNow.columns.inProgress.splice(idx, 1)[0];
            timedOut.status = 'done';
            timedOut.completed = new Date().toISOString();
            timedOut.result = 'Task timed out after 6 minutes. Check sub-agent session for results.';
            // Keep childSessionKey for continued chat
            tasksNow.columns.done.unshift(timedOut);
            ctx.saveTasks(tasksNow);
          }
        } catch(e) {}
      }, 360000);
    }
    
    res.json({ ok: true, message: 'Task execution started', taskId, childKey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== API: Costs — Real token usage from sessions ==========
app.get('/api/costs', async (req, res) => {
  try {
    const cache = getUserCache(req.ctx.userId);
    if (cache.costs && Date.now() - cache.costsTime < COSTS_CACHE_TTL) {
      return res.json(cache.costs);
    }
    const sessionData = await fetchSessions(50, req.ctx);
    const sessions = sessionData.sessions || [];

    // Compute totals
    const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);

    // Breakdown by channel
    const byChannel = {};
    sessions.forEach(s => {
      const ch = s.channel || 'unknown';
      if (!byChannel[ch]) byChannel[ch] = { tokens: 0, sessions: 0 };
      byChannel[ch].tokens += (s.totalTokens || 0);
      byChannel[ch].sessions += 1;
    });

    // Breakdown by session type
    const byType = { main: 0, subagent: 0, discord: 0, openai: 0, other: 0 };
    sessions.forEach(s => {
      const key = s.key || '';
      const tokens = s.totalTokens || 0;
      if (key.includes(':subagent:')) byType.subagent += tokens;
      else if (key.includes(':main:main')) byType.main += tokens;
      else if (key.includes(':discord:')) byType.discord += tokens;
      else if (key.includes(':openai')) byType.openai += tokens;
      else byType.other += tokens;
    });

    // Build byService from real data (Bedrock = $0, but show token volume)
    const byService = Object.entries(byChannel)
      .filter(([_, v]) => v.tokens > 0)
      .map(([name, v]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        cost: 0,
        tokens: v.tokens,
        sessions: v.sessions,
        percentage: totalTokens > 0 ? Math.round((v.tokens / totalTokens) * 100) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    // Daily token estimates — group sessions by last updated date
    const dailyMap = {};
    sessions.forEach(s => {
      if (s.updatedAt) {
        const day = new Date(s.updatedAt).toISOString().split('T')[0];
        if (!dailyMap[day]) dailyMap[day] = 0;
        dailyMap[day] += (s.totalTokens || 0);
      }
    });

    // Fill in last 7 days
    const daily = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      daily.push({
        date: dateStr,
        total: 0,
        tokens: dailyMap[dateStr] || 0,
        breakdown: {
          [`${req.ctx.defaultModelName} (${req.ctx.defaultProviderName})`]: 0,
        }
      });
    }

        const costsResult = {
      daily,
      summary: {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        totalTokens,
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => (s.totalTokens || 0) > 0).length,
        note: `LLM costs: ${req.ctx.defaultProviderName} (${req.ctx.defaultModelName}) included in subscription. Claude Code sessions use Anthropic Max plan.`,
        budget: { monthly: 0, warning: 0 }
      },
      byService,
      byType,
      byChannel,
      budget: mcConfig.budget || { monthly: 0 }
    };
    cache.costs = costsResult;
    cache.costsTime = Date.now();
    res.json(costsResult);
  } catch (e) {
    console.error('[Costs API]', e.message);
    res.json({
      daily: [],
      summary: { today: 0, thisWeek: 0, thisMonth: 0, totalTokens: 0, budget: { monthly: 0, warning: 0 } },
      byService: [],
      byType: {},
      byChannel: {},
      budget: mcConfig.budget || { monthly: 0 },
      error: e.message,
    });
  }
});

// ========== API: Budget Setting (admin only — modifies server-wide config) ==========
app.post('/api/settings/budget', requireAdmin, (req, res) => {
  try {
    mcConfig.budget = { monthly: req.body.monthly || 0 };
    fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(mcConfig, null, 2));
    res.json({ status: 'saved', budget: mcConfig.budget });
  } catch (e) {
    console.error('[Budget API]', e.message);
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// ========== API: Scout — Real SmålandWebb lead data ==========
app.get('/api/scout', (req, res) => {
  try {
    const scoutData = req.ctx.loadScoutResults();

    // Filter out junk (score < 15)
    const opportunities = (scoutData.opportunities || []).filter(o => o.score >= 15);

    res.json({
      opportunities,
      lastScan: scoutData.lastScan || null,
      queryCount: scoutData.queryCount || 0,
      stats: {
        total: opportunities.length,
        new: opportunities.filter(o => o.status === 'new').length,
        deployed: opportunities.filter(o => o.status === 'deployed').length,
        dismissed: opportunities.filter(o => o.status === 'dismissed').length,
        avgScore: opportunities.length ? Math.round(opportunities.reduce((a, o) => a + o.score, 0) / opportunities.length) : 0,
      },
    });
  } catch (e) {
    console.error('[Scout API]', e.message);
    res.json({ opportunities: [], stats: {}, error: e.message });
  }
});

// Scout: Deploy opportunity → adds to Workshop tasks
app.post('/api/scout/deploy', (req, res) => {
  try {
    const { opportunityId } = req.body;
    if (!opportunityId) return res.status(400).json({ error: 'Missing opportunityId' });

    const scoutData = req.ctx.loadScoutResults();
    const opp = scoutData.opportunities.find(o => o.id === opportunityId);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    opp.status = 'deployed';
    req.ctx.saveScoutResults(scoutData);

    // Add to user's tasks queue
    const tasks = req.ctx.loadTasks();
    tasks.columns.queue.unshift({
      id: `scout-${Date.now()}`,
      title: opp.title.substring(0, 80),
      description: `${opp.summary}\n\nSource: ${opp.source} | Score: ${opp.score}\nURL: ${opp.url}`,
      priority: opp.score >= 80 ? 'high' : opp.score >= 50 ? 'medium' : 'low',
      created: new Date().toISOString(),
      tags: opp.tags || [opp.category],
      source: 'scout',
    });
    req.ctx.saveTasks(tasks);

    res.json({ ok: true, task: tasks.columns.queue[0] });
  } catch (e) {
    console.error('[Scout deploy]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Scout: Dismiss opportunity
app.post('/api/scout/dismiss', (req, res) => {
  try {
    const { opportunityId } = req.body;
    const scoutData = req.ctx.loadScoutResults();
    const opp = scoutData.opportunities.find(o => o.id === opportunityId);
    if (opp) {
      opp.status = 'dismissed';
      req.ctx.saveScoutResults(scoutData);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scout: Start scan
let scoutScanRunning = false;
app.post('/api/scout/scan', (req, res) => {
  try {
    if (scoutScanRunning) {
      return res.json({ status: 'already_scanning', message: 'Scout scan is already running' });
    }

    scoutScanRunning = true;
    const { execFile } = require('child_process');
    
    execFile('node', [path.join(__dirname, 'scout-engine.js')], { timeout: 300000 }, (error, stdout, stderr) => {
      scoutScanRunning = false;
      if (error) {
        console.error('[Scout scan]', error.message);
      } else {
        console.log('[Scout scan] Completed successfully');
      }
    });

    res.json({ status: 'scanning', message: 'Scout scan started in background' });
  } catch (e) {
    scoutScanRunning = false;
    res.status(500).json({ error: e.message });
  }
});

// Scout: Check scan status
app.get('/api/scout/status', (req, res) => {
  res.json({ 
    scanning: scoutScanRunning,
    status: scoutScanRunning ? 'scanning' : 'idle'
  });
});

// ========== API: Agents — Real from gateway sessions + custom agents ==========
app.get('/api/agents', async (req, res) => {
  try {
    const sessionData = await fetchSessions(50, req.ctx);
    const sessions = sessionData.sessions || [];

    // Load custom agents from per-user agents-custom.json
    const customAgents = req.ctx.loadCustomAgents();

    // Primary agent) = main session
    const mainSession = sessions.find(s => s.key === 'agent:main:main');
    const activeSessions = sessions.filter(s => (s.totalTokens || 0) > 0);

    // Build agents list
    const agents = [];

    // Primary agent — read name from user's IDENTITY.md
    let primaryName = 'Agent';
    try { const id = fs.readFileSync(path.join(req.ctx.workspacePath, 'IDENTITY.md'), 'utf8'); const m = id.match(/\*\*Name:\*\*\s*(.+)/); if (m) primaryName = m[1].trim(); } catch {}
    agents.push({
      id: 'primary',
      name: primaryName,
      role: 'Commander',
      avatar: '💻',
      status: 'active',
      model: mainSession ? (mainSession.model || req.ctx.defaultModelName).replace('hf:moonshotai/', '').replace(/-/g, ' ') : req.ctx.defaultModelName,
      description: 'Primary AI agent. Manages all operations, communications, and development tasks.',
      lastActive: mainSession?.updatedAt ? new Date(mainSession.updatedAt).toISOString() : new Date().toISOString(),
      totalTokens: mainSession?.totalTokens || 0,
      sessionKey: 'agent:main:main',
    });

    // Add custom agents
    customAgents.forEach(agent => {
      agents.push({
        id: agent.id,
        name: agent.name,
        role: 'Custom Agent',
        avatar: '⚙️',
        status: agent.status || 'active',
        model: agent.model,
        description: agent.description || 'Custom agent',
        lastActive: null,
        totalTokens: 0,
        sessionKey: null,
        isCustom: true,
        systemPrompt: agent.systemPrompt,
        skills: agent.skills,
        created: agent.created
      });
    });

    // Sub-agents from real sessions
    const subagentSessions = sessions.filter(s => s.key.includes(':subagent:'));
    subagentSessions.forEach(s => {
      agents.push({
        id: s.sessionId || s.key,
        name: s.label || `Sub-agent ${s.key.split(':').pop().substring(0, 8)}`,
        role: 'Sub-Agent',
        avatar: '⚡',
        status: (s.totalTokens || 0) > 0 ? 'active' : 'idle',
        model: (s.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
        description: s.label ? `Task: ${s.label}` : 'Spawned sub-agent',
        lastActive: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        totalTokens: s.totalTokens || 0,
        sessionKey: s.key,
      });
    });

    // Discord channel sessions as "channel agents"
    const discordSessions = sessions
      .filter(s => s.key.includes(':discord:channel:') && (s.totalTokens || 0) > 0)
      .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));

    discordSessions.forEach(s => {
      // Extract readable name from displayName
      const name = (s.displayName || '').replace(/^discord:\d+#/, '') || s.key.split(':').pop();
      agents.push({
        id: s.sessionId || s.key,
        name: `#${name}`,
        role: 'Channel Session',
        avatar: '💬',
        status: 'active',
        model: (s.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
        description: `Discord channel session`,
        lastActive: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        totalTokens: s.totalTokens || 0,
        sessionKey: s.key,
      });
    });

    // Mission Control chat session (merge multiple into one)
    const mcSessions = sessions.filter(s => s.key.includes(':openai'));
    const mcTotalTokens = mcSessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
    if (mcTotalTokens > 0) {
      const latestMc = mcSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      agents.push({
        id: 'mission-control',
        name: 'Mission Control Chat',
        role: 'Interface',
        avatar: '🖥️',
        status: 'active',
        model: (latestMc?.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
        description: `Chat sessions from Mission Control dashboard (${mcSessions.length} sessions)`,
        lastActive: latestMc?.updatedAt ? new Date(latestMc.updatedAt).toISOString() : null,
        totalTokens: mcTotalTokens,
        sessionKey: 'openai-users',
      });
    }

    // No fake conversations — just show real session activity
    const conversations = [];

    res.json({ agents, conversations });
  } catch (e) {
    console.error('[Agents API]', e.message);
    res.json({
      agents: [
        { id: 'primary', name: (() => { try { const id = fs.readFileSync(path.join(req.ctx.workspacePath, 'IDENTITY.md'), 'utf8'); const m = id.match(/\*\*Name:\*\*\s*(.+)/); return m ? m[1].trim() : 'Agent'; } catch { return 'Agent'; } })(), role: 'Commander', avatar: '💻', status: 'active', model: `${req.ctx.defaultModelName} (${req.ctx.defaultProviderName})`, description: 'Primary agent (session data unavailable)', lastActive: new Date().toISOString(), totalTokens: 0 }
      ],
      conversations: [],
      error: e.message
    });
  }
});

// Create custom agent
app.post('/api/agents/create', (req, res) => {
  try {
    const { name, description, model, systemPrompt, skills } = req.body;
    if (!name || !model) {
      return res.status(400).json({ error: 'name and model are required' });
    }

    const agents = req.ctx.loadCustomAgents();
    const agent = {
      id: `custom-${Date.now()}`,
      name,
      description: description || '',
      model,
      systemPrompt: systemPrompt || '',
      skills: skills || [],
      created: new Date().toISOString(),
      status: 'active'
    };

    agents.push(agent);
    req.ctx.saveCustomAgents(agents);

    res.json({ ok: true, agent });
  } catch (error) {
    console.error('[Create Agent]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Settings API endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const configData = req.ctx.readOpenclawConfig();

    const modelConfig = configData.agents?.defaults?.model || {};
    const sanitized = {
      model: modelConfig.primary || configData.model || 'unknown',
      modelFallbacks: modelConfig.fallbacks || [],
      gateway_port: req.ctx.gatewayPort,
      memory_path: req.ctx.memoryPath,
      skills_path: SKILLS_PATH,
      bedrock_region: S3_REGION
    };

    res.json(sanitized);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Skills API endpoints
app.get('/api/skills', async (req, res) => {
  try {
    const installed = [];
    const available = [];

    // Read OpenClaw config for installed skills
    const config = req.ctx.readOpenclawConfig();

    // Get installed skills from config
    if (config.skills && config.skills.entries) {
      for (const [name, skillConfig] of Object.entries(config.skills.entries)) {
        installed.push({
          name,
          description: skillConfig.description || 'No description',
          status: skillConfig.enabled !== false ? 'active' : 'inactive',
          installed: true,
          path: skillConfig.path,
          type: skillConfig.path?.includes('/usr/lib') ? 'system' : 'workspace'
        });
      }
    }

    // Scan workspace skills directory
    const workspaceSkillsPath = SKILLS_PATH;
    if (fs.existsSync(workspaceSkillsPath)) {
      const dirs = fs.readdirSync(workspaceSkillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const dir of dirs) {
        const skillPath = path.join(workspaceSkillsPath, dir);
        const isInstalled = installed.some(s => s.name === dir);

        if (!isInstalled) {
          // Check for package.json or skill.json
          let skillInfo = { name: dir, description: 'Workspace skill' };
          const packagePath = path.join(skillPath, 'package.json');
          const skillJsonPath = path.join(skillPath, 'skill.json');

          if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            skillInfo.description = pkg.description || skillInfo.description;
            skillInfo.version = pkg.version;
            skillInfo.author = pkg.author;
          } else if (fs.existsSync(skillJsonPath)) {
            const skill = JSON.parse(fs.readFileSync(skillJsonPath, 'utf8'));
            skillInfo.description = skill.description || skillInfo.description;
            skillInfo.version = skill.version;
          }

          available.push({
            ...skillInfo,
            status: 'available',
            installed: false,
            path: skillPath,
            type: 'workspace'
          });
        }
      }
    }

    // Scan system skills directory
    const systemSkillsPath = '/usr/lib/node_modules/openclaw/skills';
    if (fs.existsSync(systemSkillsPath)) {
      const dirs = fs.readdirSync(systemSkillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const dir of dirs) {
        const skillPath = path.join(systemSkillsPath, dir);
        const isInstalled = installed.some(s => s.name === dir);

        if (!isInstalled) {
          available.push({
            name: dir,
            description: 'System skill',
            status: 'available',
            installed: false,
            path: skillPath,
            type: 'system'
          });
        }
      }
    }

    res.json({ installed, available });
  } catch (error) {
    console.error('Skills error:', error);
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

app.post('/api/skills/:name/toggle', async (req, res) => {
  try {
    const { name } = req.params;

    const config = req.ctx.readOpenclawConfig();
    if (!config.skills) config.skills = { entries: {} };

    if (config.skills?.entries?.[name]) {
      config.skills.entries[name].enabled = !config.skills.entries[name].enabled;
      req.ctx.writeOpenclawConfig(config);

      // Notify gateway about config change
      await req.ctx.gatewayFetch('/config/reload', { method: 'POST' });

      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Skill not found' });
    }
  } catch (error) {
    console.error('Skill toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle skill' });
  }
});

app.post('/api/skills/:name/install', async (req, res) => {
  // Simplified install - just add to config
  try {
    const { name } = req.params;
    res.status(501).json({ error: 'Skill installation not yet implemented — manage skills via openclaw CLI' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to install skill' });
  }
});

app.post('/api/skills/:name/uninstall', async (req, res) => {
  // Simplified uninstall - just remove from config
  try {
    const { name } = req.params;
    res.status(501).json({ error: 'Skill uninstall not yet implemented — manage skills via openclaw CLI' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to uninstall skill' });
  }
});

// AWS API endpoints
app.get('/api/aws/services', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    // Real account info
    let account = { id: '239541130189', region: 'us-east-1' };
    try {
      const { stdout } = await execPromise('aws sts get-caller-identity --output json 2>/dev/null');
      const sts = JSON.parse(stdout);
      account.id = sts.Account;
      account.user = sts.Arn.split('/').pop();
    } catch (e) { console.error('[AWS] STS identity error:', e.message); }

    // Real services — check what's actually accessible
    const services = [];
    const checks = [
      { name: 'Amazon Bedrock', cmd: 'aws bedrock list-foundation-models --query "length(modelSummaries)" --output text 2>/dev/null', desc: 'Foundation models (Opus, Sonnet, Haiku)', parse: (v) => `${v.trim()} models available` },
      { name: 'Amazon Polly', cmd: 'aws polly describe-voices --query "length(Voices)" --output text 2>/dev/null', desc: 'Text-to-speech (Neural voices)', parse: (v) => `${v.trim()} voices` },
      { name: 'Amazon Transcribe', cmd: 'aws transcribe list-transcription-jobs --max-results 1 --output json 2>/dev/null', desc: 'Speech-to-text', parse: () => 'Ready' },
      { name: 'Amazon Translate', cmd: 'aws translate list-languages --query "length(Languages)" --output text 2>/dev/null', desc: 'Translation (75+ languages)', parse: (v) => `${v.trim()} languages` },
      { name: 'Amazon S3', cmd: S3_BUCKET ? `aws s3api head-bucket --bucket ${S3_BUCKET} 2>/dev/null && echo ok` : 'echo none', desc: `Storage (${S3_BUCKET || 'not configured'})`, parse: () => S3_BUCKET ? 'Bucket active' : 'Not configured' },
    ];

    for (const svc of checks) {
      try {
        const { stdout } = await execPromise(svc.cmd, { timeout: 5000 });
        services.push({ name: svc.name, status: 'active', description: svc.desc, detail: svc.parse(stdout) });
      } catch {
        services.push({ name: svc.name, status: 'available', description: svc.desc, detail: 'Not tested' });
      }
    }

    res.json({
      account,
      services,
      credits: { total: 25000, note: 'AWS Activate credits' },
    });
  } catch (error) {
    console.error('AWS services error:', error);
    res.status(500).json({ error: 'Failed to load AWS services' });
  }
});

app.get('/api/aws/bedrock-models', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const { stdout } = await execPromise('aws bedrock list-foundation-models --query "modelSummaries[?modelLifecycle.status==\'ACTIVE\'].{modelId:modelId,modelName:modelName,provider:providerName,input:inputModalities,output:outputModalities}" --output json 2>/dev/null', { timeout: 10000 });
    const models = JSON.parse(stdout || '[]');
    res.json(models.map(m => ({
      modelId: m.modelId,
      modelName: m.modelName,
      provider: m.provider,
      status: 'ACTIVE',
      inputModalities: m.input,
      outputModalities: m.output,
    })));
  } catch (error) {
    console.error('Bedrock models error:', error);
    res.status(500).json({ error: 'Failed to load Bedrock models' });
  }
});

app.get('/api/models', async (req, res) => {
  // List available models from OpenClaw config
  try {
    const config = req.ctx.readOpenclawConfig();
    const modelConfig = config.agents?.defaults?.model || {};
    const modelDefs = config.agents?.defaults?.models || {};

    const models = [];
    const formatModel = (id) => {
      const alias = modelDefs[id]?.alias;
      const short = id.replace(/^synthetic\/hf:/, '').replace(/^us\.anthropic\./, '');
      return { id, name: alias || short };
    };

    if (modelConfig.primary) models.push(formatModel(modelConfig.primary));
    for (const fb of (modelConfig.fallbacks || [])) {
      models.push(formatModel(fb));
    }

    // If no models found in config, return empty
    res.json(models.length > 0 ? models : [{ id: 'unknown', name: 'No models configured' }]);
  } catch (e) {
    res.status(500).json([{ id: 'error', name: 'Failed to read config' }]);
  }
});

// Switch agent model via gateway config
app.post('/api/model', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model required' });

    const config = req.ctx.readOpenclawConfig();

    // Set the default model
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.default = model;

    req.ctx.writeOpenclawConfig(config);

    // Signal gateway to reload config (safe: no shell interpolation)
    try {
      const { execFileSync } = require('child_process');
      const pids = execFileSync('pgrep', ['-f', 'openclaw-gateway'], { timeout: 5000 }).toString().trim().split('\n');
      for (const pid of pids) {
        if (/^\d+$/.test(pid)) process.kill(Number(pid), 'SIGUSR1');
      }
    } catch (e) { console.error('[Model] Gateway signal error:', e.message); }

    res.json({ ok: true, model, message: `Model switched to ${model}` });
  } catch (error) {
    console.error('Model switch error:', error);
    res.status(500).json({ error: 'Failed to switch model' });
  }
});

// Generate image via Bedrock → save to S3
const S3_PREFIX = 'images/mc-generated';

app.post('/api/aws/generate-image', async (req, res) => {
  try {
    const { modelId, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const timestamp = Date.now();

    // Build payload based on model provider
    let payload;
    if (modelId.startsWith('amazon.nova-canvas') || modelId.startsWith('amazon.titan-image')) {
      payload = {
        taskType: 'TEXT_IMAGE',
        textToImageParams: { text: prompt },
        imageGenerationConfig: { numberOfImages: 1, height: 1024, width: 1024 }
      };
    } else if (modelId.startsWith('stability.')) {
      payload = {
        prompt: prompt,
        mode: 'text-to-image',
        output_format: 'png'
      };
    } else {
      return res.status(400).json({ error: `Unsupported image model: ${modelId}` });
    }

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const outFile = `/tmp/mc-image-${timestamp}.json`;

    await execPromise(
      `aws bedrock-runtime invoke-model --model-id "${modelId}" --content-type "application/json" --accept "application/json" --body "${payloadB64}" ${outFile}`,
      { timeout: 60000 }
    );

    // Parse response and save image
    const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    let imageB64;
    if (result.images && result.images[0]) {
      imageB64 = result.images[0];
    } else if (result.image) {
      imageB64 = result.image;
    } else {
      return res.status(500).json({ error: 'No image in response', keys: Object.keys(result) });
    }

    // Save locally first, then upload to S3
    const slug = prompt.replace(/[^a-zA-Z0-9]+/g, '-').substring(0, 40).toLowerCase();
    const filename = `${timestamp}-${slug}.png`;
    const localPath = `/tmp/mc-image-${timestamp}.png`;
    fs.writeFileSync(localPath, Buffer.from(imageB64, 'base64'));

    const s3Key = `${S3_PREFIX}/${filename}`;
    await execPromise(`aws s3 cp "${localPath}" "s3://${S3_BUCKET}/${s3Key}" --content-type image/png`, { timeout: 30000 });

    // Clean up local temp files
    try { fs.unlinkSync(outFile); } catch {}

    res.json({
      ok: true,
      message: `Image generated and saved to S3!`,
      imageUrl: `/api/aws/image/${timestamp}`,
      s3: `s3://${S3_BUCKET}/${s3Key}`,
    });
  } catch (error) {
    console.error('Image gen error:', error);
    res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// Serve generated images (local cache)
app.get('/api/aws/image/:id', (req, res) => {
  const imgPath = `/tmp/mc-image-${req.params.id}.png`;
  if (fs.existsSync(imgPath)) {
    res.type('png').sendFile(imgPath);
  } else {
    res.status(404).json({ error: 'Image not found locally — check S3' });
  }
});

// List all generated images from S3
app.get('/api/aws/gallery', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const { stdout } = await execPromise(`aws s3api list-objects-v2 --bucket ${S3_BUCKET} --prefix "${S3_PREFIX}/" --output json 2>/dev/null`, { timeout: 10000 });
    const data = JSON.parse(stdout);
    const images = (data.Contents || [])
      .filter(o => o.Key.endsWith('.png'))
      .map(o => {
        const filename = o.Key.split('/').pop();
        const id = filename.split('-')[0];
        return {
          id,
          url: `/api/aws/s3-image/${encodeURIComponent(o.Key)}`,
          created: o.LastModified,
          size: o.Size,
          s3Key: o.Key,
        };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    res.json({ images });
  } catch (error) {
    // Fallback to local /tmp
    try {
      const files = fs.readdirSync('/tmp')
        .filter(f => f.startsWith('mc-image-') && f.endsWith('.png'))
        .map(f => {
          const id = f.replace('mc-image-', '').replace('.png', '');
          const stat = fs.statSync(`/tmp/${f}`);
          return { id, url: `/api/aws/image/${id}`, created: stat.mtime.toISOString(), size: stat.size };
        })
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      res.json({ images: files });
    } catch { res.json({ images: [] }); }
  }
});

// Proxy S3 images (with path/injection validation)
app.get('/api/aws/s3-image/:key(*)', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    // Block path traversal and shell metacharacters
    if (/\.\./.test(key) || /[;|&$`\\]/.test(key)) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    const safeName = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localCache = `/tmp/s3-cache-${safeName}`;
    if (!fs.existsSync(localCache)) {
      const { execFileSync } = require('child_process');
      execFileSync('aws', ['s3', 'cp', `s3://${S3_BUCKET}/${key}`, localCache], { timeout: 15000 });
    }
    res.type('png').sendFile(localCache);
  } catch (error) {
    res.status(404).json({ error: 'Image not found' });
  }
});

// ========== API: Config (public, secrets stripped) ==========
app.get('/api/config', (req, res) => {
  // Deep clone to avoid mutating mcConfig
  const safe = JSON.parse(JSON.stringify(mcConfig));
  if (safe.gateway) safe.gateway = { port: req.ctx ? req.ctx.gatewayPort : safe.gateway.port };
  if (safe.notion) delete safe.notion.token;
  if (safe.scout) delete safe.scout.braveApiKey;
  // Include per-user paths
  if (req.ctx) {
    safe.workspace = req.ctx.workspacePath;
    safe.memoryPath = req.ctx.memoryPath;

    // Per-user agent name from IDENTITY.md
    try {
      const identity = fs.readFileSync(path.join(req.ctx.workspacePath, 'IDENTITY.md'), 'utf8');
      const nameMatch = identity.match(/\*\*Name:\*\*\s*(.+)/);
      if (nameMatch) {
        const agentName = nameMatch[1].trim();
        safe.name = agentName + ' Mission Control';
        safe.subtitle = 'Sauce Command Center';
      }
    } catch { /* keep global defaults */ }
  }
  // Include user info for the frontend
  safe.user = req.user;
  res.json(safe);
});

// ========== API: Setup (first-time configuration) ==========
// GET: Return current setup status
app.get('/api/setup', async (req, res) => {
  try {
    // Check if gateway is running
    let gatewayRunning = false;
    let gatewayVersion = '';
    try {
      const response = await req.ctx.gatewayFetch('/status', { method: 'GET' });
      if (response.ok) {
        gatewayRunning = true;
        const status = await response.json();
        gatewayVersion = status.version || '';
      }
    } catch {
      gatewayRunning = false;
    }

    // Check if setup is needed (config doesn't exist OR equals default)
    let needsSetup = !fs.existsSync(MC_CONFIG_PATH);
    if (!needsSetup && fs.existsSync(MC_DEFAULT_CONFIG_PATH)) {
      const currentConfig = fs.readFileSync(MC_CONFIG_PATH, 'utf8');
      const defaultConfig = fs.readFileSync(MC_DEFAULT_CONFIG_PATH, 'utf8');
      needsSetup = currentConfig === defaultConfig;
    }

    // Detect OpenClaw config
    let detectedConfig = {
      model: '',
      channels: [],
      agentName: '',
      workspacePath: ''
    };

    try {
      const openclawConfigPath = req.ctx.openclawConfigPath;
      if (fs.existsSync(openclawConfigPath)) {
        const openclawConfig = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'));
        detectedConfig.model = openclawConfig.agents?.defaults?.model?.primary || '';
        detectedConfig.workspacePath = openclawConfig.agents?.defaults?.workspace || '';
        
        // Extract gateway auth token
        detectedConfig.gatewayToken = openclawConfig.gateway?.auth?.token || openclawConfig.gateway?.http?.auth?.token || '';
        
        // Extract enabled channels
        if (openclawConfig.channels) {
          detectedConfig.channels = Object.keys(openclawConfig.channels).filter(channel => 
            openclawConfig.channels[channel]?.enabled !== false
          );
        }
        
        // Try to detect agent name from IDENTITY.md or SOUL.md
        const ws = detectedConfig.workspacePath || req.ctx.workspacePath;
        try {
          const identity = fs.readFileSync(path.join(ws, 'IDENTITY.md'), 'utf8');
          const nameMatch = identity.match(/\*\*Name:\*\*\s*(.+)/);
          if (nameMatch) detectedConfig.agentName = nameMatch[1].trim();
          else detectedConfig.agentName = 'OpenClaw Agent';
        } catch {
          detectedConfig.agentName = 'OpenClaw Agent';
        }
      }
    } catch (e) {
      console.warn('Could not read OpenClaw config:', e.message);
    }

    res.json({
      needsSetup,
      gatewayRunning,
      gatewayPort: req.ctx.gatewayPort,
      gatewayVersion,
      detectedConfig
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Update setup configuration (admin only — modifies server-wide mc-config.json)
app.post('/api/setup', requireAdmin, (req, res) => {
  try {
    const { dashboardName, gateway, modules, scout } = req.body;
    
    // Update dashboard name
    if (dashboardName) {
      mcConfig.name = dashboardName;
      mcConfig.subtitle = dashboardName;
    }
    
    // Update gateway config
    if (gateway && typeof gateway === 'object') {
      if (gateway.port) mcConfig.gateway.port = gateway.port;
      if (gateway.token) mcConfig.gateway.token = gateway.token;
    }
    
    // Update modules
    if (modules && typeof modules === 'object') {
      mcConfig.modules = { ...mcConfig.modules, ...modules };
    }
    
    // Update scout config
    if (scout && typeof scout === 'object') {
      mcConfig.scout = { ...mcConfig.scout, ...scout };
    }

    // Write the updated config
    fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(mcConfig, null, 2));
    
    // Clear old scout results so fresh scan uses new queries
    const scoutResultsPath = path.join(__dirname, 'scout-results.json');
    if (fs.existsSync(scoutResultsPath)) {
      fs.writeFileSync(scoutResultsPath, JSON.stringify({ results: [], lastScan: null, queries: scout?.queries?.length || 0 }, null, 2));
      console.log('[Setup] Cleared scout results for fresh scan');
    }
    
    // Auto-trigger first scout scan in background (if scout enabled and queries exist)
    if (scout?.enabled && scout?.queries?.length) {
      setTimeout(() => {
        try {
          const { execFile } = require('child_process');
          execFile('node', [path.join(__dirname, 'scout-engine.js')], { timeout: 60000 }, (err) => {
            if (err) console.error('[Setup] Scout scan failed:', err.message);
            else console.log('[Setup] First scout scan completed');
          });
        } catch (e) { console.warn('[Setup] Could not trigger scout scan'); }
      }, 1000);
    }
    
    // Return sanitized config
    const safe = JSON.parse(JSON.stringify(mcConfig));
    if (safe.gateway) safe.gateway = { port: safe.gateway.port };
    if (safe.notion) delete safe.notion.token;
    if (safe.scout) delete safe.scout.braveApiKey;
    
    res.json({ success: true, config: safe });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AWS Cost Explorer — real spending data
app.get('/api/aws/costs', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    // Get current month daily breakdown by service
    const startDate = new Date();
    startDate.setDate(1);
    const start = startDate.toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];

    const { stdout } = await execPromise(
      `aws ce get-cost-and-usage --time-period Start=${start},End=${end} --granularity DAILY --metrics BlendedCost --group-by Type=DIMENSION,Key=SERVICE --output json 2>/dev/null`,
      { timeout: 15000 }
    );
    const data = JSON.parse(stdout);

    // Parse into daily totals + service breakdown
    const services = {};
    const daily = [];
    let total = 0;

    for (const r of (data.ResultsByTime || [])) {
      const day = r.TimePeriod.Start;
      let dayTotal = 0;
      for (const g of (r.Groups || [])) {
        const svc = g.Keys[0];
        const amt = parseFloat(g.Metrics.BlendedCost.Amount);
        if (amt > 0.001) {
          services[svc] = (services[svc] || 0) + amt;
          dayTotal += amt;
        }
      }
      daily.push({ date: day, cost: Math.round(dayTotal * 100) / 100 });
      total += dayTotal;
    }

    // Sort services by cost
    const serviceList = Object.entries(services)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost);

    res.json({
      period: { start, end },
      total: Math.round(total * 100) / 100,
      daily,
      services: serviceList,
      credits: 25000,
      remaining: Math.round((25000 - total) * 100) / 100,
    });
  } catch (error) {
    console.error('AWS costs error:', error);
    res.status(500).json({ error: 'Failed to load cost data' });
  }
});

// === Session History ===
app.get('/api/sessions/:sessionKey/history', async (req, res) => {
  try {
    const sessionKey = decodeURIComponent(req.params.sessionKey);

    // First get session info to find transcriptPath
    const listRes = await req.ctx.gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ tool: 'sessions_list', input: { limit: 100, messageLimit: 0 } })
    });
    
    if (!listRes.ok) return res.json({ messages: [] });
    
    const listData = await listRes.json();
    const listText = listData?.result?.content?.[0]?.text || '{}';
    const parsed = JSON.parse(listText);
    const session = (parsed.sessions || []).find((s) => s.key === sessionKey);
    
    if (!session?.transcriptPath) return res.json({ messages: [], info: 'No transcript found' });
    
    // Read JSONL transcript (validate path stays within sessions dir)
    const transcriptDir = req.ctx.sessionsDir;
    const transcriptFile = path.resolve(transcriptDir, session.transcriptPath);
    if (!transcriptFile.startsWith(transcriptDir + path.sep)) {
      return res.status(400).json({ messages: [], error: 'Invalid transcript path' });
    }

    if (!fs.existsSync(transcriptFile)) return res.json({ messages: [], info: 'Transcript file missing' });
    
    const lines = fs.readFileSync(transcriptFile, 'utf8').split('\n').filter(Boolean);
    const messages = [];
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'message' || !entry.message) continue;
        const msg = entry.message;
        const role = msg.role;
        if (!role || role === 'toolResult' || role === 'toolUse') continue;
        
        // Extract text from content array or string
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter(c => c.type === 'text')
            .map(c => c.text || '')
            .join('\n');
        }
        
        if (text.trim()) {
          messages.push({ role, content: text.substring(0, 3000), ts: entry.timestamp });
        }
      } catch {}
    }
    
    // Return last 50 messages
    res.json({ messages: messages.slice(-50), total: messages.length, sessionKey });
  } catch (err) {
    res.json({ messages: [], error: err.message });
  }
});

// Send message to a session
app.post('/api/sessions/:sessionKey/send', async (req, res) => {
  try {
    const sessionKey = decodeURIComponent(req.params.sessionKey);
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s max

    try {
      const response = await req.ctx.gatewayFetch('/tools/invoke', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          tool: 'sessions_send',
          args: { sessionKey, message, timeoutSeconds: 90 }
        })
      });
      
      clearTimeout(timeout);
      const data = await response.json();
      let resultText = data?.result?.content?.[0]?.text || '';
      
      // sessions_send returns JSON with {reply: "..."} — extract the reply
      try {
        const parsed = JSON.parse(resultText);
        if (parsed.reply) resultText = parsed.reply;
      } catch(e) {
        // Not JSON, use as-is
      }
      
      res.json({ ok: !!resultText, result: resultText });
    } catch (fetchErr) {
      clearTimeout(timeout);
      
      // If timed out, try reading last message from transcript
      let resultText = '';
      try {
        const sessions = fs.existsSync(req.ctx.sessionsFile) ? JSON.parse(fs.readFileSync(req.ctx.sessionsFile, 'utf8')) : {};
        const sessionInfo = sessions[sessionKey] || {};
        const sessionId = sessionInfo.sessionId || '';
        if (sessionId) {
          const transcriptPath = path.join(req.ctx.sessionsDir, `${sessionId}.jsonl`);
          if (fs.existsSync(transcriptPath)) {
            const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
              try {
                const evt = JSON.parse(lines[i]);
                if (evt.type === 'message' && evt.message?.role === 'assistant') {
                  const content = evt.message.content;
                  resultText = Array.isArray(content) 
                    ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
                    : typeof content === 'string' ? content : '';
                  if (resultText) break;
                }
              } catch(e) {}
            }
          }
        }
      } catch(e) {}
      
      if (resultText) {
        res.json({ ok: true, result: resultText });
      } else {
        res.json({ ok: false, result: 'Response is taking longer than expected. The agent is still working — check back in a moment.' });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Close session endpoint — per-user hidden sessions
app.delete('/api/sessions/:key/close', async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const hiddenSessions = req.ctx.loadHiddenSessions();
  if (!hiddenSessions.includes(key)) {
    hiddenSessions.push(key);
    req.ctx.saveHiddenSessions(hiddenSessions);
  }
  // Clear sessions cache so next fetch excludes this session
  const cache = getUserCache(req.ctx.userId);
  cache.sessions = null; cache.sessionsTime = 0;
  res.json({ status: 'hidden', message: `Session "${key}" hidden from view` });
});

// === Document Management ===
// Global docsDir + upload kept for compatibility; routes use per-user dirs
const docsDir = path.join(__dirname, 'documents');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const upload = multer({ dest: path.join(__dirname, 'data', '.tmp'), limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/docs', (req, res) => {
  try {
    const userDocsDir = req.ctx.documentsDir;
    const files = fs.readdirSync(userDocsDir).filter(f => !f.startsWith('.'));
    const documents = files.map(f => {
      const stat = fs.statSync(path.join(userDocsDir, f));
      const ext = path.extname(f).replace('.', '');
      const sizeBytes = stat.size;
      const size = sizeBytes > 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` 
        : sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` 
        : `${sizeBytes} B`;
      // Rough chunk estimate: ~500 chars per chunk
      const chunks = Math.max(1, Math.round(sizeBytes / 500));
      return { id: f, name: f, type: ext, size, sizeBytes, chunks, modified: stat.mtime.toISOString() };
    });
    res.json({ documents, total: documents.length });
  } catch (err) {
    res.json({ documents: [], total: 0 });
  }
});

app.post('/api/docs/upload', upload.array('files', 20), (req, res) => {
  try {
    const userDocsDir = req.ctx.documentsDir;
    const uploaded = [];
    for (const file of (req.files || [])) {
      const dest = path.join(userDocsDir, file.originalname);
      fs.renameSync(file.path, dest);
      uploaded.push(file.originalname);
    }
    res.json({ ok: true, uploaded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== NEW DASHBOARD QUICK ACTIONS ==========

// POST /api/heartbeat/run — trigger heartbeat via cron tool
app.post('/api/heartbeat/run', async (req, res) => {
  try {
    const r = await req.ctx.gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ tool: 'cron', args: { action: 'wake', text: 'Manual heartbeat check from Mission Control', mode: 'now' } })
    });
    const data = await r.json();
    // Persist heartbeat state so dashboard shows last run
    try {
      const statePath = path.join(req.ctx.memoryPath, 'heartbeat-state.json');
      let state = {};
      try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
      state.lastHeartbeat = new Date().toISOString();
      state.lastChecks = state.lastChecks || {};
      state.lastChecks.manual = { time: new Date().toISOString(), status: data?.result ? 'ok' : 'error' };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      // Bust the status cache so dashboard picks it up immediately
      const cache = getUserCache(req.ctx.userId);
      cache.status = null; cache.statusTime = 0;
    } catch (e) { console.error('[Heartbeat] State write error:', e.message); }
    res.json({ status: 'triggered', result: data });
  } catch(e) {
    res.json({ status: 'error', error: e.message });
  }
});

// POST /api/quick/emails — disabled to prevent loop (email checks via heartbeat/cron only)
app.post('/api/quick/emails', async (req, res) => {
  res.json({ status: 'ok', reply: 'Email checks run via scheduled heartbeats. No manual ping needed.' });
});

// POST /api/quick/schedule — disabled to prevent loop
app.post('/api/quick/schedule', async (req, res) => {
  res.json({ status: 'ok', reply: 'Calendar checks run via scheduled heartbeats.' });
});

// ========== SETTINGS API ENDPOINTS ==========

// POST /api/settings/model-routing
app.post('/api/settings/model-routing', async (req, res) => {
  // Write to OpenClaw config via gateway
  const { main, subagent, heartbeat } = req.body;
  try {
    const raw = JSON.stringify({
      agents: { defaults: { model: { primary: main } } },
      agents_subagents_model: subagent,
      heartbeat_model: heartbeat
    });
    // For now just save to mc-config.json
    mcConfig.modelRouting = { main, subagent, heartbeat };
    fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(mcConfig, null, 2));
    res.json({ status: 'saved' });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// POST /api/settings/heartbeat (admin only — modifies server-wide config)
app.post('/api/settings/heartbeat', requireAdmin, async (req, res) => {
  try {
    const { interval } = req.body;
    mcConfig.heartbeat = { interval };
    fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(mcConfig, null, 2));
    res.json({ status: 'saved' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/settings/export (admin only — contains secrets)
app.get('/api/settings/export', requireAdmin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=mc-config.json');
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(MC_CONFIG_PATH);
});

// POST /api/settings/import (admin only — replaces server-wide config)
app.post('/api/settings/import', requireAdmin, upload.single('config'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No config file uploaded' });
    }
    
    // Validate JSON
    const configContent = fs.readFileSync(req.file.path, 'utf8');
    const newConfig = JSON.parse(configContent); // Will throw if invalid JSON
    
    // Backup current config
    fs.copyFileSync(MC_CONFIG_PATH, `${MC_CONFIG_PATH}.backup.${Date.now()}`);
    
    // Write new config
    fs.writeFileSync(MC_CONFIG_PATH, configContent);
    
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    
    res.json({ status: 'imported', message: 'Configuration imported successfully. Restart required.' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SYSTEM: System Info ==========
app.get('/api/system/info', (req, res) => {
  let openclawVersion = updateCache.currentVersion || 'unknown';
  if (!openclawVersion || openclawVersion === 'unknown') {
    try {
      openclawVersion = req.ctx.execCli('--version 2>/dev/null', { timeout: 5000 }).trim();
    } catch { openclawVersion = 'unknown'; }
  }

  res.json({
    missionControlVersion: '2.0.0',
    openclawVersion,
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    uptime: Math.floor(process.uptime()),
    updateAvailable: updateCache.updateAvailable || false,
    updateDetail: updateCache.updateDetail || null,
  });
});

// ========== SYSTEM: Model Routing (read-only) ==========
app.get('/api/system/models', (req, res) => {
  try {
    const config = req.ctx.readOpenclawConfig();
    const modelConfig = config.agents?.defaults?.model || {};
    const modelDefs = config.agents?.defaults?.models || {};

    const primary = modelConfig.primary || 'unknown';
    const fallbacks = modelConfig.fallbacks || [];

    // Build display-friendly list with aliases
    const formatModel = (id) => {
      const alias = modelDefs[id]?.alias;
      const short = id.replace(/^synthetic\/hf:/, '').replace(/^us\.anthropic\./, '');
      return { id, alias: alias || null, displayName: alias || short };
    };

    res.json({
      primary: formatModel(primary),
      fallbacks: fallbacks.map(formatModel),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SYSTEM: Heartbeat Status (read-only) ==========
app.get('/api/system/heartbeat', (req, res) => {
  try {
    let lastEvent = null;
    try {
      lastEvent = JSON.parse(req.ctx.execCli('system heartbeat last 2>/dev/null', { timeout: 10000 }));
    } catch (e) { console.error('[Heartbeat] Last event read error:', e.message); }

    // Read heartbeat state file for extra info
    let stateFile = {};
    try {
      stateFile = JSON.parse(fs.readFileSync(path.join(req.ctx.memoryPath, 'heartbeat-state.json'), 'utf8'));
    } catch {}

    // Get interval from openclaw status
    let interval = '1h';
    try {
      const ocStatus = req.ctx.execCli('status 2>/dev/null', { timeout: 10000 });
      const match = ocStatus.match(/Heartbeat\s*│\s*(\w+)/);
      if (match) interval = match[1];
    } catch (e) { console.error('[Heartbeat] Interval read error:', e.message); }

    res.json({
      interval,
      lastEvent: lastEvent ? {
        time: lastEvent.ts ? new Date(lastEvent.ts).toISOString() : null,
        status: lastEvent.status || 'unknown',
        reason: lastEvent.reason || null,
        channel: lastEvent.channel || null,
        durationMs: lastEvent.durationMs || null,
      } : null,
      lastChecks: stateFile.lastChecks || {},
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SYSTEM: Enhancements / Roadmap ==========
const ENHANCEMENTS_PATH = path.join(__dirname, 'enhancements.md');

app.get('/api/system/enhancements', (req, res) => {
  try {
    const content = fs.existsSync(ENHANCEMENTS_PATH)
      ? fs.readFileSync(ENHANCEMENTS_PATH, 'utf8')
      : '';
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/system/enhancements', (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
    fs.writeFileSync(ENHANCEMENTS_PATH, content, 'utf8');
    res.json({ status: 'saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SYSTEM: OpenClaw Update Checker ==========
let updateCache = {
  currentVersion: null,
  latestVersion: null,
  updateAvailable: false,
  updateDetail: null,
  lastChecked: null,
  checking: false,
};

async function checkForUpdates() {
  if (updateCache.checking) return updateCache;
  updateCache.checking = true;
  try {
    const currentVersion = execSync('openclaw --version 2>/dev/null', { timeout: 10000, encoding: 'utf8' }).trim();
    updateCache.currentVersion = currentVersion;

    const statusOutput = execSync('openclaw update status 2>/dev/null', { timeout: 15000, encoding: 'utf8' });
    // Parse the table output: look for "Update" row value like "pnpm · npm latest 2026.2.6-3"
    // If a newer version exists, it shows something like "2026.2.6-3 → 2026.2.7-1"
    const updateLine = statusOutput.split('\n').find(l => l.includes('Update'));
    const latestMatch = updateLine ? updateLine.match(/latest\s+([\d.]+-?\d*)/i) : null;
    const arrowMatch = updateLine ? updateLine.match(/([\d.]+-?\d*)\s*→\s*([\d.]+-?\d*)/) : null;

    if (arrowMatch) {
      // Explicit upgrade available: "current → newer"
      updateCache.latestVersion = arrowMatch[2];
      updateCache.updateAvailable = true;
      updateCache.updateDetail = `${arrowMatch[1]} → ${arrowMatch[2]}`;
    } else if (latestMatch && latestMatch[1] !== currentVersion) {
      updateCache.latestVersion = latestMatch[1];
      updateCache.updateAvailable = true;
      updateCache.updateDetail = `${currentVersion} → ${latestMatch[1]}`;
    } else {
      updateCache.latestVersion = currentVersion;
      updateCache.updateAvailable = false;
      updateCache.updateDetail = null;
    }
    updateCache.lastChecked = new Date().toISOString();
  } catch (e) {
    console.error('[Update Check]', e.message);
    // Keep previous cache on error, just update timestamp
    updateCache.lastChecked = new Date().toISOString();
  } finally {
    updateCache.checking = false;
  }
  return updateCache;
}

// Check on startup (delayed) + every 6 hours
setTimeout(() => checkForUpdates(), 5000);
setInterval(checkForUpdates, 6 * 60 * 60 * 1000);

// GET /api/system/version — return cached update info
app.get('/api/system/version', (req, res) => {
  res.json(updateCache);
});

// POST /api/system/update — trigger openclaw update
app.post('/api/system/update', (req, res) => {
  if (!updateCache.updateAvailable) {
    return res.json({ status: 'up_to_date', message: 'Already on latest version', version: updateCache.currentVersion });
  }

  // Run update in child process
  const child = exec('openclaw update --yes 2>&1', { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[Update] Failed:', err.message);
    } else {
      console.log('[Update] Success:', stdout.substring(0, 200));
    }

    // Restart gateway after update
    try {
      execSync('openclaw gateway restart 2>&1', { timeout: 30000 });
      console.log('[Update] Gateway restarted');
    } catch (e) {
      console.error('[Update] Gateway restart failed:', e.message);
    }

    // Refresh version cache
    updateCache.updateAvailable = false;
    checkForUpdates();

    // Restart Mission Control (systemd will bring it back)
    console.log('[Update] Restarting Mission Control...');
    setTimeout(() => process.exit(0), 1000);
  });

  res.json({ status: 'updating', message: `Updating OpenClaw ${updateCache.updateDetail || ''}... Mission Control will restart automatically.` });
});

// ========== ADMIN API ENDPOINTS ==========
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const store = loadUsers();
    const users = Object.values(store.users).map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      gateway: { profile: u.gateway?.profile, port: u.gateway?.port },
      createdAt: u.createdAt,
      disabled: u.disabled,
    }));
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/invite', requireAdmin, (req, res) => {
  try {
    const code = createInviteCode(req.user.id);
    res.json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot disable your own account' });
    const store = loadUsers();
    if (!store.users[id]) return res.status(404).json({ error: 'User not found' });
    store.users[id].disabled = true;
    saveUsers(store);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: re-enable a disabled user
app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const store = loadUsers();
    if (!store.users[id]) return res.status(404).json({ error: 'User not found' });
    store.users[id].disabled = false;
    saveUsers(store);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/health', requireAdmin, async (req, res) => {
  try {
    const store = loadUsers();
    const results = [];
    for (const user of Object.values(store.users)) {
      if (user.disabled || !user.gateway?.port) continue;
      let healthy = false;
      try {
        const r = await fetch(`http://127.0.0.1:${user.gateway.port}/status`, { signal: AbortSignal.timeout(3000) });
        healthy = r.ok;
      } catch {}
      results.push({ userId: user.id, username: user.username, port: user.gateway.port, healthy });
    }
    res.json({ gateways: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: update user gateway config (for provisioning)
app.post('/api/admin/users/:id/gateway', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { profile, port, token, configDir } = req.body;
    const store = loadUsers();
    if (!store.users[id]) return res.status(404).json({ error: 'User not found' });
    store.users[id].gateway = { profile, port, token, configDir };
    saveUsers(store);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mission Control running at http://localhost:${PORT}`);
  
  // Recover stuck inProgress tasks on startup — iterate all users
  try {
    const store = loadUsers();
    for (const user of Object.values(store.users)) {
      if (user.disabled || !user.gateway?.configDir) continue;
      const ctx = new UserContext(user);
      try {
        const tasks = ctx.loadTasks();
        if (!tasks.columns.inProgress || tasks.columns.inProgress.length === 0) continue;
        const sessFile = ctx.sessionsFile;
        const sessions = fs.existsSync(sessFile) ? JSON.parse(fs.readFileSync(sessFile, 'utf8')) : {};

        let recovered = 0;
        for (const task of [...tasks.columns.inProgress]) {
          const childKey = task.childSessionKey || '';
          const sessionInfo = sessions[childKey] || {};
          const sessionId = sessionInfo.sessionId || '';
          if (!sessionId) continue;

          const transcriptPath = path.join(ctx.sessionsDir, `${sessionId}.jsonl`);
          if (!fs.existsSync(transcriptPath)) continue;

          const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
          let resultText = '';
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const evt = JSON.parse(lines[i]);
              if (evt.type === 'message' && evt.message?.role === 'assistant') {
                const content = evt.message.content;
                resultText = Array.isArray(content)
                  ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
                  : typeof content === 'string' ? content : '';
                if (resultText) break;
              }
            } catch(e) {}
          }

          if (resultText) {
            const idx = tasks.columns.inProgress.indexOf(task);
            if (idx >= 0) tasks.columns.inProgress.splice(idx, 1);
            task.status = 'done';
            task.completed = new Date().toISOString();
            task.result = resultText.substring(0, 3000);
            tasks.columns.done.unshift(task);
            recovered++;
          }
        }

        if (recovered > 0) {
          ctx.saveTasks(tasks);
          console.log(`🔄 Recovered ${recovered} stuck tasks for user ${user.username}`);
        }
      } catch(e) {
        console.error(`[Startup recovery] User ${user.username}:`, e.message);
      }
    }
  } catch(e) {
    console.error('[Startup recovery]', e.message);
  }
});
