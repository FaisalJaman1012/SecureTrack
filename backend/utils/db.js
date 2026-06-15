const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'securetrack.db'));

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

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_projects_severity ON projects(severity);
  CREATE INDEX IF NOT EXISTS idx_projects_assigned ON projects(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_projects_mitigation ON projects(mitigation_status);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_alerts_target ON alerts(target_user_id, is_read);
`);

// Seed default admin user
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin@SecureTrack2024', 12);
  const { v4: uuidv4 } = require('uuid');
  db.prepare(`
    INSERT INTO users (uuid, username, email, password_hash, role, full_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'admin', 'admin@securetrack.local', hash, 'admin', 'System Administrator');

  console.log('✅ Default admin created: admin / Admin@SecureTrack2024');
}

module.exports = db;
