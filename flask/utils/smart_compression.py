"""
Smart Compression Utilities
Optimized compression strategies for different data types in water quality monitoring
"""

import json
import gzip
import bz2
import lzma
import pickle
import logging
from typing import Dict, Any, Union, Tuple, Optional
from datetime import datetime
import numpy as np
import pandas as pd
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class CompressionMethod(Enum):
    """Available compression methods"""
    NONE = "none"
    GZIP = "gzip"
    BZ2 = "bz2"
    LZMA = "lzma"
    COLUMNAR = "columnar"
    NUMPY = "numpy"
    DELTA = "delta"

@dataclass
class CompressionResult:
    """Result of compression operation"""
    data: bytes
    method: CompressionMethod
    original_size: int
    compressed_size: int
    compression_ratio: float
    metadata: Dict[str, Any]

class SmartCompressor:
    """
    Intelligent data compressor that selects optimal compression strategy
    based on data type and characteristics
    """
    
    def __init__(self):
        self.compression_stats = {
            'total_compressions': 0,
            'total_original_bytes': 0,
            'total_compressed_bytes': 0,
            'method_usage': {method.value: 0 for method in CompressionMethod},
            'best_ratios': {}
        }
    
    def compress_json(self, data: Any, data_type: str = 'general') -> CompressionResult:
        """
        Compress JSON data with smart method selection based on data type
        
        Args:
            data: Data to compress (dict, list, etc.)
            data_type: Type hint for optimization ('time_series', 'spatial', 'general')
            
        Returns:
            CompressionResult with compressed data and metadata
        """
        original_json = json.dumps(data, separators=(',', ':'), default=str)
        original_size = len(original_json.encode('utf-8'))
        
        # Select best compression method based on data type and characteristics
        best_method = self._select_compression_method(data, data_type, original_size)
        
        try:
            if best_method == CompressionMethod.COLUMNAR:
                result = self._compress_columnar(data, original_size)
            elif best_method == CompressionMethod.NUMPY:
                result = self._compress_numpy(data, original_size)
            elif best_method == CompressionMethod.DELTA:
                result = self._compress_delta(data, original_size)
            elif best_method == CompressionMethod.GZIP:
                result = self._compress_gzip(original_json, original_size)
            elif best_method == CompressionMethod.BZ2:
                result = self._compress_bz2(original_json, original_size)
            elif best_method == CompressionMethod.LZMA:
                result = self._compress_lzma(original_json, original_size)
            else:
                # No compression
                result = CompressionResult(
                    data=original_json.encode('utf-8'),
                    method=CompressionMethod.NONE,
                    original_size=original_size,
                    compressed_size=original_size,
                    compression_ratio=1.0,
                    metadata={'data_type': data_type}
                )
        
        except Exception as e:
            logger.warning(f"Compression failed with {best_method.value}, falling back to gzip: {e}")
            result = self._compress_gzip(original_json, original_size)
        
        # Update statistics
        self._update_stats(result, data_type)
        
        logger.debug(f"Compressed {data_type} data: {original_size} -> {result.compressed_size} bytes "
                    f"({result.compression_ratio:.2f}x) using {result.method.value}")
        
        return result
    
    def decompress_json(self, result: CompressionResult) -> Any:
        """
        Decompress data back to original format
        
        Args:
            result: CompressionResult from compress_json
            
        Returns:
            Original data structure
        """
        try:
            if result.method == CompressionMethod.NONE:
                return json.loads(result.data.decode('utf-8'))
            elif result.method == CompressionMethod.GZIP:
                decompressed = gzip.decompress(result.data).decode('utf-8')
                return json.loads(decompressed)
            elif result.method == CompressionMethod.BZ2:
                decompressed = bz2.decompress(result.data).decode('utf-8')
                return json.loads(decompressed)
            elif result.method == CompressionMethod.LZMA:
                decompressed = lzma.decompress(result.data).decode('utf-8')
                return json.loads(decompressed)
            elif result.method == CompressionMethod.COLUMNAR:
                return self._decompress_columnar(result)
            elif result.method == CompressionMethod.NUMPY:
                return self._decompress_numpy(result)
            elif result.method == CompressionMethod.DELTA:
                return self._decompress_delta(result)
            else:
                raise ValueError(f"Unknown compression method: {result.method}")
                
        except Exception as e:
            logger.error(f"Decompression failed: {e}")
            raise
    
    def _select_compression_method(self, data: Any, data_type: str, original_size: int) -> CompressionMethod:
        """Select optimal compression method based on data characteristics"""
        
        # For small data, compression overhead isn't worth it
        if original_size < 1024:  # 1KB
            return CompressionMethod.NONE
        
        # Time series data - try columnar and delta compression
        if data_type == 'time_series' and isinstance(data, (list, dict)):
            if self._is_time_series_data(data):
                if original_size > 100000:  # 100KB - worth columnar compression
                    return CompressionMethod.COLUMNAR
                else:
                    return CompressionMethod.DELTA
        
        # Spatial data - numpy arrays work well
        if data_type == 'spatial' and self._is_numeric_heavy(data):
            return CompressionMethod.NUMPY
        
        # Large general data - use high compression
        if original_size > 500000:  # 500KB
            return CompressionMethod.LZMA
        elif original_size > 50000:  # 50KB
            return CompressionMethod.BZ2
        else:
            return CompressionMethod.GZIP
    
    def _is_time_series_data(self, data: Any) -> bool:
        """Check if data looks like time series"""
        try:
            if isinstance(data, list) and len(data) > 0:
                first_item = data[0]
                if isinstance(first_item, dict):
                    # Check for timestamp fields
                    timestamp_fields = ['timestamp', 'measurement_timestamp', 'datetime', 'time']
                    return any(field in first_item for field in timestamp_fields)
            elif isinstance(data, dict) and 'data' in data:
                return self._is_time_series_data(data['data'])
        except:
            pass
        return False
    
    def _is_numeric_heavy(self, data: Any) -> bool:
        """Check if data contains mostly numeric values"""
        try:
            if isinstance(data, list) and len(data) > 10:
                sample = data[:10]
                numeric_count = 0
                for item in sample:
                    if isinstance(item, dict):
                        for value in item.values():
                            if isinstance(value, (int, float)):
                                numeric_count += 1
                return numeric_count > len(sample) * 3  # More than 3 numeric fields per record on average
        except:
            pass
        return False
    
    def _compress_gzip(self, json_str: str, original_size: int) -> CompressionResult:
        """Standard gzip compression"""
        compressed = gzip.compress(json_str.encode('utf-8'), compresslevel=6)
        return CompressionResult(
            data=compressed,
            method=CompressionMethod.GZIP,
            original_size=original_size,
            compressed_size=len(compressed),
            compression_ratio=original_size / len(compressed),
            metadata={'compresslevel': 6}
        )
    
    def _compress_bz2(self, json_str: str, original_size: int) -> CompressionResult:
        """BZ2 compression for better ratios"""
        compressed = bz2.compress(json_str.encode('utf-8'), compresslevel=6)
        return CompressionResult(
            data=compressed,
            method=CompressionMethod.BZ2,
            original_size=original_size,
            compressed_size=len(compressed),
            compression_ratio=original_size / len(compressed),
            metadata={'compresslevel': 6}
        )
    
    def _compress_lzma(self, json_str: str, original_size: int) -> CompressionResult:
        """LZMA compression for highest ratios"""
        compressed = lzma.compress(json_str.encode('utf-8'), preset=6)
        return CompressionResult(
            data=compressed,
            method=CompressionMethod.LZMA,
            original_size=original_size,
            compressed_size=len(compressed),
            compression_ratio=original_size / len(compressed),
            metadata={'preset': 6}
        )
    
    def _compress_columnar(self, data: Any, original_size: int) -> CompressionResult:
        """
        Columnar compression for time series data
        Converts row-based to column-based format for better compression
        """
        try:
            if isinstance(data, dict) and 'data' in data:
                records = data['data']
            elif isinstance(data, list):
                records = data
            else:
                raise ValueError("Data format not suitable for columnar compression")
            
            if not records or not isinstance(records[0], dict):
                raise ValueError("Records must be list of dictionaries")
            
            # Convert to columnar format
            columns = {}
            for record in records:
                for key, value in record.items():
                    if key not in columns:
                        columns[key] = []
                    columns[key].append(value)
            
            # Compress each column separately
            compressed_columns = {}
            for col_name, col_data in columns.items():
                if self._is_timestamp_column(col_name):
                    # Special handling for timestamps
                    compressed_columns[col_name] = self._compress_timestamps(col_data)
                elif self._is_numeric_column(col_data):
                    # Numeric data compression
                    compressed_columns[col_name] = self._compress_numeric_column(col_data)
                else:
                    # String data
                    col_json = json.dumps(col_data, separators=(',', ':'))
                    compressed_columns[col_name] = gzip.compress(col_json.encode('utf-8'))
            
            # Serialize the compressed columnar data
            metadata = {
                'format': 'columnar',
                'columns': list(columns.keys()),
                'record_count': len(records),
                'original_format': 'rows'
            }
            
            result_data = {
                'compressed_columns': compressed_columns,
                'metadata': metadata
            }
            
            compressed = gzip.compress(pickle.dumps(result_data))
            
            return CompressionResult(
                data=compressed,
                method=CompressionMethod.COLUMNAR,
                original_size=original_size,
                compressed_size=len(compressed),
                compression_ratio=original_size / len(compressed),
                metadata=metadata
            )
            
        except Exception as e:
            logger.warning(f"Columnar compression failed: {e}")
            raise
    
    def _decompress_columnar(self, result: CompressionResult) -> Any:
        """Decompress columnar format back to row format"""
        try:
            # Decompress the pickled data
            data_dict = pickle.loads(gzip.decompress(result.data))
            compressed_columns = data_dict['compressed_columns']
            metadata = data_dict['metadata']
            
            # Decompress each column
            columns = {}
            for col_name, compressed_col in compressed_columns.items():
                if col_name in metadata.get('timestamp_columns', []):
                    columns[col_name] = self._decompress_timestamps(compressed_col)
                elif isinstance(compressed_col, dict) and 'method' in compressed_col:
                    # Numeric column
                    columns[col_name] = self._decompress_numeric_column(compressed_col)
                else:
                    # String column
                    col_json = gzip.decompress(compressed_col).decode('utf-8')
                    columns[col_name] = json.loads(col_json)
            
            # Convert back to row format
            records = []
            record_count = metadata['record_count']
            for i in range(record_count):
                record = {}
                for col_name, col_data in columns.items():
                    if i < len(col_data):
                        record[col_name] = col_data[i]
                records.append(record)
            
            return records
            
        except Exception as e:
            logger.error(f"Columnar decompression failed: {e}")
            raise
    
    def _compress_numpy(self, data: Any, original_size: int) -> CompressionResult:
        """Numpy-based compression for numeric data"""
        # Implementation would use numpy arrays for numeric data
        # Falling back to gzip for now
        return self._compress_gzip(json.dumps(data), original_size)
    
    def _decompress_numpy(self, result: CompressionResult) -> Any:
        """Decompress numpy format"""
        # Fallback implementation
        decompressed = gzip.decompress(result.data).decode('utf-8')
        return json.loads(decompressed)
    
    def _compress_delta(self, data: Any, original_size: int) -> CompressionResult:
        """Delta compression for sequential data"""
        # Implementation would use delta encoding for timestamps and sequential numeric data
        # Falling back to gzip for now
        return self._compress_gzip(json.dumps(data), original_size)
    
    def _decompress_delta(self, result: CompressionResult) -> Any:
        """Decompress delta format"""
        # Fallback implementation
        decompressed = gzip.decompress(result.data).decode('utf-8')
        return json.loads(decompressed)
    
    def _is_timestamp_column(self, col_name: str) -> bool:
        """Check if column contains timestamps"""
        timestamp_indicators = ['timestamp', 'time', 'datetime', 'date', 'created', 'updated']
        return any(indicator in col_name.lower() for indicator in timestamp_indicators)
    
    def _is_numeric_column(self, col_data: list) -> bool:
        """Check if column contains mostly numeric data"""
        if not col_data:
            return False
        
        numeric_count = 0
        for value in col_data[:min(10, len(col_data))]:  # Sample first 10 values
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                numeric_count += 1
        
        return numeric_count / min(10, len(col_data)) > 0.8  # 80% numeric
    
    def _compress_timestamps(self, timestamps: list) -> bytes:
        """Specialized timestamp compression"""
        try:
            # Convert to epoch seconds and use delta encoding
            epochs = []
            for ts in timestamps:
                if isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                    epochs.append(int(dt.timestamp()))
                elif isinstance(ts, (int, float)):
                    epochs.append(int(ts))
            
            # Delta encode
            if epochs:
                deltas = [epochs[0]]  # First value as-is
                for i in range(1, len(epochs)):
                    deltas.append(epochs[i] - epochs[i-1])
                
                # Compress deltas
                return gzip.compress(json.dumps(deltas).encode('utf-8'))
            
        except Exception as e:
            logger.warning(f"Timestamp compression failed: {e}")
        
        # Fallback to regular compression
        return gzip.compress(json.dumps(timestamps).encode('utf-8'))
    
    def _decompress_timestamps(self, compressed: bytes) -> list:
        """Decompress specialized timestamps"""
        try:
            deltas = json.loads(gzip.decompress(compressed).decode('utf-8'))
            if not deltas:
                return []
            
            # Reconstruct original values
            epochs = [deltas[0]]
            for i in range(1, len(deltas)):
                epochs.append(epochs[i-1] + deltas[i])
            
            # Convert back to ISO format
            timestamps = []
            for epoch in epochs:
                dt = datetime.fromtimestamp(epoch)
                timestamps.append(dt.isoformat())
            
            return timestamps
            
        except Exception as e:
            logger.warning(f"Timestamp decompression failed: {e}")
            # Fallback
            return json.loads(gzip.decompress(compressed).decode('utf-8'))
    
    def _compress_numeric_column(self, col_data: list) -> Dict[str, Any]:
        """Compress numeric column with quantization"""
        try:
            # Simple numeric compression - could be enhanced with quantization
            compressed = gzip.compress(json.dumps(col_data).encode('utf-8'))
            return {
                'method': 'gzip_numeric',
                'data': compressed
            }
        except Exception as e:
            logger.warning(f"Numeric compression failed: {e}")
            return {
                'method': 'raw',
                'data': col_data
            }
    
    def _decompress_numeric_column(self, compressed_col: Dict[str, Any]) -> list:
        """Decompress numeric column"""
        try:
            if compressed_col['method'] == 'gzip_numeric':
                return json.loads(gzip.decompress(compressed_col['data']).decode('utf-8'))
            else:
                return compressed_col['data']
        except Exception as e:
            logger.error(f"Numeric decompression failed: {e}")
            return []
    
    def _update_stats(self, result: CompressionResult, data_type: str):
        """Update compression statistics"""
        self.compression_stats['total_compressions'] += 1
        self.compression_stats['total_original_bytes'] += result.original_size
        self.compression_stats['total_compressed_bytes'] += result.compressed_size
        self.compression_stats['method_usage'][result.method.value] += 1
        
        # Track best ratios by data type
        if data_type not in self.compression_stats['best_ratios']:
            self.compression_stats['best_ratios'][data_type] = {}
        
        method_key = result.method.value
        if (method_key not in self.compression_stats['best_ratios'][data_type] or
            result.compression_ratio > self.compression_stats['best_ratios'][data_type][method_key]):
            self.compression_stats['best_ratios'][data_type][method_key] = result.compression_ratio
    
    def get_stats(self) -> Dict[str, Any]:
        """Get compression statistics"""
        total_original = self.compression_stats['total_original_bytes']
        total_compressed = self.compression_stats['total_compressed_bytes']
        
        overall_ratio = (total_original / total_compressed) if total_compressed > 0 else 1.0
        
        return {
            'total_compressions': self.compression_stats['total_compressions'],
            'total_original_mb': round(total_original / 1024 / 1024, 2),
            'total_compressed_mb': round(total_compressed / 1024 / 1024, 2),
            'overall_compression_ratio': round(overall_ratio, 2),
            'space_saved_mb': round((total_original - total_compressed) / 1024 / 1024, 2),
            'method_usage': self.compression_stats['method_usage'],
            'best_ratios_by_type': self.compression_stats['best_ratios']
        }

# Global smart compressor instance
smart_compressor = SmartCompressor()