#!/usr/bin/env bash
set -euo pipefail

# Config
WORKERS=${WORKERS:-4}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Warming caches using internal prewarmer (workers=${WORKERS})" >&2
python3 "$SCRIPT_DIR/warm_api_cache.py" --workers "$WORKERS"

echo "Done." >&2
