import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import API from '../api/client';
import toast from 'react-hot-toast';

export default function BalanceDetail() {
  const { id, userId } = useParams();
  const navigate = useNavigate();
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get(`/groups/${id}/balances/${userId}`)
      .then(res => setBreakdown(res.data))
      .catch(() => toast.error('Failed to load breakdown'))
      .finally(() => setLoading(false));
  }, [id, userId]);

  const fmt = (n) => `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="loading-screen" style={{ height: '60vh' }}><div className="spinner" /></div>;
  if (!breakdown) return <div className="empty-state"><p>No data found.</p></div>;

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate(`/groups/${id}`)} style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to Group
      </button>

      <div className="page-header">
        <h1 className="page-title">Balance Breakdown: {breakdown.user_name}</h1>
        <p className="page-subtitle">
          Every expense that contributes to this balance •
          Final: <span style={{ fontWeight: 700, color: breakdown.final_balance >= 0 ? 'var(--accent)' : 'var(--danger-light)' }}>
            {breakdown.final_balance >= 0 ? '+' : ''}{fmt(breakdown.final_balance)}
          </span>
        </p>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="breakdown-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Total</th>
              <th>My Share</th>
              <th>Impact</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.breakdown.map((item, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                  {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{item.description}</div>
                  {item.type === 'settlement' && <span className="badge badge-warning">settlement</span>}
                  {item.currency === 'USD' && <span className="badge badge-primary" style={{ marginLeft: '0.3rem' }}>USD</span>}
                  {item.split_type && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> ({item.split_type})</span>}
                </td>
                <td>
                  {item.currency === 'USD' ? `$${item.total_amount}` : ''}{item.currency === 'USD' ? ' → ' : ''}
                  {fmt(item.total_amount_inr)}
                </td>
                <td>{item.my_share !== undefined ? fmt(item.my_share) : '—'}</td>
                <td style={{ fontWeight: 600, color: item.impact >= 0 ? 'var(--accent)' : 'var(--danger-light)' }}>
                  {item.impact >= 0 ? '+' : ''}{fmt(item.impact)}
                </td>
                <td style={{ fontWeight: 600, color: item.running_balance >= 0 ? 'var(--accent)' : 'var(--danger-light)' }}>
                  {item.running_balance >= 0 ? '+' : ''}{fmt(item.running_balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
