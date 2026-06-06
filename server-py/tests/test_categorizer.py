"""Unit tests for the keyword categorizer and the SMS parser (no DB writes)."""
import pytest
from sqlmodel import Session

from app.database import engine
from app.services.categorizer import auto_categorize, invalidate_category_cache
from app.routers.webhook import parse_hdfc_sms


@pytest.fixture
def session():
    invalidate_category_cache()
    with Session(engine) as s:
        yield s
    invalidate_category_cache()


@pytest.mark.parametrize("text,expected", [
    ("UPI-ZOMATO-zomato@hdfc", "Food Delivery"),
    ("BLINKIT GROCERY", "Groceries"),
    ("GROWW STOCKSIP", "Investment - SIP"),
    ("NETBANKINGSI-PPF", "Investment - PPF"),
    ("NETFLIX SUBSCRIPTION", "Subscriptions"),
    ("NWD-CASH WITHDRAWAL", "ATM Withdrawal"),
    ("UBER RIDE", "Transport"),
])
def test_auto_categorize(session, text, expected):
    from app.models import Category
    cat_id = auto_categorize(session, text)
    cat = session.get(Category, cat_id)
    assert cat is not None and cat.name == expected


def test_auto_categorize_no_match(session):
    assert auto_categorize(session, "SOME RANDOM UNMATCHED NARRATION XYZ") is None


def test_sms_debit_parsing():
    p = parse_hdfc_sms("INR 1,234.56 debited from A/c **8085 on 26-04-26. "
                       "Info: UPI-SWIGGY-swiggy@icici. UPI Ref:998877665544")
    assert p["type"] == "debit"
    assert p["amount"] == 1234.56
    assert p["account"] == "8085"
    assert p["reference"] == "998877665544"
    assert p["counterparty"] == "SWIGGY"


def test_sms_credit_parsing():
    p = parse_hdfc_sms("Rs.5000.00 credited to A/c **8085 on 01-05-26. Ref No 123456789012")
    assert p["type"] == "credit"
    assert p["amount"] == 5000.0
    assert p["reference"] == "123456789012"


def test_sms_atm_counterparty():
    p = parse_hdfc_sms("INR 2000.00 debited from A/c **8085 on 05-05-26 NWD ATM CASH")
    assert p["counterparty"] == "ATM Withdrawal"


def test_sms_unparseable():
    assert parse_hdfc_sms("random text") is None


def test_sms_sent_upi_format():
    msg = ("Sent Rs.1.00\nFrom HDFC Bank A/C *8085\nTo SHAMBHAVI  JAHAGIRDAR\n"
           "On 07/06/26\nRef 124327769001\nNot You?\nCall 18002586161")
    p = parse_hdfc_sms(msg)
    assert p["type"] == "debit"
    assert p["amount"] == 1.0
    assert p["account"] == "8085"
    assert p["reference"] == "124327769001"
    assert p["counterparty"] == "Shambhavi Jahagirdar"
    assert p["date"] == "07/06/26"


def test_sms_received_upi_format():
    msg = ("Received Rs.500.00 in HDFC Bank A/C *8085 from JOHN DOE On 07/06/26 Ref 998877665544")
    p = parse_hdfc_sms(msg)
    assert p["type"] == "credit"
    assert p["amount"] == 500.0
    assert p["account"] == "8085"
    assert p["reference"] == "998877665544"
    assert p["counterparty"] == "John Doe"
    assert p["date"] == "07/06/26"
