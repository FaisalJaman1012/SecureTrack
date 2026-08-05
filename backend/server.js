// Load backend/.env before anything reads process.env
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';

// ─── STARTUP SAFETY CHECKS ───────────────────────────────────────────────────
// A production instance must never run on the secrets baked into the source.
if (IS_PROD) {
  const missing = ['JWT_SECRET', 'JWT_REFRESH_SECRET'].filter(k => !process.env[k] || process.env[k].length < 32);
  if (missing.length) {
    console.error(`\n❌ Refusing to start: ${missing.join(' and ')} must be set in backend/.env (min 32 characters).`);
    console.error('   Generate them with:  npm run gen-secrets\n');
    process.exit(1);
  }
  if (!process.env.ALLOWED_ORIGINS) {
    console.warn('⚠️  ALLOWED_ORIGINS is not set — falling back to localhost only.');
  }
}

// Init DB first
const db = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────────────

// Helmet for security headers (XSS protection, HSTS, etc.)
// Every asset — including webfonts — is served from this origin. The server
// runs on an isolated network with no outbound internet, so no external host
// is allowed anywhere in this policy. Do not add CDNs here.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // inline styles are used throughout the React components
      fontSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null, // set by the reverse proxy when TLS terminates there
    },
  },
  // Attachments are streamed back to the same origin for inline preview
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // HSTS is only meaningful over HTTPS and is the reverse proxy's job
  hsts: false,
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGINS is a comma separated list. Entries may use a leading wildcard
// label to cover a whole DNS zone, e.g.
//
//   ALLOWED_ORIGINS=https://securetrack.mutualtrustbank.com,https://*.mutualtrustbank.com
//
// The wildcard matches exactly one label (a.bank.com, not a.b.bank.com) and the
// scheme and port must still match, so it cannot be widened accidentally.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5000')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const originMatchers = ALLOWED_ORIGINS.map(entry => {
  if (!entry.includes('*')) {
    const exact = entry.toLowerCase();
    return (origin) => origin === exact;
  }
  const pattern = new RegExp(
    '^' + entry.toLowerCase()
      .split('*')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[a-z0-9-]+') + '$'
  );
  return (origin) => pattern.test(origin);
});

const isOriginAllowed = (origin) => {
  const normalized = origin.toLowerCase().replace(/\/+$/, '');
  return originMatchers.some(match => match(normalized));
};

app.use(cors({
  origin: (origin, cb) => {
    // No Origin header = same-origin navigation or a non-browser client
    if (!origin || isOriginAllowed(origin)) return cb(null, true);
    cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));

// Trust the reverse proxy (IIS/nginx) so req.ip is the real client IP.
// Must be set before the rate limiters run, otherwise every request behind the
// proxy shares one bucket and the whole office gets locked out together.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Rate limiting - prevent brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: Number(process.env.RATE_LIMIT_MAX || 1000),
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10), // Strict on auth endpoints
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Body parsing with size limits (prevent large payload attacks)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Remove X-Powered-By
app.disable('x-powered-by');

// ─── ROUTES ─────────────────────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/import', require('./routes/import'));
app.use('/api/risk-acceptance', require('./routes/riskAcceptance'));
app.use('/api/vuln-tracker', require('./routes/vulnTracker'));
app.use('/api/it-infra', require('./routes/itInfra'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// Serve React build in production
if (IS_PROD) {
  const BUILD_DIR = path.join(__dirname, '..', 'frontend', 'build');

  if (!require('fs').existsSync(path.join(BUILD_DIR, 'index.html'))) {
    console.error(`\n❌ Refusing to start: no production build found at ${BUILD_DIR}`);
    console.error('   Build the client first:  cd frontend && npm run build\n');
    process.exit(1);
  }

  app.use(express.static(BUILD_DIR, {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Hashed CRA bundles are immutable; index.html must always be revalidated
      // or users keep an old app shell after an upgrade.
      if (filePath.includes(`${path.sep}static${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  // Unknown /api paths are errors, not the React shell
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
  });
}

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(new Date().toISOString(), err.stack);
  // Don't leak internal error details in production
  const msg = IS_PROD ? 'Internal server error' : err.message;
  res.status(500).json({ error: msg });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n🔒 SecureTrack v2 running on ${HOST}:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  if (!IS_PROD) console.log(`   Default login: admin / Admin@SecureTrack2024`);
  console.log('');
});

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────────────────
// The Windows service manager sends CTRL-BREAK/SIGTERM on stop. Close the HTTP
// listener and checkpoint SQLite so no WAL data is left behind on restart.
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down…`);

  const finish = () => {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch (e) { console.error('DB close error:', e.message); }
    process.exit(0);
  };

  server.close(finish);
  // Don't hang forever on keep-alive connections
  setTimeout(finish, 10000).unref();
};

['SIGTERM', 'SIGINT', 'SIGBREAK'].forEach(sig => process.on(sig, () => shutdown(sig)));

// Log rather than die silently — the service wrapper captures these
process.on('unhandledRejection', (reason) => {
  console.error(new Date().toISOString(), 'Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error(new Date().toISOString(), 'Uncaught exception:', err);
  shutdown('uncaughtException');
});
