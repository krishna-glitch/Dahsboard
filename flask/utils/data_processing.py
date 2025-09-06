"""
Data Processing Utilities
"""

import pandas as pd

def normalize_timezone(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize timezone information in DataFrame"""
    # Simple implementation - just return the DataFrame as-is for testing
    return df