const db = require('./db');

const log = (req, action, resourceType = null, resourceId = null, resourceName = null, details = null) => {
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, username, action, resource_type, resource_id, resource_name, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user?.id || null,
      req.user?.username || 'system',
      action,
      resourceType,
      resourceId,
      resourceName,
      details,
      req.ip || req.connection?.remoteAddress,
      req.headers['user-agent']?.slice(0, 200) || null
    );
  } catch (e) {
    console.error('Log error:', e.message);
  }
};

// Create alert for deadline approaching (call on project save)
const checkAndCreateDeadlineAlerts = (project, createdBy) => {
  try {
    if (!project.deadline_date) return;
    const deadline = new Date(project.deadline_date);
    const now = new Date();
    const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 3 && daysUntil >= 0) {
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO alerts (uuid, type, title, message, severity, resource_type, resource_id, target_role, created_by)
        VALUES (?, 'deadline', ?, ?, ?, 'project', ?, 'admin', ?)
      `).run(
        uuidv4(),
        `Deadline Alert: ${project.application_name || 'Project'}`,
        `Project "${project.application_name}" deadline is in ${daysUntil} day(s) (${project.deadline_date})`,
        daysUntil === 0 ? 'critical' : 'warning',
        String(project.id),
        createdBy
      );
    }
  } catch (e) {
    console.error('Alert creation error:', e.message);
  }
};

const createAlert = (type, title, message, severity, resourceType, resourceId, targetUserId, targetRole, createdBy) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`
      INSERT INTO alerts (uuid, type, title, message, severity, resource_type, resource_id, target_user_id, target_role, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), type, title, message, severity, resourceType, resourceId, targetUserId, targetRole, createdBy);
  } catch (e) {
    console.error('Alert error:', e.message);
  }
};

module.exports = { log, checkAndCreateDeadlineAlerts, createAlert };
