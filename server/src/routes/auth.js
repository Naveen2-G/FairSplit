const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

/**
 * Validate password strength
 */
function validatePassword(password) {
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  return null;
}

/**
 * Sanitize input — trim whitespace, prevent XSS
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const username = sanitize(req.body.username);
    const email = sanitize(req.body.email);
    const password = req.body.password;
    const display_name = sanitize(req.body.display_name) || username;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Validate username
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters, letters/numbers/underscore only.' });
    }

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    // Check if user exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User with this email or username already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 12); // 12 rounds for production
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
      [username, email, password_hash, display_name]
    );

    const user = { id: result.insertId, username, email, display_name };
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];
    if (user.is_guest) {
      return res.status(401).json({ error: 'Guest accounts cannot log in. Please register.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user);
    res.json({
      user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, display_name, is_guest, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: users[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

module.exports = router;
