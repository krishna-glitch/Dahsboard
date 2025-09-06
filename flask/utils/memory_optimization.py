"""
Flask API Memory Optimization Utilities
Advanced memory management and optimization for Flask REST APIs
"""

import logging
import gc
import threading
import time
import weakref
from typing import Dict, Any, Optional, List, Callable, Union
from functools import wraps
from flask import jsonify, request, g
from datetime import datetime, timedelta
import pandas as pd
import psutil
import sys

# Import existing memory optimizer
from services.memory_optimizer import MemoryOptimizer

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

class APIMemoryManager:
    """
    Memory management specifically for Flask API endpoints
    """
    
    def __init__(self, memory_limit_mb: int = 2048):
        """
        Initialize API memory manager
        
        Args:
            memory_limit_mb: Maximum memory limit for API operations
        """
        self.memory_limit_mb = memory_limit_mb
        self.warning_threshold = memory_limit_mb * 0.7  # 70% warning
        self.critical_threshold = memory_limit_mb * 0.9  # 90% critical
        
        self.base_optimizer = MemoryOptimizer(memory_limit_mb)
        self._active_operations = weakref.WeakValueDictionary()
        self._memory_callbacks = []
        self._lock = threading.Lock()
        
        # Register cleanup callbacks
        self.base_optimizer.register_cleanup_callback(self._cleanup_dataframes)
        self.base_optimizer.register_cleanup_callback(self._force_garbage_collection)
        
        logger.info(f"APIMemoryManager initialized with {memory_limit_mb}MB limit")
    
    def memory_optimized(self, 
                        max_memory_mb: Optional[int] = None,
                        auto_cleanup: bool = True,
                        chunk_large_responses: bool = True):
        """
        Decorator to optimize memory usage for API endpoints
        
        Args:
            max_memory_mb: Maximum memory for this operation
            auto_cleanup: Automatically cleanup after operation
            chunk_large_responses: Chunk large responses to reduce memory
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                operation_id = f"{f.__name__}_{id(threading.current_thread())}"
                max_mem = max_memory_mb or (self.memory_limit_mb // 4)
                
                # Pre-execution memory check
                initial_memory = self._get_current_memory()
                logger.info(f"🧠 [MEMORY] Starting {f.__name__} - Initial memory: {initial_memory:.1f}MB")
                
                if initial_memory > self.warning_threshold:
                    logger.warning(f"⚠️ [MEMORY] High memory usage before {f.__name__}: {initial_memory:.1f}MB")
                    self._perform_preemptive_cleanup()
                
                try:
                    # Register operation
                    with self._lock:
                        self._active_operations[operation_id] = {
                            'function': f.__name__,
                            'start_time': time.time(),
                            'max_memory': max_mem,
                            'thread_id': threading.get_ident()
                        }
                    
                    # Execute function with memory monitoring
                    if chunk_large_responses:
                        result = self._execute_with_chunking(f, *args, **kwargs)
                    else:
                        result = f(*args, **kwargs)
                    
                    # Post-execution memory check
                    final_memory = self._get_current_memory()
                    memory_delta = final_memory - initial_memory
                    
                    logger.info(
                        f"🧠 [MEMORY] Completed {f.__name__} - "
                        f"Final: {final_memory:.1f}MB, Delta: {memory_delta:+.1f}MB"
                    )
                    
                    # Memory optimization based on result
                    if hasattr(result, 'shape') and len(result) > 10000:  # Large DataFrame
                        logger.info(f"🗜️ [MEMORY] Optimizing large DataFrame: {result.shape}")
                        result = self._optimize_dataframe_memory(result)
                    
                    # Auto cleanup if enabled
                    if auto_cleanup:
                        self._cleanup_after_operation(operation_id)
                    
                    return result
                    
                except MemoryError as e:
                    logger.error(f"💥 [MEMORY] Memory error in {f.__name__}: {e}")
                    self._emergency_cleanup()
                    raise
                    
                except Exception as e:
                    logger.error(f"💥 [MEMORY] Error in {f.__name__}: {e}")
                    raise
                    
                finally:
                    # Always remove operation tracking
                    with self._lock:
                        self._active_operations.pop(operation_id, None)
            
            return decorated_function
        return decorator
    
    def memory_aware_dataframe_processing(self, 
                                        chunk_size: int = 50000,
                                        optimize_dtypes: bool = True):
        """
        Decorator for memory-efficient DataFrame processing
        
        Args:
            chunk_size: Process DataFrames in chunks of this size
            optimize_dtypes: Optimize DataFrame data types
            
        Returns:
            Decorated function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                start_memory = self._get_current_memory()
                
                try:
                    # Check if any args are large DataFrames
                    large_df_args = []
                    for i, arg in enumerate(args):
                        if isinstance(arg, pd.DataFrame) and len(arg) > chunk_size:
                            large_df_args.append((i, arg))
                            logger.info(f"🔀 [MEMORY] Processing large DataFrame chunk-wise: {arg.shape}")
                    
                    if large_df_args:
                        # Process with chunking
                        result = self._process_with_chunking(f, chunk_size, *args, **kwargs)
                    else:
                        # Process normally
                        result = f(*args, **kwargs)
                    
                    # Optimize result if it's a DataFrame
                    if isinstance(result, pd.DataFrame) and optimize_dtypes:
                        original_memory = result.memory_usage(deep=True).sum() / 1024 / 1024
                        result = self._optimize_dataframe_memory(result)
                        optimized_memory = result.memory_usage(deep=True).sum() / 1024 / 1024
                        
                        if original_memory > optimized_memory:
                            logger.info(
                                f"🗜️ [MEMORY] DataFrame optimization: "
                                f"{original_memory:.1f}MB → {optimized_memory:.1f}MB "
                                f"({((original_memory - optimized_memory) / original_memory * 100):.1f}% reduction)"
                            )
                    
                    end_memory = self._get_current_memory()
                    logger.info(f"🧠 [MEMORY] DataFrame processing complete - Memory delta: {end_memory - start_memory:+.1f}MB")
                    
                    return result
                    
                except Exception as e:
                    logger.error(f"💥 [MEMORY] DataFrame processing error: {e}")
                    raise
            
            return decorated_function
        return decorator
    
    def track_memory_usage(self, log_threshold_mb: float = 100.0):
        """
        Decorator to track and log memory usage of functions
        
        Args:
            log_threshold_mb: Only log if memory usage exceeds this threshold
            
        Returns:
            Decorated function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                start_memory = self._get_current_memory()
                start_time = time.time()
                
                try:
                    result = f(*args, **kwargs)
                    
                    end_memory = self._get_current_memory()
                    memory_delta = end_memory - start_memory
                    duration = (time.time() - start_time) * 1000
                    
                    if abs(memory_delta) > log_threshold_mb:
                        logger.info(
                            f"📊 [MEMORY TRACKER] {f.__name__}: "
                            f"{memory_delta:+.1f}MB in {duration:.1f}ms"
                        )
                    
                    return result
                    
                except Exception as e:
                    end_memory = self._get_current_memory()
                    memory_delta = end_memory - start_memory
                    logger.error(
                        f"📊 [MEMORY TRACKER] {f.__name__} FAILED: "
                        f"{memory_delta:+.1f}MB before error: {e}"
                    )
                    raise
            
            return decorated_function
        return decorator
    
    def get_memory_status(self) -> Dict[str, Any]:
        """Get comprehensive memory status"""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            
            # System memory
            system_memory = psutil.virtual_memory()
            
            # Python-specific memory info
            gc_stats = gc.get_stats()
            
            # Active operations
            with self._lock:
                active_ops = dict(self._active_operations)
            
            status = {
                'process_memory': {
                    'rss_mb': memory_info.rss / 1024 / 1024,
                    'vms_mb': memory_info.vms / 1024 / 1024,
                    'percent_of_limit': (memory_info.rss / 1024 / 1024) / self.memory_limit_mb * 100,
                    'status': self._get_memory_status_level(memory_info.rss / 1024 / 1024)
                },
                'system_memory': {
                    'total_gb': system_memory.total / 1024 / 1024 / 1024,
                    'available_gb': system_memory.available / 1024 / 1024 / 1024,
                    'percent_used': system_memory.percent,
                    'status': 'critical' if system_memory.percent > 90 else 
                              'warning' if system_memory.percent > 80 else 'ok'
                },
                'garbage_collection': {
                    'collections': [{'generation': i, **stats} for i, stats in enumerate(gc_stats)],
                    'objects': len(gc.get_objects()),
                    'referrers': len(gc.garbage)
                },
                'limits': {
                    'memory_limit_mb': self.memory_limit_mb,
                    'warning_threshold_mb': self.warning_threshold,
                    'critical_threshold_mb': self.critical_threshold
                },
                'active_operations': len(active_ops),
                'operations_detail': active_ops,
                'timestamp': datetime.now().isoformat()
            }
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting memory status: {e}")
            return {'error': str(e)}
    
    def force_cleanup(self) -> Dict[str, Any]:
        """Force memory cleanup and return cleanup results"""
        start_memory = self._get_current_memory()
        logger.info(f"🧹 [MEMORY] Force cleanup started - Current memory: {start_memory:.1f}MB")
        
        cleanup_results = {
            'initial_memory_mb': start_memory,
            'cleanup_actions': []
        }
        
        # 1. Clear large DataFrames
        df_freed = self._cleanup_dataframes()
        if df_freed > 0:
            cleanup_results['cleanup_actions'].append(f"Cleared DataFrames: {df_freed:.1f}MB")
        
        # 2. Force garbage collection
        gc_freed = self._force_garbage_collection()
        cleanup_results['cleanup_actions'].append(f"Garbage collection: {gc_freed} objects")
        
        # 3. Clear caches
        cache_cleared = self._clear_function_caches()
        if cache_cleared > 0:
            cleanup_results['cleanup_actions'].append(f"Cleared caches: {cache_cleared} entries")
        
        # 4. Call registered callbacks
        for callback in self._memory_callbacks:
            try:
                callback_result = callback()
                if callback_result:
                    cleanup_results['cleanup_actions'].append(f"Custom cleanup: {callback_result}")
            except Exception as e:
                logger.error(f"Memory cleanup callback error: {e}")
        
        final_memory = self._get_current_memory()
        memory_freed = start_memory - final_memory
        
        cleanup_results.update({
            'final_memory_mb': final_memory,
            'memory_freed_mb': memory_freed,
            'cleanup_effective': memory_freed > 0,
            'timestamp': datetime.now().isoformat()
        })
        
        logger.info(f"🧹 [MEMORY] Force cleanup completed - Freed {memory_freed:.1f}MB")
        return cleanup_results
    
    def _execute_with_chunking(self, f: Callable, *args, **kwargs):
        """Execute function with response chunking for large results"""
        result = f(*args, **kwargs)
        
        # Check if result needs chunking
        if isinstance(result, pd.DataFrame) and len(result) > 10000:
            # Convert to chunked response format
            chunk_size = 5000
            total_chunks = (len(result) + chunk_size - 1) // chunk_size
            
            logger.info(f"🔀 [MEMORY] Chunking large response: {len(result)} records → {total_chunks} chunks")
            
            # Return first chunk with metadata
            first_chunk = result.iloc[:chunk_size]
            
            return {
                'data': first_chunk.to_dict('records'),
                'chunking_info': {
                    'total_records': len(result),
                    'chunk_size': chunk_size,
                    'total_chunks': total_chunks,
                    'current_chunk': 1,
                    'has_more': total_chunks > 1,
                    'next_chunk_url': request.url + ('&' if request.query_string else '?') + f'chunk=2&chunk_size={chunk_size}'
                },
                'memory_info': {
                    'original_size_mb': result.memory_usage(deep=True).sum() / 1024 / 1024,
                    'chunk_size_mb': first_chunk.memory_usage(deep=True).sum() / 1024 / 1024
                }
            }
        
        return result
    
    def _process_with_chunking(self, f: Callable, chunk_size: int, *args, **kwargs):
        """Process function with DataFrame chunking"""
        # Find DataFrame arguments
        chunked_args = []
        for arg in args:
            if isinstance(arg, pd.DataFrame) and len(arg) > chunk_size:
                # Process in chunks and concatenate
                chunks = []
                for i in range(0, len(arg), chunk_size):
                    chunk = arg.iloc[i:i+chunk_size]
                    chunks.append(chunk)
                
                # Process each chunk
                processed_chunks = []
                for i, chunk in enumerate(chunks):
                    logger.debug(f"Processing chunk {i+1}/{len(chunks)}")
                    processed_chunk = f(chunk, **kwargs)
                    processed_chunks.append(processed_chunk)
                    
                    # Clean up intermediate chunk
                    del chunk
                    if i % 5 == 0:  # Cleanup every 5 chunks
                        gc.collect()
                
                # Concatenate results
                result = pd.concat(processed_chunks, ignore_index=True)
                
                # Clean up chunks
                del chunks, processed_chunks
                gc.collect()
                
                return result
            else:
                chunked_args.append(arg)
        
        # If no chunking needed, process normally
        return f(*chunked_args, **kwargs)
    
    def _optimize_dataframe_memory(self, df: pd.DataFrame) -> pd.DataFrame:
        """Optimize DataFrame memory usage"""
        if df.empty:
            return df
        
        original_memory = df.memory_usage(deep=True).sum()
        
        # Optimize numeric columns
        for col in df.select_dtypes(include=['int64']).columns:
            if df[col].min() >= 0:
                if df[col].max() < 255:
                    df[col] = df[col].astype('uint8')
                elif df[col].max() < 65535:
                    df[col] = df[col].astype('uint16')
                elif df[col].max() < 4294967295:
                    df[col] = df[col].astype('uint32')
            else:
                if df[col].min() > -128 and df[col].max() < 127:
                    df[col] = df[col].astype('int8')
                elif df[col].min() > -32768 and df[col].max() < 32767:
                    df[col] = df[col].astype('int16')
                elif df[col].min() > -2147483648 and df[col].max() < 2147483647:
                    df[col] = df[col].astype('int32')
        
        # Optimize float columns
        for col in df.select_dtypes(include=['float64']).columns:
            df[col] = pd.to_numeric(df[col], downcast='float')
        
        # Optimize object columns
        for col in df.select_dtypes(include=['object']).columns:
            if df[col].nunique() / len(df) < 0.5:  # Less than 50% unique values
                df[col] = df[col].astype('category')
        
        optimized_memory = df.memory_usage(deep=True).sum()
        
        if original_memory > optimized_memory:
            reduction_percent = (1 - optimized_memory / original_memory) * 100
            logger.debug(f"DataFrame memory optimized: {reduction_percent:.1f}% reduction")
        
        return df
    
    def _get_current_memory(self) -> float:
        """Get current memory usage in MB"""
        try:
            process = psutil.Process()
            return process.memory_info().rss / 1024 / 1024
        except (psutil.NoSuchProcess, psutil.AccessDenied, ImportError) as e:
            logger.debug(f"Memory usage check failed: {e}")
            return 0.0
    
    def _get_memory_status_level(self, memory_mb: float) -> str:
        """Get memory status level"""
        if memory_mb > self.critical_threshold:
            return 'critical'
        elif memory_mb > self.warning_threshold:
            return 'warning'
        else:
            return 'ok'
    
    def _perform_preemptive_cleanup(self):
        """Perform preemptive cleanup before high-memory operations"""
        logger.info("🧹 [MEMORY] Performing preemptive cleanup")
        self._cleanup_dataframes()
        self._force_garbage_collection()
    
    def _cleanup_after_operation(self, operation_id: str):
        """Cleanup after specific operation"""
        logger.debug(f"🧹 [MEMORY] Cleanup after operation: {operation_id}")
        gc.collect()
    
    def _emergency_cleanup(self):
        """Emergency cleanup for critical memory situations"""
        logger.error("🚨 [MEMORY] EMERGENCY CLEANUP - Critical memory situation")
        
        # Aggressive cleanup
        self._cleanup_dataframes()
        self._force_garbage_collection()
        self._clear_function_caches()
        
        # Force all callbacks
        for callback in self._memory_callbacks:
            try:
                callback()
            except Exception as e:
                logger.error(f"Emergency cleanup callback failed: {e}")
    
    def _cleanup_dataframes(self) -> float:
        """Clean up large DataFrames from memory"""
        # This is a placeholder - in practice, you'd implement DataFrame tracking
        gc.collect()
        return 0.0
    
    def _force_garbage_collection(self) -> int:
        """Force garbage collection and return objects collected"""
        before = len(gc.get_objects())
        gc.collect()
        after = len(gc.get_objects())
        return before - after
    
    def _clear_function_caches(self) -> int:
        """Clear function caches (LRU, etc.)"""
        # This would clear any function-level caches
        return 0

# Global memory manager
api_memory_manager = APIMemoryManager()

# Convenience decorators
def memory_optimized(max_memory_mb: Optional[int] = None, **kwargs):
    """Decorator for memory-optimized API endpoints"""
    return api_memory_manager.memory_optimized(max_memory_mb, **kwargs)

def memory_aware_dataframes(chunk_size: int = 50000, **kwargs):
    """Decorator for memory-aware DataFrame processing"""
    return api_memory_manager.memory_aware_dataframe_processing(chunk_size, **kwargs)

def track_memory(threshold_mb: float = 100.0):
    """Decorator to track memory usage"""
    return api_memory_manager.track_memory_usage(threshold_mb)

def get_memory_status() -> Dict[str, Any]:
    """Get current memory status"""
    return api_memory_manager.get_memory_status()

def force_memory_cleanup() -> Dict[str, Any]:
    """Force memory cleanup"""
    return api_memory_manager.force_cleanup()