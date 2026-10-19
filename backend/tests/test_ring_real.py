"""RealRingClient against a fake transport (no network). Response shapes follow the Ring API docs."""

import json

import pytest

from app.config import Settings
from app.ring.real import HttpResponse, RealRingClient, RingApiError, RingConfigError

API = "https://api.amazonvision.com"
OAUTH = "https://oauth.ring.com/oauth/token"


class FakeTransport:
    def __init__(self, routes: dict[tuple[str, str], list[HttpResponse]]):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls: list[tuple[str, str, dict, bytes | None]] = []

    def __call__(self, method, url, headers, data, timeout):
        self.calls.append((method, url, headers, data))
        key = (method, url.split("?")[0])
        responses = self.routes.get(key)
        assert responses, f"unexpected request {key}"
        return responses.pop(0) if len(responses) > 1 else responses[0]


def ok(body: dict) -> HttpResponse:
    return HttpResponse(200, {}, json.dumps(body).encode())


DEVICES = {
    "meta": {"time": "2026-10-19T10:00:00Z"},
    "data": [
        {"type": "devices", "id": "dev123", "attributes": {"name": "Front Door", "image_url": "https://x"}},
        {"type": "devices", "id": "dev456", "attributes": {}},
    ],
}
HISTORY = {
    "data": [
        {
            "type": "history-events",
            "id": "evt-ding",
            "attributes": {"event_type": "ding", "is_third_party_reviewed": False, "start": 1792404000000, "end": 1792404030000},
            "relationships": {"source": {"data": {"type": "devices", "id": "dev123"}}},
        },
        {
            "type": "history-events",
            "id": "evt-motion",
            "attributes": {"event_type": "motion.human", "start": 1792403000000, "end": 1792403030000},
            "relationships": {"source": {"data": {"type": "devices", "id": "dev123"}}},
        },
        {"type": "history-events", "id": "evt-live", "attributes": {"event_type": "on_demand", "start": 1792402000000}},
    ],
    "links": {"next": "/v1/history/devices/dev123/events?page[key]=2026-10-19T09:00:00Z"},
}


def access_settings(**kw) -> Settings:
    return Settings(ring_access_token="playground-token", **kw)


def refresh_settings() -> Settings:
    return Settings(ring_refresh_token="rt-1", ring_client_id="cid", ring_client_secret="secret")


def test_config_modes():
    with pytest.raises(RingConfigError):
        RealRingClient(Settings(ring_access_token="a", ring_refresh_token="b", ring_client_id="c", ring_client_secret="d"))
    with pytest.raises(RingConfigError):
        RealRingClient(Settings(ring_refresh_token="b"))
    assert RealRingClient.from_settings(Settings()) is None
    # "none" is the deploy-time sentinel for an unset value.
    assert RealRingClient.from_settings(Settings(ring_access_token="none", ring_hmac_key="None")) is None


def test_access_token_mode_lists_devices_with_bearer():
    transport = FakeTransport({("GET", f"{API}/v1/devices"): [ok(DEVICES)]})
    client = RealRingClient(access_settings(), transport=transport)
    devices = client.list_devices()
    assert [(d.id, d.name) for d in devices] == [("dev123", "Front Door"), ("dev456", "Ring device")]
    assert transport.calls[0][2]["Authorization"] == "Bearer playground-token"


def test_refresh_mode_fetches_and_caches_token():
    token = {"access_token": "at-1", "refresh_token": "rt-1", "expires_in": 14400, "token_type": "Bearer", "scope": "ava.v1:read"}
    transport = FakeTransport({("POST", OAUTH): [ok(token)], ("GET", f"{API}/v1/devices"): [ok(DEVICES)]})
    client = RealRingClient(refresh_settings(), transport=transport)
    client.list_devices()
    client.list_devices()
    posts = [c for c in transport.calls if c[0] == "POST"]
    assert len(posts) == 1
    assert b"grant_type=refresh_token" in posts[0][3] and b"client_secret=secret" in posts[0][3]
    assert transport.calls[-1][2]["Authorization"] == "Bearer at-1"


def test_401_in_refresh_mode_forces_one_refresh():
    tokens = [ok({"access_token": "at-1", "expires_in": 14400}), ok({"access_token": "at-2", "expires_in": 14400})]
    transport = FakeTransport({
        ("POST", OAUTH): tokens,
        ("GET", f"{API}/v1/users/me"): [HttpResponse(401, {}, b"expired"), ok({"data": {"id": "acct"}})],
    })
    client = RealRingClient(refresh_settings(), transport=transport)
    assert client.get_account() == {"id": "acct"}
    assert transport.calls[-1][2]["Authorization"] == "Bearer at-2"


def test_429_honours_retry_after_then_succeeds():
    slept = []
    transport = FakeTransport({
        ("GET", f"{API}/v1/devices"): [HttpResponse(429, {"retry-after": "1"}, b""), ok(DEVICES)],
    })
    client = RealRingClient(access_settings(), transport=transport, sleep=slept.append)
    assert len(client.list_devices()) == 2
    assert slept == [1.0]


def test_persistent_errors_raise():
    transport = FakeTransport({("GET", f"{API}/v1/devices"): [HttpResponse(500, {}, b"boom")]})
    with pytest.raises(RingApiError) as err:
        RealRingClient(access_settings(), transport=transport).list_devices()
    assert err.value.status == 500


def test_get_device_404_is_none():
    transport = FakeTransport({("GET", f"{API}/v1/devices/missing"): [HttpResponse(404, {}, b"")]})
    assert RealRingClient(access_settings(), transport=transport).get_device("missing") is None


def test_download_clip_waits_then_retries_until_ready():
    import time as _time

    slept = []
    transport = FakeTransport({
        ("POST", f"{API}/v1/devices/dev123/media/video/download"): [
            HttpResponse(425, {}, b""), HttpResponse(416, {}, b""), HttpResponse(200, {"content-type": "video/mp4"}, b"MP4"),
        ],
    })
    client = RealRingClient(access_settings(), transport=transport, sleep=slept.append)
    start_ms = int(_time.time() * 1000)
    assert client.download_clip("dev123", start_ms, 10_000) == b"MP4"
    assert 14 < slept[0] <= 15  # range end (10 s) + 5 s processing delay
    assert slept[1:] == [5, 10]
    method, _, headers, data = transport.calls[0]
    assert method == "POST" and headers["Content-Type"] == "application/json"
    assert json.loads(data) == {"timestamp": start_ms, "duration": 10_000, "audio_options": {"audio_enabled": True}}


def test_download_clip_gives_up_after_deadline():
    transport = FakeTransport({("POST", f"{API}/v1/devices/dev123/media/video/download"): [HttpResponse(416, {}, b"")]})
    client = RealRingClient(access_settings(), transport=transport, sleep=lambda s: None)
    assert client.download_clip("dev123", 1_000_000, 10_000) is None  # range long past: one try, then stop
    assert len(transport.calls) == 1


def test_history_normalizes_to_door_events():
    transport = FakeTransport({("GET", f"{API}/v1/history/devices/dev123/events"): [ok(HISTORY)]})
    events = RealRingClient(access_settings(), transport=transport).recent_events("dev123")
    assert [(e.id, e.type, e.source, e.device_id) for e in events] == [
        ("evt-ding", "ding", "ring_api", "dev123"),
        ("evt-motion", "motion", "ring_api", "dev123"),
    ]
    assert "event_types=ding%2Cmotion" in transport.calls[0][1]
