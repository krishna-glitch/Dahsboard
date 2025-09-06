"""
User Management Service for Flask Migration
"""

from typing import Dict, List, Optional, Any
import hashlib
from datetime import datetime
import json
import os

class UserManager:
    """Simple user management for testing"""
    
    def __init__(self):
        # Persist users to disk so Flask restarts don't drop users
        base_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = os.path.join(base_dir, '_data')
        os.makedirs(data_dir, exist_ok=True)
        self._store_path = os.path.join(data_dir, 'users.json')
        self.users: Dict[str, Dict[str, Any]] = {}
        self._load_from_disk()
        if not self.users:
            # Seed default users on first run
            self.users = {
                'admin': {
                    'username': 'admin',
                    'password': self._hash_password('admin123'),
                    'full_name': 'Administrator',
                    'email': 'admin@test.com',
                    'role': 'admin',
                    'is_active': True,
                    'sites_access': ['S1', 'S2', 'S3'],
                    'last_login': datetime.now().isoformat()
                },
                'test_user': {
                    'username': 'test_user',
                    'password': self._hash_password('test123'),
                    'full_name': 'Test User',
                    'email': 'test@test.com',
                    'role': 'user',
                    'is_active': True,
                    'sites_access': ['S1'],
                    'last_login': datetime.now().isoformat()
                }
            }
            self._save_to_disk()

    def _load_from_disk(self):
        try:
            if os.path.exists(self._store_path):
                with open(self._store_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                # Normalize timestamp fields to ISO strings
                for u, rec in (data or {}).items():
                    if isinstance(rec.get('last_login'), datetime):
                        rec['last_login'] = rec['last_login'].isoformat()
                self.users = data or {}
        except Exception:
            # Corrupt file: start fresh but do not crash
            self.users = {}

    def _save_to_disk(self):
        try:
            tmp = {}
            for k, v in self.users.items():
                rec = dict(v)
                if isinstance(rec.get('last_login'), datetime):
                    rec['last_login'] = rec['last_login'].isoformat()
                tmp[k] = rec
            with open(self._store_path, 'w', encoding='utf-8') as f:
                json.dump(tmp, f, ensure_ascii=False, indent=2)
        except Exception:
            # Avoid crashing on disk errors
            pass
    
    def _hash_password(self, password: str) -> str:
        """Simple password hashing for testing"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get user by username"""
        return self.users.get(username)
    
    def get_user_list(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get list of users"""
        users = list(self.users.values())
        if not include_inactive:
            users = [u for u in users if u['is_active']]
        return users
    
    def create_user(self, username: str, password: str, full_name: str, 
                   email: str, role: str, sites_access: Optional[List[str]] = None) -> str:
        """Create a new user"""
        user_id = username
        self.users[username] = {
            'username': username,
            'password': self._hash_password(password),
            'full_name': full_name,
            'email': email,
            'role': role,
            'is_active': True,
            'sites_access': sites_access or [],
            'last_login': None
        }
        self._save_to_disk()
        return user_id
    
    def update_user(self, username: str, **kwargs) -> bool:
        """Update user details"""
        if username not in self.users:
            return False
        
        for key, value in kwargs.items():
            if key == 'password':
                value = self._hash_password(value)
            self.users[username][key] = value
        self._save_to_disk()
        return True
    
    def toggle_user_status(self, username: str) -> bool:
        """Toggle user active status"""
        if username not in self.users:
            return False
        self.users[username]['is_active'] = not self.users[username]['is_active']
        self._save_to_disk()
        return True
    
    def get_session_statistics(self) -> Dict[str, Any]:
        """Get session statistics"""
        return {
            'active_sessions': 2,
            'total_sessions_today': 5,
            'average_session_duration_minutes': 45
        }
    
    def get_user_activity_log(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get user activity log"""
        return [
            {
                'username': 'admin',
                'action': 'login',
                'timestamp': datetime.now(),
                'ip_address': '127.0.0.1'
            },
            {
                'username': 'test_user',
                'action': 'data_access',
                'timestamp': datetime.now(),
                'ip_address': '127.0.0.1'
            }
        ]

# Global user manager instance
user_manager = UserManager()
