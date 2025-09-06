"""
Configuration Service for Flask Migration
"""

from typing import Dict, Any

class ConfigService:
    """Simple configuration service"""
    
    def __init__(self):
        self.time_ranges = {
            'Last 7 Days': 7,
            'Last 30 Days': 30,
            'Last 90 Days': 90,
            'Last 6 Months': 180,
            'Last 1 Year': 365,
            'Last 2 Years': 730,
            'Custom Range': 30  # Default fallback
        }
        # Visualization defaults for Redox pages (server-configurable)
        self.redox_resolution_by_range = {
            # Finer resolutions for shorter ranges
            'Last 7 Days': '15min',   # 96 points/day
            'Last 30 Days': '30min',  # 48 points/day
            'Last 90 Days': '2H',     # 12 points/day
            'Last 6 Months': '6H',    # 4 points/day
            # Ensure at least 12 points/day for last 1 year
            'Last 1 Year': '2H',
            'Last 2 Years': '1W'
        }
        # Ranges that should use chunked streaming by default
        self.redox_chunk_ranges = ['Last 90 Days', 'Last 6 Months', 'Last 1 Year', 'Last 2 Years']
        # Default cap for auto-selected depths per site
        self.redox_max_depths_default = 10
        # Target points budget after resampling (server can thin beyond this)
        self.redox_target_points_default = 50000
    
    def get_days_back_for_range(self, time_range: str) -> int:
        """Get number of days for a time range"""
        return self.time_ranges.get(time_range, 30)
    
    def get_time_ranges(self) -> Dict[str, int]:
        """Get all available time ranges"""
        return self.time_ranges

    def get_all_config(self) -> Dict[str, Any]:
        """Return consolidated configuration for clients"""
        return {
            'time_ranges': self.get_time_ranges(),
            'redox_settings': {
                'resolution_by_range': self.redox_resolution_by_range,
                'chunk_ranges': self.redox_chunk_ranges,
                'max_depths_default': self.redox_max_depths_default,
                'target_points_default': self.redox_target_points_default
            }
        }

    def get_redox_settings(self) -> Dict[str, Any]:
        return {
            'resolution_by_range': self.redox_resolution_by_range,
            'chunk_ranges': self.redox_chunk_ranges,
            'max_depths_default': self.redox_max_depths_default,
            'target_points_default': self.redox_target_points_default
        }

# Global config service instance
config_service = ConfigService()
