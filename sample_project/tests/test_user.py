from models.user import User

def test_user():
    assert User("x").authenticate("y")
