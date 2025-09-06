"""
Trend Analysis and Forecasting Service
Provides time series analysis, trend detection, seasonal decomposition,
and basic forecasting capabilities for water quality monitoring data.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
from dataclasses import dataclass
import logging
from scipy import stats
from scipy.signal import find_peaks
import warnings
warnings.filterwarnings('ignore')

# Try to import advanced time series libraries
try:
    from statsmodels.tsa.seasonal import seasonal_decompose
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.stats.diagnostic import acorr_ljungbox
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False

from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

@dataclass
class TrendConfig:
    """Configuration for trend analysis"""
    trend_method: str = 'linear'  # linear, polynomial, seasonal
    seasonal_periods: Optional[int] = None  # Auto-detect if None
    forecast_periods: int = 24  # Number of periods to forecast
    confidence_level: float = 0.95  # Confidence interval for forecasting
    min_periods: int = 20  # Minimum data points required
    detect_outliers: bool = True  # Remove outliers before analysis
    detrend_data: bool = False  # Remove trend for analysis

@dataclass
class TrendResult:
    """Result container for trend analysis"""
    parameter: str
    trend_summary: Dict[str, Any]
    seasonal_decomposition: Optional[Dict[str, Any]] = None
    forecast: Optional[Dict[str, Any]] = None
    change_points: Optional[List[Dict[str, Any]]] = None
    outliers: Optional[List[Dict[str, Any]]] = None
    statistics: Optional[Dict[str, Any]] = None
    insights: List[str] = None
    metadata: Dict[str, Any] = None

class TrendAnalysisService:
    """Advanced trend analysis and forecasting service"""
    
    def __init__(self):
        self.logger = logger
        
    def analyze_trends(self, 
                      df: pd.DataFrame, 
                      parameters: List[str],
                      config: TrendConfig) -> Dict[str, TrendResult]:
        """
        Perform comprehensive trend analysis for multiple parameters
        
        Args:
            df: DataFrame with timestamp and parameter columns
            parameters: List of parameters to analyze
            config: Trend analysis configuration
            
        Returns:
            Dictionary of parameter -> TrendResult
        """
        try:
            self.logger.info(f"🔍 Starting trend analysis for {len(parameters)} parameters")
            
            # Prepare data
            processed_df = self._prepare_data(df, config)
            if processed_df.empty:
                raise ValueError("No valid data for trend analysis")
            
            results = {}
            
            for param in parameters:
                if param not in processed_df.columns:
                    self.logger.warning(f"Parameter {param} not found in data")
                    continue
                    
                # Extract parameter data
                param_data = processed_df[['measurement_timestamp', param]].dropna()
                
                if len(param_data) < config.min_periods:
                    self.logger.warning(f"Insufficient data for {param}: {len(param_data)} < {config.min_periods}")
                    continue
                
                # Perform trend analysis for this parameter
                result = self._analyze_parameter_trend(param_data, param, config)
                results[param] = result
                
            self.logger.info(f"✅ Trend analysis completed for {len(results)} parameters")
            return results
            
        except Exception as e:
            self.logger.error(f"❌ Error in trend analysis: {e}", exc_info=True)
            raise
    
    def _prepare_data(self, df: pd.DataFrame, config: TrendConfig) -> pd.DataFrame:
        """Prepare and clean data for trend analysis"""
        
        # Ensure timestamp column
        if 'measurement_timestamp' not in df.columns:
            raise ValueError("DataFrame must contain 'measurement_timestamp' column")
            
        processed_df = df.copy()
        processed_df['measurement_timestamp'] = pd.to_datetime(processed_df['measurement_timestamp'])
        
        # Sort by timestamp
        processed_df = processed_df.sort_values('measurement_timestamp')
        
        # Remove duplicate timestamps (keep first)
        processed_df = processed_df.drop_duplicates(subset=['measurement_timestamp'], keep='first')
        
        return processed_df
    
    def _analyze_parameter_trend(self, data: pd.DataFrame, parameter: str, 
                               config: TrendConfig) -> TrendResult:
        """Analyze trend for a single parameter"""
        
        try:
            # Set timestamp as index for time series analysis
            ts_data = data.set_index('measurement_timestamp')[parameter]
            
            # Detect and handle outliers
            outliers = []
            if config.detect_outliers:
                outlier_indices, ts_data_clean = self._detect_outliers(ts_data)
                outliers = [
                    {
                        'timestamp': idx.isoformat(),
                        'value': float(ts_data.loc[idx]),
                        'z_score': float((ts_data.loc[idx] - ts_data.mean()) / ts_data.std())
                    }
                    for idx in outlier_indices
                ]
            else:
                ts_data_clean = ts_data
            
            # Basic trend analysis
            trend_summary = self._calculate_basic_trend(ts_data_clean, parameter)
            
            # Seasonal decomposition (if enough data and statsmodels available)
            seasonal_decomposition = None
            if STATSMODELS_AVAILABLE and len(ts_data_clean) >= 24:  # Need at least 2 seasonal cycles
                seasonal_decomposition = self._perform_seasonal_decomposition(
                    ts_data_clean, config
                )
            
            # Change point detection
            change_points = self._detect_change_points(ts_data_clean)
            
            # Forecasting
            forecast = None
            if STATSMODELS_AVAILABLE and len(ts_data_clean) >= config.min_periods:
                forecast = self._generate_forecast(ts_data_clean, config)
            
            # Statistical analysis
            statistics = self._calculate_statistics(ts_data_clean)
            
            # Generate insights
            insights = self._generate_insights(
                trend_summary, seasonal_decomposition, change_points, 
                outliers, statistics, parameter
            )
            
            # Metadata
            metadata = {
                'parameter': parameter,
                'analysis_timestamp': datetime.now().isoformat(),
                'data_points': len(ts_data),
                'clean_data_points': len(ts_data_clean),
                'date_range': {
                    'start': ts_data.index.min().isoformat(),
                    'end': ts_data.index.max().isoformat()
                },
                'outliers_detected': len(outliers),
                'statsmodels_available': STATSMODELS_AVAILABLE
            }
            
            return TrendResult(
                parameter=parameter,
                trend_summary=trend_summary,
                seasonal_decomposition=seasonal_decomposition,
                forecast=forecast,
                change_points=change_points,
                outliers=outliers,
                statistics=statistics,
                insights=insights,
                metadata=metadata
            )
            
        except Exception as e:
            self.logger.error(f"Error analyzing trend for {parameter}: {e}")
            # Return minimal result on error
            return TrendResult(
                parameter=parameter,
                trend_summary={'error': str(e)},
                insights=[f"❌ Error analyzing {parameter}: {str(e)}"],
                metadata={'error': True, 'parameter': parameter}
            )
    
    def _detect_outliers(self, ts_data: pd.Series, 
                        z_threshold: float = 3.0) -> Tuple[List, pd.Series]:
        """Detect outliers using Z-score method"""
        
        z_scores = np.abs(stats.zscore(ts_data.dropna()))
        outlier_mask = z_scores > z_threshold
        outlier_indices = ts_data.index[outlier_mask].tolist()
        
        # Create clean series without outliers
        ts_data_clean = ts_data.copy()
        ts_data_clean[outlier_mask] = np.nan
        ts_data_clean = ts_data_clean.interpolate(method='time', limit_direction='both')
        
        return outlier_indices, ts_data_clean
    
    def _calculate_basic_trend(self, ts_data: pd.Series, parameter: str) -> Dict[str, Any]:
        """Calculate basic trend statistics"""
        
        # Convert timestamps to numeric for trend calculation
        x = np.arange(len(ts_data))
        y = ts_data.values
        
        # Linear regression
        slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
        
        # Calculate trend direction and strength
        if abs(slope) < std_err * 2:  # Not statistically significant
            trend_direction = 'Stable'
            trend_strength = 'None'
        elif slope > 0:
            trend_direction = 'Increasing'
            trend_strength = 'Strong' if abs(r_value) > 0.7 else 'Moderate' if abs(r_value) > 0.4 else 'Weak'
        else:
            trend_direction = 'Decreasing'
            trend_strength = 'Strong' if abs(r_value) > 0.7 else 'Moderate' if abs(r_value) > 0.4 else 'Weak'
        
        # Calculate rate of change
        time_span_days = (ts_data.index.max() - ts_data.index.min()).days
        if time_span_days > 0:
            # Convert slope to rate per day
            rate_per_day = slope * len(ts_data) / time_span_days
        else:
            rate_per_day = 0
        
        # Calculate volatility
        volatility = ts_data.std() / ts_data.mean() if ts_data.mean() != 0 else 0
        
        return {
            'trend_direction': trend_direction,
            'trend_strength': trend_strength,
            'slope': float(slope),
            'slope_std_error': float(std_err),
            'r_squared': float(r_value ** 2),
            'p_value': float(p_value),
            'rate_per_day': float(rate_per_day),
            'volatility': float(volatility),
            'mean_value': float(ts_data.mean()),
            'std_deviation': float(ts_data.std()),
            'min_value': float(ts_data.min()),
            'max_value': float(ts_data.max()),
            'statistically_significant': p_value < 0.05
        }
    
    def _perform_seasonal_decomposition(self, ts_data: pd.Series, 
                                       config: TrendConfig) -> Dict[str, Any]:
        """Perform seasonal decomposition using statsmodels"""
        
        if not STATSMODELS_AVAILABLE:
            return None
            
        try:
            # Determine seasonal period
            if config.seasonal_periods:
                period = config.seasonal_periods
            else:
                # Auto-detect period (try common patterns)
                period = self._detect_seasonal_period(ts_data)
            
            if period < 2 or len(ts_data) < 2 * period:
                return None
            
            # Perform decomposition
            decomposition = seasonal_decompose(
                ts_data.interpolate(), 
                model='additive', 
                period=period,
                extrapolate_trend='freq'
            )
            
            # Calculate seasonal strength
            seasonal_strength = np.var(decomposition.seasonal) / np.var(ts_data)
            trend_strength = np.var(decomposition.trend.dropna()) / np.var(ts_data)
            
            return {
                'seasonal_period': period,
                'seasonal_strength': float(seasonal_strength),
                'trend_strength': float(trend_strength),
                'residual_variance': float(np.var(decomposition.resid.dropna())),
                'decomposition_components': {
                    'trend': decomposition.trend.dropna().to_dict(),
                    'seasonal': decomposition.seasonal.to_dict(),
                    'residual': decomposition.resid.dropna().to_dict()
                },
                'seasonal_pattern_detected': seasonal_strength > 0.1
            }
            
        except Exception as e:
            self.logger.warning(f"Seasonal decomposition failed: {e}")
            return None
    
    def _detect_seasonal_period(self, ts_data: pd.Series) -> int:
        """Auto-detect seasonal period using autocorrelation"""
        
        # Try common periods (hourly data patterns)
        common_periods = [24, 168, 24*30]  # daily, weekly, monthly
        
        best_period = 24  # default to daily
        best_autocorr = 0
        
        for period in common_periods:
            if len(ts_data) >= 2 * period:
                try:
                    autocorr = ts_data.autocorr(lag=period)
                    if not np.isnan(autocorr) and abs(autocorr) > best_autocorr:
                        best_autocorr = abs(autocorr)
                        best_period = period
                except (ValueError, TypeError, AttributeError) as e:
                    logger.debug(f"Autocorrelation calculation failed for period {period}: {e}")
                    continue
        
        return best_period
    
    def _detect_change_points(self, ts_data: pd.Series) -> List[Dict[str, Any]]:
        """Detect change points in the time series"""
        
        change_points = []
        
        # Simple change point detection using moving window
        window_size = max(10, len(ts_data) // 20)  # 5% of data or at least 10 points
        
        if len(ts_data) < 2 * window_size:
            return change_points
        
        # Calculate rolling statistics
        rolling_mean = ts_data.rolling(window=window_size, center=True).mean()
        rolling_std = ts_data.rolling(window=window_size, center=True).std()
        
        # Find points where mean changes significantly
        mean_changes = np.abs(rolling_mean.diff()) > (2 * rolling_std)
        
        change_indices = ts_data.index[mean_changes.fillna(False)]
        
        for idx in change_indices:
            if idx != ts_data.index[0] and idx != ts_data.index[-1]:  # Exclude endpoints
                before_mean = ts_data.loc[:idx].tail(window_size).mean()
                after_mean = ts_data.loc[idx:].head(window_size).mean()
                
                change_points.append({
                    'timestamp': idx.isoformat(),
                    'value': float(ts_data.loc[idx]),
                    'before_mean': float(before_mean),
                    'after_mean': float(after_mean),
                    'change_magnitude': float(abs(after_mean - before_mean)),
                    'change_type': 'Increase' if after_mean > before_mean else 'Decrease'
                })
        
        # Sort by change magnitude and keep top 5
        change_points.sort(key=lambda x: x['change_magnitude'], reverse=True)
        return change_points[:5]
    
    def _generate_forecast(self, ts_data: pd.Series, config: TrendConfig) -> Dict[str, Any]:
        """Generate forecast using exponential smoothing or ARIMA"""
        
        if not STATSMODELS_AVAILABLE:
            return None
            
        try:
            # Try exponential smoothing first (more robust)
            try:
                model = ExponentialSmoothing(
                    ts_data,
                    trend='add',
                    seasonal='add' if len(ts_data) > 24 else None,
                    seasonal_periods=24 if len(ts_data) > 24 else None
                )
                fitted_model = model.fit(optimized=True, use_brute=True)
                forecast_values = fitted_model.forecast(config.forecast_periods)
                
                # Calculate prediction intervals (approximate)
                residuals = fitted_model.resid
                forecast_std = np.std(residuals)
                alpha = 1 - config.confidence_level
                z_score = stats.norm.ppf(1 - alpha/2)
                
                forecast_lower = forecast_values - z_score * forecast_std
                forecast_upper = forecast_values + z_score * forecast_std
                
                method = 'Exponential Smoothing'
                
            except Exception as exp_error:
                self.logger.warning(f"Exponential smoothing failed: {exp_error}")
                # Fallback to simple linear extrapolation
                x = np.arange(len(ts_data))
                slope, intercept = np.polyfit(x, ts_data.values, 1)
                
                future_x = np.arange(len(ts_data), len(ts_data) + config.forecast_periods)
                forecast_values = pd.Series(
                    slope * future_x + intercept,
                    index=pd.date_range(
                        start=ts_data.index[-1] + (ts_data.index[-1] - ts_data.index[-2]),
                        periods=config.forecast_periods,
                        freq=ts_data.index.freq or 'H'
                    )
                )
                
                # Simple error estimation
                residuals = ts_data.values - (slope * x + intercept)
                forecast_std = np.std(residuals)
                alpha = 1 - config.confidence_level
                z_score = stats.norm.ppf(1 - alpha/2)
                
                forecast_lower = forecast_values - z_score * forecast_std
                forecast_upper = forecast_values + z_score * forecast_std
                
                method = 'Linear Extrapolation'
            
            return {
                'method': method,
                'forecast_values': forecast_values.to_dict(),
                'confidence_lower': forecast_lower.to_dict() if hasattr(forecast_lower, 'to_dict') else {k: v for k, v in zip(forecast_values.index, forecast_lower)},
                'confidence_upper': forecast_upper.to_dict() if hasattr(forecast_upper, 'to_dict') else {k: v for k, v in zip(forecast_values.index, forecast_upper)},
                'confidence_level': config.confidence_level,
                'forecast_periods': config.forecast_periods,
                'forecast_start': forecast_values.index[0].isoformat(),
                'forecast_end': forecast_values.index[-1].isoformat()
            }
            
        except Exception as e:
            self.logger.warning(f"Forecasting failed: {e}")
            return None
    
    def _calculate_statistics(self, ts_data: pd.Series) -> Dict[str, Any]:
        """Calculate comprehensive time series statistics"""
        
        # Basic statistics
        stats_dict = {
            'count': int(len(ts_data)),
            'mean': float(ts_data.mean()),
            'median': float(ts_data.median()),
            'std': float(ts_data.std()),
            'var': float(ts_data.var()),
            'min': float(ts_data.min()),
            'max': float(ts_data.max()),
            'range': float(ts_data.max() - ts_data.min()),
            'skewness': float(ts_data.skew()),
            'kurtosis': float(ts_data.kurtosis())
        }
        
        # Percentiles
        percentiles = [5, 25, 75, 95]
        for p in percentiles:
            stats_dict[f'p{p}'] = float(ts_data.quantile(p/100))
        
        # Time series specific statistics
        if len(ts_data) > 1:
            # Calculate first differences for stationarity check
            diff_series = ts_data.diff().dropna()
            stats_dict['first_diff_mean'] = float(diff_series.mean())
            stats_dict['first_diff_std'] = float(diff_series.std())
            
            # Coefficient of variation
            stats_dict['coefficient_of_variation'] = float(ts_data.std() / ts_data.mean()) if ts_data.mean() != 0 else 0
            
            # Autocorrelation at lag 1
            try:
                stats_dict['lag1_autocorr'] = float(ts_data.autocorr(lag=1))
            except (ValueError, TypeError, AttributeError) as e:
                logger.debug(f"Lag-1 autocorrelation calculation failed: {e}")
                stats_dict['lag1_autocorr'] = 0
        
        return stats_dict
    
    def _generate_insights(self, trend_summary: Dict, seasonal_decomp: Optional[Dict],
                          change_points: List, outliers: List, 
                          statistics: Dict, parameter: str) -> List[str]:
        """Generate actionable insights from trend analysis"""
        
        insights = []
        
        # Trend insights
        if trend_summary.get('statistically_significant', False):
            direction = trend_summary['trend_direction']
            strength = trend_summary['trend_strength']
            rate = trend_summary['rate_per_day']
            
            insights.append(
                f"📈 {parameter} shows a {strength.lower()} {direction.lower()} trend "
                f"({rate:+.3f} units/day, p-value: {trend_summary['p_value']:.4f})"
            )
        else:
            insights.append(f"📊 {parameter} shows no significant long-term trend")
        
        # Volatility insights
        volatility = trend_summary.get('volatility', 0)
        if volatility > 0.3:
            insights.append(f"⚠️ High volatility detected ({volatility:.1%}) - consider investigating causes")
        elif volatility < 0.05:
            insights.append(f"✅ Low volatility ({volatility:.1%}) - parameter is stable")
        
        # Seasonal insights
        if seasonal_decomp and seasonal_decomp.get('seasonal_pattern_detected'):
            period = seasonal_decomp['seasonal_period']
            strength = seasonal_decomp['seasonal_strength']
            insights.append(
                f"🔄 Seasonal pattern detected: {period}-hour cycle "
                f"({strength:.1%} of total variation)"
            )
        
        # Change point insights
        if change_points:
            major_changes = [cp for cp in change_points if cp['change_magnitude'] > statistics['std']]
            if major_changes:
                insights.append(
                    f"🔄 {len(major_changes)} significant change point(s) detected - "
                    f"largest change: {major_changes[0]['change_magnitude']:.2f} units"
                )
        
        # Outlier insights
        if outliers:
            outlier_count = len(outliers)
            outlier_pct = (outlier_count / statistics['count']) * 100
            insights.append(f"⚠️ {outlier_count} outlier(s) detected ({outlier_pct:.1f}% of data)")
        
        # Data quality insights
        if statistics['coefficient_of_variation'] > 1:
            insights.append("📊 High coefficient of variation - data shows high relative variability")
        
        # Stationarity insights
        if abs(statistics.get('first_diff_mean', 0)) < statistics.get('first_diff_std', 1) * 0.1:
            insights.append("✅ Data appears stationary (good for forecasting)")
        
        return insights


# Global service instance
trend_analysis_service = TrendAnalysisService()