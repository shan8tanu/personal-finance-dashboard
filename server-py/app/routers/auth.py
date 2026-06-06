from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import login, jwt_auth

router = APIRouter()


class LoginBody(BaseModel):
    username: str | None = None
    password: str | None = None


@router.post("/login")
def do_login(body: LoginBody):
    if not body.username or not body.password:
        raise HTTPException(400, "Username and password required")
    token = login(body.username, body.password)
    if not token:
        raise HTTPException(401, "Invalid credentials")
    return {"token": token}


@router.get("/me")
def me(user: dict = Depends(jwt_auth)):
    return {"username": user.get("username")}
