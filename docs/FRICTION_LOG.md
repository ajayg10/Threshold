# Friction Log

Entries are added as friction happens. Severity is low, medium, or high.

---

## F1: No way to speak back to a visitor through a Ring doorbell
- **Tool:** Ring Partner API
- **Task:** Play a TTS reply to the visitor through the doorbell speaker.
- **Steps:**
  1. Read the Live Video (WHEP and RTSP) and Chimes sections.
  2. Read the Media Clips and Image Snapshots sections.
- **Expected:** A two-way talk or "announce" endpoint, or a sendrecv WebRTC session.
- **Actual:** WHEP is receive-only, and `sendrecv` and `sendonly` are rejected. Audio playback works only on chimes, using pre-assigned `audio_ref` slots, and requires the Early Access "Chime Controls" capability. Uploading audio is not an API operation.
- **Severity:** high. This blocks the core accessibility use case of replying to a visitor.
- **Workaround:** A **Door Display**: a `/door` page on a tablet by the door shows the reply in large text in the visitor's language and plays Polly audio. The resident's phone or TV is the control surface. The UI says plainly that this is not the doorbell speaker.
- **Suggestion (headline feature request):** Add a speak-to-visitor endpoint that sends short TTS or an uploaded audio clip to the doorbell speaker. It could have an allowlist or rate limit, and require a resident-initiated action.

## F2: The "Sandbox Environment" is mentioned but never documented
- **Tool:** Ring Developer docs
- **Task:** Trigger synthetic `button_press` events for a repeatable demo.
- **Steps:**
  1. Read Getting Started → Key Terminology, which mentions a sandbox with synthetic devices and events.
  2. Read Develop → Test, which describes staging only.
  3. Read the API doc's Testing Your Integration section.
  4. Read the hello-world README.
  5. Read the Ring MCP page.
- **Expected:** Instructions for accessing the sandbox and firing a test event.
- **Actual:** None of these pages explain it. Staging needs real US devices and a Ring Protection plan.
- **Severity:** high for developers outside the US or without a device.
- **Workaround:** Our own **test harness** (explicitly not a Ring simulator) that builds signed v1.1 payloads and POSTs them through our real webhook handler. Real Ring API calls run whenever a token is configured.
- **Suggestion:** Document the sandbox, or add a "Send test event" button in the console per webhook type.

## F3: Webhook authentication differs between the docs and the official sample
- **Tool:** Ring API docs vs `ring-api-helloworld`
- **Steps:** Compared the Webhook Authentication & Verification section with the sample's `.env.example` and README.
- **Expected:** The same scheme in both.
- **Actual:** The docs use an HMAC-SHA256 `X-Signature: sha256=<hex>` header over the raw body. The sample uses a `RING_WEBHOOK_SECRET` bearer token.
- **Severity:** medium
- **Workaround:** Follow the API docs (HMAC).
- **Suggestion:** Update the sample to verify `X-Signature`. *This is a candidate Open Source mini-challenge PR.*

## F4: OAuth scope value is inconsistent
- **Tool:** Ring API docs
- **Issue:** The text says only `ava.v1:read` is supported, but the example code uses `scope=ava`.
- **Severity:** low
- **Suggestion:** Make the example match the text.

## F5: Event naming mismatch between webhooks and Event History
- **Tool:** Ring API
- **Issue:** The doorbell press is `button_press` in webhooks but `ding` in the Event History API. Motion is `motion_detected` vs `motion`.
- **Severity:** low
- **Workaround:** Normalize both in our adapter.
- **Suggestion:** Add a mapping table in the docs.

## F6: Token Exchange URL contract is only shown as an image
- **Tool:** Ring API docs, Token Exchange Flow section
- **Issue:** The request Ring sends to the partner's Token Exchange URL, and the response it expects, appear only in a sequence-diagram image. There are no text fields or JSON example.
- **Severity:** medium. You can't implement one-way linking without guessing.
- **Suggestion:** Add a request/response JSON example.

## F7: The API reference page is one very large HTML page
- **Tool:** Ring API docs
- **Issue:** `api-documentation.html` is about 370k characters of text. Tools and agents have to page through it, and section anchors are the only navigation.
- **Severity:** low
- **Suggestion:** Split it per resource, or publish an OpenAPI spec. That would also make client generation possible, since there is no official SDK.

## F8: Strands structured-output docs URL returns 404
- **Tool:** Strands Agents docs
- **Steps:** Fetched `strandsagents.com/latest/documentation/docs/user-guide/concepts/agents/structured-output/`, the path pattern used by other doc pages.
- **Actual:** HTTP 404. The quickstart path under `/latest/` also returned 404, while PyPI was reachable.
- **Severity:** low
- **Workaround:** Used PyPI for package and API details.
- **Suggestion:** Add redirects for old doc paths.

## F9: Newest Claude model not enabled on Bedrock by default
- **Tool:** Amazon Bedrock
- **Steps:** Called Converse with `us.anthropic.claude-haiku-5-5` in us-east-1.
- **Actual:** AccessDeniedException ("not available for this account"), even though the inference profile is listed by `list-inference-profiles`.
- **Severity:** low
- **Workaround:** Used `us.anthropic.claude-haiku-4-5-20251001-v1:0`.
- **Suggestion:** Have `list-inference-profiles`, or a separate call, show per-account availability, so listed profiles don't fail only at invoke time.

## F10: Building a Python Lambda on Windows ships Windows wheels by default
- **Tool:** AWS SAM CLI (1.166.2) on Windows 11
- **Task:** Package FastAPI and pydantic for the python3.11 Lambda runtime.
- **Steps:** Ran `sam build` without a container. Docker Desktop was not running, so `--use-container` was unavailable.
- **Expected:** A Lambda-compatible bundle.
- **Actual:** A plain `sam build` installs the host platform's wheels, so `pydantic-core` comes out as a Windows `.pyd` and fails at import time on Lambda. SAM gives no warning about the platform mismatch.
- **Severity:** medium
- **Workaround:** `scripts/tasks.py build` runs `pip install --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.11 --target .build/lambda`, and `sam deploy` packages that folder directly. No Docker needed.
- **Suggestion:** Have `sam build` warn when the host OS/arch differs from the function's runtime, or offer a `--platform` flag that does the above.

## F11: CloudFront custom error responses apply to every behavior, including the API
- **Tool:** Amazon CloudFront
- **Task:** Serve a Next.js static export (clean URLs, 404 page) and `/api/*` on one distribution.
- **Expected:** An SPA-style "403/404 → index.html" fallback scoped to the S3 origin.
- **Actual:** `CustomErrorResponses` are distribution-wide, so API 403/404 JSON responses would also be swapped for HTML.
- **Severity:** medium
- **Workaround:** No custom error responses. A CloudFront Function maps known routes to `.html` files and unknown ones to `/404.html`. A test keeps the route list in sync with the Next.js pages.
- **Suggestion:** Allow custom error responses per cache behavior or origin.

## F12: The official sample's webhook schema doesn't accept the doorbell event
- **Tool:** `ring-api-helloworld` (`lib/schemas/webhook.ts`)
- **Task:** Cross-check our webhook parser against Ring's sample.
- **Expected:** The sample's schema accepts every documented event type, at least `button_press` and `motion_detected`.
- **Actual:** The `type` enum is `motion_detected`, `device_added`, `device_removed` and `person_detected`. It omits **`button_press`** (the doorbell press) and the online/offline, integration and subscription events. It includes `person_detected`, which the API docs never list. The sample's `safeParse` therefore rejects doorbell presses.
- **Severity:** medium. Anyone starting from the sample silently drops doorbell events.
- **Workaround:** Threshold's parser accepts any `data.type`, maps the two it handles, and acknowledges the rest with 200.
- **Suggestion:** Align the enum with the API's Event Types list, or accept unknown types and pass them through as the docs advise. *Bundled into the Open Source PR alongside F3.*

## F13: `sam deploy` can't pass an empty parameter value, and omitted ones silently keep old values
- **Tool:** AWS SAM CLI 1.166.2
- **Task:** Pass optional Ring credentials (default `""`) as NoEcho stack parameters on every deploy.
- **Steps:** `sam deploy --parameter-overrides ... RingHmacKey= RingAccessToken= ...`
- **Expected:** Empty values are accepted, or the docs explain how to pass one.
- **Actual:** `Error: Invalid value for '--parameter-overrides': RingHmacKey= is not a valid format`. Leaving the parameter out instead makes the existing stack reuse its *previous* value, so removing a credential locally would not remove it from the deployed stack. The error mentions a `file://MyParams.yaml` form, but `sam deploy --help` doesn't document its format.
- **Severity:** medium. It is a security footgun for credential rotation.
- **Workaround:** The deploy always passes every Ring parameter, using the sentinel `none` for unset ones. `app/config.py` maps `none` to unset.
- **Suggestion:** Accept `Key=` as an empty string, and document the `file://` parameter-file format in `--help`.

## F14: Transcribe streaming with language ID never finalized the first segment
- **Tool:** Amazon Transcribe streaming (`amazon-transcribe` Python SDK 0.6.4), `identify_language=True`, `language_options=[en-IN, hi-IN]`, `preferred_language=en-IN`
- **Task:** Transcribe a 4.8 s Hindi clip ("नमस्ते, आपका पार्सल आया है। कहाँ रख दूँ?").
- **Steps:** Collected only final (`is_partial == False`) results, as the SDK examples do.
- **Expected:** Both sentences in the final results.
- **Actual:** The first segment started as en-IN partials ("Namas", "Namastik"), then switched to hi-IN partials ("नमस्ते आपका पार्सल आया है।"), and **never received a final result**. Only the second sentence was finalized, so the visitor's first sentence was silently lost.
- **Severity:** high for a translation product. Greetings and the main claim are usually in the first sentence.
- **Workaround:** Keep the latest version of every `result_id`. Treat finals as authoritative and keep a partial only where no final covers its time span (`transcribe.merge_segments`, unit-tested with the observed sequence).
- **Suggestion:** Emit a final result for every segment after a language switch, or document that segments preceding identification may only ever arrive as partials.

## F15: Streaming transcription runs at real-time pace, which isn't obvious from the docs
- **Tool:** Amazon Transcribe streaming
- **Task:** Transcribe pre-recorded 5–8 s clips as fast as possible.
- **Actual:** Sending all the audio at once still takes about the clip length plus 1.3 s (for example, 4.8 s of audio took 6.1 s). The service paces itself to real time.
- **Severity:** low. This is reasonable for live audio, but it surprised us for recorded clips.
- **Workaround:** Report latency both as total and as "after the visitor stopped speaking". With live audio the clip time overlaps with speaking anyway.
- **Suggestion:** Say plainly in the streaming docs that processing is real-time-paced, and point recorded-file users to batch, with its expected latency.

## F16: Strands Agents can't be packaged for Lambda from Windows with `pip --platform`
- **Tool:** Strands Agents SDK 1.61.1 (via its `mcp` dependency) + pip cross-platform install, which is the Docker-free approach to `sam build` on Windows (see F10)
- **Task:** Bundle `strands-agents` into a python3.11 x86_64 Lambda zip from Windows.
- **Steps:** `pip install -r requirements.txt --target .build/lambda --platform manylinux2014_x86_64 --python-version 3.11 --only-binary=:all:`
- **Expected:** Linux wheels for every dependency.
- **Actual:** `ResolutionImpossible`. `mcp` declares `pywin32; sys_platform == "win32"`, and pip evaluates that marker against the **host** (Windows) even with `--platform`. So it requires pywin32 for a Linux target, which has no manylinux wheel. Every `mcp` version from 1.23 to 2.1.1 has this marker.
- **Severity:** medium. It blocks Docker-free Lambda builds of any Strands agent on Windows.
- **Workaround:** `uv pip install --python-platform x86_64-manylinux2014 --python-version 3.11 --only-binary :all: --target ...`. uv evaluates markers for the target platform, and the bundle is 88 MB with only Linux `.so` files.
- **Suggestion:** Strands docs could include a "deploy to Lambda from Windows" recipe (uv or container build). SAM could also offer a non-container cross-platform build that evaluates markers for the target.
