"""Test fixtures — run the whole app against a throwaway temp SQLite DB.

Env vars are set BEFORE importing the app so config picks them up (and
load_dotenv won't override already-set vars).
"""
import os
import tempfile
import time

import bcrypt
import jwt
import pytest

# ── Configure a temp DB + known credentials before importing the app ─────────
_TMP_DB = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = f"file:{_TMP_DB}"
os.environ["JWT_SECRET"] = "test-jwt-secret"
os.environ["AUTH_USERNAME"] = "tester"
os.environ["AUTH_PASSWORD_HASH"] = bcrypt.hashpw(b"testpass", bcrypt.gensalt()).decode()
os.environ["WEBHOOK_SECRET"] = "test-webhook-secret"
os.environ["NODE_ENV"] = "development"

from sqlmodel import SQLModel, Session  # noqa: E402
from app.database import engine  # noqa: E402
from app import models  # noqa: E402
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

DEFAULT_CATEGORIES = [
    ("Food Delivery", "expense"), ("Groceries", "expense"), ("Shopping", "expense"),
    ("Rent", "expense"), ("ATM Withdrawal", "expense"), ("Misc Expense", "expense"),
    ("Subscriptions", "expense"), ("Transport", "expense"), ("Entertainment", "expense"),
    ("Health", "expense"), ("Fees/Charges", "fee"), ("Salary", "income"),
    ("Interest", "income"), ("Dividends", "income"),
    ("Investment - SIP", "investment"), ("Investment - Mutual Fund", "investment"),
    ("Investment - PPF", "investment"), ("Investment - RD", "investment"),
    ("Credit Card Payment", "transfer"),
]


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for i, (name, ctype) in enumerate(DEFAULT_CATEGORIES):
            s.add(models.Category(id=f"cat-{i}", name=name, type=ctype,
                                  isDefault=True, icon="circle", color="#6B7280"))
        s.add(models.Account(id="default-savings", name="HDFC Savings", type="savings",
                             accountNumberMasked="XXXXXXXX8085", bankName="HDFC",
                             createdAt="2026-01-01T00:00:00.000Z"))
        s.commit()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def token():
    now = int(time.time())
    return jwt.encode({"username": "tester", "iat": now, "exp": now + 3600},
                      "test-jwt-secret", algorithm="HS256")


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}"}
