"""Speech to text with Amazon Transcribe.

Primary: streaming (amazon-transcribe SDK) with language identification over LANGUAGE_OPTIONS.
Streaming language ID requires PCM/FLAC, at least two options, and one dialect per language.
Fallback: a batch job from S3 (also the path for Ring MP4 clips, which streaming cannot take).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
import wave
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from ..config import get_settings
from ..seeds import audio_path, get_scenario

log = logging.getLogger(__name__)

LANGUAGE_OPTIONS = ["en-IN", "hi-IN"]
SAMPLE_RATE = 16000
CHUNK_BYTES = 3200  # 100 ms of 16 kHz 16-bit mono
BATCH_TIMEOUT_SECONDS = 90

TranscriptSource = Literal["transcribe_streaming", "transcribe_batch", "precomputed", "none"]


@dataclass
class TranscriptResult:
    transcript: str
    language: str | None
    source: TranscriptSource
    elapsed_ms: int

    @property
    def has_speech(self) -> bool:
        return len(self.transcript.strip()) >= 2


def read_pcm(path) -> bytes:
    with wave.open(str(path), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise ValueError(f"{path} must be 16 kHz mono 16-bit PCM")
        return wav.readframes(wav.getnframes())


# ---------------------------------------------------------------- streaming


async def _stream(pcm: bytes, preferred_language: str) -> tuple[str, str | None]:
    from amazon_transcribe.client import TranscribeStreamingClient
    from amazon_transcribe.handlers import TranscriptResultStreamHandler

    # Latest version of each segment, keyed by result_id. Partials are kept too: after language
    # identification switches language, Transcribe can leave the first segment without a final result
    # (friction log F14), and dropping partials would lose the visitor's first sentence.
    segments: dict[str, Segment] = {}
    languages: list[str] = []

    class Collector(TranscriptResultStreamHandler):
        async def handle_transcript_event(self, transcript_event) -> None:
            for result in transcript_event.transcript.results:
                if not result.alternatives:
                    continue
                segments[result.result_id] = Segment(
                    start=result.start_time or 0.0,
                    end=result.end_time or 0.0,
                    final=not result.is_partial,
                    text=result.alternatives[0].transcript,
                    seq=len(segments) + len(languages),
                )
                if result.language_code:
                    languages.append(result.language_code)

    client = TranscribeStreamingClient(region=get_settings().aws_region)
    stream = await client.start_stream_transcription(
        language_code=None,
        media_sample_rate_hz=SAMPLE_RATE,
        media_encoding="pcm",
        identify_language=True,
        language_options=LANGUAGE_OPTIONS,
        preferred_language=preferred_language,
    )

    async def send() -> None:
        for i in range(0, len(pcm), CHUNK_BYTES):
            await stream.input_stream.send_audio_event(audio_chunk=pcm[i : i + CHUNK_BYTES])
        await stream.input_stream.end_stream()

    await asyncio.gather(send(), Collector(stream.output_stream).handle_events())
    return merge_segments(list(segments.values())), (languages[-1] if languages else None)


@dataclass
class Segment:
    start: float
    end: float
    final: bool
    text: str
    seq: int  # arrival order


def _overlaps(a: Segment, b: Segment) -> bool:
    return a.start < b.end and b.start < a.end


def merge_segments(segments: list[Segment]) -> str:
    """Final results are authoritative. A partial survives only where no final covers its time span,
    and among overlapping surviving partials only the latest-arriving one is kept."""
    finals = [s for s in segments if s.final]
    partials = [s for s in segments if not s.final and not any(_overlaps(s, f) for f in finals)]
    partials = [p for p in partials if not any(_overlaps(p, q) and q.seq > p.seq for q in partials)]
    ordered = sorted(finals + partials, key=lambda s: s.start)
    return " ".join(s.text.strip() for s in ordered if s.text.strip())


def transcribe_stream(pcm: bytes, preferred_language: str = "en-IN") -> TranscriptResult:
    started = time.perf_counter()
    text, language = asyncio.run(_stream(pcm, preferred_language))
    return TranscriptResult(text, language, "transcribe_streaming", _ms(started))


# ---------------------------------------------------------------- batch


@lru_cache
def _clients():
    import boto3

    region = get_settings().aws_region
    return boto3.client("transcribe", region_name=region), boto3.client("s3", region_name=region)


def transcribe_batch(bucket: str, key: str, media_format: Literal["wav", "mp4"]) -> TranscriptResult:
    """Batch job on s3://bucket/key. The transcript JSON lands in the same bucket and is deleted after reading."""
    transcribe, s3 = _clients()
    started = time.perf_counter()
    job = f"threshold-{uuid.uuid4().hex[:12]}"
    out_key = f"transcripts/{job}.json"
    transcribe.start_transcription_job(
        TranscriptionJobName=job,
        Media={"MediaFileUri": f"s3://{bucket}/{key}"},
        MediaFormat=media_format,
        IdentifyLanguage=True,
        LanguageOptions=LANGUAGE_OPTIONS,
        OutputBucketName=bucket,
        OutputKey=out_key,
    )
    try:
        deadline = time.monotonic() + BATCH_TIMEOUT_SECONDS
        while True:
            job_info = transcribe.get_transcription_job(TranscriptionJobName=job)["TranscriptionJob"]
            status = job_info["TranscriptionJobStatus"]
            if status == "COMPLETED":
                break
            if status == "FAILED":
                reason = job_info.get("FailureReason", "unknown")
                log.warning("batch transcription failed: %s", reason)
                return TranscriptResult("", None, "transcribe_batch", _ms(started))
            if time.monotonic() > deadline:
                raise TimeoutError(f"Transcribe job {job} did not finish in {BATCH_TIMEOUT_SECONDS} s")
            time.sleep(1)
        body = json.loads(s3.get_object(Bucket=bucket, Key=out_key)["Body"].read())
        text = body["results"]["transcripts"][0]["transcript"] if body["results"]["transcripts"] else ""
        return TranscriptResult(text, job_info.get("LanguageCode"), "transcribe_batch", _ms(started))
    finally:
        s3.delete_object(Bucket=bucket, Key=out_key)
        try:
            transcribe.delete_transcription_job(TranscriptionJobName=job)
        except Exception:  # best effort; jobs also expire on their own
            log.warning("could not delete transcription job %s", job)


# ---------------------------------------------------------------- seeded audio


def transcribe_seed(scenario_id: str, use_precomputed: bool, preferred_language: str = "en-IN") -> TranscriptResult:
    scenario = get_scenario(scenario_id)
    if scenario is None:
        raise ValueError(f"unknown scenario {scenario_id!r}")
    if use_precomputed and scenario.precomputed is not None:
        return TranscriptResult(scenario.precomputed.transcript, scenario.precomputed.language, "precomputed", 0)

    path = audio_path(scenario_id)
    try:
        return transcribe_stream(read_pcm(path), preferred_language)
    except Exception:
        bucket = get_settings().audio_bucket
        if not bucket:
            raise
        log.exception("streaming failed for %s; falling back to a batch job", scenario_id)
        _, s3 = _clients()
        key = f"incoming/{uuid.uuid4().hex}.wav"
        s3.upload_file(str(path), bucket, key)
        try:
            return transcribe_batch(bucket, key, "wav")
        finally:
            s3.delete_object(Bucket=bucket, Key=key)


def _ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)
