"""
Database Date Service - Centralized database date management
Provides dynamic database date calculation instead of hardcoded values
"""

import logging
from datetime import datetime
from typing import Optional
from services.core_data_service import CoreDataService

logger = logging.getLogger(__name__)

class DatabaseDateService:
    """
    Service for getting actual database date ranges dynamically
    Replaces hardcoded dates with real database queries
    """

    def __init__(self):
        self.core_data_service = CoreDataService()
        self._cached_latest_date: Optional[datetime] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl_seconds = 3600  # Cache for 1 hour

    def get_database_latest_date(self, force_refresh: bool = False) -> datetime:
        """
        Get the actual latest date from the database

        Args:
            force_refresh: Force refresh of cached date

        Returns:
            Latest datetime available in the database
        """
        current_time = datetime.now()

        # Check if we have a valid cached date
        if (not force_refresh and
            self._cached_latest_date and
            self._cache_timestamp and
            (current_time - self._cache_timestamp).seconds < self._cache_ttl_seconds):
            logger.debug(f"🎯 Using cached database latest date: {self._cached_latest_date}")
            return self._cached_latest_date

        # Query the actual latest timestamp from water quality data
        latest_date = self._query_latest_database_date()

        # Cache the result
        self._cached_latest_date = latest_date
        self._cache_timestamp = current_time

        logger.info(f"🎯 Retrieved database latest date: {latest_date}")
        return latest_date

    def _query_latest_database_date(self) -> datetime:
        """
        Query the actual latest date from the database

        Returns:
            Latest datetime from water quality measurements
        """
        try:
            # Get a small sample of recent data to find the latest timestamp
            query = """
            SELECT MAX(measurement_timestamp) as latest_timestamp
            FROM impact.water_quality
            WHERE measurement_timestamp IS NOT NULL
            """

            result = self.core_data_service.db.execute_query(query, {})

            if not result.empty and result.iloc[0].get('latest_timestamp'):
                latest_timestamp = result.iloc[0]['latest_timestamp']

                # Handle different timestamp formats
                if isinstance(latest_timestamp, str):
                    # Parse string timestamp
                    try:
                        latest_date = datetime.fromisoformat(latest_timestamp.replace('Z', '+00:00'))
                    except:
                        latest_date = datetime.strptime(latest_timestamp[:19], '%Y-%m-%d %H:%M:%S')
                elif isinstance(latest_timestamp, datetime):
                    latest_date = latest_timestamp
                else:
                    raise ValueError(f"Unexpected timestamp type: {type(latest_timestamp)}")

                # Ensure we have a reasonable date (not too far in future)
                if latest_date > datetime.now():
                    logger.warning(f"⚠️ Latest database date is in future: {latest_date}, using current time")
                    latest_date = datetime.now()

                return latest_date
            else:
                raise ValueError("No valid timestamps found in database")

        except Exception as e:
            logger.error(f"❌ Database query failed: {e}")
            raise

    def get_date_range_for_period(self, period: str) -> tuple[datetime, datetime]:
        """
        Get start and end dates for a given period relative to database latest date

        Args:
            period: Time period (e.g., '1d', '7d', '30d', etc.)

        Returns:
            Tuple of (start_date, end_date)
        """
        from datetime import timedelta

        latest_date = self.get_database_latest_date()

        # Map periods to days
        period_map = {
            '1d': 1, '24h': 1,
            '7d': 7,
            '30d': 30,
            '90d': 90,
            '180d': 180, '6m': 180,
            '365d': 365, '1y': 365
        }

        days_back = period_map.get(period, 90)  # Default to 90 days
        start_date = latest_date - timedelta(days=days_back)

        return start_date, latest_date

    def invalidate_cache(self):
        """Invalidate the cached latest date"""
        self._cached_latest_date = None
        self._cache_timestamp = None
        logger.info("🗑️ Database date cache invalidated")

# Global service instance
database_date_service = DatabaseDateService()