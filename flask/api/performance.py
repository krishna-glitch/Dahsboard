from flask import Blueprint, jsonify, request
from datetime import datetime
import logging

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

try:
    from flask_login import login_required
except ImportError:
    def login_required(f):
        return f

try:
    from services.cache_prewarmer import cache_prewarmer
    CACHE_PREWARMER_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Cache prewarmer not available: {e}")
    CACHE_PREWARMER_AVAILABLE = False
    # Mock cache prewarmer
    class MockCachePrewarmer:
        def get_prewarming_stats(self):
            return {
                'cache_entries_created': 0,
                'is_currently_prewarming': False,
                'last_warming': None,
                'warming_duration_seconds': 0,
                'errors_count': 0,
                'total_warmings': 0
            }
        
        def get_common_data_patterns(self):
            return []
        
        def warm_common_caches(self):
            return {'success': True}
        
        def warm_common_caches_async(self):
            pass
            
    cache_prewarmer = MockCachePrewarmer()

from services.consolidated_cache_service import cache_service
from utils.callback_optimizer import callback_optimizer
from utils.chart_performance_optimizer import chart_optimizer
from utils.decorators import role_required

performance_bp = Blueprint('performance_bp', __name__)

@performance_bp.route('/summary', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_performance_summary():
    logger.info("Received request for performance summary API.")
    try:
        cache_stats = cache_service.get_detailed_stats()
        callback_stats = callback_optimizer.get_optimization_stats()
        chart_stats = chart_optimizer.get_performance_stats()
        prewarmer_stats = cache_prewarmer.get_prewarming_stats()
        
        # Extract nested stats structure
        perf_metrics = cache_stats.get('performance_metrics', {})
        memory_metrics = cache_stats.get('memory_metrics', {})
        
        summary = {
            "cache_hit_rate": perf_metrics.get('hit_rate_percent', 0),
            "memory_usage_mb": memory_metrics.get('memory_usage_mb', 0),
            "memory_limit_mb": memory_metrics.get('memory_limit_mb', 1024),
            "total_hits": perf_metrics.get('total_hits', 0),
            "total_misses": perf_metrics.get('total_misses', 0),
            "callback_optimizations": callback_stats.get('total_optimizations', 0),
            "charts_optimized": chart_stats.get('charts_optimized', 0),
            "data_points_reduced": chart_stats.get('data_points_reduced', 0),
            "cache_entries_prewarmed": prewarmer_stats.get('cache_entries_created', 0),
            "is_prewarming": prewarmer_stats.get('is_currently_prewarming', False),
            "prewarmer_available": CACHE_PREWARMER_AVAILABLE
        }
        logger.info("Successfully retrieved performance summary.")
        return jsonify(summary), 200
    except Exception as e:
        logger.error(f"Error in get_performance_summary API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve performance summary', 'details': str(e)}), 500

@performance_bp.route('/detailed', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_detailed_performance_data():
    logger.info("Received request for detailed performance data API.")
    try:
        # Fetch data from various services
        cache_stats = cache_service.get_detailed_stats()
        callback_stats = callback_optimizer.get_optimization_stats()
        chart_stats = chart_optimizer.get_performance_stats()
        prewarmer_stats = cache_prewarmer.get_prewarming_stats()

        # Extract relevant metrics
        perf_metrics = cache_stats.get('performance_metrics', {})
        memory_metrics = cache_stats.get('memory_metrics', {})
        system_metrics = cache_stats.get('system_metrics', {})
        error_metrics = cache_stats.get('error_metrics', {})
        
        # Construct the detailed response
        detailed_data = {
            "api_performance": {
                "avg_response_time": perf_metrics.get('avg_response_time', 0),
                "total_requests": perf_metrics.get('total_requests', 0),
                "error_rate": perf_metrics.get('error_rate', 0),
                "response_time_trend": perf_metrics.get('response_time_trend', 'stable')
            },
            "cache_metrics": {
                "hit_rate": perf_metrics.get('hit_rate_percent', 0),
                "total_entries": perf_metrics.get('total_entries', 0),
                "prewarming_status": prewarmer_stats
            },
            "system_metrics": {
                "cpu_usage_percent": system_metrics.get('cpu_usage_percent', 0),
                "memory_usage_percent": memory_metrics.get('memory_usage_percent', 0),
                "memory_usage_mb": memory_metrics.get('memory_usage_mb', 0),
                "memory_total_mb": memory_metrics.get('memory_total_mb', 0),
                "disk_usage_percent": system_metrics.get('disk_usage_percent', 0),
                "uptime_hours": system_metrics.get('uptime_hours', 0),
                "load_average": system_metrics.get('load_average', '0.0, 0.0, 0.0'),
                "active_connections": system_metrics.get('active_connections', 0)
            },
            "optimization_metrics": {
                "callback_optimizations": callback_stats.get('total_optimizations', 0),
                "charts_optimized": chart_stats.get('charts_optimized', 0),
                "data_points_reduced": chart_stats.get('data_points_reduced', 0)
            },
            "error_metrics": {
                "total_errors": error_metrics.get('total_errors', 0),
                "error_rate": error_metrics.get('error_rate', 0),
                "top_errors": error_metrics.get('top_errors', [])
            },
            "active_sessions": cache_stats.get('active_sessions', 0),
            "api_requests_hour": cache_stats.get('api_requests_hour', 0),
            "db_connections": cache_stats.get('db_connections', 0),
            "background_tasks": cache_stats.get('background_tasks', 0)
        }

        logger.info("Successfully retrieved detailed performance data.")
        return jsonify(detailed_data), 200
    except Exception as e:
        logger.error(f"Error in get_detailed_performance_data API: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to retrieve detailed performance data',
            'details': str(e)
        }), 500

@performance_bp.route('/web-vitals', methods=['GET'])
# @login_required
def get_web_vitals():
    logger.info("Received request for web vitals data API.")
    try:
        # Mock data for Web Vitals
        web_vitals_data = {
            "lcp": 1800,  # Largest Contentful Paint in ms
            "fid": 50,    # First Input Delay in ms
            "cls": 0.05,  # Cumulative Layout Shift
            "fcp": 1200,  # First Contentful Paint in ms
            "ttfb": 300,  # Time to First Byte in ms
            "tbt": 100,   # Total Blocking Time in ms
            "score": 90   # Overall performance score
        }
        logger.info("Successfully retrieved mock web vitals data.")
        return jsonify(web_vitals_data), 200
    except Exception as e:
        logger.error(f"Error in get_web_vitals API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve web vitals data', 'details': str(e)}), 500

@performance_bp.route('/system-metrics', methods=['GET'])
# @login_required
def get_system_metrics():
    logger.info("Received request for system metrics data API.")
    try:
        # Mock data for System Metrics
        system_metrics_data = {
            "cpu_usage_percent": 45.5,
            "memory_usage_percent": 62.3,
            "memory_usage_mb": 10240,
            "memory_total_mb": 16384,
            "disk_usage_percent": 78.9,
            "uptime_hours": 72.5,
            "load_average": "0.5, 0.3, 0.2",
            "active_connections": 150
        }
        logger.info("Successfully retrieved mock system metrics data.")
        return jsonify(system_metrics_data), 200
    except Exception as e:
        logger.error(f"Error in get_system_metrics API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve system metrics data', 'details': str(e)}), 500

@performance_bp.route('/cache/warm', methods=['POST'])
# @login_required  # Temporarily disabled for easier cache management
def warm_caches():
    """
    Trigger cache warming for common data patterns
    """
    logger.info("🔥 [API] Received cache warming request")
    
    try:
        # Check if warming is already in progress
        stats = cache_prewarmer.get_prewarming_stats()
        if stats.get('is_currently_prewarming', False):
            return jsonify({
                'success': False,
                'message': 'Cache warming is already in progress',
                'current_stats': stats
            }), 409
        
        # Start cache warming
        result = cache_prewarmer.warm_common_caches()
        
        if result.get('success', False):
            logger.info(f"[API] Cache warming completed successfully")
            return jsonify({
                'success': True,
                'message': 'Cache warming completed successfully',
                'results': result
            }), 200
        else:
            logger.error(f"[API] Cache warming failed: {result.get('error', 'Unknown error')}")
            return jsonify({
                'success': False,
                'message': 'Cache warming failed',
                'error': result.get('error', 'Unknown error')
            }), 500
            
    except Exception as e:
        logger.error(f"[API] Critical error in cache warming: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Critical error during cache warming',
            'error': str(e)
        }), 500

@performance_bp.route('/cache/warm/async', methods=['POST'])
@login_required  
def warm_caches_async():
    """
    Start cache warming in background (async)
    """
    logger.info("🔥 [API] Received async cache warming request")
    
    try:
        # Check if warming is already in progress
        stats = cache_prewarmer.get_prewarming_stats()
        if stats.get('is_currently_prewarming', False):
            return jsonify({
                'success': False,
                'message': 'Cache warming is already in progress',
                'current_stats': stats
            }), 409
        
        # Start async cache warming
        cache_prewarmer.warm_common_caches_async()
        
        logger.info("[API] Async cache warming started successfully")
        return jsonify({
            'success': True,
            'message': 'Cache warming started in background',
            'status': 'warming_started'
        }), 202
        
    except Exception as e:
        logger.error(f"[API] Critical error starting async cache warming: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': 'Failed to start cache warming',
            'error': str(e)
        }), 500

@performance_bp.route('/cache/warm/status', methods=['GET'])
# @login_required  # Temporarily disabled for monitoring access
def get_cache_warming_status():
    """
    Get cache warming status and statistics
    """
    try:
        stats = cache_prewarmer.get_prewarming_stats()
        
        # Add additional status information
        status_info = {
            'warming_status': stats,
            'available_patterns': len(cache_prewarmer.get_common_data_patterns()),
            'recommendations': []
        }
        
        # Add recommendations based on current state
        if not stats.get('last_warming'):
            status_info['recommendations'].append({
                'type': 'first_time',
                'message': 'Consider running initial cache warming to improve performance'
            })
        elif stats.get('errors_count', 0) > 0:
            status_info['recommendations'].append({
                'type': 'errors',
                'message': f'Last warming had {stats["errors_count"]} errors - check logs for details'
            })
        else:
            status_info['recommendations'].append({
                'type': 'success',
                'message': 'Cache warming is working properly'
            })
        
        logger.info("Successfully retrieved cache warming status")
        return jsonify(status_info), 200
        
    except Exception as e:
        logger.error(f"Error retrieving cache warming status: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to retrieve cache warming status',
            'details': str(e)
        }), 500

@performance_bp.route('/cache/patterns', methods=['GET'])  
@login_required
def get_cache_patterns():
    """
    Get list of data patterns used for cache warming
    """
    try:
        patterns = cache_prewarmer.get_common_data_patterns()
        
        # Format patterns for API response
        formatted_patterns = []
        for i, pattern in enumerate(patterns):
            formatted_patterns.append({
                'id': i,
                'service': pattern['service'],
                'priority': pattern['priority'], 
                'description': f"{pattern['service']} data for {pattern['params']}",
                'params': pattern['params']
            })
        
        return jsonify({
            'patterns': formatted_patterns,
            'total_patterns': len(formatted_patterns),
            'priority_distribution': {
                'high': len([p for p in patterns if p['priority'] == 'high']),
                'medium': len([p for p in patterns if p['priority'] == 'medium']),
                'low': len([p for p in patterns if p['priority'] == 'low'])
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error retrieving cache patterns: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to retrieve cache patterns',
            'details': str(e)
        }), 500

@performance_bp.route('/cache/health', methods=['GET'])
# @login_required  # Temporarily disabled for monitoring access
def get_cache_health():
    """
    Comprehensive cache health monitoring endpoint
    Returns health status, performance metrics, and recommendations
    """
    logger.info("🔍 [API] Received cache health monitoring request")

    try:
        # Get cache statistics
        cache_stats = cache_service.get_detailed_stats()
        prewarmer_stats = cache_prewarmer.get_prewarming_stats()

        # Extract key metrics
        perf_metrics = cache_stats.get('performance_metrics', {})
        memory_metrics = cache_stats.get('memory_metrics', {})

        # Calculate health scores
        hit_rate = perf_metrics.get('hit_rate_percent', 0)
        memory_usage_percent = memory_metrics.get('memory_usage_percent', 0)
        error_rate = cache_stats.get('error_metrics', {}).get('error_rate', 0)

        # Determine overall health status
        health_status = 'healthy'
        health_issues = []

        if hit_rate < 70:
            health_status = 'warning'
            health_issues.append({
                'type': 'low_hit_rate',
                'severity': 'medium',
                'message': f'Cache hit rate is {hit_rate:.1f}% (target: >70%)',
                'recommendation': 'Consider cache warming or reviewing cache strategies'
            })

        if memory_usage_percent > 90:
            health_status = 'critical' if health_status != 'critical' else health_status
            health_issues.append({
                'type': 'high_memory_usage',
                'severity': 'high',
                'message': f'Memory usage is {memory_usage_percent:.1f}% (critical: >90%)',
                'recommendation': 'Increase memory limit or implement cache eviction'
            })
        elif memory_usage_percent > 75:
            if health_status == 'healthy':
                health_status = 'warning'
            health_issues.append({
                'type': 'elevated_memory_usage',
                'severity': 'medium',
                'message': f'Memory usage is {memory_usage_percent:.1f}% (warning: >75%)',
                'recommendation': 'Monitor memory usage and consider optimization'
            })

        if error_rate > 5:
            health_status = 'critical'
            health_issues.append({
                'type': 'high_error_rate',
                'severity': 'high',
                'message': f'Cache error rate is {error_rate:.1f}% (critical: >5%)',
                'recommendation': 'Investigate cache errors and fix underlying issues'
            })

        # Check cache warming status
        last_warming = prewarmer_stats.get('last_warming')
        if not last_warming:
            health_issues.append({
                'type': 'no_cache_warming',
                'severity': 'low',
                'message': 'Cache has never been warmed',
                'recommendation': 'Run initial cache warming for better performance'
            })

        # Build health response
        health_response = {
            'overall_status': health_status,
            'health_score': max(0, 100 - (len(health_issues) * 15)),  # Decrease score per issue
            'last_check': datetime.now().isoformat(),
            'metrics': {
                'hit_rate_percent': hit_rate,
                'memory_usage_percent': memory_usage_percent,
                'total_entries': perf_metrics.get('total_entries', 0),
                'total_hits': perf_metrics.get('total_hits', 0),
                'total_misses': perf_metrics.get('total_misses', 0),
                'error_rate_percent': error_rate,
                'memory_usage_mb': memory_metrics.get('memory_usage_mb', 0),
                'memory_limit_mb': memory_metrics.get('memory_limit_mb', 1024)
            },
            'cache_warming': {
                'status': 'active' if prewarmer_stats.get('is_currently_prewarming') else 'idle',
                'last_warming': last_warming,
                'cache_entries_created': prewarmer_stats.get('cache_entries_created', 0),
                'errors_count': prewarmer_stats.get('errors_count', 0)
            },
            'issues': health_issues,
            'recommendations': []
        }

        # Generate specific recommendations
        if hit_rate > 90:
            health_response['recommendations'].append({
                'type': 'performance',
                'message': 'Excellent cache performance! Consider documenting current configuration.'
            })
        elif hit_rate > 80:
            health_response['recommendations'].append({
                'type': 'optimization',
                'message': 'Good cache performance. Monitor for any degradation patterns.'
            })
        else:
            health_response['recommendations'].append({
                'type': 'improvement',
                'message': 'Cache hit rate could be improved. Review cache strategies and warming patterns.'
            })

        if memory_usage_percent < 50:
            health_response['recommendations'].append({
                'type': 'capacity',
                'message': 'Memory usage is low. Consider increasing cache size for better performance.'
            })

        logger.info(f"🔍 [API] Cache health check complete: status={health_status}, score={health_response['health_score']}")
        return jsonify(health_response), 200

    except Exception as e:
        logger.error(f"🔍 [API] Error in cache health check: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to retrieve cache health status',
            'details': str(e),
            'overall_status': 'error',
            'health_score': 0
        }), 500

@performance_bp.route('/client-metrics', methods=['POST'])
# @login_required  # Consider if you want to require login for metrics
def receive_client_metrics():
    """
    Receive performance metrics from the React frontend
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'No data provided',
                'success': False
            }), 400
        
        session_id = data.get('sessionId')
        metrics = data.get('metrics', [])
        timestamp = data.get('timestamp')
        
        logger.info(f"[CLIENT METRICS] Received {len(metrics)} metrics from session {session_id}")
        
        # Process and store metrics
        processed_metrics = []
        error_count = 0
        performance_issues = []
        
        for metric in metrics:
            try:
                # Validate metric structure
                if not isinstance(metric, dict) or 'name' not in metric or 'value' not in metric:
                    continue
                
                metric_name = metric.get('name')
                metric_value = metric.get('value')
                
                # Track performance issues
                if metric_name == 'api_call' and metric_value > 5000:  # > 5s
                    performance_issues.append({
                        'type': 'slow_api',
                        'endpoint': metric.get('endpoint', 'unknown'),
                        'duration': metric_value,
                        'timestamp': metric.get('timestamp')
                    })
                elif metric_name == 'component_render' and metric_value > 500:  # > 500ms
                    performance_issues.append({
                        'type': 'slow_render',
                        'component': metric.get('component', 'unknown'),
                        'duration': metric_value,
                        'timestamp': metric.get('timestamp')
                    })
                elif metric_name == 'lcp' and metric_value > 2500:  # > 2.5s
                    performance_issues.append({
                        'type': 'poor_lcp',
                        'value': metric_value,
                        'timestamp': metric.get('timestamp')
                    })
                elif metric.get('type') == 'error':
                    error_count += 1
                    logger.error(f"🚨 [CLIENT ERROR] {metric.get('errorType')}: {metric.get('error', 'Unknown error')} in {metric.get('component', 'unknown component')}")
                
                processed_metrics.append({
                    'session_id': session_id,
                    'metric_name': metric_name,
                    'metric_value': metric_value,
                    'timestamp': metric.get('timestamp', timestamp),
                    'metadata': {k: v for k, v in metric.items() if k not in ['name', 'value', 'timestamp']}
                })
                
            except Exception as e:
                logger.warning(f"Failed to process metric: {metric}, error: {e}")
                continue
        
        # Log performance summary
        if performance_issues:
            logger.warning(f"[PERFORMANCE ISSUES] Detected {len(performance_issues)} performance issues in session {session_id}")
            for issue in performance_issues[:3]:  # Log first 3 issues
                logger.warning(f"   • {issue['type']}: {issue}")
        
        if error_count > 0:
            logger.error(f"🚨 [CLIENT ERRORS] Session {session_id} reported {error_count} errors")
        
        # Store metrics (in a real implementation, you'd save to database)
        # For now, we'll just log them and return success
        logger.info(f"[CLIENT METRICS] Successfully processed {len(processed_metrics)} metrics from session {session_id}")
        
        # Optional: Store in cache for real-time monitoring
        if processed_metrics:
            cache_key = f"client_metrics:{session_id}:{timestamp}"
            cache_service.set(cache_key, {
                'metrics': processed_metrics,
                'performance_issues': performance_issues,
                'error_count': error_count,
                'processed_at': datetime.now().isoformat()
            }, ttl=3600)  # Store for 1 hour
        
        return jsonify({
            'success': True,
            'message': f'Received {len(processed_metrics)} metrics',
            'session_id': session_id,
            'performance_issues_count': len(performance_issues),
            'errors_count': error_count
        }), 200
        
    except Exception as e:
        logger.error(f"[CLIENT METRICS] Error processing client metrics: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to process client metrics',
            'details': str(e),
            'success': False
        }), 500
