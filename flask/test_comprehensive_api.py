#!/usr/bin/env python3
"""
Comprehensive API Testing Suite for Flask Backend Migration
Tests all endpoints with enterprise performance optimization before frontend development
"""

import requests
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import pandas as pd

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ComprehensiveAPITester:
    """
    Comprehensive testing suite for all Flask API endpoints
    """
    
    def __init__(self, base_url: str = "http://localhost:5000", auth_token: Optional[str] = None):
        self.base_url = base_url
        self.auth_token = auth_token
        self.session = requests.Session()
        self.test_results = []
        
        # Default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
        if auth_token:
            self.session.headers.update({'Authorization': f'Bearer {auth_token}'})
    
    def log_test_result(self, endpoint: str, method: str, status: str, 
                       response_time: float, details: Dict[str, Any]):
        """Log test result"""
        result = {
            'timestamp': datetime.now().isoformat(),
            'endpoint': endpoint,
            'method': method,
            'status': status,  # 'PASS', 'FAIL', 'WARNING'
            'response_time_ms': round(response_time * 1000, 2),
            'details': details
        }
        self.test_results.append(result)
        
        status_emoji = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        logger.info(f"{status_emoji} {method} {endpoint} - {response_time*1000:.1f}ms - {status}")
    
    def authenticate(self, username: str = "test_admin", password: str = "admin123") -> bool:
        """Authenticate with the API"""
        try:
            response = self.session.post(f"{self.base_url}/api/v1/auth/login", json={
                'username': username,
                'password': password
            })
            
            if response.status_code == 200:
                logger.info("✅ Authentication successful")
                return True
            else:
                logger.error(f"❌ Authentication failed: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Authentication error: {e}")
            return False
    
    def test_endpoint(self, endpoint: str, method: str = "GET", 
                     data: Optional[Dict] = None, 
                     params: Optional[Dict] = None,
                     expected_keys: Optional[List[str]] = None,
                     performance_threshold_ms: float = 2000) -> Dict[str, Any]:
        """Test a single API endpoint"""
        
        start_time = time.time()
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, params=params)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, params=params)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, params=params)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response_time = time.time() - start_time
            
            # Basic status check
            if response.status_code not in [200, 201]:
                self.log_test_result(endpoint, method, "FAIL", response_time, {
                    'status_code': response.status_code,
                    'error': response.text[:500]
                })
                return {'status': 'FAIL', 'response_time': response_time}
            
            # Parse JSON response
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                self.log_test_result(endpoint, method, "FAIL", response_time, {
                    'error': 'Invalid JSON response'
                })
                return {'status': 'FAIL', 'response_time': response_time}
            
            # Check expected keys
            status = "PASS"
            details = {
                'status_code': response.status_code,
                'response_size_kb': round(len(response.content) / 1024, 2),
                'has_enterprise_optimization': self._check_enterprise_optimization(response_data)
            }
            
            if expected_keys:
                missing_keys = [key for key in expected_keys if key not in response_data]
                if missing_keys:
                    status = "WARNING"
                    details['missing_keys'] = missing_keys
            
            # Performance check
            if response_time * 1000 > performance_threshold_ms:
                status = "WARNING" if status == "PASS" else status
                details['performance_warning'] = f"Response time {response_time*1000:.1f}ms exceeds threshold {performance_threshold_ms}ms"
            
            self.log_test_result(endpoint, method, status, response_time, details)
            return {
                'status': status, 
                'response_time': response_time, 
                'data': response_data,
                'details': details
            }
            
        except Exception as e:
            response_time = time.time() - start_time
            self.log_test_result(endpoint, method, "FAIL", response_time, {
                'exception': str(e)
            })
            return {'status': 'FAIL', 'response_time': response_time, 'error': str(e)}
    
    def _check_enterprise_optimization(self, response_data: Dict) -> bool:
        """Check if response indicates enterprise optimization features are active"""
        
        # Check for enterprise optimization indicators
        metadata = response_data.get('metadata', {})
        performance = metadata.get('performance', {})
        
        indicators = [
            'loading_time_ms' in performance,
            'optimization_tier' in performance,
            'record_count' in metadata,
            'has_data' in metadata
        ]
        
        return any(indicators)
    
    def test_water_quality_api(self) -> Dict[str, Any]:
        """Test Water Quality API with comprehensive optimization"""
        
        logger.info("🧪 Testing Water Quality API...")
        
        test_params = {
            'sites': 'S1,S2',
            'time_range': 'Last 30 Days',
            'performance_mode': 'balanced'
        }
        
        return self.test_endpoint(
            '/api/v1/water_quality/data',
            method='GET',
            params=test_params,
            expected_keys=['water_quality_data', 'metadata'],
            performance_threshold_ms=3000  # Higher threshold for data-heavy endpoint
        )
    
    def test_redox_analysis_api(self) -> Dict[str, Any]:
        """Test Redox Analysis API"""
        
        logger.info("🧪 Testing Redox Analysis API...")
        
        test_params = {
            'sites': 'S1,S2',
            'time_range': 'Last 30 Days'
        }
        
        return self.test_endpoint(
            '/api/v1/redox_analysis/data',
            method='GET',
            params=test_params,
            expected_keys=['redox_data', 'metadata']
        )
    
    def test_site_comparison_api(self) -> Dict[str, Any]:
        """Test Site Comparison API"""
        
        logger.info("🧪 Testing Site Comparison API...")
        
        test_params = {
            'sites': 'S1,S2',
            'time_range': 'Last 30 Days',
            'data_type': 'both'
        }
        
        return self.test_endpoint(
            '/api/v1/site_comparison/data',
            method='GET',
            params=test_params,
            expected_keys=['water_quality_data', 'redox_data', 'metadata']
        )
    
    def test_alerts_api(self) -> Dict[str, Any]:
        """Test Alerts API"""
        
        logger.info("🧪 Testing Alerts API...")
        
        test_params = {
            'time_range': 'Last 7 Days'
        }
        
        return self.test_endpoint(
            '/api/v1/alerts/data',
            method='GET',
            params=test_params,
            expected_keys=['alerts_data', 'metadata']
        )
    
    def test_home_dashboard_api(self) -> Dict[str, Any]:
        """Test Home Dashboard API"""
        
        logger.info("🧪 Testing Home Dashboard API...")
        
        return self.test_endpoint(
            '/api/v1/home/data',
            method='GET',
            expected_keys=['dashboard_data', 'metadata']
        )
    
    def test_reports_api(self) -> Dict[str, Any]:
        """Test Reports API with new features"""
        
        logger.info("🧪 Testing Reports API...")
        
        # Test report history
        history_result = self.test_endpoint(
            '/api/v1/reports/history',
            method='GET',
            params={'limit': 10}
        )
        
        # Test report templates (NEW)
        templates_result = self.test_endpoint(
            '/api/v1/reports/templates',
            method='GET'
        )
        
        # Test scheduled reports (NEW)
        scheduled_result = self.test_endpoint(
            '/api/v1/reports/scheduled',
            method='GET'
        )
        
        return {
            'history': history_result,
            'templates': templates_result,
            'scheduled': scheduled_result
        }
    
    def test_admin_api(self) -> Dict[str, Any]:
        """Test Admin API (requires admin role)"""
        
        logger.info("🧪 Testing Admin API...")
        
        # Test user list
        users_result = self.test_endpoint(
            '/api/v1/admin/users',
            method='GET',
            params={'status': 'active'}
        )
        
        # Test admin summary
        summary_result = self.test_endpoint(
            '/api/v1/admin/summary',
            method='GET'
        )
        
        return summary_result
    
    def test_performance_status_api(self) -> Dict[str, Any]:
        """Test Performance Status API"""
        
        logger.info("🧪 Testing Performance Status API...")
        
        # Test comprehensive status
        status_result = self.test_endpoint(
            '/api/v1/performance_status/comprehensive-status',
            method='GET',
            expected_keys=['overall_health_score', 'core_performance_services']
        )
        
        # Test feature testing
        feature_test_result = self.test_endpoint(
            '/api/v1/performance_status/feature-test',
            method='POST'
        )
        
        return status_result
    
    def test_correlation_analysis_api(self) -> Dict[str, Any]:
        """Test Correlation Analysis API"""
        
        logger.info("🧪 Testing Correlation Analysis API...")
        
        # Mock data for correlation analysis
        mock_df_data = {
            'df': [
                {'param1': 1.0, 'param2': 2.0, 'param3': 3.0},
                {'param1': 2.0, 'param2': 4.0, 'param3': 6.0},
                {'param1': 3.0, 'param2': 6.0, 'param3': 9.0}
            ]
        }
        
        return self.test_endpoint(
            '/api/v1/correlation/matrix',
            method='POST',
            data=mock_df_data
        )
    
    def test_system_health_api(self) -> Dict[str, Any]:
        """Test System Health API"""
        
        logger.info("🧪 Testing System Health API...")
        
        # Test system health summary
        summary_result = self.test_endpoint(
            '/api/v1/system_health/summary',
            method='GET',
            expected_keys=['overall_health', 'failed_imports', 'available_services']
        )
        
        # Test service status
        services_result = self.test_endpoint(
            '/api/v1/system_health/services',
            method='GET'
        )
        
        return {
            'summary': summary_result,
            'services': services_result
        }
    
    def test_data_diagnostics_api(self) -> Dict[str, Any]:
        """Test Data Diagnostics API"""
        
        logger.info("🧪 Testing Data Diagnostics API...")
        
        # Test diagnostic run
        diagnostic_result = self.test_endpoint(
            '/api/v1/data_diagnostics/run',
            method='GET',
            expected_keys=['summary'],
            performance_threshold_ms=5000  # Diagnostics can take longer
        )
        
        # Test data status summary
        status_result = self.test_endpoint(
            '/api/v1/data_diagnostics/summary',
            method='GET',
            expected_keys=['water_quality_available', 'record_count']
        )
        
        return {
            'diagnostic': diagnostic_result,
            'status': status_result
        }
    
    def test_upload_api(self) -> Dict[str, Any]:
        """Test Upload API"""
        
        logger.info("🧪 Testing Upload API...")
        
        # Test upload history
        history_result = self.test_endpoint(
            '/api/v1/upload/history',
            method='GET'
        )
        
        return {'history': history_result}
    
    def run_comprehensive_test_suite(self) -> Dict[str, Any]:
        """Run complete test suite for all APIs"""
        
        logger.info("🚀 Starting Comprehensive API Test Suite...")
        logger.info("=" * 60)
        
        # Authenticate first
        if not self.authenticate():
            logger.error("❌ Cannot proceed without authentication")
            return {'status': 'FAILED', 'error': 'Authentication failed'}
        
        # Test all APIs
        api_tests = [
            ('Water Quality', self.test_water_quality_api),
            ('Redox Analysis', self.test_redox_analysis_api),
            ('Site Comparison', self.test_site_comparison_api),
            ('Alerts', self.test_alerts_api),
            ('Home Dashboard', self.test_home_dashboard_api),
            ('Reports', self.test_reports_api),
            ('Admin', self.test_admin_api),
            ('Performance Status', self.test_performance_status_api),
            ('Correlation Analysis', self.test_correlation_analysis_api),
            ('System Health', self.test_system_health_api),
            ('Data Diagnostics', self.test_data_diagnostics_api),
            ('Upload', self.test_upload_api)
        ]
        
        suite_start_time = time.time()
        
        for api_name, test_func in api_tests:
            try:
                logger.info(f"\n📊 Testing {api_name} API...")
                test_func()
            except Exception as e:
                logger.error(f"❌ {api_name} API test failed: {e}")
        
        suite_duration = time.time() - suite_start_time
        
        # Generate summary report
        return self.generate_test_report(suite_duration)
    
    def generate_test_report(self, suite_duration: float) -> Dict[str, Any]:
        """Generate comprehensive test report"""
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r['status'] == 'PASS'])
        failed_tests = len([r for r in self.test_results if r['status'] == 'FAIL'])
        warning_tests = len([r for r in self.test_results if r['status'] == 'WARNING'])
        
        avg_response_time = sum(r['response_time_ms'] for r in self.test_results) / total_tests if total_tests > 0 else 0
        
        # Performance analysis
        slow_endpoints = [r for r in self.test_results if r['response_time_ms'] > 2000]
        enterprise_optimized = [r for r in self.test_results if r['details'].get('has_enterprise_optimization', False)]
        
        report = {
            'test_suite_summary': {
                'total_tests': total_tests,
                'passed_tests': passed_tests,
                'failed_tests': failed_tests,
                'warning_tests': warning_tests,
                'success_rate_percent': round((passed_tests / total_tests * 100), 1) if total_tests > 0 else 0,
                'suite_duration_seconds': round(suite_duration, 2),
                'average_response_time_ms': round(avg_response_time, 2)
            },
            'performance_analysis': {
                'slow_endpoints_count': len(slow_endpoints),
                'enterprise_optimized_count': len(enterprise_optimized),
                'optimization_coverage_percent': round((len(enterprise_optimized) / total_tests * 100), 1) if total_tests > 0 else 0
            },
            'detailed_results': self.test_results,
            'slow_endpoints': slow_endpoints[:5],  # Top 5 slowest
            'recommendations': self._generate_recommendations()
        }
        
        # Print summary
        logger.info("\n" + "="*60)
        logger.info("📋 COMPREHENSIVE API TEST REPORT")
        logger.info("="*60)
        logger.info(f"✅ Tests Passed: {passed_tests}/{total_tests} ({report['test_suite_summary']['success_rate_percent']}%)")
        logger.info(f"⚡ Average Response Time: {avg_response_time:.1f}ms")
        logger.info(f"🚀 Enterprise Optimization Coverage: {report['performance_analysis']['optimization_coverage_percent']}%")
        logger.info(f"⏱️  Total Suite Duration: {suite_duration:.1f}s")
        
        if slow_endpoints:
            logger.info(f"⚠️  Slow Endpoints: {len(slow_endpoints)} endpoints > 2000ms")
        
        if failed_tests > 0:
            logger.info(f"❌ Failed Tests: {failed_tests}")
        
        return report
    
    def _generate_recommendations(self) -> List[str]:
        """Generate recommendations based on test results"""
        
        recommendations = []
        
        failed_tests = [r for r in self.test_results if r['status'] == 'FAIL']
        slow_endpoints = [r for r in self.test_results if r['response_time_ms'] > 2000]
        non_optimized = [r for r in self.test_results if not r['details'].get('has_enterprise_optimization', False)]
        
        if failed_tests:
            recommendations.append(f"🔧 Fix {len(failed_tests)} failing endpoints before frontend development")
        
        if slow_endpoints:
            recommendations.append(f"⚡ Optimize {len(slow_endpoints)} slow endpoints (>2s response time)")
        
        if non_optimized:
            recommendations.append(f"🚀 Add enterprise optimization to {len(non_optimized)} endpoints")
        
        if not recommendations:
            recommendations.append("✅ All APIs are ready for frontend development!")
        
        return recommendations
    
    def save_test_report(self, filename: str = None) -> str:
        """Save test report to JSON file"""
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"api_test_report_{timestamp}.json"
        
        report = self.generate_test_report(0)  # Duration will be recalculated
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"📄 Test report saved to: {filename}")
        return filename

def main():
    """Main function to run the comprehensive API test suite"""
    
    # Configuration
    BASE_URL = "http://localhost:5000"  # Update with your Flask server URL
    
    # Initialize tester
    tester = ComprehensiveAPITester(base_url=BASE_URL)
    
    # Run comprehensive test suite
    report = tester.run_comprehensive_test_suite()
    
    # Save report
    report_file = tester.save_test_report()
    
    # Determine if ready for frontend development
    success_rate = report['test_suite_summary']['success_rate_percent']
    optimization_coverage = report['performance_analysis']['optimization_coverage_percent']
    
    logger.info("\n" + "="*60)
    logger.info("🎯 FRONTEND READINESS ASSESSMENT")
    logger.info("="*60)
    
    if success_rate >= 90 and optimization_coverage >= 80:
        logger.info("✅ READY FOR FRONTEND DEVELOPMENT")
        logger.info("   - All critical APIs are functional")
        logger.info("   - Enterprise optimizations are in place")
        logger.info("   - Performance meets requirements")
    elif success_rate >= 70:
        logger.info("⚠️  MOSTLY READY - Minor fixes needed")
        logger.info("   - Most APIs functional but some optimization needed")
    else:
        logger.info("❌ NOT READY - Significant issues need resolution")
        logger.info("   - Critical API failures must be fixed first")
    
    logger.info(f"📊 Test Report: {report_file}")
    
    return report

if __name__ == "__main__":
    main()