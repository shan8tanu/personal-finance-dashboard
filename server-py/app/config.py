"""Configuration — loads the same server/.env the Node server used."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Repo layout:  <repo>/server-py/app/config.py  ->  parents[2] = <repo>
REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = REPO_ROOT / "server"

# Reuse the existing server/.env so secrets/credentials are shared with the Node app.
load_dotenv(SERVER_DIR / ".env")

JWT_SECRET = os.getenv("JWT_SECRET", "default-secret")
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD_HASH = os.getenv("AUTH_PASSWORD_HASH", "")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
NODE_ENV = os.getenv("NODE_ENV", "development")
PORT = int(os.getenv("PORT", "3001"))


def resolve_db_path() -> str:
    """Mirror server/src/db.ts: DATABASE_URL=file:./dev.db resolves under <server>/."""
    raw_url = os.getenv("DATABASE_URL", "file:./dev.db")
    raw_path = raw_url[len("file:"):] if raw_url.startswith("file:") else raw_url
    p = Path(raw_path)
    if not p.is_absolute():
        p = (SERVER_DIR / raw_path).resolve()
    return str(p)


DB_PATH = resolve_db_path()
# Parsers live in the existing location; imported directly (no subprocess).
PARSERS_DIR = SERVER_DIR / "src" / "parsers"
CLIENT_DIST = REPO_ROOT / "client" / "dist"
