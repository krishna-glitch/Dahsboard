"""
S3 Service (Placeholder/Demo)

Provides minimal list and presigned URL operations. If AWS configuration is not
present, returns deterministic demo data so the UI can be demoed safely.
"""
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

def _aws_client():
    try:
        import boto3  # type: ignore
    except Exception:
        return None
    try:
        return boto3.client('s3', region_name=os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION'))
    except Exception:
        return None

def is_configured() -> bool:
    return bool(os.getenv('S3_BUCKET_NAME'))

def list_objects(prefix: str = '', token: Optional[str] = None, page_size: int = 50) -> Dict[str, Any]:
    """List S3 objects or return demo objects when not configured."""
    if not is_configured():
        # Demo payload
        now = datetime.utcnow()
        demo_items = [
            {
                'key': f'demo/{i:02d}_sample.csv',
                'size': 1024 * (i + 1),
                'lastModified': (now - timedelta(days=i)).isoformat() + 'Z',
                'contentType': 'text/csv'
            }
            for i in range(1, 11)
        ]
        return { 'items': demo_items, 'nextToken': None, 'configured': False }

    bucket = os.getenv('S3_BUCKET_NAME')
    client = _aws_client()
    if client is None:
        return { 'items': [], 'nextToken': None, 'configured': False }
    kwargs = {
        'Bucket': bucket,
        'Prefix': prefix or ''
    }
    if token:
        kwargs['ContinuationToken'] = token
    if page_size:
        kwargs['MaxKeys'] = page_size
    try:
        resp = client.list_objects_v2(**kwargs)
        contents = resp.get('Contents', []) or []
        items = []
        for obj in contents:
            items.append({
                'key': obj.get('Key'),
                'size': obj.get('Size'),
                'lastModified': obj.get('LastModified').isoformat() if obj.get('LastModified') else None,
                'contentType': None
            })
        return {
            'items': items,
            'nextToken': resp.get('NextContinuationToken'),
            'configured': True
        }
    except Exception:
        # Fail safe to empty list
        return { 'items': [], 'nextToken': None, 'configured': False }

def generate_presigned_get_url(key: str, expires_in: int = 600) -> str:
    if not is_configured():
        # Demo URL
        return f'https://example.com/demo-get/{key}?expires_in={expires_in}'
    bucket = os.getenv('S3_BUCKET_NAME')
    client = _aws_client()
    if client is None:
        return f'https://example.com/demo-get/{key}'
    try:
        return client.generate_presigned_url(
            'get_object', Params={'Bucket': bucket, 'Key': key}, ExpiresIn=expires_in
        )
    except Exception:
        return f'https://example.com/demo-get/{key}'

def generate_presigned_put_url(key: str, content_type: Optional[str] = None, expires_in: int = 600) -> Dict[str, Any]:
    if not is_configured():
        # Demo PUT URL descriptor
        return {
            'url': f'https://example.com/demo-put/{key}',
            'method': 'PUT',
            'headers': { 'Content-Type': content_type or 'application/octet-stream' }
        }
    bucket = os.getenv('S3_BUCKET_NAME')
    client = _aws_client()
    if client is None:
        return {
            'url': f'https://example.com/demo-put/{key}',
            'method': 'PUT',
            'headers': { 'Content-Type': content_type or 'application/octet-stream' }
        }
    try:
        url = client.generate_presigned_url(
            'put_object', Params={'Bucket': bucket, 'Key': key, 'ContentType': content_type or 'application/octet-stream'}, ExpiresIn=expires_in
        )
        return { 'url': url, 'method': 'PUT', 'headers': { 'Content-Type': content_type or 'application/octet-stream' } }
    except Exception:
        return {
            'url': f'https://example.com/demo-put/{key}',
            'method': 'PUT',
            'headers': { 'Content-Type': content_type or 'application/octet-stream' }
        }

