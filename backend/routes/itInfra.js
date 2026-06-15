const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { log } = require('../utils/logger');
const xss     = require('xss');

const clean = v => v ? xss(String(v).trim()).slice(0, 500) : '';

// GET /api/it-infra
router.get('/', authenticate, (req, res) => {
  const { search, category } = req.query;
  let query = `SELECT i.*, u.username as created_username
               FROM it_infra i LEFT JOIN users u ON i.created_by = u.id WHERE 1=1`;
  const params = [];
  if (search)   { query += ' AND (i.hostname LIKE ? OR i.ip_address LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (category) { query += ' AND i.asset_category = ?'; params.push(category); }
  query += ' ORDER BY i.id ASC';
  res.json(db.prepare(query).all(...params));
});

// POST /api/it-infra
router.post('/', authenticate, authorize('admin','engineer'), (req, res) => {
  const { asset_category, hostname, ip_address, last_test, report_share, remarks } = req.body;
  const result = db.prepare(`
    INSERT INTO it_infra (uuid, asset_category, hostname, ip_address, last_test, report_share, remarks, created_by, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(uuidv4(), clean(asset_category), clean(hostname), clean(ip_address),
         clean(last_test), clean(report_share), clean(remarks), req.user.id, req.user.id);

  log(req, 'CREATE_IT_INFRA', 'it_infra', String(result.lastInsertRowid), hostname);
  res.status(201).json(db.prepare('SELECT * FROM it_infra WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/it-infra/:id
router.put('/:id', authenticate, authorize('admin','engineer'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  const existing = db.prepare('SELECT * FROM it_infra WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { asset_category, hostname, ip_address, last_test, report_share, remarks } = req.body;
  db.prepare(`
    UPDATE it_infra SET asset_category=?, hostname=?, ip_address=?, last_test=?, report_share=?,
      remarks=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(clean(asset_category), clean(hostname), clean(ip_address),
         clean(last_test), clean(report_share), clean(remarks), req.user.id, id);

  log(req, 'UPDATE_IT_INFRA', 'it_infra', id, hostname);
  res.json(db.prepare('SELECT * FROM it_infra WHERE id = ?').get(id));
});

// DELETE /api/it-infra/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  const existing = db.prepare('SELECT * FROM it_infra WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM it_infra WHERE id = ?').run(id);
  log(req, 'DELETE_IT_INFRA', 'it_infra', id, existing.hostname);
  res.json({ message: 'Deleted' });
});

module.exports = router;
