from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from flask_login import UserMixin

DATABASE_URL = "sqlite:///./auth.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

AuthSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

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
