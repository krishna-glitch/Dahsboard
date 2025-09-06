"""
Authentication Service for Flask Migration
"""

import hashlib
from typing import Tuple, Dict, Any, Optional
from .user_management import user_manager

class AuthService:
    """Simple authentication service"""
    
    def __init__(self):
        self.current_user = None
    
    def _hash_password(self, password: str) -> str:
        """Hash password for comparison"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def authenticate_user(self, username: str, password: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """Authenticate user credentials"""
        user = user_manager.get_user_by_username(username)
        
        if not user:
            return False, None
        
        if not user['is_active']:
            return False, None
        
        hashed_password = self._hash_password(password)
        if user['password'] != hashed_password:
            return False, None
        
        # Remove sensitive information from user info
        user_info = {
            'username': user['username'],
            'full_name': user['full_name'],
            'email': user['email'],
            'role': user['role'],
            'sites_access': user['sites_access']
        }
        
        self.current_user = user_info
        return True, user_info
    
    def logout_user(self):
        """Logout current user"""
        self.current_user = None