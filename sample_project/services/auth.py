from models.user import User

def login(username, password):
    user = User(username)
    return user.authenticate(password)
