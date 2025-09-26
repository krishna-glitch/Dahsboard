import os
from sqlalchemy import create_engine, Column, Integer, String, Boolean, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from flask_login import UserMixin


DATABASE_URL = os.getenv("AUTH_DATABASE_URL", "sqlite:///./auth.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

AuthSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

if DATABASE_URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute('PRAGMA journal_mode=WAL;')
        cursor.execute('PRAGMA foreign_keys=ON;')
        cursor.close()

Base = declarative_base()

class User(Base, UserMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)

    def get_id(self):
        return str(self.id)

Base.metadata.create_all(bind=engine)
