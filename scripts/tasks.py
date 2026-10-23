#!/usr/bin/env python3
"""Cross-platform task runner. `make <task>` and `.\\tasks.ps1 <task>` both call this file.

Tasks: install, local, test, build, deploy, outputs, demo, destroy
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
WEB = ROOT / "web"
LAMBDA_BUILD = ROOT / ".build" / "lambda"
VENV = ROOT / ".venv"
VENV_PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
LAMBDA_PYTHON = "3.11"  # must match Runtime in template.yaml
SECRET_PARAMS = (
    "DemoToken=", "HarnessHmacKey=", "RingHmacKey=", "RingAccessToken=",
    "RingRefreshToken=", "RingClientId=", "RingClientSecret=",
)
# CloudFormation parameter -> .env variable (optional Ring values may be empty).
RING_PARAMS = {
    "RingHmacKey": "RING_HMAC_KEY",
    "RingAccessToken": "RING_ACCESS_TOKEN",
    "RingRefreshToken": "RING_REFRESH_TOKEN",
    "RingClientId": "RING_CLIENT_ID",
    "RingClientSecret": "RING_CLIENT_SECRET",
}


# ---------------------------------------------------------------- helpers -----------------------


def load_env() -> dict[str, str]:
    """Values from .env, overridden by the real environment."""
    env: dict[str, str] = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip('"').strip("'")
    env.update(os.environ)
    return env


def tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"error: '{name}' was not found on PATH")
    return path


def show(cmd: list[str]) -> str:
    return " ".join(
        next((p + "***" for p in SECRET_PARAMS if str(a).startswith(p)), str(a)) for a in cmd
    )


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    print(f"+ {show(cmd)}", flush=True)
    return subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def capture(cmd: list[str], **kwargs) -> str:
    return subprocess.run([str(c) for c in cmd], check=True, capture_output=True, text=True, **kwargs).stdout


def python() -> str:
    if not VENV_PY.exists():
        sys.exit("error: .venv not found; run the 'install' task first")
    return str(VENV_PY)


def require(env: dict[str, str], key: str) -> str:
    value = env.get(key, "")
    if not value:
        sys.exit(f"error: {key} is not set (add it to .env)")
    return value


def stack(env: dict[str, str]) -> tuple[str, str]:
    return env.get("STACK_NAME", "threshold"), env.get("AWS_REGION", "us-east-1")


# ---------------------------------------------------------------- tasks -------------------------


def task_install(_: argparse.Namespace) -> None:
    if not VENV_PY.exists():
        run([sys.executable, "-m", "venv", VENV])
    run([VENV_PY, "-m", "pip", "install", "--upgrade", "pip"])
    run([VENV_PY, "-m", "pip", "install", "-r", BACKEND / "requirements-dev.txt"])
    run([tool("npm"), "ci"], cwd=WEB)

    env_file = ROOT / ".env"
    if not env_file.exists():
        text = (ROOT / ".env.example").read_text(encoding="utf-8")
        text = text.replace("DEMO_TOKEN=replace-me", f"DEMO_TOKEN={secrets.token_urlsafe(24)}")
        text = text.replace("HARNESS_HMAC_KEY=replace-me", f"HARNESS_HMAC_KEY={secrets.token_urlsafe(32)}")
        env_file.write_text(text, encoding="utf-8")
        print("Created .env with a random DEMO_TOKEN and HARNESS_HMAC_KEY. Fill in the rest as needed.")


def task_test(_: argparse.Namespace) -> None:
    run([python(), "-m", "pytest", "-q"], cwd=BACKEND)


def task_local(_: argparse.Namespace) -> None:
    env = load_env()
    backend_env = {**os.environ, "APP_ENV": "local"}
    web_env = {**os.environ, "NEXT_PUBLIC_API_BASE": "http://localhost:8000/api"}
    procs = [
        subprocess.Popen(
            [python(), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
            cwd=BACKEND,
            env=backend_env,
        ),
        subprocess.Popen([tool("npm"), "run", "dev"], cwd=WEB, env=web_env),
    ]
    print("Backend: http://localhost:8000/api/health   Frontend: http://localhost:3000   (Ctrl+C to stop)")
    if not env.get("DEMO_TOKEN"):
        print("warning: DEMO_TOKEN is empty; authenticated routes will return 503")
    try:
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()


def build_lambda() -> None:
    """Bundle backend/app plus Linux (manylinux) wheels, so a Windows machine never ships Windows wheels.

    Uses uv, not pip: `pip --platform` still evaluates environment markers against the host, so on
    Windows it demands pywin32 (via mcp, a strands-agents dependency) for a Linux target and fails.
    uv evaluates markers for the target platform (friction log F16).
    """
    shutil.rmtree(LAMBDA_BUILD, ignore_errors=True)
    LAMBDA_BUILD.mkdir(parents=True)
    run([
        python(), "-m", "uv", "pip", "install",
        "--requirement", BACKEND / "requirements.txt",
        "--target", LAMBDA_BUILD,
        "--python-platform", "x86_64-manylinux2014",
        "--python-version", LAMBDA_PYTHON,
        "--only-binary", ":all:",
        "--quiet",
    ])
    shutil.copytree(BACKEND / "app", LAMBDA_BUILD / "app", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def build_web(api_base: str) -> None:
    run([tool("npm"), "run", "build"], cwd=WEB, env={**os.environ, "NEXT_PUBLIC_API_BASE": api_base})
    # Next 16's router prefetches /<route>/__next.<route>.__PAGE__.txt, but the static export writes
    # /<route>/__next.<route>/__PAGE__.txt. S3 answers the missing key with 403 on every page load
    # (friction log F20), so publish each segment file under both names.
    for page in (WEB / "out").glob("*/__next.*/__PAGE__.txt"):
        shutil.copyfile(page, page.parent.with_name(f"{page.parent.name}.__PAGE__.txt"))


def task_build(_: argparse.Namespace) -> None:
    build_lambda()
    build_web("/api")


def stack_outputs(env: dict[str, str]) -> dict[str, str]:
    name, region = stack(env)
    raw = capture([
        tool("aws"), "cloudformation", "describe-stacks",
        "--stack-name", name, "--region", region,
        "--query", "Stacks[0].Outputs", "--output", "json",
    ])
    return {o["OutputKey"]: o["OutputValue"] for o in json.loads(raw) or []}


def task_outputs(_: argparse.Namespace) -> None:
    for key, value in stack_outputs(load_env()).items():
        print(f"{key:16} {value}")


def task_deploy(args: argparse.Namespace) -> None:
    env = load_env()
    name, region = stack(env)
    if args.web_only:  # front-end change only: no Lambda bundle, no CloudFormation update
        build_web("/api")
        publish_site(env)
        return
    params = [
        f"DemoToken={require(env, 'DEMO_TOKEN')}",
        f"HarnessHmacKey={require(env, 'HARNESS_HMAC_KEY')}",
        f"AlertEmail={env.get('ALERT_EMAIL') or 'none'}",
        f"EscalationEmail={env.get('ESCALATION_EMAIL') or 'none'}",
        f"MonthlyBudgetUsd={env.get('MONTHLY_BUDGET_USD', '25')}",
        # SAM rejects empty "Key=" overrides, and omitted ones reuse the previous value, so unset
        # Ring values are sent as "none" (treated as unset by app/config.py).
        *(f"{param}={env.get(var) or 'none'}" for param, var in RING_PARAMS.items()),
    ]
    task_build(args)
    run(
        [
            tool("sam"), "deploy",
            "--template-file", ROOT / "template.yaml",
            "--stack-name", name,
            "--region", region,
            "--resolve-s3",
            "--capabilities", "CAPABILITY_IAM",
            "--no-confirm-changeset",
            "--no-fail-on-empty-changeset",
            "--tags", "Project=threshold",
            "--parameter-overrides", *params,
        ],
        cwd=ROOT,
        env={**os.environ, "SAM_CLI_TELEMETRY": "0"},
    )
    publish_site(env)


def publish_site(env: dict[str, str]) -> None:
    """Upload web/out to the site bucket, invalidate CloudFront, and smoke-test the API."""
    _, region = stack(env)
    out = stack_outputs(env)
    bucket, dist = f"s3://{out['SiteBucketName']}", out["DistributionId"]
    aws = tool("aws")
    out_dir = WEB / "out"
    run([aws, "s3", "sync", out_dir, bucket, "--delete", "--region", region,
         "--exclude", "_next/static/*", "--cache-control", "no-cache"])
    run([aws, "s3", "sync", out_dir / "_next" / "static", f"{bucket}/_next/static", "--region", region,
         "--cache-control", "public,max-age=31536000,immutable"])
    # S3 doesn't know the .webmanifest type; serve it as a proper manifest.
    run([aws, "s3", "cp", out_dir / "manifest.webmanifest", f"{bucket}/manifest.webmanifest", "--region", region,
         "--content-type", "application/manifest+json", "--cache-control", "no-cache"])
    run([aws, "cloudfront", "create-invalidation", "--distribution-id", dist, "--paths", "/*",
         "--query", "Invalidation.Id", "--output", "text"])

    url = out["SiteUrl"]
    with urllib.request.urlopen(f"{url}/api/health", timeout=30) as resp:
        print(f"Smoke test: GET {url}/api/health -> {resp.status} {resp.read().decode()}")
    print(f"\nDeployed: {url}\nRing webhook URL: {out['RingWebhookUrl']}")


# The order the scenarios appear in docs/DEMO_SCRIPT.md.
DEMO_ORDER = ["s1_delivery_hi", "s2_meter_pretext", "s7_injection"]
# Warm-up: Transcribe plus one perception call and no policy agent, so it barely touches the
# account's 10-per-minute Haiku quota (friction log F18). A reply on it warms Nova Lite and Polly.
WARMUP_SCENARIO = "s3_neighbour"


def api_call(url: str, token: str, method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{url}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def task_demo(args: argparse.Namespace) -> None:
    """Get a target ready to record: reset, warm up every stage, reset again, print the run order.

    Local by default (the backend from the 'local' task); --deployed uses this stack, --url any site.
    """
    sys.path.insert(0, str(ROOT / "scripts"))
    import run_scenarios  # stdlib only on this path; imported here because it imports this module

    env = load_env()
    token = require(env, "DEMO_TOKEN")
    if args.url:
        api = site = args.url.rstrip("/")
    elif args.deployed:
        api = site = stack_outputs(env)["SiteUrl"].rstrip("/")
    else:
        api, site = "http://127.0.0.1:8000", "http://localhost:3000"
    call = lambda method, path, body=None: api_call(api, token, method, path, body)  # noqa: E731

    print(f"Target: {api}")
    try:
        call("GET", "/auth/check")
    except urllib.error.HTTPError as err:
        sys.exit(f"error: {api} rejected DEMO_TOKEN from .env (HTTP {err.code}). Deployed? Run the deploy task.")
    except urllib.error.URLError as err:
        hint = " Start it with the 'local' task first." if not (args.url or args.deployed) else ""
        sys.exit(f"error: cannot reach {api} ({err.reason}).{hint}")

    call("POST", "/demo/reset")
    print("Reset: events cleared, seeded resident settings restored")

    if not args.no_warmup:
        print(f"Warm-up: {WARMUP_SCENARIO} (Transcribe, Bedrock, then a reply through Nova Lite and Polly)...", flush=True)
        [rec] = run_scenarios.run_deployed(api, [WARMUP_SCENARIO], token)
        card = rec.get("card") or {}
        if rec["status"] != "ready":
            sys.exit(f"error: warm-up visit ended as {rec['status']}: {rec.get('error')}")
        reply = call("POST", f"/events/{urllib.parse.quote(rec['event']['id'])}/reply",
                     {"text": "Thank you, I will be there in a minute."})
        print(f"  card {card.get('visitor_type')}/{card.get('risk_level')} in {rec['observed_final_ms']} ms; "
              f"reply audio {'ready' if reply.get('audio_url') else 'MISSING'}")
        call("POST", "/demo/reset")

    if args.rehearse:
        print("Rehearsal, in script order (one at a time; agent visits use about 4 of 10 Haiku calls a minute):")
        for sid in DEMO_ORDER:
            [rec] = run_scenarios.run_deployed(api, [sid], token)
            card = rec.get("card") or {}
            print(f"  {sid:18} {rec['status']:6} {card.get('visitor_type', '-'):14} {card.get('risk_level', '-'):6} "
                  f"first card {rec['observed_first_card_ms']} ms, final {rec['observed_final_ms']} ms, "
                  f"escalated: {card.get('escalation', {}).get('required')}")
            if (rec.get("pipeline") or {}).get("policy") in ("agent", "agent_failed") and sid != DEMO_ORDER[-1]:
                time.sleep(20)
        call("POST", "/demo/reset")
        print("Reset again: the feed is empty for recording")

    print(f"""
Ready to record (script: docs/DEMO_SCRIPT.md). The access code on every screen is DEMO_TOKEN from .env.
  Resident screen (phone or TV browser):  {site}/
  Demo panel, to trigger visits:          {site}/demo
  Door Display (tablet at the door):      {site}/door   then tap "Tap to turn on sound"
Trigger, in order: {", ".join(DEMO_ORDER)}. Wait for each card before the next.""")


def task_destroy(args: argparse.Namespace) -> None:
    if not args.yes:
        sys.exit("Refusing to destroy without --yes. The judging period requires the stack to stay up until 2026-11-20.")
    env = load_env()
    name, region = stack(env)
    bucket = stack_outputs(env)["SiteBucketName"]
    run([tool("aws"), "s3", "rm", f"s3://{bucket}", "--recursive", "--region", region])
    run([tool("sam"), "delete", "--stack-name", name, "--region", region, "--no-prompts"])


TASKS = {
    "install": task_install,
    "local": task_local,
    "test": task_test,
    "build": task_build,
    "deploy": task_deploy,
    "outputs": task_outputs,
    "demo": task_demo,
    "destroy": task_destroy,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("task", choices=TASKS)
    parser.add_argument("--yes", action="store_true", help="confirm destructive tasks (destroy)")
    parser.add_argument("--web-only", action="store_true", help="deploy: rebuild and upload only the website")
    demo = parser.add_argument_group("demo")
    demo.add_argument("--deployed", action="store_true", help="target this stack's site instead of the local backend")
    demo.add_argument("--url", help="target another deployed site, e.g. https://dxxxx.cloudfront.net")
    demo.add_argument("--rehearse", action="store_true", help="also run the script's scenarios once, then reset")
    demo.add_argument("--no-warmup", action="store_true", help="skip the warm-up visit")
    args = parser.parse_args()
    try:
        TASKS[args.task](args)
    except subprocess.CalledProcessError as exc:
        sys.exit(f"error: command failed with exit code {exc.returncode}: {show(exc.cmd)}")


if __name__ == "__main__":
    main()
