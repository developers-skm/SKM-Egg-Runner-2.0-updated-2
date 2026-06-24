/** Shimmer skeleton for the Protein Tracker dashboard while data loads. */
export default function SkeletonLoader() {
  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
      background: '#F5F5F5',
    }}>
      <style>{`
        @keyframes skshimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .sk {
          background: linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);
          background-size: 800px 100%;
          animation: skshimmer 1.4s ease-in-out infinite;
          border-radius: 10px;
        }
      `}</style>

      {/* Hero card */}
      <div className="sk" style={{ height: 140, borderRadius: 18 }} />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div className="sk" style={{ height: 72, borderRadius: 14 }} />
        <div className="sk" style={{ height: 72, borderRadius: 14 }} />
        <div className="sk" style={{ height: 72, borderRadius: 14 }} />
      </div>

      {/* List card */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="sk" style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="sk" style={{ height: 12, width: '60%' }} />
              <div className="sk" style={{ height: 10, width: '40%' }} />
            </div>
            <div className="sk" style={{ width: 40, height: 16, borderRadius: 8 }} />
          </div>
        ))}
      </div>

      {/* Second list card */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="sk" style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="sk" style={{ height: 12, width: '50%' }} />
              <div className="sk" style={{ height: 10, width: '35%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
