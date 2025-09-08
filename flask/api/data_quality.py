from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

from config.advanced_logging_config import get_advanced_logger
from services.core_data_service import core_data_service, DataQuery
from utils.request_parsing import parse_sites_parameter
from utils.api_cache_utils import generate_api_cache_key
from services.consolidated_cache_service import cache_service
from utils.data_compressor import compressor

logger = get_advanced_logger(__name__)

data_quality_bp = Blueprint('data_quality_bp', __name__)

def _load_window(data_type: str, sites: list, start: datetime, end: datetime) -> pd.DataFrame:
    try:
        if data_type == 'redox':
            # Use materialized view like redox analysis page
            return _load_redox_from_materialized_view(sites, start, end)
        else:
            # Use existing water quality data loading
            q = DataQuery(sites=sites, start_date=start, end_date=end, days_back=(end-start).days+1)
            result = core_data_service._load_water_quality_data(q)
            if hasattr(result, 'data'):
                df = result.data
            else:
                df = result
            if df is None or len(df) == 0:
                return pd.DataFrame()
            # Normalize columns
            df = df.copy()
            # Standardize site column name
            if 'site_code' not in df.columns:
                if 'site' in df.columns:
                    df['site_code'] = df['site']
            # Standardize timestamp column
            ts_col = 'measurement_timestamp' if 'measurement_timestamp' in df.columns else None
            if ts_col is None:
                # Try common alternates
                for c in df.columns:
                    if 'timestamp' in c:
                        ts_col = c
                        break
            if not ts_col:
                return pd.DataFrame()
            df['measurement_timestamp'] = pd.to_datetime(df[ts_col], errors='coerce')
            df = df.dropna(subset=['measurement_timestamp'])
            return df
    except Exception as e:
        logger.error(f"[DATA_QUALITY] load failed: {e}")
        return pd.DataFrame()

def _load_redox_from_materialized_view(sites: list, start: datetime, end: datetime) -> pd.DataFrame:
    """Load redox data from materialized view like redox analysis page"""
    try:
        # Map site codes to site_ids (same mapping as redox analysis)
        site_id_map = {'S1': '1', 'S2': '2', 'S3': '3', 'S4': '4'}
        site_ids = [site_id_map.get(site) for site in sites if site_id_map.get(site)]
        
        if not site_ids:
            return pd.DataFrame()
            
        # Query materialized view directly (no deduplication - it's already clean)
        query = """
        SELECT 
            mv.site_id,
            mv.measurement_timestamp,
            mv.depth_cm,
            mv.processed_eh as redox_value_mv
        FROM impact.mv_processed_eh mv
        WHERE mv.site_id IN :site_ids
          AND mv.measurement_timestamp BETWEEN :start_ts AND :end_ts
        ORDER BY mv.site_id, mv.measurement_timestamp
        """
        
        params = {
            'site_ids': site_ids,
            'start_ts': start,
            'end_ts': end
        }
        
        df = core_data_service.db.execute_query(query, params)
        
        if df.empty:
            return pd.DataFrame()
        
            
        # Convert measurement_timestamp to datetime for proper processing
        df['measurement_timestamp'] = pd.to_datetime(df['measurement_timestamp'])
        
        # Add site_code column for consistency
        reverse_map = {1: 'S1', 2: 'S2', 3: 'S3', 4: 'S4'}  # Use integer keys since site_id is numeric
        df['site_code'] = df['site_id'].map(reverse_map)
        
        logger.info(f"🔍 [DATA_QUALITY] Loaded {len(df)} records from materialized view for sites {sites}")
        return df
        
    except Exception as e:
        logger.error(f"[DATA_QUALITY] materialized view load failed: {e}")
        return pd.DataFrame()

def _expected_per_day(cadence: str, data_type: str) -> int:
    if cadence:
        c = cadence.lower()
        if c in ['15min','15m','15']:
            return 96
        if c in ['1h','hour','hourly']:
            return 24
        if c in ['30min','30m']:
            return 48
    # Defaults
    return 24 if data_type == 'water_quality' else 96

def _metric_column_for(data_type: str, metric: str) -> str:
    if data_type == 'redox':
        return 'redox_value_mv'
    m = (metric or '').lower()
    mapping = {
        'temperature': 'temperature_c',
        'conductivity': 'conductivity_us_cm',
        'turbidity': 'turbidity_ntu',
        'nitrates': 'nitrates_mg_l'
    }
    return mapping.get(m, 'temperature_c')

def _detect_outliers_and_flatlines(day_df: pd.DataFrame, value_col: str, flatline_min_len: int = 3) -> (int, int):
    try:
        vals = pd.to_numeric(day_df[value_col], errors='coerce').dropna().values
        if vals.size == 0:
            return 0, 0
        # Outliers via z-score threshold 3
        mu = float(np.mean(vals))
        sigma = float(np.std(vals))
        outliers = int(np.sum(np.abs((vals - mu) / (sigma if sigma > 0 else 1e-9)) > 3))
        # Flatlines: consecutive nearly-equal values (tolerance)
        eps = 1e-6
        run = 1
        flat = 0
        for i in range(1, len(vals)):
            if abs(vals[i] - vals[i-1]) <= eps:
                run += 1
            else:
                if run >= flatline_min_len:
                    flat += 1
                run = 1
        if run >= flatline_min_len:
            flat += 1
        return outliers, flat
    except Exception:
        return 0, 0

@data_quality_bp.route('/summary', methods=['GET'])
def data_quality_summary():
    try:
        sites = parse_sites_parameter(['S1','S2'])
        data_type = request.args.get('data_type','water_quality').lower()
        time_range = request.args.get('time_range','30d').lower()
        cadence = request.args.get('cadence','')
        metric = request.args.get('metric','temperature')
        start_str = request.args.get('start_date')
        end_str = request.args.get('end_date')
        
        # Check cache first
        cache_key = generate_api_cache_key('data_quality_summary', 
                                         data_type=data_type, 
                                         time_range=time_range, 
                                         cadence=cadence, 
                                         metric=metric,
                                         start_date=start_str,
                                         end_date=end_str)
        
        cached_result = cache_service.get(cache_key)
        if cached_result:
            logger.info(f"🚀 [DATA_QUALITY] Cache hit for sites: {sites}")
            return jsonify(cached_result), 200

        alias = {'1d':1,'7d':7,'30d':30,'90d':90,'180d':180,'365d':365}
        if end_str:
            end = datetime.fromisoformat(end_str.replace('Z','+00:00'))
        else:
            # Use consistent end date like other APIs - data goes through 2024-05-31
            if data_type == 'redox':
                end = datetime(2024, 5, 31, 23, 59, 59)
            else:
                end = datetime(2024, 5, 31, 23, 59, 59)
        if start_str:
            start = datetime.fromisoformat(start_str.replace('Z','+00:00'))
        else:
            days = alias.get(time_range, 30)
            start = end - timedelta(days=days-1)

        df = _load_window(data_type, sites, start, end)
        expected = _expected_per_day(cadence, data_type)

        per_site = []
        if df.empty:
            return jsonify({
                'metadata': {
                    'sites': sites, 'data_type': data_type, 'start': start.isoformat(), 'end': end.isoformat(), 'cadence': cadence or ('1H' if data_type=='water_quality' else '15min'), 'expected_per_day': expected
                },
                'sites': []
            }), 200

        # CORRECT duplicate detection: based on exact timestamp + site_id uniqueness
        # A duplicate is when there are multiple records with the same measurement_timestamp and site_code
        value_col = _metric_column_for(data_type, metric)
        
        for site in sites:
            sdf = df[df['site_code'] == site].copy()
            if sdf.empty:
                per_site.append({
                    'site_id': site,
                    'total_records': 0,
                    'completeness_pct': 0,
                    'duplicates': 0,
                    'duplicate_records': [],
                    'days': [],
                    'total_outliers': 0,
                    'total_flatlines': 0
                })
                continue
                
            # Find TRUE duplicates: multiple records with identical timestamp + site + depth
            # Group by timestamp, site, AND depth to find actual duplicates
            if 'depth_cm' in sdf.columns:
                duplicate_groups = sdf.groupby(['measurement_timestamp', 'depth_cm']).size()
            else:
                duplicate_groups = sdf.groupby('measurement_timestamp').size()
            duplicate_groups = duplicate_groups[duplicate_groups > 1]
            duplicates = int((duplicate_groups - 1).sum()) if len(duplicate_groups) > 0 else 0
            
            # Collect sample duplicate records for viewing
            duplicate_records = []
            max_groups_to_show = 20  # Show samples from up to 20 different duplicate groups
            groups_shown = 0
            
            logger.info(f"🔍 [DATA_QUALITY] Site {site}: Found {len(duplicate_groups)} duplicate groups with {duplicates} total duplicate records")
            
            for group_key, count in duplicate_groups.items():
                if groups_shown >= max_groups_to_show:
                    break
                
                # Handle both single timestamp and (timestamp, depth) grouping
                if isinstance(group_key, tuple):  # (timestamp, depth)
                    timestamp, depth = group_key
                    group_records = sdf[(sdf['measurement_timestamp'] == timestamp) & (sdf['depth_cm'] == depth)].copy()
                    group_id = f"{site}_{timestamp.isoformat()}_depth_{depth}cm"
                else:  # single timestamp
                    timestamp = group_key
                    group_records = sdf[sdf['measurement_timestamp'] == timestamp].copy()
                    group_id = f"{site}_{timestamp.isoformat()}"
                
                # Sort by any available unique identifier
                if 'depth_cm' in group_records.columns:
                    group_records = group_records.sort_values('depth_cm')
                
                # For each group, show up to 5 records as a sample
                max_records_per_group = min(5, count)
                records_added = 0
                
                for idx, (_, record) in enumerate(group_records.iterrows()):
                    if records_added >= max_records_per_group:
                        break
                        
                    duplicate_records.append({
                        'timestamp': record['measurement_timestamp'].isoformat() if pd.notna(record['measurement_timestamp']) else None,
                        'site_code': site,
                        'duplicate_group': group_id,
                        'duplicate_index': idx + 1,
                        'total_in_group': count,
                        'value': record.get(value_col) if value_col in record else None,
                        'depth_cm': record.get('depth_cm') if 'depth_cm' in record else None,
                        'raw_record_preview': {
                            k: (v if pd.notna(v) else None) 
                            for k, v in record.to_dict().items() 
                            if pd.notna(v) and k not in ['measurement_timestamp', 'site_code']
                        }
                    })
                    records_added += 1
                
                groups_shown += 1
                
            # Create time buckets for completeness analysis (separate from duplicate detection)
            if expected == 96:
                sdf['bucket'] = sdf['measurement_timestamp'].dt.floor('15min')
            elif expected == 48:
                sdf['bucket'] = sdf['measurement_timestamp'].dt.floor('30min')
            else:
                sdf['bucket'] = sdf['measurement_timestamp'].dt.floor('1H')
            # daily completeness
            sdf['day'] = sdf['measurement_timestamp'].dt.date
            counts = sdf.groupby('day').agg(present=('bucket', lambda x: x.nunique()))
            days_list = []
            total_expected = 0
            total_present = 0
            total_outliers = 0
            total_flatlines = 0
            for day, row in counts.iterrows():
                present = int(row['present'])
                missing = max(0, expected - present)
                # missing hour indices list for clarity
                missing_hours = []
                outliers = 0
                flatlines = 0
                try:
                    # Build expected buckets for the day
                    day_start = datetime(day.year, day.month, day.day)
                    if expected == 96:
                        rng = pd.date_range(day_start, periods=expected, freq='15min', tz=None)
                    elif expected == 48:
                        rng = pd.date_range(day_start, periods=expected, freq='30min', tz=None)
                    else:
                        rng = pd.date_range(day_start, periods=expected, freq='1H', tz=None)
                    observed = set(sdf[sdf['day']==day]['bucket'])
                    missing_list = [ts.isoformat() for ts in rng if ts.to_pydatetime() not in observed]
                    missing_hours = missing_list[:50]  # cap in payload
                    # Outliers/flatlines detection for metric values this day
                    day_mask = (sdf['day'] == day)
                    if value_col in sdf.columns:
                        outliers, flatlines = _detect_outliers_and_flatlines(sdf.loc[day_mask].sort_values('measurement_timestamp'), value_col)
                except Exception:
                    pass
                total_expected += expected
                total_present += present
                total_outliers += outliers
                total_flatlines += flatlines
                days_list.append({ 'date': day.isoformat(), 'present': present, 'expected': expected, 'missing': missing, 'missing_buckets': missing_hours, 'outliers': outliers, 'flatlines': flatlines, 'completeness_pct': round((present/expected)*100, 2) if expected>0 else 0 })
            completeness = round((total_present / total_expected) * 100, 2) if total_expected > 0 else 0
            per_site.append({
                'site_id': site,
                'total_records': int(len(sdf)),
                'completeness_pct': completeness,
                'duplicates': duplicates,
                'duplicate_records': duplicate_records[:50],  # Limit for UI performance
                'total_outliers': total_outliers,
                'total_flatlines': total_flatlines,
                'days': sorted(days_list, key=lambda d: d['date'])
            })

        result = {
            'metadata': {
                'sites': sites,
                'data_type': data_type,
                'start': start.isoformat(),
                'end': end.isoformat(),
                'cadence': cadence or ('1H' if data_type=='water_quality' else '15min'),
                'expected_per_day': expected,
                'metric': metric
            },
            'sites': per_site
        }
        
        # Cache the result
        try:
            cache_service.set(cache_key, result, ttl=6*3600)  # 6 hours in seconds
            logger.info(f"🔥 [DATA_QUALITY] Cached result for sites: {sites}")
        except Exception as cache_error:
            logger.warning(f"[DATA_QUALITY] Cache write failed: {cache_error}")
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"[DATA_QUALITY] summary failed: {e}")
        return jsonify({'error': str(e)}), 500
