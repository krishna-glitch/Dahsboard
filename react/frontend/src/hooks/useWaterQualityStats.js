import { useMemo } from 'react';
import { WATER_QUALITY_PARAMETERS } from '../constants/appConstants';

const PARAMETER_KEYS = WATER_QUALITY_PARAMETERS.map((param) => param.value);

const computeStatsFromValues = (values = [], totalCount = 0) => {
  const count = values.length;
  const missing = Math.max(totalCount - count, 0);
  if (count === 0) {
    return {
      count: 0,
      missing,
      min: null,
      max: null,
      mean: null,
      median: null,
      stdDev: null,
    };
  }

  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < count; i += 1) {
    const val = values[i];
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
  }

  const mean = sum / count;

  let sumSquaredDiff = 0;
  for (let i = 0; i < count; i += 1) {
    const diff = values[i] - mean;
    sumSquaredDiff += diff * diff;
  }
  const variance = count > 1 ? sumSquaredDiff / (count - 1) : 0;
  const stdDev = Math.sqrt(variance);

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    count,
    missing,
    min,
    max,
    mean,
    median,
    stdDev,
  };
};

const useWaterQualityStats = (rows = []) =>
  useMemo(() => {
    const totalsByParam = new Map();
    const perSiteValues = new Map();
    const rowsPerSite = new Map();

    PARAMETER_KEYS.forEach((param) => {
      totalsByParam.set(param, []);
      perSiteValues.set(param, new Map());
    });

    const totalRowCount = rows.length;

    rows.forEach((row) => {
      if (!row) return;
      const site = row.site_code || 'Unknown';
      rowsPerSite.set(site, (rowsPerSite.get(site) || 0) + 1);

      PARAMETER_KEYS.forEach((param) => {
        const value = row[param];
        if (value == null || Number.isNaN(Number(value))) return;
        const numeric = Number(value);

        totalsByParam.get(param).push(numeric);

        const siteMap = perSiteValues.get(param);
        if (!siteMap.has(site)) siteMap.set(site, []);
        siteMap.get(site).push(numeric);
      });
    });

    const globalStats = {};
    const perSiteStats = {};

    PARAMETER_KEYS.forEach((param) => {
      const values = totalsByParam.get(param);
      globalStats[param] = computeStatsFromValues(values, totalRowCount);

      const siteMap = perSiteValues.get(param);
      perSiteStats[param] = {};

      rowsPerSite.forEach((totalCount, site) => {
        const siteValues = siteMap.get(site) || [];
        perSiteStats[param][site] = computeStatsFromValues(
          siteValues,
          totalCount,
        );
      });
    });

    return {
      global: globalStats,
      perSite: perSiteStats,
      parameterKeys: PARAMETER_KEYS,
      totalRowCount,
    };
  }, [rows]);

export default useWaterQualityStats;
