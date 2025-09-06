"""
Flask API Smart Filtering Utilities
Intelligent filter suggestions and data-driven filter optimization
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from functools import wraps
from flask import jsonify, request
import pandas as pd

# Import services
from services.smart_filter_service import SmartFilterService
from services.consolidated_cache_service import cached, cache_get, cache_set

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

class APISmartFilterManager:
    """
    Smart filtering for Flask API endpoints
    """
    
    def __init__(self):
        """Initialize smart filter manager"""
        self.smart_filter_service = SmartFilterService()
    
    def smart_filters(self, filter_config: Optional[Dict[str, Any]] = None):
        """
        Decorator to add smart filtering capabilities to API endpoints
        
        Args:
            filter_config: Configuration for smart filtering behavior
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Check if smart filtering is requested
                enable_smart_filters = request.args.get('smart_filters', 'true').lower() == 'true'
                get_filter_suggestions = request.args.get('filter_suggestions', 'false').lower() == 'true'
                
                if get_filter_suggestions:
                    # Return filter suggestions only
                    return self._get_filter_suggestions(f.__name__, filter_config)
                
                if enable_smart_filters:
                    # Apply smart filtering before executing the function
                    enhanced_kwargs = self._apply_smart_filters(f.__name__, filter_config, **kwargs)
                    result = f(*args, **enhanced_kwargs)
                    
                    # Enhance response with filter metadata
                    if isinstance(result, tuple):
                        data, status_code = result
                    else:
                        data, status_code = result, 200
                    
                    if isinstance(data, dict):
                        data['smart_filtering'] = {
                            'enabled': True,
                            'applied_filters': enhanced_kwargs,
                            'original_filters': kwargs,
                            'suggestions_available': True,
                            'suggestions_url': request.url + ('&' if request.query_string else '?') + 'filter_suggestions=true'
                        }
                    
                    return jsonify(data), status_code
                else:
                    # Execute normally without smart filtering
                    return f(*args, **kwargs)
            
            return decorated_function
        return decorator
    
    def get_smart_date_range(self, data_type: str = 'water_quality') -> Dict[str, Any]:
        """
        Get intelligent date range suggestions based on data availability
        
        Args:
            data_type: Type of data to analyze
            
        Returns:
            Smart date range suggestions
        """
        try:
            # Get data coverage information
            coverage = self.smart_filter_service.get_data_coverage_summary()
            latest_dates = self.smart_filter_service.get_latest_data_dates(data_type)
            
            if data_type not in coverage or data_type not in latest_dates:
                # Return default suggestions
                return self._get_default_date_suggestions()
            
            data_coverage = coverage[data_type]
            latest_date = latest_dates[data_type]
            earliest_date = data_coverage['earliest_date']
            
            # Calculate data freshness
            now = datetime.now()
            days_since_latest = (now - latest_date).days
            total_days_available = (latest_date - earliest_date).days
            
            # Generate intelligent suggestions
            suggestions = {
                'recommended_ranges': [],
                'data_freshness': {
                    'latest_data_date': latest_date.isoformat(),
                    'days_since_latest': days_since_latest,
                    'freshness_level': self._get_freshness_level(days_since_latest)
                },
                'data_availability': {
                    'earliest_date': earliest_date.isoformat(),
                    'total_days': total_days_available,
                    'total_records': data_coverage['total_records'],
                    'days_with_data': data_coverage['days_with_data'],
                    'data_density': data_coverage['days_with_data'] / max(total_days_available, 1)
                }
            }
            
            # Add recommended ranges based on data patterns
            if days_since_latest <= 7:
                # Recent data available
                suggestions['recommended_ranges'].extend([
                    {
                        'label': 'Last 24 Hours',
                        'start_date': (latest_date - timedelta(days=1)).isoformat(),
                        'end_date': latest_date.isoformat(),
                        'priority': 'high',
                        'reason': 'Recent data available'
                    },
                    {
                        'label': 'Last 7 Days',
                        'start_date': (latest_date - timedelta(days=7)).isoformat(),
                        'end_date': latest_date.isoformat(),
                        'priority': 'high',
                        'reason': 'Good recent data coverage'
                    }
                ])
            
            if total_days_available >= 30:
                suggestions['recommended_ranges'].append({
                    'label': 'Last 30 Days',
                    'start_date': (latest_date - timedelta(days=30)).isoformat(),
                    'end_date': latest_date.isoformat(),
                    'priority': 'medium',
                    'reason': 'Standard monthly analysis period'
                })
            
            if total_days_available >= 90:
                suggestions['recommended_ranges'].append({
                    'label': 'Last 90 Days',
                    'start_date': (latest_date - timedelta(days=90)).isoformat(),
                    'end_date': latest_date.isoformat(),
                    'priority': 'medium',
                    'reason': 'Quarterly trend analysis'
                })
            
            # Add full range option
            suggestions['recommended_ranges'].append({
                'label': 'All Available Data',
                'start_date': earliest_date.isoformat(),
                'end_date': latest_date.isoformat(),
                'priority': 'low',
                'reason': f'Complete dataset ({total_days_available} days)',
                'warning': 'May be slow for large datasets'
            })
            
            return suggestions
            
        except Exception as e:
            logger.error(f"Error generating smart date range suggestions: {e}")
            return self._get_default_date_suggestions()
    
    def get_smart_site_suggestions(self) -> Dict[str, Any]:
        """
        Get intelligent site selection suggestions based on data availability
        
        Returns:
            Smart site suggestions
        """
        try:
            # Query site information with data availability
            from config.database import db
            
            site_query = """
            SELECT 
                s.site_id,
                s.code,
                s.name,
                s.status,
                COUNT(wq.site_id) as water_quality_records,
                MAX(wq.measurement_timestamp) as latest_wq_data,
                COUNT(DISTINCT DATE(wq.measurement_timestamp)) as days_with_wq_data
            FROM impact.site s
            LEFT JOIN impact.water_quality wq ON s.site_id = wq.site_id
            GROUP BY s.site_id, s.code, s.name, s.status
            ORDER BY water_quality_records DESC
            """
            
            sites_df = db.execute_query(site_query)
            
            if sites_df.empty:
                return {'error': 'No site data available'}
            
            # Process site data
            site_suggestions = {
                'recommended_sites': [],
                'all_sites': [],
                'site_categories': {
                    'high_activity': [],
                    'medium_activity': [],
                    'low_activity': [],
                    'inactive': []
                }
            }
            
            now = datetime.now()
            
            for _, site in sites_df.iterrows():
                site_info = {
                    'site_id': site['site_id'],
                    'code': site['code'],
                    'name': site['name'],
                    'status': site['status'],
                    'water_quality_records': int(site['water_quality_records'] or 0),
                    'days_with_data': int(site['days_with_wq_data'] or 0)
                }
                
                # Add latest data information
                if site['latest_wq_data']:
                    latest_data = pd.to_datetime(site['latest_wq_data'])
                    site_info['latest_data_date'] = latest_data.isoformat()
                    site_info['days_since_latest'] = (now - latest_data).days
                    site_info['data_freshness'] = self._get_freshness_level(site_info['days_since_latest'])
                else:
                    site_info['latest_data_date'] = None
                    site_info['days_since_latest'] = None
                    site_info['data_freshness'] = 'no_data'
                
                # Categorize sites by activity level
                records = site_info['water_quality_records']
                if records >= 1000:
                    category = 'high_activity'
                    priority = 'high'
                elif records >= 100:
                    category = 'medium_activity'
                    priority = 'medium'
                elif records >= 10:
                    category = 'low_activity'
                    priority = 'low'
                else:
                    category = 'inactive'
                    priority = 'low'
                
                site_info['activity_category'] = category
                site_info['priority'] = priority
                
                site_suggestions['all_sites'].append(site_info)
                site_suggestions['site_categories'][category].append(site_info)
                
                # Add to recommended if high priority and recent data
                if (priority in ['high', 'medium'] and 
                    site_info['data_freshness'] in ['excellent', 'good']):
                    site_suggestions['recommended_sites'].append(site_info)
            
            # Sort recommended sites by data quality
            site_suggestions['recommended_sites'].sort(
                key=lambda x: (x['water_quality_records'], -x['days_since_latest'] if x['days_since_latest'] else 0),
                reverse=True
            )
            
            return site_suggestions
            
        except Exception as e:
            logger.error(f"Error generating smart site suggestions: {e}")
            return {'error': str(e)}
    
    def get_smart_parameter_suggestions(self, data_type: str = 'water_quality') -> Dict[str, Any]:
        """
        Get intelligent parameter selection suggestions
        
        Args:
            data_type: Type of data to analyze
            
        Returns:
            Smart parameter suggestions
        """
        try:
            # Query parameter availability and quality
            from config.database import db
            
            if data_type == 'water_quality':
                param_query = """
                SELECT 
                    'water_level_m' as parameter,
                    COUNT(*) as total_records,
                    COUNT(*) - COUNT(water_level_m) as null_records,
                    COUNT(water_level_m) as valid_records,
                    AVG(water_level_m) as avg_value,
                    STDDEV(water_level_m) as stddev_value
                FROM impact.water_quality
                WHERE measurement_timestamp >= CURRENT_DATE - INTERVAL '30 days'
                
                UNION ALL
                
                SELECT 
                    'temperature_c' as parameter,
                    COUNT(*) as total_records,
                    COUNT(*) - COUNT(temperature_c) as null_records,
                    COUNT(temperature_c) as valid_records,
                    AVG(temperature_c) as avg_value,
                    STDDEV(temperature_c) as stddev_value
                FROM impact.water_quality
                WHERE measurement_timestamp >= CURRENT_DATE - INTERVAL '30 days'
                
                UNION ALL
                
                SELECT 
                    'conductivity_us_cm' as parameter,
                    COUNT(*) as total_records,
                    COUNT(*) - COUNT(conductivity_us_cm) as null_records,
                    COUNT(conductivity_us_cm) as valid_records,
                    AVG(conductivity_us_cm) as avg_value,
                    STDDEV(conductivity_us_cm) as stddev_value
                FROM impact.water_quality
                WHERE measurement_timestamp >= CURRENT_DATE - INTERVAL '30 days'
                
                UNION ALL
                
                SELECT 
                    'dissolved_oxygen_mg_l' as parameter,
                    COUNT(*) as total_records,
                    COUNT(*) - COUNT(dissolved_oxygen_mg_l) as null_records,
                    COUNT(dissolved_oxygen_mg_l) as valid_records,
                    AVG(dissolved_oxygen_mg_l) as avg_value,
                    STDDEV(dissolved_oxygen_mg_l) as stddev_value
                FROM impact.water_quality
                WHERE measurement_timestamp >= CURRENT_DATE - INTERVAL '30 days'
                """
                
                params_df = db.execute_query(param_query)
            else:
                return {'error': f'Parameter suggestions for {data_type} not implemented'}
            
            if params_df.empty:
                return {'error': 'No parameter data available'}
            
            # Process parameter data
            param_suggestions = {
                'recommended_parameters': [],
                'all_parameters': [],
                'data_quality_summary': {}
            }
            
            for _, param in params_df.iterrows():
                param_name = param['parameter']
                total_records = int(param['total_records'] or 0)
                valid_records = int(param['valid_records'] or 0)
                null_records = int(param['null_records'] or 0)
                
                if total_records > 0:
                    data_completeness = (valid_records / total_records) * 100
                else:
                    data_completeness = 0
                
                param_info = {
                    'parameter': param_name,
                    'total_records': total_records,
                    'valid_records': valid_records,
                    'null_records': null_records,
                    'data_completeness_percent': round(data_completeness, 2),
                    'avg_value': float(param['avg_value']) if param['avg_value'] else None,
                    'stddev_value': float(param['stddev_value']) if param['stddev_value'] else None
                }
                
                # Determine quality level
                if data_completeness >= 90:
                    quality_level = 'excellent'
                    priority = 'high'
                elif data_completeness >= 70:
                    quality_level = 'good'
                    priority = 'medium'
                elif data_completeness >= 50:
                    quality_level = 'fair'
                    priority = 'low'
                else:
                    quality_level = 'poor'
                    priority = 'low'
                
                param_info['data_quality'] = quality_level
                param_info['priority'] = priority
                
                param_suggestions['all_parameters'].append(param_info)
                
                # Add to recommended if good quality
                if quality_level in ['excellent', 'good']:
                    param_suggestions['recommended_parameters'].append(param_info)
            
            # Sort by data quality
            param_suggestions['recommended_parameters'].sort(
                key=lambda x: x['data_completeness_percent'],
                reverse=True
            )
            
            # Add summary
            param_suggestions['data_quality_summary'] = {
                'total_parameters': len(param_suggestions['all_parameters']),
                'high_quality_parameters': len([p for p in param_suggestions['all_parameters'] if p['data_quality'] == 'excellent']),
                'recommended_count': len(param_suggestions['recommended_parameters'])
            }
            
            return param_suggestions
            
        except Exception as e:
            logger.error(f"Error generating parameter suggestions: {e}")
            return {'error': str(e)}
    
    def _apply_smart_filters(self, endpoint_name: str, filter_config: Optional[Dict], **kwargs) -> Dict[str, Any]:
        """
        Apply smart filtering logic to endpoint parameters
        """
        enhanced_kwargs = kwargs.copy()
        
        # Get current request parameters
        sites = request.args.get('sites', '').split(',') if request.args.get('sites') else []
        time_range = request.args.get('time_range')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Apply smart site selection if no sites specified
        if not sites or sites == ['']:
            site_suggestions = self.get_smart_site_suggestions()
            if 'recommended_sites' in site_suggestions and site_suggestions['recommended_sites']:
                # Use top 2-3 recommended sites
                recommended_codes = [s['code'] for s in site_suggestions['recommended_sites'][:3]]
                enhanced_kwargs['sites'] = recommended_codes
                logger.info(f"🤖 [SMART FILTER] Applied smart site selection: {recommended_codes}")
        
        # Apply smart date range if no date range specified
        if not time_range and not (start_date and end_date):
            date_suggestions = self.get_smart_date_range()
            if 'recommended_ranges' in date_suggestions and date_suggestions['recommended_ranges']:
                # Use the highest priority recommendation
                best_range = date_suggestions['recommended_ranges'][0]
                enhanced_kwargs['start_date'] = best_range['start_date']
                enhanced_kwargs['end_date'] = best_range['end_date']
                enhanced_kwargs['time_range'] = best_range['label']
                logger.info(f"🤖 [SMART FILTER] Applied smart date range: {best_range['label']}")
        
        return enhanced_kwargs
    
    def _get_filter_suggestions(self, endpoint_name: str, filter_config: Optional[Dict]) -> Tuple[Dict, int]:
        """
        Get comprehensive filter suggestions for an endpoint
        """
        try:
            suggestions = {
                'endpoint': endpoint_name,
                'suggestions': {
                    'date_ranges': self.get_smart_date_range(),
                    'sites': self.get_smart_site_suggestions(),
                    'parameters': self.get_smart_parameter_suggestions()
                },
                'usage_instructions': {
                    'apply_smart_filters': 'Add ?smart_filters=true to automatically apply recommended filters',
                    'disable_smart_filters': 'Add ?smart_filters=false to disable automatic filtering',
                    'get_suggestions': 'Add ?filter_suggestions=true to get filter suggestions only'
                },
                'generated_at': datetime.now().isoformat()
            }
            
            return jsonify(suggestions), 200
            
        except Exception as e:
            logger.error(f"Error generating filter suggestions: {e}")
            
            return jsonify({
                'error': 'Failed to generate filter suggestions',
                'details': str(e),
                'endpoint': endpoint_name
            }), 500
    
    def _get_freshness_level(self, days_since_latest: int) -> str:
        """Determine data freshness level"""
        if days_since_latest <= 1:
            return 'excellent'
        elif days_since_latest <= 7:
            return 'good'
        elif days_since_latest <= 30:
            return 'fair'
        else:
            return 'poor'
    
    def _get_default_date_suggestions(self) -> Dict[str, Any]:
        """Get default date suggestions when data analysis fails"""
        now = datetime.now()
        return {
            'recommended_ranges': [
                {
                    'label': 'Last 7 Days',
                    'start_date': (now - timedelta(days=7)).isoformat(),
                    'end_date': now.isoformat(),
                    'priority': 'high',
                    'reason': 'Default recent period'
                },
                {
                    'label': 'Last 30 Days',
                    'start_date': (now - timedelta(days=30)).isoformat(),
                    'end_date': now.isoformat(),
                    'priority': 'medium',
                    'reason': 'Default monthly period'
                }
            ],
            'data_freshness': {
                'freshness_level': 'unknown'
            },
            'warning': 'Using default suggestions - data analysis unavailable'
        }

# Global smart filter manager
smart_filter_manager = APISmartFilterManager()

# Convenience decorators
def smart_filters(filter_config: Optional[Dict[str, Any]] = None):
    """Decorator to add smart filtering to endpoints"""
    return smart_filter_manager.smart_filters(filter_config)

def get_date_suggestions(data_type: str = 'water_quality') -> Dict[str, Any]:
    """Get smart date range suggestions"""
    return smart_filter_manager.get_smart_date_range(data_type)

def get_site_suggestions() -> Dict[str, Any]:
    """Get smart site selection suggestions"""
    return smart_filter_manager.get_smart_site_suggestions()

def get_parameter_suggestions(data_type: str = 'water_quality') -> Dict[str, Any]:
    """Get smart parameter suggestions"""
    return smart_filter_manager.get_smart_parameter_suggestions(data_type)
