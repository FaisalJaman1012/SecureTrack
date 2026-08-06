const path = require('path');

// server.js loads this too; dotenv is idempotent and this keeps standalone
// scripts (backup, maintenance) reading the same configuration.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'securetrack.db');
const isNewDatabase = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','engineer','viewer')),
    full_name TEXT,
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER
  );

  -- Refresh tokens
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Projects table
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    application_name TEXT,
    url TEXT,
    vulnerability_name TEXT,
    vulnerabilities TEXT,
    severity TEXT CHECK(severity IN ('Critical','High','Medium','Low','Informational','')),
    resolver_team TEXT,
    mitigation_status TEXT,
    scan_date TEXT,
    report_sharing_date TEXT,
    application_zone TEXT,
    environment TEXT,
    category TEXT,
    email_subject TEXT,
    engineer TEXT,
    go_live_status TEXT,
    prod_url TEXT,
    mitigation_status_prod TEXT,
    remarks TEXT,
    deadline_date TEXT,
    assigned_to INTEGER,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(assigned_to) REFERENCES users(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  -- Applications table
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    application_name TEXT,
    url TEXT,
    app_type TEXT,
    environment TEXT,
    status TEXT,
    exposure TEXT,
    test_done TEXT,
    last_test_date TEXT,
    report_share_date TEXT,
    app_owner TEXT,
    mitigation_status TEXT,
    remarks TEXT,
    deadline_date TEXT,
    assigned_to INTEGER,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(assigned_to) REFERENCES users(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  -- Activity logs
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_name TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Alerts/Notifications
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('deadline','status_update','assignment','system')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK(severity IN ('critical','warning','info','success')),
    resource_type TEXT,
    resource_id TEXT,
    target_user_id INTEGER,
    target_role TEXT,
    is_read INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(target_user_id) REFERENCES users(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  -- Attachments (central — supports projects, applications and risks)
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'project' CHECK(source_type IN ('project','application','risk')),
    source_id INTEGER NOT NULL,
    source_name TEXT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
  );

  -- Import logs
  CREATE TABLE IF NOT EXISTS import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    format TEXT,
    total_rows INTEGER DEFAULT 0,
    imported INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    errors TEXT,
    imported_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(imported_by) REFERENCES users(id)
  );

  -- Risk Acceptance Status
  CREATE TABLE IF NOT EXISTS risk_acceptance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    risk_details TEXT,
    severity TEXT CHECK(severity IN ('Critical','High','Medium','Low','')),
    responsible TEXT,
    risk_announcement_date TEXT,
    risk_acceptance_date TEXT,
    mitigation_deadline TEXT,
    current_status TEXT DEFAULT 'Open' CHECK(current_status IN ('Open','Resolved','')),
    remarks TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  -- Vulnerability tracker (per-vulnerability mitigation follow-up)
  CREATE TABLE IF NOT EXISTS vuln_tracker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    vulnerability_name TEXT NOT NULL,
    severity TEXT,
    project_id INTEGER,
    project_name TEXT,
    mitigation_status TEXT DEFAULT 'Pending',
    mitigation_date TEXT,
    mitigation_team TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  -- IT infrastructure assets
  CREATE TABLE IF NOT EXISTS it_infra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    asset_category TEXT,
    hostname TEXT,
    ip_address TEXT,
    last_test TEXT,
    report_share TEXT,
    remarks TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_projects_severity ON projects(severity);
  CREATE INDEX IF NOT EXISTS idx_projects_assigned ON projects(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_projects_mitigation ON projects(mitigation_status);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_alerts_target ON alerts(target_user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_attachments_source ON attachments(source_type, source_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_vuln_tracker_project ON vuln_tracker(project_id);
  CREATE INDEX IF NOT EXISTS idx_it_infra_hostname ON it_infra(hostname);
`);

// ─── SCHEMA MIGRATIONS ───────────────────────────────────────────────────────
//
// The CREATE TABLE statements above use IF NOT EXISTS, which means they create
// missing tables but never alter existing ones. On a server that is upgraded by
// pulling new code, that is not enough: a release that adds a column to an
// existing table would otherwise require deleting the production database.
//
// Everything below runs automatically on boot, is idempotent, and never drops
// or rewrites user data.
//
// HOW TO ADD A MIGRATION IN A FUTURE RELEASE
//   1. Append an entry to the MIGRATIONS array. Never edit or reorder an entry
//      that has already shipped — completed ids are recorded in the database.
//   2. Additive changes only: ADD COLUMN, CREATE TABLE, CREATE INDEX, UPDATE.
//      Anything that drops or renames a column needs a manual, reviewed plan.
//   3. Deploy. The service takes a safety copy of the database before applying
//      anything, then applies pending migrations in one transaction.

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/** Adds a column only if the table does not already have it. */
const addColumnIfMissing = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`   + ${table}.${column}`);
  }
};

const MIGRATIONS = [
  {
    // Baseline. Tables created by the block above; recorded so the migration
    // log is meaningful from the first release that shipped this system.
    id: '2026-08-01-baseline',
    up: () => {},
  },
  // Example for the next release — copy this shape, do not edit the entries above:
  //
  // {
  //   id: '2026-09-01-add-project-owner',
  //   up: () => addColumnIfMissing('projects', 'business_owner', 'TEXT'),
  // },
];

const appliedIds = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
const pending = MIGRATIONS.filter(m => !appliedIds.has(m.id));

if (pending.length) {
  // Safety copy before touching the schema. Skipped for a brand new database
  // (nothing to lose) and best-effort: a failed copy must not block startup on
  // a read-only or full disk, but it is loud about it.
  if (!isNewDatabase) {
    try {
      const backupDir = path.join(__dirname, '..', '..', 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const target = path.join(backupDir, `securetrack-premigration-${stamp}.db`);
      // VACUUM INTO produces a consistent snapshot including un-checkpointed WAL
      db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
      console.log(`🛡️  Pre-migration backup: ${target}`);
    } catch (e) {
      console.error(`⚠️  Could not write pre-migration backup: ${e.message}`);
    }
  }

  console.log(`🔧 Applying ${pending.length} schema migration(s)…`);
  const record = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)');

  // One transaction for all of them: either the schema moves forward completely
  // or the database is left exactly as it was.
  db.transaction(() => {
    for (const migration of pending) {
      console.log(`   → ${migration.id}`);
      migration.up();
      record.run(migration.id);
    }
  })();

  console.log('✅ Schema up to date.');
}

// Purge refresh tokens that have already expired (runs on every boot)
db.prepare('DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP').run();

// Seed default admin user. On a fresh production install set ADMIN_PASSWORD in
// backend/.env so the well-known default password is never written to disk.
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const initialPassword = process.env.ADMIN_PASSWORD || 'Admin@SecureTrack2024';
  const hash = bcrypt.hashSync(initialPassword, 12);
  const { v4: uuidv4 } = require('uuid');
  db.prepare(`
    INSERT INTO users (uuid, username, email, password_hash, role, full_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'admin', process.env.ADMIN_EMAIL || 'admin@securetrack.local', hash, 'admin', 'System Administrator');

  if (process.env.ADMIN_PASSWORD) {
    console.log('✅ Default admin created: admin (password taken from ADMIN_PASSWORD)');
  } else {
    console.log('✅ Default admin created: admin / Admin@SecureTrack2024');
    console.warn('⚠️  Change this password immediately after the first login.');
  }
}

module.exports = db;
