"""Smoke tests that the existing Python parsers import and expose their callables.

These guard the parser bridge (parsers_api) used by the upload routes — if the
parser modules move or their entry-point functions are renamed, these fail.
"""
from app import parsers_api


def test_bridge_exposes_callables():
    assert callable(parsers_api.parse_bank_statement)
    assert callable(parsers_api.parse_xls_bank_statement)
    assert callable(parsers_api.parse_cc_statement)


def test_parser_modules_import():
    # Importing exercises the sys.path wiring to server/src/parsers.
    import parse_bank_statement
    import parse_bank_statement_xls
    import parse_cc_statement
    assert hasattr(parse_bank_statement, "detect_format")
    assert hasattr(parse_bank_statement_xls, "parse_xls")
    assert hasattr(parse_cc_statement, "extract_statement")


def test_missing_file_raises():
    import pytest
    with pytest.raises(Exception):
        parsers_api.parse_cc_statement("/no/such/file.pdf")
