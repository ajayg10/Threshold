# Ring API Findings (Phase 0)

Researched 2026-10-19. Sources, abbreviated below:

- **[GS]** Getting Started: https://developer.amazon.com/docs/ring/get-started.html
- **[API]** Ring API Documentation: https://developer.amazon.com/docs/ring/api-documentation.html (section names given as `[API §Section]`)
- **[DEV]** Develop / Test: https://developer.amazon.com/docs/ring/develop.html
- **[UX]** UX Design Guide: https://developer.amazon.com/docs/ring/ux-design-guide.html
- **[MCP]** Ring Appstore MCP server: https://developer.amazon.com/docs/ring/ring-mcp.html
- **[HW]** Sample repo: https://github.com/AmazonAppDev/ring-api-helloworld

Anything marked **UNKNOWN** is not answered by the public docs and must not be assumed in code.

---

## Summary for Threshold

| Need | Ring provides? | Consequence for Threshold |
|---|---|---|
| Doorbell press event | **Yes**: `button_press` webhook; `ding` in Event History | Real `/api/webhooks/ring` handler, HMAC-verified |
| Motion event | **Yes**: `motion_detected` webhook (`sub_type` human / package_delivery / …) | Maps to `DoorEvent.type = "motion"` |
| Visitor audio | **Partly**: MP4 clip download with `audio_options.audio_enabled` (a *request* for audio, not a guarantee) | Real path: clip download → S3 → Transcribe batch. Demo path: seeded Polly audio, disclosed |
| Snapshot | **Yes**: image download endpoint | Optional; not needed for MVP |
| Speak a reply to the visitor | **No.** Live video is receive-only, and audio playback only plays a pre-assigned slot on an indoor *chime* | **Door Display**: a tablet by the door shows the reply in large text in the visitor's language and speaks it with Polly. Headline feature request to Ring (see below) |
| Simulator | **No official simulator documented.** A "sandbox" with synthetic devices is mentioned but not described | Our own **test harness** (`HarnessRingClient`, *not* a Ring simulator) produces v1.1 webhook payloads, signs them with HMAC, and POSTs them through the real handler. Real Ring API calls (`/v1/users/me`, `/v1/devices`) run in the runtime path whenever a token is configured |
| Unlock / access control | Not exposed, and Threshold never uses it | Matches our "never unlock" invariant |

---

## 1. Authentication and credentials

- Apps are created in the Ring Developer Console (https://developer.amazon.com/ring/console/apps). On creation the developer gets a **Client ID**, a **Client Secret**, and an **HMAC Signature Key**, all shown **only once**. Lost credentials before certification mean deleting and recreating the app. [GS §Configure]
- Account identity verification (a government photo ID) is required before submitting apps. [GS §Account Identity Verification]
- OAuth 2.0. Token endpoint: `POST https://oauth.ring.com/oauth/token` (form-encoded). Grants: `authorization_code` (with `client_id`, `client_secret`, `code`, plus `code_verifier` for PKCE in partner-initiated linking) and `refresh_token`. The response has `access_token`, `refresh_token`, `scope`, `expires_in` (14400), and `token_type: Bearer`. Access tokens last about 4 h, refresh tokens about 30 days; an expired refresh token means the user must re-link. [API §Authentication, §Token Exchange Flow, §Refresh Tokens]
- **One-way account linking** (the default): the user installs the app from the Ring app. Ring's backend POSTs an authorization code to our **Token Exchange URL** (server-to-server). The code is single-use and **expires in 60 s**. We then call `POST /v1/accounts/me/app-integrations` (`account_identifier`, `nonce`) and `PATCH … {"status":"completed"}`. The PATCH is mandatory, or the integration stays `awaiting`. [API §Account Linking, §App Integration]
- **Partner-initiated linking** (authorize URL `https://account.ring.com/account/integrations/partner-link/authorize`, PKCE S256) is **invitation only**. [API §Authentication]
- Scopes: the docs say only `ava.v1:read` is supported, but the sample code uses `scope=ava`. **Inconsistent; see the friction log.**
- API base: `https://api.amazonvision.com`, with `Authorization: Bearer <access_token>`. [API §Base URL, §Environment Configuration]
- **Developer Playground:** [HW] describes a short-lived (about 30 min) access token generated in a "Ring Developer Playground". This is the quickest way to make real API calls without building account linking. It is not described in [API] or [DEV].
- Access to real credentials goes through the **Ring Developer Early Access Program**. [MCP]

**Threshold plan:** `RealRingClient` supports two modes, as [HW] does: `RING_ACCESS_TOKEN` (Playground token) or `RING_REFRESH_TOKEN` + `RING_CLIENT_ID` + `RING_CLIENT_SECRET` (auto-refresh). Setting both modes is a configuration error. A `/api/ring/token-exchange` handler is stubbed for the one-way linking flow. **UNKNOWN:** the exact request body Ring sends to the Token Exchange URL and the response it expects (the docs show it only as an image) [API §Token Exchange Flow].

## 2. Events and delivery

- **Webhooks** (push). Webhook event types: `motion_detected`, `button_press`, `device_added`, `device_removed`, `device_online`, `device_offline`, `app_integration_added`, `app_integration_removed`, `subscription_activated`, `subscription_deactivated`. [API §Event Types]
- `motion_detected.attributes.sub_type` is `motion` when Smart Alerts is off, and otherwise `human`, `vehicle`, `package_delivery`, or `other_motion`. Apps must pass unknown values through. `component_ids` appears only on multi-camera devices. [API §Motion Detection]
- `button_press` has `source`, `source_type`, and `timestamp` (epoch ms), and no `sub_type`. [API §Button Press]
- Payload v1.1: `meta {version:"1.1", time, request_id, account_id}` and `data {id:"<device_id>_<type>_<ts>", type, attributes {source, source_type:"devices", timestamp, …}, relationships.devices.links.self}`. [API §Webhook v1.1 Payload Structure]
- **Polling** alternative: `GET /v1/history/devices/{device_id}/events?event_types=…&page[key]=…`. Event types here are `motion`, `on_demand`, and **`ding`**. Results are newest first and include only events after the user's consent. A webhook URL is still required even if you poll. [API §Event History, §Webhook Endpoint Requirements]
- The webhook URL is set in the Developer Portal, not via the API. It needs HTTPS, TLS 1.2 or higher, and a public endpoint accepting JSON POST. [API §Notifications]

**Mapping to `DoorEvent`:** `button_press` (webhook) and `ding` (history) map to `type: "ding"`; `motion_detected` and `motion` map to `type: "motion"`. Other types are acknowledged with 200 and ignored. `DoorEvent.id` = `data.id`. We dedupe on `meta.request_id`.

## 3. Webhook signature verification

Defined. [API §Webhook Authentication & Verification]

- Header: `X-Signature: sha256=<hex>`.
- Value: HMAC-SHA256 over the **raw request body bytes** (never re-serialized JSON), keyed with the app's HMAC Signature Key, hex-encoded. Compare in constant time.
- **No timestamp or replay window is documented.** Idempotency is through `meta.request_id`. Threshold additionally rejects events whose `meta.time` is more than 5 min old (our own choice, documented as such).
- We must respond **200 within 5 s**, so processing is asynchronous. Retries happen on 5xx or timeout only, after 1 s, 5 s, 30 s, 2 m, 10 m, and 1 h (7 attempts), then go to a dead-letter queue (72 h; replay only via a Ring representative). 4xx responses are not retried, and persistent 4xx responses (10+ over 24 h) may disable the endpoint. [API §Retry Logic]
- Discrepancy: [HW] authenticates webhooks with a `RING_WEBHOOK_SECRET` bearer token, not HMAC. We follow [API].

**Lambda implication:** API Gateway → Lambda must ack within 5 s, but the pipeline takes about 8 s. The webhook handler should verify, persist the event, start the pipeline asynchronously (async Lambda self-invoke), and return 200. This is noted for Phase 2.

## 4. Media access

[API §Live Video, §Media Clips, §Image Snapshots]

- **Clips:** `POST /v1/devices/{id}/media/video/download`. The body requires `timestamp` (epoch ms) and `duration` (ms, up to 900 000). Optional fields are `video_options` and `audio_options.audio_enabled` (default `false`). The docs state that `audio_enabled` "is a request for audio, not a statement that audio exists", so a video-only MP4 may come back. The endpoint **does not trigger recording**. `416 MEDIA_NOT_FOUND` and `425 RECORDING_NOT_READY` mean retry the unchanged request within a 2-minute window. A 5 s initial delay is recommended. Only `motion_detected` and `button_press` produce footage.
- **Snapshots:** `POST /v1/devices/{id}/media/image/download` returns JPEG or PNG. Timestamps must be within the last 180 days, `latest_in_range` windows are at most 24 h, the watermark cannot be disabled, and `components` takes one entry.
- **Live:** WHEP `POST /v1/devices/{id}/media/streaming/whep/sessions` (`application/sdp`) or RTSPS on port 322. Sessions last at most 30 s on battery devices and 60 s on wired devices. Audio is optional and **receive-only**; `sendrecv` and `sendonly` are rejected.
- **UNKNOWN:** the actual clip-ready latency after a `button_press`, how many doorbell models include audio in clips, and the clip audio codec.

**Threshold plan:** the real path is `button_press` → wait about 5 s → clip download with `audio_enabled: true` → MP4 to S3 → **Transcribe batch** (it accepts MP4; to be verified in Phase 3) → delete the MP4. If the MP4 has no audio track or download fails, the card shows "No audio available from device", and in demo mode the seeded clip is used and labeled. Expect the real path to be slower than the 8 s target because of the clip-ready wait.

## 5. Reply / two-way talk / announce

**Not available.**

- Live media is receive-only. [API §WHEP Live Video Streaming]
- `POST /v1/devices/{id}/media/audio/playback` plays an existing `audio_ref` from a **chime's** customizable slots. It requires the Chime Controls capability, which is Early Access. Assigning or uploading audio to a slot "is not a device API operation". [API §Chimes]
- No endpoint plays arbitrary or TTS audio on a doorbell's speaker.

**Consequence:** the visitor cannot hear Polly replies through the Ring device. In Threshold, the reply goes to a **Door Display** (`/door` page on any tablet placed at the door or window): large text in the visitor's language plus Polly audio. The resident's phone or TV is the control surface. The UI and docs say plainly that the reply does not play through the doorbell. **This is the biggest product gap.** It goes in the friction log and product feedback as a feature request: a "speak to visitor" endpoint (TTS or audio upload to the doorbell speaker), even if limited to short pre-approved clips.

## 6. Simulator / sandbox / testing

- [GS §Key Terminology] mentions a **Sandbox Environment** "with synthetic Ring devices and events", and says no rate limits apply in sandbox. **No page explains how to access it or how to trigger synthetic events.**
- [DEV §Test] describes **staging** only: up to 10 staging users, real Ring accounts and devices, an **active Ring Protection plan**, and **US-located devices only**. Webhooks fire for real events on linked devices. There is no on-demand event trigger.
- [API §Testing Your Integration, §SDKs and Libraries]: "There is no official Ring Partner SDK." It recommends curl, Postman, Bruno, and plain HTTP libraries.
- [HW] tests webhooks by POSTing hand-built JSON to its own endpoint.
- [MCP] offers documentation search only (`search_docs`, `get_doc`), with no simulator.
- The hackathon Ring track allows "Ring APIs, SDKs, simulators, or devices".

**Threshold plan:** our **test harness** (`HarnessRingClient`; never described as Ring's simulator) builds **exact v1.1 payloads** (`button_press` / `motion_detected`), signs them with the configured HMAC key (or a local demo key), and POSTs them to our own `/api/webhooks/ring`. That runs the same verification and normalization code that real Ring traffic uses. Events carry `source: "test_harness"` (this replaces `ring_simulator` from the original data contract, so nobody mistakes it for an official Ring tool). If the human finds a real sandbox in the console, we add it as a third source.

## 7. Rate limits and certification

- 100 requests/s per `client_id` across all endpoints. Exceeding it returns HTTP 429 with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After`. Use exponential backoff from 1 s. No limits apply in sandbox. [API §Rate Limiting, GS]
- Certification covers security testing, privacy compliance, and functionality validation, with about 90 % of reviews done in under 48 h and unlimited resubmissions. Publishing is free, with a 10 % revenue share on subscriptions. The API follows semver with 12-month backward compatibility. [GS §Certify, FAQ]
- UX rules relevant to a future product [UX]:
  - Never show tokens, device IDs, or account IDs to customers.
  - Show user-assigned device names.
  - Never analyze or store video from privacy zones.
  - Don't imply that Ring settings can be changed from our app.
  - Say "Ring app" exactly.
  - Meet WCAG 2.2 AA, which is stricter than our AA target; Phase 5 should check against 2.2.
  - Limit routine notifications.
- **Content Policy** (https://developer.amazon.com/docs/ring/content-policy.html), read 2026-10-19:
  - §4.2.1 counts **voiceprints** ("voice recognition or voice-based identification") as biometrics. Threshold transcribes and translates but **never identifies speakers**, so it stays outside that category.
  - §4.1.x requires affirmative consent, an easy way to withdraw it, data minimization, and user-initiated deletion covering all copies.
  - §1.6 / §2.2 require that feature and security claims be truthful and verifiable.
  - §4.2.2 limits face recognition to enrolled people only. Threshold does no face recognition at all.
- **Program Requirements** (https://developer.amazon.com/docs/ring/program-requirements.html):
  - **2.8:** the Ring Service may not be used where its use or failure "could lead to death" or injury. Threshold's emergency card only *suggests* calling emergency services; it is never described as a life-safety system.
  - **2.10 / 2.11:** delete end-user data on request or on exit.
  - **§7:** training AI models on Ring device data is a material change. Threshold trains nothing.
  - **§6:** the US is the only approved territory by default.
- The Computer Vision Guidelines are not relevant: Threshold processes no video.

## 8. Phase 2 implementation notes

| Piece | File | Notes |
|---|---|---|
| Interface | `backend/app/ring/base.py` | `RingClient`: `list_devices`, `get_device`, `recent_events` |
| Real client | `backend/app/ring/real.py` | `GET /v1/users/me`, `/v1/devices`, `/v1/devices/{id}`, `/v1/history/devices/{id}/events?event_types=ding,motion`. Playground-token or refresh-token mode, refresh on 401, honours `Retry-After` on 429 |
| Webhook | `backend/app/ring/webhook.py`, `backend/app/ingest.py` | HMAC over raw bytes. `button_press`→`ding`, `motion_detected`→`motion`. Other types, and events more than 5 min old, get **200 + ignored** (persistent 4xx can disable the endpoint). Duplicate deliveries get 200 + duplicate |
| Source attribution | `ingest.identify_source` | A body signed with Ring's key is `ring_api`; one signed with our harness key is `test_harness`. The label is cryptographic, not self-declared |
| Test harness | `backend/app/ring/harness.py`, `scripts/harness.py` | Builds v1.1 payloads in the documented shape. The CLI POSTs them over HTTPS to any deployment |
| Async | `backend/app/dispatch.py`, `backend/app/worker.py` | The webhook stores `status=processing`, async-invokes the worker Lambda, and returns. The worker resolves the device name (a real `GET /v1/devices/{id}` for Ring events), then runs the pipeline (Phase 3) |
| Where Ring is called at runtime | `GET /api/ring/status` (users/me + devices), the worker (`get_device` on every Ring event), and the clip download (Phase 3) | |

**Assumptions to confirm with the first real delivery:**
1. The HMAC key is used as its UTF-8 bytes (not hex- or base64-decoded).
2. Ring retries reuse the same `data.id`. We dedupe on `data.id`, which also covers `meta.request_id` retries.
3. Whether refresh tokens rotate is undocumented. If a new one is issued, it is kept in memory and a warning is logged.

**Not implemented (UNKNOWN contract):** the Token Exchange URL handler for one-way account linking (friction log F6).

---

## Decisions after Phase 0 review (2026-10-19)

1. **Ring tech at runtime.** The hackathon rules count only APIs, SDKs, simulators or devices listed in Ring's docs. So `RealRingClient` is wired into the runtime path: real `GET /v1/users/me` and `GET /v1/devices` calls (Playground token or OAuth refresh token), plus the HMAC-verifying webhook handler. Our self-built event generator is called a **test harness** everywhere (code, UI, README, video). It is never called "the Ring simulator".
2. **Reply path → Door Display.** Ring has no two-way talk API, so the reply goes to a `/door` page on a tablet by the door: large translated text plus Polly audio. The resident's phone or TV is the control surface. "Two-way talk / speak-to-visitor API" is the headline feature request to Ring (friction log F1).
3. **Webhook acks in well under 5 s.** The handler verifies HMAC, writes the event with `status=processing`, triggers the pipeline asynchronously (Lambda async invoke or SQS), and returns 200. The UI polls and moves from "processing" to "ready".
4. **The deployed demo works with no Ring credentials.** Playground tokens last about 30 minutes, so the public stack must run on the seeded and test-harness path alone. Real Ring calls light up when a token is configured.
5. **Open question to organizers** (sent by the human): "Is a self-hosted webhook test harness acceptable, given no Ring simulator is documented?" **Decision gate:** if neither Early Access nor a Playground token arrives by 2026-10-20, consider pivoting to the Alexa+ Consent Layer idea.

## Still open

1. **Ring console access:** Early Access status, plus the Client ID, Client Secret and HMAC key. These go in `.env` only.
2. **Playground or sandbox:** what the console actually shows.
3. **Token Exchange URL contract:** UNKNOWN (diagram only). It stays stubbed unless one-way linking is needed.
4. **No US device.** Staging is US-only, so the real-API proof is the Playground token plus real calls, and the HMAC-verified handler.
