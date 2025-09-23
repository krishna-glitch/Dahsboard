import os

# Database settings
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./local_database.db")
