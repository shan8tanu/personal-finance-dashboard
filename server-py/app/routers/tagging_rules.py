from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import engine
from ..models import TaggingRule, Transaction, Category
from ..serializers import rule_dict, tx_dict
from ..util import new_id, iso_now
from ..services.tagging import apply_tagging_rules

router = APIRouter()


class RuleBody(BaseModel):
    matchPattern: str | None = None
    matchField: str | None = None
    categoryId: str | None = None
    tagLabel: str | None = None
    priority: int | None = None


class PreviewBody(BaseModel):
    matchPattern: str | None = None
    matchField: str | None = None


def _cat_map(s: Session) -> dict[str, Category]:
    return {c.id: c for c in s.exec(select(Category)).all()}


@router.get("")
def list_rules():
    with Session(engine) as s:
        cats = _cat_map(s)
        rules = s.exec(select(TaggingRule).order_by(TaggingRule.priority.desc())).all()
        return [rule_dict(r, cats.get(r.categoryId)) for r in rules]


@router.post("", status_code=201)
def create_rule(body: RuleBody):
    if not body.matchPattern or not body.matchField or not body.categoryId:
        raise HTTPException(400, "matchPattern, matchField, and categoryId are required")
    with Session(engine) as s:
        rule = TaggingRule(
            id=new_id(), matchPattern=body.matchPattern, matchField=body.matchField,
            categoryId=body.categoryId, tagLabel=body.tagLabel,
            priority=body.priority or 0, createdAt=iso_now(),
        )
        s.add(rule)
        s.commit()
        s.refresh(rule)
        return rule_dict(rule, s.get(Category, rule.categoryId))


@router.patch("/{rule_id}")
def update_rule(rule_id: str, body: RuleBody):
    with Session(engine) as s:
        rule = s.get(TaggingRule, rule_id)
        if not rule:
            raise HTTPException(404, "Rule not found")
        if body.matchPattern:
            rule.matchPattern = body.matchPattern
        if body.matchField:
            rule.matchField = body.matchField
        if body.categoryId:
            rule.categoryId = body.categoryId
        if body.tagLabel is not None:
            rule.tagLabel = body.tagLabel
        if body.priority is not None:
            rule.priority = body.priority
        s.add(rule)
        s.commit()
        s.refresh(rule)
        return rule_dict(rule, s.get(Category, rule.categoryId))


@router.delete("/{rule_id}")
def delete_rule(rule_id: str):
    with Session(engine) as s:
        rule = s.get(TaggingRule, rule_id)
        if rule:
            s.delete(rule)
            s.commit()
        return {"success": True}


@router.post("/apply")
def apply_rules():
    with Session(engine) as s:
        count = apply_tagging_rules(s)
        return {"updated": count}


@router.post("/preview")
def preview_rule(body: PreviewBody):
    if not body.matchPattern or not body.matchField:
        raise HTTPException(400, "matchPattern and matchField are required")
    field = Transaction.counterparty if body.matchField == "counterparty" else Transaction.description
    with Session(engine) as s:
        cats = _cat_map(s)
        txns = s.exec(
            select(Transaction).where(field.like(f"%{body.matchPattern}%")).limit(20)
        ).all()
        return [tx_dict(t, category=cats.get(t.categoryId)) for t in txns]
