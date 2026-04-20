'use strict';
const jwt     = require('jsonwebtoken');
const { queries } = require('./db');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '8h';

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[FATAL] JWT_SECRET no definido. Configura la variable de entorno.');
  process.exit(1);
}

// Fallback para desarrollo local — NO usar en producción
const _secret = JWT_SECRET || 'dev-only-change-before-deploying-valhalla-soc-2026!';

const PERMISSIONS = {
  admin:    ['dashboard', 'siem', 'agents', 'incidents', 'threat', 'ollama', 'export', 'users'],
  analyst:  ['dashboard', 'siem', 'agents', 'incidents', 'threat', 'ollama', 'export'],
  reporter: ['dashboard', 'siem', 'agents', 'export'],
  viewer:   ['dashboard', 'siem', 'agents', 'threat'],
};

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    _secret,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(token) {
  return jwt.verify(token, _secret);
}

// Middleware — sets req.user or returns 401
function requireAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const decoded = verifyToken(token);
    // Verify user still exists and is active
    const user = queries.findById.get(decoded.id);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Sesión no válida' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Middleware — checks that req.user has the given permission
function requirePermission(perm) {
  return (req, res, next) => {
    const perms = PERMISSIONS[req.user?.role] || [];
    if (!perms.includes(perm)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requirePermission, PERMISSIONS };
