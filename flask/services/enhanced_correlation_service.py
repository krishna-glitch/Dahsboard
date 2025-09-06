"""
Enhanced Correlation Analysis Service
Provides advanced correlation analysis with time-windowed correlations,
lag analysis, and cross-parameter insights for water quality data.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
from dataclasses import dataclass
import logging
from scipy import stats
from scipy.signal import savgol_filter

from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

@dataclass
class CorrelationConfig:
    """Configuration for correlation analysis"""
    method: str = 'pearson'  # pearson, spearman, kendall
    min_periods: int = 10  # Minimum data points required
    window_size_hours: Optional[int] = None  # For rolling correlations
    max_lag_hours: int = 24  # Maximum lag for cross-correlation
    significance_threshold: float = 0.05  # P-value threshold
    correlation_threshold: float = 0.3  # Minimum correlation strength
    smooth_data: bool = True  # Apply smoothing filter

@dataclass
class CorrelationResult:
    """Result container for correlation analysis"""
    correlation_matrix: pd.DataFrame
    significant_correlations: List[Dict[str, Any]]
    time_series_correlations: Optional[pd.DataFrame] = None
    lag_correlations: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = None
    insights: List[str] = None

class EnhancedCorrelationService:
    """Advanced correlation analysis service for water quality monitoring"""
    
    def __init__(self):
        self.logger = logger
        
    def analyze_correlations(self, 
                           df: pd.DataFrame, 
                           config: CorrelationConfig,
                           parameters: Optional[List[str]] = None) -> CorrelationResult:
        """
        Perform comprehensive correlation analysis
        
        Args:
            df: DataFrame with timestamp and parameter columns
            config: Correlation analysis configuration
            parameters: List of parameters to analyze (if None, auto-detect numeric)
            
        Returns:
            CorrelationResult with comprehensive analysis
        """
        try:
            self.logger.info("🔍 Starting enhanced correlation analysis")
            
            # Prepare data
            processed_df = self._prepare_data(df, parameters, config)
            if processed_df.empty:
                raise ValueError("No valid data for correlation analysis")
                
            # Basic correlation matrix
            correlation_matrix = self._calculate_correlation_matrix(processed_df, config)
            
            # Find significant correlations
            significant_correlations = self._find_significant_correlations(
                correlation_matrix, processed_df, config
            )
            
            # Time-windowed correlations (if requested)
            time_series_correlations = None
            if config.window_size_hours:
                time_series_correlations = self._calculate_rolling_correlations(
                    processed_df, config
                )
            
            # Lag correlation analysis
            lag_correlations = self._analyze_lag_correlations(processed_df, config)
            
            # Generate insights
            insights = self._generate_correlation_insights(
                correlation_matrix, significant_correlations, processed_df
            )
            
            # Compile metadata
            metadata = {
                'analysis_timestamp': datetime.now().isoformat(),
                'parameters_analyzed': list(processed_df.select_dtypes(include=[np.number]).columns),
                'data_points': len(processed_df),
                'date_range': {
                    'start': processed_df['measurement_timestamp'].min().isoformat(),
                    'end': processed_df['measurement_timestamp'].max().isoformat()
                },
                'configuration': {
                    'method': config.method,
                    'min_periods': config.min_periods,
                    'significance_threshold': config.significance_threshold,
                    'correlation_threshold': config.correlation_threshold,
                    'smoothing_applied': config.smooth_data
                }
            }
            
            result = CorrelationResult(
                correlation_matrix=correlation_matrix,
                significant_correlations=significant_correlations,
                time_series_correlations=time_series_correlations,
                lag_correlations=lag_correlations,
                metadata=metadata,
                insights=insights
            )
            
            self.logger.info(f"✅ Correlation analysis completed: {len(significant_correlations)} significant correlations found")
            return result
            
        except Exception as e:
            self.logger.error(f"❌ Error in correlation analysis: {e}", exc_info=True)
            raise
    
    def _prepare_data(self, df: pd.DataFrame, 
                     parameters: Optional[List[str]], 
                     config: CorrelationConfig) -> pd.DataFrame:
        """Prepare and clean data for correlation analysis"""
        
        # Ensure timestamp column
        if 'measurement_timestamp' not in df.columns:
            raise ValueError("DataFrame must contain 'measurement_timestamp' column")
            
        # Convert timestamp
        df = df.copy()
        df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'])
        
        # Select numeric parameters
        if parameters is None:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            # Remove any ID or timestamp numeric columns
            numeric_cols = [col for col in numeric_cols if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]
        else:
            numeric_cols = [p for p in parameters if p in df.columns 
                          and pd.api.types.is_numeric_dtype(df[p])]
        
        if len(numeric_cols) < 2:
            raise ValueError(f"Need at least 2 numeric parameters, found: {len(numeric_cols)}")
        
        # Keep timestamp + numeric parameters
        analysis_cols = ['measurement_timestamp'] + numeric_cols
        processed_df = df[analysis_cols].copy()
        
        # Remove rows with excessive missing values
        threshold = len(numeric_cols) * 0.7  # At least 70% of parameters must be present
        processed_df = processed_df.dropna(thresh=int(threshold) + 1)  # +1 for timestamp
        
        # Apply smoothing if requested
        if config.smooth_data:
            processed_df = self._apply_smoothing(processed_df, numeric_cols)
        
        return processed_df.sort_values('measurement_timestamp')
    
    def _apply_smoothing(self, df: pd.DataFrame, numeric_cols: List[str]) -> pd.DataFrame:
        """Apply Savitzky-Golay filter for noise reduction"""
        
        for col in numeric_cols:
            if df[col].notna().sum() > 10:  # Need sufficient data points
                try:
                    # Apply Savitzky-Golay filter with window of 5 and polynomial order 2
                    valid_data = df[col].dropna()
                    if len(valid_data) >= 5:
                        smoothed = savgol_filter(valid_data, 5, 2)
                        df.loc[valid_data.index, col] = smoothed
                except Exception as e:
                    self.logger.warning(f"Could not smooth {col}: {e}")
                    
        return df
    
    def _calculate_correlation_matrix(self, df: pd.DataFrame, 
                                    config: CorrelationConfig) -> pd.DataFrame:
        """Calculate correlation matrix with specified method"""
        
        numeric_df = df.select_dtypes(include=[np.number])
        return numeric_df.corr(method=config.method, min_periods=config.min_periods)
    
    def _find_significant_correlations(self, correlation_matrix: pd.DataFrame,
                                     df: pd.DataFrame,
                                     config: CorrelationConfig) -> List[Dict[str, Any]]:
        """Find statistically significant correlations above threshold"""
        
        significant_correlations = []
        
        for i in range(len(correlation_matrix.columns)):
            for j in range(i+1, len(correlation_matrix.columns)):
                param1 = correlation_matrix.columns[i]
                param2 = correlation_matrix.columns[j]
                corr_value = correlation_matrix.iloc[i, j]
                
                if np.isnan(corr_value) or abs(corr_value) < config.correlation_threshold:
                    continue
                
                # Calculate p-value and confidence intervals
                try:
                    clean_data = df[[param1, param2]].dropna()
                    if len(clean_data) < config.min_periods:
                        continue
                        
                    if config.method == 'pearson':
                        stat_corr, p_value = stats.pearsonr(clean_data[param1], clean_data[param2])
                    elif config.method == 'spearman':
                        stat_corr, p_value = stats.spearmanr(clean_data[param1], clean_data[param2])
                    else:  # kendall
                        stat_corr, p_value = stats.kendalltau(clean_data[param1], clean_data[param2])
                    
                    if p_value <= config.significance_threshold:
                        # Calculate confidence interval (approximate for non-Pearson)
                        ci_lower, ci_upper = self._calculate_confidence_interval(
                            stat_corr, len(clean_data)
                        )
                        
                        significant_correlations.append({
                            'parameter1': param1,
                            'parameter2': param2,
                            'correlation': float(corr_value),
                            'p_value': float(p_value),
                            'sample_size': len(clean_data),
                            'confidence_interval': {
                                'lower': float(ci_lower),
                                'upper': float(ci_upper)
                            },
                            'strength': self._categorize_correlation_strength(abs(corr_value)),
                            'direction': 'Positive' if corr_value > 0 else 'Negative',
                            'significance': 'Highly Significant' if p_value < 0.001 else 'Significant'
                        })
                        
                except Exception as e:
                    self.logger.warning(f"Could not calculate significance for {param1} vs {param2}: {e}")
        
        # Sort by absolute correlation strength
        significant_correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)
        return significant_correlations
    
    def _calculate_rolling_correlations(self, df: pd.DataFrame,
                                      config: CorrelationConfig) -> pd.DataFrame:
        """Calculate rolling correlations over time windows"""
        
        numeric_df = df.select_dtypes(include=[np.number])
        timestamp_col = df['measurement_timestamp']
        
        # Create time-based rolling window
        window_td = timedelta(hours=config.window_size_hours)
        
        rolling_correlations = []
        
        # Get unique parameter pairs
        params = numeric_df.columns.tolist()
        param_pairs = [(params[i], params[j]) for i in range(len(params)) 
                      for j in range(i+1, len(params))]
        
        # Calculate rolling correlations for each time window
        start_time = timestamp_col.min()
        end_time = timestamp_col.max()
        current_time = start_time
        
        while current_time <= end_time:
            window_end = current_time + window_td
            window_mask = (timestamp_col >= current_time) & (timestamp_col < window_end)
            window_data = numeric_df[window_mask]
            
            if len(window_data) >= config.min_periods:
                window_corr = window_data.corr(method=config.method)
                
                for param1, param2 in param_pairs:
                    corr_value = window_corr.loc[param1, param2]
                    if not np.isnan(corr_value):
                        rolling_correlations.append({
                            'timestamp': current_time,
                            'parameter1': param1,
                            'parameter2': param2,
                            'correlation': corr_value,
                            'sample_size': len(window_data)
                        })
            
            # Move to next window (50% overlap)
            current_time += timedelta(hours=config.window_size_hours // 2)
        
        return pd.DataFrame(rolling_correlations)
    
    def _analyze_lag_correlations(self, df: pd.DataFrame,
                                config: CorrelationConfig) -> Dict[str, Any]:
        """Analyze cross-correlations with time lags"""
        
        numeric_df = df.select_dtypes(include=[np.number])
        timestamp_col = df['measurement_timestamp']
        
        # Resample to regular intervals (hourly)
        df_resampled = df.set_index('measurement_timestamp').resample('H').mean()
        numeric_resampled = df_resampled.select_dtypes(include=[np.number])
        
        lag_results = {}
        params = numeric_resampled.columns.tolist()
        
        for i, param1 in enumerate(params):
            for j, param2 in enumerate(params[i+1:], i+1):
                # Get clean data for both parameters
                pair_data = numeric_resampled[[param1, param2]].dropna()
                if len(pair_data) < config.min_periods:
                    continue
                
                series1 = pair_data[param1].values
                series2 = pair_data[param2].values
                
                # Calculate cross-correlation for different lags
                max_lag = min(config.max_lag_hours, len(series1) // 4)
                lags = range(-max_lag, max_lag + 1)
                correlations = []
                
                for lag in lags:
                    if lag == 0:
                        corr = np.corrcoef(series1, series2)[0, 1]
                    elif lag > 0:
                        # series1 leads series2
                        if len(series1) > lag and len(series2) > lag:
                            corr = np.corrcoef(series1[:-lag], series2[lag:])[0, 1]
                        else:
                            corr = np.nan
                    else:  # lag < 0
                        # series2 leads series1
                        lag_abs = abs(lag)
                        if len(series1) > lag_abs and len(series2) > lag_abs:
                            corr = np.corrcoef(series1[lag_abs:], series2[:-lag_abs])[0, 1]
                        else:
                            corr = np.nan
                    
                    correlations.append(corr)
                
                # Find best correlation and lag
                correlations = np.array(correlations)
                valid_correlations = correlations[~np.isnan(correlations)]
                
                if len(valid_correlations) > 0:
                    best_idx = np.nanargmax(np.abs(correlations))
                    best_lag = lags[best_idx]
                    best_correlation = correlations[best_idx]
                    
                    pair_key = f"{param1}_vs_{param2}"
                    lag_results[pair_key] = {
                        'parameter1': param1,
                        'parameter2': param2,
                        'best_lag_hours': best_lag,
                        'best_correlation': float(best_correlation),
                        'lag_correlations': [
                            {'lag_hours': lag, 'correlation': float(corr)}
                            for lag, corr in zip(lags, correlations)
                            if not np.isnan(corr)
                        ],
                        'interpretation': self._interpret_lag_correlation(
                            param1, param2, best_lag, best_correlation
                        )
                    }
        
        return lag_results
    
    def _calculate_confidence_interval(self, correlation: float, n: int, 
                                     confidence: float = 0.95) -> Tuple[float, float]:
        """Calculate confidence interval for correlation coefficient"""
        
        if n < 4:
            return correlation, correlation
        
        # Fisher z-transformation
        z = np.arctanh(correlation)
        se = 1 / np.sqrt(n - 3)
        
        # Critical value for confidence interval
        alpha = 1 - confidence
        z_critical = stats.norm.ppf(1 - alpha/2)
        
        # Confidence interval in z-space
        z_lower = z - z_critical * se
        z_upper = z + z_critical * se
        
        # Transform back to correlation space
        ci_lower = np.tanh(z_lower)
        ci_upper = np.tanh(z_upper)
        
        return ci_lower, ci_upper
    
    def _categorize_correlation_strength(self, abs_correlation: float) -> str:
        """Categorize correlation strength"""
        if abs_correlation >= 0.8:
            return 'Very Strong'
        elif abs_correlation >= 0.6:
            return 'Strong'
        elif abs_correlation >= 0.4:
            return 'Moderate'
        elif abs_correlation >= 0.2:
            return 'Weak'
        else:
            return 'Very Weak'
    
    def _interpret_lag_correlation(self, param1: str, param2: str, 
                                 lag: int, correlation: float) -> str:
        """Generate human-readable interpretation of lag correlation"""
        
        if abs(correlation) < 0.3:
            return f"Weak relationship between {param1} and {param2}"
        
        strength = self._categorize_correlation_strength(abs(correlation))
        direction = "positive" if correlation > 0 else "negative"
        
        if lag == 0:
            return f"{strength} {direction} correlation between {param1} and {param2} (simultaneous)"
        elif lag > 0:
            return f"{strength} {direction} correlation: {param1} changes typically precede {param2} changes by ~{lag} hours"
        else:
            return f"{strength} {direction} correlation: {param2} changes typically precede {param1} changes by ~{abs(lag)} hours"
    
    def _generate_correlation_insights(self, correlation_matrix: pd.DataFrame,
                                     significant_correlations: List[Dict],
                                     df: pd.DataFrame) -> List[str]:
        """Generate actionable insights from correlation analysis"""
        
        insights = []
        
        # Overall correlation summary
        if significant_correlations:
            strongest = significant_correlations[0]
            insights.append(
                f"🔍 Strongest correlation: {strongest['parameter1']} and {strongest['parameter2']} "
                f"({strongest['correlation']:.3f}, {strongest['significance'].lower()})"
            )
            
            # Count correlation strengths
            very_strong = sum(1 for c in significant_correlations if c['strength'] == 'Very Strong')
            strong = sum(1 for c in significant_correlations if c['strength'] == 'Strong')
            
            if very_strong > 0:
                insights.append(f"⚡ {very_strong} very strong correlation(s) detected - potential process relationships")
            
            if strong > 0:
                insights.append(f"🔗 {strong} strong correlation(s) found - monitoring these together is recommended")
            
            # Positive vs negative correlations
            positive = sum(1 for c in significant_correlations if c['direction'] == 'Positive')
            negative = sum(1 for c in significant_correlations if c['direction'] == 'Negative')
            
            if negative > positive:
                insights.append("⚠️ More negative correlations detected - investigate inverse relationships")
        else:
            insights.append("📊 No significant correlations found above the threshold - parameters appear independent")
        
        # Parameter involvement
        param_counts = {}
        for corr in significant_correlations:
            param_counts[corr['parameter1']] = param_counts.get(corr['parameter1'], 0) + 1
            param_counts[corr['parameter2']] = param_counts.get(corr['parameter2'], 0) + 1
        
        if param_counts:
            most_correlated = max(param_counts.items(), key=lambda x: x[1])
            if most_correlated[1] > 2:
                insights.append(
                    f"🎯 {most_correlated[0]} shows the most correlations ({most_correlated[1]}) "
                    "- key parameter for monitoring"
                )
        
        return insights


# Global service instance
enhanced_correlation_service = EnhancedCorrelationService()