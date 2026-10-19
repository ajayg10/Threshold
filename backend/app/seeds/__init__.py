"""Seeded, synthetic demo data (disclosed in docs/SEEDED_DATA.md)."""

import json
import re
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

from ..models import DoorEventType, ResidentSettings

SEEDS_DIR = Path(__file__).resolve().parent
AUDIO_DIR = SEEDS_DIR / "audio"
SEED_AUDIO_PREFIX = "seed:"
SCENARIO_ID = re.compile(r"^[a-z0-9_]{1,40}$")


class Precomputed(BaseModel):
    transcript: str
    language: str | None


class Scenario(BaseModel):
    id: str
    label: str
    event_type: DoorEventType
    language: str | None
    voice: str | None
    text: str
    expected: dict
    precomputed: Precomputed | None = None  # real Transcribe output cached by generate_seed_audio.py


@lru_cache
def scenarios() -> dict[str, Scenario]:
    raw = json.loads((SEEDS_DIR / "scenarios.json").read_text(encoding="utf-8"))
    return {s["id"]: Scenario.model_validate(s) for s in raw["scenarios"]}


def get_scenario(scenario_id: str) -> Scenario | None:
    return scenarios().get(scenario_id)


def audio_path(scenario_id: str) -> Path:
    return AUDIO_DIR / f"{scenario_id}.wav"


def seed_audio_url(scenario_id: str) -> str:
    return f"{SEED_AUDIO_PREFIX}{scenario_id}"


def scenario_from_audio_url(audio_url: str | None) -> Scenario | None:
    if not audio_url or not audio_url.startswith(SEED_AUDIO_PREFIX):
        return None
    return get_scenario(audio_url[len(SEED_AUDIO_PREFIX):])


def resident_settings() -> ResidentSettings:
    raw = json.loads((SEEDS_DIR / "resident.json").read_text(encoding="utf-8"))
    raw.pop("_disclosure", None)
    return ResidentSettings.model_validate(raw)
