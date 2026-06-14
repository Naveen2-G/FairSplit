const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

let authRoutes, groupRoutes, expenseRoutes, settlementRoutes, importRoutes;

try {
  authRoutes = require('./routes/auth');
  console.log('[routes] auth module loaded successfully');
} catch (err) {
  console.error('[routes] FAILED to load auth module:', err);
}

try {
  groupRoutes = require('./routes/groups');
  console.log('[routes] groups module loaded successfully');
} catch (err) {
  console.error('[routes] FAILED to load groups module:', err);
}

try {
  expenseRoutes = require('./routes/expenses');
  console.log('[routes] expenses module loaded successfully');
} catch (err) {
  console.error('[routes] FAILED to load expenses module:', err);
}

try {
  settlementRoutes = require('./routes/settlements');
  console.log('[routes] settlements module loaded successfully');
} catch (err) {
  console.error('[routes] FAILED to load settlements module:', err);
}

try {
  importRoutes = require('./routes/import');
  console.log('[routes] import module loaded successfully');
} catch (err) {
  console.error('[routes] FAILED to load import module:', err);
}

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
console.log('[routes] Registering /api/auth...');
if (authRoutes) app.use('/api/auth', rateLimit, authRoutes);
else console.error('[routes] Skipping /api/auth — module failed to load');

console.log('[routes] Registering /api/groups...');
if (groupRoutes) app.use('/api/groups', groupRoutes);
else console.error('[routes] Skipping /api/groups — module failed to load');

console.log('[routes] Registering /api (expenses)...');
if (expenseRoutes) app.use('/api', expenseRoutes);
else console.error('[routes] Skipping /api expenses — module failed to load');

console.log('[routes] Registering /api (settlements)...');
if (settlementRoutes) app.use('/api', settlementRoutes);
else console.error('[routes] Skipping /api settlements — module failed to load');

console.log('[routes] Registering /api (import)...');
if (importRoutes) app.use('/api', importRoutes);
else console.error('[routes] Skipping /api import — module failed to load');

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler — log unmatched requests to help diagnose missing routes
app.use('/api/*', (req, res) => {
  console.warn(`[404] ${req.method} ${req.path} — no route matched`);
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global error handler — log method, path, and full error; don't leak stack traces in production
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err.stack);
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Log every registered route layer so we can confirm which routes are active
  const registeredRoutes = [];
  app._router.stack.forEach((layer) => {
    if (layer.route) {
      // Direct routes (e.g. app.get)
      registeredRoutes.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      // Router middleware (e.g. app.use('/api/auth', authRoutes))
      const prefix = layer.regexp.source
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/^\^/, '')
        .replace(/\/?$/, '');
      layer.handle.stack.forEach((routeLayer) => {
        if (routeLayer.route) {
          const methods = Object.keys(routeLayer.route.methods).join(',').toUpperCase();
          registeredRoutes.push(`${methods} ${prefix}${routeLayer.route.path}`);
        }
      });
    }
  });
  console.log('[routes] Registered routes:\n' + registeredRoutes.map(r => `  ${r}`).join('\n'));
});

module.exports = app;
