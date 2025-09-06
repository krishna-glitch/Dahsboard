/**
 * Simplified Optimized Store for Performance Testing
 * Uses basic Zustand patterns without immer
 */

import { createWithEqualityFn } from 'zustand/traditional';

// Simple optimized store
export const useOptimizedStore = createWithEqualityFn((set, get) => ({
  // State
  selectedSites: [],
  filters: {},
  data: null,
  loading: false,
  error: null,

  // Actions
  actions: {
    setSelectedSites: (sites) => set({ selectedSites: sites }),
    toggleSiteSelection: (siteCode) => set((state) => ({
      selectedSites: state.selectedSites.includes(siteCode)
        ? state.selectedSites.filter(s => s !== siteCode)
        : [...state.selectedSites, siteCode]
    })),
    updateFilter: (key, value) => set((state) => ({
      filters: { ...state.filters, [key]: value }
    })),
    updateData: (data) => set({ data }),
    setLoadingState: (isLoading) => set({ loading: isLoading }),
    setErrorState: (error) => set({ error }),
    getOptimizedData: () => {
      const state = get();
      return state.data || [];
    }
  }
}), Object.is);

// Simple selectors
export const useSelectedSites = () => useOptimizedStore(state => state.selectedSites);
export const useFilters = () => useOptimizedStore(state => state.filters);
export const useOptimizedData = () => {
  return useOptimizedStore(state => state.data || []);
};