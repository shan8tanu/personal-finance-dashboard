from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select, func
from sqlalchemy import or_

from ..database import engine
from ..models import Transaction, Category, Account
from ..serializers import tx_dict
from ..util import date_bounds, iso_now

router = APIRouter()

ALLOWED_SORT = {"date", "amount", "type", "counterparty"}


def _norm_bound(s: str) -> str:
    """Normalize a client ISO bound ('...Z') to the stored '+00:00' suffix so
    lexicographic comparison matches real-date comparison."""
    return s[:-1] + "+00:00" if s.endswith("Z") else s


@router.get("")
def list_transactions(
    accountId: str | None = None, categoryId: str | None = None,
    categoryType: str | None = None, type: str | None = None,
    startDate: str | None = None, endDate: str | None = None,
    search: str | None = None, minAmount: float | None = None,
    maxAmount: float | None = None, sortBy: str | None = None,
    sortDir: str | None = None, page: int = 1, limit: int = 50,
):
    with Session(engine) as s:
        cats = {c.id: c for c in s.exec(select(Category)).all()}
        accts = {a.id: a for a in s.exec(select(Account)).all()}

        q = select(Transaction)
        if accountId:
            q = q.where(Transaction.accountId == accountId)
        if categoryId == "uncategorized":
            q = q.where(Transaction.categoryId == None)  # noqa: E711
        elif categoryId:
            q = q.where(Transaction.categoryId == categoryId)
        if type:
            q = q.where(Transaction.type == type)
        if categoryType:
            ids = [cid for cid, c in cats.items() if c.type == categoryType]
            q = q.where(Transaction.categoryId.in_(ids))
        if startDate:
            q = q.where(Transaction.date >= _norm_bound(startDate))
        if endDate:
            q = q.where(Transaction.date <= _norm_bound(endDate))
        if search:
            like = f"%{search}%"
            q = q.where(or_(Transaction.description.like(like),
                            Transaction.counterparty.like(like)))
        if minAmount is not None:
            q = q.where(Transaction.amount >= minAmount)
        if maxAmount is not None:
            q = q.where(Transaction.amount <= maxAmount)

        order_field = sortBy if sortBy in ALLOWED_SORT else "date"
        col = getattr(Transaction, order_field)
        q = q.order_by(col.asc() if sortDir == "asc" else col.desc())

        total = s.exec(select(func.count()).select_from(q.subquery())).one()
        rows = s.exec(q.offset((page - 1) * limit).limit(limit)).all()

        txns = [tx_dict(t, category=cats.get(t.categoryId), account=accts.get(t.accountId))
                for t in rows]

    return {
        "transactions": txns,
        "pagination": {
            "page": page, "limit": limit, "total": total,
            "totalPages": (total + limit - 1) // limit,
        },
    }


@router.get("/summary")
def summary(month: int | None = None, year: int | None = None):
    gte, lt = date_bounds(month, year)
    with Session(engine) as s:
        cats = {c.id: c for c in s.exec(select(Category)).all()}
        q = select(Transaction)
        if gte:
            q = q.where(Transaction.date >= gte, Transaction.date < lt)
        txns = s.exec(q).all()

    income = expenses = investments = 0.0
    for t in txns:
        ctype = cats[t.categoryId].type if t.categoryId in cats else None
        if t.type == "credit" or ctype == "income":
            income += t.amount
        elif ctype == "investment":
            investments += t.amount
        elif ctype == "expense":
            expenses += t.amount
    return {
        "totalIncome": income, "totalExpenses": expenses,
        "totalInvestments": investments,
        "netSavings": income - expenses - investments,
        "transactionCount": len(txns),
    }


class TxPatch(BaseModel):
    categoryId: str | None = None
    tag: str | None = None
    type: str | None = None


@router.patch("/{tx_id}")
def update_tx(tx_id: str, body: TxPatch):
    if body.type is not None and body.type not in ("debit", "credit"):
        raise HTTPException(400, "type must be 'debit' or 'credit'")
    with Session(engine) as s:
        t = s.get(Transaction, tx_id)
        if not t:
            raise HTTPException(404, "Transaction not found")
        if body.categoryId is not None:
            t.categoryId = body.categoryId
            t.isManuallyCategorized = True
        if body.tag is not None:
            t.tag = body.tag
        if body.type is not None:
            t.type = body.type
        t.updatedAt = iso_now()
        s.add(t)
        s.commit()
        s.refresh(t)
        cat = s.get(Category, t.categoryId) if t.categoryId else None
        return tx_dict(t, category=cat)


@router.delete("/{tx_id}")
def delete_tx(tx_id: str):
    with Session(engine) as s:
        t = s.get(Transaction, tx_id)
        if t:
            s.delete(t)
            s.commit()
    return {"success": True}
