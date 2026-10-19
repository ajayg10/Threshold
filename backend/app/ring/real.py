"""Ring Partner API client (https://api.amazonvision.com). See docs/RING_API_FINDINGS.md.

Two credential modes, mirroring Ring's ring-api-helloworld sample:
- access token: RING_ACCESS_TOKEN (Developer Playground token, about 30 min)
- refresh token: RING_REFRESH_TOKEN + RING_CLIENT_ID + RING_CLIENT_SECRET (auto-refresh via oauth.ring.com)
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Literal

from ..config import Settings, get_settings
from ..models import DoorEvent
from .base import RingDevice

log = logging.getLogger(__name__)

MAX_RETRIES_ON_429 = 2
MAX_RETRY_AFTER_SECONDS = 5.0
REFRESH_MARGIN_SECONDS = 120
CLIP_PROCESSING_DELAY_SECONDS = 5
CLIP_DEADLINE_SECONDS = 120
CLIP_RETRY_SCHEDULE = (5, 10, 20, 30, 30, 30, 30)


class RingConfigError(ValueError):
    pass


class RingApiError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"Ring API returned HTTP {status}: {message}")
        self.status = status


@dataclass
class HttpResponse:
    status: int
    headers: dict[str, str]
    body: bytes


Transport = Callable[[str, str, dict[str, str], bytes | None, float], HttpResponse]


def urllib_transport(method: str, url: str, headers: dict[str, str], data: bytes | None, timeout: float) -> HttpResponse:
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return HttpResponse(resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read())
    except urllib.error.HTTPError as err:
        return HttpResponse(err.code, {k.lower(): v for k, v in err.headers.items()}, err.read())


class RealRingClient:
    source = "ring_api"

    def __init__(self, settings: Settings, transport: Transport = urllib_transport, sleep=time.sleep):
        has_access = bool(settings.ring_access_token)
        refresh_parts = [settings.ring_refresh_token, settings.ring_client_id, settings.ring_client_secret]
        has_refresh = any(refresh_parts)
        if has_access and has_refresh:
            raise RingConfigError("Set either RING_ACCESS_TOKEN or the refresh-token trio, not both")
        if has_refresh and not all(refresh_parts):
            raise RingConfigError("Refresh mode needs RING_REFRESH_TOKEN, RING_CLIENT_ID and RING_CLIENT_SECRET")
        if not (has_access or has_refresh):
            raise RingConfigError("No Ring credentials configured")

        self.mode: Literal["access_token", "refresh_token"] = "access_token" if has_access else "refresh_token"
        self._settings = settings
        self._transport = transport
        self._sleep = sleep
        self._access_token = settings.ring_access_token
        self._refresh_token = settings.ring_refresh_token
        self._expires_at = float("inf") if has_access else 0.0

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> RealRingClient | None:
        """The configured client, or None when no Ring credentials are set (the demo runs without them)."""
        settings = settings or get_settings()
        try:
            return cls(settings)
        except RingConfigError as err:
            if settings.ring_access_token or settings.ring_refresh_token:
                log.error("Ring client misconfigured: %s", err)
            return None

    # ------------------------------------------------------------ auth

    def _refresh(self) -> None:
        s = self._settings
        form = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": self._refresh_token,
            "client_id": s.ring_client_id,
            "client_secret": s.ring_client_secret,
        }).encode()
        resp = self._transport(
            "POST",
            f"{s.ring_oauth_base}/oauth/token",
            {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            form,
            s.ring_http_timeout_seconds,
        )
        if resp.status != 200:
            raise RingApiError(resp.status, "token refresh failed")
        body = json.loads(resp.body)
        self._access_token = body["access_token"]
        self._expires_at = time.time() + int(body.get("expires_in", 14400))
        new_refresh = body.get("refresh_token")
        if new_refresh and new_refresh != self._refresh_token:
            # Rotation behaviour is undocumented. Keep the new one for this process and say so.
            log.warning("Ring issued a new refresh token; update RING_REFRESH_TOKEN before this process restarts")
            self._refresh_token = new_refresh

    def _token(self, force_refresh: bool = False) -> str:
        if self.mode == "refresh_token" and (force_refresh or time.time() > self._expires_at - REFRESH_MARGIN_SECONDS):
            self._refresh()
        return self._access_token or ""

    # ------------------------------------------------------------ transport

    def _request(
        self, method: str, path: str, params: dict[str, str] | None = None, json_body: dict | None = None,
        ok: tuple[int, ...] = (200,), passthrough: tuple[int, ...] = (404,),
    ) -> HttpResponse:
        """Auth, refresh-on-401 and 429 backoff. Statuses in `ok` or `passthrough` are returned to the caller."""
        url = f"{self._settings.ring_api_base}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(json_body).encode() if json_body is not None else None
        refreshed = False
        for attempt in range(MAX_RETRIES_ON_429 + 1):
            headers = {"Authorization": f"Bearer {self._token()}"}
            headers["Content-Type" if data else "Accept"] = "application/json"
            resp = self._transport(method, url, headers, data, self._settings.ring_http_timeout_seconds)
            if resp.status in ok or resp.status in passthrough:
                return resp
            if resp.status == 401 and self.mode == "refresh_token" and not refreshed:
                self._token(force_refresh=True)
                refreshed = True
                continue
            if resp.status == 429 and attempt < MAX_RETRIES_ON_429:
                retry_after = float(resp.headers.get("retry-after", 2 ** attempt))
                self._sleep(min(retry_after, MAX_RETRY_AFTER_SECONDS))
                continue
            raise RingApiError(resp.status, resp.body[:200].decode("utf-8", "replace"))
        raise RingApiError(429, "rate limited")

    def _get(self, path: str, params: dict[str, str] | None = None) -> dict | None:
        resp = self._request("GET", path, params)
        return json.loads(resp.body) if resp.status == 200 else None

    # ------------------------------------------------------------ API

    def get_account(self) -> dict:
        """GET /v1/users/me. Used to prove the link works; account details are never shown to users."""
        body = self._get("/v1/users/me")
        if body is None:
            raise RingApiError(404, "account not found")
        return body.get("data", body)

    def list_devices(self) -> list[RingDevice]:
        body = self._get("/v1/devices") or {}
        return [_device(item) for item in body.get("data", [])]

    def get_device(self, device_id: str) -> RingDevice | None:
        body = self._get(f"/v1/devices/{urllib.parse.quote(device_id, safe='')}")
        return _device(body["data"]) if body and "data" in body else None

    def recent_events(self, device_id: str, limit: int = 10) -> list[DoorEvent]:
        """GET /v1/history/devices/{id}/events (polling alternative to webhooks), newest first."""
        body = self._get(
            f"/v1/history/devices/{urllib.parse.quote(device_id, safe='')}/events",
            {"event_types": "ding,motion"},
        ) or {}
        events = (normalize_history_item(item, device_id) for item in body.get("data", []))
        return [e for e in events if e is not None][:limit]

    def download_clip(self, device_id: str, start_ms: int, duration_ms: int, audio: bool = True) -> bytes | None:
        """POST /v1/devices/{id}/media/video/download -> MP4 bytes, or None if Ring has no recording.

        Per the docs: the body is flat JSON (not JSON:API); the endpoint never triggers recording;
        wait until the range has passed plus 5 s, then retry 416/425 on a 5/10/20/30 s schedule
        with the unchanged range until about 2 minutes after the range ends.
        `audio_enabled` is a request, not a guarantee: a video-only MP4 may come back.
        """
        end_ms = start_ms + duration_ms
        deadline = end_ms / 1000 + CLIP_DEADLINE_SECONDS
        first_attempt = end_ms / 1000 + CLIP_PROCESSING_DELAY_SECONDS
        if (wait := first_attempt - time.time()) > 0:
            self._sleep(wait)
        body = {"timestamp": start_ms, "duration": duration_ms, "audio_options": {"audio_enabled": audio}}
        path = f"/v1/devices/{urllib.parse.quote(device_id, safe='')}/media/video/download"
        for delay in CLIP_RETRY_SCHEDULE:
            resp = self._request("POST", path, json_body=body, ok=(200, 206), passthrough=(416, 425))
            if resp.status in (200, 206):
                return resp.body
            if time.time() + delay > deadline:
                break
            self._sleep(delay)
        log.info("no Ring recording for %s at %s", device_id, start_ms)
        return None


def _device(item: dict) -> RingDevice:
    return RingDevice(id=item["id"], name=(item.get("attributes") or {}).get("name") or "Ring device")


def normalize_history_item(item: dict, device_id: str) -> DoorEvent | None:
    """Event History item: {id, type: "history-events", attributes: {event_type, start, end, ...},
    relationships: {source: {data: {type: "devices", id}}}}."""
    attrs = item.get("attributes") or {}
    event_type = str(attrs.get("event_type", ""))
    if event_type == "ding":
        door_type = "ding"
    elif event_type == "motion" or event_type.startswith("motion."):
        door_type = "motion"
    else:
        return None
    source = ((item.get("relationships") or {}).get("source") or {}).get("data") or {}
    return DoorEvent(
        id=item["id"],
        device_id=source.get("id") or device_id,
        type=door_type,
        ts=datetime.fromtimestamp(int(attrs["start"]) / 1000, tz=timezone.utc),
        source="ring_api",
    )
