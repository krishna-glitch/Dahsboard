from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import time
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

# Import Polars for high-performance site comparison operations
try:
    import polars as pl
    from services.polars_service import safe_to_pandas
    from services.lazy_data_processor import lazy_processor, create_water_quality_lazy_query, create_redox_lazy_query
    POLARS_AVAILABLE = True
except ImportError:
    POLARS_AVAILABLE = False
    pl = None

from utils.data_processing import normalize_timezone
from services.core_data_service import core_data_service, DataQuery
from services.consolidated_cache_service import cached
from utils.redis_api_cache_utils import redis_cached_api_response
from services.config_service import config_service
from utils.optimized_serializer import serialize_dataframe_optimized

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

site_comparison_bp = Blueprint('site_comparison_bp', __name__)


def _load_data_with_optimization(data_type: str, sites_list: list, days_back: int, start_date, end_date) -> pd.DataFrame:
    """
    Simplified data loading helper that consolidates complex loading logic
    """
    logger.info(f"Loading {data_type} data with performance optimization")
    
    try:
        # Validate sites for water quality (other types use sites_list directly)
        sites = sites_list
        if data_type == 'water_quality':
            sites = [s for s in sites_list if s and s.strip()]
            if not sites:
                logger.warning("No valid sites provided for water quality data")
                sites = ['S1']  # Default fallback
        
        # Try Polars optimization for larger datasets first
        if POLARS_AVAILABLE and days_back > 90:
            logger.info(f"[SITE COMPARISON PERFORMANCE] Using lazy processing for {days_back}-day {data_type} comparison")
            
            try:
                # Create appropriate lazy query based on data type
                if data_type == 'water_quality':
                    lazy_query = create_water_quality_lazy_query(sites=sites, days_back=days_back)
                else:  # redox
                    lazy_query = create_redox_lazy_query(sites=sites, days_back=days_back)
                
                lazy_result = lazy_processor.execute_lazy_query(lazy_query)
                
                if lazy_result.lazy_frame is not None and lazy_result.error_message is None:
                    polars_df = lazy_result.lazy_frame.collect()
                    df = safe_to_pandas(polars_df)
                    df = normalize_timezone(df)
                    logger.info(f"[SITE COMPARISON PERFORMANCE] Lazy loaded {len(df)} {data_type} records in {lazy_result.processing_time_ms:.1f}ms")
                    return df
                    
            except Exception as lazy_error:
                logger.warning(f"Lazy {data_type} processing failed: {lazy_error}, using standard loading")
        
        # Standard loading fallback
        logger.info(f"[SITE COMPARISON PERFORMANCE] Using standard loading for {days_back}-day {data_type} comparison")
        query_obj = DataQuery(sites=sites, start_date=start_date, end_date=end_date, days_back=days_back)
        
        # Call appropriate core service method
        if data_type == 'water_quality':
            result = core_data_service._load_water_quality_data(query_obj)
        else:  # redox
            result = core_data_service._load_redox_data(query_obj)
        
        if result.success and not result.data.empty:
            df = normalize_timezone(result.data)
            logger.info(f"LOADED {data_type.upper()} DATA: {len(df)} records for site comparison")
            return df
        else:
            logger.warning(f"No {data_type} data available for site comparison")
            return pd.DataFrame()
            
    except Exception as e:
        logger.error(f"Failed to load {data_type} data: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return pd.DataFrame()


def _intelligent_downsample_site_comparison(df: pd.DataFrame, target_size: int = 5000) -> pd.DataFrame:
    """
    Intelligently downsample datasets for site comparison while preserving cross-site patterns
    """
    # Validate input type
    if not isinstance(df, pd.DataFrame):
        logger.error(f"Expected DataFrame but received {type(df)}: {df}")
        return pd.DataFrame()  # Return empty DataFrame instead of causing errors
        
    if len(df) <= target_size:
        return df
    
    logger.info(f"[SITE COMPARISON PERFORMANCE] Downsampling {len(df)} records to ~{target_size}")
    
    # Sort by timestamp to ensure proper chronological sampling
    df_sorted = df.sort_values('measurement_timestamp').reset_index(drop=True)
    
    # Calculate sampling interval
    sample_interval = len(df_sorted) // target_size
    
    # Regular sampling as base
    sampled_indices = set(range(0, len(df_sorted), sample_interval))
    
    # For site comparison, ensure we preserve data across all sites equally
    if 'site_code' in df_sorted.columns:
        sites = df_sorted['site_code'].unique()
        per_site_target = target_size // len(sites)
        
        for site in sites:
            site_data = df_sorted[df_sorted['site_code'] == site]
            if len(site_data) > per_site_target:
                # Sample evenly from each site
                site_interval = len(site_data) // per_site_target
                site_indices = site_data.index[::max(1, site_interval)]
                sampled_indices.update(site_indices)
    
    # Add peaks and valleys for key parameters
    numeric_cols = df_sorted.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        if col in df_sorted.columns and df_sorted[col].notna().sum() > 10:
            values = df_sorted[col].fillna(method='ffill').fillna(method='bfill')
            
            try:
                from scipy.signal import find_peaks
                peaks, _ = find_peaks(values, distance=max(1, len(values) // 100))
                valleys, _ = find_peaks(-values, distance=max(1, len(values) // 100))
                
                sampled_indices.update(peaks)
                sampled_indices.update(valleys)
                
            except ImportError:
                # Fallback: simple peak/valley detection
                window = max(5, len(values) // 200)
                for i in range(window, len(values) - window):
                    # Get left and right neighbors (excluding the center point)
                    left_neighbors = values.iloc[i-window:i]
                    right_neighbors = values.iloc[i+1:i+window+1]
                    neighbors = pd.concat([left_neighbors, right_neighbors])
                    
                    # Peak: current point is higher than all neighbors
                    if len(neighbors) > 0 and values.iloc[i] > neighbors.max():
                        sampled_indices.add(i)
                    # Valley: current point is lower than all neighbors  
                    if len(neighbors) > 0 and values.iloc[i] < neighbors.min():
                        sampled_indices.add(i)
    
    # Ensure first and last points are included
    sampled_indices.add(0)
    sampled_indices.add(len(df_sorted) - 1)
    
    # Convert to sorted list and limit to target size
    final_indices = sorted(list(sampled_indices))[:target_size]
    
    result_df = df_sorted.iloc[final_indices].copy()
    
    compression_ratio = len(df) / len(result_df)
    logger.info(f"[SITE COMPARISON PERFORMANCE] Downsampled to {len(result_df)} records ({compression_ratio:.1f}x compression)")
    
    return result_df


def _apply_concurrent_time_window_analysis(df: pd.DataFrame, window_hours: int, sites_list: list, value_col: str, logger) -> pd.DataFrame:
    """
    Apply concurrent time-window analysis to find measurements taken within the same time window across sites.
    This ensures scientifically valid spatial comparisons by eliminating temporal confounding variables.
    """
    if df.empty or 'measurement_timestamp' not in df.columns or 'site_code' not in df.columns:
        logger.warning("Cannot apply concurrent analysis: missing required columns")
        return df
    
    # Ensure timestamp is datetime and sort by time
    df_sorted = df.copy()
    df_sorted['measurement_timestamp'] = pd.to_datetime(df_sorted['measurement_timestamp'])
    df_sorted = df_sorted.sort_values('measurement_timestamp').reset_index(drop=True)
    
    concurrent_measurements = []
    window_delta = timedelta(hours=window_hours)
    
    logger.info(f"🔍 Searching for concurrent measurements within {window_hours}-hour windows")
    
    # Group measurements by approximate time windows to find concurrent measurements
    # We'll use a sliding window approach to find the best concurrent measurement sets
    unique_timestamps = df_sorted['measurement_timestamp'].dt.floor('H').unique()  # Floor to hour for efficiency
    
    for base_time in unique_timestamps:
        window_start = base_time
        window_end = base_time + window_delta
        
        # Get all measurements within this time window
        window_data = df_sorted[
            (df_sorted['measurement_timestamp'] >= window_start) & 
            (df_sorted['measurement_timestamp'] <= window_end)
        ].copy()
        
        if window_data.empty:
            continue
            
        # Check which sites have measurements in this window
        sites_in_window = window_data['site_code'].unique()
        
        # Only consider windows where we have measurements from multiple sites
        if len(sites_in_window) >= 2:
            # For each site, get the measurement closest to the window center
            window_center = window_start + (window_delta / 2)
            
            for site in sites_in_window:
                site_data = window_data[window_data['site_code'] == site].copy()
                if not site_data.empty and value_col in site_data.columns and site_data[value_col].notna().any():
                    # Find measurement closest to window center
                    site_data['time_diff'] = abs(site_data['measurement_timestamp'] - window_center)
                    closest_measurement = site_data.loc[site_data['time_diff'].idxmin()]
                    
                    # Add metadata about concurrent analysis
                    measurement_dict = closest_measurement.to_dict()
                    measurement_dict['concurrent_window_start'] = window_start
                    measurement_dict['concurrent_window_end'] = window_end
                    measurement_dict['sites_in_window'] = len(sites_in_window)
                    
                    concurrent_measurements.append(measurement_dict)
    
    if not concurrent_measurements:
        logger.warning("❌ No concurrent measurements found within the specified time window")
        return pd.DataFrame()  # Return empty DataFrame if no concurrent data
    
    # Convert back to DataFrame
    concurrent_df = pd.DataFrame(concurrent_measurements)
    
    # Remove duplicates (in case a measurement was selected multiple times)
    concurrent_df = concurrent_df.drop_duplicates(
        subset=['site_code', 'measurement_timestamp', value_col]
    ).reset_index(drop=True)
    
    logger.info(f"✅ Found {len(concurrent_df)} concurrent measurements across {concurrent_df['site_code'].nunique()} sites")
    
    # Log temporal context for each concurrent measurement group
    if not concurrent_df.empty:
        for window_start in concurrent_df['concurrent_window_start'].unique():
            window_measurements = concurrent_df[concurrent_df['concurrent_window_start'] == window_start]
            sites = window_measurements['site_code'].tolist()
            timestamps = window_measurements['measurement_timestamp'].dt.strftime('%Y-%m-%d %H:%M').tolist()
            logger.info(f"📅 Concurrent window {window_start}: Sites {sites} measured at {timestamps}")
    
    return concurrent_df


@site_comparison_bp.route('/data', methods=['GET'])
# @login_required  # Temporarily disabled for testing
@enterprise_performance(data_type='site_comparison')
@redis_cached_api_response(ttl=600)  # Redis site-aware caching that preserves filtering
def get_site_comparison_data():
    logger.info("Received request for site comparison data API.")
    try:
        # Parse site parameters using centralized utility
        from utils.request_parsing import parse_sites_parameter
        selected_sites = parse_sites_parameter(['S1', 'S2', 'S3'])
        time_range = request.args.get('time_range', 'Last 90 Days')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        data_type = request.args.get('data_type', 'both')
        metric = request.args.get('metric', 'temperature')
        # Define metric mapping and value column immediately to avoid unbound references in later branches
        metric_map = {
            'temperature': 'temperature_c',
            'conductivity': 'conductivity_us_cm',
            'water_level': 'water_level_m',
            'turbidity': 'turbidity_ntu',
            'nitrates': 'nitrates_mg_l',
            'dissolved_oxygen': 'dissolved_oxygen_mg_l',
        }
        value_col = metric_map.get(metric or 'temperature', 'temperature_c')
        
        # NEW: Concurrent analysis parameters
        analysis_mode = request.args.get('analysis_mode', 'concurrent')  # 'concurrent' or 'full_period'
        concurrent_window_hours = int(request.args.get('concurrent_window_hours', '24'))  # Default 24-hour window

        start_date = datetime.fromisoformat(start_date_str) if start_date_str else None
        end_date = datetime.fromisoformat(end_date_str) if end_date_str else None

        data = {}
        time_ranges = config_service.get_time_ranges()

        # Ensure valid sites list
        sites_list = selected_sites if selected_sites else ['S1', 'S2']

        # Accept short aliases like '7d','30d','90d','1d'
        alias_map = {
            '1d': 1,
            '7d': 7,
            '30d': 30,
            '90d': 90,
            '180d': 180,
            '365d': 365
        }

        if time_range and time_range.lower() in alias_map:
            days_back = alias_map[time_range.lower()]
        elif time_range == "custom" and start_date and end_date:
            days_back = max(1, (end_date - start_date).days)
        else:
            days_back = config_service.get_days_back_for_range(time_range)

        # Determine end_date anchored to latest available data for selected sites
        latest_candidates = []
        try:
            # Water quality latest
            if data_type in ['water_quality', 'both', 'all']:
                wq_query = """
                    SELECT MAX(wq.measurement_timestamp) AS latest
                    FROM impact.water_quality wq
                    JOIN impact.site s ON wq.site_id = s.site_id
                    WHERE s.code IN :sites
                """
                wq_latest = core_data_service.db.execute_query(wq_query, {'sites': sites_list})
                if not wq_latest.empty and pd.notna(wq_latest['latest'].iloc[0]):
                    latest_candidates.append(pd.to_datetime(wq_latest['latest'].iloc[0]))
            # Redox latest (optional)
            if data_type in ['redox', 'both', 'all']:
                rx_query = """
                    SELECT MAX(re.measurement_timestamp) AS latest
                    FROM impact.redox_event re
                    JOIN impact.site s ON re.site_id::varchar = s.site_id
                    WHERE s.code IN :sites
                """
                rx_latest = core_data_service.db.execute_query(rx_query, {'sites': sites_list})
                if not rx_latest.empty and pd.notna(rx_latest['latest'].iloc[0]):
                    latest_candidates.append(pd.to_datetime(rx_latest['latest'].iloc[0]))
        except Exception as e:
            logger.warning(f"Failed to determine latest timestamp for site comparison: {e}")

        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
        elif latest_candidates:
            end_date = max(latest_candidates).to_pydatetime()
        else:
            end_date = datetime.utcnow()

        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
        else:
            # Inclusive window of N days
            start_date = end_date - timedelta(days=days_back-1)

        logger.info(f"[DYNAMIC RANGE] Using date range: {start_date} to {end_date} (days_back: {days_back})")
        
        logger.info(f"Loading comparison data for sites: {sites_list}, time_range: {time_range}, days_back: {days_back}")
        logger.info(f"Data type requested: {data_type}")
        
        # Simplified data loading with helper function (prioritize water_quality for metric)
        df_wq = pd.DataFrame()
        if data_type in ["water_quality", "both", "all"]:
            df_wq = _load_data_with_optimization(
                'water_quality', sites_list, days_back, start_date, end_date
            )
        df_rx = pd.DataFrame()
        if data_type in ["redox", "both", "all"]:
            df_rx = _load_data_with_optimization(
                'redox', sites_list, days_back, start_date, end_date
            )

        logger.info(f"Comparison data loaded successfully: WQ={len(df_wq)} records, Redox={len(df_rx)} records")

        # value_col already computed above

        # NEW: Apply concurrent time-window analysis if requested
        concurrent_data_info = {'mode': analysis_mode, 'concurrent_measurements': 0, 'time_window_hours': concurrent_window_hours}
        
        if analysis_mode == 'concurrent' and not df_wq.empty:
            logger.info(f"🔍 Applying concurrent time-window analysis (window: {concurrent_window_hours} hours) with column '{value_col}'")
            df_wq = _apply_concurrent_time_window_analysis(df_wq, concurrent_window_hours, sites_list, value_col, logger)
            concurrent_data_info['concurrent_measurements'] = len(df_wq)
            logger.info(f"✅ Concurrent analysis complete: {len(df_wq)} concurrent measurements found")

        # Build per-site summary expected by frontend: comparisonData.sites
        sites_summary = []

        if not df_wq.empty and 'site_code' in df_wq.columns and 'measurement_timestamp' in df_wq.columns:
            dfw = df_wq.copy()
            dfw['measurement_timestamp'] = pd.to_datetime(dfw['measurement_timestamp'])
            # Numeric coercion for metric column if present
            if value_col in dfw.columns:
                dfw[value_col] = pd.to_numeric(dfw[value_col], errors='coerce')
            # Compute current value: last non-null within window
            for site in sites_list:
                site_df = dfw[dfw['site_code'] == site]
                if site_df.empty:
                    sites_summary.append({ 'site_id': site, 'currentValue': None, 'change24h': None, 'minValue': None, 'avgValue': None, 'maxValue': None })
                    continue
                cur_val = None
                if value_col in site_df.columns:
                    cur_series = site_df[[ 'measurement_timestamp', value_col ]].dropna(subset=[value_col]).sort_values('measurement_timestamp')
                    if not cur_series.empty:
                        cur_val = float(cur_series.iloc[-1][value_col])
                # 24h change: value near end_date - 24h
                prev_val = None
                if value_col in site_df.columns:
                    target_time = pd.to_datetime(end_date) - timedelta(hours=24)
                    window = site_df[(site_df['measurement_timestamp'] >= (target_time - timedelta(hours=6))) & (site_df['measurement_timestamp'] <= (target_time + timedelta(hours=6)))]
                    if not window.empty and pd.notna(window[value_col]).any():
                        prev_val = float(window[value_col].dropna().iloc[-1])
                change_24h = None
                if cur_val is not None and prev_val is not None:
                    change_24h = round(cur_val - prev_val, 3)
                # Min/Avg/Max over the full selected window
                min_val = None
                avg_val = None
                max_val = None
                try:
                    mask = (site_df['measurement_timestamp'] >= pd.to_datetime(start_date)) & (site_df['measurement_timestamp'] <= pd.to_datetime(end_date))
                    series = site_df.loc[mask, value_col].dropna()
                    if not series.empty:
                        min_val = float(series.min())
                        avg_val = float(series.mean())
                        max_val = float(series.max())
                except Exception:
                    pass
                sites_summary.append({ 'site_id': site, 'currentValue': cur_val, 'change24h': change_24h, 'minValue': min_val, 'avgValue': avg_val, 'maxValue': max_val })

        # Optional lightweight sparkline data per site (downsampled)
        include_spark = request.args.get('include_spark', 'false').lower() == 'true'
        if include_spark and not df_wq.empty and value_col in df_wq.columns:
            try:
                dfw = df_wq.copy()
                dfw['measurement_timestamp'] = pd.to_datetime(dfw['measurement_timestamp'])
                dfw[value_col] = pd.to_numeric(dfw[value_col], errors='coerce')
                rule = '1H' if days_back <= 30 else '1D'
                max_points = 60
                summary_by_site = { s['site_id']: s for s in sites_summary }
                for site in sites_list:
                    site_df = dfw[dfw['site_code'] == site][['measurement_timestamp', value_col]].dropna()
                    if site_df.empty:
                        continue
                    rs = site_df.set_index('measurement_timestamp').sort_index().resample(rule).mean().dropna()
                    if rs.empty:
                        continue
                    # Limit to window and sample down to max_points
                    rs = rs[(rs.index >= start_date) & (rs.index <= end_date)]
                    if len(rs) > max_points:
                        step = max(1, len(rs) // max_points)
                        rs = rs.iloc[::step]
                    values = [float(v) for v in rs[value_col].tolist()]
                    if site in summary_by_site:
                        summary_by_site[site]['spark'] = values
                        if values:
                            summary_by_site[site]['spark_min'] = float(np.nanmin(values))
                            summary_by_site[site]['spark_max'] = float(np.nanmax(values))
            except Exception as e:
                logger.warning(f"Failed to build sparkline data: {e}")

        structured_data = {
            'sites': sites_summary,
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'sites': selected_sites,
                'time_range': time_range,
                'start': start_date.isoformat(),
                'end': end_date.isoformat(),
                'has_data': any(s.get('currentValue') is not None for s in sites_summary),
                # NEW: Concurrent analysis metadata
                'analysis_mode': concurrent_data_info['mode'],
                'concurrent_window_hours': concurrent_data_info['time_window_hours'],
                'concurrent_measurements': concurrent_data_info['concurrent_measurements'],
                'temporal_context': f"Analysis using {analysis_mode} mode" + 
                                   (f" with {concurrent_window_hours}h windows ({concurrent_data_info['concurrent_measurements']} concurrent measurements)" 
                                    if analysis_mode == 'concurrent' else "")
            }
        }

        return jsonify(structured_data), 200
        
    except Exception as e:
        logger.error(f"Failed to load comparison data: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        # Return empty data with expected structure
        return jsonify({
            'water_quality_data': [],
            'redox_data': [],
            'error': str(e),
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'sites': selected_sites,
                'time_range': time_range,
                'error_occurred': True,
                'total_records': 0,
                'has_data': False
            }
        }), 500
