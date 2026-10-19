"""Pipeline orchestrator: audio -> transcribe -> perceive -> policy, with per-stage timings.

Audio sources:
- seeded scenario clips (test harness events carrying seed:<scenario>), transcribed by streaming
- Ring clips for ring_api events: MP4 download -> S3 -> Transcribe batch -> deleted
"""

import logging
import time
import uuid
import wave
from datetime import timedelta

from ..config import get_settings
from ..models import EventRecord, PipelineInfo, SuggestedReply, Timings, VisitorCard
from ..ring.real import RealRingClient
from ..seeds import audio_path, scenario_from_audio_url
from ..store import get_store
from .perceive import no_speech_card, perceive
from .transcribe import TranscriptResult, _clients, transcribe_batch, transcribe_seed

log = logging.getLogger(__name__)


def _wav_ms(path) -> int:
    with wave.open(str(path), "rb") as wav:
        return round(wav.getnframes() * 1000 / wav.getframerate())


def transcribe_ring_clip(record: EventRecord, info: PipelineInfo) -> TranscriptResult:
    """Real Ring path: download the clip around the press, transcribe it in batch, delete it."""
    settings = get_settings()
    client = RealRingClient.from_settings()
    if client is None:
        info.notes.append("Ring credentials are not configured, so no clip could be fetched")
        return TranscriptResult("", None, "none", 0)
    if not settings.audio_bucket:
        info.notes.append("AUDIO_BUCKET is not configured")
        return TranscriptResult("", None, "none", 0)

    start = record.event.ts - timedelta(seconds=1)
    clip = client.download_clip(
        record.event.device_id, int(start.timestamp() * 1000), settings.ring_clip_seconds * 1000, audio=True
    )
    if clip is None:
        info.notes.append("Ring had no recording for this event")
        return TranscriptResult("", None, "none", 0)

    info.audio_source = "ring_clip"
    _, s3 = _clients()
    key = f"incoming/{uuid.uuid4().hex}.mp4"
    s3.put_object(Bucket=settings.audio_bucket, Key=key, Body=clip)
    try:
        result = transcribe_batch(settings.audio_bucket, key, "mp4")
    finally:
        s3.delete_object(Bucket=settings.audio_bucket, Key=key)  # audio is transient; text is kept
    if not result.has_speech:
        info.notes.append("The Ring clip had no intelligible speech (or no audio track)")
    return result


def run(record: EventRecord) -> tuple[VisitorCard, PipelineInfo]:
    settings = get_settings()
    resident = get_store().get_settings()
    info = PipelineInfo()
    started = time.perf_counter()
    audio_ms = 0

    scenario = scenario_from_audio_url(record.event.media.audio_url)
    if scenario is not None:
        info.audio_source = "seeded"
        audio_ms = _wav_ms(audio_path(scenario.id))
        transcript = transcribe_seed(scenario.id, use_precomputed=settings.precomputed_transcripts)
        if transcript.source == "precomputed":
            info.notes.append("PRECOMPUTED_TRANSCRIPTS is on: cached Transcribe output was used")
    elif record.event.source == "ring_api":
        transcript = transcribe_ring_clip(record, info)
    else:
        info.notes.append("No audio is attached to this event")
        transcript = TranscriptResult("", None, "none", 0)
    info.transcript_source = transcript.source

    if transcript.has_speech:
        perception = perceive(transcript.transcript, transcript.language, resident)
        output, perceive_ms = perception.output, perception.elapsed_ms
        info.perception_model, info.perception_fallback = perception.model_id, perception.fallback
        info.notes += perception.notes
    else:
        output, perceive_ms = no_speech_card(resident.resident_language), 0

    policy_ms = 0  # Phase 4: Strands policy agent + deterministic guardrails

    replies = [
        SuggestedReply(**{**r.model_dump(), "id": f"r{i}"}) for i, r in enumerate(output.suggested_replies, 1)
    ]
    card = VisitorCard(
        event_id=record.event.id,
        detected_language=transcript.language or "und",
        transcript=transcript.transcript,
        **output.model_dump(exclude={"suggested_replies"}),
        suggested_replies=replies,
        timings_ms=Timings(
            audio=audio_ms,
            transcribe=transcript.elapsed_ms,
            perceive=perceive_ms,
            policy=policy_ms,
            total=round((time.perf_counter() - started) * 1000),
        ),
    )
    return card, info
