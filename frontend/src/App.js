import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, api } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProjectTracker from './pages/ProjectTracker';
import ApplicationList from './pages/ApplicationList';
import Analytics from './pages/Analytics';
import ActivityLogs from './pages/ActivityLogs';
import UserManagement from './pages/UserManagement';
import VulnerabilityTracker from './pages/VulnerabilityTracker';
import Reports from './pages/Reports';
import ITInfra from './pages/ITInfra';
import RiskAcceptance from './pages/RiskAcceptance';

const NAV = [
  { id: 'dashboard',    label: 'Overview',         roles: ['admin','engineer','viewer'] },
  { id: 'projects',     label: 'Projects',          roles: ['admin','engineer','viewer'] },
  { id: 'applications', label: 'Applications',      roles: ['admin','engineer','viewer'] },
  { id: 'it-infra',     label: 'IT Infra',          roles: ['admin','engineer','viewer'] },
  { id: 'vulns',        label: 'Vuln Tracker',      roles: ['admin','engineer','viewer'] },
  { id: 'risk',         label: 'Risk Acceptance',   roles: ['admin','engineer','viewer'] },
  { id: 'reports',      label: 'Reports',           roles: ['admin','engineer','viewer'] },
  { id: 'analytics',    label: 'Analytics',         roles: ['admin','engineer','viewer'] },
  { id: 'logs',         label: 'Activity Logs',     roles: ['admin'] },
  { id: 'users',        label: 'Users',             roles: ['admin'] },
];

const ROLE_COLOR = { admin: 'var(--cyan)', engineer: 'var(--purple)', viewer: 'var(--text2)' };

function AlertBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);

  const fetchCount = useCallback(async () => {
    try { const r = await api.get('/api/analytics/alerts/unread-count'); setCount(r.data.count); } catch {}
  }, []);

  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, [fetchCount]);

  const openAlerts = async () => {
    setOpen(true);
    try { const r = await api.get('/api/analytics/alerts'); setAlerts(r.data); } catch {}
  };

  const markRead = async (id) => {
    await api.patch(`/api/analytics/alerts/${id}/read`);
    setAlerts(a => a.map(x => x.id === id ? { ...x, is_read: 1 } : x));
    setCount(c => Math.max(0, c - 1));
  };

  const markAll = async () => {
    await api.patch('/api/analytics/alerts/read-all');
    setAlerts(a => a.map(x => ({ ...x, is_read: 1 })));
    setCount(0);
  };

  const sevColor = s => ({ critical:'var(--red)', warning:'var(--amber)', info:'var(--blue)', success:'var(--green)' }[s] || 'var(--text2)');

  return (
    <div style={{ position:'relative' }}>
      <button onClick={openAlerts} className="btn btn-ghost btn-sm" style={{ position:'relative', padding:'7px 10px' }}>
        🔔
        {count > 0 && (
          <span style={{ position:'absolute', top:'2px', right:'2px', background:'var(--red)', color:'#fff', borderRadius:'50%', width:'16px', height:'16px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'9px', fontWeight:700, animation:'pulse-dot 2s ease infinite' }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'44px', right:0, background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'12px', width:'340px', maxHeight:'420px', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-lg)', zIndex:500, animation:'fadeUp 0.2s ease' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'Syne', fontWeight:700, fontSize:'13px' }}>Alerts</span>
            <div style={{ display:'flex', gap:'8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={markAll} style={{ fontSize:'10px' }}>Mark all read</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>
          <div style={{ overflow:'auto', flex:1 }}>
            {alerts.length === 0
              ? <div style={{ padding:'24px', textAlign:'center', color:'var(--text2)', fontSize:'13px' }}>No alerts</div>
              : alerts.map(a => (
                <div key={a.id} onClick={() => markRead(a.id)} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: a.is_read ? 'transparent' : 'rgba(0,212,255,0.03)', display:'flex', gap:'10px', alignItems:'flex-start' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:sevColor(a.severity), marginTop:'5px', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'12px', fontWeight: a.is_read ? 400 : 600, color: a.is_read ? 'var(--text2)' : 'var(--text)' }}>{a.title}</div>
                    <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'2px', lineHeight:1.4 }}>{a.message}</div>
                    <div style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px', fontFamily:'DM Mono' }}>{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current_password:'', new_password:'', confirm_password:'' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState({ cur:false, nw:false, con:false });
  const { logout } = useAuth();

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (form.new_password !== form.confirm_password) { setError('New passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/api/auth/change-password', { current_password: form.current_password, new_password: form.new_password });
      setSuccess('Password changed successfully! Logging you out in 3 seconds...');
      setTimeout(() => { logout(); onClose(); }, 3000);
    } catch (err) {
      const errs = err.response?.data?.errors;
      setError(errs ? errs[0].msg : (err.response?.data?.error || 'Failed'));
    } finally { setLoading(false); }
  };

  const PwInput = ({ label, name, sk }) => (
    <div className="fgroup">
      <label className="flabel">{label}</label>
      <div style={{ position:'relative' }}>
        <input className="finput" type={show[sk] ? 'text' : 'password'} name={name} value={form[name]} onChange={handle} required style={{ paddingRight:'36px' }} />
        <button type="button" onClick={() => setShow(s => ({ ...s, [sk]: !s[sk] }))}
          style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text2)', fontSize:'14px' }}>
          {show[sk] ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:'420px' }}>
        <div className="modal-hd">
          <h2>🔑 Change Password</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-bd">
          {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', padding:'10px 14px', marginBottom:'16px', fontSize:'13px', color:'var(--red)' }}>⚠ {error}</div>}
          {success && <div style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:'8px', padding:'10px 14px', marginBottom:'16px', fontSize:'13px', color:'var(--green)' }}>✓ {success}</div>}
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <PwInput label="Current Password" name="current_password" sk="cur" />
            <PwInput label="New Password" name="new_password" sk="nw" />
            <PwInput label="Confirm New Password" name="confirm_password" sk="con" />
          </div>
          <div style={{ marginTop:'14px', padding:'10px 12px', background:'rgba(0,212,255,0.05)', border:'1px solid rgba(0,212,255,0.15)', borderRadius:'8px', fontSize:'11.5px', color:'var(--text2)', lineHeight:1.6 }}>
            Must be 8+ chars · uppercase & lowercase · number · special char (@$!%*?&)
          </div>
          <div style={{ display:'flex', gap:'10px', marginTop:'18px', justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : '🔑 Change Password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserMenu({ user, logout, onChangePw }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div style={{ position:'relative' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 10px', background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:'8px', cursor:'pointer', transition:'border-color 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor='var(--border2)'}
        onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
      >
        <div style={{ width:'26px', height:'26px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, fontFamily:'Syne', background: ROLE_COLOR[user.role]+'22', color:ROLE_COLOR[user.role], border:`1px solid ${ROLE_COLOR[user.role]}44`, flexShrink:0 }}>
          {user.username[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text)' }}>{user.full_name || user.username}</div>
          <div style={{ fontSize:'10px', color:ROLE_COLOR[user.role], fontFamily:'DM Mono', textTransform:'uppercase' }}>{user.role}</div>
        </div>
        <span style={{ fontSize:'10px', color:'var(--text3)', marginLeft:'2px' }}>▾</span>
      </div>

      {open && (
        <div style={{ position:'absolute', top:'46px', right:0, background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'10px', width:'210px', overflow:'hidden', boxShadow:'var(--shadow-lg)', zIndex:500, animation:'fadeUp 0.15s ease' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text)' }}>{user.full_name || user.username}</div>
            <div style={{ fontSize:'11px', color:'var(--text3)', fontFamily:'DM Mono', marginTop:'2px' }}>{user.email}</div>
          </div>
          {[
            { icon:'🔑', label:'Change Password', action: onChangePw, color:'var(--text2)' },
            { icon:'⏻', label:'Log Out', action: logout, color:'var(--red)', border:true },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ width:'100%', padding:'11px 14px', background:'none', border:'none', borderTop: item.border ? '1px solid var(--border)' : 'none', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:item.color, transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background='none'}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, loading, logout, can } = useAuth();
  const { theme, toggle } = useTheme();
  const [page, setPage] = useState('dashboard');
  const [showChangePw, setShowChangePw] = useState(false);

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', gap:'12px' }}>
      <div style={{ width:'20px', height:'20px', border:'2px solid var(--cyan)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <span style={{ color:'var(--text2)', fontFamily:'DM Mono', fontSize:'13px' }}>Loading...</span>
    </div>
  );

  if (!user) return <LoginPage />;

  const visibleNav = NAV.filter(n => n.roles.includes(user.role));

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <header style={{ background:'var(--header-bg)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'0 28px', display:'flex', alignItems:'center', height:'60px', position:'sticky', top:0, zIndex:200, gap:'20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
          <div style={{ width:'32px', height:'32px', background:'linear-gradient(135deg,var(--cyan),var(--blue))', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', color:'#fff', flexShrink:0 }}>⛨</div>
          <div>
            <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'15px', letterSpacing:'-0.02em' }}>Secure<span style={{ color:'var(--cyan)' }}>Track</span></div>
          </div>
        </div>

        <nav style={{ display:'flex', gap:'2px', flex:1, overflowX:'auto' }}>
          {visibleNav.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 13px', borderRadius:'7px', border:'none', cursor:'pointer', fontFamily:'Syne', fontSize:'12.5px', fontWeight: page===item.id ? 700 : 500, transition:'all 0.18s', whiteSpace:'nowrap', background: page===item.id ? 'rgba(0,212,255,0.1)' : 'transparent', color: page===item.id ? 'var(--cyan)' : 'var(--text2)', borderBottom: page===item.id ? '2px solid var(--cyan)' : '2px solid transparent' }}>
              <span style={{ fontSize:'13px' }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
          <button className="btn btn-ghost btn-sm" onClick={toggle} title={`Switch to ${theme==='dark'?'light':'dark'} mode`} style={{ padding:'7px 10px', fontSize:'15px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <AlertBell />
          <UserMenu user={user} logout={logout} onChangePw={() => setShowChangePw(true)} />
        </div>
      </header>

      <main style={{ flex:1, padding:'28px 32px', maxWidth:'1700px', margin:'0 auto', width:'100%' }}>
        {page==='dashboard'    && <Dashboard setPage={setPage} />}
        {page==='projects'     && <ProjectTracker />}
        {page==='applications' && <ApplicationList />}
        {page==='it-infra'     && <ITInfra />}
        {page==='vulns'        && <VulnerabilityTracker />}
        {page==='risk'         && <RiskAcceptance />}
        {page==='reports'      && <Reports />}
        {page==='analytics'    && <Analytics />}
        {page==='logs'         && can('view_logs') && <ActivityLogs />}
        {page==='users'        && can('manage_users') && <UserManagement />}
      </main>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
