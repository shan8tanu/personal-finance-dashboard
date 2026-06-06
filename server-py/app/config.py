"""Configuration — loads the same server/.env the Node server used."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Layout:  <repo>/server-py/app/config.py  ->  parents[1] = server-py, parents[2] = repo
APP_BASE = Path(__file__).resolve().parents[1]   # server-py/
REPO_ROOT = Path(__file__).resolve().parents[2]  # repo root

# Backend config + data live alongside the app in server-py/.
load_dotenv(APP_BASE / ".env")

JWT_SECRET = os.getenv("JWT_SECRET", "default-secret")
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD_HASH = os.getenv("AUTH_PASSWORD_HASH", "")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
NODE_ENV = os.getenv("NODE_ENV", "development")
PORT = int(os.getenv("PORT", "3001"))


def resolve_db_path() -> str:
    """DATABASE_URL=file:./dev.db resolves relative to server-py/. Absolute paths used as-is."""
    raw_url = os.getenv("DATABASE_URL", "file:./dev.db")
    raw_path = raw_url[len("file:"):] if raw_url.startswith("file:") else raw_url
    p = Path(raw_path)
    if not p.is_absolute():
        p = (APP_BASE / raw_path).resolve()
    return str(p)


DB_PATH = resolve_db_path()
# Parsers imported directly (no subprocess), now colocated under server-py/.
PARSERS_DIR = APP_BASE / "parsers"
CLIENT_DIST = REPO_ROOT / "client" / "dist"
