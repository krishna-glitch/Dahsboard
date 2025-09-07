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
        q = DataQuery(sites=sites, start_date=start, end_date=end, days_back=(end-start).days+1)
        if data_type == 'redox':
            result = core_data_service._load_redox_data(q)
        else:
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
        
        cached_result = cache_service.get_cached_data(cache_key)
        if cached_result:
            logger.info(f"🚀 [DATA_QUALITY] Cache hit for sites: {sites}")
            return jsonify(cached_result), 200

        alias = {'1d':1,'7d':7,'30d':30,'90d':90,'180d':180,'365d':365}
        if end_str:
            end = datetime.fromisoformat(end_str.replace('Z','+00:00'))
        else:
            # Determine latest timestamp for data_type
            if data_type == 'redox':
                q = """
                    SELECT MAX(re.measurement_timestamp) AS latest
                    FROM impact.redox_event re
                    JOIN impact.site s ON re.site_id::varchar = s.site_id
                    WHERE s.code IN :sites
                """
            else:
                q = """
                    SELECT MAX(wq.measurement_timestamp) AS latest
                    FROM impact.water_quality wq
                    JOIN impact.site s ON wq.site_id = s.site_id
                    WHERE s.code IN :sites
                """
            latest_df = core_data_service.db.execute_query(q, {'sites': sites})
            end = pd.to_datetime(latest_df['latest'].iloc[0]).to_pydatetime() if not latest_df.empty and pd.notna(latest_df['latest'].iloc[0]) else datetime.utcnow()
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

        # Round timestamps to expected granularity for duplicate detection
        if expected == 96:
            df['bucket'] = df['measurement_timestamp'].dt.floor('15min')
        elif expected == 48:
            df['bucket'] = df['measurement_timestamp'].dt.floor('30min')
        else:
            df['bucket'] = df['measurement_timestamp'].dt.floor('1H')

        value_col = _metric_column_for(data_type, metric)
        for site in sites:
            sdf = df[df['site_code'] == site]
            if sdf.empty:
                per_site.append({
                    'site_id': site,
                    'total_records': 0,
                    'completeness_pct': 0,
                    'duplicates': 0,
                    'days': [],
                    'total_outliers': 0,
                    'total_flatlines': 0
                })
                continue
            # duplicates at bucket level
            dup_counts = sdf.groupby('bucket').size()
            duplicates = int((dup_counts - 1).clip(lower=0).sum())
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
            cache_service.cache_data(cache_key, result, ttl_hours=6)
            logger.info(f"🔥 [DATA_QUALITY] Cached result for sites: {sites}")
        except Exception as cache_error:
            logger.warning(f"[DATA_QUALITY] Cache write failed: {cache_error}")
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"[DATA_QUALITY] summary failed: {e}")
        return jsonify({'error': str(e)}), 500
