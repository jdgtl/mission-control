const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * UserContext — per-user abstraction for gateway, filesystem, and CLI access.
 * Every request gets a UserContext from the auth middleware.
 */
class UserContext {
  constructor(user) {
    this.userId = user.id;
    this.username = user.username;
    this.displayName = user.displayName;
    this.role = user.role;

    // Gateway config from user record
    const gw = user.gateway || {};
    this.gatewayProfile = gw.profile || 'default';
    this.gatewayPort = gw.port || 18789;
    this.gatewayToken = gw.token || '';
    this.configDir = gw.configDir || path.join(process.env.HOME || '/home/openclaw', '.openclaw');
  }

  /** Path to this user's openclaw.json */
  get openclawConfigPath() {
    return path.join(this.configDir, 'openclaw.json');
  }

  /** Read and parse this user's openclaw.json */
  readOpenclawConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.openclawConfigPath, 'utf8'));
    } catch {
      return {};
    }
  }

  /** Write this user's openclaw.json */
  writeOpenclawConfig(config) {
    fs.writeFileSync(this.openclawConfigPath, JSON.stringify(config, null, 2));
  }

  /** Default model display name from user's config */
  get defaultModelName() {
    const cfg = this.readOpenclawConfig();
    const primary = cfg.agents?.defaults?.model?.primary || '';
    if (!primary) return 'Unknown';
    const provider = primary.split('/')[0];
    const modelId = primary.replace(`${provider}/`, '');
    // Try to find display name from model definitions
    if (cfg.models?.providers?.[provider]?.models) {
      const found = cfg.models.providers[provider].models.find(m => m.id === modelId);
      if (found?.name) return found.name;
    }
    // Fallback: clean up the model ID
    return modelId.replace(/^hf:[^/]+\//, '').replace(/-/g, ' ');
  }

  /** Default provider name from user's config */
  get defaultProviderName() {
    const cfg = this.readOpenclawConfig();
    const primary = cfg.agents?.defaults?.model?.primary || '';
    return primary.split('/')[0] || 'unknown';
  }

  /** Sessions directory for this user's agent */
  get sessionsDir() {
    return path.join(this.configDir, 'agents', 'main', 'sessions');
  }

  /** Sessions registry file */
  get sessionsFile() {
    return path.join(this.sessionsDir, 'sessions.json');
  }

  /** Workspace path (from openclaw config or default) */
  get workspacePath() {
    const cfg = this.readOpenclawConfig();
    return cfg.agents?.defaults?.workspace || path.join(this.configDir, 'workspace');
  }

  /** Memory path */
  get memoryPath() {
    return path.join(this.workspacePath, 'memory');
  }

  /** Per-user data directory (tasks, scout, hidden sessions, etc.) */
  get dataDir() {
    const dir = path.join(DATA_DIR, 'users', this.userId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Per-user file paths */
  get tasksFile() { return path.join(this.dataDir, 'tasks.json'); }
  get scoutResultsFile() { return path.join(this.dataDir, 'scout-results.json'); }
  get hiddenSessionsFile() { return path.join(this.dataDir, 'hidden-sessions.json'); }
  get agentsCustomFile() { return path.join(this.dataDir, 'agents-custom.json'); }
  get documentsDir() {
    const dir = path.join(this.dataDir, 'documents');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Fetch from this user's gateway.
   * @param {string} urlPath - e.g. '/tools/invoke' or '/v1/chat/completions'
   * @param {object} opts - fetch options (method, body, headers, signal, etc.)
   * @returns {Promise<Response>}
   */
  async gatewayFetch(urlPath, opts = {}) {
    const url = `http://127.0.0.1:${this.gatewayPort}${urlPath}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.gatewayToken}`,
      ...opts.headers,
    };
    return fetch(url, { ...opts, headers });
  }

  /**
   * Run openclaw CLI with this user's profile.
   * @param {string} cmd - command after 'openclaw', e.g. 'status 2>&1'
   * @param {object} opts - execSync options
   * @returns {string}
   */
  execCli(cmd, opts = {}) {
    const profileFlag = this.gatewayProfile !== 'default' ? `--profile ${this.gatewayProfile} ` : '';
    const envOverride = this.gatewayProfile !== 'default'
      ? { ...process.env, OPENCLAW_STATE_DIR: this.configDir }
      : process.env;
    return execSync(`openclaw ${profileFlag}${cmd}`, {
      encoding: 'utf8',
      timeout: 15000,
      env: envOverride,
      ...opts,
    });
  }

  /** Load per-user hidden sessions list */
  loadHiddenSessions() {
    try {
      return JSON.parse(fs.readFileSync(this.hiddenSessionsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  /** Save per-user hidden sessions list */
  saveHiddenSessions(list) {
    fs.writeFileSync(this.hiddenSessionsFile, JSON.stringify(list, null, 2));
  }

  /** Load per-user tasks */
  loadTasks() {
    try {
      return JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
    } catch {
      return { columns: { queue: [], inProgress: [], blocked: [], done: [] } };
    }
  }

  /** Save per-user tasks (atomic write) */
  saveTasks(data) {
    const tmpFile = this.tasksFile + '.tmp.' + process.pid;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, this.tasksFile);
  }

  /** Load per-user custom agents */
  loadCustomAgents() {
    try {
      return JSON.parse(fs.readFileSync(this.agentsCustomFile, 'utf8'));
    } catch {
      return [];
    }
  }

  /** Save per-user custom agents */
  saveCustomAgents(agents) {
    fs.writeFileSync(this.agentsCustomFile, JSON.stringify(agents, null, 2));
  }

  /** Load per-user scout results */
  loadScoutResults() {
    try {
      return JSON.parse(fs.readFileSync(this.scoutResultsFile, 'utf8'));
    } catch {
      return { opportunities: [], lastScan: null };
    }
  }

  /** Save per-user scout results */
  saveScoutResults(data) {
    fs.writeFileSync(this.scoutResultsFile, JSON.stringify(data, null, 2));
  }
}

module.exports = { UserContext };
