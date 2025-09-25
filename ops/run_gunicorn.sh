#!/usr/bin/env bash
set -euo pipefail

# Local/dev helper to run gunicorn using repo paths

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR/flask"

if ! command -v gunicorn >/dev/null 2>&1; then
  echo "gunicorn not found. Install with: pip install gunicorn" >&2
  exit 1
fi

exec gunicorn -c "$ROOT_DIR/ops/gunicorn/gunicorn.conf.py" flask.wsgi:app

