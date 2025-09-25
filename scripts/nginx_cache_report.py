#!/usr/bin/env python3
"""
Summarize Nginx cache effectiveness from JSON access log.

Usage:
  python3 scripts/nginx_cache_report.py /var/log/nginx/wq_access.json [--since 24h]

Outputs counts and ratios of HIT/MISS/REVALIDATED/STALE and top URIs.
"""
import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta

def parse_time(t: str) -> datetime:
    # Nginx $time_iso8601 example: 2025-09-10T12:34:56+00:00
    try:
        return datetime.fromisoformat(t.replace('Z', '+00:00'))
    except Exception:
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('logfile')
    ap.add_argument('--since', default='24h', help='Window, e.g., 24h, 7d')
    args = ap.parse_args()

    unit = args.since[-1].lower()
    val = int(args.since[:-1]) if args.since[:-1].isdigit() else 24
    delta = timedelta(hours=val) if unit == 'h' else timedelta(days=val)
    cutoff = datetime.now(tz=None) - delta

    status_counts = Counter()
    by_uri = Counter()
    total = 0

    with open(args.logfile, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            t = parse_time(rec.get('time') or '')
            if t and t < cutoff:
                continue
            st = (rec.get('upstream_cache') or '').upper() or 'NONE'
            status_counts[st] += 1
            # focus on API
            uri = rec.get('uri') or ''
            if uri.startswith('/api'):
                by_uri[uri.split('?')[0]] += 1
            total += 1

    print('Cache status summary:')
    for k, v in status_counts.most_common():
        ratio = (v / total * 100) if total else 0
        print(f'  {k:12s}: {v:6d}  ({ratio:5.1f}%)')
    print(f'  TOTAL       : {total}')
    print('\nTop API URIs:')
    for uri, n in by_uri.most_common(15):
        print(f'  {n:6d}  {uri}')

if __name__ == '__main__':
    main()

