import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { exportApplicationsToExcel } from '../utils/exportExcel';
import { AttachmentsPanel } from './ProjectTracker';

const fmtBytes = b => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;

// ── Strip empty values before sending to backend ──────────────────
// Prevents "invalid value" errors from backend validators when fields are blank
function cleanForm(form) {
  const out = { ...form };
  // Date fields: null instead of "" so isISO8601 validator is never called on empty string
  ['last_test_date', 'report_share_date', 'deadline_date'].forEach(k => {
    if (!out[k] || out[k] === '') out[k] = null;
  });
  // assigned_to: remove entirely if empty so isInt validator is never triggered
  if (!out.assigned_to || out.assigned_to === '') delete out.assigned_to;
  return out;
}

/* ── Shared Import Modal (applications) ───────────────────────── */
function ImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const downloadTemplate = () => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/import/template/applications', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'securetrack_applications_template.csv';
        a.click();
      });
  };

  const submit = async () => {
    if (!file) { setError('Please select a file'); return; }
    setLoading(true); setError(''); setResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await api.post('/api/import/applications', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(r.data); onImported();
    } catch (err) { setError(err.response?.data?.error || 'Import failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '520px' }}>
        <div className="modal-hd">
          <h2>📥 Import Applications</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <div style={{ background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px' }}>
            <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'12px', color:'var(--purple)', marginBottom:'6px' }}>Supported Formats</div>
            <div style={{ fontSize:'12px', color:'var(--text2)' }}>📄 CSV · 📊 Excel (.xlsx) · 🔷 XML · 📋 JSON</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--bg2)', borderRadius:'8px', border:'1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize:'12.5px', fontWeight:600 }}>CSV Template</div>
                <div style={{ fontSize:'11px', color:'var(--text2)', marginTop:'2px' }}>Download column headers for Applications</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>⬇ Template</button>
            </div>
            <div className="fgroup">
              <label className="flabel">Select File</label>
              <div onClick={() => fileRef.current?.click()} style={{ border:`2px dashed ${file?'var(--green)':'var(--border2)'}`, borderRadius:'10px', padding:'20px', textAlign:'center', cursor:'pointer', background: file?'rgba(16,185,129,0.04)':'transparent' }}>
                <div style={{ fontSize:'20px', marginBottom:'6px' }}>{file?'✅':'📁'}</div>
                <div style={{ fontSize:'13px', fontWeight:600, color:file?'var(--green)':'var(--text)' }}>{file?file.name:'Click to select file'}</div>
                {file && <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'4px', fontFamily:'DM Mono' }}>{fmtBytes(file.size)}</div>}
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xml,.json,.txt" onChange={e=>setFile(e.target.files[0])} style={{ display:'none' }} />
              </div>
            </div>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', padding:'10px 14px', fontSize:'13px', color:'var(--red)' }}>⚠ {error}</div>}
            {result && (
              <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:'10px', padding:'14px' }}>
                <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'13px', color:'var(--green)', marginBottom:'10px' }}>✓ Import Complete</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
                  {[['Total',result.total||0,'var(--text)'],['Imported',result.imported,'var(--green)'],['Skipped',result.skipped,'var(--amber)']].map(([l,v,c])=>(
                    <div key={l} style={{ textAlign:'center', padding:'10px', background:'var(--bg2)', borderRadius:'8px' }}>
                      <div style={{ fontSize:'22px', fontWeight:800, fontFamily:'Syne', color:c }}>{v}</div>
                      <div style={{ fontSize:'11px', color:'var(--text2)', marginTop:'3px' }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:'10px', marginTop:'18px', justifyContent:'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>{result?'Close':'Cancel'}</button>
            {!result && <button className="btn btn-primary" onClick={submit} disabled={loading||!file}>{loading?'⏳ Importing...':'📥 Import'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY = {
  application_name: '', url: '', app_type: '', environment: '', status: '',
  exposure: '', test_done: '', last_test_date: '', report_share_date: '',
  app_owner: '', mitigation_status: '', remarks: '', deadline_date: '', assigned_to: '',
};

const F = ({ label, children }) => (
  <div className="fgroup"><label className="flabel">{label}</label>{children}</div>
);

function AppForm({ initial, onSave, onClose, users }) {
  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [saving, setSaving] = useState(false);
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '800px' }}>
        <div className="modal-hd">
          <h2>{initial?.id ? '✏️ Edit Application' : '+ New Application'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-bd">
          <div className="fgrid">
            <F label="Application Name">
              <input className="finput" name="application_name" value={form.application_name || ''} onChange={handle} placeholder="App name" />
            </F>
            <F label="URL">
              <input className="finput" name="url" value={form.url || ''} onChange={handle} placeholder="https://..." />
            </F>
            <F label="App Type">
              <select className="fselect" name="app_type" value={form.app_type || ''} onChange={handle}>
                <option value="">— Select —</option>
                {['Web','Android','iOS','API'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
            <F label="Environment">
              <select className="fselect" name="environment" value={form.environment || ''} onChange={handle}>
                <option value="">— Select —</option>
                {['Production','UAT'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
            <F label="Status">
              <select className="fselect" name="status" value={form.status || ''} onChange={handle}>
                <option value="">— Select —</option>
                {['Live','UAT'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
            <F label="Exposure">
              <select className="fselect" name="exposure" value={form.exposure || ''} onChange={handle}>
                <option value="">— Select —</option>
                {['Internal','External'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
            <F label="Test Done">
              <select className="fselect" name="test_done" value={form.test_done || ''} onChange={handle}>
                <option value="">— Select —</option>
                {['Done','Running','Terminated'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
            <F label="Last Test Date">
              <input type="date" className="finput" name="last_test_date" value={form.last_test_date || ''} onChange={handle} />
            </F>
            <F label="Report Share Date">
              <input type="date" className="finput" name="report_share_date" value={form.report_share_date || ''} onChange={handle} />
            </F>
            <F label="Deadline Date">
              <input type="date" className="finput" name="deadline_date" value={form.deadline_date || ''} onChange={handle} />
            </F>
            <F label="App Owner">
              <input className="finput" name="app_owner" value={form.app_owner || ''} onChange={handle} placeholder="Owner name" />
            </F>
            <F label="Assign To">
              <select className="fselect" name="assigned_to" value={form.assigned_to || ''} onChange={handle}>
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username} ({u.role})</option>)}
              </select>
            </F>
            <F label="Mitigation Status">
              <select className="fselect" name="mitigation_status" value={form.mitigation_status || ''} onChange={handle}>
                <option value="">— Select —</option>
                {['Mitigated','Not Mitigated'].map(o => <option key={o}>{o}</option>)}
              </select>
            </F>
            <F label="Remarks">
              <input className="finput" name="remarks" value={form.remarks || ''} onChange={handle} placeholder="Notes..." />
            </F>
          </div>
          <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : (initial?.id ? '✓ Save Changes' : '+ Add Application')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const testBadge = v => ({ Done:'b-resolved', Running:'b-pending', Terminated:'b-no' }[v] || '');

export default function ApplicationList() {
  const { can } = useAuth();
  const [apps, setApps] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [attachModal, setAttachModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMit, setFilterMit] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ap, us] = await Promise.all([api.get('/api/applications'), api.get('/api/auth/users').catch(() => ({ data: [] }))]);
      setApps(ap.data);
      setUsers(us.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── FIXED: clean form before sending to prevent "invalid value" errors ──
  const save = async (form) => {
    try {
      const payload = cleanForm(form);
      if (form.id) {
        await api.put(`/api/applications/${form.id}`, payload);
        showToast('✓ Updated');
      } else {
        await api.post('/api/applications', payload);
        showToast('✓ Application added');
      }
      load(); setModal(null);
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Save failed';
      showToast('✗ ' + msg, 'error');
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/api/applications/${id}`); showToast('Deleted'); load(); }
    catch (err) { showToast('✗ ' + (err.response?.data?.error || 'Failed'), 'error'); }
  };

  const handleExport = async () => {
    setExporting(true);
    try { const r = await api.get('/api/analytics/export/applications'); exportApplicationsToExcel(r.data); }
    catch { showToast('Export failed', 'error'); } finally { setExporting(false); }
  };

  const isOverdue = a => a.deadline_date && new Date(a.deadline_date) < new Date() && a.mitigation_status !== 'Mitigated';

  const filtered = apps.filter(a => {
    const q = search.toLowerCase();
    const matchQ = !q || [a.application_name, a.url, a.app_owner, a.app_type, a.exposure]
      .some(f => f?.toLowerCase().includes(q));
    const matchType = !filterType || a.app_type === filterType;
    const matchMit = !filterMit || a.mitigation_status === filterMit;
    return matchQ && matchType && matchMit;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'22px' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="fade-up" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'14px' }}>
        <div>
          <h1 style={{ fontFamily:'Syne', fontSize:'24px', fontWeight:800, letterSpacing:'-0.03em' }}>
            Application <span style={{ color:'var(--purple)' }}>List</span>
          </h1>
          <p style={{ color:'var(--text2)', marginTop:'4px', fontSize:'13px' }}>
            {apps.length} applications · {filtered.length} shown
          </p>
        </div>
        <div style={{ display:'flex', gap:'10px' }}>
          {can('create') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setImportModal(true)}>📥 Import</button>
          )}
          <button className="btn btn-amber btn-sm" onClick={handleExport} disabled={exporting}>📋 Export Excel</button>
          {can('create') && (
            <button className="btn btn-primary" onClick={() => setModal('new')}>+ New Application</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
        <input className="finput" style={{ maxWidth:'260px' }} placeholder="🔍 Search application..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="fselect" style={{ maxWidth:'150px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {['Web','Android','iOS','API'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="fselect" style={{ maxWidth:'175px' }} value={filterMit} onChange={e => setFilterMit(e.target.value)}>
          <option value="">All Mitigation</option>
          {['Mitigated','Not Mitigated'].map(t => <option key={t}>{t}</option>)}
        </select>
        {(search || filterType || filterMit) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); setFilterMit(''); }}>Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--text2)', fontFamily:'DM Mono', fontSize:'13px' }}>Loading...</div>
      ) : (
        <div className="tbl-wrap fade-up">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Application Name</th>
                <th>URL</th>
                <th>Type</th>
                <th>Env</th>
                <th>Status</th>
                <th>Exposure</th>
                <th>Test Done</th>
                <th>Last Test</th>
                <th>Report Share</th>
                <th>Deadline</th>
                <th>App Owner</th>
                <th>Assigned To</th>
                <th>Mitigation</th>
                <th>Remarks</th>
                <th>Files</th>
                {can('update') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={17} style={{ textAlign:'center', padding:'48px', color:'var(--text2)' }}>
                  No applications found.{can('create') && <> <button className="btn btn-primary btn-sm" style={{ marginLeft:'8px' }} onClick={() => setModal('new')}>Add first</button></>}
                </td></tr>
              ) : filtered.map((a, i) => (
                <tr key={a.id} style={{ background: isOverdue(a) ? 'rgba(239,68,68,0.04)' : undefined }}>
                  <td style={{ color:'var(--text3)', fontFamily:'DM Mono', fontSize:'11px' }}>{i + 1}</td>
                  <td style={{ color:'var(--purple)', fontWeight:600, maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {isOverdue(a) && <span style={{ marginRight:'4px' }}>🔴</span>}
                    {a.application_name || '—'}
                  </td>
                  <td>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--blue)', textDecoration:'none' }}>🔗</a> : '—'}</td>
                  <td>
                    {a.app_type ? (
                      <span style={{ background:'rgba(139,92,246,0.12)', color:'var(--purple)', border:'1px solid rgba(139,92,246,0.25)', borderRadius:'20px', padding:'2px 8px', fontSize:'10.5px', fontFamily:'Syne', fontWeight:700, textTransform:'uppercase' }}>
                        {a.app_type}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize:'11.5px' }}>{a.environment || '—'}</td>
                  <td>{a.status ? <span className={`badge ${a.status === 'Live' ? 'b-resolved' : 'b-pending'}`}>{a.status}</span> : '—'}</td>
                  <td style={{ fontSize:'11.5px', color: a.exposure === 'External' ? 'var(--amber)' : 'var(--text2)' }}>{a.exposure || '—'}</td>
                  <td>{a.test_done ? <span className={`badge ${testBadge(a.test_done)}`}>{a.test_done}</span> : '—'}</td>
                  <td style={{ fontFamily:'DM Mono', fontSize:'11px', color:'var(--text2)' }}>{a.last_test_date || '—'}</td>
                  <td style={{ fontFamily:'DM Mono', fontSize:'11px', color:'var(--text2)' }}>{a.report_share_date || '—'}</td>
                  <td style={{ fontFamily:'DM Mono', fontSize:'11px', color: isOverdue(a) ? 'var(--red)' : 'var(--text2)', fontWeight: isOverdue(a) ? 700 : 400 }}>
                    {a.deadline_date || '—'}
                  </td>
                  <td style={{ color:'var(--cyan)', fontSize:'12px' }}>{a.app_owner || '—'}</td>
                  <td style={{ fontSize:'11.5px', color:'var(--text2)' }}>{a.assigned_username || '—'}</td>
                  <td>
                    {a.mitigation_status ? (
                      <span className={`badge ${a.mitigation_status === 'Mitigated' ? 'b-resolved' : 'b-no'}`}>{a.mitigation_status}</span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize:'11.5px', color:'var(--text2)', maxWidth:'120px', overflow:'hidden', textOverflow:'ellipsis' }}>{a.remarks || '—'}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setAttachModal({ sourceType:'application', sourceId: a.id, sourceName: a.application_name })}
                      title="Attachments" style={{ fontSize:'14px', padding:'4px 8px' }}>📎
                    </button>
                  </td>
                  {can('update') && (
                    <td>
                      <div style={{ display:'flex', gap:'5px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal(a)}>✏️</button>
                        {can('delete') && (
                          <button className="btn btn-danger btn-sm" onClick={() => del(a.id, a.application_name)}>🗑</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <AppForm
          initial={modal === 'new' ? null : modal}
          onSave={save}
          onClose={() => setModal(null)}
          users={users}
        />
      )}
      {importModal && <ImportModal onClose={() => setImportModal(false)} onImported={load} />}
      {attachModal && <AttachmentsPanel sourceType={attachModal.sourceType} sourceId={attachModal.sourceId} sourceName={attachModal.sourceName} onClose={() => setAttachModal(null)} />}
    </div>
  );
}
