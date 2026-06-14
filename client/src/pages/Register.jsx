import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '' });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form.username, form.email, form.password, form.display_name || form.username);
      toast.success('Account created!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Join FairSplit</h1>
        <p className="auth-subtitle">Create your account to start splitting expenses</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input id="register-name" type="text" className="form-input" placeholder="Your name"
              value={form.display_name} onChange={update('display_name')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input id="register-username" type="text" className="form-input" placeholder="Choose a username"
              value={form.username} onChange={update('username')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input id="register-email" type="email" className="form-input" placeholder="you@example.com"
              value={form.email} onChange={update('email')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input id="register-password" type="password" className="form-input" placeholder="Min 6 characters"
              value={form.password} onChange={update('password')} required minLength={6} />
          </div>
          <button id="register-submit" type="submit" className="btn btn-primary auth-btn" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
