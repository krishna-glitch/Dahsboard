import { useMemo } from 'react';

/**
 * Custom hook for water quality metrics calculations
 * Extracted from ModernWaterQuality.jsx to improve performance and maintainability
 */
export const useWaterQualityMetrics = (data) => {
  return useMemo(() => {
    if (!data?.length) {
      return {
        totalRecords: 0,
        sitesCount: 0,
        perSiteAvgTemperature: 0,
        perSiteAvgConductivity: 0,
        perSiteAvgWaterLevel: 0,
        completeness: 0,
        breakdown: { t: [], c: [], w: [] }
      };
    }

    const bySite = new Map();
    for (const row of data) {
      if (!row || !row.site_code) continue;
      if (!bySite.has(row.site_code)) bySite.set(row.site_code, { t: [], c: [], w: [] });
      const b = bySite.get(row.site_code);
      if (row.temperature_c != null) b.t.push(Number(row.temperature_c));
      if (row.conductivity_us_cm != null) b.c.push(Number(row.conductivity_us_cm));
      if (row.water_level_m != null) b.w.push(Number(row.water_level_m));
    }

    const siteMeans = { t: [], c: [], w: [], breakdown: { t: [], c: [], w: [] } };
    for (const [site, vals] of bySite.entries()) {
      if (vals.t.length) {
        const m = vals.t.reduce((a, v) => a + v, 0) / vals.t.length;
        siteMeans.t.push(m);
        siteMeans.breakdown.t.push({ site, mean: m });
      }
      if (vals.c.length) {
        const m = vals.c.reduce((a, v) => a + v, 0) / vals.c.length;
        siteMeans.c.push(m);
        siteMeans.breakdown.c.push({ site, mean: m });
      }
      if (vals.w.length) {
        const m = vals.w.reduce((a, v) => a + v, 0) / vals.w.length;
        siteMeans.w.push(m);
        siteMeans.breakdown.w.push({ site, mean: m });
      }
    }

    const mean = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : 0;
    const nonNullCounts = { t: 0, c: 0, w: 0 };
    for (const row of data) {
      if (row.temperature_c != null) nonNullCounts.t++;
      if (row.conductivity_us_cm != null) nonNullCounts.c++;
      if (row.water_level_m != null) nonNullCounts.w++;
    }
    const completeness = Math.round(((nonNullCounts.t + nonNullCounts.c + nonNullCounts.w) / (data.length * 3)) * 100);

    return {
      totalRecords: data.length,
      sitesCount: bySite.size,
      perSiteAvgTemperature: mean(siteMeans.t),
      perSiteAvgConductivity: mean(siteMeans.c),
      perSiteAvgWaterLevel: mean(siteMeans.w),
      completeness,
      breakdown: siteMeans.breakdown
    };
  }, [data]);
};

export default useWaterQualityMetrics;