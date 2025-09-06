"""
Core Data Service for Environmental Monitoring Dashboard

This service consolidates all data access functionality into a single,
efficient service that eliminates redundancy and improves performance.
"""

import logging
import time
import hashlib
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional, Union, Tuple, Callable
from dataclasses import dataclass
from enum import Enum
import pandas as pd
# Use lazy loading for heavy modules
from utils.lazy_module_loader import lazy_loader

# Polars integration for high-performance data processing
try:
    import polars as pl
    from services.polars_service import polars_processor, optimize_dataframe, safe_to_pandas
    POLARS_AVAILABLE = True
except ImportError:
    POLARS_AVAILABLE = False
    pl = None
    polars_processor = None

# Import database and caching
from config.database import db
from services.consolidated_cache_service import cache_service, cached
from utils.enhanced_query_optimizer import HighPerformanceQueryOptimizer, QueryOptimizer
from services.high_performance_cache_service import high_performance_cache, advanced_cached
from utils.optimized_dataframe_processor import dataframe_processor, optimize_dataframe_memory

# Import data interface
from interfaces.data_interfaces import IDataService

logger = logging.getLogger(__name__)

class DataType(Enum):
    """Supported data types"""
    WATER_QUALITY = "water_quality"
    REDOX = "redox"
    SITE_METADATA = "site_metadata"
    AGGREGATED = "aggregated"

class AggregationLevel(Enum):
    """Data aggregation levels"""
    RAW = "raw"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"

@dataclass
class DataQuery:
    """Unified data query parameters"""
    sites: Optional[List[str]] = None
    start_date: Optional[Union[datetime, date]] = None
    end_date: Optional[Union[datetime, date]] = None
    days_back: Optional[int] = None
    limit: Optional[int] = None
    parameters: Optional[List[str]] = None
    aggregation: AggregationLevel = AggregationLevel.RAW
    data_type: DataType = DataType.WATER_QUALITY

@dataclass
class DataResult:
    """Standardized data result container supporting both Pandas and Polars"""
    data: Union[pd.DataFrame, 'pl.DataFrame']
    metadata: Dict[str, Any]
    success: bool
    query_time_ms: float
    source: str = "database"
    cache_hit: bool = False
    error_message: Optional[str] = None
    record_count: int = 0
    data_format: str = "pandas"  # "pandas" or "polars"
    
    def __post_init__(self):
        if hasattr(self.data, 'empty'):
            self.record_count = len(self.data) if not self.data.empty else 0
            self.data_format = "pandas"
        elif hasattr(self.data, 'is_empty'):
            self.record_count = len(self.data) if not self.data.is_empty() else 0
            self.data_format = "polars"
        else:
            self.record_count = 0
    
    def to_pandas(self) -> pd.DataFrame:
        """Convert data to Pandas DataFrame"""
        if self.data_format == "polars" and POLARS_AVAILABLE:
            return safe_to_pandas(self.data)
        return self.data
    
    def to_polars(self) -> Optional['pl.DataFrame']:
        """Convert data to Polars DataFrame if available"""
        if not POLARS_AVAILABLE:
            return None
        if self.data_format == "pandas":
            return pl.from_pandas(self.data)
        return self.data

class CoreDataService(IDataService):
    """
    Unified core data service consolidating all data access functionality
    Implements IDataService interface for dependency injection
    """
    
    def __init__(self, use_polars: bool = True):
        """Initialize core data service"""
        self.db = db
        self.cache = cache_service
        self.use_polars = use_polars and POLARS_AVAILABLE
        
        # Enhanced query optimization with high-performance data structures
        self.query_optimizer = HighPerformanceQueryOptimizer(
            self.db, 
            cache_ttl_seconds=300, 
            max_cache_size=2000
        )
        
        # Performance tracking
        self._query_stats = {
            'total_queries': 0,
            'cache_hits': 0,
            'average_query_time': 0.0,
            'last_health_check': None
        }
        
        # Schema validation cache
        self._schema_validated = {}
        
        logger.info("CoreCoreDataService initialized with unified data access")
    
    @advanced_cached(ttl=300)  # Enhanced cache for 5 minutes
    @optimize_dataframe_memory(aggressive=True)
    def get_available_sites(self) -> List[Dict[str, Any]]:
        """Get all available monitoring sites using tested query from query_tester.py"""
        try:
            # Query from query_tester.py test_site_query
            query = """
            SELECT 
                site_id,
                code,
                description,
                status,
                created_at
            FROM impact.site
            ORDER BY code
            """
            
            sites_df = self.query_optimizer.execute_cached_query(query, "available_sites")
            
            if sites_df.empty:
                logger.warning("No sites found in database")
                return []
            
            # Convert to expected format
            sites = []
            for _, row in sites_df.iterrows():
                sites.append({
                    'site_id': row['site_id'],
                    'site_code': row['code'],
                    'site_name': row['description'], 
                    'status': row['status'],
                    'created_at': row['created_at']
                })
                
            return sites
            
        except Exception as e:
            logger.error(f"Failed to get available sites: {e}")
            return []
    
    def get_site_metadata(self, sites: List[str] = None) -> pd.DataFrame:
        """Get site metadata with data counts"""
        try:
            # Base query for site metadata
            query = """
            SELECT 
                s.site_id,
                s.code as site_code,
                s.description as site_name,
                s.status,
                s.created_at,
                COUNT(DISTINCT wq.measurement_timestamp) as water_quality_records,
                COUNT(DISTINCT re.measurement_timestamp) as redox_records,
                MAX(wq.measurement_timestamp) as last_water_quality,
                MAX(re.measurement_timestamp) as last_redox
            FROM impact.site s
            LEFT JOIN impact.water_quality wq ON s.site_id = wq.site_id
            LEFT JOIN impact.redox_event re ON s.site_id = re.site_id
            WHERE 1=1
            """
            
            params = {}
            
            if sites and len(sites) > 0:
                params['sites'] = sites
                query += " AND s.code IN :sites"
                
            query += """
            GROUP BY s.site_id, s.code, s.description, s.status, s.created_at
            ORDER BY s.code
            """
            
            logger.info(f"Executing site metadata query for sites: {sites}")
            return self.db.execute_query(query, params)
            
        except Exception as e:
            logger.error(f"Failed to get site metadata: {e}")
            return pd.DataFrame()
    
    @optimize_dataframe_memory(aggressive=False)
    def load_water_quality_data(self, sites: List[str] = None, 
                               start_date: datetime = None, 
                               end_date: datetime = None,
                               days_back: int = 30,
                               **kwargs) -> pd.DataFrame:
        """Load water quality data from Redshift using tested query from query_tester.py"""
        
        # Base query from query_tester.py test_water_quality_query
        query = """
        SELECT 
            wq.measurement_timestamp,
            s.code as site_code,
            s.description as site_name,
            wq.water_level_m,
            wq.temperature_c,
            wq.conductivity_us_cm,
            wq.quality_flag,
            wq.record_count,
            wq.time_window_id
        FROM impact.water_quality wq
        JOIN impact.site s ON wq.site_id = s.site_id
        WHERE 1=1
        """
        
        params = {}
        
        # Add site filtering if provided
        if sites and len(sites) > 0:
            # Convert to list format expected by parameter handling
            params['sites'] = sites
            query += " AND s.code IN :sites"
            
        # Add date filtering
        if start_date:
            params['start_date'] = start_date
            query += " AND wq.measurement_timestamp >= :start_date"
            
        if end_date:
            params['end_date'] = end_date
            query += " AND wq.measurement_timestamp <= :end_date"
        elif days_back and not start_date:
            # If no specific dates but days_back provided, calculate start_date
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            params['start_date'] = start_date
            query += " AND wq.measurement_timestamp >= :start_date"
            
        query += " ORDER BY wq.measurement_timestamp DESC"
        
        # Add limit if specified - use reasonable default for large datasets
        limit = kwargs.get('limit')
        if limit is None:
            # Auto-set limit based on time range to prevent timeout
            if days_back and days_back > 90:
                limit = 15000  # Larger limit for longer time ranges
            else:
                limit = 10000  # Standard limit
        # Validate and clamp limit to prevent injection or excessive load
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 10000
        limit = max(1, min(limit, 200000))
        if limit:
            query += f" LIMIT {limit}"
            
        logger.info(f"Executing water quality query for sites: {sites}, start: {start_date}, end: {end_date}, limit: {limit}")
        return self.db.execute_query(query, params)
    
    def _load_water_quality_data(self, query: DataQuery) -> DataResult:
        """Internal method for loading water quality data with DataResult wrapper"""
        start_time = time.time()
        
        try:
            # Extract parameters from DataQuery
            sites = query.sites if query.sites else []
            start_date = query.start_date
            end_date = query.end_date
            days_back = query.days_back or 30
            limit = query.limit
            
            # Call the main load method
            df = self.load_water_quality_data(
                sites=sites,
                start_date=start_date,
                end_date=end_date,
                days_back=days_back,
                limit=limit
            )
            
            query_time = (time.time() - start_time) * 1000
            
            return DataResult(
                data=df,
                metadata={
                    'query_type': 'water_quality',
                    'sites': sites,
                    'date_range': f"{start_date} to {end_date}" if start_date and end_date else f"Last {days_back} days",
                    'record_count': len(df)
                },
                success=True,
                query_time_ms=query_time,
                source="database"
            )
            
        except Exception as e:
            query_time = (time.time() - start_time) * 1000
            logger.error(f"Failed to load water quality data: {e}")
            
            return DataResult(
                data=pd.DataFrame(),
                metadata={},
                success=False,
                query_time_ms=query_time,
                error_message=str(e),
                source="database"
            )
    
    @optimize_dataframe_memory(aggressive=False)
    def load_redox_data(self, sites: List[str] = None, 
                       start_date: datetime = None, 
                       end_date: datetime = None,
                       days_back: int = 30,
                       **kwargs) -> pd.DataFrame:
        """Load redox data from Redshift using tested query from query_tester.py"""
        
        # Build raw query with optional SQL-level de-duplication across (site, depth, timestamp)
        dedupe_sql = kwargs.get('dedupe', True)
        if dedupe_sql:
            query = """
            SELECT * FROM (
                SELECT 
                    re.measurement_timestamp,
                    s.code as site_code,
                    s.description as site_name,
                    rm.depth_cm,
                    rm.redox_value_mv,
                    rm.replicate_label,
                    re.reference_electrode_mv,
                    re.time_window_id,
                    re.site_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY re.site_id, rm.depth_cm, re.measurement_timestamp
                        ORDER BY rm.replicate_label NULLS LAST
                    ) AS rn
                FROM impact.redox_event re
                JOIN impact.redox_measurement rm ON re.time_window_id = rm.time_window_id 
                                                  AND re.site_id = rm.site_id
                JOIN impact.site s ON re.site_id::varchar = s.site_id
                WHERE 1=1
            """
        else:
            query = """
            SELECT 
                re.measurement_timestamp,
                s.code as site_code,
                s.description as site_name,
                rm.depth_cm,
                rm.redox_value_mv,
                rm.replicate_label,
                re.reference_electrode_mv,
                re.time_window_id,
                re.site_id
            FROM impact.redox_event re
            JOIN impact.redox_measurement rm ON re.time_window_id = rm.time_window_id 
                                              AND re.site_id = rm.site_id
            JOIN impact.site s ON re.site_id::varchar = s.site_id
            WHERE 1=1
            """
        
        params = {}
        
        # Add site filtering if provided
        if sites and len(sites) > 0:
            params['sites'] = sites
            query += " AND s.code IN :sites"
            
        # Add date filtering
        if start_date:
            params['start_date'] = start_date
            query += " AND re.measurement_timestamp >= :start_date"
            
        if end_date:
            params['end_date'] = end_date
            query += " AND re.measurement_timestamp <= :end_date"
        elif days_back and not start_date:
            # If no specific dates but days_back provided, calculate start_date
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            params['start_date'] = start_date
            query += " AND re.measurement_timestamp >= :start_date"
            
        # Optional depth filter
        allowed_depths = kwargs.get('allowed_depths')
        if allowed_depths:
            params['allowed_depths'] = allowed_depths
            query += " AND rm.depth_cm IN :allowed_depths"

        if dedupe_sql:
            # Close inner SELECT and filter to rn=1
            query += "\n            ) t WHERE rn = 1\n            "
            # Apply ordering on outer result
            query += " ORDER BY measurement_timestamp DESC, depth_cm ASC"
        else:
            query += " ORDER BY re.measurement_timestamp DESC, rm.depth_cm ASC"
        
        # Add limit if specified - use reasonable default for large datasets
        no_limit = kwargs.get('no_limit', False)
        limit = kwargs.get('limit')
        offset = kwargs.get('offset', 0)
        # When no_limit is True, do not apply any default LIMIT
        if no_limit:
            limit = None
        else:
            if limit is None:
                # Auto-set limit based on time range to prevent timeout
                if days_back and days_back > 90:
                    limit = 15000  # Larger limit for longer time ranges
                else:
                    limit = 10000  # Standard limit
        # Validate and clamp limit to prevent injection or excessive load
        if limit is not None:
            try:
                limit = int(limit)
            except (TypeError, ValueError):
                limit = 10000
            limit = max(1, min(limit, 200000))
            if limit:
                query += f" LIMIT {limit}"
                try:
                    offset = int(offset) if offset is not None else 0
                except (TypeError, ValueError):
                    offset = 0
                if offset and offset > 0:
                    query += f" OFFSET {offset}"
            
        logger.info(f"Executing redox query for sites: {sites}, start: {start_date}, end: {end_date}, limit: {limit}")
        logger.info(f"🔍 [REDOX DEBUG] Full SQL Query: {query}")
        logger.info(f"🔍 [REDOX DEBUG] Query params: {params}")
        result = self.db.execute_query(query, params)
        logger.info(f"🔍 [REDOX DEBUG] Query returned {len(result)} rows")
        return result

    def count_redox_data(self, sites: List[str] = None,
                          start_date: datetime = None,
                          end_date: datetime = None,
                          **kwargs) -> int:
        """Count raw redox rows for the given filters for pagination."""
        try:
            dedupe_sql = kwargs.get('dedupe', True)
            if dedupe_sql:
                query = """
                SELECT COUNT(*) AS n FROM (
                    SELECT 1
                    FROM impact.redox_event re
                    JOIN impact.redox_measurement rm ON re.time_window_id = rm.time_window_id 
                                                      AND re.site_id = rm.site_id
                    JOIN impact.site s ON re.site_id::varchar = s.site_id
                    WHERE 1=1
                """
            else:
                query = """
                SELECT COUNT(*) AS n
                FROM impact.redox_event re
                JOIN impact.redox_measurement rm ON re.time_window_id = rm.time_window_id 
                                                  AND re.site_id = rm.site_id
                JOIN impact.site s ON re.site_id::varchar = s.site_id
                WHERE 1=1
                """
            params = {}
            if sites and len(sites) > 0:
                params['sites'] = sites
                query += " AND s.code IN :sites"
            if start_date:
                params['start_date'] = start_date
                query += " AND re.measurement_timestamp >= :start_date"
            if end_date:
                params['end_date'] = end_date
                query += " AND re.measurement_timestamp <= :end_date"
            allowed_depths = kwargs.get('allowed_depths')
            if allowed_depths:
                params['allowed_depths'] = allowed_depths
                query += " AND rm.depth_cm IN :allowed_depths"
            if dedupe_sql:
                # close inner select for dedupe and apply rn=1
                query += "\n                QUALIFY ROW_NUMBER() OVER (PARTITION BY re.site_id, rm.depth_cm, re.measurement_timestamp ORDER BY rm.replicate_label NULLS LAST) = 1\n                ) sub"
            df = self.db.execute_query(query, params)
            if df.empty:
                return 0
            try:
                return int(df.iloc[0]['n'])
            except Exception:
                return 0
        except Exception as e:
            logger.error(f"Failed to count redox data: {e}")
            return 0

    def load_processed_eh_time_series(
        self,
        site_code: str,
        start_ts: datetime,
        end_ts: datetime,
        allowed_depths: Optional[List[float]] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> pd.DataFrame:
        """Load processed Eh dual-axis time series from materialized view.

        Params: :site_code, :start_ts, :end_ts
        """
        # Map site codes to site_ids to avoid corrupted site table
        site_id_map = {'S1': '1', 'S2': '2', 'S3': '3', 'S4': '4'}
        site_id = site_id_map.get(site_code)
        
        if not site_id:
            return pd.DataFrame()
            
        base_query = """
        SELECT 
            mv.site_id,
            mv.measurement_timestamp,
            mv.depth_cm,
            mv.processed_eh
        FROM impact.mv_processed_eh mv
        WHERE mv.site_id = :site_id
          AND mv.measurement_timestamp BETWEEN :start_ts AND :end_ts
        """
        params = {
            'site_id': site_id,
            'start_ts': start_ts,
            'end_ts': end_ts,
        }
        if allowed_depths:
            base_query += " AND mv.depth_cm IN :allowed_depths"
            params['allowed_depths'] = allowed_depths
        query = base_query + "\n        ORDER BY mv.measurement_timestamp, mv.depth_cm\n        "
        if limit is not None:
            try:
                limit = int(limit)
            except Exception:
                limit = None
        if limit and limit > 0:
            query += f" LIMIT {limit}"
            try:
                offset = int(offset) if offset is not None else 0
            except Exception:
                offset = 0
            if offset and offset > 0:
                query += f" OFFSET {offset}"
        logger.info(f"Executing mv_processed_eh time series for site_code={site_code}")
        df = self.db.execute_query(query, params)
        
        # Add site_code column since we bypassed the site table JOIN
        if not df.empty:
            df['site_code'] = site_code
            
        return df

    def count_processed_eh_time_series(
        self,
        site_code: str,
        start_ts: datetime,
        end_ts: datetime,
        allowed_depths: Optional[List[float]] = None,
    ) -> int:
        try:
            query = """
                SELECT COUNT(*) AS n
                FROM impact.mv_processed_eh mv
                JOIN impact.site s ON mv.site_id::varchar = s.site_id
                WHERE s.code = :site_code
                  AND mv.measurement_timestamp BETWEEN :start_ts AND :end_ts
            """
            params = { 'site_code': site_code, 'start_ts': start_ts, 'end_ts': end_ts }
            if allowed_depths:
                query += " AND mv.depth_cm IN :allowed_depths"
                params['allowed_depths'] = allowed_depths
            df = self.db.execute_query(query, params)
            if df.empty:
                return 0
            return int(df.iloc[0]['n'])
        except Exception as e:
            logger.error(f"Failed to count mv_processed_eh time series: {e}")
            return 0

    def load_processed_eh_depth_snapshot(
        self,
        site_code: str,
        ts: datetime,
    ) -> pd.DataFrame:
        """Load depth profile snapshot from materialized view.

        Params: :site_code, :ts
        """
        query = """
        SELECT mv.depth_cm, mv.processed_eh
        FROM impact.mv_processed_eh mv
        JOIN impact.site s ON mv.site_id::varchar = s.site_id
        WHERE s.code = :site_code
          AND mv.measurement_timestamp = :ts
        ORDER BY mv.depth_cm
        """
        params = {
            'site_code': site_code,
            'ts': ts,
        }
        logger.info(f"Executing mv_processed_eh depth snapshot for site_code={site_code} ts={ts}")
        return self.db.execute_query(query, params)

    def load_processed_eh_rolling_mean(
        self,
        site_code: str,
        start_ts: datetime,
        end_ts: datetime,
    ) -> pd.DataFrame:
        """Load rolling 24-hour mean per depth from materialized view.

        15-min cadence -> 96 rows/day; window uses 95 preceding + current.
        Params: :site_code, :start_ts, :end_ts
        """
        query = """
        SELECT
          mv.site_id,
          mv.depth_cm,
          mv.measurement_timestamp,
          mv.processed_eh,
          AVG(processed_eh) OVER (
            PARTITION BY mv.site_id, mv.depth_cm
            ORDER BY mv.measurement_timestamp
            ROWS BETWEEN 95 PRECEDING AND CURRENT ROW
          ) AS processed_eh_roll24h
        FROM impact.mv_processed_eh mv
        JOIN impact.site s ON mv.site_id::varchar = s.site_id
        WHERE s.code = :site_code
          AND mv.measurement_timestamp BETWEEN :start_ts AND :end_ts
        ORDER BY mv.measurement_timestamp, mv.depth_cm
        """
        params = {
            'site_code': site_code,
            'start_ts': start_ts,
            'end_ts': end_ts,
        }
        logger.info(f"Executing mv_processed_eh rolling mean for site_code={site_code}")
        return self.db.execute_query(query, params)

    def get_redox_date_range(self, sites: List[str] = None) -> Dict[str, Optional[str]]:
        """Return earliest and latest processed redox timestamps (from MV) for optional site filter."""
        try:
            # Map site codes to site_ids to avoid corrupted site table (same as load_processed_eh_time_series)
            site_id_map = {'S1': '1', 'S2': '2', 'S3': '3', 'S4': '4'}
            
            query = """
            SELECT 
                MIN(mv.measurement_timestamp) AS earliest,
                MAX(mv.measurement_timestamp) AS latest
            FROM impact.mv_processed_eh mv
            WHERE 1=1
            """
            params = {}
            if sites and len(sites) > 0:
                # Map site codes to site_ids
                site_ids = [site_id_map.get(site) for site in sites if site_id_map.get(site)]
                if site_ids:
                    params['site_ids'] = site_ids
                    query += " AND mv.site_id IN :site_ids"
                else:
                    # No valid sites found
                    return { 'earliest': None, 'latest': None }
            result = self.db.execute_query(query, params)
            if result.empty:
                return { 'earliest': None, 'latest': None }
            earliest = result['earliest'].iloc[0]
            latest = result['latest'].iloc[0]
            # Ensure ISO strings
            earliest_str = pd.to_datetime(earliest).isoformat() if pd.notna(earliest) else None
            latest_str = pd.to_datetime(latest).isoformat() if pd.notna(latest) else None
            
            # CONSTRAINT: Cap latest date to known data boundary (2024-05-31) to prevent frontend 2025 queries
            if latest_str and latest_str > '2024-05-31T23:59:59':
                logger.info(f"[DATE_RANGE] Capping latest date from {latest_str} to 2024-05-31 (known data boundary)")
                latest_str = '2024-05-31T23:59:59.000Z'
                
            return { 'earliest': earliest_str, 'latest': latest_str }
        except Exception as e:
            logger.error(f"Failed to get redox date range: {e}")
            return { 'earliest': None, 'latest': None }
    
    def _load_redox_data(self, query: DataQuery) -> DataResult:
        """Internal method for loading redox data with DataResult wrapper"""
        start_time = time.time()
        
        try:
            # Extract parameters from DataQuery
            sites = query.sites if query.sites else []
            start_date = query.start_date
            end_date = query.end_date
            days_back = query.days_back or 30
            limit = query.limit
            
            # Call the main load method
            df = self.load_redox_data(
                sites=sites,
                start_date=start_date,
                end_date=end_date,
                days_back=days_back,
                limit=limit
            )
            
            query_time = (time.time() - start_time) * 1000
            
            return DataResult(
                data=df,
                metadata={
                    'query_type': 'redox',
                    'sites': sites,
                    'date_range': f"{start_date} to {end_date}" if start_date and end_date else f"Last {days_back} days",
                    'record_count': len(df)
                },
                success=True,
                query_time_ms=query_time,
                source="database"
            )
            
        except Exception as e:
            query_time = (time.time() - start_time) * 1000
            logger.error(f"Failed to load redox data: {e}")
            
            return DataResult(
                data=pd.DataFrame(),
                metadata={},
                success=False,
                query_time_ms=query_time,
                error_message=str(e),
                source="database"
            )

    def get_available_parameters(self, data_type: str = 'water_quality', days_back: int = 30) -> List[str]:
        """Get available parameters for a data type"""
        try:
            if data_type == 'water_quality':
                # Get non-null columns from recent water quality data (use subquery for alias safety)
                query = """
                SELECT DISTINCT parameter FROM (
                    SELECT 
                        CASE 
                            WHEN water_level_m IS NOT NULL THEN 'water_level_m'
                            WHEN temperature_c IS NOT NULL THEN 'temperature_c' 
                            WHEN conductivity_us_cm IS NOT NULL THEN 'conductivity_us_cm'
                        END as parameter
                    FROM impact.water_quality
                    WHERE measurement_timestamp >= CURRENT_DATE - :days_back
                ) t
                WHERE parameter IS NOT NULL
                """
                params = {'days_back': days_back}
                
            elif data_type == 'redox':
                # Get non-null columns from recent redox data (use subquery for alias safety)
                query = """
                SELECT DISTINCT parameter FROM (
                    SELECT 
                        CASE
                            WHEN rm.redox_value_mv IS NOT NULL THEN 'redox_value_mv'
                            WHEN rm.depth_cm IS NOT NULL THEN 'depth_cm'
                            WHEN re.reference_electrode_mv IS NOT NULL THEN 'reference_electrode_mv'
                        END as parameter
                    FROM impact.redox_measurement rm
                    JOIN impact.redox_event re ON re.time_window_id = rm.time_window_id 
                                              AND re.site_id = rm.site_id
                    WHERE re.measurement_timestamp >= CURRENT_DATE - :days_back
                ) t
                WHERE parameter IS NOT NULL
                """
                params = {'days_back': days_back}
            else:
                return []
                
            result_df = self.db.execute_query(query, params)
            
            if result_df.empty:
                # Return default parameters if no recent data
                if data_type == 'water_quality':
                    return ['water_level_m', 'temperature_c', 'conductivity_us_cm']
                elif data_type == 'redox':
                    return ['redox_value_mv', 'depth_cm', 'reference_electrode_mv']
                
            return result_df['parameter'].dropna().tolist()
            
        except Exception as e:
            logger.error(f"Failed to get available parameters for {data_type}: {e}")
            # Return defaults on error
            if data_type == 'water_quality':
                return ['water_level_m', 'temperature_c', 'conductivity_us_cm']
            elif data_type == 'redox':
                return ['redox_value_mv', 'depth_cm', 'reference_electrode_mv']
            return []

# Global service instance
core_data_service = CoreDataService()
