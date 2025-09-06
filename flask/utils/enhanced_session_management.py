"""
Enhanced Session Management for Flask APIs
SQLite-backed session management with enterprise features
"""

import sqlite3
import threading
import time
import uuid
import json
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union
from contextlib import contextmanager
from functools import wraps
from flask import request, session, g, current_app
from werkzeug.security import generate_password_hash, check_password_hash
import logging

# Import existing session service
from services.session_service import SessionService

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

class FlaskEnhancedSessionManager:
    """
    Enhanced session management for Flask APIs with enterprise features
    """
    
    def __init__(self, 
                 db_path: str = "sessions.db",
                 session_timeout: int = 3600,
                 max_concurrent_sessions: int = 5,
                 enable_session_analytics: bool = True,
                 enable_security_features: bool = True):
        """
        Initialize enhanced session manager
        
        Args:
            db_path: SQLite database path
            session_timeout: Session timeout in seconds
            max_concurrent_sessions: Max concurrent sessions per user
            enable_session_analytics: Enable session analytics
            enable_security_features: Enable advanced security features
        """
        self.db_path = db_path
        self.session_timeout = session_timeout
        self.max_concurrent_sessions = max_concurrent_sessions
        self.enable_analytics = enable_session_analytics
        self.enable_security = enable_security_features
        
        # Initialize base session service
        self.base_session_service = SessionService(db_path)
        
        # Session tracking
        self._active_sessions = {}
        self._session_analytics = {}
        self._db_lock = threading.Lock()
        
        # Security features
        self._failed_attempts = {}
        self._blocked_ips = {}
        
        # Initialize enhanced database schema
        self._init_enhanced_schema()
        
        logger.info(f"Enhanced session manager initialized with {session_timeout}s timeout")
    
    def _init_enhanced_schema(self):
        """Initialize enhanced database schema for session management"""
        try:
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Enhanced sessions table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS enhanced_sessions (
                        session_id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        session_data TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        expires_at TIMESTAMP NOT NULL,
                        ip_address TEXT,
                        user_agent TEXT,
                        is_active BOOLEAN DEFAULT TRUE,
                        session_token_hash TEXT,
                        security_flags INTEGER DEFAULT 0,
                        device_fingerprint TEXT
                    )
                """)
                
                # Session analytics table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS session_analytics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        event_data TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        ip_address TEXT,
                        user_agent TEXT
                    )
                """)
                
                # Security events table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS security_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_type TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        ip_address TEXT,
                        user_id TEXT,
                        session_id TEXT,
                        event_data TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create indexes for performance
                cursor.executemany("""
                    CREATE INDEX IF NOT EXISTS {} ON {} ({})
                """, [
                    ("idx_enhanced_sessions_user_id", "enhanced_sessions", "user_id"),
                    ("idx_enhanced_sessions_expires_at", "enhanced_sessions", "expires_at"),
                    ("idx_enhanced_sessions_is_active", "enhanced_sessions", "is_active"),
                    ("idx_session_analytics_session_id", "session_analytics", "session_id"),
                    ("idx_session_analytics_timestamp", "session_analytics", "timestamp"),
                    ("idx_security_events_timestamp", "security_events", "timestamp"),
                    ("idx_security_events_ip", "security_events", "ip_address")
                ])
                
                conn.commit()
                logger.info("Enhanced session database schema initialized")
                
        except sqlite3.Error as e:
            logger.error(f"Error initializing enhanced session schema: {e}")
            raise
    
    @contextmanager
    def _get_db_connection(self):
        """Thread-safe database connection context manager"""
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
    
    def create_session(self, user_id: str, **metadata) -> Dict[str, Any]:
        """
        Create new enhanced session
        
        Args:
            user_id: User identifier
            **metadata: Additional session metadata
            
        Returns:
            Session information dictionary
        """
        try:
            # Security checks
            if self.enable_security:
                if not self._security_check_passed(user_id):
                    raise SecurityError("Session creation blocked due to security policy")
            
            # Check concurrent session limit
            active_sessions = self._get_user_active_sessions(user_id)
            if len(active_sessions) >= self.max_concurrent_sessions:
                # Terminate oldest session
                oldest_session = min(active_sessions, key=lambda s: s['last_activity'])
                self.terminate_session(oldest_session['session_id'], reason="concurrent_limit_exceeded")
                logger.info(f"Terminated oldest session for user {user_id} due to concurrent limit")
            
            # Generate secure session
            session_id = self._generate_secure_session_id()
            session_token = self._generate_session_token()
            session_token_hash = generate_password_hash(session_token)
            
            # Get request context
            ip_address = request.remote_addr if request else None
            user_agent = request.headers.get('User-Agent') if request else None
            device_fingerprint = self._generate_device_fingerprint(ip_address, user_agent)
            
            # Calculate expiration
            expires_at = datetime.now() + timedelta(seconds=self.session_timeout)
            
            # Session data
            session_data = {
                'user_id': user_id,
                'created_at': datetime.now().isoformat(),
                'metadata': metadata,
                'security_level': 'standard',
                'permissions': []
            }
            
            # Store in database
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO enhanced_sessions 
                    (session_id, user_id, session_data, expires_at, ip_address, 
                     user_agent, session_token_hash, device_fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id, user_id, json.dumps(session_data), expires_at.isoformat(),
                    ip_address, user_agent, session_token_hash, device_fingerprint
                ))
                conn.commit()
            
            # Track in memory
            self._active_sessions[session_id] = {
                'user_id': user_id,
                'created_at': datetime.now(),
                'last_activity': datetime.now(),
                'ip_address': ip_address
            }
            
            # Log analytics event
            if self.enable_analytics:
                self._log_session_event(session_id, 'session_created', {
                    'user_id': user_id,
                    'ip_address': ip_address,
                    'user_agent': user_agent
                })
            
            logger.info(f"✅ Session created for user {user_id}: {session_id}")
            
            return {
                'session_id': session_id,
                'session_token': session_token,
                'expires_at': expires_at.isoformat(),
                'created_at': datetime.now().isoformat(),
                'user_id': user_id,
                'security_features': self.enable_security,
                'analytics_enabled': self.enable_analytics
            }
            
        except Exception as e:
            logger.error(f"Error creating session for user {user_id}: {e}")
            raise
    
    def validate_session(self, session_id: str, session_token: str = None) -> Dict[str, Any]:
        """
        Validate and refresh session
        
        Args:
            session_id: Session identifier
            session_token: Session token for security validation
            
        Returns:
            Session validation result
        """
        try:
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT session_id, user_id, session_data, expires_at, 
                           session_token_hash, device_fingerprint, security_flags
                    FROM enhanced_sessions 
                    WHERE session_id = ? AND is_active = TRUE
                """, (session_id,))
                
                row = cursor.fetchone()
                
                if not row:
                    return {'valid': False, 'reason': 'session_not_found'}
                
                session_data_raw, expires_at_str, token_hash = row[2], row[3], row[4]
                device_fingerprint, security_flags = row[5], row[6]
                
                # Check expiration
                expires_at = datetime.fromisoformat(expires_at_str)
                if datetime.now() > expires_at:
                    self.terminate_session(session_id, reason="expired")
                    return {'valid': False, 'reason': 'session_expired'}
                
                # Validate session token if provided
                if session_token and token_hash:
                    if not check_password_hash(token_hash, session_token):
                        self._log_security_event('invalid_token', 'HIGH', session_id=session_id)
                        return {'valid': False, 'reason': 'invalid_token'}
                
                # Security checks
                if self.enable_security:
                    current_fingerprint = self._generate_device_fingerprint(
                        request.remote_addr if request else None,
                        request.headers.get('User-Agent') if request else None
                    )
                    
                    if device_fingerprint != current_fingerprint:
                        self._log_security_event('device_mismatch', 'HIGH', session_id=session_id)
                        logger.warning(f"Device fingerprint mismatch for session {session_id}")
                        # Don't fail immediately, but log for monitoring
                
                # Update last activity
                cursor.execute("""
                    UPDATE enhanced_sessions 
                    SET last_activity = CURRENT_TIMESTAMP 
                    WHERE session_id = ?
                """, (session_id,))
                conn.commit()
                
                # Parse session data
                session_data = json.loads(session_data_raw)
                user_id = row[1]
                
                # Update memory tracking
                if session_id in self._active_sessions:
                    self._active_sessions[session_id]['last_activity'] = datetime.now()
                
                # Log analytics
                if self.enable_analytics:
                    self._log_session_event(session_id, 'session_validated', {
                        'user_id': user_id
                    })
                
                logger.debug(f"✅ Session validated: {session_id}")
                
                return {
                    'valid': True,
                    'session_id': session_id,
                    'user_id': user_id,
                    'session_data': session_data,
                    'expires_at': expires_at_str,
                    'security_flags': security_flags
                }
                
        except Exception as e:
            logger.error(f"Error validating session {session_id}: {e}")
            return {'valid': False, 'reason': 'validation_error', 'error': str(e)}
    
    def terminate_session(self, session_id: str, reason: str = "manual") -> bool:
        """
        Terminate session
        
        Args:
            session_id: Session to terminate
            reason: Termination reason
            
        Returns:
            True if session was terminated
        """
        try:
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Get session info before termination
                cursor.execute("""
                    SELECT user_id FROM enhanced_sessions 
                    WHERE session_id = ? AND is_active = TRUE
                """, (session_id,))
                
                row = cursor.fetchone()
                if not row:
                    return False
                
                user_id = row[0]
                
                # Terminate session
                cursor.execute("""
                    UPDATE enhanced_sessions 
                    SET is_active = FALSE 
                    WHERE session_id = ?
                """, (session_id,))
                
                conn.commit()
                
                # Remove from memory tracking
                self._active_sessions.pop(session_id, None)
                
                # Log analytics
                if self.enable_analytics:
                    self._log_session_event(session_id, 'session_terminated', {
                        'user_id': user_id,
                        'reason': reason
                    })
                
                logger.info(f"🔚 Session terminated: {session_id} (reason: {reason})")
                return True
                
        except Exception as e:
            logger.error(f"Error terminating session {session_id}: {e}")
            return False
    
    def get_session_analytics(self, user_id: str = None, 
                             session_id: str = None, 
                             hours_back: int = 24) -> Dict[str, Any]:
        """
        Get session analytics data
        
        Args:
            user_id: Filter by user ID
            session_id: Filter by session ID  
            hours_back: Hours of history to retrieve
            
        Returns:
            Analytics data
        """
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours_back)
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Build query conditions
                conditions = ["timestamp >= ?"]
                params = [cutoff_time.isoformat()]
                
                if user_id:
                    conditions.append("session_id IN (SELECT session_id FROM enhanced_sessions WHERE user_id = ?)")
                    params.append(user_id)
                
                if session_id:
                    conditions.append("session_id = ?")
                    params.append(session_id)
                
                where_clause = " AND ".join(conditions)
                
                # Get analytics events
                cursor.execute(f"""
                    SELECT event_type, COUNT(*) as count, 
                           MIN(timestamp) as first_event, MAX(timestamp) as last_event
                    FROM session_analytics 
                    WHERE {where_clause}
                    GROUP BY event_type
                    ORDER BY count DESC
                """, params)
                
                event_summary = []
                for row in cursor.fetchall():
                    event_summary.append({
                        'event_type': row[0],
                        'count': row[1],
                        'first_event': row[2],
                        'last_event': row[3]
                    })
                
                # Get active sessions count
                cursor.execute("""
                    SELECT COUNT(*) FROM enhanced_sessions 
                    WHERE is_active = TRUE AND expires_at > CURRENT_TIMESTAMP
                """)
                active_sessions_count = cursor.fetchone()[0]
                
                # Get user session stats
                cursor.execute(f"""
                    SELECT s.user_id, COUNT(*) as session_count,
                           MAX(s.last_activity) as last_activity,
                           MIN(s.created_at) as first_session
                    FROM enhanced_sessions s
                    WHERE s.created_at >= ? AND s.is_active = TRUE
                    GROUP BY s.user_id
                    ORDER BY session_count DESC
                    LIMIT 10
                """, [cutoff_time.isoformat()])
                
                user_stats = []
                for row in cursor.fetchall():
                    user_stats.append({
                        'user_id': row[0],
                        'session_count': row[1],
                        'last_activity': row[2],
                        'first_session': row[3]
                    })
                
                return {
                    'analytics_period_hours': hours_back,
                    'active_sessions_count': active_sessions_count,
                    'event_summary': event_summary,
                    'top_users': user_stats,
                    'memory_tracked_sessions': len(self._active_sessions),
                    'generated_at': datetime.now().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Error getting session analytics: {e}")
            return {'error': str(e)}
    
    def cleanup_expired_sessions(self) -> Dict[str, int]:
        """
        Clean up expired sessions and return cleanup statistics
        
        Returns:
            Cleanup statistics
        """
        try:
            current_time = datetime.now()
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Count expired sessions
                cursor.execute("""
                    SELECT COUNT(*) FROM enhanced_sessions 
                    WHERE expires_at < ? AND is_active = TRUE
                """, (current_time.isoformat(),))
                
                expired_count = cursor.fetchone()[0]
                
                # Mark expired sessions as inactive
                cursor.execute("""
                    UPDATE enhanced_sessions 
                    SET is_active = FALSE 
                    WHERE expires_at < ? AND is_active = TRUE
                """, (current_time.isoformat(),))
                
                # Clean up old analytics data (older than 30 days)
                cleanup_cutoff = current_time - timedelta(days=30)
                cursor.execute("""
                    DELETE FROM session_analytics 
                    WHERE timestamp < ?
                """, (cleanup_cutoff.isoformat(),))
                
                analytics_cleaned = cursor.changes
                
                # Clean up old security events (older than 90 days)
                security_cutoff = current_time - timedelta(days=90)
                cursor.execute("""
                    DELETE FROM security_events 
                    WHERE timestamp < ?
                """, (security_cutoff.isoformat(),))
                
                security_events_cleaned = cursor.changes
                
                conn.commit()
                
                # Clean up memory tracking
                expired_sessions = []
                for session_id, info in list(self._active_sessions.items()):
                    if (current_time - info['last_activity']).seconds > self.session_timeout:
                        expired_sessions.append(session_id)
                
                for session_id in expired_sessions:
                    del self._active_sessions[session_id]
                
                cleanup_stats = {
                    'expired_sessions_deactivated': expired_count,
                    'analytics_records_cleaned': analytics_cleaned,
                    'security_events_cleaned': security_events_cleaned,
                    'memory_sessions_cleaned': len(expired_sessions),
                    'cleanup_timestamp': current_time.isoformat()
                }
                
                logger.info(f"🧹 Session cleanup completed: {cleanup_stats}")
                return cleanup_stats
                
        except Exception as e:
            logger.error(f"Error during session cleanup: {e}")
            return {'error': str(e)}
    
    def get_security_events(self, hours_back: int = 24, 
                          severity: str = None) -> List[Dict[str, Any]]:
        """
        Get security events
        
        Args:
            hours_back: Hours of history to retrieve
            severity: Filter by severity level
            
        Returns:
            List of security events
        """
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours_back)
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                
                query = """
                    SELECT event_type, severity, ip_address, user_id, 
                           session_id, event_data, timestamp
                    FROM security_events 
                    WHERE timestamp >= ?
                """
                params = [cutoff_time.isoformat()]
                
                if severity:
                    query += " AND severity = ?"
                    params.append(severity)
                
                query += " ORDER BY timestamp DESC LIMIT 1000"
                
                cursor.execute(query, params)
                
                events = []
                for row in cursor.fetchall():
                    events.append({
                        'event_type': row[0],
                        'severity': row[1],
                        'ip_address': row[2],
                        'user_id': row[3],
                        'session_id': row[4],
                        'event_data': json.loads(row[5]) if row[5] else {},
                        'timestamp': row[6]
                    })
                
                return events
                
        except Exception as e:
            logger.error(f"Error getting security events: {e}")
            return []
    
    def _get_user_active_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """Get active sessions for a user"""
        try:
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT session_id, last_activity, created_at, ip_address
                    FROM enhanced_sessions 
                    WHERE user_id = ? AND is_active = TRUE 
                    AND expires_at > CURRENT_TIMESTAMP
                    ORDER BY last_activity DESC
                """, (user_id,))
                
                sessions = []
                for row in cursor.fetchall():
                    sessions.append({
                        'session_id': row[0],
                        'last_activity': row[1],
                        'created_at': row[2],
                        'ip_address': row[3]
                    })
                
                return sessions
                
        except Exception as e:
            logger.error(f"Error getting user active sessions: {e}")
            return []
    
    def _generate_secure_session_id(self) -> str:
        """Generate cryptographically secure session ID"""
        return secrets.token_urlsafe(32)
    
    def _generate_session_token(self) -> str:
        """Generate session token for additional security"""
        return secrets.token_urlsafe(24)
    
    def _generate_device_fingerprint(self, ip_address: str, user_agent: str) -> str:
        """Generate device fingerprint for security tracking"""
        if not ip_address or not user_agent:
            return "unknown"
        
        fingerprint_data = f"{ip_address}:{user_agent}"
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:16]
    
    def _security_check_passed(self, user_id: str) -> bool:
        """Perform security checks before session creation"""
        ip_address = request.remote_addr if request else "unknown"
        
        # Check if IP is blocked
        if ip_address in self._blocked_ips:
            block_info = self._blocked_ips[ip_address]
            if datetime.now() < block_info['blocked_until']:
                return False
            else:
                # Unblock expired blocks
                del self._blocked_ips[ip_address]
        
        # Check failed attempts
        attempt_key = f"{user_id}:{ip_address}"
        if attempt_key in self._failed_attempts:
            attempts = self._failed_attempts[attempt_key]
            if attempts['count'] >= 5 and datetime.now() < attempts['blocked_until']:
                return False
        
        return True
    
    def _log_session_event(self, session_id: str, event_type: str, event_data: Dict[str, Any]):
        """Log session analytics event"""
        if not self.enable_analytics:
            return
        
        try:
            ip_address = request.remote_addr if request else None
            user_agent = request.headers.get('User-Agent') if request else None
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO session_analytics 
                    (session_id, event_type, event_data, ip_address, user_agent)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    session_id, event_type, json.dumps(event_data),
                    ip_address, user_agent
                ))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error logging session event: {e}")
    
    def _log_security_event(self, event_type: str, severity: str, **kwargs):
        """Log security event"""
        try:
            ip_address = request.remote_addr if request else None
            event_data = {k: v for k, v in kwargs.items() if k != 'session_id'}
            
            with self._get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO security_events 
                    (event_type, severity, ip_address, user_id, session_id, event_data)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    event_type, severity, ip_address,
                    kwargs.get('user_id'), kwargs.get('session_id'),
                    json.dumps(event_data)
                ))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Error logging security event: {e}")

# Custom exceptions
class SecurityError(Exception):
    """Raised when security checks fail"""
    pass

# Flask integration decorators
def require_session(f):
    """Decorator to require valid session for endpoint access"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session_id = session.get('session_id') or request.headers.get('X-Session-ID')
        session_token = request.headers.get('X-Session-Token')
        
        if not session_id:
            return {'error': 'Session required', 'code': 'NO_SESSION'}, 401
        
        validation_result = enhanced_session_manager.validate_session(session_id, session_token)
        
        if not validation_result.get('valid'):
            return {
                'error': 'Invalid session', 
                'code': 'INVALID_SESSION',
                'reason': validation_result.get('reason')
            }, 401
        
        # Store session info in g for use in endpoint
        g.session_info = validation_result
        g.user_id = validation_result['user_id']
        
        return f(*args, **kwargs)
    
    return decorated_function

# Global enhanced session manager
enhanced_session_manager = FlaskEnhancedSessionManager()

# Convenience functions
def create_user_session(user_id: str, **metadata) -> Dict[str, Any]:
    """Create new user session"""
    return enhanced_session_manager.create_session(user_id, **metadata)

def validate_user_session(session_id: str, session_token: str = None) -> Dict[str, Any]:
    """Validate user session"""
    return enhanced_session_manager.validate_session(session_id, session_token)

def terminate_user_session(session_id: str, reason: str = "manual") -> bool:
    """Terminate user session"""
    return enhanced_session_manager.terminate_session(session_id, reason)

def get_session_analytics(user_id: str = None, hours_back: int = 24) -> Dict[str, Any]:
    """Get session analytics"""
    return enhanced_session_manager.get_session_analytics(user_id, hours_back=hours_back)

def cleanup_sessions() -> Dict[str, int]:
    """Clean up expired sessions"""
    return enhanced_session_manager.cleanup_expired_sessions()

def get_security_events(hours_back: int = 24, severity: str = None) -> List[Dict[str, Any]]:
    """Get security events"""
    return enhanced_session_manager.get_security_events(hours_back, severity)