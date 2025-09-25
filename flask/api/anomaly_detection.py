"""
Anomaly Detection API
Provides endpoints for comprehensive anomaly detection including statistical methods,
machine learning approaches, and time series anomaly detection for water quality data.
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

# Import anomaly detection service
from services.anomaly_detection_service import anomaly_detection_service, AnomalyDetectionConfig

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

anomaly_detection_bp = Blueprint('anomaly_detection_bp', __name__)

@anomaly_detection_bp.route('/detect', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='anomaly_detection')
def detect_anomalies_api():
    """Comprehensive anomaly detection for multiple parameters"""
    logger.info("🚨 Received request for anomaly detection API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])

        # Configuration from request
        config = AnomalyDetectionConfig(
            method=data.get('method', 'ensemble'),
            threshold=data.get('threshold', 2.5),
            window_size=data.get('window_size', 24),
            sensitivity=data.get('sensitivity', 0.1),
            seasonal_adjustment=data.get('seasonal_adjustment', True),
            min_periods=data.get('min_periods', 10),
            remove_trend=data.get('remove_trend', False)
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

        # Perform anomaly detection
        results = anomaly_detection_service.detect_anomalies(df, parameters, config)

        # Convert results to JSON-serializable format
        response = {
            'analysis_timestamp': datetime.now().isoformat(),
            'parameters_analyzed': list(results.keys()),
            'total_parameters': len(results),
            'results': {}
        }

        for param, result in results.items():
            # Convert AnomalyPoint objects to dictionaries
            anomalies_dict = []
            for anomaly in result.anomalies:
                anomalies_dict.append({
                    'timestamp': anomaly.timestamp,
                    'value': anomaly.value,
                    'anomaly_score': anomaly.anomaly_score,
                    'anomaly_type': anomaly.anomaly_type,
                    'severity': anomaly.severity,
                    'explanation': anomaly.explanation,
                    'related_parameters': anomaly.related_parameters
                })

            response['results'][param] = {
                'anomalies': anomalies_dict,
                'anomaly_summary': result.anomaly_summary,
                'detection_config': result.detection_config,
                'insights': result.insights or [],
                'metadata': result.metadata
            }

        # Generate overall insights
        overall_insights = []
        total_anomalies = sum(len(r.anomalies) for r in results.values())
        critical_anomalies = sum(1 for r in results.values()
                               for a in r.anomalies if a.severity == 'critical')
        high_anomalies = sum(1 for r in results.values()
                           for a in r.anomalies if a.severity == 'high')

        if total_anomalies > 0:
            overall_insights.append(f"🚨 {total_anomalies} total anomalies detected across all parameters")

            if critical_anomalies > 0:
                overall_insights.append(f"🔴 {critical_anomalies} critical anomalies require immediate attention")

            if high_anomalies > 0:
                overall_insights.append(f"🟠 {high_anomalies} high-severity anomalies detected")
        else:
            overall_insights.append("✅ No anomalies detected - all parameters appear normal")

        response['overall_insights'] = overall_insights

        logger.info(f"✅ Anomaly detection completed: {total_anomalies} anomalies found across {len(results)} parameters")
        return jsonify(response), 200

    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in anomaly detection API: {e}", exc_info=True)
        raise APIError('Failed to perform anomaly detection', status_code=500, payload={'details': str(e)})

@anomaly_detection_bp.route('/detect/<parameter>', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='parameter_anomaly_detection')
def detect_parameter_anomalies_api(parameter):
    """Detect anomalies for a specific parameter"""
    logger.info(f"🔍 Received request for {parameter} anomaly detection API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        method = data.get('method', 'ensemble')
        threshold = data.get('threshold', 2.5)
        sensitivity = data.get('sensitivity', 0.1)

        # Configuration focused on single parameter
        config = AnomalyDetectionConfig(
            method=method,
            threshold=threshold,
            sensitivity=sensitivity,
            window_size=data.get('window_size', 24),
            seasonal_adjustment=data.get('seasonal_adjustment', True),
            min_periods=data.get('min_periods', 10)
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)
        if 'measurement_timestamp' in df.columns:
            df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'], errors='coerce')

        # Perform analysis for single parameter
        results = anomaly_detection_service.detect_anomalies(df, [parameter], config)

        if parameter not in results:
            raise APIError(f'Parameter {parameter} not found or insufficient data', status_code=400)

        result = results[parameter]

        # Convert AnomalyPoint objects to dictionaries
        anomalies_dict = []
        for anomaly in result.anomalies:
            anomalies_dict.append({
                'timestamp': anomaly.timestamp,
                'value': anomaly.value,
                'anomaly_score': anomaly.anomaly_score,
                'anomaly_type': anomaly.anomaly_type,
                'severity': anomaly.severity,
                'explanation': anomaly.explanation,
                'related_parameters': anomaly.related_parameters
            })

        # Focus response on anomaly data
        response = {
            'parameter': parameter,
            'anomalies': anomalies_dict,
            'anomaly_summary': result.anomaly_summary,
            'detection_config': result.detection_config,
            'insights': result.insights or [],
            'metadata': result.metadata
        }

        logger.info(f"✅ Anomaly detection completed for {parameter}: {len(result.anomalies)} anomalies found")
        return jsonify(response), 200

    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in anomaly detection API for {parameter}: {e}", exc_info=True)
        raise APIError(f'Failed to detect anomalies for {parameter}', status_code=500, payload={'details': str(e)})

@anomaly_detection_bp.route('/summary', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='anomaly_summary')
def get_anomaly_summary_api():
    """Get summary of anomaly detection for multiple parameters"""
    logger.info("📊 Received request for anomaly summary API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])

        # Lightweight configuration for summary
        config = AnomalyDetectionConfig(
            method=data.get('method', 'statistical'),  # Faster method for summary
            threshold=data.get('threshold', 3.0),  # More conservative threshold
            sensitivity=0.05,  # Lower sensitivity for summary
            min_periods=5,  # Lower minimum for summary
            seasonal_adjustment=False  # Skip for summary
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
        results = anomaly_detection_service.detect_anomalies(df, parameters, config)

        # Create summary
        summary = {
            'analysis_timestamp': datetime.now().isoformat(),
            'total_parameters': len(results),
            'parameters_summary': [],
            'overall_status': {
                'total_anomalies': 0,
                'critical_anomalies': 0,
                'high_anomalies': 0,
                'parameters_with_anomalies': 0,
                'clean_parameters': 0
            }
        }

        for param, result in results.items():
            param_anomalies = result.anomalies
            anomaly_count = len(param_anomalies)

            # Count by severity
            critical_count = sum(1 for a in param_anomalies if a.severity == 'critical')
            high_count = sum(1 for a in param_anomalies if a.severity == 'high')
            medium_count = sum(1 for a in param_anomalies if a.severity == 'medium')
            low_count = sum(1 for a in param_anomalies if a.severity == 'low')

            param_summary = {
                'parameter': param,
                'total_anomalies': anomaly_count,
                'anomaly_rate': result.anomaly_summary.get('anomaly_rate', 0),
                'severity_breakdown': {
                    'critical': critical_count,
                    'high': high_count,
                    'medium': medium_count,
                    'low': low_count
                },
                'status': 'critical' if critical_count > 0 else
                         'warning' if high_count > 0 else
                         'caution' if anomaly_count > 0 else 'normal',
                'last_anomaly': param_anomalies[-1].timestamp if param_anomalies else None
            }
            summary['parameters_summary'].append(param_summary)

            # Update overall status
            summary['overall_status']['total_anomalies'] += anomaly_count
            summary['overall_status']['critical_anomalies'] += critical_count
            summary['overall_status']['high_anomalies'] += high_count

            if anomaly_count > 0:
                summary['overall_status']['parameters_with_anomalies'] += 1
            else:
                summary['overall_status']['clean_parameters'] += 1

        logger.info(f"✅ Anomaly summary completed: {summary['overall_status']['total_anomalies']} anomalies across {len(results)} parameters")
        return jsonify(summary), 200

    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in anomaly summary API: {e}", exc_info=True)
        raise APIError('Failed to generate anomaly summary', status_code=500, payload={'details': str(e)})

@anomaly_detection_bp.route('/methods', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_available_methods_api():
    """Get available anomaly detection methods and their descriptions"""
    logger.info("📋 Received request for available anomaly detection methods.")

    try:
        # Import to check availability
        from services.anomaly_detection_service import SKLEARN_AVAILABLE

        methods = {
            'statistical': {
                'name': 'Statistical Methods',
                'description': 'Z-score based outlier detection with contextual analysis',
                'available': True,
                'recommended_for': ['Quick analysis', 'Small datasets', 'Interpretable results'],
                'parameters': {
                    'threshold': 'Z-score threshold (default: 2.5)',
                    'window_size': 'Context window size in hours (default: 24)'
                }
            },
            'isolation_forest': {
                'name': 'Isolation Forest',
                'description': 'Machine learning method that isolates anomalies',
                'available': SKLEARN_AVAILABLE,
                'recommended_for': ['Large datasets', 'Complex patterns', 'Multivariate anomalies'],
                'parameters': {
                    'sensitivity': 'Contamination rate (default: 0.1)',
                    'window_size': 'Feature window size (default: 24)'
                }
            },
            'local_outlier': {
                'name': 'Local Outlier Factor',
                'description': 'Detects outliers based on local neighborhood density',
                'available': SKLEARN_AVAILABLE,
                'recommended_for': ['Density-based anomalies', 'Local context', 'Clustered data'],
                'parameters': {
                    'sensitivity': 'Contamination rate (default: 0.1)',
                    'window_size': 'Neighborhood size factor (default: 24)'
                }
            },
            'one_class_svm': {
                'name': 'One-Class SVM',
                'description': 'Support Vector Machine for novelty detection',
                'available': SKLEARN_AVAILABLE,
                'recommended_for': ['High-dimensional data', 'Complex boundaries', 'Robust detection'],
                'parameters': {
                    'sensitivity': 'Nu parameter (default: 0.1)',
                    'kernel': 'Kernel type (fixed: rbf)'
                }
            },
            'ensemble': {
                'name': 'Ensemble Method',
                'description': 'Combines multiple methods for robust detection',
                'available': True,
                'recommended_for': ['Best overall performance', 'Comprehensive analysis', 'Production use'],
                'parameters': {
                    'threshold': 'Statistical threshold (default: 2.5)',
                    'sensitivity': 'ML sensitivity (default: 0.1)',
                    'window_size': 'Analysis window (default: 24)'
                }
            }
        }

        response = {
            'available_methods': methods,
            'sklearn_available': SKLEARN_AVAILABLE,
            'recommended_default': 'ensemble',
            'method_comparison': {
                'fastest': 'statistical',
                'most_accurate': 'ensemble',
                'best_for_large_data': 'isolation_forest',
                'most_interpretable': 'statistical'
            }
        }

        logger.info("✅ Available methods information provided")
        return jsonify(response), 200

    except Exception as e:
        logger.error(f"❌ Error getting available methods: {e}", exc_info=True)
        raise APIError('Failed to get available methods', status_code=500, payload={'details': str(e)})

@anomaly_detection_bp.route('/validate-config', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
def validate_detection_config_api():
    """Validate anomaly detection configuration before running analysis"""
    logger.info("✅ Received request for config validation.")

    try:
        data = request.get_json()
        if not data:
            raise APIError('Missing configuration in request body', status_code=400)

        # Validate method
        method = data.get('method', 'ensemble')
        valid_methods = ['statistical', 'isolation_forest', 'local_outlier', 'one_class_svm', 'ensemble']

        validation_result = {
            'valid': True,
            'warnings': [],
            'errors': [],
            'recommendations': []
        }

        if method not in valid_methods:
            validation_result['errors'].append(f"Invalid method '{method}'. Valid methods: {valid_methods}")
            validation_result['valid'] = False

        # Check sklearn availability for ML methods
        from services.anomaly_detection_service import SKLEARN_AVAILABLE
        ml_methods = ['isolation_forest', 'local_outlier', 'one_class_svm']

        if method in ml_methods and not SKLEARN_AVAILABLE:
            validation_result['errors'].append(f"Method '{method}' requires scikit-learn which is not available")
            validation_result['recommendations'].append("Use 'statistical' or 'ensemble' method instead")
            validation_result['valid'] = False

        # Validate parameters
        threshold = data.get('threshold', 2.5)
        if threshold < 1 or threshold > 5:
            validation_result['warnings'].append(f"Threshold {threshold} is outside recommended range 1-5")
            if threshold > 5:
                validation_result['recommendations'].append("Consider lowering threshold to avoid missing anomalies")
            elif threshold < 1:
                validation_result['recommendations'].append("Consider raising threshold to reduce false positives")

        sensitivity = data.get('sensitivity', 0.1)
        if sensitivity < 0.01 or sensitivity > 0.5:
            validation_result['warnings'].append(f"Sensitivity {sensitivity} is outside recommended range 0.01-0.5")
            if sensitivity > 0.5:
                validation_result['recommendations'].append("High sensitivity may produce too many false positives")

        window_size = data.get('window_size', 24)
        if window_size < 5 or window_size > 168:
            validation_result['warnings'].append(f"Window size {window_size} is outside recommended range 5-168 hours")

        # Data size recommendations
        df_data = data.get('df', [])
        if df_data:
            data_size = len(df_data)
            if data_size < 50:
                validation_result['warnings'].append("Small dataset may reduce anomaly detection accuracy")
                validation_result['recommendations'].append("Consider using 'statistical' method for small datasets")
            elif data_size > 10000 and method == 'one_class_svm':
                validation_result['warnings'].append("Large dataset with One-Class SVM may be slow")
                validation_result['recommendations'].append("Consider 'isolation_forest' for large datasets")

        # Overall recommendations
        if not validation_result['warnings'] and not validation_result['errors']:
            validation_result['recommendations'].append("Configuration looks good for anomaly detection")

        logger.info(f"✅ Configuration validation completed: {'Valid' if validation_result['valid'] else 'Invalid'}")
        return jsonify(validation_result), 200

    except Exception as e:
        logger.error(f"❌ Error validating configuration: {e}", exc_info=True)
        raise APIError('Failed to validate configuration', status_code=500, payload={'details': str(e)})