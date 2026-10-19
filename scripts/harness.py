#!/usr/bin/env python3
"""Threshold test harness CLI: POST a signed Ring-v1.1-shaped webhook to a Threshold deployment.

This is our own test harness, NOT a Ring simulator (Ring documents none). It signs with
HARNESS_HMAC_KEY from .env, so Threshold labels the event source "test_harness".

  python scripts/harness.py --type ding                     # local backend
  python scripts/harness.py --url https://<cloudfront-domain> --type motion
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from app.ring.harness import HarnessRingClient  # noqa: E402
from app.seeds import get_scenario  # noqa: E402
from tasks import load_env  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    # 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and adds about 2 s per request.
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="site origin (default: local backend)")
    parser.add_argument("--type", choices=["ding", "motion"], default="ding")
    parser.add_argument("--scenario", help="seeded scenario id, e.g. s1_delivery_hi (sets the event type)")
    args = parser.parse_args()

    key = load_env().get("HARNESS_HMAC_KEY")
    if not key:
        sys.exit("error: HARNESS_HMAC_KEY is not set in .env")
    event_type = args.type
    if args.scenario:
        scenario = get_scenario(args.scenario)
        if scenario is None:
            sys.exit(f"error: unknown scenario {args.scenario!r}")
        event_type = scenario.event_type
    body, signature = HarnessRingClient(key).signed_delivery(
        "button_press" if event_type == "ding" else "motion_detected", scenario_id=args.scenario
    )
    url = args.url.rstrip("/") + "/api/webhooks/ring"
    req = urllib.request.Request(
        url, data=body, method="POST", headers={"Content-Type": "application/json", "X-Signature": signature}
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status, reply = resp.status, resp.read().decode()
    except urllib.error.HTTPError as err:
        status, reply = err.code, err.read().decode()
    elapsed = round((time.perf_counter() - started) * 1000)
    print(f"POST {url} -> {status} in {elapsed} ms")
    print(json.dumps(json.loads(reply), indent=2) if reply.startswith("{") else reply)


if __name__ == "__main__":
    main()
