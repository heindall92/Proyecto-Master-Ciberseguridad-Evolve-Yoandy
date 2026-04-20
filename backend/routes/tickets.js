'use strict';
const express = require('express');
const router  = express.Router();
const { ticketQueries } = require('../db');

const VALID_TYPES     = ['patch', 'incident', 'escalation', 'task'];
const VALID_STATUSES  = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_PRIORITIES= ['CRIT', 'HIGH', 'MED', 'LOW'];
const TITLE_RE        = /^.{1,200}$/;

function sanitize(str) {
  return String(str || '').replace(/[<>"'`]/g, '').trim().slice(0, 500);
}

// GET /api/tickets — list all non-closed tickets
router.get('/', (req, res) => {
  const all = req.query.all === '1';
  const rows = all ? ticketQueries.list.all() : ticketQueries.listOpen.all();
  res.json(rows);
});

// POST /api/tickets — create new ticket
router.post('/', (req, res) => {
  const { type = 'patch', title, cve = '', component = '', cvss = 0,
          priority = 'HIGH', assignee = '', description = '' } = req.body || {};

  if (!title || !TITLE_RE.test(title)) return res.status(400).json({ error: 'Título inválido' });
  if (!VALID_TYPES.includes(type))       return res.status(400).json({ error: 'Tipo inválido' });
  if (!VALID_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Prioridad inválida' });

  const row = ticketQueries.create.run(
    type,
    sanitize(title),
    sanitize(cve),
    sanitize(component),
    parseFloat(cvss) || 0,
    priority,
    'open',
    sanitize(assignee),
    sanitize(req.user?.username || 'sistema'),
    sanitize(description),
  );
  res.json({ ok: true, id: row.lastInsertRowid });
});

// PATCH /api/tickets/:id/status
router.patch('/:id/status', (req, res) => {
  const id     = parseInt(req.params.id, 10);
  const status = req.body?.status;
  if (!Number.isInteger(id) || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  ticketQueries.setStatus.run(status, id);
  res.json({ ok: true });
});

// PATCH /api/tickets/:id/assign
router.patch('/:id/assign', (req, res) => {
  const id       = parseInt(req.params.id, 10);
  const assignee = sanitize(req.body?.assignee || '');
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  ticketQueries.setAssignee.run(assignee, id);
  res.json({ ok: true });
});

module.exports = router;
