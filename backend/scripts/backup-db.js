#!/usr/bin/env node
/**
 * Creates a consistent backup of securetrack.db while the service is running.
 *
 *   node scripts/backup-db.js [destination-directory]
 *
 * Uses SQLite's online backup API. Plain file copies of a WAL-mode database are
 * NOT safe — the .db file on its own can be missing recently committed pages.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SOURCE = path.join(__dirname, '..', 'securetrack.db');
const DEST_DIR = process.argv[2] || path.join(__dirname, '..', '..', 'backups');

if (!fs.existsSync(SOURCE)) {
  console.error(`❌ Database not found: ${SOURCE}`);
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(DEST_DIR, `securetrack-${stamp}.db`);

const db = new Database(SOURCE, { readonly: true });

db.backup(dest)
  .then(() => {
    db.close();
    // A backup that cannot be opened is not a backup — verify before reporting success.
    const check = new Database(dest, { readonly: true });
    const result = check.pragma('integrity_check', { simple: true });
    const users = check.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    check.close();

    if (result !== 'ok') {
      console.error(`❌ Backup failed integrity check: ${result}`);
      fs.unlinkSync(dest);
      process.exit(1);
    }

    const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
    console.log(`✅ Backup OK: ${dest} (${mb} MB, ${users} users, integrity_check=ok)`);
  })
  .catch(err => {
    console.error('❌ Backup failed:', err.message);
    process.exit(1);
  });
