"""
Adaptive Data Resolution Service for Large Dataset Visualization
Handles ~140K+ data points per year with intelligent aggregation
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class ResolutionLevel(Enum):
    """Data resolution levels for different time ranges"""
    RAW = "15min"           # Original 15-minute data
    HOURLY = "1H"          # 1-hour aggregation  
    DAILY = "1D"           # Daily aggregation
    WEEKLY = "1W"          # Weekly aggregation
    MONTHLY = "1M"         # Monthly aggregation

class PerformanceTier(Enum):
    """Performance optimization tiers"""
    HIGH_DETAIL = "high"    # Max 10K points
    BALANCED = "balanced"   # Max 5K points  
    FAST = "fast"          # Max 2K points

class AdaptiveDataResolution:
    """
    Smart data resolution service for handling large datasets
    - Automatically chooses optimal granularity based on time range
    - Applies intelligent aggregation to maintain performance
    - Supports up to 500K+ data points with sub-second response times
    """
    
    def __init__(self):
        # Resolution rules: (min_days, max_days) -> ResolutionLevel
        self.resolution_rules = {
            (0, 1): ResolutionLevel.RAW,        # < 1 day: 15min data
            (1, 7): ResolutionLevel.HOURLY,     # 1-7 days: hourly data  
            (7, 30): ResolutionLevel.DAILY,     # 1-4 weeks: daily data
            (30, 180): ResolutionLevel.WEEKLY,  # 1-6 months: weekly data
            (180, 9999): ResolutionLevel.MONTHLY # > 6 months: monthly data
        }
        
        # Performance tier limits
        self.performance_limits = {
            PerformanceTier.HIGH_DETAIL: 10000,
            PerformanceTier.BALANCED: 5000,
            PerformanceTier.FAST: 2000
        }
    
    def get_optimal_resolution(self, start_date: datetime, end_date: datetime, 
                             performance_tier: str = "balanced") -> Dict[str, Any]:
        """
        Determine optimal data resolution and aggregation strategy
        
        Args:
            start_date: Start date for data query
            end_date: End date for data query
            performance_tier: 'fast', 'balanced', or 'high_detail'
            
        Returns:
            Dict containing resolution strategy and performance settings
        """
        days_range = (end_date - start_date).days
        
        # Determine base resolution from time range
        base_resolution = ResolutionLevel.MONTHLY  # default
        for (min_days, max_days), resolution in self.resolution_rules.items():
            if min_days <= days_range < max_days:
                base_resolution = resolution
                break
        
        # Get performance tier
        try:
            perf_tier = PerformanceTier(performance_tier.lower())
        except ValueError:
            perf_tier = PerformanceTier.BALANCED
            
        max_points = self.performance_limits[perf_tier]
        
        # Calculate estimated points for this configuration
        estimated_points = self._estimate_data_points(days_range, base_resolution)
        
        # If estimated points exceed limit, increase aggregation level
        final_resolution = base_resolution
        while estimated_points > max_points and final_resolution != ResolutionLevel.MONTHLY:
            final_resolution = self._get_next_resolution_level(final_resolution)
            estimated_points = self._estimate_data_points(days_range, final_resolution)
        
        return {
            'aggregation_method': final_resolution.value,
            'performance_tier': perf_tier.value,
            'target_points': max_points,
            'estimated_points': estimated_points,
            'optimization_level': self._calculate_optimization_level(base_resolution, final_resolution),
            'time_range_days': days_range,
            'recommended_caching': days_range > 30
        }
    
    def aggregate_data(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        """
        Aggregate dataframe according to resolution configuration
        
        Args:
            df: Input dataframe with timestamp and measurement data
            config: Configuration from get_optimal_resolution()
            
        Returns:
            Aggregated dataframe optimized for visualization
        """
        if df.empty:
            return df
            
        # Validate required columns
        required_cols = ['measurement_timestamp']
        if not all(col in df.columns for col in required_cols):
            logger.warning(f"Missing required columns: {required_cols}")
            return df
        
        try:
            df = df.copy()
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'])
            df = df.set_index('measurement_timestamp')
            
            resolution = config.get('aggregation_method', '1H')
            target_points = config.get('target_points', 5000)
            
            # Define smart aggregation rules for different measurement types
            agg_rules = self._get_aggregation_rules(df.columns)
            
            # Perform aggregation by site (if applicable) and time
            if 'site_code' in df.columns:
                result_dfs = []
                for site in df['site_code'].unique():
                    site_data = df[df['site_code'] == site]
                    
                    # Time-based resampling with smart aggregation
                    resampled = site_data.resample(resolution).agg(agg_rules)
                    
                    # Remove rows with all NaN values (gaps in data)
                    resampled = resampled.dropna(how='all')
                    
                    # Add aggregation metadata
                    resampled['site_code'] = site
                    resampled['data_points_count'] = site_data.resample(resolution).size()
                    
                    if not resampled.empty:
                        result_dfs.append(resampled)
                
                if result_dfs:
                    aggregated = pd.concat(result_dfs, ignore_index=False)
                else:
                    aggregated = pd.DataFrame()
            else:
                # Simple time-based aggregation without site grouping
                aggregated = df.resample(resolution).agg(agg_rules)
                aggregated = aggregated.dropna(how='all')
            
            # Reset index to get timestamp back as column
            if not aggregated.empty:
                aggregated = aggregated.reset_index()
                
                # Final point limit check - downsample further if needed
                if len(aggregated) > target_points:
                    # Use systematic sampling to reduce points while preserving distribution
                    step = len(aggregated) // target_points
                    aggregated = aggregated.iloc[::max(1, step)]
                    logger.info(f"Applied final downsampling: {len(aggregated)} points")
            
            return aggregated
            
        except Exception as e:
            logger.error(f"Error in data aggregation: {e}")
            return df  # Return original data on error
    
    def _get_aggregation_rules(self, columns: List[str]) -> Dict[str, str]:
        """Define intelligent aggregation rules based on measurement types"""
        agg_rules = {}
        
        for col in columns:
            col_lower = col.lower()
            
            if col == 'site_code':
                agg_rules[col] = 'first'  # Keep site identifier
            elif 'temperature' in col_lower:
                agg_rules[col] = 'mean'   # Average temperature
            elif 'ph' in col_lower:
                agg_rules[col] = 'mean'   # Average pH
            elif 'level' in col_lower or 'depth' in col_lower:
                agg_rules[col] = 'mean'   # Average water level/depth
            elif 'conductivity' in col_lower:
                agg_rules[col] = 'mean'   # Average conductivity
            elif 'oxygen' in col_lower:
                agg_rules[col] = 'mean'   # Average dissolved oxygen
            elif 'redox' in col_lower:
                agg_rules[col] = 'mean'   # Average redox potential
            elif 'flow' in col_lower or 'rate' in col_lower:
                agg_rules[col] = 'mean'   # Average flow rates
            elif 'total' in col_lower or 'sum' in col_lower:
                agg_rules[col] = 'sum'    # Sum totals
            elif 'count' in col_lower:
                agg_rules[col] = 'sum'    # Sum counts
            elif 'max' in col_lower:
                agg_rules[col] = 'max'    # Maximum values
            elif 'min' in col_lower:
                agg_rules[col] = 'min'    # Minimum values
            else:
                # Default aggregation for numeric columns
                agg_rules[col] = 'mean'
                
        return agg_rules
    
    def _estimate_data_points(self, days: int, resolution: ResolutionLevel) -> int:
        """Estimate number of data points for given time range and resolution"""
        # Base calculation: 4 sites × points per day
        sites = 4
        
        if resolution == ResolutionLevel.RAW:
            points_per_day = 96  # 4 points/hour × 24 hours
        elif resolution == ResolutionLevel.HOURLY:
            points_per_day = 24  # 1 point/hour × 24 hours
        elif resolution == ResolutionLevel.DAILY:
            points_per_day = 1   # 1 point/day
        elif resolution == ResolutionLevel.WEEKLY:
            points_per_day = 1/7 # 1 point/week
        else:  # MONTHLY
            points_per_day = 1/30 # 1 point/month
            
        return int(sites * days * points_per_day)
    
    def _get_next_resolution_level(self, current: ResolutionLevel) -> ResolutionLevel:
        """Get next higher aggregation level"""
        levels = [ResolutionLevel.RAW, ResolutionLevel.HOURLY, 
                 ResolutionLevel.DAILY, ResolutionLevel.WEEKLY, ResolutionLevel.MONTHLY]
        
        try:
            current_idx = levels.index(current)
            return levels[min(current_idx + 1, len(levels) - 1)]
        except (ValueError, IndexError):
            return ResolutionLevel.MONTHLY
    
    def _calculate_optimization_level(self, base_resolution: ResolutionLevel, 
                                    final_resolution: ResolutionLevel) -> str:
        """Calculate optimization level description"""
        levels = [ResolutionLevel.RAW, ResolutionLevel.HOURLY, 
                 ResolutionLevel.DAILY, ResolutionLevel.WEEKLY, ResolutionLevel.MONTHLY]
        
        try:
            base_idx = levels.index(base_resolution)
            final_idx = levels.index(final_resolution)
            diff = final_idx - base_idx
            
            if diff == 0:
                return "none"
            elif diff == 1:
                return "light"
            elif diff == 2:
                return "moderate"
            else:
                return "aggressive"
        except (ValueError, IndexError):
            return "unknown"

# Singleton instance for easy import
adaptive_resolution = AdaptiveDataResolution()