"""Initialize a fresh database: create tables (SQLModel) and seed default
categories. Replaces the old Prisma seed.ts. Idempotent — safe to re-run.

    cd server-py && python seed.py
"""
from sqlmodel import SQLModel, Session, select

from app.database import engine
from app import models
from app.util import new_id, iso_now

DEFAULT_CATEGORIES = [
    # Income
    ("Salary", "income", "briefcase", "#10B981"),
    ("Dividends", "income", "trending-up", "#34D399"),
    ("Interest", "income", "percent", "#6EE7B7"),
    ("Misc Income", "income", "plus-circle", "#A7F3D0"),
    # Investments
    ("Investment - SIP", "investment", "bar-chart", "#3B82F6"),
    ("Investment - Mutual Fund", "investment", "pie-chart", "#60A5FA"),
    ("Investment - PPF", "investment", "shield", "#93C5FD"),
    ("Investment - RD", "investment", "clock", "#BFDBFE"),
    # Expenses
    ("Rent", "expense", "home", "#EF4444"),
    ("Groceries", "expense", "shopping-cart", "#F97316"),
    ("Food Delivery", "expense", "coffee", "#FB923C"),
    ("Entertainment", "expense", "film", "#A855F7"),
    ("Shopping", "expense", "shopping-bag", "#EC4899"),
    ("Transport", "expense", "map-pin", "#F59E0B"),
    ("Subscriptions", "expense", "repeat", "#8B5CF6"),
    ("Utilities", "expense", "zap", "#14B8A6"),
    ("Health", "expense", "heart", "#F43F5E"),
    ("ATM Withdrawal", "expense", "credit-card", "#78716C"),
    ("Misc Expense", "expense", "more-horizontal", "#6B7280"),
    # Transfers
    ("Credit Card Payment", "transfer", "arrow-right", "#9CA3AF"),
    # Fees
    ("Fees/Charges", "fee", "alert-circle", "#DC2626"),
]


def main():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        existing = {c.name for c in s.exec(select(models.Category)).all()}
        added = 0
        for name, ctype, icon, color in DEFAULT_CATEGORIES:
            if name not in existing:
                s.add(models.Category(id=new_id(), name=name, type=ctype,
                                      icon=icon, color=color, isDefault=True))
                added += 1
        s.commit()
        print(f"Seeded {added} new categories ({len(DEFAULT_CATEGORIES)} defaults total).")


if __name__ == "__main__":
    main()
