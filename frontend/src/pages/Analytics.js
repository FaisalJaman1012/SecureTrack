import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LabelList
} from 'recharts';
import { api } from '../context/AuthContext';
import { exportProjectsToExcel, exportApplicationsToExcel } from '../utils/exportExcel';

const COLORS = {
  Critical:'#fb7185', High:'#fb923c', Medium:'#fbbf24', Low:'#60a5fa', Informational:'#94a3b8',
  Resolved:'#34d399', Pending:'#fbbf24', 'Risk Acceptance':'#60a5fa', 'Business Requirements':'#a78bfa',
};
const CHART_COLORS = ['#38bdf8','#a78bfa','#34d399','#fbbf24','#fb7185','#60a5fa','#f472b6'];

const tt = {
  contentStyle: { background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'8px', color:'var(--text)', fontSize:'12px' },
  cursor: { fill:'rgba(56,189,248,0.05)' },
};

const T = ({ children }) => (
  <div style={{ fontSize:'11px', fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'14px' }}>{children}</div>
);

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [productivity, setProductivity] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/overview'),
      api.get('/api/analytics/productivity'),
      api.get('/api/projects'),
    ]).then(([ov, pr, pj]) => {
      setOverview(ov.data);
      setProductivity(pr.data);
      setProjects(pj.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleExportProjects = async () => {
    setExporting(true);
    try { const r = await api.get('/api/analytics/export/projects'); await exportProjectsToExcel(r.data); }
    catch { alert('Export failed'); } finally { setExporting(false); }
  };

  const handleExportApps = async () => {
    setExporting(true);
    try { const r = await api.get('/api/analytics/export/applications'); await exportApplicationsToExcel(r.data); }
    catch { alert('Export failed'); } finally { setExporting(false); }
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'300px', gap:'10px' }}>
      <div style={{ width:'18px', height:'18px', border:'2px solid var(--cyan)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <span style={{ color:'var(--text2)', fontSize:'13px' }}>Loading analytics...</span>
    </div>
  );

  const mitData      = overview?.mitigationBreakdown || [];
  const engineerData = overview?.engineerLoad || [];
  const resolvedRate = productivity?.resolvedRate || [];
  const completedData = productivity?.completedPerEngineer || [];
  const pendingData   = productivity?.pendingPerEngineer || [];
  const delayedData   = productivity?.delayedPerEngineer || [];

  // Year-wise based on report_sharing_date from raw projects
  const yearMap = {};
  projects.forEach(p => {
    if (!p.report_sharing_date) return;
    const yr = p.report_sharing_date.slice(0, 4);
    if (!yr || yr.length !== 4) return;
    yearMap[yr] = (yearMap[yr] || 0) + 1;
  });
  const yearData = Object.entries(yearMap).sort((a,b) => a[0].localeCompare(b[0])).map(([year,count]) => ({ year, count }));

  // Live counts from raw project data
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

  const engineerProdMap = {};
  completedData.forEach(d => { engineerProdMap[d.engineer] = { ...engineerProdMap[d.engineer], engineer:d.engineer, completed:d.completed }; });
  pendingData.forEach(d =>   { engineerProdMap[d.engineer] = { ...engineerProdMap[d.engineer], engineer:d.engineer, pending:d.pending }; });
  delayedData.forEach(d =>   { engineerProdMap[d.engineer] = { ...engineerProdMap[d.engineer], engineer:d.engineer, delayed:d.delayed }; });
  const engineerProd = Object.values(engineerProdMap);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'14px' }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:'22px', fontWeight:800, letterSpacing:'-0.02em' }}>Analytics & Reports</h1>
          <p style={{ color:'var(--text2)', marginTop:'4px', fontSize:'13px' }}>Performance metrics, trends and productivity insights</p>
        </div>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          <button className="btn btn-success btn-sm" onClick={handleExportProjects} disabled={exporting}>📊 Export Projects</button>
          <button className="btn btn-amber btn-sm" onClick={handleExportApps} disabled={exporting}>📋 Export Applications</button>
        </div>
      </div>

      {/* KPI — no Overdue, no Due Soon */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:'12px' }}>
        {[
          { label:'Total Projects', val:overview?.totalProjects, color:'var(--cyan)' },
          { label:'Total Apps',     val:overview?.totalApps,     color:'var(--purple)' },
          { label:'Critical Issues',val:criticalCount,           color:'var(--critical)' },
          { label:'Resolved',       val:resolvedCount,           color:'var(--green)' },
        ].map((k, i) => (
          <div key={k.label} className="card fade-up" style={{ animationDelay:`${i*0.05}s`, borderLeft:`3px solid ${k.color}`, padding:'14px' }}>
            <div style={{ fontSize:'26px', fontFamily:"'Manrope',sans-serif", fontWeight:800, color:k.color }}>{k.val ?? '—'}</div>
            <div style={{ fontSize:'11.5px', color:'var(--text2)', marginTop:'4px', fontWeight:500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Year-wise + Mitigation Pie */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px' }}>
        <div className="card fade-up" style={{ animationDelay:'0.2s' }}>
          <T>Projects by Year (Report Sharing Date)</T>
          {yearData.length === 0
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)', fontSize:'13px' }}>No data yet — set Report Sharing Dates on your projects</div>
            : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yearData} margin={{ top:22, right:10, bottom:5, left:-10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,189,248,0.08)" />
                  <XAxis dataKey="year" tick={{ fill:'var(--text2)', fontSize:11 }} />
                  <YAxis tick={{ fill:'var(--text2)', fontSize:11 }} allowDecimals={false} />
                  <Tooltip {...tt} formatter={v => [v,'Projects']} />
                  <Bar dataKey="count" name="Projects" radius={[4,4,0,0]}>
                    {yearData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    <LabelList dataKey="count" position="center" style={{ fill:'#fff', fontSize:13, fontWeight:700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>

        <div className="card fade-up" style={{ animationDelay:'0.25s' }}>
          <T>Mitigation Status</T>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={mitData} dataKey="count" nameKey="mitigation_status" cx="50%" cy="50%" outerRadius={88}
                label={({ mitigation_status, count }) => `${(mitigation_status||'N/A').slice(0,9)} (${count})`}
                labelLine={{ stroke:'var(--border2)' }}>
                {mitData.map((e, i) => <Cell key={i} fill={COLORS[e.mitigation_status] || CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tt.contentStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Engineer workload */}
      <div className="card fade-up" style={{ animationDelay:'0.3s' }}>
        <T>Engineer Workload — Total Assigned</T>
        {engineerData.length === 0
          ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)', fontSize:'13px' }}>No data yet</div>
          : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={engineerData} margin={{ top:22, right:10, bottom:5, left:-10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,189,248,0.08)" />
                <XAxis dataKey="engineer" tick={{ fill:'var(--text2)', fontSize:11 }} />
                <YAxis tick={{ fill:'var(--text2)', fontSize:11 }} allowDecimals={false} />
                <Tooltip {...tt} />
                <Bar dataKey="count" name="Projects" radius={[4,4,0,0]}>
                  {engineerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  <LabelList dataKey="count" position="center" style={{ fill:'#fff', fontSize:12, fontWeight:700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* Productivity */}
      <div className="card fade-up" style={{ animationDelay:'0.35s' }}>
        <T>Productivity by Engineer</T>
        {engineerProd.length === 0
          ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)', fontSize:'13px' }}>Add projects with engineers to see productivity data</div>
          : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={engineerProd} margin={{ top:22, right:10, bottom:5, left:-10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,189,248,0.08)" />
                <XAxis dataKey="engineer" tick={{ fill:'var(--text2)', fontSize:11 }} />
                <YAxis tick={{ fill:'var(--text2)', fontSize:11 }} allowDecimals={false} />
                <Tooltip {...tt} />
                <Legend wrapperStyle={{ color:'var(--text2)', fontSize:'12px' }} />
                <Bar dataKey="completed" name="Completed" fill="#34d399" radius={[4,4,0,0]}>
                  <LabelList dataKey="completed" position="center" style={{ fill:'#fff', fontSize:11, fontWeight:700 }} />
                </Bar>
                <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[4,4,0,0]}>
                  <LabelList dataKey="pending" position="center" style={{ fill:'#0d1017', fontSize:11, fontWeight:700 }} />
                </Bar>
                <Bar dataKey="delayed" name="Delayed" fill="#fb7185" radius={[4,4,0,0]}>
                  <LabelList dataKey="delayed" position="center" style={{ fill:'#fff', fontSize:11, fontWeight:700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* Resolution rate + Environment */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px' }}>
        <div className="card fade-up" style={{ animationDelay:'0.4s' }}>
          <T>Resolution Rate by Severity</T>
          {resolvedRate.length === 0
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)', fontSize:'13px' }}>No data yet</div>
            : resolvedRate.map(r => {
              const pct = r.total > 0 ? Math.round((r.resolved / r.total) * 100) : 0;
              return (
                <div key={r.severity} style={{ marginBottom:'14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
                    <span style={{ fontSize:'12px', fontWeight:600, color: COLORS[r.severity] || 'var(--text2)' }}>{r.severity}</span>
                    <span style={{ fontSize:'12px', color:'var(--text2)' }}>{r.resolved}/{r.total} ({pct}%)</span>
                  </div>
                  <div style={{ background:'var(--bg2)', borderRadius:'4px', height:'6px', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: COLORS[r.severity]||'var(--blue)', borderRadius:'4px', transition:'width 1s ease' }} />
                  </div>
                </div>
              );
            })
          }
        </div>

        <div className="card fade-up" style={{ animationDelay:'0.45s' }}>
          <T>Environment Breakdown</T>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={overview?.envBreakdown || []} layout="vertical" margin={{ left:10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,189,248,0.08)" />
              <XAxis type="number" tick={{ fill:'var(--text2)', fontSize:11 }} allowDecimals={false} />
              <YAxis dataKey="environment" type="category" tick={{ fill:'var(--text2)', fontSize:11 }} width={70} />
              <Tooltip {...tt} />
              <Bar dataKey="count" name="Projects" radius={[0,4,4,0]}>
                {(overview?.envBreakdown||[]).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
