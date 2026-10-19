# AWS Integration

## Security hardening (Phase 6)
- **IAM:** one role per function. DynamoDB access is scoped to the two tables, and S3 to the audio bucket (with replies under `replies/*`). Bedrock is limited to the three configured inference profiles and their foundation models. Transcribe jobs are limited to `transcription-job/threshold-*`, SNS to the one topic, and Lambda invoke to the worker only. The only `"*"` grants are `polly:SynthesizeSpeech` and `transcribe:StartStreamTranscription`, which have no resource-level permissions.
- **S3:** both buckets block all public access, use bucket-owner-enforced ownership and SSE-S3, and deny non-TLS requests. The site is served only through CloudFront OAC. Audio expires after 1 day, and replies are served by 15-minute SigV4 presigned URLs.
- **CloudFront:** HTTPS only (HTTP redirects). The managed SecurityHeadersPolicy (HSTS, nosniff, frame options, referrer policy) applies to the site and `/api/*`. `/api/*` is never cached.
- **App:** a constant-time bearer token check; HMAC over the raw webhook body, which is capped at 64 KB; settings fields bounded because they reach model prompts; transcripts treated as untrusted and delimiters neutralised; a deterministic injection backstop and resident-facing text checks in `guardrails.py`; and a no-unlock invariant test.
- **Known limits (new-account defaults):**
  - Lambda concurrency is **10**.
  - Bedrock allows **10 requests per minute** for Claude Haiku 4.5 on the US cross-region profile. A visit that goes to the policy agent uses 3–4 of them, so about 3 such visits fit in a minute. When throttled, perception falls back to Nova Pro, the agent run fails, and the guardrails still apply; every fallback is shown in the card's pipeline notes (friction log F18).
  - Both are enough for the demo. A real deployment should request increases in Service Quotas.

Each AWS service, how it is wired, and why. Region: `us-east-1`. Verification details are in [PHASE0_AWS_CHECKS.md](PHASE0_AWS_CHECKS.md).

| Service | Status | Wired in | Why |
|---|---|---|---|
| CloudFront | Phase 1 | `template.yaml` → `Distribution`, `SiteRewriteFunction` | One public HTTPS domain for the UI, the API and the Ring webhook |
| S3 (site) | Phase 1 | `template.yaml` → `SiteBucket` (private, OAC) | Hosts the Next.js static export |
| API Gateway (HTTP API) | Phase 1 | `template.yaml` → `HttpApi` (throttled to 10 rps, burst 20) | Fronts the Lambda |
| Lambda | Phase 1 | `template.yaml` → `ApiFunction`; `backend/app/main.py` → `handler` | Runs FastAPI via Mangum, with no servers to manage |
| CloudWatch Logs | Phase 1 | `ApiFunctionLogGroup` (14-day retention) | Debugging and latency evidence |
| AWS Budgets | Phase 1 | `MonthlyBudget` | Cost guard while the stack stays up for judging (until 2026-11-20) |
| DynamoDB | Phase 2 | `EventsTable` (GSI `by_updated`, TTL `expires_at` = retention), `SettingsTable`; `backend/app/store.py` → `DynamoStore` | Events and settings shared by the API and worker Lambdas. On-demand billing. Conditional put dedupes Ring retries |
| Lambda async invoke | Phase 2 | `WorkerFunction` (`app.worker.handler`, retries 0); `backend/app/dispatch.py` | The webhook acks in well under Ring's 5 s; the pipeline runs separately |
| Amazon Transcribe | Phase 3 | `backend/app/pipeline/transcribe.py` → `transcribe_stream` (streaming, language ID over en-IN/hi-IN, amazon-transcribe SDK), `transcribe_batch` (S3 job; used for Ring MP4 clips and as the streaming fallback) | Visitor speech to text in either language without asking the visitor |
| Amazon Bedrock | Phase 3 | `backend/app/pipeline/perceive.py` → Converse API with one tool (`emit_visitor_card`) and `toolChoice` forcing it. Pydantic validation, one retry with the error as a `toolResult`, then the fallback model, then a safe card. IAM is scoped to the three configured model IDs | Structured, validated perception with no free-text parsing |
| Strands Agents (on Bedrock) | Phase 4 | `backend/app/pipeline/policy_agent.py`: `Agent` + `BedrockModel` (Haiku 4.5) with exactly 4 `@tool`s, `structured_output_model=PolicyDecision`, `limits={"turns": 6}`, `cancel_signal` timeout. `guardrails.py` applies the decision with raise-only semantics | Checks visitor claims against the resident's own facts (expected visits, time, contacts) and alerts a contact. Deterministic guardrails keep it safe whatever it outputs |
| Amazon Bedrock (Nova Lite) | Phase 4 | `backend/app/pipeline/reply.py` → `translate` | Fast translation of custom replies (about 1.4 s) |
| Amazon Polly | Phase 4 | `reply.synthesize` (neural; Kajal for hi-IN/en-IN, voice map in `config.polly_voices`) → MP3 in the audio bucket → presigned URL | Speaks the reply on the Door Display tablet |
| Amazon SNS | Phase 4 | `EscalationTopic` (KMS-encrypted), optional email subscription; `backend/app/notify.py` | Escalation to a trusted contact. Without a topic (local), a simulated notifier records it and sends nothing |
| S3 (audio) | Phase 3 | `AudioBucket` (private, TLS-only, 1-day expiry); `orchestrator.transcribe_ring_clip` deletes each clip right after transcription | Transient audio only. Text is what gets kept |
| API Gateway route throttles | Phase 6 | `HttpApi.RouteSettings`: `POST /api/demo/trigger` 0.5 rps (burst 3), `POST /api/events/{event_id}/reply` 1 rps (burst 3), everything else 10 rps (burst 20) | Caps spend on the routes that call Transcribe, Bedrock and Polly. The account's Lambda concurrency limit is 10, which leaves no room to reserve concurrency |
