from flask import Flask
from routes import users
from services.auth import login
from database import connect

app = Flask(__name__)

if __name__ == "__main__":
    connect()
    app.run()
