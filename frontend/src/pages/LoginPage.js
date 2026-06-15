import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Background grid pattern */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="fade-up" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '56px', height: '56px', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--cyan), var(--blue))',
            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', boxShadow: '0 0 30px rgba(0,212,255,0.35)',
            animation: 'glow 3s ease infinite',
          }}>⛨</div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Secure<span style={{ color: 'var(--cyan)' }}>Track</span>
          </h1>
          <p style={{ color: 'var(--text2)', marginTop: '6px', fontSize: '13px', fontWeight: 400 }}>
            Vulnerability & Project Management Platform
          </p>
        </div>

        {/* Login card */}
        <div className="card" style={{ border: '1px solid var(--border2)', boxShadow: 'var(--shadow-lg)' }}>
          <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize: '14px', fontWeight: 700, marginBottom: '20px', color: 'var(--text2)' }}>
            Sign in to your account
          </h2>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
              fontSize: '13px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="fgroup">
              <label className="flabel">Username or Email</label>
              <input
                className="finput"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
            <div className="fgroup">
              <label className="flabel">Password</label>
              <input
                className="finput"
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '4px', padding: '10px' }}>
              {loading ? (
                <><span style={{ width:'14px',height:'14px',border:'2px solid currentColor',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite',display:'inline-block' }} /> Signing in...</>
              ) : 'Sign In →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: 'var(--text3)' }}>
          SecureTrack v2.0
        </p>
      </div>
    </div>
  );
}
