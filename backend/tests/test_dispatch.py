"""Async dispatch: in AWS the webhook path must only fire an async Lambda invoke and return."""

import json

import pytest

from app import dispatch, worker
from app.config import get_settings


class FakeLambda:
    def __init__(self):
        self.calls = []

    def invoke(self, **kwargs):
        self.calls.append(kwargs)
        return {"StatusCode": 202}


@pytest.fixture
def lambda_mode(monkeypatch):
    fake = FakeLambda()
    settings = get_settings()
    monkeypatch.setattr(settings, "dispatch_mode", "lambda")
    monkeypatch.setattr(settings, "worker_function_name", "threshold-worker")
    monkeypatch.setattr(dispatch, "_lambda_client", lambda: fake)
    return fake


def test_lambda_mode_invokes_worker_asynchronously(lambda_mode, client, auth_headers):
    r = client.post("/api/demo/trigger", json={"type": "ding"}, headers=auth_headers).json()
    assert len(lambda_mode.calls) == 1
    call = lambda_mode.calls[0]
    assert call["FunctionName"] == "threshold-worker" and call["InvocationType"] == "Event"
    payload = json.loads(call["Payload"])
    assert payload == {"task": "process_event", "event_id": r["result"]["event_id"]}

    # Nothing has processed it yet: the record waits in "processing" until the worker runs.
    record = client.get(f"/api/events/{payload['event_id']}", headers=auth_headers).json()
    assert record["status"] == "processing"

    # No scenario attached, so the worker produces the no-speech card without calling AWS.
    assert worker.handler(payload, None) == {"event_id": payload["event_id"], "status": "ready"}


def test_worker_rejects_unexpected_payload():
    with pytest.raises(ValueError):
        worker.handler({"task": "other"}, None)


def test_worker_handles_missing_event():
    assert worker.handler({"task": "process_event", "event_id": "gone"}, None) == {"event_id": "gone", "status": "missing"}
