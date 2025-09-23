"""
Advanced Filter Service
Provides comprehensive filtering capabilities for water quality data
Supports parameter ranges, data quality filtering, alert filtering, and more
"""

import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union, Tuple
from dataclasses import dataclass
from enum import Enum

from config.advanced_logging_config import get_advanced_logger
from services.core_data_service import core_data_service

logger = get_advanced_logger(__name__)

class DataQuality(Enum):
    """Data quality levels"""
    ALL = "all"
    HIGH = "high"
    MEDIUM = "medium" 
    FLAGGED = "flagged"
    VALIDATED = "validated"

class AlertLevel(Enum):
    """Alert filtering levels"""
    ALL = "all"
    NO_ALERTS = "no_alerts"
    WITH_ALERTS = "with_alerts"
    CRITICAL_ONLY = "critical_only"

@dataclass
class ParameterRange:
    """Parameter value range definition"""
    parameter: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    unit: Optional[str] = None

@dataclass
class AdvancedFilterConfig:
    """Complete advanced filter configuration"""
    # Basic filters (used by other services, not this one)
    sites: List[str] = None
    time_range: str = "Last 30 Days"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    # Advanced filters
    parameters: List[str] = None
    parameter_ranges: Dict[str, ParameterRange] = None
    data_quality: DataQuality = DataQuality.ALL
    alert_level: AlertLevel = AlertLevel.ALL
    
    # Additional filters
    exclude_outliers: bool = False
    outlier_threshold: float = 3.0  # Standard deviations
    min_data_completeness: float = 0.0  # Minimum data completeness (0-1)
    
    def __post_init__(self):
        if self.sites is None:
            self.sites = []
        if self.parameters is None:
            self.parameters = []
        if self.parameter_ranges is None:
            self.parameter_ranges = {}

class AdvancedFilterService:
    """
    Service providing advanced, post-processing filtering capabilities for water quality data.
    It assumes that primary filtering (sites, time range) has already been applied at the database level.
    """
    
    def __init__(self):
        self.supported_parameters = [
            'temperature_c',
            'conductivity_us_cm', 
            'water_level_m',
            'ph',
            'dissolved_oxygen',
            'turbidity',
            'redox_potential_mv'
        ]
        
        self.parameter_definitions = {
            'temperature_c': {'unit': '°C', 'optimal_min': 10, 'optimal_max': 25, 'valid_min': -10, 'valid_max': 50},
            'conductivity_us_cm': {'unit': 'µS/cm', 'optimal_min': 100, 'optimal_max': 2000, 'valid_min': 0, 'valid_max': 5000},
            'water_level_m': {'unit': 'm', 'optimal_min': 2, 'optimal_max': 15, 'valid_min': 0, 'valid_max': 20},
            'ph': {'unit': 'pH', 'optimal_min': 6.5, 'optimal_max': 8.5, 'valid_min': 0, 'valid_max': 14},
            'dissolved_oxygen': {'unit': 'mg/L', 'optimal_min': 5, 'optimal_max': 15, 'valid_min': 0, 'valid_max': 20},
            'turbidity': {'unit': 'NTU', 'optimal_min': 0, 'optimal_max': 4, 'valid_min': 0, 'valid_max': 100},
            'redox_potential_mv': {'unit': 'mV', 'optimal_min': -100, 'optimal_max': 400, 'valid_min': -500, 'valid_max': 800}
        }
    
    def apply_advanced_filters(self, 
                             df: pd.DataFrame, 
                             filter_config: AdvancedFilterConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Apply comprehensive advanced filters to a DataFrame that has already been fetched.
        """
        if df.empty:
            return df, self._empty_filter_stats()
        
        start_time = datetime.now()
        original_count = len(df)
        current_df = df.copy()
        
        filter_steps = []
        
        logger.info(f"[ADVANCED FILTER] Starting with {original_count} records")
        
        try:
            # Site and Time filtering are now handled by the database query before this service is called.

            # 1. Parameter filtering (only include records with selected parameters)
            if filter_config.parameters:
                current_df, step_stats = self._apply_parameter_filter(current_df, filter_config.parameters)
                filter_steps.append({'step': 'parameter_filter', 'remaining': len(current_df), **step_stats})
            
            # 2. Parameter range filtering
            if filter_config.parameter_ranges:
                current_df, step_stats = self._apply_parameter_range_filters(current_df, filter_config.parameter_ranges)
                filter_steps.append({'step': 'range_filter', 'remaining': len(current_df), **step_stats})
            
            # 3. Data quality filtering
            if filter_config.data_quality != DataQuality.ALL:
                current_df, step_stats = self._apply_data_quality_filter(current_df, filter_config.data_quality)
                filter_steps.append({'step': 'quality_filter', 'remaining': len(current_df), **step_stats})
            
            # 4. Alert level filtering
            if filter_config.alert_level != AlertLevel.ALL:
                current_df, step_stats = self._apply_alert_filter(current_df, filter_config.alert_level)
                filter_steps.append({'step': 'alert_filter', 'remaining': len(current_df), **step_stats})
            
            # 5. Outlier filtering
            if filter_config.exclude_outliers:
                current_df, step_stats = self._apply_outlier_filter(current_df, filter_config.outlier_threshold)
                filter_steps.append({'step': 'outlier_filter', 'remaining': len(current_df), **step_stats})
            
            # 6. Data completeness filtering
            if filter_config.min_data_completeness > 0:
                current_df, step_stats = self._apply_completeness_filter(current_df, filter_config.min_data_completeness)
                filter_steps.append({'step': 'completeness_filter', 'remaining': len(current_df), **step_stats})
            
            # Calculate final statistics
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            final_count = len(current_df)
            
            filter_stats = {
                'original_count': original_count,
                'final_count': final_count,
                'filtered_count': original_count - final_count,
                'retention_rate': round((final_count / original_count) * 100, 2) if original_count > 0 else 0,
                'processing_time_ms': round(processing_time, 2),
                'filter_steps': filter_steps,
                'applied_filters': self._get_applied_filters_summary(filter_config)
            }
            
            logger.info(f"[ADVANCED FILTER] Completed: {original_count} → {final_count} records "
                       f"({filter_stats['retention_rate']}% retention) in {processing_time:.1f}ms")
            
            return current_df, filter_stats
            
        except Exception as e:
            logger.error(f"[ADVANCED FILTER] Error applying filters: {e}", exc_info=True)
            return df, self._error_filter_stats(str(e))
    
    def _apply_parameter_filter(self, df: pd.DataFrame, parameters: List[str]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Filter to include only records with data for selected parameters"""
        if not parameters:
            return df, {'parameters_requested': [], 'parameters_found': []}
        
        available_params = [p for p in parameters if p in df.columns]
        
        if not available_params:
            return pd.DataFrame(), {'parameters_requested': parameters, 'parameters_found': []}
        
        # Create mask for records that have at least one non-null value for selected parameters
        param_mask = df[available_params].notna().any(axis=1)
        filtered_df = df[param_mask]
        
        # Calculate completeness for each parameter
        param_stats = {}
        for param in available_params:
            non_null_count = filtered_df[param].notna().sum()
            param_stats[param] = {
                'total_records': len(filtered_df),
                'non_null_count': int(non_null_count),
                'completeness_rate': round((non_null_count / len(filtered_df)) * 100, 2) if len(filtered_df) > 0 else 0
            }
        
        return filtered_df, {
            'parameters_requested': parameters,
            'parameters_found': available_params,
            'parameters_missing': list(set(parameters) - set(available_params)),
            'parameter_stats': param_stats
        }
    
    def _apply_parameter_range_filters(self, 
                                     df: pd.DataFrame, 
                                     parameter_ranges: Dict[str, ParameterRange]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Apply parameter value range filters"""
        if not parameter_ranges:
            return df, {'range_filters': {}}
        
        current_df = df.copy()
        range_stats = {}
        
        for param, range_config in parameter_ranges.items():
            if param not in current_df.columns:
                range_stats[param] = {'status': 'parameter_not_found'}
                continue
            
            original_count = current_df[param].notna().sum()
            param_mask = current_df[param].notna()  # Start with non-null values
            
            # Apply minimum filter
            if range_config.min_value is not None:
                param_mask &= (current_df[param] >= range_config.min_value)
            
            # Apply maximum filter
            if range_config.max_value is not None:
                param_mask &= (current_df[param] <= range_config.max_value)
            
            # Filter the DataFrame
            current_df = current_df[param_mask | current_df[param].isna()]  # Keep null values
            
            final_count = current_df[param].notna().sum()
            filtered_count = original_count - final_count
            
            range_stats[param] = {
                'min_value': range_config.min_value,
                'max_value': range_config.max_value,
                'original_count': int(original_count),
                'final_count': int(final_count),
                'filtered_count': int(filtered_count)
            }
        
        return current_df, {'range_filters': range_stats}
    
    def _apply_data_quality_filter(self, df: pd.DataFrame, quality_level: DataQuality) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Apply data quality filtering"""
        quality_stats = {'quality_level': quality_level.value}
        
        if quality_level == DataQuality.HIGH:
            key_params = ['temperature_c', 'conductivity_us_cm', 'water_level_m']
            available_key_params = [p for p in key_params if p in df.columns]
            
            if available_key_params:
                completeness_mask = df[available_key_params].notna().all(axis=1)
                filtered_df = df[completeness_mask]
                quality_stats['filter_criteria'] = 'complete_key_parameters'
            else:
                filtered_df = df
                quality_stats['filter_criteria'] = 'no_key_parameters_available'
                
        elif quality_level == DataQuality.VALIDATED:
            filtered_df = df
            quality_stats['filter_criteria'] = 'all_data_assumed_validated'
            
        elif quality_level == DataQuality.FLAGGED:
            filtered_df = self._identify_flagged_data(df)
            quality_stats['filter_criteria'] = 'flagged_data_only'
            
        else:  # DataQuality.ALL or DataQuality.MEDIUM
            filtered_df = df
            quality_stats['filter_criteria'] = 'no_quality_filtering'
        
        return filtered_df, quality_stats
    
    def _apply_alert_filter(self, df: pd.DataFrame, alert_level: AlertLevel) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Apply alert-based filtering"""
        alert_stats = {'alert_level': alert_level.value}
        
        if alert_level == AlertLevel.NO_ALERTS:
            filtered_df = self._filter_no_alerts(df)
            alert_stats['filter_criteria'] = 'no_alert_conditions'
            
        elif alert_level == AlertLevel.WITH_ALERTS:
            filtered_df = self._filter_with_alerts(df)
            alert_stats['filter_criteria'] = 'with_alert_conditions'
            
        elif alert_level == AlertLevel.CRITICAL_ONLY:
            filtered_df = self._filter_critical_alerts(df)
            alert_stats['filter_criteria'] = 'critical_alerts_only'
            
        else:  # AlertLevel.ALL
            filtered_df = df
            alert_stats['filter_criteria'] = 'no_alert_filtering'
        
        return filtered_df, alert_stats
    
    def _apply_outlier_filter(self, df: pd.DataFrame, threshold: float) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Remove statistical outliers from numeric parameters"""
        numeric_params = [col for col in df.columns if col in self.supported_parameters]
        outlier_stats = {'threshold': threshold, 'parameters_checked': numeric_params}
        
        if not numeric_params:
            return df, outlier_stats
        
        outlier_mask = pd.Series([False] * len(df))
        param_outlier_counts = {}
        
        for param in numeric_params:
            if param in df.columns and df[param].notna().sum() > 10:
                param_data = df[param].dropna()
                z_scores = abs((param_data - param_data.mean()) / param_data.std())
                param_outliers = z_scores > threshold
                param_outlier_indices = param_data[param_outliers].index
                outlier_mask.loc[param_outlier_indices] = True
                param_outlier_counts[param] = int(param_outliers.sum())
        
        filtered_df = df[~outlier_mask]
        
        outlier_stats.update({
            'total_outliers_removed': int(outlier_mask.sum()),
            'parameter_outlier_counts': param_outlier_counts
        })
        
        return filtered_df, outlier_stats
    
    def _apply_completeness_filter(self, df: pd.DataFrame, min_completeness: float) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """Filter records based on data completeness"""
        key_params = [col for col in df.columns if col in self.supported_parameters]
        
        if not key_params:
            return df, {'min_completeness': min_completeness, 'key_parameters': []}
        
        completeness_scores = df[key_params].notna().sum(axis=1) / len(key_params)
        completeness_mask = completeness_scores >= min_completeness
        filtered_df = df[completeness_mask]
        
        return filtered_df, {
            'min_completeness': min_completeness,
            'key_parameters': key_params,
            'records_meeting_threshold': int(completeness_mask.sum()),
            'average_completeness': round(completeness_scores.mean(), 3)
        }
    
    def _identify_flagged_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Identify data that should be flagged for quality issues"""
        flag_mask = pd.Series([False] * len(df))
        for param, config in self.parameter_definitions.items():
            if param in df.columns:
                param_mask = ( (df[param] < config['valid_min']) | (df[param] > config['valid_max']) )
                flag_mask |= param_mask
        return df[flag_mask]
    
    def _filter_no_alerts(self, df: pd.DataFrame) -> pd.DataFrame:
        """Filter to records without alert conditions"""
        alert_mask = pd.Series([False] * len(df))
        for param, config in self.parameter_definitions.items():
            if param in df.columns:
                param_mask = ( (df[param] < config['optimal_min']) | (df[param] > config['optimal_max']) )
                alert_mask |= param_mask
        return df[~alert_mask]
    
    def _filter_with_alerts(self, df: pd.DataFrame) -> pd.DataFrame:
        """Filter to records with alert conditions"""
        alert_mask = pd.Series([False] * len(df))
        for param, config in self.parameter_definitions.items():
            if param in df.columns:
                param_mask = ( (df[param] < config['optimal_min']) | (df[param] > config['optimal_max']) )
                alert_mask |= param_mask
        return df[alert_mask]
    
    def _filter_critical_alerts(self, df: pd.DataFrame) -> pd.DataFrame:
        """Filter to records with critical alert conditions"""
        critical_mask = pd.Series([False] * len(df))
        for param, config in self.parameter_definitions.items():
            if param in df.columns:
                critical_min = config['valid_min'] + (config['optimal_min'] - config['valid_min']) * 0.2
                critical_max = config['valid_max'] - (config['valid_max'] - config['optimal_max']) * 0.2
                param_mask = ( (df[param] < critical_min) | (df[param] > critical_max) )
                critical_mask |= param_mask
        return df[critical_mask]
    
    def _get_applied_filters_summary(self, config: AdvancedFilterConfig) -> Dict[str, Any]:
        """Generate summary of applied filters"""
        return {
            'sites_filtered': len(config.sites) > 0,
            'time_filtered': config.time_range != 'All Time',
            'parameters_filtered': len(config.parameters) > 0,
            'ranges_filtered': len(config.parameter_ranges) > 0,
            'quality_filtered': config.data_quality != DataQuality.ALL,
            'alerts_filtered': config.alert_level != AlertLevel.ALL,
            'outliers_filtered': config.exclude_outliers,
            'completeness_filtered': config.min_data_completeness > 0
        }
    
    def _empty_filter_stats(self) -> Dict[str, Any]:
        """Return empty filter statistics"""
        return {
            'original_count': 0,
            'final_count': 0,
            'filtered_count': 0,
            'retention_rate': 0,
            'processing_time_ms': 0,
            'filter_steps': [],
            'applied_filters': {}
        }
    
    def _error_filter_stats(self, error_message: str) -> Dict[str, Any]:
        """Return error filter statistics"""
        return {
            'error': True,
            'error_message': error_message,
            'original_count': 0,
            'final_count': 0,
            'retention_rate': 0,
            'processing_time_ms': 0
        }
    
    def parse_request_filters(self, request_args: dict) -> AdvancedFilterConfig:
        """
        Parse advanced filter parameters from Flask request
        """
        try:
            from utils.request_parsing import parse_sites_parameter
            from flask import current_app
            
            with current_app.test_request_context(query_string=dict(request_args)):
                sites = parse_sites_parameter(['S1', 'S2', 'S3'])
            time_range = request_args.get('time_range', 'Last 30 Days')
            start_date = self._parse_date(request_args.get('start_date'))
            end_date = self._parse_date(request_args.get('end_date'))
            
            parameters = self._parse_parameters(request_args)
            parameter_ranges = self._parse_parameter_ranges(request_args)
            data_quality = DataQuality(request_args.get('data_quality', 'all'))
            alert_level = AlertLevel(request_args.get('alert_level', 'all'))
            
            exclude_outliers = request_args.get('exclude_outliers', 'false').lower() == 'true'
            outlier_threshold = float(request_args.get('outlier_threshold', 3.0))
            min_data_completeness = float(request_args.get('min_completeness', 0.0))
            
            return AdvancedFilterConfig(
                sites=sites,
                time_range=time_range,
                start_date=start_date,
                end_date=end_date,
                parameters=parameters,
                parameter_ranges=parameter_ranges,
                data_quality=data_quality,
                alert_level=alert_level,
                exclude_outliers=exclude_outliers,
                outlier_threshold=outlier_threshold,
                min_data_completeness=min_data_completeness
            )
            
        except Exception as e:
            logger.error(f"Error parsing request filters: {e}")
            return AdvancedFilterConfig()  # Return default config
    
    def _parse_parameters(self, request_args: dict) -> List[str]:
        """Parse parameter selection from request"""
        params = request_args.getlist('parameters[]') or request_args.getlist('parameters') or []
        
        if not params:
            params_str = request_args.get('parameters', '')
            params = params_str.split(',') if params_str else []
        
        return [param.strip() for param in params if param.strip() in self.supported_parameters]
    
    def _parse_parameter_ranges(self, request_args: dict) -> Dict[str, ParameterRange]:
        """Parse parameter range filters from request"""
        ranges = {}
        
        for param in self.supported_parameters:
            min_key = f'{param}_min'
            max_key = f'{param}_max'
            
            min_val = request_args.get(min_key)
            max_val = request_args.get(max_key)
            
            if min_val is not None or max_val is not None:
                ranges[param] = ParameterRange(
                    parameter=param,
                    min_value=float(min_val) if min_val else None,
                    max_value=float(max_val) if max_val else None,
                    unit=self.parameter_definitions.get(param, {}).get('unit')
                )
        
        return ranges
    
    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to datetime object with flexible format support"""
        if not date_str:
            return None
        
        try:
            from utils.date_parsing import parse_flexible_date
            return parse_flexible_date(date_str)
        except Exception as e:
            logger.warning(f"[FILTER DATE PARSE] Could not parse date '{date_str}': {e}")
            return None


# Global service instance
advanced_filter_service = AdvancedFilterService()