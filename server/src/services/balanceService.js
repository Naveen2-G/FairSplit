const pool = require('../config/db');
const { convertToINR } = require('../utils/currencyConverter');

/**
 * Calculate net balances for all members in a group.
 * 
 * For each expense:
 *   - Payer is OWED (total - their_share) by others
 *   - Each participant OWES their_share to the payer
 * 
 * Settlements reduce what one person owes another.
 * USD expenses are converted to INR at 95.11.
 */
async function calculateBalances(groupId) {
  // Get all members
  const [members] = await pool.query(
    `SELECT u.id, u.display_name, gm.joined_at, gm.left_at, gm.is_active
     FROM group_memberships gm JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ?`,
    [groupId]
  );

  // Get all expenses with splits
  const [expenses] = await pool.query(
    `SELECT e.*, u.display_name as paid_by_name
     FROM expenses e JOIN users u ON e.paid_by = u.id
     WHERE e.group_id = ? AND e.is_settlement = FALSE
     ORDER BY e.expense_date`,
    [groupId]
  );

  // Get all settlements
  const [settlements] = await pool.query(
    'SELECT * FROM settlements WHERE group_id = ?', [groupId]
  );

  // Initialize pairwise balances: balances[A][B] = amount A owes B
  const pairwise = {};
  const memberMap = {};
  members.forEach(m => {
    memberMap[m.id] = m;
    pairwise[m.id] = {};
    members.forEach(m2 => { pairwise[m.id][m2.id] = 0; });
  });

  // Process each expense
  for (const expense of expenses) {
    const [splits] = await pool.query(
      'SELECT * FROM expense_splits WHERE expense_id = ?', [expense.id]
    );

    const amountINR = convertToINR(parseFloat(expense.amount), expense.currency);
    const payerId = expense.paid_by;

    for (const split of splits) {
      const owedINR = convertToINR(parseFloat(split.owed_amount), expense.currency);
      if (split.user_id !== payerId) {
        // This user owes the payer
        if (pairwise[split.user_id]) {
          pairwise[split.user_id][payerId] = (pairwise[split.user_id][payerId] || 0) + owedINR;
        }
      }
    }
  }

  // Process settlements
  for (const s of settlements) {
    const amountINR = convertToINR(parseFloat(s.amount), s.currency);
    // from_user paid to_user, so from_user's debt to to_user decreases
    if (pairwise[s.from_user] && pairwise[s.from_user][s.to_user] !== undefined) {
      pairwise[s.from_user][s.to_user] -= amountINR;
    }
  }

  // Compute net pairwise (A owes B net = pairwise[A][B] - pairwise[B][A])
  const netPairwise = [];
  const processed = new Set();

  for (const a of members) {
    for (const b of members) {
      if (a.id === b.id) continue;
      const key = [Math.min(a.id, b.id), Math.max(a.id, b.id)].join('-');
      if (processed.has(key)) continue;
      processed.add(key);

      const aOwesB = (pairwise[a.id]?.[b.id] || 0) - (pairwise[b.id]?.[a.id] || 0);
      if (Math.abs(aOwesB) > 0.01) {
        if (aOwesB > 0) {
          netPairwise.push({
            from_id: a.id, from_name: a.display_name,
            to_id: b.id, to_name: b.display_name,
            amount: parseFloat(aOwesB.toFixed(2))
          });
        } else {
          netPairwise.push({
            from_id: b.id, from_name: b.display_name,
            to_id: a.id, to_name: a.display_name,
            amount: parseFloat(Math.abs(aOwesB).toFixed(2))
          });
        }
      }
    }
  }

  // Compute individual net balances
  const individualBalances = members.map(m => {
    let totalOwed = 0;  // How much others owe this person
    let totalOwes = 0;  // How much this person owes others

    netPairwise.forEach(p => {
      if (p.to_id === m.id) totalOwed += p.amount;
      if (p.from_id === m.id) totalOwes += p.amount;
    });

    return {
      user_id: m.id,
      display_name: m.display_name,
      is_active: m.is_active,
      joined_at: m.joined_at,
      left_at: m.left_at,
      net_balance: parseFloat((totalOwed - totalOwes).toFixed(2)),
      total_owed_to_you: parseFloat(totalOwed.toFixed(2)),
      total_you_owe: parseFloat(totalOwes.toFixed(2))
    };
  });

  return {
    balances: individualBalances,
    pairwise: netPairwise,
    currency: 'INR'
  };
}

/**
 * Get detailed balance breakdown for a specific user.
 * Shows every expense that contributes to their balance (Rohan's request).
 */
async function getBalanceBreakdown(groupId, userId) {
  const [expenses] = await pool.query(
    `SELECT e.*, u.display_name as paid_by_name
     FROM expenses e JOIN users u ON e.paid_by = u.id
     WHERE e.group_id = ? AND e.is_settlement = FALSE
     ORDER BY e.expense_date`,
    [groupId]
  );

  const [settlements] = await pool.query(
    `SELECT s.*, fu.display_name as from_name, tu.display_name as to_name
     FROM settlements s
     JOIN users fu ON s.from_user = fu.id
     JOIN users tu ON s.to_user = tu.id
     WHERE s.group_id = ? AND (s.from_user = ? OR s.to_user = ?)`,
    [groupId, userId, userId]
  );

  const [userRows] = await pool.query('SELECT display_name FROM users WHERE id = ?', [userId]);
  const userName = userRows[0]?.display_name || 'Unknown';

  const breakdown = [];
  let runningBalance = 0;

  for (const expense of expenses) {
    const [splits] = await pool.query(
      'SELECT * FROM expense_splits WHERE expense_id = ?', [expense.id]
    );

    const userSplit = splits.find(s => s.user_id === parseInt(userId));
    if (!userSplit && expense.paid_by !== parseInt(userId)) continue;

    const amountINR = convertToINR(parseFloat(expense.amount), expense.currency);
    const myShareINR = userSplit ? convertToINR(parseFloat(userSplit.owed_amount), expense.currency) : 0;

    let impact = 0;
    if (expense.paid_by === parseInt(userId)) {
      // I paid: I'm owed (total - my share)
      impact = amountINR - myShareINR;
    } else {
      // Someone else paid: I owe my share
      impact = -myShareINR;
    }

    runningBalance += impact;

    breakdown.push({
      type: 'expense',
      id: expense.id,
      date: expense.expense_date,
      description: expense.description,
      total_amount: parseFloat(expense.amount),
      currency: expense.currency,
      total_amount_inr: amountINR,
      paid_by: expense.paid_by_name,
      my_share: myShareINR,
      impact: parseFloat(impact.toFixed(2)),
      running_balance: parseFloat(runningBalance.toFixed(2)),
      split_type: expense.split_type
    });
  }

  // Add settlements
  for (const s of settlements) {
    const amountINR = convertToINR(parseFloat(s.amount), s.currency);
    let impact = 0;

    if (s.from_user === parseInt(userId)) {
      impact = -amountINR; // I paid someone
    } else {
      impact = amountINR; // Someone paid me
    }

    runningBalance += impact;

    breakdown.push({
      type: 'settlement',
      id: s.id,
      date: s.settlement_date,
      description: `${s.from_name} paid ${s.to_name}`,
      total_amount: parseFloat(s.amount),
      currency: s.currency,
      total_amount_inr: amountINR,
      impact: parseFloat(impact.toFixed(2)),
      running_balance: parseFloat(runningBalance.toFixed(2))
    });
  }

  // Sort by date
  breakdown.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Recalculate running balance after sort
  let rb = 0;
  breakdown.forEach(item => {
    rb += item.impact;
    item.running_balance = parseFloat(rb.toFixed(2));
  });

  return {
    user_id: parseInt(userId),
    user_name: userName,
    breakdown,
    final_balance: parseFloat(rb.toFixed(2)),
    currency: 'INR'
  };
}

module.exports = { calculateBalances, getBalanceBreakdown };
