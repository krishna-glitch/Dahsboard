import { createWithEqualityFn } from 'zustand/traditional';

// Lightweight global store for redox analysis filters/state
export const useRedoxStore = createWithEqualityFn((set) => ({
  // Filters and view state
  selectedSites: ['S1', 'S2'],
  timeRange: 'Last 30 Days',
  startDate: '',
  endDate: '',
  // Default to raw cadence (no downsampling)
  maxFidelity: true,
  selectedView: 'timeseries', // timeseries | snapshot | rolling | details
  filtersCollapsed: false,
  // Chart inversion toggles and allowances
  invertY1: true,
  invertY2: false,
  invertX: false,
  invertY: true,
  invertRollingY: false,
  invertSeriesY: false,
  allowedInversions: { y1: true, y2: true, x: true, y: true },

  // Actions
  setSelectedSites: (sites) => set({ selectedSites: Array.isArray(sites) ? sites : [] }),
  setTimeRange: (range) => set({ timeRange: range }),
  setStartDate: (d) => set({ startDate: d || '' }),
  setEndDate: (d) => set({ endDate: d || '' }),
  setMaxFidelity: (updater) => set((state) => ({ maxFidelity: typeof updater === 'function' ? updater(state.maxFidelity) : !!updater })),
  setSelectedView: (view) => set({ selectedView: view }),
  toggleFiltersCollapsed: () => set((s) => ({ filtersCollapsed: !s.filtersCollapsed })),
  setFiltersCollapsed: (v) => set({ filtersCollapsed: !!v }),
  setAllowedInversions: (obj) => set({ allowedInversions: obj || { y1: true, y2: true, x: true, y: true } }),
  setInvertY1: (vOrFn) => set((s) => ({ invertY1: typeof vOrFn === 'function' ? vOrFn(s.invertY1) : !!vOrFn })),
  setInvertY2: (vOrFn) => set((s) => ({ invertY2: typeof vOrFn === 'function' ? vOrFn(s.invertY2) : !!vOrFn })),
  setInvertX: (vOrFn) => set((s) => ({ invertX: typeof vOrFn === 'function' ? vOrFn(s.invertX) : !!vOrFn })),
  setInvertY: (vOrFn) => set((s) => ({ invertY: typeof vOrFn === 'function' ? vOrFn(s.invertY) : !!vOrFn })),
  setInvertRollingY: (vOrFn) => set((s) => ({ invertRollingY: typeof vOrFn === 'function' ? vOrFn(s.invertRollingY) : !!vOrFn })),
  setInvertSeriesY: (vOrFn) => set((s) => ({ invertSeriesY: typeof vOrFn === 'function' ? vOrFn(s.invertSeriesY) : !!vOrFn })),
}), Object.is);
