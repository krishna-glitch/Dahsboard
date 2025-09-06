"""
Mock Data Generator for Testing
Provides sample water quality and redox data for development and testing
"""

import random
from datetime import datetime, timedelta
from typing import List, Dict, Any

class MockDataGenerator:
    """Generates realistic mock data for water quality monitoring system"""
    
    def __init__(self):
        self.sites = ['S1', 'S2', 'S3', 'S4']
        self.base_time = datetime.now() - timedelta(days=90)
        
    def generate_water_quality_data(self, 
                                  sites: List[str] = None, 
                                  days_back: int = 30, 
                                  records_per_day: int = 4) -> List[Dict[str, Any]]:
        """Generate mock water quality data"""
        if not sites:
            sites = self.sites[:2]  # Default to first 2 sites
            
        data = []
        start_time = datetime.now() - timedelta(days=days_back)
        
        for site in sites:
            # Base values for each site (slightly different per site)
            base_values = {
                'S1': {'temperature_c': 18.5, 'conductivity_us_cm': 450, 'water_level_m': 2.1},
                'S2': {'temperature_c': 19.2, 'conductivity_us_cm': 520, 'water_level_m': 1.8},
                'S3': {'temperature_c': 17.8, 'conductivity_us_cm': 380, 'water_level_m': 2.5},
                'S4': {'temperature_c': 20.1, 'conductivity_us_cm': 600, 'water_level_m': 1.6},
            }
            
            site_base = base_values.get(site, base_values['S1'])
            
            for day in range(days_back):
                current_date = start_time + timedelta(days=day)
                
                for record in range(records_per_day):
                    timestamp = current_date + timedelta(hours=record * 6)  # Every 6 hours
                    
                    # Add realistic variations
                    data.append({
                        'measurement_timestamp': timestamp.isoformat(),
                        'site_code': site,
                        'temperature_c': round(site_base['temperature_c'] + random.uniform(-2, 2), 1),
                        'conductivity_us_cm': round(site_base['conductivity_us_cm'] + random.uniform(-50, 50)),
                        'water_level_m': round(site_base['water_level_m'] + random.uniform(-0.3, 0.3), 2),
                        'quality_flag': random.choice(['Good', 'Good', 'Good', 'Fair', 'Poor'])  # Weighted towards Good
                    })
        
        return data
    
    def generate_redox_data(self, 
                          sites: List[str] = None, 
                          days_back: int = 30, 
                          records_per_day: int = 2) -> List[Dict[str, Any]]:
        """Generate mock redox data"""
        if not sites:
            sites = self.sites[:2]
            
        data = []
        start_time = datetime.now() - timedelta(days=days_back)
        
        for site in sites:
            # Base redox values for each site
            base_values = {
                'S1': {'redox_value_mv': 250, 'depth_cm': 150},
                'S2': {'redox_value_mv': 280, 'depth_cm': 120},
                'S3': {'redox_value_mv': 220, 'depth_cm': 180},
                'S4': {'redox_value_mv': 300, 'depth_cm': 100},
            }
            
            site_base = base_values.get(site, base_values['S1'])
            
            for day in range(days_back):
                current_date = start_time + timedelta(days=day)
                
                for record in range(records_per_day):
                    timestamp = current_date + timedelta(hours=record * 12)  # Every 12 hours
                    
                    data.append({
                        'measurement_timestamp': timestamp.isoformat(),
                        'site_code': site,
                        'redox_value_mv': round(site_base['redox_value_mv'] + random.uniform(-50, 50)),
                        'depth_cm': round(site_base['depth_cm'] + random.uniform(-20, 20)),
                    })
        
        return data
    
    def generate_site_comparison_data(self, 
                                    sites: List[str] = None, 
                                    time_range: str = "Last 30 Days") -> Dict[str, Any]:
        """Generate complete site comparison data"""
        if not sites:
            sites = self.sites[:2]
        
        # Parse time range
        days_map = {
            "Last 30 Days": 30,
            "Last 90 Days": 90,
            "Last 1 Year": 365
        }
        days_back = days_map.get(time_range, 30)
        
        water_quality_data = self.generate_water_quality_data(sites, days_back)
        redox_data = self.generate_redox_data(sites, days_back)
        
        return {
            'water_quality_data': water_quality_data,
            'redox_data': redox_data,
            'metadata': {
                'sites': sites,
                'time_range': time_range,
                'has_data': True,
                'total_records': len(water_quality_data) + len(redox_data),
                'wq_record_count': len(water_quality_data),
                'redox_record_count': len(redox_data),
                'has_wq_data': len(water_quality_data) > 0,
                'has_redox_data': len(redox_data) > 0,
                'water_quality_columns': ['temperature_c', 'conductivity_us_cm', 'water_level_m'],
                'redox_columns': ['redox_value_mv', 'depth_cm'],
                'last_updated': datetime.now().isoformat()
            }
        }

# Singleton instance
mock_generator = MockDataGenerator()
