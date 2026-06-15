import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { AttachmentsPanel } from './ProjectTracker';

const SEV_OPTIONS    = ['Critical','High','Medium','Low'];
const STATUS_OPTIONS = ['Open','Resolved'];

const SEV_STYLE = {
  Critical:    { bg:'rgba(248,113,113,0.12)', color:'var(--critical)', border:'rgba(248,113,113,0.3)' },
  High:        { bg:'rgba(251,146,60,0.12)',  color:'var(--high)',     border:'rgba(251,146,60,0.3)' },
  Medium:      { bg:'rgba(251,191,36,0.12)',  color:'var(--medium)',   border:'rgba(251,191,36,0.3)' },
  Low:         { bg:'rgba(96,165,250,0.12)',  color:'var(--low)',      border:'rgba(96,165,250,0.3)' },
};

const STATUS_STYLE = {
  Open:     { bg:'rgba(251,191,36,0.12)', color:'var(--amber)',  border:'rgba(251,191,36,0.3)' },
  Resolved: { bg:'rgba(52,211,153,0.12)', color:'var(--green)',  border:'rgba(52,211,153,0.3)' },
};

const SevBadge = ({ s }) => {
  if (!s) return <span style={{ color:'var(--text3)' }}>—</span>;
  const st = SEV_STYLE[s] || {};
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:'4px', fontSize:'11px', fontWeight:700, background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>
      {s}
    </span>
  );
};

const StatusBadge = ({ s }) => {
  if (!s) return <span style={{ color:'var(--text3)' }}>—</span>;
  const st = STATUS_STYLE[s] || {};
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'2px 9px', borderRadius:'4px', fontSize:'11px', fontWeight:700, background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>
      <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:st.color, flexShrink:0 }} />
      {s}
    </span>
  );
};

const F = ({ label, children, span2 }) => (
  <div className="fgroup" style={span2 ? { gridColumn:'span 2' } : {}}>
    <label className="flabel">{label}</label>
    {children}
  </div>
);

// Date input restricted to year range 2000–2050
const DateInput = ({ name, value, onChange }) => (
  <input
    type="date"
    className="finput"
    name={name}
    value={value || ''}
    onChange={onChange}
    min="2000-01-01"
    max="2050-12-31"
  />
);

// Month+Year only input (mitigation deadline)
const MonthInput = ({ name, value, onChange }) => (
  <input
    type="month"
    className="finput"
    name={name}
    value={value || ''}
    onChange={onChange}
    min="2000-01"
    max="2050-12"
  />
);

const EMPTY = {
  risk_details:'', severity:'', responsible:'',
  risk_announcement_date:'', risk_acceptance_date:'',
  mitigation_deadline:'', current_status:'Open', remarks:'',
};

/* ── Form Modal ─────────────────────────────────────────────────── */
function RiskForm({ initial, onSave, onClose }) {
  const [form, setForm]   = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [saving, setSaving] = useState(false);
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:'780px' }}>
        <div className="modal-hd">
          <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize:'15px', fontWeight:700, color:'var(--text)' }}>
            {initial?.id ? '✏ Edit Risk' : '+ Add Risk'}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-bd">
          <div className="fgrid">

            {/* Risk Details — full width */}
            <F label="Risk Details" span2>
              <textarea
                className="finput"
                name="risk_details"
                value={form.risk_details}
                onChange={handle}
                placeholder="Describe the risk in detail..."
                rows={3}
                style={{ resize:'vertical', lineHeight:1.5 }}
              />
            </F>

            <F label="Severity">
              <select className="fselect" name="severity" value={form.severity} onChange={handle}>
                <option value="">— Select —</option>
                {SEV_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </F>

            <F label="Responsible">
              <input className="finput" name="responsible" value={form.responsible} onChange={handle} placeholder="Person or team responsible" />
            </F>

            <F label="Risk Announcement Date">
              <DateInput name="risk_announcement_date" value={form.risk_announcement_date} onChange={handle} />
            </F>

            <F label="Risk Acceptance Date">
              <DateInput name="risk_acceptance_date" value={form.risk_acceptance_date} onChange={handle} />
            </F>

            <F label="Mitigation Deadline (Month & Year)">
              <MonthInput name="mitigation_deadline" value={form.mitigation_deadline} onChange={handle} />
            </F>

            <F label="Current Status">
              <select className="fselect" name="current_status" value={form.current_status} onChange={handle}>
                <option value="">— Select —</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </F>

            {/* Remarks — full width */}
            <F label="Remarks" span2>
              <input className="finput" name="remarks" value={form.remarks} onChange={handle} placeholder="Additional notes..." />
            </F>

          </div>

          <div style={{ display:'flex', gap:'10px', marginTop:'20px', justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : (initial?.id ? '✓ Save Changes' : '+ Add Risk')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */
export default function RiskAcceptance() {
  const { can } = useAuth();
  const [risks, setRisks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [attachModal, setAttachModal] = useState(null);
  const [toast, setToast]       = useState(null);

  // Filters
  const [search,    setSearch]    = useState('');
  const [filterSev, setFilterSev] = useState('');
  const [filterSt,  setFilterSt]  = useState('');

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)    params.search   = search;
      if (filterSev) params.severity = filterSev;
      if (filterSt)  params.status   = filterSt;
      const r = await api.get('/api/risk-acceptance', { params });
      setRisks(r.data);
    } catch {} finally { setLoading(false); }
  }, [search, filterSev, filterSt]);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    try {
      if (form.id) {
        await api.put(`/api/risk-acceptance/${form.id}`, form);
        showToast('✓ Risk updated');
      } else {
        await api.post('/api/risk-acceptance', form);
        showToast('✓ Risk added');
      }
      load(); setModal(null);
    } catch (err) {
      showToast('✗ ' + (err.response?.data?.error || 'Save failed'), 'error');
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`Delete this risk entry?`)) return;
    try { await api.delete(`/api/risk-acceptance/${id}`); showToast('Deleted'); load(); }
    catch (err) { showToast('✗ ' + (err.response?.data?.error || 'Delete failed'), 'error'); }
  };

  // Summary counts
  const openCount     = risks.filter(r => r.current_status === 'Open').length;
  const resolvedCount = risks.filter(r => r.current_status === 'Resolved').length;
  const criticalCount = risks.filter(r => r.severity === 'Critical').length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'22px' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'14px' }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:'22px', fontWeight:800, letterSpacing:'-0.02em' }}>
            Risk Acceptance Status
          </h1>
          <p style={{ color:'var(--text2)', marginTop:'4px', fontSize:'13px' }}>
            {risks.length} total risks tracked
          </p>
        </div>
        {can('create') && (
          <button className="btn btn-primary" onClick={() => setModal('new')}>+ Add Risk</button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:'12px' }}>
        {[
          { label:'Total Risks',    val: risks.length,  color:'var(--cyan)' },
          { label:'Open',           val: openCount,     color:'var(--amber)' },
          { label:'Resolved',       val: resolvedCount, color:'var(--green)' },
          { label:'Critical',       val: criticalCount, color:'var(--critical)' },
        ].map((k, i) => (
          <div key={k.label} className="card fade-up" style={{ animationDelay:`${i*0.05}s`, borderLeft:`3px solid ${k.color}`, padding:'14px' }}>
            <div style={{ fontSize:'26px', fontFamily:"'Manrope',sans-serif", fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:'11.5px', color:'var(--text2)', marginTop:'8px', fontWeight:500 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
        <input className="finput" style={{ maxWidth:'260px' }} placeholder="🔍 Search risk details..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="fselect" style={{ maxWidth:'155px' }} value={filterSev} onChange={e => setFilterSev(e.target.value)}>
          <option value="">All Severities</option>
          {SEV_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="fselect" style={{ maxWidth:'145px' }} value={filterSt} onChange={e => setFilterSt(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || filterSev || filterSt) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterSev(''); setFilterSt(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--text2)', fontSize:'13px' }}>Loading...</div>
      ) : (
        <div className="tbl-wrap fade-up">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Risk Details</th>
                <th>Severity</th>
                <th>Responsible</th>
                <th>Announcement Date</th>
                <th>Acceptance Date</th>
                <th>Mitigation Deadline</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Added By</th>
                <th>Files</th>
                {can('update') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {risks.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign:'center', padding:'52px', color:'var(--text2)' }}>
                    No risk entries yet.
                    {can('create') && (
                      <> <button className="btn btn-primary btn-sm" style={{ marginLeft:'8px' }} onClick={() => setModal('new')}>Add first risk</button></>
                    )}
                  </td>
                </tr>
              ) : risks.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ color:'var(--text3)', fontSize:'11px' }}>{i + 1}</td>

                  {/* Risk Details — fixed width, tooltip on hover */}
                  <td style={{ maxWidth:'200px' }}>
                    <div
                      title={r.risk_details}
                      style={{
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        fontSize:'13px', color:'var(--text)', fontWeight:500,
                        cursor:'default',
                      }}
                    >
                      {r.risk_details || '—'}
                    </div>
                  </td>

                  <td><SevBadge s={r.severity} /></td>

                  <td style={{ fontSize:'12.5px', color:'var(--text2)', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {r.responsible || '—'}
                  </td>

                  <td style={{ fontSize:'12px', color:'var(--text2)' }}>
                    {r.risk_announcement_date || '—'}
                  </td>

                  <td style={{ fontSize:'12px', color:'var(--text2)' }}>
                    {r.risk_acceptance_date || '—'}
                  </td>

                  <td style={{ fontSize:'12px', color:'var(--text2)' }}>
                    {/* Show only month and year */}
                    {r.mitigation_deadline
                      ? new Date(r.mitigation_deadline + '-01').toLocaleDateString('en-US', { month:'short', year:'numeric' })
                      : '—'}
                  </td>

                  <td><StatusBadge s={r.current_status} /></td>

                  <td style={{ fontSize:'11.5px', color:'var(--text2)', maxWidth:'130px', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {r.remarks || '—'}
                  </td>

                  <td style={{ fontSize:'11.5px', color:'var(--text3)' }}>{r.created_username || '—'}</td>

                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAttachModal({ sourceType:'risk', sourceId: r.id, sourceName: r.risk_details })}
                      title="Attachments"
                      style={{ fontSize:'14px', padding:'4px 8px' }}
                    >📎</button>
                  </td>

                  {can('update') && (
                    <td>
                      <div style={{ display:'flex', gap:'5px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal(r)}>✏️</button>
                        {can('delete') && (
                          <button className="btn btn-danger btn-sm" onClick={() => del(r.id, r.risk_details)}>🗑</button>
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
        <RiskForm
          initial={modal === 'new' ? null : modal}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
      {attachModal && (
        <AttachmentsPanel
          sourceType={attachModal.sourceType}
          sourceId={attachModal.sourceId}
          sourceName={attachModal.sourceName}
          onClose={() => setAttachModal(null)}
        />
      )}
    </div>
  );
}
