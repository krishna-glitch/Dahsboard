import json
from sqlalchemy.orm import Session
from auth_database import engine, Base, User, AuthSessionLocal
from services.new_auth_service import NewAuthService

Base.metadata.create_all(bind=engine)

db = AuthSessionLocal()
auth_service = NewAuthService()

with open('services/_data/users.json') as f:
    users = json.load(f)

for username, user_data in users.items():
    db_user = db.query(User).filter(User.username == username).first()
    if not db_user:
        hashed_password = auth_service.get_password_hash(user_data['password'])
        db_user = User(username=username, hashed_password=hashed_password)
        db.add(db_user)

db.commit()
