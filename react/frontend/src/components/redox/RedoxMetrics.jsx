import React from 'react';
import MetricCard from '../../components/modern/MetricCard';

const RedoxMetrics = React.memo(function RedoxMetrics({ metrics, selectedSites = [] }) {
  const m = metrics || { 
    totalMeasurements: 0, 
    redoxRange: 'No Data', 
    avgRedox: 0, 
    validMeasurements: 0, 
    sitesCount: 0,
    breakdown: { redoxRange: [], avgRedox: [] }
  };

  // Prefer selectedSites, but if none of them have data (e.g., only S3 loaded),
  // fall back to sites detected in metric breakdown to avoid showing "No Data".
  const breakdownSites = Array.from(new Set([
    ...(m.breakdown?.avgRedox || []).map(x => x.site),
    ...(m.breakdown?.redoxRange || []).map(x => x.site),
  ].filter(Boolean)));
  const hasDataForSite = (sc) => {
    const item = (m.breakdown?.avgRedox || []).find(x => x.site === sc);
    return !!(item && item.count > 0 && Number.isFinite(item.avg));
  };
  const selectedHasAnyData = Array.isArray(selectedSites) && selectedSites.some(hasDataForSite);
  // Display logic: if selected sites include any with data, use them; otherwise fall back to detected sites
  const displaySites = selectedHasAnyData
    ? selectedSites
    : (breakdownSites.length > 0 ? breakdownSites : (Array.isArray(selectedSites) ? selectedSites : []));

  return (
    <div className="metrics-grid">
      <MetricCard
        title="Total Measurements"
        value={(m.totalMeasurements || 0).toLocaleString()}
        icon="flask"
        context={`${m.validMeasurements || 0} valid redox readings`}
        tooltip="Total number of redox potential measurements collected from all monitoring sites. This includes both valid and invalid readings, providing an overview of data collection volume and frequency."
      />
      <MetricCard
        title="Redox Range (across sites)"
        value={m.redoxRange || 'No Data'}
        icon="graph-up"
        status={(m.avgRedox || 0) > 0 ? 'good' : 'warning'}
        context={(m.avgRedox || 0) > 0 ? 'Oxidizing conditions' : 'Reducing conditions'}
        tooltip="Front: span between minimum and maximum redox values across all sites. Back: per-site ranges."
        flippable
        backContent={(
          <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', padding: '8px', gap: 6 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Per-site Redox Range</div>
            <div style={{ display: 'grid', gap: 4, overflowY: 'auto', paddingRight: 2 }}>
              {displaySites.map(sc => {
                const item = (m.breakdown?.redoxRange || [])?.find?.(x => x.site === sc);
                const val = item ? item.range : 'No Data';
                return (
                  <div key={`range-${sc}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{sc}</span>
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '0.85rem' }}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      />
      <MetricCard
        title="Average Redox (across sites)"
        value={`${(m.avgRedox || 0).toFixed(0)} mV`}
        icon="lightning-charge"
        status={(m.avgRedox || 0) > 200 ? 'good' : (m.avgRedox || 0) > -50 ? 'normal' : 'warning'}
        context={(m.avgRedox || 0) > 200 ? 'Highly oxic conditions' : (m.avgRedox || 0) > 50 ? 'Oxic conditions' : (m.avgRedox || 0) > -50 ? 'Suboxic conditions' : 'Reducing conditions'}
        tooltip="Front: average redox potential across all measurements from selected sites. Back: per-site averages."
        flippable
        backContent={(
          <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', padding: '8px', gap: 6 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Per-site Avg Redox</div>
            <div style={{ display: 'grid', gap: 4, overflowY: 'auto', paddingRight: 2 }}>
              {displaySites.map(sc => {
                const item = (m.breakdown?.avgRedox || [])?.find?.(x => x.site === sc);
                const val = item && item.avg !== null ? `${item.avg.toFixed(0)} mV` : 'No Data';
                return (
                  <div key={`avg-${sc}`} style={{ display: 'grid', gap: 2, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{sc}</span>
                      <span style={{ color: '#0f172a', fontWeight: 700 }}>{val}</span>
                    </div>
                    {item && item.count > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                        {item.count} measurements
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      />
    </div>
  );
});

export default RedoxMetrics;
