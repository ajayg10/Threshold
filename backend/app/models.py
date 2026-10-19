"""Data contracts (build prompt section 3).

There is deliberately no "unlock" field, intent, or action anywhere in these models.
tests/test_no_unlock.py fails if one is ever introduced.
"""

from datetime import datetime, timezone
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

# --- 3.1 Normalized door event ---------------------------------------------------------------

DoorEventType = Literal["ding", "motion"]
# "test_harness" replaces the original "ring_simulator": our generator is not an official Ring tool.
EventSource = Literal["ring_api", "test_harness", "seeded"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Media(Strict):
    audio_url: str | None = None
    snapshot_url: str | None = None


class DoorEvent(Strict):
    id: str
    device_id: str
    type: DoorEventType
    ts: AwareDatetime
    source: EventSource
    media: Media = Field(default_factory=Media)


# --- 3.2 Visitor card -------------------------------------------------------------------------

VisitorType = Literal[
    "delivery", "service", "known_contact", "solicitor", "unknown", "emergency", "no_speech"
]
Level = Literal["low", "medium", "high"]
RiskFlag = Literal[
    "pretext_entry_request",
    "unverified_authority_claim",
    "urgency_pressure",
    "payment_request",
    "asks_for_codes_or_otp",
    "tailgating_attempt",
    "prompt_injection_attempt",
]
ReplyIntent = Literal[
    "accept_delivery",
    "decline",
    "ask_id",
    "ask_to_wait",
    "ask_to_repeat",
    "call_family",
    "emergency_help",
]


class SuggestedReply(Strict):
    id: str
    resident_text: str
    visitor_text: str
    intent: ReplyIntent


class Escalation(Strict):
    required: bool = False
    reason: str = ""


class ExpectedVisitMatch(Strict):
    id: str
    label: str


class Timings(Strict):
    audio: int = 0  # length of the visitor clip; streaming transcription cannot finish before it ends
    transcribe: int = 0
    perceive: int = 0
    policy: int = 0
    total: int = 0


class VisitorCard(Strict):
    event_id: str
    detected_language: str  # BCP-47, e.g. "hi-IN"
    transcript: str
    translation: str
    visitor_type: VisitorType
    urgency: Level
    risk_level: Level
    risk_flags: list[RiskFlag] = Field(default_factory=list)
    summary: str
    suggested_replies: list[SuggestedReply] = Field(min_length=3, max_length=3)
    escalation: Escalation = Field(default_factory=Escalation)
    matched_expected_visit: ExpectedVisitMatch | None = None
    timings_ms: Timings = Field(default_factory=Timings)


# --- Event record (what the API stores and returns) ------------------------------------------

EventStatus = Literal["processing", "ready", "error"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PipelineInfo(Strict):
    """Provenance shown in the demo panel: what was real, seeded, cached or a fallback."""

    audio_source: Literal["seeded", "ring_clip", "none"] = "none"
    transcript_source: Literal["transcribe_streaming", "transcribe_batch", "precomputed", "none"] = "none"
    perception_model: str | None = None
    perception_fallback: bool = False
    notes: list[str] = Field(default_factory=list)


class EventRecord(Strict):
    event: DoorEvent
    device_name: str | None = None  # user-assigned Ring device name; never show raw device IDs
    status: EventStatus = "processing"
    card: VisitorCard | None = None
    pipeline: PipelineInfo | None = None
    error: str | None = None
    created_at: AwareDatetime = Field(default_factory=utcnow)
    updated_at: AwareDatetime = Field(default_factory=utcnow)


# --- Resident settings -----------------------------------------------------------------------


class TrustedContact(Strict):
    id: str
    name: str
    relation: str
    phone: str | None = None


class ExpectedVisit(Strict):
    id: str
    label: str
    window_start: str  # "HH:MM", resident local time
    window_end: str
    keywords: list[str] = Field(default_factory=list)


class ResidentSettings(Strict):
    resident_name: str = "Resident"
    resident_language: str = "en-IN"
    timezone: str = "Asia/Kolkata"
    trusted_contacts: list[TrustedContact] = Field(default_factory=list)
    expected_visits: list[ExpectedVisit] = Field(default_factory=list)
    retention_days: int = Field(default=7, ge=1, le=90)
    consent_notice: str = (
        "This doorbell transcribes and translates what visitors say so the resident can "
        "understand them. Audio is processed and then deleted; only text is kept. "
        "Recording-consent laws vary by jurisdiction."
    )
