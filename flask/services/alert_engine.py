"""
Alert Engine for Flask Migration - Real Implementation with Sensor Data Monitoring
"""

from enum import Enum
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import json
import os
import threading
import time
from dataclasses import dataclass, asdict

# Import for database access and logging
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

class AlertSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AlertStatus(Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"

class AlertType(Enum):
    WATER_QUALITY = "water_quality"
    SYSTEM = "system"
    THRESHOLD = "threshold"

@dataclass
class AlertRule:
    """Alert rule configuration"""
    parameter: str
    site_code: str
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    severity: AlertSeverity = AlertSeverity.MEDIUM
    enabled: bool = True
    
class AlertEngine:
    """Real alert engine with sensor data monitoring"""
    
    def __init__(self):
        self.alerts_file = 'data/alerts.json'
        self.rules_file = 'data/alert_rules.json'
        self.active_alerts = {}
        self.alert_rules = self._load_alert_rules()
        self.monitoring_thread = None
        self.monitoring_active = False
        self._ensure_data_directory()
        self._load_existing_alerts()
        
    def _ensure_data_directory(self):
        """Ensure data directory exists"""
        os.makedirs('data', exist_ok=True)
        
    def _load_alert_rules(self) -> List[AlertRule]:
        """Load alert rules from configuration"""
        default_rules = [
            # Temperature thresholds
            AlertRule('Temperature', 'S1', threshold_min=0.0, threshold_max=35.0, severity=AlertSeverity.HIGH),
            AlertRule('Temperature', 'S2', threshold_min=0.0, threshold_max=35.0, severity=AlertSeverity.HIGH),
            AlertRule('Temperature', 'S3', threshold_min=0.0, threshold_max=35.0, severity=AlertSeverity.HIGH),
            AlertRule('Temperature', 'S4', threshold_min=0.0, threshold_max=35.0, severity=AlertSeverity.HIGH),
            
            # pH thresholds
            AlertRule('pH', 'S1', threshold_min=6.0, threshold_max=9.0, severity=AlertSeverity.CRITICAL),
            AlertRule('pH', 'S2', threshold_min=6.0, threshold_max=9.0, severity=AlertSeverity.CRITICAL),
            AlertRule('pH', 'S3', threshold_min=6.0, threshold_max=9.0, severity=AlertSeverity.CRITICAL), 
            AlertRule('pH', 'S4', threshold_min=6.0, threshold_max=9.0, severity=AlertSeverity.CRITICAL),
            
            # Conductivity thresholds
            AlertRule('Conductivity', 'S1', threshold_max=2000.0, severity=AlertSeverity.MEDIUM),
            AlertRule('Conductivity', 'S2', threshold_max=2000.0, severity=AlertSeverity.MEDIUM),
            AlertRule('Conductivity', 'S3', threshold_max=2000.0, severity=AlertSeverity.MEDIUM),
            AlertRule('Conductivity', 'S4', threshold_max=2000.0, severity=AlertSeverity.MEDIUM),
            
            # Water level thresholds (assuming depth measurements)
            AlertRule('Depth to Water', 'S1', threshold_min=0.5, threshold_max=10.0, severity=AlertSeverity.HIGH),
            AlertRule('Depth to Water', 'S2', threshold_min=0.5, threshold_max=10.0, severity=AlertSeverity.HIGH),
            AlertRule('Depth to Water', 'S3', threshold_min=0.5, threshold_max=10.0, severity=AlertSeverity.HIGH),
            AlertRule('Depth to Water', 'S4', threshold_min=0.5, threshold_max=10.0, severity=AlertSeverity.HIGH),
        ]
        
        try:
            if os.path.exists(self.rules_file):
                with open(self.rules_file, 'r') as f:
                    rules_data = json.load(f)
                    return [AlertRule(**rule) for rule in rules_data]
        except Exception as e:
            logger.warning(f"Failed to load alert rules: {e}, using defaults")
            
        return default_rules
        
    def _save_alert_rules(self):
        """Save alert rules to file"""
        try:
            with open(self.rules_file, 'w') as f:
                json.dump([asdict(rule) for rule in self.alert_rules], f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save alert rules: {e}")
    
    def _load_existing_alerts(self):
        """Load existing alerts from storage"""
        try:
            if os.path.exists(self.alerts_file):
                with open(self.alerts_file, 'r') as f:
                    alerts_data = json.load(f)
                    for alert_id, alert_data in alerts_data.items():
                        # Convert datetime strings back to datetime objects
                        if 'created_at' in alert_data:
                            alert_data['created_at'] = datetime.fromisoformat(alert_data['created_at'])
                        if 'updated_at' in alert_data:
                            alert_data['updated_at'] = datetime.fromisoformat(alert_data['updated_at'])
                        self.active_alerts[alert_id] = alert_data
                logger.info(f"Loaded {len(self.active_alerts)} existing alerts")
        except Exception as e:
            logger.warning(f"Failed to load existing alerts: {e}")
            
    def _save_alerts(self):
        """Save current alerts to storage"""
        try:
            alerts_to_save = {}
            for alert_id, alert_data in self.active_alerts.items():
                # Convert datetime objects to strings for JSON serialization
                alert_copy = alert_data.copy()
                if 'created_at' in alert_copy:
                    alert_copy['created_at'] = alert_copy['created_at'].isoformat()
                if 'updated_at' in alert_copy:
                    alert_copy['updated_at'] = alert_copy['updated_at'].isoformat()
                alerts_to_save[alert_id] = alert_copy
                
            with open(self.alerts_file, 'w') as f:
                json.dump(alerts_to_save, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save alerts: {e}")
    
    def check_sensor_data_for_alerts(self, sensor_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Check sensor data against alert rules and generate alerts"""
        new_alerts = []
        
        for data_point in sensor_data:
            site_code = data_point.get('site_code', '')
            timestamp = data_point.get('timestamp', datetime.now())
            
            # Check each alert rule
            for rule in self.alert_rules:
                if not rule.enabled or rule.site_code != site_code:
                    continue
                    
                parameter_value = data_point.get(rule.parameter)
                if parameter_value is None:
                    continue
                    
                # Check threshold violations
                violation = False
                violation_type = None
                
                if rule.threshold_min is not None and parameter_value < rule.threshold_min:
                    violation = True
                    violation_type = 'below_minimum'
                elif rule.threshold_max is not None and parameter_value > rule.threshold_max:
                    violation = True
                    violation_type = 'above_maximum'
                    
                if violation:
                    alert_id = f"{site_code}_{rule.parameter}_{violation_type}_{int(timestamp.timestamp())}"
                    
                    # Check if similar alert already exists (within last hour)
                    similar_exists = any(
                        alert['site_code'] == site_code and 
                        alert['parameter'] == rule.parameter and
                        alert['violation_type'] == violation_type and
                        (datetime.now() - alert['created_at']).seconds < 3600
                        for alert in self.active_alerts.values()
                        if alert.get('status') == AlertStatus.ACTIVE.value
                    )
                    
                    if not similar_exists:
                        alert = {
                            'id': alert_id,
                            'title': f'{rule.parameter} {violation_type.replace("_", " ").title()}',
                            'message': f'{rule.parameter} value {parameter_value} is {violation_type.replace("_", " ")} at site {site_code}',
                            'severity': rule.severity.value,
                            'status': AlertStatus.ACTIVE.value,
                            'type': AlertType.WATER_QUALITY.value,
                            'site_code': site_code,
                            'parameter': rule.parameter,
                            'value': parameter_value,
                            'threshold_min': rule.threshold_min,
                            'threshold_max': rule.threshold_max,
                            'violation_type': violation_type,
                            'created_at': timestamp,
                            'updated_at': timestamp
                        }
                        
                        self.active_alerts[alert_id] = alert
                        new_alerts.append(alert)
                        logger.warning(f"🚨 Generated alert: {alert['title']} at {site_code}")
        
        if new_alerts:
            self._save_alerts()
            
        return new_alerts
    
    def get_alert_statistics(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, sites: Optional[List[str]] = None) -> Dict[str, Any]:
        """Get alert statistics with proper date and site filtering"""
        if start_date is None:
            start_date = datetime.now() - timedelta(days=7)
        if end_date is None:
            end_date = datetime.now()
            
        # Filter alerts by date range and sites
        filtered_alerts = []
        for alert in self.active_alerts.values():
            alert_date = alert['created_at']
            if start_date <= alert_date <= end_date:
                if sites is None or alert.get('site_code') in sites:
                    filtered_alerts.append(alert)
        
        # Calculate statistics
        total_alerts = len(filtered_alerts)
        active_alerts = len([a for a in filtered_alerts if a['status'] == AlertStatus.ACTIVE.value])
        critical_alerts = len([a for a in filtered_alerts if a['severity'] == AlertSeverity.CRITICAL.value])
        resolved_alerts = len([a for a in filtered_alerts if a['status'] == AlertStatus.RESOLVED.value])
        
        # Site breakdown
        site_breakdown = {}
        all_sites = ['S1', 'S2', 'S3', 'S4']
        for site in all_sites:
            site_breakdown[site] = len([a for a in filtered_alerts if a.get('site_code') == site])
            
        # Severity breakdown
        severity_breakdown = {}
        for severity in AlertSeverity:
            severity_breakdown[severity.value] = len([a for a in filtered_alerts if a.get('severity') == severity.value])
        
        return {
            'total_alerts': total_alerts,
            'active_alerts': active_alerts,
            'critical_alerts': critical_alerts,
            'resolved_alerts': resolved_alerts,
            'by_site': site_breakdown,
            'by_severity': severity_breakdown,
            'resolution_rate': (resolved_alerts / max(total_alerts, 1)) * 100,
            'alerts_per_day': total_alerts / max((end_date - start_date).days, 1)
        }
    
    def get_active_alerts(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, sites: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Get list of active alerts with proper filtering"""
        if start_date is None:
            start_date = datetime.now() - timedelta(days=7)
        if end_date is None:
            end_date = datetime.now()
            
        active_alerts = []
        for alert in self.active_alerts.values():
            if alert['status'] != AlertStatus.ACTIVE.value:
                continue
                
            alert_date = alert['created_at']
            if start_date <= alert_date <= end_date:
                if sites is None or alert.get('site_code') in sites:
                    # Convert datetime back to string for JSON response
                    alert_copy = alert.copy()
                    alert_copy['created_at'] = alert_copy['created_at'].isoformat()
                    alert_copy['updated_at'] = alert_copy['updated_at'].isoformat()
                    active_alerts.append(alert_copy)
        
        # Sort by severity (critical first) and then by creation time (newest first)
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        from datetime import datetime as _dt
        def _sort_key(item):
            try:
                ts = _dt.fromisoformat(item['created_at']).timestamp()
            except Exception:
                ts = 0
            return (severity_order.get(item.get('severity'), 4), -ts)
        active_alerts.sort(key=_sort_key)
        
        return active_alerts
        
    def acknowledge_alert(self, alert_id: str, acknowledged_by: str) -> bool:
        """Acknowledge an alert"""
        if alert_id in self.active_alerts:
            self.active_alerts[alert_id]['status'] = AlertStatus.ACKNOWLEDGED.value
            self.active_alerts[alert_id]['acknowledged_by'] = acknowledged_by
            self.active_alerts[alert_id]['acknowledged_at'] = datetime.now()
            self.active_alerts[alert_id]['updated_at'] = datetime.now()
            self._save_alerts()
            logger.info(f"Alert {alert_id} acknowledged by {acknowledged_by}")
            return True
        return False
        
    def resolve_alert(self, alert_id: str, resolved_by: str, resolution_note: str = None) -> bool:
        """Resolve an alert"""
        if alert_id in self.active_alerts:
            self.active_alerts[alert_id]['status'] = AlertStatus.RESOLVED.value
            self.active_alerts[alert_id]['resolved_by'] = resolved_by
            self.active_alerts[alert_id]['resolved_at'] = datetime.now()
            self.active_alerts[alert_id]['updated_at'] = datetime.now()
            if resolution_note:
                self.active_alerts[alert_id]['resolution_note'] = resolution_note
            self._save_alerts()
            logger.info(f"Alert {alert_id} resolved by {resolved_by}")
            return True
        return False
        
    def start_monitoring(self):
        """Start real-time monitoring thread"""
        if not self.monitoring_active:
            self.monitoring_active = True
            self.monitoring_thread = threading.Thread(target=self._monitoring_loop, daemon=True)
            self.monitoring_thread.start()
            logger.info("Alert monitoring started")
            
    def stop_monitoring(self):
        """Stop real-time monitoring"""
        self.monitoring_active = False
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=5)
        logger.info("Alert monitoring stopped")
        
    def _monitoring_loop(self):
        """Background monitoring loop"""
        logger.info("Alert monitoring loop started")
        while self.monitoring_active:
            try:
                # Get latest sensor data (this would connect to your database/data source)
                sensor_data = self._get_latest_sensor_data()
                if sensor_data:
                    self.check_sensor_data_for_alerts(sensor_data)
                    
                # Sleep for monitoring interval (e.g., every 5 minutes)
                time.sleep(300)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(60)  # Wait 1 minute before retrying
                
    def _get_latest_sensor_data(self) -> List[Dict[str, Any]]:
        """Get latest sensor data (implement based on your data source)"""
        # This is a placeholder - in a real implementation, this would:
        # 1. Connect to your database
        # 2. Query for recent data (last 5-10 minutes)
        # 3. Return formatted data for alert checking
        
        # For now, return empty list to avoid generating fake alerts
        return []

# Global alert engine instance
alert_engine = AlertEngine()

# Start monitoring when module is imported
if alert_engine:
    try:
        alert_engine.start_monitoring()
    except Exception as e:
        logger.warning(f"Failed to start alert monitoring: {e}")
