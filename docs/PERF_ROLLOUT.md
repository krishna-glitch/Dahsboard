Performance Rollout Plan and Feature Flags

Scope: Client-side improvements only (Phase 1). No backend changes required.

Feature Flags (react/frontend/src/config/featureFlags.js)
- wqCacheEnabled: Toggle Water Quality hook localStorage cache (default: true).
- prefetchOnHover: Reserved for Phase 2 route-hover prefetch (default: false).
- prefetchWQChunkSize: Reserved chunk size for prefetch (default: 20000).

Water Quality Hook Behavior
- Reads cached per-site, per-range results when available and fresh.
- Writes results by site on successful fetch when cache is enabled.
- Exposes meta.cache { enabled, hit, ttlMs } for diagnostics.

Rollout/Validation
1) Enable in dev only (default ON). Use the meta.cache.hit in the UI console to observe hits.
2) Navigate between Water Quality views and back to confirm warm loads.
3) Toggle wqCacheEnabled to verify no functional change when OFF.

Safety
- Cache is bounded by size and TTL; stale entries are ignored.
- No impact to auth/admin paths. Read-only data only.

Next Phases (optional)
- Phase 2: Enable route-hover prefetch using prefetchOnHover.
- Phase 3: Add ETag/Cache-Control server headers (low risk, backend).

