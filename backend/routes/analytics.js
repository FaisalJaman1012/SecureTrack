const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { log } = require('../utils/logger');

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

// GET /api/analytics/overview
router.get('/overview', authenticate, (req, res) => {
  const totalProjects = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
  const totalApps = db.prepare('SELECT COUNT(*) as c FROM applications').get().c;

  const severityBreakdown = db.prepare(`
    SELECT severity, COUNT(*) as count FROM projects WHERE severity != '' GROUP BY severity
  `).all();

  const mitigationBreakdown = db.prepare(`
    SELECT mitigation_status, COUNT(*) as count FROM projects WHERE mitigation_status != ''
    GROUP BY mitigation_status
  `).all();

  const engineerLoad = db.prepare(`
    SELECT engineer, COUNT(*) as count FROM projects WHERE engineer != '' GROUP BY engineer ORDER BY count DESC
  `).all();

  const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) as count FROM projects WHERE category != '' GROUP BY category
  `).all();

  const zoneBreakdown = db.prepare(`
    SELECT application_zone, COUNT(*) as count FROM projects WHERE application_zone != ''
    GROUP BY application_zone
  `).all();

  const envBreakdown = db.prepare(`
    SELECT environment, COUNT(*) as count FROM projects WHERE environment != '' GROUP BY environment
  `).all();

  // Monthly trend (last 6 months)
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM projects
    WHERE created_at >= date('now', '-6 months')
    GROUP BY month ORDER BY month ASC
  `).all();

  // Overdue projects (past deadline, not resolved)
  const overdueProjects = db.prepare(`
    SELECT COUNT(*) as c FROM projects
    WHERE deadline_date < date('now') AND deadline_date != ''
    AND (mitigation_status != 'Resolved' OR mitigation_status IS NULL)
  `).get().c;

  // Upcoming deadlines (next 7 days)
  const upcomingDeadlines = db.prepare(`
    SELECT COUNT(*) as c FROM projects
    WHERE deadline_date BETWEEN date('now') AND date('now', '+7 days')
    AND deadline_date != ''
    AND (mitigation_status != 'Resolved' OR mitigation_status IS NULL)
  `).get().c;

  // Yearly trend (all years)
  const yearlyTrend = db.prepare(`
    SELECT strftime('%Y', created_at) as year, COUNT(*) as count
    FROM projects
    GROUP BY year ORDER BY year ASC
  `).all();

  res.json({
    totalProjects, totalApps, overdueProjects, upcomingDeadlines,
    severityBreakdown, mitigationBreakdown, engineerLoad,
    categoryBreakdown, zoneBreakdown, envBreakdown, monthlyTrend, yearlyTrend
  });
});

// GET /api/analytics/productivity
router.get('/productivity', authenticate, (req, res) => {
  // Tasks completed per engineer
  const completedPerEngineer = db.prepare(`
    SELECT engineer, COUNT(*) as completed
    FROM projects
    WHERE mitigation_status = 'Resolved' AND engineer != ''
    GROUP BY engineer ORDER BY completed DESC
  `).all();

  // Pending per engineer
  const pendingPerEngineer = db.prepare(`
    SELECT engineer, COUNT(*) as pending
    FROM projects
    WHERE mitigation_status = 'Pending' AND engineer != ''
    GROUP BY engineer ORDER BY pending DESC
  `).all();

  // Average resolution time (scan_date to updated_at when resolved)
  const avgResolutionTime = db.prepare(`
    SELECT engineer,
      ROUND(AVG(julianday(updated_at) - julianday(scan_date)), 1) as avg_days
    FROM projects
    WHERE mitigation_status = 'Resolved' AND scan_date != '' AND engineer != ''
    GROUP BY engineer
  `).all();

  // Delayed tasks (past deadline)
  const delayedPerEngineer = db.prepare(`
    SELECT engineer, COUNT(*) as delayed
    FROM projects
    WHERE deadline_date < date('now') AND deadline_date != ''
    AND mitigation_status != 'Resolved' AND engineer != ''
    GROUP BY engineer ORDER BY delayed DESC
  `).all();

  // Total by user actions (from logs)
  const activityByUser = db.prepare(`
    SELECT username, action, COUNT(*) as count
    FROM activity_logs
    WHERE action IN ('CREATE_PROJECT','UPDATE_PROJECT','CREATE_APPLICATION','UPDATE_APPLICATION')
    AND created_at >= date('now', '-30 days')
    GROUP BY username, action ORDER BY username
  `).all();

  // Severity resolved rate
  const resolvedRate = db.prepare(`
    SELECT severity,
      COUNT(*) as total,
      SUM(CASE WHEN mitigation_status = 'Resolved' THEN 1 ELSE 0 END) as resolved
    FROM projects WHERE severity != '' GROUP BY severity
  `).all();

  res.json({ completedPerEngineer, pendingPerEngineer, avgResolutionTime, delayedPerEngineer, activityByUser, resolvedRate });
});

// ─── ACTIVITY LOGS ────────────────────────────────────────────────────────────

router.get('/logs', authenticate, authorize('admin'), (req, res) => {
  const { limit = 100, offset = 0, user, action } = req.query;

  let query = 'SELECT * FROM activity_logs WHERE 1=1';
  const params = [];

  if (user) { query += ' AND username LIKE ?'; params.push(`%${user}%`); }
  if (action) { query += ' AND action = ?'; params.push(action); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const rows = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM activity_logs').get().c;
  res.json({ rows, total });
});

// ─── ALERTS ───────────────────────────────────────────────────────────────────

router.get('/alerts', authenticate, (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare(`
      SELECT * FROM alerts
      WHERE (target_user_id = ? OR target_user_id IS NULL OR target_role = 'admin')
      ORDER BY created_at DESC LIMIT 50
    `).all(req.user.id);
  } else {
    rows = db.prepare(`
      SELECT * FROM alerts
      WHERE target_user_id = ? OR target_role = ?
      ORDER BY created_at DESC LIMIT 30
    `).all(req.user.id, req.user.role);
  }
  res.json(rows);
});

router.get('/alerts/unread-count', authenticate, (req, res) => {
  let count;
  if (req.user.role === 'admin') {
    count = db.prepare(`
      SELECT COUNT(*) as c FROM alerts
      WHERE is_read = 0 AND (target_user_id = ? OR target_user_id IS NULL OR target_role = 'admin')
    `).get(req.user.id).c;
  } else {
    count = db.prepare(`
      SELECT COUNT(*) as c FROM alerts WHERE is_read = 0 AND (target_user_id = ? OR target_role = ?)
    `).get(req.user.id, req.user.role).c;
  }
  res.json({ count });
});

router.patch('/alerts/:id/read', authenticate, (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(id);
  res.json({ message: 'Marked as read' });
});

router.patch('/alerts/read-all', authenticate, (req, res) => {
  if (req.user.role === 'admin') {
    db.prepare('UPDATE alerts SET is_read = 1 WHERE target_user_id = ? OR target_user_id IS NULL').run(req.user.id);
  } else {
    db.prepare('UPDATE alerts SET is_read = 1 WHERE target_user_id = ? OR target_role = ?').run(req.user.id, req.user.role);
  }
  res.json({ message: 'All marked as read' });
});

// ─── EXPORT (CSV) ─────────────────────────────────────────────────────────────
// Excel generation is done client-side with SheetJS for richer formatting
// This endpoint provides raw data for export

router.get('/export/projects', authenticate, (req, res) => {
  log(req, 'EXPORT_PROJECTS', 'export');
  const rows = db.prepare(`
    SELECT p.*, u1.username as assigned_to_name, u2.username as created_by_name
    FROM projects p
    LEFT JOIN users u1 ON p.assigned_to = u1.id
    LEFT JOIN users u2 ON p.created_by = u2.id
    ORDER BY p.id
  `).all();
  res.json(rows);
});

router.get('/export/applications', authenticate, (req, res) => {
  log(req, 'EXPORT_APPLICATIONS', 'export');
  const rows = db.prepare(`
    SELECT a.*, u1.username as assigned_to_name, u2.username as created_by_name
    FROM applications a
    LEFT JOIN users u1 ON a.assigned_to = u1.id
    LEFT JOIN users u2 ON a.created_by = u2.id
    ORDER BY a.id
  `).all();
  res.json(rows);
});

module.exports = router;
