"""
Optimized Serializer for Flask Migration
"""

import pandas as pd
from typing import List, Dict, Any
import json

def serialize_dataframe_optimized(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Optimized DataFrame serialization"""
    if df.empty:
        return []
    
    # Convert DataFrame to records with optimized serialization
    records = df.to_dict('records')
    
    # Handle datetime serialization
    for record in records:
        for key, value in record.items():
            if pd.isna(value):
                record[key] = None
            elif hasattr(value, 'isoformat'):  # datetime objects
                record[key] = value.isoformat()
    
    return records