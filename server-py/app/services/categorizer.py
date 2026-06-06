"""Keyword-based auto-categorization — faithful port of server/src/services/categorizer.ts.

Behavior preserved exactly (regex + first-match-wins). The category-name->id map
is cached and can be invalidated when categories change.
"""
import re
from sqlmodel import Session, select
from ..models import Category

# (pattern, category_name) — ported 1:1 from categorizer.ts KEYWORD_RULES
_RAW_RULES: list[tuple[str, str]] = [
    # Investments
    (r"GROWW|STOCKSIP|DEBITFORSTOCKSS", "Investment - SIP"),
    (r"MUTUALFUNDS|INDIANCLEARING", "Investment - Mutual Fund"),
    (r"NETBANKINGSI-PPF|PPF", "Investment - PPF"),
    (r"RDINSTALLMENT", "Investment - RD"),
    # Transfers
    (r"CC\d+.*AUTOPAY|AUTOPAY.*THANK\s*YOU", "Credit Card Payment"),
    # Income
    (r"INTERESTPAID|INTEREST PAID", "Interest"),
    (r"TRAVELSTACK", "Salary"),
    (r"BAINCAP|BAIN COMPANY", "Salary"),
    (r"URBANCLAP|URBAN COMPANY", "Salary"),
    (r"ACH\s+C-.*SAL", "Salary"),
    (r"CDSL|NEFTCR.*CENTRALDEPOSITOR", "Dividends"),
    (r"ACHC-RAILVIKAS", "Dividends"),
    (r"ACHD-INDIANCLEARING", "Investment - Mutual Fund"),
    # Expenses
    (r"NWD-|ATW-", "ATM Withdrawal"),
    (r"POS\s+\d", "Misc Expense"),
    (r"RENT|TPT-.*RENT", "Rent"),
    (r"ZOMATO|SWIGGY|PYU\*ZOMATO", "Food Delivery"),
    (r"BLINKIT|ZEPTO|BIGBASKET|INSTAMART", "Groceries"),
    (r"FLIPKART|AMAZON(?!.*PAY.*PRIV.*EMI)", "Shopping"),
    (r"UBER|OLA|INDIGO.*AIRLINE|RAPIDO", "Transport"),
    (r"BIGTREE|BOOKMYSHOW", "Entertainment"),
    (r"CLAUDE\.AI|GOOGLE\s*PLAY|F1\.COM|NETFLIX|SPOTIFY|HOTSTAR", "Subscriptions"),
    (r"MILLENNIUM.*HEALT|PHARMACY|MEDIC|THEMILLENNIUM", "Health"),
    (r"KEVENTER|BHAGWATI|RANI\s*KUMARI|JEETENDRA", "Groceries"),
    (r"NEFTDR-.*SHANTANU|NEFTDR-.*HDFCH", "Credit Card Payment"),
    (r"UPI-SURABHI", "Misc Expense"),
    (r"UPI-AMLAN", "Misc Expense"),
    (r"UPI-MANSI", "Misc Expense"),
    (r"UPI-RANI", "Groceries"),
    # CC specific
    (r"IGST-|CGST-|SGST-|FCY\s*MARKUP\s*FEE|CONSOLIDATED\s*FCY", "Fees/Charges"),
    (r"EMI\s+AMAZON\s*PAY|EMI\s+ANJEER|EMI\s+BIGTREE|EMI\s+WWW\.F1", "Entertainment"),
]

KEYWORD_RULES = [(re.compile(p, re.IGNORECASE), name) for p, name in _RAW_RULES]

_category_cache: dict[str, str] | None = None


def get_category_map(session: Session) -> dict[str, str]:
    global _category_cache
    if _category_cache is not None:
        return _category_cache
    cats = session.exec(select(Category)).all()
    _category_cache = {c.name: c.id for c in cats}
    return _category_cache


def invalidate_category_cache() -> None:
    global _category_cache
    _category_cache = None


def auto_categorize(session: Session, description: str,
                    counterparty: str | None = None) -> str | None:
    """Return a categoryId or None. Mirrors categorizer.ts autoCategorize."""
    cat_map = get_category_map(session)
    text = f"{description} {counterparty}" if counterparty else (description or "")
    for pattern, name in KEYWORD_RULES:
        if pattern.search(text):
            cid = cat_map.get(name)
            if cid:
                return cid
    return None
