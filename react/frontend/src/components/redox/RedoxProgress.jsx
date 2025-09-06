import React from 'react';

const RedoxProgress = React.memo(function RedoxProgress({ loadProgress, selectedSites = [], maxFidelity, activeWindowStart, activeWindowEnd }) {
  return (
    <div className="loading-panel" style={{ padding: '1rem', border: '1px solid #e9ecef', borderRadius: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Loading Redox Analysis</h3>
          <div style={{ color: '#6c757d', fontSize: 12 }}>
            {activeWindowStart && activeWindowEnd ? `Window: ${String(activeWindowStart).slice(0,10)} → ${String(activeWindowEnd).slice(0,10)}` : 'Preparing request…'}
          </div>
        </div>
        <div style={{ color: '#6c757d', fontSize: 12 }}>
          {Array.isArray(selectedSites) ? `${selectedSites.length} site(s)` : ''}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {loadProgress && loadProgress.mode === 'chunk' && Array.isArray(loadProgress.sites) ? (
          <>
            {loadProgress.sites.map(site => {
              const p = loadProgress.perSite?.[site] || { loaded: 0, total: null };
              const pct = p.total ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : 0;
              return (
                <div key={site} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#495057' }}>
                    <span>Site {site}</span>
                    <span>{p.loaded.toLocaleString()} {p.total ? `/ ${p.total.toLocaleString()}` : ''} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f3f5', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#0d6efd', borderRadius: 4 }}></div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 12, color: '#6c757d' }}>
              {loadProgress.totalExpected ? `Total: ${loadProgress.totalLoaded.toLocaleString()} / ${loadProgress.totalExpected.toLocaleString()}` : `Total loaded: ${loadProgress.totalLoaded?.toLocaleString?.() || 0}`}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6c757d' }}>
            <i className="bi bi-arrow-repeat spin"></i>
            <span>{maxFidelity ? 'Max Fidelity: Fetching raw data…' : 'Fetching aggregated data…'}</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default RedoxProgress;

