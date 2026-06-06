"""User-defined tagging-rule engine — faithful port of taggingEngine.ts.

Applies DB TaggingRule rows (priority desc, first match wins) to all
transactions that are not manually categorized. Substring match, case-insensitive.
"""
from sqlmodel import Session, select
from ..models import TaggingRule, Transaction
from ..util import iso_now


def apply_tagging_rules(session: Session) -> int:
    rules = session.exec(
        select(TaggingRule).order_by(TaggingRule.priority.desc())
    ).all()
    if not rules:
        return 0

    txns = session.exec(
        select(Transaction).where(Transaction.isManuallyCategorized == False)  # noqa: E712
    ).all()

    updated = 0
    for t in txns:
        for rule in rules:
            field_value = (t.counterparty or "") if rule.matchField == "counterparty" else t.description
            if rule.matchPattern.lower() in field_value.lower():
                t.categoryId = rule.categoryId
                if rule.tagLabel:
                    t.tag = rule.tagLabel
                t.updatedAt = iso_now()
                session.add(t)
                updated += 1
                break  # highest-priority match wins
    session.commit()
    return updated
