#!/usr/bin/env node
/**
 * Generates backend/.env with fresh JWT secrets and a random admin password.
 *
 *   npm run gen-secrets
 *
 * Refuses to overwrite an existing .env — rotating secrets logs every user out,
 * so that has to be a deliberate act (delete the file first).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

if (fs.existsSync(ENV_PATH)) {
  console.error(`❌ ${ENV_PATH} already exists — not overwriting.`);
  console.error('   Delete it first if you really want to rotate the secrets.');
  process.exit(1);
}

const secret = () => crypto.randomBytes(48).toString('base64url');

// Character classes required by the password policy in middleware/validate.js
const adminPassword = () => {
  const pools = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '@$!%*?&',
  ];
  const all = pools.join('');
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = pools.map(pick);
  while (chars.length < 20) chars.push(pick(all));
  // Fisher-Yates with a CSPRNG so the required classes aren't always in front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const password = adminPassword();

const content = `# SecureTrack production configuration — generated ${new Date().toISOString()}
# KEEP THIS FILE SECRET. It is excluded from git; never email or copy it around.

NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# Signing keys for access/refresh tokens. Changing these logs everyone out.
JWT_SECRET=${secret()}
JWT_REFRESH_SECRET=${secret()}

# Comma separated list of origins allowed to call the API.
# Use the exact URL users type in the browser, e.g. https://securetrack.company.local
ALLOWED_ORIGINS=http://localhost:5000

# Password for the initial 'admin' account. Only used when the database is
# created for the first time; ignored afterwards.
ADMIN_PASSWORD=${password}
ADMIN_EMAIL=admin@securetrack.local

# Requests per 15 minutes, per client IP.
RATE_LIMIT_MAX=1000
AUTH_RATE_LIMIT_MAX=10

# Number of reverse proxies in front of the app (IIS/nginx = 1, direct = 0).
TRUST_PROXY_HOPS=1
`;

fs.writeFileSync(ENV_PATH, content, { mode: 0o600 });

console.log(`✅ Wrote ${ENV_PATH}`);
console.log('');
console.log('   Initial admin login');
console.log('   -------------------');
console.log('   username: admin');
console.log(`   password: ${password}`);
console.log('');
console.log('   Save that password in your password manager now, then set');
console.log('   ALLOWED_ORIGINS in the .env file to your real site URL.');
