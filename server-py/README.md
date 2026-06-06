# Findash API — Python / FastAPI backend

This is the **primary backend** (Phase 2 of the simplification). It replaces the
Node/Express server: one language (Python), parsers imported directly instead of
shelled out as subprocesses, and the SMS webhook as a native route.

It reads the **same `server/.env`** and the **same SQLite database** as the old
Node server, so no data migration is needed and existing JWT tokens stay valid.

## Run (development)

```bash
cd server-py
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Point the React dev server at it:

```bash
cd client
VITE_API_URL=http://localhost:8000 npm run dev    # http://localhost:5173
```

In production (`NODE_ENV=production`) the FastAPI app also serves the built
React bundle from `client/dist`, so everything runs on one port/origin.

## Test

```bash
cd server-py
pip install -r requirements.txt
pytest            # runs against a throwaway temp DB — never touches live data
```

## Layout

```
server-py/
├── app/
│   ├── main.py          # FastAPI app: CORS, error shape, router mounts, SPA serving
│   ├── config.py        # loads server/.env; resolves DB + parser + client paths
│   ├── database.py      # SQLite engine over the existing Prisma-created DB
│   ├── models.py        # SQLModel models mapped to the existing tables
│   ├── auth.py          # JWT (HS256) + bcrypt — wire-compatible with Node
│   ├── serializers.py   # dict shapes identical to Prisma `include` output
│   ├── parsers_api.py   # in-process bridge to server/src/parsers (no subprocess)
│   ├── services/        # categorizer (keyword rules) + tagging engine
│   └── routers/         # auth, transactions, categories, tagging_rules,
│                        #   credit_card, analytics, upload, webhook
└── tests/               # pytest: API e2e, categorizer/SMS, parser smoke
```

## Notes / follow-ups

- **Two categorization engines still exist** (keyword regex in `services/categorizer.py`
  and DB tagging rules in `services/tagging.py`). They were ported faithfully to
  preserve behavior. Merging them into one DB-backed system is a deliberate
  follow-up (regex rules can't all be expressed as substring matches).
- The old Node server under `server/` is kept temporarily as a fallback and can
  be removed once the Python backend is confirmed in the browser.
