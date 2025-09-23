"""
Simplified Filter Service - Essential filtering only
Replaces advanced_filter_service.py with streamlined approach
"""

import pandas as pd
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

from config.improved_logging_config import get_smart_logger, LogCategory

logger = get_smart_logger(__name__, LogCategory.API)

@dataclass
class SimpleFilterConfig:
    """Simplified filter configuration with only essential parameters"""
    # Basic filters (essential)
    sites: List[str] = None
    time_range: str = "Last 30 Days"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    # Parameter selection (essential)
    parameters: List[str] = None  # Which water quality parameters to include

    def __post_init__(self):
        if self.sites is None:
            self.sites = []
        if self.parameters is None:
            self.parameters = []

class SimpleFilterService:
    """
    Simplified filter service with only essential functionality
    Replaces the complex advanced filter service
    """

    def __init__(self):
        # Supported water quality parameters
        self.supported_parameters = [
            'temperature_c',
            'conductivity_us_cm',
            'water_level_m'
        ]

    def apply_simple_filters(self, df: pd.DataFrame, filter_config: SimpleFilterConfig) -> tuple[pd.DataFrame, dict]:
        """
        Apply simplified filters to water quality data

        Args:
            df: Water quality DataFrame
            filter_config: Simple filter configuration

        Returns:
            Tuple of (filtered DataFrame, filter statistics)
        """
        if df.empty:
            return df, {'retention_rate': 100, 'records_filtered': 0, 'records_remaining': 0}

        filtered_df = df.copy()

        # 1. Site filtering
        if filter_config.sites:
            if 'site_code' in filtered_df.columns:
                filtered_df = filtered_df[filtered_df['site_code'].isin(filter_config.sites)]
            elif 'site' in filtered_df.columns:
                filtered_df = filtered_df[filtered_df['site'].isin(filter_config.sites)]

        # 2. Time filtering (handled by API endpoints, but included for completeness)
        if filter_config.start_date and filter_config.end_date:
            if 'measurement_timestamp' in filtered_df.columns:
                # Convert string timestamps to datetime objects for comparison
                try:
                    timestamps = pd.to_datetime(filtered_df['measurement_timestamp'])
                    time_mask = (
                        (timestamps >= filter_config.start_date) &
                        (timestamps <= filter_config.end_date)
                    )
                    filtered_df = filtered_df[time_mask]
                except Exception as e:
                    logger.warning(f"Time filtering failed: {e}")
                    # Skip time filtering if conversion fails

        # 3. Parameter selection (column filtering)
        if filter_config.parameters:
            # Keep essential columns plus selected parameters
            essential_cols = ['measurement_timestamp', 'site_code', 'site']
            essential_cols = [col for col in essential_cols if col in filtered_df.columns]

            # Add selected parameters
            selected_cols = essential_cols.copy()
            for param in filter_config.parameters:
                if param in filtered_df.columns:
                    selected_cols.append(param)

            filtered_df = filtered_df[selected_cols]

        # Calculate filter statistics
        original_count = len(df)
        filtered_count = len(filtered_df)
        retention_rate = (filtered_count / original_count * 100) if original_count > 0 else 100

        filter_stats = {
            'retention_rate': round(retention_rate, 1),
            'records_filtered': original_count - filtered_count,
            'records_remaining': filtered_count,
            'original_count': original_count
        }

        logger.debug(f"Filtered from {original_count} to {filtered_count} records ({retention_rate:.1f}% retention)")
        return filtered_df, filter_stats

    def apply_filters(self, df: pd.DataFrame, filter_config: SimpleFilterConfig) -> tuple[pd.DataFrame, dict]:
        """
        Alias for apply_simple_filters to maintain backward compatibility
        """
        return self.apply_simple_filters(df, filter_config)

    def parse_request_filters(self, request_args: dict) -> SimpleFilterConfig:
        """
        Parse simple filter parameters from Flask request

        Args:
            request_args: Flask request.args dictionary

        Returns:
            SimpleFilterConfig object
        """
        try:
            # Parse basic filters
            from utils.request_parsing import parse_sites_parameter
            from flask import current_app

            # Create a mock request context to use the centralized parser
            with current_app.test_request_context(query_string=dict(request_args)):
                sites = parse_sites_parameter(['S1', 'S2', 'S3'])

            time_range = request_args.get('time_range', 'Last 30 Days')
            start_date = self._parse_date(request_args.get('start_date'))
            end_date = self._parse_date(request_args.get('end_date'))

            # Parse parameter selection
            parameters = self._parse_parameters(request_args)

            return SimpleFilterConfig(
                sites=sites,
                time_range=time_range,
                start_date=start_date,
                end_date=end_date,
                parameters=parameters
            )

        except Exception as e:
            logger.warning(f"Filter parsing failed, using defaults: {e}")
            return SimpleFilterConfig()

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to datetime object"""
        if not date_str:
            return None

        try:
            # Handle ISO format
            if 'T' in date_str:
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                return datetime.strptime(date_str, '%Y-%m-%d')
        except Exception:
            return None

    def _parse_parameters(self, request_args: dict) -> List[str]:
        """Parse selected parameters from request"""
        parameters_str = request_args.get('parameters', '')
        if not parameters_str:
            return []

        # Parse comma-separated parameters
        try:
            parameters = [p.strip() for p in parameters_str.split(',') if p.strip()]
            # Filter to supported parameters only
            return [p for p in parameters if p in self.supported_parameters]
        except Exception:
            return []

    def get_filter_summary(self, config: SimpleFilterConfig) -> Dict[str, Any]:
        """Get summary of applied filters"""
        return {
            'sites_count': len(config.sites),
            'sites': config.sites,
            'time_range': config.time_range,
            'custom_dates': bool(config.start_date and config.end_date),
            'parameters_filtered': len(config.parameters) > 0,
            'selected_parameters': config.parameters
        }

# Global service instance
simple_filter_service = SimpleFilterService()

# Backward compatibility alias
advanced_filter_service = simple_filter_service