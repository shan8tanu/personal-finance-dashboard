#!/usr/bin/env python3
"""
HDFC Credit Card Statement PDF Parser
Parses HDFC Regalia Gold credit card statements.
Outputs JSON to stdout.
"""

import sys
import json
import re
import argparse


def extract_statement(file_path):
    """Extract credit card statement data from PDF."""
    import pdfplumber

    metadata = {}
    transactions = []

    with pdfplumber.open(file_path) as pdf:
        all_text = ""
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_text += text + "\n"

        # Extract metadata
        metadata = extract_metadata(all_text)

        # Extract domestic transactions
        domestic_txns = extract_section_transactions(all_text, "Domestic Transactions", "International Transactions", is_international=False)
        transactions.extend(domestic_txns)

        # Extract international transactions
        intl_txns = extract_section_transactions(all_text, "International Transactions", "Offers on your card", is_international=True)
        transactions.extend(intl_txns)

    return transactions, metadata


def extract_metadata(text):
    """Extract statement metadata from header."""
    metadata = {}

    # Statement date
    stmt_date = re.search(r'Statement\s*Date\s*[:\n]?\s*(\d{1,2}\s+\w{3},?\s+\d{4})', text)
    if stmt_date:
        metadata["statementDate"] = parse_date_long(stmt_date.group(1))

    # Billing period
    billing = re.search(r'Billing\s*Period\s*[:\n]?\s*(\d{1,2}\s+\w{3},?\s+\d{4})\s*-\s*(\d{1,2}\s+\w{3},?\s+\d{4})', text)
    if billing:
        metadata["billingPeriodStart"] = parse_date_long(billing.group(1))
        metadata["billingPeriodEnd"] = parse_date_long(billing.group(2))

    # Total amount due - may be on next line, with _ prefix and C prefix
    total_due = re.search(r'TOTAL\s*AMOUNT\s*DUE.*?[_\s]*[C₹]([\d,]+\.?\d*)', text, re.DOTALL)
    if total_due:
        metadata["totalDue"] = parse_amount(total_due.group(1))

    # Minimum due - "MINIMUM DUE" followed eventually by C-prefixed amount
    min_due = re.search(r'MINIMUM\s*DUE\s*.*?[C₹]([\d,]+\.?\d*)', text, re.DOTALL)
    if min_due:
        metadata["minimumDue"] = parse_amount(min_due.group(1))

    # Due date - appears after "DUE DATE" on same or next line
    due_date = re.search(r'DUE\s*DATE\s*.*?(\d{1,2}\s+\w{3},?\s+\d{4})', text, re.DOTALL)
    if due_date:
        metadata["dueDate"] = parse_date_long(due_date.group(1))

    # Reward points
    reward_pts = re.search(r'Reward\s*Points.*?(\d[\d,]*)', text, re.DOTALL)
    if reward_pts:
        metadata["rewardPoints"] = int(reward_pts.group(1).replace(",", ""))

    return metadata


def extract_section_transactions(text, start_marker, end_marker, is_international=False):
    """Extract transactions from a section of the statement.

    HDFC CC statements have date/time on one line, then description/amount
    on the next line(s). We collect all lines between date markers as one transaction.
    """
    transactions = []

    start_idx = text.find(start_marker)
    if start_idx == -1:
        return transactions

    end_idx = text.find(end_marker, start_idx + len(start_marker))
    if end_idx == -1:
        # Try other end markers
        for alt_end in ["Eligible for", "GST Summary", "Page ", "Offers on your card", "*Transaction time"]:
            end_idx = text.find(alt_end, start_idx + len(start_marker))
            if end_idx != -1:
                break
        if end_idx == -1:
            end_idx = len(text)

    section = text[start_idx:end_idx]
    lines = section.split("\n")

    # Collect transaction blocks: each starts with a date line
    tx_blocks = []
    current_block = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip headers and known non-transaction lines
        if (line.startswith("DATE") or line.startswith("TRANSACTION") or
            line.startswith("REWARDS") or line.startswith("AMOUNT") or
            line.startswith("PI") or line.startswith("Page ") or
            line.startswith("DUPLICATE") or line.startswith("HSN Code") or
            line.startswith("Domestic Transaction") or line.startswith("International Transaction")):
            continue

        # Skip cardholder name lines (all caps, no digits)
        if re.match(r'^[A-Z\s]+$', line) and len(line) > 3 and not re.search(r'\d', line):
            continue

        # Check if this is a date line
        date_match = re.match(r'(\d{2}/\d{2}/\d{4})\s*\|\s*(\d{2}:\d{2})', line)
        if date_match:
            # Save previous block
            if current_block:
                tx_blocks.append(current_block)
            current_block = {
                "date": date_match.group(1),
                "time": date_match.group(2),
                "lines": [],
            }
            # There might be content after the date on the same line
            rest = line[date_match.end():].strip()
            if rest:
                current_block["lines"].append(rest)
        elif current_block is not None:
            current_block["lines"].append(line)

    # Don't forget the last block
    if current_block:
        tx_blocks.append(current_block)

    # Parse each block into a transaction
    for block in tx_blocks:
        combined = " ".join(block["lines"])
        tx = parse_cc_transaction(block["date"], block["time"], combined, is_international)
        if tx:
            transactions.append(tx)

    return transactions


def parse_cc_transaction(date_str, time_str, rest, is_international):
    """Parse a single credit card transaction line."""

    # Check if EMI
    is_emi = rest.strip().upper().startswith("EMI")
    if is_emi:
        rest = rest.strip()[3:].strip()  # Remove EMI prefix

    # Extract amount - it's typically the last currency amount on the line
    # Format: C 1,234.56 or + C 1,234.56 (refund)
    # Also handle USD amounts for international: USD 23.60

    is_refund = False
    amount = 0

    # Strip trailing PI indicator (single char like 'l') and whitespace
    rest = re.sub(r'\s+l\s*$', '', rest).strip()

    # Look for INR amount: "C 130.85" or "+ C 1,850.00" (refund)
    inr_match = re.search(r'(\+\s*)?[C₹]\s*([\d,]+\.?\d*)\s*$', rest)
    if inr_match:
        is_refund = inr_match.group(1) is not None
        amount = parse_amount(inr_match.group(2))
        description_part = rest[:inr_match.start()].strip()
    else:
        # Try without C prefix
        amt_match = re.search(r'(\+\s*)?([\d,]+\.\d{2})\s*$', rest)
        if amt_match:
            is_refund = amt_match.group(1) is not None
            amount = parse_amount(amt_match.group(2))
            description_part = rest[:amt_match.start()].strip()
        else:
            return None

    if amount == 0:
        return None

    # Extract rewards points (e.g., "+ 4" or "+ 48")
    rewards = 0
    rewards_match = re.search(r'\+\s*(\d+)', description_part)
    if rewards_match:
        rewards = int(rewards_match.group(1))
        description_part = description_part[:rewards_match.start()].strip()

    # Clean up description
    description = description_part.strip()
    if is_emi:
        description = f"EMI {description}"

    # Extract counterparty (merchant name before city)
    counterparty = extract_cc_counterparty(description)

    # Determine transaction type
    tx_type = "credit" if is_refund else "debit"

    # Check if this is an autopay (payment received)
    if "AUTOPAY" in description.upper() and "THANK YOU" in description.upper():
        tx_type = "credit"

    # Generate deterministic reference number (hashlib instead of hash() which varies per session)
    import hashlib
    hash_input = f"{description}{amount}{date_str}{tx_type}"
    digest = hashlib.md5(hash_input.encode()).hexdigest()[:6]
    ref = f"CC-{date_str.replace('/', '')}-{digest}"

    # Convert date
    date_iso = parse_date_ddmmyyyy(date_str)

    return {
        "date": date_iso,
        "description": description,
        "amount": amount,
        "type": tx_type,
        "referenceNumber": ref,
        "counterparty": counterparty,
        "isInternational": is_international,
        "isEmi": is_emi,
        "rewards": rewards,
    }


def extract_cc_counterparty(description):
    """Extract merchant name from CC transaction description."""
    # Remove EMI prefix
    desc = re.sub(r'^EMI\s*', '', description, flags=re.IGNORECASE).strip()

    # Common pattern: MERCHANT_NAMECITY or MERCHANT_NAME CITY
    # Try to split at city names
    cities = ['MUMBAI', 'NEW DELHI', 'DELHI', 'BANGALORE', 'BANGALOR', 'GURUGRAM', 'GURGAON',
              'NOIDA', 'CHENNAI', 'HYDERABAD', 'PUNE', 'KOLKATA', 'SAN FRANCISC', 'LONDON',
              'www.amazon']

    for city in cities:
        idx = desc.upper().find(city)
        if idx > 0:
            merchant = desc[:idx].strip()
            # Clean up trailing special chars
            merchant = re.sub(r'[\s\-_]+$', '', merchant)
            return merchant if merchant else desc

    # Fallback: return cleaned description
    # Remove (Ref#...) patterns
    desc = re.sub(r'\(Ref#.*?\)', '', desc).strip()
    return desc[:50] if desc else "Unknown"


def parse_amount(amount_str):
    """Parse amount string to float."""
    return float(amount_str.replace(",", ""))


def parse_date_long(date_str):
    """Parse '15 Feb, 2026' or '14 Mar, 2026' to ISO date."""
    months = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    }

    match = re.match(r'(\d{1,2})\s+(\w{3}),?\s+(\d{4})', date_str.strip())
    if match:
        day = match.group(1).zfill(2)
        month = months.get(match.group(2).lower()[:3], '01')
        year = match.group(3)
        return f"{year}-{month}-{day}"
    return date_str


def parse_date_ddmmyyyy(date_str):
    """Parse DD/MM/YYYY to ISO date."""
    parts = date_str.split("/")
    if len(parts) == 3:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return date_str


def main():
    parser = argparse.ArgumentParser(description="Parse HDFC credit card statement PDF")
    parser.add_argument("file", help="Path to PDF file")
    args = parser.parse_args()

    try:
        transactions, metadata = extract_statement(args.file)

        result = {
            "transactions": transactions,
            "metadata": metadata,
        }

        print(json.dumps(result, indent=2))

    except Exception as e:
        print(f"FormatError: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
