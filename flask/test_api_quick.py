#!/usr/bin/env python3
"""
Quick API Health Check - Tests basic functionality of all Flask endpoints
Can run without authentication to verify server startup and basic routing
"""

import requests
import time
import json
from datetime import datetime

class QuickAPITester:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
        self.results = []
    
    def test_endpoint_health(self, endpoint, method="GET"):
        """Test if endpoint responds (regardless of auth)"""
        try:
            start_time = time.time()
            url = f"{self.base_url}{endpoint}"
            
            if method == "GET":
                response = requests.get(url, timeout=10)
            else:
                response = requests.post(url, json={}, timeout=10)
            
            response_time = (time.time() - start_time) * 1000
            
            # Consider any response (even 401/403) as "healthy" - means endpoint exists
            is_healthy = response.status_code in [200, 201, 401, 403, 422]
            
            result = {
                'endpoint': endpoint,
                'method': method,
                'status_code': response.status_code,
                'response_time_ms': round(response_time, 2),
                'healthy': is_healthy,
                'status': '✅ HEALTHY' if is_healthy else '❌ UNHEALTHY'
            }
            
            self.results.append(result)
            print(f"{result['status']} {method} {endpoint} - {response.status_code} ({response_time:.1f}ms)")
            return result
            
        except requests.exceptions.RequestException as e:
            result = {
                'endpoint': endpoint,
                'method': method,
                'error': str(e),
                'healthy': False,
                'status': '❌ ERROR'
            }
            self.results.append(result)
            print(f"❌ ERROR {method} {endpoint} - {e}")
            return result
    
    def run_health_check(self):
        """Test all API endpoints for basic health"""
        
        print("🚀 Quick API Health Check")
        print("=" * 50)
        
        # Test all major endpoints
        endpoints = [
            # Core data endpoints (require auth but should return 401, not 500)
            ('/api/v1/water_quality/data', 'GET'),
            ('/api/v1/redox_analysis/data', 'GET'),
            ('/api/v1/site_comparison/data', 'GET'),
            ('/api/v1/alerts/data', 'GET'),
            ('/api/v1/home/data', 'GET'),
            
            # Admin endpoints
            ('/api/v1/admin/users', 'GET'),
            ('/api/v1/admin/summary', 'GET'),
            
            # Reports endpoints (NEW - you added more features!)
            ('/api/v1/reports/history', 'GET'),
            ('/api/v1/reports/templates', 'GET'),
            ('/api/v1/reports/scheduled', 'GET'),
            ('/api/v1/reports/generate', 'POST'),
            
            # Performance monitoring (should work without auth)
            ('/api/v1/performance/summary', 'GET'),  # Original performance endpoint
            ('/api/v1/performance_status/comprehensive-status', 'GET'),  # Enhanced version
            ('/api/v1/performance_status/feature-test', 'POST'),
            ('/api/v1/performance_status/optimization-recommendations', 'GET'),
            
            # System health and diagnostics
            ('/api/v1/system_health/summary', 'GET'),
            ('/api/v1/system_health/services', 'GET'),
            ('/api/v1/system_health/imports', 'GET'),
            ('/api/v1/system_health/recommendations', 'GET'),
            ('/api/v1/data_diagnostics/run', 'GET'),
            ('/api/v1/data_diagnostics/summary', 'GET'),
            
            # Correlation analysis
            ('/api/v1/correlation/matrix', 'POST'),
            ('/api/v1/correlation/significant', 'POST'),
            ('/api/v1/correlation/patterns', 'POST'),
            
            # Configuration
            ('/api/v1/config', 'GET'),  # If it exists
            
            # Auth endpoints (don't require auth to test)
            ('/api/v1/auth/status', 'GET'),
            ('/api/v1/auth/login', 'POST'),
            
            # Upload endpoints
            ('/api/v1/upload/history', 'GET'),
            ('/api/v1/upload/file', 'POST'),
        ]
        
        start_time = time.time()
        
        for endpoint, method in endpoints:
            self.test_endpoint_health(endpoint, method)
        
        total_time = time.time() - start_time
        
        # Generate summary
        healthy = len([r for r in self.results if r['healthy']])
        total = len(self.results)
        health_percentage = (healthy / total * 100) if total > 0 else 0
        avg_response_time = sum(r.get('response_time_ms', 0) for r in self.results) / total if total > 0 else 0
        
        print("\n" + "=" * 50)
        print("📊 HEALTH CHECK SUMMARY")
        print("=" * 50)
        print(f"✅ Healthy Endpoints: {healthy}/{total} ({health_percentage:.1f}%)")
        print(f"⚡ Average Response Time: {avg_response_time:.1f}ms")
        print(f"⏱️  Total Check Duration: {total_time:.1f}s")
        
        if health_percentage >= 90:
            print("\n🎉 API SERVER IS HEALTHY - Ready for comprehensive testing!")
        elif health_percentage >= 70:
            print("\n⚠️  API SERVER HAS MINOR ISSUES - Some endpoints need attention")
        else:
            print("\n❌ API SERVER HAS MAJOR ISSUES - Needs debugging before testing")
        
        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"api_health_check_{timestamp}.json"
        
        with open(report_file, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'health_percentage': health_percentage,
                'total_endpoints': total,
                'healthy_endpoints': healthy,
                'average_response_time_ms': avg_response_time,
                'results': self.results
            }, f, indent=2)
        
        print(f"📄 Health check report saved: {report_file}")
        
        return health_percentage >= 70

def main():
    """Run quick API health check"""
    tester = QuickAPITester()
    is_healthy = tester.run_health_check()
    
    if is_healthy:
        print(f"\n🎯 NEXT STEPS:")
        print(f"1. Run: python test_comprehensive_api.py (with authentication)")
        print(f"2. Fix any failing endpoints")
        print(f"3. Begin React frontend development")
    else:
        print(f"\n🔧 REQUIRED ACTIONS:")
        print(f"1. Debug failing endpoints")
        print(f"2. Check Flask server logs")
        print(f"3. Verify all dependencies are installed")
    
    return is_healthy

if __name__ == "__main__":
    main()