'use strict';
const router  = require('express').Router();
const { queries, bcrypt } = require('../db');
const { requireAuth, requirePermission } = require('../auth');

const VALID_ROLES   = ['admin', 'analyst', 'reporter', 'viewer'];
const USERNAME_RE   = /^[a-zA-Z0-9._-]{1,64}$/;
const EMAIL_RE      = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{1,32}$/;

function sanitize(s, max = 128) {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

// All routes require auth + users permission (admin only)
// Note: requireAuth is also applied globally in server.js — this is defense-in-depth
router.use(requireAuth, requirePermission('users'));

// GET /api/users — list all users
router.get('/', (req, res) => {
  res.json(queries.listAll.all());
});

// POST /api/users — create user
router.post('/', (req, res) => {
  const username = sanitize(req.body?.username, 64);
  const email    = sanitize(req.body?.email, 128);
  const password = sanitize(req.body?.password, 128);
  const role     = sanitize(req.body?.role, 32);

  if (!username || !password) {
    return res.status(400).json({ error: 'username y password son requeridos' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Nombre de usuario no válido (solo letras, números, ._-)' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Valores: ' + VALID_ROLES.join(', ') });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (email && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email no válido' });
  }

  const hash = bcrypt.hashSync(password, 12);
  try {
    const info = queries.create.run(username, email, hash, role);
    res.status(201).json({ ok: true, id: info.lastInsertRowid, username, role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El usuario ya existe' });
    }
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/users/:id/role — change role
router.put('/:id/role', (req, res) => {
  const role = sanitize(req.body?.role, 32);
  const id   = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  }
  queries.updateRole.run(role, id);
  res.json({ ok: true });
});

// PUT /api/users/:id/active — activate / deactivate
router.put('/:id/active', (req, res) => {
  const id     = parseInt(req.params.id, 10);
  const active = req.body?.active;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  }
  queries.updateActive.run(active ? 1 : 0, id);
  res.json({ ok: true });
});

// PUT /api/users/:id/password — reset password (admin)
router.put('/:id/password', (req, res) => {
  const id       = parseInt(req.params.id, 10);
  const password = sanitize(req.body?.password, 128);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Mínimo 8 caracteres' });
  }
  const hash = bcrypt.hashSync(password, 12);
  queries.updatePassword.run(hash, id);
  res.json({ ok: true });
});

module.exports = router;
