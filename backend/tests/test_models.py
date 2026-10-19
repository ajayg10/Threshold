from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models import DoorEvent, EventRecord, VisitorCard
from app.store import MemoryStore


def reply(i: int, intent: str = "ask_id") -> dict:
    return {"id": f"r{i}", "resident_text": "Please show ID", "visitor_text": "ID dikhaiye", "intent": intent}


def card(**overrides) -> dict:
    base = {
        "event_id": "e1",
        "detected_language": "hi-IN",
        "transcript": "नमस्ते",
        "translation": "Hello",
        "visitor_type": "delivery",
        "urgency": "low",
        "risk_level": "low",
        "summary": "A courier has a parcel.",
        "suggested_replies": [reply(1), reply(2), reply(3)],
    }
    base.update(overrides)
    return base


def test_valid_card_parses():
    assert VisitorCard.model_validate(card()).visitor_type == "delivery"


@pytest.mark.parametrize("n", [0, 2, 4])
def test_card_needs_exactly_three_replies(n):
    with pytest.raises(ValidationError):
        VisitorCard.model_validate(card(suggested_replies=[reply(i) for i in range(n)]))


def test_card_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        VisitorCard.model_validate(card(unlock=True))


def test_card_rejects_unknown_reply_intent():
    with pytest.raises(ValidationError):
        VisitorCard.model_validate(card(suggested_replies=[reply(1, "open_door"), reply(2), reply(3)]))


def test_door_event_requires_timezone():
    with pytest.raises(ValidationError):
        DoorEvent(id="e", device_id="d", type="ding", ts=datetime(2026, 10, 19), source="seeded")


def test_memory_store_roundtrip_and_since_filter():
    store = MemoryStore()
    ev = DoorEvent(id="e1", device_id="d1", type="ding", ts=datetime.now(timezone.utc), source="test_harness")
    rec = EventRecord(event=ev)
    store.put_event(rec)
    assert store.get_event("e1") == rec
    assert store.list_events(since=rec.updated_at) == []
    store.reset()
    assert store.list_events() == []
