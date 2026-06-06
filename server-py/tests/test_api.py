"""End-to-end API tests against a temp DB (never touches the live data)."""


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_auth_required(client):
    assert client.get("/api/transactions").status_code == 401


def test_login_and_me(client):
    bad = client.post("/api/auth/login", json={"username": "tester", "password": "wrong"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"username": "tester", "password": "testpass"})
    assert ok.status_code == 200
    tok = ok.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.json() == {"username": "tester"}


def test_categories_seeded(client, auth):
    cats = client.get("/api/categories", headers=auth).json()
    names = {c["name"] for c in cats}
    assert "Food Delivery" in names and "Salary" in names


def test_webhook_bad_secret(client):
    r = client.post("/api/webhook/sms",
                    headers={"X-Webhook-Secret": "nope"},
                    json={"message": "INR 100.00 debited from A/c **8085 on 01-05-26"})
    assert r.status_code == 401


def test_webhook_unparseable(client):
    r = client.post("/api/webhook/sms",
                    headers={"X-Webhook-Secret": "test-webhook-secret"},
                    json={"message": "hello world not a bank sms"})
    assert r.status_code == 422


def test_webhook_create_and_dedup(client, auth):
    sms = ("INR 250.00 debited from A/c **8085 on 02-05-26. "
           "Info: UPI-ZOMATO LIMITED-zomato@hdfcbank. UPI Ref:555444333222")
    hdr = {"X-Webhook-Secret": "test-webhook-secret"}

    r1 = client.post("/api/webhook/sms", headers=hdr, json={"message": sms})
    assert r1.status_code == 201
    tx_id = r1.json()["transactionId"]

    # Same reference → dedup: same id, no second row
    r2 = client.post("/api/webhook/sms", headers=hdr, json={"body": sms})  # 'body' alias too
    assert r2.status_code == 201
    assert r2.json()["transactionId"] == tx_id

    # Verify it landed, was categorized (ZOMATO -> Food Delivery) and counterparty parsed
    found = client.get("/api/transactions?search=ZOMATO", headers=auth).json()["transactions"]
    mine = [t for t in found if t["referenceNumber"] == "555444333222"]
    assert len(mine) == 1
    assert mine[0]["type"] == "debit"
    assert mine[0]["amount"] == 250.0
    assert mine[0]["counterparty"] == "ZOMATO LIMITED"
    assert mine[0]["category"]["name"] == "Food Delivery"


def test_patch_category_marks_manual(client, auth):
    hdr = {"X-Webhook-Secret": "test-webhook-secret"}
    sms = "INR 75.00 debited from A/c **8085 on 03-05-26. UPI Ref:111222333444"
    tx_id = client.post("/api/webhook/sms", headers=hdr, json={"message": sms}).json()["transactionId"]

    cats = client.get("/api/categories", headers=auth).json()
    rent = next(c for c in cats if c["name"] == "Rent")
    r = client.patch(f"/api/transactions/{tx_id}", headers=auth, json={"categoryId": rent["id"]})
    assert r.status_code == 200
    body = r.json()
    assert body["categoryId"] == rent["id"]
    assert body["isManuallyCategorized"] is True


def test_transaction_type_filter(client, auth):
    res = client.get("/api/transactions?type=debit&limit=100", headers=auth).json()
    assert all(t["type"] == "debit" for t in res["transactions"])


def test_webhook_accepts_raw_and_broken_json(client, auth):
    """Tasker sends multi-line SMS that breaks JSON escaping; webhook must still parse."""
    hdr = {"X-Webhook-Secret": "test-webhook-secret"}
    # raw plain-text body (no JSON wrapper) — newer 'Sent' format
    raw = ("Sent Rs.12.00\nFrom HDFC Bank A/C *8085\nTo MAX GROCER\n"
           "On 07/06/26\nRef 777666555444")
    r1 = client.post("/api/webhook/sms", headers={**hdr, "Content-Type": "text/plain"}, content=raw)
    assert r1.status_code == 201

    # invalid JSON (literal newlines inside the string, exactly what Tasker emits)
    broken = '{"message":"Sent Rs.13.00\nFrom HDFC Bank A/C *8085\nTo CAB RIDE\nOn 07/06/26\nRef 222333444555"}'
    r2 = client.post("/api/webhook/sms", headers={**hdr, "Content-Type": "application/json"}, content=broken)
    assert r2.status_code == 201

    found = client.get("/api/transactions?search=MAX GROCER", headers=auth).json()["transactions"]
    assert any(t["referenceNumber"] == "777666555444" for t in found)
