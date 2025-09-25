#!/usr/bin/env python3
"""
Cache Validation Script

Runs a series of checks to validate Nginx proxy cache + Flask ETag integration
for Redox monthly JSON endpoints, and basic normalization behavior.

Usage examples:
  python3 scripts/cache_validation.py \
    --base http://127.0.0.1:5000 \
    --sites S1,S2 \
    --start 2023-01 --end 2023-03 \
    --resolution 2h --fidelity std --max-depths any

What it does:
  1) Picks 3 sample month URLs and fetches each twice; prints status,
     ETag, Cache-Control, and X-Proxy-Cache (if present).
  2) Warms all month URLs (limited concurrency) and summarizes
     X-Proxy-Cache statuses: MISS/HIT/REVALIDATED/STALE/etc.
  3) Normalization smoke test for multi-site JSON endpoint with sites
     order variations to ensure identical behavior.

Note: Point --base to your Nginx host/port (front of Flask) to test proxy cache.
"""

import argparse
import calendar
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


def month_iter(start_ym: str, end_ym: str):
    ys, ms = map(int, start_ym.split('-'))
    ye, me = map(int, end_ym.split('-'))
    y, m = ys, ms
    while y < ye or (y == ye and m <= me):
        last = calendar.monthrange(y, m)[1]
        start_iso = f"{y:04d}-{m:02d}-01T00:00:00+00:00"
        end_iso = f"{y:04d}-{m:02d}-{last:02d}T23:59:59.999000+00:00"
        yield (y, m, start_iso, end_iso)
        m += 1
        if m > 12:
            m = 1
            y += 1


def build_redox_url(base, site, start_iso, end_iso, resolution, fidelity, max_depths):
    params = {
        'siteId': site,
        'startTs': start_iso,
        'endTs': end_iso,
        'resolution': resolution,
        'maxDepths': max_depths,
        'max_fidelity': 'true' if fidelity == 'max' else 'false',
    }
    return f"{base}/api/v1/redox_analysis/processed/time_series?{urlencode(params)}"


def fetch_headers(url, accept_json=True, timeout=120):
    try:
        headers = {'User-Agent': 'cache-validation/1.0'}
        if accept_json:
            headers['Accept'] = 'application/json'
        req = Request(url, headers=headers, method='GET')
        with urlopen(req, timeout=timeout) as resp:
            info = resp.info()
            status = resp.status
            # Extract common headers
            return {
                'status': status,
                'etag': info.get('ETag'),
                'cache_control': info.get('Cache-Control'),
                'x_proxy_cache': info.get('X-Proxy-Cache'),
                'content_length': info.get('Content-Length'),
            }
    except HTTPError as e:
        return {'status': e.code, 'error': str(e)}
    except URLError as e:
        return {'status': None, 'error': str(e)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:5000')
    ap.add_argument('--sites', default='S1,S2')
    ap.add_argument('--start', required=True)
    ap.add_argument('--end', required=True)
    ap.add_argument('--resolution', default='2h')
    ap.add_argument('--fidelity', default='std', choices=['std', 'max'])
    ap.add_argument('--max-depths', default='any')
    ap.add_argument('--parallel', type=int, default=4)
    args = ap.parse_args()

    sites = [s.strip().upper() for s in args.sites.split(',') if s.strip()]
    months = list(month_iter(args.start, args.end))
    if not months:
        print('No months to process (check --start/--end)', file=sys.stderr)
        sys.exit(1)

    # 1) Sample two-step fetch on first 3 URLs
    print('=== Step 1: Sample two-step fetch (should see MISS then HIT/REVALIDATED) ===')
    samples = []
    for site in sites[:2]:
        y, m, start_iso, end_iso = months[0]
        url = build_redox_url(args.base, site, start_iso, end_iso, args.resolution, args.fidelity, args.max_depths)
        samples.append((site, f"{y}-{m:02d}", url))
    if len(months) > 1 and len(sites) > 0:
        y, m, start_iso, end_iso = months[1]
        url = build_redox_url(args.base, sites[0], start_iso, end_iso, args.resolution, args.fidelity, args.max_depths)
        samples.append((sites[0], f"{y}-{m:02d}", url))

    for site, tag, url in samples:
        h1 = fetch_headers(url)
        h2 = fetch_headers(url)
        print(f"[Sample] site={site} month={tag}\n  1st: status={h1.get('status')} etag={h1.get('etag')} X-Proxy-Cache={h1.get('x_proxy_cache')} Cache-Control={h1.get('cache_control')}\n  2nd: status={h2.get('status')} etag={h2.get('etag')} X-Proxy-Cache={h2.get('x_proxy_cache')} Cache-Control={h2.get('cache_control')}")

    # 2) Warm all URLs and summarize statuses
    print('\n=== Step 2: Warm all monthly URLs (summarize X-Proxy-Cache) ===')
    urls = [
        build_redox_url(args.base, site, start_iso, end_iso, args.resolution, args.fidelity, args.max_depths)
        for site in sites
        for _, _, start_iso, end_iso in months
    ]
    counts = {}
    with ThreadPoolExecutor(max_workers=max(1, args.parallel)) as ex:
        futs = {ex.submit(fetch_headers, u): u for u in urls}
        for fut in as_completed(futs):
            res = fut.result()
            key = res.get('x_proxy_cache') or f"STATUS_{res.get('status')}"
            counts[key] = counts.get(key, 0) + 1
    total = sum(counts.values())
    print('Cache status summary:')
    for k, v in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
        print(f"  {k:14s} : {v}")
    print(f"  TOTAL          : {total}")

    # 3) Normalization smoke test for multi-site endpoint (/redox_analysis/data)
    print('\n=== Step 3: Normalization test (multi-site JSON endpoint) ===')
    if len(sites) >= 2:
        multi_a = f"{args.base}/api/v1/redox_analysis/data?time_range=90d&sites={sites[0]},{sites[1]}"
        multi_b = f"{args.base}/api/v1/redox_analysis/data?time_range=90d&sites={sites[1]},{sites[0]}"
        a1 = fetch_headers(multi_a)
        a2 = fetch_headers(multi_b)
        print(f"A sites={sites[0]},{sites[1]}: status={a1.get('status')} X-Proxy-Cache={a1.get('x_proxy_cache')} ETag={a1.get('etag')}")
        print(f"B sites={sites[1]},{sites[0]}: status={a2.get('status')} X-Proxy-Cache={a2.get('x_proxy_cache')} ETag={a2.get('etag')}")
        print("If normalization is aligned, second call should be HIT/REVALIDATED and share ETag.")
    else:
        print('Skipped (need at least 2 sites)')

    print('\nDone.')


if __name__ == '__main__':
    main()

