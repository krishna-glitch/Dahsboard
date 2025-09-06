from flask import Blueprint, jsonify, request
from flask_login import login_required
from utils.decorators import role_required
from utils.errors import APIError
import logging
from datetime import datetime, timedelta
import pandas as pd

from services.core_data_service import core_data_service, DataType, AggregationLevel
from utils.unified_error_handler import UnifiedErrorHandler

# Import config settings
from config.settings import SITES, WATER_QUALITY_PARAMS, TIME_RANGES

# Import comprehensive performance optimization
from utils.advanced_performance_integration_simple import enterprise_performance

# Initialize logger
from config.advanced_logging_config import get_advanced_logger
logger = get_advanced_logger(__name__)

data_diagnostics_bp = Blueprint('data_diagnostics_bp', __name__)
error_handler = UnifiedErrorHandler()

@data_diagnostics_bp.route('/run', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
@enterprise_performance(data_type='data_diagnostics')
def run_data_diagnostic_api():
    logger.info("Received request for data diagnostic API.")
    
    diagnostic_results = {
        "summary": [],
        "details": {}
    }

    try:
        # Test 1: Basic data loading
        diagnostic_results["summary"].append({"test": "Water Quality Data Load", "status": "running"})
        start_time = datetime.now()
        
        wq_data = pd.DataFrame()
        try:
            # Try smart loading first (like the main page uses)
            from services.smart_data_loader import load_data_smart
            wq_data, loading_plan = load_data_smart(
                data_type=DataType.WATER_QUALITY,
                sites=['S1', 'S2'],
                days_back=7,
                aggregation=AggregationLevel.RAW
            )
            logger.info(f"Diagnostic using smart loading: {loading_plan.strategy.value} strategy")
        except Exception as e:
            logger.warning(f"Smart loading failed in diagnostic, falling back to unified loader: {e}")
            # Fallback to unified loader with debug logging
            try:
                wq_data = core_data_service.load_water_quality_data(
                    data_type=DataType.WATER_QUALITY,
                    sites=['S1', 'S2'],
                    days_back=7,
                    aggregation=AggregationLevel.RAW
                )
                logger.info(f"Unified loader returned {len(wq_data)} records")
            except Exception as fallback_error:
                logger.error(f"Unified loader also failed: {fallback_error}")
                wq_data = pd.DataFrame()  # Return empty DataFrame as last resort
        
        load_time = (datetime.now() - start_time).total_seconds()
        
        if not wq_data.empty:
            diagnostic_results["summary"].append({
                "test": "Water Quality Data Load",
                "status": "SUCCESS",
                "message": f"Loaded {len(wq_data)} records in {load_time:.2f}s",
                "details": {
                    "columns": list(wq_data.columns),
                    "date_range": f"{wq_data['measurement_timestamp'].min()} to {wq_data['measurement_timestamp'].max()}" if 'measurement_timestamp' in wq_data.columns else "N/A",
                    "sites": wq_data['site_code'].unique().tolist() if 'site_code' in wq_data.columns else []
                }
            })
        else:
            diagnostic_results["summary"].append({
                "test": "Water Quality Data Load",
                "status": "FAILED",
                "message": "No water quality data loaded"
            })
        
        # Test 2: Site metadata
        diagnostic_results["summary"].append({"test": "Site Metadata Load", "status": "running"})
        site_data = core_data_service.load_water_quality_data(data_type=DataType.SITE_METADATA)
        
        if not site_data.empty:
            diagnostic_results["summary"].append({
                "test": "Site Metadata Load",
                "status": "SUCCESS",
                "message": f"Loaded {len(site_data)} site records",
                "details": {
                    "sites": site_data.get('site_code', site_data.get('code', [])).unique().tolist()
                }
            })
        else:
            diagnostic_results["summary"].append({
                "test": "Site Metadata Load",
                "status": "FAILED",
                "message": "No site metadata loaded"
            })
        
        # Test 3: Configuration check
        diagnostic_results["summary"].append({"test": "Configuration Check", "status": "running"})
        try:
            config_info = [
                f"Sites configured: {len(SITES)} ({list(SITES.keys())})",
                f"Water quality parameters: {len(WATER_QUALITY_PARAMS)} ({list(WATER_QUALITY_PARAMS.keys())})",
                f"Time ranges: {len(TIME_RANGES)} ({list(TIME_RANGES.keys())})"
            ]
            diagnostic_results["summary"].append({
                "test": "Configuration Check",
                "status": "SUCCESS",
                "message": "Configuration loaded successfully",
                "details": config_info
            })
        except ImportError as e:
            diagnostic_results["summary"].append({
                "test": "Configuration Check",
                "status": "FAILED",
                "message": f"Configuration import error: {e}"
            })
        
        # Test 4: Database connection
        diagnostic_results["summary"].append({"test": "Database Connection", "status": "running"})
        try:
            validation = core_data_service.validate_database_schema()
            
            if validation['overall_valid']:
                diagnostic_results["summary"].append({
                    "test": "Database Connection",
                    "status": "SUCCESS",
                    "message": "Database schema is valid",
                    "details": {
                        "tables_found": sum(validation['tables_exist'].values()),
                        "total_tables_expected": len(validation['tables_exist'])
                    }
                })
            else:
                diagnostic_results["summary"].append({
                    "test": "Database Connection",
                    "status": "WARNING",
                    "message": "Database schema validation failed",
                    "details": {
                        "tables_found": sum(validation['tables_exist'].values()) if validation['tables_exist'] else 0,
                        "total_tables_expected": len(validation['tables_exist'])
                    }
                })
                
        except Exception as e:
            diagnostic_results["summary"].append({
                "test": "Database Connection",
                "status": "FAILED",
                "message": f"Database connection error: {e}"
            })
        
        logger.info("Data diagnostic run completed.")
        return jsonify(diagnostic_results), 200
        
    except Exception as e:
        logger.error(f"Diagnostic API error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to run data diagnostic', 'details': str(e)}), 500

@data_diagnostics_bp.route('/summary', methods=['GET'])
@login_required
@role_required(['admin', 'analyst'])
def get_data_status_summary_api():
    logger.info("Received request for data status summary API.")
    try:
        # Quick test of data availability
        wq_test = core_data_service.load_water_quality_data(
            data_type=DataType.WATER_QUALITY,
            sites=['S1'],
            days_back=1
        )
        
        summary = {
            'water_quality_available': not wq_test.empty,
            'record_count': len(wq_test),
            'last_check': datetime.now().isoformat()
        }
        logger.info("Successfully retrieved data status summary.")
        return jsonify(summary), 200
    except Exception as e:
        logger.error(f"Error in get_data_status_summary API: {e}", exc_info=True)
        return jsonify({'error': 'Failed to retrieve data status summary', 'details': str(e)}), 500
