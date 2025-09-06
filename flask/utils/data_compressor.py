"""
Data Compression Utilities for Performance Optimization
"""

import gzip
import pickle
import json
import logging
from typing import Any, Dict, Union
import pandas as pd

logger = logging.getLogger(__name__)

class DataCompressor:
    """Compress data for faster transfers and storage"""
    
    @staticmethod
    def compress_dataframe(df: pd.DataFrame, method: str = 'gzip') -> bytes:
        """Compress pandas DataFrame"""
        try:
            # Convert to efficient format
            data = {
                'values': df.values.tolist(),
                'columns': df.columns.tolist(),
                'index': df.index.tolist()
            }
            
            # Serialize and compress
            serialized = pickle.dumps(data)
            
            if method == 'gzip':
                compressed = gzip.compress(serialized, compresslevel=6)
            else:
                compressed = serialized
                
            compression_ratio = len(serialized) / len(compressed) if len(compressed) > 0 else 1
            logger.debug(f"📦 Compressed DataFrame: {compression_ratio:.1f}x reduction")
            
            return compressed
        except Exception as e:
            logger.error(f"Compression failed: {e}")
            # Return original data as pickle if compression fails
            return pickle.dumps(df)
    
    @staticmethod
    def decompress_dataframe(compressed_data: bytes) -> pd.DataFrame:
        """Decompress to pandas DataFrame"""
        try:
            # Try gzip decompression first
            try:
                decompressed = gzip.decompress(compressed_data)
                data = pickle.loads(decompressed)
            except (gzip.BadGzipFile, pickle.UnpicklingError, EOFError) as e:
                # Fallback to direct pickle if not compressed
                logger.debug(f"Gzip decompression failed, trying direct pickle: {e}")
                data = pickle.loads(compressed_data)
            
            # Reconstruct DataFrame
            if isinstance(data, dict) and 'values' in data:
                df = pd.DataFrame(
                    data['values'],
                    columns=data['columns'],
                    index=data['index']
                )
            else:
                df = data
                
            return df
        except Exception as e:
            logger.error(f"Decompression failed: {e}")
            return pd.DataFrame()
    
    @staticmethod
    def compress_json(data: Dict[str, Any]) -> bytes:
        """Compress JSON data"""
        try:
            json_str = json.dumps(data, separators=(',', ':'))
            compressed = gzip.compress(json_str.encode('utf-8'), compresslevel=6)
            
            compression_ratio = len(json_str) / len(compressed) if len(compressed) > 0 else 1
            logger.debug(f"📦 Compressed JSON: {compression_ratio:.1f}x reduction")
            
            return compressed
        except Exception as e:
            logger.error(f"JSON compression failed: {e}")
            return json.dumps(data).encode('utf-8')
    
    @staticmethod
    def decompress_json(compressed_data: bytes) -> Dict[str, Any]:
        """Decompress JSON data"""
        try:
            decompressed = gzip.decompress(compressed_data)
            return json.loads(decompressed.decode('utf-8'))
        except (gzip.BadGzipFile, json.JSONDecodeError, UnicodeDecodeError) as e:
            # Fallback to direct JSON parse if not compressed
            logger.debug(f"Gzip decompression failed, trying direct JSON: {e}")
            return json.loads(compressed_data.decode('utf-8'))

# Global compressor instance
compressor = DataCompressor()