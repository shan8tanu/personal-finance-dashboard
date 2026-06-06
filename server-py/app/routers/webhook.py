import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import engine
from ..models import Account, Transaction
from ..auth import jwt_auth, webhook_auth
from ..config import WEBHOOK_SECRET
from ..util import new_id, iso_now, iso_date
from ..services.categorizer import auto_categorize

router = APIRouter()

_DEBIT = re.compile(
    r"(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*debited\s*from\s*(?:A/c|a/c)\s*\*+(\d+)\s*on\s*(\d{2}-\d{2}-\d{2})",
    re.IGNORECASE)
_CREDIT = re.compile(
    r"(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited\s*to\s*(?:A/c|a/c)\s*\*+(\d+)\s*on\s*(\d{2}-\d{2}-\d{2})",
    re.IGNORECASE)
_REF = re.compile(r"(?:UPI\s*Ref|Ref\s*No)[:\s]*(\d+)", re.IGNORECASE)
_INFO = re.compile(r"Info:\s*(.+?)(?:\.\s*(?:UPI Ref|Avl Bal)|$)", re.IGNORECASE)
_UPI = re.compile(r"UPI-(.+?)(?:-[\w.]+@\w+|-\d{9,}|$)", re.IGNORECASE)
_NEFT = re.compile(r"(?:NEFT|IMPS)[DC]?R?-\w+-(.+?)(?:-|$)", re.IGNORECASE)


def parse_hdfc_sms(message: str) -> dict | None:
    info = _INFO.search(message)
    narration = info.group(1).strip() if info else ""

    counterparty = None
    m = _UPI.search(narration)
    if m:
        counterparty = re.sub(r"([a-z])([A-Z])", r"\1 \2", m.group(1)).strip()
    if not counterparty and re.search(r"ATM|NWD", message, re.IGNORECASE):
        counterparty = "ATM Withdrawal"
    if not counterparty:
        nm = _NEFT.search(narration)
        if nm:
            counterparty = nm.group(1).strip()

    for rx, kind in ((_DEBIT, "debit"), (_CREDIT, "credit")):
        mm = rx.search(message)
        if mm:
            ref = _REF.search(message)
            return {
                "amount": float(mm.group(1).replace(",", "")),
                "type": kind,
                "account": mm.group(2),
                "reference": ref.group(1) if ref else f"SMS-{int(datetime.now().timestamp() * 1000)}",
                "date": mm.group(3),
                "description": narration or message[:200],
                "counterparty": counterparty,
            }
    return None


class SmsBody(BaseModel):
    message: str | None = None
    body: str | None = None
    sender: str | None = None
    timestamp: str | None = None


@router.post("/sms", status_code=201)
def receive_sms(body: SmsBody, _=Depends(webhook_auth)):
    message = body.message or body.body
    if not message:
        raise HTTPException(400, "message is required")

    parsed = parse_hdfc_sms(message)
    if not parsed:
        raise HTTPException(422, "Could not parse SMS format")

    with Session(engine) as s:
        account = s.exec(
            select(Account).where(Account.accountNumberMasked.like(f"%{parsed['account']}%"))
        ).first()
        if not account:
            raise HTTPException(404, f"No account found matching **{parsed['account']}")

        existing = s.exec(
            select(Transaction).where(
                Transaction.accountId == account.id,
                Transaction.referenceNumber == parsed["reference"],
            )
        ).first()
        if existing:
            return {"success": True, "transactionId": existing.id}  # don't overwrite

        category_id = auto_categorize(s, parsed["description"], parsed["counterparty"])

        d, mo, y = parsed["date"].split("-")
        full_year = 1900 + int(y) if int(y) > 50 else 2000 + int(y)
        date_iso = iso_date(datetime(full_year, int(mo), int(d)))

        now = iso_now()
        tx = Transaction(
            id=new_id(), accountId=account.id, date=date_iso,
            description=parsed["description"], amount=parsed["amount"],
            type=parsed["type"], referenceNumber=parsed["reference"],
            source="sms_webhook", counterparty=parsed["counterparty"],
            categoryId=category_id, isManuallyCategorized=False,
            isInternational=False, createdAt=now, updatedAt=now,
        )
        s.add(tx)
        s.commit()
        s.refresh(tx)
        return {"success": True, "transactionId": tx.id}


@router.get("/config")
def webhook_config(_: dict = Depends(jwt_auth)):
    return {"secret": WEBHOOK_SECRET}
