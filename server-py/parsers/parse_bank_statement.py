#!/usr/bin/env python3
"""
HDFC Bank Statement PDF Parser
Handles two formats:
  - Monthly statements (password-protected, DD/MM/YY dates, text-based)
  - Full-history statements (unlocked, DD/MM/YYYY dates, table-based, multi-page)
Outputs JSON to stdout.
"""

import sys
import json
import re
import os
import argparse
import tempfile

# ─── Corrections file ────────────────────────────────────────────────────────
# Loaded once at startup. Maps narration substrings → forced type.
# Format: [{"pattern": "UPI-SURABHI", "type": "credit", "note": "..."}]

CORRECTIONS_FILE = os.path.join(os.path.dirname(__file__), "type_corrections.json")

def load_corrections():
    if not os.path.exists(CORRECTIONS_FILE):
        return []
    try:
        with open(CORRECTIONS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def apply_corrections(transactions, corrections):
    """Apply user-curated corrections as a final override layer."""
    if not corrections:
        return transactions
    for tx in transactions:
        text = tx.get("description", "").upper()
        for rule in corrections:
            if rule.get("pattern", "").upper() in text:
                if tx["type"] != rule["type"]:
                    tx["type"] = rule["type"]
                    tx["_confidence"] = "corrected"
                break
    return transactions


# ─── Format detection ─────────────────────────────────────────────────────────

def detect_format(file_path):
    """Return 'table' for multi-year history statements, 'text' for monthly."""
    import pdfplumber
    with pdfplumber.open(file_path) as pdf:
        if len(pdf.pages) < 3:
            return "text"
        # Check first data row's date format
        for page in pdf.pages[:3]:
            tables = page.extract_tables()
            if not tables:
                continue
            for row in tables[0]:
                if row and row[0] and re.match(r"\d{2}/\d{2}/\d{4}", str(row[0])):
                    return "table"
    return "text"


# ─── Table-based parser (multi-year history format) ───────────────────────────

def extract_transactions_table(file_path):
    """Parse full-history HDFC statements using pdfplumber table extraction.
    The PDF has explicit Withdrawal / Deposit columns, making debit/credit
    classification completely deterministic — no heuristics needed.
    """
    import pdfplumber

    transactions = []
    metadata = {}

    with pdfplumber.open(file_path) as pdf:
        # Metadata from first page text
        first_text = pdf.pages[0].extract_text() or ""
        period = re.search(
            r"Statement From\s*:\s*(\d{2}/\d{2}/\d{2})\s*TO\s*:\s*(\d{2}/\d{2}/\d{2})",
            first_text
        )
        if period:
            metadata["periodStart"] = parse_date_short(period.group(1))
            metadata["periodEnd"]   = parse_date_short(period.group(2))

        # Collect all table rows across all pages
        for page in pdf.pages:
            tables = page.extract_tables()
            if not tables:
                continue
            for row in tables[0]:
                if not row or not row[0]:
                    continue
                if not re.match(r"\d{2}/\d{2}/\d{4}", str(row[0])):
                    continue  # skip header / non-transaction rows
                tx = parse_table_row(row)
                if tx:
                    transactions.append(tx)

    # Derive opening balance from first transaction
    if transactions:
        first = transactions[0]
        cb  = first.get("closingBalance") or 0
        amt = first.get("amount") or 0
        metadata["openingBalance"] = (cb - amt) if first["type"] == "credit" else (cb + amt)
        metadata["closingBalance"] = transactions[-1].get("closingBalance")

    # Verify types via balance chain (catches any edge-case mis-parse)
    opening = metadata.get("openingBalance")
    if opening is not None:
        transactions = verify_types_by_balance(transactions, opening)

    # Apply user corrections
    transactions = apply_corrections(transactions, load_corrections())

    return transactions, metadata


def parse_table_row(row):
    """Parse one table row: [Date, Narration, Ref, ValueDate, Withdrawal, Deposit, Closing]"""
    if len(row) < 7:
        return None

    date_str       = str(row[0] or "").strip()
    narration_raw  = str(row[1] or "").strip()
    ref_raw        = str(row[2] or "").strip()
    withdrawal_str = str(row[4] or "0").strip() or "0"
    deposit_str    = str(row[5] or "0").strip() or "0"
    closing_str    = str(row[6] or "").strip()

    try:
        withdrawal = parse_amount(withdrawal_str)
        deposit    = parse_amount(deposit_str)
        closing    = parse_amount(closing_str) if closing_str else None
    except Exception:
        return None

    if withdrawal > 0 and deposit == 0:
        tx_type = "debit"
        amount  = withdrawal
    elif deposit > 0 and withdrawal == 0:
        tx_type = "credit"
        amount  = deposit
    elif withdrawal > 0:
        tx_type = "debit"
        amount  = withdrawal
    else:
        return None

    # Clean narration (merge wrapped lines)
    narration = " ".join(narration_raw.split("\n")).strip()
    narration = re.sub(r"\s{2,}", " ", narration)

    # Reference number — prefer the dedicated ref column, but fall back to
    # a leading numeric run in the narration (e.g. "50400363126846- RD INSTALLMENT")
    ref = ref_raw if ref_raw and re.search(r"[A-Z0-9]{6,}", ref_raw) else None
    if not ref:
        # Check if narration starts with a standalone ref number
        leading_ref = re.match(r"^(\d{10,20})\s*[-\s]", narration)
        if leading_ref:
            ref = leading_ref.group(1)
    if not ref:
        import hashlib
        h = hashlib.md5(f"{date_str}{narration}{amount}".encode()).hexdigest()[:8]
        ref = f"HIST-{date_str.replace('/', '')}-{h}"

    counterparty = extract_counterparty(narration)
    date_iso     = parse_date_dmy(date_str)  # DD/MM/YYYY → YYYY-MM-DD

    return {
        "date":           date_iso,
        "description":    narration,
        "amount":         amount,
        "type":           tx_type,
        "referenceNumber": ref,
        "closingBalance": closing,
        "counterparty":   counterparty,
        "_confidence":    "verified",  # explicit columns, no guessing
    }


# ─── Text-based parser (monthly statements) ───────────────────────────────────

def decrypt_pdf(file_path, password):
    """Decrypt PDF using pikepdf and return path to decrypted temp file."""
    import pikepdf
    decrypted_path = tempfile.mktemp(suffix=".pdf")
    try:
        pdf = pikepdf.open(file_path, password=password)
        pdf.save(decrypted_path)
        pdf.close()
        return decrypted_path
    except pikepdf._core.PasswordError:
        print("InvalidPassword", file=sys.stderr)
        sys.exit(1)


def extract_transactions_text(file_path):
    """Parse monthly HDFC statements from raw text lines (DD/MM/YY format)."""
    import pdfplumber

    transactions = []
    metadata = {}

    with pdfplumber.open(file_path) as pdf:
        all_text = ""
        for page in pdf.pages:
            all_text += (page.extract_text() or "") + "\n"

        # Statement period
        period_match = re.search(
            r"From\s*:\s*(\d{2}/\d{2}/\d{4})\s*To\s*:\s*(\d{2}/\d{2}/\d{4})", all_text
        )
        if period_match:
            metadata["periodStart"] = parse_date_dmy(period_match.group(1))
            metadata["periodEnd"]   = parse_date_dmy(period_match.group(2))

        # Summary row
        summary_match = re.search(
            r"OpeningBalance\s+DrCount\s+CrCount\s+Debits\s+Credits\s+ClosingBal\s+"
            r"([\d,.]+)\s+(\d+)\s+(\d+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)",
            all_text
        )
        if summary_match:
            metadata["openingBalance"] = parse_amount(summary_match.group(1))
            metadata["closingBalance"] = parse_amount(summary_match.group(6))
            metadata["totalDebits"]    = parse_amount(summary_match.group(4))
            metadata["totalCredits"]   = parse_amount(summary_match.group(5))

        # Parse transactions line by line
        lines = all_text.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            tx_match = re.match(r"^(\d{2}/\d{2}/\d{2})\s+(.+)", line)

            if tx_match:
                date_str = tx_match.group(1)
                rest     = tx_match.group(2)

                # Collect continuation lines
                narration_parts = [rest]
                j = i + 1
                while j < len(lines):
                    nl = lines[j].strip()
                    if (re.match(r"^\d{2}/\d{2}/\d{2}\s", nl) or nl == "" or
                        any(nl.startswith(p) for p in [
                            "HDFCBANKLIMITED", "*Closing", "Contents", "State",
                            "HDFC", "Registered", "PageNo", "AccountBranch",
                            "Date ", "STATEMENTSUMMARY", "Generated", "Thisis"
                        ])):
                        break
                    narration_parts.append(nl)
                    j += 1

                full_narration = " ".join(narration_parts)
                i = j

                tx = parse_transaction_line(date_str, full_narration)
                if tx:
                    transactions.append(tx)
            else:
                i += 1

    # Verify types via balance chain
    opening = metadata.get("openingBalance")
    if opening is not None:
        transactions = verify_types_by_balance(transactions, opening)

    # Apply user corrections
    transactions = apply_corrections(transactions, load_corrections())

    return transactions, metadata


def parse_transaction_line(date_str, full_text):
    """Parse a single transaction from its combined narration text (monthly format)."""
    ref_match  = re.search(r"(\d{13,20})", full_text)
    ref_number = ref_match.group(1) if ref_match else None

    amounts = re.findall(r"([\d,]+\.\d{2})", full_text)
    if not amounts:
        return None

    narration = full_text

    if ref_match:
        before_ref = full_text[:ref_match.start()].strip()
        after_ref  = full_text[ref_match.end():].strip()
        if before_ref:
            narration = before_ref
        elif after_ref:
            narration_after = re.match(
                r"-?(.+?)(?:\s+\d{13,20}|\s+\d{2}/\d{2}/\d{2})", after_ref
            )
            if narration_after:
                narration = narration_after.group(1).strip().lstrip("-")
            else:
                narration = after_ref.split()[0].lstrip("-") if after_ref else ""
        else:
            narration = ""

    if not ref_number:
        import hashlib
        h = hashlib.md5(f"{date_str}{narration}".encode()).hexdigest()[:8]
        ref_number = f"BANK-{date_str.replace('/', '')}-{h}"

    closing_balance = parse_amount(amounts[-1]) if amounts else None
    withdrawal = 0
    deposit    = 0

    if len(amounts) >= 3:
        date_in_text = re.search(r"\d{2}/\d{2}/\d{2}", full_text[10:])
        if date_in_text:
            amounts_text = full_text[10 + date_in_text.end():]
            amt_list = re.findall(r"([\d,]+\.\d{2})", amounts_text)
            if len(amt_list) >= 3:
                withdrawal      = parse_amount(amt_list[0])
                deposit         = parse_amount(amt_list[1])
                closing_balance = parse_amount(amt_list[2])
            elif len(amt_list) == 2:
                closing_balance = parse_amount(amt_list[1])
                kws = ["NEFTCR", "ACHC-", "ACHD-", "INTERESTPAID", "TRAVELSTACK"]
                if any(k in narration.upper() for k in kws):
                    deposit = parse_amount(amt_list[0])
                else:
                    withdrawal = parse_amount(amt_list[0])
            elif len(amt_list) == 1:
                closing_balance = parse_amount(amt_list[0])
    elif len(amounts) == 2:
        closing_balance = parse_amount(amounts[-1])
        kws = ["NEFTCR", "ACHC-", "ACHD-", "INTERESTPAID", "TRAVELSTACK", "CREDITED"]
        if any(k in full_text.upper() for k in kws):
            deposit = parse_amount(amounts[0])
        else:
            withdrawal = parse_amount(amounts[0])
    elif len(amounts) == 1:
        closing_balance = parse_amount(amounts[0])

    amount  = withdrawal if withdrawal > 0 else deposit
    tx_type = "debit" if withdrawal > 0 else "credit"

    if amount == 0:
        return None

    counterparty = extract_counterparty(narration)
    date_iso     = parse_date_short(date_str)

    return {
        "date":            date_iso,
        "description":     narration.strip(),
        "amount":          amount,
        "type":            tx_type,
        "referenceNumber": ref_number,
        "closingBalance":  closing_balance,
        "counterparty":    counterparty,
        "_confidence":     "guessed",  # upgraded by verify_types_by_balance
    }


# ─── Shared post-processing ───────────────────────────────────────────────────

def verify_types_by_balance(transactions, opening_balance):
    """Override debit/credit if closing balance delta contradicts the parsed type.
    Sets _confidence = 'verified' when balance confirms, 'corrected' when it overrides.
    """
    prev = opening_balance
    for tx in transactions:
        cb  = tx.get("closingBalance")
        amt = tx.get("amount", 0)
        if cb is None or amt == 0:
            if cb is not None:
                prev = cb
            continue

        debit_delta  = abs(prev - amt - cb)
        credit_delta = abs(prev + amt - cb)

        if debit_delta < 1.0 and credit_delta >= 1.0:
            if tx["type"] != "debit":
                tx["type"]         = "debit"
                tx["_confidence"]  = "corrected"
            else:
                tx.setdefault("_confidence", "verified")
                if tx["_confidence"] == "guessed":
                    tx["_confidence"] = "verified"
        elif credit_delta < 1.0 and debit_delta >= 1.0:
            if tx["type"] != "credit":
                tx["type"]        = "credit"
                tx["_confidence"] = "corrected"
            else:
                tx.setdefault("_confidence", "verified")
                if tx["_confidence"] == "guessed":
                    tx["_confidence"] = "verified"
        # If neither or both match: leave type and confidence unchanged

        prev = cb

    return transactions


# ─── Counterparty extraction ──────────────────────────────────────────────────

def extract_counterparty(narration):
    """Extract a human-readable counterparty name from HDFC narration."""
    narration_upper = narration.upper()

    # UPI: "UPI-NAME-vpa@bank-refno-UPI" or "UPI-NAME-vpa@bank"
    upi_match = re.match(r"UPI-(.+?)(?:-[\w.]+@\w+|-\d{9,}|$)", narration, re.IGNORECASE)
    if upi_match:
        name = upi_match.group(1).strip()
        name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
        return name.title()

    # NEFT
    neft_match = re.match(r"NEFT[DC]R-\w+-(.+?)(?:-|$)", narration, re.IGNORECASE)
    if neft_match:
        name = neft_match.group(1).strip()
        name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
        return name.title()

    # ATM (ATW- is the history format; NWD- is monthly)
    for prefix in ("ATW-", "NWD-"):
        if narration_upper.startswith(prefix):
            loc = re.search(rf"{prefix}\S+-\S+-(.+)", narration, re.IGNORECASE)
            return loc.group(1).strip() if loc else "ATM Withdrawal"

    # POS (card swipe)
    pos_match = re.match(r"POS\s+\S+\s+(.+)", narration, re.IGNORECASE)
    if pos_match:
        return pos_match.group(1).strip()[:40]

    # ACH / salary
    ach_match = re.match(r"ACH\s+C-\s*(.+?)(?:-[A-Z0-9]{6,}|$)", narration, re.IGNORECASE)
    if ach_match:
        return ach_match.group(1).strip()[:40]

    # Credit card autopay
    if "CC000" in narration_upper and "AUTOPAY" in narration_upper:
        return "HDFC Credit Card"

    # PPF / RD / Interest
    if "PPF"          in narration_upper: return "PPF Account"
    if "RDINSTALLMENT" in narration_upper or "RD INSTALLMENT" in narration_upper:
        return "Recurring Deposit"
    if "INTERESTPAID" in narration_upper or "INTEREST PAID" in narration_upper:
        return "HDFC Bank Interest"

    # Fallback
    parts = narration.split()
    return parts[0][:30] if parts else "Unknown"


# ─── Amount / date helpers ────────────────────────────────────────────────────

def parse_amount(s):
    return float(str(s).replace(",", "").strip())

def parse_date_short(date_str):
    """DD/MM/YY → YYYY-MM-DD"""
    parts = date_str.split("/")
    if len(parts) != 3:
        return date_str
    day, month, year = parts
    y = int(year)
    if y < 100:
        y = 2000 + y
    return f"{y}-{month.zfill(2)}-{day.zfill(2)}"

def parse_date_dmy(date_str):
    """DD/MM/YYYY → YYYY-MM-DD"""
    parts = date_str.split("/")
    if len(parts) != 3:
        return date_str
    day, month, year = parts
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"


# ─── Main entry point ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Parse HDFC bank statement PDF")
    parser.add_argument("file",            help="Path to PDF file")
    parser.add_argument("--password", "-p", help="PDF password (monthly statements)", default=None)
    parser.add_argument("--show-confidence", action="store_true",
                        help="Include _confidence field in output (for review tools)")
    args = parser.parse_args()

    file_path      = args.file
    decrypted_path = None

    try:
        if args.password:
            decrypted_path = decrypt_pdf(file_path, args.password)
            file_path = decrypted_path

        fmt = detect_format(file_path)

        if fmt == "table":
            transactions, metadata = extract_transactions_table(file_path)
        else:
            transactions, metadata = extract_transactions_text(file_path)

        # Strip _confidence unless caller asked for it
        if not args.show_confidence:
            for tx in transactions:
                tx.pop("_confidence", None)

        print(json.dumps({"transactions": transactions, "metadata": metadata}, indent=2))

    except Exception as e:
        print(f"FormatError: {str(e)}", file=sys.stderr)
        sys.exit(1)
    finally:
        if decrypted_path and os.path.exists(decrypted_path):
            os.unlink(decrypted_path)


if __name__ == "__main__":
    main()
