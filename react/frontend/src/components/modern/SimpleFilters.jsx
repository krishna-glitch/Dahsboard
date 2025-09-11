import React, { useEffect, useState } from 'react';
import { TIME_RANGE_OPTIONS } from '../../constants/appConstants';
import { getTimeRanges } from '../../services/api';

/**
 * Simple Filters Component
 * Replaces the complex UnifiedFilterSidebar with intuitive controls
 */
const SimpleFilters = ({
  selectedSites = ['S1', 'S2'],
  onSiteChange = () => {},
  timeRange = 'Last 30 Days',
  onTimeRangeChange = () => {},
  startDate = '',
  endDate = '',
  onStartDateChange = () => {},
  onEndDateChange = () => {},
  onApplyFilters = () => {},
  loading = false,
  collapsed = false,
  onToggleCollapse = () => {},
  maxDate = '',
  minDate = ''
}) => {
  const [localSites, setLocalSites] = useState(selectedSites);
  const [localTimeRange, setLocalTimeRange] = useState(timeRange);
  const [timeRanges, setTimeRanges] = useState(TIME_RANGE_OPTIONS);

  const availableSites = [
    { value: 'S1', label: 'Site 1', available: true },
    { value: 'S2', label: 'Site 2', available: true },
    { value: 'S3', label: 'Site 3', available: true },
    { value: 'S4', label: 'Site 4', available: true }
  ];

  // Load server-defined time ranges with fallback to constants
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem('config_time_ranges');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setTimeRanges(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to parse cached time ranges:', error);
    }

    (async () => {
      try {
        const resp = await getTimeRanges();
        const mapping = resp?.time_ranges;
        if (mapping && typeof mapping === 'object') {
          const serverRanges = Object.keys(mapping);
          // Preserve preferred order when possible
          const order = TIME_RANGE_OPTIONS;
          serverRanges.sort((a, b) => {
            const ai = order.indexOf(a);
            const bi = order.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
          });
          setTimeRanges(serverRanges);
          try { 
          window.localStorage.setItem('config_time_ranges', JSON.stringify(serverRanges)); 
        } catch (error) {
          console.warn('Failed to cache time ranges:', error);
        }
        }
      } catch (error) {
        console.warn('Failed to fetch time ranges, using defaults:', error);
      }
    })();
  }, []);

  // Keep local state in sync when parent props change (prevents filter/UI drift)
  const stringifiedSelectedSites = JSON.stringify(selectedSites);
  useEffect(() => {
    setLocalSites(selectedSites);
  }, [stringifiedSelectedSites, selectedSites]);

  useEffect(() => {
    setLocalTimeRange(timeRange);
  }, [timeRange]);

  const handleSiteToggle = (siteValue) => {
    const newSites = localSites.includes(siteValue)
      ? localSites.filter(s => s !== siteValue)
      : [...localSites, siteValue];
    
    setLocalSites(newSites);
  };

  const handleApply = () => {
    try {
      // Deep diagnostic log for Apply action
      // Shows exactly what will be committed to parent
      // console.log('[FILTER APPLY] sites=%o timeRange=%o start=%o end=%o', localSites, localTimeRange, startDate, endDate);
    } catch {
      /* ignore logging issues */
    }
    onSiteChange(localSites);
    onTimeRangeChange(localTimeRange);
    onApplyFilters();
  };

  const hasChanges = () => {
    return JSON.stringify(localSites) !== JSON.stringify(selectedSites) ||
           localTimeRange !== timeRange;
  };

  if (collapsed) {
    return (
      <div className="collapsed-filter-icons">
        <button 
          className="filter-icon-btn"
          onClick={onToggleCollapse}
          title="Expand Filters"
        >
          <i className="bi bi-gear"></i>
        </button>
        <button 
          className={`filter-icon-btn ${selectedSites.length > 0 ? 'active' : ''}`}
          title={`${selectedSites.length} sites selected`}
        >
          <i className="bi bi-geo-alt"></i>
          {selectedSites.length > 0 && (
            <span className="filter-badge">{selectedSites.length}</span>
          )}
        </button>
        <button 
          className="filter-icon-btn"
          title={timeRange}
        >
          <i className="bi bi-calendar3"></i>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="filter-panel-header">
        <h6 className="filter-panel-title">Filters</h6>
        <button 
          className="filter-toggle"
          onClick={onToggleCollapse}
          title="Collapse Filters"
        >
          ←
        </button>
      </div>
      
      <div className="filter-panel-content">
        {/* Sites Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#495057',
            marginBottom: '0.75rem'
          }}>
            <i className="bi bi-geo-alt me-1"></i> Monitoring Sites
          </label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableSites.map(site => (
              <label
                key={site.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: site.available ? 'pointer' : 'not-allowed',
                  opacity: site.available ? 1 : 0.5,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  background: localSites.includes(site.value) ? '#e7f3ff' : 'transparent',
                  border: localSites.includes(site.value) ? '1px solid #0d6efd' : '1px solid transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={localSites.includes(site.value)}
                  onChange={() => site.available && handleSiteToggle(site.value)}
                  disabled={!site.available || loading}
                  style={{ margin: 0 }}
                />
                <span style={{
                  fontSize: '0.875rem',
                  color: site.available ? '#212529' : '#6c757d'
                }}>
                  {site.label}
                </span>
                {!site.available && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#dc3545',
                    marginLeft: 'auto'
                  }}>
                    No data
                  </span>
                )}
              </label>
            ))}
          </div>
          
          <div style={{
            display: 'flex', 
            gap: '0.5rem', 
            marginTop: '0.75rem'
          }}>
            <button
              onClick={() => setLocalSites(availableSites.filter(s => s.available).map(s => s.value))}
              disabled={loading}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: '1px solid #dee2e6',
                background: 'transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#6c757d'
              }}
            >
              Select All
            </button>
            <button
              onClick={() => setLocalSites([])}
              disabled={loading}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: '1px solid #dee2e6',
                background: 'transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#6c757d'
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Time Range Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#495057',
            marginBottom: '0.75rem'
          }}>
            <i className="bi bi-calendar3 me-1"></i> Time Period
          </label>
          
          <select
            value={localTimeRange}
            onChange={(e) => {
              const v = e.target.value;
              setLocalTimeRange(v); // Do NOT propagate; only apply on Apply button
            }}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              background: 'white',
              fontSize: '0.875rem'
            }}
          >
            {timeRanges.map(range => (
              <option key={range} value={range}>
                {range}
              </option>
            ))}
          </select>
          
          {/* Custom Date Range */}
          {localTimeRange === 'Custom Range' && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem',
              background: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #dee2e6'
            }}>
              {/* Available data range hint */}
              {(minDate || maxDate) && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="token-tooltip" aria-label="Available data range">
                    <span className="token-tooltip-icon"><i className="bi bi-info"></i></span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Available data range</span>
                    <div className="token-tooltip-content">
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Available data</div>
                      {minDate ? (
                        <>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{minDate}</strong>
                            {' '}to{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>{maxDate || '—'}</strong>
                          </div>
                          <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            Dates outside this range are disabled.
                          </div>
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-secondary)' }}>
                          Through <strong style={{ color: 'var(--text-primary)' }}>{maxDate || '—'}</strong> (loading earliest…)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(() => {
                const toDate = (v) => (v ? new Date(v) : null);
                const dMin = toDate(minDate);
                const dMax = toDate(maxDate);
                const dStart = toDate(startDate);
                const dEnd = toDate(endDate);
                const startTooEarly = dStart && dMin && dStart < dMin;
                const startTooLate = dStart && (dEnd ? dStart > dEnd : (dMax && dStart > dMax));
                const endTooEarly = dEnd && (dStart ? dEnd < dStart : (dMin && dEnd < dMin));
                const endTooLate = dEnd && dMax && dEnd > dMax;
                const invalidOrder = dStart && dEnd && dStart > dEnd;
                // Expose computed flags within JSX scope via a closure
                return (
                  <div style={{ display: 'none' }} data-flags={`${startTooEarly||startTooLate||endTooEarly||endTooLate||invalidOrder}`}></div>
                );
              })()}
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    color: '#495057',
                    marginBottom: '0.25rem'
                  }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}
                    max={(endDate || maxDate) || undefined}
                    min={minDate || undefined}
                    disabled={loading}
                  />
                  {/* Start date helper messages */}
                  {(() => {
                    const toDate = (v) => (v ? new Date(v) : null);
                    const dMin = toDate(minDate);
                    const dMax = toDate(maxDate);
                    const dStart = toDate(startDate);
                    const dEnd = toDate(endDate);
                    if (!dStart) return null;
                    if (dMin && dStart < dMin) {
                      return (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#dc3545' }}>
                          Start date cannot be before {minDate}
                        </div>
                      );
                    }
                    if (dEnd && dStart > dEnd) {
                      return (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#dc3545' }}>
                          Start date cannot be after End date
                        </div>
                      );
                    }
                    if (!dEnd && dMax && dStart > dMax) {
                      return (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#dc3545' }}>
                          Start date cannot be after {maxDate}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    color: '#495057',
                    marginBottom: '0.25rem'
                  }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}
                    max={maxDate || undefined}
                    min={(startDate || minDate) || undefined}
                    disabled={loading}
                  />
                  {/* End date helper messages */}
                  {(() => {
                    const toDate = (v) => (v ? new Date(v) : null);
                    const dMin = toDate(minDate);
                    const dMax = toDate(maxDate);
                    const dStart = toDate(startDate);
                    const dEnd = toDate(endDate);
                    if (!dEnd) return null;
                    if (dStart && dEnd < dStart) {
                      return (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#dc3545' }}>
                          End date must be after Start date
                        </div>
                      );
                    }
                    if (!dStart && dMin && dEnd < dMin) {
                      return (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#dc3545' }}>
                          End date cannot be before {minDate}
                        </div>
                      );
                    }
                    if (dMax && dEnd > dMax) {
                      return (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#dc3545' }}>
                          End date cannot be after {maxDate}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              {(() => {
                const toDate = (v) => (v ? new Date(v) : null);
                const dMin = toDate(minDate);
                const dMax = toDate(maxDate);
                const dStart = toDate(startDate);
                const dEnd = toDate(endDate);
                const invalid = (
                  (dStart && dMin && dStart < dMin) ||
                  (dStart && dEnd && dStart > dEnd) ||
                  (dEnd && dMax && dEnd > dMax) ||
                  (dEnd && !dStart && dMin && dEnd < dMin) ||
                  (dStart && !dEnd && dMax && dStart > dMax)
                );
                return invalid ? (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#dc3545' }}>
                    <i className="bi bi-exclamation-triangle me-1"></i>
                    Please select dates within the available range.
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>

        {/* Apply Button */}
        {(() => {
          const toDate = (v) => (v ? new Date(v) : null);
          const dMin = toDate(minDate);
          const dMax = toDate(maxDate);
          const dStart = toDate(startDate);
          const dEnd = toDate(endDate);
          const invalidDates = (
            localTimeRange === 'Custom Range' && (
              (dStart && dMin && dStart < dMin) ||
              (dStart && dEnd && dStart > dEnd) ||
              (dEnd && dMax && dEnd > dMax) ||
              (dEnd && !dStart && dMin && dEnd < dMin) ||
              (dStart && !dEnd && dMax && dStart > dMax)
            )
          );
          return (
            <button
              onClick={handleApply}
              disabled={loading || !hasChanges() || invalidDates}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: (!invalidDates && hasChanges()) ? '#0d6efd' : '#e9ecef',
                color: (!invalidDates && hasChanges()) ? 'white' : '#6c757d',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: (!invalidDates && hasChanges()) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease'
              }}
            >
              {loading ? 'Loading...' : (!invalidDates && hasChanges()) ? 'Apply Changes' : invalidDates ? 'Fix Date Range' : 'No Changes'}
            </button>
          );
        })()}

      </div>
    </div>
  );
};

export default SimpleFilters;
