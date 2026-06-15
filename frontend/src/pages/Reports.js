import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';

const fmtBytes = b => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;

const fileIcon = mime => {
  if (mime?.includes('pdf'))    return '📄';
  if (mime?.includes('word') || mime?.includes('document')) return '📝';
  if (mime?.includes('excel') || mime?.includes('sheet'))   return '📊';
  if (mime?.startsWith('image/')) return '🖼';
  if (mime?.includes('zip'))    return '🗜';
  if (mime?.startsWith('text/')) return '📃';
  return '📎';
};

const isPreviewable = mime => mime?.includes('pdf') || mime?.startsWith('image/') || mime?.startsWith('text/');

const MONTHS = [
  { val:'01',label:'January' }, { val:'02',label:'February' }, { val:'03',label:'March' },
  { val:'04',label:'April' },   { val:'05',label:'May' },       { val:'06',label:'June' },
  { val:'07',label:'July' },    { val:'08',label:'August' },    { val:'09',label:'September' },
  { val:'10',label:'October' }, { val:'11',label:'November' },  { val:'12',label:'December' },
];

export default function Reports() {
  const { can } = useAuth();
  const [files, setFiles]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState(null);

  // Filters
  const [search,     setSearch]     = useState('');
  const [sourceType, setSourceType] = useState('');
  const [month,      setMonth]      = useState('');
  const [year,       setYear]       = useState('');

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  // Build year options from current year back 5 years
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (sourceType) params.source_type = sourceType;
      if (month)      params.month       = month;
      if (year)       params.year        = year;
      if (search)     params.search      = search;
      const r = await api.get('/api/attachments/reports/all', { params });
      setFiles(r.data);
    } catch {} finally { setLoading(false); }
  }, [sourceType, month, year, search]);

  useEffect(() => { load(); }, [load]);

  const viewInline = (id) => {
    const token = localStorage.getItem('accessToken');
    fetch(`/api/attachments/view/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => { window.open(URL.createObjectURL(blob), '_blank'); });
  };

  const download = (id, name) => {
    const token = localStorage.getItem('accessToken');
    fetch(`/api/attachments/download/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      });
  };

  const del = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/api/attachments/${id}`); showToast('Deleted'); load(); }
    catch (err) { showToast('✗ ' + (err.response?.data?.error || 'Failed'), 'error'); }
  };

  const clearFilters = () => { setSearch(''); setSourceType(''); setMonth(''); setYear(''); };
  const hasFilters   = search || sourceType || month || year;

  // Summary stats
  const totalSize   = files.reduce((s, f) => s + (f.file_size || 0), 0);
  const fromProjects = files.filter(f => f.source_type === 'project').length;
  const fromApps     = files.filter(f => f.source_type === 'application').length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'22px' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'14px' }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:'22px', fontWeight:800, letterSpacing:'-0.02em' }}>Reports</h1>
          <p style={{ color:'var(--text2)', marginTop:'4px', fontSize:'13px' }}>
            Central file repository — all attachments from Projects and Applications
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:'12px' }}>
        {[
          { label:'Total Files',    val: files.length,  color:'var(--cyan)' },
          { label:'From Projects',  val: fromProjects,  color:'var(--blue)' },
          { label:'From Applications', val: fromApps,   color:'var(--purple)' },
          { label:'Total Size',     val: fmtBytes(totalSize), color:'var(--green)', text:true },
        ].map((k,i) => (
          <div key={k.label} className="card fade-up" style={{ animationDelay:`${i*0.05}s`, borderLeft:`3px solid ${k.color}`, padding:'14px' }}>
            <div style={{ fontSize: k.text ? '18px' : '26px', fontFamily:"'Manrope',sans-serif", fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:'11.5px', color:'var(--text2)', marginTop:'8px', fontWeight:500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
        <input
          className="finput" style={{ maxWidth:'240px' }}
          placeholder="🔍 Search file or project name..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select className="fselect" style={{ maxWidth:'160px' }} value={sourceType} onChange={e => setSourceType(e.target.value)}>
          <option value="">All Sources</option>
          <option value="project">Projects</option>
          <option value="application">Applications</option>
        </select>
        <select className="fselect" style={{ maxWidth:'140px' }} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">All Months</option>
          {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
        <select className="fselect" style={{ maxWidth:'120px' }} value={year} onChange={e => setYear(e.target.value)}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
        )}
        <span style={{ fontSize:'12px', color:'var(--text3)', marginLeft:'auto' }}>
          {files.length} file{files.length !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* File list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--text2)', fontSize:'13px' }}>Loading...</div>
      ) : files.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'60px', color:'var(--text2)' }}>
          <div style={{ fontSize:'36px', marginBottom:'14px' }}>📂</div>
          <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text)' }}>No files found</div>
          <div style={{ fontSize:'13px', marginTop:'6px' }}>
            {hasFilters ? 'Try adjusting the filters above.' : 'Upload attachments from the Projects or Applications section.'}
          </div>
        </div>
      ) : (
        <div className="tbl-wrap fade-up">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>File Name</th>
                <th>Source</th>
                <th>Project / App Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={f.id}>
                  <td style={{ color:'var(--text3)', fontSize:'11px' }}>{i + 1}</td>
                  <td style={{ maxWidth:'220px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'18px', flexShrink:0 }}>{fileIcon(f.mime_type)}</span>
                      <span style={{ fontSize:'12.5px', fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {f.original_name}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      display:'inline-block', padding:'2px 8px', borderRadius:'4px',
                      fontSize:'11px', fontWeight:600, textTransform:'capitalize',
                      background: f.source_type === 'project' ? 'rgba(56,189,248,0.1)' : 'rgba(167,139,250,0.1)',
                      color: f.source_type === 'project' ? 'var(--cyan)' : 'var(--purple)',
                      border: `1px solid ${f.source_type === 'project' ? 'rgba(56,189,248,0.2)' : 'rgba(167,139,250,0.2)'}`,
                    }}>{f.source_type}</span>
                  </td>
                  <td style={{ fontSize:'12.5px', color: f.source_type === 'project' ? 'var(--cyan)' : 'var(--purple)', fontWeight:500, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {f.source_name || '—'}
                  </td>
                  <td style={{ fontSize:'11px', color:'var(--text3)', fontFamily:"'JetBrains Mono',monospace" }}>
                    {f.mime_type?.split('/')[1]?.toUpperCase() || '—'}
                  </td>
                  <td style={{ fontSize:'12px', color:'var(--text2)', fontFamily:"'JetBrains Mono',monospace" }}>
                    {fmtBytes(f.file_size || 0)}
                  </td>
                  <td style={{ fontSize:'12px', color:'var(--text2)' }}>{f.uploader_name || '—'}</td>
                  <td style={{ fontSize:'11px', color:'var(--text3)' }}>
                    <div>{new Date(f.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize:'10px', marginTop:'1px' }}>{new Date(f.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:'5px' }}>
                      {isPreviewable(f.mime_type) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => viewInline(f.id)} title="View in browser">👁</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => download(f.id, f.original_name)} title="Download">⬇</button>
                      {can('delete') && (
                        <button className="btn btn-danger btn-sm" onClick={() => del(f.id, f.original_name)} title="Delete">🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding:'11px 16px', background:'rgba(56,189,248,0.04)', border:'1px solid rgba(56,189,248,0.1)', borderRadius:'8px', fontSize:'12.5px', color:'var(--text2)' }}>
        💡 Files are saved here automatically when you upload attachments in the <strong style={{ color:'var(--text)' }}>Projects</strong> or <strong style={{ color:'var(--text)' }}>Applications</strong> sections. Files are stored with the project/application name for easy identification.
      </div>
    </div>
  );
}
