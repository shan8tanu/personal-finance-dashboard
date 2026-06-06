"""Direct, in-process bridge to the existing Python statement parsers.

Replaces the Node `execFile("python", parser.py)` subprocess calls — we now
import the parser functions and call them directly. The parser modules live in
their original location (server/src/parsers) and are unchanged.
"""
import os
import sys

from .config import PARSERS_DIR

# Make the parser modules importable.
if str(PARSERS_DIR) not in sys.path:
    sys.path.insert(0, str(PARSERS_DIR))


def parse_bank_statement(file_path: str, password: str | None = None) -> dict:
    """HDFC savings account PDF. Mirrors parse_bank_statement.py main()."""
    import parse_bank_statement as bank  # noqa: E402

    decrypted_path = None
    try:
        if password:
            decrypted_path = bank.decrypt_pdf(file_path, password)
            file_path = decrypted_path

        fmt = bank.detect_format(file_path)
        if fmt == "table":
            transactions, metadata = bank.extract_transactions_table(file_path)
        else:
            transactions, metadata = bank.extract_transactions_text(file_path)

        for tx in transactions:
            tx.pop("_confidence", None)
        return {"transactions": transactions, "metadata": metadata}
    finally:
        if decrypted_path and os.path.exists(decrypted_path):
            os.unlink(decrypted_path)


def parse_xls_bank_statement(file_path: str) -> dict:
    """HDFC savings account Excel (.xls/.xlsx). Mirrors parse_bank_statement_xls.py."""
    import parse_bank_statement_xls as xls  # noqa: E402
    transactions, metadata = xls.parse_xls(file_path)
    return {"transactions": transactions, "metadata": metadata}


def parse_cc_statement(file_path: str) -> dict:
    """HDFC credit-card PDF. Mirrors parse_cc_statement.py main()."""
    import parse_cc_statement as cc  # noqa: E402
    transactions, metadata = cc.extract_statement(file_path)
    return {"transactions": transactions, "metadata": metadata}
