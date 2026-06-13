const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { simplifyDebts } = require('../services/settlementService');

const router = express.Router();

// POST /api/groups/:id/settlements - Record a settlement
router.post('/groups/:id/settlements', authMiddleware, async (req, res) => {
  try {
    const { from_user, to_user, amount, currency, settlement_date, notes } = req.body;

    if (!from_user || !to_user || !amount || !settlement_date) {
      return res.status(400).json({ error: 'from_user, to_user, amount, and settlement_date are required.' });
    }

    if (from_user === to_user) {
      return res.status(400).json({ error: 'Cannot create a settlement with yourself.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Settlement amount must be a positive number.' });
    }

    const [result] = await pool.query(
      `INSERT INTO settlements (group_id, from_user, to_user, amount, currency, settlement_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, from_user, to_user, amount, currency || 'INR', settlement_date, notes || null]
    );

    res.status(201).json({ id: result.insertId, message: 'Settlement recorded.' });
  } catch (err) {
    console.error('Create settlement error:', err);
    res.status(500).json({ error: 'Failed to record settlement.' });
  }
});

// GET /api/groups/:id/settlements - List settlements
router.get('/groups/:id/settlements', authMiddleware, async (req, res) => {
  try {
    const [settlements] = await pool.query(
      `SELECT s.*, 
       fu.display_name as from_name, tu.display_name as to_name
       FROM settlements s
       JOIN users fu ON s.from_user = fu.id
       JOIN users tu ON s.to_user = tu.id
       WHERE s.group_id = ?
       ORDER BY s.settlement_date DESC`,
      [req.params.id]
    );
    res.json({ settlements });
  } catch (err) {
    console.error('List settlements error:', err);
    res.status(500).json({ error: 'Failed to fetch settlements.' });
  }
});

// GET /api/groups/:id/suggested-settlements - Simplified debts
router.get('/groups/:id/suggested-settlements', authMiddleware, async (req, res) => {
  try {
    const suggestions = await simplifyDebts(req.params.id);
    res.json(suggestions);
  } catch (err) {
    console.error('Suggest settlements error:', err);
    res.status(500).json({ error: 'Failed to compute settlements.' });
  }
});

module.exports = router;
