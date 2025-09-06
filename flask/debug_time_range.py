#!/usr/bin/env python3
"""
Debug time range calculation
"""

import sys
from datetime import datetime, timedelta
sys.path.insert(0, '/home/skrishna/migration/flask')

from services.config_service import config_service

def test_time_ranges():
    """Test different time range calculations"""
    print("Testing time range calculations...")
    
    time_ranges = [
        "Last 30 Days",
        "Last 90 Days", 
        "Last 1 Year",
        None
    ]
    
    for time_range in time_ranges:
        try:
            days_back = config_service.get_days_back_for_range(time_range)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            
            print(f"\n{time_range or 'None'}:")
            print(f"  Days back: {days_back}")
            print(f"  Start date: {start_date}")
            print(f"  End date: {end_date}")
            
        except Exception as e:
            print(f"❌ Error with {time_range}: {e}")

if __name__ == "__main__":
    test_time_ranges()