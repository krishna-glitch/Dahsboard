from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import json
from datetime import datetime

from services.consolidated_cache_service import cache_service
from utils.callback_optimizer import callback_optimizer
from utils.chart_performance_optimizer import chart_optimizer
from services.cache_prewarmer import cache_prewarmer

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

performance_bp = Blueprint('performance_bp', __name__)

@performance_bp.route('/summary', methods=['GET'])
# @login_required  # Temporarily disabled to allow unauthenticated access to performance monitoring
def get_performance_summary():
    logger.info("Received request for performance summary API.")
    try:
        cache_stats = cache_service.get_stats()
        callback_stats = callback_optimizer.get_optimization_stats()
        chart_stats = chart_optimizer.get_performance_stats()
        prewarmer_stats = cache_prewarmer.get_prewarming_stats()
        
        summary = {
            "cache_hit_rate": cache_stats.get('hit_rate_percent', 0),
            "memory_usage_mb": cache_stats.get('memory_usage_mb', 0),
            "memory_limit_mb": cache_stats.get('memory_limit_mb', 1024),
            "callback_optimizations": callback_stats.get('total_optimizations', 0),
            "charts_optimized": chart_stats.get('charts_optimized', 0),
            "data_points_reduced": chart_stats.get('data_points_reduced', 0),
            "cache_entries_prewarmed": prewarmer_stats.get('cache_entries_created', 0),
            "is_prewarming": prewarmer_stats.get('is_currently_prewarming', False)
        }
        logger.info("Successfully retrieved performance summary.")
        return jsonify(summary), 200
    except Exception as e:
        logger.error(f"Error in get_performance_summary API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve performance summary', 'details': str(e)}), 500


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
