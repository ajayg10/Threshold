"""Env-driven settings. Every value can be overridden by an environment variable of the same name."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    app_env: Literal["local", "aws"] = "local"
    aws_region: str = "us-east-1"

    # Demo auth only: a single shared bearer token. Not production auth.
    demo_token: str = ""

    # Bedrock models (verified in docs/PHASE0_AWS_CHECKS.md).
    bedrock_model_id: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    bedrock_translate_model_id: str = "us.amazon.nova-lite-v1:0"
    bedrock_fallback_model_id: str = "us.amazon.nova-pro-v1:0"
    # Strands policy agent. Must be one of the three model IDs above (IAM is scoped to them).
    bedrock_policy_model_id: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    policy_timeout_seconds: float = 12.0  # the card is already visible while the agent runs

    # Escalations: SNS topic in AWS; empty -> the simulated notifier (logged and recorded, nothing sent).
    escalation_topic_arn: str = ""

    # Polly neural voices by language (verified in docs/PHASE0_AWS_CHECKS.md). Base-language fallback applies.
    polly_voices: dict[str, str] = {"hi-IN": "Kajal", "en-IN": "Kajal", "en-US": "Joanna", "en-GB": "Amy"}
    reply_audio_url_seconds: int = 900

    precomputed_transcripts: bool = False
    # Transient audio (Ring clips, batch fallback, Polly replies). Lifecycle-expired after 1 day.
    audio_bucket: str = ""
    # Seconds of Ring clip to fetch around a doorbell press (1 s before, the rest after).
    ring_clip_seconds: int = 10
    resident_language: str = "en-IN"

    store_backend: Literal["memory", "dynamodb"] = "memory"
    events_table: str = ""
    settings_table: str = ""

    # How accepted webhook events reach the pipeline worker:
    # inline (tests), thread (local uvicorn), lambda (async invoke of WORKER_FUNCTION_NAME in AWS).
    dispatch_mode: Literal["inline", "thread", "lambda"] = "thread"
    worker_function_name: str = ""

    # Webhook events older than this are acknowledged but not processed.
    webhook_max_age_seconds: int = 300

    # Signs test-harness webhooks. Our own key, separate from Ring's, so a payload's source is provable.
    harness_hmac_key: str = ""

    # Only used when app_env == "local"; in AWS the UI and API share one CloudFront domain.
    cors_origins: list[str] = ["http://localhost:3000"]

    # Ring Partner API (see docs/RING_API_FINDINGS.md). All optional: the demo runs without them.
    ring_api_base: str = "https://api.amazonvision.com"
    ring_oauth_base: str = "https://oauth.ring.com"
    ring_access_token: str | None = None
    ring_refresh_token: str | None = None
    ring_client_id: str | None = None
    ring_client_secret: str | None = None
    ring_hmac_key: str | None = None
    ring_http_timeout_seconds: float = 5.0

    @field_validator(
        "ring_access_token", "ring_refresh_token", "ring_client_id", "ring_client_secret", "ring_hmac_key"
    )
    @classmethod
    def _unset_sentinel(cls, value: str | None) -> str | None:
        # The deploy passes "none" for unset Ring values (SAM rejects empty parameter overrides).
        return None if value is None or value.strip().lower() in ("", "none") else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
