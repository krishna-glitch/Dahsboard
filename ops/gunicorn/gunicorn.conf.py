# Gunicorn config for the Flask API

import multiprocessing

# Bind to localhost; Nginx proxies to this
bind = "127.0.0.1:5000"

# Workers and threads: start modestly; tune by CPU/memory
workers = max(2, multiprocessing.cpu_count() // 2)
threads = 2
worker_class = "gthread"

# Timeouts tuned for heavy analytical queries
timeout = 300
graceful_timeout = 30
keepalive = 15

# Logging
accesslog = "-"  # stdout
errorlog = "-"    # stderr
loglevel = "info"

# App entrypoint
wsgi_app = "flask.wsgi:app"

