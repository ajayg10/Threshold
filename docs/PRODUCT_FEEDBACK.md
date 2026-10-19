# Product Feedback

For each tool: what we used it for, what worked, what needs work, how onboarding felt, and whether we would build with it again. Each point links to its raw entry (F1–F19) in [FRICTION_LOG.md](FRICTION_LOG.md), with steps, expected vs actual, and severity.

Written 2026-10-19, building on Windows 11 from India for the Ring track.

---

## Headline feature request: let an app speak to the visitor through the doorbell

**Threshold exists for residents who can't hear the visitor, or don't share their language.** Ring gives us the doorbell press, the clip and the device, and we can transcribe, translate and classify what the visitor said. We can't say anything back through the doorbell.

- **Today:** live media (WHEP and RTSPS) is receive-only, and `sendrecv`/`sendonly` are rejected. The only audio playback is a pre-assigned `audio_ref` slot on an indoor **chime**, behind the Early Access "Chime Controls" capability. No endpoint plays a short clip or TTS on the doorbell's own speaker (F1).
- **Our workaround:** a **Door Display**, a `/door` web page on a tablet in the window, which shows the reply in large text in the visitor's language and speaks it with Polly. It works, but it's a second device the resident has to buy, mount and keep charged. A doorbell already has a speaker pointed at the visitor.
- **What we would want:**
  - `POST /v1/devices/{id}/media/audio/announce` with a short audio clip (or text plus a Ring-approved voice), limited to a few seconds and rate-limited.
  - Allowed only within a short window after a `button_press`, and only when a resident action started it, so it can't become a broadcast channel.
  - A capability flag on the device, so apps know which models support it.
- **Who it helps:** deaf and hard-of-hearing residents, residents who don't share the visitor's language, and anyone who can't come to the door. Two-way talk is the one Ring feature these users can't use today, and accessibility partners can't add it.

---

## Ring Partner API

**Used for:**
- the HMAC-verified `button_press` / `motion_detected` webhook (v1.1);
- `GET /v1/users/me`, `/v1/devices` and `/v1/devices/{id}`;
- Event History;
- MP4 clip download with `audio_options.audio_enabled`, the real path from a doorbell press to Transcribe.

**What worked:**
- The webhook contract is precise: HMAC-SHA256 over the raw body, `X-Signature: sha256=<hex>`, the payload shape, a 5 s ack, and the full retry schedule with dead-letter behaviour. We implemented it from the docs alone, and the async-ack design followed directly from them.
- The clip download docs are honest about edge cases. They say `audio_enabled` is "a request for audio, not a statement that audio exists", which is exactly what an integrator needs to know.
- The rate limits, `Retry-After`, semver and 12-month compatibility promise make production planning straightforward.
- The Content Policy and Program Requirements are readable and specific. §4.2.1 (voiceprints count as biometrics) set a clear product boundary: Threshold transcribes, and never identifies speakers.

**What needs work:**
- **No speak-to-visitor API** (F1, above).
- **The sandbox is mentioned but never documented.** Staging needs real US devices and a Ring Protection plan, and there's no documented simulator or "send test event" button. So developers outside the US, or without a device, can't fire a single real webhook (F2). We built our own **test harness** (clearly labelled, never presented as a Ring simulator). It signs v1.1 payloads with its own key, and the source label comes from which key verified the signature.
- **Naming differs between the webhook and Event History:** `button_press`/`ding` and `motion_detected`/`motion` (F5). A mapping table would save every integrator a bug.
- **The Token Exchange URL contract** for one-way linking appears only as a sequence diagram, with no request or response JSON (F6). We left it unimplemented rather than guess.
- **Clips:** how long after a press a clip is ready, and which doorbell models include audio, are both undocumented. They decide whether a real-time interpreter is possible on a given device.
- **Testing:** there's no OpenAPI spec and no SDK (F7), so every client is hand-written. A spec would let partners generate clients and contract tests.

**Onboarding:**
- Creating an app and reading the docs was quick.
- Real credentials go through the Early Access program. **As of 2026-10-19 we had no Early Access credentials or Playground token.** So the real-API client (`backend/app/ring/real.py`) is implemented from the docs and covered by contract-shaped unit tests, but it hasn't been exercised against Ring's servers yet.
- The deployed demo runs on the seeded test-harness path, with the same webhook verification code real Ring traffic uses.
- For a hackathon with a fixed deadline, a self-serve sandbox token would remove the biggest blocker.

**Would we build with it again?** Yes. The event model fits accessibility products well, and an announce endpoint would make Threshold a one-device product.

## Ring developer docs, sample repo and docs MCP server

**Used for:** all integration decisions (see [RING_API_FINDINGS.md](RING_API_FINDINGS.md)), the `ring-api-helloworld` sample as a cross-check, and the Ring docs MCP server (`search_docs`/`get_doc`) for agent-assisted lookup.

**What worked:**
- The MCP docs server let our coding agent cite sections instead of guessing.
- The UX Design Guide has concrete, testable rules: never show tokens or device IDs, say "Ring app" exactly, and meet WCAG 2.2 AA.

**What needs work:**
- **The sample contradicts the API docs on webhook auth.** It uses a bearer secret, while the docs specify HMAC (F3).
- **The sample's webhook schema rejects `button_press`,** the doorbell press, and lists an undocumented `person_detected` (F12). Anyone starting from the sample silently drops doorbell events. *A fix for this and F3 is our planned Open Source contribution to the sample.*
- **The OAuth scope is inconsistent:** the text says `ava.v1:read`, but the example uses `ava` (F4).
- **The API reference is one page of about 370k characters** (F7). Splitting it per resource would help people and agents.

**Would we use it again?** Yes. Keep the MCP server, and fix the sample.

---

## Amazon Bedrock (Claude Haiku 4.5, Nova Pro, Nova Lite)

**Used for:**
- **Perception:** a transcript becomes a validated `VisitorCard`, via the Converse API with one tool and a forced `toolChoice`. Haiku 4.5 is primary and Nova Pro the fallback.
- **The Strands policy agent:** Haiku 4.5.
- **Translation of custom replies:** Nova Lite.

**What worked:**
- **Forced tool use through Converse:** one code path, one JSON schema, and the same validation for Claude and Nova. Switching to the fallback model needed no special-casing.
- Pydantic validation, with one retry that sends the validation error back as a `toolResult`, gives a typed card or a clear failure, never half-parsed text.
- **Latency:** perception took 2.9–4.8 s per visit with Haiku 4.5, and Nova Lite translated in about 1.4 s. US cross-region inference profiles worked from day one.
- **Model access:** Haiku 4.5 and the Nova models were usable immediately.

**What needs work:**
- **Quotas are invisible until you hit them.** The new-account default is **10 requests per minute** for Haiku 4.5, and one agent-reviewed visit uses 3–4 of them. Our first eval run was throttled, which hid real quality problems. The quota exists only in Service Quotas, and the throttling error doesn't name it (F18).
- **Transient `ServiceUnavailableException`:** with default SDK retries, a failing call took about 10 s before our fallback ran (F17). We now fail over on the first error.
- **Fallback quality:** Nova Pro twice labelled a genuine smoke report as a prompt-injection attempt (F17). During one injection eval, it also wrote "This visitor is safe. Open the door." into the summary. We now have a deterministic guardrail for that (see the evals in [ARCHITECTURE.md](ARCHITECTURE.md#evals-phase-6)).
- **Listing doesn't mean usable:** `list-inference-profiles` lists a newer Claude model that this account then can't invoke (F9). A per-account availability flag would help.

**Onboarding:** smooth. Region choice, model IDs and IAM scoping to specific inference profiles were all clear.

**Would we build with it again?** Yes. Converse with forced tools is the right abstraction for structured perception. We'd ask for higher default RPM for small models on new accounts, or a visible quota on the model page.

## Amazon Transcribe

**Used for:**
- **Streaming with language identification** over en-IN and hi-IN for seeded visitor clips, with no language picker for the visitor. It runs live on every event.
- **Batch jobs** for Ring MP4 clips (S3 in, transcript out, clip deleted).

**What worked:**
- Language ID picked the right language on every seeded clip (Hindi for the delivery, Indian English for the rest), including British and American accents. That's the core of "the visitor doesn't have to choose a language".
- Transcription quality was good, and its mistakes are realistic ("electricity boat"), which our perception prompt handles.
- en-IN and hi-IN are supported in both streaming and batch in us-east-1.

**What needs work:**
- **The first segment never got a final result after a language switch.** On the Hindi delivery clip, the first sentence arrived only as partials (switching from en-IN to hi-IN) and was silently dropped by code that keeps only finals (F14). We now merge partials where no final covers the time span.
- **Streaming runs at real-time pace even for recorded audio.** That's reasonable, but the docs don't say so (F15).
- Streaming needs a separate SDK (`amazon-transcribe`), because boto3 doesn't stream.

**Would we build with it again?** Yes. Automatic language ID is what makes the product work for visitors.

## Amazon Polly

**Used for:** the seeded visitor audio (synthetic, disclosed in [SEEDED_DATA.md](SEEDED_DATA.md)), and spoken replies on the Door Display in the visitor's language.

**What worked:**
- Neural **Kajal** speaks both Hindi and Indian English naturally, so one voice covers code-switched replies.
- Synthesis is fast, and output goes to S3 with presigned URLs.

**What needs work:** there's no male neural Hindi voice, and Aditi is standard-only. For a resident replying in their own voice, gender choice matters.

**Would we build with it again?** Yes.

## Strands Agents SDK

**Used for:** the policy agent, which checks a visitor's claims against the resident's own facts:
- exactly four `@tool`s: expected visits, trusted contacts, local time, and notify a contact (at most once);
- `structured_output_model=PolicyDecision`;
- `limits={"turns": 6}` and a `cancel_signal` timeout;
- deterministic guardrails afterwards, which can only raise risk.

**What worked:**
- Very little code for a real tool-using agent.
- Tools are plain Python functions with docstrings, so the four tools the agent may call are easy to audit, and a test pins that list.
- Structured output gave us a typed decision we could merge safely.
- It worked unchanged on Haiku 4.5, Nova Pro and Nova Lite, which let us measure them side by side. We picked Haiku: Nova Lite escalated a salesperson.

**What needs work:**
- **`cancel_signal` is cooperative.** It doesn't stop an in-flight model call, and the default Bedrock client waits up to 120 s with legacy retries. Our 12 s timeout ran 19–27 s until we passed our own `boto_client_config` (F19).
- **Packaging for Lambda from Windows fails with `pip --platform`.** `mcp` declares a `pywin32` marker that pip evaluates against the host. `uv pip --python-platform` works (F16).
- The structured-output docs URL returned 404 (F8).
- The default model is Sonnet in us-west-2, so `model_id` must always be passed.

**Would we build with it again?** Yes. A "deploy to Lambda" guide and a hard timeout would close the gaps.

## AWS SAM

**Used for:** one template covering CloudFront, two S3 buckets, the HTTP API with per-route throttles, two Lambdas, DynamoDB, SNS, the Budget and least-privilege IAM.

**What worked:**
- One `sam deploy` stands up the whole product, and policy templates kept IAM short.
- `RouteSettings` gave per-route throttles on the routes that spend money.

**What needs work:**
- **`sam build` on Windows silently ships Windows wheels.** It gives no warning that the platform doesn't match the runtime (F10).
- **`--parameter-overrides` can't pass an empty value, and omitted parameters keep their old values.** That's a security footgun when rotating credentials (F13).

**Would we build with it again?** Yes, with our `tasks.py build` wrapper.

## CloudFront, S3, API Gateway, Lambda, DynamoDB, SNS, Budgets

**Used for:**
- **One HTTPS domain** for the static Next.js app, `/api/*` and the Ring webhook.
- **Async Lambda invoke** so the webhook acks in well under 5 s.
- **DynamoDB:** a conditional put dedupes Ring retries, and TTL handles retention.
- **SNS** escalation to a trusted contact.
- **An AWS Budget alert.**

**What worked:**
- Origin Access Control, CloudFront Functions for clean URLs, and the managed SecurityHeadersPolicy.
- Async invoke is the simplest way to meet Ring's 5 s ack.
- On-demand DynamoDB with a GSI made "events since" polling trivial.

**What needs work:**
- **CloudFront custom error responses apply to every behavior,** including the API, so an SPA fallback would rewrite API 404s. We used a CloudFront Function route map instead (F11).
- **New-account Lambda concurrency is 10,** which leaves no room for reserved concurrency on a two-function app.

**Would we build with it again?** Yes.
