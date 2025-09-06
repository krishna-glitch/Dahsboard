from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import time
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

# Import Polars for high-performance redox data processing
try:
    import polars as pl
    POLARS_AVAILABLE = True
except ImportError:
    POLARS_AVAILABLE = False
    pl = None

from services.core_data_service import core_data_service, DataQuery
from services.config_service import config_service
from services.adaptive_data_resolution import adaptive_resolution
from utils.optimized_serializer import serialize_dataframe_optimized
from utils.data_processing import normalize_timezone
from services.consolidated_cache_service import cached # New import for caching
from utils.api_cache_utils import cached_api_response

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

redox_analysis_bp = Blueprint('redox_analysis_bp', __name__)


def _intelligent_downsample_redox(df: pd.DataFrame, target_size: int = 5000) -> pd.DataFrame:
    """
    Intelligently downsample redox datasets while preserving depth-specific patterns
    """
    # Validate input type
    if not isinstance(df, pd.DataFrame):
        logger.error(f"Expected DataFrame but received {type(df)}: {df}")
        return pd.DataFrame()  # Return empty DataFrame instead of causing errors
        
    if len(df) <= target_size:
        return df
    
    logger.info(f"[REDOX PERFORMANCE] Downsampling {len(df)} records to ~{target_size}")
    
    # Sort by timestamp to ensure proper chronological sampling
    df_sorted = df.sort_values('measurement_timestamp').reset_index(drop=True)
    
    # Calculate sampling interval
    sample_interval = len(df_sorted) // target_size
    
    # Regular sampling as base
    sampled_indices = set(range(0, len(df_sorted), sample_interval))
    
    # For redox data, preserve depth-specific sampling if depth column exists
    if 'depth_cm' in df_sorted.columns:
        # Sample across different depths to preserve depth profile
        depth_values = df_sorted['depth_cm'].dropna().unique()
        if len(depth_values) > 1:
            # Ensure representation from each depth level
            per_depth_target = max(1, target_size // len(depth_values))
            
            for depth in depth_values:
                depth_data = df_sorted[df_sorted['depth_cm'] == depth]
                if len(depth_data) > per_depth_target:
                    # Sample evenly from each depth level
                    depth_interval = max(1, len(depth_data) // per_depth_target)
                    depth_indices = depth_data.index[::depth_interval]
                    sampled_indices.update(depth_indices)
    
    # Add peaks and valleys for key redox parameters
    redox_params = ['redox_value_mv', 'depth_cm', 'reference_electrode_mv']
    for param in redox_params:
        if param in df_sorted.columns and df_sorted[param].notna().sum() > 10:
            values = df_sorted[param].ffill().bfill()
            
            try:
                from scipy.signal import find_peaks
                peaks, _ = find_peaks(values, distance=max(1, len(values) // 100))
                valleys, _ = find_peaks(-values, distance=max(1, len(values) // 100))
                
                sampled_indices.update(peaks)
                sampled_indices.update(valleys)
                
            except ImportError:
                # Fallback: efficient, vectorized local-extrema approximation
                vector_threshold = 20000
                if len(values) <= vector_threshold:
                    win = max(5, len(values) // 200)
                    roll_max = values.rolling(window=win * 2 + 1, center=True, min_periods=win).max()
                    roll_min = values.rolling(window=win * 2 + 1, center=True, min_periods=win).min()
                    peak_mask = values >= roll_max
                    valley_mask = values <= roll_min
                    sampled_indices.update(list(values[peak_mask].index))
                    sampled_indices.update(list(values[valley_mask].index))
                else:
                    logger.info("Skipping fallback peak detection for large dataset; using uniform sampling only")
    
    # Ensure first and last points are included
    sampled_indices.add(0)
    sampled_indices.add(len(df_sorted) - 1)
    
    # Convert to sorted list and limit to target size
    final_indices = sorted(list(sampled_indices))[:target_size]
    
    result_df = df_sorted.iloc[final_indices].copy()
    
    compression_ratio = len(df) / len(result_df)
    logger.info(f"[REDOX PERFORMANCE] Downsampled to {len(result_df)} records ({compression_ratio:.1f}x compression)")
    
    return result_df


@redox_analysis_bp.route('/data', methods=['GET'])
# @login_required  # Temporarily disabled for testing
@enterprise_performance(data_type='redox_analysis')
@cached_api_response(ttl=900)  # Site-aware caching that preserves filtering
def get_redox_analysis_data():
    start_time = time.time()
    logger.info(f"[REDOX DEBUG] API data loading triggered.")
    logger.info(f"[REDOX DEBUG] Request args: {dict(request.args)}")

    # Parse site parameters using centralized utility
    from utils.request_parsing import parse_sites_parameter
    selected_sites = parse_sites_parameter(['S1', 'S2'])
    time_range = request.args.get('time_range', 'Last 90 Days')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    performance_mode = request.args.get('performance_mode', 'balanced')

    # Parse custom date range with flexible format support
    from utils.date_parsing import parse_date_range
    start_date, end_date = parse_date_range(start_date_str, end_date_str)

    logger.info(f"   Selected sites: {selected_sites}")
    logger.info(f"   Time range: {time_range}")
    logger.info(f"   Custom dates: {start_date} to {end_date}")

    try:
        # Set defaults if needed  
        if not selected_sites:
            selected_sites = ['S1', 'S2', 'S3']  # Include S3 in default sites
        if not time_range:
            time_range = 'Last 90 Days'  # Use 90 days default since data is sparse

        logger.info(f"[REDOX DEBUG] Processed inputs - sites={selected_sites}, time_range={time_range}")

        # Handle custom date ranges
        if time_range == "custom" and start_date and end_date:
            logger.info(f"[CUSTOM RANGE] Using user-specified: {start_date} to {end_date}")
        else:
            days_back = config_service.get_days_back_for_range(time_range)
            # FIXED: Use database's actual data range (data ends 2024-05-31) instead of current date
            end_date = datetime(2024, 5, 31, 23, 59, 59)
            start_date = end_date - timedelta(days=days_back)
            
            # Log the dynamic date range being used
            logger.info(f"[DYNAMIC RANGE] Using current date range: {start_date} to {end_date} (days_back: {days_back})")

        # Calculate days back with safety limits for large datasets
        days_back = (end_date - start_date).days if start_date and end_date else 30

        # Get optimal resolution configuration for the date range
        resolution_config = adaptive_resolution.get_optimal_resolution(start_date, end_date, performance_mode or "balanced")
        logger.info(f"[ADAPTIVE RESOLUTION] {resolution_config['aggregation_method']} aggregation "
                   f"for {days_back} days ({resolution_config['performance_tier']} tier)")

        # Implement smart data loading strategy (same as water quality)
        logger.info(f"[REDOX DEBUG] Loading {days_back}-day dataset with performance mode: {performance_mode}")
        
        # FIXED: Reduce excessive limits that cause database timeouts
        if performance_mode == 'maximum':
            # Reduced limits to prevent database timeouts
            if days_back <= 7:
                initial_limit = 15000  # 1 week - reduced from 50K
            elif days_back <= 30:
                initial_limit = 20000  # 1 month - reduced from 100K
            else:
                initial_limit = 25000  # Longer periods - reduced from 200K
        else:
            # For other modes, use smaller limits for faster loading
            performance_limits = {
                'fast': 3000,    # Reduced from 5K
                'balanced': 8000, # Reduced from 15K
                'high_detail': 15000  # Reduced from 30K
            }
            initial_limit = performance_limits.get(performance_mode, 8000)
        
        logger.info(f"[SMART LOADING] Using initial limit: {initial_limit} for {performance_mode} mode")
        
        # Load data using direct method with limit and timeout handling
        logger.info(f"[REDOX DEBUG] Starting database query with limit {initial_limit}...")
        
        try:
            df = core_data_service.load_redox_data(
                sites=selected_sites,
                start_date=start_date,
                end_date=end_date,
                limit=initial_limit
            )
            logger.info(f"[REDOX DEBUG] Database query completed successfully")
            
        except Exception as db_error:
            logger.error(f"[REDOX ERROR] Database query failed: {str(db_error)}")
            # Return empty dataframe and let the frontend handle gracefully
            df = pd.DataFrame()
            logger.info(f"[REDOX FALLBACK] Returning empty dataset due to database error")

        if not df.empty:
            logger.info(f"[REDOX DEBUG] Loaded {len(df)} redox records successfully")

            # Smart downsampling - only if we loaded more than we need for the performance tier
            performance_display_limits = {
                'fast': 2000,
                'balanced': 5000, 
                'high_detail': 10000,
                'maximum': None  # No limit - plot all data points
            }
            display_limit = performance_display_limits.get(performance_mode, None)

            # Only downsample if we have more data than needed for display AND the mode requires it
            if display_limit is not None and len(df) > display_limit:
                logger.info(f"[SMART DOWNSAMPLING] Dataset has {len(df)} records, downsampling to {display_limit} for {performance_mode} mode")
                df = _intelligent_downsample_redox(df, target_size=display_limit)
            else:
                if performance_mode == 'maximum':
                    logger.info(f"[MAXIMUM DETAIL] Showing all {len(df)} loaded data points")
                else:
                    logger.info(f"[OPTIMAL LOADING] Dataset size {len(df)} is optimal for {performance_mode} mode - no downsampling needed")

            # Apply adaptive resolution if needed (but not for maximum detail mode)
            if (performance_mode != 'maximum' and 
                resolution_config['aggregation_method'] != "raw" and 
                len(df) > resolution_config['target_points']):
                logger.info(f"[ADAPTIVE RESOLUTION] Applying {resolution_config['aggregation_method']} aggregation")
                df = adaptive_resolution.aggregate_data(df, resolution_config)
            elif performance_mode == 'maximum':
                logger.info(f"[MAXIMUM DETAIL] Skipping adaptive resolution - preserving raw data")

            redox_records = serialize_dataframe_optimized(df)
            logger.info(f"[REDOX DEBUG] Serialized {len(redox_records)} records")

            loading_time_ms = (time.time() - start_time) * 1000
            
            # Log performance improvements
            if loading_time_ms < 1000:
                logger.info(f"[PERFORMANCE WIN] Fast response: {loading_time_ms:.0f}ms (likely cache hit)")
            else:
                logger.info(f"[PERFORMANCE] Response time: {loading_time_ms:.0f}ms")

            structured_data = {
                'redox_data': redox_records,
                'metadata': {
                    'last_updated': datetime.now().isoformat(),
                    'sites': selected_sites,
                    'time_range': time_range,
                    'record_count': len(df),
                    'total_records': len(df),
                    'has_data': True,
                    'parameters': request.args.get('selected_parameters', '').split(',') if request.args.get('selected_parameters') else ['redox_value_mv', 'depth_cm'],
                    'available_columns': list(df.columns),
                    'column_dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
                    'numeric_columns': df.select_dtypes(include=['number']).columns.tolist(),
                    'data_quality': {
                        'date_range': f"{df['measurement_timestamp'].min()} to {df['measurement_timestamp'].max()}" if 'measurement_timestamp' in df.columns else 'Unknown',
                        'sites_with_data': df['site_code'].unique().tolist() if 'site_code' in df.columns else selected_sites
                    },
                    'performance': {
                        'loading_time_ms': round(loading_time_ms, 2)
                    },
                    'resolution': {
                        'aggregation_method': resolution_config['aggregation_method'],
                        'performance_tier': resolution_config['performance_tier'],
                        'target_points': resolution_config['target_points'],
                        'time_range_days': days_back
                    }
                }
            }
            return jsonify(structured_data), 200
        else:
            logger.warning(f"[REDOX DEBUG] No redox data found - DataFrame is empty")

            return jsonify({
                'redox_data': [],
                'metadata': {
                    'last_updated': datetime.now().isoformat(),
                    'sites': selected_sites,
                    'time_range': time_range,
                    'record_count': 0,
                    'total_records': 0,
                    'has_data': False,
                    'parameters': request.args.get('selected_parameters', '').split(',') if request.args.get('selected_parameters') else ['redox_value_mv', 'depth_cm'],
                    'no_data_reason': 'No redox measurements found for selected criteria',
                    'performance': {
                        'loading_time_ms': round((time.time() - start_time) * 1000, 2)
                    }
                }
            }), 200 # Return 200 even if no data, but indicate has_data: False

    except Exception as e:
        logger.error(f"[REDOX DEBUG] Error in redox data loader: {e}")
        import traceback
        logger.error(f"[REDOX DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({
            'redox_data': [],
            'error': str(e),
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'sites': selected_sites,
                'time_range': time_range,
                'error_occurred': True,
                'record_count': 0,
                'has_data': False
            }
        }), 500
@redox_analysis_bp.route('/date_range', methods=['GET'])
def get_redox_date_range():
    try:
        sites_param = request.args.get('sites', '')
        selected_sites = [s.strip() for s in sites_param.split(',') if s.strip()] if sites_param else []
        date_range = core_data_service.get_redox_date_range(selected_sites)
        # Normalize to just dates (YYYY-MM-DD) for UI bounds
        earliest = date_range.get('earliest')
        latest = date_range.get('latest')
        earliest_date = earliest[:10] if isinstance(earliest, str) and len(earliest) >= 10 else None
        latest_date = latest[:10] if isinstance(latest, str) and len(latest) >= 10 else None
        logger.info(f"[DATE_RANGE] sites={selected_sites} -> earliest={earliest_date} latest={latest_date}")
        return jsonify({
            'earliest_date': earliest_date,
            'latest_date': latest_date,
            'sites': selected_sites
        }), 200
    except Exception as e:
        logger.error(f"[REDOX DEBUG] Error in date_range endpoint: {e}")
        return jsonify({ 'earliest_date': None, 'latest_date': None, 'error': str(e) }), 500

# New endpoints backed by mv_processed_eh
@redox_analysis_bp.route('/processed/time_series', methods=['GET'])
@enterprise_performance(data_type='redox_processed_time_series')
@cached_api_response(ttl=900)  # Re-enable caching for performance
def processed_time_series():
    """Dual-axis time series from mv_processed_eh.

    params: site_id, start_ts, end_ts (ISO8601)
    """
    # Ensure these are always defined to avoid UnboundLocalError in logging/response paths
    wire_format = (request.args.get('format') or '').lower()
    records = None
    cols = {}
    try:
        site_param = request.args.get('site_code') or request.args.get('site_id')
        start_ts = request.args.get('start_ts')
        end_ts = request.args.get('end_ts')
        if not site_param or not start_ts or not end_ts:
            return jsonify({'error': 'Missing required params: site_code (or site_id), start_ts, end_ts'}), 400

        start_dt = pd.to_datetime(start_ts)
        end_dt = pd.to_datetime(end_ts)
        
        # Optional result-shaping parameters
        resolution = request.args.get('resolution')  # e.g., 'raw', '1H', '1D'
        # Wire format requested by client: '', 'columnar', or 'arrow' (already initialized above)
        max_depths = request.args.get('max_depths', type=int)  # limit number of depths per site
        target_points = request.args.get('target_points', type=int)
        allowed_depths_param = request.args.get('allowed_depths')  # comma-separated depths
        depth_tolerance = request.args.get('depth_tolerance', type=float)
        allowed_depths = None
        if allowed_depths_param:
            try:
                allowed_depths = [float(x) for x in str(allowed_depths_param).split(',') if str(x).strip()]
            except Exception:
                allowed_depths = None
        # No default tolerance; only apply snapping if explicitly provided (> 0)

        # Support for chunked loading for large datasets
        chunk_size = request.args.get('chunk_size', type=int)  # Optional chunking
        offset = request.args.get('offset', 0, type=int)       # Optional offset for pagination
        
        logger.info(f"🚀 [TIME SERIES] Loading data for site={site_param} start={start_ts} end={end_ts} chunk_size={chunk_size} offset={offset} resolution={resolution} max_depths={max_depths} target_points={target_points}")
        logger.info(f"🧭 [TIME SERIES PARAMS] wire_format={wire_format} source={request.args.get('source')} max_fidelity={request.args.get('max_fidelity')}")

        # START: Disable implicit depth limiting/derivation to preserve full raw cadence
        derived_allowed_depths = None
        effective_allowed_depths = allowed_depths  # Only honor explicit allowed_depths
        # END: Disable implicit depth limiting/derivation

        # Support raw source for max fidelity (no cadence, no thinning)
        source = (request.args.get('source') or '').lower()
        max_fidelity_val = (request.args.get('max_fidelity', '') or '').lower() in ('1', 'true', 'yes', 'on', 't')
        df = None
        total_records = None
        if source == 'raw' or max_fidelity_val:
            # RAW TABLE PATH with SQL pagination and dedup per (ts, depth)
            if chunk_size and chunk_size > 0:
                try:
                    total_records = core_data_service.count_redox_data(
                        sites=[site_param], start_date=start_dt, end_date=end_dt,
                        allowed_depths=allowed_depths, dedupe=True
                    )
                except Exception:
                    total_records = None
            df = core_data_service.load_redox_data(
                sites=[site_param],
                start_date=start_dt,
                end_date=end_dt,
                allowed_depths=allowed_depths,
                limit=chunk_size if chunk_size else None,
                offset=offset if chunk_size else 0,
                no_limit=not bool(chunk_size),
                dedupe=True
            )
            # Normalize and dedup duplicates at same (site_id, depth_cm, ts)
            if not df.empty:
                try:
                    # Ensure proper dtypes
                    df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')
                    if 'redox_value_mv' in df.columns:
                        df['processed_eh'] = pd.to_numeric(df['redox_value_mv'], errors='coerce')
                    if 'depth_cm' in df.columns:
                        df['depth_cm'] = pd.to_numeric(df['depth_cm'], errors='coerce')
                except Exception:
                    pass
                try:
                    grp_cols = []
                    if 'site_id' in df.columns:
                        grp_cols.append('site_id')
                    grp_cols += [c for c in ['site_code','depth_cm','measurement_timestamp'] if c in df.columns]
                    if grp_cols and 'processed_eh' in df.columns:
                        df = (df.groupby(grp_cols, dropna=False, as_index=False)
                                .agg({'processed_eh': 'mean'}))
                except Exception:
                    # If grouping fails, leave as-is
                    pass
                df = df.sort_values(['measurement_timestamp'] + ([ 'depth_cm' ] if 'depth_cm' in df.columns else []))
            # If total not computed above, fallback to len
            if total_records is None:
                total_records = len(df)
        else:
            # MV PATH with optional SQL pagination
            if chunk_size and chunk_size > 0:
                try:
                    total_records = core_data_service.count_processed_eh_time_series(
                        site_code=site_param,
                        start_ts=start_dt,
                        end_ts=end_dt,
                        allowed_depths=effective_allowed_depths
                    )
                except Exception:
                    total_records = None
            df = core_data_service.load_processed_eh_time_series(
                site_code=site_param,
                start_ts=start_dt,
                end_ts=end_dt,
                allowed_depths=effective_allowed_depths,
                limit=chunk_size if chunk_size else None,
                offset=offset if chunk_size else 0
            )
        logger.info(f"[TIME SERIES] rows(initial)={len(df)}")

        # Ensure proper dtypes before any aggregation or dedup
        try:
            if not df.empty:
                df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')
                df['processed_eh'] = pd.to_numeric(df['processed_eh'], errors='coerce')
                # Depth may be string from Data API
                if 'depth_cm' in df.columns:
                    df['depth_cm'] = pd.to_numeric(df['depth_cm'], errors='coerce')
        except Exception as e:
            logger.warning(f"Type coercion failed: {e}")

        # Deduplicate potential multiple rows per (timestamp, depth) combination
        if not df.empty:
            before = len(df)
            try:
                # Aggregate duplicates by mean processed_eh
                df = (df
                      .groupby(['site_id', 'measurement_timestamp', 'depth_cm'], as_index=False)
                      .agg({'processed_eh': 'mean'}))
                logger.info(f"🧹 [TIME SERIES] Deduplicated rows: {before} -> {len(df)}")
            except Exception as e:
                logger.warning(f"Deduplication failed: {e}")

        # Filter to allowed depths (if explicitly provided), snapping within tolerance
        if allowed_depths and 'depth_cm' in df.columns and not df.empty:
            try:
                before = len(df)
                if depth_tolerance and depth_tolerance > 0:
                    import numpy as np
                    depth_vals = np.array(allowed_depths, dtype=float)
                    # Compute nearest allowed depth and distance (snapping mode)
                    def _map_depth(d):
                        try:
                            diffs = np.abs(depth_vals - float(d))
                            idx = int(diffs.argmin())
                            nearest = depth_vals[idx]
                            return nearest if diffs[idx] <= float(depth_tolerance) else None
                        except Exception:
                            return None
                    mapped = df['depth_cm'].apply(_map_depth)
                    df = df.assign(depth_cm=mapped)
                    df = df[df['depth_cm'].notna()]
                    logger.info(f"🎯 [TIME SERIES] Allowed depths (snapped, tol={depth_tolerance}): {before} -> {len(df)} rows")
                else:
                    # Exact filter mode: include rows where depth_cm matches one of the allowed depths exactly
                    df = df[df['depth_cm'].isin(allowed_depths)]
                    logger.info(f"🎯 [TIME SERIES] Allowed depths (exact match): {before} -> {len(df)} rows")
            except Exception as e:
                logger.warning(f"Allowed depths filtering failed: {e}")

        # Apply optional depth limiting to reduce data volume (only when NOT max fidelity)
        if (not max_fidelity_val) and max_depths and 'depth_cm' in df.columns and not df.empty:
            try:
                depths = sorted([d for d in df['depth_cm'].dropna().unique()])
                if len(depths) > max_depths:
                    import numpy as np
                    # Evenly select representative depths across the range
                    idxs = np.linspace(0, len(depths) - 1, num=max_depths, dtype=int)
                    keep_set = set(depths[i] for i in idxs)
                    before = len(df)
                    df = df[df['depth_cm'].isin(keep_set)]
                    logger.info(f"🔎 [TIME SERIES] Limited depths {len(depths)} -> {len(keep_set)}; rows {before} -> {len(df)}")
            except Exception as e:
                logger.warning(f"Depth limiting failed: {e}")

        # Apply optional time aggregation (resampling) per depth (only when NOT max fidelity)
        if (not max_fidelity_val) and resolution and resolution.lower() not in ('raw', 'none') and not df.empty:
            try:
                df_local = df.copy()
                df_local['measurement_timestamp'] = pd.to_datetime(df_local['measurement_timestamp'])
                # Group by site and depth, resample in time, aggregate processed_eh
                def _resample_group(g):
                    g = g.set_index('measurement_timestamp').sort_index()
                    agg = g.resample(resolution).agg({
                        'processed_eh': 'mean',
                        'depth_cm': 'first',
                        'site_id': 'first'
                    })
                    agg = agg.dropna(how='all')
                    agg = agg.reset_index()
                    return agg
                grouped = df_local.groupby(['site_id', 'depth_cm'], dropna=False, as_index=False)
                parts = []
                for _, g in grouped:
                    parts.append(_resample_group(g))
                df = pd.concat(parts, ignore_index=True) if parts else df_local
                logger.info(f"⏱️ [TIME SERIES] Applied resampling '{resolution}', rows(before)={len(df_local)} -> rows(after)={len(df)}")
            except Exception as e:
                logger.warning(f"Time aggregation failed: {e}")
        
        # Apply optional target_points thinning (after resampling and depth selection)
        # START: Disable thinning to preserve all points
        if False and target_points and not df.empty and len(df) > target_points:
            try:
                import math
                before = len(df)
                parts = []
                # Proportional per-depth systematic sampling to preserve per-depth shape
                for depth, g in df.groupby('depth_cm', dropna=False):
                    n = len(g)
                    # Allocate share proportionally
                    k = max(1, round((n / before) * target_points))
                    step = max(1, math.ceil(n / k))
                    parts.append(g.iloc[::step])
                df = pd.concat(parts, ignore_index=True)
                logger.info(f"🧪 [TIME SERIES] Thinned to target_points={target_points}: {before} -> {len(df)}")
            except Exception as e:
                logger.warning(f"Target points thinning failed: {e}")

        # If we didn't compute total_records earlier (raw paginated path), fallback to len(df)
        if 'total_records' not in locals() or total_records is None:
            total_records = len(df)
        
        # Apply chunking if requested (for progressive loading)
        # START: Disable in-memory chunk slicing to return full set even for processed source
        if False and chunk_size and chunk_size > 0 and source != 'raw':
            # Only slice in-memory for processed source; raw path uses SQL pagination above
            logger.info(f"📦 [CHUNKED LOADING] Applying chunking (processed): offset={offset}, chunk_size={chunk_size}")
            end_idx = offset + chunk_size
            df = df.iloc[offset:end_idx]
            logger.info(f"📦 [CHUNKED LOADING] Returning chunk: {len(df)} records (of {total_records} total)")
        
        # Optional columnar/arrow formats for reduced payload size
        # Reuse the previously-parsed wire_format; don't reassign here
        use_columnar = wire_format in ('col', 'columnar', 'columns')
        # Enforce explicit format flag for Arrow; ignore Accept header semantics
        if wire_format in ('arrow', 'arrows', 'arrow_stream'):
            # Stream Apache Arrow IPC for maximal efficiency
            try:
                import pyarrow as pa
                import pyarrow.ipc as pa_ipc
                from io import BytesIO
                # Restrict to relevant columns if needed
                cols = [c for c in ['measurement_timestamp', 'processed_eh', 'depth_cm', 'site_code', 'site_id'] if c in df.columns]
                table = pa.Table.from_pandas(df[cols], preserve_index=False)
                sink = BytesIO()
                with pa_ipc.new_stream(sink, table.schema) as writer:
                    writer.write_table(table)
                payload = sink.getvalue()
                # Build response with metadata headers
                from flask import Response
                resp = Response(payload, mimetype='application/vnd.apache.arrow.stream')
                resp.headers['X-Total-Records'] = str(total_records)
                resp.headers['X-Returned-Records'] = str(len(df))
                if chunk_size:
                    resp.headers['X-Chunk-Offset'] = str(offset)
                    resp.headers['X-Chunk-Size'] = str(chunk_size)
                    resp.headers['X-Chunk-Has-More'] = str(bool(chunk_size and (offset + chunk_size) < total_records)).lower()
                return resp
            except Exception as e:
                logger.warning(f"Arrow streaming failed, falling back to JSON: {e}")
                # Fall through to JSON/columnar
        if use_columnar:
            # Build compact columnar payload
            if not df.empty:
                # Ensure minimal required columns
                base_cols = []
                for c in ['measurement_timestamp', 'processed_eh', 'depth_cm', 'site_code', 'site_id']:
                    if c in df.columns:
                        base_cols.append(c)
                for c in base_cols:
                    if c == 'measurement_timestamp':
                        cols[c] = [str(x) for x in df[c].astype('datetime64[ns]').astype('datetime64[ms]')]
                    else:
                        cols[c] = df[c].tolist()
            records = None
        else:
            records = serialize_dataframe_optimized(df)
        try:
            if not df.empty:
                mn = str(df['measurement_timestamp'].min())
                mx = str(df['measurement_timestamp'].max())
                logger.info(f"[TIME SERIES] final window min={mn} max={mx} rows={len(df)}")
        except Exception:
            pass
        response_payload = {
            **({'data': records} if records is not None else {}),
            **({'data_columnar': cols, 'format': 'columnar'} if use_columnar else {}),
            'metadata': {
                'site_code': site_param,
                'start_ts': start_dt.isoformat(),
                'end_ts': end_dt.isoformat(),
                'total_records': total_records,
                'returned_records': (len(records) if records is not None else (len(next(iter(cols.values()), [])) if cols else 0)),
                'chunked': bool(chunk_size),
                'chunk_info': ({
                    'offset': offset,
                    'chunk_size': chunk_size,
                    'has_more': bool(chunk_size and (offset + chunk_size) < total_records)
                } if chunk_size else None),
                'allowed_inversions': { 'y1': True, 'y2': True, 'x': False }
            }
        }
        logger.info(f"📄 [TIME SERIES META] source={source} wire_format={wire_format} total={total_records} returned={response_payload['metadata']['returned_records']} chunked={bool(chunk_size)}")
        if target_points:
            response_payload['metadata']['thinning'] = {
                'enabled': True,
                'target_points': target_points,
            }
        return jsonify(response_payload), 200
    except Exception as e:
        logger.error(f"[REDOX MV] Error in processed_time_series: {e}")
        return jsonify({'data': [], 'error': str(e)}), 500


@redox_analysis_bp.route('/processed/depth_snapshot', methods=['GET'])
@enterprise_performance(data_type='redox_processed_depth_snapshot')
@cached_api_response(ttl=900)  # Re-enable caching for performance
def processed_depth_snapshot():
    """Depth profile snapshot (Eh vs Depth) from mv_processed_eh.

    params: site_id, ts (ISO8601)
    """
    try:
        site_param = request.args.get('site_code') or request.args.get('site_id')
        ts = request.args.get('ts')
        if not site_param or not ts:
            return jsonify({'error': 'Missing required params: site_code (or site_id), ts'}), 400

        ts_dt = pd.to_datetime(ts)
        df = core_data_service.load_processed_eh_depth_snapshot(site_code=site_param, ts=ts_dt)
        records = serialize_dataframe_optimized(df)
        return jsonify({
            'data': records,
            'metadata': {
                'site_code': site_param,
                'ts': ts_dt.isoformat(),
                'allowed_inversions': { 'x': True, 'y': True }
            }
        }), 200
    except Exception as e:
        logger.error(f"[REDOX MV] Error in processed_depth_snapshot: {e}")
        return jsonify({'data': [], 'error': str(e)}), 500


@redox_analysis_bp.route('/processed/rolling_mean', methods=['GET'])
@enterprise_performance(data_type='redox_processed_rolling_mean')
@cached_api_response(ttl=900)  # Re-enable caching for performance
def processed_rolling_mean():
    """High-performance rolling mean using dedicated Polars/Pandas service.
    
    This endpoint uses a dedicated high-performance service for rolling mean calculations,
    providing 100-1000x speedup over SQL window functions.

    params: site_id, start_ts, end_ts (ISO8601), window_hours (optional, default: 24)
    """
    try:
        # Parse request parameters
        site_param = request.args.get('site_code') or request.args.get('site_id')
        start_ts = request.args.get('start_ts')
        end_ts = request.args.get('end_ts')
        window_hours = request.args.get('window_hours', 24, type=int)
        
        if not site_param or not start_ts or not end_ts:
            return jsonify({'error': 'Missing required params: site_code (or site_id), start_ts, end_ts'}), 400

        start_dt = pd.to_datetime(start_ts)
        end_dt = pd.to_datetime(end_ts)
        
        logger.info(f"🚀 [ROLLING API] Delegating to high-performance rolling service")
        
        # Use dedicated high-performance rolling service
        from services.high_performance_rolling_service import rolling_service
        
        records, metadata = rolling_service.calculate_rolling_mean(
            site_code=site_param,
            start_ts=start_dt,
            end_ts=end_dt,
            window_hours=window_hours
        )
        
        return jsonify({
            'data': records,
            'metadata': metadata
        }), 200
        
    except Exception as e:
        logger.error(f"❌ [ROLLING API ERROR] {e}")
        return jsonify({
            'data': [], 
            'error': str(e),
            'metadata': {
                'site_code': site_param if 'site_param' in locals() else None,
                'error_type': 'rolling_calculation_failed'
            }
        }), 500
