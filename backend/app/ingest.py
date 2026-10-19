"""Webhook ingest: verify, normalize, store as processing, dispatch async. Must finish well under 5 s.

Ring retries on 5xx/timeouts and may disable endpoints that keep returning 4xx, so anything
well-formed and correctly signed is acknowledged with 200, even when Threshold ignores it.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ValidationError

from .config import get_settings
from .dispatch import dispatch
from .models import EventRecord, EventSource
from .ring.webhook import WebhookPayload, normalize, verify
from .store import get_store

log = logging.getLogger(__name__)


class InvalidSignature(Exception):
    pass


class InvalidPayload(Exception):
    pass


class IngestResult(BaseModel):
    status: Literal["accepted", "duplicate", "ignored"]
    event_id: str | None = None
    source: EventSource | None = None
    reason: str | None = None


def identify_source(body: bytes, signature: str | None) -> EventSource:
    """Which key signed the body decides the source: Ring's HMAC key or our test-harness key."""
    settings = get_settings()
    if verify(body, signature, settings.ring_hmac_key):
        return "ring_api"
    if verify(body, signature, settings.harness_hmac_key):
        return "test_harness"
    raise InvalidSignature("X-Signature does not match any configured key")


def ingest_webhook(body: bytes, signature: str | None) -> IngestResult:
    source = identify_source(body, signature)
    try:
        payload = WebhookPayload.model_validate(json.loads(body))
    except (ValueError, ValidationError) as err:
        raise InvalidPayload(str(err)) from err

    event = normalize(payload, source)
    if event is None:
        return IngestResult(status="ignored", source=source, reason=f"event type {payload.data.type!r} not handled")

    age = datetime.now(timezone.utc) - event.ts
    if age > timedelta(seconds=get_settings().webhook_max_age_seconds):
        return IngestResult(status="ignored", event_id=event.id, source=source, reason="stale event")

    if not get_store().create_event(EventRecord(event=event)):
        return IngestResult(status="duplicate", event_id=event.id, source=source)

    dispatch(event.id)
    log.info("accepted %s event %s from %s", event.type, event.id, source)
    return IngestResult(status="accepted", event_id=event.id, source=source)
