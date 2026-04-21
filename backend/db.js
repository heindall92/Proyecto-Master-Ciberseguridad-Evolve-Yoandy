'use strict';
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const path     = require('path');

// ── SEC-003: AES-256-CBC encryption for sensitive settings (Ollama cloud key) ─
const ALGO = 'aes-256-cbc';
function _encKey() {
  const seed = process.env.JWT_SECRET || 'valhalla-dev-key-change-in-prod';
  return crypto.createHash('sha256').update(seed).digest();
}
function encryptSetting(text) {
  if (!text) return '';
  const iv  = crypto.randomBytes(16);
  const c   = crypto.createCipheriv(ALGO, _encKey(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return 'enc:' + iv.toString('hex') + ':' + enc.toString('hex');
}
function decryptSetting(stored) {
  if (!stored || !stored.startsWith('enc:')) return stored; // not encrypted or empty
  try {
    const [, ivHex, encHex] = stored.split(':');
    const iv  = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const d   = crypto.createDecipheriv(ALGO, _encKey(), iv);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; }
}

const DB_PATH = path.join(__dirname, 'valhalla.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

// Warn in production if the database is not encrypted
if (process.env.NODE_ENV === 'production' && !process.env.DB_ENCRYPTED) {
  console.warn(
    '\n⚠  SEGURIDAD: valhalla.db está en texto plano.\n' +
    '   En producción protege el archivo con cifrado de volumen (LUKS, dm-crypt, BitLocker)\n' +
    '   o migra a SQLCipher. Configura DB_ENCRYPTED=true en .env para suprimir este aviso.\n'
  );
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'viewer',
    active        INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    last_login    TEXT
  );
`);

// Seed default admin on first run
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const adminPass = process.env.ADMIN_PASSWORD || 'Valhalla2026!';
  const hash = bcrypt.hashSync(adminPass, 12);
  db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('admin', 'admin@valhalla.soc', hash, 'admin');
  console.log('[db] Admin creado. Password: ' + adminPass);
}

const queries = {
  findByUsername:  db.prepare('SELECT * FROM users WHERE username = ? AND active = 1'),
  findById:        db.prepare('SELECT id, username, email, role, active, created_at, last_login FROM users WHERE id = ?'),
  listAll:         db.prepare('SELECT id, username, email, role, active, created_at, last_login FROM users ORDER BY created_at DESC'),
  create:          db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'),
  updateRole:      db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  updateActive:    db.prepare('UPDATE users SET active = ? WHERE id = ?'),
  updatePassword:  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  delete:          db.prepare('DELETE FROM users WHERE id = ?'),
  updateLastLogin: db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?"),
};

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL DEFAULT 'patch',
    title       TEXT NOT NULL,
    cve         TEXT DEFAULT '',
    component   TEXT DEFAULT '',
    cvss        REAL DEFAULT 0,
    priority    TEXT DEFAULT 'HIGH',
    status      TEXT DEFAULT 'open',
    assignee    TEXT DEFAULT '',
    created_by  TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`);

const settingsQueries = {
  get: db.prepare('SELECT value FROM settings WHERE key = ?'),
  set: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
  all: db.prepare('SELECT key, value FROM settings'),
};

// Defaults
const SETTING_DEFAULTS = {
  ollama_provider: 'local',
  ollama_url:      'http://localhost:11434',
  ollama_model:    'llama3.2',
  ollama_cloud_key:   '',
  ollama_cloud_model: 'llama3.1:8b',
};
for (const [k, v] of Object.entries(SETTING_DEFAULTS)) {
  if (!settingsQueries.get.get(k)) settingsQueries.set.run(k, v);
}

function getSetting(key) {
  return settingsQueries.get.get(key)?.value ?? SETTING_DEFAULTS[key] ?? '';
}

const ticketQueries = {
  list:       db.prepare('SELECT * FROM tickets ORDER BY created_at DESC'),
  listOpen:   db.prepare("SELECT * FROM tickets WHERE status != 'closed' ORDER BY created_at DESC"),
  getById:    db.prepare('SELECT * FROM tickets WHERE id = ?'),
  create:     db.prepare('INSERT INTO tickets (type,title,cve,component,cvss,priority,status,assignee,created_by,description) VALUES (?,?,?,?,?,?,?,?,?,?)'),
  setStatus:  db.prepare("UPDATE tickets SET status=?, updated_at=datetime('now') WHERE id=?"),
  setAssignee:db.prepare("UPDATE tickets SET assignee=?, updated_at=datetime('now') WHERE id=?"),
};

// ── Audit log ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user       TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    target     TEXT DEFAULT '',
    detail     TEXT DEFAULT '',
    ip         TEXT DEFAULT '',
    timestamp  TEXT DEFAULT (datetime('now'))
  );
`);

const auditQueries = {
  insert: db.prepare('INSERT INTO audit_log (user, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)'),
  recent: db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?'),
  byUser: db.prepare('SELECT * FROM audit_log WHERE user = ? ORDER BY timestamp DESC LIMIT 100'),
};

function writeAudit(user, action, target = '', detail = '', ip = '') {
  try { auditQueries.insert.run(String(user), String(action), String(target), String(detail), String(ip)); }
  catch { /* non-fatal */ }
}

// ── Ollama AI analyses ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_analyses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user       TEXT NOT NULL DEFAULT '',
    query      TEXT NOT NULL,
    response   TEXT NOT NULL,
    model      TEXT DEFAULT '',
    provider   TEXT DEFAULT 'local',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const aiQueries = {
  insert: db.prepare('INSERT INTO ai_analyses (user, query, response, model, provider) VALUES (?, ?, ?, ?, ?)'),
  recent: db.prepare('SELECT id, user, query, model, provider, created_at, substr(response,1,200) AS preview FROM ai_analyses ORDER BY created_at DESC LIMIT ?'),
  getById:db.prepare('SELECT * FROM ai_analyses WHERE id = ?'),
};

module.exports = { db, queries, ticketQueries, settingsQueries, getSetting, bcrypt, encryptSetting, decryptSetting, auditQueries, writeAudit, aiQueries };
