# Phase 0: AWS and toolchain verification

Checked 2026-10-19. These results feed `AWS_INTEGRATION.md` in Phase 1.

## Region

**Recommendation: `us-east-1`.**
- Bedrock: the US cross-region inference profiles below are available there.
- Transcribe: `en-IN` and `hi-IN` are supported for both batch and streaming.
- Polly: neural voices are available.

The AWS CLI has no default region set locally, so set `AWS_REGION=us-east-1`.

## Amazon Bedrock (Converse API)

I made live test calls from this account in us-east-1, with `maxTokens=10`.

| Model / inference profile | Result | Latency |
|---|---|---|
| `us.amazon.nova-lite-v1:0` | OK | 307 ms |
| `us.amazon.nova-pro-v1:0` | OK | 306 ms |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | OK | 567 ms |
| `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | OK | 1201 ms |
| `us.anthropic.claude-haiku-5-5` | **AccessDenied**: "not available for this account" | n/a |

Proposed settings:
- `BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0` for perception: forced tool use, latency-sensitive.
- `BEDROCK_FALLBACK_MODEL_ID=us.amazon.nova-pro-v1:0`.

Still to do in Phase 3: confirm that `toolChoice: {tool: {name: "emit_visitor_card"}}` is honoured by each model, and measure latency with the full prompt.

## Amazon Transcribe

Source: https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html

- `hi-IN`: batch and streaming. `en-IN`: batch and streaming.
- Streaming language identification has these constraints:
  - At least 2 `LanguageOptions`, and only one dialect per language. `en-IN` + `hi-IN` is valid.
  - At least 1 s of speech.
  - **PCM or FLAC only**.
  - A `PreferredLanguage` setting speeds up identification on short clips.
  - Source: https://docs.aws.amazon.com/transcribe/latest/dg/lang-id-stream.html
- Streaming from Python uses the separate `amazon-transcribe` streaming SDK (boto3 does not stream).
- Implication: seed audio should be generated as **16 kHz PCM** so we can stream it. Ring MP4 clips go through **batch** jobs (S3 input).

## Amazon Polly

Sources: https://docs.aws.amazon.com/polly/latest/dg/available-voices.html and https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html

| Language | Neural voice |
|---|---|
| `hi-IN` | **Kajal** (female, bilingual hi/en). Aditi is standard-only. **There is no male neural Hindi voice.** |
| `en-IN` | **Kajal** (neural, generative) |
| `en-US` | Joanna, Ruth, Matthew, Danielle, Stephen, and others |

- Neural voices are supported in us-east-1.
- Seed visitor voices: Polly offers only female Indian-accent neural voices. For variety, we can use Kajal (hi-IN, en-IN) plus en-US/en-GB male voices such as Matthew and Brian. The scenario voices will be disclosed in `SEEDED_DATA.md`.

## Strands Agents SDK

Source: https://pypi.org/project/strands-agents/

- Package: `strands-agents`, version 1.61.1, released 2026-10-15. Requires Python >= 3.10.
- Imports: `from strands import Agent, tool` and `from strands.models import BedrockModel` (with `BedrockModel(model_id=..., temperature=..., streaming=...)`).
- The default model expects Claude 4 Sonnet in us-west-2, so **we must always pass `model_id` explicitly**.
- The structured-output docs URL returned 404 (see the friction log). We don't need it, because the agent only calls tools and the deterministic guardrails do the final shaping.

## Local toolchain (this machine, Windows 11)

| Tool | Found | Note |
|---|---|---|
| Python | 3.11.9 | Spec says 3.12. Lambda builds use `sam build --use-container` (Docker is present), so the deployed runtime can be 3.12. Install Python 3.12 locally to avoid drift. |
| Node / npm | 24.14.1 / 11.11.0 | OK |
| SAM CLI | 1.166.2 | OK |
| AWS CLI | 2.36.48, credentials valid | No default region |
| Docker | 29.3.1 | OK |
| git | 2.53 | OK |
| **make** | **not installed** | Install it (`winget install GnuWin32.Make`, or `choco install make`), or we add a `tasks.ps1` with the same targets |
