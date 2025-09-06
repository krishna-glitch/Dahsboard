"""
Statistical Analysis Service
Provides comprehensive statistical analysis including descriptive statistics,
distribution analysis, hypothesis testing, and anomaly detection for water quality data.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
from dataclasses import dataclass
import logging
import warnings
warnings.filterwarnings('ignore')

# Import statistical libraries
from scipy import stats
from scipy.stats import normaltest, shapiro, jarque_bera, kstest

# Try to import advanced statistical libraries
try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import DBSCAN
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

@dataclass
class StatisticalConfig:
    """Configuration for statistical analysis"""
    confidence_level: float = 0.95  # Confidence level for tests and intervals
    outlier_method: str = 'iqr'  # iqr, zscore, isolation_forest
    normality_tests: bool = True  # Perform normality testing
    distribution_fitting: bool = True  # Fit common distributions
    hypothesis_tests: bool = True  # Perform hypothesis tests
    min_sample_size: int = 10  # Minimum sample size for analysis

@dataclass
class StatisticalResult:
    """Result container for statistical analysis"""
    parameter: str
    descriptive_stats: Dict[str, Any]
    distribution_analysis: Optional[Dict[str, Any]] = None
    normality_tests: Optional[Dict[str, Any]] = None
    outlier_analysis: Optional[Dict[str, Any]] = None
    hypothesis_tests: Optional[Dict[str, Any]] = None
    confidence_intervals: Optional[Dict[str, Any]] = None
    insights: List[str] = None
    metadata: Dict[str, Any] = None

class StatisticalAnalysisService:
    """Comprehensive statistical analysis service"""
    
    def __init__(self):
        self.logger = logger
        
    def analyze_statistics(self, 
                          df: pd.DataFrame, 
                          parameters: List[str],
                          config: StatisticalConfig) -> Dict[str, StatisticalResult]:
        """
        Perform comprehensive statistical analysis for multiple parameters
        
        Args:
            df: DataFrame with parameter columns
            parameters: List of parameters to analyze
            config: Statistical analysis configuration
            
        Returns:
            Dictionary of parameter -> StatisticalResult
        """
        try:
            self.logger.info(f"🔢 Starting statistical analysis for {len(parameters)} parameters")
            
            # Prepare data
            processed_df = self._prepare_data(df)
            if processed_df.empty:
                raise ValueError("No valid data for statistical analysis")
            
            results = {}
            
            for param in parameters:
                if param not in processed_df.columns:
                    self.logger.warning(f"Parameter {param} not found in data")
                    continue
                    
                # Extract parameter data
                param_data = processed_df[param].dropna()
                
                if len(param_data) < config.min_sample_size:
                    self.logger.warning(f"Insufficient data for {param}: {len(param_data)} < {config.min_sample_size}")
                    continue
                
                # Perform statistical analysis for this parameter
                result = self._analyze_parameter_statistics(param_data, param, config)
                results[param] = result
                
            self.logger.info(f"✅ Statistical analysis completed for {len(results)} parameters")
            return results
            
        except Exception as e:
            self.logger.error(f"❌ Error in statistical analysis: {e}", exc_info=True)
            raise
    
    def _prepare_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare and clean data for statistical analysis"""
        
        processed_df = df.copy()
        
        # Select only numeric columns
        numeric_cols = processed_df.select_dtypes(include=[np.number]).columns
        processed_df = processed_df[numeric_cols]
        
        return processed_df
    
    def _analyze_parameter_statistics(self, data: pd.Series, parameter: str, 
                                    config: StatisticalConfig) -> StatisticalResult:
        """Analyze statistics for a single parameter"""
        
        try:
            # Descriptive statistics
            descriptive_stats = self._calculate_descriptive_statistics(data)
            
            # Distribution analysis
            distribution_analysis = None
            if config.distribution_fitting:
                distribution_analysis = self._analyze_distribution(data, config)
            
            # Normality tests
            normality_tests = None
            if config.normality_tests:
                normality_tests = self._perform_normality_tests(data, config)
            
            # Outlier analysis
            outlier_analysis = self._analyze_outliers(data, config)
            
            # Hypothesis tests
            hypothesis_tests = None
            if config.hypothesis_tests:
                hypothesis_tests = self._perform_hypothesis_tests(data, config)
            
            # Confidence intervals
            confidence_intervals = self._calculate_confidence_intervals(data, config)
            
            # Generate insights
            insights = self._generate_statistical_insights(
                descriptive_stats, distribution_analysis, normality_tests,
                outlier_analysis, hypothesis_tests, parameter
            )
            
            # Metadata
            metadata = {
                'parameter': parameter,
                'analysis_timestamp': datetime.now().isoformat(),
                'sample_size': len(data),
                'configuration': {
                    'confidence_level': config.confidence_level,
                    'outlier_method': config.outlier_method,
                    'sklearn_available': SKLEARN_AVAILABLE
                }
            }
            
            return StatisticalResult(
                parameter=parameter,
                descriptive_stats=descriptive_stats,
                distribution_analysis=distribution_analysis,
                normality_tests=normality_tests,
                outlier_analysis=outlier_analysis,
                hypothesis_tests=hypothesis_tests,
                confidence_intervals=confidence_intervals,
                insights=insights,
                metadata=metadata
            )
            
        except Exception as e:
            self.logger.error(f"Error analyzing statistics for {parameter}: {e}")
            # Return minimal result on error
            return StatisticalResult(
                parameter=parameter,
                descriptive_stats={'error': str(e)},
                insights=[f"❌ Error analyzing {parameter}: {str(e)}"],
                metadata={'error': True, 'parameter': parameter}
            )
    
    def _calculate_descriptive_statistics(self, data: pd.Series) -> Dict[str, Any]:
        """Calculate comprehensive descriptive statistics"""
        
        stats_dict = {
            # Basic measures
            'count': int(len(data)),
            'mean': float(data.mean()),
            'median': float(data.median()),
            'mode': float(data.mode().iloc[0]) if not data.mode().empty else None,
            'std': float(data.std()),
            'var': float(data.var()),
            'min': float(data.min()),
            'max': float(data.max()),
            'range': float(data.max() - data.min()),
            
            # Shape measures
            'skewness': float(data.skew()),
            'kurtosis': float(data.kurtosis()),
            
            # Percentiles
            'q1': float(data.quantile(0.25)),
            'q3': float(data.quantile(0.75)),
            'iqr': float(data.quantile(0.75) - data.quantile(0.25)),
            
            # Additional percentiles
            'p5': float(data.quantile(0.05)),
            'p95': float(data.quantile(0.95)),
            'p99': float(data.quantile(0.99)),
            
            # Relative measures
            'coefficient_of_variation': float(data.std() / data.mean()) if data.mean() != 0 else np.inf,
            'mean_absolute_deviation': float(np.mean(np.abs(data - data.mean()))),
            'median_absolute_deviation': float(np.median(np.abs(data - data.median()))),
            
            # Robust measures
            'trimmed_mean_10': float(stats.trim_mean(data, 0.1)),
            'trimmed_mean_20': float(stats.trim_mean(data, 0.2)),
        }
        
        # Geometric and harmonic means (if all values are positive)
        if (data > 0).all():
            stats_dict['geometric_mean'] = float(stats.gmean(data))
            stats_dict['harmonic_mean'] = float(stats.hmean(data))
        
        return stats_dict
    
    def _analyze_distribution(self, data: pd.Series, config: StatisticalConfig) -> Dict[str, Any]:
        """Analyze distribution characteristics and fit common distributions"""
        
        distribution_analysis = {}
        
        # Test common distributions
        distributions_to_test = [
            ('normal', stats.norm),
            ('lognormal', stats.lognorm),
            ('exponential', stats.expon),
            ('gamma', stats.gamma),
            ('beta', stats.beta),
            ('uniform', stats.uniform)
        ]
        
        distribution_fits = []
        
        for dist_name, dist_func in distributions_to_test:
            try:
                # Fit distribution
                if dist_name == 'beta':
                    # Beta distribution requires data to be in [0,1]
                    if data.min() >= 0 and data.max() <= 1:
                        params = dist_func.fit(data)
                    else:
                        continue
                elif dist_name == 'lognormal':
                    # Log-normal requires positive values
                    if (data > 0).all():
                        params = dist_func.fit(data, floc=0)
                    else:
                        continue
                else:
                    params = dist_func.fit(data)
                
                # Kolmogorov-Smirnov test
                ks_stat, ks_p_value = kstest(data, lambda x: dist_func.cdf(x, *params))
                
                distribution_fits.append({
                    'distribution': dist_name,
                    'parameters': [float(p) for p in params],
                    'ks_statistic': float(ks_stat),
                    'ks_p_value': float(ks_p_value),
                    'fit_quality': 'Good' if ks_p_value > 0.05 else 'Poor'
                })
                
            except Exception as e:
                self.logger.warning(f"Could not fit {dist_name} distribution: {e}")
                continue
        
        # Sort by KS p-value (higher is better fit)
        distribution_fits.sort(key=lambda x: x['ks_p_value'], reverse=True)
        
        distribution_analysis['fitted_distributions'] = distribution_fits
        
        # Best fitting distribution
        if distribution_fits:
            distribution_analysis['best_fit'] = distribution_fits[0]
        
        # Histogram analysis
        hist_counts, hist_bins = np.histogram(data, bins='auto')
        distribution_analysis['histogram'] = {
            'counts': hist_counts.tolist(),
            'bins': hist_bins.tolist(),
            'bin_centers': ((hist_bins[:-1] + hist_bins[1:]) / 2).tolist()
        }
        
        return distribution_analysis
    
    def _perform_normality_tests(self, data: pd.Series, config: StatisticalConfig) -> Dict[str, Any]:
        """Perform various normality tests"""
        
        normality_results = {}
        
        # Shapiro-Wilk test (good for small samples)
        if len(data) <= 5000:  # Shapiro-Wilk works best for smaller samples
            try:
                shapiro_stat, shapiro_p = shapiro(data)
                normality_results['shapiro_wilk'] = {
                    'statistic': float(shapiro_stat),
                    'p_value': float(shapiro_p),
                    'is_normal': shapiro_p > (1 - config.confidence_level),
                    'interpretation': 'Normal' if shapiro_p > (1 - config.confidence_level) else 'Not Normal'
                }
            except Exception as e:
                self.logger.warning(f"Shapiro-Wilk test failed: {e}")
        
        # D'Agostino's normality test
        try:
            dagostino_stat, dagostino_p = normaltest(data)
            normality_results['dagostino'] = {
                'statistic': float(dagostino_stat),
                'p_value': float(dagostino_p),
                'is_normal': dagostino_p > (1 - config.confidence_level),
                'interpretation': 'Normal' if dagostino_p > (1 - config.confidence_level) else 'Not Normal'
            }
        except Exception as e:
            self.logger.warning(f"D'Agostino test failed: {e}")
        
        # Jarque-Bera test
        try:
            jb_stat, jb_p = jarque_bera(data)
            normality_results['jarque_bera'] = {
                'statistic': float(jb_stat),
                'p_value': float(jb_p),
                'is_normal': jb_p > (1 - config.confidence_level),
                'interpretation': 'Normal' if jb_p > (1 - config.confidence_level) else 'Not Normal'
            }
        except Exception as e:
            self.logger.warning(f"Jarque-Bera test failed: {e}")
        
        # Overall normality assessment
        normal_tests = [test for test in normality_results.values() if 'is_normal' in test]
        if normal_tests:
            normal_count = sum(1 for test in normal_tests if test['is_normal'])
            normality_results['overall_assessment'] = {
                'tests_passed': normal_count,
                'total_tests': len(normal_tests),
                'likely_normal': normal_count > len(normal_tests) / 2,
                'confidence': normal_count / len(normal_tests)
            }
        
        return normality_results
    
    def _analyze_outliers(self, data: pd.Series, config: StatisticalConfig) -> Dict[str, Any]:
        """Comprehensive outlier detection and analysis"""
        
        outlier_analysis = {}
        
        # IQR method
        if config.outlier_method in ['iqr', 'all']:
            q1 = data.quantile(0.25)
            q3 = data.quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            
            iqr_outliers = data[(data < lower_bound) | (data > upper_bound)]
            
            outlier_analysis['iqr_method'] = {
                'lower_bound': float(lower_bound),
                'upper_bound': float(upper_bound),
                'outlier_count': len(iqr_outliers),
                'outlier_percentage': (len(iqr_outliers) / len(data)) * 100,
                'outlier_values': iqr_outliers.tolist()
            }
        
        # Z-score method
        if config.outlier_method in ['zscore', 'all']:
            z_scores = np.abs(stats.zscore(data))
            z_outliers = data[z_scores > 3]  # |z| > 3 is common threshold
            
            outlier_analysis['zscore_method'] = {
                'threshold': 3.0,
                'outlier_count': len(z_outliers),
                'outlier_percentage': (len(z_outliers) / len(data)) * 100,
                'outlier_values': z_outliers.tolist(),
                'max_zscore': float(z_scores.max())
            }
        
        # Isolation Forest (if sklearn available)
        if config.outlier_method in ['isolation_forest', 'all'] and SKLEARN_AVAILABLE:
            try:
                iso_forest = IsolationForest(contamination=0.1, random_state=42)
                outlier_labels = iso_forest.fit_predict(data.values.reshape(-1, 1))
                iso_outliers = data[outlier_labels == -1]
                
                outlier_analysis['isolation_forest'] = {
                    'outlier_count': len(iso_outliers),
                    'outlier_percentage': (len(iso_outliers) / len(data)) * 100,
                    'outlier_values': iso_outliers.tolist()
                }
            except Exception as e:
                self.logger.warning(f"Isolation Forest failed: {e}")
        
        # Statistical outlier analysis
        outlier_analysis['statistical_summary'] = {
            'total_unique_outliers': len(set().union(*[
                set(method_result.get('outlier_values', []))
                for method_result in outlier_analysis.values()
                if isinstance(method_result, dict) and 'outlier_values' in method_result
            ])),
            'methods_used': [method for method in outlier_analysis.keys() if method != 'statistical_summary']
        }
        
        return outlier_analysis
    
    def _perform_hypothesis_tests(self, data: pd.Series, config: StatisticalConfig) -> Dict[str, Any]:
        """Perform various hypothesis tests"""
        
        hypothesis_tests = {}
        
        # One-sample t-test (test if mean differs from 0)
        try:
            t_stat, t_p = stats.ttest_1samp(data, 0)
            hypothesis_tests['one_sample_ttest_zero'] = {
                'null_hypothesis': 'Mean equals 0',
                'statistic': float(t_stat),
                'p_value': float(t_p),
                'reject_null': t_p < (1 - config.confidence_level),
                'interpretation': f"Mean {'significantly differs from' if t_p < (1 - config.confidence_level) else 'does not significantly differ from'} 0"
            }
        except Exception as e:
            self.logger.warning(f"One-sample t-test failed: {e}")
        
        # One-sample t-test against median (test if mean differs from median)
        try:
            median_val = data.median()
            t_stat_med, t_p_med = stats.ttest_1samp(data, median_val)
            hypothesis_tests['mean_vs_median'] = {
                'null_hypothesis': f'Mean equals median ({median_val:.3f})',
                'statistic': float(t_stat_med),
                'p_value': float(t_p_med),
                'reject_null': t_p_med < (1 - config.confidence_level),
                'interpretation': f"Mean {'significantly differs from' if t_p_med < (1 - config.confidence_level) else 'does not significantly differ from'} median"
            }
        except Exception as e:
            self.logger.warning(f"Mean vs median test failed: {e}")
        
        # Test for randomness (runs test)
        try:
            median = data.median()
            runs, n1, n2 = 0, 0, 0
            # Convert to binary sequence (above/below median)
            binary_sequence = (data > median).astype(int)
            
            # Count runs
            for i in range(1, len(binary_sequence)):
                if binary_sequence[i] != binary_sequence[i-1]:
                    runs += 1
            runs += 1  # Add the first run
            
            n1 = sum(binary_sequence)  # Count of 1s
            n2 = len(binary_sequence) - n1  # Count of 0s
            
            if n1 > 0 and n2 > 0:
                # Expected runs and standard deviation
                expected_runs = (2 * n1 * n2) / (n1 + n2) + 1
                runs_std = np.sqrt((2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / 
                                 ((n1 + n2) ** 2 * (n1 + n2 - 1)))
                
                if runs_std > 0:
                    z_runs = (runs - expected_runs) / runs_std
                    p_runs = 2 * (1 - stats.norm.cdf(abs(z_runs)))
                    
                    hypothesis_tests['runs_test_randomness'] = {
                        'null_hypothesis': 'Data is random',
                        'observed_runs': runs,
                        'expected_runs': float(expected_runs),
                        'z_statistic': float(z_runs),
                        'p_value': float(p_runs),
                        'reject_null': p_runs < (1 - config.confidence_level),
                        'interpretation': f"Data {'is not random' if p_runs < (1 - config.confidence_level) else 'appears random'}"
                    }
        except Exception as e:
            self.logger.warning(f"Runs test failed: {e}")
        
        return hypothesis_tests
    
    def _calculate_confidence_intervals(self, data: pd.Series, config: StatisticalConfig) -> Dict[str, Any]:
        """Calculate confidence intervals for key statistics"""
        
        confidence_intervals = {}
        alpha = 1 - config.confidence_level
        n = len(data)
        
        # Confidence interval for mean
        mean_val = data.mean()
        std_err = data.std() / np.sqrt(n)
        t_critical = stats.t.ppf(1 - alpha/2, n-1)
        
        confidence_intervals['mean'] = {
            'estimate': float(mean_val),
            'lower': float(mean_val - t_critical * std_err),
            'upper': float(mean_val + t_critical * std_err),
            'confidence_level': config.confidence_level
        }
        
        # Confidence interval for standard deviation
        chi2_lower = stats.chi2.ppf(alpha/2, n-1)
        chi2_upper = stats.chi2.ppf(1 - alpha/2, n-1)
        std_val = data.std()
        
        confidence_intervals['std'] = {
            'estimate': float(std_val),
            'lower': float(std_val * np.sqrt((n-1) / chi2_upper)),
            'upper': float(std_val * np.sqrt((n-1) / chi2_lower)),
            'confidence_level': config.confidence_level
        }
        
        # Bootstrap confidence interval for median
        try:
            n_bootstrap = 1000
            bootstrap_medians = []
            for _ in range(n_bootstrap):
                bootstrap_sample = data.sample(n, replace=True)
                bootstrap_medians.append(bootstrap_sample.median())
            
            bootstrap_medians = np.array(bootstrap_medians)
            median_lower = np.percentile(bootstrap_medians, 100 * alpha/2)
            median_upper = np.percentile(bootstrap_medians, 100 * (1 - alpha/2))
            
            confidence_intervals['median'] = {
                'estimate': float(data.median()),
                'lower': float(median_lower),
                'upper': float(median_upper),
                'confidence_level': config.confidence_level,
                'method': 'bootstrap'
            }
        except Exception as e:
            self.logger.warning(f"Bootstrap confidence interval for median failed: {e}")
        
        return confidence_intervals
    
    def _generate_statistical_insights(self, descriptive_stats: Dict, distribution_analysis: Optional[Dict],
                                     normality_tests: Optional[Dict], outlier_analysis: Dict,
                                     hypothesis_tests: Optional[Dict], parameter: str) -> List[str]:
        """Generate actionable insights from statistical analysis"""
        
        insights = []
        
        # Descriptive statistics insights
        mean_val = descriptive_stats.get('mean', 0)
        median_val = descriptive_stats.get('median', 0)
        std_val = descriptive_stats.get('std', 0)
        cv = descriptive_stats.get('coefficient_of_variation', 0)
        skewness = descriptive_stats.get('skewness', 0)
        kurtosis = descriptive_stats.get('kurtosis', 0)
        
        # Central tendency
        if abs(mean_val - median_val) > std_val * 0.1:
            if mean_val > median_val:
                insights.append(f"📊 {parameter} distribution is right-skewed (mean > median)")
            else:
                insights.append(f"📊 {parameter} distribution is left-skewed (mean < median)")
        else:
            insights.append(f"📊 {parameter} has symmetric distribution (mean ≈ median)")
        
        # Variability
        if cv > 1:
            insights.append(f"⚠️ High variability: CV = {cv:.1%} (data is highly dispersed)")
        elif cv < 0.1:
            insights.append(f"✅ Low variability: CV = {cv:.1%} (data is consistent)")
        
        # Shape characteristics
        if abs(skewness) > 1:
            direction = "right" if skewness > 0 else "left"
            insights.append(f"📈 Highly {direction}-skewed distribution (skewness: {skewness:.2f})")
        
        if kurtosis > 3:
            insights.append(f"📏 Heavy-tailed distribution (kurtosis: {kurtosis:.2f}) - more outliers expected")
        elif kurtosis < -1:
            insights.append(f"📏 Light-tailed distribution (kurtosis: {kurtosis:.2f}) - fewer outliers expected")
        
        # Normality insights
        if normality_tests and 'overall_assessment' in normality_tests:
            assessment = normality_tests['overall_assessment']
            if assessment['likely_normal']:
                insights.append(f"✅ Data appears normally distributed ({assessment['confidence']:.0%} confidence)")
            else:
                insights.append(f"⚠️ Data is not normally distributed ({assessment['confidence']:.0%} confidence)")
        
        # Best distribution fit
        if distribution_analysis and 'best_fit' in distribution_analysis:
            best_fit = distribution_analysis['best_fit']
            if best_fit['fit_quality'] == 'Good':
                insights.append(f"🔍 Best fit: {best_fit['distribution']} distribution (p-value: {best_fit['ks_p_value']:.4f})")
        
        # Outlier insights
        for method, results in outlier_analysis.items():
            if isinstance(results, dict) and 'outlier_percentage' in results:
                pct = results['outlier_percentage']
                if pct > 10:
                    insights.append(f"⚠️ High outlier rate ({method}): {pct:.1f}% of data points")
                elif pct > 5:
                    insights.append(f"⚠️ Moderate outlier rate ({method}): {pct:.1f}% of data points")
                elif pct > 0:
                    insights.append(f"ℹ️ Low outlier rate ({method}): {pct:.1f}% of data points")
        
        # Hypothesis test insights
        if hypothesis_tests:
            for test_name, test_result in hypothesis_tests.items():
                if 'reject_null' in test_result and test_result['reject_null']:
                    insights.append(f"🧪 {test_result['interpretation']} (p-value: {test_result['p_value']:.4f})")
        
        return insights


# Global service instance
statistical_analysis_service = StatisticalAnalysisService()