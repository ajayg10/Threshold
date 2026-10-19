"""FastAPI app. Runs under uvicorn locally and under Lambda via Mangum.

All routes live under /api so CloudFront can route /api/* to API Gateway.
"""

import time
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field

from . import __version__, notify, seeds
from .auth import require_token
from .config import get_settings
from .ingest import IngestResult, InvalidPayload, InvalidSignature, ingest_webhook
from .models import EscalationRecord, EventRecord, ReplyRecord, ResidentSettings, utcnow
from .pipeline import reply as reply_pipeline
from .ring.harness import HarnessRingClient
from .ring.real import RealRingClient, RingApiError
from .ring.webhook import SIGNATURE_HEADER
from .store import get_store

settings = get_settings()

app = FastAPI(
    title="Threshold API",
    version=__version__,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

if settings.app_env == "local":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

public = APIRouter(prefix="/api")
private = APIRouter(prefix="/api", dependencies=[Depends(require_token)])


@public.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": __version__,
        "env": settings.app_env,
        "region": settings.aws_region,
        "store": get_store().name,
        "ring_api_configured": bool(settings.ring_access_token or settings.ring_refresh_token),
        "precomputed_transcripts": settings.precomputed_transcripts,
    }


# ---------------------------------------------------------------- Ring webhook (HMAC, no bearer token)


MAX_WEBHOOK_BYTES = 64 * 1024  # Ring v1.1 payloads are well under 2 KB


@public.post("/webhooks/ring", response_model=IngestResult)
async def ring_webhook(request: Request) -> IngestResult:
    body = await request.body()  # raw bytes: the signature covers these exactly
    if len(body) > MAX_WEBHOOK_BYTES:
        raise HTTPException(413, "Webhook body too large")
    try:
        return ingest_webhook(body, request.headers.get(SIGNATURE_HEADER))
    except InvalidSignature as err:
        raise HTTPException(401, str(err)) from err
    except InvalidPayload as err:
        raise HTTPException(400, "Malformed Ring webhook payload") from err


# ---------------------------------------------------------------- authenticated routes


@private.get("/auth/check")
def auth_check() -> dict:
    """Confirms the bearer token reaches the backend (through CloudFront in AWS)."""
    return {"ok": True}


class TriggerRequest(BaseModel):
    scenario_id: str | None = None
    type: Literal["ding", "motion"] = "ding"  # used only when no scenario is given


class TriggerResponse(BaseModel):
    result: IngestResult
    ingest_ms: int
    harness: str = "Threshold test harness (not a Ring simulator)"


@private.get("/demo/scenarios")
def demo_scenarios() -> list[dict]:
    """The seeded, synthetic scenarios (docs/SEEDED_DATA.md)."""
    return [
        {"id": s.id, "label": s.label, "event_type": s.event_type, "language": s.language, "seeded": True}
        for s in seeds.scenarios().values()
    ]


@private.post("/demo/trigger", response_model=TriggerResponse)
def demo_trigger(req: TriggerRequest) -> TriggerResponse:
    """Builds a signed Ring v1.1 webhook with the test harness and feeds it through the real ingest path."""
    try:
        harness = HarnessRingClient(settings.harness_hmac_key)
    except ValueError as err:
        raise HTTPException(503, str(err)) from err
    event_type = req.type
    if req.scenario_id is not None:
        scenario = seeds.get_scenario(req.scenario_id)
        if scenario is None:
            raise HTTPException(404, f"Unknown scenario {req.scenario_id!r}")
        event_type = scenario.event_type
    body, signature = harness.signed_delivery(
        "button_press" if event_type == "ding" else "motion_detected", scenario_id=req.scenario_id
    )
    started = time.perf_counter()
    result = ingest_webhook(body, signature)
    return TriggerResponse(result=result, ingest_ms=round((time.perf_counter() - started) * 1000))


@private.post("/demo/reset")
def demo_reset() -> dict:
    """Clears all events and restores the seeded resident settings."""
    get_store().reset()
    return {"ok": True}


@private.get("/events", response_model=list[EventRecord])
def list_events(since: datetime | None = None) -> list[EventRecord]:
    if since is not None and since.tzinfo is None:
        raise HTTPException(422, "since must include a timezone, e.g. 2026-10-19T10:00:00Z")
    return get_store().list_events(since=since)


@private.get("/events/{event_id}", response_model=EventRecord)
def get_event(event_id: str) -> EventRecord:
    return _event_or_404(event_id)


def _event_or_404(event_id: str) -> EventRecord:
    record = get_store().get_event(event_id)
    if record is None:
        raise HTTPException(404, "Event not found")
    return record


class ReplyRequest(BaseModel):
    reply_id: str | None = None
    text: str | None = None


class ReplyResponse(BaseModel):
    reply: ReplyRecord
    audio_url: str | None
    plays_on: str = "door_display"  # never the Ring doorbell: Ring has no two-way talk API
    timings_ms: dict[str, int]
    warnings: list[str]


@private.post("/events/{event_id}/reply", response_model=ReplyResponse)
def send_reply(event_id: str, req: ReplyRequest) -> ReplyResponse:
    store = get_store()
    record = _event_or_404(event_id)
    try:
        result = reply_pipeline.make_reply(record, store.get_settings(), req.reply_id, req.text)
    except reply_pipeline.ReplyError as err:
        raise HTTPException(422, str(err)) from err
    record = _event_or_404(event_id)  # re-read: the worker may have updated the card meanwhile
    record.replies.append(result.record)
    record.updated_at = utcnow()
    store.put_event(record)
    return ReplyResponse(
        reply=result.record,
        audio_url=result.audio_url,
        timings_ms={"translate": result.translate_ms, "tts": result.tts_ms},
        warnings=result.warnings,
    )


class EscalateRequest(BaseModel):
    contact_id: str | None = None
    note: str = Field(default="", max_length=200)


@private.post("/events/{event_id}/escalate", response_model=EscalationRecord)
def escalate_event(event_id: str, req: EscalateRequest) -> EscalationRecord:
    store = get_store()
    record = _event_or_404(event_id)
    resident = store.get_settings()
    contact = notify.find_contact(resident, req.contact_id)
    if contact is None:
        raise HTTPException(404, "Unknown trusted contact")
    reason = req.note or (record.card.escalation.reason if record.card else "") or "The resident asked for help."
    esc = notify.escalate(record, resident, contact, by="resident", reason=reason)
    record.updated_at = utcnow()
    store.put_event(record)
    return esc


@private.get("/door")
def door_display() -> dict:
    """Feed for the Door Display tablet: the newest event and the latest reply to show and play."""
    events = get_store().list_events(limit=20)
    latest = max(
        ((e, r) for e in events for r in e.replies), key=lambda pair: pair[1].created_at, default=(None, None)
    )
    newest = events[0] if events else None
    return {
        "latest_event": None if newest is None else {
            "id": newest.event.id,
            "created_at": newest.created_at,
            "status": newest.status,
            "visitor_language": newest.card.detected_language if newest.card else None,
            "has_reply": bool(newest.replies),
        },
        "reply": None if latest[1] is None else {
            "event_id": latest[0].event.id,
            "id": latest[1].id,
            "visitor_text": latest[1].visitor_text,
            "visitor_language": latest[1].visitor_language,
            "created_at": latest[1].created_at,
            "audio_url": reply_pipeline.audio_url(latest[1].audio_key),
        },
    }


@private.get("/settings", response_model=ResidentSettings)
def get_resident_settings() -> ResidentSettings:
    return get_store().get_settings()


@private.put("/settings", response_model=ResidentSettings)
def put_resident_settings(new: ResidentSettings) -> ResidentSettings:
    get_store().put_settings(new)
    return new


@private.get("/ring/status")
def ring_status() -> dict:
    """Calls the real Ring API (GET /v1/users/me, GET /v1/devices) when credentials are configured.
    Returns device names only: Ring's UX rules forbid showing account or device IDs."""
    client = RealRingClient.from_settings()
    if client is None:
        return {"configured": False, "source": "test_harness", "devices": ["Front door (test harness)"]}
    started = time.perf_counter()
    try:
        client.get_account()
        devices = client.list_devices()
    except (RingApiError, OSError) as err:
        return {"configured": True, "mode": client.mode, "linked": False, "error": str(err)}
    return {
        "configured": True,
        "mode": client.mode,
        "linked": True,
        "devices": [d.name for d in devices],
        "latency_ms": round((time.perf_counter() - started) * 1000),
    }


app.include_router(public)
app.include_router(private)

handler = Mangum(app, lifespan="off")
