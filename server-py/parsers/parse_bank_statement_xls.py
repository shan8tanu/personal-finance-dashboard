#!/usr/bin/env python3
"""
HDFC Bank Statement XLS/XLSX Parser
Handles the Excel format downloaded directly from HDFC NetBanking.
Outputs JSON to stdout in the same format as parse_bank_statement.py.

Column layout (after skipping header rows):
  0: Date (DD/MM/YY)    1: Narration    2: Chq./Ref.No.
  3: Value Dt           4: Withdrawal   5: Deposit      6: Closing Balance
"""

import sys
import json
import re
import os
import hashlib
import argparse

# Reuse shared logic from the sibling PDF parser
sys.path.insert(0, os.path.dirname(__file__))
from parse_bank_statement import (
    extract_counterparty,
    verify_types_by_balance,
    apply_corrections,
    load_corrections,
    parse_amount as _parse_amount,
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_date_xls(raw) -> str | None:
    """Convert DD/MM/YY or DD/MM/YYYY to YYYY-MM-DD ISO string."""
    s = str(raw).strip()
    # DD/MM/YY (2-digit year)
    m = re.match(r"^(\d{2})/(\d{2})/(\d{2})$", s)
    if m:
        d, mo, y = m.groups()
        year = f"20{y}" if int(y) < 50 else f"19{y}"
        return f"{year}-{mo}-{d}"
    # DD/MM/YYYY (4-digit year)
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{mo}-{d}"
    return None


def safe_amount(val) -> float:
    """Convert pandas cell (float, int, NaN, string) to a Python float."""
    import math
    if val is None:
        return 0.0
    try:
        if math.isnan(float(val)):
            return 0.0
        return float(val)
    except (ValueError, TypeError):
        try:
            return _parse_amount(str(val))
        except Exception:
            return 0.0


def normalize_ref(raw_ref, date_str: str, narration: str, amount: float) -> str:
    """
    Normalize an HDFC reference number from Excel.
    Excel may have stored a 16-digit numeric ref as a float, losing leading zeros.
    We re-pad it to 16 digits if the result looks numeric.
    All-zero refs get a deterministic hash fallback.
    """
    ref = str(raw_ref).strip()

    # Excel reads numeric cols as float — strip the trailing ".0"
    if ref.endswith(".0"):
        ref = ref[:-2]

    # Re-pad numeric refs to 16 digits (HDFC standard width)
    if re.fullmatch(r"\d+", ref):
        ref = ref.zfill(16)

    # All-zero or empty → generate a stable hash
    if not ref or re.fullmatch(r"0+", ref) or ref == "nan":
        h = hashlib.md5(f"{date_str}{narration}{amount}".encode()).hexdigest()[:8]
        ref = f"XLS-{date_str.replace('-', '')}-{h}"

    return ref


# ─── Main parser ─────────────────────────────────────────────────────────────

def parse_xls(file_path: str):
    import pandas as pd

    ext = os.path.splitext(file_path)[1].lower()
    engine = "xlrd" if ext == ".xls" else "openpyxl"

    # Read all cells as raw objects — we handle conversion ourselves
    df = pd.read_excel(file_path, engine=engine, header=None, dtype=object)

    # ── Find header row ──────────────────────────────────────────────────────
    # Look for the row that says "Date" in col 0 (the column header row)
    header_row_idx = None
    for i, row in df.iterrows():
        cell = str(row.iloc[0]).strip()
        if cell == "Date" or cell == "DATE":
            header_row_idx = i
            break

    if header_row_idx is None:
        raise ValueError("Could not find transaction header row in XLS file")

    # ── Extract metadata from pre-header rows ────────────────────────────────
    metadata = {}
    pre = df.iloc[:header_row_idx]
    for _, row in pre.iterrows():
        for cell in row:
            s = str(cell)
            # Statement period: "Statement From  :  01/04/2026         To  :  26/04/2026"
            period = re.search(
                r"Statement From\s*:\s*(\d{2}/\d{2}/\d{4})\s+To\s*:\s*(\d{2}/\d{2}/\d{4})",
                s, re.IGNORECASE
            )
            if period:
                metadata["periodStart"] = parse_date_xls(period.group(1).replace("/", "/"))
                metadata["periodEnd"]   = parse_date_xls(period.group(2).replace("/", "/"))

            # Opening balance from summary area
            ob = re.search(r"Opening Balance\s*[:\s]+([\d,]+\.\d{2})", s, re.IGNORECASE)
            if ob:
                try:
                    metadata["openingBalance"] = _parse_amount(ob.group(1))
                except Exception:
                    pass

    # Alternatively, look for the summary block (appears after transactions too)
    for _, row in df.iterrows():
        cell0 = str(row.iloc[0]).strip()
        if cell0 == "Opening Balance":
            # Next row likely has the value in col 0
            continue
        try:
            val = float(str(row.iloc[0]).replace(",", ""))
            if 1_000 < val < 1_000_000 and "openingBalance" not in metadata:
                metadata["openingBalance"] = val
        except Exception:
            pass

    # ── Parse transactions ───────────────────────────────────────────────────
    transactions = []

    for idx in range(header_row_idx + 2, len(df)):   # +2 skips header + separator row
        row = df.iloc[idx]
        date_raw = str(row.iloc[0]).strip()

        # Stop at summary / footer lines
        if not re.match(r"\d{2}/\d{2}/\d{2}", date_raw):
            break

        date_iso = parse_date_xls(date_raw)
        if not date_iso:
            continue

        narration_raw = str(row.iloc[1] if len(row) > 1 else "").strip()
        ref_raw       = row.iloc[2] if len(row) > 2 else ""
        withdrawal    = safe_amount(row.iloc[4] if len(row) > 4 else None)
        deposit       = safe_amount(row.iloc[5] if len(row) > 5 else None)
        closing       = safe_amount(row.iloc[6] if len(row) > 6 else None) or None

        # Determine type from explicit columns
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
            continue  # neither column has a value — skip

        narration = re.sub(r"\s{2,}", " ", narration_raw)
        ref = normalize_ref(ref_raw, date_iso, narration, amount)
        counterparty = extract_counterparty(narration)

        transactions.append({
            "date":            date_iso,
            "description":     narration,
            "amount":          round(amount, 2),
            "type":            tx_type,
            "referenceNumber": ref,
            "closingBalance":  round(closing, 2) if closing else None,
            "counterparty":    counterparty,
            "_confidence":     "verified",   # Excel has explicit debit/credit columns
        })

    # ── Balance verification ─────────────────────────────────────────────────
    opening = metadata.get("openingBalance")
    if opening and transactions:
        # Derive opening balance from first transaction if not found in metadata
        first = transactions[0]
        if not opening and first.get("closingBalance"):
            cb  = first["closingBalance"]
            amt = first["amount"]
            opening = (cb - amt) if first["type"] == "credit" else (cb + amt)
            metadata["openingBalance"] = opening

        transactions = verify_types_by_balance(transactions, opening)

    transactions = apply_corrections(transactions, load_corrections())

    if transactions:
        metadata["closingBalance"] = transactions[-1].get("closingBalance")

    return transactions, metadata


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", help="Path to .xls or .xlsx bank statement")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(json.dumps({"error": f"File not found: {args.file}"}), file=sys.stderr)
        sys.exit(1)

    try:
        transactions, metadata = parse_xls(args.file)
        print(json.dumps({"transactions": transactions, "metadata": metadata}))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
