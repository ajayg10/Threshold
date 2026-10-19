# Architecture

> Status: Phase 1 skeleton. Boxes marked *(Phase N)* are not built yet.

```mermaid
flowchart LR
    subgraph Door
        Ring[Ring doorbell]
        Harness[Test harness<br/>signed v1.1 payloads]
        DoorDisplay[Door Display tablet<br/>/door page]
    end
    subgraph Resident
        Phone[Phone / TV<br/>control surface]
    end
    subgraph AWS
        CF[CloudFront]
        S3Site[(S3: static site<br/>private, OAC)]
        APIGW[API Gateway HTTP API]
        Lambda[Lambda: FastAPI + Mangum]
        Worker[Pipeline worker<br/>async invoke *(Phase 2-3)*]
        Transcribe[Transcribe *(Phase 3)*]
        Bedrock[Bedrock: Haiku 4.5 / Nova *(Phase 3-4)*]
        Polly[Polly *(Phase 4)*]
        DDB[(DynamoDB *(Phase 2)*)]
        SNS[SNS escalation *(Phase 4)*]
    end
    RingAPI[Ring Partner API<br/>api.amazonvision.com]

    Ring -- webhook (HMAC) --> CF
    Harness -- webhook (HMAC) --> CF
    Phone --> CF
    DoorDisplay --> CF
    CF -- default --> S3Site
    CF -- /api/* --> APIGW --> Lambda
    Lambda -- users/me, devices, clips --> RingAPI
    Lambda --> DDB
    Lambda -. async .-> Worker
    Worker --> Transcribe & Bedrock & Polly
    Worker --> SNS
```

## Request flows
- **Doorbell event (Phase 2):**
  1. Ring, or the test harness, POSTs `/api/webhooks/ring`.
  2. The handler verifies `X-Signature` over the raw body. Which key matches decides `source` (`ring_api` or `test_harness`).
  3. It normalizes to `DoorEvent` and conditionally puts `status=processing` into DynamoDB (Ring retries come back as `duplicate`).
  4. It async-invokes `WorkerFunction` and returns 200 (target: well under Ring's 5 s).
  5. The worker resolves the device name (a real `GET /v1/devices/{id}` for Ring events), runs the pipeline, and writes `ready` or `error`.
  6. The UI polls `GET /api/events?since=`.
- **Pipeline (Phase 3, `backend/app/pipeline/orchestrator.py`):**
  1. **Audio:** a seeded clip (test-harness scenario) or, for `ring_api` events, a Ring MP4 clip downloaded after the press. The clip goes to S3, is transcribed in batch, then deleted.
  2. **Transcribe:** streaming with language ID (en-IN/hi-IN), merging partial and final segments (friction log F14). Batch is the fallback.
  3. **Perceive:** Bedrock Converse with the verbatim system prompt and a forced `emit_visitor_card` tool, validated by pydantic. On a validation error it retries once, then tries the fallback model, then uses a safe card. With no speech, a deterministic no-speech card is used and no model is called.
  4. **Policy:** Phase 4.
  5. **Output:** the `VisitorCard` with `timings_ms` {audio, transcribe, perceive, policy, total}, plus `pipeline` provenance (audio and transcript sources, model, fallbacks, notes).
- **Measured on the deployed stack (2026-10-19, 8 seeded scenarios, us-east-1, Haiku 4.5):**
  - Transcribe takes the clip length plus 0.15–0.25 s.
  - Perception takes 2.8–3.9 s.
  - **About 3.0–4.1 s after the visitor stops speaking**, and 7.6–12.5 s in total including the clip.
  - Observed from a client in India (trigger, then 0.5 s polling until ready): 9.0–13.3 s. The first run includes a worker cold start.
  - All 8 cards were valid, and all 8 matched their scenario's expected type, risk and flags.
  - Running the same thing in-process from India adds about 1.3 s of Transcribe overhead.
- **Prompt tuning backlog (Phase 6 evals):**
  - s4 added "CoolAir" from the expected-visit label to the summary, which isn't faithful.
  - s4's third reply said "not expecting anyone" despite the matched visit.
  - s7's resident summary uses the jargon "prompt injection".
- **Policy (Phase 4):**
  1. Deterministic guardrails (`guardrails.py`) **always** run.
  2. The **Strands policy agent** runs only for cards that need judgement: risk at least medium, or service/unknown/solicitor visitors. Emergencies, known contacts, low-risk deliveries and no-speech take the fast path.
  3. The guardrailed card is **published first** (`pipeline.policy = "pending"`). The agent then reviews it, and its decision is merged with raise-only semantics before the guardrails run again.
  4. So the resident sees a safe card about 3–4 s after speech, and the agent's verdict arrives about 6–7 s later. A guardrailed card is never less safe than the final one.
  5. Model choice was measured on s2/s4/s5/s7: Haiku 4.5 (5.7–7.7 s, the best judgement); Nova Pro (3.2–5.3 s, a spurious flag on the salesperson); Nova Lite (a **false alarm**: escalated the salesperson). We use Haiku 4.5.
- **Reply → Door Display (Phase 4):**
  1. `POST /api/events/{id}/reply` takes a suggestion id or custom text.
  2. Custom text is translated with Nova Lite (skipped when the languages match), and Polly speaks the visitor-language text.
  3. The MP3 goes to S3 (1-day expiry) and is served by presigned URL.
  4. `GET /api/door` feeds the Door Display tablet. The audio never plays through the Ring doorbell, because Ring has no API for that (friction log F1).
- **Escalation (Phase 4):** the agent's `notify_trusted_contact` tool (at most once per visit) or the resident's `POST /api/events/{id}/escalate` publishes to SNS. Locally, the simulated notifier is used. Messages carry the summary and risk only, never the transcript or audio.

## Key decisions
- One CloudFront domain serves the UI and `/api/*`, so production needs no CORS.
- No distribution-wide custom error pages, because they would rewrite API 403/404 responses. A CloudFront Function maps clean URLs to exported pages instead.
- The Lambda bundle is built from manylinux wheels (`scripts/tasks.py build`), so Windows machines never ship Windows-only wheels.
