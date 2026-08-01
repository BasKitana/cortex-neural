class User:
    def __init__(self, name):
        self.name = name

    def authenticate(self, password):
        return bool(password)
