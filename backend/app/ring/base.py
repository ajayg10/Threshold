"""RingClient interface (docs/RING_API_FINDINGS.md).

Implementations:
- RealRingClient: the Ring Partner API at api.amazonvision.com.
- HarnessRingClient: our own test harness. It is NOT a Ring simulator (Ring documents none).

Events reach Threshold as webhooks (app/ring/webhook.py), whichever client produced them.
"""

from typing import Protocol

from pydantic import BaseModel

from ..models import DoorEvent, EventSource


class RingDevice(BaseModel):
    id: str
    name: str


class RingClient(Protocol):
    source: EventSource

    def list_devices(self) -> list[RingDevice]: ...

    def get_device(self, device_id: str) -> RingDevice | None: ...

    def recent_events(self, device_id: str, limit: int = 10) -> list[DoorEvent]: ...
