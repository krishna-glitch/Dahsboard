#!/usr/bin/env python3
"""
Debug Flask app by testing a single endpoint
"""

import requests
import json
import subprocess
import sys
import time
import threading
from app import create_app

def test_single_endpoint():
    """Test a single endpoint to see detailed errors"""
    
    app = create_app()
    
    # Run in test mode
    with app.test_client() as client:
        print("🧪 Testing /api/v1/auth/status endpoint...")
        
        try:
            response = client.get('/api/v1/auth/status')
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.get_data(as_text=True)}")
            
            if response.status_code == 500:
                print("❌ 500 Internal Server Error - checking logs...")
                
        except Exception as e:
            print(f"Exception: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_single_endpoint()