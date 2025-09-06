/**
 * Convert columnar API payload into row objects for plotting.
 * @param {Object} col - { measurement_timestamp?: any[], processed_eh?: any[], depth_cm?: any[], site_code?: any[] }
 * @param {string} fallbackSite
 * @returns {Array<Object>}
 */
export function columnarToRows(col, fallbackSite) {
  const n = (col.measurement_timestamp || col.processed_eh || []).length;
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      measurement_timestamp: col.measurement_timestamp ? col.measurement_timestamp[i] : undefined,
      processed_eh: col.processed_eh ? col.processed_eh[i] : undefined,
      depth_cm: col.depth_cm ? col.depth_cm[i] : undefined,
      site_code: (col.site_code ? (col.site_code[i] || fallbackSite) : fallbackSite)
    };
  }
  return rows;
}

