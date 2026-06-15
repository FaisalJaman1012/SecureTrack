const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const xml2js = require('xml2js');
const db = require('../utils/db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadImport } = require('../middleware/upload');
const { log } = require('../utils/logger');
const xss = require('xss');

// ─── Field normalizer (maps various column name formats to our schema) ────────
const PROJECT_MAP = {
  application_name: ['application_name','application name','app name','appname','name'],
  url: ['url','link','application url','app url'],
  vulnerability_name: ['vulnerability_name','vulnerability name','vulnerability','vuln name','vuln','finding'],
  severity: ['severity','risk','risk level','criticality'],
  resolver_team: ['resolver_team','resolver team','team','responsible team'],
  mitigation_status: ['mitigation_status','mitigation status','status','remediation status'],
  scan_date: ['scan_date','scan date','test date','scan/test date','date tested'],
  report_sharing_date: ['report_sharing_date','report sharing date','report date','shared date'],
  application_zone: ['application_zone','application zone','zone','network zone'],
  environment: ['environment','env'],
  category: ['category','type','project type'],
  email_subject: ['email_subject','email subject','subject'],
  engineer: ['engineer','assigned engineer','tester','pentester'],
  go_live_status: ['go_live_status','go live status','go live','live status'],
  prod_url: ['prod_url','production url','prod url','production link'],
  mitigation_status_prod: ['mitigation_status_prod','mitigation status in production','prod mitigation'],
  remarks: ['remarks','notes','comments','observation'],
  deadline_date: ['deadline_date','deadline','due date'],
};

const APP_MAP = {
  application_name: ['application_name','application name','app name','name'],
  url: ['url','link'],
  app_type: ['app_type','app type','type','platform'],
  environment: ['environment','env'],
  status: ['status','app status'],
  exposure: ['exposure','visibility'],
  test_done: ['test_done','test done','test status','testing'],
  last_test_date: ['last_test_date','last test date','last tested'],
  report_share_date: ['report_share_date','report share date','report date'],
  app_owner: ['app_owner','app owner','owner'],
  mitigation_status: ['mitigation_status','mitigation status','remediation'],
  remarks: ['remarks','notes','comments'],
  deadline_date: ['deadline_date','deadline','due date'],
};

function normalizeKey(raw, map) {
  const lower = raw.toLowerCase().trim().replace(/[^a-z0-9 _]/g, '');
  for (const [field, aliases] of Object.entries(map)) {
    if (aliases.some(a => a === lower)) return field;
  }
  return null;
}

function sanitizeStr(val) {
  if (val === null || val === undefined) return '';
  return xss(String(val).trim()).slice(0, 1000);
}

function mapRowToProject(row) {
  const keys = Object.keys(row);
  const out = {};
  for (const k of keys) {
    const mapped = normalizeKey(k, PROJECT_MAP);
    if (mapped) out[mapped] = sanitizeStr(row[k]);
  }
  return out;
}

function mapRowToApp(row) {
  const keys = Object.keys(row);
  const out = {};
  for (const k of keys) {
    const mapped = normalizeKey(k, APP_MAP);
    if (mapped) out[mapped] = sanitizeStr(row[k]);
  }
  return out;
}

// ─── CSV parser (no deps) ────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return row;
  });
}

// ─── XML parser ───────────────────────────────────────────────────────────────
async function parseXML(text) {
  const result = await xml2js.parseStringPromise(text, { explicitArray: false, trim: true });

  // Try to find an array of project/application objects
  // Supports <projects><project>...</project></projects> or <data><row>...</row></data>
  const root = result;
  const rootKey = Object.keys(root)[0];
  const inner = root[rootKey];

  // Find the first array-like key
  for (const key of Object.keys(inner)) {
    const val = inner[key];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object' && !Array.isArray(val)) {
      // Single item wrapped in array
      return [val];
    }
  }
  // Fallback: inner itself might be a single object
  if (typeof inner === 'object') return [inner];
  return [];
}

// ─── Excel parser via SheetJS (installed in frontend, use basic parsing here) ─
function parseExcelBuffer(buffer) {
  // We rely on xlsx installed in backend for server-side parsing
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch (e) {
    throw new Error('Failed to parse Excel file: ' + e.message);
  }
}

// ─── Main import handler ──────────────────────────────────────────────────────
async function processImport(filePath, ext, targetType, userId) {
  let rows = [];
  const text = fs.readFileSync(filePath, 'utf-8');

  if (ext === '.csv' || ext === '.txt') {
    rows = parseCSV(text);
  } else if (ext === '.json') {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : parsed.projects || parsed.applications || parsed.data || [parsed];
  } else if (ext === '.xml') {
    rows = await parseXML(text);
  } else if (ext === '.xlsx' || ext === '.xls') {
    const buffer = fs.readFileSync(filePath);
    rows = parseExcelBuffer(buffer);
  }

  if (!rows.length) return { imported: 0, skipped: 0, errors: ['No data rows found in file'] };

  const isProject = targetType === 'projects';
  const mapper = isProject ? mapRowToProject : mapRowToApp;
  const errors = [];
  let imported = 0;
  let skipped = 0;

  // Valid enum values
  const VALID_SEVERITY  = ['Critical','High','Medium','Low','Informational',''];
  const VALID_MIT       = ['Business Requirements','Pending','Resolved','Risk Acceptance',''];
  const VALID_ZONE      = ['DMZ','External','Internal',''];
  const VALID_ENV_P     = ['Live','Pre-Prod','Production','UAT',''];
  const VALID_CATEGORY  = ['Old Application','Planned','Projects',''];
  const VALID_ENGINEER  = ['Ashik','Swarup','Adnan','Faisal','EIC','SISA',''];
  const VALID_GOLIVE    = ['Yes','No','Pending',''];
  const VALID_MITPROD   = ['Mitigated','Not Mitigated',''];
  const VALID_APP_TYPE  = ['Web','Android','iOS','API',''];
  const VALID_ENV_A     = ['Production','UAT',''];
  const VALID_STATUS_A  = ['Live','UAT',''];
  const VALID_EXPOSURE  = ['Internal','External',''];
  const VALID_TEST      = ['Done','Running','Terminated',''];
  const VALID_MIT_A     = ['Mitigated','Not Mitigated',''];
  const coerce = (val, valid) => valid.includes(val) ? val : '';

  if (isProject) {
    const insertProject = db.prepare(`
      INSERT INTO projects (uuid, application_name, url, vulnerability_name, vulnerabilities, severity,
        resolver_team, mitigation_status, scan_date, report_sharing_date, application_zone,
        environment, category, email_subject, engineer, go_live_status, prod_url,
        mitigation_status_prod, remarks, deadline_date, created_by, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapper(rows[i]);
        if (!r.application_name && !r.url) { skipped++; continue; }
        const vulnEntry = r.vulnerability_name
          ? JSON.stringify([{ name: r.vulnerability_name, severity: coerce(r.severity, VALID_SEVERITY) || 'Medium' }])
          : null;
        insertProject.run(
          uuidv4(),
          r.application_name || '',
          r.url || '',
          r.vulnerability_name || '',
          vulnEntry,
          coerce(r.severity, VALID_SEVERITY),
          r.resolver_team || '',
          coerce(r.mitigation_status, VALID_MIT),
          r.scan_date || '',
          r.report_sharing_date || '',
          coerce(r.application_zone, VALID_ZONE),
          coerce(r.environment, VALID_ENV_P),
          coerce(r.category, VALID_CATEGORY),
          r.email_subject || '',
          coerce(r.engineer, VALID_ENGINEER),
          coerce(r.go_live_status, VALID_GOLIVE),
          r.prod_url || '',
          coerce(r.mitigation_status_prod, VALID_MITPROD),
          r.remarks || '',
          r.deadline_date || '',
          userId, userId
        );
        imported++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e.message}`);
        skipped++;
      }
    }

  } else {
    // ── Applications — no grouping needed ─────────────────────────────────────
    const insertApp = db.prepare(`
      INSERT INTO applications (uuid, application_name, url, app_type, environment, status,
        exposure, test_done, last_test_date, report_share_date, app_owner,
        mitigation_status, remarks, deadline_date, created_by, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    for (let i = 0; i < rows.length; i++) {
      try {
        const r = mapper(rows[i]);
        if (!r.application_name && !r.url) { skipped++; continue; }
        insertApp.run(
          uuidv4(),
          r.application_name || '',
          r.url || '',
          coerce(r.app_type, VALID_APP_TYPE),
          coerce(r.environment, VALID_ENV_A),
          coerce(r.status, VALID_STATUS_A),
          coerce(r.exposure, VALID_EXPOSURE),
          coerce(r.test_done, VALID_TEST),
          r.last_test_date || '',
          r.report_share_date || '',
          r.app_owner || '',
          coerce(r.mitigation_status, VALID_MIT_A),
          r.remarks || '',
          r.deadline_date || '',
          userId, userId
        );
        imported++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e.message}`);
        skipped++;
      }
    }
  }

  return { total: rows.length, imported, skipped, errors };
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// POST /api/import/:type  (type = projects | applications)
router.post('/:type', authenticate, authorize('admin', 'engineer'), (req, res) => {
  const { type } = req.params;
  if (!['projects', 'applications'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "projects" or "applications"' });
  }

  uploadImport.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filePath = req.file.path;

    try {
      const result = await processImport(filePath, ext, type, req.user.id);

      // Log the import
      db.prepare(`
        INSERT INTO import_logs (filename, format, total_rows, imported, skipped, errors, imported_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.file.originalname, ext.slice(1).toUpperCase(),
        result.total || 0, result.imported, result.skipped,
        result.errors.length ? JSON.stringify(result.errors.slice(0, 20)) : null,
        req.user.id
      );

      log(req, 'IMPORT_DATA', type, null, req.file.originalname,
        `Imported ${result.imported}/${result.total || 0} rows`);

      res.json({
        message: `Import complete: ${result.imported} imported, ${result.skipped} skipped`,
        ...result,
      });
    } catch (e) {
      res.status(400).json({ error: 'Import failed: ' + e.message });
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(filePath); } catch {}
    }
  });
});

// GET /api/import/logs  (admin only)
router.get('/logs/list', authenticate, authorize('admin'), (req, res) => {
  const logs = db.prepare(`
    SELECT il.*, u.username as imported_by_name
    FROM import_logs il
    LEFT JOIN users u ON il.imported_by = u.id
    ORDER BY il.created_at DESC LIMIT 50
  `).all();
  res.json(logs);
});

// GET /api/import/template/:type — download a CSV template
router.get('/template/:type', authenticate, (req, res) => {
  const { type } = req.params;
  let headers, example;

  if (type === 'projects') {
    headers = Object.keys(PROJECT_MAP);
    example = ['My App','https://example.com','SQL Injection','High','CBS Team','Pending','2024-01-15','2024-01-20','Internal','Production','Projects','Vuln Report Q1','Ashik','No','https://prod.example.com','Not Mitigated','Check again','2024-02-01'];
  } else {
    headers = Object.keys(APP_MAP);
    example = ['My App','https://example.com','Web','Production','Live','External','Done','2024-01-15','2024-01-20','John Doe','Mitigated','All clear','2024-03-01'];
  }

  const csv = [headers.join(','), example.slice(0, headers.length).join(',')].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="securetrack_${type}_template.csv"`);
  res.send(csv);
});

module.exports = router;
