# Privacy and Safety

## Data handling
- Audio is processed transiently. Only the transcript, translation and metadata are persisted. *(Phase 3)*
- The audio bucket expires objects after 1 day as a backstop. *(Phase 3)*
- Retention is user-configurable and defaults to 7 days. *(Phase 2)*

## Escalation messages
An alert to a trusted contact contains only the resident's name, the one-line visitor summary, the risk level and a short reason. It never includes the transcript, audio or device identifiers. Locally, nothing is sent (simulated notifier).

## Reply audio
Polly MP3s for the Door Display are stored in the private audio bucket, served by 15-minute presigned URLs, and expire after 1 day. The reply text is kept with the event under the retention setting.

## Consent
The visitor-audio notice text is shown in Settings. Recording-consent laws vary by jurisdiction, so real deployments need legal review.

## What Threshold never does
- No face recognition, and no emotion or identity inference about visitors.
- No voiceprints or speaker identification. Ring's Content Policy §4.2.1 treats these as biometrics. Threshold only transcribes and translates.
- No AI training on Ring device data.
- Threshold is **not a life-safety system** (Ring Program Requirements 2.8). The emergency card suggests calling emergency services; it does not call them or guarantee anything.
- **No unlocking or access control of any kind.** This is enforced by `backend/tests/test_no_unlock.py`.

## Untrusted input
Every transcript is treated as untrusted. Prompt-injection tests are mandatory. *(Phase 4, Phase 6)*

## Ring platform rules
We never show tokens, device IDs or account IDs, and we never analyze privacy-zone video. See [RING_API_FINDINGS.md](RING_API_FINDINGS.md) §7.
