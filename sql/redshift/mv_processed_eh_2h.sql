-- Materialized view for 2-hour cadence redox data (12 records/day) per depth per site
-- Purpose: serve max_fidelity=off requests efficiently and consistently

-- Adjust schema/owner according to your environment
-- Note: Some Redshift clusters don't support IF NOT EXISTS here.
-- Run this drop first if needed:
--   DROP MATERIALIZED VIEW IF EXISTS impact.mv_processed_eh_2h;

CREATE MATERIALIZED VIEW impact.mv_processed_eh_2h
AS
SELECT
  mv.site_id,
  -- 2-hour bucket start
  -- 2-hour bucket without EXTRACT/DATEPART to allow incremental MV (subject to other constraints)
  dateadd(
    hour,
    2 * (datediff(hour, timestamp '1970-01-01 00:00:00', mv.measurement_timestamp) / 2),
    timestamp '1970-01-01 00:00:00'
  ) AS bucket_ts,
  mv.depth_cm,
  AVG(mv.processed_eh) AS processed_eh
FROM impact.mv_processed_eh mv
GROUP BY 1, 2, 3;

-- Optional: grant access
-- GRANT SELECT ON impact.mv_processed_eh_2h TO GROUP analytics_ro;

-- Refresh strategy: schedule regular refreshes (hourly/daily) via your orchestration
-- Example: REFRESH MATERIALIZED VIEW impact.mv_processed_eh_2h;
