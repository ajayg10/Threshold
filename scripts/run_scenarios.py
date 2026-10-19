#!/usr/bin/env python3
"""Run the seeded scenarios through the real pipeline against real AWS (Transcribe + Bedrock).

Two modes:
  python scripts/run_scenarios.py                 # in-process: harness -> ingest -> worker, memory store
  python scripts/run_scenarios.py --url https://<site>  # deployed: POST /api/demo/trigger, poll /api/events

Each card is validated against the VisitorCard model and compared with the scenario's expectations.
Results are written to .build/scenario_results.json. Exit code 1 if any card is missing or invalid.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))


def check(card: dict, expected: dict) -> list[str]:
    """Differences from the scenario's expectations (empty list = matches)."""
    misses = []
    if card["visitor_type"] not in expected.get("visitor_type", [card["visitor_type"]]):
        misses.append(f"visitor_type={card['visitor_type']} (expected {expected['visitor_type']})")
    if "risk_level" in expected and card["risk_level"] not in expected["risk_level"]:
        misses.append(f"risk_level={card['risk_level']} (expected {expected['risk_level']})")
    if "urgency" in expected and card["urgency"] not in expected["urgency"]:
        misses.append(f"urgency={card['urgency']} (expected {expected['urgency']})")
    missing_flags = set(expected.get("risk_flags", [])) - set(card["risk_flags"])
    if missing_flags:
        misses.append(f"missing flags {sorted(missing_flags)}")
    if "escalation" in expected and card["escalation"]["required"] != expected["escalation"]:
        misses.append(f"escalation={card['escalation']['required']} (expected {expected['escalation']})")
    if "matched_expected_visit" in expected:
        got = (card.get("matched_expected_visit") or {}).get("id")
        if got != expected["matched_expected_visit"]:
            misses.append(f"matched_expected_visit={got} (expected {expected['matched_expected_visit']})")
    intents = {r["intent"] for r in card["suggested_replies"]}
    for intent in expected.get("reply_intents", []):
        if intent not in intents:
            misses.append(f"no {intent} reply")
    return misses


def run_in_process(scenario_ids: list[str]) -> list[dict]:
    os.environ.update({"STORE_BACKEND": "memory", "DISPATCH_MODE": "inline", "APP_ENV": "local"})
    from app.config import get_settings
    from app.ingest import ingest_webhook
    from app.ring.harness import HarnessRingClient
    from app.seeds import get_scenario
    from app.store import get_store

    harness = HarnessRingClient(get_settings().harness_hmac_key)
    records = []
    for sid in scenario_ids:
        s = get_scenario(sid)
        body, sig = harness.signed_delivery(
            "button_press" if s.event_type == "ding" else "motion_detected", scenario_id=sid
        )
        result = ingest_webhook(body, sig)  # inline dispatch: returns after the worker finishes
        records.append(get_store().get_event(result.event_id).model_dump(mode="json"))
    return records


def run_deployed(url: str, scenario_ids: list[str], token: str) -> list[dict]:
    def call(method: str, path: str, body: dict | None = None):
        req = urllib.request.Request(
            f"{url}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    records = []
    for sid in scenario_ids:
        started = time.perf_counter()
        event_id = call("POST", "/demo/trigger", {"scenario_id": sid})["result"]["event_id"]
        first_card_ms = None
        while True:
            record = call("GET", f"/events/{urllib.request.quote(event_id)}")
            elapsed = round((time.perf_counter() - started) * 1000)
            if record["status"] == "ready" and first_card_ms is None:
                first_card_ms = elapsed  # guardrailed card visible (agent may still be reviewing)
            pending = (record.get("pipeline") or {}).get("policy") == "pending"
            if (record["status"] != "processing" and not pending) or elapsed > 120_000:
                break
            time.sleep(0.5)
        record["observed_first_card_ms"] = first_card_ms
        record["observed_final_ms"] = elapsed
        records.append(record)
    return records


def check_replies(url: str | None, records: list[dict], ids: list[str]) -> int:
    """For the first scenario with speech: one suggested reply and one custom reply, through the real
    reply path (Nova Lite translation when languages differ, Polly speech). Returns the failure count."""
    from tasks import load_env

    target = next((r for sid, r in zip(ids, records) if r.get("card") and r["card"]["visitor_type"] != "no_speech"), None)
    if target is None:
        return 0
    event_id = target["event"]["id"]
    requests = [{"reply_id": "r1"}, {"text": "Thank you. Please leave it at the door, I will pick it up."}]
    print(f"\nReplies for {event_id} (visitor language {target['card']['detected_language']}):")
    failures = 0
    for body in requests:
        if url:
            req = urllib.request.Request(
                f"{url}/api/events/{urllib.request.quote(event_id)}/reply", method="POST", data=json.dumps(body).encode(),
                headers={"Authorization": f"Bearer {load_env()['DEMO_TOKEN']}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                out = json.loads(resp.read())
        else:
            from fastapi.testclient import TestClient

            from app.main import app

            out = TestClient(app).post(
                f"/api/events/{event_id}/reply", json=body,
                headers={"Authorization": f"Bearer {load_env()['DEMO_TOKEN']}"},
            ).json()
        ok = bool(out.get("audio_url")) and bool(out.get("reply", {}).get("visitor_text"))
        failures += 0 if ok else 1
        audio = out.get("audio_url") or ""
        audio_desc = f"{len(audio)} chars data URL" if audio.startswith("data:") else ("presigned S3 URL" if audio else "none")
        print(f"  {out.get('reply', {}).get('source', '?'):9} {out.get('timings_ms')}  -> {out.get('reply', {}).get('visitor_text')!r}  audio: {audio_desc}")
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", help="deployed site origin; omit to run in-process")
    parser.add_argument("--only", nargs="*", help="scenario ids (default: all)")
    parser.add_argument("--replies", action="store_true", help="also send a suggested and a custom reply (Nova Lite + Polly)")
    args = parser.parse_args()

    from app.models import VisitorCard
    from app.seeds import scenarios
    from tasks import load_env

    ids = args.only or list(scenarios())
    if args.url:
        records = run_deployed(args.url.rstrip("/"), ids, load_env()["DEMO_TOKEN"])
    else:
        records = run_in_process(ids)

    failures = 0
    print(f"{'scenario':18} {'status':6} {'type':14} {'risk':6} {'lang':6} {'audio':>6} {'transc':>6} {'percv':>6} {'total':>6}  expectation")
    for sid, record in zip(ids, records):
        card = record.get("card")
        if record["status"] != "ready" or card is None:
            failures += 1
            print(f"{sid:18} {record['status']:6} {record.get('error')}")
            continue
        VisitorCard.model_validate(card)  # raises if invalid
        t = card["timings_ms"]
        misses = check(card, scenarios()[sid].expected)
        record["expectation_misses"] = misses
        print(
            f"{sid:18} {'ready':6} {card['visitor_type']:14} {card['risk_level']:6} {card['detected_language']:6} "
            f"{t['audio']:6} {t['transcribe']:6} {t['perceive']:6} {t['total']:6}  "
            + ("matches" if not misses else "; ".join(misses))
        )

    if args.replies:
        failures += check_replies(args.url.rstrip("/") if args.url else None, records, ids)

    out = ROOT / ".build" / "scenario_results.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(records) - failures}/{len(records)} valid VisitorCards. Full output: {out}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
