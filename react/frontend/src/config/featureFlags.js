// Centralized feature flags for incremental rollouts.
// Keep defaults conservative. Toggle per-environment via Vite env if needed.

export const featureFlags = {
  // Phase 1: Client cache control for Water Quality hook
  wqCacheEnabled: true,

  // Optional: prefetch hooks on nav hover (disabled by default)
  prefetchOnHover: false,

  // If enabling prefetch later, use a small chunk to avoid heavy work
  prefetchWQChunkSize: 20000,
};

