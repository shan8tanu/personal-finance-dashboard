# Findash — Project Overview

> A complete, ground-truth description of the project as it exists today, plus the
> backlog of unfinished work and the simplification roadmap. Written to help plan
> new features without re-reading the whole codebase.
>
> Last updated: 2026-06-06

> **⚠️ Architecture update (2026-06-06):** The backend has been migrated from
> Node/Express to **Python/FastAPI** (`server-py/`) as part of Phases 1 & 2 of the
> simplification roadmap (§12). Parsers are now imported directly (no subprocess),
> the SMS webhook is a native route, and deployment is via a single Docker image.
> The FastAPI backend was verified to return byte-identical output to the old Node
> server across all read endpoints on the real 2,770-row DB, and has a pytest suite.
> The old `server/` (Node) is kept temporarily as a fallback. Sections below
> describe the original design; see `server-py/README.md` for the new backend.

---

## 1. What it is

Findash is a **single-user, self-hosted personal finance dashboard**. It ingests HDFC
bank and credit-card statements (PDF + Excel) and HDFC transaction SMS, stores
everything in a local SQLite database, auto-categorizes transactions, and visualizes
spending, income, and investment contributions in a dark-mode web UI.

All data stays on your own machine / VM. There is one user (you), authenticated with a
username + password.

---

## 2. Current state at a glance

| Aspect | Status |
|---|---|
| Hand-written code | ~4,900 LOC (React ~2,180 · Node/TS ~1,628 · Python ~1,076) |
| Runtimes | **Three**: Node/TS (server), Python (parsers, called as subprocess), React (client) |
| Database | SQLite, 6 tables, via Prisma ORM + better-sqlite3 adapter |
| Tests | **None** (`npm test` is a stub) |
| Deployment | EC2 + PM2 + Cloudflare Tunnel (documented in `DEPLOY.md`) |
| Auth | Single user, JWT (24h) + bcrypt, credentials from env |
| Works today | Statement import, SMS webhook (code), categorization, all dashboards |

---

## 3. Architecture

```
                         Browser / Phone
                               │ HTTPS
                               ▼
              ┌──────────────────────────────────┐
              │   Express server (Node/TS, :3001) │
              │   - JWT auth on /api/*             │
              │   - serves built React in prod     │
              │   - all REST routes                │
              └───────┬───────────────┬────────────┘
                      │               │ execFile("python", parser.py)
                      ▼               ▼
              ┌──────────────┐  ┌──────────────────────┐
              │ SQLite (file)│  │ Python parsers        │
              │ via Prisma   │  │ - parse_bank_statement│
              └──────────────┘  │ - parse_..._xls       │
                                │ - parse_cc_statement  │
                                └──────────────────────┘

   Tasker (Android)  ──POST /api/webhook/sms (X-Webhook-Secret)──▶ Express
```

**Key architectural fact:** the server is Node, but the hardest logic (statement
parsing) is **Python, invoked as a subprocess** via `execFile` in
`server/src/services/pdfParser.ts`. This is the main source of stack complexity: any
deployment needs both Node *and* Python + pip deps (pandas, pdfplumber, xlrd, openpyxl)
installed and kept in sync.

---

## 4. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Recharts, Tailwind CSS v4, Vite |
| Backend | Node.js, Express 5, TypeScript, tsx |
| Database | SQLite via Prisma ORM + `@prisma/adapter-better-sqlite3` |
| Auth | JWT (HS256, `jsonwebtoken`), bcryptjs |
| Parsing | Python 3 — pandas, pdfplumber, xlrd, openpyxl |
| Process mgmt | PM2 (`ecosystem.config.js`) |
| Exposure | Cloudflare Tunnel (quick or named) |

---

## 5. Data model (6 tables)

`server/prisma/schema.prisma`

- **Account** — a bank or credit-card account (`type`: `savings` | `credit_card`).
  Currently two are auto-created: `default-savings` (HDFC, masked `…8085`) and
  `default-cc` (HDFC Regalia, masked `…3570`).
- **Transaction** — the central table. Fields of note:
  - `type`: `debit` | `credit`
  - `source`: `pdf_import` | `sms_webhook` | `manual`
  - `categoryId` (nullable → uncategorized)
  - `counterparty`, `referenceNumber`, `closingBalance`, `isInternational`
  - `isManuallyCategorized` (protects manual edits from auto-rules)
  - `statementId` (links CC transactions to a statement)
  - **Dedup key:** `@@unique([accountId, referenceNumber])` — this is what makes
    re-importing a statement or receiving a duplicate SMS idempotent.
- **Category** — name (unique), `type` (`expense`/`income`/`investment`/`transfer`/`fee`),
  `color`, `icon` (stored but largely unused in UI), `isDefault`.
- **TaggingRule** — user-defined rule: `matchPattern` + `matchField`
  (`description`/`counterparty`) → `categoryId`, with `priority`.
- **CreditCardStatement** — per-statement metadata (dates, totalDue, minimumDue,
  dueDate, rewardPoints).
- **PdfUpload** — audit log of each import (filename, status, count, period, error).

> **Important modeling note:** there is **no investment/holdings model**. "Investments"
> are simply transactions whose `category.type === "investment"`. The Investments page
> sums these. There are no units, NAV, current value, or returns.

---

## 6. Backend API surface

All under `/api`. Auth routes and the webhook are public; everything else requires a JWT.

| Route | Methods | Purpose |
|---|---|---|
| `/auth/login` | POST | Username/password → JWT |
| `/webhook/sms` | POST | Tasker/MacroDroid SMS ingestion (secret header) |
| `/webhook/config` | GET (JWT) | Returns `WEBHOOK_SECRET` for the Settings page |
| `/transactions` | GET | Filter/search/sort/paginate transactions |
| `/transactions/summary` | GET | Income/expense/investment totals (month/year/all) |
| `/transactions/:id` | PATCH, DELETE | Edit category/type/tag; delete |
| `/categories` | GET, POST, PATCH, DELETE | Category CRUD |
| `/tagging-rules` | GET, POST, PATCH, DELETE | Rule CRUD |
| `/tagging-rules/apply` | POST | Re-apply all rules to history |
| `/tagging-rules/preview` | POST | Test a rule before saving |
| `/credit-card/statements` | GET | List CC statements |
| `/credit-card/statements/:id/transactions` | GET | Transactions in a statement |
| `/credit-card/summary` | GET | CC spend grouped by category |
| `/analytics/category-breakdown` | GET | Debit totals by category |
| `/analytics/monthly-trend` | GET | Income/expense/investment by month |
| `/upload/bank-statement` | POST | Upload PDF/XLS bank statement |
| `/upload/credit-card-statement` | POST | Upload CC PDF |
| `/upload/json` | POST | Import pre-parsed `output.json` (local review workflow) |

---

## 7. Frontend pages

`client/src/pages/` — routes wired in `App.tsx`.

- **Dashboard** (`/`) — month/year/all views; income/expense/investment cards; spending
  pie (click to filter); monthly trend bar (click to jump to month); top spenders;
  quick stats; uncategorized badge.
- **Transactions** (`/transactions`) — search, filter (category/type/amount/uncategorized),
  sort, month-jump; inline type toggle, inline category edit, 2-click delete;
  deep-linkable via URL params.
- **Credit Card** (`/credit-card`) — statement list, spend-by-category donut, per-statement
  transactions, INTL/EMI badges, upload.
- **Investments** (`/investments`) — total contributed, stacked monthly bar (SIP/MF/PPF/RD),
  per-category cards. (Derived entirely from categorized transactions — see §5.)
- **Tagging Rules** (`/rules`) — rule CRUD, priority ordering, live preview, re-apply all.
- **Settings** (`/settings`) — category management; SMS webhook URL + secret + curl test.
- **Login** (`/login`) — username/password.

---

## 8. Core data flows

**Statement import (PDF/XLS):**
`UploadModal` → `POST /api/upload/bank-statement` → file ext routes to the right Python
parser (subprocess) → JSON of transactions → `autoCategorize()` per row → Prisma
`upsert` keyed on `(accountId, referenceNumber)` (idempotent) → `applyTaggingRules()`.

**SMS webhook (real-time):**
Tasker `POST /api/webhook/sms` (with `X-Webhook-Secret`) → `parseHdfcSms()` extracts
amount/type/account/reference + counterparty from the `Info:` field → match account by
masked digits → `autoCategorize()` → Prisma `upsert` (same dedup key, so an SMS and a
later PDF for the same txn won't duplicate).

**Categorization (two systems — see §9).**

---

## 9. The two categorization systems ⚠️

This is the most important thing to understand before adding features.

1. **`server/src/services/categorizer.ts`** — a hardcoded `KEYWORD_RULES` regex list,
   compiled into the source. Runs automatically on every import/SMS. **Contains personal
   data in source code** (individual names, employer names, salary patterns).
2. **`server/src/services/taggingEngine.ts`** — applies **user-editable rules from the
   `TaggingRule` table** (the Tagging Rules UI). Runs after import and on demand.

They overlap in purpose. The hardcoded system is a maintainability and privacy smell; the
DB-backed system is the proper, user-facing one. **Consolidating these (migrate the
hardcoded rules into seeded DB rules, then delete `categorizer.ts`'s rule list) is both a
cleanup and a feature** — it would let you edit every rule from the UI instead of code.

---

## 10. Backlog — what's remaining / not yet implemented

### Already planned / in-flight
1. **SMS deployment + Tasker setup** — webhook code is done; *deploying* to a permanent
   URL and configuring Tasker on the phone is pending. (See `DEPLOY.md`.)
2. **Mobile access / permanent URL** — pending. Options discussed: open EC2 port 3001 for
   a permanent IP, or a cheap domain + named Cloudflare tunnel for HTTPS.

### Not yet built (feature gaps)
3. **Real investment/portfolio tracking** — units, NAV/price feeds, current value, returns
   (XIRR). Today it's contribution-sum only. *Biggest latent feature.*
4. **Budgets & alerts** — monthly limits per category, "you've spent X% of dining."
5. **Recurring / subscription detection** — surface recurring debits automatically.
6. **Manual transaction entry** — `source: "manual"` exists in the schema but there's no UI
   form to add a cash/manual transaction.
7. **Multi-account / multi-bank** — schema supports it, but accounts are hardcoded (one
   savings + one CC); no account switcher or "add account" UI.
8. **Richer transaction editing** — only category/type/tag are editable; not amount, date,
   counterparty, or a free-text note.
9. **Export / reporting** — no CSV/Excel export of filtered transactions; no PDF reports.
10. **DB backup/restore from the UI** — currently a manual `scp` (DEPLOY.md).
11. **Custom date-range filter on the Dashboard** — only month/year/all today.
12. **Category icons** — `icon` field exists but the UI shows colors only.

### Correctness / quality
13. **Income double-counting risk** — `summary` and `monthly-trend` treat *every* credit as
    income (`t.type === "credit" || catType === "income"`). Internal transfers in, CC
    refunds, and investment redemptions can inflate "income." Worth a deliberate rule.
14. **No tests** — no safety net around parsing, dedup, or categorization. This is the root
    of "scared to change things."
15. **Personal data in source** (`categorizer.ts`) — see §9.

---

## 11. Known smells & risks (summary)

- **Polyglot subprocess bridge** — Node shelling to Python; two runtimes to deploy/keep in sync.
- **`pdf-to-md/` is a separate embedded git repo** (own remote `github.com/shan8tanu/pdf-to-md`)
  living inside this project, unused by the app, only referenced (incorrectly) by the README.
- **Two categorization engines** (§9).
- **Zero tests.**
- **Deployment surface** — EC2 + PM2 + Cloudflare + Node + Python + SQLite file.

---

## 12. Simplification roadmap

Goal: reduce moving parts (deployment + languages) **without breaking working features**.
Sequenced so the safe, high-value work happens first.

### Phase 1 — Clean up + containerize  ✅ DONE (2026-06-06)
- ✅ Removed the unused embedded `pdf-to-md/` repo; fixed the README import section.
- ✅ Added a **single Docker image** (`Dockerfile` + `docker-compose.yml`) — Node builds the
  client, Python runs everything → deploy with `docker compose up`. **Kills concern A.**
- ✅ Added a **pytest test net** (`server-py/tests/`) over the API, categorizer, SMS parser,
  and parser bridge. **Defuses concern B.**
- ✅ `__pycache__` etc. added to `.gitignore`.

### Phase 2 — Consolidate the backend to one language (FastAPI)  ✅ DONE (2026-06-06)
- ✅ Replaced Express/TypeScript with **Python/FastAPI** (`server-py/`): parsers imported
  directly (no subprocess), SMS webhook is a native route, React UI untouched. **Kills D.**
- ✅ Swapped Prisma for **SQLModel** over the *same* SQLite file (no migration).
- ✅ Verified byte-identical output vs. the old Node server across all read endpoints on the
  real 2,770-row DB (differential testing).
- ⏳ **Follow-up:** the two categorization engines (§9) were ported faithfully but **not yet
  merged** — regex rules can't all be expressed as substring DB rules, so merging needs care.
- ⏳ **Follow-up:** remove the old Node `server/` once the Python backend is confirmed in the
  browser. (Kept temporarily as a fallback.)

> Rejected: a full **Streamlit** rewrite — it can't cleanly host the `POST /api/webhook/sms`
> endpoint (would *add* a process), regresses the mobile UI, and is the highest-risk path.

---

## 13. Running & deploying

- **Dev (new Python backend):** `cd server-py && uvicorn app.main:app --reload --port 8000`
  + `cd client && VITE_API_URL=http://localhost:8000 npm run dev` → http://localhost:5173
- **Test:** `cd server-py && pytest`
- **Deploy (recommended):** `docker compose up -d --build` (single image, see `DEPLOY.md`)
- **Seed (one-time, still via Node/Prisma):** `cd server && npm run seed`
- **Env (`server/.env`):** `JWT_SECRET`, `WEBHOOK_SECRET`, `AUTH_USERNAME`,
  `AUTH_PASSWORD_HASH`, `DATABASE_URL`, `PORT`, `ALLOWED_ORIGIN`
- **Legacy Node backend (fallback):** `cd server && npm run dev` (port 3001)
