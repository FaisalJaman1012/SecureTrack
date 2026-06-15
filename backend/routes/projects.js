const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { sanitizeBody, validate, projectRules } = require('../middleware/validate');
const { log, checkAndCreateDeadlineAlerts, createAlert } = require('../utils/logger');

// GET /api/projects
router.get('/', authenticate, (req, res) => {
  let query = `
    SELECT p.*, 
      u1.username as assigned_username, u1.full_name as assigned_fullname,
      u2.username as created_username
    FROM projects p
    LEFT JOIN users u1 ON p.assigned_to = u1.id
    LEFT JOIN users u2 ON p.created_by = u2.id
  `;
  // Viewers/engineers see all, but we log it
  const rows = db.prepare(query + ' ORDER BY p.id ASC').all();
  res.json(rows);
});

// POST /api/projects (admin, engineer)
router.post('/', authenticate, authorize('admin', 'engineer'), sanitizeBody, projectRules, validate, (req, res) => {
  const f = req.body;
  const id = uuidv4();

  // Handle vulnerabilities — supports [{name, severity}] objects or plain strings
  const vulnsArr = Array.isArray(f.vulnerabilities) ? f.vulnerabilities : [];
  const vulnsFiltered = vulnsArr.filter(v => {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object' && v !== null) return (v.name || '').trim();
    return false;
  });
  const vulnsJson = vulnsFiltered.length ? JSON.stringify(vulnsFiltered) : null;
  const firstVuln = vulnsFiltered[0];
  const vulnName = typeof firstVuln === 'string' ? firstVuln : (firstVuln?.name || f.vulnerability_name || '');
  // Use highest severity from vuln list if top-level severity not set
  const SEV_ORDER = ['Critical','High','Medium','Low','Informational'];
  const derivedSeverity = f.severity || vulnsFiltered.reduce((best, v) => {
    const s = typeof v === 'object' ? v.severity : '';
    return SEV_ORDER.indexOf(s) < SEV_ORDER.indexOf(best) ? s : best;
  }, '') || '';

  const result = db.prepare(`
    INSERT INTO projects (uuid, application_name, url, vulnerability_name, vulnerabilities, severity, resolver_team,
      mitigation_status, scan_date, report_sharing_date, application_zone, environment, category,
      email_subject, engineer, go_live_status, prod_url, mitigation_status_prod, remarks,
      deadline_date, assigned_to, created_by, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, f.application_name, f.url, vulnName, vulnsJson, derivedSeverity, f.resolver_team,
    f.mitigation_status, f.scan_date, f.report_sharing_date, f.application_zone, f.environment,
    f.category, f.email_subject, f.engineer, f.go_live_status, f.prod_url, f.mitigation_status_prod,
    f.remarks, f.deadline_date, f.assigned_to || null, req.user.id, req.user.id
  );

  const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  log(req, 'CREATE_PROJECT', 'project', String(newProject.id), f.application_name, `Severity: ${f.severity}`);

  // Create assignment alert if assigned
  if (f.assigned_to) {
    createAlert('assignment', `New Project Assigned: ${f.application_name}`,
      `You have been assigned to project "${f.application_name}" with ${f.severity} severity`,
      f.severity === 'Critical' || f.severity === 'High' ? 'critical' : 'info',
      'project', String(newProject.id), f.assigned_to, null, req.user.id);
  }

  checkAndCreateDeadlineAlerts(newProject, req.user.id);

  res.status(201).json(newProject);
});

// PUT /api/projects/:id (admin, engineer - engineers can only update assigned ones)
router.put('/:id', authenticate, authorize('admin', 'engineer'), sanitizeBody, projectRules, validate, (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  // Engineers can only edit projects assigned to them or created by them
  if (req.user.role === 'engineer') {
    if (existing.assigned_to !== req.user.id && existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit projects assigned to you' });
    }
  }

  const f = req.body;
  const vulnsArr2 = Array.isArray(f.vulnerabilities) ? f.vulnerabilities : [];
  const vulnsFiltered2 = vulnsArr2.filter(v => {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object' && v !== null) return (v.name || '').trim();
    return false;
  });
  const vulnsJson2 = vulnsFiltered2.length ? JSON.stringify(vulnsFiltered2) : null;
  const firstVuln2 = vulnsFiltered2[0];
  const vulnName2 = typeof firstVuln2 === 'string' ? firstVuln2 : (firstVuln2?.name || f.vulnerability_name || '');
  const SEV_ORDER2 = ['Critical','High','Medium','Low','Informational'];
  const derivedSeverity2 = f.severity || vulnsFiltered2.reduce((best, v) => {
    const s = typeof v === 'object' ? v.severity : '';
    return SEV_ORDER2.indexOf(s) < SEV_ORDER2.indexOf(best) ? s : best;
  }, '') || '';

  db.prepare(`
    UPDATE projects SET application_name=?, url=?, vulnerability_name=?, vulnerabilities=?, severity=?,
      resolver_team=?, mitigation_status=?, scan_date=?, report_sharing_date=?,
      application_zone=?, environment=?, category=?, email_subject=?, engineer=?,
      go_live_status=?, prod_url=?, mitigation_status_prod=?, remarks=?,
      deadline_date=?, assigned_to=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    f.application_name, f.url, vulnName2, vulnsJson2, derivedSeverity2, f.resolver_team,
    f.mitigation_status, f.scan_date, f.report_sharing_date, f.application_zone, f.environment,
    f.category, f.email_subject, f.engineer, f.go_live_status, f.prod_url, f.mitigation_status_prod,
    f.remarks, f.deadline_date, f.assigned_to || null, req.user.id, id
  );

  log(req, 'UPDATE_PROJECT', 'project', id, f.application_name,
    `Status changed: ${existing.mitigation_status} → ${f.mitigation_status}`);

  // Status change alert
  if (existing.mitigation_status !== f.mitigation_status) {
    createAlert('status_update', `Project Status Updated: ${f.application_name}`,
      `Mitigation status changed from "${existing.mitigation_status}" to "${f.mitigation_status}"`,
      f.mitigation_status === 'Resolved' ? 'success' : 'info',
      'project', id, null, 'admin', req.user.id);
  }

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  checkAndCreateDeadlineAlerts(updated, req.user.id);

  res.json(updated);
});

// DELETE /api/projects/:id (admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  log(req, 'DELETE_PROJECT', 'project', id, existing.application_name);
  res.json({ message: 'Deleted' });
});

module.exports = router;
