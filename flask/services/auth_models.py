"""
Centralized Authentication Models for Flask Application
Provides consistent User class definition across the application
"""

from flask_login import UserMixin

class User(UserMixin):
    """
    Centralized User class for Flask-Login authentication
    Used consistently across login endpoints and user_loader
    """
    
    def __init__(self, username):
        """Initialize user with username"""
        self.id = username
        self.username = username
    
    def get_id(self):
        """Required by Flask-Login - return user identifier"""
        return str(self.id)
    
    def __repr__(self):
        """String representation for debugging"""
        return f"<User {self.username}>"