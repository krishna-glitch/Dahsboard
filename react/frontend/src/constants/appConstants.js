// Application-wide constants - Single Source of Truth

// Site Configuration
export const AVAILABLE_SITES = [
  { value: 'S1', label: 'Site S1', id: 'S1' },
  { value: 'S2', label: 'Site S2', id: 'S2' },
  { value: 'S3', label: 'Site S3', id: 'S3' },
  { value: 'S4', label: 'Site S4', id: 'S4' }
];

export const DEFAULT_SELECTED_SITES = ['S1', 'S2', 'S3', 'S4'];

// Time Range Configuration
export const TIME_RANGE_OPTIONS = [
  'Custom Range',
  'Last 7 Days',
  'Last 30 Days',
  'Last 90 Days',
  'Last 6 Months',
  'Last 1 Year',
  'Last 2 Years'
];

// Performance Tier Configuration
export const PERFORMANCE_TIERS = {
  fast: { 
    label: '🚀 Fast', 
    maxPoints: 2000, 
    description: 'Optimized for speed and responsiveness' 
  },
  balanced: { 
    label: '⚖️ Balanced', 
    maxPoints: 5000, 
    description: 'Good balance of detail and performance' 
  },
  high_detail: { 
    label: '🔍 High Detail', 
    maxPoints: 10000, 
    description: 'Maximum detail, may be slower on older devices' 
  },
  maximum: { 
    label: '💎 Maximum', 
    maxPoints: null, 
    description: 'Plot all available data points - highest fidelity' 
  }
};

// Resolution Configuration
export const RESOLUTION_OPTIONS = [
  { value: 'auto', label: 'Auto-detect optimal resolution' },
  { value: '15min', label: 'Raw data (15-minute intervals)' },
  { value: '1H', label: 'Hourly aggregation' },
  { value: '1D', label: 'Daily aggregation' },
  { value: '1W', label: 'Weekly aggregation' },
  { value: '1M', label: 'Monthly aggregation' }
];

// Chart Type Configuration
export const CHART_TYPES = [
  { value: 'line', label: 'Line Chart', icon: 'bi-graph-up' },
  { value: 'scatter', label: 'Scatter Plot', icon: 'bi-dot' },
  { value: 'histogram', label: 'Histogram', icon: 'bi-bar-chart-line' },
  { value: 'bar', label: 'Bar Chart', icon: 'bi-bar-chart-fill' },
  { value: 'pie', label: 'Pie Chart', icon: 'bi-pie-chart-fill' }
];

// Data Type Configuration (for Site Comparison)
export const DATA_TYPES = [
  { value: 'both', label: 'Both (WQ + Redox)' },
  { value: 'water_quality', label: 'Water Quality Only' },
  { value: 'redox', label: 'Redox Only' }
];

// Water Quality Parameter Configuration
export const WATER_QUALITY_PARAMETERS = [
  { value: 'water_level_m', label: 'Water Level (m)', unit: 'm' },
  { value: 'temperature_c', label: 'Temperature (°C)', unit: '°C' },
  { value: 'conductivity_us_cm', label: 'Conductivity (μS/cm)', unit: 'μS/cm' }
];

// Redox Parameter Configuration
export const REDOX_PARAMETERS = [
  { value: 'redox_potential_mv', label: 'Redox Potential (mV)', unit: 'mV' },
  { value: 'depth_m', label: 'Depth (m)', unit: 'm' }
];

// Combined Parameters (for Site Comparison)
export const ALL_PARAMETERS = [
  ...WATER_QUALITY_PARAMETERS,
  ...REDOX_PARAMETERS.filter(param => !WATER_QUALITY_PARAMETERS.find(wq => wq.value === param.value))
];

// Site Color Mapping - High contrast colors for better distinction
export const SITE_COLORS = {
  'S1': '#2E86AB', // Ocean Blue
  'S2': '#A23B72', // Deep Magenta  
  'S3': '#F18F01', // Bright Orange
  'S4': '#C73E1D', // Crimson Red
  'S5': '#592E83', // Royal Purple
  'S6': '#1B5E20', // Forest Green
  'Unknown': '#616161' // Medium Gray
};

// Depth Color Mapping for Redox Analysis - Distinct colors for depth levels
export const DEPTH_COLORS = {
  '10': '#FF6B35',   // Bright Orange-Red
  '30': '#2E86AB',   // Ocean Blue  
  '50': '#A23B72',   // Deep Magenta
  '100': '#F18F01',  // Golden Orange
  '150': '#592E83',  // Royal Purple
  '200': '#1B5E20'   // Forest Green
};

// Metric Thresholds (for status/tooltip and bands)
// Keep conservative, configurable defaults; refine via backend config later
export const METRIC_THRESHOLDS = {
  temperature: {
    unit: '°C',
    good: [15, 25],
    warning: [10, 30]
  },
  conductivity: {
    unit: 'µS/cm',
    // Example ranges; adjust per domain guidance if provided
    good: [0, 500],
    warning: [500, 1500]
  }
};
