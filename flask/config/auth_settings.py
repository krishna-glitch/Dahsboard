import os

# Authentication database settings
AUTH_DATABASE_URL = os.environ.get("AUTH_DATABASE_URL", "sqlite:///./auth.db")
