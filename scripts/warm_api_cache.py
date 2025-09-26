#!/usr/bin/env python3
"""Warm backend caches by invoking the internal cache prewarmer."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / 'flask') not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / 'flask'))

from app import create_app  # type: ignore
from services.cache_prewarmer import cache_prewarmer


def main() -> int:
    parser = argparse.ArgumentParser(description="Warm common cache patterns using internal services")
    parser.add_argument('--workers', type=int, default=int(os.getenv('CACHE_WARM_WORKERS', '4')),
                        help='Number of worker threads for warming (default: 4)')
    parser.add_argument('--json', action='store_true', help='Emit JSON result to stdout')
    args = parser.parse_args()

    app = create_app()

    with app.app_context():
        result = cache_prewarmer.warm_common_caches(max_workers=max(1, args.workers))

    if args.json:
        json.dump(result, sys.stdout, indent=2)
        sys.stdout.write('\n')
    else:
        print('Cache warming complete:')
        for key, value in result.items():
            print(f"  {key}: {value}")

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
