import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';

const ACTION_COLOR = {
  LOGIN: 'var(--green)', LOGOUT: 'var(--text2)', LOGIN_FAILED: 'var(--red)',
  CREATE_PROJECT: 'var(--cyan)', UPDATE_PROJECT: 'var(--blue)', DELETE_PROJECT: 'var(--red)',
  CREATE_APPLICATION: 'var(--purple)', UPDATE_APPLICATION: 'var(--purple)', DELETE_APPLICATION: 'var(--red)',
  CREATE_USER: 'var(--cyan)', UPDATE_USER: 'var(--amber)', DEACTIVATE_USER: 'var(--red)',
  UNAUTHORIZED_ACCESS: 'var(--red)', EXPORT_PROJECTS: 'var(--amber)', EXPORT_APPLICATIONS: 'var(--amber)',
};

export default function ActivityLogs() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ user: '', action: '' });
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/analytics/logs', {
        params: { limit: LIMIT, offset: page * LIMIT, user: filter.user, action: filter.action }
      });
      setRows(r.data.rows);
      setTotal(r.data.total);
    } catch {} finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  const ACTIONS = [
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
    'CREATE_PROJECT', 'UPDATE_PROJECT', 'DELETE_PROJECT',
    'CREATE_APPLICATION', 'UPDATE_APPLICATION', 'DELETE_APPLICATION',
    'CREATE_USER', 'UPDATE_USER', 'DEACTIVATE_USER',
    'UNAUTHORIZED_ACCESS', 'EXPORT_PROJECTS', 'EXPORT_APPLICATIONS',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Activity <span style={{ color: 'var(--cyan)' }}>Logs</span>
          </h1>
          <p style={{ color: 'var(--text2)', marginTop: '4px', fontSize: '13px' }}>
            {total} total events · Full audit trail
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <input
          className="finput"
          style={{ maxWidth: '220px' }}
          placeholder="🔍 Filter by user..."
          value={filter.user}
          onChange={e => { setFilter(f => ({ ...f, user: e.target.value })); setPage(0); }}
        />
        <select
          className="fselect"
          style={{ maxWidth: '220px' }}
          value={filter.action}
          onChange={e => { setFilter(f => ({ ...f, action: e.target.value })); setPage(0); }}
        >
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filter.user || filter.action) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ user: '', action: '' })}>Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text2)', fontFamily: 'DM Mono', fontSize: '13px' }}>Loading logs...</div>
      ) : (
        <div className="tbl-wrap fade-up">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Name</th>
                <th>Details</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text2)' }}>No logs found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text3)', fontFamily: 'DM Mono', fontSize: '11px' }}>{page * LIMIT + i + 1}</td>
                  <td style={{ fontFamily: 'DM Mono', fontSize: '11px', color: 'var(--text2)' }}>
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--cyan)' }}>{r.username || '—'}</td>
                  <td>
                    <span style={{
                      fontFamily: 'DM Mono', fontSize: '10.5px', fontWeight: 600,
                      color: ACTION_COLOR[r.action] || 'var(--text2)',
                      background: (ACTION_COLOR[r.action] || 'var(--text2)') + '18',
                      border: `1px solid ${(ACTION_COLOR[r.action] || 'var(--text2)')}30`,
                      borderRadius: '5px', padding: '2px 7px', whiteSpace: 'nowrap',
                    }}>{r.action}</span>
                  </td>
                  <td style={{ fontSize: '11.5px', color: 'var(--text2)' }}>{r.resource_type || '—'}</td>
                  <td style={{ color: 'var(--text)', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.resource_name || '—'}</td>
                  <td style={{ color: 'var(--text2)', fontSize: '11.5px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.details || '—'}</td>
                  <td style={{ fontFamily: 'DM Mono', fontSize: '11px', color: 'var(--text3)' }}>{r.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
        <span style={{ fontFamily: 'DM Mono', fontSize: '12px', color: 'var(--text2)' }}>
          Page {page + 1} / {Math.ceil(total / LIMIT) || 1}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}>Next →</button>
      </div>
    </div>
  );
}
