import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList } from 'recharts';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';

const tt = { contentStyle: { background: '#0f1a2e', border: '1px solid #253f64', borderRadius: '8px', color: '#dce8f8', fontSize: '12px' }, cursor: { fill: 'rgba(0,212,255,0.05)' } };

export default function Dashboard({ setPage }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [projects, setProjects] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/overview'),
      api.get('/api/projects'),
      api.get('/api/analytics/alerts'),
    ]).then(([ov, pr, al]) => {
      setOverview(ov.data);
      setProjects(pr.data);
      setAlerts(al.data.filter(a => !a.is_read).slice(0, 5));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '10px' }}>
      <div style={{ width: '18px', height: '18px', border: '2px solid var(--cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span style={{ color: 'var(--text2)', fontFamily: 'DM Mono', fontSize: '13px' }}>Loading...</span>
    </div>
  );

  const ROLE_COLOR = { admin: 'var(--cyan)', engineer: 'var(--purple)', viewer: '#9ca3af' };
  const CHART_COLORS = ['#38bdf8','#a78bfa','#34d399','#fbbf24','#fb7185','#60a5fa','#f472b6'];
  const mitData = overview?.mitigationBreakdown || [];

  // Year-wise from report_sharing_date (same as Analytics page)
  const yearMap = {};
  projects.forEach(p => {
    if (!p.report_sharing_date) return;
    const yr = p.report_sharing_date.slice(0, 4);
    if (!yr || yr.length !== 4) return;
    yearMap[yr] = (yearMap[yr] || 0) + 1;
  });
  const yearData = Object.entries(yearMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, count]) => ({ year, count }));

  // Live counts from actual project data
  const criticalCount = projects.filter(p => {
    try {
      if (p.vulnerabilities) {
        const arr = JSON.parse(p.vulnerabilities);
        return arr.some(v => (typeof v === 'object' ? v.severity : '') === 'Critical');
      }
    } catch {}
    return p.severity === 'Critical';
  }).length;
  const resolvedCount = projects.filter(p => p.mitigation_status === 'Resolved').length;

  const recentProjects = [...projects].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Welcome bar */}
      <div className="fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Welcome back, <span style={{ color: ROLE_COLOR[user?.role] }}>{user?.full_name?.split(' ')[0] || user?.username}</span>
          </h1>
          <p style={{ color: 'var(--text2)', marginTop: '5px', fontSize: '13px' }}>
            <span style={{ color: ROLE_COLOR[user?.role], fontFamily: 'DM Mono', fontSize: '11px', textTransform: 'uppercase' }}>{user?.role}</span>
            {' '}· Security overview as of {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary" onClick={() => setPage('projects')}>+ New Project</button>
          <button className="btn btn-ghost" onClick={() => setPage('analytics')}>View Analytics →</button>
        </div>
      </div>

      {/* Unread alerts */}
      {alerts.length > 0 && (
        <div className="fade-up" style={{ animationDelay: '0.05s' }}>
          <div style={{ fontFamily: 'Syne', fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
            🔔 Unread Alerts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {alerts.map(a => {
              const color = { critical: 'var(--red)', warning: 'var(--amber)', info: 'var(--blue)', success: 'var(--green)' }[a.severity] || 'var(--text2)';
              return (
                <div key={a.id} style={{
                  background: `${color}0e`, border: `1px solid ${color}28`, borderRadius: '10px',
                  padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start',
                }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, marginTop: '5px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color }}>{a.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>{a.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Total Projects',  val: overview?.totalProjects, color: 'var(--cyan)',    icon: '⬢', action: 'projects' },
          { label: 'Applications',    val: overview?.totalApps,     color: 'var(--purple)',  icon: '◈', action: 'applications' },
          { label: 'Critical Issues', val: criticalCount,           color: '#ff3860',        icon: '⚠' },
          { label: 'Resolved',        val: resolvedCount,           color: 'var(--green)',   icon: '✓' },
        ].map((k, i) => (
          <div key={k.label} className="card fade-up"
            style={{ animationDelay: `${i * 0.05}s`, borderLeft: `3px solid ${k.color}`, cursor: k.action ? 'pointer' : 'default', padding: '16px' }}
            onClick={() => k.action && setPage(k.action)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '28px', fontFamily: 'Syne', fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.val ?? '—'}</div>
              <span style={{ fontSize: '18px', opacity: 0.6 }}>{k.icon}</span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text2)', marginTop: '8px', fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="card fade-up" style={{ animationDelay: '0.25s' }}>
          <div style={{ fontFamily: 'Syne', fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
            Projects by Year (Report Sharing Date)
          </div>
          {yearData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: '13px' }}>
              No data yet — set Report Sharing Dates on your projects
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={yearData} margin={{ top: 22, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,189,248,0.08)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text2)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} allowDecimals={false} />
                <Tooltip {...tt} formatter={v => [v, 'Projects']} />
                <Bar dataKey="count" name="Projects" radius={[4,4,0,0]}>
                  {yearData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  <LabelList dataKey="count" position="center" style={{ fill: '#fff', fontSize: 13, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card fade-up" style={{ animationDelay: '0.3s' }}>
          <div style={{ fontFamily: 'Syne', fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' }}>
            Mitigation Progress
          </div>
          {mitData.map(m => {
            const total = mitData.reduce((s, x) => s + x.count, 0);
            const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
            const color = { Resolved: 'var(--green)', Pending: 'var(--amber)', 'Risk Acceptance': 'var(--blue)', 'Business Requirements': 'var(--purple)' }[m.mitigation_status] || 'var(--text2)';
            return (
              <div key={m.mitigation_status} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{m.mitigation_status || 'Not Set'}</span>
                  <span style={{ fontSize: '12px', color, fontFamily: 'DM Mono', fontWeight: 600 }}>{m.count} ({pct}%)</span>
                </div>
                <div style={{ background: 'var(--bg2)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 1s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent projects */}
      <div className="card fade-up" style={{ animationDelay: '0.4s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontFamily: 'Syne', fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Recent Projects
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage('projects')}>View All →</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>#</th><th>Application</th><th>Vulnerability</th><th>Severity</th><th>Mitigation</th><th>Engineer</th><th>Added</th></tr></thead>
            <tbody>
              {recentProjects.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)' }}>No projects yet. <button className="btn btn-primary btn-sm" onClick={() => setPage('projects')}>Add first project</button></td></tr>
              ) : recentProjects.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text3)', fontSize: '11px', fontFamily: 'DM Mono' }}>{i + 1}</td>
                  <td style={{ color: 'var(--cyan)', fontWeight: 600 }}>{p.application_name || '—'}</td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.vulnerability_name || '—'}</td>
                  <td><span className={`badge b-${(p.severity || '').toLowerCase()}`}>{p.severity || '—'}</span></td>
                  <td><span className={`badge ${p.mitigation_status === 'Resolved' ? 'b-resolved' : 'b-pending'}`}>{p.mitigation_status || '—'}</span></td>
                  <td style={{ color: 'var(--purple)' }}>{p.engineer || '—'}</td>
                  <td style={{ fontFamily: 'DM Mono', fontSize: '11px', color: 'var(--text3)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
