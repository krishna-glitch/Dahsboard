"""
Comprehensive Performance Monitoring for Flask APIs
Real-time performance tracking, analytics, and optimization insights
"""

import logging
import time
import threading
import psutil
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable, Union
from dataclasses import dataclass, asdict
from collections import defaultdict, deque
from contextlib import contextmanager
from functools import wraps
from flask import request, g, current_app
import statistics
import numpy as np

# Import existing performance monitor
from services.performance_monitor import PerformanceMonitor, PerformanceMetric

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

@dataclass
class APIPerformanceMetric:
    """Enhanced performance metric for API endpoints"""
    timestamp: datetime
    endpoint: str
    method: str
    status_code: int
    response_time_ms: float
    request_size_bytes: int
    response_size_bytes: int
    memory_usage_mb: float
    cpu_percent: float
    database_queries: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    error_type: Optional[str] = None
    business_metrics: Optional[Dict[str, Any]] = None

@dataclass
class PerformanceAlert:
    """Performance alert definition"""
    alert_id: str
    alert_type: str
    severity: str
    threshold_value: float
    current_value: float
    endpoint: str
    triggered_at: datetime
    description: str
    suggested_actions: List[str]

class FlaskPerformanceMonitor:
    """
    Comprehensive performance monitoring for Flask APIs
    """
    
    def __init__(self, 
                 db_path: str = "performance.db",
                 max_memory_metrics: int = 10000,
                 enable_real_time_alerts: bool = True,
                 enable_predictive_analytics: bool = True):
        """
        Initialize Flask performance monitor
        
        Args:
            db_path: SQLite database path for persistent storage
            max_memory_metrics: Maximum metrics to keep in memory
            enable_real_time_alerts: Enable real-time performance alerts
            enable_predictive_analytics: Enable predictive performance analytics
        """
        self.db_path = db_path
        self.max_memory_metrics = max_memory_metrics
        self.enable_alerts = enable_real_time_alerts
        self.enable_predictions = enable_predictive_analytics
        
        # Performance data storage
        self.recent_metrics: deque = deque(maxlen=max_memory_metrics)
        self.endpoint_stats = defaultdict(list)
        self.performance_trends = defaultdict(deque)
        self.active_requests = {}
        
        # Alert system
        self.alert_rules = {}
        self.active_alerts = {}
        self.alert_callbacks = []
        
        # Thread safety
        self._lock = threading.Lock()
        self._db_lock = threading.Lock()
        
        # System monitoring
        self._process = psutil.Process()
        
        # Initialize database and base monitor
        self._init_performance_database()
        self.base_monitor = PerformanceMonitor(enable_benchmarking=True)
        
        # Start background monitoring
        self._monitoring_active = True
        self._monitoring_thread = threading.Thread(target=self._background_monitoring, daemon=True)
        self._monitoring_thread.start()
        
        # Setup default alert rules
        self._setup_default_alerts()
        
        logger.info(f"Flask performance monitor initialized with alerts: {enable_real_time_alerts}")
    
    def _init_performance_database(self):
        """Initialize performance monitoring database"""
        try:
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # API performance metrics table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS api_performance_metrics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TIMESTAMP NOT NULL,
                        endpoint TEXT NOT NULL,
                        method TEXT NOT NULL,
                        status_code INTEGER NOT NULL,
                        response_time_ms REAL NOT NULL,
                        request_size_bytes INTEGER,
                        response_size_bytes INTEGER,
                        memory_usage_mb REAL,
                        cpu_percent REAL,
                        database_queries INTEGER DEFAULT 0,
                        cache_hits INTEGER DEFAULT 0,
                        cache_misses INTEGER DEFAULT 0,
                        user_id TEXT,
                        ip_address TEXT,
                        user_agent TEXT,
                        error_type TEXT,
                        business_metrics TEXT
                    )
                """)
                
                # Performance alerts table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS performance_alerts (
                        alert_id TEXT PRIMARY KEY,
                        alert_type TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        threshold_value REAL,
                        current_value REAL,
                        endpoint TEXT,
                        triggered_at TIMESTAMP NOT NULL,
                        resolved_at TIMESTAMP,
                        description TEXT,
                        suggested_actions TEXT,
                        is_active BOOLEAN DEFAULT TRUE
                    )
                """)
                
                # Endpoint statistics table  
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS endpoint_statistics (
                        endpoint TEXT PRIMARY KEY,
                        total_requests INTEGER DEFAULT 0,
                        avg_response_time_ms REAL,
                        p95_response_time_ms REAL,
                        p99_response_time_ms REAL,
                        error_rate_percent REAL,
                        throughput_rps REAL,
                        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create indexes for performance
                cursor.executemany("""
                    CREATE INDEX IF NOT EXISTS {} ON {} ({})
                """, [
                    ("idx_api_metrics_timestamp", "api_performance_metrics", "timestamp"),
                    ("idx_api_metrics_endpoint", "api_performance_metrics", "endpoint"),
                    ("idx_api_metrics_status", "api_performance_metrics", "status_code"),
                    ("idx_alerts_triggered", "performance_alerts", "triggered_at"),
                    ("idx_alerts_active", "performance_alerts", "is_active")
                ])
                
                conn.commit()
                logger.info("Performance monitoring database initialized")
                
        except sqlite3.Error as e:
            logger.error(f"Error initializing performance database: {e}")
            raise
    
    @contextmanager
    def _get_db_connection(self):
        """Thread-safe database connection"""
        with self._db_lock:
            conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False
            )
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            try:
                yield conn
            finally:
                conn.close()
    
    def performance_monitor(self, 
                           alert_thresholds: Optional[Dict[str, float]] = None,
                           track_business_metrics: bool = False,
                           auto_optimize: bool = False):
        """
        Decorator to monitor API endpoint performance
        
        Args:
            alert_thresholds: Custom alert thresholds for this endpoint
            track_business_metrics: Track business-specific metrics
            auto_optimize: Enable automatic optimization suggestions
            
        Returns:
            Decorated endpoint function
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                request_id = getattr(g, 'request_id', str(time.time()))
                endpoint = request.endpoint or f.__name__
                
                # Start monitoring
                start_time = time.time()
                start_memory = self._get_memory_usage()
                start_cpu = self._get_cpu_percent()
                
                # Track active request
                with self._lock:
                    self.active_requests[request_id] = {
                        'endpoint': endpoint,
                        'start_time': start_time,
                        'method': request.method
                    }
                
                try:
                    # Execute the function
                    result = f(*args, **kwargs)
                    
                    # Calculate metrics
                    end_time = time.time()
                    response_time = (end_time - start_time) * 1000
                    end_memory = self._get_memory_usage()
                    end_cpu = self._get_cpu_percent()
                    
                    # Determine status code
                    if isinstance(result, tuple):
                        data, status_code = result
                    else:
                        data, status_code = result, 200
                    
                    # Get request/response sizes
                    request_size = request.content_length or 0
                    response_size = len(json.dumps(data, default=str)) if isinstance(data, dict) else 0
                    
                    # Create performance metric
                    metric = APIPerformanceMetric(
                        timestamp=datetime.now(),
                        endpoint=endpoint,
                        method=request.method,
                        status_code=status_code,
                        response_time_ms=response_time,
                        request_size_bytes=request_size,
                        response_size_bytes=response_size,
                        memory_usage_mb=end_memory,
                        cpu_percent=end_cpu,
                        user_id=getattr(g, 'user_id', None),
                        ip_address=request.remote_addr,
                        user_agent=request.headers.get('User-Agent', '')[:200]  # Truncate
                    )
                    
                    # Track business metrics if enabled
                    if track_business_metrics and isinstance(data, dict):
                        business_metrics = self._extract_business_metrics(data)
                        metric.business_metrics = business_metrics
                    
                    # Store metric
                    self._store_performance_metric(metric)
                    
                    # Check alerts
                    if self.enable_alerts:
                        self._check_performance_alerts(endpoint, metric, alert_thresholds)
                    
                    # Auto-optimization suggestions
                    if auto_optimize and response_time > 2000:  # > 2 seconds
                        self._generate_optimization_suggestions(endpoint, metric)
                    
                    return result
                    
                except Exception as e:
                    # Handle errors
                    end_time = time.time()
                    response_time = (end_time - start_time) * 1000
                    
                    error_metric = APIPerformanceMetric(
                        timestamp=datetime.now(),
                        endpoint=endpoint,
                        method=request.method,
                        status_code=500,
                        response_time_ms=response_time,
                        request_size_bytes=request.content_length or 0,
                        response_size_bytes=0,
                        memory_usage_mb=self._get_memory_usage(),
                        cpu_percent=self._get_cpu_percent(),
                        error_type=type(e).__name__,
                        user_id=getattr(g, 'user_id', None),
                        ip_address=request.remote_addr,
                        user_agent=request.headers.get('User-Agent', '')[:200]
                    )
                    
                    self._store_performance_metric(error_metric)
                    
                    # Trigger error alert
                    if self.enable_alerts:
                        self._trigger_error_alert(endpoint, e, error_metric)
                    
                    raise
                    
                finally:
                    # Clean up active request tracking
                    with self._lock:
                        self.active_requests.pop(request_id, None)
            
            return decorated_function
        return decorator
    
    def get_performance_dashboard(self, hours_back: int = 24) -> Dict[str, Any]:
        """
        Get comprehensive performance dashboard data
        
        Args:
            hours_back: Hours of data to include
            
        Returns:
            Performance dashboard data
        """
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours_back)
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Overall metrics
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_requests,
                        AVG(response_time_ms) as avg_response_time,
                        MAX(response_time_ms) as max_response_time,
                        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
                        AVG(memory_usage_mb) as avg_memory_usage,
                        AVG(cpu_percent) as avg_cpu_usage
                    FROM api_performance_metrics 
                    WHERE timestamp >= ?
                """, (cutoff_time.isoformat(),))
                
                overall_stats = cursor.fetchone()
                
                # Endpoint performance
                cursor.execute("""
                    SELECT 
                        endpoint,
                        COUNT(*) as request_count,
                        AVG(response_time_ms) as avg_response_time,
                        MAX(response_time_ms) as max_response_time,
                        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
                    FROM api_performance_metrics 
                    WHERE timestamp >= ?
                    GROUP BY endpoint
                    ORDER BY request_count DESC
                    LIMIT 10
                """, (cutoff_time.isoformat(),))
                
                endpoint_stats = []
                for row in cursor.fetchall():
                    endpoint_stats.append({
                        'endpoint': row[0],
                        'request_count': row[1],
                        'avg_response_time_ms': round(row[2], 2),
                        'max_response_time_ms': round(row[3], 2),
                        'error_count': row[4],
                        'error_rate_percent': round((row[4] / row[1]) * 100, 2) if row[1] > 0 else 0
                    })
                
                # Hourly trends
                cursor.execute("""
                    SELECT 
                        strftime('%H:00', timestamp) as hour,
                        COUNT(*) as requests,
                        AVG(response_time_ms) as avg_response_time,
                        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
                    FROM api_performance_metrics 
                    WHERE timestamp >= ?
                    GROUP BY strftime('%H:00', timestamp)
                    ORDER BY hour
                """, (cutoff_time.isoformat(),))
                
                hourly_trends = []
                for row in cursor.fetchall():
                    hourly_trends.append({
                        'hour': row[0],
                        'requests': row[1],
                        'avg_response_time_ms': round(row[2], 2),
                        'error_count': row[3]
                    })
                
                # Active alerts
                cursor.execute("""
                    SELECT alert_type, severity, endpoint, description, triggered_at
                    FROM performance_alerts 
                    WHERE is_active = TRUE
                    ORDER BY triggered_at DESC
                    LIMIT 20
                """)
                
                active_alerts = []
                for row in cursor.fetchall():
                    active_alerts.append({
                        'alert_type': row[0],
                        'severity': row[1],
                        'endpoint': row[2],
                        'description': row[3],
                        'triggered_at': row[4]
                    })
                
                # System resources
                system_stats = {
                    'memory_usage_percent': psutil.virtual_memory().percent,
                    'cpu_usage_percent': psutil.cpu_percent(),
                    'disk_usage_percent': psutil.disk_usage('/').percent,
                    'active_requests': len(self.active_requests),
                    'total_memory_mb': psutil.virtual_memory().total / 1024 / 1024
                }
                
                dashboard = {
                    'summary': {
                        'total_requests': overall_stats[0] if overall_stats else 0,
                        'avg_response_time_ms': round(overall_stats[1], 2) if overall_stats and overall_stats[1] else 0,
                        'max_response_time_ms': round(overall_stats[2], 2) if overall_stats and overall_stats[2] else 0,
                        'error_count': overall_stats[3] if overall_stats else 0,
                        'error_rate_percent': round((overall_stats[3] / max(overall_stats[0], 1)) * 100, 2) if overall_stats else 0,
                        'avg_memory_usage_mb': round(overall_stats[4], 2) if overall_stats and overall_stats[4] else 0,
                        'avg_cpu_usage_percent': round(overall_stats[5], 2) if overall_stats and overall_stats[5] else 0
                    },
                    'endpoint_performance': endpoint_stats,
                    'hourly_trends': hourly_trends,
                    'active_alerts': active_alerts,
                    'system_resources': system_stats,
                    'performance_score': self._calculate_performance_score(overall_stats),
                    'recommendations': self._get_performance_recommendations(),
                    'dashboard_period_hours': hours_back,
                    'generated_at': datetime.now().isoformat()
                }
                
                return dashboard
                
        except Exception as e:
            logger.error(f"Error generating performance dashboard: {e}")
            return {'error': str(e)}
    
    def get_endpoint_analytics(self, endpoint: str, days_back: int = 7) -> Dict[str, Any]:
        """
        Get detailed analytics for a specific endpoint
        
        Args:
            endpoint: Endpoint to analyze
            days_back: Days of data to analyze
            
        Returns:
            Endpoint analytics data
        """
        try:
            cutoff_time = datetime.now() - timedelta(days=days_back)
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Basic statistics
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_requests,
                        AVG(response_time_ms) as avg_response_time,
                        MIN(response_time_ms) as min_response_time,
                        MAX(response_time_ms) as max_response_time,
                        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
                        AVG(request_size_bytes) as avg_request_size,
                        AVG(response_size_bytes) as avg_response_size,
                        COUNT(DISTINCT user_id) as unique_users,
                        COUNT(DISTINCT ip_address) as unique_ips
                    FROM api_performance_metrics 
                    WHERE endpoint = ? AND timestamp >= ?
                """, (endpoint, cutoff_time.isoformat()))
                
                basic_stats = cursor.fetchone()
                
                # Response time percentiles
                cursor.execute("""
                    SELECT response_time_ms 
                    FROM api_performance_metrics 
                    WHERE endpoint = ? AND timestamp >= ?
                    ORDER BY response_time_ms
                """, (endpoint, cutoff_time.isoformat()))
                
                response_times = [row[0] for row in cursor.fetchall()]
                percentiles = {}
                if response_times:
                    percentiles = {
                        'p50': np.percentile(response_times, 50),
                        'p90': np.percentile(response_times, 90),
                        'p95': np.percentile(response_times, 95),
                        'p99': np.percentile(response_times, 99)
                    }
                
                # Daily trends
                cursor.execute("""
                    SELECT 
                        DATE(timestamp) as date,
                        COUNT(*) as requests,
                        AVG(response_time_ms) as avg_response_time,
                        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
                    FROM api_performance_metrics 
                    WHERE endpoint = ? AND timestamp >= ?
                    GROUP BY DATE(timestamp)
                    ORDER BY date
                """, (endpoint, cutoff_time.isoformat()))
                
                daily_trends = []
                for row in cursor.fetchall():
                    daily_trends.append({
                        'date': row[0],
                        'requests': row[1],
                        'avg_response_time_ms': round(row[2], 2),
                        'error_count': row[3]
                    })
                
                # Error analysis
                cursor.execute("""
                    SELECT 
                        error_type,
                        COUNT(*) as count,
                        AVG(response_time_ms) as avg_response_time
                    FROM api_performance_metrics 
                    WHERE endpoint = ? AND timestamp >= ? AND error_type IS NOT NULL
                    GROUP BY error_type
                    ORDER BY count DESC
                """, (endpoint, cutoff_time.isoformat()))
                
                error_analysis = []
                for row in cursor.fetchall():
                    error_analysis.append({
                        'error_type': row[0],
                        'count': row[1],
                        'avg_response_time_ms': round(row[2], 2)
                    })
                
                analytics = {
                    'endpoint': endpoint,
                    'analysis_period_days': days_back,
                    'basic_statistics': {
                        'total_requests': basic_stats[0] if basic_stats else 0,
                        'avg_response_time_ms': round(basic_stats[1], 2) if basic_stats and basic_stats[1] else 0,
                        'min_response_time_ms': round(basic_stats[2], 2) if basic_stats and basic_stats[2] else 0,
                        'max_response_time_ms': round(basic_stats[3], 2) if basic_stats and basic_stats[3] else 0,
                        'error_count': basic_stats[4] if basic_stats else 0,
                        'error_rate_percent': round((basic_stats[4] / max(basic_stats[0], 1)) * 100, 2) if basic_stats else 0,
                        'avg_request_size_bytes': int(basic_stats[5]) if basic_stats and basic_stats[5] else 0,
                        'avg_response_size_bytes': int(basic_stats[6]) if basic_stats and basic_stats[6] else 0,
                        'unique_users': basic_stats[7] if basic_stats else 0,
                        'unique_ips': basic_stats[8] if basic_stats else 0
                    },
                    'response_time_percentiles': percentiles,
                    'daily_trends': daily_trends,
                    'error_analysis': error_analysis,
                    'performance_grade': self._grade_endpoint_performance(basic_stats, percentiles),
                    'optimization_suggestions': self._get_endpoint_optimization_suggestions(endpoint, basic_stats),
                    'generated_at': datetime.now().isoformat()
                }
                
                return analytics
                
        except Exception as e:
            logger.error(f"Error generating endpoint analytics for {endpoint}: {e}")
            return {'error': str(e)}
    
    def create_performance_alert(self, 
                               alert_type: str,
                               threshold_value: float,
                               endpoint: str = None,
                               severity: str = 'MEDIUM',
                               callback: Callable = None):
        """
        Create custom performance alert rule
        
        Args:
            alert_type: Type of alert (response_time, error_rate, etc.)
            threshold_value: Threshold value to trigger alert
            endpoint: Specific endpoint or None for all endpoints
            severity: Alert severity level
            callback: Optional callback function when alert triggers
        """
        alert_rule_id = f"{alert_type}_{endpoint or 'global'}_{int(time.time())}"
        
        self.alert_rules[alert_rule_id] = {
            'alert_type': alert_type,
            'threshold_value': threshold_value,
            'endpoint': endpoint,
            'severity': severity,
            'callback': callback,
            'created_at': datetime.now(),
            'enabled': True
        }
        
        if callback:
            self.alert_callbacks.append(callback)
        
        logger.info(f"Performance alert rule created: {alert_rule_id}")
        return alert_rule_id
    
    def _store_performance_metric(self, metric: APIPerformanceMetric):
        """Store performance metric in database and memory"""
        try:
            # Store in memory
            with self._lock:
                self.recent_metrics.append(metric)
                self.endpoint_stats[metric.endpoint].append(metric.response_time_ms)
                
                # Keep only recent endpoint stats
                if len(self.endpoint_stats[metric.endpoint]) > 1000:
                    self.endpoint_stats[metric.endpoint] = self.endpoint_stats[metric.endpoint][-500:]
            
            # Store in database
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO api_performance_metrics 
                    (timestamp, endpoint, method, status_code, response_time_ms,
                     request_size_bytes, response_size_bytes, memory_usage_mb, cpu_percent,
                     database_queries, cache_hits, cache_misses, user_id, ip_address,
                     user_agent, error_type, business_metrics)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    metric.timestamp.isoformat(), metric.endpoint, metric.method,
                    metric.status_code, metric.response_time_ms, metric.request_size_bytes,
                    metric.response_size_bytes, metric.memory_usage_mb, metric.cpu_percent,
                    metric.database_queries, metric.cache_hits, metric.cache_misses,
                    metric.user_id, metric.ip_address, metric.user_agent,
                    metric.error_type, json.dumps(metric.business_metrics) if metric.business_metrics else None
                ))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error storing performance metric: {e}")
    
    def _check_performance_alerts(self, endpoint: str, metric: APIPerformanceMetric, custom_thresholds: Dict[str, float] = None):
        """Check if performance alerts should be triggered"""
        try:
            thresholds = custom_thresholds or {}
            
            # Response time alert
            response_time_threshold = thresholds.get('response_time_ms', 5000)  # 5 seconds default
            if metric.response_time_ms > response_time_threshold:
                self._trigger_performance_alert(
                    'response_time_high',
                    'HIGH' if metric.response_time_ms > response_time_threshold * 2 else 'MEDIUM',
                    response_time_threshold,
                    metric.response_time_ms,
                    endpoint,
                    f"Response time {metric.response_time_ms:.1f}ms exceeds threshold {response_time_threshold}ms"
                )
            
            # Memory usage alert
            memory_threshold = thresholds.get('memory_mb', 1000)  # 1GB default
            if metric.memory_usage_mb > memory_threshold:
                self._trigger_performance_alert(
                    'memory_high',
                    'HIGH' if metric.memory_usage_mb > memory_threshold * 1.5 else 'MEDIUM',
                    memory_threshold,
                    metric.memory_usage_mb,
                    endpoint,
                    f"Memory usage {metric.memory_usage_mb:.1f}MB exceeds threshold {memory_threshold}MB"
                )
            
            # Error rate alert (check recent error rate)
            if endpoint in self.endpoint_stats:
                recent_requests = list(self.recent_metrics)[-100:]  # Last 100 requests
                endpoint_requests = [m for m in recent_requests if m.endpoint == endpoint]
                
                if len(endpoint_requests) >= 10:  # Minimum sample size
                    error_count = sum(1 for m in endpoint_requests if m.status_code >= 400)
                    error_rate = (error_count / len(endpoint_requests)) * 100
                    error_rate_threshold = thresholds.get('error_rate_percent', 10)  # 10% default
                    
                    if error_rate > error_rate_threshold:
                        self._trigger_performance_alert(
                            'error_rate_high',
                            'HIGH' if error_rate > error_rate_threshold * 2 else 'MEDIUM',
                            error_rate_threshold,
                            error_rate,
                            endpoint,
                            f"Error rate {error_rate:.1f}% exceeds threshold {error_rate_threshold}%"
                        )
            
        except Exception as e:
            logger.error(f"Error checking performance alerts: {e}")
    
    def _trigger_performance_alert(self, alert_type: str, severity: str, threshold: float, current_value: float, endpoint: str, description: str):
        """Trigger a performance alert"""
        try:
            alert_id = f"{alert_type}_{endpoint}_{int(time.time())}"
            
            alert = PerformanceAlert(
                alert_id=alert_id,
                alert_type=alert_type,
                severity=severity,
                threshold_value=threshold,
                current_value=current_value,
                endpoint=endpoint,
                triggered_at=datetime.now(),
                description=description,
                suggested_actions=self._get_alert_suggestions(alert_type, current_value)
            )
            
            # Store in database
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO performance_alerts 
                    (alert_id, alert_type, severity, threshold_value, current_value,
                     endpoint, triggered_at, description, suggested_actions)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    alert.alert_id, alert.alert_type, alert.severity,
                    alert.threshold_value, alert.current_value, alert.endpoint,
                    alert.triggered_at.isoformat(), alert.description,
                    json.dumps(alert.suggested_actions)
                ))
                conn.commit()
            
            # Store in memory
            with self._lock:
                self.active_alerts[alert_id] = alert
            
            # Execute callbacks
            for callback in self.alert_callbacks:
                try:
                    callback(alert)
                except Exception as e:
                    logger.error(f"Alert callback error: {e}")
            
            logger.warning(f"🚨 Performance Alert: {alert.description}")
            
        except Exception as e:
            logger.error(f"Error triggering performance alert: {e}")
    
    def _setup_default_alerts(self):
        """Setup default performance alert rules"""
        default_rules = [
            ('response_time', 3000, None, 'MEDIUM'),  # 3 second response time
            ('memory_usage', 1500, None, 'HIGH'),     # 1.5GB memory usage
            ('error_rate', 5, None, 'HIGH'),          # 5% error rate
            ('cpu_usage', 80, None, 'MEDIUM')         # 80% CPU usage
        ]
        
        for alert_type, threshold, endpoint, severity in default_rules:
            self.create_performance_alert(alert_type, threshold, endpoint, severity)
    
    def _background_monitoring(self):
        """Background monitoring thread"""
        while self._monitoring_active:
            try:
                # System resource monitoring
                memory_percent = psutil.virtual_memory().percent
                cpu_percent = psutil.cpu_percent()
                
                # Check system-level alerts
                if memory_percent > 90:
                    self._trigger_performance_alert(
                        'system_memory_critical', 'CRITICAL', 90, memory_percent, 'system',
                        f"System memory usage {memory_percent:.1f}% is critically high"
                    )
                
                if cpu_percent > 90:
                    self._trigger_performance_alert(
                        'system_cpu_critical', 'CRITICAL', 90, cpu_percent, 'system',
                        f"System CPU usage {cpu_percent:.1f}% is critically high"
                    )
                
                # Sleep for monitoring interval
                time.sleep(30)
                
            except Exception as e:
                logger.error(f"Background monitoring error: {e}")
                time.sleep(60)  # Sleep longer on error
    
    def _get_memory_usage(self) -> float:
        """Get current memory usage in MB"""
        try:
            return self._process.memory_info().rss / 1024 / 1024
        except (psutil.NoSuchProcess, psutil.AccessDenied, AttributeError) as e:
            logger.debug(f"Memory usage check failed: {e}")
            return 0.0
    
    def _get_cpu_percent(self) -> float:
        """Get current CPU usage percentage"""
        try:
            return self._process.cpu_percent()
        except (psutil.NoSuchProcess, psutil.AccessDenied, AttributeError) as e:
            logger.debug(f"CPU usage check failed: {e}")
            return 0.0
    
    def _calculate_performance_score(self, overall_stats) -> int:
        """Calculate overall performance score (0-100)"""
        if not overall_stats or not overall_stats[1]:
            return 0
        
        score = 100
        avg_response_time = overall_stats[1]
        error_count = overall_stats[3]
        total_requests = overall_stats[0]
        
        # Deduct points for slow responses
        if avg_response_time > 1000:  # > 1 second
            score -= min(30, (avg_response_time - 1000) / 100)
        
        # Deduct points for errors
        if total_requests > 0:
            error_rate = (error_count / total_requests) * 100
            score -= error_rate * 2
        
        return max(0, int(score))
    
    def _get_performance_recommendations(self) -> List[str]:
        """Get performance optimization recommendations"""
        recommendations = []
        
        # Analyze recent metrics for recommendations
        if len(self.recent_metrics) > 100:
            recent = list(self.recent_metrics)[-100:]
            avg_response_time = statistics.mean(m.response_time_ms for m in recent)
            
            if avg_response_time > 2000:
                recommendations.append("Consider implementing response caching for slow endpoints")
            
            if avg_response_time > 5000:
                recommendations.append("Review database queries and optimize slow operations")
            
            high_memory_requests = [m for m in recent if m.memory_usage_mb > 500]
            if len(high_memory_requests) > 10:
                recommendations.append("Implement memory optimization for data-heavy endpoints")
            
            error_count = len([m for m in recent if m.status_code >= 400])
            if error_count > 5:
                recommendations.append("Review error handling and implement proper exception management")
        
        return recommendations
    
    def _extract_business_metrics(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract business metrics from response data"""
        business_metrics = {}
        
        # Extract common business metrics
        if 'metadata' in response_data:
            metadata = response_data['metadata']
            if 'record_count' in metadata:
                business_metrics['records_processed'] = metadata['record_count']
            if 'cache_hit' in metadata:
                business_metrics['cache_utilized'] = metadata['cache_hit']
        
        # Extract data size metrics
        if 'water_quality_data' in response_data:
            business_metrics['data_type'] = 'water_quality'
            if isinstance(response_data['water_quality_data'], list):
                business_metrics['records_returned'] = len(response_data['water_quality_data'])
        
        return business_metrics
    
    def _grade_endpoint_performance(self, stats, percentiles) -> str:
        """Grade endpoint performance A-F"""
        if not stats or not stats[1]:  # No avg response time
            return 'F'
        
        avg_response_time = stats[1]
        error_rate = (stats[4] / max(stats[0], 1)) * 100 if stats[0] > 0 else 0
        
        # Grade based on response time and error rate
        if avg_response_time < 500 and error_rate < 1:
            return 'A'
        elif avg_response_time < 1000 and error_rate < 2:
            return 'B'
        elif avg_response_time < 2000 and error_rate < 5:
            return 'C'
        elif avg_response_time < 5000 and error_rate < 10:
            return 'D'
        else:
            return 'F'
    
    def _get_endpoint_optimization_suggestions(self, endpoint: str, stats) -> List[str]:
        """Get optimization suggestions for specific endpoint"""
        suggestions = []
        
        if stats and stats[1]:  # Has avg response time
            avg_response_time = stats[1]
            error_rate = (stats[4] / max(stats[0], 1)) * 100 if stats[0] > 0 else 0
            
            if avg_response_time > 3000:
                suggestions.append("Implement aggressive caching strategy")
                suggestions.append("Consider database query optimization")
                suggestions.append("Implement response compression")
            
            if avg_response_time > 1000:
                suggestions.append("Add response caching")
                suggestions.append("Optimize data serialization")
            
            if error_rate > 5:
                suggestions.append("Improve error handling and validation")
                suggestions.append("Add request timeout handling")
            
            if stats[6] and stats[6] > 1024:  # Large avg response size
                suggestions.append("Implement response pagination")
                suggestions.append("Add data compression")
        
        return suggestions
    
    def _get_alert_suggestions(self, alert_type: str, current_value: float) -> List[str]:
        """Get suggestions for resolving performance alerts"""
        suggestions = {
            'response_time_high': [
                "Enable response caching",
                "Optimize database queries",
                "Implement request batching",
                "Add load balancing"
            ],
            'memory_high': [
                "Implement memory cleanup",
                "Optimize data structures",
                "Add memory monitoring",
                "Consider data streaming"
            ],
            'error_rate_high': [
                "Review error logs",
                "Improve input validation",
                "Add circuit breakers",
                "Implement retry logic"
            ]
        }
        
        return suggestions.get(alert_type, ["Review system performance", "Contact system administrator"])

# Global performance monitor
flask_performance_monitor = FlaskPerformanceMonitor()

# Convenience decorators and functions
def monitor_performance(**kwargs):
    """Decorator to monitor endpoint performance"""
    return flask_performance_monitor.performance_monitor(**kwargs)

def get_performance_dashboard(hours_back: int = 24) -> Dict[str, Any]:
    """Get performance dashboard data"""
    return flask_performance_monitor.get_performance_dashboard(hours_back)

def get_endpoint_analytics(endpoint: str, days_back: int = 7) -> Dict[str, Any]:
    """Get endpoint analytics"""
    return flask_performance_monitor.get_endpoint_analytics(endpoint, days_back)

def create_alert_rule(alert_type: str, threshold: float, **kwargs):
    """Create performance alert rule"""
    return flask_performance_monitor.create_performance_alert(alert_type, threshold, **kwargs)

def get_active_alerts() -> List[Dict[str, Any]]:
    """Get active performance alerts"""
    with flask_performance_monitor._lock:
        return [asdict(alert) for alert in flask_performance_monitor.active_alerts.values()]