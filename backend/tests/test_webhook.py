"""Ring webhook verification, normalization and the ingest path (harness and Ring-signed deliveries)."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.ring.harness import HARNESS_DEVICE, HarnessRingClient
from app.ring.webhook import WebhookPayload, normalize, parse_timestamp, sign, verify
from conftest import HARNESS_KEY, RING_KEY

BODY = b'{"meta":{},"data":{}}'

# Shapes copied from the Ring API docs (Webhook v1.1 Payload Structure, Button Press, Motion Detection).
RING_BUTTON_PRESS = {
    "meta": {"version": "1.1", "time": "2026-10-19T10:00:00Z", "request_id": "req-1", "account_id": "acct-1"},
    "data": {
        "id": "dev123_button_press_1792404000000",
        "type": "button_press",
        "attributes": {"source": "dev123", "source_type": "devices", "timestamp": 1792404000000},
        "relationships": {"devices": {"links": {"self": "/v1/devices/dev123"}}},
    },
}


def ring_delivery(payload: dict, key: str = RING_KEY) -> tuple[bytes, dict]:
    body = json.dumps(payload).encode()
    return body, {"X-Signature": sign(body, key), "Content-Type": "application/json"}


def fresh(payload: dict) -> dict:
    payload = json.loads(json.dumps(payload))
    payload["data"]["attributes"]["timestamp"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    return payload


# ---------------------------------------------------------------- signature


def test_sign_format_matches_docs():
    sig = sign(BODY, "k")
    assert sig.startswith("sha256=") and len(sig) == len("sha256=") + 64


@pytest.mark.parametrize(
    "header, ok",
    [
        (lambda: sign(BODY, "k"), True),
        (lambda: sign(BODY, "k").upper().replace("SHA256=", "sha256="), True),
        (lambda: sign(BODY, "k")[len("sha256="):], True),
        (lambda: sign(BODY, "other"), False),
        (lambda: sign(BODY + b" ", "k"), False),
        (lambda: None, False),
        (lambda: "", False),
    ],
)
def test_verify(header, ok):
    assert verify(BODY, header(), "k") is ok


def test_verify_without_key_fails():
    assert verify(BODY, sign(BODY, "k"), None) is False


# ---------------------------------------------------------------- normalization


def test_button_press_becomes_ding():
    event = normalize(WebhookPayload.model_validate(RING_BUTTON_PRESS), "ring_api")
    assert event.type == "ding" and event.device_id == "dev123" and event.source == "ring_api"
    assert event.id == "dev123_button_press_1792404000000"
    assert event.ts == datetime.fromtimestamp(1792404000, tz=timezone.utc)


def test_motion_with_unknown_subtype_passes_through():
    payload = json.loads(json.dumps(RING_BUTTON_PRESS))
    payload["data"].update(type="motion_detected", id="dev123_motion_1")
    payload["data"]["attributes"].update(sub_type="some_future_value", component_ids=["0"])
    event = normalize(WebhookPayload.model_validate(payload), "ring_api")
    assert event.type == "motion"


def test_other_event_types_are_ignored():
    payload = json.loads(json.dumps(RING_BUTTON_PRESS))
    payload["data"]["type"] = "device_offline"
    assert normalize(WebhookPayload.model_validate(payload), "ring_api") is None


def test_timestamp_formats():
    expected = datetime(2026, 10, 19, 10, 0, tzinfo=timezone.utc)
    assert parse_timestamp(1792404000000) == expected
    assert parse_timestamp("1792404000000") == expected
    assert parse_timestamp("2026-10-19T10:00:00Z") == expected


# ---------------------------------------------------------------- harness


def test_harness_payload_has_ring_v11_shape():
    body, sig = HarnessRingClient(HARNESS_KEY).signed_delivery("button_press")
    payload = json.loads(body)
    assert payload["meta"]["version"] == "1.1"
    assert payload["data"]["type"] == "button_press"
    assert payload["data"]["id"].startswith(f"{HARNESS_DEVICE.id}_button_press_")
    assert verify(body, sig, HARNESS_KEY)
    assert not verify(body, sig, RING_KEY)


def test_harness_requires_key():
    with pytest.raises(ValueError):
        HarnessRingClient("")


# ---------------------------------------------------------------- HTTP ingest


def test_ring_signed_webhook_is_accepted_as_ring_api(client, auth_headers):
    body, headers = ring_delivery(fresh(RING_BUTTON_PRESS))
    r = client.post("/api/webhooks/ring", content=body, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "accepted" and r.json()["source"] == "ring_api"

    record = client.get(f"/api/events/{r.json()['event_id']}", headers=auth_headers).json()
    assert record["event"]["source"] == "ring_api"
    # The worker ran inline. Without Ring credentials no clip can be fetched, so it says so and
    # falls back to the deterministic no-speech card (no AWS calls).
    assert record["status"] == "ready" and record["card"]["visitor_type"] == "no_speech"
    assert any("Ring credentials" in n for n in record["pipeline"]["notes"])


def test_harness_signed_webhook_is_labeled_test_harness(client):
    body, sig = HarnessRingClient(HARNESS_KEY).signed_delivery("motion_detected")
    r = client.post("/api/webhooks/ring", content=body, headers={"X-Signature": sig})
    assert r.json()["source"] == "test_harness"


def test_bad_signature_is_rejected(client):
    body, headers = ring_delivery(fresh(RING_BUTTON_PRESS), key="attacker-key")
    assert client.post("/api/webhooks/ring", content=body, headers=headers).status_code == 401
    assert client.post("/api/webhooks/ring", content=body).status_code == 401


def test_reserialized_body_fails_verification(client):
    payload = fresh(RING_BUTTON_PRESS)
    body, headers = ring_delivery(payload)
    tampered = json.dumps(payload, indent=2).encode()  # same JSON, different bytes
    assert client.post("/api/webhooks/ring", content=tampered, headers=headers).status_code == 401


def test_oversized_webhook_is_rejected_before_parsing(client):
    body = b'{"pad":"' + b"x" * (64 * 1024) + b'"}'
    r = client.post("/api/webhooks/ring", content=body, headers={"X-Signature": sign(body, RING_KEY)})
    assert r.status_code == 413


def test_malformed_but_signed_payload_is_400(client):
    body = b'{"not": "a ring payload"}'
    r = client.post("/api/webhooks/ring", content=body, headers={"X-Signature": sign(body, RING_KEY)})
    assert r.status_code == 400


def test_duplicate_delivery_is_acknowledged_once(client):
    body, headers = ring_delivery(fresh(RING_BUTTON_PRESS))
    first = client.post("/api/webhooks/ring", content=body, headers=headers).json()
    second = client.post("/api/webhooks/ring", content=body, headers=headers).json()
    assert first["status"] == "accepted" and second["status"] == "duplicate"


def test_unhandled_and_stale_events_get_200(client):
    offline = fresh(RING_BUTTON_PRESS)
    offline["data"]["type"] = "device_offline"
    r = client.post("/api/webhooks/ring", content=ring_delivery(offline)[0], headers=ring_delivery(offline)[1])
    assert r.status_code == 200 and r.json()["status"] == "ignored"

    stale = json.loads(json.dumps(RING_BUTTON_PRESS))
    old = datetime.now(timezone.utc) - timedelta(hours=1)
    stale["data"]["attributes"]["timestamp"] = int(old.timestamp() * 1000)
    body, headers = ring_delivery(stale)
    r = client.post("/api/webhooks/ring", content=body, headers=headers)
    assert r.status_code == 200 and r.json() == {
        "status": "ignored", "event_id": stale["data"]["id"], "source": "ring_api", "reason": "stale event"
    }


# ---------------------------------------------------------------- demo routes


def test_demo_trigger_runs_harness_through_ingest(client, auth_headers):
    r = client.post("/api/demo/trigger", json={"type": "ding"}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["result"]["status"] == "accepted" and body["result"]["source"] == "test_harness"
    assert "not a Ring simulator" in body["harness"]

    events = client.get("/api/events", headers=auth_headers).json()
    assert [e["event"]["id"] for e in events] == [body["result"]["event_id"]]
    assert events[0]["device_name"] == "Front door (test harness)"
    assert events[0]["event"]["type"] == "ding"


def test_events_since_filter_and_reset(client, auth_headers):
    client.post("/api/demo/trigger", json={"type": "ding"}, headers=auth_headers)
    newest = client.get("/api/events", headers=auth_headers).json()[0]["updated_at"]
    assert client.get("/api/events", params={"since": newest}, headers=auth_headers).json() == []
    assert client.get("/api/events", params={"since": "2026-10-19T10:00:00"}, headers=auth_headers).status_code == 422

    client.post("/api/demo/reset", headers=auth_headers)
    assert client.get("/api/events", headers=auth_headers).json() == []


def test_demo_routes_require_token(client):
    assert client.post("/api/demo/trigger", json={}).status_code == 401
    assert client.get("/api/events").status_code == 401
    assert client.get("/api/events/x").status_code == 401


def test_unknown_event_is_404(client, auth_headers):
    assert client.get("/api/events/nope", headers=auth_headers).status_code == 404


def test_ring_status_without_credentials(client, auth_headers):
    body = client.get("/api/ring/status", headers=auth_headers).json()
    assert body == {"configured": False, "source": "test_harness", "devices": ["Front door (test harness)"]}
