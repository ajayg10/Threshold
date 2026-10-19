"""Ring webhook v1.1: HMAC verification and normalization to DoorEvent.

Per the Ring API docs (Webhook Authentication & Verification):
  X-Signature: sha256=<hex HMAC-SHA256 of the raw request body, keyed with the HMAC Signature Key>
Always verify the raw bytes, never re-serialized JSON.
"""

import hashlib
import hmac
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict

from ..models import DoorEvent, DoorEventType, EventSource, Media
from ..seeds import SCENARIO_ID, get_scenario, seed_audio_url

SIGNATURE_HEADER = "X-Signature"
SIGNATURE_PREFIX = "sha256="
# Test-harness extension attribute naming a seeded scenario. Never honoured for ring_api events.
SCENARIO_ATTRIBUTE = "x_threshold_scenario"

# Webhook event type -> DoorEvent.type. Everything else (device_added, subscription_*, ...) is ignored.
EVENT_TYPE_MAP: dict[str, DoorEventType] = {
    "button_press": "ding",
    "motion_detected": "motion",
}


def sign(body: bytes, key: str) -> str:
    # Assumption (unverified until the first real delivery): the key is used as its UTF-8 bytes.
    return SIGNATURE_PREFIX + hmac.new(key.encode("utf-8"), body, hashlib.sha256).hexdigest()


def verify(body: bytes, header: str | None, key: str | None) -> bool:
    if not header or not key:
        return False
    provided = header.strip()
    if provided.lower().startswith(SIGNATURE_PREFIX):
        provided = provided[len(SIGNATURE_PREFIX):]
    expected = sign(body, key)[len(SIGNATURE_PREFIX):]
    return hmac.compare_digest(expected, provided.lower())


class _Loose(BaseModel):
    # Ring says to pass unknown values through, so unknown fields are allowed here (unlike our own models).
    model_config = ConfigDict(extra="allow")


class WebhookMeta(_Loose):
    version: str
    time: str
    request_id: str
    account_id: str | None = None


class WebhookAttributes(_Loose):
    source: str
    source_type: str | None = None
    timestamp: int | str
    sub_type: str | None = None


class WebhookData(_Loose):
    id: str
    type: str
    attributes: WebhookAttributes


class WebhookPayload(_Loose):
    meta: WebhookMeta
    data: WebhookData


def parse_timestamp(value: int | str) -> datetime:
    """Epoch milliseconds (documented) or an ISO-8601 string (accepted by Ring's sample code)."""
    if isinstance(value, int) or (isinstance(value, str) and value.isdigit()):
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def normalize(payload: WebhookPayload, source: EventSource) -> DoorEvent | None:
    door_type = EVENT_TYPE_MAP.get(payload.data.type)
    if door_type is None:
        return None
    media = Media()
    scenario_id = getattr(payload.data.attributes, SCENARIO_ATTRIBUTE, None)
    if source == "test_harness" and isinstance(scenario_id, str) and SCENARIO_ID.match(scenario_id):
        if get_scenario(scenario_id) is not None:
            media = Media(audio_url=seed_audio_url(scenario_id))
    return DoorEvent(
        id=payload.data.id,
        device_id=payload.data.attributes.source,
        type=door_type,
        ts=parse_timestamp(payload.data.attributes.timestamp),
        source=source,
        media=media,
    )
