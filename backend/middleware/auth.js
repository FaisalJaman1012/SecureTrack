const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'SecureTrack-JWT-Secret-Change-In-Production-2024!';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'SecureTrack-Refresh-Secret-Change-In-Production-2024!';

// Verify access token
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still active in DB
    const user = db.prepare('SELECT id, uuid, username, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account disabled or not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    // Log unauthorized access attempt
    db.prepare(`INSERT INTO activity_logs (user_id, username, action, details, ip_address) VALUES (?,?,?,?,?)`)
      .run(req.user.id, req.user.username, 'UNAUTHORIZED_ACCESS', `Attempted ${req.method} ${req.path}`, req.ip);
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Token generators
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, uuid: user.uuid, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET);
};

module.exports = { authenticate, authorize, generateTokens, verifyRefreshToken, JWT_SECRET };
