# Findash API — Python / FastAPI backend

This is the **backend** (Phase 2 of the simplification). It replaced the
Node/Express server entirely: one language (Python), parsers imported directly
instead of shelled out as subprocesses, and the SMS webhook as a native route.

Config (`server-py/.env`), the SQLite database (`server-py/dev.db`), and the
statement parsers (`server-py/parsers/`) all live here. JWT/bcrypt are
wire-compatible with the old Node tokens.

## Run (development)

```bash
cd server-py
pip install -r requirements.txt
python seed.py          # first run only: creates tables + seeds default categories
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
│   ├── parsers_api.py   # in-process bridge to ../parsers (no subprocess)
│   ├── services/        # categorizer (keyword rules) + tagging engine
│   └── routers/         # auth, transactions, categories, tagging_rules,
│                        #   credit_card, analytics, upload, webhook
├── parsers/             # HDFC statement parsers (PDF + Excel) + type_corrections.json
├── seed.py              # create tables + seed default categories
├── dev.db               # SQLite database (gitignored)
├── .env                 # secrets/config (gitignored)
└── tests/               # pytest: API e2e, categorizer/SMS, parser smoke
```

## Notes / follow-ups

- **Two categorization engines still exist** (keyword regex in `services/categorizer.py`
  and DB tagging rules in `services/tagging.py`). They were ported faithfully to
  preserve behavior. Merging them into one DB-backed system is a deliberate
  follow-up (regex rules can't all be expressed as substring matches).
- **Recurring-SI references:** HDFC reuses the same reference number for monthly
  standing instructions (PPF/SIP). The statement import disambiguates these by
  appending the date; the `(accountId, referenceNumber)` uniqueness assumption is a
  known limitation worth revisiting (composite key on date) if you import heavily.
