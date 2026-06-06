import re
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..database import engine
from ..models import Account, Transaction
from ..auth import jwt_auth, webhook_auth
from ..config import WEBHOOK_SECRET
from ..util import new_id, iso_now, iso_date
from ..services.categorizer import auto_categorize

router = APIRouter()

_DATE = r"(\d{2}[-/]\d{2}[-/]\d{2,4})"

# Legacy format: "INR 1,234.56 debited from A/c **8085 on 01-04-26. Info: UPI-..."
_DEBIT = re.compile(
    r"(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*debited\s*from\s*A/c\s*\*+(\d+)\s*on\s*" + _DATE,
    re.IGNORECASE)
_CREDIT = re.compile(
    r"(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited\s*to\s*A/c\s*\*+(\d+)\s*on\s*" + _DATE,
    re.IGNORECASE)
# Newer UPI format: "Sent Rs.1.00 From HDFC Bank A/C *8085 To NAME On 07/06/26 Ref 12..."
_SENT = re.compile(
    r"Sent\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+From\s+HDFC\s*Bank\s+A/?[Cc]\s+\*+(\d+)\s+To\s+(.+?)\s+On\s+" + _DATE,
    re.IGNORECASE | re.DOTALL)
# "Received Rs.X in HDFC Bank A/C *8085 from NAME On DD/MM/YY Ref ..."
_RECEIVED = re.compile(
    r"Received\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+in\s+HDFC\s*Bank\s+A/?[Cc]\s+\*+(\d+)\s+from\s+(.+?)\s+On\s+" + _DATE,
    re.IGNORECASE | re.DOTALL)

_REF = re.compile(r"Ref(?:erence)?(?:\s*No)?\s*[:.]?\s*(\d{6,})", re.IGNORECASE)
_INFO = re.compile(r"Info:\s*(.+?)(?:\.\s*(?:UPI Ref|Avl Bal)|$)", re.IGNORECASE)
_UPI = re.compile(r"UPI-(.+?)(?:-[\w.]+@\w+|-\d{9,}|$)", re.IGNORECASE)
_NEFT = re.compile(r"(?:NEFT|IMPS)[DC]?R?-\w+-(.+?)(?:-|$)", re.IGNORECASE)


def _clean_name(raw: str) -> str:
    return re.sub(r"\s+", " ", raw).strip().title()


def parse_hdfc_sms(message: str) -> dict | None:
    # Counterparty from the legacy "Info: UPI-..." narration, if present.
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

    # (regex, type, group index of counterparty name or None)
    for rx, kind, name_grp in (
        (_DEBIT, "debit", None), (_CREDIT, "credit", None),
        (_SENT, "debit", 3), (_RECEIVED, "credit", 3),
    ):
        mm = rx.search(message)
        if not mm:
            continue
        if name_grp and not counterparty:
            counterparty = _clean_name(mm.group(name_grp))
        ref = _REF.search(message)
        if name_grp:
            verb = "Sent to" if kind == "debit" else "Received from"
            description = narration or (f"UPI {verb} {counterparty}" if counterparty else message[:200])
        else:
            description = narration or message[:200]
        return {
            "amount": float(mm.group(1).replace(",", "")),
            "type": kind,
            "account": mm.group(2),
            "reference": ref.group(1) if ref else f"SMS-{int(datetime.now().timestamp() * 1000)}",
            "date": mm.group(mm.lastindex),  # date is always the last capture group
            "description": description,
            "counterparty": counterparty,
        }
    return None


def _extract_message(raw: str) -> str:
    """Accept either JSON ({"message"/"body": ...}) or the raw SMS text as the body.
    Phone automations (Tasker) can't reliably JSON-escape multi-line SMS, so we
    fall back to treating the whole body as the message — the parser scans it anyway."""
    s = raw.strip()
    if s.startswith("{"):
        try:
            d = json.loads(s)
            if isinstance(d, dict):
                msg = d.get("message") or d.get("body")
                if msg:
                    return msg
        except Exception:
            pass  # invalid JSON (e.g. unescaped newlines) → use raw text below
    return s


@router.post("/sms", status_code=201)
async def receive_sms(request: Request, _=Depends(webhook_auth)):
    raw = (await request.body()).decode("utf-8", "replace")
    message = _extract_message(raw)
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

        d, mo, y = re.split(r"[-/]", parsed["date"])
        if len(y) == 4:
            full_year = int(y)
        else:
            full_year = 2000 + int(y) if int(y) <= 68 else 1900 + int(y)
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
