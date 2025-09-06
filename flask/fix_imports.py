#!/usr/bin/env python3
"""
Fix all import paths in API files
"""

import os
import re

def fix_imports_in_file(filepath):
    """Fix import paths in a single file"""
    
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        # Replace migration.flask.utils imports
        content = re.sub(
            r'from migration\.flask\.utils\.advanced_performance_integration import enterprise_performance',
            'from utils.advanced_performance_integration_simple import enterprise_performance',
            content
        )
        
        content = re.sub(
            r'from migration\.flask\.utils\.errors import APIError',
            'from utils.errors import APIError',
            content
        )
        
        content = re.sub(
            r'from migration\.flask\.utils\.decorators import role_required',
            'from utils.decorators import role_required',
            content
        )
        
        # Write back
        with open(filepath, 'w') as f:
            f.write(content)
            
        print(f"✅ Fixed imports in {filepath}")
        
    except Exception as e:
        print(f"❌ Error fixing {filepath}: {e}")

def main():
    """Fix imports in all API files"""
    
    api_dir = 'api'
    
    for filename in os.listdir(api_dir):
        if filename.endswith('.py'):
            filepath = os.path.join(api_dir, filename)
            fix_imports_in_file(filepath)

if __name__ == "__main__":
    main()