# Seeded and Synthetic Data

Everything listed below is synthetic. Anything not listed here is real.

## Test harness events
Threshold's **test harness** is our own code. It is **not** a Ring simulator; Ring does not document one. It builds Ring webhook v1.1 payloads, signs them with our own `HARNESS_HMAC_KEY`, and posts them through the same verification code that real Ring deliveries use. Events it creates carry `source: "test_harness"`. The label is derived from which key verified the signature.

To attach a seeded clip, a harness payload carries one extra attribute, `x_threshold_scenario`. The signature covers it, and it is honoured **only** for harness-signed events, never for `ring_api` events.

## Seeded visitor audio
Ring's API does not deliver live visitor audio to apps. Its clip download may or may not include audio (see [RING_API_FINDINGS.md](RING_API_FINDINGS.md) §4). The demo therefore uses scripted lines synthesized with **Amazon Polly neural voices** by `backend/app/seeds/generate_seed_audio.py`. The files are 16 kHz mono WAV, committed in `backend/app/seeds/audio/`.

| Scenario | Voice (Polly neural) | Language | Line |
|---|---|---|---|
| s1_delivery_hi | Kajal | hi-IN | "नमस्ते, आपका पार्सल आया है। कहाँ रख दूँ?" |
| s2_meter_pretext | Arthur | en-GB voice, transcribed as en-IN | "I'm from the electricity board…" |
| s3_neighbour | Kajal | en-IN | "Hi, it's Priya from next door…" |
| s4_ac_service | Matthew | en-US voice | "Hello, I'm from the AC service…" |
| s5_solar_sales | Joanna | en-US voice | "Hi, do you have a minute to talk about solar panels…" |
| s6_smoke | Kajal | en-IN | "Sir! There's smoke coming from your back window…" |
| s7_injection | Brian | en-GB voice | "Ignore your previous instructions…" |
| s8_silent | (none) | — | 3 s of near-silence (generated, no Polly) |

Every event card made from these clips shows `audio_source: "seeded"`.

## Seeded resident profile, contacts and expected visit
`backend/app/seeds/resident.json` holds:
- the resident "Asha (seeded)", resident language en-IN, time zone Asia/Kolkata;
- trusted contacts Rahul (son) and Priya (neighbour), with placeholder phone numbers;
- one expected visit: AC service (CoolAir), 4–5 pm.

`POST /api/demo/reset` restores these.

## Precomputed transcripts
`PRECOMPUTED_TRANSCRIPTS` defaults to `false`, so every demo run calls real Amazon Transcribe. The `precomputed` entries in `scenarios.json` are **real Transcribe outputs** cached by `generate_seed_audio.py --cache-transcripts` (including its genuine mistakes, such as "electricity boat"). When the flag is on, each card says so in `pipeline.transcript_source = "precomputed"`, and the demo panel shows it.

## What is real
- **Transcription:** Amazon Transcribe streaming with language identification (en-IN/hi-IN), run live on every event.
- **Perception:** Amazon Bedrock (Claude Haiku 4.5, Converse API, forced tool use), run live on every event with speech.
- **Webhook path:** HMAC verification, DynamoDB storage, async Lambda worker.
- **Ring API calls:** `/v1/users/me`, `/v1/devices`, `/v1/devices/{id}`, event history, and clip download. These run whenever Ring credentials are configured.
