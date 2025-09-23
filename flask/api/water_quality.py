from flask import Blueprint, jsonify, request
import time
from datetime import datetime

from services.core_data_service import core_data_service
from services.database_date_service import database_date_service
from utils.redis_api_cache_utils import redis_cached_api_response
from services.simple_filter_service import simple_filter_service
from utils.optimized_serializer import serialize_dataframe_optimized

# Initialize logger
from config.improved_logging_config import get_smart_logger, LogCategory
logger = get_smart_logger(__name__, LogCategory.API)

water_quality_bp = Blueprint('water_quality_bp', __name__)



@water_quality_bp.route('/data', methods=['GET'])
# @login_required  # Temporarily disabled for testing
@redis_cached_api_response(ttl=3600)  # Redis-enhanced caching with fallback - 1 hour for better persistence
def get_water_quality_data():
    """
    Water quality data endpoint:
    - Returns all data points for selected sites and time range
    - Redis caching (1 hour TTL) for performance
    - Simple filtering support
    """
    start_time = time.time()
    logger.info(f"[WATER QUALITY] API request with comprehensive optimization")

    # Parse filter configuration with simplified approach
    filter_config = simple_filter_service.parse_request_filters(request.args)
    
    # Simple site selection - use parsed sites or default
    selected_sites = filter_config.sites if filter_config.sites else ['S1', 'S2', 'S3']
    time_range = filter_config.time_range
    start_date = filter_config.start_date  
    end_date = filter_config.end_date

    logger.info(f"   Selected sites: {selected_sites}")
    logger.info(f"   Time range: {time_range}")
    logger.info(f"   Custom dates: {start_date} to {end_date}")
    logger.info(f"   Selected parameters: {filter_config.parameters}")

    try:
        # Set time_range default if needed
        if not time_range:
            time_range = 'Last 90 Days'

        logger.info(f"[WATER QUALITY] Processed inputs - sites={selected_sites}, time_range={time_range}")

        # Handle custom date ranges - accept both 'custom' and 'Custom Range'
        if (time_range in ["custom", "Custom Range"]) and start_date and end_date:
            logger.info(f"[WATER QUALITY] Using custom date range: {start_date} to {end_date}")
        else:
            # Use current date for preset ranges - if no data exists, return empty
            from datetime import timedelta
            current_time = datetime.now()

            # Map time ranges to days back from current date
            period_map = {
                '1d': 1, '24h': 1,
                '7d': 7,
                '30d': 30,
                '90d': 90,
                '180d': 180, '6m': 180,
                '365d': 365, '1y': 365
            }

            days_back = period_map.get(time_range, 30)  # Default to 30 days
            start_date = current_time - timedelta(days=days_back)
            end_date = current_time

            logger.info(f"[WATER QUALITY] Using current date range {time_range}: {start_date} to {end_date}")

        # Load all water quality data - no limits or downsampling
        logger.info(f"[WATER QUALITY] Loading all data for sites {selected_sites}, {start_date} to {end_date}")

        df = core_data_service.load_water_quality_data(
            sites=selected_sites,
            start_date=start_date,
            end_date=end_date
        )

        if not df.empty:
            logger.info(f"[WATER QUALITY] Loaded {len(df)} water quality records successfully")
            
            # Apply simple filters
            df, filter_stats = simple_filter_service.apply_simple_filters(df, filter_config)
            logger.info(f"[SIMPLE FILTER] Applied filters: {len(df)} records remaining "
                       f"({filter_stats.get('retention_rate', 100)}% retention)")

            # Return all data - no downsampling or chunking
            logger.info(f"[ALL DATA] Returning all {len(df)} data points")

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

        # Build simple response
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
                'loading_time_ms': round(loading_time_ms, 2),
                'filters_applied': filter_stats if 'filter_stats' in locals() else None,
                'has_data': not df.empty
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
# @login_required  # Temporarily disabled for testing
@redis_cached_api_response(ttl=3600)  # Redis cache for 1 hour as sites don't change frequently
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
