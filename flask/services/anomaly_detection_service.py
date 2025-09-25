"""
Advanced Anomaly Detection Service
Provides comprehensive anomaly detection capabilities including statistical methods,
machine learning approaches, and time series anomaly detection for water quality monitoring.
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
from scipy.signal import find_peaks, savgol_filter

# Try to import advanced ML libraries
try:
    from sklearn.ensemble import IsolationForest
    from sklearn.neighbors import LocalOutlierFactor
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import DBSCAN
    from sklearn.svm import OneClassSVM
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

@dataclass
class AnomalyDetectionConfig:
    """Configuration for anomaly detection"""
    method: str = 'ensemble'  # statistical, isolation_forest, local_outlier, one_class_svm, ensemble
    threshold: float = 2.5  # Threshold for statistical methods (sigma)
    window_size: int = 24  # Time window for contextual anomalies (hours)
    sensitivity: float = 0.1  # Contamination rate for ML methods
    seasonal_adjustment: bool = True  # Apply seasonal adjustment
    min_periods: int = 10  # Minimum data points required
    remove_trend: bool = False  # Remove trend before anomaly detection

@dataclass
class AnomalyPoint:
    """Individual anomaly point"""
    timestamp: str
    value: float
    anomaly_score: float
    anomaly_type: str  # point, contextual, collective
    severity: str  # low, medium, high, critical
    explanation: str
    related_parameters: Optional[List[str]] = None

@dataclass
class AnomalyResult:
    """Result container for anomaly detection"""
    parameter: str
    anomalies: List[AnomalyPoint]
    anomaly_summary: Dict[str, Any]
    detection_config: Dict[str, Any]
    insights: List[str]
    metadata: Dict[str, Any]

class AnomalyDetectionService:
    """Advanced anomaly detection service for water quality monitoring"""

    def __init__(self):
        self.logger = logger

    def detect_anomalies(self,
                        df: pd.DataFrame,
                        parameters: List[str],
                        config: AnomalyDetectionConfig) -> Dict[str, AnomalyResult]:
        """
        Perform comprehensive anomaly detection for multiple parameters

        Args:
            df: DataFrame with timestamp and parameter columns
            parameters: List of parameters to analyze
            config: Anomaly detection configuration

        Returns:
            Dictionary of parameter -> AnomalyResult
        """
        try:
            self.logger.info(f"🚨 Starting anomaly detection for {len(parameters)} parameters")

            # Prepare data
            processed_df = self._prepare_data(df, config)
            if processed_df.empty:
                raise ValueError("No valid data for anomaly detection")

            results = {}

            for param in parameters:
                if param not in processed_df.columns:
                    self.logger.warning(f"Parameter {param} not found in data")
                    continue

                # Extract parameter data with timestamps
                param_data = processed_df[['measurement_timestamp', param]].dropna()

                if len(param_data) < config.min_periods:
                    self.logger.warning(f"Insufficient data for {param}: {len(param_data)} < {config.min_periods}")
                    continue

                # Perform anomaly detection for this parameter
                result = self._detect_parameter_anomalies(param_data, param, config)
                results[param] = result

            self.logger.info(f"✅ Anomaly detection completed for {len(results)} parameters")
            return results

        except Exception as e:
            self.logger.error(f"❌ Error in anomaly detection: {e}", exc_info=True)
            raise

    def _prepare_data(self, df: pd.DataFrame, config: AnomalyDetectionConfig) -> pd.DataFrame:
        """Prepare and clean data for anomaly detection"""

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

    def _detect_parameter_anomalies(self, data: pd.DataFrame, parameter: str,
                                   config: AnomalyDetectionConfig) -> AnomalyResult:
        """Detect anomalies for a single parameter"""

        try:
            # Set timestamp as index for time series analysis
            ts_data = data.set_index('measurement_timestamp')[parameter]

            # Apply preprocessing
            processed_data = self._preprocess_data(ts_data, config)

            # Detect anomalies based on method
            if config.method == 'ensemble':
                anomalies = self._detect_ensemble_anomalies(processed_data, ts_data, config)
            elif config.method == 'statistical':
                anomalies = self._detect_statistical_anomalies(processed_data, ts_data, config)
            elif config.method == 'isolation_forest' and SKLEARN_AVAILABLE:
                anomalies = self._detect_isolation_forest_anomalies(processed_data, ts_data, config)
            elif config.method == 'local_outlier' and SKLEARN_AVAILABLE:
                anomalies = self._detect_local_outlier_anomalies(processed_data, ts_data, config)
            elif config.method == 'one_class_svm' and SKLEARN_AVAILABLE:
                anomalies = self._detect_one_class_svm_anomalies(processed_data, ts_data, config)
            else:
                # Fallback to statistical method
                self.logger.warning(f"Method {config.method} not available, using statistical method")
                anomalies = self._detect_statistical_anomalies(processed_data, ts_data, config)

            # Calculate anomaly summary
            anomaly_summary = self._calculate_anomaly_summary(anomalies, ts_data)

            # Generate insights
            insights = self._generate_anomaly_insights(anomalies, anomaly_summary, parameter)

            # Metadata
            metadata = {
                'parameter': parameter,
                'analysis_timestamp': datetime.now().isoformat(),
                'data_points': len(ts_data),
                'date_range': {
                    'start': ts_data.index.min().isoformat(),
                    'end': ts_data.index.max().isoformat()
                },
                'detection_method': config.method,
                'sklearn_available': SKLEARN_AVAILABLE
            }

            return AnomalyResult(
                parameter=parameter,
                anomalies=anomalies,
                anomaly_summary=anomaly_summary,
                detection_config={
                    'method': config.method,
                    'threshold': config.threshold,
                    'window_size': config.window_size,
                    'sensitivity': config.sensitivity,
                    'seasonal_adjustment': config.seasonal_adjustment
                },
                insights=insights,
                metadata=metadata
            )

        except Exception as e:
            self.logger.error(f"Error detecting anomalies for {parameter}: {e}")
            # Return minimal result on error
            return AnomalyResult(
                parameter=parameter,
                anomalies=[],
                anomaly_summary={'error': str(e)},
                detection_config={'error': True},
                insights=[f"❌ Error detecting anomalies in {parameter}: {str(e)}"],
                metadata={'error': True, 'parameter': parameter}
            )

    def _preprocess_data(self, ts_data: pd.Series, config: AnomalyDetectionConfig) -> pd.Series:
        """Preprocess time series data before anomaly detection"""

        processed_data = ts_data.copy()

        # Remove trend if requested
        if config.remove_trend:
            # Simple linear detrending
            x = np.arange(len(processed_data))
            coeffs = np.polyfit(x, processed_data.values, 1)
            trend = np.polyval(coeffs, x)
            processed_data = pd.Series(processed_data.values - trend, index=processed_data.index)

        # Seasonal adjustment (simple moving average)
        if config.seasonal_adjustment and len(processed_data) > config.window_size:
            seasonal_component = processed_data.rolling(
                window=config.window_size,
                center=True
            ).mean()
            processed_data = processed_data - seasonal_component
            processed_data = processed_data.dropna()

        return processed_data

    def _detect_statistical_anomalies(self, processed_data: pd.Series,
                                    original_data: pd.Series,
                                    config: AnomalyDetectionConfig) -> List[AnomalyPoint]:
        """Detect anomalies using statistical methods"""

        anomalies = []

        # Z-score based detection
        z_scores = np.abs(stats.zscore(processed_data.dropna()))
        outlier_mask = z_scores > config.threshold

        outlier_indices = processed_data.index[outlier_mask]

        for idx in outlier_indices:
            if idx in original_data.index:
                original_value = original_data.loc[idx]
                z_score = z_scores[processed_data.index.get_loc(idx)]

                # Determine severity based on z-score
                if z_score > 4:
                    severity = 'critical'
                elif z_score > 3:
                    severity = 'high'
                elif z_score > 2.5:
                    severity = 'medium'
                else:
                    severity = 'low'

                anomaly = AnomalyPoint(
                    timestamp=idx.isoformat(),
                    value=float(original_value),
                    anomaly_score=float(z_score),
                    anomaly_type='point',
                    severity=severity,
                    explanation=f"Statistical outlier (Z-score: {z_score:.2f})"
                )
                anomalies.append(anomaly)

        # Add contextual anomalies detection
        contextual_anomalies = self._detect_contextual_anomalies(original_data, config)
        anomalies.extend(contextual_anomalies)

        return anomalies

    def _detect_isolation_forest_anomalies(self, processed_data: pd.Series,
                                         original_data: pd.Series,
                                         config: AnomalyDetectionConfig) -> List[AnomalyPoint]:
        """Detect anomalies using Isolation Forest"""

        if not SKLEARN_AVAILABLE:
            return self._detect_statistical_anomalies(processed_data, original_data, config)

        anomalies = []

        try:
            # Prepare features (value + time-based features)
            features = self._create_features(original_data)

            # Fit Isolation Forest
            iso_forest = IsolationForest(
                contamination=config.sensitivity,
                random_state=42,
                n_estimators=100
            )
            outlier_labels = iso_forest.fit_predict(features)
            outlier_scores = iso_forest.decision_function(features)

            # Extract anomalies
            for i, (idx, label, score) in enumerate(zip(original_data.index, outlier_labels, outlier_scores)):
                if label == -1:  # Anomaly
                    original_value = original_data.loc[idx]
                    anomaly_score = abs(score)

                    # Determine severity based on score
                    if anomaly_score > 0.5:
                        severity = 'critical'
                    elif anomaly_score > 0.3:
                        severity = 'high'
                    elif anomaly_score > 0.1:
                        severity = 'medium'
                    else:
                        severity = 'low'

                    anomaly = AnomalyPoint(
                        timestamp=idx.isoformat(),
                        value=float(original_value),
                        anomaly_score=float(anomaly_score),
                        anomaly_type='point',
                        severity=severity,
                        explanation=f"Isolation Forest anomaly (score: {score:.3f})"
                    )
                    anomalies.append(anomaly)

        except Exception as e:
            self.logger.warning(f"Isolation Forest failed: {e}")
            return self._detect_statistical_anomalies(processed_data, original_data, config)

        return anomalies

    def _detect_local_outlier_anomalies(self, processed_data: pd.Series,
                                      original_data: pd.Series,
                                      config: AnomalyDetectionConfig) -> List[AnomalyPoint]:
        """Detect anomalies using Local Outlier Factor"""

        if not SKLEARN_AVAILABLE:
            return self._detect_statistical_anomalies(processed_data, original_data, config)

        anomalies = []

        try:
            # Prepare features
            features = self._create_features(original_data)

            # Fit Local Outlier Factor
            lof = LocalOutlierFactor(
                contamination=config.sensitivity,
                n_neighbors=min(20, len(features) // 5)
            )
            outlier_labels = lof.fit_predict(features)
            outlier_scores = -lof.negative_outlier_factor_

            # Extract anomalies
            for i, (idx, label, score) in enumerate(zip(original_data.index, outlier_labels, outlier_scores)):
                if label == -1:  # Anomaly
                    original_value = original_data.loc[idx]

                    # Determine severity based on LOF score
                    if score > 3:
                        severity = 'critical'
                    elif score > 2.5:
                        severity = 'high'
                    elif score > 2:
                        severity = 'medium'
                    else:
                        severity = 'low'

                    anomaly = AnomalyPoint(
                        timestamp=idx.isoformat(),
                        value=float(original_value),
                        anomaly_score=float(score),
                        anomaly_type='contextual',
                        severity=severity,
                        explanation=f"Local outlier (LOF score: {score:.2f})"
                    )
                    anomalies.append(anomaly)

        except Exception as e:
            self.logger.warning(f"Local Outlier Factor failed: {e}")
            return self._detect_statistical_anomalies(processed_data, original_data, config)

        return anomalies

    def _detect_one_class_svm_anomalies(self, processed_data: pd.Series,
                                      original_data: pd.Series,
                                      config: AnomalyDetectionConfig) -> List[AnomalyPoint]:
        """Detect anomalies using One-Class SVM"""

        if not SKLEARN_AVAILABLE:
            return self._detect_statistical_anomalies(processed_data, original_data, config)

        anomalies = []

        try:
            # Prepare features
            features = self._create_features(original_data)

            # Normalize features
            scaler = StandardScaler()
            features_scaled = scaler.fit_transform(features)

            # Fit One-Class SVM
            oc_svm = OneClassSVM(
                kernel='rbf',
                gamma='scale',
                nu=config.sensitivity
            )
            outlier_labels = oc_svm.fit_predict(features_scaled)
            outlier_scores = oc_svm.decision_function(features_scaled)

            # Extract anomalies
            for i, (idx, label, score) in enumerate(zip(original_data.index, outlier_labels, outlier_scores)):
                if label == -1:  # Anomaly
                    original_value = original_data.loc[idx]
                    anomaly_score = abs(score)

                    # Determine severity based on score
                    if anomaly_score > 1:
                        severity = 'critical'
                    elif anomaly_score > 0.5:
                        severity = 'high'
                    elif anomaly_score > 0.2:
                        severity = 'medium'
                    else:
                        severity = 'low'

                    anomaly = AnomalyPoint(
                        timestamp=idx.isoformat(),
                        value=float(original_value),
                        anomaly_score=float(anomaly_score),
                        anomaly_type='point',
                        severity=severity,
                        explanation=f"One-Class SVM anomaly (score: {score:.3f})"
                    )
                    anomalies.append(anomaly)

        except Exception as e:
            self.logger.warning(f"One-Class SVM failed: {e}")
            return self._detect_statistical_anomalies(processed_data, original_data, config)

        return anomalies

    def _detect_ensemble_anomalies(self, processed_data: pd.Series,
                                 original_data: pd.Series,
                                 config: AnomalyDetectionConfig) -> List[AnomalyPoint]:
        """Detect anomalies using ensemble of methods"""

        all_anomalies = []

        # Statistical method
        stat_anomalies = self._detect_statistical_anomalies(processed_data, original_data, config)
        all_anomalies.extend(stat_anomalies)

        # ML methods (if available)
        if SKLEARN_AVAILABLE:
            iso_anomalies = self._detect_isolation_forest_anomalies(processed_data, original_data, config)
            lof_anomalies = self._detect_local_outlier_anomalies(processed_data, original_data, config)

            all_anomalies.extend(iso_anomalies)
            all_anomalies.extend(lof_anomalies)

        # Consolidate anomalies (remove duplicates and combine scores)
        consolidated_anomalies = self._consolidate_anomalies(all_anomalies)

        return consolidated_anomalies

    def _detect_contextual_anomalies(self, ts_data: pd.Series,
                                   config: AnomalyDetectionConfig) -> List[AnomalyPoint]:
        """Detect contextual anomalies based on local context"""

        anomalies = []

        if len(ts_data) < config.window_size:
            return anomalies

        # Rolling window analysis
        for i in range(config.window_size, len(ts_data) - config.window_size):
            current_idx = ts_data.index[i]
            current_value = ts_data.iloc[i]

            # Get local window
            window_start = max(0, i - config.window_size // 2)
            window_end = min(len(ts_data), i + config.window_size // 2)
            local_window = ts_data.iloc[window_start:window_end]

            # Exclude current point from statistics
            local_context = local_window.drop(current_idx)

            if len(local_context) > 3:
                local_mean = local_context.mean()
                local_std = local_context.std()

                if local_std > 0:
                    z_score = abs(current_value - local_mean) / local_std

                    if z_score > config.threshold:
                        # Determine severity
                        if z_score > 4:
                            severity = 'critical'
                        elif z_score > 3:
                            severity = 'high'
                        elif z_score > 2.5:
                            severity = 'medium'
                        else:
                            severity = 'low'

                        anomaly = AnomalyPoint(
                            timestamp=current_idx.isoformat(),
                            value=float(current_value),
                            anomaly_score=float(z_score),
                            anomaly_type='contextual',
                            severity=severity,
                            explanation=f"Contextual anomaly (local Z-score: {z_score:.2f})"
                        )
                        anomalies.append(anomaly)

        return anomalies

    def _create_features(self, ts_data: pd.Series) -> np.ndarray:
        """Create features for ML-based anomaly detection"""

        features = []

        for i, (idx, value) in enumerate(ts_data.items()):
            feature_row = [value]  # Current value

            # Time-based features
            feature_row.append(idx.hour)  # Hour of day
            feature_row.append(idx.day)   # Day of month
            feature_row.append(idx.weekday())  # Day of week

            # Lag features (if available)
            if i > 0:
                feature_row.append(ts_data.iloc[i-1])  # Previous value
            else:
                feature_row.append(value)

            if i > 1:
                feature_row.append(ts_data.iloc[i-2])  # Value 2 steps back
            else:
                feature_row.append(value)

            # Rolling statistics (if enough data)
            if i >= 5:
                window = ts_data.iloc[max(0, i-5):i]
                feature_row.append(window.mean())  # Rolling mean
                feature_row.append(window.std())   # Rolling std
            else:
                feature_row.extend([value, 0])

            features.append(feature_row)

        return np.array(features)

    def _consolidate_anomalies(self, anomalies: List[AnomalyPoint]) -> List[AnomalyPoint]:
        """Consolidate anomalies from multiple methods"""

        # Group by timestamp
        anomaly_dict = {}

        for anomaly in anomalies:
            timestamp = anomaly.timestamp
            if timestamp not in anomaly_dict:
                anomaly_dict[timestamp] = []
            anomaly_dict[timestamp].append(anomaly)

        # Consolidate anomalies at same timestamp
        consolidated = []

        for timestamp, timestamp_anomalies in anomaly_dict.items():
            if len(timestamp_anomalies) == 1:
                consolidated.append(timestamp_anomalies[0])
            else:
                # Combine multiple detections
                combined_score = max(a.anomaly_score for a in timestamp_anomalies)
                combined_explanations = "; ".join(set(a.explanation for a in timestamp_anomalies))

                # Take highest severity
                severity_order = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
                max_severity = max(timestamp_anomalies, key=lambda x: severity_order[x.severity]).severity

                # Determine type (prefer contextual over point)
                anomaly_type = 'contextual' if any(a.anomaly_type == 'contextual' for a in timestamp_anomalies) else 'point'

                consolidated_anomaly = AnomalyPoint(
                    timestamp=timestamp,
                    value=timestamp_anomalies[0].value,
                    anomaly_score=combined_score,
                    anomaly_type=anomaly_type,
                    severity=max_severity,
                    explanation=f"Multiple methods: {combined_explanations}"
                )
                consolidated.append(consolidated_anomaly)

        # Sort by timestamp
        consolidated.sort(key=lambda x: x.timestamp)

        return consolidated

    def _calculate_anomaly_summary(self, anomalies: List[AnomalyPoint],
                                 ts_data: pd.Series) -> Dict[str, Any]:
        """Calculate summary statistics for detected anomalies"""

        total_anomalies = len(anomalies)

        if total_anomalies == 0:
            return {
                'total_anomalies': 0,
                'anomaly_rate': 0.0,
                'severity_distribution': {},
                'type_distribution': {},
                'most_anomalous_period': None
            }

        # Severity distribution
        severity_dist = {}
        for anomaly in anomalies:
            severity_dist[anomaly.severity] = severity_dist.get(anomaly.severity, 0) + 1

        # Type distribution
        type_dist = {}
        for anomaly in anomalies:
            type_dist[anomaly.anomaly_type] = type_dist.get(anomaly.anomaly_type, 0) + 1

        # Most anomalous period (day with most anomalies)
        anomaly_timestamps = [pd.to_datetime(a.timestamp) for a in anomalies]
        anomaly_dates = [ts.date() for ts in anomaly_timestamps]

        most_anomalous_date = max(set(anomaly_dates), key=anomaly_dates.count) if anomaly_dates else None
        most_anomalous_count = anomaly_dates.count(most_anomalous_date) if most_anomalous_date else 0

        return {
            'total_anomalies': total_anomalies,
            'anomaly_rate': (total_anomalies / len(ts_data)) * 100,
            'severity_distribution': severity_dist,
            'type_distribution': type_dist,
            'most_anomalous_period': {
                'date': most_anomalous_date.isoformat() if most_anomalous_date else None,
                'anomaly_count': most_anomalous_count
            } if most_anomalous_date else None
        }

    def _generate_anomaly_insights(self, anomalies: List[AnomalyPoint],
                                 summary: Dict[str, Any], parameter: str) -> List[str]:
        """Generate actionable insights from anomaly detection"""

        insights = []

        total_anomalies = summary['total_anomalies']

        if total_anomalies == 0:
            insights.append(f"✅ No anomalies detected in {parameter} - data appears normal")
            return insights

        # Overall anomaly rate
        anomaly_rate = summary['anomaly_rate']
        if anomaly_rate > 10:
            insights.append(f"🚨 High anomaly rate: {anomaly_rate:.1f}% of {parameter} data points are anomalous")
        elif anomaly_rate > 5:
            insights.append(f"⚠️ Moderate anomaly rate: {anomaly_rate:.1f}% of {parameter} data points are anomalous")
        else:
            insights.append(f"ℹ️ Low anomaly rate: {anomaly_rate:.1f}% of {parameter} data points are anomalous")

        # Severity insights
        severity_dist = summary['severity_distribution']
        critical_count = severity_dist.get('critical', 0)
        high_count = severity_dist.get('high', 0)

        if critical_count > 0:
            insights.append(f"🔴 {critical_count} critical anomal{'ies' if critical_count > 1 else 'y'} detected - immediate attention required")

        if high_count > 0:
            insights.append(f"🟠 {high_count} high-severity anomal{'ies' if high_count > 1 else 'y'} detected - investigation recommended")

        # Type insights
        type_dist = summary['type_distribution']
        contextual_count = type_dist.get('contextual', 0)
        point_count = type_dist.get('point', 0)

        if contextual_count > point_count:
            insights.append(f"🔍 Most anomalies are contextual ({contextual_count}) - unusual in local context")
        elif point_count > 0:
            insights.append(f"📍 {point_count} point anomal{'ies' if point_count > 1 else 'y'} detected - globally unusual values")

        # Most anomalous period
        if summary['most_anomalous_period']:
            period = summary['most_anomalous_period']
            insights.append(f"📅 Most anomalous day: {period['date']} with {period['anomaly_count']} anomalies")

        # Recent anomalies
        recent_anomalies = [a for a in anomalies if
                          (datetime.now() - pd.to_datetime(a.timestamp)).days < 7]
        if recent_anomalies:
            insights.append(f"🕐 {len(recent_anomalies)} anomal{'ies' if len(recent_anomalies) > 1 else 'y'} detected in the last 7 days")

        return insights


# Global service instance
anomaly_detection_service = AnomalyDetectionService()