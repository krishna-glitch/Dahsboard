#!/usr/bin/env python3
"""
Generate canonical JSON URLs for prewarming the Nginx/Flask cache.

Usage:
  # Standard fidelity (2h) for a year
  python scripts/generate_redox_prewarm_urls.py \
    --base http://localhost:5000 \
    --sites S1,S2,S3,S4 \
    --start 2023-01 --end 2023-12 \
    --resolution auto --fidelity std --max-depths any \
    > urls_std.txt

  # Max fidelity (raw ~15min) for a year (Arrow recommended)
  python scripts/generate_redox_prewarm_urls.py \
    --base http://localhost:5000 \
    --sites S1,S2,S3,S4 \
    --start 2023-01 --end 2023-12 \
    --resolution raw --fidelity max --format arrow \
    > urls_max.txt

  # Both fidelities in one run
  python scripts/generate_redox_prewarm_urls.py ... --both > urls_all.txt

Then warm:
  xargs -n1 -P4 -I{} curl -sS -m 120 -H 'Accept: application/json' -o /dev/null '{}'
"""

import argparse
import calendar
from datetime import datetime

def month_range_iter(start_ym: str, end_ym: str):
    ys, ms = map(int, start_ym.split('-'))
    ye, me = map(int, end_ym.split('-'))
    y, m = ys, ms
    while y < ye or (y == ye and m <= me):
        last_day = calendar.monthrange(y, m)[1]
        start = f"{y:04d}-{m:02d}-01T00:00:00+00:00"
        end = f"{y:04d}-{m:02d}-{last_day:02d}T23:59:59.999000+00:00"
        yield (y, m, start, end)
        m += 1
        if m > 12:
            m = 1
            y += 1

def res_for_range(tag: str) -> str:
    # Keep aligned with frontend/backend mapping
    mapping = {
        '1d': '15min', '7d': '15min', '30d': '30min', '90d': '2h', '180d': '6h', '365d': '2h'
    }
    return mapping.get(tag, 'raw')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5000', help='API base origin (no trailing slash)')
    ap.add_argument('--sites', default='S1,S2', help='Comma-separated site codes')
    ap.add_argument('--start', required=True, help='Start year-month (YYYY-MM) inclusive')
    ap.add_argument('--end', required=True, help='End year-month (YYYY-MM) inclusive')
    ap.add_argument('--resolution', default='auto', help='Resolution (auto|15min|30min|2h|6h|raw)')
    ap.add_argument('--fidelity', default='std', choices=['std','max'])
    ap.add_argument('--max-depths', default='any')
    ap.add_argument('--format', default='columnar', choices=['columnar','arrow'], help='Preferred wire format')
    ap.add_argument('--both', action='store_true', help='Emit both fidelities (std 2h and max raw)')
    args = ap.parse_args()

    sites = [s.strip().upper() for s in args.sites.split(',') if s.strip()]
    fid = 'true' if args.fidelity == 'max' else 'false'

    # Redox processed time series (JSON/columnar)
    # Endpoint: /api/v1/redox_analysis/processed/time_series
    # Params: siteId (single site per request), startTs, endTs, resolution, maxDepths, maxFidelity

    def emit(site, start_iso, end_iso, res, fid_flag, fmt):
        return (
            f"{args.base}/api/v1/redox_analysis/processed/time_series?"
            f"site_id={site}&start_ts={start_iso}&end_ts={end_iso}"
            f"&resolution={res}&max_depths={args.max_depths}&max_fidelity={fid_flag}"
            f"&format={fmt}"
        )

    for site in sorted(set(sites)):
        for _, _, start_iso, end_iso in month_range_iter(args.start, args.end):
            if args.both:
                # std 2h
                print(emit(site, start_iso, end_iso, '2h', 'false', 'columnar'))
                # max raw (arrow)
                print(emit(site, start_iso, end_iso, 'raw', 'true', 'arrow'))
            else:
                res = args.resolution
                if res == 'auto':
                    res = '2h'
                print(emit(site, start_iso, end_iso, res, fid, args.format))

    # Add water quality (optional):
    # Endpoint: /api/v1/water_quality/data time_range=custom&start_date=&end_date=&sites=
    # for now keep focus on redox processed slices that dominate usage

if __name__ == '__main__':
    main()
