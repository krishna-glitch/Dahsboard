"""
Global Search API Blueprint
Provides cross-application search functionality for sites, parameters, alerts, and data
"""

from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from services.core_data_service import core_data_service
from utils.errors import APIError
from utils.advanced_performance_integration_simple import enterprise_performance
from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

search_bp = Blueprint('search_bp', __name__)

class GlobalSearchService:
    """
    Service for performing global search across all application data
    """
    
    def __init__(self):
        self.search_categories = {
            'sites': self._search_sites,
            'parameters': self._search_parameters,
            'alerts': self._search_alerts,
            'reports': self._search_reports,
            'measurements': self._search_measurements
        }
    
    def perform_global_search(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """
        Perform a global search across all data types
        
        Args:
            query: Search query string
            limit: Maximum number of results to return
            
        Returns:
            Dictionary containing search results and metadata
        """
        if not query or len(query.strip()) < 2:
            return {
                'results': [],
                'total_count': 0,
                'query': query,
                'search_time_ms': 0
            }
        
        start_time = datetime.now()
        all_results = []
        search_stats = {}
        
        # Search across all categories
        for category, search_func in self.search_categories.items():
            try:
                category_results = search_func(query, limit=max(5, limit // len(self.search_categories)))
                all_results.extend(category_results)
                search_stats[category] = len(category_results)
                
            except Exception as e:
                logger.error(f"Error searching {category}: {e}")
                search_stats[category] = 0
        
        # Sort results by relevance score
        all_results = sorted(all_results, key=lambda x: x.get('relevance_score', 0), reverse=True)
        
        # Limit final results
        final_results = all_results[:limit]
        
        search_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return {
            'results': final_results,
            'total_count': len(all_results),
            'returned_count': len(final_results),
            'query': query,
            'search_time_ms': round(search_time, 2),
            'category_stats': search_stats
        }
    
    def _search_sites(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search monitoring sites"""
        results = []
        
        # Define site information (this would typically come from a database)
        sites_info = {
            'S1': {'name': 'Site S1', 'location': 'Primary monitoring location', 'status': 'Active'},
            'S2': {'name': 'Site S2', 'location': 'Secondary monitoring location', 'status': 'Active'},
            'S3': {'name': 'Site S3', 'location': 'Tertiary monitoring location', 'status': 'Active'},
            'S4': {'name': 'Site S4', 'location': 'Quaternary monitoring location', 'status': 'Active'}
        }
        
        query_lower = query.lower()
        
        for site_id, site_info in sites_info.items():
            # Check if query matches site ID or name
            if (query_lower in site_id.lower() or 
                query_lower in site_info['name'].lower() or
                query_lower in site_info['location'].lower()):
                
                relevance_score = 100
                if query_lower == site_id.lower():
                    relevance_score = 150  # Exact match gets higher score
                elif query_lower in site_info['name'].lower():
                    relevance_score = 120
                
                results.append({
                    'type': 'site',
                    'id': site_id,
                    'title': site_info['name'],
                    'name': site_info['name'],
                    'location': site_info['location'],
                    'status': site_info['status'],
                    'relevance_score': relevance_score
                })
        
        return results[:limit]
    
    def _search_parameters(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search water quality parameters"""
        results = []
        
        # Define parameter information
        parameters_info = {
            'temperature': {'name': 'Temperature', 'unit': '°C', 'description': 'Water temperature measurement'},
            'conductivity': {'name': 'Conductivity', 'unit': 'µS/cm', 'description': 'Electrical conductivity of water'},
            'water_level': {'name': 'Water Level', 'unit': 'm', 'description': 'Water level measurement'},
            'ph': {'name': 'pH', 'unit': 'pH units', 'description': 'Water acidity/alkalinity'},
            'dissolved_oxygen': {'name': 'Dissolved Oxygen', 'unit': 'mg/L', 'description': 'Amount of oxygen dissolved in water'},
            'redox_potential': {'name': 'Redox Potential', 'unit': 'mV', 'description': 'Oxidation-reduction potential'}
        }
        
        query_lower = query.lower()
        
        for param_id, param_info in parameters_info.items():
            # Check if query matches parameter
            if (query_lower in param_id.lower() or 
                query_lower in param_info['name'].lower() or
                query_lower in param_info['description'].lower()):
                
                relevance_score = 80
                if query_lower == param_id.lower() or query_lower == param_info['name'].lower():
                    relevance_score = 120  # Exact match
                
                results.append({
                    'type': 'parameter',
                    'id': param_id,
                    'title': param_info['name'],
                    'name': param_info['name'],
                    'unit': param_info['unit'],
                    'description': param_info['description'],
                    'relevance_score': relevance_score
                })
        
        return results[:limit]
    
    def _search_alerts(self, query: str, limit: int = 3) -> List[Dict[str, Any]]:
        """Search alerts (placeholder implementation)"""
        results = []
        
        # Mock alert data - this would come from alerts database
        mock_alerts = [
            {
                'id': 'alert_001',
                'title': 'High Temperature Alert',
                'description': 'Temperature exceeded threshold at Site S1',
                'severity': 'High',
                'status': 'Active',
                'site': 'S1',
                'timestamp': datetime.now() - timedelta(hours=2)
            },
            {
                'id': 'alert_002',
                'title': 'Low Conductivity Warning',
                'description': 'Conductivity below normal range at Site S2',
                'severity': 'Medium',
                'status': 'Resolved',
                'site': 'S2',
                'timestamp': datetime.now() - timedelta(days=1)
            }
        ]
        
        query_lower = query.lower()
        
        for alert in mock_alerts:
            if (query_lower in alert['title'].lower() or
                query_lower in alert['description'].lower() or
                query_lower in alert['site'].lower()):
                
                relevance_score = 90
                if alert['status'] == 'Active':
                    relevance_score += 20  # Active alerts more relevant
                
                results.append({
                    'type': 'alert',
                    'id': alert['id'],
                    'title': alert['title'],
                    'description': alert['description'],
                    'severity': alert['severity'],
                    'status': alert['status'],
                    'site': alert['site'],
                    'timestamp': alert['timestamp'].isoformat(),
                    'relevance_score': relevance_score
                })
        
        return results[:limit]
    
    def _search_reports(self, query: str, limit: int = 3) -> List[Dict[str, Any]]:
        """Search reports (placeholder implementation)"""
        results = []
        
        # Mock report data
        mock_reports = [
            {
                'id': 'report_001',
                'title': 'Monthly Water Quality Summary',
                'description': 'Comprehensive analysis of water quality parameters',
                'type': 'Summary Report',
                'generated_date': datetime.now() - timedelta(days=5)
            },
            {
                'id': 'report_002',  
                'title': 'Site Comparison Analysis',
                'description': 'Comparative analysis across monitoring sites',
                'type': 'Analysis Report',
                'generated_date': datetime.now() - timedelta(days=10)
            }
        ]
        
        query_lower = query.lower()
        
        for report in mock_reports:
            if (query_lower in report['title'].lower() or
                query_lower in report['description'].lower() or
                query_lower in report['type'].lower()):
                
                results.append({
                    'type': 'report',
                    'id': report['id'],
                    'title': report['title'],
                    'description': report['description'],
                    'report_type': report['type'],
                    'date': report['generated_date'].isoformat(),
                    'relevance_score': 70
                })
        
        return results[:limit]
    
    def _search_measurements(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search recent measurements"""
        results = []
        
        try:
            # This would search actual measurement data
            # For now, return mock recent measurements that match query
            if any(term in query.lower() for term in ['temperature', 'conductivity', 'level', 'measurement', 'data']):
                
                # Mock recent measurements
                mock_measurements = [
                    {
                        'site_id': 'S1',
                        'site_name': 'Site S1',
                        'parameter': 'Temperature',
                        'value': '22.5',
                        'unit': '°C',
                        'timestamp': datetime.now() - timedelta(hours=1),
                        'quality': 'Good'
                    },
                    {
                        'site_id': 'S2',
                        'site_name': 'Site S2', 
                        'parameter': 'Conductivity',
                        'value': '1250',
                        'unit': 'µS/cm',
                        'timestamp': datetime.now() - timedelta(hours=2),
                        'quality': 'Good'
                    }
                ]
                
                for measurement in mock_measurements:
                    if query.lower() in measurement['parameter'].lower():
                        results.append({
                            'type': 'measurement',
                            'id': f"{measurement['site_id']}_{measurement['parameter']}_{int(measurement['timestamp'].timestamp())}",
                            'title': f"{measurement['parameter']} at {measurement['site_name']}",
                            'site_id': measurement['site_id'],
                            'site_name': measurement['site_name'],
                            'parameter': measurement['parameter'],
                            'value': measurement['value'],
                            'unit': measurement['unit'],
                            'date': measurement['timestamp'].isoformat(),
                            'quality': measurement['quality'],
                            'relevance_score': 60
                        })
        
        except Exception as e:
            logger.error(f"Error searching measurements: {e}")
        
        return results[:limit]


# Initialize global search service
search_service = GlobalSearchService()

@search_bp.route('/global', methods=['GET'])
@login_required
@enterprise_performance(data_type='global_search')
def global_search():
    """
    Global search endpoint
    
    Query Parameters:
        - q: Search query string (required, min 2 characters)
        - limit: Maximum number of results (default: 10, max: 50)
        
    Returns:
        JSON response with search results and metadata
    """
    try:
        # Get query parameters
        query = request.args.get('q', '').strip()
        limit = min(int(request.args.get('limit', 10)), 50)  # Cap at 50 results
        
        logger.info(f"Global search request: query='{query}', limit={limit}")
        
        # Validate query
        if not query:
            return jsonify({
                'error': 'Query parameter "q" is required',
                'results': [],
                'total_count': 0
            }), 400
        
        if len(query) < 2:
            return jsonify({
                'error': 'Query must be at least 2 characters long',
                'results': [],
                'total_count': 0
            }), 400
        
        # Perform search
        search_results = search_service.perform_global_search(query, limit)
        
        # Add metadata
        response_data = {
            **search_results,
            'metadata': {
                'success': True,
                'timestamp': datetime.now().isoformat(),
                'api_version': 'v1',
                'search_endpoint': 'global'
            }
        }
        
        logger.info(f"Global search completed: {search_results['returned_count']} results in {search_results['search_time_ms']}ms")
        
        return jsonify(response_data), 200
        
    except ValueError as e:
        logger.error(f"Invalid parameter in search request: {e}")
        return jsonify({
            'error': 'Invalid request parameters',
            'details': str(e),
            'results': []
        }), 400
        
    except Exception as e:
        logger.error(f"Error in global search: {e}", exc_info=True)
        return jsonify({
            'error': 'Search failed',
            'details': 'An error occurred while performing the search',
            'results': []
        }), 500


@search_bp.route('/suggestions', methods=['GET'])
@login_required  
@enterprise_performance(data_type='search_suggestions')
def get_search_suggestions():
    """
    Get search suggestions for autocomplete
    
    Query Parameters:
        - q: Partial query string (required, min 1 character)
        - type: Filter by result type (optional)
        - limit: Maximum suggestions (default: 5, max: 10)
        
    Returns:
        JSON response with search suggestions
    """
    try:
        query = request.args.get('q', '').strip()
        result_type = request.args.get('type', '')
        limit = min(int(request.args.get('limit', 5)), 10)
        
        if not query:
            return jsonify({'suggestions': []}), 200
        
        # Generate suggestions based on common search terms
        suggestions = []
        common_terms = [
            'temperature', 'conductivity', 'water level', 'ph', 'dissolved oxygen',
            'site s1', 'site s2', 'site s3', 'site s4',
            'alert', 'report', 'measurement', 'analysis',
            'high temperature', 'low conductivity', 'water quality'
        ]
        
        query_lower = query.lower()
        for term in common_terms:
            if query_lower in term and term.startswith(query_lower):
                suggestions.append({
                    'text': term,
                    'type': 'suggestion',
                    'category': 'common'
                })
                
                if len(suggestions) >= limit:
                    break
        
        return jsonify({
            'suggestions': suggestions,
            'query': query,
            'count': len(suggestions)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting search suggestions: {e}")
        return jsonify({'suggestions': []}), 200