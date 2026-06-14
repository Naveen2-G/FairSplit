import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Wallet, Home } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <Wallet size={24} style={{ color: '#6366f1' }} />
        <span className="logo">FairSplit</span>
      </Link>
      <div className="navbar-right">
        <Link to="/" className="btn btn-ghost btn-sm">
          <Home size={16} /> Dashboard
        </Link>
        <span className="navbar-user">Hi, {user?.display_name || user?.username}</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          <LogOut size={16} /> Logout
        </button>
      </div>
    </nav>
  );
}
