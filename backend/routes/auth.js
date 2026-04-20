'use strict';
const router  = require('express').Router();
const { queries, bcrypt } = require('../db');
const { signToken, requireAuth, PERMISSIONS } = require('../auth');

// ── In-memory brute-force / rate limiter ──────────────────────────────────────
// Tracks attempts per IP. No external dependency needed.
const loginAttempts = new Map();
const MAX_ATTEMPTS  = 10;            // max failed attempts before lockout
const WINDOW_MS     = 15 * 60 * 1000; // 15-minute window
const LOCKOUT_MS    = 15 * 60 * 1000; // 15-minute lockout

function getRealIp(req) {
  // Use socket IP directly — X-Forwarded-For is spoofable without trusted proxy config
  return req.socket.remoteAddress || '0.0.0.0';
}

function checkRateLimit(ip) {
  const now  = Date.now();
  const data = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  if (data.lockedUntil > now) {
    const waitMin = Math.ceil((data.lockedUntil - now) / 60000);
    return { allowed: false, waitMin };
  }

  if (now - data.firstAttempt > WINDOW_MS) {
    // Reset the window
    loginAttempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: 0 });
    return { allowed: true };
  }

  data.count += 1;
  if (data.count >= MAX_ATTEMPTS) {
    data.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(ip, data);
  return { allowed: data.count < MAX_ATTEMPTS };
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

// ── Input sanitizer ───────────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,64}$/;

function sanitize(str, maxLen = 128) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

// POST /api/login
router.post('/login', (req, res) => {
  const ip       = getRealIp(req);
  const username = sanitize(req.body?.username, 64);
  const password = sanitize(req.body?.password, 128);

  // Basic presence check
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  // Username format — reject payloads that look like injection attempts
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Nombre de usuario no válido' });
  }

  // Rate limit check
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Cuenta bloqueada ${limit.waitMin} min.`,
    });
  }

  // Lookup user — parameterized query, immune to SQL injection
  const user = queries.findByUsername.get(username);

  // Always run bcrypt compare to prevent timing-based user enumeration
  const dummyHash = '$2a$12$invalidhashinvalidhashinvalidhashinvalidhashinvalidhas';
  const hashToCheck = user ? user.password_hash : dummyHash;
  const valid = bcrypt.compareSync(password, hashToCheck);

  if (!user || !user.active || !valid) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  // Successful login — clear rate limit counter
  resetRateLimit(ip);
  queries.updateLastLogin.run(user.id);
  const token = signToken(user);

  const IS_PROD = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: IS_PROD ? 'strict' : 'lax', // strict in prod: blocks cross-site requests
    secure:   IS_PROD,                     // HTTPS only in production
    maxAge:   8 * 60 * 60 * 1000,          // 8h
  });

  res.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role, email: user.email },
    permissions: PERMISSIONS[user.role] || [],
  });
});

// POST /api/logout
router.post('/logout', (req, res) => {
  const IS_PROD = process.env.NODE_ENV === 'production';
  res.clearCookie('token', { httpOnly: true, sameSite: IS_PROD ? 'strict' : 'lax', secure: IS_PROD });
  res.json({ ok: true });
});

// GET /api/me — returns current session info
router.get('/me', requireAuth, (req, res) => {
  const user = queries.findById.get(req.user.id);
  if (!user || !user.active) return res.status(401).json({ error: 'Sesión no válida' });
  res.json({
    user: { id: user.id, username: user.username, role: user.role, email: user.email },
    permissions: PERMISSIONS[user.role] || [],
  });
});

module.exports = router;
