from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import time
from datetime import datetime, timedelta
import pandas as pd

from services.core_data_service import core_data_service, DataQuery, DataType
from services.config_service import config_service
from services.adaptive_data_resolution import adaptive_resolution
from services.consolidated_cache_service import cached, cache_service
from utils.api_cache_utils import cached_api_response
from services.advanced_filter_service import advanced_filter_service
from utils.optimized_serializer import serialize_dataframe_optimized

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

water_quality_bp = Blueprint('water_quality_bp', __name__)


def _intelligent_downsample_water_quality(df: pd.DataFrame, target_size: int = 5000) -> pd.DataFrame:
    """
    Intelligently downsample water quality datasets while preserving important patterns
    """
    # Validate input type
    if not isinstance(df, pd.DataFrame):
        logger.error(f"Expected DataFrame but received {type(df)}: {df}")
        return pd.DataFrame()  # Return empty DataFrame instead of causing errors
        
    if len(df) <= target_size:
        return df
    
    logger.info(f"[WATER QUALITY PERFORMANCE] Downsampling {len(df)} records to ~{target_size}")
    
    # Sort by timestamp to ensure proper chronological sampling
    df_sorted = df.sort_values('measurement_timestamp').reset_index(drop=True)
    
    # Calculate sampling interval
    sample_interval = len(df_sorted) // target_size
    
    # Regular sampling as base
    sampled_indices = set(range(0, len(df_sorted), sample_interval))
    
    # Add peaks and valleys for key water quality parameters
    wq_params = ['water_level_m', 'temperature_c', 'conductivity_us_cm']
    for param in wq_params:
        if param in df_sorted.columns and df_sorted[param].notna().sum() > 10:
            values = df_sorted[param].fillna(method='ffill').fillna(method='bfill')
            
            try:
                from scipy.signal import find_peaks
                peaks, _ = find_peaks(values, distance=max(1, len(values) // 100))
                valleys, _ = find_peaks(-values, distance=max(1, len(values) // 100))
                
                sampled_indices.update(peaks)
                sampled_indices.update(valleys)
                
            except ImportError:
                # Fallback: efficient, vectorized local-extrema approximation
                # Avoid O(n·window) loops that spike CPU on large datasets
                vector_threshold = 20000
                if len(values) <= vector_threshold:
                    win = max(5, len(values) // 200)
                    # Use a centered rolling window to approximate local maxima/minima
                    roll_max = values.rolling(window=win * 2 + 1, center=True, min_periods=win).max()
                    roll_min = values.rolling(window=win * 2 + 1, center=True, min_periods=win).min()
                    peak_mask = values >= roll_max
                    valley_mask = values <= roll_min
                    sampled_indices.update(list(values[peak_mask].index))
                    sampled_indices.update(list(values[valley_mask].index))
                else:
                    # Dataset is large; rely on uniform sampling + first/last
                    logger.info("Skipping fallback peak detection for large dataset; using uniform sampling only")
    
    # Ensure first and last points are included
    sampled_indices.add(0)
    sampled_indices.add(len(df_sorted) - 1)
    
    # Convert to sorted list and limit to target size
    final_indices = sorted(list(sampled_indices))[:target_size]
    
    result_df = df_sorted.iloc[final_indices].copy()
    
    compression_ratio = len(df) / len(result_df)
    logger.info(f"[WATER QUALITY PERFORMANCE] Downsampled to {len(result_df)} records ({compression_ratio:.1f}x compression)")
    
    return result_df

@water_quality_bp.route('/data', methods=['GET'])
@login_required
@cached_api_response(ttl=1800)  # Site-aware caching that preserves filtering - 30 minutes
def get_water_quality_data():
    """
    Enhanced water quality data endpoint with smart loading strategy:
    - Intelligent data limits based on performance mode and time range
    - Aggressive caching (30 min TTL) to avoid repeated DB queries
    - Progressive loading instead of full streaming
    - Database query optimization with targeted limits
    - Smart downsampling only when necessary
    """
    start_time = time.time()
    logger.info(f"[WATER QUALITY] API request with comprehensive optimization")

    # Parse filter configuration with simplified site handling
    filter_config = advanced_filter_service.parse_request_filters(request.args)
    
    # Simple site selection - use parsed sites or default
    selected_sites = filter_config.sites if filter_config.sites else ['S1', 'S2', 'S3']
    time_range = filter_config.time_range
    start_date = filter_config.start_date  
    end_date = filter_config.end_date
    performance_mode = request.args.get('performance_mode', 'balanced')
    no_downsample = str(request.args.get('no_downsample', 'false')).lower() == 'true'
    # Optional chunked pagination for large responses
    chunk_size = request.args.get('chunk_size', type=int)
    offset = request.args.get('offset', 0, type=int)

    logger.info(f"   Selected sites: {selected_sites}")
    logger.info(f"   Time range: {time_range}")
    logger.info(f"   Custom dates: {start_date} to {end_date}")
    logger.info(f"   Advanced filters: parameters={filter_config.parameters}, "
               f"quality={filter_config.data_quality.value}, alerts={filter_config.alert_level.value}")

    try:
        # Set time_range default if needed
        if not time_range:
            time_range = 'Last 90 Days'

        logger.info(f"[WATER QUALITY] Processed inputs - sites={selected_sites}, time_range={time_range}")

        # Handle custom date ranges - accept both 'custom' and 'Custom Range'
        if (time_range in ["custom", "Custom Range"]) and start_date and end_date:
            logger.info(f"[WATER QUALITY] Using custom date range: {start_date} to {end_date}")
        else:
            days_back = config_service.get_days_back_for_range(time_range)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            
            # Log the dynamic date range being used
            logger.info(f"[DYNAMIC RANGE] Using current date range: {start_date} to {end_date} (days_back: {days_back})")

        # Calculate days back for performance optimization
        days_back = (end_date - start_date).days if start_date and end_date else 30

        # Get optimal resolution configuration for the date range
        resolution_config = adaptive_resolution.get_optimal_resolution(start_date, end_date, performance_mode or "balanced")
        logger.info(f"[ADAPTIVE RESOLUTION] {resolution_config['aggregation_method']} aggregation "
                   f"for {days_back} days ({resolution_config['performance_tier']} tier)")

        # Implement smart data loading strategy
        logger.info(f"[WATER QUALITY] Loading {days_back}-day dataset with performance mode: {performance_mode}")
        
        # Calculate intelligent limit based on performance mode and time range
        # If client requests full detail, elevate to maximum mode
        if no_downsample:
            performance_mode = 'maximum'
        if performance_mode == 'maximum':
            # For maximum detail, set reasonable upper bound but still limit for performance
            if days_back <= 7:
                initial_limit = 50000  # 1 week - can handle more data
            elif days_back <= 30:
                initial_limit = 100000  # 1 month 
            else:
                initial_limit = 200000  # Longer periods
        else:
            # For other modes, use smaller limits for faster loading
            performance_limits = {
                'fast': 5000,
                'balanced': 15000, 
                'high_detail': 30000
            }
            initial_limit = performance_limits.get(performance_mode, 15000)
        
        # If client requested chunking, ensure we fetch at least enough rows to cover the desired window
        if chunk_size and chunk_size > 0:
            try:
                initial_limit = max(initial_limit or 0, (offset or 0) + chunk_size)
            except Exception:
                pass
        logger.info(f"[SMART LOADING] Using initial limit: {initial_limit} for {performance_mode} mode (chunk_size={chunk_size} offset={offset})")
        
        df = core_data_service.load_water_quality_data(
            sites=selected_sites,
            start_date=start_date,
            end_date=end_date,
            limit=initial_limit  # Pass the calculated limit
        )

        if not df.empty:
            logger.info(f"[WATER QUALITY] Loaded {len(df)} water quality records successfully")
            
            # Apply advanced filters BEFORE performance optimizations
            df, filter_stats = advanced_filter_service.apply_advanced_filters(df, filter_config)
            logger.info(f"[ADVANCED FILTER] Applied filters: {len(df)} records remaining "
                       f"({filter_stats['retention_rate']}% retention)")

            # Smart downsampling - only if we loaded more than we need for the performance tier
            performance_display_limits = {
                'fast': 2000,
                'balanced': 5000, 
                'high_detail': 10000,
                'maximum': None  # No limit - plot all data points
            }
            display_limit = performance_display_limits.get(performance_mode, None)
            if no_downsample:
                display_limit = None

            # Only downsample if we have more data than needed for display AND the mode requires it
            if display_limit is not None and len(df) > display_limit:
                logger.info(f"[SMART DOWNSAMPLING] Dataset has {len(df)} records, downsampling to {display_limit} for {performance_mode} mode")
                df = _intelligent_downsample_water_quality(df, target_size=display_limit)
            else:
                if performance_mode == 'maximum':
                    logger.info(f"[MAXIMUM DETAIL] Showing all {len(df)} loaded data points")
                else:
                    logger.info(f"[OPTIMAL LOADING] Dataset size {len(df)} is optimal for {performance_mode} mode - no downsampling needed")

            # Apply in-memory chunk slicing if requested
            full_len = len(df)
            if chunk_size and chunk_size > 0:
                start_idx = max(0, int(offset or 0))
                end_idx = max(start_idx, start_idx + int(chunk_size))
                df = df.iloc[start_idx:end_idx]
                logger.info(f"📦 [WQ CHUNK] Returning chunk rows={len(df)} (from {full_len}) offset={start_idx} size={chunk_size}")

            # Apply adaptive resolution if needed (but not for maximum detail mode)
            if (performance_mode != 'maximum' and not no_downsample and 
                resolution_config['aggregation_method'] != "raw" and 
                len(df) > resolution_config['target_points']):
                logger.info(f"[ADAPTIVE RESOLUTION] Applying {resolution_config['aggregation_method']} aggregation")
                df = adaptive_resolution.aggregate_data(df, resolution_config)
            elif performance_mode == 'maximum':
                logger.info(f"[MAXIMUM DETAIL] Skipping adaptive resolution - preserving raw data")

        # Ensure advanced filters use the same date window computed above
        try:
            # Force advanced filter to respect backend-computed range to avoid empty intersections
            # when frontend passes relative ranges (e.g., "Last 30 Days") based on current date.
            if start_date and end_date:
                # Mark as custom so AdvancedFilterService uses provided dates
                filter_config.time_range = "custom"
                filter_config.start_date = start_date
                filter_config.end_date = end_date
        except Exception:
            # Non-fatal; proceed without overriding if something unexpected happens
            pass

        # Calculate performance metrics
        loading_time_ms = (time.time() - start_time) * 1000
        
        # Log performance improvements
        if loading_time_ms < 1000:
            logger.info(f"[PERFORMANCE WIN] Fast response: {loading_time_ms:.0f}ms (likely cache hit)")
        else:
            logger.info(f"[PERFORMANCE] Response time: {loading_time_ms:.0f}ms")

        # Optimize serialization
        try:
            wq_data_serialized = serialize_dataframe_optimized(df)
        except Exception as e:
            logger.warning(f"Optimized serialization failed: {e}, using fallback")
            wq_data_serialized = df.to_dict('records') if not df.empty else []

        # Build comprehensive response with all optimization metadata
        structured_data = {
            'water_quality_data': wq_data_serialized,
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'record_count': len(df),
                'sites': selected_sites,
                'time_range': time_range,
                'columns': list(df.columns) if not df.empty else [],
                'date_range': {
                    'start': str(df['measurement_timestamp'].min()) if not df.empty and 'measurement_timestamp' in df.columns else None,
                    'end': str(df['measurement_timestamp'].max()) if not df.empty and 'measurement_timestamp' in df.columns else None
                },
                'performance': {
                    'loading_time_ms': round(loading_time_ms, 2),
                    'optimization_tier': 'enterprise'
                },
                'chunked': bool(chunk_size),
                'chunk_info': ({
                    'offset': int(offset or 0),
                    'chunk_size': int(chunk_size or 0),
                    'has_more': bool(chunk_size and (int(offset or 0) + int(chunk_size or 0) < int(full_len)))
                } if chunk_size else None),
                'advanced_filters': filter_stats if 'filter_stats' in locals() else None,
                'has_data': not df.empty,
                'no_downsample': no_downsample
            }
        }

        logger.info(f"[WATER QUALITY] SUCCESS: Loaded {len(df)} records in {loading_time_ms:.1f}ms")
        return structured_data, 200

    except Exception as e:
        loading_time_ms = (time.time() - start_time) * 1000
        logger.error(f"[WATER QUALITY] ERROR: {e}")
        import traceback
        logger.error(f"[WATER QUALITY] Traceback: {traceback.format_exc()}")

        return jsonify({
            'error': 'Failed to load water quality data',
            'details': str(e),
            'metadata': {
                'loading_time_ms': round(loading_time_ms, 2),
                'has_data': False,
                'error_occurred': True
            }
        }), 500


@water_quality_bp.route('/sites', methods=['GET'])
@login_required
@cached_api_response(ttl=1800)  # Cache for 30 minutes as sites don't change frequently
def get_available_sites():
    """Get all available monitoring sites"""
    logger.info("Received request for available sites API.")
    try:
        start_time = time.time()
        
        # Get available sites from core data service
        sites_data = core_data_service.get_available_sites()
        
        if not sites_data:
            logger.warning("No sites data available")
            return jsonify({
                'sites': [],
                'metadata': {
                    'loading_time_ms': round((time.time() - start_time) * 1000, 2),
                    'has_data': False,
                    'total_sites': 0
                }
            }), 200
        
        # Convert to expected format for frontend
        formatted_sites = []
        for site in sites_data:
            formatted_sites.append({
                'id': site.get('site_code', site.get('id', 'Unknown')),
                'name': f"Site {site.get('site_code', site.get('id', 'Unknown'))}",
                'location': site.get('location', site.get('site_name', f"Location {site.get('site_code', 'Unknown')}")),
                'status': 'active',  # Default to active, can be enhanced later
                'coordinates': {
                    'lat': site.get('latitude'),
                    'lng': site.get('longitude')
                } if site.get('latitude') and site.get('longitude') else None
            })
        
        loading_time_ms = (time.time() - start_time) * 1000
        
        logger.info(f"[SITES] SUCCESS: Loaded {len(formatted_sites)} sites in {loading_time_ms:.1f}ms")
        
        return jsonify({
            'sites': formatted_sites,
            'metadata': {
                'loading_time_ms': round(loading_time_ms, 2),
                'has_data': len(formatted_sites) > 0,
                'total_sites': len(formatted_sites),
                'last_updated': datetime.now().isoformat()
            }
        }), 200
        
    except Exception as e:
        loading_time_ms = (time.time() - start_time) * 1000
        logger.error(f"[SITES] ERROR: {e}")
        import traceback
        logger.error(f"[SITES] Traceback: {traceback.format_exc()}")
        
        return jsonify({
            'sites': [],
            'error': 'Failed to load sites data',
            'details': str(e),
            'metadata': {
                'loading_time_ms': round(loading_time_ms, 2),
                'has_data': False,
                'error_occurred': True
            }
        }), 500
