from flask import Blueprint, jsonify, request
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging
import numpy as np
import pandas as pd
from typing import Optional, List, Dict

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Import enhanced correlation service
from services.enhanced_correlation_service import enhanced_correlation_service, CorrelationConfig

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

correlation_analysis_bp = Blueprint('correlation_analysis_bp', __name__)


# Legacy functions removed - replaced by enhanced_correlation_service
# All correlation analysis functionality has been moved to:
# services.enhanced_correlation_service with enhanced capabilities including:
# - Time-windowed correlations  
# - Lag analysis
# - Advanced significance testing
# - Confidence intervals
# - Better outlier handling


# DEPRECATED: Legacy endpoints - Use /enhanced endpoint for full functionality
@correlation_analysis_bp.route('/matrix', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
def calculate_correlation_matrix_api():
    """DEPRECATED: Redirects to enhanced correlation analysis"""
    logger.warning("⚠️ Legacy /matrix endpoint called - redirecting to enhanced analysis")
    return jsonify({
        'message': 'This endpoint is deprecated. Use /enhanced for full correlation analysis capabilities.',
        'redirect_to': '/api/v1/correlation/enhanced',
        'deprecated': True,
        'enhanced_features': [
            'Time-windowed correlations',
            'Lag analysis', 
            'Advanced significance testing',
            'Confidence intervals',
            'Better outlier handling'
        ]
    }), 200

@correlation_analysis_bp.route('/significant', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
def find_significant_correlations_api():
    """DEPRECATED: Redirects to enhanced correlation analysis"""
    logger.warning("⚠️ Legacy /significant endpoint called - redirecting to enhanced analysis")
    return jsonify({
        'message': 'This endpoint is deprecated. Use /enhanced for full correlation analysis capabilities.',
        'redirect_to': '/api/v1/correlation/enhanced',
        'deprecated': True,
        'enhanced_features': [
            'Advanced significance testing with multiple methods',
            'Confidence intervals',
            'Lag correlations',
            'Time-series analysis'
        ]
    }), 200

@correlation_analysis_bp.route('/patterns', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
def analyze_correlation_patterns_api():
    """DEPRECATED: Redirects to enhanced correlation analysis"""
    logger.warning("⚠️ Legacy /patterns endpoint called - redirecting to enhanced analysis")
    return jsonify({
        'message': 'This endpoint is deprecated. Use /enhanced for full correlation analysis capabilities.',
        'redirect_to': '/api/v1/correlation/enhanced',
        'deprecated': True,
        'enhanced_features': [
            'Comprehensive pattern analysis',
            'Automated insights generation',
            'Time-windowed patterns',
            'Cross-correlation analysis'
        ]
    }), 200

@correlation_analysis_bp.route('/enhanced', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='enhanced_correlation')
def enhanced_correlation_analysis_api():
    """Enhanced correlation analysis with time-windowed correlations and lag analysis"""
    logger.info("🔍 Received request for enhanced correlation analysis API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters')
        
        # Configuration from request
        config = CorrelationConfig(
            method=data.get('method', 'pearson'),
            min_periods=data.get('min_periods', 10),
            window_size_hours=data.get('window_size_hours'),
            max_lag_hours=data.get('max_lag_hours', 24),
            significance_threshold=data.get('significance_threshold', 0.05),
            correlation_threshold=data.get('correlation_threshold', 0.3),
            smooth_data=data.get('smooth_data', True)
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        
        # Ensure measurement_timestamp is datetime
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')

        # Perform enhanced correlation analysis
        result = enhanced_correlation_service.analyze_correlations(df, config, parameters)

        # Prepare response
        response = {
            'correlation_matrix': result.correlation_matrix.to_dict(),
            'significant_correlations': result.significant_correlations,
            'metadata': result.metadata,
            'insights': result.insights
        }
        
        # Add optional results if available
        if result.time_series_correlations is not None:
            response['time_series_correlations'] = result.time_series_correlations.to_dict('records')
            
        if result.lag_correlations:
            response['lag_correlations'] = result.lag_correlations

        logger.info(f"✅ Enhanced correlation analysis completed: {len(result.significant_correlations)} correlations found")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in enhanced correlation analysis API: {e}", exc_info=True)
        raise APIError('Failed to perform enhanced correlation analysis', status_code=500, payload={'details': str(e)})

@correlation_analysis_bp.route('/lag-analysis', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='lag_correlation')
def lag_correlation_analysis_api():
    """Specialized endpoint for lag correlation analysis"""
    logger.info("🕐 Received request for lag correlation analysis API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters')
        max_lag_hours = data.get('max_lag_hours', 48)
        
        # Configuration focused on lag analysis
        config = CorrelationConfig(
            method=data.get('method', 'pearson'),
            max_lag_hours=max_lag_hours,
            correlation_threshold=data.get('correlation_threshold', 0.2),
            smooth_data=True
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')

        # Perform analysis focused on lag correlations
        result = enhanced_correlation_service.analyze_correlations(df, config, parameters)

        # Return only lag correlation results
        response = {
            'lag_correlations': result.lag_correlations or {},
            'metadata': result.metadata,
            'summary': {
                'total_pairs_analyzed': len(result.lag_correlations or {}),
                'analysis_method': config.method,
                'max_lag_analyzed_hours': max_lag_hours
            }
        }

        logger.info(f"✅ Lag correlation analysis completed: {len(result.lag_correlations or {})} parameter pairs analyzed")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in lag correlation analysis API: {e}", exc_info=True)
        raise APIError('Failed to perform lag correlation analysis', status_code=500, payload={'details': str(e)})
