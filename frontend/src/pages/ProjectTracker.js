import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { exportProjectsToExcel } from '../utils/exportExcel';

const EMPTY = {
  application_name: '', url: '', severity: '',
  resolver_team: '', mitigation_status: '', scan_date: '', report_sharing_date: '',
  application_zone: '', environment: '', category: '', email_subject: '',
  engineer: '', go_live_status: '', prod_url: '', mitigation_status_prod: '',
  remarks: '', deadline_date: '', assigned_to: '',
};

/* ── Helpers ─────────────────────────────────────────────────── */
const F = ({ label, children, span2 }) => (
  <div className="fgroup" style={span2 ? { gridColumn: 'span 2' } : {}}>
    <label className="flabel">{label}</label>
    {children}
  </div>
);
const Sel = ({ value, onChange, name, options }) => (
  <select className="fselect" name={name} value={value || ''} onChange={onChange}>
    <option value="">— Select —</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);
const sevBadge = s => ({ Critical:'b-critical', High:'b-high', Medium:'b-medium', Low:'b-low', Informational:'b-info' }[s] || '');
const mitBadge = s => s === 'Resolved' ? 'b-resolved' : 'b-pending';
const fmtBytes = b => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;
const decode = s => !s ? '' : s.replace(/&#x2F;/g,'/').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"');

// Strip empty strings from fields with strict backend validators
function cleanForm(form) {
  const out = { ...form };
  ['scan_date','report_sharing_date','deadline_date'].forEach(k => { if (!out[k]) out[k] = null; });
  if (!out.assigned_to) delete out.assigned_to;
  return out;
}

const SEV_ORDER = ['Critical','High','Medium','Low','Informational'];
const SEV_COLORS = { Critical:'var(--critical)', High:'var(--high)', Medium:'var(--medium)', Low:'var(--low)', Informational:'var(--text2)' };

/* ── Single fixed-row vuln cell with hover tooltip ─────────────── */
function VulnSummaryCell({ vulns }) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos]         = useState({ top:0, left:0 });

  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({
      top:  rect.bottom + window.scrollY + 6,
      left: Math.min(rect.left + window.scrollX, window.innerWidth - 340),
    });
    setHovered(true);
  };

  // Worst severity across all vulns
  const worstSev = vulns.reduce((best, v) => {
    const idx     = SEV_ORDER.indexOf(v.severity);
    const bestIdx = SEV_ORDER.indexOf(best);
    return (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) ? v.severity : best;
  }, '');

  const label = vulns.length === 1
    ? vulns[0].name
    : `${vulns[0].name.length > 16 ? vulns[0].name.slice(0,16)+'…' : vulns[0].name} +${vulns.length-1} more`;

  return (
    <>
      {/* Fixed-height single row */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHovered(false)}
        style={{
          display:'flex', alignItems:'center', gap:'6px',
          height:'28px', padding:'0 7px',
          background:'var(--bg2)', border:'1px solid var(--border)',
          borderRadius:'5px', cursor:'default',
          width:'100%', overflow:'hidden', userSelect:'none',
        }}
      >
        {worstSev && (
          <span className={`sev-chip sev-${worstSev}`} style={{ flexShrink:0, fontSize:'10px' }}>
            {worstSev}
          </span>
        )}
        <span style={{
          fontSize:'12px', color:'var(--text)',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
        }}>
          {label}
        </span>
      </div>

      {/* Hover tooltip — portal-like fixed position */}
      {hovered && (
        <div style={{
          position:'fixed', top: pos.top, left: pos.left,
          zIndex:9999, background:'var(--bg3)',
          border:'1px solid var(--border2)', borderRadius:'9px',
          padding:'11px 14px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
          minWidth:'260px', maxWidth:'380px', pointerEvents:'none',
        }}>
          <div style={{ fontSize:'10.5px', fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'9px' }}>
            {vulns.length} Vulnerabilit{vulns.length===1?'y':'ies'}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {vulns.map((v, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:'8px',
                padding:'5px 8px', background:'var(--bg2)',
                borderRadius:'5px', border:'1px solid var(--border)',
              }}>
                <span className={`sev-chip sev-${v.severity||'Informational'}`} style={{ fontSize:'10px', flexShrink:0, minWidth:'75px', textAlign:'center' }}>
                  {v.severity || '—'}
                </span>
                <span style={{ fontSize:'12.5px', color:'var(--text)', wordBreak:'break-word', lineHeight:1.4 }}>
                  {v.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Per-Vulnerability Input (name + severity) ────────────────── */
const SEV_OPTIONS = ['Critical','High','Medium','Low','Informational'];

function VulnInput({ vulns, setVulns }) {
  const [name, setName] = useState('');
  const [sev,  setSev]  = useState('');
  const nameRef = useRef();

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setVulns([...vulns, { name: trimmed, severity: sev || 'Medium' }]);
    setName(''); setSev('');
    nameRef.current?.focus();
  };

  const remove  = (idx) => setVulns(vulns.filter((_, i) => i !== idx));
  const updSev  = (idx, s) => setVulns(vulns.map((v, i) => i === idx ? { ...v, severity: s } : v));
  const handleKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };

  return (
    <div>
      {/* Existing vulns */}
      {vulns.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'5px', marginBottom:'10px' }}>
          {vulns.map((v, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'6px', padding:'6px 9px' }}>
              <span style={{ width:'6px', height:'6px', borderRadius:'50%', flexShrink:0, background: SEV_COLORS[v.severity] || 'var(--text2)' }} />
              <span style={{ flex:1, fontSize:'13px', color:'var(--text)', fontWeight:500 }}>{v.name}</span>
              <select
                value={v.severity}
                onChange={e => updSev(i, e.target.value)}
                style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'5px', color: SEV_COLORS[v.severity] || 'var(--text)', fontSize:'11px', fontWeight:700, padding:'2px 6px', outline:'none', cursor:'pointer' }}
              >
                {SEV_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={() => remove(i)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:'14px', padding:'2px', transition:'color 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.color='var(--red)'}
                onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}
              >✕</button>
            </div>
          ))}
        </div>
      )}
      {/* Add new */}
      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
        <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} onKeyDown={handleKey}
          placeholder="Type vulnerability name and press Enter..."
          className="finput" style={{ flex:1 }} />
        <select value={sev} onChange={e => setSev(e.target.value)} className="fselect"
          style={{ maxWidth:'140px', color: sev ? SEV_COLORS[sev] : 'var(--text2)', fontWeight: sev ? 600 : 400 }}>
          <option value="">Severity</option>
          {SEV_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} style={{ flexShrink:0, padding:'8px 12px' }}>+ Add</button>
      </div>
      <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'5px' }}>
        Press Enter or click + Add · {vulns.length} vulnerabilit{vulns.length !== 1 ? 'ies' : 'y'} added
      </div>
    </div>
  );
}

/* ── Attachments Panel ────────────────────────────────────────── */
export function AttachmentsPanel({ sourceType, sourceId, sourceName, onClose }) {
  const { can } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef();
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    try { const r = await api.get(`/api/attachments/${sourceType}/${sourceId}`); setFiles(r.data); }
    catch {} finally { setLoading(false); }
  }, [sourceType, sourceId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (fileList) => {
    if (!fileList.length) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of fileList) fd.append('files', f);
    try {
      await api.post(`/api/attachments/${sourceType}/${sourceId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(`✓ ${fileList.length} file(s) uploaded`);
      load();
    } catch (err) {
      showToast('✗ ' + (err.response?.data?.error || 'Upload failed'), 'error');
    } finally { setUploading(false); }
  };

  const del = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/api/attachments/${id}`);
      showToast('Deleted');
      load();
    } catch (err) { showToast('✗ ' + (err.response?.data?.error || 'Delete failed'), 'error'); }
  };

  const viewInline = (id, mime) => {
    const token = localStorage.getItem('accessToken');
    fetch(`/api/attachments/view/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error('Cannot view'); return r.blob(); })
      .then(blob => window.open(URL.createObjectURL(blob), '_blank'))
      .catch(() => showToast('✗ Cannot view this file', 'error'));
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

  const isPreviewable = mime => mime?.includes('pdf') || mime?.startsWith('image/') || mime?.startsWith('text/');

  const fileIcon = mime => {
    if (mime?.includes('pdf')) return '📄';
    if (mime?.includes('word') || mime?.includes('document')) return '📝';
    if (mime?.includes('excel') || mime?.includes('sheet')) return '📊';
    if (mime?.includes('image')) return '🖼';
    if (mime?.includes('zip')) return '🗜';
    return '📎';
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '620px' }}>
        <div className="modal-hd">
          <div>
            <h2>📎 Attachments</h2>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px', fontFamily: 'DM Mono' }}>{sourceName}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          {toast && <div className={`toast toast-${toast.type}`} style={{ position: 'relative', bottom: 'auto', right: 'auto', marginBottom: '14px', display: 'block' }}>{toast.msg}</div>}

          {/* Drop zone */}
          {can('create') && (
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); upload(Array.from(e.dataTransfer.files)); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${drag ? 'var(--cyan)' : 'var(--border2)'}`,
                borderRadius: '12px', padding: '28px',
                textAlign: 'center', cursor: 'pointer',
                background: drag ? 'rgba(0,212,255,0.05)' : 'transparent',
                transition: 'all 0.2s', marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>
                {uploading ? '⏳' : '📂'}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                {uploading ? 'Uploading...' : 'Drop files here or click to browse'}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text2)', marginTop: '6px' }}>
                PDF, Word, Excel, Images, ZIP · Max 20MB per file · Up to 5 files at once
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.zip"
                onChange={e => upload(Array.from(e.target.files))}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* File list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)', fontSize: '13px' }}>Loading...</div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)', fontSize: '13px' }}>
              No attachments yet. {can('create') && 'Upload files above.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {files.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', background: 'var(--bg2)',
                  border: '1px solid var(--border)', borderRadius: '10px',
                  transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>{fileIcon(f.mime_type)}</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.original_name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'DM Mono', marginTop: '2px' }}>
                      {fmtBytes(f.file_size)} · {f.uploader_name} · {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {isPreviewable(f.mime_type) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => viewInline(f.id, f.mime_type)} title="View in browser">👁 View</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => download(f.id, f.original_name)} title="Download">⬇</button>
                    {can('update') && (
                      <button className="btn btn-danger btn-sm" onClick={() => del(f.id, f.original_name)} title="Delete">🗑</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Import Modal ─────────────────────────────────────────────── */
function ImportModal({ onClose, onImported }) {
  const [type, setType] = useState('projects');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const downloadTemplate = () => {
    const token = localStorage.getItem('accessToken');
    fetch(`/api/import/template/${type}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `securetrack_${type}_template.csv`;
        a.click();
      });
  };

  const submit = async () => {
    if (!file) { setError('Please select a file'); return; }
    setLoading(true); setError(''); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post(`/api/import/${type}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(r.data);
      onImported();
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '560px' }}>
        <div className="modal-hd">
          <h2>📥 Import Data</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          {/* Format info */}
          <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '12px', color: 'var(--cyan)', marginBottom: '8px' }}>Supported Formats</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[['📄 CSV', 'Most compatible'], ['📊 Excel', '.xlsx / .xls'], ['🔷 XML', 'Nessus / custom'], ['📋 JSON', 'Array of objects']].map(([fmt, desc]) => (
                <div key={fmt} style={{ fontSize: '11.5px', color: 'var(--text2)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmt}</span> — {desc}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Target type */}
            <div className="fgroup">
              <label className="flabel">Import Into</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['projects', 'applications'].map(t => (
                  <button key={t} type="button"
                    onClick={() => setType(t)}
                    className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}
                  >{t}</button>
                ))}
              </div>
            </div>

            {/* Template download */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Download Template</div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>CSV with all required column headers</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>⬇ Template</button>
            </div>

            {/* File picker */}
            <div className="fgroup">
              <label className="flabel">Select File</label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${file ? 'var(--green)' : 'var(--border2)'}`,
                  borderRadius: '10px', padding: '20px', textAlign: 'center',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: file ? 'rgba(16,185,129,0.04)' : 'transparent',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{file ? '✅' : '📁'}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: file ? 'var(--green)' : 'var(--text)' }}>
                  {file ? file.name : 'Click to select file'}
                </div>
                {file && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'DM Mono' }}>{fmtBytes(file.size)}</div>}
                <input ref={fileRef} type="file"
                  accept=".csv,.xlsx,.xls,.xml,.json,.txt"
                  onChange={e => setFile(e.target.files[0])}
                  style={{ display: 'none' }} />
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--red)' }}>
                ⚠ {error}
              </div>
            )}

            {result && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '13px', color: 'var(--green)', marginBottom: '10px' }}>✓ Import Complete</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  {[['Total Rows', result.total || 0, 'var(--text)'], ['Imported', result.imported, 'var(--green)'], ['Skipped', result.skipped, 'var(--amber)']].map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: 'center', padding: '10px', background: 'var(--bg2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'Syne', color: c }}>{v}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '3px' }}>{l}</div>
                    </div>
                  ))}
                </div>
                {result.errors?.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--amber)', marginBottom: '6px' }}>⚠ Row Errors</div>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '11px', fontFamily: 'DM Mono', color: 'var(--text2)' }}>
                      {result.errors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
                      {result.errors.length > 10 && <div>...and {result.errors.length - 10} more</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && (
              <button className="btn btn-primary" onClick={submit} disabled={loading || !file}>
                {loading ? '⏳ Importing...' : '📥 Import'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Project Form ─────────────────────────────────────────────── */
function ProjectForm({ initial, onSave, onClose, users }) {
  const initVulns = () => {
    if (!initial) return [];
    try {
      if (initial.vulnerabilities) {
        const arr = JSON.parse(initial.vulnerabilities);
        if (Array.isArray(arr) && arr.length) {
          return arr.map(v => typeof v === 'string'
            ? { name: v, severity: initial.severity || 'Medium' }
            : { name: v.name || '', severity: v.severity || 'Medium' }
          );
        }
      }
    } catch {}
    if (initial.vulnerability_name) return [{ name: initial.vulnerability_name, severity: initial.severity || 'Medium' }];
    return [];
  };

  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [vulns, setVulns] = useState(initVulns);
  const [saving, setSaving] = useState(false);
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(cleanForm({ ...form, vulnerabilities: vulns })); }
    finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <h2>{initial?.id ? '✏️ Edit Project' : '+ New Project'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-bd">
          <div className="fgrid">
            <F label="Application Name">
              <input className="finput" name="application_name" value={form.application_name || ''} onChange={handle} placeholder="App name" />
            </F>
            <F label="URL">
              <input className="finput" name="url" value={form.url || ''} onChange={handle} placeholder="https://... or IP:port or internal path" />
            </F>
          </div>

          {/* Vulnerability names - full width */}
          <div className="fgroup" style={{ marginTop: '14px' }}>
            <label className="flabel">Vulnerability Names <span style={{ color: 'var(--purple)', fontWeight: 400, textTransform: 'none', fontSize: '10px' }}>— add multiple</span></label>
            <VulnInput vulns={vulns} setVulns={setVulns} />
          </div>

          <div className="fgrid" style={{ marginTop: '14px' }}>
            <F label="Resolver Team">
              <Sel name="resolver_team" value={form.resolver_team} onChange={handle}
                options={['Card & ADC','CBS Integration & Development','CBS Team','DBD','Hardware Management Unit','TOD','Vendor MineSec','Vendor MMTVBD']} />
            </F>
            <F label="Mitigation Status">
              <Sel name="mitigation_status" value={form.mitigation_status} onChange={handle}
                options={['Business Requirements','Pending','Resolved','Risk Acceptance']} />
            </F>
            <F label="Scan / Test Date">
              <input type="date" className="finput" name="scan_date" value={form.scan_date || ''} onChange={handle} />
            </F>
            <F label="Report Sharing Date">
              <input type="date" className="finput" name="report_sharing_date" value={form.report_sharing_date || ''} onChange={handle} />
            </F>
            <F label="Application Zone">
              <Sel name="application_zone" value={form.application_zone} onChange={handle} options={['DMZ','External','Internal']} />
            </F>
            <F label="Environment">
              <Sel name="environment" value={form.environment} onChange={handle} options={['Live','Pre-Prod','Production','UAT']} />
            </F>
            <F label="Category">
              <Sel name="category" value={form.category} onChange={handle} options={['Old Application','Planned','Projects']} />
            </F>
            <F label="Email Subject">
              <input className="finput" name="email_subject" value={form.email_subject || ''} onChange={handle} placeholder="Email subject line" />
            </F>
            <F label="Engineer">
              <Sel name="engineer" value={form.engineer} onChange={handle} options={['Ashik','Swarup','Adnan','Faisal','EIC','SISA']} />
            </F>
            <F label="Go Live Status">
              <Sel name="go_live_status" value={form.go_live_status} onChange={handle} options={['Yes','No','Pending']} />
            </F>
            <F label="Production URL">
              <input className="finput" name="prod_url" value={form.prod_url || ''} onChange={handle} placeholder="https://prod..." />
            </F>
            <F label="Mitigation Status in Prod">
              <Sel name="mitigation_status_prod" value={form.mitigation_status_prod} onChange={handle} options={['Mitigated','Not Mitigated']} />
            </F>
            <F label="Remarks">
              <input className="finput" name="remarks" value={form.remarks || ''} onChange={handle} placeholder="Additional notes..." />
            </F>
          </div>

          <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : (initial?.id ? '✓ Save Changes' : '+ Add Project')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function ProjectTracker() {
  const { can } = useAuth();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);        // null | 'new' | project
  const [attachModal, setAttachModal] = useState(null); // null | {id, name}
  const [importModal, setImportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSev, setFilterSev] = useState('');
  const [filterMit, setFilterMit] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, us] = await Promise.all([
        api.get('/api/projects'),
        api.get('/api/auth/users').catch(() => ({ data: [] })),
      ]);
      setProjects(pr.data);
      setUsers(us.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    try {
      let savedId;
      if (form.id) {
        await api.put(`/api/projects/${form.id}`, form);
        savedId = form.id;
        showToast('✓ Project updated');
      } else {
        const r = await api.post('/api/projects', form);
        savedId = r.data?.id || r.data?.lastInsertRowid;
        showToast('✓ Project added');
      }
      // Sync vulnerabilities to Vuln Tracker (fire and forget)
      if (savedId) {
        api.post(`/api/vuln-tracker/sync/${savedId}`).catch(() => {});
      }
      load(); setModal(null);
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Save failed';
      showToast('✗ ' + msg, 'error');
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/api/projects/${id}`); showToast('Deleted'); load(); }
    catch (err) { showToast('✗ ' + (err.response?.data?.error || 'Delete failed'), 'error'); }
  };

  const handleExport = async () => {
    setExporting(true);
    try { const r = await api.get('/api/analytics/export/projects'); exportProjectsToExcel(r.data); }
    catch { showToast('Export failed', 'error'); } finally { setExporting(false); }
  };

  const getVulns = (p) => {
    try {
      if (p.vulnerabilities) {
        const arr = JSON.parse(p.vulnerabilities);
        if (Array.isArray(arr) && arr.length) {
          return arr.map(v => typeof v === 'string'
            ? { name: v, severity: p.severity || '' }
            : { name: v.name || '', severity: v.severity || '' }
          );
        }
      }
    } catch {}
    if (p.vulnerability_name) return [{ name: p.vulnerability_name, severity: p.severity || '' }];
    return [];
  };

  const isOverdue = p => p.deadline_date && new Date(p.deadline_date) < new Date() && p.mitigation_status !== 'Resolved';

  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    const vulnText = getVulns(p).map(v => v.name).join(' ').toLowerCase();
    const matchQ   = !q || [p.application_name, p.resolver_team, p.engineer, p.category, vulnText]
      .some(f => f?.toLowerCase().includes(q));
    const matchSev = !filterSev || getVulns(p).some(v => v.severity === filterSev);
    const matchMit = !filterMit || p.mitigation_status === filterMit;
    return matchQ && matchSev && matchMit;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'22px' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'14px' }}>
        <div>
          <h1 style={{ fontFamily:'Syne', fontSize:'24px', fontWeight:800, letterSpacing:'-0.03em' }}>
            Project <span style={{ color:'var(--cyan)' }}>Tracker</span>
          </h1>
          <p style={{ color:'var(--text2)', marginTop:'4px', fontSize:'13px' }}>
            {projects.length} records · {filtered.length} shown
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {can('create') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setImportModal(true)}>📥 Import</button>
          )}
          <button className="btn btn-success btn-sm" onClick={handleExport} disabled={exporting}>📊 Export Excel</button>
          {can('create') && (
            <button className="btn btn-primary" onClick={() => setModal('new')}>+ New Project</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
        <input className="finput" style={{ maxWidth:'260px' }} placeholder="🔍 Search app, vuln, engineer..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="fselect" style={{ maxWidth:'160px' }} value={filterSev} onChange={e => setFilterSev(e.target.value)}>
          <option value="">All Severities</option>
          {['Critical','High','Medium','Low','Informational'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="fselect" style={{ maxWidth:'180px' }} value={filterMit} onChange={e => setFilterMit(e.target.value)}>
          <option value="">All Statuses</option>
          {['Business Requirements','Pending','Resolved','Risk Acceptance'].map(s => <option key={s}>{s}</option>)}
        </select>
        {(search || filterSev || filterMit) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterSev(''); setFilterMit(''); }}>Clear filters</button>
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
                <th>Application</th>
                <th>URL</th>
                <th>Vulnerabilities & Severity</th>
                <th>Resolver Team</th>
                <th>Mitigation</th>
                <th>Scan Date</th>
                <th>Report Date</th>
                <th>Deadline</th>
                <th>Zone</th>
                <th>Env</th>
                <th>Category</th>
                <th>Engineer</th>
                <th>Assigned</th>
                <th>Go Live</th>
                <th>Prod URL</th>
                <th>Mit. Prod</th>
                <th>Remarks</th>
                <th>Files</th>
                {can('update') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={20} style={{ textAlign:'center', padding:'48px', color:'var(--text2)' }}>
                  No records.{can('create') && <> <button className="btn btn-primary btn-sm" style={{ marginLeft:'8px' }} onClick={() => setModal('new')}>Add first</button></>}
                </td></tr>
              ) : filtered.map((p, i) => {
                const vulns = getVulns(p);
                return (
                  <tr key={p.id} style={{ background: isOverdue(p) ? 'rgba(239,68,68,0.04)' : undefined }}>
                    <td style={{ color:'var(--text3)', fontFamily:'DM Mono', fontSize:'11px' }}>{i + 1}</td>
                    <td style={{ color:'var(--cyan)', fontWeight:600, maxWidth:'130px', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {isOverdue(p) && <span style={{ marginRight:'4px' }}>🔴</span>}
                      {decode(p.application_name) || '—'}
                    </td>
                    <td>{p.url ? <a href={/^https?:\/\//i.test(p.url) ? p.url : `http://${p.url}`} target="_blank" rel="noopener noreferrer" style={{ color:'var(--blue)', textDecoration:'none', fontSize:'12px' }}>🔗</a> : '—'}</td>
                    <td style={{ width:'220px', minWidth:'220px', maxWidth:'220px' }}>
                      {vulns.length === 0
                        ? <span style={{ color:'var(--text3)' }}>—</span>
                        : <VulnSummaryCell vulns={vulns} />
                      }
                    </td>
                    <td style={{ fontSize:'11.5px', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text2)' }}>{decode(p.resolver_team) || '—'}</td>
                    <td>{p.mitigation_status ? <span className={`badge ${mitBadge(p.mitigation_status)}`}>{decode(p.mitigation_status)}</span> : '—'}</td>
                    <td style={{ fontSize:'11px', color:'var(--text2)' }}>{p.scan_date || '—'}</td>
                    <td style={{ fontSize:'11px', color:'var(--text2)' }}>{p.report_sharing_date || '—'}</td>
                    <td style={{ fontSize:'11px', color: isOverdue(p) ? 'var(--red)' : 'var(--text2)', fontWeight: isOverdue(p) ? 700 : 400 }}>{p.deadline_date || '—'}</td>
                    <td style={{ fontSize:'11.5px' }}>{decode(p.application_zone) || '—'}</td>
                    <td style={{ fontSize:'11.5px' }}>{decode(p.environment) || '—'}</td>
                    <td style={{ fontSize:'11.5px' }}>{decode(p.category) || '—'}</td>
                    <td style={{ color:'var(--purple)', fontSize:'12px' }}>{decode(p.engineer) || '—'}</td>
                    <td style={{ fontSize:'11.5px', color:'var(--text2)' }}>{decode(p.assigned_fullname || p.assigned_username) || '—'}</td>
                    <td>{p.go_live_status ? <span className={`badge b-${p.go_live_status.toLowerCase()}`}>{p.go_live_status}</span> : '—'}</td>
                    <td>{p.prod_url ? <a href={/^https?:\/\//i.test(p.prod_url) ? p.prod_url : `http://${p.prod_url}`} target="_blank" rel="noopener noreferrer" style={{ color:'var(--blue)', textDecoration:'none', fontSize:'12px' }}>🔗</a> : '—'}</td>
                    <td style={{ fontSize:'11.5px', color: p.mitigation_status_prod === 'Mitigated' ? 'var(--green)' : p.mitigation_status_prod ? 'var(--red)' : 'var(--text3)' }}>{decode(p.mitigation_status_prod) || '—'}</td>
                    <td style={{ fontSize:'11.5px', color:'var(--text2)', maxWidth:'120px', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {decode(p.remarks) || '—'}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAttachModal({ sourceType:'project', sourceId: p.id, sourceName: p.application_name })}
                        title="Attachments"
                        style={{ fontSize:'14px', padding:'4px 8px' }}
                      >📎</button>
                    </td>
                    {can('update') && (
                      <td>
                        <div style={{ display:'flex', gap:'5px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModal(p)}>✏️</button>
                          {can('delete') && <button className="btn btn-danger btn-sm" onClick={() => del(p.id, p.application_name)}>🗑</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ProjectForm initial={modal === 'new' ? null : modal} onSave={save} onClose={() => setModal(null)} users={users} />}
      {attachModal && <AttachmentsPanel sourceType={attachModal.sourceType} sourceId={attachModal.sourceId} sourceName={attachModal.sourceName} onClose={() => setAttachModal(null)} />}
      {importModal && <ImportModal onClose={() => setImportModal(false)} onImported={load} />}
    </div>
  );
}
