const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/groups - Create a new group
router.post('/', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, description, default_currency } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required.' });

    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO `groups` (name, description, default_currency, created_by) VALUES (?, ?, ?, ?)',
      [name, description || null, default_currency || 'INR', req.user.id]
    );

    // Add creator as member
    await conn.query(
      'INSERT INTO group_memberships (group_id, user_id, joined_at, is_active) VALUES (?, ?, CURDATE(), TRUE)',
      [result.insertId, req.user.id]
    );

    await conn.commit();
    res.status(201).json({ id: result.insertId, name, description, default_currency: default_currency || 'INR' });
  } catch (err) {
    await conn.rollback();
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group.' });
  } finally {
    conn.release();
  }
});

// GET /api/groups - List user's groups
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [groups] = await pool.query(
      `SELECT g.*, gm.joined_at, gm.left_at, gm.is_active,
       (SELECT COUNT(*) FROM group_memberships WHERE group_id = g.id AND is_active = TRUE) as member_count,
       (SELECT COUNT(*) FROM expenses WHERE group_id = g.id) as expense_count
       FROM \`groups\` g
       JOIN group_memberships gm ON g.id = gm.group_id AND gm.user_id = ?
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json({ groups });
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups.' });
  }
});

// GET /api/groups/:id - Group details with members
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [groups] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [req.params.id]);
    if (groups.length === 0) return res.status(404).json({ error: 'Group not found.' });

    const [members] = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.is_guest,
       gm.joined_at, gm.left_at, gm.is_active
       FROM group_memberships gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?
       ORDER BY gm.joined_at ASC`,
      [req.params.id]
    );

    res.json({ group: groups[0], members });
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Failed to fetch group.' });
  }
});

// PUT /api/groups/:id - Update group
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, default_currency } = req.body;
    await pool.query(
      'UPDATE `groups` SET name = COALESCE(?, name), description = COALESCE(?, description), default_currency = COALESCE(?, default_currency) WHERE id = ?',
      [name, description, default_currency, req.params.id]
    );
    res.json({ message: 'Group updated.' });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Failed to update group.' });
  }
});

// POST /api/groups/:id/members - Add member to group
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { user_id, display_name, joined_at } = req.body;
    let memberId = user_id;

    // If no user_id, create a guest user
    if (!memberId && display_name) {
      // Check if guest already exists by display_name
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE display_name = ? AND is_guest = TRUE', [display_name]
      );
      if (existing.length > 0) {
        memberId = existing[0].id;
      } else {
        const guestUsername = display_name.toLowerCase().replace(/\s+/g, '_') + '_guest';
        const guestEmail = guestUsername + '@guest.local';
        const [result] = await pool.query(
          'INSERT INTO users (username, email, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, TRUE)',
          [guestUsername, guestEmail, 'GUEST_NO_LOGIN', display_name]
        );
        memberId = result.insertId;
      }
    }

    if (!memberId) return res.status(400).json({ error: 'user_id or display_name required.' });

    // Check if already a member
    const [existing] = await pool.query(
      'SELECT id FROM group_memberships WHERE group_id = ? AND user_id = ? AND is_active = TRUE',
      [req.params.id, memberId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User is already an active member.' });
    }

    await pool.query(
      'INSERT INTO group_memberships (group_id, user_id, joined_at, is_active) VALUES (?, ?, ?, TRUE)',
      [req.params.id, memberId, joined_at || new Date().toISOString().split('T')[0]]
    );

    res.status(201).json({ message: 'Member added.', user_id: memberId });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member.' });
  }
});

// PUT /api/groups/:id/members/:userId - Update membership (set leave date)
router.put('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { left_at, is_active, joined_at } = req.body;
    const updates = [];
    const params = [];

    if (left_at !== undefined) { updates.push('left_at = ?'); params.push(left_at); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
    if (joined_at !== undefined) { updates.push('joined_at = ?'); params.push(joined_at); }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided.' });

    params.push(req.params.id, req.params.userId);
    await pool.query(
      `UPDATE group_memberships SET ${updates.join(', ')} WHERE group_id = ? AND user_id = ?`,
      params
    );
    res.json({ message: 'Membership updated.' });
  } catch (err) {
    console.error('Update membership error:', err);
    res.status(500).json({ error: 'Failed to update membership.' });
  }
});

module.exports = router;
