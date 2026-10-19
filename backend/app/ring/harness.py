"""Threshold's test harness. It is NOT a Ring simulator: Ring documents no simulator.

It builds webhook payloads in Ring's documented v1.1 shape, signs them with our own HARNESS_HMAC_KEY,
and sends them through the same verification and normalization code that real Ring deliveries use.
Events it produces are labeled source="test_harness" everywhere.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Literal

from ..models import DoorEvent
from .base import RingDevice
from .webhook import SCENARIO_ATTRIBUTE, sign

HARNESS_DEVICE = RingDevice(id="harness-front-door", name="Front door (test harness)")
RingWebhookType = Literal["button_press", "motion_detected"]
# Ring's documented data.id format is <device_id>_<event>_<timestamp>, using "motion" for motion_detected.
_ID_EVENT = {"button_press": "button_press", "motion_detected": "motion"}


class HarnessRingClient:
    source = "test_harness"

    def __init__(self, hmac_key: str):
        if not hmac_key:
            raise ValueError("HARNESS_HMAC_KEY is not configured")
        self._key = hmac_key

    def list_devices(self) -> list[RingDevice]:
        return [HARNESS_DEVICE]

    def get_device(self, device_id: str) -> RingDevice | None:
        return HARNESS_DEVICE if device_id == HARNESS_DEVICE.id else None

    def recent_events(self, device_id: str, limit: int = 10) -> list[DoorEvent]:
        return []  # harness events live in Threshold's own store

    def build_payload(
        self,
        ring_type: RingWebhookType,
        device_id: str = HARNESS_DEVICE.id,
        when: datetime | None = None,
        sub_type: str = "human",
        scenario_id: str | None = None,
    ) -> bytes:
        when = when or datetime.now(timezone.utc)
        ts_ms = int(when.timestamp() * 1000)
        attributes: dict = {"source": device_id, "source_type": "devices", "timestamp": ts_ms}
        if ring_type == "motion_detected":
            attributes["timestamp_readable"] = when.isoformat()
            attributes["sub_type"] = sub_type
        if scenario_id:
            # Harness-only extension, covered by the signature. Ignored unless the harness key signed it.
            attributes[SCENARIO_ATTRIBUTE] = scenario_id
        payload = {
            "meta": {
                "version": "1.1",
                "time": when.isoformat().replace("+00:00", "Z"),
                "request_id": str(uuid.uuid4()),
                "account_id": "test-harness-account",
            },
            "data": {
                "id": f"{device_id}_{_ID_EVENT[ring_type]}_{ts_ms}",
                "type": ring_type,
                "attributes": attributes,
                "relationships": {"devices": {"links": {"self": f"/v1/devices/{device_id}"}}},
            },
        }
        return json.dumps(payload, separators=(",", ":")).encode()

    def signed_delivery(self, ring_type: RingWebhookType, **kwargs) -> tuple[bytes, str]:
        """(raw body, X-Signature header value), exactly as a webhook POST would carry them."""
        body = self.build_payload(ring_type, **kwargs)
        return body, sign(body, self._key)
