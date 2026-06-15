const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { generateTokens, verifyRefreshToken, authenticate, authorize } = require('../middleware/auth');
const { sanitizeBody, validate, loginRules, registerRules } = require('../middleware/validate');
const { body } = require('express-validator');
const { log } = require('../utils/logger');

// POST /api/auth/login
router.post('/login', sanitizeBody, loginRules, validate, (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1').get(username, username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    db.prepare(`INSERT INTO activity_logs (username, action, ip_address) VALUES (?,?,?)`)
      .run(username, 'LOGIN_FAILED', req.ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { accessToken, refreshToken } = generateTokens(user);

  // Store refresh token
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, refreshToken, expires);

  // Update last login
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  // Log
  req.user = user;
  log(req, 'LOGIN', 'auth', null, null, 'Successful login');

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, uuid: user.uuid, username: user.username, email: user.email, role: user.role, full_name: user.full_name }
  });
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > CURRENT_TIMESTAMP').get(refreshToken);
    if (!stored) return res.status(401).json({ error: 'Invalid refresh token' });

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Rotate refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
    const tokens = generateTokens(user);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, tokens.refreshToken, expires);

    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  log(req, 'LOGOUT');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, uuid, username, email, role, full_name, last_login, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// POST /api/auth/register (admin only)
router.post('/register', authenticate, authorize('admin'), sanitizeBody, registerRules, validate, (req, res) => {
  const { username, email, password, role, full_name } = req.body;

  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) return res.status(409).json({ error: 'Username or email already exists' });

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`
    INSERT INTO users (uuid, username, email, password_hash, role, full_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), username, email, hash, role, full_name || '', req.user.id);

  log(req, 'CREATE_USER', 'user', String(result.lastInsertRowid), username, `Role: ${role}`);
  res.status(201).json({ message: 'User created', id: result.lastInsertRowid });
});

// GET /api/auth/users (admin only)
router.get('/users', authenticate, authorize('admin'), (req, res) => {
  const users = db.prepare('SELECT id, uuid, username, email, role, full_name, is_active, last_login, created_at FROM users ORDER BY id').all();
  res.json(users);
});

// PATCH /api/auth/users/:id (admin only)
router.patch('/users/:id', authenticate, authorize('admin'), sanitizeBody, (req, res) => {
  const { role, is_active, full_name } = req.body;
  const { id } = req.params;

  // Prevent IDOR: validate id is numeric
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET role = COALESCE(?, role), is_active = COALESCE(?, is_active), full_name = COALESCE(?, full_name) WHERE id = ?')
    .run(role || null, is_active !== undefined ? is_active : null, full_name || null, id);

  log(req, 'UPDATE_USER', 'user', id, user.username, `Changes: ${JSON.stringify(req.body)}`);
  res.json({ message: 'User updated' });
});

// POST /api/auth/change-password (any authenticated user)
router.post('/change-password', authenticate, sanitizeBody, [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password').isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must have uppercase, lowercase, number, and special character'),
], validate, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = bcrypt.compareSync(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  if (current_password === new_password) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

  // Invalidate all refresh tokens on password change
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);

  log(req, 'CHANGE_PASSWORD', 'user', String(req.user.id), req.user.username, 'Password changed successfully');
  res.json({ message: 'Password changed successfully. Please log in again.' });
});

// DELETE /api/auth/users/:id (admin only, cannot delete self)
router.delete('/users/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid ID' });
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
  log(req, 'DEACTIVATE_USER', 'user', id, user.username);
  res.json({ message: 'User deactivated' });
});

module.exports = router;
