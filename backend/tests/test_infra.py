"""Checks that keep template.yaml consistent with the rest of the repo."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = (ROOT / "template.yaml").read_text(encoding="utf-8")


def test_cloudfront_routes_match_exported_pages():
    match = re.search(r"var ROUTES = \[(.*?)\];", TEMPLATE)
    assert match, "ROUTES list not found in SiteRewriteFunction"
    in_template = set(re.findall(r"'([^']+)'", match.group(1)))

    app_dir = ROOT / "web" / "app"
    pages = set()
    for page in app_dir.rglob("page.tsx"):
        parts = [p for p in page.parent.relative_to(app_dir).parts if not p.startswith("(")]
        pages.add("/" + "/".join(parts))
    assert in_template == pages, f"template ROUTES {sorted(in_template)} != pages {sorted(pages)}"


def test_lambda_runtime_matches_build_script():
    tasks = (ROOT / "scripts" / "tasks.py").read_text(encoding="utf-8")
    build_py = re.search(r'LAMBDA_PYTHON = "([\d.]+)"', tasks).group(1)
    assert f"Runtime: python{build_py}" in TEMPLATE


def test_events_table_matches_dynamo_store():
    from app.store import DynamoStore

    block = TEMPLATE.split("  EventsTable:")[1].split("  SettingsTable:")[0]
    for attr in ("id", "gsi_pk", "updated_at"):
        assert f"AttributeName: {attr}" in block
    assert f"IndexName: {DynamoStore.GSI}" in block
    assert "AttributeName: expires_at" in block  # TTL


def test_audio_bucket_is_private_and_expires_in_one_day():
    block = TEMPLATE.split("  AudioBucket:")[1].split("  AudioBucketPolicy:")[0]
    assert "RestrictPublicBuckets: true" in block and "BlockPublicPolicy: true" in block
    assert "ExpirationInDays: 1" in block


def test_bedrock_permissions_are_scoped_to_configured_models():
    block = TEMPLATE.split("Sid: BedrockConfiguredModels")[1].split("WorkerFunctionLogGroup")[0]
    assert '"*"' not in block and "foundation-model/*" not in block


def test_policy_model_is_covered_by_iam():
    # The policy agent reuses the perception model so IAM stays scoped to the configured IDs.
    assert "BEDROCK_POLICY_MODEL_ID: !Ref BedrockModelId" in TEMPLATE


def test_costly_routes_have_their_own_throttles():
    for route in ("POST /api/demo/trigger", "POST /api/events/{event_id}/reply"):
        assert f'"{route}":' in TEMPLATE
    assert "Path: /api/demo/trigger" in TEMPLATE and "Path: /api/events/{event_id}/reply" in TEMPLATE


def test_worker_handler_exists():
    from app import worker

    assert "Handler: app.worker.handler" in TEMPLATE and callable(worker.handler)


def test_no_distribution_wide_error_pages():
    # CustomErrorResponses would also rewrite API 403/404 responses served under /api/*.
    assert not re.search(r"^\s*CustomErrorResponses:", TEMPLATE, re.M)
