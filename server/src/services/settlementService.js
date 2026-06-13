const { calculateBalances } = require('./balanceService');

/**
 * Simplify debts using a greedy algorithm.
 * Produces the minimum number of transactions to settle all debts.
 * (Aisha's request: "one number per person, who pays whom, done")
 */
async function simplifyDebts(groupId) {
  const { balances } = await calculateBalances(groupId);

  // Separate into debtors (negative balance = they owe) and creditors (positive = they're owed)
  const debtors = [];
  const creditors = [];

  balances.forEach(b => {
    if (b.net_balance < -0.01) {
      debtors.push({ user_id: b.user_id, name: b.display_name, amount: Math.abs(b.net_balance) });
    } else if (b.net_balance > 0.01) {
      creditors.push({ user_id: b.user_id, name: b.display_name, amount: b.net_balance });
    }
  });

  // Sort descending by amount for greedy matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0.01) {
      transactions.push({
        from_id: debtor.user_id,
        from_name: debtor.name,
        to_id: creditor.user_id,
        to_name: creditor.name,
        amount: parseFloat(settleAmount.toFixed(2)),
        currency: 'INR'
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return {
    transactions,
    total_transactions: transactions.length,
    note: 'These are the minimum number of payments needed to settle all debts.'
  };
}

module.exports = { simplifyDebts };
