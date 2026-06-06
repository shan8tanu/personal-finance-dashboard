"""Authentication — JWT (HS256) + bcrypt, wire-compatible with the Node server.

- Same JWT_SECRET + HS256 + {username, iat, exp} payload as jsonwebtoken, so
  tokens minted by either backend validate on the other (no forced re-login).
- bcrypt verifies the existing bcryptjs AUTH_PASSWORD_HASH unchanged.
"""
import time
import jwt
import bcrypt
from fastapi import Depends, HTTPException, Request

from .config import JWT_SECRET, AUTH_USERNAME, AUTH_PASSWORD_HASH, WEBHOOK_SECRET

ALGO = "HS256"
TOKEN_TTL_SECONDS = 24 * 60 * 60  # 24h, matching jsonwebtoken expiresIn: "24h"


def login(username: str, password: str) -> str | None:
    if username != AUTH_USERNAME:
        return None
    if not AUTH_PASSWORD_HASH:
        return None
    try:
        ok = bcrypt.checkpw(password.encode(), AUTH_PASSWORD_HASH.encode())
    except ValueError:
        return None
    if not ok:
        return None
    now = int(time.time())
    payload = {"username": username, "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def jwt_auth(request: Request) -> dict:
    """FastAPI dependency — mirrors middleware/auth.ts jwtAuth."""
    header = request.headers.get("authorization")
    if not header or not header.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid authorization header")
    token = header.split(" ", 1)[1]
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    return decoded


def webhook_auth(request: Request) -> None:
    """FastAPI dependency — mirrors middleware/auth.ts webhookAuth."""
    secret = request.headers.get("x-webhook-secret")
    if not secret or secret != WEBHOOK_SECRET:
        raise HTTPException(401, "Invalid webhook secret")
