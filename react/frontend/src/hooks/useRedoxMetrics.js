import { useEffect, useRef, useState } from 'react';

// Compute metrics inline for small datasets; fall back to inline for large if worker not desired
export function computeMetricsInline(data, selectedSites = []) {
  if (!Array.isArray(data) || data.length === 0) {
    return { 
      totalMeasurements: 0, 
      redoxRange: 'No Data', 
      avgRedox: 0, 
      zonesDetected: 0, 
      validMeasurements: 0, 
      dataCompleteness: 0,
      sitesCount: 0,
      breakdown: { redoxRange: [], avgRedox: [] }
    };
  }

  // Debug: Log first few records to understand data structure
  if (data.length > 0) {
    console.debug('[REDOX METRICS DEBUG] Sample data record:', data[0]);
    console.debug('[REDOX METRICS DEBUG] Available fields:', Object.keys(data[0] || {}));
    console.debug('[REDOX METRICS DEBUG] Selected sites:', selectedSites);
  }

  // Overall metrics
  let count = data.length, valid = 0, min = Infinity, max = -Infinity, sum = 0;
  
  // Per-site breakdown - use efficient streaming computation instead of storing all values
  const bySite = new Map();
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    // Check multiple possible redox value field names
    const vRaw = d?.processed_eh != null ? d.processed_eh : 
                 d?.redox_value_mv != null ? d.redox_value_mv :
                 d?.redox_mv != null ? d.redox_mv : 
                 d?.eh_mv != null ? d.eh_mv : null;
    const v = vRaw == null ? NaN : Number(vRaw);
    // Check multiple possible site identifier field names
    const siteCode = d?.site_code || d?.site_id || d?.code;
    
    // Initialize site data if not exists
    if (siteCode && !bySite.has(siteCode)) {
      bySite.set(siteCode, { 
        count: 0, 
        validCount: 0, 
        sum: 0, 
        min: Infinity, 
        max: -Infinity 
      });
    }
    
    // Add to site data using streaming computation
    if (siteCode) {
      const siteData = bySite.get(siteCode);
      siteData.count++;
      if (Number.isFinite(v)) {
        siteData.validCount++;
        siteData.sum += v;
        if (v < siteData.min) siteData.min = v;
        if (v > siteData.max) siteData.max = v;
      }
    }
    
    // Overall calculations
    if (Number.isFinite(v)) {
      valid++;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
  }

  // Debug: Log what sites were found in the data
  console.debug('[REDOX METRICS DEBUG] Sites found in data:', Array.from(bySite.keys()));
  console.debug('[REDOX METRICS DEBUG] Site data summary:', 
    Array.from(bySite.entries()).map(([site, data]) => ({ site, validCount: data.validCount, totalCount: data.count })));

  // Calculate per-site metrics using precomputed streaming values
  const siteBreakdown = { redoxRange: [], avgRedox: [] };
  for (const [site, siteData] of bySite.entries()) {
    if (siteData.validCount > 0) {
      const siteMin = siteData.min;
      const siteMax = siteData.max;
      const siteAvg = siteData.sum / siteData.validCount;
      
      siteBreakdown.redoxRange.push({
        site,
        range: `${siteMin.toFixed(0)} to ${siteMax.toFixed(0)} mV`,
        min: siteMin,
        max: siteMax
      });
      
      siteBreakdown.avgRedox.push({
        site,
        avg: siteAvg,
        count: siteData.validCount
      });
    } else {
      // Site has no valid redox data
      siteBreakdown.redoxRange.push({
        site,
        range: 'No Valid Data',
        min: null,
        max: null
      });
      
      siteBreakdown.avgRedox.push({
        site,
        avg: null,
        count: 0
      });
    }
  }

  return {
    totalMeasurements: count,
    redoxRange: Number.isFinite(min) && Number.isFinite(max) ? `${min.toFixed(0)} to ${max.toFixed(0)} mV` : 'No Valid Data',
    avgRedox: valid > 0 ? sum / valid : 0,
    zonesDetected: 0,
    validMeasurements: valid,
    dataCompleteness: count > 0 ? Math.round((valid / count) * 100) : 0,
    sitesCount: bySite.size,
    breakdown: siteBreakdown
  };
}

export function useRedoxMetrics(data, selectedSites = []) {
  const [metrics, setMetrics] = useState(computeMetricsInline(data, selectedSites));
  const workerRef = useRef(null);

  const selectedSitesKey = selectedSites?.join?.(',');
  useEffect(() => {
    let cancelled = false;

    const runMetricsComputation = async () => {
      if (!Array.isArray(data) || data.length === 0) {
        setMetrics(computeMetricsInline([], selectedSites));
        return;
      }

      const LARGE_THRESHOLD = 50000;
      if (data.length < LARGE_THRESHOLD) {
        try {
          setMetrics(computeMetricsInline(data, selectedSites));
          return;
        } catch (error) {
          console.error('Error computing metrics inline, falling back to simplified metrics:', error);
          setMetrics({
            totalMeasurements: data.length,
            redoxRange: 'Computing...',
            avgRedox: 0,
            zonesDetected: 0,
            validMeasurements: data.length,
            dataCompleteness: 100,
            sitesCount: selectedSites.length,
            breakdown: { redoxRange: [], avgRedox: [] }
          });
          return;
        }
      }

      // Use worker for large datasets
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../workers/metricsWorker.js', import.meta.url), { type: 'module' });
      }
      const worker = workerRef.current;
      worker.onmessage = (e) => {
        if (cancelled) return;
        const { ok, result } = e.data || {};
        if (ok && result) setMetrics(result);
      };
      try {
        worker.postMessage({ cmd: 'computeMetrics', payload: { data, selectedSites } });
      } catch {
        // Fallback inline if worker post fails
        setMetrics(computeMetricsInline(data, selectedSites));
      }
    };

    runMetricsComputation();

    return () => { cancelled = true; };
  }, [data, selectedSitesKey, selectedSites]);

  return metrics;
}
