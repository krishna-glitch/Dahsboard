import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { getDataQualitySummary, getAvailableSites } from '../services/api';
import EmptyState from '../components/modern/EmptyState';
import MetricCard from '../components/modern/MetricCard';
import { useToast } from '../components/modern/toastUtils';

const DataQuality = () => {
  const [sites, setSites] = useState([]);
  const [availableSites, setAvailableSites] = useState([]);
  const [dataType, setDataType] = useState('water_quality');
  const [timeRange, setTimeRange] = useState('30d');
  const [cadence, setCadence] = useState(''); // '' -> default per dataType
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const toast = useToast();

  // Use ref to avoid effect dependency churn from toast object identity
  const toastRef = useRef(null);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const tid = toastRef.current?.showLoading('Scanning data gaps and duplicates…', { title: 'Data Quality', persistent: true, duration: 0 });
      const params = { sites: sites.join(','), data_type: dataType, time_range: timeRange };
      if (cadence) params.cadence = cadence;
      const res = await getDataQualitySummary(params);
      setSummary(res);
      // Compute basic metrics
      let nSites = Array.isArray(res?.sites) ? res.sites.length : 0;
      let nDays = 0;
      try { nDays = (res?.sites || []).reduce((s, x) => s + ((x.days || []).length), 0); } catch (_) {}
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const secs = ((t1 - t0) / 1000).toFixed(2);
      const rate = (t1 - t0) > 0 ? `${Math.round(nDays / ((t1 - t0) / 1000)).toLocaleString()} days/s` : '';
      const msg = `Analysis complete • ${secs}s • ${rate} • ${nSites} sites / ${nDays.toLocaleString()} site-days`;
      if (tid) toastRef.current?.updateToast(tid, { type: 'success', title: 'Data Quality', message: msg, duration: 4000, persistent: false });
    } catch (e) {
      setError(String(e?.message || e));
      toastRef.current?.showError('Failed to analyze data quality', { title: 'Data Quality' });
    } finally {
      setLoading(false);
    }
  }, [sites, dataType, timeRange, cadence]);

  useEffect(() => { 
    (async () => {
      try {
        const resp = await getAvailableSites();
        setAvailableSites(resp?.sites || []);
        const defaults = (resp?.sites || []).slice(0,2).map(s=>s.id);
        setSites(defaults);
      } catch (_) {}
    })();
  }, []);

  // Trigger fetch when filters change (avoid including toast to prevent infinite loop)
  useEffect(() => {
    if (sites.length > 0) fetchSummary();
  }, [sites, dataType, timeRange, cadence, fetchSummary]);

  const kpis = useMemo(() => {
    if (!summary?.sites?.length) return { avgCompleteness: 0, totalDuplicates: 0, daysWithMissing: 0 };
    const avgCompleteness = summary.sites.reduce((s, x)=> s + (x.completeness_pct || 0), 0) / summary.sites.length;
    const totalDuplicates = summary.sites.reduce((s, x)=> s + (x.duplicates || 0), 0);
    const daysWithMissing = summary.sites.reduce((s, x)=> s + (x.days||[]).filter(d => d.missing > 0).length, 0);
    return { avgCompleteness, totalDuplicates, daysWithMissing };
  }, [summary]);

  const ProblemDays = ({ site }) => {
    const items = (site.days||[]).filter(d => d.missing > 0);
    if (!items.length) return <div style={{ color: '#6c757d', fontSize: 12 }}>No missing data days</div>;
    return (
      <div className="problem-days">
        {items.slice(0, 10).map((d, idx) => (
          <div key={idx} className="problem-day-item">
            <div className="pd-header">
              <strong>{d.date}</strong>
              <span style={{ color: '#6c757d' }}>{d.present}/{d.expected} ({d.missing} missing)</span>
            </div>
            {d.missing_buckets && d.missing_buckets.length > 0 && (
              <div className="pd-missing-list" style={{ color: '#6c757d', fontSize: 12 }}>
                Missing at: {d.missing_buckets.slice(0,8).join(', ')}{d.missing_buckets.length>8?' …':''}
              </div>
            )}
          </div>
        ))}
        {items.length > 10 && (
          <div style={{ color: '#6c757d', fontSize: 12 }}>
            +{items.length - 10} more days…
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modern-dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Data Quality</h1>
          <p className="dashboard-subtitle">Identify missing data by day/hour, duplicates, and coverage</p>
          {summary?.metadata && (
            <div style={{ color: '#6c757d', fontSize: 12 }}>
              Window: {String(summary.metadata.start).slice(0,10)} → {String(summary.metadata.end).slice(0,10)} • Cadence: {summary.metadata.cadence} • Expected/day: {summary.metadata.expected_per_day}
            </div>
          )}
        </div>
        <div className="site-comparison-controls" style={{ margin: 0 }}>
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchSummary} disabled={loading}>
            <i className={`bi ${loading?'bi-arrow-repeat':'bi-arrow-clockwise'} me-1`}></i>
            Refresh
          </button>
          <div className="btn btn-outline-secondary btn-sm" title="Export JSON" onClick={()=>{
            try {
              const blob = new Blob([JSON.stringify(summary||{}, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `data_quality_${summary?.metadata?.start?.slice(0,10)}_${summary?.metadata?.end?.slice(0,10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (_) {}
          }}>
            <i className="bi bi-download me-1"></i> Export JSON
          </div>
        </div>
      </div>

      <div className="main-content">
        {/* Controls */}
        <div className="site-comparison-controls" style={{ marginBottom: 12 }}>
          <div className="control-group">
            <label className="control-label">Sites</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSites.map(s => (
                <label key={s.id} className={`chip ${sites.includes(s.id)?'chip-selected':''}`} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={sites.includes(s.id)} onChange={() => {
                    setSites(prev => prev.includes(s.id) ? prev.filter(x=>x!==s.id) : [...prev, s.id]);
                  }} />
                  <span>{s.name || s.id}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="control-group">
            <label className="control-label">Data Type</label>
            <select className="control-select" value={dataType} onChange={(e)=>setDataType(e.target.value)}>
              <option value="water_quality">Water Quality</option>
              <option value="redox">Redox</option>
            </select>
          </div>
          <div className="control-group">
            <label className="control-label">Time Range</label>
            <select className="control-select" value={timeRange} onChange={(e)=>setTimeRange(e.target.value)}>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
          <div className="control-group">
            <label className="control-label">Cadence</label>
            <select className="control-select" value={cadence} onChange={(e)=>setCadence(e.target.value)}>
              <option value="">Auto</option>
              <option value="1H">Hourly</option>
              <option value="30min">30 min</option>
              <option value="15min">15 min</option>
            </select>
          </div>
        </div>

        {loading && (
          <EmptyState type="loading" title="Analyzing Data Quality" description="Computing gaps, duplicates, and completeness…" />
        )}
        {error && (
          <EmptyState type="error" context={{ errorMessage: error, onRetry: fetchSummary }} />
        )}
        {!loading && !error && (
          <>
            <div className="metrics-grid">
              <MetricCard title="Avg Completeness" value={`${kpis.avgCompleteness.toFixed(1)}%`} icon="check-circle" status={kpis.avgCompleteness>95?'excellent':kpis.avgCompleteness>85?'good':'warning'} />
              <MetricCard title="Total Duplicates" value={kpis.totalDuplicates.toLocaleString()} icon="exclamation-triangle" status={kpis.totalDuplicates===0?'excellent':'warning'} />
              <MetricCard title="Days with Missing" value={kpis.daysWithMissing.toLocaleString()} icon="calendar" status={kpis.daysWithMissing===0?'excellent':'warning'} />
            </div>

            <div className="section-header">
              <h2 className="section-title"><i className="bi bi-list-check me-2"></i>Per-Site Details</h2>
            </div>

            <div className="comparison-results">
              <div className="results-table-container">
                <table className="modern-table">
                  <thead className="table-header">
                    <tr>
                      <th>Site</th>
                      <th>Completeness</th>
                      <th>Duplicates</th>
                      <th>Missing Days</th>
                      <th>Details</th>
                      <th>Daily Heatmap</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {(summary?.sites||[]).map((s, idx)=>{
                      const missingDays = (s.days||[]).filter(d=>d.missing>0).length;
                      return (
                        <tr key={idx} className="table-row">
                          <td className="table-cell"><div className="cell-primary">{s.site_id}</div></td>
                          <td className="table-cell"><div className="cell-primary">{(s.completeness_pct||0).toFixed(1)}%</div></td>
                          <td className="table-cell"><div className="cell-primary">{s.duplicates||0}</div></td>
                          <td className="table-cell"><div className="cell-primary">{missingDays}</div></td>
                          <td className="table-cell">
                            <ProblemDays site={s} />
                          </td>
                          <td className="table-cell">
                            <div className="daily-heatmap" style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 8px)', gap: 2 }}>
                              {(s.days||[]).slice(-(14)).map((d,i)=>{
                                const pct = d.completeness_pct || (d.present && d.expected ? (d.present/d.expected*100) : 0);
                                const color = pct>=95?'#198754':pct>=80?'#ffc107':'#dc3545';
                                const title = `${d.date}: ${pct.toFixed(1)}% (${d.present}/${d.expected})`;
                                return <div key={i} title={title} style={{ width: 8, height: 8, background: color, borderRadius: 2 }}></div>;
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DataQuality;
