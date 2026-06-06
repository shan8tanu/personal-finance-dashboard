# Findash — Personal Finance Dashboard

A self-hosted personal finance dashboard for tracking bank transactions, credit card spend, and investments. Parses PDF bank statements, auto-categorises transactions with configurable rules, and visualises everything in a clean dark-mode UI.

Runs fully locally — your data never leaves your machine.

---

## Screenshots

### Dashboard
> Monthly overview with income/expense/investment cards, interactive spending pie, monthly trend bar chart, top spenders, and quick stats.

![Dashboard](docs/screenshots/dashboard.jpg)

### Transactions
> Filterable, sortable table with inline type-toggle (debit↔credit), inline category editing, amount range filter, and delete.

![Transactions](docs/screenshots/transactions.jpg)

### Credit Card
> Statement-level breakdown with spend-by-category donut and per-statement transaction list.

![Credit Card](docs/screenshots/credit-card.jpg)

### Investments
> Total portfolio value with monthly contribution chart and per-category (MF / SIP / RD / PPF) transaction drill-down.

![Investments](docs/screenshots/investments.jpg)

### Tagging Rules
> Keyword → category rules with pattern matching, priority ordering, and one-click bulk re-apply.

![Tagging Rules](docs/screenshots/tagging-rules.jpg)

### Settings
> Category management (create / edit / delete with color picker) and webhook configuration.

![Settings](docs/screenshots/settings.jpg)

---

## Features

**Dashboard**
- All-time, year-only, or month-level views — pick any combination
- Click a bar in the trend chart to jump directly to that month
- Click a pie slice to filter the transaction table below
- Top 8 spenders with proportional bar visualisation
- Quick stats: total, debit/credit counts, average and largest transaction
- Uncategorized badge — click it to jump straight to `/transactions?filter=uncategorized`

**Transactions**
- Full-text search across counterparty and description
- Filter by category, type (debit / credit), amount range, or "Uncategorized only"
- Quick month-jump buttons (3 months either side of current)
- Sortable columns: date, amount, type, counterparty
- Inline type toggle — click Debit/Credit badge to flip misclassified transactions
- Inline category editing — click any category cell to reassign
- Delete with 2-click confirmation
- Deep-linkable via URL params (`?filter=uncategorized`, `?month=3&year=2026`)

**Credit Card**
- Per-account statement tracking with cycle dates and totals
- Spend-by-category donut chart
- Upload statements directly from the Credit Card page
- INTL and EMI badges on relevant transactions

**Investments**
- Aggregates across Mutual Funds, SIP, RD, and PPF
- Monthly contribution bar chart with per-category breakdown
- Per-transaction list inside each category card

**Tagging Rules**
- Pattern matching on counterparty, description, or reference fields
- Priority ordering — higher priority rules win on conflicts
- One-click "Re-apply All" to re-categorise your entire transaction history
- Live preview: test a rule against existing transactions before saving

**Statements**
- Upload PDF bank statements via a modal (sidebar button or Credit Card page)
- Python parser (`pdf-to-md/`) handles HDFC account and HDFC credit card formats
- Debit/credit auto-detection via running balance verification
- Manual type override via `type_corrections.json` (or flip from the UI)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Recharts, Tailwind CSS v4 |
| Backend | Python 3, FastAPI, SQLModel (`server-py/`) |
| Database | SQLite |
| Auth | JWT (HS256), bcrypt password hash |
| Parsing | Python 3, pdfplumber, pandas, xlrd/openpyxl |
| Deployment | Single Docker image (Node builds client, Python serves all) |
| Font / Theme | Inter, slate dark palette (`#0f172a` base) |

> The backend is Python/FastAPI under `server-py/` (migrated from the original
> Node/Express). See `server-py/README.md` for backend details.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ (to build the React client)

### 1. Clone

```bash
git clone https://github.com/shan8tanu/personal-finance-dashboard.git
cd personal-finance-dashboard
```

### 2. Install dependencies

```bash
# Backend
cd server-py && pip install -r requirements.txt

# Client
cd ../client && npm install
```

### 3. Configure environment

Create `server-py/.env`:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-random-secret-here"
WEBHOOK_SECRET="your-webhook-secret"
AUTH_USERNAME="yourname"
AUTH_PASSWORD_HASH="<bcrypt hash of your password>"
PORT=3001
```

Generate a bcrypt hash:
```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
```

### 4. Seed the database (fresh install)

```bash
cd server-py && python seed.py   # creates tables + default categories
```

### 5. Run (development)

```bash
# Terminal 1 — backend
cd server-py && uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend (proxies /api to the backend)
cd client && VITE_API_URL=http://localhost:8000 npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in.

### Or run everything with Docker (production-style)

```bash
docker compose up -d --build      # http://localhost:3001
```

---

## Importing Bank Statements

The easiest path is the UI — click **+ Upload Statement** in the sidebar (or on the
Credit Card page) and drop in an HDFC PDF or Excel (`.xls` / `.xlsx`) statement.

Under the hood, statements are parsed by the Python parsers in `server-py/parsers/`:

| File | Handles |
|---|---|
| `parse_bank_statement.py` | HDFC savings account PDF |
| `parse_bank_statement_xls.py` | HDFC savings account Excel (`.xls` / `.xlsx`) |
| `parse_cc_statement.py` | HDFC credit-card PDF |

The backend invokes the right parser automatically based on file type and account, so
you don't run them by hand.

---

## Project Structure

```
.
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── pages/           # Dashboard, Transactions, CreditCard, Investments, …
│       ├── components/      # Layout, UploadModal
│       └── services/api.ts  # Typed API client
├── server-py/               # Python / FastAPI backend
│   ├── app/
│   │   ├── routers/         # transactions, analytics, auth, upload, webhook, …
│   │   ├── services/        # categorizer + tagging engine
│   │   ├── models.py        # SQLModel schema
│   │   └── main.py          # app entry (CORS, routes, SPA serving)
│   ├── parsers/             # Python statement parsers (PDF + Excel)
│   ├── seed.py              # DB init + default categories
│   └── tests/               # pytest suite
├── Dockerfile               # single-image build (Node builds client, Python serves)
└── docs/                    # PROJECT-OVERVIEW.md + screenshots
```

---

## License

Personal project — not licensed for redistribution.
