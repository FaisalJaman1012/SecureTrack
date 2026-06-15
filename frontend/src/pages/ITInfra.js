import React, { useState } from 'react';

export default function ITInfra() {
  const [show, setShow] = useState(true);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'22px' }}>
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'14px' }}>
        <div>
          <h1 style={{ fontFamily:"'Manrope',sans-serif", fontSize:'22px', fontWeight:800, letterSpacing:'-0.02em' }}>IT Infrastructure</h1>
          <p style={{ color:'var(--text2)', marginTop:'4px', fontSize:'13px' }}>Asset management module</p>
        </div>
      </div>

      {/* Under Construction Banner */}
      <div className="card fade-up" style={{
        textAlign:'center', padding:'60px 32px',
        border:'2px dashed var(--border2)',
        background:'var(--bg2)',
      }}>
        <div style={{ fontSize:'56px', marginBottom:'20px' }}>🚧</div>
        <h2 style={{ fontFamily:"'Manrope',sans-serif", fontSize:'22px', fontWeight:800, color:'var(--amber)', marginBottom:'12px', letterSpacing:'-0.02em' }}>
          Page Under Construction
        </h2>
        <p style={{ fontSize:'14px', color:'var(--text2)', maxWidth:'400px', margin:'0 auto 24px', lineHeight:1.6 }}>
          The IT Infrastructure module is currently being developed and will be available soon.
        </p>
        <div style={{ display:'flex', justifyContent:'center', gap:'8px', marginBottom:'28px' }}>
          {['Asset Tracking','Network Devices','OS Inventory','ATM Management'].map(f => (
            <span key={f} style={{ padding:'4px 12px', borderRadius:'5px', fontSize:'11.5px', fontWeight:600, background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.25)', color:'var(--amber)' }}>
              {f}
            </span>
          ))}
        </div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'10px 20px', borderRadius:'8px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', fontSize:'13px', color:'var(--text2)' }}>
          <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'var(--amber)', animation:'pulse-dot 2s ease infinite', display:'inline-block' }} />
          Coming soon — check back later
        </div>
      </div>
    </div>
  );
}
