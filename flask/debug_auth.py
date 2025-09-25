from auth_database import AuthSessionLocal, User
from services.new_auth_service import NewAuthService
from services.new_user_management import NewUserManager
from passlib.context import CryptContext

# Initialize services
auth_service = NewAuthService()
user_manager = NewUserManager()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def debug_auth_process():
    db = AuthSessionLocal()
    try:
        test_username = "debuguser"
        test_password = "debugpassword"

        # Clean up any previous debuguser
        existing_user = user_manager.get_user_by_username(db, test_username)
        if existing_user:
            print(f"Deleting existing user: {test_username}")
            db.delete(existing_user)
            db.commit()

        # Create a new user
        print(f"Creating user: {test_username} with password: {test_password}")
        created_user = user_manager.create_user(db, test_username, test_password)
        print(f"User created. Hashed password: {created_user.hashed_password}")

        # Attempt to authenticate
        print(f"Attempting to authenticate user: {test_username} with password: {test_password}")
        success, authenticated_user = auth_service.authenticate_user(db, test_username, test_password)

        if success:
            print(f"Authentication successful for {authenticated_user.username}!")
        else:
            print(f"Authentication FAILED for {test_username}.")
            # Detailed check
            user_from_db = user_manager.get_user_by_username(db, test_username)
            if user_from_db:
                print(f"User found in DB. Stored hash: {user_from_db.hashed_password}")
                if not pwd_context.verify(test_password, user_from_db.hashed_password):
                    print("Password verification failed using pwd_context.verify.")
                else:
                    print("Password verification succeeded using pwd_context.verify (this should not happen if auth_service failed).")
            else:
                print("User not found in DB after creation (this indicates a major issue).")

    except Exception as e:
        print(f"An error occurred during debug_auth_process: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    debug_auth_process()
