"""
Statistical Analysis API
Provides endpoints for comprehensive statistical analysis including
descriptive statistics, distribution analysis, and hypothesis testing.
"""

from flask import Blueprint, jsonify, request
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging
import pandas as pd
from datetime import datetime
from typing import Optional, List, Dict, Any

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Import statistical analysis service
from services.statistical_analysis_service import statistical_analysis_service, StatisticalConfig

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

statistical_analysis_bp = Blueprint('statistical_analysis_bp', __name__)

@statistical_analysis_bp.route('/comprehensive', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='statistical_analysis')
def comprehensive_statistical_analysis_api():
    """Comprehensive statistical analysis for multiple parameters"""
    logger.info("🔢 Received request for comprehensive statistical analysis API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])
        
        # Configuration from request
        config = StatisticalConfig(
            confidence_level=data.get('confidence_level', 0.95),
            outlier_method=data.get('outlier_method', 'iqr'),
            normality_tests=data.get('normality_tests', True),
            distribution_fitting=data.get('distribution_fitting', True),
            hypothesis_tests=data.get('hypothesis_tests', True),
            min_sample_size=data.get('min_sample_size', 10)
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)

        # Auto-detect parameters if not provided
        if not parameters:
            parameters = df.select_dtypes(include=['number']).columns.tolist()
            # Remove any ID or timestamp numeric columns
            parameters = [col for col in parameters if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]

        if not parameters:
            raise APIError('No numeric parameters found for analysis', status_code=400)

        # Perform statistical analysis
        results = statistical_analysis_service.analyze_statistics(df, parameters, config)

        # Convert results to JSON-serializable format
        response = {
            'analysis_timestamp': datetime.now().isoformat(),
            'parameters_analyzed': list(results.keys()),
            'total_parameters': len(results),
            'results': {}
        }
        
        for param, result in results.items():
            response['results'][param] = {
                'descriptive_stats': result.descriptive_stats,
                'distribution_analysis': result.distribution_analysis,
                'normality_tests': result.normality_tests,
                'outlier_analysis': result.outlier_analysis,
                'hypothesis_tests': result.hypothesis_tests,
                'confidence_intervals': result.confidence_intervals,
                'insights': result.insights or [],
                'metadata': result.metadata
            }

        # Generate overall summary
        overall_summary = {
            'total_outliers': sum(
                result.outlier_analysis.get('statistical_summary', {}).get('total_unique_outliers', 0)
                for result in results.values()
            ),
            'normal_distributions': sum(
                1 for result in results.values()
                if result.normality_tests and result.normality_tests.get('overall_assessment', {}).get('likely_normal', False)
            ),
            'high_variability_params': sum(
                1 for result in results.values()
                if result.descriptive_stats.get('coefficient_of_variation', 0) > 0.5
            )
        }
        
        response['overall_summary'] = overall_summary

        logger.info(f"✅ Statistical analysis completed: {len(results)} parameters analyzed")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in statistical analysis API: {e}", exc_info=True)
        raise APIError('Failed to perform statistical analysis', status_code=500, payload={'details': str(e)})

@statistical_analysis_bp.route('/outliers', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='outlier_analysis')
def outlier_analysis_api():
    """Specialized outlier detection analysis"""
    logger.info("🎯 Received request for outlier analysis API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])
        outlier_method = data.get('outlier_method', 'iqr')
        
        # Configuration focused on outlier detection
        config = StatisticalConfig(
            outlier_method=outlier_method,
            normality_tests=False,
            distribution_fitting=False,
            hypothesis_tests=False,
            min_sample_size=5
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)

        # Auto-detect parameters if not provided
        if not parameters:
            parameters = df.select_dtypes(include=['number']).columns.tolist()
            parameters = [col for col in parameters if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]

        # Perform analysis
        results = statistical_analysis_service.analyze_statistics(df, parameters, config)
        
        # Compile outlier summary
        outlier_summary = {
            'analysis_timestamp': datetime.now().isoformat(),
            'method_used': outlier_method,
            'parameters_analyzed': list(results.keys()),
            'outlier_details': {},
            'total_outliers': 0
        }
        
        for param, result in results.items():
            if result.outlier_analysis:
                method_key = f"{outlier_method}_method"
                if method_key in result.outlier_analysis:
                    outlier_info = result.outlier_analysis[method_key]
                    outlier_summary['outlier_details'][param] = {
                        'count': outlier_info['outlier_count'],
                        'percentage': outlier_info['outlier_percentage'],
                        'values': outlier_info['outlier_values'][:10],  # Limit to first 10
                        'total_values': len(outlier_info['outlier_values'])
                    }
                    outlier_summary['total_outliers'] += outlier_info['outlier_count']

        logger.info(f"✅ Outlier analysis completed: {outlier_summary['total_outliers']} outliers found")
        return jsonify(outlier_summary), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in outlier analysis API: {e}", exc_info=True)
        raise APIError('Failed to perform outlier analysis', status_code=500, payload={'details': str(e)})

@statistical_analysis_bp.route('/distribution/<parameter>', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='distribution_analysis')
def distribution_analysis_api(parameter):
    """Detailed distribution analysis for a specific parameter"""
    logger.info(f"📊 Received request for {parameter} distribution analysis API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        
        # Configuration focused on distribution analysis
        config = StatisticalConfig(
            normality_tests=True,
            distribution_fitting=True,
            hypothesis_tests=False,
            outlier_method='all'
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)

        # Perform analysis for single parameter
        results = statistical_analysis_service.analyze_statistics(df, [parameter], config)
        
        if parameter not in results:
            raise APIError(f'Parameter {parameter} not found or insufficient data', status_code=400)

        result = results[parameter]
        
        # Focus response on distribution data
        response = {
            'parameter': parameter,
            'descriptive_stats': result.descriptive_stats,
            'distribution_analysis': result.distribution_analysis,
            'normality_tests': result.normality_tests,
            'outlier_analysis': result.outlier_analysis,
            'confidence_intervals': result.confidence_intervals,
            'insights': result.insights or [],
            'metadata': result.metadata
        }

        logger.info(f"✅ Distribution analysis completed for {parameter}")
        return jsonify(response), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in distribution analysis API for {parameter}: {e}", exc_info=True)
        raise APIError(f'Failed to analyze distribution for {parameter}', status_code=500, payload={'details': str(e)})

@statistical_analysis_bp.route('/summary', methods=['POST'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='statistical_summary')
def statistical_summary_api():
    """Quick statistical summary for multiple parameters"""
    logger.info("📈 Received request for statistical summary API.")
    try:
        data = request.get_json()
        if not data or 'df' not in data:
            raise APIError('Missing DataFrame in request body', status_code=400)

        df_data = data['df']
        parameters = data.get('parameters', [])
        
        # Lightweight configuration for summary
        config = StatisticalConfig(
            normality_tests=False,
            distribution_fitting=False,
            hypothesis_tests=False,
            min_sample_size=5
        )

        # Convert to DataFrame
        df = pd.DataFrame(df_data)

        # Auto-detect parameters if not provided
        if not parameters:
            parameters = df.select_dtypes(include=['number']).columns.tolist()
            parameters = [col for col in parameters if not any(
                keyword in col.lower() for keyword in ['id', 'timestamp', 'index']
            )]

        # Perform analysis
        results = statistical_analysis_service.analyze_statistics(df, parameters, config)
        
        # Create summary
        summary = {
            'analysis_timestamp': datetime.now().isoformat(),
            'total_parameters': len(results),
            'parameters_summary': []
        }
        
        for param, result in results.items():
            stats = result.descriptive_stats
            param_summary = {
                'parameter': param,
                'count': stats.get('count', 0),
                'mean': stats.get('mean', 0),
                'median': stats.get('median', 0),
                'std': stats.get('std', 0),
                'min': stats.get('min', 0),
                'max': stats.get('max', 0),
                'coefficient_of_variation': stats.get('coefficient_of_variation', 0),
                'skewness': stats.get('skewness', 0),
                'outlier_count': result.outlier_analysis.get('iqr_method', {}).get('outlier_count', 0),
                'data_quality': _assess_data_quality(stats)
            }
            summary['parameters_summary'].append(param_summary)

        logger.info(f"✅ Statistical summary completed: {len(results)} parameters summarized")
        return jsonify(summary), 200
        
    except ValueError as ve:
        raise APIError(str(ve), status_code=400)
    except Exception as e:
        logger.error(f"❌ Error in statistical summary API: {e}", exc_info=True)
        raise APIError('Failed to generate statistical summary', status_code=500, payload={'details': str(e)})

def _assess_data_quality(stats: Dict[str, Any]) -> str:
    """Assess data quality based on statistical properties"""
    
    cv = stats.get('coefficient_of_variation', 0)
    count = stats.get('count', 0)
    
    # Quality assessment based on sample size and variability
    if count < 10:
        return 'Insufficient'
    elif count > 1000 and cv < 0.2:
        return 'Excellent'
    elif count > 100 and cv < 0.5:
        return 'Good'
    elif count > 50:
        return 'Fair'
    else:
        return 'Poor'