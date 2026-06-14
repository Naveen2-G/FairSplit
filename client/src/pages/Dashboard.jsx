import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Receipt } from 'lucide-react';
import API from '../api/client';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [groups, setGroups] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { fetchGroups(); }, []);

  const fetchGroups = async () => {
    try {
      const res = await API.get('/groups');
      setGroups(res.data.groups);
    } catch (err) {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/groups', newGroup);
      toast.success('Group created!');
      setShowModal(false);
      setNewGroup({ name: '', description: '' });
      navigate(`/groups/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Your Groups</h1>
          <p className="page-subtitle">Manage shared expenses with your flatmates</p>
        </div>
        <button id="create-group-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> New Group
        </button>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ height: '40vh' }}><div className="spinner" /></div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No groups yet. Create one to start tracking expenses!</p>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map(g => (
            <div key={g.id} className="card group-card" onClick={() => navigate(`/groups/${g.id}`)}>
              <div className="group-name">{g.name}</div>
              {g.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{g.description}</p>}
              <div className="group-stats">
                <span><Users size={14} /> {g.member_count} members</span>
                <span><Receipt size={14} /> {g.expense_count} expenses</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Create New Group</h2>
            <form onSubmit={createGroup}>
              <div className="form-group">
                <label className="form-label">Group Name</label>
                <input id="group-name-input" className="form-input" placeholder="e.g., Flat Expenses"
                  value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea id="group-desc-input" className="form-input" placeholder="What's this group for?"
                  value={newGroup.description} onChange={e => setNewGroup({...newGroup, description: e.target.value})} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button id="group-create-submit" type="submit" className="btn btn-primary">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
