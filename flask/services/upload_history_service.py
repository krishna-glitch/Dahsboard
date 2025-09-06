"""
Upload History Service
Manages tracking and retrieval of file upload history
"""

import json
import os
import fcntl
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

from config.advanced_logging_config import get_advanced_logger

logger = get_advanced_logger(__name__)

class UploadHistoryService:
    """
    Service for tracking file upload history using JSON file storage
    In production, this would use a proper database
    """
    
    def __init__(self, history_file_path: str = None):
        """
        Initialize upload history service
        
        Args:
            history_file_path: Path to the history JSON file
        """
        # Create uploads directory if it doesn't exist
        self.uploads_dir = Path(__file__).parent.parent / 'uploads'
        self.uploads_dir.mkdir(exist_ok=True)
        
        # History file path
        if history_file_path:
            self.history_file = Path(history_file_path)
        else:
            self.history_file = self.uploads_dir / 'upload_history.json'
        
        # Ensure history file exists
        if not self.history_file.exists():
            self._initialize_history_file()
    
    def _initialize_history_file(self):
        """Initialize empty history file"""
        try:
            initial_data = {
                'metadata': {
                    'created_at': datetime.now().isoformat(),
                    'version': '1.0',
                    'total_uploads': 0
                },
                'uploads': []
            }
            
            with open(self.history_file, 'w') as f:
                json.dump(initial_data, f, indent=2)
                
            logger.info(f"Initialized upload history file: {self.history_file}")
            
        except Exception as e:
            logger.error(f"Failed to initialize history file: {e}")
            raise
    
    def _read_history(self) -> Dict[str, Any]:
        """Read history data from file with file locking"""
        try:
            with open(self.history_file, 'r') as f:
                # Use file locking to prevent concurrent access issues
                fcntl.flock(f.fileno(), fcntl.LOCK_SH)  # Shared lock for reading
                data = json.load(f)
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)  # Unlock
                return data
                
        except FileNotFoundError:
            logger.warning("History file not found, initializing...")
            self._initialize_history_file()
            return self._read_history()
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in history file: {e}")
            # Backup corrupt file and reinitialize
            backup_file = self.history_file.with_suffix('.json.backup')
            self.history_file.rename(backup_file)
            logger.info(f"Backed up corrupt file to: {backup_file}")
            self._initialize_history_file()
            return self._read_history()
            
        except Exception as e:
            logger.error(f"Error reading history file: {e}")
            raise
    
    def _write_history(self, data: Dict[str, Any]):
        """Write history data to file with file locking"""
        try:
            # Update metadata
            data['metadata']['last_updated'] = datetime.now().isoformat()
            data['metadata']['total_uploads'] = len(data['uploads'])
            
            with open(self.history_file, 'w') as f:
                # Use exclusive lock for writing
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                json.dump(data, f, indent=2, default=str)
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                
        except Exception as e:
            logger.error(f"Error writing history file: {e}")
            raise
    
    def add_upload_record(self, 
                         filename: str,
                         data_type: str,
                         status: str,
                         records_processed: int = 0,
                         validation_errors: int = 0,
                         security_issues: int = 0,
                         file_size_bytes: int = 0,
                         user: str = 'unknown') -> str:
        """
        Add new upload record to history
        
        Args:
            filename: Name of uploaded file
            data_type: Type of data (water_quality, redox, etc.)
            status: Upload status (success, failed, etc.)
            records_processed: Number of records processed
            validation_errors: Number of validation errors
            security_issues: Number of security issues found
            file_size_bytes: File size in bytes
            user: Username who uploaded the file
            
        Returns:
            Upload record ID
        """
        try:
            # Read current history
            history_data = self._read_history()
            
            # Generate new ID
            next_id = max([upload.get('id', 0) for upload in history_data['uploads']], default=0) + 1
            
            # Create upload record
            upload_record = {
                'id': next_id,
                'filename': filename,
                'data_type': data_type,
                'status': status,
                'records_processed': records_processed,
                'validation_errors': validation_errors,
                'security_issues_found': security_issues,
                'file_size_bytes': file_size_bytes,
                'uploaded_at': datetime.now().isoformat(),
                'uploaded_by': user,
                'processing_details': {
                    'has_validation_errors': validation_errors > 0,
                    'has_security_issues': security_issues > 0,
                    'success_rate': self._calculate_success_rate(records_processed, validation_errors)
                }
            }
            
            # Add to history
            history_data['uploads'].insert(0, upload_record)  # Insert at beginning for recent-first order
            
            # Limit history size (keep last 1000 uploads)
            if len(history_data['uploads']) > 1000:
                history_data['uploads'] = history_data['uploads'][:1000]
            
            # Write updated history
            self._write_history(history_data)
            
            logger.info(f"Added upload record: {filename} (ID: {next_id})")
            return str(next_id)
            
        except Exception as e:
            logger.error(f"Error adding upload record: {e}")
            raise
    
    def get_upload_history(self, 
                          limit: int = 50,
                          status_filter: str = 'all',
                          data_type_filter: str = 'all',
                          days_back: int = 30) -> Dict[str, Any]:
        """
        Get upload history with filtering options
        
        Args:
            limit: Maximum number of records to return
            status_filter: Filter by status (all, success, failed, etc.)
            data_type_filter: Filter by data type (all, water_quality, etc.)
            days_back: Number of days back to look
            
        Returns:
            Dictionary containing upload history and metadata
        """
        try:
            # Read history data
            history_data = self._read_history()
            uploads = history_data['uploads']
            
            # Filter by date
            cutoff_date = datetime.now() - timedelta(days=days_back)
            uploads = [
                upload for upload in uploads
                if datetime.fromisoformat(upload['uploaded_at'].replace('Z', '+00:00')) >= cutoff_date
            ]
            
            # Filter by status
            if status_filter != 'all':
                uploads = [upload for upload in uploads if upload.get('status') == status_filter]
            
            # Filter by data type
            if data_type_filter != 'all':
                uploads = [upload for upload in uploads if upload.get('data_type') == data_type_filter]
            
            # Limit results
            limited_uploads = uploads[:limit]
            
            # Calculate statistics
            stats = self._calculate_history_stats(uploads)
            
            return {
                'uploads': limited_uploads,
                'total_count': len(uploads),
                'returned_count': len(limited_uploads),
                'filters': {
                    'status_filter': status_filter,
                    'data_type_filter': data_type_filter,
                    'days_back': days_back
                },
                'statistics': stats,
                'metadata': {
                    'generated_at': datetime.now().isoformat(),
                    'history_file_size': self._get_file_size(),
                    'total_history_records': len(history_data['uploads'])
                }
            }
            
        except Exception as e:
            logger.error(f"Error retrieving upload history: {e}")
            raise
    
    def get_upload_record(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Get specific upload record by ID"""
        try:
            history_data = self._read_history()
            
            for upload in history_data['uploads']:
                if str(upload.get('id')) == str(upload_id):
                    return upload
                    
            return None
            
        except Exception as e:
            logger.error(f"Error retrieving upload record {upload_id}: {e}")
            return None
    
    def delete_upload_record(self, upload_id: str) -> bool:
        """Delete upload record by ID"""
        try:
            history_data = self._read_history()
            
            # Find and remove the upload
            original_count = len(history_data['uploads'])
            history_data['uploads'] = [
                upload for upload in history_data['uploads']
                if str(upload.get('id')) != str(upload_id)
            ]
            
            # Check if anything was removed
            if len(history_data['uploads']) < original_count:
                self._write_history(history_data)
                logger.info(f"Deleted upload record: {upload_id}")
                return True
            else:
                logger.warning(f"Upload record not found: {upload_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error deleting upload record {upload_id}: {e}")
            return False
    
    def cleanup_old_records(self, days_to_keep: int = 90) -> int:
        """Clean up old upload records"""
        try:
            history_data = self._read_history()
            original_count = len(history_data['uploads'])
            
            # Keep records newer than cutoff date
            cutoff_date = datetime.now() - timedelta(days=days_to_keep)
            history_data['uploads'] = [
                upload for upload in history_data['uploads']
                if datetime.fromisoformat(upload['uploaded_at'].replace('Z', '+00:00')) >= cutoff_date
            ]
            
            removed_count = original_count - len(history_data['uploads'])
            
            if removed_count > 0:
                self._write_history(history_data)
                logger.info(f"Cleaned up {removed_count} old upload records")
                
            return removed_count
            
        except Exception as e:
            logger.error(f"Error cleaning up old records: {e}")
            return 0
    
    def _calculate_success_rate(self, records_processed: int, validation_errors: int) -> float:
        """Calculate success rate percentage"""
        if records_processed == 0:
            return 0.0
        return round(((records_processed - validation_errors) / records_processed) * 100, 2)
    
    def _calculate_history_stats(self, uploads: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate statistics for upload history"""
        if not uploads:
            return {
                'total_uploads': 0,
                'successful_uploads': 0,
                'failed_uploads': 0,
                'total_records_processed': 0,
                'total_validation_errors': 0,
                'average_success_rate': 0.0,
                'data_types': {},
                'recent_activity': []
            }
        
        # Calculate basic stats
        total_uploads = len(uploads)
        successful_uploads = len([u for u in uploads if u.get('status', '').startswith('success')])
        failed_uploads = len([u for u in uploads if u.get('status') == 'failed'])
        
        total_records = sum(u.get('records_processed', 0) for u in uploads)
        total_errors = sum(u.get('validation_errors', 0) for u in uploads)
        
        # Calculate average success rate
        success_rates = [
            u.get('processing_details', {}).get('success_rate', 0) 
            for u in uploads if u.get('records_processed', 0) > 0
        ]
        avg_success_rate = round(sum(success_rates) / len(success_rates), 2) if success_rates else 0.0
        
        # Count data types
        data_types = {}
        for upload in uploads:
            data_type = upload.get('data_type', 'unknown')
            data_types[data_type] = data_types.get(data_type, 0) + 1
        
        # Recent activity (last 7 days by day)
        recent_activity = self._calculate_recent_activity(uploads)
        
        return {
            'total_uploads': total_uploads,
            'successful_uploads': successful_uploads,
            'failed_uploads': failed_uploads,
            'total_records_processed': total_records,
            'total_validation_errors': total_errors,
            'average_success_rate': avg_success_rate,
            'data_types': data_types,
            'recent_activity': recent_activity
        }
    
    def _calculate_recent_activity(self, uploads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Calculate daily upload activity for the last 7 days"""
        activity = []
        
        for days_ago in range(7):
            date = datetime.now() - timedelta(days=days_ago)
            date_str = date.strftime('%Y-%m-%d')
            
            # Count uploads for this day
            day_uploads = [
                u for u in uploads
                if u.get('uploaded_at', '').startswith(date_str)
            ]
            
            activity.append({
                'date': date_str,
                'day_name': date.strftime('%A'),
                'upload_count': len(day_uploads),
                'records_processed': sum(u.get('records_processed', 0) for u in day_uploads)
            })
        
        return activity
    
    def _get_file_size(self) -> int:
        """Get history file size in bytes"""
        try:
            return self.history_file.stat().st_size
        except (OSError, FileNotFoundError, AttributeError) as e:
            logger.debug(f"Failed to get file size: {e}")
            return 0
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get service health status"""
        try:
            history_data = self._read_history()
            file_size = self._get_file_size()
            
            return {
                'service_status': 'healthy',
                'history_file_exists': self.history_file.exists(),
                'history_file_size_bytes': file_size,
                'history_file_size_kb': round(file_size / 1024, 2),
                'total_records': len(history_data['uploads']),
                'last_upload': history_data['uploads'][0]['uploaded_at'] if history_data['uploads'] else None,
                'service_initialized_at': history_data['metadata'].get('created_at'),
                'last_updated': history_data['metadata'].get('last_updated')
            }
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                'service_status': 'unhealthy',
                'error': str(e),
                'history_file_exists': self.history_file.exists()
            }


# Global service instance
upload_history_service = UploadHistoryService()