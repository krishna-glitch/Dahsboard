# Redshift Data API Connection Module for Environmental Monitoring System
# Uses Redshift Data API for serverless, secure database access without connection management.

import os
import logging
import time
import threading
import uuid
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, date
import pandas as pd
import polars as pl
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

# Import memory optimization
try:
    from services.memory_optimizer import memory_optimizer, optimize_polars_query
except ImportError:
    # Fallback if memory optimizer not available
    memory_optimizer = None
    def optimize_polars_query(data):
        return data

# Configure logging
logger = logging.getLogger(__name__)

# Database-specific exception classes for better error handling
class DatabaseError(Exception):
    """Base database exception"""
    pass

class ConnectionError(DatabaseError):
    """Database connection issues"""
    pass

class QueryError(DatabaseError):
    """SQL query execution errors"""
    pass

class ParameterError(DatabaseError):
    """Parameter handling errors"""
    pass

class TimeoutError(DatabaseError):
    """Query timeout errors"""
    pass

class RedshiftDataAPIConnection:
    """Redshift Data API connection manager - no credential management needed"""
    MAX_STATEMENT_LENGTH = 100000  # Prevent overly large SQL statements
    
    def __init__(self):
        self._lock = threading.Lock()
        self.connection_params = self._get_connection_params()
        self._connection_test_cache = None
        self._cache_time = 0
        self._cache_ttl = 300  # 5 minutes
        self._redshift_data_client = None
    
    def _get_connection_params(self) -> Dict[str, str]:
        """Get Redshift Data API connection parameters from centralized config"""
        
        try:
            from config import get_database_config
            db_config = get_database_config()
            
            params = {
                'workgroup_name': db_config.workgroup_name,
                'database': db_config.database,
                'schema': db_config.schema,
                'region': db_config.region,
            }
            
            logger.info("Using centralized configuration for Redshift Data API")
            return params
        except ImportError:
            # Fallback to environment variables if centralized config not available
            params = {
                'workgroup_name': os.getenv('REDSHIFT_WORKGROUP_NAME', 'impact-data-workgroup'),
                'database': os.getenv('REDSHIFT_DATABASE', 'impact_db'),
                'schema': os.getenv('REDSHIFT_SCHEMA', 'impact'),
                'region': os.getenv('AWS_DEFAULT_REGION', 'us-east-1'),
            }
            
            logger.warning("Using fallback environment variables for Redshift Data API configuration")
            return params
    
    @property
    def redshift_data_client(self):
        """Get or create Redshift Data API client"""
        if self._redshift_data_client is None:
            with self._lock:
                if self._redshift_data_client is None:
                    self._redshift_data_client = boto3.client(
                        'redshift-data', 
                        region_name=self.connection_params['region']
                    )
        return self._redshift_data_client
    
    def _build_secure_parameters(self, query: str, params: Optional[Dict] = None) -> Tuple[str, List[Dict]]:
        """
        Build secure SQL parameters using proper Redshift Data API parameterization.
        Returns tuple of (modified_query, parameters_list)
        """
        if not params:
            return query, []
        
        # Filter parameters to only include those actually used in the query
        used_params = {}
        for key, value in params.items():
            # Check if parameter is referenced in the query (supports both %(key)s and :key formats)
            if f"%({key})s" in query or f":{key}" in query:
                used_params[key] = value
        
        # Debug logging for parameter filtering
        if len(used_params) != len(params):
            logger.debug(f"Filtered parameters: {len(params)} -> {len(used_params)}")
            logger.debug(f"Original params: {list(params.keys())}")
            logger.debug(f"Used params: {list(used_params.keys())}")
            logger.debug(f"SQL query snippet: {query[:200]}...")
        
        if not used_params:
            return query, []
        
        parameters = []
        modified_query = query
        
        for key, value in used_params.items():
            # Convert %(key)s format to :key format for Redshift Data API
            modified_query = modified_query.replace(f"%({key})s", f":{key}")
            
            if value is None:
                parameters.append({
                    'name': key,
                    'value': {'isNull': True}
                })
            elif isinstance(value, str):
                parameters.append({
                    'name': key,
                    'value': {'stringValue': value}
                })
            elif isinstance(value, bool):
                parameters.append({
                    'name': key,
                    'value': {'booleanValue': value}
                })
            elif isinstance(value, (date, datetime)):
                parameters.append({
                    'name': key,
                    'value': {'stringValue': value.isoformat()}
                })
            elif isinstance(value, int):
                parameters.append({
                    'name': key,
                    'value': {'longValue': value}
                })
            elif isinstance(value, float):
                parameters.append({
                    'name': key,
                    'value': {'doubleValue': value}
                })
            elif isinstance(value, list):
                # For lists, generate multiple named parameters for IN clauses
                placeholders = []
                for i, item in enumerate(value):
                    param_name = f"{key}_{i}"
                    parameters.append({
                        'name': param_name,
                        'value': {'stringValue': str(item)} # All list items treated as strings for now
                    })
                    placeholders.append(f":{param_name}")
                modified_query = modified_query.replace(f":{key}", f"({','.join(placeholders)})")
                logger.debug(f"Processed list parameter '{key}' into {len(value)} individual parameters")
            else:
                # For other types, convert to string but log warning
                logger.warning(f"Converting parameter '{key}' of type {type(value)} to string")
                parameters.append({
                    'name': key,
                    'value': {'stringValue': str(value)}
                })
        
        return modified_query, parameters
    
    def execute_statement(self, sql: str, parameters: Optional[List[Dict]] = None) -> str:
        """Execute SQL statement using Data API and return statement ID"""
        
        try:
            # Prepare execute parameters
            execute_params = {
                'WorkgroupName': self.connection_params['workgroup_name'],
                'Database': self.connection_params['database'], 
                'Sql': sql,
                'StatementName': f"dash_query_{uuid.uuid4().hex[:8]}" # Changed statement name
            }
            
            # Add parameters if provided - AWS expects flattened parameter values
            if parameters:
                # AWS Redshift Data API expects parameter values to be directly the value, not wrapped
                flattened_params = []
                for param in parameters:
                    if 'value' in param:
                        if isinstance(param['value'], dict):
                            # Extract the actual value from nested structure
                            if 'stringValue' in param['value']:
                                flattened_params.append({
                                    'name': param['name'],
                                    'value': param['value']['stringValue']
                                })
                            elif 'longValue' in param['value']:
                                flattened_params.append({
                                    'name': param['name'],
                                    'value': param['value']['longValue']
                                })
                            elif 'doubleValue' in param['value']:
                                flattened_params.append({
                                    'name': param['name'],
                                    'value': param['value']['doubleValue']
                                })
                        else:
                            # Value is already flat
                            flattened_params.append(param)
                    else:
                        flattened_params.append(param)
                execute_params['Parameters'] = flattened_params
            
            # Execute statement
            response = self.redshift_data_client.execute_statement(**execute_params)
            statement_id = response['Id']
            
            logger.debug(f"Executed statement with ID: {statement_id}")
            return statement_id
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'AccessDenied':
                logger.error("Access denied for Redshift Data API")
                raise ValueError(
                    "Access denied. Please ensure your IAM role/user has permissions:\n"
                    "- redshift-data:ExecuteStatement\n"
                    "- redshift-data:DescribeStatement\n"
                    "- redshift-data:GetStatementResult"
                )
            else:
                logger.error(f"Redshift Data API error: {e}")
                raise
        
        except NoCredentialsError:
            logger.error("AWS credentials not found")
            raise ValueError(
                "AWS credentials not configured. Please set up AWS credentials."
            )
    
    def wait_for_statement(self, statement_id: str, max_wait_time: int = 300) -> Dict[str, Any]:
        """Wait for statement to complete and return status"""
        
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            try:
                response = self.redshift_data_client.describe_statement(Id=statement_id)
                status = response['Status']
                
                if status == 'FINISHED':
                    return response
                elif status == 'FAILED':
                    error_msg = response.get('Error', 'Unknown error')
                    logger.error(f"Statement {statement_id} failed: {error_msg}")
                    raise RuntimeError(f"Query failed: {error_msg}")
                elif status == 'ABORTED':
                    logger.error(f"Statement {statement_id} was aborted")
                    raise RuntimeError("Query was aborted")
                
                # Still running, wait a bit
                time.sleep(1)
                
            except ClientError as e:
                logger.error(f"Error checking statement status: {e}")
                raise
        
        # Timeout
        logger.error(f"Statement {statement_id} timed out after {max_wait_time} seconds")
        raise TimeoutError(f"Query timed out after {max_wait_time} seconds")
    
    def get_statement_result(self, statement_id: str) -> pd.DataFrame:
        """Get statement result as pandas DataFrame"""
        
        try:
            # Get result metadata
            response = self.redshift_data_client.get_statement_result(Id=statement_id)
            
            # Extract column information
            columns = []
            if 'ColumnMetadata' in response:
                columns = [col['name'] for col in response['ColumnMetadata']]
            
            # Extract data
            rows = []
            if 'Records' in response:
                for record in response['Records']:
                    row = []
                    for field in record:
                        # Handle different data types
                        if 'stringValue' in field:
                            row.append(field['stringValue'])
                        elif 'longValue' in field:
                            row.append(field['longValue'])
                        elif 'doubleValue' in field:
                            row.append(field['doubleValue'])
                        elif 'booleanValue' in field:
                            row.append(field['booleanValue'])
                        elif 'isNull' in field and field['isNull']:
                            row.append(None)
                        else:
                            row.append(str(field))
                    rows.append(row)
            
            # Handle pagination efficiently - collect all rows first
            all_rows = rows.copy()
            
            while response.get('NextToken'):
                response = self.redshift_data_client.get_statement_result(
                    Id=statement_id,
                    NextToken=response['NextToken']
                )
                
                for record in response.get('Records', []):
                    row = []
                    for field in record:
                        if 'stringValue' in field:
                            row.append(field['stringValue'])
                        elif 'longValue' in field:
                            row.append(field['longValue'])
                        elif 'doubleValue' in field:
                            row.append(field['doubleValue'])
                        elif 'booleanValue' in field:
                            row.append(field['booleanValue'])
                        elif 'isNull' in field and field['isNull']:
                            row.append(None)
                        else:
                            row.append(str(field))
                    all_rows.append(row)
            
            # Create DataFrame once with all data (10-100x faster than repeated pd.concat)
            if len(all_rows) > 10000:
                # Use polars for large datasets with improved error handling
                try:
                    # Convert data to proper types for polars compatibility
                    typed_rows = []
                    for row in all_rows:
                        typed_row = []
                        for value in row:
                            if isinstance(value, str):
                                # Handle datetime strings that might cause issues
                                if '-' in value and ':' in value and len(value) > 10:
                                    try:
                                        # Try to parse and standardize datetime format
                                        parsed_dt = pd.to_datetime(value)
                                        typed_row.append(parsed_dt.strftime('%Y-%m-%d %H:%M:%S'))
                                    except (ValueError, TypeError, pd.errors.ParserError) as e:
                                        # If datetime parsing fails, keep original value
                                        typed_row.append(value)
                                else:
                                    typed_row.append(value)
                            else:
                                typed_row.append(value)
                        typed_rows.append(typed_row)
                    
                    # Create polars DataFrame with consistent schema
                    pl_df = pl.DataFrame(typed_rows, schema=columns, orient="row")
                    df = pl_df.to_pandas()
                    logger.debug(f"Used polars optimization for {len(all_rows)} rows")
                except Exception as e:
                    logger.warning(f"Polars optimization failed, falling back to pandas: {e}")
                    df = pd.DataFrame(all_rows, columns=columns)
            else:
                df = pd.DataFrame(all_rows, columns=columns)
            
            # Apply memory optimization
            if memory_optimizer:
                df = memory_optimizer.optimize_dataframe(df)
                # Check memory pressure after large query
                if len(all_rows) > 5000:
                    current_memory = memory_optimizer.get_memory_usage()
                    if current_memory > memory_optimizer.warning_threshold:
                        logger.warning(f"High memory usage after query: {current_memory:.1f}MB")
            
            return df
            
        except ClientError as e:
            logger.error(f"Error getting statement result: {e}")
            raise
    
    def execute_query(self, 
                     query: str, 
                     params: Optional[Dict] = None,
                     max_retries: int = 3) -> pd.DataFrame:
        """Execute SQL query and return DataFrame with improved error handling"""
        
        # Use secure parameter handling
        try:
            query, parameters = self._build_secure_parameters(query, params)
        except ParameterError as e:
            logger.error(f"Parameter handling error: {e}")
            raise
        
        for attempt in range(max_retries):
            try:
                # Removed Streamlit warning for large queries
                
                # Execute statement with proper parameterization
                logger.debug(f"Executing SQL: {query[:200]}...")
                logger.debug(f"Parameters: {[p['name'] for p in parameters] if parameters else 'None'}")
                statement_id = self.execute_statement(query, parameters if parameters else None)
                
                # Wait for completion with timeout
                self.wait_for_statement(statement_id)
                
                # Get results
                result_df = self.get_statement_result(statement_id)
                
                logger.info(f"Query executed successfully, returned {len(result_df)} rows")
                return result_df
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code in ['ValidationException', 'InvalidParameterException']:
                    logger.error(f"Query validation error: {e}")
                    raise QueryError(f"Query validation failed: {e}")
                elif error_code in ['ThrottlingException', 'TooManyRequestsException']:
                    if attempt == max_retries - 1:
                        logger.error(f"Query throttled after {max_retries} attempts: {e}")
                        raise TimeoutError(f"Query throttled: {e}")
                    else:
                        logger.warning(f"Query throttled, attempt {attempt + 1}, retrying: {e}")
                        time.sleep(2 ** attempt)  # Exponential backoff
                elif attempt == max_retries - 1:
                    logger.error(f"Query failed after {max_retries} attempts: {e}")
                    raise QueryError(f"Query execution failed: {e}")
                else:
                    logger.warning(f"Query attempt {attempt + 1} failed, retrying: {e}")
                    time.sleep(2 ** attempt)
            except NoCredentialsError as e:
                logger.error(f"AWS credentials error: {e}")
                raise ConnectionError(f"Database connection failed - credentials: {e}")
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Unexpected error after {max_retries} attempts: {e}")
                    raise DatabaseError(f"Unexpected database error: {e}")
                else:
                    logger.warning(f"Unexpected error attempt {attempt + 1}, retrying: {e}")
                    time.sleep(2 ** attempt)
        
        return pd.DataFrame()
    
    # Removed redundant execute_query_with_retry and execute_query_raw methods
    # All functionality is now consolidated in the main execute_query method
    # For raw results, callers can use: df.values.tolist() on the returned DataFrame
    
    def test_connection(self, use_cache: bool = True) -> bool:
        """Test Data API connection with caching"""
        
        current_time = time.time()
        
        # Use cached result if available and fresh
        if use_cache and self._connection_test_cache is not None:
            if current_time - self._cache_time < self._cache_ttl:
                return self._connection_test_cache
        
        try:
            # Simple test query
            df = self.execute_query("SELECT 1 as test_connection")
            success = not df.empty and df.iloc[0, 0] == 1
            
            # Cache the result
            self._connection_test_cache = success
            self._cache_time = current_time
            
            if success:
                logger.info("Redshift Data API connection test successful")
            else:
                logger.error("Redshift Data API connection test failed")
                
            return success
            
        except Exception as e:
            logger.error(f"Redshift Data API connection test failed: {str(e)}")
            self._connection_test_cache = False
            self._cache_time = current_time
            return False
    
    def get_workgroup_info(self) -> Dict[str, Any]:
        """Get Redshift Serverless workgroup information"""
        try:
            client = boto3.client('redshift-serverless', region_name=self.connection_params['region'])
            
            response = client.get_workgroup(
                workgroupName=self.connection_params['workgroup_name']
            )
            
            workgroup = response['workgroup']
            
            return {
                'workgroup_name': workgroup['workgroupName'],
                'status': workgroup['status'],
                'endpoint': workgroup.get('endpoint', {}).get('address'),
                'port': workgroup.get('endpoint', {}).get('port'),
                'namespace_name': workgroup['namespaceName'],
                'creation_date': workgroup['creationDate'],
                'base_capacity': workgroup.get('baseCapacity'),
                'connection_type': 'Data API'
            }
            
        except Exception as e:
            logger.error(f"Failed to get workgroup info: {e}")
            return {'error': str(e)}
    
    def get_database_stats(self) -> Dict[str, Any]:
        """Get comprehensive database statistics"""
        schema = self.connection_params['schema']
        
        stats = {
            'connection_status': self.test_connection(),
            'connection_type': 'Redshift Data API',
            'workgroup_name': self.connection_params['workgroup_name'],
            'database': self.connection_params['database'],
            'schema': schema,
            'region': self.connection_params['region'],
            'tables': {}
        }
        
        # Add workgroup info
        workgroup_info = self.get_workgroup_info()
        stats['workgroup_info'] = workgroup_info
        
        # Get table information
        table_query = f"""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = '{schema}' 
        AND table_type = 'BASE TABLE'
        """
        
        try:
            tables_df = self.execute_query(table_query)
            
            for table_name in tables_df['table_name']:
                try:
                    row_count = self.get_table_row_count(table_name)
                    stats['tables'][table_name] = {
                        'row_count': row_count,
                        'status': 'accessible'
                    }
                except Exception as e:
                    stats['tables'][table_name] = {
                        'row_count': 0,
                        'status': f'error: {str(e)}'
                    }
                    
        except Exception as e:
            logger.error(f"Failed to get database stats: {e}")
            stats['error'] = str(e)
        
        return stats
    
    def get_table_row_count(self, table_name: str) -> int:
        """Get row count for a table"""
        schema = self.connection_params['schema']
        query = f"SELECT COUNT(*) as row_count FROM {schema}.{table_name}"
        
        try:
            result = self.execute_query(query)
            return int(result.iloc[0, 0]) if not result.empty else 0
        except Exception as e:
            logger.warning(f"Failed to get row count for {table_name}: {e}")
            return 0
    
    def close_connections(self):
        """Close connections (no-op for Data API)"""
        logger.info("Redshift Data API connections closed (no persistent connections)")

# Database Factory for Dependency Injection
class DatabaseFactory:
    """Factory for creating database connections with dependency injection support"""
    
    _instance = None
    _connection = None
    
    @classmethod
    def get_connection(cls) -> RedshiftDataAPIConnection:
        """Get database connection (singleton pattern for backward compatibility)"""
        if cls._connection is None:
            cls._connection = RedshiftDataAPIConnection()
        return cls._connection
    
    @classmethod
    def create_connection(cls) -> RedshiftDataAPIConnection:
        """Create new database connection (for testing/injection)"""
        return RedshiftDataAPIConnection()
    
    @classmethod
    def set_connection(cls, connection: RedshiftDataAPIConnection):
        """Set database connection (for dependency injection)"""
        cls._connection = connection

# Global database connection instance (maintained for backward compatibility)
db = DatabaseFactory.get_connection()

# Convenience functions for backward compatibility
def execute_query(query: str, params: Optional[Dict] = None) -> pd.DataFrame:
    """Execute query using global database instance"""
    return DatabaseFactory.get_connection().execute_query(query, params)

def test_connection() -> bool:
    """Test connection using global database instance"""
    return DatabaseFactory.get_connection().test_connection()

def get_database_stats() -> Dict[str, Any]:
    """Get database stats using global database instance"""
    return DatabaseFactory.get_connection().get_database_stats()

# Cache management functions (removed Streamlit cache decorators)
def get_cached_table_info(table_name: str) -> pd.DataFrame:
    """Get cached table information"""
    schema = db.connection_params['schema']
    query = f"""
    SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
    FROM information_schema.columns 
    WHERE table_schema = '{schema}' 
    AND table_name = '{table_name}'
    ORDER BY ordinal_position
    """
    
    return db.execute_query(query)

def get_cached_row_counts() -> Dict[str, int]:
    """Get cached row counts for all tables"""
    tables = ['site', 'water_quality', 'redox_event', 'redox_measurement']
    row_counts = {}
    
    for table in tables:
        try:
            row_counts[table] = db.get_table_row_count(table)
        except Exception as e:
            logger.warning(f"Failed to get row count for {table}: {e}")
            row_counts[table] = 0
    
    return row_counts