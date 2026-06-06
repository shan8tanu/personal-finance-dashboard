from fastapi import APIRouter
from sqlmodel import Session, select

from ..database import engine
from ..models import CreditCardStatement, Transaction, Category, Account
from ..serializers import tx_dict, account_dict, _z
from ..util import date_bounds

router = APIRouter()


def _statement_dict(st: CreditCardStatement, account: Account | None) -> dict:
    return {
        "id": st.id, "accountId": st.accountId, "statementDate": _z(st.statementDate),
        "billingPeriodStart": _z(st.billingPeriodStart), "billingPeriodEnd": _z(st.billingPeriodEnd),
        "totalDue": st.totalDue, "minimumDue": st.minimumDue, "dueDate": _z(st.dueDate),
        "rewardPoints": st.rewardPoints, "account": account_dict(account),
    }


@router.get("/statements")
def list_statements():
    with Session(engine) as s:
        accts = {a.id: a for a in s.exec(select(Account)).all()}
        stmts = s.exec(
            select(CreditCardStatement).order_by(CreditCardStatement.statementDate.desc())
        ).all()
        return [_statement_dict(st, accts.get(st.accountId)) for st in stmts]


@router.get("/statements/{statement_id}/transactions")
def statement_transactions(statement_id: str):
    with Session(engine) as s:
        cats = {c.id: c for c in s.exec(select(Category)).all()}
        txns = s.exec(
            select(Transaction).where(Transaction.statementId == statement_id)
            .order_by(Transaction.date.desc())
        ).all()
        return [tx_dict(t, category=cats.get(t.categoryId)) for t in txns]


@router.get("/summary")
def cc_summary(month: int | None = None, year: int | None = None):
    gte, lt = date_bounds(month, year)
    with Session(engine) as s:
        cats = {c.id: c for c in s.exec(select(Category)).all()}
        cc_ids = [a.id for a in s.exec(
            select(Account).where(Account.type == "credit_card")).all()]
        q = select(Transaction).where(Transaction.accountId.in_(cc_ids))
        if gte:
            q = q.where(Transaction.date >= gte, Transaction.date < lt)
        txns = s.exec(q).all()

    by_cat: dict[str, dict] = {}
    total = 0.0
    for t in txns:
        if t.type == "credit":
            continue
        c = cats.get(t.categoryId) if t.categoryId else None
        if c and c.type == "transfer":
            continue
        name = c.name if c else "Uncategorized"
        color = c.color if c else "#6B7280"
        entry = by_cat.setdefault(name, {"name": name, "color": color, "total": 0.0})
        entry["total"] += t.amount
        total += t.amount
    return {"totalSpend": total, "byCategory": sorted(by_cat.values(), key=lambda x: x["total"], reverse=True)}
