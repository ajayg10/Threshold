"""Data contracts (build prompt section 3).

There is deliberately no "unlock" field, intent, or action anywhere in these models.
tests/test_no_unlock.py fails if one is ever introduced.
"""

from datetime import datetime, timezone
from typing import Annotated, Literal
from zoneinfo import available_timezones

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator

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
    # "pending": the guardrailed card is published while the policy agent is still reviewing it.
    policy: Literal["pending", "agent", "fast_path", "agent_failed"] = "fast_path"
    policy_model: str | None = None
    notes: list[str] = Field(default_factory=list)


class ReplyRecord(Strict):
    """A reply the resident sent. Text is kept; audio lives in S3 for at most a day."""

    id: str
    source: Literal["suggested", "custom"]
    suggestion_id: str | None = None
    resident_text: str
    visitor_text: str
    visitor_language: str
    audio_key: str | None = None  # S3 key; presigned on read
    created_at: AwareDatetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EscalationRecord(Strict):
    at: AwareDatetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    by: Literal["agent", "resident"]
    contact_id: str
    contact_name: str
    channel: Literal["sns", "simulated"]
    message_id: str
    reason: str


class EventRecord(Strict):
    event: DoorEvent
    device_name: str | None = None  # user-assigned Ring device name; never show raw device IDs
    status: EventStatus = "processing"
    card: VisitorCard | None = None
    pipeline: PipelineInfo | None = None
    replies: list[ReplyRecord] = Field(default_factory=list)
    escalations: list[EscalationRecord] = Field(default_factory=list)
    error: str | None = None
    created_at: AwareDatetime = Field(default_factory=utcnow)
    updated_at: AwareDatetime = Field(default_factory=utcnow)


# --- Resident settings -----------------------------------------------------------------------


# Settings text flows into model prompts, so every field is bounded.
Short = Annotated[str, StringConstraints(max_length=80)]
HHMM = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class TrustedContact(Strict):
    id: Short
    name: Short
    relation: Short
    phone: Annotated[str, StringConstraints(max_length=30)] | None = None


class ExpectedVisit(Strict):
    id: Short
    label: Annotated[str, StringConstraints(max_length=120)]
    window_start: HHMM  # resident local time
    window_end: HHMM
    keywords: list[Annotated[str, StringConstraints(max_length=40)]] = Field(default_factory=list, max_length=20)


class ResidentSettings(Strict):
    resident_name: Short = "Resident"
    resident_language: Literal["en-IN", "hi-IN"] = "en-IN"
    timezone: Short = "Asia/Kolkata"
    trusted_contacts: list[TrustedContact] = Field(default_factory=list, max_length=10)
    expected_visits: list[ExpectedVisit] = Field(default_factory=list, max_length=20)
    retention_days: int = Field(default=7, ge=1, le=90)
    consent_notice: Annotated[str, StringConstraints(max_length=1000)] = (
        "This doorbell transcribes and translates what visitors say so the resident can "
        "understand them. Audio is processed and then deleted; only text is kept. "
        "Recording-consent laws vary by jurisdiction."
    )

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if value not in available_timezones():
            raise ValueError(f"unknown time zone {value!r}")
        return value
