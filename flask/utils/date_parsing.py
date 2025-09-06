"""
Flexible Date Parsing Utilities
Handles multiple date formats from frontend components
"""

from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def parse_flexible_date(date_str):
    """
    Parse date string in multiple formats from frontend components
    
    Supports:
    - ISO format: 2024-05-31T10:30:00 or 2024-05-31T10:30:00.000Z
    - HTML5 date input: 2024-05-31 (YYYY-MM-DD)
    - ISO without T: 2024-05-31 10:30:00
    
    Args:
        date_str (str): Date string to parse
        
    Returns:
        datetime: Parsed datetime object or None if parsing fails
    """
    if not date_str:
        return None
        
    try:
        # Try ISO format first (2024-05-31T10:30:00 or 2024-05-31T10:30:00.000Z)
        if 'T' in date_str:
            # Handle timezone Z suffix
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        # Handle YYYY-MM-DD format from HTML5 date inputs
        elif len(date_str) == 10 and date_str.count('-') == 2:
            return datetime.strptime(date_str, '%Y-%m-%d')
        # Try ISO format without T
        else:
            return datetime.fromisoformat(date_str)
    except (ValueError, TypeError) as e:
        logger.warning(f"⚠️ [DATE PARSE] Could not parse date '{date_str}': {e}")
        return None

def parse_date_range(start_date_str, end_date_str, inclusive_end=True):
    """
    Parse start and end date strings into datetime objects
    
    Args:
        start_date_str (str): Start date string
        end_date_str (str): End date string  
        inclusive_end (bool): If True, set end_date to end of day (23:59:59)
        
    Returns:
        tuple: (start_date, end_date) as datetime objects
    """
    start_date = parse_flexible_date(start_date_str)
    end_date = parse_flexible_date(end_date_str)
    
    # If we have end_date from HTML5 date picker, set it to end of day for inclusive range
    if inclusive_end and end_date and end_date_str and len(end_date_str) == 10:
        end_date = end_date.replace(hour=23, minute=59, second=59)
    
    return start_date, end_date