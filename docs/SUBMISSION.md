# Devpost Submission (draft)

> **Before you submit (deadline: Oct 23, 2026, 12:00 pm PDT / Oct 24, 12:30 am IST):**
> - [ ] Paste the demo video link (YouTube or Vimeo, public, English, under 3 minutes).
> - [ ] Put the access code (`DEMO_TOKEN` from `.env`) in Devpost's private **testing instructions** field, never in this public text.
> - [ ] If Ring Early Access or a Playground token arrived, update "Ring integration" below to say the real calls ran, and how.
> - [ ] Add the link to the Open Source pull request.
> - [ ] Make sure the GitHub repo is public (or shared with the reviewers) and up to date.

---

## Tagline
The front door's interpreter for people who can't hear the visitor, or don't share their language.

## Inspiration
A doorbell assumes you can hear who's there and understand what they say. For a deaf resident, or for someone at home in a city where the delivery rider speaks Hindi and they don't, every ring is a guess. Opening the door to find out is exactly what scammers count on: "I'm from the electricity board, I need to come inside."

## What it does
When someone rings a Ring doorbell, Threshold:
1. **Transcribes** what the visitor said, and works out the language itself (Hindi or Indian English today). The visitor never picks one.
2. **Translates** it into the resident's language and shows a **visitor card**: who it probably is (delivery, service, neighbour, salesperson, unknown, emergency), what they want, a risk banner, and three safe suggested replies.
3. **Checks the claim** against the resident's own facts: is there a booked visit, is it the middle of the night, did they ask to come in, for a code, or for money?
4. **Replies for the resident.** They tap a reply or type one, and it's translated into the visitor's language and spoken on a **Door Display**, a tablet in the window. Ring has no API to speak through the doorbell, so we say that plainly and ask Ring for one.
5. **Escalates** high-risk visits to a trusted contact (by SNS), and offers a call-emergency-services button when a visitor reports smoke or fire.
6. **Never unlocks anything.** No unlock capability exists anywhere in the code, and a test fails if one appears.

The resident's screen is an installable web app (phone, tablet or TV browser), designed for deaf users: nothing relies on sound, arrivals show as a slow visual pulse plus vibration, text is at least 18 px, and axe finds no WCAG 2.2 AA violations.

## How we built it
- **Ring:** an HMAC-verified webhook (`button_press`, `motion_detected`, payload v1.1) acknowledges within Ring's 5 s window, stores the event, and starts the pipeline in a separate Lambda. A Ring API client fetches the device and, for real events, downloads the clip with audio.
- **Amazon Transcribe:** streaming with automatic language identification for visitor speech; batch for Ring MP4 clips. Audio is deleted right after transcription.
- **Amazon Bedrock (Claude Haiku 4.5):** perception through the Converse API with one forced tool, so the model can only return a schema-validated visitor card. Amazon Nova Pro is the fallback.
- **Strands Agents:** a policy agent with exactly four tools (expected visits, trusted contacts, local time, notify a contact) checks the visitor's claims. It can only raise risk.
- **Deterministic guardrails** run after every model: entry, code or payment requests force high risk and escalation; injection attempts are flagged; any reply that offers entry is replaced with a reviewed phrase; and a summary that vouches for the visitor is rewritten.
- **Amazon Nova Lite + Amazon Polly:** custom replies are translated (about 1.4 s) and spoken with the neural Kajal voice in Hindi or Indian English.
- **AWS:** CloudFront, S3, API Gateway (HTTP API, throttled per route), Lambda, DynamoDB, SNS and AWS Budgets, all in one SAM template. The front end is a Next.js static export.

A safe card appears about **3–4 s after the visitor stops speaking**. The agent's verdict follows a few seconds later, and it can only make the card more cautious.

## Ring integration (what is called at runtime)
- `POST /api/webhooks/ring` verifies `X-Signature` (HMAC-SHA256 over the raw body) on every delivery, then normalizes and dedupes it.
- When Ring credentials are configured, Threshold calls `GET /v1/users/me` and `GET /v1/devices` (`/api/ring/status`), `GET /v1/devices/{id}` for every Ring event, and the clip download endpoint for visitor audio (`backend/app/ring/real.py`).
- **Status:** Ring credentials come through the Early Access program, and as of Oct 19 we had no credentials or Playground token. The real client is implemented from the documented contract and covered by unit tests, but hasn't run against Ring's servers yet.
- **Test harness:** Ring doesn't document a simulator, and staging needs US devices. So the demo uses our own **test harness**, which is not a Ring simulator. It builds v1.1 payloads, signs them with its own key, and posts them through the same verification code real Ring traffic uses. Every event is labelled by which key verified it: `ring_api` or `test_harness`.

## What is real vs seeded
- **Real, live on every visit:**
  - Amazon Transcribe;
  - Bedrock perception;
  - the Strands agent;
  - the guardrails;
  - Nova Lite translation;
  - Polly speech;
  - DynamoDB storage;
  - SNS escalation;
  - HMAC webhook verification.
- **Seeded and disclosed:**
  - the visitors' voices: 8 scripted lines spoken by Polly voices, because Ring delivers no live visitor audio to apps;
  - the resident profile "Asha (seeded)", with two trusted contacts and one booked visit;
  - the test-harness events.

  The UI badges each card's audio and event source, and [SEEDED_DATA.md](https://github.com/ajayg10/Threshold/blob/main/docs/SEEDED_DATA.md) lists everything.

## Challenges we ran into
We kept a [friction log](https://github.com/ajayg10/Threshold/blob/main/docs/FRICTION_LOG.md) of 19 entries as we went. The biggest ones:
- **No speak-to-visitor API on Ring (F1).** This blocks the core accessibility use case, and is why the Door Display exists.
- **No documented sandbox or simulator (F2),** and the official sample contradicts the docs on webhook auth (F3) and rejects doorbell presses (F12).
- **Transcribe dropped a visitor's first sentence** after switching language mid-stream (F14).
- **A new account gets 10 Claude Haiku 4.5 requests per minute (F18),** and one agent-reviewed visit uses 3–4 of them. The throttling hid quality problems until we paced the evals.
- **A Strands timeout that wasn't one (F19).** A slow Bedrock call ran 27 s past a 12 s `cancel_signal`.

## Accomplishments that we're proud of
- **Evals: 24 of 24 pass against real AWS.** They cover the 8 scenarios, 7 prompt-injection variants (English, Hindi, Hinglish, fake JSON, a fake closing tag, role-play, and an instruction hidden in a delivery), 5 fraud patterns (OTP, UPI "customs fee", gate tailgating, fake police, a booking at the wrong time) and 4 harmless visitors. The baseline was 17 of 22. Each failure became a prompt fix or a deterministic guardrail, documented in [ARCHITECTURE.md](https://github.com/ajayg10/Threshold/blob/main/docs/ARCHITECTURE.md#evals-phase-6).
- **No final card ever offered entry or a code.** When a model wrote such a reply, the guardrail replaced it.
- **Accessibility:** axe reports 0 violations on all six screens, in light and dark mode.
- **Ring's 5 s ack:** the webhook returns well inside it, and Ring's retries are deduped.

## What we learned
- An LLM is a good interpreter and a bad gatekeeper, so the safety decisions are plain code.
- An agent should only be able to make things more cautious.
- Evals on live models aren't deterministic, so pin the clock, pace the quota, and read every failure.

## What's next (path to product)
1. **Ring announce API.** With a speak-to-visitor endpoint (our headline feature request in [PRODUCT_FEEDBACK.md](https://github.com/ajayg10/Threshold/blob/main/docs/PRODUCT_FEEDBACK.md)), the reply plays through the doorbell and the Door Display tablet goes away.
2. **Real Ring accounts:** one-way account linking (once the Token Exchange contract is documented), then Ring certification (security, privacy, functionality) and the Ring Appstore.
3. **Production identity:** per-resident accounts instead of the shared demo token, with deletion on request (Ring Program Requirements 2.10).
4. **More languages:** Transcribe language ID and Polly support many more; each new pair needs reviewed safe phrases.
5. **A TV app for the resident,** for example on Fire TV. We would verify what the platform allows before claiming any overlay.

## Built with
Ring Partner API, Amazon Bedrock, Claude Haiku 4.5, Amazon Nova Pro, Amazon Nova Lite, Strands Agents, Amazon Transcribe, Amazon Polly, AWS Lambda, Amazon API Gateway, Amazon DynamoDB, Amazon S3, Amazon CloudFront, Amazon SNS, AWS SAM, AWS Budgets, Python, FastAPI, Pydantic, Next.js, TypeScript, Tailwind CSS.

## Try it
- **Live demo:** https://d2mvbck7faef3t.cloudfront.net. Open `/demo` to trigger the seeded visitors, and `/door` on a second screen for the Door Display. The access code is in the testing instructions.
- **Code:** https://github.com/ajayg10/Threshold (MIT). The README's quickstart runs it locally against your own AWS account.
