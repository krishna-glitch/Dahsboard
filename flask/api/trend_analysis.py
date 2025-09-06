"""
Trend Analysis API
Provides endpoints for time series trend analysis, forecasting,
and change point detection for water quality monitoring data.
"""

from flask import Blueprint, jsonify, request
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging
import pandas as pd
from datetime import datetime
from typing import Optional, List, Dict

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Import trend analysis service
from services.trend_analysis_service import trend_analysis_service, TrendConfig

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

trend_analysis_bp = Blueprint('trend_analysis_bp', __name__)

@trend_analysis_bp.route('/analyze', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='trend_analysis')
def analyze_trends_api():
    """Comprehensive trend analysis for multiple parameters"""
    logger.info("📈 Received request for trend analysis API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])
        
        # Configuration from request
        config = TrendConfig(
            trend_method=data.get('trend_method', 'linear'),
            seasonal_periods=data.get('seasonal_periods'),
            forecast_periods=data.get('forecast_periods', 24),
            confidence_level=data.get('confidence_level', 0.95),
            min_periods=data.get('min_periods', 20),
            detect_outliers=data.get('detect_outliers', True),
            detrend_data=data.get('detrend_data', False)
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        
        # Ensure measurement_timestamp is datetime
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')
        else:
            raise APIError('measurement_timestamp column is required', status_code=400)

        # Auto-detect parameters if not provided
        if not parameters:
            parameters = df.select_dtypes(include=['number']).columns.tolist()
            # Remove any ID or timestamp numeric columns
            parameters = [col for col in parameters if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]

        if not parameters:
            raise APIError('No numeric parameters found for analysis', status_code=400)

        # Perform trend analysis
        results = trend_analysis_service.analyze_trends(df, parameters, config)

        # Convert results to JSON-serializable format
        response = {
            'analysis_timestamp': datetime.now().isoformat(),
            'parameters_analyzed': list(results.keys()),
            'total_parameters': len(results),
            'results': {}
        }
        
        for param, result in results.items():
            response['results'][param] = {
                'trend_summary': result.trend_summary,
                'seasonal_decomposition': result.seasonal_decomposition,
                'forecast': result.forecast,
                'change_points': result.change_points or [],
                'outliers': result.outliers or [],
                'statistics': result.statistics,
                'insights': result.insights or [],
                'metadata': result.metadata
            }

        # Generate overall insights
        overall_insights = []
        trending_up = sum(1 for r in results.values() 
                         if r.trend_summary.get('trend_direction') == 'Increasing' 
                         and r.trend_summary.get('statistically_significant'))
        trending_down = sum(1 for r in results.values() 
                           if r.trend_summary.get('trend_direction') == 'Decreasing' 
                           and r.trend_summary.get('statistically_significant'))
        
        if trending_up > 0:
            overall_insights.append(f"📈 {trending_up} parameter(s) showing significant upward trends")
        if trending_down > 0:
            overall_insights.append(f"📉 {trending_down} parameter(s) showing significant downward trends")
            
        total_outliers = sum(len(r.outliers or []) for r in results.values())
        if total_outliers > 0:
            overall_insights.append(f"⚠️ {total_outliers} total outliers detected across all parameters")

        response['overall_insights'] = overall_insights

        logger.info(f"✅ Trend analysis completed: {len(results)} parameters analyzed")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in trend analysis API: {e}", exc_info=True)
        raise APIError('Failed to perform trend analysis', status_code=500, payload={'details': str(e)})

@trend_analysis_bp.route('/forecast/<parameter>', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='parameter_forecast')
def forecast_parameter_api(parameter):
    """Generate forecast for a specific parameter"""
    logger.info(f"🔮 Received request for {parameter} forecast API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        forecast_periods = data.get('forecast_periods', 48)
        confidence_level = data.get('confidence_level', 0.95)
        
        # Configuration focused on forecasting
        config = TrendConfig(
            forecast_periods=forecast_periods,
            confidence_level=confidence_level,
            detect_outliers=True,
            min_periods=10
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')

        # Perform analysis for single parameter
        results = trend_analysis_service.analyze_trends(df, [parameter], config)
        
        if parameter not in results:
            raise APIError(f'Parameter {parameter} not found or insufficient data', status_code=400)

        result = results[parameter]
        
        # Focus response on forecast data
        response = {
            'parameter': parameter,
            'forecast': result.forecast,
            'trend_summary': result.trend_summary,
            'statistics': result.statistics,
            'insights': result.insights or [],
            'metadata': result.metadata
        }

        logger.info(f"✅ Forecast generated for {parameter}: {forecast_periods} periods ahead")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in forecast API for {parameter}: {e}", exc_info=True)
        raise APIError(f'Failed to generate forecast for {parameter}', status_code=500, payload={'details': str(e)})

@trend_analysis_bp.route('/change-points', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='change_point_detection')
def detect_change_points_api():
    """Detect change points across multiple parameters"""
    logger.info("🔄 Received request for change point detection API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])
        min_change_magnitude = data.get('min_change_magnitude', 0.1)
        
        # Configuration for change point detection
        config = TrendConfig(
            min_periods=10,
            detect_outliers=False  # Keep outliers for change point detection
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')

        # Auto-detect parameters if not provided
        if not parameters:
            parameters = df.select_dtypes(include=['number']).columns.tolist()
            parameters = [col for col in parameters if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]

        # Perform analysis
        results = trend_analysis_service.analyze_trends(df, parameters, config)
        
        # Compile all change points
        all_change_points = []
        for param, result in results.items():
            if result.change_points:
                for cp in result.change_points:
                    if cp['change_magnitude'] >= min_change_magnitude:
                        cp['parameter'] = param
                        all_change_points.append(cp)
        
        # Sort by timestamp
        all_change_points.sort(key=lambda x: x['timestamp'])
        
        response = {
            'change_points': all_change_points,
            'parameters_analyzed': list(results.keys()),
            'total_change_points': len(all_change_points),
            'min_change_magnitude': min_change_magnitude,
            'analysis_timestamp': datetime.now().isoformat()
        }

        logger.info(f"✅ Change point detection completed: {len(all_change_points)} change points found")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in change point detection API: {e}", exc_info=True)
        raise APIError('Failed to detect change points', status_code=500, payload={'details': str(e)})

@trend_analysis_bp.route('/summary', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='trend_summary')
def get_trend_summary_api():
    """Get summary of trend analysis for multiple parameters"""
    logger.info("📊 Received request for trend summary API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])
        
        # Lightweight configuration for summary
        config = TrendConfig(
            min_periods=10,
            forecast_periods=0,  # Skip forecasting for summary
            detect_outliers=True
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')

        # Auto-detect parameters if not provided
        if not parameters:
            parameters = df.select_dtypes(include=['number']).columns.tolist()
            parameters = [col for col in parameters if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]

        # Perform analysis
        results = trend_analysis_service.analyze_trends(df, parameters, config)
        
        # Create summary
        summary = {
            'analysis_timestamp': datetime.now().isoformat(),
            'total_parameters': len(results),
            'parameters_summary': [],
            'overall_status': {
                'increasing_trends': 0,
                'decreasing_trends': 0,
                'stable_parameters': 0,
                'high_volatility_parameters': 0
            }
        }
        
        for param, result in results.items():
            trend = result.trend_summary
            param_summary = {
                'parameter': param,
                'trend_direction': trend.get('trend_direction', 'Unknown'),
                'trend_strength': trend.get('trend_strength', 'Unknown'),
                'statistically_significant': trend.get('statistically_significant', False),
                'volatility': trend.get('volatility', 0),
                'outliers_count': len(result.outliers or []),
                'change_points_count': len(result.change_points or []),
                'data_quality': 'Good' if trend.get('r_squared', 0) > 0.7 else 'Fair' if trend.get('r_squared', 0) > 0.4 else 'Poor'
            }
            summary['parameters_summary'].append(param_summary)
            
            # Update overall status
            if trend.get('statistically_significant') and trend.get('trend_direction') == 'Increasing':
                summary['overall_status']['increasing_trends'] += 1
            elif trend.get('statistically_significant') and trend.get('trend_direction') == 'Decreasing':
                summary['overall_status']['decreasing_trends'] += 1
            else:
                summary['overall_status']['stable_parameters'] += 1
                
            if trend.get('volatility', 0) > 0.3:
                summary['overall_status']['high_volatility_parameters'] += 1

        logger.info(f"✅ Trend summary completed: {len(results)} parameters summarized")
        return jsonify(summary), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in trend summary API: {e}", exc_info=True)
        raise APIError('Failed to generate trend summary', status_code=500, payload={'details': str(e)})