"""Serialize models to dicts that match the Prisma `include` JSON shape exactly,
so the existing React client needs zero changes.
"""
from typing import Optional
from .models import Account, Category, Transaction, TaggingRule


def _z(s: Optional[str]) -> Optional[str]:
    """Render a stored ISO date with a 'Z' UTC suffix to match the Node/Prisma
    JSON output exactly (the client parses 'Z' and '+00:00' identically)."""
    if s is None:
        return None
    return s[:-6] + "Z" if s.endswith("+00:00") else s


def account_dict(a: Optional[Account]) -> Optional[dict]:
    if a is None:
        return None
    return {
        "id": a.id, "name": a.name, "type": a.type,
        "accountNumberMasked": a.accountNumberMasked,
        "bankName": a.bankName, "createdAt": _z(a.createdAt),
    }


def category_dict(c: Optional[Category]) -> Optional[dict]:
    if c is None:
        return None
    return {
        "id": c.id, "name": c.name, "type": c.type,
        "icon": c.icon, "color": c.color, "isDefault": c.isDefault,
    }


def tx_dict(t: Transaction, category: Optional[Category] = "skip",
            account: Optional[Account] = "skip") -> dict:
    """Serialize a transaction. Pass category/account to embed them (Prisma include).
    The sentinel "skip" omits the key entirely."""
    d = {
        "id": t.id, "accountId": t.accountId, "date": _z(t.date),
        "description": t.description, "amount": t.amount, "type": t.type,
        "categoryId": t.categoryId, "tag": t.tag,
        "referenceNumber": t.referenceNumber, "closingBalance": t.closingBalance,
        "source": t.source, "counterparty": t.counterparty,
        "isManuallyCategorized": t.isManuallyCategorized,
        "statementId": t.statementId, "isInternational": t.isInternational,
        "createdAt": _z(t.createdAt), "updatedAt": _z(t.updatedAt),
    }
    if category != "skip":
        d["category"] = category_dict(category)
    if account != "skip":
        d["account"] = account_dict(account)
    return d


def rule_dict(r: TaggingRule, category: Optional[Category] = None) -> dict:
    return {
        "id": r.id, "matchPattern": r.matchPattern, "matchField": r.matchField,
        "categoryId": r.categoryId, "tagLabel": r.tagLabel, "priority": r.priority,
        "createdAt": _z(r.createdAt), "category": category_dict(category),
    }
