#!/usr/bin/env bash
set -euo pipefail

# Prewarm both fidelities (2h std + raw max) for monthly windows
#
# Env:
#   BASE_URL   : API base (e.g., http://localhost:8080 or http://api.example.com)
#   SITES      : Comma-separated site codes (default: S1,S2,S3,S4)
#   START_YM   : Start YYYY-MM (inclusive)
#   END_YM     : End YYYY-MM (inclusive)
#   PARALLEL   : xargs concurrency (default: 4)

BASE_URL=${BASE_URL:-"http://127.0.0.1:5000"}
SITES=${SITES:-"S1,S2,S3,S4"}
START_YM=${START_YM:-"2023-01"}
END_YM=${END_YM:-"2023-12"}
PARALLEL=${PARALLEL:-4}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating BOTH fidelity URLs…" >&2
URLS=$(python3 "$SCRIPT_DIR/generate_redox_prewarm_urls.py" \
  --base "$BASE_URL" \
  --sites "$SITES" \
  --start "$START_YM" \
  --end "$END_YM" \
  --both)

COUNT=$(echo "$URLS" | grep -cE '^http')
echo "Warming $COUNT URLs with $PARALLEL-way concurrency" >&2

echo "$URLS" | xargs -n1 -P"$PARALLEL" -I{} bash -c \
  'curl -s -m 120 -H "Accept: application/json" -o /dev/null -D - "{}" | grep -i "^X-Proxy-Cache" || true'

echo "Done." >&2

