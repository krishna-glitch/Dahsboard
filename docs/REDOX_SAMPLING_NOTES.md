Redox Sampling Rules and Endpoint Changes

Summary
- Time range must be 1 year or less (≤ 366 days). Requests exceeding this return:
  "The record limit is too high. Please reduce the time range to 1 year or less."
- Exactly 6 depths are supported: 10, 30, 50, 100, 150, 200 (cm). No other depths are allowed.
- Cadence options:
  - Max Fidelity (ON) = High Cadence = 96 records/day/depth/site (15min).
  - Max Fidelity (OFF) = Standard Cadence = 12 records/day/depth/site (2 hours).
- No additional sampling, aggregation, or downsampling is performed beyond selecting one of the two cadences.
- Hard cap: 4 × 6 × 4 × 24 × 365 = 840,960 points. Results are clipped at this cap.
- Record-limit precheck: if the computed total would exceed 1,000,000, the request is rejected with the error above.

Endpoints
- Kept: /api/v1/redox_analysis/processed/time_series
  - Implements the strict depth and cadence rules above.
  - Pagination is used with a default chunk size of 100,000.
  - Supports JSON, columnar JSON, and Arrow IPC (binary) with gzip/brotli compression handled by Flask.

- Removed: /api/v1/redox_analysis/data (legacy)
  - This endpoint previously contained extra logic: intelligent downsampling, adaptive resolution, depth tolerance snapping, etc.
  - It has been removed to enforce a single, unambiguous sampling model.

Rollback Instructions
1) Restore the legacy endpoint by reverting the backup file:
   - Move or copy flask/api/redox_analysis.py.bak over flask/api/redox_analysis.py
2) Restart the Flask server.
3) Revert frontend calls if needed: react/frontend/src/services/api.js.bak back to api.js to use the legacy route directly.

Notes
- Frontend callers should prefer Arrow format for large transfers and rely on pagination at chunk size 100,000.
- The Max Fidelity toggle maps directly to 96/day; when OFF, cadence is 12/day.
- Visualization: For large datasets (>10k points), the Redox Time Series view uses a deck.gl-powered scatter for instanced WebGL rendering and frustum culling. If deck.gl is not installed, it automatically falls back to the existing Plotly charts.
