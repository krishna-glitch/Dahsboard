#!/usr/bin/env bash
set -euo pipefail

# Config
BASE_URL=${BASE_URL:-"http://127.0.0.1:5000"}
SITES=${SITES:-"S1,S2,S3,S4"}
START_YM=${START_YM:-"2023-01"}
END_YM=${END_YM:-"2023-12"}
RESOLUTION=${RESOLUTION:-"2h"}   # Use "auto" to let the generator decide
FIDELITY=${FIDELITY:-"std"}      # std|max
MAX_DEPTHS=${MAX_DEPTHS:-"any"}
PARALLEL=${PARALLEL:-4}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating URLs to prewarm…" >&2
URLS=$(python3 "$SCRIPT_DIR/generate_redox_prewarm_urls.py" \
  --base "$BASE_URL" \
  --sites "$SITES" \
  --start "$START_YM" \
  --end "$END_YM" \
  --resolution "$RESOLUTION" \
  --fidelity "$FIDELITY" \
  --max-depths "$MAX_DEPTHS")

COUNT=$(echo "$URLS" | grep -cE '^http')
echo "Warming $COUNT URLs with $PARALLEL-way concurrency" >&2

echo "$URLS" | xargs -n1 -P"$PARALLEL" -I{} bash -c \
  'curl -s -m 120 -H "Accept: application/json" -o /dev/null -D - "{}" | grep -i "^X-Proxy-Cache" || true'

echo "Done." >&2

