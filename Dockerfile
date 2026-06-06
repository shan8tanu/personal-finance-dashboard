# ─── Stage 1: build the React client ─────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build         # → /client/dist

# ─── Stage 2: Python (FastAPI) runtime ───────────────────────────────────────
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production
WORKDIR /app

# Python deps (pikepdf/pandas/pdfplumber ship manylinux wheels — no apt needed)
COPY server-py/requirements.txt ./server-py/requirements.txt
RUN pip install --no-cache-dir -r server-py/requirements.txt

# App code + parsers + built client (preserving the repo layout config.py expects:
#   /app/server-py, /app/server/src/parsers, /app/client/dist)
COPY server-py/ ./server-py/
COPY server/src/parsers/ ./server/src/parsers/
COPY --from=client-build /client/dist ./client/dist

EXPOSE 3001
WORKDIR /app/server-py
# server/.env and the SQLite DB are mounted at runtime (see docker-compose.yml)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001"]
