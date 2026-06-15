const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { log } = require('../utils/logger');

// GET /api/vuln-tracker — list all with optional filters
router.get('/', authenticate, (req, res) => {
  const { vuln, project, severity } = req.query;
  let query = 'SELECT * FROM vuln_tracker WHERE 1=1';
  const params = [];
  if (vuln)     { query += ' AND vulnerability_name LIKE ?'; params.push(`%${vuln}%`); }
  if (project)  { query += ' AND project_name LIKE ?'; params.push(`%${project}%`); }
  if (severity) { query += ' AND severity = ?'; params.push(severity); }
  query += ' ORDER BY id ASC';
  res.json(db.prepare(query).all(...params));
});

// POST /api/vuln-tracker
router.post('/', authenticate, authorize('admin', 'engineer'), (req, res) => {
  const { vulnerability_name, severity, project_id, project_name, mitigation_status, mitigation_date, mitigation_team } = req.body;
  if (!vulnerability_name) return res.status(400).json({ error: 'vulnerability_name required' });

  const result = db.prepare(`
    INSERT INTO vuln_tracker (uuid, vulnerability_name, severity, project_id, project_name, mitigation_status, mitigation_date, mitigation_team, created_by, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(uuidv4(), vulnerability_name, severity || '', project_id || null, project_name || '', mitigation_status || 'Pending', mitigation_date || '', mitigation_team || '', req.user.id, req.user.id);

  log(req, 'CREATE_VULN_TRACKER', 'vuln_tracker', String(result.lastInsertRowid), vulnerability_name);
  res.status(201).json(db.prepare('SELECT * FROM vuln_tracker WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/vuln-tracker/:id
router.put('/:id', authenticate, authorize('admin', 'engineer'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  const existing = db.prepare('SELECT * FROM vuln_tracker WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { vulnerability_name, severity, project_id, project_name, mitigation_status, mitigation_date, mitigation_team } = req.body;
  db.prepare(`
    UPDATE vuln_tracker SET vulnerability_name=?, severity=?, project_id=?, project_name=?,
      mitigation_status=?, mitigation_date=?, mitigation_team=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(vulnerability_name, severity, project_id || null, project_name, mitigation_status, mitigation_date, mitigation_team, req.user.id, id);

  log(req, 'UPDATE_VULN_TRACKER', 'vuln_tracker', id, vulnerability_name);
  res.json(db.prepare('SELECT * FROM vuln_tracker WHERE id = ?').get(id));
});

// DELETE /api/vuln-tracker/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  const existing = db.prepare('SELECT * FROM vuln_tracker WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM vuln_tracker WHERE id = ?').run(id);
  log(req, 'DELETE_VULN_TRACKER', 'vuln_tracker', id, existing.vulnerability_name);
  res.json({ message: 'Deleted' });
});

// POST /api/vuln-tracker/sync/:projectId — called after project save to sync vulns
router.post('/sync/:projectId', authenticate, authorize('admin', 'engineer'), (req, res) => {
  const { projectId } = req.params;
  if (!/^\d+$/.test(projectId)) return res.status(400).json({ error: 'Invalid ID' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  let vulns = [];
  try {
    if (project.vulnerabilities) {
      const parsed = JSON.parse(project.vulnerabilities);
      if (Array.isArray(parsed)) vulns = parsed;
    }
  } catch {}
  if (!vulns.length && project.vulnerability_name) {
    vulns = [{ name: project.vulnerability_name, severity: project.severity || '' }];
  }

  // Insert only vulns not already tracked for this project
  const existing = db.prepare('SELECT vulnerability_name FROM vuln_tracker WHERE project_id = ?').all(projectId).map(r => r.vulnerability_name);

  let added = 0;
  for (const v of vulns) {
    const name = typeof v === 'string' ? v : v.name;
    const sev  = typeof v === 'string' ? (project.severity || '') : (v.severity || '');
    if (!name || existing.includes(name)) continue;
    db.prepare(`
      INSERT INTO vuln_tracker (uuid, vulnerability_name, severity, project_id, project_name, mitigation_status, created_by, updated_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(uuidv4(), name, sev, projectId, project.application_name || '', 'Pending', req.user.id, req.user.id);
    added++;
  }

  res.json({ message: `Synced ${added} new vulnerabilities` });
});

module.exports = router;
