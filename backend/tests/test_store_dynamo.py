"""DynamoStore against moto, with the same key schema as template.yaml (checked in test_infra.py)."""

from datetime import datetime, timedelta, timezone

import boto3
import pytest
from moto import mock_aws

from app.models import DoorEvent, EventRecord, ResidentSettings
from app.seeds import resident_settings
from app.store import DynamoStore

EVENTS, SETTINGS = "events-test", "settings-test"


def create_tables():
    ddb = boto3.client("dynamodb", region_name="us-east-1")
    ddb.create_table(
        TableName=EVENTS,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "id", "AttributeType": "S"},
            {"AttributeName": "gsi_pk", "AttributeType": "S"},
            {"AttributeName": "updated_at", "AttributeType": "S"},
        ],
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        GlobalSecondaryIndexes=[{
            "IndexName": "by_updated",
            "KeySchema": [
                {"AttributeName": "gsi_pk", "KeyType": "HASH"},
                {"AttributeName": "updated_at", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        }],
    )
    ddb.create_table(
        TableName=SETTINGS,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
    )


@pytest.fixture
def store():
    with mock_aws():
        create_tables()
        yield DynamoStore(EVENTS, SETTINGS, "us-east-1")


def record(event_id: str, at: datetime) -> EventRecord:
    event = DoorEvent(id=event_id, device_id="d1", type="ding", ts=at, source="test_harness")
    return EventRecord(event=event, created_at=at, updated_at=at)


def test_create_is_idempotent(store):
    now = datetime.now(timezone.utc)
    assert store.create_event(record("e1", now)) is True
    assert store.create_event(record("e1", now)) is False
    assert store.get_event("e1").event.id == "e1"
    assert store.get_event("missing") is None


def test_put_updates_status(store):
    rec = record("e1", datetime.now(timezone.utc))
    store.create_event(rec)
    rec.status, rec.error = "error", "Phase 3"
    store.put_event(rec)
    assert store.get_event("e1").status == "error"


def test_list_since_uses_updated_at(store):
    base = datetime.now(timezone.utc)
    for i in range(3):
        store.create_event(record(f"e{i}", base + timedelta(seconds=i)))
    assert [r.event.id for r in store.list_events()] == ["e2", "e1", "e0"]
    assert [r.event.id for r in store.list_events(since=base + timedelta(seconds=1))] == ["e2"]


def test_retention_hides_expired_records(store):
    store.put_settings(ResidentSettings(retention_days=1))
    store.create_event(record("old", datetime.now(timezone.utc) - timedelta(days=2)))
    assert store.get_event("old") is None
    assert store.list_events() == []


def test_settings_roundtrip_and_reset_to_seeds(store):
    assert store.get_settings() == resident_settings()
    store.put_settings(ResidentSettings(resident_language="hi-IN", retention_days=3))
    assert store.get_settings().resident_language == "hi-IN"
    store.create_event(record("e1", datetime.now(timezone.utc)))
    store.reset()
    assert store.list_events() == [] and store.get_settings() == resident_settings()
