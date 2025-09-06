/**
 * Compute inclusive ISO window for a preset range bounded by earliest/latest dates.
 * @param {string} earliest - 'YYYY-MM-DD'
 * @param {string} latest - 'YYYY-MM-DD'
 * @param {string} timeRange - e.g., 'Last 7 Days'
 * @returns {{ startIso: string, endIso: string }}
 */
export function computePresetWindow(earliest, latest, timeRange) {
  const daysMap = {
    'Last 7 Days': 7,
    'Last 30 Days': 30,
    'Last 90 Days': 90,
    'Last 6 Months': 180,
    'Last 1 Year': 365,
    'Last 2 Years': 730
  };
  const latestEnd = new Date(`${latest}T23:59:59Z`);
  const presetDays = daysMap[timeRange];
  if (presetDays) {
    const startDayUtc = new Date(Date.UTC(
      latestEnd.getUTCFullYear(),
      latestEnd.getUTCMonth(),
      latestEnd.getUTCDate() - (presetDays - 1),
      0, 0, 0, 0
    ));
    const earliestBound = new Date(`${earliest}T00:00:00Z`);
    const boundedStart = startDayUtc < earliestBound ? earliestBound : startDayUtc;
    return { startIso: boundedStart.toISOString(), endIso: latestEnd.toISOString() };
  }
  // Fallback to full available range
  return { startIso: `${earliest}T00:00:00Z`, endIso: `${latest}T23:59:59Z` };
}

