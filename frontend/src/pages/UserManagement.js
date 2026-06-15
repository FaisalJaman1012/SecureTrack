import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';

const ROLE_BADGE = {
  admin: 'b-admin', engineer: 'b-engineer', viewer: 'b-viewer'
};

export default function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'viewer', full_name: '' });
  const [errors, setErrors] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    try { const r = await api.get('/api/auth/users'); setUsers(r.data); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async (e) => {
    e.preventDefault();
    setErrors([]);
    try {
      await api.post('/api/auth/register', form);
      showToast(`✓ User "${form.username}" created`);
      setModal(null);
      setForm({ username: '', email: '', password: '', role: 'viewer', full_name: '' });
      load();
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs) setErrors(errs);
      else setErrors([{ msg: err.response?.data?.error || 'Failed to create user' }]);
    }
  };

  const toggleActive = async (u) => {
    await api.patch(`/api/auth/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
    showToast(`${u.is_active ? 'Deactivated' : 'Activated'} ${u.username}`, u.is_active ? 'error' : 'success');
    load();
  };

  const changeRole = async (u, role) => {
    await api.patch(`/api/auth/users/${u.id}`, { role });
    showToast(`✓ Role updated`);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            User <span style={{ color: 'var(--cyan)' }}>Management</span>
          </h1>
          <p style={{ color: 'var(--text2)', marginTop: '4px', fontSize: '13px' }}>
            {users.length} registered · RBAC enforced
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>+ Create User</button>
      </div>

      {/* RBAC legend */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ fontSize: '11px', fontFamily: 'Syne', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>
          Role Permissions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            { role: 'admin', color: 'var(--cyan)', perms: ['Full access', 'Manage users', 'Delete records', 'View logs', 'Export data'] },
            { role: 'engineer', color: 'var(--purple)', perms: ['Create records', 'Edit own records', 'View all records', 'Export data'] },
            { role: 'viewer', color: '#9ca3af', perms: ['Read-only access', 'View all records'] },
          ].map(({ role, color, perms }) => (
            <div key={role} style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '14px', border: `1px solid ${color}22` }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '12px', color, marginBottom: '8px', textTransform: 'uppercase' }}>{role}</div>
              {perms.map(p => (
                <div key={p} style={{ fontSize: '11.5px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ color }}>✓</span> {p}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
      {loading ? <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text2)', fontFamily: 'DM Mono' }}>Loading...</div> : (
        <div className="tbl-wrap fade-up">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id}>
                  <td style={{ color: 'var(--text3)', fontFamily: 'DM Mono', fontSize: '11px' }}>{i + 1}</td>
                  <td style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {u.username}
                    {u.id === me.id && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--cyan)', fontFamily: 'DM Mono' }}>(you)</span>}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{u.full_name || '—'}</td>
                  <td style={{ fontFamily: 'DM Mono', fontSize: '11.5px', color: 'var(--text2)' }}>{u.email}</td>
                  <td>
                    {u.id === me.id ? (
                      <span className={`badge ${ROLE_BADGE[u.role]}`}>{u.role}</span>
                    ) : (
                      <select
                        className="fselect"
                        value={u.role}
                        onChange={e => changeRole(u, e.target.value)}
                        style={{ maxWidth: '110px', padding: '4px 8px', fontSize: '11.5px' }}
                      >
                        {['admin', 'engineer', 'viewer'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'b-yes' : 'b-no'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'DM Mono', fontSize: '11px', color: 'var(--text3)' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ fontFamily: 'DM Mono', fontSize: '11px', color: 'var(--text3)' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    {u.id !== me.id && (
                      <button
                        className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? '⊘ Disable' : '✓ Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user modal */}
      {modal === 'new' && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-hd">
              <h2>+ Create New User</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={createUser} className="modal-bd">
              {errors.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
                  {errors.map((e, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '2px' }}>• {e.field ? `${e.field}: ` : ''}{e.msg}</div>)}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { label: 'Username', key: 'username', ph: 'john_doe', type: 'text' },
                  { label: 'Full Name', key: 'full_name', ph: 'John Doe', type: 'text' },
                  { label: 'Email', key: 'email', ph: 'john@example.com', type: 'email' },
                  { label: 'Password', key: 'password', ph: 'Min 8 chars, upper+lower+num+special', type: 'password' },
                ].map(f => (
                  <div key={f.key} className="fgroup">
                    <label className="flabel">{f.label}</label>
                    <input className="finput" type={f.type} value={form[f.key]} placeholder={f.ph}
                      onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} required={f.key !== 'full_name'} />
                  </div>
                ))}
                <div className="fgroup">
                  <label className="flabel">Role</label>
                  <select className="fselect" value={form.role} onChange={e => setForm(x => ({ ...x, role: e.target.value }))}>
                    <option value="viewer">Viewer — read only</option>
                    <option value="engineer">Engineer — create & edit own</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
