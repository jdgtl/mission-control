const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET_FILE = path.join(DATA_DIR, '.jwt-secret');
const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '30d';

// ========== JWT Secret ==========
function getJwtSecret() {
  try {
    return fs.readFileSync(JWT_SECRET_FILE, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(64).toString('hex');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

const JWT_SECRET = getJwtSecret();

// ========== Password Hashing ==========
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ========== Token Generation ==========
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ========== User Store (atomic file I/O) ==========
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return { users: {}, inviteCodes: {} };
  }
}

function saveUsers(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = USERS_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, USERS_FILE);
}

function getUserById(userId) {
  const store = loadUsers();
  return store.users[userId] || null;
}

function getUserByUsername(username) {
  const store = loadUsers();
  return Object.values(store.users).find(u => u.username === username) || null;
}

// ========== Authentication ==========
async function authenticateUser(username, password) {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (user.disabled) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }
  };
}

// ========== Invite Codes ==========
function createInviteCode(createdBy) {
  const store = loadUsers();
  const code = crypto.randomBytes(4).toString('hex'); // 8 chars
  store.inviteCodes[code] = {
    createdBy,
    maxUses: 1,
    uses: 0,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    createdAt: new Date().toISOString(),
  };
  saveUsers(store);
  return code;
}

function redeemInviteCode(code) {
  const store = loadUsers();
  const invite = store.inviteCodes[code];
  if (!invite) return { valid: false, error: 'Invalid invite code' };
  if (invite.uses >= invite.maxUses) return { valid: false, error: 'Invite code already used' };
  if (new Date(invite.expiresAt) < new Date()) return { valid: false, error: 'Invite code expired' };
  invite.uses++;
  saveUsers(store);
  return { valid: true };
}

// ========== User Creation ==========
async function createUser({ username, password, displayName, role, gateway }) {
  const store = loadUsers();

  // Check unique username
  if (Object.values(store.users).some(u => u.username === username)) {
    throw new Error('Username already taken');
  }

  const userId = crypto.randomBytes(8).toString('hex');
  const passwordHash = await hashPassword(password);

  store.users[userId] = {
    id: userId,
    username,
    displayName: displayName || username,
    passwordHash,
    role: role || 'user',
    gateway: gateway || {},
    createdAt: new Date().toISOString(),
    disabled: false,
  };

  saveUsers(store);

  // Create per-user data directory
  const userDataDir = path.join(DATA_DIR, 'users', userId);
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  return store.users[userId];
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  loadUsers,
  saveUsers,
  getUserById,
  getUserByUsername,
  authenticateUser,
  createInviteCode,
  redeemInviteCode,
  createUser,
  JWT_SECRET,
};
