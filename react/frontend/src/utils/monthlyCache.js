/**
 * Monthly Cache System for Water Quality Data
 * Enables incremental caching where large date ranges are split into monthly chunks
 * This allows overlapping queries to reuse cached months for instant loading
 */

// Generate month keys from date range
export function getMonthsInRange(startDate, endDate) {
  const months = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Start from beginning of start month
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key: monthKey,
      start: new Date(current),
      end: new Date(current.getFullYear(), current.getMonth() + 1, 0) // Last day of month
    });

    // Move to next month
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

// Generate cache key for a specific month and site
export function generateMonthlyCacheKey(site, monthKey, filters = {}) {
  const filterKey = Object.keys(filters)
    .sort()
    .map(key => `${key}:${filters[key]}`)
    .join('|');

  return `wq_month_${site}_${monthKey}_${filterKey}`;
}

// Check which months are available in cache
export function checkCachedMonths(months, site, filters = {}, cache) {
  const result = {
    cached: [],
    missing: [],
    data: []
  };

  for (const month of months) {
    const cacheKey = generateMonthlyCacheKey(site, month.key, filters);
    const cached = cache.get(cacheKey);

    if (cached && cached.data && cached.timestamp && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      result.cached.push(month);
      result.data = result.data.concat(cached.data);
    } else {
      result.missing.push(month);
    }
  }

  return result;
}

// Filter cached data to exact date range
export function filterDataToDateRange(data, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return data.filter(row => {
    if (!row.measurement_timestamp) return false;
    const timestamp = new Date(row.measurement_timestamp);
    return timestamp >= start && timestamp <= end;
  });
}

// Store data in monthly chunks
export function storeMonthlyCachedData(data, site, filters = {}, cache) {
  // Group data by month
  const monthlyData = {};

  for (const row of data) {
    if (!row.measurement_timestamp) continue;

    const date = new Date(row.measurement_timestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = [];
    }
    monthlyData[monthKey].push(row);
  }

  // Store each month separately
  for (const [monthKey, monthData] of Object.entries(monthlyData)) {
    const cacheKey = generateMonthlyCacheKey(site, monthKey, filters);
    cache.set(cacheKey, {
      data: monthData,
      timestamp: Date.now(),
      monthKey,
      site,
      count: monthData.length
    });
  }

  return Object.keys(monthlyData).length; // Return number of months cached
}

// Calculate cache hit ratio
export function calculateCacheStats(months, site, filters = {}, cache) {
  let totalMonths = months.length;
  let cachedMonths = 0;
  let totalRows = 0;
  let cachedRows = 0;

  for (const month of months) {
    const cacheKey = generateMonthlyCacheKey(site, month.key, filters);
    const cached = cache.get(cacheKey);

    if (cached && cached.data && cached.timestamp && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      cachedMonths++;
      cachedRows += cached.count || cached.data.length;
    }
  }

  return {
    totalMonths,
    cachedMonths,
    monthHitRatio: totalMonths > 0 ? cachedMonths / totalMonths : 0,
    estimatedSpeedup: cachedMonths > 0 ? `${Math.round(cachedMonths / totalMonths * 100)}% cached` : 'No cache'
  };
}