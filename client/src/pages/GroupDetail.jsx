import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, Plus, UserPlus, ArrowRightLeft, Receipt, Users, TrendingUp, Trash2 } from 'lucide-react';
import API from '../api/client';
import toast from 'react-hot-toast';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [suggestions, setSuggestions] = useState(null);
  const [activeTab, setActiveTab] = useState('expenses');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [newMember, setNewMember] = useState({ display_name: '', joined_at: '' });
  const [newExpense, setNewExpense] = useState({ description: '', paid_by: '', amount: '', currency: 'INR', split_type: 'equal', expense_date: '', notes: '', split_with: [] });
  const [settleForm, setSettleForm] = useState({ from_user: '', to_user: '', amount: '', settlement_date: new Date().toISOString().split('T')[0] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, [id]);

  const fetchAll = async () => {
    try {
      const [gRes, eRes, bRes, sRes, sgRes] = await Promise.all([
        API.get(`/groups/${id}`),
        API.get(`/groups/${id}/expenses`),
        API.get(`/groups/${id}/balances`),
        API.get(`/groups/${id}/settlements`),
        API.get(`/groups/${id}/suggested-settlements`),
      ]);
      setGroup(gRes.data.group);
      setMembers(gRes.data.members);
      setExpenses(eRes.data.expenses);
      setBalances(bRes.data);
      setSettlements(sRes.data.settlements);
      setSuggestions(sgRes.data);
    } catch (err) {
      toast.error('Failed to load group');
    } finally {
      setLoading(false);
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    try {
      await API.post(`/groups/${id}/members`, newMember);
      toast.success('Member added!');
      setShowAddMember(false);
      setNewMember({ display_name: '', joined_at: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add member');
    }
  };

  const updateMembership = async (userId, left_at) => {
    try {
      await API.put(`/groups/${id}/members/${userId}`, { left_at, is_active: !left_at });
      toast.success('Membership updated');
      fetchAll();
    } catch (err) {
      toast.error('Failed to update membership');
    }
  };

  const addExpense = async (e) => {
    e.preventDefault();
    try {
      const splitWith = newExpense.split_with.length > 0 ? newExpense.split_with : members.filter(m => m.is_active).map(m => m.id);
      const splits = splitWith.map(uid => ({
        user_id: uid,
        owed_amount: parseFloat((newExpense.amount / splitWith.length).toFixed(2))
      }));
      await API.post(`/groups/${id}/expenses`, { ...newExpense, splits });
      toast.success('Expense added!');
      setShowAddExpense(false);
      setNewExpense({ description: '', paid_by: '', amount: '', currency: 'INR', split_type: 'equal', expense_date: '', notes: '', split_with: [] });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add expense');
    }
  };

  const deleteExpense = async (expenseId) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await API.delete(`/expenses/${expenseId}`);
      toast.success('Expense deleted');
      fetchAll();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const recordSettlement = async (e) => {
    e.preventDefault();
    try {
      await API.post(`/groups/${id}/settlements`, settleForm);
      toast.success('Settlement recorded!');
      setShowSettle(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record settlement');
    }
  };

  const fmt = (n, currency = 'INR') => {
    const sym = currency === 'USD' ? '$' : '₹';
    return `${sym}${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) return <div className="loading-screen" style={{ height: '60vh' }}><div className="spinner" /></div>;

  return (
    <div>
      <div className="detail-header">
        <div>
          <h1 className="page-title">{group?.name}</h1>
          <p className="page-subtitle">{group?.description || 'Shared expense group'}</p>
        </div>
        <div className="detail-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/groups/${id}/import`)}>
            <Upload size={16} /> Import CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddMember(true)}>
            <UserPlus size={16} /> Add Member
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddExpense(true)}>
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value blue">{members.length}</div>
          <div className="stat-label">Members</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{expenses.length}</div>
          <div className="stat-label">Expenses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value green">{fmt(expenses.reduce((s, e) => s + parseFloat(e.amount), 0), 'INR')}</div>
          <div className="stat-label">Total Spent</div>
        </div>
        <div className="stat-card">
          <div className="stat-value yellow">{suggestions?.total_transactions || 0}</div>
          <div className="stat-label">Settlements Needed</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['expenses', 'balances', 'settlements', 'members'].map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="card">
          {expenses.length === 0 ? (
            <div className="empty-state"><p>No expenses yet. Add one or import from CSV!</p></div>
          ) : expenses.map(exp => (
            <div key={exp.id} className="expense-item">
              <div className="expense-left">
                <div className="expense-icon">{exp.currency === 'USD' ? '$' : '₹'}</div>
                <div className="expense-info">
                  <div className="expense-desc">{exp.description}</div>
                  <div className="expense-meta">
                    Paid by {exp.paid_by_name} • {new Date(exp.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {exp.split_type !== 'equal' && <span className="badge badge-primary" style={{ marginLeft: '0.5rem' }}>{exp.split_type}</span>}
                  </div>
                </div>
              </div>
              <div className="expense-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div>
                  <div className="expense-amount">{fmt(exp.amount, exp.currency)}</div>
                  <div className="expense-currency">{exp.splits?.length || 0} people</div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); deleteExpense(exp.id); }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Balances Tab */}
      {activeTab === 'balances' && balances && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header"><span className="card-title">Individual Balances</span></div>
            {balances.balances.map(b => (
              <div key={b.user_id} className="balance-card" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/groups/${id}/balances/${b.user_id}`)}>
                <div>
                  <div className="balance-name">
                    {b.display_name}
                    {!b.is_active && <span className="member-status inactive" style={{ marginLeft: '0.5rem' }}>left</span>}
                  </div>
                  <div className="balance-detail">
                    Gets back {fmt(b.total_owed_to_you)} • Owes {fmt(b.total_you_owe)}
                  </div>
                </div>
                <div className={`balance-amount ${b.net_balance >= 0 ? 'positive' : 'negative'}`}>
                  {b.net_balance >= 0 ? '+' : ''}{fmt(b.net_balance)}
                </div>
              </div>
            ))}
          </div>
          {suggestions && suggestions.transactions.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Simplified Settlements</span>
                <button className="btn btn-primary btn-sm" onClick={() => setShowSettle(true)}>
                  <ArrowRightLeft size={14} /> Record Payment
                </button>
              </div>
              {suggestions.transactions.map((t, i) => (
                <div key={i} className="settlement-item">
                  <span style={{ fontWeight: 500 }}>{t.from_name}</span>
                  <span className="settlement-arrow">→ pays →</span>
                  <span style={{ fontWeight: 500 }}>{t.to_name}</span>
                  <span className="settlement-amount">{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settlements Tab */}
      {activeTab === 'settlements' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Payment History</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowSettle(true)}>
              <Plus size={14} /> Record Payment
            </button>
          </div>
          {settlements.length === 0 ? (
            <div className="empty-state"><p>No settlements recorded yet.</p></div>
          ) : settlements.map(s => (
            <div key={s.id} className="expense-item">
              <div className="expense-left">
                <div className="expense-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>↗</div>
                <div className="expense-info">
                  <div className="expense-desc">{s.from_name} paid {s.to_name}</div>
                  <div className="expense-meta">{new Date(s.settlement_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
              </div>
              <div className="expense-amount positive">{fmt(s.amount, s.currency)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Members</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddMember(true)}>
              <UserPlus size={14} /> Add
            </button>
          </div>
          {members.map(m => (
            <div key={m.id} className="member-item">
              <div className="member-info">
                <div className="member-avatar">{m.display_name.charAt(0)}</div>
                <div>
                  <div className="member-name">{m.display_name} {m.is_guest && <span className="badge badge-warning">guest</span>}</div>
                  <div className="member-dates">
                    Joined {new Date(m.joined_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {m.left_at && ` • Left ${new Date(m.left_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`member-status ${m.is_active ? 'active' : 'inactive'}`}>
                  {m.is_active ? 'Active' : 'Left'}
                </span>
                {m.is_active && (
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const date = prompt('Enter leave date (YYYY-MM-DD):');
                      if (date) updateMembership(m.id, date);
                    }}>Set Leave</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Member</h2>
            <form onSubmit={addMember}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" placeholder="Member name" value={newMember.display_name}
                  onChange={e => setNewMember({...newMember, display_name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Joined Date</label>
                <input type="date" className="form-input" value={newMember.joined_at}
                  onChange={e => setNewMember({...newMember, joined_at: e.target.value})} required />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="modal-overlay" onClick={() => setShowAddExpense(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Expense</h2>
            <form onSubmit={addExpense}>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" placeholder="What was the expense?" value={newExpense.description}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input type="number" step="0.01" className="form-input" placeholder="0.00" value={newExpense.amount}
                    onChange={e => setNewExpense({...newExpense, amount: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={newExpense.currency}
                    onChange={e => setNewExpense({...newExpense, currency: e.target.value})}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Paid By</label>
                  <select className="form-select" value={newExpense.paid_by}
                    onChange={e => setNewExpense({...newExpense, paid_by: e.target.value})} required>
                    <option value="">Select...</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={newExpense.expense_date}
                    onChange={e => setNewExpense({...newExpense, expense_date: e.target.value})} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Split Type</label>
                <select className="form-select" value={newExpense.split_type}
                  onChange={e => setNewExpense({...newExpense, split_type: e.target.value})}>
                  <option value="equal">Equal</option>
                  <option value="unequal">Unequal</option>
                  <option value="percentage">Percentage</option>
                  <option value="share">By Shares</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-input" placeholder="Any notes..." value={newExpense.notes}
                  onChange={e => setNewExpense({...newExpense, notes: e.target.value})} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddExpense(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Settlement Modal */}
      {showSettle && (
        <div className="modal-overlay" onClick={() => setShowSettle(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Record Settlement</h2>
            <form onSubmit={recordSettlement}>
              <div className="form-group">
                <label className="form-label">Who is paying?</label>
                <select className="form-select" value={settleForm.from_user}
                  onChange={e => setSettleForm({...settleForm, from_user: e.target.value})} required>
                  <option value="">Select payer...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Paying to?</label>
                <select className="form-select" value={settleForm.to_user}
                  onChange={e => setSettleForm({...settleForm, to_user: e.target.value})} required>
                  <option value="">Select receiver...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input type="number" step="0.01" className="form-input" value={settleForm.amount}
                    onChange={e => setSettleForm({...settleForm, amount: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={settleForm.settlement_date}
                    onChange={e => setSettleForm({...settleForm, settlement_date: e.target.value})} required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSettle(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
