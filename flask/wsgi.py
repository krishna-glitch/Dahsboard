"""WSGI entrypoint for production servers (gunicorn/uwsgi).

Usage:
  gunicorn -c ops/gunicorn/gunicorn.conf.py flask.wsgi:app
"""

from app import create_app

app = create_app()

