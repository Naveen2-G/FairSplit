const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { calculateBalances, getBalanceBreakdown } = require('../services/balanceService');

const router = express.Router();

// GET /api/groups/:id/expenses - List expenses for a group
router.get('/groups/:id/expenses', authMiddleware, async (req, res) => {
  try {
    const [expenses] = await pool.query(
      `SELECT e.*, u.display_name as paid_by_name
       FROM expenses e
       JOIN users u ON e.paid_by = u.id
       WHERE e.group_id = ?
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      [req.params.id]
    );

    // Fetch splits for each expense
    for (const expense of expenses) {
      const [splits] = await pool.query(
        `SELECT es.*, u.display_name
         FROM expense_splits es
         JOIN users u ON es.user_id = u.id
         WHERE es.expense_id = ?`,
        [expense.id]
      );
      expense.splits = splits;
    }

    res.json({ expenses });
  } catch (err) {
    console.error('List expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses.' });
  }
});

// POST /api/groups/:id/expenses - Create an expense
router.post('/groups/:id/expenses', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { description, paid_by, amount, currency, split_type, expense_date, notes, splits } = req.body;

    if (!description || !paid_by || !amount || !split_type || !expense_date) {
      return res.status(400).json({ error: 'Missing required fields: description, paid_by, amount, split_type, expense_date.' });
    }

    // Validate amount is numeric and positive
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    // Validate split_type
    const validSplitTypes = ['equal', 'unequal', 'percentage', 'share'];
    if (!validSplitTypes.includes(split_type)) {
      return res.status(400).json({ error: `Invalid split_type. Must be one of: ${validSplitTypes.join(', ')}` });
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO expenses (group_id, description, paid_by, amount, currency, split_type, expense_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, description, paid_by, amount, currency || 'INR', split_type, expense_date, notes || null]
    );

    const expenseId = result.insertId;

    // Calculate and insert splits
    if (splits && splits.length > 0) {
      for (const split of splits) {
        await conn.query(
          `INSERT INTO expense_splits (expense_id, user_id, owed_amount, share_value, percentage_value)
           VALUES (?, ?, ?, ?, ?)`,
          [expenseId, split.user_id, split.owed_amount, split.share_value || null, split.percentage_value || null]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ id: expenseId, message: 'Expense created.' });
  } catch (err) {
    await conn.rollback();
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Failed to create expense.' });
  } finally {
    conn.release();
  }
});

// PUT /api/expenses/:id - Update an expense
router.put('/expenses/:id', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { description, paid_by, amount, currency, split_type, expense_date, notes, splits } = req.body;

    await conn.beginTransaction();

    await conn.query(
      `UPDATE expenses SET description = COALESCE(?, description), paid_by = COALESCE(?, paid_by),
       amount = COALESCE(?, amount), currency = COALESCE(?, currency), split_type = COALESCE(?, split_type),
       expense_date = COALESCE(?, expense_date), notes = COALESCE(?, notes) WHERE id = ?`,
      [description, paid_by, amount, currency, split_type, expense_date, notes, req.params.id]
    );

    // Update splits if provided
    if (splits && splits.length > 0) {
      await conn.query('DELETE FROM expense_splits WHERE expense_id = ?', [req.params.id]);
      for (const split of splits) {
        await conn.query(
          `INSERT INTO expense_splits (expense_id, user_id, owed_amount, share_value, percentage_value)
           VALUES (?, ?, ?, ?, ?)`,
          [req.params.id, split.user_id, split.owed_amount, split.share_value || null, split.percentage_value || null]
        );
      }
    }

    await conn.commit();
    res.json({ message: 'Expense updated.' });
  } catch (err) {
    await conn.rollback();
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Failed to update expense.' });
  } finally {
    conn.release();
  }
});

// DELETE /api/expenses/:id - Delete expense
router.delete('/expenses/:id', authMiddleware, async (req, res) => {
  try {
    // Verify expense exists
    const [existing] = await pool.query('SELECT id, group_id FROM expenses WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    await pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted.' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

// GET /api/groups/:id/balances - Get group balances
router.get('/groups/:id/balances', authMiddleware, async (req, res) => {
  try {
    const balances = await calculateBalances(req.params.id);
    res.json(balances);
  } catch (err) {
    console.error('Get balances error:', err);
    res.status(500).json({ error: 'Failed to calculate balances.' });
  }
});

// GET /api/groups/:id/balances/:userId - Detailed breakdown for one user
router.get('/groups/:id/balances/:userId', authMiddleware, async (req, res) => {
  try {
    const breakdown = await getBalanceBreakdown(req.params.id, req.params.userId);
    res.json(breakdown);
  } catch (err) {
    console.error('Get balance breakdown error:', err);
    res.status(500).json({ error: 'Failed to get breakdown.' });
  }
});

module.exports = router;
