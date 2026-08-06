const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadAttachment, ATTACHMENT_DIR, decodeOriginalName } = require('../middleware/upload');
const { log } = require('../utils/logger');

// ── Helper ─────────────────────────────────────────────────────
function getSourceName(sourceType, sourceId) {
  if (sourceType === 'project') {
    const r = db.prepare('SELECT application_name FROM projects WHERE id = ?').get(sourceId);
    return r?.application_name || `Project #${sourceId}`;
  }
  if (sourceType === 'application') {
    const r = db.prepare('SELECT application_name FROM applications WHERE id = ?').get(sourceId);
    return r?.application_name || `Application #${sourceId}`;
  }
  if (sourceType === 'risk') {
    const r = db.prepare('SELECT risk_details FROM risk_acceptance WHERE id = ?').get(sourceId);
    const name = r?.risk_details || `Risk #${sourceId}`;
    return name.length > 60 ? name.slice(0, 60) + '…' : name;
  }
  return '';
}

function serveFile(req, res, inline) {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const att = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!att) return res.status(404).json({ error: 'File not found' });

  const filePath = path.resolve(ATTACHMENT_DIR, att.stored_name);
  if (!filePath.startsWith(path.resolve(ATTACHMENT_DIR))) return res.status(403).json({ error: 'Access denied' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

  log(req, inline ? 'VIEW_ATTACHMENT' : 'DOWNLOAD_ATTACHMENT', 'attachment', id, att.original_name);

  if (inline) {
    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    // original_name is whatever the uploader called the file. Quotes and control
    // characters in it would break out of the header parameter, so send an ASCII
    // fallback plus RFC 5987 filename* for the real name.
    const asciiName = att.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(att.original_name)}`
    );
    res.sendFile(filePath);
  } else {
    res.download(filePath, att.original_name);
  }
}

// ── IMPORTANT: specific routes MUST come before wildcard /:sourceType/:sourceId ──

// GET /api/attachments/view/:id  — inline browser preview
router.get('/view/:id', authenticate, (req, res) => serveFile(req, res, true));

// GET /api/attachments/download/:id  — force download
router.get('/download/:id', authenticate, (req, res) => serveFile(req, res, false));

// GET /api/attachments/reports/all  — central Reports module
router.get('/reports/all', authenticate, (req, res) => {
  const { source_type, month, year, search } = req.query;

  let query = `
    SELECT a.*, u.username as uploader_name
    FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (source_type && ['project','application'].includes(source_type)) {
    query += ' AND a.source_type = ?'; params.push(source_type);
  }
  if (year)  { query += " AND strftime('%Y', a.created_at) = ?"; params.push(year); }
  if (month) { query += " AND strftime('%m', a.created_at) = ?"; params.push(month.padStart(2,'0')); }
  if (search) {
    query += ' AND (a.original_name LIKE ? OR a.source_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY a.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// DELETE /api/attachments/:id
router.delete('/:id', authenticate, authorize('admin','engineer'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const att = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!att) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'engineer' && att.uploaded_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own attachments' });
  }

  const filePath = path.join(ATTACHMENT_DIR, att.stored_name);
  if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  log(req, 'DELETE_ATTACHMENT', 'attachment', id, att.original_name);
  res.json({ message: 'Deleted' });
});

// GET /api/attachments/:sourceType/:sourceId  — list files for a project/app/risk
// MUST be after the specific routes above
router.get('/:sourceType/:sourceId', authenticate, (req, res) => {
  const { sourceType, sourceId } = req.params;
  if (!['project','application','risk'].includes(sourceType)) return res.status(400).json({ error: 'Invalid source type' });
  if (!/^\d+$/.test(sourceId)) return res.status(400).json({ error: 'Invalid ID' });

  const files = db.prepare(`
    SELECT a.*, u.username as uploader_name
    FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.source_type = ? AND a.source_id = ?
    ORDER BY a.created_at DESC
  `).all(sourceType, parseInt(sourceId));

  res.json(files);
});

// POST /api/attachments/:sourceType/:sourceId  — upload
router.post('/:sourceType/:sourceId', authenticate, authorize('admin','engineer'), (req, res) => {
  const { sourceType, sourceId } = req.params;
  if (!['project','application','risk'].includes(sourceType)) return res.status(400).json({ error: 'Invalid source type' });
  if (!/^\d+$/.test(sourceId)) return res.status(400).json({ error: 'Invalid ID' });

  const sourceName = getSourceName(sourceType, parseInt(sourceId));

  uploadAttachment.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

    const inserted = [];
    for (const file of req.files) {
      const originalName = decodeOriginalName(file.originalname);
      const result = db.prepare(`
        INSERT INTO attachments (uuid, source_type, source_id, source_name, original_name, stored_name, mime_type, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), sourceType, parseInt(sourceId), sourceName,
             originalName, file.filename, file.mimetype, file.size, req.user.id);
      inserted.push({
        id: result.lastInsertRowid,
        original_name: originalName,
        mime_type: file.mimetype,
        file_size: file.size,
      });
    }

    log(req, 'UPLOAD_ATTACHMENT', sourceType, sourceId, sourceName,
      `Uploaded ${req.files.length} file(s): ${inserted.map(f => f.original_name).join(', ')}`);

    res.status(201).json({ message: `${inserted.length} file(s) uploaded`, files: inserted });
  });
});

module.exports = router;
