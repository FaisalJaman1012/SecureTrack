const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { sanitizeBody, validate, appRules } = require('../middleware/validate');
const { log, checkAndCreateDeadlineAlerts, createAlert } = require('../utils/logger');

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u1.username as assigned_username, u2.username as created_username
    FROM applications a
    LEFT JOIN users u1 ON a.assigned_to = u1.id
    LEFT JOIN users u2 ON a.created_by = u2.id
    ORDER BY a.id ASC
  `).all();
  res.json(rows);
});

router.post('/', authenticate, authorize('admin', 'engineer'), sanitizeBody, appRules, validate, (req, res) => {
  const f = req.body;
  const result = db.prepare(`
    INSERT INTO applications (uuid, application_name, url, app_type, environment, status, exposure,
      test_done, last_test_date, report_share_date, app_owner, mitigation_status, remarks,
      deadline_date, assigned_to, created_by, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    uuidv4(), f.application_name, f.url, f.app_type, f.environment, f.status, f.exposure,
    f.test_done, f.last_test_date, f.report_share_date, f.app_owner, f.mitigation_status,
    f.remarks, f.deadline_date, f.assigned_to || null, req.user.id, req.user.id
  );

  const newApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  log(req, 'CREATE_APPLICATION', 'application', String(newApp.id), f.application_name);

  if (f.assigned_to) {
    createAlert('assignment', `Application Assigned: ${f.application_name}`,
      `You've been assigned to manage "${f.application_name}"`, 'info',
      'application', String(newApp.id), f.assigned_to, null, req.user.id);
  }

  checkAndCreateDeadlineAlerts(newApp, req.user.id);
  res.status(201).json(newApp);
});

router.put('/:id', authenticate, authorize('admin', 'engineer'), sanitizeBody, appRules, validate, (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'engineer') {
    if (existing.assigned_to !== req.user.id && existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit applications assigned to you' });
    }
  }

  const f = req.body;
  db.prepare(`
    UPDATE applications SET application_name=?, url=?, app_type=?, environment=?, status=?,
      exposure=?, test_done=?, last_test_date=?, report_share_date=?, app_owner=?,
      mitigation_status=?, remarks=?, deadline_date=?, assigned_to=?, updated_by=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    f.application_name, f.url, f.app_type, f.environment, f.status, f.exposure,
    f.test_done, f.last_test_date, f.report_share_date, f.app_owner, f.mitigation_status,
    f.remarks, f.deadline_date, f.assigned_to || null, req.user.id, id
  );

  log(req, 'UPDATE_APPLICATION', 'application', id, f.application_name);
  res.json(db.prepare('SELECT * FROM applications WHERE id = ?').get(id));
});

router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM applications WHERE id = ?').run(id);
  log(req, 'DELETE_APPLICATION', 'application', id, existing.application_name);
  res.json({ message: 'Deleted' });
});

module.exports = router;
