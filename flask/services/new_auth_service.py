from passlib.context import CryptContext
from sqlalchemy.orm import Session
from auth_database import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class NewAuthService:
    def verify_password(self, plain_password, hashed_password):
        return pwd_context.verify(plain_password, hashed_password)

    def get_password_hash(self, password):
        return pwd_context.hash(password)

    def authenticate_user(self, db: Session, username: str, password: str):
        user = db.query(User).filter(User.username == username).first()
        if not user:
            return False, None
        if not self.verify_password(password, user.hashed_password):
            return False, None
        return True, user
