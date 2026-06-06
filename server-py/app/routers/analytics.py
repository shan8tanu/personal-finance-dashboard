from fastapi import APIRouter, Query
from sqlmodel import Session, select

from ..database import engine
from ..models import Transaction, Category
from ..util import date_bounds, months_ago_start, parse_iso

router = APIRouter()


@router.get("/category-breakdown")
def category_breakdown(month: int | None = None, year: int | None = None,
                       accountId: str | None = None):
    gte, lt = date_bounds(month, year)
    with Session(engine) as s:
        cats = {c.id: c for c in s.exec(select(Category)).all()}
        q = select(Transaction).where(Transaction.type == "debit")
        if gte:
            q = q.where(Transaction.date >= gte, Transaction.date < lt)
        if accountId:
            q = q.where(Transaction.accountId == accountId)
        txns = s.exec(q).all()

    by_cat: dict[str, dict] = {}
    for t in txns:
        c = cats.get(t.categoryId) if t.categoryId else None
        name = c.name if c else "Uncategorized"
        ctype = c.type if c else "expense"
        color = c.color if c else "#6B7280"
        entry = by_cat.setdefault(name, {"name": name, "type": ctype, "color": color, "total": 0.0, "count": 0})
        entry["total"] += t.amount
        entry["count"] += 1
    return sorted(by_cat.values(), key=lambda x: x["total"], reverse=True)


@router.get("/monthly-trend")
def monthly_trend(months: int = Query(6)):
    start = months_ago_start(months)
    with Session(engine) as s:
        cats = {c.id: c for c in s.exec(select(Category)).all()}
        txns = s.exec(select(Transaction).where(Transaction.date >= start)).all()

    monthly: dict[str, dict] = {}
    for t in txns:
        d = parse_iso(t.date)
        key = f"{d.year:04d}-{d.month:02d}"
        m = monthly.setdefault(key, {"month": key, "income": 0.0, "expenses": 0.0, "investments": 0.0})
        ctype = cats[t.categoryId].type if t.categoryId in cats else None
        if t.type == "credit" or ctype == "income":
            m["income"] += t.amount
        elif ctype == "investment":
            m["investments"] += t.amount
        elif ctype == "expense":
            m["expenses"] += t.amount
    return sorted(monthly.values(), key=lambda x: x["month"])
