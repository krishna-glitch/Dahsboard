/**
 * TypeScript definitions for analytics and insights system
 * Provides type safety for advanced analytics components
 */

// Analytics configuration types
export interface AnalyticsConfig {
  timeRange: string;
  selectedSites: string[];
  selectedParameters: string[];
  analysisType: 'correlation' | 'trend' | 'anomaly' | 'forecast' | 'comprehensive';
  advancedOptions: {
    correlationMethod: 'pearson' | 'spearman' | 'kendall';
    trendMethod: 'linear' | 'polynomial' | 'seasonal';
    anomalyThreshold: number;
    forecastPeriods: number;
    confidenceLevel: number;
    includeSeasonality: boolean;
    detectOutliers: boolean;
    smoothData: boolean;
  };
}

// Correlation analysis types
export interface CorrelationResult {
  correlation_matrix: Record<string, Record<string, number>>;
  significant_correlations: CorrelationPair[];
  time_series_correlations?: Record<string, number[]>;
  lag_correlations?: Record<string, LagCorrelation>;
  metadata: AnalysisMetadata;
  insights: string[];
}

export interface CorrelationPair {
  parameter1: string;
  parameter2: string;
  correlation: number;
  p_value: number;
  significance: 'high' | 'medium' | 'low';
  interpretation: string;
}

export interface LagCorrelation {
  max_correlation: number;
  optimal_lag_hours: number;
  correlation_by_lag: Record<number, number>;
}

// Trend analysis types
export interface TrendResult {
  parameter: string;
  trend_summary: TrendSummary;
  seasonal_decomposition?: SeasonalDecomposition;
  forecast?: ForecastResult;
  change_points?: ChangePoint[];
  outliers?: OutlierPoint[];
  statistics: TrendStatistics;
  insights: string[];
  metadata: AnalysisMetadata;
}

export interface TrendSummary {
  trend_direction: 'Increasing' | 'Decreasing' | 'Stable';
  trend_strength: 'Strong' | 'Moderate' | 'Weak';
  trend_rate_per_day: number;
  r_squared: number;
  volatility: number;
  confidence_interval: [number, number];
}

export interface SeasonalDecomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
  timestamps: string[];
  seasonal_period: number;
  seasonal_strength: number;
}

export interface ForecastResult {
  forecasted_values: number[];
  confidence_intervals: {
    lower: number[];
    upper: number[];
  };
  forecast_timestamps: string[];
  model_performance: {
    mae: number;
    mape: number;
    rmse: number;
    model_type: string;
  };
}

export interface ChangePoint {
  timestamp: string;
  value: number;
  change_magnitude: number;
  change_type: 'increase' | 'decrease' | 'volatility';
  confidence: number;
}

export interface OutlierPoint {
  timestamp: string;
  value: number;
  z_score: number;
  outlier_type: 'high' | 'low' | 'contextual';
  replacement_value?: number;
}

export interface TrendStatistics {
  mean: number;
  median: number;
  std_dev: number;
  min_value: number;
  max_value: number;
  data_points: number;
  missing_points: number;
  autocorrelation: number;
  stationarity_test: {
    is_stationary: boolean;
    p_value: number;
    test_statistic: number;
  };
}

// Anomaly detection types
export interface AnomalyResult {
  parameter: string;
  anomalies: AnomalyPoint[];
  anomaly_summary: AnomalySummary;
  detection_config: AnomalyDetectionConfig;
  insights: string[];
  metadata: AnalysisMetadata;
}

export interface AnomalyPoint {
  timestamp: string;
  value: number;
  anomaly_score: number;
  anomaly_type: 'point' | 'contextual' | 'collective';
  severity: 'low' | 'medium' | 'high' | 'critical';
  explanation: string;
  related_parameters?: string[];
}

export interface AnomalySummary {
  total_anomalies: number;
  anomaly_rate: number;
  severity_distribution: Record<string, number>;
  type_distribution: Record<string, number>;
  most_anomalous_period: {
    start: string;
    end: string;
    anomaly_count: number;
  };
}

export interface AnomalyDetectionConfig {
  method: 'statistical' | 'isolation_forest' | 'local_outlier' | 'ensemble';
  threshold: number;
  window_size: number;
  sensitivity: number;
  seasonal_adjustment: boolean;
}

// Comprehensive analysis types
export interface ComprehensiveAnalysisResult {
  analysis_id: string;
  timestamp: string;
  site_analysis: Record<string, SiteAnalysis>;
  cross_site_analysis: CrossSiteAnalysis;
  temporal_analysis: TemporalAnalysis;
  environmental_insights: EnvironmentalInsight[];
  recommendations: Recommendation[];
  executive_summary: ExecutiveSummary;
  metadata: AnalysisMetadata;
}

export interface SiteAnalysis {
  site_id: string;
  parameter_analysis: Record<string, ParameterAnalysis>;
  site_health_score: number;
  risk_factors: RiskFactor[];
  trends: TrendResult[];
  anomalies: AnomalyResult[];
  correlations: CorrelationResult;
}

export interface CrossSiteAnalysis {
  site_comparisons: SiteComparison[];
  regional_patterns: RegionalPattern[];
  contamination_propagation: ContaminationAnalysis[];
  best_performing_sites: string[];
  sites_of_concern: string[];
}

export interface TemporalAnalysis {
  seasonal_patterns: SeasonalPattern[];
  daily_patterns: DailyPattern[];
  long_term_trends: LongTermTrend[];
  event_correlations: EventCorrelation[];
}

export interface ParameterAnalysis {
  parameter: string;
  current_status: 'normal' | 'warning' | 'critical';
  trend: TrendResult;
  anomalies: AnomalyPoint[];
  threshold_analysis: ThresholdAnalysis;
  forecast: ForecastResult;
}

export interface RiskFactor {
  factor: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affected_parameters: string[];
  mitigation_suggestions: string[];
}

export interface SiteComparison {
  site1: string;
  site2: string;
  similarity_score: number;
  differing_parameters: string[];
  performance_comparison: Record<string, 'better' | 'worse' | 'similar'>;
}

export interface RegionalPattern {
  pattern_type: 'upstream_downstream' | 'seasonal' | 'anthropogenic';
  affected_sites: string[];
  pattern_strength: number;
  description: string;
}

export interface ContaminationAnalysis {
  source_site: string;
  affected_sites: string[];
  contamination_parameter: string;
  propagation_time_hours: number;
  attenuation_rate: number;
  confidence: number;
}

export interface SeasonalPattern {
  parameter: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  pattern_strength: number;
  typical_range: [number, number];
  peak_timing: string;
}

export interface DailyPattern {
  parameter: string;
  peak_hours: number[];
  low_hours: number[];
  pattern_consistency: number;
  urban_influence: boolean;
}

export interface LongTermTrend {
  parameter: string;
  trend_direction: 'improving' | 'deteriorating' | 'stable';
  rate_of_change: number;
  projection_2030: number;
  confidence: number;
}

export interface EventCorrelation {
  event_type: 'precipitation' | 'temperature' | 'anthropogenic';
  correlated_parameters: string[];
  correlation_strength: number;
  lag_time_hours: number;
}

export interface ThresholdAnalysis {
  parameter: string;
  regulatory_threshold: number;
  current_value: number;
  threshold_exceedances: ThresholdExceedance[];
  compliance_status: 'compliant' | 'warning' | 'violation';
  margin_of_safety: number;
}

export interface ThresholdExceedance {
  timestamp: string;
  value: number;
  severity: 'minor' | 'moderate' | 'severe';
  duration_hours: number;
}

export interface EnvironmentalInsight {
  insight_type: 'water_quality' | 'ecosystem_health' | 'human_health' | 'regulatory';
  title: string;
  description: string;
  evidence: string[];
  confidence_level: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  affected_stakeholders: string[];
}

export interface Recommendation {
  recommendation_id: string;
  category: 'monitoring' | 'treatment' | 'investigation' | 'policy';
  title: string;
  description: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_cost: 'low' | 'medium' | 'high';
  implementation_timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  success_metrics: string[];
  responsible_parties: string[];
}

export interface ExecutiveSummary {
  overall_water_quality_status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  key_findings: string[];
  critical_issues: string[];
  trending_concerns: string[];
  improvement_areas: string[];
  compliance_status: string;
  budget_implications: string[];
}

// Common metadata type
export interface AnalysisMetadata {
  analysis_timestamp: string;
  data_range: {
    start: string;
    end: string;
  };
  sites_analyzed: string[];
  parameters_analyzed: string[];
  data_points: number;
  missing_data_percentage: number;
  analysis_duration_seconds: number;
  software_version: string;
  configuration: Record<string, any>;
}

// Form types for analytics controls
export interface AnalyticsFormData {
  analysisType: 'correlation' | 'trend' | 'anomaly' | 'forecast' | 'comprehensive';
  timeRange: string;
  customStartDate?: string;
  customEndDate?: string;
  selectedSites: string[];
  selectedParameters: string[];
  correlationMethod: 'pearson' | 'spearman' | 'kendall';
  trendMethod: 'linear' | 'polynomial' | 'seasonal';
  anomalyThreshold: number;
  forecastPeriods: number;
  confidenceLevel: number;
  includeSeasonality: boolean;
  detectOutliers: boolean;
  smoothData: boolean;
  generateReport: boolean;
  exportResults: boolean;
}

// Component props types
export interface AnalyticsDashboardProps {
  onAnalysisComplete?: (results: ComprehensiveAnalysisResult) => void;
  onError?: (error: string) => void;
  initialConfig?: Partial<AnalyticsConfig>;
}

export interface AnalyticsControlPanelProps {
  onConfigChange: (config: AnalyticsConfig) => void;
  onRunAnalysis: (config: AnalyticsConfig) => Promise<void>;
  loading?: boolean;
  availableSites: string[];
  availableParameters: string[];
  initialConfig?: Partial<AnalyticsConfig>;
}

export interface AnalyticsResultsProps {
  results: ComprehensiveAnalysisResult | null;
  loading: boolean;
  error?: string;
  onExport?: (format: 'pdf' | 'excel' | 'json') => void;
  onShare?: () => void;
}