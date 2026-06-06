from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import NODE_ENV, ALLOWED_ORIGIN, CLIENT_DIST
from .auth import jwt_auth
from .routers import (
    auth as auth_router,
    transactions as transactions_router,
    categories as categories_router,
    tagging_rules as tagging_rules_router,
    credit_card as credit_card_router,
    analytics as analytics_router,
    upload as upload_router,
    webhook as webhook_router,
)

app = FastAPI(title="Findash API (Python)")

# ── CORS — mirrors server/src/index.ts ───────────────────────────────────────
if NODE_ENV == "production":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN],
        allow_origin_regex=r"https://.*\.trycloudflare\.com",
        allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
    )


# ── Error shape: return {"error": msg} like the Express API ───────────────────
@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": exc.errors()[0]["msg"] if exc.errors() else "Invalid request"})


# ── Public routes ─────────────────────────────────────────────────────────────
app.include_router(auth_router.router, prefix="/api/auth")
app.include_router(webhook_router.router, prefix="/api/webhook")

# ── Protected routes (JWT) ────────────────────────────────────────────────────
_jwt = [Depends(jwt_auth)]
app.include_router(transactions_router.router, prefix="/api/transactions", dependencies=_jwt)
app.include_router(categories_router.router, prefix="/api/categories", dependencies=_jwt)
app.include_router(tagging_rules_router.router, prefix="/api/tagging-rules", dependencies=_jwt)
app.include_router(credit_card_router.router, prefix="/api/credit-card", dependencies=_jwt)
app.include_router(analytics_router.router, prefix="/api/analytics", dependencies=_jwt)
app.include_router(upload_router.router, prefix="/api/upload", dependencies=_jwt)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── Serve built React frontend in production (SPA fallback) ───────────────────
if NODE_ENV == "production" and CLIENT_DIST.exists():
    @app.get("/{full_path:path}")
    def spa(full_path: str):
        target = CLIENT_DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(CLIENT_DIST / "index.html")
