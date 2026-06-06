import os
import tempfile

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import engine
from ..models import Account, Transaction, CreditCardStatement, PdfUpload
from ..util import new_id, iso_now, iso_date, parse_iso
from ..services.categorizer import auto_categorize
from ..services.tagging import apply_tagging_rules
from ..parsers_api import parse_bank_statement, parse_xls_bank_statement, parse_cc_statement

router = APIRouter()

DEFAULT_SAVINGS = dict(id="default-savings", name="HDFC Savings", type="savings",
                       accountNumberMasked="XXXXXXXX8085", bankName="HDFC")
DEFAULT_CC = dict(id="default-cc", name="HDFC Regalia Gold", type="credit_card",
                  accountNumberMasked="XXXXXX3570", bankName="HDFC")


def _to_db_date(s):
    return iso_date(parse_iso(s)) if s else None


def _get_or_create_account(s: Session, account_id: str | None, default: dict) -> Account:
    if account_id:
        acc = s.get(Account, account_id)
        if acc:
            return acc
    acc = s.get(Account, default["id"])
    if not acc:
        acc = Account(createdAt=iso_now(), **default)
        s.add(acc)
        s.commit()
        s.refresh(acc)
    return acc


def _upsert_tx(s: Session, account_id: str, t: dict, category_id: str | None,
               *, statement_id: str | None = None, with_intl: bool = False):
    existing = s.exec(
        select(Transaction).where(
            Transaction.accountId == account_id,
            Transaction.referenceNumber == t["referenceNumber"],
        )
    ).first()
    now = iso_now()
    if existing:
        existing.description = t["description"]
        existing.amount = t["amount"]
        existing.type = t["type"]
        existing.counterparty = t.get("counterparty")
        existing.date = _to_db_date(t["date"])
        existing.source = "pdf_import"
        if "closingBalance" in t:
            existing.closingBalance = t.get("closingBalance")
        if with_intl:
            existing.isInternational = t.get("isInternational", False)
        if statement_id:
            existing.statementId = statement_id
        if category_id:
            existing.categoryId = category_id
        existing.updatedAt = now
        s.add(existing)
    else:
        s.add(Transaction(
            id=new_id(), accountId=account_id, date=_to_db_date(t["date"]),
            description=t["description"], amount=t["amount"], type=t["type"],
            referenceNumber=t["referenceNumber"], closingBalance=t.get("closingBalance"),
            source="pdf_import", counterparty=t.get("counterparty"),
            categoryId=category_id, isManuallyCategorized=False,
            isInternational=t.get("isInternational", False) if with_intl else False,
            statementId=statement_id, createdAt=now, updatedAt=now,
        ))


@router.post("/bank-statement")
async def upload_bank_statement(file: UploadFile = File(...),
                                password: str | None = Form(None),
                                accountId: str | None = Form(None)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(await file.read())
        tmp.close()

        with Session(engine) as s:
            account = _get_or_create_account(s, accountId, DEFAULT_SAVINGS)
            upload = PdfUpload(id=new_id(), accountId=account.id,
                               filename=file.filename or "upload", uploadedAt=iso_now(),
                               status="processing")
            s.add(upload)
            s.commit()
            s.refresh(upload)

            try:
                if ext in (".xls", ".xlsx"):
                    result = parse_xls_bank_statement(tmp.name)
                else:
                    result = parse_bank_statement(tmp.name, password)

                imported = 0
                for t in result["transactions"]:
                    cid = auto_categorize(s, t.get("description", ""), t.get("counterparty"))
                    _upsert_tx(s, account.id, t, cid)
                    imported += 1
                s.commit()

                apply_tagging_rules(s)

                meta = result.get("metadata") or {}
                upload.status = "completed"
                upload.transactionsImported = imported
                upload.periodStart = _to_db_date(meta.get("periodStart"))
                upload.periodEnd = _to_db_date(meta.get("periodEnd"))
                s.add(upload)
                s.commit()

                return {"success": True, "imported": imported,
                        "total": len(result["transactions"]), "uploadId": upload.id}
            except Exception as e:
                upload.status = "failed"
                upload.errorMessage = str(e)
                s.add(upload)
                s.commit()
                raise HTTPException(500, f"Parsing failed: {e}")
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


@router.post("/credit-card-statement")
async def upload_cc_statement(file: UploadFile = File(...),
                              accountId: str | None = Form(None)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(await file.read())
        tmp.close()

        with Session(engine) as s:
            account = _get_or_create_account(s, accountId, DEFAULT_CC)
            upload = PdfUpload(id=new_id(), accountId=account.id,
                               filename=file.filename or "upload", uploadedAt=iso_now(),
                               status="processing")
            s.add(upload)
            s.commit()
            s.refresh(upload)

            try:
                result = parse_cc_statement(tmp.name)
                meta = result.get("metadata") or {}

                statement = None
                if meta:
                    statement = CreditCardStatement(
                        id=new_id(), accountId=account.id,
                        statementDate=_to_db_date(meta["statementDate"]),
                        billingPeriodStart=_to_db_date(meta["billingPeriodStart"]),
                        billingPeriodEnd=_to_db_date(meta["billingPeriodEnd"]),
                        totalDue=meta["totalDue"], minimumDue=meta["minimumDue"],
                        dueDate=_to_db_date(meta["dueDate"]),
                        rewardPoints=meta.get("rewardPoints", 0),
                    )
                    s.add(statement)
                    s.commit()
                    s.refresh(statement)

                imported = 0
                for t in result["transactions"]:
                    cid = auto_categorize(s, t.get("description", ""), t.get("counterparty"))
                    _upsert_tx(s, account.id, t, cid,
                               statement_id=statement.id if statement else None,
                               with_intl=True)
                    imported += 1
                s.commit()

                apply_tagging_rules(s)

                upload.status = "completed"
                upload.transactionsImported = imported
                upload.periodStart = _to_db_date(meta.get("billingPeriodStart"))
                upload.periodEnd = _to_db_date(meta.get("billingPeriodEnd"))
                s.add(upload)
                s.commit()

                return {"success": True, "imported": imported,
                        "total": len(result["transactions"]),
                        "statementId": statement.id if statement else None,
                        "uploadId": upload.id}
            except Exception as e:
                upload.status = "failed"
                upload.errorMessage = str(e)
                s.add(upload)
                s.commit()
                raise HTTPException(500, f"Parsing failed: {e}")
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


class JsonImport(BaseModel):
    transactions: list[dict] = []
    type: str | None = None


@router.post("/json")
def import_json(body: JsonImport):
    if not body.transactions:
        raise HTTPException(400, "No transactions in request body")
    is_cc = body.type == "cc"
    default = DEFAULT_CC if is_cc else DEFAULT_SAVINGS

    imported = skipped = categorized = 0
    errors: list[str] = []
    with Session(engine) as s:
        account = _get_or_create_account(s, None, default)
        for raw in body.transactions:
            t = {k: v for k, v in raw.items() if k not in ("_confidence", "isEmi")}
            cid = auto_categorize(s, t.get("description", ""), t.get("counterparty"))
            if cid:
                categorized += 1
            try:
                _upsert_tx(s, account.id, t, cid, with_intl=True)
                imported += 1
            except Exception as e:
                skipped += 1
                errors.append(f"{t.get('referenceNumber')}: {e}")
        s.commit()
        tagged = apply_tagging_rules(s)

    out = {"success": True, "imported": imported, "skipped": skipped,
           "categorized": categorized, "tagged": tagged}
    if errors:
        out["errors"] = errors[:10]
    return out
