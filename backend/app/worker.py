"""Pipeline worker. Runs in a thread locally and as its own Lambda (async invoke) in AWS."""

import logging

from .models import DoorEvent, EventRecord, utcnow
from .pipeline import orchestrator
from .ring.harness import HARNESS_DEVICE
from .ring.real import RealRingClient
from .store import get_store

log = logging.getLogger(__name__)


def resolve_device_name(event: DoorEvent) -> str | None:
    """User-assigned device name. Ring events hit the real Ring API (GET /v1/devices/{id})."""
    try:
        if event.source == "ring_api":
            client = RealRingClient.from_settings()
            device = client.get_device(event.device_id) if client else None
        else:
            device = HARNESS_DEVICE if event.device_id == HARNESS_DEVICE.id else None
    except Exception:
        log.exception("could not resolve device name for %s", event.id)
        return None
    return device.name if device else None


def save(record: EventRecord) -> EventRecord:
    """Read-merge-write: the pipeline owns card/pipeline/status, but replies and resident escalations may
    have been added through the API while it ran, so those are kept and agent escalations are merged in."""
    store = get_store()
    fresh = store.get_event(record.event.id) or record
    known = {e.message_id for e in fresh.escalations}
    merged = fresh.model_copy(update={
        "device_name": record.device_name,
        "status": record.status,
        "card": record.card,
        "pipeline": record.pipeline,
        "error": record.error,
        "escalations": fresh.escalations + [e for e in record.escalations if e.message_id not in known],
        "updated_at": utcnow(),
    })
    store.put_event(merged)
    return merged


def process_event(event_id: str) -> EventRecord | None:
    record = get_store().get_event(event_id)
    if record is None:
        log.warning("event %s not found", event_id)
        return None

    record.device_name = resolve_device_name(record.event)

    def publish_preliminary(card, info) -> None:
        save(record.model_copy(update={"status": "ready", "card": card, "pipeline": info}))

    try:
        record.card, record.pipeline = orchestrator.run(record, on_preliminary=publish_preliminary)
        record.status = "ready"
    except Exception as err:
        log.exception("pipeline failed for %s", event_id)
        record.status, record.error = "error", f"Pipeline failed ({type(err).__name__})"

    return save(record)


def handler(event: dict, context) -> dict:
    """Lambda entry point for {"task": "process_event", "event_id": ...}."""
    if event.get("task") != "process_event" or not event.get("event_id"):
        raise ValueError(f"unexpected worker payload: {event!r}")
    record = process_event(event["event_id"])
    return {"event_id": event["event_id"], "status": record.status if record else "missing"}
