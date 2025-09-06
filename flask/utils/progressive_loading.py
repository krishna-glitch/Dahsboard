"""
Flask API Progressive Loading Utilities
Implements chunked data streaming for large datasets
"""

import logging
import time
import math
from typing import Dict, Any, Callable, Optional, Tuple, List, Iterator
from functools import wraps
from flask import jsonify, request, Response, stream_template
from datetime import datetime, timedelta
import pandas as pd

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

class APIProgressiveLoader:
    """
    Progressive data loading for Flask API endpoints
    """
    
    def __init__(self, chunk_size: int = 1000, max_chunks: int = 50):
        """
        Initialize progressive loader
        
        Args:
            chunk_size: Number of records per chunk
            max_chunks: Maximum number of chunks to prevent infinite loading
        """
        self.chunk_size = chunk_size
        self.max_chunks = max_chunks
    
    def progressive_endpoint(self, data_loader: Callable, chunk_size: Optional[int] = None):
        """
        Decorator to make an endpoint support progressive loading
        
        Args:
            data_loader: Function to load data chunks
            chunk_size: Override default chunk size
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Parse progressive loading parameters
                chunk_num = int(request.args.get('chunk', 0))
                chunk_size_param = int(request.args.get('chunk_size', chunk_size or self.chunk_size))
                progressive = request.args.get('progressive', 'false').lower() == 'true'
                stream_response = request.args.get('stream', 'false').lower() == 'true'
                
                if not progressive:
                    # Return metadata about progressive loading capability
                    return jsonify({
                        'progressive_loading': {
                            'available': True,
                            'chunk_size': chunk_size_param,
                            'max_chunks': self.max_chunks,
                            'instructions': {
                                'url_pattern': f'{request.url}?progressive=true&chunk=<chunk_number>',
                                'chunk_parameter': 'chunk (0-based index)',
                                'chunk_size_parameter': 'chunk_size (override default)',
                                'streaming': 'Add &stream=true for real-time streaming'
                            }
                        },
                        'estimated_chunks': self._estimate_chunks(data_loader, *args, **kwargs)
                    }), 200
                
                if stream_response:
                    # Return streaming response
                    return self._stream_progressive_data(data_loader, chunk_size_param, *args, **kwargs)
                else:
                    # Return single chunk
                    return self._load_single_chunk(data_loader, chunk_num, chunk_size_param, *args, **kwargs)
            
            return decorated_function
        return decorator
    
    def _load_single_chunk(self, data_loader: Callable, chunk_num: int, chunk_size: int, *args, **kwargs) -> Tuple[Dict, int]:
        """
        Load a single chunk of data
        """
        start_time = time.time()
        
        try:
            logger.info(f"🔄 [PROGRESSIVE] Loading chunk {chunk_num} (size: {chunk_size})")
            
            # Calculate offset and limit
            offset = chunk_num * chunk_size
            
            # Load the chunk
            chunk_result = data_loader(
                offset=offset,
                limit=chunk_size,
                chunk_num=chunk_num,
                *args, **kwargs
            )
            
            loading_time = (time.time() - start_time) * 1000
            
            # Handle different return types
            if isinstance(chunk_result, tuple):
                chunk_data, total_count = chunk_result
            else:
                chunk_data = chunk_result
                total_count = None
            
            # Convert DataFrame to dict if necessary
            if hasattr(chunk_data, 'to_dict'):
                chunk_records = chunk_data.to_dict('records')
                record_count = len(chunk_data)
            else:
                chunk_records = chunk_data
                record_count = len(chunk_data) if chunk_data else 0
            
            # Calculate chunk metadata
            has_more = record_count == chunk_size
            total_chunks = math.ceil(total_count / chunk_size) if total_count else None
            progress_percentage = ((chunk_num + 1) / total_chunks * 100) if total_chunks else None
            
            response_data = {
                'chunk_data': chunk_records,
                'progressive_metadata': {
                    'chunk_number': chunk_num,
                    'chunk_size': chunk_size,
                    'records_in_chunk': record_count,
                    'has_more_chunks': has_more,
                    'total_chunks': total_chunks,
                    'progress_percentage': progress_percentage,
                    'loading_time_ms': round(loading_time, 2),
                    'loaded_at': datetime.now().isoformat()
                }
            }
            
            if total_count is not None:
                response_data['progressive_metadata']['total_records'] = total_count
                response_data['progressive_metadata']['records_loaded'] = min(offset + record_count, total_count)
            
            # Add next chunk URL if more data available
            if has_more:
                from urllib.parse import urlencode, urlparse, urlunparse
                
                # Parse the current URL
                parsed_url = urlparse(request.url)
                base_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
                
                # Build query parameters for next chunk
                next_params = dict(request.args)
                next_params.update({
                    'progressive': 'true',
                    'chunk': str(chunk_num + 1),
                    'chunk_size': str(chunk_size)
                })
                
                # Construct next chunk URL using proper encoding
                next_chunk_url = f"{base_url}?{urlencode(next_params, doseq=True)}"
                response_data['progressive_metadata']['next_chunk_url'] = next_chunk_url
            
            logger.info(f"✅ [PROGRESSIVE] Loaded chunk {chunk_num}: {record_count} records in {loading_time:.1f}ms")
            return jsonify(response_data), 200
            
        except Exception as e:
            loading_time = (time.time() - start_time) * 1000
            logger.error(f"❌ [PROGRESSIVE] Failed to load chunk {chunk_num}: {e}")
            
            return jsonify({
                'error': 'Progressive loading failed',
                'chunk_number': chunk_num,
                'details': str(e),
                'progressive_metadata': {
                    'chunk_number': chunk_num,
                    'loading_time_ms': round(loading_time, 2),
                    'error_at': datetime.now().isoformat()
                }
            }), 500
    
    def _stream_progressive_data(self, data_loader: Callable, chunk_size: int, *args, **kwargs) -> Response:
        """
        Stream data progressively as Server-Sent Events
        """
        def generate_chunks():
            chunk_num = 0
            total_records_streamed = 0
            start_time = time.time()
            
            yield f"data: {{'event': 'stream_start', 'timestamp': '{datetime.now().isoformat()}'}}\n\n"
            
            try:
                while chunk_num < self.max_chunks:
                    chunk_start_time = time.time()
                    
                    # Load chunk
                    offset = chunk_num * chunk_size
                    chunk_result = data_loader(
                        offset=offset,
                        limit=chunk_size,
                        chunk_num=chunk_num,
                        *args, **kwargs
                    )
                    
                    # Process result
                    if isinstance(chunk_result, tuple):
                        chunk_data, total_count = chunk_result
                    else:
                        chunk_data = chunk_result
                        total_count = None
                    
                    if hasattr(chunk_data, 'to_dict'):
                        chunk_records = chunk_data.to_dict('records')
                        record_count = len(chunk_data)
                    else:
                        chunk_records = chunk_data
                        record_count = len(chunk_data) if chunk_data else 0
                    
                    if record_count == 0:
                        # No more data
                        break
                    
                    chunk_loading_time = (time.time() - chunk_start_time) * 1000
                    total_records_streamed += record_count
                    
                    # Stream chunk data
                    chunk_response = {
                        'event': 'chunk_loaded',
                        'chunk_number': chunk_num,
                        'data': chunk_records,
                        'metadata': {
                            'records_in_chunk': record_count,
                            'total_records_streamed': total_records_streamed,
                            'chunk_loading_time_ms': round(chunk_loading_time, 2),
                            'total_streaming_time_ms': round((time.time() - start_time) * 1000, 2),
                            'timestamp': datetime.now().isoformat()
                        }
                    }
                    
                    if total_count:
                        chunk_response['metadata']['total_records'] = total_count
                        chunk_response['metadata']['progress_percentage'] = (total_records_streamed / total_count) * 100
                    
                    yield f"data: {chunk_response}\n\n"
                    
                    # Check if this was the last chunk
                    if record_count < chunk_size:
                        break
                    
                    chunk_num += 1
                
                # Stream completion
                total_time = (time.time() - start_time) * 1000
                yield f"data: {{'event': 'stream_complete', 'total_records': {total_records_streamed}, 'total_chunks': {chunk_num + 1}, 'total_time_ms': {total_time}, 'timestamp': '{datetime.now().isoformat()}'}}\n\n"
                
            except Exception as e:
                logger.error(f"❌ [PROGRESSIVE STREAM] Streaming failed: {e}")
                yield f"data: {{'event': 'stream_error', 'error': '{str(e)}', 'timestamp': '{datetime.now().isoformat()}'}}\n\n"
        
        return Response(
            generate_chunks(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        )
    
    def _estimate_chunks(self, data_loader: Callable = None, *args, **kwargs) -> Dict[str, Any]:
        """
        Dynamically estimate number of chunks needed for given parameters
        """
        estimated_records = 1000  # Default minimum estimate
        
        # Try to get actual record count from data loader if available
        if data_loader:
            try:
                # Try to get count without loading all data
                count_result = data_loader(count_only=True, *args, **kwargs)
                if isinstance(count_result, int):
                    estimated_records = count_result
                elif hasattr(count_result, '__len__'):
                    estimated_records = len(count_result)
                else:
                    # Fallback: try a small sample to estimate
                    sample = data_loader(offset=0, limit=100, *args, **kwargs)
                    if sample and hasattr(sample, '__len__') and len(sample) == 100:
                        # If we got exactly 100, assume there's more data
                        estimated_records = max(5000, len(sample) * 50)  # Conservative estimate
                    elif sample and hasattr(sample, '__len__'):
                        estimated_records = len(sample)
            except Exception as e:
                logger.warning(f"Could not estimate record count: {e}, using default")
        
        # Parse query parameters for additional hints
        if hasattr(request, 'args'):
            # Look for time range hints
            time_range = request.args.get('time_range', '').lower()
            if 'day' in time_range:
                multiplier = 1
            elif 'week' in time_range or '7' in time_range:
                multiplier = 7
            elif 'month' in time_range or '30' in time_range:
                multiplier = 30
            elif '90' in time_range:
                multiplier = 90
            elif 'year' in time_range:
                multiplier = 365
            else:
                multiplier = 7  # Default to week
            
            # Estimate based on time range (rough heuristic)
            time_based_estimate = multiplier * 100  # ~100 records per day
            estimated_records = max(estimated_records, time_based_estimate)
        
        estimated_chunks = min(
            math.ceil(estimated_records / self.chunk_size),
            self.max_chunks
        )
        
        # Dynamic time estimation based on expected data complexity
        base_time_per_chunk = 0.2  # Fast processing
        if estimated_records > 50000:
            base_time_per_chunk = 0.8  # Slower for large datasets
        elif estimated_records > 10000:
            base_time_per_chunk = 0.5  # Medium for medium datasets
        
        estimated_time_seconds = estimated_chunks * base_time_per_chunk
        
        return {
            'estimated_records': estimated_records,
            'estimated_chunks': estimated_chunks,
            'estimated_time_seconds': round(estimated_time_seconds, 1),
            'chunk_size': self.chunk_size,
            'performance_level': self._get_performance_level(estimated_chunks),
            'estimation_method': 'dynamic' if data_loader else 'default'
        }
    
    def _get_performance_level(self, estimated_chunks: int) -> str:
        """Get performance level based on chunk count"""
        if estimated_chunks <= 5:
            return "excellent"
        elif estimated_chunks <= 15:
            return "good"
        elif estimated_chunks <= 30:
            return "acceptable"
        else:
            return "slow"

class APIBatchLoader:
    """
    Batch loading for processing large datasets in background
    """
    
    @staticmethod
    def batch_processing_endpoint(batch_processor: Callable, max_batch_size: int = 10000):
        """
        Decorator for endpoints that process data in batches
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                batch_mode = request.args.get('batch_mode', 'false').lower() == 'true'
                batch_id = request.args.get('batch_id')
                batch_size = int(request.args.get('batch_size', max_batch_size))
                
                if not batch_mode:
                    # Return batch processing information
                    return jsonify({
                        'batch_processing': {
                            'available': True,
                            'max_batch_size': max_batch_size,
                            'instructions': {
                                'start_batch': f'{request.url}?batch_mode=true&batch_size=<size>',
                                'check_status': f'{request.url}?batch_mode=true&batch_id=<id>',
                                'parameters': {
                                    'batch_size': f'Number of records to process (max: {max_batch_size})',
                                    'batch_id': 'ID to check processing status'
                                }
                            }
                        }
                    }), 200
                
                if batch_id:
                    # Check batch status
                    return APIBatchLoader._check_batch_status(batch_id)
                
                # Start new batch processing
                return APIBatchLoader._start_batch_processing(batch_processor, batch_size, *args, **kwargs)
            
            return decorated_function
        return decorator
    
    @staticmethod
    def _start_batch_processing(batch_processor: Callable, batch_size: int, *args, **kwargs) -> Tuple[Dict, int]:
        """
        Start batch processing with real asynchronous implementation
        """
        import uuid
        import threading
        
        batch_id = str(uuid.uuid4())
        start_time = datetime.now()
        
        # Store batch status in a simple in-memory store (in production, use Redis/database)
        if not hasattr(APIBatchLoader, '_batch_status'):
            APIBatchLoader._batch_status = {}
        
        # Initialize batch status
        APIBatchLoader._batch_status[batch_id] = {
            'status': 'processing',
            'batch_size': batch_size,
            'started_at': start_time.isoformat(),
            'progress': 0,
            'result': None,
            'error': None
        }
        
        def process_batch_async():
            """Execute batch processing in background thread"""
            try:
                logger.info(f"🔄 [BATCH] Starting async batch processing {batch_id} (size: {batch_size})")
                
                # Execute the actual batch processor
                batch_result = batch_processor(batch_size=batch_size, batch_id=batch_id, *args, **kwargs)
                
                processing_time = (datetime.now() - start_time).total_seconds() * 1000
                
                # Update batch status
                APIBatchLoader._batch_status[batch_id].update({
                    'status': 'completed',
                    'completed_at': datetime.now().isoformat(),
                    'processing_time_ms': round(processing_time, 2),
                    'result': batch_result,
                    'progress': 100
                })
                
                logger.info(f"✅ [BATCH] Batch {batch_id} completed in {processing_time:.1f}ms")
                
            except Exception as e:
                processing_time = (datetime.now() - start_time).total_seconds() * 1000
                logger.error(f"❌ [BATCH] Batch processing failed {batch_id}: {e}")
                
                # Update batch status with error
                APIBatchLoader._batch_status[batch_id].update({
                    'status': 'failed',
                    'failed_at': datetime.now().isoformat(),
                    'processing_time_ms': round(processing_time, 2),
                    'error': str(e)
                })
        
        # Start processing in background thread
        processing_thread = threading.Thread(target=process_batch_async)
        processing_thread.daemon = True
        processing_thread.start()
        
        # Return batch ID immediately for status tracking
        return jsonify({
            'batch_processing': {
                'batch_id': batch_id,
                'status': 'accepted',
                'batch_size': batch_size,
                'started_at': start_time.isoformat(),
                'status_check_url': f"{request.url}?batch_mode=true&batch_id={batch_id}",
                'message': 'Batch processing started. Use batch_id to check status.'
            }
        }), 202  # Accepted - processing in background
    
    @staticmethod
    def _check_batch_status(batch_id: str) -> Tuple[Dict, int]:
        """
        Check the status of a batch processing job
        """
        if not hasattr(APIBatchLoader, '_batch_status'):
            APIBatchLoader._batch_status = {}
        
        if batch_id not in APIBatchLoader._batch_status:
            return jsonify({
                'batch_processing': {
                    'batch_id': batch_id,
                    'status': 'not_found',
                    'message': 'Batch ID not found. It may have been cleaned up or never existed.'
                }
            }), 404
        
        batch_info = APIBatchLoader._batch_status[batch_id]
        
        response_data = {
            'batch_processing': {
                'batch_id': batch_id,
                'status': batch_info['status'],
                'batch_size': batch_info['batch_size'],
                'started_at': batch_info['started_at'],
                'progress': batch_info['progress']
            }
        }
        
        if batch_info['status'] == 'completed':
            response_data['batch_processing'].update({
                'completed_at': batch_info.get('completed_at'),
                'processing_time_ms': batch_info.get('processing_time_ms'),
                'result': batch_info.get('result')
            })
            status_code = 200
        elif batch_info['status'] == 'failed':
            response_data['batch_processing'].update({
                'failed_at': batch_info.get('failed_at'),
                'processing_time_ms': batch_info.get('processing_time_ms'),
                'error': batch_info.get('error')
            })
            status_code = 500
        else:  # processing
            response_data['batch_processing']['estimated_completion'] = 'Processing in background'
            status_code = 202  # Still processing
        
        return jsonify(response_data), status_code

class APIChunkedDataProcessor:
    """
    Process large datasets in chunks to avoid memory issues
    """
    
    @staticmethod
    def chunked_processing(data_processor: Callable, chunk_size: int = 5000):
        """
        Decorator for processing data in chunks
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                chunked_processing = request.args.get('chunked', 'false').lower() == 'true'
                
                if not chunked_processing:
                    # Process normally
                    return f(*args, **kwargs)
                
                try:
                    start_time = time.time()
                    logger.info(f"🔄 [CHUNKED] Starting chunked processing (chunk size: {chunk_size})")
                    
                    # Get data source for chunked processing
                    data_source = data_processor(get_source=True, *args, **kwargs)
                    
                    if not data_source:
                        return jsonify({
                            'error': 'No data source available for chunked processing',
                            'chunked_processing': {'completed': False}
                        }), 400
                    
                    # Process data in real chunks
                    all_results = []
                    chunk_count = 0
                    total_processed = 0
                    chunk_num = 0
                    
                    # Handle different data source types
                    if hasattr(data_source, '__iter__') and not isinstance(data_source, (str, dict)):
                        # Iterable data source (list, generator, pandas DataFrame, etc.)
                        
                        if hasattr(data_source, 'iterrows'):
                            # Pandas DataFrame
                            chunks = [data_source.iloc[i:i+chunk_size] for i in range(0, len(data_source), chunk_size)]
                        elif hasattr(data_source, '__len__'):
                            # List or similar sequence
                            chunks = [data_source[i:i+chunk_size] for i in range(0, len(data_source), chunk_size)]
                        else:
                            # Generator or iterator - process on demand
                            chunks = []
                            current_chunk = []
                            for item in data_source:
                                current_chunk.append(item)
                                if len(current_chunk) >= chunk_size:
                                    chunks.append(current_chunk)
                                    current_chunk = []
                            if current_chunk:  # Add remaining items
                                chunks.append(current_chunk)
                        
                        # Process each chunk
                        for chunk_data in chunks:
                            if not chunk_data or (hasattr(chunk_data, '__len__') and len(chunk_data) == 0):
                                break
                                
                            chunk_start_time = time.time()
                            
                            # Process this chunk with the data processor
                            chunk_result = data_processor(
                                chunk_data=chunk_data,
                                chunk_num=chunk_num,
                                chunk_size=chunk_size,
                                *args, **kwargs
                            )
                            
                            if chunk_result is not None:
                                all_results.append(chunk_result)
                                chunk_count += 1
                                
                                # Calculate items processed in this chunk
                                if hasattr(chunk_data, '__len__'):
                                    items_in_chunk = len(chunk_data)
                                else:
                                    items_in_chunk = 1
                                    
                                total_processed += items_in_chunk
                                
                                chunk_time = (time.time() - chunk_start_time) * 1000
                                logger.info(f"✅ [CHUNKED] Processed chunk {chunk_num} ({items_in_chunk} items) in {chunk_time:.1f}ms")
                            
                            chunk_num += 1
                    else:
                        # Single item or unsupported data source
                        chunk_result = data_processor(
                            chunk_data=data_source,
                            chunk_num=0,
                            chunk_size=1,
                            *args, **kwargs
                        )
                        all_results.append(chunk_result)
                        chunk_count = 1
                        total_processed = 1
                    
                    total_time = (time.time() - start_time) * 1000
                    
                    return jsonify({
                        'chunked_processing': {
                            'completed': True,
                            'chunks_processed': chunk_count,
                            'total_items': total_processed,
                            'processing_time_ms': round(total_time, 2),
                            'average_chunk_time_ms': round(total_time / max(chunk_count, 1), 2),
                            'chunk_size': chunk_size,
                            'results': all_results,
                            'performance_stats': {
                                'items_per_second': round(total_processed / (total_time / 1000), 2) if total_time > 0 else 0,
                                'ms_per_item': round(total_time / max(total_processed, 1), 2)
                            }
                        }
                    }), 200
                    
                except Exception as e:
                    logger.error(f"❌ [CHUNKED] Chunked processing failed: {e}")
                    
                    return jsonify({
                        'error': 'Chunked processing failed',
                        'details': str(e),
                        'chunked_processing': {
                            'completed': False,
                            'error_at': datetime.now().isoformat()
                        }
                    }), 500
            
            return decorated_function
        return decorator

# Helper functions
def create_progressive_metadata(chunk_num: int, chunk_size: int, total_count: Optional[int] = None) -> Dict[str, Any]:
    """
    Create standard progressive loading metadata
    """
    metadata = {
        'chunk_number': chunk_num,
        'chunk_size': chunk_size,
        'has_more_chunks': True,  # Will be updated by actual implementation
        'timestamp': datetime.now().isoformat()
    }
    
    if total_count is not None:
        metadata['total_records'] = total_count
        metadata['records_loaded'] = min((chunk_num + 1) * chunk_size, total_count)
        metadata['progress_percentage'] = (metadata['records_loaded'] / total_count) * 100
    
    return metadata

def estimate_progressive_performance(record_count: int, chunk_size: int = 1000, data_complexity: str = 'medium') -> Dict[str, Any]:
    """
    Estimate progressive loading performance with dynamic factors
    """
    estimated_chunks = math.ceil(record_count / chunk_size)
    
    # Dynamic time estimation based on data complexity and size
    base_time_per_chunk = {
        'simple': 0.1,   # Simple data structures
        'medium': 0.3,   # Standard database records
        'complex': 0.6,  # Complex calculations or transformations
        'heavy': 1.0     # Heavy processing or external API calls
    }.get(data_complexity.lower(), 0.3)
    
    # Adjust for dataset size (larger datasets have overhead)
    size_multiplier = 1.0
    if record_count > 100000:
        size_multiplier = 1.5
    elif record_count > 50000:
        size_multiplier = 1.2
    elif record_count < 1000:
        size_multiplier = 0.8
    
    estimated_time = estimated_chunks * base_time_per_chunk * size_multiplier
    
    # Performance levels based on both chunks and time
    if estimated_chunks <= 5 and estimated_time <= 2:
        performance_level = "excellent"
    elif estimated_chunks <= 15 and estimated_time <= 8:
        performance_level = "good"
    elif estimated_chunks <= 35 and estimated_time <= 20:
        performance_level = "acceptable"
    else:
        performance_level = "slow"
    
    return {
        'estimated_chunks': estimated_chunks,
        'estimated_time_seconds': round(estimated_time, 1),
        'performance_level': performance_level,
        'chunk_size': chunk_size,
        'record_count': record_count,
        'data_complexity': data_complexity,
        'size_multiplier': size_multiplier,
        'throughput_estimate': {
            'records_per_second': round(record_count / estimated_time, 0) if estimated_time > 0 else record_count,
            'chunks_per_second': round(estimated_chunks / estimated_time, 1) if estimated_time > 0 else estimated_chunks
        }
    }

# Global progressive loader instance
progressive_loader = APIProgressiveLoader()
batch_loader = APIBatchLoader()
chunked_processor = APIChunkedDataProcessor()