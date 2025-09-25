from sqlalchemy.orm import Session
from auth_database import User
from services.new_auth_service import NewAuthService

class NewUserManager:
    def __init__(self):
        self.auth_service = NewAuthService()

    def get_user_by_username(self, db: Session, username: str):
        return db.query(User).filter(User.username == username).first()

    def get_user_by_id(self, db: Session, user_id: int):
        return db.query(User).filter(User.id == user_id).first()

    def create_user(self, db: Session, username: str, password: str):
        hashed_password = self.auth_service.get_password_hash(password)
        db_user = User(username=username, hashed_password=hashed_password)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
