"""
Optimized DataFrame Processor with High-Performance Data Structures
Efficient memory management and processing for large DataFrames using advanced data structures
"""

import logging
import time
import gc
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Dict, Any, List, Optional, Union, Tuple, Generator
import pandas as pd
import numpy as np
from functools import wraps
import weakref
import threading

logger = logging.getLogger(__name__)

@dataclass
class DataFrameStats:
    """Efficient tracking of DataFrame statistics"""
    memory_usage_mb: float
    row_count: int
    column_count: int
    dtypes_optimized: int
    memory_reduction_percent: float
    processing_time_ms: float

class OptimizedDataFrameProcessor:
    """High-performance DataFrame processor with memory optimization"""
    
    def __init__(self, memory_threshold_mb: int = 100):
        self.memory_threshold_mb = memory_threshold_mb
        self.memory_threshold_bytes = memory_threshold_mb * 1024 * 1024
        
        # Efficient storage for optimization history
        self.optimization_history: deque = deque(maxlen=1000)
        
        # Type optimization cache - prevents repeated analysis
        self.dtype_optimization_cache: Dict[str, Dict] = {}
        
        # Column pattern recognition for efficient processing
        self.column_patterns: defaultdict[str, List[str]] = defaultdict(list)
        
        # Weak references to processed DataFrames for memory tracking
        self._processed_dataframes: weakref.WeakSet = weakref.WeakSet()
        
        # Thread-safe operations
        self._lock = threading.Lock()
        
        logger.info(f"OptimizedDataFrameProcessor initialized with {memory_threshold_mb}MB threshold")
    
    def optimize_dataframe(self, df: pd.DataFrame, 
                          aggressive: bool = False,
                          preserve_index: bool = True) -> Tuple[pd.DataFrame, DataFrameStats]:
        """Optimize DataFrame memory usage with efficient algorithms"""
        start_time = time.time()
        original_memory = df.memory_usage(deep=True).sum()
        
        with self._lock:
            logger.debug(f"🔧 Starting DataFrame optimization: {df.shape} shape, "
                        f"{original_memory / 1024 / 1024:.1f}MB")
            
            optimized_df = df.copy() if not preserve_index else df
            dtypes_optimized = 0
            
            # 1. Optimize numeric columns using efficient type detection
            dtypes_optimized += self._optimize_numeric_columns(optimized_df, aggressive)
            
            # 2. Optimize categorical columns with frequency analysis
            dtypes_optimized += self._optimize_categorical_columns(optimized_df, aggressive)
            
            # 3. Optimize datetime columns
            dtypes_optimized += self._optimize_datetime_columns(optimized_df)
            
            # 4. Handle missing values efficiently
            if aggressive:
                self._optimize_missing_values(optimized_df)
            
            # Calculate optimization results
            final_memory = optimized_df.memory_usage(deep=True).sum()
            memory_reduction = ((original_memory - final_memory) / original_memory * 100) if original_memory > 0 else 0
            processing_time = (time.time() - start_time) * 1000
            
            # Create statistics
            stats = DataFrameStats(
                memory_usage_mb=final_memory / 1024 / 1024,
                row_count=len(optimized_df),
                column_count=len(optimized_df.columns),
                dtypes_optimized=dtypes_optimized,
                memory_reduction_percent=memory_reduction,
                processing_time_ms=processing_time
            )
            
            # Store optimization history
            self.optimization_history.append({
                'timestamp': time.time(),
                'original_memory_mb': original_memory / 1024 / 1024,
                'optimized_memory_mb': final_memory / 1024 / 1024,
                'reduction_percent': memory_reduction,
                'shape': df.shape,
                'dtypes_optimized': dtypes_optimized
            })
            
            # Track processed DataFrame (skip - DataFrames are not hashable)
            # self._processed_dataframes.add(optimized_df)
            
            logger.info(f"✅ DataFrame optimized: {memory_reduction:.1f}% reduction, "
                       f"{dtypes_optimized} dtypes optimized in {processing_time:.1f}ms")
            
            return optimized_df, stats
    
    def _optimize_numeric_columns(self, df: pd.DataFrame, aggressive: bool = False) -> int:
        """Optimize numeric columns using efficient downcast algorithms"""
        optimized_count = 0
        
        # Process integer columns
        for col in df.select_dtypes(include=['int64', 'int32']).columns:
            original_dtype = df[col].dtype
            
            if col in self.dtype_optimization_cache:
                # Use cached optimization
                cache_info = self.dtype_optimization_cache[col]
                if cache_info['min_val'] <= df[col].min() and cache_info['max_val'] >= df[col].max():
                    df[col] = df[col].astype(cache_info['optimal_dtype'])
                    optimized_count += 1
                    continue
            
            # Analyze value range for optimal type selection
            col_min, col_max = df[col].min(), df[col].max()
            
            # Choose optimal integer type
            if col_min >= 0:  # Unsigned integers
                if col_max <= 255:
                    optimal_dtype = 'uint8'
                elif col_max <= 65535:
                    optimal_dtype = 'uint16'
                elif col_max <= 4294967295:
                    optimal_dtype = 'uint32'
                else:
                    optimal_dtype = 'uint64'
            else:  # Signed integers
                if -128 <= col_min and col_max <= 127:
                    optimal_dtype = 'int8'
                elif -32768 <= col_min and col_max <= 32767:
                    optimal_dtype = 'int16'
                elif -2147483648 <= col_min and col_max <= 2147483647:
                    optimal_dtype = 'int32'
                else:
                    optimal_dtype = 'int64'
            
            # Apply optimization if beneficial
            if optimal_dtype != str(original_dtype):
                df[col] = df[col].astype(optimal_dtype)
                optimized_count += 1
                
                # Cache optimization for future use
                self.dtype_optimization_cache[col] = {
                    'min_val': col_min,
                    'max_val': col_max,
                    'optimal_dtype': optimal_dtype,
                    'original_dtype': str(original_dtype)
                }
        
        # Process float columns
        for col in df.select_dtypes(include=['float64']).columns:
            # Try downcasting to float32 if precision allows
            col_32 = df[col].astype('float32')
            
            # Check if conversion is lossless (for important data)
            if aggressive or np.allclose(df[col].dropna(), col_32.dropna(), equal_nan=True):
                df[col] = col_32
                optimized_count += 1
        
        return optimized_count
    
    def _optimize_categorical_columns(self, df: pd.DataFrame, aggressive: bool = False) -> int:
        """Optimize object columns using categorical type with frequency analysis"""
        optimized_count = 0
        
        for col in df.select_dtypes(include=['object']).columns:
            if df[col].dtype == 'object':
                # Calculate uniqueness ratio efficiently
                unique_count = df[col].nunique()
                total_count = len(df[col])
                uniqueness_ratio = unique_count / total_count if total_count > 0 else 0
                
                # Convert to categorical if beneficial
                threshold = 0.7 if aggressive else 0.5
                
                if uniqueness_ratio < threshold and unique_count < 1000:
                    # Check memory benefit
                    original_memory = df[col].memory_usage(deep=True)
                    
                    # Convert to category
                    df[col] = df[col].astype('category')
                    new_memory = df[col].memory_usage(deep=True)
                    
                    if new_memory < original_memory:
                        optimized_count += 1
                        
                        # Track column pattern
                        pattern = f"categorical_{unique_count}_{int(uniqueness_ratio * 100)}"
                        self.column_patterns[pattern].append(col)
                        
                        logger.debug(f"📊 Converted {col} to categorical: "
                                   f"{unique_count} unique values, "
                                   f"{((original_memory - new_memory) / original_memory * 100):.1f}% memory reduction")
                    else:
                        # Revert if no benefit
                        df[col] = df[col].astype('object')
        
        return optimized_count
    
    def _optimize_datetime_columns(self, df: pd.DataFrame) -> int:
        """Optimize datetime columns"""
        optimized_count = 0
        
        # Look for potential datetime columns in object type
        for col in df.select_dtypes(include=['object']).columns:
            # Sample first few non-null values to detect datetime patterns
            sample_values = df[col].dropna().head(10)
            
            if len(sample_values) > 0:
                # Try to parse as datetime
                try:
                    pd.to_datetime(sample_values.iloc[0])
                    # If successful, convert entire column
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                    optimized_count += 1
                    logger.debug(f"📅 Converted {col} to datetime")
                except (ValueError, TypeError, AttributeError, pd.errors.ParserError) as e:
                    logger.debug(f"DateTime conversion failed for column '{col}': {e}")
                    continue
        
        return optimized_count
    
    def _optimize_missing_values(self, df: pd.DataFrame):
        """Optimize handling of missing values"""
        for col in df.columns:
            if df[col].isnull().any():
                null_percentage = df[col].isnull().sum() / len(df) * 100
                
                # For columns with many nulls, consider sparse representation
                if null_percentage > 50:
                    # Convert to sparse array if beneficial
                    try:
                        sparse_col = df[col].astype(pd.SparseDtype(df[col].dtype, fill_value=np.nan))
                        if sparse_col.memory_usage(deep=True) < df[col].memory_usage(deep=True):
                            df[col] = sparse_col
                            logger.debug(f"🗜️ Converted {col} to sparse ({null_percentage:.1f}% nulls)")
                    except (ValueError, ImportError, AttributeError) as e:
                        logger.debug(f"Sparse conversion failed for column '{col}': {e}")
                        continue
    
    def process_large_dataframe(self, df: pd.DataFrame, 
                               chunk_size: int = 10000,
                               optimize_chunks: bool = True) -> Generator[pd.DataFrame, None, None]:
        """Process large DataFrames in optimized chunks"""
        total_rows = len(df)
        
        logger.info(f"🔀 Processing large DataFrame in chunks: {total_rows} rows, chunk_size={chunk_size}")
        
        for start_idx in range(0, total_rows, chunk_size):
            end_idx = min(start_idx + chunk_size, total_rows)
            chunk = df.iloc[start_idx:end_idx].copy()
            
            if optimize_chunks:
                chunk, _ = self.optimize_dataframe(chunk)
            
            logger.debug(f"📦 Processing chunk {start_idx}-{end_idx}")
            yield chunk
            
            # Force garbage collection after each chunk
            del chunk
            gc.collect()
    
    def get_optimization_summary(self) -> Dict[str, Any]:
        """Get comprehensive optimization summary"""
        if not self.optimization_history:
            return {'message': 'No optimizations performed yet'}
        
        # Calculate aggregate statistics
        total_optimizations = len(self.optimization_history)
        
        memory_reductions = [opt['reduction_percent'] for opt in self.optimization_history]
        avg_memory_reduction = sum(memory_reductions) / len(memory_reductions)
        
        total_original_memory = sum(opt['original_memory_mb'] for opt in self.optimization_history)
        total_optimized_memory = sum(opt['optimized_memory_mb'] for opt in self.optimization_history)
        total_memory_saved = total_original_memory - total_optimized_memory
        
        dtypes_optimized = sum(opt['dtypes_optimized'] for opt in self.optimization_history)
        
        # Recent performance trends
        recent_optimizations = list(self.optimization_history)[-10:]
        recent_avg_reduction = sum(opt['reduction_percent'] for opt in recent_optimizations) / len(recent_optimizations)
        
        return {
            'optimization_summary': {
                'total_optimizations': total_optimizations,
                'average_memory_reduction_percent': round(avg_memory_reduction, 2),
                'total_memory_saved_mb': round(total_memory_saved, 2),
                'total_dtypes_optimized': dtypes_optimized
            },
            'recent_performance': {
                'recent_optimizations': len(recent_optimizations),
                'recent_average_reduction_percent': round(recent_avg_reduction, 2),
                'optimization_cache_entries': len(self.dtype_optimization_cache)
            },
            'column_patterns': {
                pattern: len(columns) for pattern, columns in self.column_patterns.items()
            },
            'memory_thresholds': {
                'memory_threshold_mb': self.memory_threshold_mb,
                'active_dataframes': len(self._processed_dataframes)
            }
        }
    
    def benchmark_dataframe_operations(self, df: pd.DataFrame) -> Dict[str, float]:
        """Benchmark common DataFrame operations for performance analysis"""
        benchmarks = {}
        
        # Memory access benchmark
        start_time = time.time()
        _ = df.info(memory_usage='deep')
        benchmarks['memory_analysis_ms'] = (time.time() - start_time) * 1000
        
        # Basic operations benchmark
        start_time = time.time()
        _ = df.describe()
        benchmarks['describe_ms'] = (time.time() - start_time) * 1000
        
        # Groupby benchmark (if possible)
        if len(df.columns) > 0:
            first_col = df.columns[0]
            if df[first_col].nunique() < len(df) // 2:  # Good for grouping
                start_time = time.time()
                try:
                    _ = df.groupby(first_col).size()
                    benchmarks['groupby_ms'] = (time.time() - start_time) * 1000
                except (ValueError, TypeError, KeyError) as e:
                    logger.debug(f"GroupBy benchmark failed: {e}")
                    benchmarks['groupby_ms'] = -1  # Failed
        
        # Sort benchmark
        if len(df.columns) > 0:
            start_time = time.time()
            try:
                _ = df.sort_values(df.columns[0])
                benchmarks['sort_ms'] = (time.time() - start_time) * 1000
            except (ValueError, TypeError, KeyError) as e:
                logger.debug(f"Sort benchmark failed: {e}")
                benchmarks['sort_ms'] = -1  # Failed
        
        return benchmarks

# Global DataFrame processor instance
dataframe_processor = OptimizedDataFrameProcessor()

def optimize_dataframe_memory(preserve_index: bool = True, aggressive: bool = False):
    """Decorator for automatic DataFrame memory optimization"""
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            
            # Optimize if result is a DataFrame
            if isinstance(result, pd.DataFrame):
                # Only optimize if DataFrame is large enough
                memory_usage = result.memory_usage(deep=True).sum()
                if memory_usage > dataframe_processor.memory_threshold_bytes:
                    optimized_df, stats = dataframe_processor.optimize_dataframe(
                        result, aggressive=aggressive, preserve_index=preserve_index
                    )
                    
                    logger.info(f"📊 Auto-optimized DataFrame from {func.__name__}: "
                              f"{stats.memory_reduction_percent:.1f}% reduction")
                    
                    return optimized_df
            
            return result
        
        return wrapper
    return decorator

def chunked_dataframe_processing(chunk_size: int = 10000, optimize_chunks: bool = True):
    """Decorator for chunked processing of large DataFrames"""
    
    def decorator(func):
        @wraps(func)
        def wrapper(df: pd.DataFrame, *args, **kwargs):
            if len(df) <= chunk_size:
                # Process normally if small enough
                return func(df, *args, **kwargs)
            
            # Process in chunks
            results = []
            for chunk in dataframe_processor.process_large_dataframe(
                df, chunk_size=chunk_size, optimize_chunks=optimize_chunks
            ):
                chunk_result = func(chunk, *args, **kwargs)
                results.append(chunk_result)
            
            # Combine results
            if results and isinstance(results[0], pd.DataFrame):
                combined_result = pd.concat(results, ignore_index=True)
                logger.info(f"🔗 Combined {len(results)} chunks into DataFrame: {combined_result.shape}")
                return combined_result
            else:
                return results
        
        return wrapper
    return decorator