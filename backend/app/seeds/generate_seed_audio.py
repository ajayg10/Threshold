"""Generate the SYNTHETIC visitor audio for the seeded scenarios with Amazon Polly.

Run from backend/:  python -m app.seeds.generate_seed_audio [--cache-transcripts]

Writes app/seeds/audio/<scenario>.wav (16 kHz, 16-bit mono PCM, the format Transcribe streaming
needs). s8_silent gets 3 s of near-silence instead of speech.

--cache-transcripts runs each clip through real Amazon Transcribe streaming and stores the result in
scenarios.json as "precomputed". It is used only when PRECOMPUTED_TRANSCRIPTS=true, which the UI shows.
"""

import argparse
import json
import random
import struct
import wave

import boto3

from ..config import get_settings
from . import AUDIO_DIR, SEEDS_DIR, scenarios

SAMPLE_RATE = 16000


def write_wav(path, pcm: bytes) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)


def near_silence(seconds: float) -> bytes:
    rng = random.Random(8)  # deterministic, very low-level noise (about -70 dBFS)
    return b"".join(struct.pack("<h", rng.randint(-8, 8)) for _ in range(int(SAMPLE_RATE * seconds)))


def synthesize(polly, text: str, voice: str, language: str) -> bytes:
    resp = polly.synthesize_speech(
        Engine="neural",
        OutputFormat="pcm",
        SampleRate=str(SAMPLE_RATE),
        Text=text,
        VoiceId=voice,
        LanguageCode=language,
    )
    # Half a second of lead-in and tail, like someone speaking to a doorbell.
    pad = near_silence(0.5)
    return pad + resp["AudioStream"].read() + pad


def cache_transcripts() -> None:
    from ..pipeline.transcribe import transcribe_seed

    path = SEEDS_DIR / "scenarios.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    for item in raw["scenarios"]:
        result = transcribe_seed(item["id"], use_precomputed=False)
        item["precomputed"] = {"transcript": result.transcript, "language": result.language}
        print(f"{item['id']:18} [{result.language}] {result.transcript!r}  ({result.elapsed_ms} ms)")
    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-transcripts", action="store_true")
    parser.add_argument("--skip-audio", action="store_true", help="keep the existing WAV files")
    args = parser.parse_args()

    if not args.skip_audio:
        AUDIO_DIR.mkdir(exist_ok=True)
        polly = boto3.client("polly", region_name=get_settings().aws_region)
        for s in scenarios().values():
            pcm = synthesize(polly, s.text, s.voice, s.language) if s.text else near_silence(3.0)
            write_wav(AUDIO_DIR / f"{s.id}.wav", pcm)
            print(f"{s.id:18} {s.voice or '(silence)':8} {len(pcm) / (2 * SAMPLE_RATE):.1f} s")

    if args.cache_transcripts:
        cache_transcripts()


if __name__ == "__main__":
    main()
