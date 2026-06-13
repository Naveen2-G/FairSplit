const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const expenseRoutes = require('./routes/expenses');
const settlementRoutes = require('./routes/settlements');
const importRoutes = require('./routes/import');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting for auth endpoints (simple in-memory)
const authLimiter = {};
const rateLimit = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  if (!authLimiter[ip]) authLimiter[ip] = [];
  authLimiter[ip] = authLimiter[ip].filter(t => now - t < 60000); // 1 minute window
  if (authLimiter[ip].length >= 15) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  authLimiter[ip].push(now);
  next();
};

// Routes
app.use('/api/auth', rateLimit, authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', expenseRoutes);
app.use('/api', settlementRoutes);
app.use('/api', importRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global error handler — don't leak stack traces in production
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
