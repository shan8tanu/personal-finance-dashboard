# Personal Finance Dashboard — Design Spec

## Context

Shantanu needs a personal finance dashboard to track income, expenses, and investments across his HDFC savings account and HDFC Regalia Gold credit card. Currently, financial data lives in monthly PDF statements that require manual review. The goal is to:

1. Parse bank and credit card statement PDFs to extract and categorize transactions
2. Provide a web dashboard to visualize spending, earnings, and trends by month/category
3. Allow custom tagging rules to categorize transactions (e.g., "UPI to X = Rent")
4. Separate credit card spending into its own section (not double-counted with bank debits)
5. Accept real-time transaction updates via SMS webhook (Android Tasker/Automate)
6. Store everything in PostgreSQL for persistence and querying

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React (Vite) + TypeScript | Fast dev, strong ecosystem |
| Charts | Recharts | React-native, clean API, good for dashboards |
| CSS | Tailwind CSS | Rapid UI development, consistent styling |
| Backend | Express + TypeScript | Lightweight, flexible API server |
| ORM | Prisma | Type-safe queries, easy migrations |
| Database | PostgreSQL | Robust, great for financial data queries |
| PDF Parsing | Python (pdfplumber + pikepdf) | Proven to work with HDFC's specific PDF formats |
| Python↔Node | child_process.execFile | Node spawns Python scripts, reads JSON from stdout |
| Auth | Username/password → JWT | Credentials in env vars (hashed), JWT for session |
| Deployment | Railway or Render | Cloud VPS with free tiers, easy PostgreSQL hosting |

### Python-Node Integration

PDF parsing runs as Python scripts invoked via `child_process.execFile` from the Express server:
- **Input**: Script receives arguments (file path, password) via command-line args
- **Output**: Script prints JSON to stdout (transactions array + metadata)
- **Errors**: Non-zero exit code + stderr message → Express returns 400/500 with error detail
- **Deployment**: Python + pip dependencies installed alongside Node on Railway/Render (both support multi-runtime buildpacks)

### Auth Flow

1. Single-user credentials stored as env vars: `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` (bcrypt)
2. `POST /api/auth/login` — validates username + password against env vars, returns JWT (24h expiry)
3. All `/api/*` routes require JWT in `Authorization: Bearer <token>` header
4. **Exception**: `POST /api/webhook/sms` uses `X-Webhook-Secret` header instead (Tasker can't do JWT login)
5. Webhook secret stored as env var: `WEBHOOK_SECRET`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `AUTH_USERNAME` | Login username |
| `AUTH_PASSWORD_HASH` | Bcrypt hash of login password |
| `WEBHOOK_SECRET` | Shared secret for SMS webhook auth |
| `PORT` | Server port (default: 3001) |

### Project Structure

```
personal-finance-dashboard/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level pages
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API client functions
│   │   └── types/          # Shared TypeScript types
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, error handling
│   │   └── parsers/        # Python PDF parsing scripts
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── package.json
└── package.json            # Root workspace config
```

## Data Model

### accounts
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | String | Display name (e.g., "HDFC Savings", "Regalia Gold") |
| type | Enum | `savings`, `credit_card` |
| account_number_masked | String | e.g., "XXXXXXXX8085" |
| bank_name | String | e.g., "HDFC" |
| created_at | DateTime | |

### transactions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| account_id | UUID | FK → accounts |
| date | DateTime | Transaction date |
| description | String | Raw narration from PDF |
| amount | Decimal | Transaction amount (always positive) |
| type | Enum | `debit`, `credit` |
| category_id | UUID | FK → categories (nullable until categorized) |
| tag | String | Optional user tag (e.g., "Monthly Rent") |
| reference_number | String | For deduplication (ref no from PDF/SMS) |
| closing_balance | Decimal | Nullable (bank statements have this, CC don't) |
| source | Enum | `pdf_import`, `sms_webhook`, `manual` |
| counterparty | String | Extracted payee/payer name |
| is_manually_categorized | Boolean | True if user manually set the category (protected from rule re-apply) |
| statement_id | UUID | Nullable FK → credit_card_statements (links CC transactions to their statement) |
| is_international | Boolean | For CC transactions: domestic vs international |
| created_at | DateTime | |
| updated_at | DateTime | Auto-updated on modification |

**Unique constraint** on (account_id, reference_number) for deduplication.

### categories
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | String | e.g., "Food Delivery", "Rent" |
| type | Enum | `expense`, `income`, `investment`, `transfer`, `fee` |
| icon | String | Icon identifier |
| color | String | Hex color for charts |
| is_default | Boolean | Seeded vs user-created |

**Seed categories:** Salary, Rent, Groceries, Food Delivery, Investment - SIP, Investment - Mutual Fund, Investment - PPF, Investment - RD, ATM Withdrawal, Credit Card Payment, Subscriptions, Entertainment, Transport, Utilities, Dividends, Interest, Fees/Charges, Shopping, Health, Misc Income, Misc Expense

### tagging_rules
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| match_pattern | String | Regex or substring to match |
| match_field | Enum | `description`, `counterparty` |
| category_id | UUID | FK → categories |
| tag_label | String | Optional tag to apply |
| priority | Integer | Higher priority rules match first |
| created_at | DateTime | |

### credit_card_statements
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| account_id | UUID | FK → accounts |
| statement_date | Date | |
| billing_period_start | Date | |
| billing_period_end | Date | |
| total_due | Decimal | |
| minimum_due | Decimal | |
| due_date | Date | |
| reward_points | Integer | |

### pdf_uploads
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| account_id | UUID | FK → accounts |
| filename | String | Original filename |
| uploaded_at | DateTime | |
| transactions_imported | Integer | Count of transactions created |
| status | Enum | `processing`, `completed`, `failed` |
| error_message | String | Nullable — error detail if parsing failed |
| period_start | Date | |
| period_end | Date | |

## API Endpoints

### Auth
- `POST /api/auth/login` — Basic auth, returns JWT token
- `GET /api/auth/me` — Validate token

### Transactions
- `GET /api/transactions` — List with filters (account, category, category_type, date range, type). Paginated: `?page=1&limit=50` (default 50 per page)
- `PATCH /api/transactions/:id` — Update category/tag for single transaction (sets `is_manually_categorized: true`)
- `DELETE /api/transactions/:id` — Delete a transaction (for erroneous imports/SMS)
- `GET /api/transactions/summary` — Aggregated stats for dashboard (total income, expenses, investments, net savings for a given month)

### PDF Upload
- `POST /api/upload/bank-statement` — Upload + parse bank PDF (accepts password in body). Returns 400 if password is wrong, 422 if PDF format unrecognized. Partial parse failures roll back (no partial imports).
- `POST /api/upload/credit-card-statement` — Upload + parse CC PDF. Same error handling as above.

### Categories
- `GET /api/categories` — List all
- `POST /api/categories` — Create custom
- `PATCH /api/categories/:id` — Edit
- `DELETE /api/categories/:id` — Delete (only non-default)

### Tagging Rules
- `GET /api/tagging-rules` — List all
- `POST /api/tagging-rules` — Create
- `PATCH /api/tagging-rules/:id` — Edit
- `DELETE /api/tagging-rules/:id` — Delete
- `POST /api/tagging-rules/apply` — Re-apply all rules to existing transactions
- `POST /api/tagging-rules/preview` — Preview which transactions a rule would match

### Credit Card
- `GET /api/credit-card/statements` — List statements
- `GET /api/credit-card/statements/:id/transactions` — Transactions for a statement
- `GET /api/credit-card/summary` — Spending breakdown for CC

### SMS Webhook
- `POST /api/webhook/sms` — Receive SMS from Tasker/Automate

### Charts/Analytics
- `GET /api/analytics/category-breakdown` — Spending by category for a month
- `GET /api/analytics/monthly-trend` — Income vs expenses over last N months

## Pages & UI

### 1. Dashboard (Home) — `/`
- **Month selector** at top (defaults to current month)
- **Summary cards**: Total Income | Total Expenses | Total Investments | Net Savings
- **Spending by category**: Donut chart (Recharts PieChart)
- **Income vs Expenses trend**: Bar chart (last 6 months)
- **Recent transactions**: Last 10 transactions in a compact table

### 2. Bank Transactions — `/transactions`
- Full transaction table: date, description, counterparty, amount, category, tag, source
- Search bar (searches description + counterparty)
- Filters: category dropdown, date range picker, type (debit/credit)
- Upload PDF button → modal with file picker + optional password field
- Click on category cell → dropdown to recategorize inline
- Credit card payments displayed but visually distinct (greyed out / tagged)

### 3. Credit Card Section — `/credit-card`
- Statement list (cards showing billing period, total due, due date)
- Click statement → expanded transaction list
- Spending by category chart (CC only)
- EMI transactions highlighted with remaining installment info if available
- International vs domestic split visible

### 4. Tagging Rules — `/rules`
- Rules table: pattern, field, category, tag, priority
- "Add Rule" button → form with:
  - Match pattern (text input)
  - Match field (description / counterparty dropdown)
  - Category (dropdown)
  - Tag label (optional text)
  - Priority (number)
- "Test Rule" button → shows matching transactions in a preview panel
- "Re-apply All Rules" button → bulk categorization

### 5. Investments — `/investments`
- Filter from bank transactions where category type = `investment`
- Group by sub-category: SIP, Mutual Fund, PPF, RD
- Monthly investment total bar chart
- Table of all investment transactions

### 6. Settings — `/settings`
- Category management (add/edit/delete, color picker)
- PDF upload history table
- SMS webhook URL display + connection status
- Change password

## PDF Parsing Details

### Bank Statement Parser (`server/src/parsers/parse_bank_statement.py`)

1. **Decrypt** with pikepdf using provided password
2. **Extract text** with pdfplumber page by page
3. **Skip** header/footer blocks (repeated account info on every page)
4. **Parse transactions** — each has: date (DD/MM/YY), narration (may span multiple lines), ref number, value date, withdrawal amount, deposit amount, closing balance
5. **Extract counterparty** from narration:
   - UPI: extract name after `UPI-` (e.g., `UPI-GROWWINVESTTECH` → "Groww Invest Tech")
   - NEFT: extract name after `NEFTDR-` or `NEFTCR-`
   - NWD (ATM): extract location
   - Others: use first meaningful part of narration
6. **Auto-categorize** using keyword map:
   - `GROWW.*STOCKSIP` → Investment - SIP
   - `MUTUALFUNDS` / `INDIANCLEARING` → Investment - Mutual Fund
   - `PPF` → Investment - PPF
   - `RDINSTALLMENT` → Investment - RD
   - `NWD-` → ATM Withdrawal
   - `CC000.*AUTOPAY` → Credit Card Payment
   - `RENT` in narration → Rent
   - `INTERESTPAID` → Interest Income
   - `ZOMATO|SWIGGY` → Food Delivery
   - `FLIPKART|AMAZON` → Shopping
7. **Apply user tagging rules** (override keyword defaults)
8. **Return** JSON array of parsed transactions
9. **Statement summary** from last page: opening balance, closing balance, debit/credit totals

### Credit Card Parser (`server/src/parsers/parse_cc_statement.py`)

1. **Extract text** with pdfplumber (no password needed)
2. **Parse header**: statement date, billing period, total due, minimum due, due date, reward points
3. **Split** domestic vs international sections
4. **Parse transactions**: date+time, description, rewards points, amount
5. **Identify special entries**:
   - Lines starting with `EMI` → flag as EMI
   - `IGST`/`CGST`/`SGST` lines → category: Fees/Charges
   - `FCY MARKUP FEE` → category: Fees/Charges
   - `AUTOPAY THANK YOU` → Credit card payment (exclude from spending)
   - Refunds (amount with `+` prefix) → type: credit
6. **Auto-categorize** using HDFC's own PI categories where possible + keyword matching
7. **Extract counterparty**: merchant name from description (before city name)
8. **Return** JSON with statement metadata + transactions array

### SMS Parser

HDFC SMS format (typical):
```
INR 1,234.56 debited from A/c **8085 on 01-04-26. UPI Ref: 123456. Not you? Call...
```

Parse: amount, debit/credit, account, reference number, date.

## SMS Webhook Integration (Tasker/Automate)

- Android Tasker profile: intercept SMS from HDFC sender IDs
- HTTP POST to `https://<deployed-url>/api/webhook/sms`
- Body: `{ "message": "<full SMS text>", "sender": "<sender>", "timestamp": "<ISO>" }`
- Auth: shared secret in header (`X-Webhook-Secret`)
- Server parses SMS, creates transaction with `source: sms_webhook`
- Deduplication: if a PDF import later has the same reference number, the PDF data takes priority (more complete info) and updates the SMS-created record

## Key Business Rules

1. **No double-counting**: Credit card autopay debit from bank = tagged as "Credit Card Payment" and excluded from expense totals. CC transactions tracked separately.
2. **Investments are not expenses**: SIP, MF, PPF, RD are categorized under `investment` type, shown separately from expenses.
3. **Tagging rule priority**: Manual categorization (protected, never overwritten) > User tagging rules > keyword auto-categorization > uncategorized
4. **Deduplication**: reference_number + account_id is unique. SMS records are updated (not duplicated) when PDF is imported.
5. **PDF password**: Bank statement passwords are provided at upload time, not stored.

## V2 Features (Not in scope for v1)

- Budget targets per category with progress tracking
- Counterparty insights (top payees, frequency)
- Month-over-month comparison
- Annual summary view

## Verification Plan

1. **PDF Parsing**: Upload the two sample PDFs → verify all transactions are correctly extracted, categorized, and stored
2. **Dashboard**: Check summary cards match manual totals from the statement summaries
3. **Category charts**: Verify donut chart categories match the parsed data
4. **Tagging rules**: Create a rule (e.g., "VAISHALEE → Rent"), apply it, verify transaction updates
5. **Credit card section**: Upload CC PDF, verify statement metadata + transactions display correctly
6. **SMS webhook**: Send a test POST request mimicking Tasker, verify transaction appears
7. **Deduplication**: Re-upload same PDF, verify no duplicate transactions
8. **Auth**: Verify login required for all routes, invalid credentials rejected
