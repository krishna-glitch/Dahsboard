"""
Advanced Cache Prewarmer Service
Proactively warms caches with commonly requested data patterns
"""

import logging
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Import services for cache warming
from services.core_data_service import core_data_service
from services.consolidated_cache_service import cache_service
from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

class CachePrewarmer:
    """
    Advanced cache prewarmer that intelligently warms common data patterns
    """
    
    def __init__(self):
        self.is_warming = False
        self.warming_thread = None
        self.warming_stats = {
            'last_warming': None,
            'cache_entries_created': 0,
            'warming_duration_seconds': 0,
            'errors_count': 0,
            'last_error': None,
            'total_warmings': 0,
            'is_currently_prewarming': False
        }
        self.warming_lock = threading.Lock()
    
    def get_prewarming_stats(self) -> Dict[str, Any]:
        """Get current prewarming statistics"""
        with self.warming_lock:
            return self.warming_stats.copy()
    
    def get_common_data_patterns(self) -> List[Dict[str, Any]]:
        """
        Define common data access patterns for cache warming
        Based on typical user interactions and behavior analysis
        """
        # Dynamic patterns based on user behavior analysis
        DYNAMIC_PATTERNS = [
            # Most accessed combinations from logs - CRITICAL priority
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2'], 'range': '7d'},
                'priority': 'critical'
            },
            {
                'service': 'redox',
                'params': {'sites': ['S1'], 'range': '30d', 'fidelity': 'max'},
                'priority': 'critical'
            },
            # Dashboard landing page data
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2', 'S3'], 'range': '7d'},
                'priority': 'critical'
            },
            # Recent data views (last 24 hours - most common)
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2'], 'range': '1d'},
                'priority': 'critical'
            }
        ]
        
        # Standard patterns based on typical usage
        STANDARD_PATTERNS = [
            # Water Quality - Common time ranges
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2'], 'days_back': 7},
                'priority': 'high'
            },
            {
                'service': 'water_quality', 
                'params': {'sites': ['S1', 'S2'], 'days_back': 30},
                'priority': 'high'
            },
            {
                'service': 'water_quality',
                'params': {'sites': ['S3', 'S4'], 'days_back': 7},
                'priority': 'medium'
            },
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2', 'S3', 'S4'], 'days_back': 1},
                'priority': 'high'
            },
            
            # Redox Analysis - Common patterns
            {
                'service': 'redox',
                'params': {'sites': ['S1', 'S2'], 'days_back': 90},
                'priority': 'medium'
            },
            {
                'service': 'redox',
                'params': {'sites': ['S1', 'S2'], 'days_back': 30},
                'priority': 'medium'
            },
            
            # Site metadata - Always useful to cache
            {
                'service': 'site_metadata',
                'params': {},
                'priority': 'high'
            },
            
            # Site comparison patterns
            {
                'service': 'site_comparison',
                'params': {'sites': ['S1', 'S2'], 'metric': 'ph', 'days_back': 7},
                'priority': 'medium'
            },
            {
                'service': 'site_comparison',
                'params': {'sites': ['S1', 'S2'], 'metric': 'temperature', 'days_back': 7},
                'priority': 'medium'
            }
        ]
        
        # Predictive patterns - likely next requests
        PREDICTIVE_PATTERNS = [
            # Users who view 7d often look at 30d next
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2'], 'range': '30d', 'fidelity': 'std'},
                'priority': 'medium',
                'trigger': 'after_7d_view'
            },
            # Users comparing sites often look at individual site details
            {
                'service': 'redox',
                'params': {'sites': ['S1'], 'range': '7d', 'fidelity': 'max'},
                'priority': 'medium',
                'trigger': 'after_site_comparison'
            },
            # Export operations often follow data views
            {
                'service': 'water_quality',
                'params': {'sites': ['S1', 'S2', 'S3'], 'range': '30d', 'export_ready': True},
                'priority': 'low',
                'trigger': 'after_dashboard_view'
            }
        ]
        
        # Combine patterns with priority ordering
        all_patterns = DYNAMIC_PATTERNS + STANDARD_PATTERNS + PREDICTIVE_PATTERNS
        
        # Sort by priority: critical -> high -> medium -> low
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        all_patterns.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        return all_patterns
    
    def warm_single_pattern(self, pattern: Dict[str, Any]) -> Dict[str, Any]:
        """Warm cache for a single data pattern"""
        service = pattern['service']
        params = pattern['params']
        priority = pattern['priority']
        
        start_time = time.time()
        result = {
            'service': service,
            'params': params,
            'priority': priority,
            'success': False,
            'duration_ms': 0,
            'records_cached': 0,
            'error': None
        }
        
        try:
            if service == 'water_quality':
                sites = params.get('sites', ['S1', 'S2'])
                days_back = params.get('days_back', 30)
                
                end_date = datetime.now()
                start_date = end_date - timedelta(days=days_back)
                
                data = core_data_service.load_water_quality_data(
                    sites=sites,
                    start_date=start_date,
                    end_date=end_date,
                    limit=5000  # Reasonable limit for prewarming
                )
                result['records_cached'] = len(data) if hasattr(data, '__len__') else 1
                
            elif service == 'redox':
                sites = params.get('sites', ['S1', 'S2'])
                days_back = params.get('days_back', 90)
                
                end_date = datetime.now()
                start_date = end_date - timedelta(days=days_back)
                
                data = core_data_service.load_redox_data(
                    sites=sites,
                    start_date=start_date,
                    end_date=end_date,
                    limit=3000  # Smaller limit for redox data
                )
                result['records_cached'] = len(data) if hasattr(data, '__len__') else 1
                
            elif service == 'site_metadata':
                metadata = core_data_service.get_site_metadata()
                result['records_cached'] = len(metadata) if hasattr(metadata, '__len__') else 1
                
            elif service == 'site_comparison':
                # This would warm comparison cache patterns
                # For now, just warm basic site metadata
                metadata = core_data_service.get_site_metadata()
                result['records_cached'] = len(metadata) if hasattr(metadata, '__len__') else 1
                
            result['success'] = True
            result['duration_ms'] = round((time.time() - start_time) * 1000, 2)
            
        except Exception as e:
            result['error'] = str(e)
            result['duration_ms'] = round((time.time() - start_time) * 1000, 2)
            logger.warning(f"❌ [CACHE WARM] Failed to warm {service}: {e}")
            
        return result
    
    def warm_common_caches(self, max_workers: int = 3) -> Dict[str, Any]:
        """
        Warm caches with common data combinations using parallel execution
        """
        if self.is_warming:
            logger.warning("🔥 [CACHE WARM] Warming already in progress")
            return {'error': 'Cache warming already in progress'}
            
        with self.warming_lock:
            self.is_warming = True
            self.warming_stats['is_currently_prewarming'] = True
            
        start_time = time.time()
        patterns = self.get_common_data_patterns()
        results = []
        
        logger.info(f"🔥 [CACHE WARM] Starting cache warming for {len(patterns)} patterns")
        
        try:
            # Use ThreadPoolExecutor for parallel warming
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Sort patterns by priority levels
                critical_priority = [p for p in patterns if p['priority'] == 'critical']
                high_priority = [p for p in patterns if p['priority'] == 'high']
                medium_priority = [p for p in patterns if p['priority'] == 'medium']
                low_priority = [p for p in patterns if p['priority'] == 'low']
                
                # Process each priority tier sequentially, but patterns within tier in parallel
                priority_tiers = [
                    ('CRITICAL', critical_priority),
                    ('HIGH', high_priority),
                    ('MEDIUM', medium_priority),
                    ('LOW', low_priority)
                ]
                
                for tier_name, tier_patterns in priority_tiers:
                    if not tier_patterns:
                        continue
                        
                    logger.info(f"🔥 [CACHE WARM] Starting {tier_name} priority tier: {len(tier_patterns)} patterns")
                    
                    # Warm all patterns in this tier in parallel
                    future_to_pattern = {}
                    for pattern in tier_patterns:
                        future = executor.submit(self.warm_single_pattern, pattern)
                        future_to_pattern[future] = pattern
                    
                    # Collect results for this tier
                    tier_results = []
                    for future in as_completed(future_to_pattern):
                        result = future.result()
                        results.append(result)
                        tier_results.append(result)
                        
                        if result['success']:
                            logger.info(f"✅ [CACHE WARM] {result['service']} warmed: "
                                      f"{result['records_cached']} records in {result['duration_ms']}ms")
                    
                    # Log tier completion
                    tier_success = len([r for r in tier_results if r['success']])
                    logger.info(f"🎯 [CACHE WARM] {tier_name} tier completed: {tier_success}/{len(tier_patterns)} successful")
            
            # Calculate statistics
            total_duration = time.time() - start_time
            successful = [r for r in results if r['success']]
            failed = [r for r in results if not r['success']]
            total_records = sum(r['records_cached'] for r in successful)
            
            warming_result = {
                'success': True,
                'total_patterns': len(patterns),
                'successful_warmings': len(successful),
                'failed_warmings': len(failed),
                'total_records_cached': total_records,
                'duration_seconds': round(total_duration, 2),
                'average_pattern_time_ms': round(sum(r['duration_ms'] for r in successful) / max(len(successful), 1), 2),
                'patterns_by_service': self._group_results_by_service(successful),
                'errors': [{'service': r['service'], 'error': r['error']} for r in failed if r['error']],
                'timestamp': datetime.now().isoformat()
            }
            
            # Update internal stats
            with self.warming_lock:
                self.warming_stats.update({
                    'last_warming': datetime.now().isoformat(),
                    'cache_entries_created': total_records,
                    'warming_duration_seconds': round(total_duration, 2),
                    'errors_count': len(failed),
                    'last_error': failed[-1]['error'] if failed else None,
                    'total_warmings': self.warming_stats['total_warmings'] + 1,
                    'is_currently_prewarming': False
                })
                
            logger.info(f"🔥 [CACHE WARM] Completed: {len(successful)}/{len(patterns)} patterns successful, "
                       f"{total_records} records cached in {total_duration:.2f}s")
            
            return warming_result
            
        except Exception as e:
            error_result = {
                'success': False,
                'error': str(e),
                'duration_seconds': time.time() - start_time,
                'timestamp': datetime.now().isoformat()
            }
            
            with self.warming_lock:
                self.warming_stats.update({
                    'errors_count': self.warming_stats['errors_count'] + 1,
                    'last_error': str(e),
                    'is_currently_prewarming': False
                })
                
            logger.error(f"❌ [CACHE WARM] Critical error: {e}")
            return error_result
            
        finally:
            with self.warming_lock:
                self.is_warming = False
                self.warming_stats['is_currently_prewarming'] = False
    
    def warm_common_caches_async(self, max_workers: int = 3) -> None:
        """
        Start cache warming in a background thread
        """
        if self.is_warming:
            logger.warning("🔥 [CACHE WARM] Async warming already in progress")
            return
            
        def warming_worker():
            try:
                self.warm_common_caches(max_workers)
            except Exception as e:
                logger.error(f"❌ [CACHE WARM] Async warming failed: {e}")
        
        self.warming_thread = threading.Thread(target=warming_worker, daemon=True)
        self.warming_thread.start()
        logger.info("🔥 [CACHE WARM] Started async cache warming")
    
    def _group_results_by_service(self, results: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Group warming results by service type"""
        grouped = {}
        for result in results:
            service = result['service']
            if service not in grouped:
                grouped[service] = {
                    'patterns_warmed': 0,
                    'total_records': 0,
                    'total_duration_ms': 0
                }
            
            grouped[service]['patterns_warmed'] += 1
            grouped[service]['total_records'] += result['records_cached']
            grouped[service]['total_duration_ms'] += result['duration_ms']
            
        return grouped

# Global cache prewarmer instance
cache_prewarmer = CachePrewarmer()