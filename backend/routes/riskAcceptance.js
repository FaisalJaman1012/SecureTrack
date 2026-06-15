const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { log }  = require('../utils/logger');
const xss      = require('xss');

const clean  = v => v ? xss(String(v).trim()).slice(0, 2000) : '';

const VALID_SEV    = ['Critical','High','Medium','Low',''];
const VALID_STATUS = ['Open','Resolved',''];
const coerce = (val, valid) => valid.includes(val) ? val : '';

// GET /api/risk-acceptance
router.get('/', authenticate, (req, res) => {
  const { search, severity, status } = req.query;
  let query = `SELECT r.*, u.username as created_username
               FROM risk_acceptance r
               LEFT JOIN users u ON r.created_by = u.id WHERE 1=1`;
  const params = [];
  if (search)   { query += ' AND r.risk_details LIKE ?'; params.push(`%${search}%`); }
  if (severity) { query += ' AND r.severity = ?'; params.push(severity); }
  if (status)   { query += ' AND r.current_status = ?'; params.push(status); }
  query += ' ORDER BY r.id ASC';
  res.json(db.prepare(query).all(...params));
});

// POST /api/risk-acceptance
router.post('/', authenticate, authorize('admin','engineer'), (req, res) => {
  const { risk_details, severity, responsible, risk_announcement_date,
          risk_acceptance_date, mitigation_deadline, current_status, remarks } = req.body;

  const result = db.prepare(`
    INSERT INTO risk_acceptance
      (uuid, risk_details, severity, responsible, risk_announcement_date,
       risk_acceptance_date, mitigation_deadline, current_status, remarks,
       created_by, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    uuidv4(),
    clean(risk_details),
    coerce(clean(severity), VALID_SEV),
    clean(responsible),
    clean(risk_announcement_date),
    clean(risk_acceptance_date),
    clean(mitigation_deadline),
    coerce(clean(current_status), VALID_STATUS) || 'Open',
    clean(remarks),
    req.user.id, req.user.id
  );

  log(req, 'CREATE_RISK', 'risk_acceptance', String(result.lastInsertRowid), risk_details);
  res.status(201).json(db.prepare('SELECT * FROM risk_acceptance WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/risk-acceptance/:id
router.put('/:id', authenticate, authorize('admin','engineer'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.prepare('SELECT * FROM risk_acceptance WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'engineer' && existing.created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own risk entries' });
  }

  const { risk_details, severity, responsible, risk_announcement_date,
          risk_acceptance_date, mitigation_deadline, current_status, remarks } = req.body;

  db.prepare(`
    UPDATE risk_acceptance SET
      risk_details=?, severity=?, responsible=?, risk_announcement_date=?,
      risk_acceptance_date=?, mitigation_deadline=?, current_status=?, remarks=?,
      updated_by=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    clean(risk_details),
    coerce(clean(severity), VALID_SEV),
    clean(responsible),
    clean(risk_announcement_date),
    clean(risk_acceptance_date),
    clean(mitigation_deadline),
    coerce(clean(current_status), VALID_STATUS) || 'Open',
    clean(remarks),
    req.user.id, id
  );

  log(req, 'UPDATE_RISK', 'risk_acceptance', id, risk_details);
  res.json(db.prepare('SELECT * FROM risk_acceptance WHERE id = ?').get(id));
});

// DELETE /api/risk-acceptance/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  const existing = db.prepare('SELECT * FROM risk_acceptance WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM risk_acceptance WHERE id = ?').run(id);
  log(req, 'DELETE_RISK', 'risk_acceptance', id, existing.risk_details);
  res.json({ message: 'Deleted' });
});

module.exports = router;
