# AWS Integration

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
| SNS | Phase 4 | | Escalation to a trusted contact |
