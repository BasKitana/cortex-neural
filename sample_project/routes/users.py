from services.auth import login
from utils.helpers import ok

def register():
    return ok(login("a", "b"))
