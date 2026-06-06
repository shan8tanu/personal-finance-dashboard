"""SQLModel models mapped to the EXISTING Prisma-created SQLite tables.

Notes:
- __tablename__ and column names match Prisma exactly (PascalCase tables,
  camelCase columns) so JSON responses keep identical keys for the React client.
- Date/datetime columns are typed as `str`: they hold Prisma ISO-8601 text
  (e.g. "2026-04-26T00:00:00.000+00:00"), which is lexicographically ordered,
  so SQL range filters and ORDER BY still behave correctly.
- We never create_all() — the schema already exists.
"""
from typing import Optional
from sqlmodel import SQLModel, Field


class Account(SQLModel, table=True):
    __tablename__ = "Account"
    id: str = Field(primary_key=True)
    name: str
    type: str
    accountNumberMasked: str
    bankName: str
    createdAt: str


class Transaction(SQLModel, table=True):
    __tablename__ = "Transaction"
    id: str = Field(primary_key=True)
    accountId: str = Field(index=True)
    date: str = Field(index=True)
    description: str
    amount: float
    type: str
    categoryId: Optional[str] = None
    tag: Optional[str] = None
    referenceNumber: str
    closingBalance: Optional[float] = None
    source: str
    counterparty: Optional[str] = None
    isManuallyCategorized: bool = False
    statementId: Optional[str] = None
    isInternational: bool = False
    createdAt: str
    updatedAt: str


class Category(SQLModel, table=True):
    __tablename__ = "Category"
    id: str = Field(primary_key=True)
    name: str
    type: str
    icon: str = "circle"
    color: str = "#6B7280"
    isDefault: bool = False


class TaggingRule(SQLModel, table=True):
    __tablename__ = "TaggingRule"
    id: str = Field(primary_key=True)
    matchPattern: str
    matchField: str
    categoryId: str
    tagLabel: Optional[str] = None
    priority: int = 0
    createdAt: str


class CreditCardStatement(SQLModel, table=True):
    __tablename__ = "CreditCardStatement"
    id: str = Field(primary_key=True)
    accountId: str
    statementDate: str
    billingPeriodStart: str
    billingPeriodEnd: str
    totalDue: float
    minimumDue: float
    dueDate: str
    rewardPoints: int = 0


class PdfUpload(SQLModel, table=True):
    __tablename__ = "PdfUpload"
    id: str = Field(primary_key=True)
    accountId: str
    filename: str
    uploadedAt: str
    transactionsImported: int = 0
    status: str = "processing"
    errorMessage: Optional[str] = None
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
